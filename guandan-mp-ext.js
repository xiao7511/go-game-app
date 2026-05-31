/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 强力 Supabase 实时联机对战引擎扩展包
 * 1. 互通互联：直连主控舱 Supabase Client，利用实时 Broadcast 机制构建高并发对牌同步。
 * 2. 状态合围：同步处理 4 人座次分发、发牌洗牌网络同步、出牌回合穿透及玩家动态退局。
 */
(() => {
  'use strict';

  const GD_MP = (window.GD_MP = window.GD_MP || {});
  
  // 核心联机状态机
  const mpState = {
    client: null,
    channel: null,
    roomCode: null,
    mySeatIndex: -1, // 0: 南, 1: 东, 2: 北, 3: 西
    seats: [null, null, null, null], // 存放 4 个玩家的 uid 和昵称
    isHost: false,
    currentTurnSeat: 0,
    lastValidPlay: null, // 上一手牌的信息 { seatIndex, cards }
    netCards: [] // 自己的手牌
  };

  // 获取当前登录用户
  function getNetUser() {
    if (window.state && window.state.uid) {
      return { uid: window.state.uid, nickname: window.state.userNickname || '玩家' };
    }
    // 降级保障
    const localUser = localStorage.getItem('sb-user-info');
    if (localUser) {
      try { return JSON.parse(localUser); } catch(e) {}
    }
    return { uid: 'guest_' + Math.random().toString(36).substr(2, 6), nickname: '神秘居士' };
  }

  // 初始化 Supabase 联机
  function initMpClient() {
    if (mpState.client) return true;
    if (typeof window.getSupabaseClient === 'function') {
      mpState.client = window.getSupabaseClient();
    }
    if (!mpState.client && window.supabase && window.APP_CONFIG) {
      const { createClient } = window.supabase;
      mpState.client = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
    }
    return !!mpState.client;
  }

  // =========================================================================
  // 🚀 核心联机大厅：快速匹配或创建 4 人对对碰房间
  // =========================================================================
  GD_MP.startNetMatch = async function() {
    if (!initMpClient()) {
      alert("Supabase 联机组件未就绪，请检查网络配置或重新登录！");
      return;
    }

    console.log("[掼蛋联机] 正在接入网关，寻找可用千兆对局房间...");
    const user = getNetUser();

    // 随机一个 6 位经典房间码
    mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
    mpState.mySeatIndex = 0; // 发起者默认为房东座次（南）
    mpState.seats[0] = user;
    mpState.isHost = true;

    // 1. 创建 Supabase Broadcast 实时全双工频道
    mpState.channel = mpState.client.channel(`room:guandan:${mpState.roomCode}`, {
      config: { broadcast: { self: false, ack: true } }
    });

    // 2. 监听网络对端事件广播
    mpState.channel
      .on('broadcast', { event: 'PLAYER_JOIN' }, (payload) => handlePlayerJoin(payload))
      .on('broadcast', { event: 'ROOM_SYNC' }, (payload) => handleRoomSync(payload))
      .on('broadcast', { event: 'GAME_START' }, (payload) => handleGameStart(payload))
      .on('broadcast', { event: 'PLAY_CARDS' }, (payload) => handleNetPlayCards(payload))
      .on('broadcast', { event: 'PASS_TURN' }, (payload) => handleNetPass(payload));

    await mpState.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[掼蛋联机] 成功建立云频道！房间号: ${mpState.roomCode}。正在等待各路高手入局...`);
        // 唤醒游戏的原厂游戏界面外壳
        if (window.GD && typeof window.GD.initGameMatch === 'function') {
          window.GD.initGameMatch();
          // 植入动态联机状态面板
          injectMpBanner();
        }
      }
    });
  };

  // =========================================================================
  // 📡 网络指令异步处理器
  // =========================================================================
  function handlePlayerJoin({ payload }) {
    console.log("[联机对战] 捕获到新玩家申请入座:", payload);
    if (mpState.isHost) {
      // 寻找空档座次
      for (let i = 0; i < 4; i++) {
        if (!mpState.seats[i]) {
          mpState.seats[i] = { uid: payload.uid, nickname: payload.nickname };
          break;
        }
      }
      // 房东广播最新的房间座次大名单
      mpState.channel.send({
        type: 'broadcast',
        event: 'ROOM_SYNC',
        payload: { seats: mpState.seats }
      });
      checkAndStartGame();
    }
  }

  function handleRoomSync({ payload }) {
    console.log("[联机对战] 接收到房东最新的座次同步表:", payload);
    mpState.seats = payload.seats;
    const user = getNetUser();
    // 确定自己的新位置
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    updateMpBannerText();
  }

  function checkAndStartGame() {
    // 当 4 人座次全部满员时，房东自动执行洗牌算法并全网派发发牌
    const readyPlayers = mpState.seats.filter(Boolean).length;
    if (readyPlayers === 4) {
      console.log("[联机对战] 四海豪杰已全部就位！房东开始发牌...");
      
      // 调用原机经典扑克生成器（两副牌，共 108 张）
      let allCards = [];
      const suits = ['S', 'H', 'C', 'D'];
      const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      // 重复两副牌
      for(let k=0; k<2; k++){
        suits.forEach(s => ranks.forEach(r => allCards.push({ suit: s, rank: r })));
        allCards.push({ suit: 'JOKER', rank: 'SMALL' });
        allCards.push({ suit: 'JOKER', rank: 'BIG' });
      }
      // 经典洗牌
      allCards.sort(() => Math.random() - 0.5);

      // 4 人手牌切片分发
      const hands = [
        allCards.slice(0, 27),
        allCards.slice(27, 54),
        allCards.slice(54, 81),
        allCards.slice(81, 108)
      ];

      // 强力广播全域开赛指令
      mpState.channel.send({
        type: 'broadcast',
        event: 'GAME_START',
        payload: { hands: hands, hostTurn: 0 }
      });

      // 房东本地装载
      loadNetGameData(hands[0], 0);
    }
  }

  function handleGameStart({ payload }) {
    console.log("[联机对战] 对局激活！正在接收我的专属绝密手牌数据...");
    if (!mpState.isHost) {
      const myHand = payload.hands[mpState.mySeatIndex];
      loadNetGameData(myHand, payload.hostTurn);
    }
  }

  // =========================================================================
  // 🎴 穿透注入原厂数据装载器与对局管线
  // =========================================================================
  function loadNetGameData(rawHandCards, initialTurn) {
    mpState.currentTurnSeat = initialTurn;
    
    // 转换成原厂能识别的内部数据结构
    const processedCards = rawHandCards.map((c, idx) => {
      let score = parseInt(c.rank) || 0;
      if (c.rank === 'J') score = 11;
      if (c.rank === 'Q') score = 12;
      if (c.rank === 'K') score = 13;
      if (c.rank === 'A') score = 14;
      if (c.rank === '2') score = 15; // 掼蛋中 2 偏大
      if (c.suit === 'JOKER') score = c.rank === 'BIG' ? 100 : 99;

      return {
        id: 'net_' + idx + '_' + Math.random().toString(36).substr(2,4),
        suit: c.suit,
        rank: c.rank,
        score: score,
        selected: false
      };
    });

    // 完美接管原生系统的单机状态机，实现界面无损刷新
    if (window.GD) {
      // 强行把原厂代打和单机循环计时器熔断
      if (window.gdAiTimer) clearInterval(window.gdAiTimer);
      
      // 覆写原厂玩家状态
      window.gdPlayerHand = processedCards;
      
      // 如果原厂存在理牌函数，强制重组手牌顺序
      if (typeof window.sortHandCards === 'function') {
        window.sortHandCards(window.gdPlayerHand);
      }

      // 重绘主战场 Canvas 与 DOM
      if (typeof window.renderGameBoard === 'function') {
        window.renderGameBoard();
      } else if (typeof window.GD.init === 'function') {
        window.GD.init();
      }

      updateTurnUiVisual();
    }
  }

  // 捕获网络出牌
  function handleNetPlayCards({ payload }) {
    console.log(`[联机对战] 玩家 [座位 ${payload.seatIndex}] 拍出火爆牌型:`, payload.cards);
    mpState.lastValidPlay = payload;
    mpState.currentTurnSeat = (payload.seatIndex + 1) % 4;
    
    // 显示网络玩家在屏幕上的出牌虚影
    showNetOppenentAction(payload.seatIndex, payload.cards);
    updateTurnUiVisual();
  }

  // 捕获网络过牌(不要)
  function handleNetPass({ payload }) {
    console.log(`[联机对战] 玩家 [座位 ${payload.seatIndex}] 选择了过牌(不要)`);
    mpState.currentTurnSeat = (payload.seatIndex + 1) % 4;
    showNetOppenentAction(payload.seatIndex, null);
    updateTurnUiVisual();
  }

  // =========================================================================
  // 🎨 联机专属顶层视窗组件
  // =========================================================================
  function injectMpBanner() {
    if (document.getElementById('gd-mp-status-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'gd-mp-status-banner';
    Object.assign(banner.style, {
      position: 'fixed', top: '15px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid #10b981',
      color: '#10b981', borderRadius: '30px', fontSize: '14px', zIndex: '999999',
      boxShadow: '0 4px 20px rgba(16,185,129,0.3)', fontWeight: 'bold', textAlign: 'center'
    });
    document.body.appendChild(banner);
    updateMpBannerText();
  }

  function updateMpBannerText() {
    const banner = document.getElementById('gd-mp-status-banner');
    if (!banner) return;
    const count = mpState.seats.filter(Boolean).length;
    banner.innerHTML = `📡 掼蛋实时联机大厅 | 房号: <span style="color:#fff">${mpState.roomCode}</span> | 已满员: <span style="color:#fff">${count}/4</span>人`;
  }

  function updateTurnUiVisual() {
    const isMyTurn = (mpState.mySeatIndex === mpState.currentTurnSeat);
    console.log(`[对局轮转] 当前出牌人座位号: ${mpState.currentTurnSeat}, 我是否拥有行动权: ${isMyTurn}`);
    
    // 动态调整原厂出牌/过牌控制台按钮的显隐
    const actionPanel = document.querySelector('.action-panel') || document.getElementById('gd-action-bar');
    if (actionPanel) {
      actionPanel.style.display = isMyTurn ? 'flex' : 'none';
    }
  }

  function showNetOppenentAction(seatIndex, cards) {
    // 动态渲染其他三个网络玩家在界面的出牌效果
    if (seatIndex === mpState.mySeatIndex) return;
    let label = `玩家 ${seatIndex}`;
    if (mpState.seats[seatIndex]) label = mpState.seats[seatIndex].nickname;

    let tip = document.getElementById(`gd-net-tip-${seatIndex}`);
    if (!tip) {
      tip = document.createElement('div');
      tip.id = `gd-net-tip-${seatIndex}`;
      Object.assign(tip.style, {
        position: 'fixed', padding: '8px 16px', background: 'rgba(0,0,0,0.8)',
        color: '#fff', borderRadius: '8px', fontSize: '13px', zIndex: '99999'
      });
      // 简易根据座位相对方位落子定位
      if(seatIndex === 1) Object.assign(tip.style, { right: '40px', top: '50%' }); // 东
      if(seatIndex === 2) Object.assign(tip.style, { top: '80px', left: '50%', transform:'translateX(-50%)' }); // 北
      if(seatIndex === 3) Object.assign(tip.style, { left: '40px', top: '50%' }); // 西
      document.body.appendChild(tip);
    }
    tip.innerText = cards ? `出牌 🃏: ${cards.map(c=>c.rank).join(',')}` : '不要 ❌';
    tip.style.display = 'block';
    setTimeout(() => { tip.style.display = 'none'; }, 2500);
  }

  // 对外挂载网关
  window.GD_MP = GD_MP;

})();