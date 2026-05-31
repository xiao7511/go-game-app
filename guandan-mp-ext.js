/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 独立游戏主界面联机引擎（防房间丢失 & 3分钟AI托管终结版）
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
    isGameStarted: false 
  };

  function getNetUser() {
    if (window.state && window.state.uid) {
      return { uid: window.state.uid, nickname: window.state.userNickname || '玩家_' + window.state.uid.substr(0,4) };
    }
    let localUid = localStorage.getItem('gd_net_uid') || 'u_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('gd_net_uid', localUid);
    let localNickname = localStorage.getItem('user_nickname') || '客军_' + Math.floor(Math.random() * 900);
    return { uid: localUid, nickname: localNickname };
  }

  function initMpClient() {
    if (mpState.client) return true;
    if (typeof window.getSupabaseClient === 'function') mpState.client = window.getSupabaseClient();
    if (!mpState.client && window.supabase && window.APP_CONFIG) {
      const { createClient } = window.supabase;
      mpState.client = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
    }
    return !!mpState.client;
  }

  // =========================================================================
  // 🚀 联机直连网关（带房间号去空格防丢失功能）
  // =========================================================================
  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (!initMpClient()) {
      alert("Supabase 网关未就绪！");
      return;
    }

    if (window.state) window.state.gameMode = 'NET_BATTLE';
    mpState.isGameStarted = false; 

    const user = getNetUser();
    
    // 🔒【精修】：对房间号进行高强度清洗，防止链接复制时产生隐形换行符或空格导致房间不存在
    if (targetRoomCode) {
      mpState.roomCode = String(targetRoomCode).trim().toUpperCase();
      mpState.isHost = false;
      console.log(`[联机网关] 客军正在加入纯净房间号: ${mpState.roomCode}`);
    } else {
      mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
      mpState.isHost = true;
      mpState.seats[0] = user;
      mpState.mySeatIndex = 0;
      console.log(`[联机网关] 房东正在创建纯净房间号: ${mpState.roomCode}`);
    }

    // 强拉对局核心战场视图，阻止单机大厅渲染
    const rawLobby = document.getElementById('guandan-lobby-container');
    if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');
    
    // ⚡ 建立全网唯一的纯净房间信道
    const channelName = `room_guandan_${mpState.roomCode}`;
    mpState.channel = mpState.client.channel(channelName, {
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
        console.log(`[信道建立成功] 已成功挂载到云端信道: ${channelName}`);
        injectBannerIntoGuandan();

        if (!mpState.isHost) {
          // 客军入局：向房东发送同步申请
          mpState.channel.send({
            type: 'broadcast',
            event: 'PLAYER_JOIN',
            payload: user
          });
        } else {
          // 房东：拉起 3分钟 真人匹配倒计时
          startMatchCountdown();
          syncEngineNicknames();
        }
      }
    });
  };

  // =========================================================================
  // ⏳ 3分钟倒计时闸门与 AI 托管激活
  // =========================================================================
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
      triggerAiBotFilling(); 
    }, 3 * 60 * 1000);
  }

  function triggerAiBotFilling() {
    if (!mpState.isHost || mpState.isGameStarted) return;
    
    const currentCount = mpState.seats.filter(Boolean).length;
    if (currentCount >= 4) return; 

    console.log(`[3分钟到] 真人未满员。正在召唤智能机器人填充对局...`);
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

  // =========================================================================
  // 👥 席位动态同步（确保新加入玩家信息绝对互通）
  // =========================================================================
  function handlePlayerJoin({ payload }) {
    if (mpState.isHost && !mpState.isGameStarted) {
      console.log(`[房东收到真人申请] 玩家: ${payload.nickname} 正在进入席位...`);
      
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
      
      // 📡 核心：向全网广播最新的人员结构，让后来的人也能看到前面已经进房的玩家
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
    console.log("[客军接收席位同步] 正在更新当前房间总席位数据...");
    mpState.seats = payload.seats;
    const user = getNetUser();
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    
    if (payload.countdownOver) clearAllMatchTimers();
    syncEngineNicknames();

    if (payload.triggerStart && !mpState.isGameStarted) {
      mpState.isGameStarted = true;
    }
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
        domNameTag.style.fontWeight = 'bold';
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

  function checkAndStartGame() {
    const currentCount = mpState.seats.filter(Boolean).length;
    if (currentCount === 4) {
      mpState.isGameStarted = true;
      
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

  // =========================================================================
  // 📌 胶囊悬浮排版（右上角挂载，绝不遮挡对家和发牌区）
  // =========================================================================
  function injectBannerIntoGuandan() {
    let parentContainer = document.getElementById('guandan-game-container') || document.getElementById('game-container') || document.querySelector('.game-board');
    if (!parentContainer) parentContainer = document.body;
    
    let banner = document.getElementById('guandan-inner-mp-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'guandan-inner-mp-banner';
      parentContainer.appendChild(banner);
    }
    Object.assign(banner.style, {
      position: 'absolute', top: '12px', right: '15px', left: 'auto', transform: 'none',
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
      : `<span style="color:#ef4444; font-weight:bold;">🤖 AI已托管对战</span>`;
      
    if (count === 4) countdownHtml = `<span style="color:#10b981; font-weight:bold;">✨ 真人对局中</span>`;

    banner.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <span>♣️ 房号: <strong style="color:#22c55e;">${mpState.roomCode || '...'}</strong></span>
        <span>(${count}/4人)</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
        ${countdownHtml}
        <button onclick="window.GD_MP.copyRoomLink()" style="padding:2px 8px; background:#22c55e; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">🔗 复制邀请</button>
      </div>
    `;
  }

  function loadNetGameData(rawHandCards, initialTurn) {
    mpState.currentTurnSeat = initialTurn;
    window.gdPlayerHand = rawHandCards.map((c, idx) => ({
      id: 'net_' + idx + '_' + Math.random().toString(36).substr(2,4),
      suit: c.suit, rank: c.rank, score: parseInt(c.rank) || idx, selected: false
    }));
    if (typeof window.sortHandCards === 'function') window.sortHandCards(window.gdPlayerHand);
    if (typeof window.renderGameBoard === 'function') window.renderGameBoard();
    syncEngineNicknames(); 
  }

  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    const roomLink = `${window.location.href.split('?')[0]}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    navigator.clipboard.writeText(roomLink).then(() => alert(`🎉 邀请链接已复制，去发给微信好友吧：\n${roomLink}`));
  };

  window.GD_MP = GD_MP;
})();