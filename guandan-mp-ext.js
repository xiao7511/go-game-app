/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 独立游戏主界面内聚联机引擎（精修优化版）
 * 1. 界面内聚：房间号面板与复制链接直接嵌入掼蛋游戏主 DOM 容器中，不污染大厅和围棋。
 * 2. 昵称打通：动态覆盖原厂 Canvas 和 DOM 的 4 人座次昵称，告别“电脑代打”。
 * 3. 路由重塑：生成标准全环境自愈链接，确保好友点击时能无缝拉起游戏。
 */
(() => {
  'use strict';

  const GD_MP = (window.GD_MP = window.GD_MP || {});
  
  const mpState = {
    client: null,
    channel: null,
    roomCode: null,
    mySeatIndex: -1, // 0: 南(我), 1: 东, 2: 北, 3: 西
    seats: [null, null, null, null], 
    isHost: false,
    currentTurnSeat: 0,
    lastValidPlay: null
  };

  function getNetUser() {
    if (window.state && window.state.uid) {
      return { uid: window.state.uid, nickname: window.state.userNickname || '我' };
    }
    // 兼容主控舱未登录状态下的兜底昵称获取
    const rawState = window.state || {};
    const localNickname = rawState.userNickname || localStorage.getItem('user_nickname');
    if (localNickname) return { uid: rawState.uid || 'net_u', nickname: localNickname };
    
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
  // 🚀 联机直连入口（房东/客军双轨驱动）
  // =========================================================================
  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (!initMpClient()) {
      alert("Supabase Realtime 网关未就绪，请检查网络！");
      return;
    }

    if (window.state) window.state.gameMode = 'NET_BATTLE';

    // 1. 优先唤醒并拉起原厂掼蛋主战场画布与容器
    if (window.GD && typeof window.GD.initGameMatch === 'function') {
      window.GD.initGameMatch(); 
    } else if (window.GD && typeof window.GD.init === 'function') {
      window.GD.init();
    }

    // 隐蔽原有的二级大厅选择器
    const rawLobby = document.getElementById('guandan-lobby-container');
    if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');

    const user = getNetUser();
    
    if (targetRoomCode) {
      mpState.roomCode = targetRoomCode;
      mpState.isHost = false;
      console.log(`[掼蛋联机] 正在作为客军申请接入房间: ${mpState.roomCode}`);
    } else {
      mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
      mpState.isHost = true;
      mpState.seats[0] = user;
      mpState.mySeatIndex = 0;
      console.log(`[掼蛋联机] 正在作为房东创建房间: ${mpState.roomCode}`);
    }

    // 2. 建立房间独占实时流信道
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
        // 🔒【内聚嵌入】：将面板精准嵌入到掼蛋游戏主界面内
        injectBannerIntoGuandan();

        if (!mpState.isHost) {
          // 客军入局：向房东广播自己的个人资产昵称
          mpState.channel.send({
            type: 'broadcast',
            event: 'PLAYER_JOIN',
            payload: user
          });
        } else {
          // 房东侧：500ms后自动用带有高辨识度昵称的AI进行占位以便调试测试
          setTimeout(() => {
            if (mpState.seats.filter(Boolean).length < 4) {
              handlePlayerJoin({ payload: { uid: 'p_east', nickname: '江阴二少 ✦' } });
              handlePlayerJoin({ payload: { uid: 'p_north', nickname: '南京雀圣 ✦' } });
              handlePlayerJoin({ payload: { uid: 'p_west', nickname: '苏州阿福 ✦' } });
            }
          }, 600);
        }
      }
    });
  };

  // =========================================================================
  // 🔗 完美直连路由链接构建
  // =========================================================================
  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    
    // 清除已有URL参数，构建无污染带有掼蛋联机特征的动态分享链接
    const currentUrl = window.location.href.split('?')[0];
    const roomLink = `${currentUrl}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomLink).then(() => {
        alert(`🎉 掼蛋联机房间链接已复制！\n好友点击即可直接加入对战：\n\n${roomLink}`);
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
    alert(`🎉 掼蛋联机房间链接已成功复制：\n\n${text}`);
  }

  // =========================================================================
  // 👥 联机席位管理与昵称深度同步穿透
  // =========================================================================
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
      syncEngineNicknames();
      checkAndStartGame();
    }
  }

  function handleRoomSync({ payload }) {
    mpState.seats = payload.seats;
    const user = getNetUser();
    mpState.mySeatIndex = mpState.seats.findIndex(s => s && s.uid === user.uid);
    syncEngineNicknames();
  }

  /**
   * 🎨【重要修复】：将多端联机回传的真实玩家昵称同步刷新至掼蛋游戏的主战场中
   */
  function syncEngineNicknames() {
    updateMpBannerText();
    
    // 映射掼蛋相对视角座次：0南(我)，1东(下家)，2北(对家)，3西(上家)
    const seatPositions = ['south', 'east', 'north', 'west'];
    
    seatPositions.forEach((pos, idx) => {
      const playerObj = mpState.seats[idx];
      const targetName = playerObj ? playerObj.nickname : (idx === mpState.mySeatIndex ? '我' : '等待加入...');
      
      // 1. 穿透注入原厂 DOM 昵称标签组件
      const domNameTag = document.querySelector(`.player-info.${pos} .name`) || 
                         document.getElementById(`gd-player-name-${pos}`);
      if (domNameTag) {
        domNameTag.innerText = targetName;
        domNameTag.style.color = '#22c55e';
        domNameTag.style.fontWeight = 'bold';
      }

      // 2. 强行灌入原厂核心状态机（以便游戏底层的 Canvas 重新 renderGameBoard 时能抓取到正确的玩家名字）
      if (window.state) {
        if (!window.state.playerNames) window.state.playerNames = {};
        window.state.playerNames[pos] = targetName;
      }
    });

    // 强行刷一次画布更新，将新玩家的昵称印在画板上
    if (typeof window.renderGameBoard === 'function') {
      window.renderGameBoard();
    }
  }

  function checkAndStartGame() {
    const readyPlayers = mpState.seats.filter(Boolean).length;
    if (readyPlayers === 4) {
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
  // 📌 测独立主界面专属节点挂载核心
  // =========================================================================
  function injectBannerIntoGuandan() {
    // 强制清洗任何可能游离在外部的旧横幅
    const oldGlobalBanner = document.getElementById('gd-mp-status-banner');
    if (oldGlobalBanner) oldGlobalBanner.remove();

    // 抓取掼蛋游戏本身的 DOM 包装大容器
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
    
    // 只绑定在掼蛋界面内部绝对定位，不再污染主控舱或围棋页面
    Object.assign(banner.style, {
      position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', background: 'rgba(20, 83, 45, 0.95)', border: '2px solid #22c55e',
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
    
    banner.innerHTML = `
      <span>♣️ 掼蛋联机对战房: <strong style="color:#22c55e; font-size:16px;">${mpState.roomCode || '分发中...'}</strong></span>
      <span style="color:rgba(255,255,255,0.4);">|</span>
      <span>当前在线: <strong>${count}/4</strong> 人</span>
      <button onclick="window.GD_MP.copyRoomLink()" style="margin-left:5px; padding:5px 14px; background:#22c55e; color:#fff; border:none; border-radius:15px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">🔗 复制分享链接</button>
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