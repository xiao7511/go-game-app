/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (全真牌桌沉浸式 UI 优化版)
 * * 2026-05-24 重大更新说明：
 * 1. 彻底移除了限制热更新的 window.GD.__loaded 文件拦截，改用完全幂等的函数覆盖模式。
 * 2. 彻底重写了 init()、initDeckAndPlayers() 与 renderTable() 之间的挂载时序。
 * 3. 增强了对 state.players 数组的静态降级防空保护，确保 100% 能够分发并渲染出 27 张手牌。
 */
(() => {
  'use strict';

  // 2026-05-24 UPDATE: 取消原本在此处的直接 return 拦截，允许新修改的代码在热更新或大厅重新加载时生效
  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 80;

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

  // 2026-05-24 UPDATE: 强行确保 state 在多重加载或大厅切回时状态的纯净与唯一性
  GD.state = GD.state || {};
  const state = GD.state;
  
  // 基础状态字段初始化
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

  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #1e5e36 0%, #0d321a 100%); color: #f5f7f4; font-family: system-ui, sans-serif; display: flex; flex-direction: column; overflow: hidden; }
      #${ROOT_ID} * { box-sizing: border-box; }
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 15px 25px; pointer-events: none; z-index: 10; }
      .gd-header-info { background: rgba(0,0,0,0.4); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.3); pointer-events: auto; }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 5px; }
      .gd-exit-btn { pointer-events: auto; background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 12px; font-weight: bold; cursor: pointer; }
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .gd-seat.top { top: 20px; left: 50%; transform: translateX(-50%); }
      .gd-seat.bottom { bottom: 20px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 900px; }
      .gd-seat.left { left: 20px; top: 50%; transform: translateY(-50%); }
      .gd-seat.right { right: 20px; top: 50%; transform: translateY(-50%); }
      .gd-player-info { background: rgba(0,0,0,0.5); padding: 8px 16px; border-radius: 12px; text-align: center; min-width: 120px; border: 2px solid transparent; }
      .gd-player-info.active { border-color: #FFD700; background: rgba(0,0,0,0.7); box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
      .gd-player-name { font-weight: bold; font-size: 14px; }
      .gd-player-detail { font-size: 12px; opacity: 0.8; }
      .gd-action-bar { display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; opacity: 0; transform: translateY(20px); transition: 0.2s; pointer-events: none; }
      .gd-action-bar.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
      .gd-action-bar button { border: none; padding: 10px 20px; border-radius: 20px; font-weight: 900; cursor: pointer; }
      .gd-btn-play { background: #FFD700; color: #000; }
      .gd-btn-pass, .gd-btn-sort { background: rgba(255,255,255,0.2); color: white; }
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; height: 140px; width: 100%; }
      .gd-center-table { position: absolute; width: 400px; height: 200px; border: 2px dashed rgba(255,255,255,0.15); border-radius: 100px; display: flex; justify-content: center; align-items: center; }
      .gd-trick { display: flex; justify-content: center; }
      .gd-card { width: ${CARD_W}px; aspect-ratio: 1 / 1.42; position: relative; background: white; border-radius: 6px; border: 1px solid #ccc; margin-left: -48px; transition: transform 0.1s; color: black; }
      .gd-hand .gd-card:first-child { margin-left: 0; }
      .gd-hand .gd-card:hover, .gd-hand .gd-card.sel { transform: translateY(-20px); border-color: #FFD700; }
      .gd-card.red { color: red; }
      .gd-card .corner { position: absolute; font-size: 14px; padding: 2px; display: flex; flex-direction: column; }
      .gd-card .tl { top: 0; left: 2px; }
      .gd-card .br { bottom: 0; right: 2px; transform: rotate(180deg); }
      .gd-card .center { font-size: 28px; }
      .gd-toast { position: absolute; top: 25%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 20px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
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

  function symbolFix(suit) {
    return suit.symbol || GD_ICON_SUITS[suit.key === 'S' ? 'SPADE' : suit.key === 'H' ? 'HEART' : suit.key === 'C' ? 'CLUB' : 'DIAMOND'];
  }

  // 2026-05-24 UPDATE: 彻底重写发牌映射逻辑，强制重置并确保数据层 state.players 100% 被足额填满 4 位玩家且每人分满牌
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
    state.currentTurn = 0;
    state.trick = null;
    state.aiDelay = 0;
    console.log('[Guandan] 发牌成功，数据层核对结果：南家分得扑克张数 =', state.players[0].hand.length);
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

  // 2026-05-24 UPDATE: 升级为绝对强力抓取模式，在赋值 innerHTML 前进行高宽和节点就绪拦截，保障多重实例下绝不中断发牌
  function renderTable() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    // 2026-05-24 防御：保证界面必要节点已通过 DOM 渲染通道，才执行数据覆写
    if (!hand || !trick) {
      console.warn('[Guandan] DOM节点尚未准备就绪，推迟本次渲染通道');
      return;
    }

    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      if (move) move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌...</span>`;
      if (move) move.textContent = '—';
    }

    // 2026-05-24 UPDATE: 增加强力降级防御，即使 state 被并发干扰，也确保 me 及其 hand 存在合法数组实体
    const me = state.players[0] || { hand: [] };
    if (!me.hand || me.hand.length === 0) {
      // 极速自动兜底：如果在极端闭包竞争下数据丢失，现场重新强制激活发牌数据
      console.log('[Guandan-Defend] 侦测到渲染阶段玩家手牌异常真空，强制启动现场补发牌逻辑。');
      initDeckAndPlayers();
    }

    hand.innerHTML = sortCards(state.players[0].hand).map(formatCard).join('');
    
    hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
      if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
        cardDOM.classList.add('sel');
      }
    });

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
    state.aiDelay = performance.now() + 500;
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

  // 2026-05-24 UPDATE: 重新校准极其严密的时序流程：抹除旧DOM -> 注入样式 -> 创建容器挂载 -> 生成洗牌数据 -> 强制全量渲染
  function init() {
    console.log('[Guandan] 执行全时序安全初始化流程...');
    
    // 1. 强力剥离任何残留容器，消除选择器冲突
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    // 2. 🌟 时序首要：立即创建全新独立壳体并强行 append 进 Body 树
    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    // 3. 🌟 数据紧随：在 DOM 真实存在于页面后，立刻启动数据层的洗牌和分发
    initDeckAndPlayers();
    
    // 4. 精确进行 DOM 上的手牌与各个功能按钮的事件绑定
    bindHandInteraction();
    
    on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
    on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    // 5. 激发首次全面强行渲染（此时 DOM、数据、事件三者均处于完全体就绪状态）
    renderTable();
    
    state.timer = setInterval(triggerAIMove, 300);
    state.active = true;
    console.log('[Guandan] 掼蛋沙箱环境就绪，27张全真扑克牌已就位。');
  }

  // 2026-05-24 UPDATE: 统一绑定逻辑，使用具有唯一排他性的 onclick 覆盖多重事件监听堆叠
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