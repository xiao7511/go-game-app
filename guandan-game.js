/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 - 独立倒计时悬浮版（带手牌全面修复与按钮强弹机制）
 * 2026-05-24 重构版
 */
(() => {
  'use strict';

  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 75; // 扑克牌标准宽度

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  const GD_SUITS = [
    { key: 'S', symbol: GD_ICON_SUITS.SPADE, color: 'black' },
    { key: 'H', symbol: GD_ICON_SUITS.HEART, color: 'red' },
    { key: 'C', symbol: GD_ICON_SUITS.CLUB, color: 'black' },
    { key: 'D', symbol: GD_ICON_SUITS.DIAMOND, color: 'red' },
  ];
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 3]));
  const SEATS = [
    { id: 0, name: '南家 (你)', short: 'South', pos: 'bottom' },
    { id: 1, name: '东家', short: 'East', pos: 'right' },
    { id: 2, name: '北家 (对家)', short: 'North', pos: 'top' },
    { id: 3, name: '西家', short: 'West', pos: 'left' },
  ];

  const state = {
    gameMode: 'SINGLE_PLAYER',
    currentRank: 2,
    currentTurn: 0,
    selected: new Set(),
    players: [],
    trick: null,
    timer: null,
    root: null,
    styleNode: null,
    active: false,
    busy: false,
    cardsById: new Map(),
    listeners: [],
    aiDelay: 0,
    turnCountdown: 30, // 30秒倒计时
    lastCountdownTick: 0
  };

  GD.state = state;

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sortCards = (cards) => cards.slice().sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
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
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    if (type === 'click') {
      o.type = 'sine'; o.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.start(t); o.stop(t + 0.06); return;
    }
    if (type === 'warn') {
      o.type = 'sine'; o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.start(t); o.stop(t + 0.09); return;
    }
  }

  function typeOf(cards) {
    const n = cards.length;
    if (!n) return null;
    const values = cards.map((c) => c.value);
    const grouped = new Map();
    for (const c of cards) {
      if (!grouped.has(c.value)) grouped.set(c.value, []);
      grouped.get(c.value).push(c);
    }
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    if (n === 1) return { type: 'single', weight: values[0], size: 1 };
    if (n === 2 && counts.length === 1) return { type: 'pair', weight: values[0], size: 2 };
    if (n === 3 && counts.length === 1) return { type: 'triple', weight: values[0], size: 3 };
    if (n >= 4 && counts.length === 1) return { type: 'bomb', weight: values[0] * 100 + n, size: n };
    return null;
  }

  function beats(next, prev) {
    if (next.type === 'bomb' && prev.type !== 'bomb') return true;
    if (next.type === 'bomb' && prev.type === 'bomb') {
      if (next.size !== prev.size) return next.size > prev.size;
      return next.weight > prev.weight;
    }
    return next.type === prev.type && next.size === prev.size && next.weight > prev.weight;
  }

  function formatCard(card) {
    return `
      <div class="gd-card ${card.color}" data-card-id="${card.id}">
        <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
        <span class="center">${card.symbol}</span>
        <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
      </div>`;
  }

  // 🌟 全新构建的高沉浸样式：重点在于倒计时完全剥离、高亮悬浮在头像上方内侧
  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #14441e 0%, #061509 100%); color: #f5f7f4; font-family: system-ui, sans-serif; display: flex; flex-direction: column; overflow: hidden; user-select: none; }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; z-index: 100; pointer-events: none; }
      .gd-header-info { background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.3); pointer-events: auto; font-size: 13px; }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 4px; }
      .gd-exit-btn { pointer-events: auto; background: #e63946; color: white; border: none; padding: 6px 14px; border-radius: 8px; font-weight: bold; cursor: pointer; }
      
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      /* 座位外壳统一调整 */
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; }
      .gd-seat.top { top: 15px; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; } 
      .gd-seat.bottom { bottom: 10px; left: 50%; transform: translateX(-50%); width: 95%; max-width: 1000px; }
      .gd-seat.left { left: 15px; top: 45%; transform: translateY(-50%); flex-direction: row-reverse; gap: 10px; }
      .gd-seat.right { right: 15px; top: 45%; transform: translateY(-50%); flex-direction: row; gap: 10px; }
      
      /* 头像信息框 */
      .gd-player-info { background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 12px; text-align: center; min-width: 120px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 8px rgba(0,0,0,0.4); }
      .gd-player-info.active { border-color: #FFD700; box-shadow: 0 0 15px rgba(255, 215, 0, 0.4); }
      .gd-player-name { font-weight: bold; font-size: 13px; color: #fff; }
      .gd-player-detail { font-size: 11px; color: #FFD700; margin-top: 2px; }
      
      /* ⏱️ 核心优化：完全独立、置于区域上端/内侧的倒计时钟表 */
      .gd-timer-box { display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; color: #00ff66; border: 1px solid #00ff66; box-shadow: 0 0 10px rgba(0,255,102,0.4); margin: 6px; animation: gdScaleIn 0.15s ease-out; }
      @keyframes gdScaleIn { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      
      /* 倒计时最后十秒变红闪烁 */
      .gd-timer-box.danger { color: #ff3333 !important; border-color: #ff3333 !important; box-shadow: 0 0 12px #ff3333 !important; animation: gdFlash 0.5s infinite alternate; }
      @keyframes gdFlash { from { opacity: 0.5; } to { opacity: 1; } }
      
      /* 核心操作控制栏（绝对强弹） */
      .gd-action-bar { display: none; gap: 15px; margin-bottom: 12px; justify-content: center; z-index: 999; width: 100%; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: none; padding: 8px 24px; border-radius: 20px; font-weight: bold; font-size: 14px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.4); }
      .gd-btn-play { background: linear-gradient(180deg, #ffe066 0%, #f59f00 100%); color: #343a40; }
      .gd-btn-pass { background: #e9ecef; color: #495057; }
      .gd-btn-sort { background: #2b8a3e; color: white; }
      .gd-action-bar button:disabled { background: #495057 !important; color: #868e96 !important; cursor: not-allowed; box-shadow: none; }
      
      /* 玩家手牌布局自适应平铺（防卡死重叠） */
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 120px; width: 100%; margin-top: 5px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 8px; }
      
      /* 扑克实体表现 */
      .gd-card { width: ${CARD_W}px; height: 105px; position: relative; background: #ffffff; border-radius: 6px; box-shadow: -3px 3px 6px rgba(0,0,0,0.3); margin-left: calc(-1 * (${CARD_W}px - 2.5vw)); transition: transform 0.1s, border-color 0.1s; color: #000; border: 1px solid #ccc; }
      .gd-card:first-child { margin-left: 0 !important; }
      .gd-card.sel { transform: translateY(-25px) !important; border: 2px solid #ff9f00 !important; box-shadow: 0 6px 12px rgba(255,159,0,0.5); }
      .gd-card:hover { z-index: 999 !important; transform: translateY(-10px); }
      
      .gd-card.red { color: #d94111; }
      .gd-card.black { color: #212529; }
      .gd-card .corner { position: absolute; font-size: 16px; line-height: 1.1; padding: 2px 4px; display: flex; flex-direction: column; align-items: center; font-weight: bold; }
      .gd-card .tl { top: 2px; left: 2px; }
      .gd-card .br { bottom: 2px; right: 2px; transform: rotate(180deg); }
      .gd-card .center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; opacity: 0.85; }
      
      .gd-center-table { position: absolute; width: 450px; height: 180px; border: 2px dashed rgba(255,255,255,0.15); border-radius: 90px; display: flex; justify-content: center; align-items: center; }
      .gd-trick { display: flex; justify-content: center; align-items: center; }
      .gd-trick-empty { font-size: 14px; opacity: 0.4; }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-header">
        <div class="gd-header-info">主级: <span data-gd-rank>${state.currentRank}</span> | 当前牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>
      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>
        <div class="gd-center-table"><div class="gd-trick" data-gd-trick></div></div>
        <div class="gd-seat bottom" data-gd-seat="0">
          <div class="gd-action-bar" data-gd-action-bar>
            <button class="gd-btn-play" data-gd-play>出牌</button>
            <button class="gd-btn-pass" data-gd-pass>过牌</button>
            <button class="gd-btn-sort" data-gd-sort>整理</button>
          </div>
          <div class="gd-hand" data-gd-hand></div>
        </div>
      </div>
    `;
    return root;
  }

  function makeDeck() {
    const deck = [];
    for (let d = 0; d < 2; d++) {
      for (const suit of GD_SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: uid(), kind: 'normal', rank, suit: suit.key, symbol: suit.symbol, color: suit.color, value: RANK_VALUE[rank] });
        }
      }
      deck.push({ id: uid(), kind: 'joker', label: '小王', rank: 'w', suit: 'J', symbol: '🃏', color: 'red', value: 16 });
      deck.push({ id: uid(), kind: 'joker', label: '大王', rank: 'W', suit: 'J', symbol: '🃏', color: 'black', value: 17 });
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.cardsById = new Map(deck.map((c) => [c.id, c]));
    return deck;
  }

  function initDeckAndPlayers() {
    const deck = makeDeck();
    state.players = SEATS.map((seat) => ({ id: seat.id, name: seat.name, pos: seat.pos, hand: [] }));
    deck.forEach((card, idx) => { state.players[idx % 4].hand.push(card); });
    state.players.forEach((p) => { p.hand.sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit)); });
    state.selected.clear();
    state.currentTurn = 0; 
    state.trick = null;
    state.turnCountdown = 30;
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1000;
  }

  // 🌟 独立时钟核心渲染：将倒计时单独拿出来，以独立盒子形式追加到信息框外部上方
  function renderSeats() {
    const container = document.getElementById(ROOT_ID);
    if (!container) return;
    SEATS.forEach((seat, idx) => {
      const seatNode = container.querySelector(`[data-gd-seat="${idx}"]`);
      if (!seatNode) return;
      const p = state.players[idx];
      if (!p) return;

      const isActive = state.currentTurn === idx;
      let timerHtml = '';
      if (isActive) {
        const isDanger = state.turnCountdown <= 10;
        timerHtml = `<div class="gd-timer-box ${isDanger ? 'danger' : ''}">⏱️ ${Math.ceil(state.turnCountdown)}s</div>`;
      }

      // 重构核心：玩家信息框中不再含有倒计时，倒计时根据 top/bottom 位置规则显示在更靠内侧的上方
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">剩余 ${p.hand.length} 张</div>
        </div>
        ${timerHtml}
      `;
    });
  }

  // 🌟 全局桌面与手牌高精渲染
  function renderTable() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    if (!hand || !trick) return;

    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      if (move) move.textContent = `数量: ${state.trick.cards.length}张`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌...</span>`;
      if (move) move.textContent = '—';
    }

    // 渲染南家手牌
    const me = state.players[0];
    if (me && me.hand) {
      hand.innerHTML = me.hand.map((card, i) => {
        return `
          <div class="gd-card ${card.color}" data-card-id="${card.id}" style="z-index: ${20 + i};">
            <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
            <span class="center">${card.symbol}</span>
            <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
          </div>`;
      }).join('');

      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
      });
    }

    // 🚀 控制面板绝对强制显示逻辑
    if (actionBar) {
      if (state.currentTurn === 0 && me && me.hand.length > 0) {
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

  function changeTurn(nextSeat) {
    state.currentTurn = nextSeat;
    state.turnCountdown = 30;
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1000;
    renderTable();
  }

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;
    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    changeTurn((seat + 1) % 4);
    return true;
  }

  function passTurn(seat) {
    if (state.trick && state.trick.seat === ((seat + 1) % 4)) {
      state.trick = null;
    }
    changeTurn((seat + 1) % 4);
  }

  // 心跳主循环，维护高精倒计时与AI自动挂载
  function gameHeartbeatLoop() {
    if (!state.active || state.busy) return;
    const now = performance.now();
    const elapsed = (now - state.lastCountdownTick) / 1000;
    state.lastCountdownTick = now;

    const oldSec = Math.ceil(state.turnCountdown);
    state.turnCountdown = Math.max(0, state.turnCountdown - elapsed);

    if (Math.ceil(state.turnCountdown) !== oldSec) {
      if (state.turnCountdown <= 10 && state.turnCountdown > 0) {
        playGDSound('warn');
      }
      renderSeats();
    }

    // 倒计时自然用光强制出/过牌
    if (state.turnCountdown <= 0) {
      if (state.currentTurn === 0) {
        if (state.trick) passTurn(0);
        else playCards(0, [state.players[0].hand[0]]);
      } else {
        triggerAIMove();
      }
      return;
    }

    if (state.currentTurn !== 0 && now >= state.aiDelay) {
      triggerAIMove();
    }
  }

  function triggerAIMove() {
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      if (!player || player.hand.length === 0) { changeTurn((seat + 1) % 4); return; }
      const choice = [player.hand[0]];
      if (state.trick ? beats(typeOf(choice), state.trick) : true) {
        playCards(seat, choice);
      } else {
        passTurn(seat);
      }
    } finally {
      state.busy = false;
    }
  }

  function humanPlay() {
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    if (!cards.length) return;
    playCards(0, cards);
  }

  function bindHandInteraction() {
    const root = document.getElementById(ROOT_ID);
    const hand = root?.querySelector('[data-gd-hand]');
    if (!hand) return;
    on(hand, 'click', (e) => {
      const card = e.target.closest('.gd-card');
      if (!card || state.currentTurn !== 0) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });
  }

  function destroy() {
    if (state.timer) clearInterval(state.timer);
    state.active = false;
    offAll();
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
  }

  function init() {
    console.log('[Guandan] 载入全功能倒计时独立悬浮渲染引擎...');
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell;

    initDeckAndPlayers();
    bindHandInteraction();

    on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); passTurn(0); });
    on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    renderTable();
    state.timer = setInterval(gameHeartbeatLoop, 100);
    state.active = true;
  }

  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    btn.onclick = (e) => { e.preventDefault(); init(); };
  }

  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles, triggerAIMove });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();