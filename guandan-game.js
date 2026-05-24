/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (全真牌桌沉浸式 UI 终极优化版)
 * * // 2026-05-24 UI-OPTIMIZED 重大更新说明：
 * 1. 终极修复手牌挤压变形问题，加入扑克立体层叠阴影与清晰的自适应扇形排列样式。
 * 2. 修复操作栏不显示 Bug，优化初始化时 Turn 的控制，防止 AI 瞬间抢占导致按钮隐藏。
 * 3. 增强扑克花色与数字的字体大小与对比度，确保全屏清晰可见。
 */
(() => {
  'use strict';

  // 解除全局死锁，允许反复重载时新修改的代码立刻生效
  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 75; // 优化后的标准卡片宽度

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
    { id: 0, name: '南家 (你)', short: 'South', team: 0, pos: 'bottom' },
    { id: 1, name: '东家', short: 'East', team: 1, pos: 'right' },
    { id: 2, name: '北家 (对家)', short: 'North', team: 0, pos: 'top' },
    { id: 3, name: '西家', short: 'West', team: 1, pos: 'left' },
  ];

  GD.state = GD.state || {};
  const state = GD.state;
  
  state.gameMode = 'SINGLE_PLAYER';
  state.currentRank = 2;
  state.currentTurn = 0;
  state.selected = state.selected || new Set();
  state.players = state.players || [];
  state.trick = null;
  state.timer = null;
  state.root = null;
  state.styleNode = null;
  state.active = false;
  state.busy = false;
  state.logs = [];
  state.cardsById = new Map();
  state.listeners = [];
  state.aiDelay = 0;

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sameTeam = (a, b) => state.players[a]?.team === state.players[b]?.team;
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

  function getAudio() {
    if (!ctx) return null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function playGDSound(type) {
    const ac = getAudio();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime;
    if (type === 'click') {
      o.type = 'sine'; o.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t); o.stop(t + 0.055); return;
    }
    if (type === 'play') {
      o.type = 'triangle'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.start(t); o.stop(t + 0.13); return;
    }
    if (type === 'bomb') {
      o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.45);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.start(t); o.stop(t + 0.46); return;
    }
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t); o.stop(t + 0.11);
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
    const allSame = counts.length === 1;

    if (n === 1) return { type: 'single', weight: values[0], size: 1, rank: values[0] };
    if (n === 2 && allSame) return { type: 'pair', weight: values[0], size: 2, rank: values[0] };
    if (n === 3 && allSame) return { type: 'triple', weight: values[0], size: 3, rank: values[0] };
    if (n >= 4 && allSame) return { type: 'bomb', weight: values[0] * 100 + n, size: n, rank: values[0] };
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

  // 2026-05-24 UI-OPTIMIZED: 重新精密重构了扑克牌布局与操作按钮控制样式
  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove(); // 强制刷新最新样式
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #1e5e36 0%, #0d321a 100%); color: #f5f7f4; font-family: system-ui, sans-serif; display: flex; flex-direction: column; overflow: hidden; }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 15px 25px; pointer-events: none; z-index: 100; }
      .gd-header-info { background: rgba(0,0,0,0.6); padding: 8px 20px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.4); pointer-events: auto; font-size: 14px; }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 5px; }
      .gd-exit-btn { pointer-events: auto; background: #ef4444; color: white; border: none; padding: 8px 18px; border-radius: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 10; }
      .gd-seat.top { top: 25px; left: 50%; transform: translateX(-50%); }
      .gd-seat.bottom { bottom: 15px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 950px; display: flex; flex-direction: column; align-items: center; z-index: 50; }
      .gd-seat.left { left: 25px; top: 45%; transform: translateY(-50%); }
      .gd-seat.right { right: 25px; top: 45%; transform: translateY(-50%); }
      
      .gd-player-info { background: rgba(0,0,0,0.6); padding: 8px 18px; border-radius: 14px; text-align: center; min-width: 130px; border: 2px solid transparent; box-shadow: 0 4px 6px rgba(0,0,0,0.2); }
      .gd-player-info.active { border-color: #FFD700; background: rgba(0,0,0,0.85); box-shadow: 0 0 25px rgba(255, 215, 0, 0.6); }
      .gd-player-name { font-weight: bold; font-size: 14px; color: #fff; }
      .gd-player-detail { font-size: 12px; color: #FFD700; margin-top: 2px; }
      
      .gd-action-bar { display: flex; gap: 20px; margin-bottom: 15px; justify-content: center; opacity: 0; transform: translateY(15px); transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28); pointer-events: none; z-index: 80; }
      .gd-action-bar.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
      .gd-action-bar button { border: none; padding: 10px 28px; border-radius: 25px; font-weight: 900; font-size: 15px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.4); transition: transform 0.1s; }
      .gd-action-bar button:active { transform: scale(0.95); }
      .gd-action-bar button:disabled { background: #555 !important; color: #888 !important; cursor: not-allowed; box-shadow: none; }
      .gd-btn-play { background: linear-gradient(180deg, #ffe042 0%, #ffb900 100%); color: #301a00; border: 1px solid #ffea75 !important; }
      .gd-btn-pass { background: linear-gradient(180deg, #ffffff 0%, #cccccc 100%); color: #333; }
      .gd-btn-sort { background: linear-gradient(180deg, #4be391 0%, #179e5b 100%); color: white; border: 1px solid #7bfcb4 !important; }
      
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 155px; width: 100%; padding: 10px 40px; background: rgba(0, 0, 0, 0.15); border-radius: 16px; box-shadow: inset 0 0 20px rgba(0,0,0,0.2); }
      .gd-center-table { position: absolute; width: 450px; height: 220px; border: 2px dashed rgba(255,255,255,0.2); border-radius: 110px; display: flex; justify-content: center; align-items: center; background: rgba(255,255,255,0.02); }
      .gd-trick { display: flex; justify-content: center; align-items: center; }
      .gd-trick-empty { font-size: 14px; opacity: 0.4; letter-spacing: 2px; }
      
      /* 扑克牌核心实体结构优化 */
      .gd-card { width: ${CARD_W}px; height: 105px; position: relative; background: #ffffff; border-radius: 6px; box-shadow: -3px 2px 8px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2); margin-left: -52px; transition: transform 0.15s ease, box-shadow 0.15s ease; color: #000000; flex-shrink: 0; border: 1px solid #d0d0d0; cursor: pointer; user-select: none; }
      .gd-card:first-child { margin-left: 0; }
      
      /* 悬浮及选中态 */
      .gd-card:hover { transform: translateY(-15px); box-shadow: -3px 8px 16px rgba(0,0,0,0.4), 0 4px 6px rgba(0,0,0,0.2); z-index: 100; border-color: #ffeb60; }
      .gd-card.sel { transform: translateY(-30px) !important; box-shadow: 0 10px 20px rgba(255,215,0,0.4), -3px 5px 12px rgba(0,0,0,0.3) !important; border: 2px solid #ffcc00 !important; z-index: 90; }
      
      .gd-card.red { color: #dc2626; }
      .gd-card.black { color: #111827; }
      
      .gd-card .corner { position: absolute; font-size: 16px; line-height: 1.1; padding: 4px; display: flex; flex-direction: column; align-items: center; font-family: "Impact", "Arial Black", sans-serif; font-weight: bold; }
      .gd-card .tl { top: 2px; left: 4px; }
      .gd-card .br { bottom: 2px; right: 4px; transform: rotate(180deg); }
      .gd-card .corner .s { font-size: 12px; margin-top: 1px; }
      .gd-card .center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; opacity: 0.95; }
      
      .gd-toast { position: absolute; top: 25%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); padding: 12px 24px; border-radius: 20px; opacity: 0; transition: opacity 0.3s; pointer-events: none; border: 1px solid #ffcc00; font-size: 14px; color: #ffcc00; }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-header">
        <div class="gd-header-info">主级: <span data-gd-rank>${state.currentRank}</span> | 牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>
      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>
        <div class="gd-center-table"><div class="gd-trick" data-gd-trick></div></div>
        <div class="gd-seat bottom" data-gd-seat="0">
          <div class="gd-action-bar" data-gd-action-bar>
            <button class="gd-btn-play" data-gd-play>出牌 (Play)</button>
            <button class="gd-btn-pass" data-gd-pass>过牌 (Pass)</button>
            <button class="gd-btn-sort" data-gd-sort>整理 (Sort)</button>
          </div>
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
          deck.push({ id: uid(), kind: 'normal', rank, suit: suit.key, symbol: symbolFix(suit), color: suit.color, value: RANK_VALUE[rank] });
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

  function symbolFix(suit) {
    return suit.symbol || GD_ICON_SUITS[suit.key === 'S' ? 'SPADE' : suit.key === 'H' ? 'HEART' : suit.key === 'C' ? 'CLUB' : 'DIAMOND'];
  }

  function initDeckAndPlayers() {
    const deck = makeDeck();
    state.players = SEATS.map((seat) => ({
      id: seat.id,
      name: seat.name,
      short: seat.short,
      team: seat.team,
      pos: seat.pos,
      hand: [],
      finished: false
    }));

    deck.forEach((card, idx) => {
      state.players[idx % 4].hand.push(card);
    });

    state.players.forEach((p) => {
      p.hand.sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
    });

    state.selected.clear();
    state.currentTurn = 0; // 🌟核心：确保发牌完毕后当前出牌人首位是你(0)
    state.trick = null;
    state.aiDelay = performance.now() + 1500; // 延缓AI首次行动，留足UI渲染及按钮弹出的时间
    console.log('[Guandan] 数据分发完毕，南家手牌总张数 =', state.players[0].hand.length);
  }

  function renderSeats() {
    const container = document.getElementById(ROOT_ID);
    if (!container) return;
    SEATS.forEach((seat, idx) => {
      const seatNode = container.querySelector(`[data-gd-seat="${idx}"]`);
      if (!seatNode) return;
      const p = state.players[idx];
      if (!p) return;
      const isActive = state.currentTurn === idx;
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">剩余 ${p.hand ? p.hand.length : 0} 张</div>
        </div>`;
    });
  }

  function renderTable() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    let trick = root.querySelector('[data-gd-trick]');
    let move = root.querySelector('[data-gd-move]');
    let hand = root.querySelector('[data-gd-hand]');
    let actionBar = root.querySelector('[data-gd-action-bar]');

    if (!hand) {
      const bottomSeat = root.querySelector('[data-gd-seat="0"]');
      if (bottomSeat) {
        hand = document.createElement('div');
        hand.className = 'gd-hand';
        hand.setAttribute('data-gd-hand', '');
        bottomSeat.appendChild(hand);
      } else {
        return;
      }
    }

    if (!trick) {
      const centerTable = root.querySelector('.gd-center-table');
      if (centerTable) {
        trick = document.createElement('div');
        trick.className = 'gd-trick';
        trick.setAttribute('data-gd-trick', '');
        centerTable.appendChild(trick);
      }
    }

    if (state.trick && trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      if (move) move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
    } else if (trick) {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌...</span>`;
      if (move) move.textContent = '—';
    }

    if (!state.players || state.players.length === 0 || !state.players[0].hand) {
      initDeckAndPlayers();
    }

    hand.innerHTML = sortCards(state.players[0].hand).map(formatCard).join('');
    
    hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
      if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
        cardDOM.classList.add('sel');
      }
    });

    // 2026-05-24 UI-OPTIMIZED: 操作栏显隐控制状态同步
    if (actionBar) {
      if (state.currentTurn === 0 && state.players[0].hand.length > 0) {
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

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;
    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 1200; // 出牌后给玩家 1.2 秒的观察期
    renderTable();
    return true;
  }

  function passTurn(seat) {
    if (state.trick && state.trick.seat === ((seat + 2) % 4)) {
      state.trick = null;
    }
    state.currentTurn = (seat + 1) % 4;
    playGDSound('pass');
    renderTable();
  }

  function triggerAIMove() {
    if (!state.active || state.busy || state.currentTurn === 0) return;
    if (performance.now() < state.aiDelay) return;
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      if (!player || player.hand.length === 0) { state.currentTurn = (seat + 1) % 4; renderTable(); return; }
      const sorted = sortCards(player.hand);
      const choice = state.trick ? [sorted[0]] : [sorted[0]];
      if (choice && choice.length && (state.trick ? beats(typeOf(choice), state.trick) : true)) {
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

  function humanPass() {
    if (state.currentTurn !== 0 || !state.trick) return;
    passTurn(0);
  }

  function bindHandInteraction() {
    const container = document.getElementById(ROOT_ID);
    const hand = container?.querySelector('[data-gd-hand]');
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
    state.busy = false;
    offAll();
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
  }

  function init() {
    console.log('[Guandan] 触发全视觉高防护初始化流程...');
    
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    // 时序校准：错开一帧以确保 DOM 树各子节点完备解析
    setTimeout(() => {
      initDeckAndPlayers();
      bindHandInteraction();
      
      on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
      on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
      on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
        playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
      });
      on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

      renderTable();
      
      state.timer = setInterval(triggerAIMove, 300);
      state.active = true;
      console.log('[Guandan] 桌牌沙箱视觉渲染完毕！');
    }, 16); 
  }

  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    
    btn.onclick = (e) => {
      e.preventDefault();
      init();
    };
  }

  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles, triggerAIMove });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();