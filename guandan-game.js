/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (全真牌桌沉浸式 UI 优化版)
 */
(() => {
  'use strict';

  // 🌟 核心防线：防重复加载
  if (window.GD && window.GD.__loaded) {
    console.log('[Guandan-AntiLoad] 检测到脚本重复加载，已自动拦截并跳过。');
    return;
  }

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };

  // 初始化或提取全局 GD 对象沙箱
  const GD = (window.GD = window.GD || {});
  if (GD.__loaded) return;
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 80; // 稍微放大一点实体牌

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
    logs: [],
    cardsById: new Map(),
    listeners: [],
    aiDelay: 0,
    timerValue: 60, // 计时器初始值设为60秒
    countdown: 60,
    timerInterval: null
  };

  GD.state = state;

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sameTeam = (a, b) => state.players[a]?.team === state.players[b]?.team;
  const isJoker = (c) => c.kind === 'joker';
  const sortCards = (cards) => cards.slice().sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
  const rankLabel = (c) => c.kind === 'joker' ? c.label : c.rank;

  function on(target, type, handler, options) {
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
    o.connect(g);
    g.connect(ac.destination);
    const t = ac.currentTime;

    const soundFiles = {
      play: "assets/sounds/play.wav",
      pass: "assets/sounds/pass.wav",
      reset: "assets/sounds/reset.wav",
      win: "assets/sounds/win.wav"
    };

    const soundDuration = 0.11; // 默认音效持续时间 
    if (type in soundFiles) {
      const audio = new Audio(soundFiles[type]);
      audio.play();
    }
  }

  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} {
        position: fixed; inset: 0; z-index: 9999; 
        background: radial-gradient(circle at center, #1e5e36 0%, #0d321a 100%);
        color: #f5f7f4; font-family: system-ui, -apple-system, sans-serif; 
        display: flex; flex-direction: column; overflow: hidden;
      }
      #${ROOT_ID} * { box-sizing: border-box; }

      .gd-arena {
        display: flex; justify-content: space-around; align-items: center;
        flex: 1;
      }
      .gd-seat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .gd-player-info {
        background: rgba(0,0,0,0.5);
        padding: 8px 16px;
        border-radius: 8px;
        margin: 4px;
        min-width: 120px;
        color: #FFD700;
      }
      .gd-hand {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 140px;
        width: 100%;
      }
      .gd-card {
        width: ${CARD_W}px; position: relative;
        background: #fff; border: 1px solid #ccc;
        border-radius: 4px;
      }
    `;
    document.head.appendChild(s);
  }

  function makeDeck() {
    const deck = [];
    for (let d = 0; d < 2; d++) {
      for (const suit of GD_SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: uid(), kind: 'normal', rank, suit: suit.key, symbol: suit.symbol, color: suit.color, value: RANK_VALUE[rank] });
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

  function initPlayers(deck) {
    state.players = SEATS.map((seat) => ({ ...seat, hand: [], finished: false }));
    deck.forEach((card, idx) => state.players[idx % 4].hand.push(card));
    state.players.forEach((p) => p.hand.sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit)));
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-header">
        <div class="gd-header-info">
          主级: <span data-gd-rank>${state.currentRank}</span> |
          牌型: <span data-gd-move>—</span>
        </div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>
      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-center-table">
          <div class="gd-trick" data-gd-trick></div>
        </div>
        <div class="gd-seat right" data-gd-seat="1"></div>
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

  function renderTable() {
    const root = state.root;
    if (!root) return;

    // 更新座位信息
    renderSeats();

    // 更新公共桌牌 (Trick)
    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌...</span>`;
      move.textContent = '—';
    }

    // 更新玩家手牌 (Seat 0)
    const hand = root.querySelector('[data-gd-hand]');
    const me = state.players[0];
    hand.innerHTML = sortCards(me.hand).map(formatCard).join('');

    // 更新选中状态
    hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
      // 同步选中状态
      if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
        cardDOM.classList.add('sel');
      }
    });

    // 🌟 核心控制：判断是否轮到玩家，跳出/隐藏 操作栏
    const actionBar = root.querySelector('[data-gd-action-bar]');
    const playBtn = root.querySelector('[data-gd-play]');
    const passBtn = root.querySelector('[data-gd-pass]');

    if (state.currentTurn === 0) {
      actionBar.classList.add('show'); // 动画跳出
      playBtn.disabled = state.selected.size === 0;
      passBtn.disabled = !state.trick; // 领出时不能过牌
    } else {
      actionBar.classList.remove('show'); // 隐藏
    }

    // 同步 toast 提示
    const toastNode = root.querySelector('[data-gd-toast]');
    if (toastNode && state._toastText) {
      toastNode.textContent = state._toastText;
      toastNode.style.opacity = '1';
      clearTimeout(state._toastTimer);
      state._toastTimer = setTimeout(() => { toastNode.style.opacity = '0'; state._toastText = ''; }, 1500);
    }
  }

  function humanPlay() {
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    const move = typeOf(cards);
    if (!move) return showToast('牌型不合法');
    if (state.trick && !beats(move, state.trick)) return showToast('压不过桌面的牌');
    if (!cards.length) return showToast('请先点击选择牌');
    playCards(0, cards);
  }

  function humanPass() {
    if (state.currentTurn !== 0 || !state.trick) return;
    passTurn(0);
  }

  function bindHandInteraction() {
    const hand = state.root?.querySelector('[data-gd-hand]');
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

    // 右键选中卡牌
    on(hand, 'contextmenu', (e) => {
      e.preventDefault();
      const card = e.target.closest('.gd-card');
      if (!card) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });
  }

  function destroy() {
    clearInterval(state.timer);
    state.active = false; state.busy = false;
    offAll();
    if (state.root) state.root.remove();
    if (state.styleNode) state.styleNode.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
    state.root = null; state.styleNode = null;
  }

  function init() {
    if (state.active) return;
    injectResponsiveStyles();

    // 隐藏大厅
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    state.root = createShell();
    document.body.appendChild(state.root);

    bindHandInteraction();

    on(state.root.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(state.root.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
    on(state.root.querySelector('[data-gd-sort]'), 'click', () => { playGDSound('reset'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); });
    on(state.root.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    initDeckAndPlayers();
    renderTable();
    
    // 启动计时器
    state.timerInterval = setInterval(() => {
      if (state.timerValue > 0) {
        state.timerValue--;
      } else {
        // 时间到，如果是玩家回合自动过牌
        if (state.currentTurn === 0) {
          playGDSound('pass');
          humanPass();
        }
      }
      const timerEl = document.getElementById('gd-timer-display');
      if (timerEl) timerEl.innerText = `剩余时间: ${state.timerValue}s`;
    }, 1000);
    
    state.active = true;
    console.log('[Guandan] 全真牌桌沙箱初始化完毕。');
  }

    function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn || btn.dataset.gdBound) return;
    btn.dataset.gdBound = '1';
    on(btn, 'click', init, { passive: true });
  }
  
  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles });

  document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  if (document.readyState !== 'loading') bindLaunchButton();
})();
