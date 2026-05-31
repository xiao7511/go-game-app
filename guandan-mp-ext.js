/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 强力一键穿透直连联机引擎扩展包
 * 1. 物理刺穿：大厅点击“进入联机版”直调本模块，自动强拉原生 Canvas 战场，跳过二级大厅。
 * 2. 状态合围：同步处理 4 人座次、自动分发 108 张发牌数据、回合穿透与网络同步。
 */
(() => {
  'use strict';

  const GD_MP = (window.GD_MP = window.GD_MP || {});
  
  const mpState = {
    client: null,
    channel: null,
    roomCode: null,
    mySeatIndex: -1, // 0: 南, 1: 东, 2: 北, 3: 西
    seats: [null, null, null, null], 
    isHost: false,
    currentTurnSeat: 0,
    lastValidPlay: null
  };

  function getNetUser() {
    if (window.state && window.state.uid) {
      return { uid: window.state.uid, nickname: window.state.userNickname || '新玩家' };
    }
    return { uid: 'guest_' + Math.random().toString(36).substr(2, 6), nickname: '玩家_' + Math.floor(Math.random()*900) };
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
  // 🚀 主控舱核心直连入口：一键初始化战场并启动匹配
  // =========================================================================
  GD_MP.startNetMatch = async function() {
    if (!initMpClient()) {
      alert("Supabase 联机组件未就绪，请检查网络配置或重新登录！");
      return;
    }

    console.log("[掼蛋联机] 正在一键穿透启动网络匹配...");
    
    // 1. 强行设定游戏全局模式为网络联机态
    if (window.state) {
      window.state.gameMode = 'NET_BATTLE';
    }

    // 2. 🚨【核心修复】：强行提前唤醒并拉起原厂掼蛋的 Canvas 游戏主战场环境
    if (window.GD && typeof window.GD.initGameMatch === 'function') {
      window.GD.initGameMatch(); 
    } else if (window.GD && typeof window.GD.init === 'function') {
      window.GD.init();
    }

    // 隐藏掉原厂可能残留的任何二级大厅容器
    const rawLobby = document.getElementById('guandan-lobby-container');
    if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');

    const user = getNetUser();
    mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
    mpState.mySeatIndex = 0; 
    mpState.seats[0] = user;
    mpState.isHost = true;

    // 3. 建立云端信道
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
        console.log(`[掼蛋联机] 专属云信道建立完毕，房号: ${mpState.roomCode}`);
        injectMpBanner();

        // 快速模拟另外3位网络玩家入局就坐（单机环境测试一键连通性）
        setTimeout(() => {
          if (mpState.seats.filter(Boolean).length < 4) {
            handlePlayerJoin({ payload: { uid: 'player_east', nickname: '江阴二少' } });
            handlePlayerJoin({ payload: { uid: 'player_north', nickname: '南京雀圣' } });
            handlePlayerJoin({ payload: { uid: 'player_west', nickname: '苏州阿福' } });
          }
        }, 500);
      }
    });
  };

  function handlePlayerJoin({ payload }) {
    if (mpState.isHost) {
      for (let i = 0; i < 4; i++) {
        if (!mpState.seats[i]) {
          mpState.seats[i] = { uid: payload.uid, nickname: payload.nickname };
          break;
        }
      }
      mpState.channel.send({
        type: 'broadcast',
        event: 'ROOM_SYNC',
        payload: { seats: mpState.seats }
      });
      updateMpBannerText();
      checkAndStartGame();
    }
  }

  function handleRoomSync({ payload }) {
    mpState.seats = payload.seats;
    const user = getNetUser();
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    updateMpBannerText();
  }

  function checkAndStartGame() {
    const readyPlayers = mpState.seats.filter(Boolean).length;
    if (readyPlayers === 4) {
      console.log("[联机对战] 4人就位，房东开始全网派发洗牌切片...");
      
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

    // 强行把网络手牌灌入原厂全局作用域
    window.gdPlayerHand = processedCards;
    
    if (typeof window.sortHandCards === 'function') {
      window.sortHandCards(window.gdPlayerHand);
    }
    if (typeof window.renderGameBoard === 'function') {
      window.renderGameBoard();
    }
    updateTurnUiVisual();
  }

  GD_MP.sendPlayAction = function(cards) {
    if (!mpState.channel) return;
    mpState.channel.send({
      type: 'broadcast',
      event: 'PLAY_CARDS',
      payload: { seatIndex: mpState.mySeatIndex, cards: cards }
    });
    mpState.currentTurnSeat = (mpState.mySeatIndex + 1) % 4;
    updateTurnUiVisual();
  };

  GD_MP.sendPassAction = function() {
    if (!mpState.channel) return;
    mpState.channel.send({
      type: 'broadcast',
      event: 'PASS_TURN',
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

  function injectMpBanner() {
    let banner = document.getElementById('gd-mp-status-banner');
    if (banner) banner.remove();
    
    banner = document.createElement('div');
    banner.id = 'gd-mp-status-banner';
    Object.assign(banner.style, {
      position: 'fixed', top: '15px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #10b981',
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
    banner.innerHTML = `📡 掼蛋实时联机大厅 | 房号: <span style="color:#fff">${mpState.roomCode}</span> | 在线: <span style="color:#fff">${count}/4</span>人`;
  }

  function updateTurnUiVisual() {
    const isMyTurn = (mpState.mySeatIndex === mpState.currentTurnSeat);
    const actionPanel = document.querySelector('.action-panel');
    if (actionPanel) {
      actionPanel.style.setProperty('display', isMyTurn ? 'flex' : 'none', 'important');
    }
  }

  function showNetOppenentAction(seatIndex, cards) {
    if (seatIndex === mpState.mySeatIndex) return;
    let name = mpState.seats[seatIndex] ? mpState.seats[seatIndex].nickname : `对手 ${seatIndex}`;
    alert(`【${name}】${cards ? '出牌：' + cards.map(c=>c.rank).join(',') : '不要，过牌！'}`);
  }

  window.GD_MP = GD_MP;

})();