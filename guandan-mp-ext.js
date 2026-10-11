/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 独立游戏主界面联机引擎（双向异步状态锁死校准版）
 * 1. 解决房间不存在：强制延迟信道挂载，确保房东实体网络节点绝对在云端点亮。
 * 2. 解决信息不同步：客军必须在云端订阅状态确认为 'SUBSCRIBED' 后才允许发起加入广播，防止丢包；房东收到后强制下发全量时钟校准。
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
      return { uid: window.state.uid, nickname: window.state.userNickname || '玩家_' + window.state.uid.substr(0,4), avatar: window.NobiAvatars?.self(window.state.userNickname) || null };
    }
    return null;
  }

  function initMpClient() {
    if (!mpState.client) mpState.client = window.getSupabaseClient?.();
    return !!mpState.client;
  }

  // =========================================================================
  // 🚀 联机网关（精细化生命周期握手）
  // =========================================================================
  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (window.NobiServices) {
      try {
        const user = await window.NobiServices.requireUser();
        window.state = window.state || {};
        window.state.uid = user.id;
        window.state.userNickname = user.user_metadata?.nickname || '玩家';
        window.NobiAvatars?.setAccount(user);
      } catch (_) { alert('请登录并确认联机配置后重试'); return; }
    }
    if (!initMpClient()) {
      console.error("Supabase 网关未就绪！");
      return;
    }

    if (window.state) window.state.gameMode = 'NET_BATTLE';
    GD_MP.stopNetMatch();
    mpState.isGameStarted = false;
    mpState.seats = [null,null,null,null]; mpState.mySeatIndex = -1;

    const user = getNetUser();
    if (!user) return;
    window.GD?.initGameMatch('NET_BATTLE');

    if (targetRoomCode) {
      mpState.roomCode = String(targetRoomCode).trim().toUpperCase();
      mpState.isHost = false;
    } else {
      mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
      mpState.isHost = true;
      mpState.seats[0] = user;
      mpState.mySeatIndex = 0;
    }

    const rawLobby = document.getElementById('guandan-lobby-container');
    if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');
    
    // 建立房间广播专属信道
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

    // 🔥【关键修复】：严密监听云端握手状态，必须绿灯亮起才执行数据交换
    mpState.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[云端连接成功] 成功开通联机并行流信道: ${channelName}`);
        
        // 延迟注入横幅，确保 DOM 已经完全在视图里就绪
        setTimeout(() => {
          injectBannerIntoGuandan();
          
          if (!mpState.isHost) {
            console.log(`[客军就绪] 正在向房东下发带有安全确认的 PLAYER_JOIN 申请...`);
            // 确保信道链接完全通畅后，再发送报到数据，绝不丢包
            mpState.channel.send({
              type: 'broadcast',
              event: 'PLAYER_JOIN',
              payload: user
            });
          } else {
            console.log(`[房东就绪] 激活3分钟长航时真人群英会。房号: ${mpState.roomCode}`);
            startMatchCountdown();
            syncEngineNicknames();
          }
        }, 150);
      }
    });
  };

  // =========================================================================
  // ⏳ 3分钟时钟流转（带同步时间戳）
  // =========================================================================
  function startMatchCountdown() {
    if (mpState.uiRefreshTimer) return;
    mpState.countdownSeconds = 180;
    
    mpState.uiRefreshTimer = setInterval(() => {
      mpState.countdownSeconds--;
      if (mpState.countdownSeconds <= 0) {
        clearInterval(mpState.uiRefreshTimer);
        triggerAiBotFilling(); 
      }
      updateMpBannerText();
    }, 1000);
  }

  function triggerAiBotFilling() {
    if (!mpState.isHost || mpState.isGameStarted) return;
    
    const currentCount = mpState.seats.filter(Boolean).length;
    if (currentCount >= 4) return; 

    console.log(`[匹配超时] 真人未满员。智能AI托管切入战场...`);
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

    // 广播同步最新的状态：包含倒计时已结束、触发强开对局
    mpState.channel.send({
      type: 'broadcast',
      event: 'ROOM_SYNC',
      payload: { 
        seats: mpState.seats, 
        countdownSeconds: 0, 
        countdownOver: true, 
        triggerStart: true 
      }
    });

    syncEngineNicknames();
    checkAndStartGame(); 
  }

  // =========================================================================
  // 👥 席位确认与倒计时动态校准（解决不同步的关键）
  // =========================================================================
  function validSeat(seat) {
    return !!seat && typeof seat.uid === 'string' && seat.uid.length > 0 && seat.uid.length <= 128 &&
      typeof seat.nickname === 'string' && seat.nickname.length <= 128;
  }

  function handlePlayerJoin({ payload } = {}) {
    if (!mpState.channel || !validSeat(payload)) return false;
    if (mpState.isHost && !mpState.isGameStarted) {
      console.log(`[房东捕获新玩家] 玩家【${payload.nickname}】申请进入房间座位`);
      
      let existingIdx = mpState.seats.findIndex(s => s && s.uid === payload.uid);
      if (existingIdx === -1) {
        for (let i = 0; i < 4; i++) {
          if (!mpState.seats[i]) {
            mpState.seats[i] = { uid: payload.uid, nickname: payload.nickname, avatar: window.NobiAvatars?.safe(payload.avatar) || null };
            break;
          }
        }
      }
      
      const currentReady = mpState.seats.filter(Boolean).length;
      
      // 📡【重磅校准】：房东将当前自己桌面上最精确的【剩余秒数】打包，直接下发强灌给新来的客军！
      mpState.channel.send({
        type: 'broadcast',
        event: 'ROOM_SYNC',
        payload: { 
          seats: mpState.seats, 
          countdownSeconds: mpState.countdownSeconds, // 发送当前精准倒计时
          countdownOver: currentReady === 4, 
          triggerStart: currentReady === 4 
        }
      });

      syncEngineNicknames();

      if (currentReady === 4) {
        clearAllMatchTimers();
        checkAndStartGame();
      }
    }
  }

  function handleRoomSync({ payload } = {}) {
    if (!payload || !Array.isArray(payload.seats) || payload.seats.length !== 4 ||
        payload.seats.some(seat => seat !== null && !validSeat(seat)) ||
        !Number.isInteger(payload.countdownSeconds) || payload.countdownSeconds < 0 || payload.countdownSeconds > 180) return false;
    const user = getNetUser();
    if (!user) return false;
    console.log(`[客军同步成功] 收到来自房东的权威时间校准，当前剩余秒数: ${payload.countdownSeconds}s`);
    
    mpState.seats = payload.seats;
    
    // 💡【同步核心】：客军将自己的本地时钟，强行校准对齐房东发过来的时间戳
    mpState.countdownSeconds = payload.countdownSeconds;
    
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    
    // 如果客军本地没有开秒级刷新钟，帮他开起来，实现画面动态倒计时
    if (!mpState.uiRefreshTimer && !payload.countdownOver) {
      mpState.uiRefreshTimer = setInterval(() => {
        mpState.countdownSeconds--;
        if (mpState.countdownSeconds <= 0) clearInterval(mpState.uiRefreshTimer);
        updateMpBannerText();
      }, 1000);
    }

    if (payload.countdownOver) clearAllMatchTimers();
    syncEngineNicknames();

    // Only GAME_START installs the engine state; ROOM_SYNC never marks it active.
  }

  // =========================================================================
  // 渲染排版与原厂状态恢复（保持极简右上角形态）
  // =========================================================================
  function injectBannerIntoGuandan() {
    let parentContainer = document.getElementById('guandan-game-container') || document.getElementById('game-container') || document.querySelector('.game-board');
    if (!parentContainer) parentContainer = document.body;
    
    let banner = document.getElementById('guandan-inner-mp-banner') || document.createElement('div');
    banner.id = 'guandan-inner-mp-banner';
    parentContainer.appendChild(banner);
    
    Object.assign(banner.style, {
      position: 'absolute', top: '12px', right: '15px', left: 'auto', transform: 'none',
      padding: '6px 14px', background: 'rgba(15, 23, 42, 0.88)', border: '1px solid rgba(34, 197, 94, 0.6)',
      color: '#ffffff', borderRadius: '8px', fontSize: '12px', zIndex: '999999', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px'
    });
    updateMpBannerText();
  }

  function updateMpBannerText() {
    const banner = document.getElementById('guandan-inner-mp-banner');
    if (!banner) return;
    const count = mpState.seats.filter(Boolean).length;
    
    // 安全防止倒计时变成负数
    const showSeconds = Math.max(0, mpState.countdownSeconds);
    const mins = Math.floor(showSeconds / 60);
    const secs = showSeconds % 60;
    const timeStr = showSeconds > 0 ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : '0:00';

    let countdownHtml = showSeconds > 0 && count < 4
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
    });
    if (typeof window.renderGameBoard === 'function') window.renderGameBoard();
  }

  function checkAndStartGame() {
    if (!mpState.isGameStarted && mpState.seats.filter(Boolean).length === 4) {
      mpState.isGameStarted = true;
      const hands = window.GD.createNetworkDeal();

      mpState.channel.send({
        type: 'broadcast',
        event: 'GAME_START',
        payload: { hands: hands, seats: mpState.seats, hostTurn: 0 }
      });
      loadNetGameData(hands, 0);
    }
  }

  function handleGameStart({ payload } = {}) {
    if (mpState.isGameStarted || !payload || !Array.isArray(payload.seats) || payload.seats.length !== 4 || payload.seats.some(s => !validSeat(s))) return false;
    const user = getNetUser();
    if (!user) return false;
    mpState.seats = payload.seats;
    mpState.mySeatIndex = payload.seats.findIndex(s => s.uid === user.uid);
    loadNetGameData(payload.hands, payload.hostTurn);
    if (mpState.isGameStarted) clearAllMatchTimers();
    return mpState.isGameStarted;
  }

  function clearAllMatchTimers() {
    if (mpState.matchTimer) { clearTimeout(mpState.matchTimer); mpState.matchTimer = null; }
    if (mpState.uiRefreshTimer) { clearInterval(mpState.uiRefreshTimer); mpState.uiRefreshTimer = null; }
  }

  function loadNetGameData(hands, initialTurn) {
    const ok = window.GD?.startNetworkGame(hands, mpState.seats, mpState.mySeatIndex, initialTurn,
      action => {
        mpState.channel?.send({ type: 'broadcast', event: action.type, payload: { ...action, uid: mpState.seats[action.seat]?.uid } })
          .then(result => { if (result !== 'ok') console.error('[GD network] Delivery failed; rejoin required'); })
          .catch(() => console.error('[GD network] Delivery failed; rejoin required'));
      }, mpState.isHost);
    mpState.isGameStarted = !!ok;
    if (ok) syncEngineNicknames();
  }

  function handleNetAction(type, payload) {
    if (!payload || !mpState.isGameStarted || !Number.isInteger(payload.seat)) return false;
    const seat = mpState.seats[payload.seat];
    if (!seat || payload.uid !== seat.uid || (seat.isBot && !mpState.seats[0])) return false;
    return window.GD?.applyNetworkAction({ ...payload, type }) || false;
  }
  function handleNetPlayCards({ payload } = {}) { return handleNetAction('PLAY_CARDS', payload); }
  function handleNetPass({ payload } = {}) { return handleNetAction('PASS_TURN', payload); }

  GD_MP.stopNetMatch = function() {
    clearAllMatchTimers();
    if (mpState.channel) mpState.client?.removeChannel?.(mpState.channel);
    mpState.channel = null; mpState.isGameStarted = false;
    document.getElementById('guandan-inner-mp-banner')?.remove();
  };

  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    const roomLink = `${window.location.href.split('?')[0]}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    navigator.clipboard.writeText(roomLink).then(() => alert(`🎉 邀请链接已复制，快发给好友入局：\n${roomLink}`));
  };

  window.GD_MP = GD_MP;
})();
