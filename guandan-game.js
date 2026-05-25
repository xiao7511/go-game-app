/**
 * guandan-game.js (Version 2.1 - 稳定触控全屏版)
 * 掼蛋扑克游戏扩展包
 * 【修复：点击选牌失效、全屏自动隐藏地址栏、重构出牌区防遮挡布局】
 */
(() => {
  'use strict';

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  
  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  
  // 基础卡牌尺寸，移动端由 CSS 动态等比缩放
  const CARD_W = 85; 
  
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
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
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
      #${ROOT_ID} { 
        position: fixed; 
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh; /* 动态响应视口，防止因地址栏弹出导致变形 */
        z-index: 9999; 
        background: radial-gradient(circle at center, #124d24 0%, #051a0d 100%); 
        color: #f5f7f4; 
        font-family: system-ui, -apple-system, sans-serif; 
        display: flex; 
        flex-direction: column; 
        overflow: hidden; 
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
      }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; z-index: 1010; pointer-events: none; }
      .gd-header-info { background: rgba(0,0,0,0.65); padding: 5px 14px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.35); font-size: 12px; font-weight: bold; pointer-events: auto; box-shadow: 0 3px 10px rgba(0,0,0,0.4); backdrop-filter: blur(4px); }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 3px; }
      .gd-exit-btn { background: linear-gradient(180deg, #ff5252 0%, #c92a2a 100%); color: white; border: none; padding: 5px 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; pointer-events: auto; box-shadow: 0 3px 8px rgba(0,0,0,0.3); }
      
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 0; }
      
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; pointer-events: none; }
      .gd-seat.top { top: 40px; left: 50%; transform: translateX(-50%); } 
      .gd-seat.left { left: 16px; top: 42%; transform: translateY(-50%); }
      .gd-seat.right { right: 16px; top: 42%; transform: translateY(-50%); }
      .gd-seat.bottom { bottom: 0; left: 0; right: 0; width: 100%; display: flex; flex-direction: column; align-items: center; z-index: 100; pointer-events: none; }
      
      .gd-action-bar { display: none; gap: 16px; justify-content: center; height: 38px; margin-bottom: 6px; z-index: 105; pointer-events: auto; width: 100%; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: 1px solid rgba(255,255,255,0.3); padding: 0 26px; border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.4); text-shadow: 0 1px 2px rgba(0,0,0,0.6); transition: transform 0.1s; -webkit-tap-highlight-color: transparent; }
      .gd-action-bar button:active { transform: scale(0.92); }
      .gd-btn-play { background: linear-gradient(180deg, #10b981 0%, #047857 100%); color: white; border-color: #34d399 !important; }
      .gd-btn-pass { background: linear-gradient(180deg, #64748b 0%, #334155 100%); color: white; }
      .gd-btn-sort { background: linear-gradient(180deg, #06b6d4 0%, #0369a1 100%); color: white; }
      .gd-action-bar button:disabled { background: linear-gradient(180deg, #334155 0%, #1e293b 100%) !important; color: #64748b !important; cursor: not-allowed; box-shadow: none; text-shadow: none; opacity: 0.5; border-color: transparent !important; }
      
      .gd-clock-panel { display: none; background: rgba(0,0,0,0.8); padding: 2px 12px; border-radius: 12px; border: 1px solid #10b981; margin-bottom: 6px; font-size: 12px; font-weight: bold; align-items: center; gap: 4px; color: #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.3); z-index: 104; }
      .gd-clock-panel.show { display: flex; }
      .gd-clock-icon { color: #10b981; animation: gd-pulse 1s infinite; font-size: 12px; }
      
      .gd-player-info { background: rgba(0,10,5,0.7); padding: 4px 10px; border-radius: 8px; text-align: center; min-width: 85px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
      .gd-player-info.active { border-color: #f59e0b; background: rgba(20,40,25,0.85); box-shadow: 0 0 10px #f59e0b; }
      .gd-player-name { font-weight: bold; font-size: 11px; color: #fff; }
      .gd-player-detail { font-size: 10px; color: #f59e0b; margin-top: 1px; }
      
      /* 出牌容器重构：完全独立图层，控高控位，永不跟底部手牌按钮重合 */
      .gd-center-table { 
        position: absolute; 
        width: 72vw; 
        height: 42vh; 
        max-width: 640px; 
        max-height: 220px; 
        top: 24%;
        border: 1px dashed rgba(255,215,0,0.15); 
        border-radius: 30px; 
        display: flex; 
        flex-direction: column; 
        justify-content: flex-start; 
        align-items: center; 
        background: rgba(0, 0, 0, 0.2); 
        padding: 8px 0; 
        box-shadow: inset 0 0 30px rgba(0,0,0,0.6); 
        pointer-events: none;
        z-index: 40;
      }
      
      .gd-center-status-bar { width: auto; max-width: 90%; background: rgba(0, 0, 0, 0.6); padding: 3px 16px; font-size: 11px; font-weight: bold; color: #94a3b8; text-align: center; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); letter-spacing: 0.5px; }
      .gd-center-status-bar.my-turn { color: #34d399; animation: gd-text-pulse 1.2s infinite alternate; border-color: rgba(52,211,153,0.3); }
      
      .gd-trick { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; flex: 1; position: relative; }
      .gd-trick-cards-wrap { display: flex; justify-content: center; align-items: center; width: 100%; max-height: 110px; padding: 4px 10px; overflow: visible; }
      .gd-trick-empty { font-size: 12px; color: rgba(255,255,255,0.15); font-weight: bold; margin-top: 25px; letter-spacing: 1px; }
      .gd-trick-owner { color: #f59e0b; font-size: 11px; font-weight: bold; padding: 2px 12px; text-shadow: 0 1px 3px rgba(0,0,0,0.9); width: 100%; text-align: center; position: absolute; top: 0; }
      
      /* 手牌容器：保障触摸事件畅通无阻 */
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 95px; width: 100%; max-width: 100vw; pointer-events: auto; padding: 2px 12px 6px 12px; z-index: 110; overflow: visible; }
      
      /* 用户手牌尺寸 */
      .gd-card { width: ${CARD_W}px; height: 112px; position: relative; margin-left: -61px; transition: transform 0.15s cubic-bezier(0.18, 0.9, 0.22, 1); border-radius: 6px; cursor: pointer; transform-origin: bottom center; }
      .gd-card:first-child { margin-left: 0 !important; }
      .gd-card img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; filter: drop-shadow(-2px 2px 3px rgba(0,0,0,0.35)); }
      
      /* 出牌区卡牌：极其重要的紧凑层叠，多张牌绝不溢出遮挡 */
      .gd-trick .gd-card { margin-left: -36px; pointer-events: none; height: 74px; width: 53px; box-shadow: 0 2px 5px rgba(0,0,0,0.4) !important; }
      .gd-trick .gd-card:first-child { margin-left: 0 !important; }
      
      /* 弹起选中高度 */
      .gd-card.sel { transform: translateY(-18px) !important; }
      .gd-card.sel img { filter: drop-shadow(0px 4px 8px rgba(245,158,11,0.85)) saturate(1.1); }
      
      .gd-wild-card img { filter: drop-shadow(0 0 8px #ef4444) !important; }
      .gd-rank-card img { filter: drop-shadow(0 0 5px #f59e0b) !important; }
      
      .gd-toast { position: fixed; top: 18%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); border: 1px solid #f59e0b; color: #fff; padding: 6px 18px; border-radius: 30px; font-size: 12px; font-weight: bold; z-index: 2000; opacity: 0; transition: opacity 0.2s ease; pointer-events: none; backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
      
      /* 强制横屏与引导覆层 */
      @media screen and (orientation: portrait) {
        .gd-landscape-tips { display: flex !important; }
      }
      .gd-landscape-tips {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100vw; height: 100vh;
        background: #04140a;
        z-index: 100000;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: #f59e0b;
        text-align: center;
        padding: 24px;
      }
      .gd-landscape-tips-icon { font-size: 44px; margin-bottom: 16px; animation: gd-rotate-phone 1.8s infinite ease-in-out; }

      /* 极致低高度刘海屏精细适配 */
      @media screen and (max-height: 480px) {
        .gd-card { height: 86px; width: 62px; margin-left: -47px; }
        .gd-card.sel { transform: translateY(-14px) !important; }
        .gd-trick .gd-card { height: 58px; width: 42px; margin-left: -26px; }
        .gd-center-table { top: 18%; height: 38vh; max-height: 165px; }
        .gd-hand { min-height: 72px; padding-bottom: 2px; }
        .gd-seat.top { top: 36px; }
        .gd-action-bar { height: 34px; margin-bottom: 3px; }
        .gd-action-bar button { font-size: 12px; padding: 0 20px; }
      }

      @keyframes gd-rotate-phone {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(-90deg); }
        100% { transform: rotate(0deg); }
      }
      @keyframes gd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes gd-text-pulse { 0% { text-shadow: 0 0 2px rgba(52,211,153,0.3); } 100% { text-shadow: 0 0 8px rgba(52,211,153,0.8); } }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-landscape-tips" id="gd-landscape-tips">
        <div class="gd-landscape-tips-icon">🔄</div>
        <h3 style="font-size:18px;">请旋转手机至横屏模式</h3>
        <p style="color: #94a3b8; font-size:13px; margin-top:8px;">推荐开启系统自动旋转，横屏即可享受全屏对局</p>
        <button id="gd-fullscreen-trigger" style="margin-top: 18px; padding: 8px 22px; background: #10b981; border:none; color:white; font-weight:bold; border-radius:20px; font-size:13px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events:auto;">进入全屏对局</button>
      </div>

      <div class="gd-header">
        <div class="gd-header-info">当前主级: 打 <span data-gd-rank>${getCurrentRankStr()}</span> | 桌上牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
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
    deck.forEach((card, idx) => { state.players[idx % 4].hand.push(card); });
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
    if (n >= 4 && (allSame || (counts.length <= 2 && wildCount >= 1))) return { type: '炸弹', weight: values[0 * 100] + n, size: n };
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
      imgUrl = `./images/cards/joker-${card.label === '大王' ? 'red' : 'black'}.png`;
    } else {
      imgUrl = `./images/cards/${rankName}_of_${suitName}.png`;
    }

    return `
      <div class="gd-card ${extraClass}" data-card-id="${card.id}" style="
        background: #ffffff; 
        border: 1px solid rgba(0,0,0,0.12); 
        border-radius: 5px; 
        box-shadow: 0 2px 5px rgba(0,0,0,0.25);
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        overflow: hidden;
      ">
        <img src="${imgUrl}" alt="${rankLabel(card)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%22110%22><rect width=%22100%%22 height=%22100%%22 fill=%22white%22 stroke=%22%23ccc%22 stroke-width=%222%22/><text x=%2250%%22 y=%2250%%22 font-size=%2215%22 font-weight=%22bold%22 fill=%22%23333%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>${rankLabel(card)}</text></svg>'" />
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
      else if (p.rankOutOrder === 2) rankString = '🥈二游';
      else if (p.rankOutOrder === 3) rankString = '🥉三游';
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
          centerStatus.textContent = `到你出牌 (可点选或向上滑快速出牌)`;
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
          <div class="gd-trick-cards-wrap" style="margin-top:14px;">${cardsHTML}</div>
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

  // 核心：处理并执行标准沉浸式全屏，隐藏地址栏
  function execute沉浸式全屏(element) {
    if (!element) return;
    try {
      if (element.requestFullscreen) { element.requestFullscreen(); }
      else if (element.webkitRequestFullscreen) { element.webkitRequestFullscreen(); }
      else if (element.mozRequestFullScreen) { element.mozRequestFullScreen(); }
      else if (element.msRequestFullscreen) { element.msRequestFullscreen(); }
      
      // 辅助机制：轻微滚动页面，触发浏览器的隐藏导航栏行为
      setTimeout(() => { window.scrollTo(0, 1); }, 100);
    } catch (e) {
      console.warn('全屏触发受限或不支持:', e);
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
        execute沉浸式全屏(container);
      });
    }

    // 核心重构：无冲突移动端触控系统
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

      // 1. 识别向上滑动手势（划牌快速出牌）
      if (deltaY < -40 && Math.abs(deltaX) < 50 && duration < 300) {
        humanPlay();
        return;
      }

      // 2. 识别轻触事件（精准选牌）
      if (Math.abs(deltaY) < 8 && Math.abs(deltaX) < 8) {
        const cardDOM = e.target.closest('.gd-card');
        if (!cardDOM || state.currentTurn !== 0 || !state.active) return;
        
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

    // 保留PC鼠标点击支持
    on(hand, 'click', (e) => {
      if (e.pointerType === 'touch') return; // 阻止移动端重复响应
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
        if (!state.selected.has(id)) { state.selected.add(id); renderTable(); }
      }
      humanPlay();
    });
  }

  function destroy() {
    clearInterval(state.timer);
    clearInterval(state.clockTimer);
    state.active = false; offAll();
    if (state.root) state.root.remove();
    if (state.styleNode) state.styleNode.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
    
    if (document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); }
    else if (document.webkitExitFullscreen) { document.webkitExitFullscreen().catch(()=>{}); }
  }

  function init() {
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);
    if (state.clockTimer) clearInterval(state.clockTimer);

    injectResponsiveStyles(); 
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    state.currentRankIndex = 0; 

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    state.players = SEATS.map((seat) => ({ ...seat, hand: [], rankOutOrder: null }));
    
    // 按钮按下行为触发全屏
    execute沉浸式全屏(newShell);

    setTimeout(() => {
      startNewRound();
      bindHandInteraction();
      
      const playBtn = newShell.querySelector('[data-gd-play]');
      const passBtn = newShell.querySelector('[data-gd-pass]');
      const sortBtn = newShell.querySelector('[data-gd-sort]');
      const exitBtn = newShell.querySelector('[data-gd-exit]');

      if (playBtn) on(playBtn, 'click', () => { playGDSound('click'); humanPlay(); });
      if (passBtn) on(passBtn, 'click', () => { playGDSound('click'); if(state.trick) passTurn(0); });
      if (sortBtn) on(sortBtn, 'click', () => { 
        playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
      });
      if (exitBtn) on(exitBtn, 'click', () => { playGDSound('click'); destroy(); });

      state.timer = setInterval(triggerAIMove, 200);
    }, 100);
  }
  
  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    btn.onclick = (e) => { e.preventDefault(); init(); };
  }

  Object.assign(GD, { init, destroy, startNewRound, playGDSound, injectResponsiveStyles, triggerAIMove });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();