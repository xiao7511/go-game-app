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
    timerValue: 30,
    countdown: 30,
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

    if (type === 'click') {
      o.type = 'sine'; o.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t); o.stop(t + 0.055); return;
    }
    if (type === 'play') {
      o.type = 'triangle'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.start(t); o.stop(t + 0.13); return;
    }
    // Pass sound
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t); o.stop(t + 0.11);
  }

  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle, #1e5e36, #0d321a); color: white; display: flex; flex-direction: column; align-items: center; }
      .gd-hand { display: flex; justify-content: center; width: 100%; padding: 20px; overflow-x: visible; }
      .gd-card { width: 70px; height: 100px; background: white; color: black; border-radius: 6px; margin-left: -25px; border: 1px solid #ccc; cursor: pointer; transition: 0.1s; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
      .gd-hand .gd-card:first-child { margin-left: 0; }
      .gd-card.sel { transform: translateY(-30px); border: 2px solid gold; box-shadow: 0 0 10px gold; z-index: 10; }
      #gd-timer-display { font-size: 24px; color: gold; margin: 10px; font-weight: bold; }
    `;
    document.head.appendChild(s);
  }
  // 🌟 全新 UI 样式注入：真实的 2D 牌桌布局
  /*function injectResponsiveStyles() {
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
      .gd-hand-wrapper { height: 160px; display: flex; flex-direction: column; align-items: center; }
      .gd-hand { display: flex; justify-content: center; width: 100%; overflow-x: auto; padding: 20px 0; }
      .gd-card { width: 60px; height: 85px; background: white; color: black; border-radius: 6px; margin-left: -20px; border: 1px solid #ccc; cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; box-shadow: 2px 2px 4px rgba(0,0,0,0.3); flex-shrink: 0; }
      .gd-hand .gd-card:hover, .gd-hand .gd-card.sel { transform: translateY(-24px); border-color: #FFD700; box-shadow: -4px 12px 24px rgba(0,0,0,0.4), inset 0 0 2px #FFD700; }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }*/

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

  function playCards(seat, cards) {
    const move = typeOf(cards);
    
    // 逻辑修复：如果是新的一轮（state.trick 为 null）或之前是自己出的牌，允许自由出牌
    const isNewRound = !state.trick || state.trick.seat === seat;
    if (!isNewRound && move && !beats(move, state.trick)) {
      showToast('必须出比上家大的牌');
      return false;
    }

    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.find(sc => sc.id === c.id));
    
    state.trick = move ? { ...move, cards, seat } : null;
    state.selected.clear();
    state.currentTurn = (seat + 1) % 4;
    
    // 重置倒计时
    state.timerValue = 30; 
    
    playGDSound('play');
    renderTable();
    return true;
  }
  /*
  function playCards(seat, cards) {
    const move = typeOf(cards);
    const previousWinner = state.currentTurn === 1; // Assuming player 1 is the previous winner
    if (previousWinner) {
      // Ignore 压制检查
    } else if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    const ids = new Set(cards.map(c => c.id));
    player.hand = player.hand.filter(c => !ids.has(c.id));
    player.finished = player.hand.length === 0;

    state.trick = { ...move, cards, seat };
    state.selected.clear();
    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 500; // AI thinking delay

    playGDSound(move.type === 'bomb' || move.type === 'rocket' ? 'bomb' : 'play');
    renderTable();
    return true;
  }*/

  function humanPlay() {
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    const move = typeOf(cards);
    if (!move) return showToast('牌型不合法');
    if (state.trick && !beats(move, state.trick)) return showToast('压不过桌面的牌');
    if (!cards.length) return showToast('请先点击选择牌');
    playCards(0, cards);
  }

  /*
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
  }*/
 function bindHandInteraction() {
    const hand = state.root?.querySelector('.gd-hand');
    if (!hand) return;
    on(hand, 'click', (e) => {
      const card = e.target.closest('.gd-card');
      if (!card) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      
      playGDSound('click');
      renderTable(); // 重新渲染以更新选中的牌样式
    });
  }

  function init() {
    if (state.active) return;
    injectResponsiveStyles();

    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    state.root = createShell();
    document.body.appendChild(state.root);

    bindHandInteraction();

    on(state.root.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(state.root.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    initDeckAndPlayers();
    renderTable();

    state.timer = setInterval(() => {
      if (state.timerValue > 0) {
        state.timerValue--;
      } else {
        // Timer expired actions
      }
    }, 1000);

    state.active = true;
    console.log('[Guandan] 全真牌桌沙箱初始化完毕。');
  }

  state.timer = setInterval(() => {
      if (state.timerValue > 0) {
        state.timerValue--;
      } else {
        // 时间到，如果是玩家回合自动过牌
        if (state.currentTurn === 0) {
          playGDSound('pass');
          state.currentTurn = (state.currentTurn + 1) % 4;
          state.timerValue = 30;
        }
      }
      // 更新页面上的倒计时显示
      const timerEl = document.getElementById('gd-timer-display');
      if (timerEl) timerEl.innerText = `剩余时间: ${state.timerValue}s`;
    }, 1000);

  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles });

  document.addEventListener('DOMContentLoaded', () => { bindLaunchButton(); }, { once: true });
  if (document.readyState !== 'loading') bindLaunchButton();
})();
