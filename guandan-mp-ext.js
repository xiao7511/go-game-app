/**
 * Modified Date: 2026-05-31
 * Description: 江苏掼蛋 - 强力一键穿透直连联机引擎扩展包（动态复制链接版）
 * 1. 物理刺穿：大厅点击“进入联机版”直调本模块，自动强拉原生 Canvas 战场，跳过二级大厅。
 * 2. 房间链接：看板集成一键复制专属动态对战 URL 链接，支持外部好友点击一键入局。
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
  // 🚀 主控舱核心直连入口（支持传入已有房间号）
  // =========================================================================
  GD_MP.startNetMatch = async function(targetRoomCode = null) {
    if (!initMpClient()) {
      alert("Supabase 联机组件未就绪，请检查网络配置或重新登录！");
      return;
    }

    console.log("[掼蛋联机] 正在一键穿透启动网络匹配...");
    
    if (window.state) {
      window.state.gameMode = 'NET_BATTLE';
    }

    // 强行提前唤醒并拉起原厂掼蛋的 Canvas 游戏主战场环境
    if (window.GD && typeof window.GD.initGameMatch === 'function') {
      window.GD.initGameMatch(); 
    } else if (window.GD && typeof window.GD.init === 'function') {
      window.GD.init();
    }

    const rawLobby = document.getElementById('guandan-lobby-container');
    if (rawLobby) rawLobby.style.setProperty('display', 'none', 'important');

    const user = getNetUser();
    
    // 💡 解析是创建房间还是加入他人房间
    if (targetRoomCode) {
      mpState.roomCode = targetRoomCode;
      mpState.isHost = false;
      console.log(`[掼蛋联机] 正在作为客军潜入房间: ${mpState.roomCode}`);
    } else {
      mpState.roomCode = 'GD' + Math.floor(1000 + Math.random() * 9000);
      mpState.isHost = true;
      mpState.seats[0] = user;
      mpState.mySeatIndex = 0;
      console.log(`[掼蛋联机] 正在作为房东开辟新对局，房间号: ${mpState.roomCode}`);
    }

    // 建立云端信道
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
        injectMpBanner();

        if (!mpState.isHost) {
          // 如果是客人，自发向房东发送“申请入座”广播
          mpState.channel.send({
            type: 'broadcast',
            event: 'PLAYER_JOIN',
            payload: user
          });
        } else {
          // 房东本地调试：若无真人可在 500ms 后自动用模拟高手填满空位测试
          setTimeout(() => {
            if (mpState.seats.filter(Boolean).length < 4) {
              handlePlayerJoin({ payload: { uid: 'player_east', nickname: '江阴二少' } });
              handlePlayerJoin({ payload: { uid: 'player_north', nickname: '南京雀圣' } });
              handlePlayerJoin({ payload: { uid: 'player_west', nickname: '苏州阿福' } });
            }
          }, 800);
        }
      }
    });
  };

  // 生成当前对局链接并写入剪贴板
  GD_MP.copyRoomLink = function() {
    if (!mpState.roomCode) return;
    // 构建标准的直通车动态 URL，带有 room 参数
    const baseUrl = window.location.origin + window.location.pathname;
    const roomLink = `${baseUrl}?game=guandan&mode=NET&room=${mpState.roomCode}`;
    
    navigator.clipboard.writeText(roomLink).then(() => {
      alert(`🎉 掼蛋联机链接复制成功！去发给好友吧：\n${roomLink}`);
    }).catch(() => {
      // 兼容性降级输入框复制
      const input = document.createElement('input');
      input.value = roomLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert(`🎉 链接已生成，快去分享：\n${roomLink}`);
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
    injectMpBanner(); 
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

  // =========================================================================
  // 🎨 【看板升级】：注入支持交互的一键复制链接按钮
  // =========================================================================
  function injectMpBanner() {
    let banner = document.getElementById('gd-mp-status-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'gd-mp-status-banner';
      document.body.appendChild(banner);
    }
    
    Object.assign(banner.style, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      padding: '12px 28px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '2px solid #10b981', color: '#10b981', borderRadius: '40px', fontSize: '15px',
      zIndex: '2147483647', boxShadow: '0 10px 30px rgba(16,185,129,0.4)', fontWeight: '800',
      textAlign: 'center', letterSpacing: '0.5px'
    });
    
    updateMpBannerText();
  }

  function updateMpBannerText() {
    const banner = document.getElementById('gd-mp-status-banner');
    if (!banner) return;
    const count = mpState.seats.filter(Boolean).length;
    
    banner.innerHTML = `
      📡 掼蛋房间号: <span style="color:#ffffff; font-size:18px; text-shadow: 0 0 10px #10b981;">${mpState.roomCode || '⏱️...'}</span> 
      | 席位: <span style="color:#ffffff">${count}/4</span>人
      <button onclick="window.GD_MP.copyRoomLink()" style="margin-left:15px; padding:4px 12px; background:#10b981; color:#fff; border:none; border-radius:15px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition:all 0.2s;">🔗 复制邀请链接</button>
    `;
  }

  function updateTurnUiVisual() {
    const isMyTurn = (mpState.mySeatIndex === mpState.currentTurnSeat);
    const actionPanel = document.querySelector('.action-panel');
    if (actionPanel) actionPanel.style.setProperty('display', isMyTurn ? 'flex' : 'none', 'important');
  }

  function showNetOppenentAction(seatIndex, cards) {
    if (seatIndex === mpState.mySeatIndex) return;
    let name = mpState.seats[seatIndex] ? mpState.seats[seatIndex].nickname : `对手 ${seatIndex}`;
    alert(`【${name}】${cards ? '出牌：' + cards.map(c=>c.rank).join(',') : '不要，过牌！'}`);
  }

  window.GD_MP = GD_MP;

})();