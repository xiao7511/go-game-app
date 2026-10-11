/**
 * guandan-game.js (Version 5.0 - 大厅美化与交互跃升旗舰版)
 * 掼蛋扑克游戏扩展包
 * 【功能全面升级：蓝白重叠牌背、移动端手牌比例修复、多模态智能理牌、全新模式选择舱】
 */
(() => {
  'use strict';

  // ===== 全局静态常量与配置 =====
  const CARD_W = 74; 
  const TURN_SECONDS = 30; // Local turn timer shown to the player.
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

  // 【优化：获取动态登录用户昵称】
  function getUserNickname() {
    return window.state?.userNickname || window.USER_NICKNAME || localStorage.getItem('username') || localStorage.getItem('nickname') || '南家 (你)';
  }

  const SEATS = [
    { id: 0, name: getUserNickname(), short: 'South', team: 0, pos: 'bottom' },
    { id: 1, name: '东家 (AI)', short: 'East', team: 1, pos: 'right' },
    { id: 2, name: '北家 (对家AI)', short: 'North', team: 0, pos: 'top' },
    { id: 3, name: '西家 (AI)', short: 'West', team: 1, pos: 'left' },
  ];

  const state = {
    gameMode: 'SINGLE_PLAYER', // SINGLE_PLAYER 或 NET_BATTLE
    selectedGame: 'guandan',   // 当前在大厅选中的游戏
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
    countdown: TURN_SECONDS,
    clockTimer: null,
    clockKey: null,
    countdownCue: null,
    turnDeadline: null,
    bombKey: null,
    bombTimer: null,
    touchStart: { x: 0, y: 0, time: 0 },
    sortMode: 0, // 0:常规大小, 1:同花优先, 2:炸弹张数优先 (需求7)
    teamLevels: [0, 0], // Local/legacy series level per team (South-North, East-West); not rated.
    roundNumber: 1,
    playedCards: new Map(), // Public cards seen played in the current deal, used by the card counter.
    seatActions: [null, null, null, null], // Last visible action per seat (played type / 不出).
    seatTips: [null, null, null, null], // Short-lived prompts shown in front of a seat.
    hoverCardId: null,
    counterKey: null
  };

  GD.state = state;

  const getCurrentRankStr = () => RANKS[state.currentRankIndex] || '2';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = !window.NobiAudio && AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
  function getCardValue(card) {
    if(state.standardMode&&state.standardRules)return state.standardRules.cardWeight(card,getCurrentRankStr());
    if (card.kind === 'joker') return card.value;
    const curRankStr = getCurrentRankStr();
    if (card.rank === curRankStr) {
      return card.suit === 'H' ? 15.5 : 14.5; 
    }
    return BASE_RANK_VALUE[card.rank];
  }

  // ===== 【需求7：智能多维度理牌排列逻辑】 =====
  function sortCards(cards) {
    if (!cards || cards.length === 0) return [];
    
    // 基础大小排序母版
    const baseSorted = cards.slice().sort((a, b) => {
      const valA = getCardValue(a);
      const valB = getCardValue(b);
      return valA - valB || a.suit.localeCompare(b.suit) || (a.deck??0)-(b.deck??0) || a.id.localeCompare(b.id);
    });

    if (state.sortMode === 1) {
      // 维度1：同花/同花顺优先聚拢排序
      return baseSorted.sort((a, b) => a.suit.localeCompare(b.suit) || getCardValue(a) - getCardValue(b));
    } else if (state.sortMode === 2) {
      // 维度2：炸弹/张数高频组合优先排在前面
      const counts = {};
      cards.forEach(c => { const v = getCardValue(c); counts[v] = (counts[v] || 0) + 1; });
      return cards.slice().sort((a, b) => {
        const countA = counts[getCardValue(a)] || 0;
        const countB = counts[getCardValue(b)] || 0;
        if (countA !== countB) return countB - countA; // 张数多的排前面
        return getCardValue(a) - getCardValue(b);
      });
    }
    
    // 维度0：标准经典大小排序
    return baseSorted;
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
    if (window.NobiAudio) { window.NobiAudio.playEffect(type); return; }
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

  // ===== 【需求1, 2, 6：响应式精调与蓝白重叠样式注入】 =====
  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      /* ================= 全局重置与全新大厅航站舱 ================= */
      #${LOBBY_ID}, #${ROOT_ID} {
        font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif;
        user-select: none;
        -webkit-user-select: none;
        box-sizing: border-box;
      }
      #${LOBBY_ID} * , #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }

      #${LOBBY_ID} {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, #111e2e 0%, #060b14 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #fff;
        padding: 20px;
        z-index: 9998;
        overflow-y: auto;
      }
      .gd-lobby-container-box {
        width: 95%;
        max-width: 1000px;
        background: rgba(20, 35, 55, 0.6);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 40px;
        box-shadow: 0 30px 70px rgba(0,0,0,0.8);
      }
      .gd-lobby-header-zone {
        text-align: center;
        margin-bottom: 35px;
      }
      .gd-lobby-main-title {
        font-size: 38px;
        font-weight: 800;
        background: linear-gradient(to right, #6ee7b7, #3b82f6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 8px;
        letter-spacing: 2px;
      }
      .gd-lobby-welcome-tag {
        font-size: 14px;
        color: #94a3b8;
      }
      .gd-lobby-welcome-tag span {
        color: #3b82f6;
        font-weight: bold;
      }

      /* 【需求4：游戏选择区布局】 */
      .gd-game-selection-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      .gd-game-select-card {
        background: rgba(255, 255, 255, 0.03);
        border: 2px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 25px 20px;
        cursor: pointer;
        text-align: center;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .gd-game-select-card:hover {
        transform: translateY(-4px);
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.05);
      }
      /* 【需求4：选中状态背景变为质感绿色】 */
      .gd-game-select-card.active-selected {
        background: linear-gradient(135deg, #047857 0%, #065f46 100%) !important;
        border-color: #34d399 !important;
        box-shadow: 0 10px 25px rgba(4, 120, 87, 0.4);
      }
      .gd-game-card-icon { font-size: 40px; margin-bottom: 12px; }
      .gd-game-card-title { font-size: 18px; font-weight: bold; color: #fff; }
      .gd-game-card-desc { font-size: 12px; color: #64748b; margin-top: 6px; }
      .gd-game-select-card.active-selected .gd-game-card-desc { color: #a7f3d0; }

      /* 大厅动作交互底栏 */
      .gd-lobby-action-footer {
        display: flex;
        justify-content: center;
        gap: 25px;
        flex-wrap: wrap;
      }
      .gd-lobby-btn {
        padding: 15px 45px;
        font-size: 16px;
        font-weight: bold;
        border-radius: 30px;
        border: none;
        cursor: pointer;
        transition: transform 0.1s, box-shadow 0.2s;
      }
      .gd-lobby-btn:active { transform: scale(0.97); }
      .gd-btn-lobby-solo {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        box-shadow: 0 6px 20px rgba(29, 78, 216, 0.3);
      }
      .gd-btn-lobby-net {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        box-shadow: 0 6px 20px rgba(217, 119, 6, 0.3);
      }

      /* ================= 核心对局桌案样式 ================= */
      #${ROOT_ID} { 
        position: fixed; 
        inset: 0;
        width: 100vw; height: 100vh;
        height: -webkit-fill-available; height: 100dvh;
        z-index: 9999; 
        background: radial-gradient(circle at center, #144d26 0%, #05170b 100%); 
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
      
      /* 座位框架细调 */
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; pointer-events: none; }
      .gd-seat.top { top: 15px; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; } 
      .gd-seat.left { left: 20px; top: 38%; transform: translateY(-50%); }
      .gd-seat.right { right: 20px; top: 38%; transform: translateY(-50%); }
      .gd-seat.bottom { bottom: 0; left: 0; right: 0; width: 100%; display: flex; flex-direction: column; align-items: center; z-index: 100; }
      
      /* ===== 【需求1：完美高质感蓝白重叠扑克牌背系统】 ===== */
      .gd-opp-hand-wrapper { 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        margin-top: 8px; 
        padding: 4px; 
        overflow: visible; 
        pointer-events: none; 
      }
      .gd-opp-card-back {
        width: 16px; height: 23px;
        flex-shrink: 0;
        margin-left: -11px;
        border: 1px solid #ffffff;
        border-radius: 3px;
        box-shadow: -2px 1px 4px rgba(0, 0, 0, 0.4);
        position: relative;
        /* 高级蓝白英伦几何纹理 */
        background-color: #2563eb;
        background-image: linear-gradient(45deg, #ffffff 25%, transparent 25%), 
                          linear-gradient(-45deg, #ffffff 25%, transparent 25%), 
                          linear-gradient(45deg, transparent 75%, #ffffff 75%), 
                          linear-gradient(-45deg, transparent 75%, #ffffff 75%);
        background-size: 4px 4px;
        background-position: 0 0, 0 2px, 2px -2px, -2px 0px;
      }
      .gd-opp-card-back:first-child { margin-left: 0 !important; }
      
      /* 左右侧AI出牌牌背高负边距精细重叠布局 */
      .gd-seat.left .gd-opp-hand-wrapper, .gd-seat.right .gd-opp-hand-wrapper { 
        max-width: 100px; 
        flex-wrap: wrap; 
        justify-content: center; 
      }
      .gd-seat.left .gd-opp-card-back, .gd-seat.right .gd-opp-card-back { 
        margin-left: -12px; 
        margin-top: -2px; 
      }

      /* 操作面板 */
      .gd-action-bar { display: none; gap: 16px; justify-content: center; height: 38px; margin-bottom: 6px; z-index: 105; pointer-events: auto; width: 100%; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: 1px solid rgba(255,255,255,0.2); padding: 0 26px; border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.4); transition: transform 0.1s; -webkit-tap-highlight-color: transparent; }
      .gd-action-bar button:active { transform: scale(0.92); }
      .gd-btn-play { background: linear-gradient(180deg, #10b981 0%, #059669 100%); color: white; border-color: #34d399 !important; }
      .gd-btn-pass { background: linear-gradient(180deg, #64748b 0%, #475569 100%); color: white; }
      .gd-btn-sort { background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%); color: white; position: relative; }
      .gd-action-bar button:disabled { background: linear-gradient(180deg, #334155 0%, #1e293b 100%) !important; color: #64748b !important; cursor: not-allowed; box-shadow: none; opacity: 0.4; border-color: transparent !important; }
      
      .gd-clock-panel { display: none; background: rgba(0,0,0,0.85); padding: 3px 14px; border-radius: 12px; border: 1px solid #10b981; margin-bottom: 6px; font-size: 13px; font-weight: bold; align-items: center; gap: 4px; color: #10b981; z-index: 104; }
      .gd-clock-panel.show { display: flex; }
      
      .gd-player-info { background: rgba(0,15,8,0.88); padding: 6px 14px; border-radius: 8px; text-align: center; min-width: 100px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 4px 8px rgba(0,0,0,0.4); }
      .gd-player-info.active { border-color: #f59e0b; background: rgba(20,50,30,0.95); box-shadow: 0 0 14px #f59e0b; }
      .gd-player-name { font-weight: bold; font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
      .gd-player-detail { font-size: 11px; color: #f59e0b; margin-top: 2px; font-weight: bold; }
      
      /* 桌案中心出牌区域 */
      .gd-center-table { 
        position: absolute; 
        width: 88vw; 
        height: 32vh; 
        max-width: 650px; 
        max-height: 180px; 
        top: 26%;
        border: 2px dashed rgba(255,215,0,0.3); 
        border-radius: 16px; 
        display: flex; 
        flex-direction: column; 
        justify-content: flex-start; 
        align-items: center; 
        background: rgba(0, 0, 0, 0.45); 
        padding: 8px 0; 
        pointer-events: none;
        z-index: 40;
        box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
      }
      .gd-center-status-bar { background: rgba(0, 0, 0, 0.8); padding: 4px 16px; font-size: 12px; font-weight: bold; color: #e2e8f0; border-radius: 12px; }
      .gd-center-status-bar.my-turn { color: #34d399; animation: gd-text-pulse 1.2s infinite alternate; }
      
      .gd-trick { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; flex: 1; position: relative; }
      .gd-trick-cards-wrap { display: flex; justify-content: center; align-items: center; width: 100%; max-height: 100px; padding: 4px; }
      .gd-trick-empty { font-size: 13px; color: rgba(255,255,255,0.2); font-weight: bold; margin-top: 25px; }
      .gd-trick-owner { color: #ffd700; font-size: 12px; font-weight: bold; width: 100%; text-align: center; position: absolute; top: -6px; }
      
      .gd-trick .gd-card { 
        width: 54px !important; 
        height: 76px !important; 
        margin-left: -26px !important; 
        flex-shrink: 0 !important;
        transform: none !important;
        position: relative;
        border-radius: 4px !important;
        box-shadow: -2px 2px 6px rgba(0,0,0,0.5) !important;
      }
      .gd-trick .gd-card:first-child { margin-left: 0 !important; }
      .gd-trick .gd-card img { width: 100% !important; height: 100% !important; object-fit: fill !important; }

      /* ================= 【需求2：当前玩家手牌展示区 - 极致比例防畸变全显系统】 ================= */
      .gd-hand { 
        display: flex; 
        align-items: flex-end; 
        justify-content: center; 
        min-height: 135px; 
        height: 135px;
        width: 100vw; 
        max-width: 100vw; 
        pointer-events: auto; 
        padding: 10px 6px 6px 6px; 
        z-index: 110; 
        overflow-x: hidden !important; 
        overflow-y: visible !important; 
      }
      
      /* 精准锁定 1:1.44 扑克经典美学高宽比，解决拉长和畸变问题 */
      .gd-hand .gd-card { 
        width: 5.5vw; 
        max-width: 66px;
        min-width: 35px;
        aspect-ratio: 1 / 1.44; /* 核心修正：绑定精准高宽比，防止畸变拉长 */
        height: auto !important; /* 让高度由高宽比自适应 */
        flex-shrink: 1 !important; 
        flex-grow: 0;
        position: relative; 
        margin-left: -3.8vw; 
        transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1); 
        border-radius: 5px; 
        cursor: pointer; 
        transform-origin: bottom center; 
        touch-action: none;
      }
      .gd-hand .gd-card:first-child { margin-left: 0 !important; }
      .gd-hand .gd-card img { width: 100%; height: 100%; object-fit: fill; background: #fff; border-radius: 5px; filter: drop-shadow(-2px 3px 5px rgba(0,0,0,0.4)); pointer-events: none; }
      
      .gd-hand .gd-card.sel { transform: translateY(-26px) !important; }
      .gd-hand .gd-card.sel img { filter: drop-shadow(0px 4px 12px rgba(245,158,11,0.95)) saturate(1.2); }
      
      .gd-wild-card img { filter: drop-shadow(0 0 6px #ef4444) !important; }
      .gd-rank-card img { filter: drop-shadow(0 0 5px #ffd700) !important; }
      
      .gd-toast { position: fixed; top: 18%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); border: 1px solid #f59e0b; color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 2000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
      
      @media screen and (orientation: portrait) { .gd-landscape-tips { display: flex !important; } }
      .gd-landscape-tips { display: none; position: fixed; inset: 0; width: 100vw; height: 100vh; background: #06140b; z-index: 100000; flex-direction: column; justify-content: center; align-items: center; color: #ffd700; text-align: center; padding: 20px; }
      .gd-landscape-tips-icon { font-size: 45px; margin-bottom: 16px; animation: gd-rotate-phone 2s infinite ease-in-out; }

      /* ================= 【需求6：PC端及宽屏设备独立视觉跃升配置（做大做舒适）】 ================= */
      @media screen and (min-width: 1024px) {
        .gd-hand { min-height: 185px; height: 185px; padding-top: 25px; }
        .gd-hand .gd-card { width: 80px; max-width: 80px; margin-left: -55px; }
        .gd-hand .gd-card.sel { transform: translateY(-32px) !important; }
        .gd-trick .gd-card { width: 62px !important; height: 88px !important; margin-left: -34px !important; }
        .gd-center-table { max-width: 750px; max-height: 220px; top: 24%; }
        
        /* 显著放大 PC 端的控制栏按钮与玩家头像 */
        .gd-action-bar { height: 48px; gap: 24px; margin-bottom: 12px; }
        .gd-action-bar button { padding: 0 45px; font-size: 16px; border-radius: 24px; }
        .gd-player-info { padding: 10px 22px; min-width: 140px; border-radius: 12px; }
        .gd-player-name { font-size: 16px; max-width: 150px; }
        .gd-player-detail { font-size: 13px; margin-top: 4px; }
        .gd-clock-panel { padding: 6px 20px; font-size: 15px; border-radius: 16px; margin-bottom: 10px; }
        .gd-opp-card-back { width: 20px; height: 28px; margin-left: -14px; }
      }

      /* 移动端横屏极限自适应空间 */
      @media screen and (max-height: 460px) {
        .gd-hand { min-height: 115px; height: 115px; padding-top: 10px; }
        .gd-hand .gd-card { width: 42px; min-width: 28px; margin-left: -30px; }
        .gd-hand .gd-card.sel { transform: translateY(-20px) !important; }
        .gd-center-table { top: 14%; height: 38vh; max-height: 140px; }
        .gd-seat.top { top: 8px; }
        .gd-action-bar { height: 32px; margin-bottom: 2px; }
        .gd-action-bar button { font-size: 12px; padding: 0 18px; }
      }

      @keyframes gd-rotate-phone { 0% { transform: rotate(0deg); } 50% { transform: rotate(-90deg); } 100% { transform: rotate(0deg); } }
      @keyframes gd-text-pulse { 0% { text-shadow: 0 0 2px rgba(52,211,153,0.3); } 100% { text-shadow: 0 0 8px rgba(52,211,153,0.8); } }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  // ===== 【需求3 & 4：构建高拟真多游戏选择大厅舱】 =====
  function createLobbyShell() {
    const lobby = document.createElement('div');
    lobby.id = LOBBY_ID;
    
    lobby.innerHTML = `
      <div class="gd-lobby-container-box">
        <div class="gd-lobby-header-zone">
          <h1 class="gd-lobby-main-title">🎮 棋牌游戏娱乐大厅</h1>
          <div class="gd-lobby-welcome-tag">欢迎您，尊贵的玩家：<span id="gd-lobby-user-span">${getUserNickname()}</span></div>
        </div>
        
        <div class="gd-game-selection-grid">
          <div class="gd-game-select-card active-selected" data-game-id="guandan">
            <div class="gd-game-card-icon">♠️</div>
            <div class="gd-game-card-title">江苏掼蛋</div>
            <div class="gd-game-card-desc">经典淮安规则 双下连升三级</div>
          </div>
          <div class="gd-game-select-card" data-game-id="doudizhu">
            <div class="gd-game-card-icon">🃏</div>
            <div class="gd-game-card-title">经典斗地主</div>
            <div class="gd-game-card-desc">三分天下 抢地主明牌激战</div>
          </div>
          <div class="gd-game-select-card" data-game-id="majiang">
            <div class="gd-game-card-icon">🀄</div>
            <div class="gd-game-card-title">血流成河麻将</div>
            <div class="gd-game-card-desc">胡了还能胡 刺激到底刮风下雨</div>
          </div>
        </div>
        
        <div class="gd-lobby-action-footer">
          <button class="gd-lobby-btn gd-btn-lobby-solo" id="gd-btn-lobby-solo-trigger" title="双击游戏卡牌亦可直接进入">进入单机模式 (双击)</button>
          <button class="gd-lobby-btn gd-btn-lobby-net" id="gd-btn-lobby-net-trigger">创建游戏房间 (互联网对战)</button>
        </div>
      </div>
    `;
    return lobby;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-landscape-tips" id="gd-landscape-tips">
        <div class="gd-landscape-tips-brand">Nobi <span>游戏</span></div><svg class="gd-landscape-tips-icon" aria-hidden="true" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3"><rect x="33" y="18" width="30" height="60" rx="6"/><path d="M45 70h6M17 42a32 32 0 0 1 54-18m0-12v12H59M79 54a32 32 0 0 1-54 18m0 12V72h12"/></svg>
        <h3 style="font-size:16px;">请横向旋转手机，开始掼蛋对局</h3>
        <p style="color: #94a3b8; font-size:12px; margin-top:6px;">请开启设备自动旋转；对局与联机连接会继续保持。</p>
        <button id="gd-fullscreen-trigger" style="margin-top: 15px; padding: 6px 18px; background: #10b981; border:none; color:white; font-weight:bold; border-radius:15px; font-size:12px; pointer-events:auto;">尝试全屏横屏</button><p data-gd-orientation-notice role="status" aria-live="polite"></p>
      </div>

      <div class="gd-header">
        <div class="gd-header-info"><div class="gd-level-line">当前级牌 <span class="gd-level-chip" data-gd-rank>${getCurrentRankStr()}</span><b data-gd-series>掼蛋对局</b></div><span class="gd-score-line" data-gd-score>本局完游 0 : 0（非积分）</span><div class="gd-counter" data-gd-counter aria-label="记牌器：其他玩家手中剩余的关键牌"></div><small>牌型 <span data-gd-move>—</span></small></div>
        <div class="gd-room-label"><b>Nobi <span>游戏</span></b><small>GUANDAN</small></div><span class="gd-sys-clock" data-gd-sys-clock aria-label="当前时间"></span>
        <div class="gd-header-tools"><button type="button" data-match-settings><svg class="gd-tool-symbol" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1Z"/><circle cx="12" cy="11" r="3"/></svg>设置</button><button type="button" data-match-chat><svg class="gd-tool-symbol" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/></svg>聊天</button><button type="button" class="gd-exit-btn" data-gd-exit>返回大厅 <span aria-hidden="true">↗</span></button></div>
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
            <button class="gd-btn-pass" data-gd-pass>不出</button>
            <button class="gd-btn-sort" data-gd-hint>提示</button>
            <div class="gd-play-control"><div class="gd-turn-clock" data-gd-turn-clock hidden aria-label="出牌倒计时"><span aria-hidden="true"></span><b>30</b>s</div><button class="gd-btn-play" data-gd-play>出牌</button></div>
            <button class="gd-btn-sort" data-gd-sort>理牌<span class="gd-sort-tag" data-gd-sort-tag>大小</span></button>
            <button class="gd-btn-pass" data-gd-clear>取消</button>
          </div>
          <div class="gd-player-wrap" data-gd-player-zone style="display:none;"></div>
          <div class="gd-hand-navigation" data-gd-hand-navigation hidden>
            <span>左右查看手牌</span>
            <div><button data-gd-hand-prev aria-label="向左查看手牌">‹</button><button data-gd-hand-next aria-label="向右查看手牌">›</button></div>
          </div>
          <div class="gd-hand-viewport" data-gd-hand-viewport><div class="gd-hand" data-gd-hand></div></div>
        </div>
      </div>
      <div class="gd-toast" data-gd-toast></div>
      <div class="gd-bomb-effect" data-gd-bomb-effect hidden aria-hidden="true"></div>
    `;
    return root;
  }

  function makeDeck() {
    const deck = [];
    for (let d = 0; d < 2; d++) {
      for (const suit of GD_SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: uid(), kind: 'normal', rank, suit: suit.key, symbol: suit.symbol, color: suit.color });
        }
      }
      deck.push({ id: uid(), kind: 'joker', label: '小王', rank: '小王', suit: 'J', symbol: '🃏', color: 'red', value: 16 });
      deck.push({ id: uid(), kind: 'joker', label: '大王', rank: '大王', suit: 'J', symbol: '🃏', color: 'black', value: 17 });
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.cardsById = new Map(deck.map((c) => [c.id, c]));
    return deck;
  }

  function startCountdown() {
    clearInterval(state.clockTimer);
    state.countdownCue = null;
    const deadline = state.turnDeadline ?? Date.now() + TURN_SECONDS * 1000;
    state.countdown = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    paintTurnClock();
    if (!state.active || state.currentTurn !== 0) return;
    const tick = () => {
      if (!state.active || state.currentTurn !== 0) { clearInterval(state.clockTimer); paintTurnClock(); return; }
      state.countdown = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      paintTurnClock();
      if (!document.hidden && state.countdown > 0 && state.countdown <= 10 && state.countdownCue !== state.countdown) {
        state.countdownCue = state.countdown;
        window.NobiAudio?.playEffect('countdown');
      }
      if (state.countdown <= 0) {
        clearInterval(state.clockTimer);
        // Network expiry is advisory; only the server/host may advance the turn.
        if (state.gameMode === 'NET_BATTLE') return;
        if (state.trick) passTurn(0); else {
          const me = state.players[0];
          if (me?.hand.length) playCards(0, [sortCards(me.hand)[0]]);
        }
      }
    };
    tick();
    if (state.countdown > 0) state.clockTimer = setInterval(tick, 200);
  }

  function paintTurnClock() {
    const node = state.root?.querySelector('[data-gd-turn-clock]');
    if (!node) return;
    node.hidden = !state.active || state.currentTurn !== 0 || !!(state.standardMode && state.authorityPublic?.phase !== 'play');
    node.querySelector('b').textContent = String(state.countdown);
    node.toggleAttribute('data-urgent', state.countdown <= 10);
  }

  function paintBombEffect() {
    const played = state.lastPlayedTrick;
    if (!played?.cards?.length) return;
    const key = played.seat + ':' + played.cards.map(c => c.id).join(',');
    if (state.bombKey === key) return;
    state.bombKey = key;
    if (!['炸弹', '天王炸', '同花顺'].includes(played.type)) return;
    const node = state.root?.querySelector('[data-gd-bomb-effect]');
    if (!node) return;
    clearTimeout(state.bombTimer);
    node.hidden = false;
    node.innerHTML = `<div class="gd-bomb-burst"><span class="gd-bomb-ring"></span><span class="gd-bomb-sparks"></span><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M61 26q5-18 19-14" fill="none" stroke="#ffce64" stroke-width="5"/><path d="m77 8 5 4 6-1-3 6 2 5-6-2-5 3 1-6-4-4Z" fill="#fff2af"/><path d="m47 23 19 7-5 12-19-7Z" fill="#576175"/><circle cx="44" cy="62" r="29" fill="#182134" stroke="#ffe2a3" stroke-width="3"/><path d="M27 50q3-10 13-11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/></svg><strong>${escapeHTML(played.type)}</strong><small>${played.cards.length} 张 · 强势出击</small></div>`;
    window.NobiAudio?.playEffect('bomb');
    state.bombTimer = setTimeout(() => { node.hidden = true; node.innerHTML = ''; }, 1400);
  }

  let finishOrder = [];

  function startNewRound() {
    if (state.gameMode === 'NET_BATTLE') return;
    window.NobiAudio?.setScene('guandan');
    const deck = makeDeck(); 
    finishOrder = [];
    state.players.forEach((p) => { p.hand = []; p.rankOutOrder = null; });
    
    for (let i = 0; i < deck.length; i++) {
      state.players[i % 4].hand.push(deck[i]);
    }
    
    // 动态同步最新的名字(需求5)
    if(state.players[0]) state.players[0].name = getUserNickname();
    
    state.players.forEach((p) => { p.hand = sortCards(p.hand); });
    
    state.selected.clear();
    state.playedCards.clear();
    state.seatActions = [null, null, null, null]; state.seatTips = [null, null, null, null];
    state.root?.querySelector('[data-gd-result]')?.remove();
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
    if (n === 5 && new Set(values).size === n && rankSeq(values) && sameSuit(cards)) return { type: '同花顺', weight: values[0], size: 5 };
    if (n === 4 && cards.every((c) => c.kind === 'joker')) return { type: '天王炸', weight: 9999, size: 4 };
    if (n >= 5 && new Set(values).size === n && rankSeq(values) && values.every((v) => v < 16)) return { type: '顺子', weight: values[0], size: n };
    
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
      <div class="gd-card ${extraClass}" data-card-id="${card.id}" style="
        background: #ffffff; 
        border: 1px solid rgba(0,0,0,0.1); 
        border-radius: 4px; 
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        overflow: hidden;
      ">
        <img src="${imgUrl}" alt="${rankLabel(card)}" onerror="this.onerror=null;this.dataset.assetError='missing';console.error('Original card PNG unavailable')" />
      </div>`;
  }

  const AI_AVATARS = [null, 1, 4, 6];
  function playerAvatar(idx, p) {
    const avatars = window.NobiAvatars;
    if (!avatars) return null;
    if (idx === 0) return avatars.self(window.state?.userNickname || p.name);
    const account = avatars.safe(p.avatar || p.avatar_url);
    if (account) return account;
    if (p.isBot !== false && state.gameMode !== 'NET_BATTLE') return avatars.presets[AI_AVATARS[idx]]?.src || avatars.forKey(p.name);
    return avatars.forKey(p.userId || p.uid || p.name || String(idx));
  }
  // Priority: fresh prompt > finishing place > whose turn > last action this trick.
  function seatMessage(idx, p, isActive) {
    const tip = state.seatTips[idx];
    if (tip && tip.until > Date.now()) return { text: tip.text, kind: tip.kind || 'tip' };
    if (p.rankOutOrder) return { text: PLACE_LABELS[p.rankOutOrder - 1] || '已完游', kind: 'done' };
    if (isActive && idx === 0) { const status = selectionStatus(); if (status) return { text: status.text, kind: status.ok ? 'ready' : 'tip' }; }
    if (isActive && idx === 0) return { text: state.trick ? '轮到你 · 压牌或不出' : '轮到你出牌', kind: 'turn' };
    return state.seatActions[idx]?.kind === 'pass' ? state.seatActions[idx] : null;
  }
  function selectionStatus() {
    if (!state.selected.size || state.standardMode || state.authoritativeSend) return null;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    const move = typeOf(cards);
    if (!move) return { ok: false, text: `已选 ${cards.length} 张 · 不成牌型` };
    if (state.trick && !beats(move, state.trick)) return { ok: false, text: `${move.type} · 压不住上家` };
    return { ok: true, text: `${move.type} · 可出牌` };
  }
  function refreshSelectionUI() {
    const root = state.root;
    const key = [...state.selected].join(',') + '|' + state.currentTurn + '|' + (state.trick ? state.trick.seat + ':' + state.trick.type : '');
    if (key === state.selectionKey) return;
    state.selectionKey = key;
    const play = root?.querySelector('[data-gd-play]');
    if (!play) return;
    const mine = state.currentTurn === 0 && state.active && state.players[0]?.hand?.length > 0;
    const status = selectionStatus();
    if (!state.standardMode) {
      play.disabled = !mine || state.selected.size === 0 || (status ? !status.ok : false);
      play.classList.toggle('is-ready', mine && !!status?.ok);
    }
    renderSeats();
  }
  function seatTip(seat, text, kind = 'tip', ms = 1800) {
    state.seatTips[seat] = { text, kind, until: Date.now() + ms };
    renderSeats();
    clearTimeout(state.seatTipTimers?.[seat]);
    state.seatTipTimers = state.seatTipTimers || [];
    state.seatTipTimers[seat] = setTimeout(() => { if (state.root) renderSeats(); }, ms + 30);
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
      else if (p.rankOutOrder === 4) rankString = '末游';
      else rankString = `剩 ${cardCount} 张`;

      let backsHTML = '';
      if (idx !== 0 && cardCount > 0 && state.active) {
        backsHTML = '<div class="gd-opp-hand-wrapper">';
        for (let i = 0; i < cardCount; i++) {
          backsHTML += '<div class="gd-opp-card-back"></div>';
        }
        backsHTML += '</div>';
      }

      const avatar = playerAvatar(idx, p);
      const message = seatMessage(idx, p, isActive);
      const seatHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}" ${isActive ? 'aria-current="true"' : ''}>
          <span class="gd-player-avatar ${avatar ? 'has-img' : ''}" aria-hidden="true">${avatar ? `<img src="${escapeHTML(avatar)}" alt="" draggable="false" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : ''}<i>${escapeHTML(Array.from(p.name || '?')[0])}</i></span>
          <div class="gd-player-copy"><div class="gd-player-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div>
          <div class="gd-player-detail">${rankString}<span class="gd-player-state">${p.rankOutOrder ? '已完游' : isActive ? '出牌中' : idx % 2 === 0 ? '我方' : '对方'}</span></div></div>
        </div>
        ${message ? `<div class="gd-seat-msg" data-kind="${message.kind}" role="status">${escapeHTML(message.text)}</div>` : ''}
        ${backsHTML} 
      `;
      if (seatNode._gdHTML !== seatHTML) { seatNode.innerHTML = seatHTML; seatNode._gdHTML = seatHTML; }
    });

    const centerStatus = state.root.querySelector('[data-gd-center-status]');
    if (centerStatus && state.active) {
      const activePlayer = state.players[state.currentTurn];
      if (activePlayer) {
        centerStatus.className = 'gd-center-status-bar';
        if (state.currentTurn === 0) {
          centerStatus.classList.add('my-turn');
          centerStatus.textContent = '到你出牌 · 点选或拖选，再点出牌';
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
    root.classList.toggle('gd-local-mode', !state.standardMode);
    const score=root.querySelector('[data-gd-score]');
    if(score) score.textContent=`本局完游 ${[0,2].filter(i=>state.players[i]?.rankOutOrder).length} : ${[1,3].filter(i=>state.players[i]?.rankOutOrder).length}（非积分）`;
    const series=root.querySelector('[data-gd-series]');
    if(series && !state.standardMode) series.textContent=`第 ${state.roundNumber} 局 · 我方打 ${RANKS[state.teamLevels[0]]} · 对方打 ${RANKS[state.teamLevels[1]]}`;
    renderCounter(root);

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');
    const sortTag = root.querySelector('[data-gd-sort-tag]');

    // 理牌按钮标志动态渲染
    if (sortTag) {
      const modesStr = ["大小", "花色", "炸弹"];
      sortTag.textContent = modesStr[state.sortMode] || "大小";
    }

    if (trick) {
      if (state.lastPlayedTrick) {
        trick.dataset.playSeat = String(state.lastPlayedTrick.seat);
        root.querySelector('.gd-center-table').dataset.playSeat=trick.dataset.playSeat;
        const pName = state.players[state.lastPlayedTrick.seat]?.name || '未知';
        const cardsHTML = state.lastPlayedTrick.cards.map(formatCard).join('');
        
        trick.innerHTML = `
          <div class="gd-trick-owner">${['南家 ↑','东家 ←','北家 ↓','西家 →'][state.lastPlayedTrick.seat]} · ${escapeHTML(pName)} 出牌</div>
          <div class="gd-trick-cards-wrap" style="margin-top:10px;">${cardsHTML}</div>
        `;
        if (move) move.textContent = `${escapeHTML(pName)}：${state.lastPlayedTrick.type}`;
      } else {
        delete trick.dataset.playSeat;
        delete root.querySelector('.gd-center-table').dataset.playSeat;
        trick.innerHTML = `<span class="gd-table-wordmark" aria-hidden="true">NOBI GAMES</span><span class="gd-trick-empty">本轮尚未出牌</span>`;
        if (move) move.textContent = '—';
      }
    }

    const me = state.players[0];
    if (hand && me && me.hand) {
      hand.innerHTML = sortCards(me.hand).map(formatCard).join('');
      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        const card = state.cardsById.get(cardDOM.getAttribute('data-card-id'));
        cardDOM.setAttribute('role','button'); cardDOM.setAttribute('tabindex','0');
        cardDOM.setAttribute('aria-label',card ? `${card.suit} ${rankLabel(card)}${card.deck!==undefined?' · 第'+(card.deck+1)+'副 · 实例'+card.id.slice(-4):''}` : '手牌');
        cardDOM.setAttribute('aria-pressed',String(state.selected.has(cardDOM.getAttribute('data-card-id'))));
        cardDOM.querySelector('img')?.setAttribute('draggable','false');
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
        if (state.hoverCardId === cardDOM.getAttribute('data-card-id')) cardDOM.classList.add('gd-hover');
      });
      layoutHand(hand);
    }

    if (actionBar && me && me.hand) {
      if (state.currentTurn === 0 && me.hand.length > 0 && state.active) {
        actionBar.classList.add('show');
        const playBtn = root.querySelector('[data-gd-play]');
        const passBtn = root.querySelector('[data-gd-pass]');
        if (playBtn) { const status = selectionStatus(); playBtn.disabled = state.selected.size === 0 || (status ? !status.ok : false); playBtn.classList.toggle('is-ready', !!status?.ok); }
        if (passBtn) passBtn.disabled = !state.trick; 
      } else {
        actionBar.classList.remove('show');
        for(const selector of ['[data-gd-play]','[data-gd-pass]']){const button=root.querySelector(selector);if(button)button.disabled=true;}
        root.querySelector('[data-gd-play]')?.classList.remove('is-ready');
      }
    }
    renderStandardStatus();
    paintTurnClock();
    paintBombEffect();
  }

  function renderStandardStatus(){
    if(!state.standardMode||!state.root)return;
    const pub=state.authorityPublic,root=state.root,rank=root.querySelector('[data-gd-rank]'),score=root.querySelector('[data-gd-score]'),status=root.querySelector('[data-gd-center-status]'),play=root.querySelector('[data-gd-play]'),pass=root.querySelector('[data-gd-pass]');
    if(rank)rank.textContent=pub.level;
    if(score)score.textContent='第'+pub.series.round+'副 · 我队 '+pub.series.teamLevels[state.network.mySeat%2]+' / 对方 '+pub.series.teamLevels[1-state.network.mySeat%2]+' · '+(state.ranked?'隔离竞技':'普通对局');
    const tribute=pub.phase==='tribute',own=state.currentTurn===0&&state.active;
    if(tribute){play.textContent=pub.tribute.phase==='give'?'确认进贡':'确认还贡';play.disabled=!own||state.selected.size!==1||!state.tributeOptions.includes([...state.selected][0]);pass.disabled=true;if(status)status.textContent=own?(pub.tribute.phase==='give'?'请选择最大非逢人配牌进贡':'选择'+(pub.rulesConfig.returnExcludesLevel?'非级牌':'')+'10及以下还贡，无低牌时还最小牌'):'等待贡牌确认';return;}
    const cards=[...state.selected].map(id=>state.cardsById.get(id)),rules=state.standardRules;
    const choices=rules?rules.combinations(cards,getCurrentRankStr(),pub.rulesConfig).filter(c=>rules.classify(cards,getCurrentRankStr(),pub.rulesConfig,state.trick,{kind:c.kind,weight:c.weight})):[];
    const combo=rules?rules.classify(cards,getCurrentRankStr(),pub.rulesConfig,state.trick,state.combination):null;
    play.textContent=state.selected.size?'确认出牌 ('+state.selected.size+')':'出牌';play.disabled=!own||!combo;
    if(own&&status)status.textContent=state.selected.size?(combo?'已选 '+state.selected.size+' 张 · '+combo.type+' · 点击确认出牌':'所选 '+state.selected.size+' 张不符合出牌规则'):'到你出牌 · 点选或连续拖选';
    let picker=root.querySelector('[data-gd-combination]');if(!picker){picker=document.createElement('select');picker.dataset.gdCombination='';picker.setAttribute('aria-label','逢人配牌型解释');root.querySelector('[data-gd-move]').after(picker);picker.onchange=()=>{state.combination=JSON.parse(picker.value);renderStandardStatus();};}
    picker.hidden=choices.length<2||!own;picker.replaceChildren();for(const c of choices){const option=document.createElement('option');option.value=JSON.stringify({kind:c.kind,weight:c.weight});option.textContent=c.type+' · '+(c.weight===15?'级牌 '+pub.level:c.weight===16?'小王':c.weight===17?'大王':RANKS[c.weight-2]??c.weight);option.selected=combo?.kind===c.kind&&combo?.weight===c.weight;picker.append(option);}
  }
  function showToast(msg, seat = 0) {
    const toastNode = document.querySelector('[data-gd-toast]');
    if (toastNode) toastNode.textContent = msg; // kept for assistive tech; shown in front of the seat
    seatTip(seat, msg);
  }

  function findNextTurn(current) {
    let next = current;
    for (let i = 0; i < 4; i++) {
      next = (next + 1) % 4;
      if (state.players[next].hand.length > 0) {
        return next;
      }
    }
    return current; 
  }

  function playCards(seat, cards) {
    if (!state.active || seat !== state.currentTurn || !Array.isArray(cards) || !cards.length) return false;
    const player = state.players[seat];
    if (!player || new Set(cards).size !== cards.length || cards.some(card => !player.hand.includes(card))) return false;
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    player.hand = player.hand.filter(c => !cards.includes(c));
    rememberPlayed(cards);
    if (!state.trick) state.seatActions = [null, null, null, null];
    state.seatActions[seat] = { text: move.type || '出牌', kind: 'play' };

    state.trick = { ...move, cards, seat };
    state.lastPlayedTrick = state.trick; 
    paintBombEffect();
    state.selected.clear();
    
    if (player.hand.length === 0) {
      if (!finishOrder.includes(seat)) {
        finishOrder.push(seat);
        player.rankOutOrder = finishOrder.length;
      }
      showToast(`${PLACE_LABELS[player.rankOutOrder - 1] || '已完游'} · 出完了！`, seat);
    }
    
    const action = { type: 'PLAY_CARDS', seat, cardIds: cards.map(c => c.id) };
    if (checkGameOver()) { notifyNetworkAction(action); return true; }

    let nextTurn = findNextTurn(seat);

    if (state.trick && (state.trick.seat === nextTurn || state.players[state.trick.seat].hand.length === 0)) {
      state.trick = null; 
    }

    state.currentTurn = nextTurn;
    if (nextTurn === 0) window.NobiAudio?.playEffect('yourTurn');
    state.aiDelay = performance.now() + 600;
    renderTable();
    startCountdown();
    notifyNetworkAction(action);
    return true;
  }

  function passTurn(seat) {
    if(state.authoritativeSend){if(state.active&&seat===0&&state.currentTurn===0&&state.trick)state.authoritativeSend('pass',{});return false;}
    if (!state.active || seat !== state.currentTurn || !state.trick) return false;
    state.seatActions[seat] = { text: '不出', kind: 'pass' };
    let nextTurn = findNextTurn(seat);
    
    if (state.trick && state.trick.seat === nextTurn) {
      state.trick = null; 
    }
    if (state.trick && state.players[state.trick.seat].hand.length === 0) {
      if (nextTurn === state.trick.seat) {
        state.trick = null;
        nextTurn = findNextTurn(nextTurn);
      }
    }

    state.currentTurn = nextTurn;
    if (nextTurn === 0) window.NobiAudio?.playEffect('yourTurn');
    playGDSound('pass');
    renderTable();
    startCountdown();
    notifyNetworkAction({ type: 'PASS_TURN', seat });
    return true;
  }

  function checkGameOver() {
    const team0Alive = state.players[0].hand.length > 0 || state.players[2].hand.length > 0;
    const team1Alive = state.players[1].hand.length > 0 || state.players[3].hand.length > 0;
    const aliveCount = state.players.filter(p => p.hand.length > 0).length;

    if (!team0Alive || !team1Alive || aliveCount <= 1) {
      window.NobiAudio?.setScene('result');
      state.active = false;
      clearInterval(state.clockTimer);

      const firstSeat = finishOrder[0] !== undefined ? finishOrder[0] : 0;
      const winTeam = firstSeat % 2;
      // Remaining players take the last places by fewest cards so all four places are shown.
      state.players.map((p, seat) => ({ p, seat })).filter(({ p }) => !p.rankOutOrder)
        .sort((a, b) => a.p.hand.length - b.p.hand.length)
        .forEach(({ p, seat }) => { finishOrder.push(seat); p.rankOutOrder = finishOrder.length; });
      // Standard upgrade: partner of the first finisher 2nd → +3, 3rd → +2, last → +1.
      const partnerOrder = state.players[(firstSeat + 2) % 4].rankOutOrder;
      const levelGained = partnerOrder === 2 ? 3 : partnerOrder === 3 ? 2 : 1;
      const before = state.teamLevels[winTeam];
      state.teamLevels[winTeam] = Math.min(RANKS.length - 1, before + levelGained);
      // The next deal is played at the winning team's level.
      state.currentRankIndex = state.teamLevels[winTeam];
      renderTable();
      setTimeout(() => showRoundResult({ winTeam, levelGained, before, order: finishOrder.slice() }), 500);
      return true;
    }
    return false;
  }

  const PLACE_LABELS = ['头游', '二游', '三游', '末游'];
  const TEAM_LABELS = ['我方（南北）', '对方（东西）'];

  function showRoundResult({ winTeam, levelGained, before, order }) {
    if (!state.root) return;
    state.root.querySelector('[data-gd-result]')?.remove();
    const panel = document.createElement('div');
    panel.className = 'gd-result';
    panel.dataset.gdResult = '';
    panel.dataset.outcome = winTeam === 0 ? 'win' : 'loss';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'gd-result-title');
    const rows = order.map((seat, i) => `<li data-team="${seat % 2}"><b>${PLACE_LABELS[i] || ''}</b><span>${escapeHTML(state.players[seat]?.name || '')}</span><small>${seat % 2 === 0 ? '我方' : '对方'}</small></li>`).join('');
    const canContinue = state.gameMode !== 'NET_BATTLE';
    panel.innerHTML = `<div class="gd-result-card">
        <div class="gd-result-eyebrow">第 ${state.roundNumber} 局 · 结算</div>
        <h2 id="gd-result-title">${winTeam === 0 ? '我方获胜' : '对方获胜'}</h2>
        <p class="gd-result-upgrade">${TEAM_LABELS[winTeam]} 升 <b>${levelGained}</b> 级 · ${RANKS[before]} → ${RANKS[state.teamLevels[winTeam]]}</p>
        <ol class="gd-result-order">${rows}</ol>
        <div class="gd-result-levels"><span>我方 打 <b>${RANKS[state.teamLevels[0]]}</b></span><span>对方 打 <b>${RANKS[state.teamLevels[1]]}</b></span><span>下一局 级牌 <b>${getCurrentRankStr()}</b></span></div>
        <div class="gd-result-actions">${canContinue ? '<button type="button" class="gd-result-next" data-gd-next-round>开始下一局</button>' : ''}<button type="button" data-gd-result-exit>返回大厅</button></div>
      </div>`;
    state.root.appendChild(panel);
    on(panel.querySelector('[data-gd-next-round]'), 'click', () => { playGDSound('click'); panel.remove(); state.roundNumber++; startNewRound(); });
    on(panel.querySelector('[data-gd-result-exit]'), 'click', () => { panel.remove(); state.root?.querySelector('[data-gd-exit]')?.click(); });
    panel.querySelector('button')?.focus({ preventScroll: true });
  }

  // Remaining copies of key cards outside my hand and not yet played (two decks: 8 per rank, 2 per joker).
  function cardCounter() {
    const level = getCurrentRankStr();
    const key = card => card.kind === 'joker' ? (card.label === '大王' || card.rank === 'RJ' ? 'RJ' : 'BJ') : card.rank;
    const counts = { RJ: 2, BJ: 2, A: 8, [level]: 8 };
    const seen = [...(state.players[0]?.hand || []), ...state.playedCards.values()];
    for (const card of seen) { const k = key(card); if (k in counts) counts[k]--; }
    return [['大王', counts.RJ], ['小王', counts.BJ], ['A', counts.A], ...(level === 'A' ? [] : [['级' + level, counts[level]]])];
  }

  function renderCounter(root) {
    const node = root.querySelector('[data-gd-counter]');
    if (!node) return;
    node.innerHTML = '记牌 ' + cardCounter().map(([label, n]) => `<span data-zero="${n <= 0}">${escapeHTML(label)}<b>${Math.max(0, n)}</b></span>`).join('');
  }

  function rememberPlayed(cards) {
    for (const card of cards || []) if (card?.id) state.playedCards.set(card.id, card);
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
    if (state.gameMode === 'NET_BATTLE' && (!state.network?.isHost || !state.players[state.currentTurn]?.isBot)) return;
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
    if(state.authoritativeSend){
      if(!state.active||state.currentTurn!==0||!state.selected.size)return;
      if(state.standardMode&&state.authorityPublic?.phase==='tribute'){if(state.selected.size!==1)return showToast('请选择一张贡牌');const cardId=[...state.selected][0];if(!state.tributeOptions.includes(cardId))return showToast('请选择符合贡牌规则的牌');state.authoritativeSend(state.authorityPublic.tribute.phase==='give'?'tribute':'return-tribute',{cardId});return;}
      const cards=[...state.selected].map(id=>state.cardsById.get(id));const combo=state.standardMode&&state.standardRules?state.standardRules.classify(cards,getCurrentRankStr(),state.authorityPublic.rulesConfig,state.trick,state.combination):null;
      if(state.standardMode&&!combo)return showToast('所选牌无法合法出牌');
      state.authoritativeSend('play',{cardIds:[...state.selected],...(combo?{combination:{kind:combo.kind,weight:combo.weight}}:{})});return;
    }
    if (state.currentTurn !== 0 || !state.active) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    if (!cards.length) return showToast('请先点选卡牌');
    const move = typeOf(cards);
    if (!move) return showToast('不符合出牌规则');
    if (state.trick && !beats(move, state.trick)) return showToast('不够大，压不住桌上的牌');
    playCards(0, cards);
  }

  // UI-only suggestions: every candidate is checked by the existing rules.
  // This is deliberately a limited assistant, not a replacement rule/AI engine.
  function hintCards() {
    if (!state.active || state.currentTurn !== 0) return [];
    const hand=sortCards(state.players[0]?.hand || []);
    if(state.standardMode&&state.standardRules){if(state.authorityPublic?.phase==='tribute')return hand.filter(c=>state.tributeOptions.includes(c.id)).slice(0,1);const candidates=hand.map(c=>[c]);for(const rank of [...RANKS,'BJ','RJ']){const group=hand.filter(c=>c.rank===rank);for(let n=2;n<=Math.min(10,group.length);n++)candidates.push(group.slice(0,n));}return candidates.find(cards=>state.standardRules.classify(cards,getCurrentRankStr(),state.authorityPublic.rulesConfig,state.trick))??[];}
    if (!hand.length) return [];
    const candidates=[state.trick ? chooseFollowMove(hand,state.trick) : bestOpening(hand)];
    for(const card of hand) candidates.push([card]);
    for(const group of groupsByValue(hand).values()) for(let n=2;n<=Math.min(4,group.length);n++) candidates.push(group.slice(0,n));
    return candidates.find(cards=>cards?.length && cards.every(c=>hand.includes(c)) && typeOf(cards) && (!state.trick || beats(typeOf(cards),state.trick))) || [];
  }

  function updateHandNavigation(viewport) {
    const root=viewport.closest('#'+ROOT_ID);
    const navigation=root.querySelector('[data-gd-hand-navigation]');
    const scrollable=viewport.scrollWidth>viewport.clientWidth+1;
    navigation.hidden=!scrollable;
    root.dataset.handScroll=String(scrollable);
    root.querySelector('[data-gd-hand-prev]').disabled=viewport.scrollLeft<=1;
    root.querySelector('[data-gd-hand-next]').disabled=viewport.scrollLeft>=viewport.scrollWidth-viewport.clientWidth-1;
  }

  function layoutHand(hand) {
    const viewport=hand.parentElement;
    const style=getComputedStyle(hand);
    const padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
    const landscape=matchMedia('(max-width:1023px) and (max-height:600px) and (orientation:landscape)').matches;
    const available=Math.max(1,(landscape?viewport.clientWidth:hand.clientWidth)-padding);
    const count=hand.children.length;
    const preferred=parseFloat(style.getPropertyValue('--gd-card-width'));
    const phoneWidth=Math.min(preferred,(hand.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom))*222/323);
    const width=Math.min(available,Number.isFinite(preferred)?phoneWidth:window.innerHeight>600&&window.innerWidth>900?88:window.innerWidth>window.innerHeight?(window.innerWidth<=650?54:62):48);
    const fitted=count>1?Math.max(0,Math.min(width*.5,(available-width)/(count-1))):width;
    // Keep rank/suit corners legible. Narrow phones browse the same physical IDs;
    // selection lives in state.selected and survives scrolling, sorting and resize.
    const step=landscape&&count>1?Math.max(Math.min(23,width*.45),fitted):fitted;
    const content=width+Math.max(0,count-1)*step+padding;
    hand.style.width=landscape?Math.max(viewport.clientWidth,content)+'px':'100%';
    hand.style.setProperty('--card-width',width+'px');
    hand.style.setProperty('--card-step',step+'px');
    if(!landscape)viewport.scrollLeft=0;
    updateHandNavigation(viewport);
  }

  async function executeFullscreen(element) {
    if (!element) return;
    const notice=element.querySelector('[data-gd-orientation-notice]');
    let locked=false;
    try {
      const request=element.requestFullscreen || element.webkitRequestFullscreen;
      if (request) await request.call(element);
    } catch (_) { /* Fullscreen is optional; manual rotation always remains available. */ }
    try {
      const nativeOrientation=window.Capacitor?.Plugins?.ScreenOrientation;
      if(window.Capacitor?.isNativePlatform?.() && nativeOrientation?.lock) {
        await nativeOrientation.lock({orientation:'landscape'}); locked=true;
      } else if(screen.orientation?.lock) {
        await screen.orientation.lock('landscape'); locked=true;
      }
    } catch (_) { /* Browsers and iOS can refuse orientation locking. */ }
    if(notice) notice.textContent=locked ? '已请求横屏，请等待设备旋转。' : '当前浏览器无法锁定横屏，请手动横向旋转手机。';
    layoutHand(element.querySelector('[data-gd-hand]'));
  }

  function bindHandInteraction() {
    const container = document.getElementById(ROOT_ID);
    const hand = container?.querySelector('[data-gd-hand]');
    const fsBtn = container?.querySelector('#gd-fullscreen-trigger');
    if (!hand) return;

    if (fsBtn) {
      on(fsBtn, 'click', (e) => {
        e.stopPropagation();
        executeFullscreen(container);
      });
    }

    const viewport=hand.parentElement;
    on(viewport,'scroll',()=>updateHandNavigation(viewport));
    for(const [selector,direction] of [['[data-gd-hand-prev]',-1],['[data-gd-hand-next]',1]]) {
      on(container.querySelector(selector),'click',()=>{
        viewport.scrollLeft+=direction*Math.max(100,viewport.clientWidth*.65);
        updateHandNavigation(viewport);
      });
    }

    let gesture=null;
    const canSelect=()=>state.currentTurn===0 && state.active;
    const paint=()=>hand.querySelectorAll('[data-card-id]').forEach(node=>{
      const selected=state.selected.has(node.dataset.cardId);
      node.classList.toggle('sel',selected); node.setAttribute('aria-pressed',String(selected));
    });
    const applyRange=end=>{
      const nodes=[...hand.querySelectorAll('[data-card-id]')];
      const a=nodes.findIndex(n=>n.dataset.cardId===gesture.start),b=nodes.findIndex(n=>n.dataset.cardId===end);
      if(a<0 || b<0) return;
      state.selected=new Set(gesture.before);
      for(let i=Math.min(a,b);i<=Math.max(a,b);i++) {
        if(gesture.select) state.selected.add(nodes[i].dataset.cardId); else state.selected.delete(nodes[i].dataset.cardId);
      }
      paint(); refreshSelectionUI(); renderStandardStatus();
    };
    const setHover=id=>{
      if(state.hoverCardId===id) return;
      state.hoverCardId=id;
      hand.querySelectorAll('[data-card-id]').forEach(node=>node.classList.toggle('gd-hover',node.dataset.cardId===id));
    };
    let lastPointerType='mouse';
    on(container,'pointerdown',e=>{lastPointerType=e.pointerType;},true);
    on(hand,'pointerdown',e=>{
      const node=e.target.closest('[data-card-id]');
      if(!node || !canSelect() || gesture || !e.isPrimary || e.button!==0) return;
      e.preventDefault(); hand.setPointerCapture(e.pointerId);
      gesture={pointerId:e.pointerId,start:node.dataset.cardId,before:new Set(state.selected),select:!state.selected.has(node.dataset.cardId)};
      if(e.pointerType!=='mouse') setHover(node.dataset.cardId);
      applyRange(gesture.start);
    });
    on(hand,'pointermove',e=>{
      if(e.pointerType==='mouse' && !gesture) {
        const nodes=[...hand.querySelectorAll('[data-card-id]')];
        let found=null;
        for(let i=nodes.length-1;i>=0;i--){const r=nodes[i].getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right){found=nodes[i];break;}}
        setHover(found?.dataset.cardId||null);
      }
    });
    on(hand,'pointerleave',()=>setHover(null));
    on(hand,'pointermove',e=>{
      if(!gesture || gesture.pointerId!==e.pointerId) return;
      if(!canSelect()) { gesture=null; renderTable(); return; }
      const node=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-card-id]');
      if(node && hand.contains(node)) { applyRange(node.dataset.cardId); if(e.pointerType!=='mouse') setHover(node.dataset.cardId); }
    });
    const finish=(e,cancel)=>{
      if(!gesture || gesture.pointerId!==e.pointerId) return;
      if(cancel) state.selected=gesture.before;
      gesture=null;
      if(e.pointerType!=='mouse') state.hoverCardId=null;
      if(hand.hasPointerCapture(e.pointerId)) hand.releasePointerCapture(e.pointerId);
      playGDSound('click'); renderTable();
    };
    on(hand,'pointerup',e=>finish(e,false));
    on(hand,'pointercancel',e=>finish(e,true));
    on(hand,'lostpointercapture',e=>finish(e,true));
    // A click generated by a touch/pointer must not toggle a second time.
    on(hand,'click',e=>{
      if(e.detail!==0 || !canSelect()) return;
      const node=e.target.closest('[data-card-id]'); if(!node) return;
      const id=node.dataset.cardId;
      if(state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      renderTable(); hand.querySelector(`[data-card-id="${id}"]`)?.focus();
    });
    on(hand,'keydown',e=>{
      const node=e.target.closest('[data-card-id]');if(!node) return;
      const nodes=[...hand.querySelectorAll('[data-card-id]')],index=nodes.indexOf(node);
      if(['ArrowLeft','ArrowRight'].includes(e.key)) {e.preventDefault();nodes[Math.max(0,Math.min(nodes.length-1,index+(e.key==='ArrowRight'?1:-1)))]?.focus();}
      if([' ','Enter'].includes(e.key) && canSelect()) {e.preventDefault();node.click();}
    });

    on(container, 'contextmenu', (e) => {
      if (e.target.closest('input,textarea,select,dialog,[data-gd-result]')) return;
      e.preventDefault();
      // A touch long-press also fires contextmenu; only a real mouse right-click may play.
      if (lastPointerType !== 'mouse' || state.currentTurn !== 0 || !state.active) return;
      if (!state.selected.size) {
        const id = e.target.closest('[data-gd-hand] .gd-card')?.getAttribute('data-card-id');
        if (!id) { showToast('先选牌，再右键出牌'); return; }
        state.selected.add(id);
      }
      renderTable();
      humanPlay();
    });

    const handleOrientationChange = () => layoutHand(hand);
    on(window, 'resize', handleOrientationChange);
    if(window.visualViewport) on(window.visualViewport,'resize',handleOrientationChange);
    if (screen.orientation) {
      on(screen.orientation, 'change', handleOrientationChange);
    }
  }

// =========================================================================
  // 🎯 🌟【重点修改 2026-05-30】：新增专供主控舱无缝调用的强力直连函数
  // 作用：直接配置对战机制并拉起游戏画布，不经过任何渲染 Lobby 二级菜单的步骤
  // =========================================================================
  function initGameMatchDirect(mode) {
    console.log(`[掼蛋穿透] [2026-05-30] 绕开中间层，直通掼蛋核心对局.`);
    state.isDirectLaunched = true;
    state.gameMode = (mode === 'SINGLE') ? 'SOLO' : 'NET_BATTLE';
    
    // 确保隐藏二级大厅组件
    const lobby = document.getElementById(LOBBY_ID);
    if (lobby) lobby.style.setProperty('display', 'none', 'important');

    // 跨过选择，直接进入画布对局环境
    initGameMatch();
  }

  function destroy() {
    clearInterval(state.timer);
    clearInterval(state.clockTimer);
    clearInterval(state.sysClockTimer);
    clearTimeout(state.bombTimer); state.bombKey = null; state.clockKey = null; state.turnDeadline = null;
    state.active = false; offAll();
    if (state.gameMode === 'NET_BATTLE') window.GD_MP?.stopNetMatch?.();
    state.authoritativeSend=null;state.network = null; state.gameMode = 'SINGLE_PLAYER';
    if (state.root) state.root.remove();
    state.root = null;
    if (state.styleNode) state.styleNode.remove();
    state.styleNode = null;
    
    if (state.lobbyRoot) {
      state.lobbyRoot.style.display = 'flex';
      // 同步最新名称
      const userSpan = state.lobbyRoot.querySelector('#gd-lobby-user-span');
      if(userSpan) userSpan.textContent = getUserNickname();
    }
    
    if (document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); }
    else if (document.webkitExitFullscreen) { document.webkitExitFullscreen().catch(()=>{}); }
  }

  // ===== 进入单机模式对局核心控制 =====
  function initGameMatch(mode) {
    clearTimeout(state.bombTimer); state.bombKey = null; state.clockKey = null; state.turnDeadline = null;
    if(mode!=='NET_BATTLE')state.authoritativeSend=null;
    if (mode) state.gameMode = mode === 'NET_BATTLE' ? mode : 'SINGLE_PLAYER';
    if (state.selectedGame !== 'guandan') {
      alert(`温馨提示：当前仅支持“江苏掼蛋”对局，其他游戏开发中，敬请期待！`);
      return;
    }

    if (state.lobbyRoot) {
      state.lobbyRoot.style.display = 'none';
    }

    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);
    if (state.clockTimer) clearInterval(state.clockTimer);
    clearInterval(state.sysClockTimer);

    injectResponsiveStyles(); 

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    // 【需求5：注入最新的玩家昵称】
    SEATS[0].name = getUserNickname();
    state.players = SEATS.map((seat) => ({ ...seat, hand: [], rankOutOrder: null }));
    
    // Fullscreen remains an explicit gesture, not a resize/ordinary-click side effect.

    setTimeout(() => {
      if (state.gameMode !== 'NET_BATTLE') { state.teamLevels = [0, 0]; state.roundNumber = 1; state.currentRankIndex = 0; startNewRound(); }
      bindHandInteraction();
      
      const playBtn = newShell.querySelector('[data-gd-play]');
      const passBtn = newShell.querySelector('[data-gd-pass]');
      const sortBtn = newShell.querySelector('[data-gd-sort]');
      const exitBtn = newShell.querySelector('[data-gd-exit]');
      on(newShell.querySelector('[data-gd-clear]'),'click',()=>{state.selected.clear();renderTable();});
      on(newShell.querySelector('[data-gd-hint]'),'click',()=>{
        state.selected=new Set(hintCards().map(card=>card.id)); renderTable();
        showToast(state.selected.size?'已选建议牌，请确认后出牌':'没有找到简单建议，可自行选牌或不出');
      });

      if (playBtn) on(playBtn, 'click', () => { playGDSound('click'); humanPlay(); });
      if (passBtn) on(passBtn, 'click', () => { playGDSound('click'); if(state.currentTurn === 0 && state.trick) passTurn(0); });
      
      // ===== 【需求7：理牌多重模态循环切换触发器】 =====
      if (sortBtn) on(sortBtn, 'click', () => { 
        playGDSound('click'); 
        state.sortMode = (state.sortMode + 1) % 3; // 0->1->2->0 循环
        state.players[0].hand = sortCards(state.players[0].hand); 
        renderTable(); 
        
        const modesLabel = ["经典排序", "同花聚拢", "组合炸弹"];
        showToast(`已为您切换到：${modesLabel[state.sortMode]}`);
      });
      
      if (exitBtn) on(exitBtn, 'click', () => { playGDSound('click'); destroy(); });

      state.timer = setInterval(triggerAIMove, 200);
      const tickClock = () => { const node = state.root?.querySelector('[data-gd-sys-clock]'); if (node) node.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); };
      tickClock(); state.sysClockTimer = setInterval(tickClock, 15000);
    }, 80);
  }

  // ===== 【需求3 & 4：绑定并激活游戏舱控制大厅】 =====
  function init() {
    injectResponsiveStyles();
    
    let lobby = document.getElementById(LOBBY_ID);
    if (!lobby) {
      lobby = createLobbyShell();
      document.body.appendChild(lobby);
    }
    state.lobbyRoot = lobby;
    state.lobbyRoot.style.display = 'flex';

    // 刷新昵称数据展示(需求5)
    const userSpan = lobby.querySelector('#gd-lobby-user-span');
    if(userSpan) userSpan.textContent = getUserNickname();

    const cards = lobby.querySelectorAll('.gd-game-select-card');
    cards.forEach(card => {
      // 需求4：单击切换选择
      card.onclick = (e) => {
        e.preventDefault();
        cards.forEach(c => c.classList.remove('active-selected'));
        card.classList.add('active-selected');
        state.selectedGame = card.getAttribute('data-game-id');
        playGDSound('click');
      };

      // 需求4：双击直接进入单机版对局
      card.ondblclick = (e) => {
        e.preventDefault();
        state.selectedGame = card.getAttribute('data-game-id');
        state.gameMode = 'SINGLE_PLAYER';
        initGameMatch();
      };
    });

    // 按钮1：单机对局
    const soloBtn = lobby.querySelector('#gd-btn-lobby-solo-trigger');
    if (soloBtn) {
      soloBtn.onclick = (e) => {
        e.preventDefault();
        state.gameMode = 'SINGLE_PLAYER';
        initGameMatch();
      };
    }

    // =========================================================================
    // 按钮2：互联网多端对战模式 —— 🚀 完美升级：穿透直连 Supabase 实时广播联机舱
    // =========================================================================
    const netBtn = lobby.querySelector('#gd-btn-lobby-net-trigger');
    if (netBtn) {
      netBtn.onclick = (e) => {
        e.preventDefault();
        playGDSound('click');
        
        // 熔断老旧的模拟单机版模式
        state.gameMode = 'NET_BATTLE'; 
        
        // 开启联机引擎自愈接管
        if (window.GD_MP && typeof window.GD_MP.startNetMatch === 'function') {
          // 隐藏初始选择大厅
          lobby.style.setProperty('display', 'none', 'important');
          // 拉起联机匹配舱
          window.GD_MP.startNetMatch();
        } else {
          alert("检测到联机数据包 guandan-mp-ext.js 尚未装载，请先在 game.html 中补充引入！");
        }
      };
    }
  }
  
  function secureBindLaunch() {
    init(); 
    
    const btn = document.getElementById('go-guandan-btn');
    if (btn) {
      btn.onclick = (e) => { e.preventDefault(); init(); };
    }
    
    document.addEventListener('click', (e) => {
      const target = e.target.closest('#go-guandan-btn');
      if (target) {
        e.preventDefault();
        init();
      }
    });
  }


  // Thin transport bridge: reuse existing rules; keep seat 0 as the local player.
  function notifyNetworkAction(action) {
    const net = state.network;
    if (!net || net.applying) return;
    net.sequence++;
    net.send({ ...action, seat: (action.seat + net.mySeat) % 4, sequence: net.sequence });
  }

  function createNetworkDeal() {
    const deck = makeDeck();
    return [0, 1, 2, 3].map(seat => deck.filter((_, index) => index % 4 === seat));
  }

  function startNetworkGame(hands, seats, mySeat, turn, send, isHost = false) {
    if (!Array.isArray(hands) || hands.length !== 4 || hands.some(h => !Array.isArray(h) || h.length !== 27) ||
        !Array.isArray(seats) || seats.length !== 4 || !Number.isInteger(mySeat) || mySeat < 0 || mySeat > 3 ||
        !Number.isInteger(turn) || turn < 0 || turn > 3) return false;
    const deck = hands.flat();
    if (typeof send !== 'function' || deck.some(c => !c || typeof c !== 'object')) return false;
    if (new Set(deck.map(c => c.id)).size !== 108 || deck.some(c => typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) ||
      !((c.kind === 'normal' && RANKS.includes(c.rank) && GD_SUITS.some(s => s.key === c.suit)) ||
        (c.kind === 'joker' && ((c.value === 16 && c.label === '小王') || (c.value === 17 && c.label === '大王')))))) return false;
    const composition = new Map();
    for (const card of deck) {
      const key = card.kind === 'joker' ? 'joker:' + card.value : card.suit + ':' + card.rank;
      composition.set(key, (composition.get(key) || 0) + 1);
    }
    if (composition.size !== 54 || [...composition.values()].some(count => count !== 2)) return false;
    if (seats.some(s => !s || typeof s.uid !== 'string' || typeof s.nickname !== 'string')) return false;
    finishOrder = [];
    state.gameMode = 'NET_BATTLE';
    state.currentRankIndex = 0;
    state.network = { mySeat, send, isHost, sequence: 0, applying: false };
    state.players = SEATS.map((seat, local) => {
      const remote = (local + mySeat) % 4;
      return { ...seat, name: seats[remote].nickname.slice(0,128), uid: seats[remote].uid, avatar: window.NobiAvatars?.safe(seats[remote].avatar), isBot: !!seats[remote].isBot, hand: sortCards(hands[remote]), rankOutOrder: null };
    });
    state.cardsById = new Map(deck.map(c => [c.id, c]));
    state.currentTurn = (turn - mySeat + 4) % 4;
    state.selected.clear(); state.trick = null; state.lastPlayedTrick = null; state.playedCards.clear();
    state.active = true; state.busy = false; state.aiDelay = performance.now() + 600;
    clearInterval(state.clockTimer);
    renderTable();
    startCountdown();
    return true;
  }

  function applyNetworkAction(action) {
    const net = state.network;
    if (!net || !action || !Number.isInteger(action.seat) || action.seat < 0 || action.seat > 3 ||
        action.sequence !== net.sequence + 1) return false;
    const seat = (action.seat - net.mySeat + 4) % 4;
    if (seat !== state.currentTurn) return false;
    net.applying = true;
    let ok = false;
    try {
      if (action.type === 'PLAY_CARDS' && Array.isArray(action.cardIds)) {
        const cards = action.cardIds.map(id => state.cardsById.get(id));
        ok = playCards(seat, cards);
      } else if (action.type === 'PASS_TURN') ok = passTurn(seat);
      if (ok) net.sequence = action.sequence;
      return ok;
    } finally { net.applying = false; }
  }

  const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function applyAuthoritySnapshot(snapshot, send, connected=true) {
    if(!state.root) initGameMatch('NET_BATTLE');
    const mySeat=snapshot.privateState.seat, pub=snapshot.publicState;
    const localSeat=remote=>(remote-mySeat+4)%4;
    state.authoritativeSend=send;state.gameMode='NET_BATTLE';state.network={mySeat,isHost:false,send:()=>{},sequence:snapshot.version};
    state.standardMode=snapshot.rulesVersion==='guandan-standard-v1';state.authorityPublic=pub;state.ranked=!!snapshot.competitive;state.tributeOptions=snapshot.privateState.tributeOptions??[];
    if(state.standardMode&&!state.standardRules&&!state.rulesLoading){state.rulesLoading=true;import('./ui/guandan-rules.mjs').then(rules=>{state.standardRules=rules;renderTable();}).catch(()=>showToast('规则模块无法载入，请刷新'));}
    state.currentRankIndex=Math.max(0,RANKS.indexOf(pub.level??'2'));state.currentTurn=localSeat(snapshot.currentTurn);
    state.players=SEATS.map((base,local)=>{const remote=(local+mySeat)%4;return {...base,name:snapshot.players[remote]?.nickname??'等待加入',userId:snapshot.players[remote]?.userId,avatar:window.NobiAvatars?.safe(snapshot.players[remote]?.avatar),isBot:false,hand:local===0?snapshot.privateState.hand:{length:pub.handCounts?.[remote]??0},rankOutOrder:pub.finishOrder?.includes(remote)?pub.finishOrder.indexOf(remote)+1:null};});
    const rotate=trick=>trick?{...trick,seat:localSeat(trick.seat)}:null;
    state.trick=rotate(pub.trick);state.lastPlayedTrick=rotate(pub.lastPlayedTrick);
    if(state.counterKey!==snapshot.roomId){state.counterKey=snapshot.roomId;state.playedCards.clear();state.seatActions=[null,null,null,null];}rememberPlayed(pub.lastPlayedTrick?.cards);
    if(!state.trick)state.seatActions=[null,null,null,null];if(state.lastPlayedTrick&&state.trick)state.seatActions[state.lastPlayedTrick.seat]={text:state.lastPlayedTrick.type||'出牌',kind:'play'};
    state.cardsById=new Map([...snapshot.privateState.hand,...(pub.lastPlayedTrick?.cards??[])].map(card=>[card.id,card]));
    if(state.authorityVersion!==snapshot.version){state.selected.clear();state.combination=null;}state.authorityVersion=snapshot.version;
    state.active=snapshot.status==='playing'&&connected;state.busy=false;
    state.turnDeadline=Number.isFinite(snapshot.deadline)?snapshot.deadline:null;
    const clockKey=[snapshot.roomId,snapshot.currentTurn,snapshot.deadline,state.active,pub.phase].join(':');
    renderTable();
    if(state.clockKey!==clockKey){state.clockKey=clockKey;startCountdown();}
    if(snapshot.status==='ended'){const status=state.root.querySelector('[data-gd-center-status]');if(status)status.textContent='本局已结束';}
  }
  Object.assign(GD, { applyAuthoritySnapshot, init, destroy, startNewRound, initGameMatch, createNetworkDeal, startNetworkGame, applyNetworkAction });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', secureBindLaunch, { once: true });
  } else {
    secureBindLaunch();
  }
  // 🌟【最核心修复：打破隔离】向全局 window 直接暴露出无阻碍启动接口
 /* window.initGuandanDirectMatch = function(mode) {
    console.log("[公开网关] 接收到大厅直通掼蛋指令，突入游戏画布。");
    internalState.playMode = mode;
    internalState.tributeDone = false;
    internalState.handCards = []; // 重置手牌
    applyFullScreenStyles();
    renderView();
  };

  // 保持与老代码对象的兼容性
  window.GD = window.GD || {};
  window.GD.initGameMatch = window.initGuandanDirectMatch;*/
})();
