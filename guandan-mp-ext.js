/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 独立游戏主界面联机引擎（3分钟玩家匹配+机器人代打版）
 * 1. 动态对战看板：掼蛋天际线集成 180 秒倒计时动态高亮显示。
 * 2. 3分钟真人群英会：优先等待网络真人入局，满 4 人秒开。
 * 3. 智能机器人代打：匹配满 3 分钟未果，自动唤醒原厂 AI 坐席填补空缺，强制开局打通。
 */
(() => {
  'use strict';

  const GD_MP = (window.GD_MP = window.GD_MP || {});
  
  const mpState = {
    client: null,
    channel: null,
    roomCode: null,
    mySeatIndex: -1, 
    seats: [null, null, null, null], // 0:南(我), 1:东, 2:北, 3:西
    isHost: false,
    currentTurnSeat: 0,
    matchTimer: null,          // 3分钟匹配定时器
    countdownSeconds: 180,     // 倒计时剩余秒数
    uiRefreshTimer: null       // UI 秒级刷新器
  };

  function getNetUser() {
    if (window.state && window.state.uid) {
      return { uid: window.state.uid, nickname: window.state.userNickname || '我' };
    }
    const localNickname = localStorage.getItem('user_nickname') || '新玩家';
    return { uid: 'guest_' + Math.random().toString(36).substr(2, 6), nickname: localNickname };
  }

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
  // 🚀 联机直连网关
  // =========================================================================
  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (!initMpClient()) return;

    if (window.state) window.state.gameMode = 'NET_BATTLE';

    // 强拉原厂画布与主战场 DOM
    if (window.GD && typeof window.GD.initGameMatch === 'function') {
      window.GD.initGameMatch(); 
    } else if (window.GD && typeof window.GD.init === 'function') {
      window.GD.init();
    }

    const user = getNetUser();
    
    if (targetRoomCode) {
      mpState.roomCode = targetRoomCode;
      mpState.isHost = false;
    } else {
      mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
      mpState.isHost = true;
      mpState.seats[0] = user;
      mpState.mySeatIndex = 0;
    }

    // 建立信道
    mpState.channel = mpState.client.channel(`room:guandan:${mpState.roomCode}`, {
      config: { broadcast: { self: false, ack: true } }
    });

    mpState.channel
      .on('broadcast', { event: 'PLAYER_JOIN' }, (p) => handlePlayerJoin(p))
      .on('broadcast', { event: 'ROOM_SYNC' }, (p) => handleRoomSync(p))
      .on('broadcast', { event: 'GAME_START' }, (p) => handleGameStart(p))
      .on('broadcast', { event: 'PLAY_CARDS' }, (p) => handleNetPlayCards(p))
      .on('broadcast', { event: 'PASS_TURN' }, (p) => handleNetPass(p));

    await mpState.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        injectBannerIntoGuandan();

        if (!mpState.isHost) {
          // 客人进房，广播报到
          mpState.channel.send({ type: 'broadcast', event: 'PLAYER_JOIN', payload: user });
        } else {
          // 房东激活 3分钟 真人匹配倒计时大限！
          startMatchCountdown();
        }
      }
    });
  };

  // =========================================================================
  // ⏳ 3分钟倒计时闸门与 AI 托管激活
  // =========================================================================
  function startMatchCountdown() {
    if (mpState.matchTimer) return;

    mpState.countdownSeconds = 180; // 3分钟 = 180秒
    
    // UI 秒级更新钟
    mpState.uiRefreshTimer = setInterval(() => {
      mpState.countdownSeconds--;
      if (mpState.countdownSeconds <= 0) {
        clearInterval(mpState.uiRefreshTimer);
      }
      updateMpBannerText();
    }, 1000);

    // 3分钟大限触发器
    mpState.matchTimer = setTimeout(() => {
      clearInterval(mpState.uiRefreshTimer);
      triggerAiBotFilling();
    }, 3 * 60 * 1000);
  }

  /**
   * 🤖【核心逻辑】：3分钟到，房东启动原厂机器人补全席位并强制发牌开局
   */
  function triggerAiBotFilling() {
    if (!mpState.isHost) return;
    
    const currentCount = mpState.seats.filter(Boolean).length;
    if (currentCount >= 4) return; // 如果期间凑巧刚好满了，不触发代打

    console.log(`[匹配超时] 3分钟内真人未满员（当前 ${currentCount}/4人）。正在召唤高智商智能机器人接入代打...`);

    const aiNames = ['智能机甲(东)', '深蓝之影(北)', '阿尔法狗(西)'];
    const seatPositions = ['east', 'north', 'west'];

    for (let i = 0; i < 4; i++) {
      if (!mpState.seats[i]) {
        // 赋予机器人专属特征
        mpState.seats[i] = { 
          uid: 'bot_ai_' + seatPositions[i - 1], 
          nickname: aiNames[i - 1],
          isBot: true 
        };
      }
    }

    // 全网同步最新加入了机器人的席位状态
    mpState.channel.send({
      type: 'broadcast',
      event: 'ROOM_SYNC',
      payload: { seats: mpState.seats, countdownOver: true }
    });

    syncEngineNicknames();
    checkAndStartGame(); // 强行进入洗牌和发牌逻辑
  }

  function clearAllMatchTimers() {
    if (mpState.matchTimer) {
      clearTimeout(mpState.matchTimer);
      mpState.matchTimer = null;
    }
    if (mpState.uiRefreshTimer) {
      clearInterval(mpState.uiRefreshTimer);
      mpState.uiRefreshTimer = null;
    }
  }

  // =========================================================================
  // 👥 席位动态调整与昵称注入
  // =========================================================================
  function handlePlayerJoin({ payload }) {
    if (mpState.isHost) {
      for (let i = 0; i < 4; i++) {
        if (!mpState.seats[i]) {
          mpState.seats[i] = { uid: payload.uid, nickname: payload.nickname };
          break;
        }
      }
      
      const currentReady = mpState.seats.filter(Boolean).length;
      
      mpState.channel.send({
        type: 'broadcast',
        event: 'ROOM_SYNC',
        payload: { seats: mpState.seats, countdownOver: currentReady === 4 }
      });

      syncEngineNicknames();

      // 如果 4 个真人提前凑齐，提前解除 3分钟 警报，直接激情开局！
      if (currentReady === 4) {
        clearAllMatchTimers();
        checkAndStartGame();
      }
    }
  }

  function handleRoomSync({ payload }) {
    mpState.seats = payload.seats;
    const user = getNetUser();
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    
    if (payload.countdownOver) {
      clearAllMatchTimers();
    }
    syncEngineNicknames();
  }

  function syncEngineNicknames() {
    updateMpBannerText();
    const seatPositions = ['south', 'east', 'north', 'west'];
    
    seatPositions.forEach((pos, idx) => {
      const playerObj = mpState.seats[idx];
      const targetName = playerObj ? playerObj.nickname : (idx === mpState.mySeatIndex ? '我' : '匹配中...');
      
      const domNameTag = document.querySelector(`.player-info.${pos} .name`) || 
                         document.getElementById(`gd-player-name-${pos}`);
      if (domNameTag) {
        domNameTag.innerText = targetName;
        domNameTag.style.color = playerObj?.isBot ? '#e11d48' : '#22c55e'; // 机器人显示暗红，真人绿色
      }

      if (window.state) {
        if (!window.state.playerNames) window.state.playerNames = {};
        window.state.playerNames[pos] = targetName;
      }
    });

    if (typeof window.renderGameBoard === 'function') {
      window.renderGameBoard();
    }
  }

  // =========================================================================
  // 🎴 派牌与游戏行为流转
  // =========================================================================
  function checkAndStartGame() {
    if (mpState.seats.filter(Boolean).length === 4) {
      let allCards = [];
      const suits = ['S', 'H', 'C', 'D'];
      const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      for(let k=0; k<2; k++){
        suits.forEach(s => ranks.forEach(r => allCards.push({ suit: s, rank: r })));
        allCards.push({ suit: 'JOKER', rank: 'SMALL' });
        allCards.push({ suit: 'JOKER', rank: 'BIG' });
      }
      allCards.sort(() => Math.random() - 0.5);

      const hands = [
        allCards.slice(0, 27), allCards.slice(27, 54),
        allCards.slice(54, 81), allCards.slice(81, 108)
      ];

      mpState.channel.send({
        type: 'broadcast',
        event: 'GAME_START',
        payload: { hands: hands, hostTurn: 0 }
      });

      loadNetGameData(hands[0], 0);
    }
  }

  function handleGameStart({ payload }) {
    clearAllMatchTimers();
    const myHand = payload.hands[mpState.mySeatIndex];
    loadNetGameData(myHand, payload.hostTurn);
  }

  function loadNetGameData(rawHandCards, initialTurn) {
    mpState.currentTurnSeat = initialTurn;
    
    const processedCards = rawHandCards.map((c, idx) => {
      let score = parseInt(c.rank) || 0;
      if (c.rank === 'J') score = 11;
      if (c.rank === 'Q') score = 12;
      if (c.rank === 'K') score = 13;
      if (c.rank === 'A') score = 14;
      if (c.rank === '2') score = 15;
      if (c.suit === 'JOKER') score = c.rank === 'BIG' ? 100 : 99;

      return {
        id: 'net_' + idx + '_' + Math.random().toString(36).substr(2,4),
        suit: c.suit, rank: c.rank, score: score, selected: false
      };
    });

    window.gdPlayerHand = processedCards;
    if (typeof window.sortHandCards === 'function') window.sortHandCards(window.gdPlayerHand);
    if (typeof window.renderGameBoard === 'function') window.renderGameBoard();
    updateTurnUiVisual();
    syncEngineNicknames(); 
  }

  GD_MP.sendPlayAction = function(cards) {
    if (!mpState.channel) return;
    mpState.channel.send({
      type: 'broadcast', event: 'PLAY_CARDS',
      payload: { seatIndex: mpState.mySeatIndex, cards: cards }
    });
    mpState.currentTurnSeat = (mpState.mySeatIndex + 1) % 4;
    updateTurnUiVisual();
  };

  GD_MP.sendPassAction = function() {
    if (!mpState.channel) return;
    mpState.channel.send({
      type: 'broadcast', event: 'PASS_TURN',
      payload: { seatIndex: mpState.mySeatIndex }
    });
    mpState.currentTurnSeat = (mpState.mySeatIndex + 1) % 4;
    updateTurnUiVisual();
  };

  function handleNetPlayCards({ payload }) {
    mpState.currentTurnSeat = (payload.seatIndex + 1) % 4;
    showNetOppenentAction(payload.seatIndex, payload.cards);
    updateTurnUiVisual();
  }

  function handleNetPass({ payload }) {
    mpState.currentTurnSeat = (payload.seatIndex + 1) % 4;
    showNetOppenentAction(payload.seatIndex, null);
    updateTurnUiVisual();
  }

  // =========================================================================
  // 🔗 专属直连动态链接生成
  // =========================================================================
  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    const currentUrl = window.location.href.split('?')[0];
    const roomLink = `${currentUrl}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomLink).then(() => {
        alert(`🎉 掼蛋对战房链接复制成功！去微信发给好友入局：\n\n${roomLink}`);
      }).catch(() => fallbackCopy(roomLink));
    } else {
      fallbackCopy(roomLink);
    }
  };

  function fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
    Object.assign(input.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert(`🎉 链接已复制：\n\n${text}`);
  }

  // =========================================================================
  // 📌 掼蛋天际线内聚横幅嵌入
  // =========================================================================
  function injectBannerIntoGuandan() {
    const oldGlobalBanner = document.getElementById('gd-mp-status-banner');
    if (oldGlobalBanner) oldGlobalBanner.remove();

    let parentContainer = document.getElementById('guandan-game-container') || 
                          document.getElementById('game-container') || 
                          document.querySelector('.game-board');
    if (!parentContainer) parentContainer = document.body;

    let banner = document.getElementById('guandan-inner-mp-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'guandan-inner-mp-banner';
      parentContainer.appendChild(banner);
    }
    
    Object.assign(banner.style, {
      position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', background: 'rgba(15, 23, 42, 0.95)', border: '2px solid #22c55e',
      color: '#ffffff', borderRadius: '30px', fontSize: '14px', zIndex: '999999',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)', fontWeight: 'bold', textAlign: 'center',
      display: 'flex', alignItems: 'center', gap: '15px'
    });
    
    updateMpBannerText();
  }

  function updateMpBannerText() {
    const banner = document.getElementById('guandan-inner-mp-banner');
    if (!banner) return;
    const count = mpState.seats.filter(Boolean).length;
    
    // 计算剩余时间格式
    const mins = Math.floor(mpState.countdownSeconds / 60);
    const secs = mpState.countdownSeconds % 60;
    const timeStr = mpState.countdownSeconds > 0 ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : '⏱️ 匹配结束';

    // 动态拼接状态
    let countdownHtml = mpState.countdownSeconds > 0 && count < 4
      ? ` ｜ ⏳ 开启AI代打倒计时: <span style="color:#f59e0b">${timeStr}</span>`
      : ` ｜ <span style="color:#ef4444">🤖 机器人代打已挂载</span>`;
      
    if (count === 4 && mpState.countdownSeconds > 0) {
      countdownHtml = ` ｜ <span style="color:#10b981">✨ 真人对局已锁定</span>`;
    }

    banner.innerHTML = `
      <span>♣️ 掼蛋联机房: <strong style="color:#22c55e; font-size:16px;">${mpState.roomCode || '分发中...'}</strong></span>
      <span style="color:rgba(255,255,255,0.3);">|</span>
      <span>当前玩家: <strong>${count}/4</strong> 人</span>
      ${countdownHtml}
      <button onclick="window.GD_MP.copyRoomLink()" style="margin-left:5px; padding:5px 14px; background:#22c55e; color:#fff; border:none; border-radius:15px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">🔗 复制邀请链接</button>
    `;
  }

  function updateTurnUiVisual() {
    const isMyTurn = (mpState.mySeatIndex === mpState.currentTurnSeat);
    const actionPanel = document.querySelector('.action-panel') || document.getElementById('gd-action-bar');
    if (actionPanel) actionPanel.style.setProperty('display', isMyTurn ? 'flex' : 'none', 'important');
  }

  function showNetOppenentAction(seatIndex, cards) {
    if (seatIndex === mpState.mySeatIndex) return;
    let name = mpState.seats[seatIndex] ? mpState.seats[seatIndex].nickname : `对手 ${seatIndex}`;
    alert(`【${name}】${cards ? '出牌：' + cards.map(c=>c.rank).join(',') : '不要，过牌！'}`);
  }

  window.GD_MP = GD_MP;

})();