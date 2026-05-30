/**
 * guandan-game.js (Version 5.0 - 大厅美化与交互跃升旗舰版)
 * 掼蛋扑克游戏扩展包
 * 【功能全面升级：蓝白重叠牌背、移动端手牌比例修复、多模态智能理牌、全新模式选择舱】
 */
(() => {
  'use strict';

  // ===== 全局静态常量与配置 =====
  const CARD_W = 74; 
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
    return window.USER_NICKNAME || localStorage.getItem('username') || localStorage.getItem('nickname') || '南家 (你)';
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
    countdown: 20,
    clockTimer: null,
    touchStart: { x: 0, y: 0, time: 0 },
    sortMode: 0 // 0:常规大小, 1:同花优先, 2:炸弹张数优先 (需求7)
  };

  GD.state = state;

  const getCurrentRankStr = () => RANKS[state.currentRankIndex] || '2';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
  function getCardValue(card) {
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
      return valA - valB || a.suit.localeCompare(b.suit);
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
        <div class="gd-landscape-tips-icon">🔄</div>
        <h3 style="font-size:16px;">请旋转手机至横屏模式</h3>
        <p style="color: #94a3b8; font-size:12px; margin-top:6px;">推荐开启系统自动旋转，横屏即可享受全屏对局</p>
        <button id="gd-fullscreen-trigger" style="margin-top: 15px; padding: 6px 18px; background: #10b981; border:none; color:white; font-weight:bold; border-radius:15px; font-size:12px; pointer-events:auto;">进入全屏对局</button>
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
            <button class="gd-btn-sort" data-gd-sort>理 牌<span style="font-size:9px;position:absolute;top:-2px;right:4px;" data-gd-sort-tag>▼</span></button>
          </div>
          <div class="gd-clock-panel" data-gd-clock-panel>
            <span class="gd-clock-icon">⏱</span>
            <span data-gd-clock-time>20s</span>
          </div>
          <div class="gd-player-wrap" data-gd-player-zone style="display:none;"></div>
          <div class="gd-hand" data-gd-hand></div>
        </div>
      </div>
      <div class="gd-toast" data-gd-toast></div>
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
    
    for (let i = 0; i < deck.length; i++) {
      state.players[i % 4].hand.push(deck[i]);
    }
    
    // 动态同步最新的名字(需求5)
    if(state.players[0]) state.players[0].name = getUserNickname();
    
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
        <img src="${imgUrl}" alt="${rankLabel(card)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%22110%22><rect width=%22100%%22 height=%22100%%22 fill=%22white%22 stroke=%22%23ccc%22 stroke-width=%222%22/><text x=%2250%%22 y=%2250%%22 font-size=%2214%22 font-weight=%22bold%22 fill=%22%23333%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>${rankLabel(card)}</text></svg>'" />
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

      let backsHTML = '';
      if (idx !== 0 && cardCount > 0 && state.active) {
        backsHTML = '<div class="gd-opp-hand-wrapper">';
        for (let i = 0; i < cardCount; i++) {
          backsHTML += '<div class="gd-opp-card-back"></div>';
        }
        backsHTML += '</div>';
      }

      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">${rankString}</div>
        </div>
        ${backsHTML} 
      `;
    });

    const centerStatus = state.root.querySelector('[data-gd-center-status]');
    if (centerStatus && state.active) {
      const activePlayer = state.players[state.currentTurn];
      if (activePlayer) {
        centerStatus.className = 'gd-center-status-bar';
        if (state.currentTurn === 0) {
          centerStatus.classList.add('my-turn');
          centerStatus.textContent = `到你出牌 (上划或右击直接出牌)`;
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
    const sortTag = root.querySelector('[data-gd-sort-tag]');

    // 理牌按钮标志动态渲染
    if (sortTag) {
      const modesStr = ["▼", "♣", "🔥"];
      sortTag.textContent = modesStr[state.sortMode] || "▼";
    }

    if (trick) {
      if (state.lastPlayedTrick) {
        const pName = state.players[state.lastPlayedTrick.seat]?.name || '未知';
        const cardsHTML = state.lastPlayedTrick.cards.map(formatCard).join('');
        
        trick.innerHTML = `
          <div class="gd-trick-owner">✦ ${pName} 出牌 ✦</div>
          <div class="gd-trick-cards-wrap" style="margin-top:10px;">${cardsHTML}</div>
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
      if (state.players[next].hand.length > 0) {
        return next;
      }
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
          levelGained = 3;
          winMsg = `🎉 完胜！南北同盟达成了【双下】！主级连升 3 级！`;
        } else if (state.players[0].rankOutOrder === 1 && state.players[2].rankOutOrder === 2) {
          levelGained = 3;
          winMsg = `🎉 包揽前两名！主级连升 3 级！`;
        } else {
          levelGained = 2;
          winMsg = `👍 获胜！主级提升 2 级！`;
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
      else if (element.mozRequestFullScreen) { element.mozRequestFullScreen(); }
      else if (element.msRequestFullscreen) { element.msRequestFullscreen(); }
      setTimeout(() => { window.scrollTo(0, 1); }, 120);
    } catch (e) {
      console.warn('全屏触发受限:', e);
    }
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

      if (deltaY < -25 && Math.abs(deltaX) < 60 && duration < 300) {
        const cardDOM = e.target.closest('.gd-card');
        if (cardDOM && state.currentTurn === 0 && state.active) {
          const id = cardDOM.getAttribute('data-card-id');
          if (id) state.selected.add(id);
        }
        humanPlay();
        return;
      }

      if (Math.abs(deltaY) < 15 && Math.abs(deltaX) < 15) {
        const cardDOM = e.target.closest('.gd-card');
        if (!cardDOM || state.currentTurn !== 0 || !state.active) return;
        
        e.preventDefault(); 
        
        const id = cardDOM.getAttribute('data-card-id');
        if (state.selected.has(id)) {
          state.selected.delete(id);
        } else {
          state.selected.add(id);
        }
        playGDSound('click');
        renderTable();
      }
    });

    on(hand, 'click', (e) => {
      if (e.pointerType === 'touch') return; 
      const cardDOM = e.target.closest('.gd-card');
      if (!cardDOM || state.currentTurn !== 0 || !state.active) return;
      const id = cardDOM.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });

    on(hand, 'contextmenu', (e) => {
      e.preventDefault(); 
      if (state.currentTurn !== 0 || !state.active) return;
      const cardDOM = e.target.closest('.gd-card');
      if (cardDOM) {
        const id = cardDOM.getAttribute('data-card-id');
        if (id && !state.selected.has(id)) { 
          state.selected.add(id); 
        }
      }
      renderTable();
      humanPlay(); 
    });

    const handleOrientationChange = () => {
      const isLandscape = window.innerWidth > window.innerHeight || (screen.orientation && screen.orientation.type.includes('landscape'));
      if (isLandscape && state.active) {
        executeFullscreen(container);
      }
    };
    on(window, 'resize', handleOrientationChange);
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
    state.active = false; offAll();
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
  function initGameMatch() {
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

    injectResponsiveStyles(); 

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    // 【需求5：注入最新的玩家昵称】
    SEATS[0].name = getUserNickname();
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

      on(newShell, 'click', () => {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape && !document.fullscreenElement && !document.webkitFullscreenElement) {
          executeFullscreen(newShell);
        }
      }, { capture: true });

      state.timer = setInterval(triggerAIMove, 200);
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

    // 按钮2：互联网多端对战模式
    const netBtn = lobby.querySelector('#gd-btn-lobby-net-trigger');
    if (netBtn) {
      netBtn.onclick = (e) => {
        e.preventDefault();
        state.gameMode = 'NET_BATTLE';
        playGDSound('click');
        alert(`进入互联网对战联机大厅：\n正在为玩家【${getUserNickname()}】寻找云服务器可用房间端口... \n目前联机对决需结合线上 Supabase 实时流，正在排队中！`);
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

  Object.assign(GD, { init, destroy, startNewRound, initGameMatch });

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