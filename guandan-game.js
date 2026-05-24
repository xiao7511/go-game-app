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
    timerValue: 60,
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

    // 合成音效
    const soundFrequencies = {
      play: [440, 660],
      click: [800],
      pass: [120],
      reset: [0],
    };
    const soundDurations = {'click': 0.055, 'play': 0.13, 'pass': 0.11};
    if (type === 'play') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      soundFrequencies['play'].forEach((freq, idx) => o.frequency.linearRampToValueAtTime(freq, t + (0.12 * (idx + 1))));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.12);
      return;
    }
    o.type = 'sine';
    const selectedFrequency = soundFrequencies[type][0];
    o.frequency.setValueAtTime(selectedFrequency, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t);
    o.stop(t + soundDurations[type]);
  }

  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle, #1e5e36, #0d321a); color: white; display: flex; flex-direction: column; align-items: center; }
      .gd-player-info { display: flex; justify-content: space-around; width: 100%; margin-bottom: 10px; }
      .gd-player { flex-direction: column; align-items: center; }
      .gd-player-name { font-weight: bold; color: #f5f7f4; }
      .gd-hand { display: flex; justify-content: center; width: 100%; padding: 20px; overflow-x: visible; }
      .gd-card { width: 70px; height: 100px; background: white; color: black; border-radius: 6px; margin-left: -25px; border: 1px solid #ccc; cursor: pointer; transition: 0.1s; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
      .gd-hand .gd-card:first-child { margin-left: 0; }
      .gd-card.sel { transform: translateY(-30px); border: 2px solid gold; box-shadow: 0 0 10px gold; z-index: 10; }
      #gd-timer-display { font-size: 24px; color: gold; margin: 10px; font-weight: bold; }
    `;
    document.head.appendChild(s);
  }

  // 🌟 全新 UI 样式注入：真实的 2D 牌桌布局
  function createShell() {
    const div = document.createElement('div');
    div.id = ROOT_ID;
    div.innerHTML = `
      <div class="gd-player-info">
      ${SEATS.map(seat => `<div class="gd-player"><div class="gd-player-name">${seat.name}</div><div class="gd-player-status">${seat.pos}</div></div>`).join('')}
      </div>
      <div id="gd-timer-display" style="color: gold; font-size: 20px; font-weight: bold; text-align: center; margin: 10px;">剩余时间: 60s</div>
      <div data-gd-hand class="gd-hand"></div>
      <div class="gd-controls" style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
        <button data-gd-play>出牌</button>
        <button data-gd-pass>过牌</button>
        <button data-gd-sort>理牌</button>
        <button data-gd-exit>退出</button>
      </div>
    `;
    return div;
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
    on(state.root.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('pass'); passTurn(); });
    on(state.root.querySelector('[data-gd-sort]'), 'click', () => { playGDSound('reset'); sortHand(); });
    on(state.root.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    initDeckAndPlayers();
    renderTable();

    state.timer = setInterval(() => {
      if (state.timerValue > 0) {
        state.timerValue--;
      } else {
        // 时间到，如果是玩家回合自动过牌
        if (state.currentTurn === 0) {
          playGDSound('pass');
          passTurn();
        }
      }
      // 更新页面上的倒计时显示
      const timerEl = document.getElementById('gd-timer-display');
      if (timerEl) timerEl.innerText = `剩余时间: ${state.timerValue}s`;
    }, 1000);

    state.active = true;
    console.log('[Guandan] 全真牌桌沙箱初始化完毕。');
  }

  function destroy() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    if (state.styleNode) state.styleNode.remove();
    if (state.timerInterval) clearInterval(state.timerInterval); // 清除倒计时定时器
    state.active = false;
    // 恢复大厅可见性
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'block';
  }

  function bindHandInteraction() {
    const hand = state.root?.querySelector('.gd-hand');
    if (!hand) return;
    on(hand, 'click', (e) => {
      // 触发右键单击事件
      const card = e.target.closest('.gd-card');
      if (!card) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);

      playGDSound('click');
      renderTable(); // 重新渲染以更新选中的牌样式
    });

    on(hand, 'contextmenu', (e) => {
      e.preventDefault();
      const card = e.target.closest('.gd-card');
      if (!card) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      playGDSound('click');
      renderTable(); // 重新渲染以更新选中的牌样式
    });
  }

  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles });

  document.addEventListener('DOMContentLoaded', () => { bindLaunchButton(); }, { once: true });
  if (document.readyState !== 'loading') bindLaunchButton();
})();
