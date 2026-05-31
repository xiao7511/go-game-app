/**
 * Modified Date: 2026-05-31
 * Description: 掼蛋联机引擎（严防抢跑、动态真人同步与AI托管版）
 */
(() => {
  'use strict';

  const GD_MP = (window.GD_MP = window.GD_MP || {});
  
  const mpState = {
    client: null,
    channel: null,
    roomCode: null,
    mySeatIndex: -1, 
    seats: [null, null, null, null], 
    isHost: false,
    currentTurnSeat: 0,
    matchTimer: null,          
    countdownSeconds: 180,     
    uiRefreshTimer: null,
    isGameStarted: false // 🚨 新增：全局游戏开局锁，防止任何未满员状态下的“抢跑发牌”
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
    if (typeof window.getSupabaseClient === 'function') mpState.client = window.getSupabaseClient();
    return !!mpState.client;
  }

  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (!initMpClient()) return;

    if (window.state) window.state.gameMode = 'NET_BATTLE';
    mpState.isGameStarted = false; // 锁死开局状态

    // 🚧 拦截原厂的自动发牌：若原厂有自动初始化的定时器，尝试将其清除
    if (window.gdAutoStartTimer) clearTimeout(window.gdAutoStartTimer);

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
          // 📥 真人进房间：立刻发送报到广播
          mpState.channel.send({ type: 'broadcast', event: 'PLAYER_JOIN', payload: user });
        } else {
          // 👑 房东：开始 3 分钟倒计时，期间不准发牌
          startMatchCountdown();
          syncEngineNicknames();
        }
      }
    });
  };

  function startMatchCountdown() {
    if (mpState.matchTimer) return;
    mpState.countdownSeconds = 180;
    
    mpState.uiRefreshTimer = setInterval(() => {
      mpState.countdownSeconds--;
      if (mpState.countdownSeconds <= 0) clearInterval(mpState.uiRefreshTimer);
      updateMpBannerText();
    }, 1000);

    mpState.matchTimer = setTimeout(() => {
      clearInterval(mpState.uiRefreshTimer);
      triggerAiBotFilling(); // 3分钟到，AI 托管补位开局
    }, 3 * 60 * 1000);
  }

  function triggerAiBotFilling() {
    if (!mpState.isHost || mpState.isGameStarted) return;
    
    const currentCount = mpState.seats.filter(Boolean).length;
    if (currentCount >= 4) return; 

    console.log(`[3分钟大限到] 真人未满员。智能 AI 补位托管开局！`);
    const aiNames = ['智能机甲(东)', '深蓝之影(北)', '阿尔法狗(西)'];
    const seatPositions = ['east', 'north', 'west'];

    for (let i = 0; i < 4; i++) {
      if (!mpState.seats[i]) {
        mpState.seats[i] = { 
          uid: 'bot_ai_' + seatPositions[i - 1], 
          nickname: aiNames[i - 1],
          isBot: true 
        };
      }
    }

    mpState.channel.send({
      type: 'broadcast',
      event: 'ROOM_SYNC',
      payload: { seats: mpState.seats, countdownOver: true, triggerStart: true }
    });

    syncEngineNicknames();
    checkAndStartGame(); 
  }

  function handlePlayerJoin({ payload }) {
    if (mpState.isHost && !mpState.isGameStarted) {
      // 检查是否已经是房间里的老玩家重新连接，防止无限挤占坑位
      let existingIdx = mpState.seats.findIndex(s => s && s.uid === payload.uid);
      if (existingIdx === -1) {
        for (let i = 0; i < 4; i++) {
          if (!mpState.seats[i]) {
            mpState.seats[i] = { uid: payload.uid, nickname: payload.nickname };
            break;
          }
        }
      }
      
      const currentReady = mpState.seats.filter(Boolean).length;
      
      // 📡 核心：向所有新老玩家广播当前最新的房间席位与状态，实现信息实时同步
      mpState.channel.send({
        type: 'broadcast',
        event: 'ROOM_SYNC',
        payload: { seats: mpState.seats, countdownOver: currentReady === 4, triggerStart: currentReady === 4 }
      });

      syncEngineNicknames();

      if (currentReady === 4) {
        clearAllMatchTimers();
        checkAndStartGame();
      }
    }
  }

  function handleRoomSync({ payload }) {
    // 📥 无论何时有新玩家进入，非房东玩家都会收到此广播，自动同步桌面上所有人的信息
    mpState.seats = payload.seats;
    const user = getNetUser();
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    
    if (payload.countdownOver) clearAllMatchTimers();
    syncEngineNicknames();

    // 如果接收到房东发出的强开信号，客机同步开局
    if (payload.triggerStart && !mpState.isGameStarted) {
      mpState.isGameStarted = true;
    }
  }

  function checkAndStartGame() {
    if (mpState.isGameStarted) return;
    const currentCount = mpState.seats.filter(Boolean).length;
    
    if (currentCount === 4) {
      mpState.isGameStarted = true;
      console.log("[联机引擎] 触发正式发牌流水...");
      
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
    mpState.isGameStarted = true;
    clearAllMatchTimers();
    const myHand = payload.hands[mpState.mySeatIndex];
    loadNetGameData(myHand, payload.hostTurn);
  }

  function clearAllMatchTimers() {
    if (mpState.matchTimer) { clearTimeout(mpState.matchTimer); mpState.matchTimer = null; }
    if (mpState.uiRefreshTimer) { clearInterval(mpState.uiRefreshTimer); mpState.uiRefreshTimer = null; }
  }

  // 保持之前的极简胶囊布局不变...
  function injectBannerIntoGuandan() {
    let parentContainer = document.getElementById('guandan-game-container') || document.getElementById('game-container') || document.querySelector('.game-board');
    if (!parentContainer) parentContainer = document.body;
    let banner = document.getElementById('guandan-inner-mp-banner') || document.createElement('div');
    banner.id = 'guandan-inner-mp-banner';
    parentContainer.appendChild(banner);
    Object.assign(banner.style, {
      position: 'absolute', top: '10px', right: '15px', left: 'auto', transform: 'none',
      padding: '6px 14px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(34, 197, 94, 0.5)',
      color: '#ffffff', borderRadius: '8px', fontSize: '12px', zIndex: '999999', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px'
    });
    updateMpBannerText();
  }

  function updateMpBannerText() {
    const banner = document.getElementById('guandan-inner-mp-banner');
    if (!banner) return;
    const count = mpState.seats.filter(Boolean).length;
    const mins = Math.floor(mpState.countdownSeconds / 60);
    const secs = mpState.countdownSeconds % 60;
    const timeStr = mpState.countdownSeconds > 0 ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : '结束';

    let countdownHtml = mpState.countdownSeconds > 0 && count < 4
      ? `⏳ AI托管倒计时: <span style="color:#f59e0b; font-weight:bold;">${timeStr}</span>`
      : `<span style="color:#ef4444; font-weight:bold;">🤖 AI已托管</span>`;
      
    if (count === 4) countdownHtml = `<span style="color:#10b981; font-weight:bold;">✨ 真人对局</span>`;

    banner.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <span>♣️ 房号: <strong style="color:#22c55e;">${mpState.roomCode || '...'}</strong></span>
        <span>(${count}/4人)</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
        ${countdownHtml}
        <button onclick="window.GD_MP.copyRoomLink()" style="padding:2px 8px; background:#22c55e; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">🔗 复制</button>
      </div>
    `;
  }

  function syncEngineNicknames() {
    updateMpBannerText();
    const seatPositions = ['south', 'east', 'north', 'west'];
    seatPositions.forEach((pos, idx) => {
      const playerObj = mpState.seats[idx];
      const targetName = playerObj ? playerObj.nickname : (idx === mpState.mySeatIndex ? '我' : '等待加入...');
      const domNameTag = document.querySelector(`.player-info.${pos} .name`) || document.getElementById(`gd-player-name-${pos}`);
      if (domNameTag) {
        domNameTag.innerText = targetName;
        domNameTag.style.color = playerObj?.isBot ? '#e11d48' : '#22c55e';
      }
    });
  }

  function loadNetGameData(rawHandCards, initialTurn) {
    mpState.currentTurnSeat = initialTurn;
    window.gdPlayerHand = rawHandCards.map((c, idx) => ({
      id: 'net_' + idx + '_' + Math.random().toString(36).substr(2,4),
      suit: c.suit, rank: c.rank, score: parseInt(c.rank) || idx, selected: false
    }));
    if (typeof window.sortHandCards === 'function') window.sortHandCards(window.gdPlayerHand);
    if (typeof window.renderGameBoard === 'function') window.renderGameBoard();
    if (window.GD && typeof window.GD.initGameMatch === 'function') window.GD.initGameMatch(); 
    syncEngineNicknames(); 
  }

  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    const roomLink = `${window.location.href.split('?')[0]}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    navigator.clipboard.writeText(roomLink).then(() => alert(`🎉 链接已复制，快发给好友入局：\n${roomLink}`));
  };

  window.GD_MP = GD_MP;
})();