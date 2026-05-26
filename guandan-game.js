/**
 * guandan-game.js (Version 4.5 - 终极自适应无缝无裁切版)
 * 掼蛋扑克游戏扩展包
 * 【彻底修复：27张牌全发满、手牌无滚动条一屏全显自适应、中心牌区不放大不裁切】
 */
(() => {
  'use strict';

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const LOBBY_ID = 'guandan-lobby-container';
  const STYLE_ID = 'gd-style';
  
  const GD_SUITS = [
    { key: 'S', symbol: GD_ICON_SUITS.SPADE, color: 'black' },
    { key: 'H', symbol: GD_ICON_SUITS.HEART, color: 'red' },
    { key: 'C', symbol: GD_ICON_SUITS.CLUB, color: 'black' },
    { key: 'D', symbol: GD_ICON_SUITS.DIAMOND, color: 'red' },
  ];
  
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const BASE_RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

  const SEATS = [
    { id: 0, name: '南家 (你)', short: 'South', team: 0, pos: 'bottom' },
    { id: 1, name: '东家', short: 'East', team: 1, pos: 'right' },
    { id: 2, name: '北家 (对家)', short: 'North', team: 0, pos: 'top' },
    { id: 3, name: '西家', short: 'West', team: 1, pos: 'left' },
  ];

  const state = {
    gameMode: 'SINGLE_PLAYER',
    currentRankIndex: 0, 
    currentTurn: 0,
    selected: new Set(),
    players: [],
    trick: null, 
    lastPlayedTrick: null, 
    timer: null,
    root: null,
    lobbyRoot: null,
    styleNode: null,
    active: false,
    busy: false,
    logs: [],
    cardsById: new Map(),
    listeners: [],
    aiDelay: 0,
    countdown: 20,
    clockTimer: null,
    touchStart: { x: 0, y: 0, time: 0 }
  };

  GD.state = state;

  const getCurrentRankStr = () => RANKS[state.currentRankIndex] || '2';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  
  // 采用更安全的唯一ID生成算法，确保108张牌ID绝对不碰撞
  let _idCounter = 0;
  const uid = () => `card_${Date.now()}_${++_idCounter}_${Math.random().toString(36).slice(2, 5)}`;
  
  function getCardValue(card) {
    if (card.kind === 'joker') return card.value;
    const curRankStr = getCurrentRankStr();
    if (card.rank === curRankStr) {
      return card.suit === 'H' ? 15.5 : 14.5; 
    }
    return BASE_RANK_VALUE[card.rank];
  }

  function sortCards(cards) {
    if (!cards) return [];
    return cards.slice().sort((a, b) => {
      const valA = getCardValue(a);
      const valB = getCardValue(b);
      return valA - valB || a.suit.localeCompare(b.suit);
    });
  }
  
  const rankLabel = (c) => c.kind === 'joker' ? c.label : c.rank;

  function on(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    state.listeners.push([target, type, handler, options]);
  }

  function offAll() {
    while (state.listeners.length) {
      const [target, type, handler, options] = state.listeners.pop();
      try { target.removeEventListener(type, handler, options); } catch (_) {}
    }
  }

  function playGDSound(type) {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;

    if (type === 'click') {
      o.type = 'sine'; o.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t); o.stop(t + 0.055); return;
    }
    if (type === 'pass') {
      o.type = 'sine'; o.frequency.setValueAtTime(400, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.start(t); o.stop(t + 0.09); return;
    }
  }

  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      /* ================= 全局重置与大厅样式 ================= */
      #${LOBBY_ID}, #${ROOT_ID} {
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
        user-select: none;
        -webkit-user-select: none;
        box-sizing: border-box;
      }
      #${LOBBY_ID} * , #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }

      /* 游戏大厅样式 */
      #${LOBBY_ID} {
        position: fixed;
        inset: 0;
        background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #fff;
        padding: 20px;
        z-index: 9998;
        overflow-y: auto;
      }
      .gd-lobby-window {
        width: 90%;
        max-width: 900px;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        text-align: center;
      }
      .gd-lobby-title {
        font-size: 32px;
        font-weight: 700;
        letter-spacing: 2px;
        background: linear-gradient(to right, #ffd700, #ffa500);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 10px;
      }
      .gd-lobby-subtitle { font-size: 14px; color: #a0aec0; margin-bottom: 30px; }
      .gd-lobby-players-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 35px; }
      .gd-lobby-player-card { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 15px; }
      .gd-lobby-avatar { font-size: 36px; margin-bottom: 10px; }
      .gd-lobby-pname { font-weight: bold; font-size: 16px; color: #e2e8f0; }
      .gd-lobby-pstatus { font-size: 12px; color: #34d399; margin-top: 5px; background: rgba(52, 211, 153, 0.1); padding: 2px 8px; border-radius: 10px; display: inline-block; }
      .gd-lobby-start-btn { background: linear-gradient(135deg, #ffd700 0%, #f59e0b 100%); color: #04140a; font-size: 18px; font-weight: bold; padding: 14px 50px; border: none; border-radius: 30px; cursor: pointer; box-shadow: 0 6px 20px rgba(245,158,11,0.4); }

      /* ================= 核心对局桌案样式 ================= */
      #${ROOT_ID} { 
        position: fixed; 
        inset: 0;
        width: 100vw; height: 100vh;
        height: -webkit-fill-available; height: 100dvh;
        z-index: 9999; 
        background: radial-gradient(circle at center, #165229 0%, #071c0e 100%); 
        color: #f5f7f4; 
        display: flex; 
        flex-direction: column; 
        overflow: hidden; 
        touch-action: manipulation;
      }
      
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; z-index: 1010; pointer-events: none; }
      .gd-header-info { background: rgba(0,0,0,0.75); padding: 6px 16px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.25); font-size: 13px; font-weight: bold; pointer-events: auto; }
      .gd-header-info span { color: #FFD700; margin: 0 4px; }
      .gd-exit-btn { background: linear-gradient(180deg, #ff5e5e 0%, #ce2b2b 100%); color: white; border: none; padding: 6px 14px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; pointer-events: auto; }
      
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      /* 座位框架 */
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; pointer-events: none; }
      .gd-seat.top { top: 35px; left: 50%; transform: translateX(-50%); } 
      .gd-seat.left { left: 20px; top: 40%; transform: translateY(-50%); }
      .gd-seat.right { right: 20px; top: 40%; transform: translateY(-50%); }
      .gd-seat.bottom { bottom: 0; left: 0; right: 0; width: 100%; display: flex; flex-direction: column; align-items: center; z-index: 100; overflow: visible; }
      
      /* 操作面板 */
      .gd-action-bar { display: none; gap: 16px; justify-content: center; height: 36px; margin-bottom: 4px; z-index: 105; pointer-events: auto; width: 100%; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: 1px solid rgba(255,255,255,0.15); padding: 0 24px; border-radius: 20px; font-weight: bold; font-size: 13px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.4); }
      .gd-btn-play { background: linear-gradient(180deg, #10b981 0%, #059669 100%); color: white; border-color: #34d399 !important; }
      .gd-btn-pass { background: linear-gradient(180deg, #64748b 0%, #475569 100%); color: white; }
      .gd-btn-sort { background: linear-gradient(180deg, #06b6d4 0%, #0db8d6 100%); color: white; }
      .gd-action-bar button:disabled { background: linear-gradient(180deg, #475569 0%, #1e293b 100%) !important; color: #94a3b8 !important; cursor: not-allowed; opacity: 0.35; }
      
      .gd-clock-panel { display: none; background: rgba(0,0,0,0.85); padding: 3px 12px; border-radius: 12px; border: 1px solid #10b981; margin-bottom: 4px; font-size: 12px; font-weight: bold; align-items: center; gap: 4px; color: #10b981; z-index: 104; }
      .gd-clock-panel.show { display: flex; }
      
      .gd-player-info { background: rgba(0,12,6,0.85); padding: 4px 10px; border-radius: 6px; text-align: center; min-width: 85px; border: 1px solid rgba(255,255,255,0.15); }
      .gd-player-info.active { border-color: #f59e0b; background: rgba(18,44,24,0.95); box-shadow: 0 0 12px #f59e0b; }
      .gd-player-name { font-weight: bold; font-size: 12px; color: #fff; }
      .gd-player-detail { font-size: 11px; color: #f59e0b; margin-top: 1px; font-weight: bold; }
      
      /* ================= 核心修复 1：出牌桌案中心区域（解耦隔离，防止放大与切断） ================= */
      .gd-center-table { 
        position: absolute; 
        width: 85vw; 
        height: 28vh; 
        max-width: 600px; 
        max-height: 150px; 
        top: 25%;
        border: 1px dashed rgba(255,215,0,0.15); 
        border-radius: 20px; 
        display: flex; 
        flex-direction: column; 
        justify-content: flex-start; 
        align-items: center; 
        background: rgba(0, 0, 0, 0.2); 
        padding: 6px 0; 
        pointer-events: none;
        z-index: 40;
        overflow: visible; 
      }
      
      .gd-center-status-bar { width: auto; background: rgba(0, 0, 0, 0.65); padding: 2px 12px; font-size: 11px; font-weight: bold; color: #94a3b8; border-radius: 12px; }
      .gd-center-status-bar.my-turn { color: #34d399; animation: gd-text-pulse 1.2s infinite alternate; }
      
      .gd-trick { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; flex: 1; position: relative; overflow: visible; }
      .gd-trick-cards-wrap { display: flex; justify-content: center; align-items: center; width: 100%; max-height: 80px; padding: 2px; overflow: visible; }
      .gd-trick-empty { font-size: 12px; color: rgba(255,255,255,0.15); font-weight: bold; margin-top: 15px; }
      .gd-trick-owner { color: #f59e0b; font-size: 11px; font-weight: bold; width: 100%; text-align: center; position: absolute; top: -4px; }
      
      /* 中心出牌专用独立样式，与通用卡牌彻底剥离，严禁继承放大 */
      .gd-trick-cards-wrap .gd-card-item { 
        width: 44px !important; 
        height: 62px !important; 
        margin-left: -26px !important; 
        flex-shrink: 0 !important;
        position: relative !important;
        transform: none !important;
        background: #fff;
        border-radius: 3px;
        box-shadow: -1px 2px 4px rgba(0,0,0,0.4);
        overflow: hidden;
      }
      .gd-trick-cards-wrap .gd-card-item:first-child { margin-left: 0 !important; }
      .gd-trick-cards-wrap .gd-card-item img { width: 100% !important; height: 100% !important; object-fit: contain !important; }

      /* ================= 核心修复 2：当前玩家手牌区域（单屏全显自适应，无滚动条） ================= */
      .gd-hand { 
        display: flex; 
        align-items: flex-end; 
        justify-content: center; 
        min-height: 135px; 
        height: 135px;
        width: 96vw; 
        max-width: 1000px;
        pointer-events: auto; 
        padding: 25px 5px 5px 5px; /* 顶部预留足够空间供卡牌弹起不被切断 */
        z-index: 110; 
        overflow-x: hidden !important; /* 斩断横向滚动条 */
        overflow-y: visible !important;  /* 允许卡牌向上物理弹出空间 */
      }
      
      /* 使用弹性伸缩基准：27张牌在一屏内极限压紧，牌越少自动伸展越宽 */
      .gd-hand .gd-card-item { 
        width: 66px; 
        height: 92px; 
        flex-shrink: 1; /* 激活Flex自动收缩核心功能 */
        position: relative; 
        margin-left: -49px; /* 初始重叠负边距 */
        transition: transform 0.1s ease-out;
        border-radius: 4px; 
        cursor: pointer; 
        transform-origin: bottom center; 
        touch-action: none;
        background: #fff;
        box-shadow: -2px 2px 5px rgba(0,0,0,0.3);
        overflow: hidden;
      }
      .gd-hand .gd-card-item:first-child { margin-left: 0 !important; }
      .gd-hand .gd-card-item img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
      
      /* 手牌高亮选中弹起 */
      .gd-hand .gd-card-item.sel { transform: translateY(-22px) !important; z-index: 999 !important; }
      .gd-hand .gd-card-item.sel img { filter: drop-shadow(0px 3px 8px rgba(245,158,11,0.85)); }
      
      .gd-wild-card img { filter: drop-shadow(0 0 5px #ef4444) !important; }
      .gd-rank-card img { filter: drop-shadow(0 0 4px #ffd700) !important; }
      
      .gd-toast { position: fixed; top: 18%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); border: 1px solid #f59e0b; color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 2000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
      
      /* 强制横屏适配引导 */
      @media screen and (orientation: portrait) { .gd-landscape-tips { display: flex !important; } }
      .gd-landscape-tips { display: none; position: fixed; inset: 0; width: 100vw; height: 100vh; background: #06140b; z-index: 100000; flex-direction: column; justify-content: center; align-items: center; color: #ffd700; text-align: center; padding: 20px; }
      .gd-landscape-tips-icon { font-size: 45px; margin-bottom: 16px; animation: gd-rotate-phone 2s infinite ease-in-out; }

      /* ================= 针对不同屏幕建立精确限定名，防止污染出牌区 ================= */
      @media screen and (min-width: 1024px) {
        .gd-hand { min-height: 155px; height: 155px; }
        .gd-hand .gd-card-item { width: 78px; height: 110px; margin-left: -58px; }
        .gd-hand .gd-card-item.sel { transform: translateY(-25px) !important; }
        .gd-center-table { max-width: 650px; max-height: 170px; top: 24%; }
      }

      @media screen and (max-height: 460px) {
        .gd-hand { min-height: 110px; height: 110px; padding-top: 18px; }
        .gd-hand .gd-card-item { height: 76px; width: 52px; margin-left: -40px; }
        .gd-hand .gd-card-item.sel { transform: translateY(-16px) !important; }
        .gd-center-table { top: 15%; height: 35vh; }
        .gd-seat.top { top: 15px; }
        .gd-action-bar { height: 32px; margin-bottom: 2px; }
        .gd-action-bar button { font-size: 11px; padding: 0 16px; }
      }

      @keyframes gd-rotate-phone { 0% { transform: rotate(0deg); } 50% { transform: rotate(-90deg); } 100% { transform: rotate(0deg); } }
      @keyframes gd-text-pulse { 0% { text-shadow: 0 0 2px rgba(52,211,153,0.3); } 100% { text-shadow: 0 0 8px rgba(52,211,153,0.8); } }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function createLobbyShell() {
    const lobby = document.createElement('div');
    lobby.id = LOBBY_ID;
    lobby.innerHTML = `
      <div class="gd-lobby-window">
        <h1 class="gd-lobby-title">♣ 经典淮安掼蛋大厅 ♦</h1>
        <p class="gd-lobby-subtitle">单屏丝滑自适应自平衡对局系统</p>
        <div class="gd-lobby-players-grid">
          <div class="gd-lobby-player-card"><div class="gd-lobby-avatar">👤</div><div class="gd-lobby-pname">南家 (你)</div><div class="gd-lobby-pstatus">就绪</div></div>
          <div class="gd-lobby-player-card"><div class="gd-lobby-avatar">🤖</div><div class="gd-lobby-pname">东家 (AI)</div><div class="gd-lobby-pstatus">就绪</div></div>
          <div class="gd-lobby-player-card"><div class="gd-lobby-avatar">🤝</div><div class="gd-lobby-pname">北家 (对家AI)</div><div class="gd-lobby-pstatus">就绪</div></div>
          <div class="gd-lobby-player-card"><div class="gd-lobby-avatar">🤖</div><div class="gd-lobby-pname">西家 (AI)</div><div class="gd-lobby-pstatus">就绪</div></div>
        </div>
        <button class="gd-lobby-start-btn" id="gd-lobby-start-trigger">开始匹配对局</button>
      </div>
    `;
    return lobby;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-landscape-tips" id="gd-landscape-tips">
        <div class="gd-landscape-tips-icon">🔄</div>
        <h3 style="font-size:16px;">请旋转手机至横屏模式</h3>
        <button id="gd-fullscreen-trigger" style="margin-top: 15px; padding: 6px 18px; background: #10b981; border:none; color:white; font-weight:bold; border-radius:15px; font-size:12px;">进入全屏对局</button>
      </div>

      <div class="gd-header">
        <div class="gd-header-info">当前主级: 打 <span data-gd-rank>${getCurrentRankStr()}</span> | 桌上牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>返回大厅</button>
      </div>
      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>
        
        <div class="gd-center-table">
          <div class="gd-center-status-bar" data-gd-center-status>等待开局...</div>
          <div class="gd-trick" data-gd-trick></div>
        </div>
        
        <div class="gd-seat bottom" data-gd-seat="0">
          <div class="gd-action-bar" data-gd-action-bar>
            <button class="gd-btn-pass" data-gd-pass>过 牌</button>
            <button class="gd-btn-play" data-gd-play>出 牌</button>
            <button class="gd-btn-sort" data-gd-sort>理 牌</button>
          </div>
          <div class="gd-clock-panel" data-gd-clock-panel><span data-gd-clock-time>20s</span></div>
          <div class="gd-player-wrap" data-gd-player-zone style="display:none;"></div>
          <div class="gd-hand" data-gd-hand></div>
        </div>
      </div>
      <div class="gd-toast" data-gd-toast></div>
    `;
    return root;
  }

  // 核心修复 3：重写洗牌算法，彻底解决只有25张牌的映射泄漏问题
  function makeDeck() {
    const deck = [];
    state.cardsById.clear(); // 清空旧全局字典，绝不复用引用
    
    for (let d = 0; d < 2; d++) {
      for (const suit of GD_SUITS) {
        for (const rank of RANKS) {
          const cardObj = { id: uid(), kind: 'normal', rank, suit: suit.key, symbol: suit.symbol, color: suit.color };
          deck.push(cardObj);
          state.cardsById.set(cardObj.id, cardObj);
        }
      }
      const joker1 = { id: uid(), kind: 'joker', label: '小王', rank: '小王', suit: 'J', symbol: '🃏', color: 'red', value: 16 };
      deck.push(joker1); state.cardsById.set(joker1.id, joker1);
      
      const joker2 = { id: uid(), kind: 'joker', label: '大王', rank: '大王', suit: 'J', symbol: '🃏', color: 'black', value: 17 };
      deck.push(joker2); state.cardsById.set(joker2.id, joker2);
    }
    
    // 经典的洗牌洗切
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function startCountdown() {
    clearInterval(state.clockTimer);
    state.countdown = 20;
    const clockPanel = state.root?.querySelector('[data-gd-clock-panel]');
    const clockTime = state.root?.querySelector('[data-gd-clock-time]');
    
    if (clockPanel && clockTime) {
      if (state.currentTurn === 0) {
        clockPanel.classList.add('show');
        clockTime.textContent = `${state.countdown}s`;
        state.clockTimer = setInterval(() => {
          state.countdown--;
          if (clockTime) clockTime.textContent = `${state.countdown}s`;
          if (state.countdown <= 0) {
            clearInterval(state.clockTimer);
            if (state.trick) passTurn(0); else {
              const me = state.players[0];
              if (me && me.hand.length) playCards(0, [sortCards(me.hand)[0]]);
            }
          }
        }, 1000);
      } else {
        clockPanel.classList.remove('show');
      }
    }
  }

  let finishOrder = [];

  function startNewRound() {
    const deck = makeDeck();
    finishOrder = [];
    state.players.forEach((p) => { p.hand = []; p.rankOutOrder = null; });
    
    // 物理分配：108张牌轮询完全派发给4人，每人精准分到27张，绝无遗漏
    deck.forEach((card, idx) => { 
      state.players[idx % 4].hand.push(card); 
    });
    
    state.players.forEach((p) => { p.hand = sortCards(p.hand); });
    
    state.selected.clear();
    state.trick = null;
    state.lastPlayedTrick = null; 
    state.currentTurn = 0; 
    state.aiDelay = performance.now() + 600;
    state.active = true;   
    state.busy = false;

    const rankNode = document.querySelector('[data-gd-rank]');
    if (rankNode) rankNode.textContent = getCurrentRankStr();
    
    renderTable();
    startCountdown();
  }

  function groupsByValue(cards) {
    const map = new Map();
    for (const c of cards) {
      const val = getCardValue(c);
      if (!map.has(val)) map.set(val, []);
      map.get(val).push(c);
    }
    return map;
  }

  function rankSeq(values) {
    const arr = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 1; i < arr.length; i++) if (arr[i] !== arr[i - 1] + 1) return false;
    return true;
  }

  function sameSuit(cards) {
    const s = cards[0]?.suit;
    return cards.every((c) => c.suit === s && c.kind !== 'joker');
  }

  function typeOf(cards) {
    const n = cards.length;
    if (!n) return null;
    
    const curRankStr = getCurrentRankStr();
    const wildCount = cards.filter(c => c.rank === curRankStr && c.suit === 'H').length;
    const values = cards.map(c => getCardValue(c));
    const grouped = groupsByValue(cards);
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    const allSame = counts.length === 1;

    if (n === 1) return { type: '单张', weight: values[0], size: 1 };
    if (n === 2 && (allSame || wildCount === 1)) return { type: '对子', weight: values[0], size: 2 };
    if (n === 3 && (allSame || wildCount >= 1)) return { type: '三张', weight: values[0], size: 3 };
    if (n >= 4 && (allSame || (counts.length <= 2 && wildCount >= 1))) return { type: '炸弹', weight: values[0] + n, size: n };
    if (n === 5 && rankSeq(values) && sameSuit(cards)) return { type: '同花顺', weight: values[0], size: 5 };
    if (n === 4 && cards.every((c) => c.kind === 'joker')) return { type: '天王炸', weight: 9999, size: 4 };
    if (n >= 5 && rankSeq(values) && values.every((v) => v < 16)) return { type: '顺子', weight: values[0], size: n };
    
    if (n >= 6 && n % 2 === 0 && [...grouped.values()].every((x) => x.length === 2)) {
      const pairVals = [...grouped.keys()].sort((a, b) => a - b);
      if (rankSeq(pairVals) && pairVals.every((v) => v < 16)) return { type: '连对', weight: pairVals[0], size: n };
    }
    if (n === 5) {
      const triple = [...grouped.entries()].find(([, x]) => x.length === 3);
      const pair = [...grouped.entries()].find(([, x]) => x.length === 2);
      if (triple && pair) return { type: '三带两', weight: Number(triple[0]), size: 5 };
    }
    return null;
  }

  function beats(next, prev) {
    if (next.type === '天王炸') return true;
    if (prev.type === '天王炸') return false;
    if (next.type === '炸弹' && prev.type !== '炸弹') return true;
    if (next.type === '炸弹' && prev.type === '炸弹') {
      if (next.size !== prev.size) return next.size > prev.size;
      return next.weight > prev.weight;
    }
    return next.type === prev.type && next.size === prev.size && next.weight > prev.weight;
  }

  // 格式化输出组件：统一打上 .gd-card-item 类名，以便进行分区样式隔离
  function formatCard(card) {
    const curRankStr = getCurrentRankStr();
    const isWild = card.rank === curRankStr && card.suit === 'H';
    const isNormalRank = card.rank === curRankStr && card.suit !== 'H';
    
    let extraClass = '';
    if (isWild) extraClass = 'gd-wild-card';
    else if (isNormalRank) extraClass = 'gd-rank-card';

    let suitName = '';
    if (card.suit === 'S') suitName = 'spades';
    if (card.suit === 'H') suitName = 'hearts';
    if (card.suit === 'C') suitName = 'clubs';
    if (card.suit === 'D') suitName = 'diamonds';

    let rankName = card.rank.toLowerCase();
    if (rankName === 'a') rankName = 'ace';
    if (rankName === 'j') rankName = 'jack';
    if (rankName === 'q') rankName = 'queen';
    if (rankName === 'k') rankName = 'king';

    let imgUrl = '';
    if (card.kind === 'joker') {
      imgUrl = `./images/cards/${card.label === '大王' ? 'red' : 'black'}_joker.png`;
    } else {
      imgUrl = `./images/cards/${rankName}_of_${suitName}.png`;
    }

    return `
      <div class="gd-card-item ${extraClass}" data-card-id="${card.id}">
        <img src="${imgUrl}" alt="${rankLabel(card)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2285%22><rect width=%22100%%22 height=%22100%%22 fill=%22white%22 stroke=%22%23ccc%22/><text x=%2250%%22 y=%2250%%22 font-size=%2212%22 font-weight=%22bold%22 fill=%22%23333%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>${rankLabel(card)}</text></svg>'" />
      </div>`;
  }

  function renderSeats() {
    if (!state.root) return;
    SEATS.forEach((seat, idx) => {
      const seatNode = (idx === 0) 
        ? state.root.querySelector('[data-gd-player-zone]')
        : state.root.querySelector(`[data-gd-seat="${idx}"]`);
        
      if (!seatNode) return;
      const p = state.players[idx];
      if (!p) return;
      
      const isActive = state.currentTurn === idx && state.active;
      const cardCount = p.hand ? p.hand.length : 0;
      
      let rankString = '';
      if (p.rankOutOrder === 1) rankString = '🥇头游';
      else if (p.rankOutOrder === 2) rankString = '二游';
      else if (p.rankOutOrder === 3) rankString = '三游';
      else rankString = `剩 ${cardCount} 张`;

      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">${rankString}</div>
        </div>`;
    });

    const centerStatus = state.root.querySelector('[data-gd-center-status]');
    if (centerStatus && state.active) {
      const activePlayer = state.players[state.currentTurn];
      if (activePlayer) {
        centerStatus.className = 'gd-center-status-bar';
        if (state.currentTurn === 0) {
          centerStatus.classList.add('my-turn');
          centerStatus.textContent = `到你出牌 (上划或右击可直接出牌)`;
        } else {
          centerStatus.classList.add('ai-turn');
          centerStatus.textContent = `等待 [ ${activePlayer.name} ]...`;
        }
      }
    }
  }

  function renderTable() {
    const root = document.getElementById(ROOT_ID) || state.root;
    if (!root) return; 
    
    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    if (trick) {
      if (state.lastPlayedTrick) {
        const pName = state.players[state.lastPlayedTrick.seat]?.name || '未知';
        const cardsHTML = state.lastPlayedTrick.cards.map(formatCard).join('');
        
        trick.innerHTML = `
          <div class="gd-trick-owner">✦ ${pName} 出牌 ✦</div>
          <div class="gd-trick-cards-wrap" style="margin-top:12px;">${cardsHTML}</div>
        `;
        if (move) move.textContent = `${pName}：${state.lastPlayedTrick.type}`;
      } else {
        trick.innerHTML = `<span class="gd-trick-empty">暂无出牌，首头发牌</span>`;
        if (move) move.textContent = '—';
      }
    }

    const me = state.players[0];
    if (hand && me && me.hand) {
      hand.innerHTML = sortCards(me.hand).map(formatCard).join('');
      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
      });
    }

    if (actionBar && me && me.hand) {
      if (state.currentTurn === 0 && me.hand.length > 0 && state.active) {
        actionBar.classList.add('show');
        const playBtn = root.querySelector('[data-gd-play]');
        const passBtn = root.querySelector('[data-gd-pass]');
        if (playBtn) playBtn.disabled = state.selected.size === 0;
        if (passBtn) passBtn.disabled = !state.trick; 
      } else {
        actionBar.classList.remove('show');
      }
    }
  }

  function showToast(msg) {
    const toastNode = document.querySelector('[data-gd-toast]');
    if (toastNode) {
      toastNode.textContent = msg; toastNode.style.opacity = '1';
      clearTimeout(state._toastTimer);
      state._toastTimer = setTimeout(() => { toastNode.style.opacity = '0'; }, 1500);
    }
  }

  function findNextTurn(current) {
    let next = current;
    for (let i = 0; i < 4; i++) {
      next = (next + 1) % 4;
      if (state.players[next].hand.length > 0) return next;
    }
    return current; 
  }

  function playCards(seat, cards) {
    if (!state.active) return false;
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    
    state.trick = { ...move, cards, seat };
    state.lastPlayedTrick = state.trick; 
    state.selected.clear();
    
    if (player.hand.length === 0) {
      if (!finishOrder.includes(seat)) {
        finishOrder.push(seat);
        player.rankOutOrder = finishOrder.length;
      }
      showToast(`👏 ${player.name} 已跑光！`);
    }
    
    if (checkGameOver()) return true;

    let nextTurn = findNextTurn(seat);
    if (state.trick && (state.trick.seat === nextTurn || state.players[state.trick.seat].hand.length === 0)) {
      state.trick = null; 
    }

    state.currentTurn = nextTurn;
    state.aiDelay = performance.now() + 600;
    renderTable();
    startCountdown();
    return true;
  }

  function passTurn(seat) {
    if (!state.active) return;
    let nextTurn = findNextTurn(seat);
    
    if (state.trick && state.trick.seat === nextTurn) state.trick = null; 
    if (state.trick && state.players[state.trick.seat].hand.length === 0) {
      if (nextTurn === state.trick.seat) {
        state.trick = null;
        nextTurn = findNextTurn(nextTurn);
      }
    }

    state.currentTurn = nextTurn;
    playGDSound('pass');
    renderTable();
    startCountdown();
  }

  function checkGameOver() {
    const team0Alive = state.players[0].hand.length > 0 || state.players[2].hand.length > 0;
    const team1Alive = state.players[1].hand.length > 0 || state.players[3].hand.length > 0;
    const aliveCount = state.players.filter(p => p.hand.length > 0).length;

    if (!team0Alive || !team1Alive || aliveCount <= 1) {
      state.active = false;
      clearInterval(state.clockTimer);

      const firstSeat = finishOrder[0] !== undefined ? finishOrder[0] : 0;
      const isTeam0Win = (firstSeat === 0 || firstSeat === 2);
      let levelGained = 0;
      let winMsg = "";

      if (isTeam0Win) {
        const eastOut = state.players[1].hand.length === 0;
        const westOut = state.players[3].hand.length === 0;
        if (!eastOut && !westOut) {
          levelGained = 3; winMsg = `🎉 完胜！南北同盟达成了【双下】！`;
        } else if (state.players[0].rankOutOrder === 1 && state.players[2].rankOutOrder === 2) {
          levelGained = 3; winMsg = `🎉 包揽前两名！连升 3 级！`;
        } else {
          levelGained = 2; winMsg = `👍 获胜！主级提升 2 级！`;
        }
        state.currentRankIndex = Math.min(RANKS.length - 1, state.currentRankIndex + levelGained);
      } else {
        winMsg = `💔 局势失守！东西同盟赢下对局。`;
      }

      setTimeout(() => {
        alert(`${winMsg}\n下一局主级：打 ${getCurrentRankStr()}`);
        startNewRound();
      }, 500);
      return true;
    }
    return false;
  }

  function bestOpening(hand) {
    const sorted = sortCards(hand);
    const byValue = groupsByValue(sorted);
    const pair = [...byValue.values()].find(g => g.length === 2);
    if (pair) return pair;
    return [sorted[0]];
  }

  function chooseFollowMove(hand, last) {
    const sorted = sortCards(hand);
    const byValue = [...groupsByValue(sorted).entries()].sort((a, b) => a[0] - b[0]);
    if (!last) return bestOpening(sorted);
    
    if (last.type === '单张' || last.type === '对子' || last.type === '三张') {
      for (const [v, g] of byValue) { 
        if (v > last.weight && g.length >= last.size) return g.slice(0, last.size); 
      }
    }
    if (last.type !== '炸弹') {
      const bomb = byValue.find(([, g]) => g.length >= 4);
      if (bomb) return bomb[1].slice(0, 4);
    }
    return null;
  }

  function triggerAIMove() {
    if (!state.active || state.busy || state.currentTurn === 0) return;
    if (performance.now() < state.aiDelay) return;
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      if (!player || player.hand.length === 0) { passTurn(seat); return; }
      const choice = state.trick ? chooseFollowMove(player.hand, state.trick) : bestOpening(player.hand);
      if (choice && choice.length) playCards(seat, choice); else passTurn(seat);
    } finally {
      state.busy = false;
    }
  }

  function humanPlay() {
    if (state.currentTurn !== 0 || !state.active) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    if (!cards.length) return showToast('请先点选卡牌');
    const move = typeOf(cards);
    if (!move) return showToast('不符合出牌规则');
    if (state.trick && !beats(move, state.trick)) return showToast('不够大，压不住桌上的牌');
    playCards(0, cards);
  }

  function executeFullscreen(element) {
    if (!element) return;
    try {
      if (element.requestFullscreen) { element.requestFullscreen(); }
      else if (element.webkitRequestFullscreen) { element.webkitRequestFullscreen(); }
    } catch (e) { console.warn(e); }
  }

  function bindHandInteraction() {
    const container = document.getElementById(ROOT_ID);
    const hand = container?.querySelector('[data-gd-hand]');
    const fsBtn = container?.querySelector('#gd-fullscreen-trigger');
    if (!hand) return;

    if (fsBtn) {
      on(fsBtn, 'click', (e) => {
        e.stopPropagation(); executeFullscreen(container);
      });
    }

    on(hand, 'touchstart', (e) => {
      const touch = e.touches[0];
      state.touchStart.x = touch.clientX;
      state.touchStart.y = touch.clientY;
      state.touchStart.time = Date.now();
    }, { passive: true });

    on(hand, 'touchend', (e) => {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - state.touchStart.x;
      const deltaY = touch.clientY - state.touchStart.y;
      const duration = Date.now() - state.touchStart.time;

      if (deltaY < -25 && Math.abs(deltaX) < 50 && duration < 300) {
        const cardDOM = e.target.closest('.gd-card-item');
        if (cardDOM && state.currentTurn === 0 && state.active) {
          const id = cardDOM.getAttribute('data-card-id');
          if (id) state.selected.add(id);
        }
        humanPlay();
        return;
      }

      if (Math.abs(deltaY) < 6 && Math.abs(deltaX) < 6) {
        const cardDOM = e.target.closest('.gd-card-item');
        if (!cardDOM || state.currentTurn !== 0 || !state.active) return;
        const id = cardDOM.getAttribute('data-card-id');
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        playGDSound('click');
        renderTable();
      }
    });

    on(hand, 'click', (e) => {
      if (e.pointerType === 'touch') return; 
      const cardDOM = e.target.closest('.gd-card-item');
      if (!cardDOM || state.currentTurn !== 0 || !state.active) return;
      const id = cardDOM.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });

    on(hand, 'contextmenu', (e) => {
      e.preventDefault(); 
      if (state.currentTurn !== 0 || !state.active) return;
      const cardDOM = e.target.closest('.gd-card-item');
      if (cardDOM) {
        const id = cardDOM.getAttribute('data-card-id');
        if (id && !state.selected.has(id)) state.selected.add(id); 
      }
      renderTable();
      humanPlay();
    });
  }

  function destroy() {
    clearInterval(state.timer);
    clearInterval(state.clockTimer);
    state.active = false; offAll();
    if (state.root) state.root.remove();
    state.root = null;
    if (state.styleNode) state.styleNode.remove();
    state.styleNode = null;
    if (state.lobbyRoot) state.lobbyRoot.style.display = 'flex';
  }

  function initGameMatch() {
    if (state.lobbyRoot) state.lobbyRoot.style.display = 'none';
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);
    if (state.clockTimer) clearInterval(state.clockTimer);

    injectResponsiveStyles(); 

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 
    state.players = SEATS.map((seat) => ({ ...seat, hand: [], rankOutOrder: null }));
    
    executeFullscreen(newShell);

    setTimeout(() => {
      startNewRound();
      bindHandInteraction();
      
      const playBtn = newShell.querySelector('[data-gd-play]');
      const passBtn = newShell.querySelector('[data-gd-pass]');
      const sortBtn = newShell.querySelector('[data-gd-sort]');
      const exitBtn = newShell.querySelector('[data-gd-exit]');

      if (playBtn) on(playBtn, 'click', () => { playGDSound('click'); humanPlay(); });
      if (passBtn) on(passBtn, 'click', () => { playGDSound('click'); if(state.trick) passTurn(0); });
      if (sortBtn) on(sortBtn, 'click', () => { playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); });
      if (exitBtn) on(exitBtn, 'click', () => { playGDSound('click'); destroy(); });

      state.timer = setInterval(triggerAIMove, 200);
    }, 80);
  }

  function init() {
    injectResponsiveStyles();
    let lobby = document.getElementById(LOBBY_ID);
    if (!lobby) {
      lobby = createLobbyShell();
      document.body.appendChild(lobby);
    }
    state.lobbyRoot = lobby;
    state.lobbyRoot.style.display = 'flex';

    const matchBtn = lobby.querySelector('#gd-lobby-start-trigger');
    if (matchBtn) matchBtn.onclick = (e) => { e.preventDefault(); initGameMatch(); };
  }
  
  function secureBindLaunch() {
    init();
    document.addEventListener('click', (e) => {
      if (e.target.closest('#go-guandan-btn')) { e.preventDefault(); init(); }
    });
  }

  Object.assign(GD, { init, destroy, startNewRound, initGameMatch });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', secureBindLaunch, { once: true });
  } else {
    secureBindLaunch();
  }
})();