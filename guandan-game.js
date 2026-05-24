/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (全自适应防超界 + 轮到玩家弹出控制钮 + 全员倒计时时钟与10秒红闪特写版)
 * * // 2026-05-24 TIMER-AND-POPUP 重大重构更新说明：
 * 1. 弹出式按钮面板：当且仅当轮到当前玩家(南家)出牌时，平滑弹出“出牌、过牌、整理”按钮栏。
 * 2. 实时全员倒计时时钟：每个玩家头像内嵌入精致钟表图标 ⏱️，30秒独立倒数，未轮到者不显示。
 * 3. 最后10秒高能提醒：进入最后10秒时，时钟变为深红色，并触发高频外发光呼吸红闪动画，强势提醒！
 * 4. 完美保持：保留鼠标右键快捷出发、27张手牌自适应缩放等全部优秀基因。
 */
(() => {
  'use strict';

  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 72; 

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
  state.cardsById = new Map();
  state.listeners = [];
  state.aiDelay = 0;

  // 2026-05-24 TIMER-AND-POPUP: 新增核心倒计时控制字段
  state.turnCountdown = 30;
  state.lastCountdownTick = 0;

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
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t); o.stop(t + 0.055); return;
    }
    if (type === 'play') {
      o.type = 'triangle'; o.frequency.setValueAtTime(450, t); o.frequency.exponentialRampToValueAtTime(680, t + 0.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.start(t); o.stop(t + 0.11); return;
    }
    if (type === 'warn') {
      o.type = 'sine'; o.frequency.setValueAtTime(950, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.start(t); o.stop(t + 0.09); return;
    }
    o.type = 'sine'; o.frequency.setValueAtTime(150, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.start(t); o.stop(t + 0.09);
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

  // 2026-05-24 TIMER-AND-POPUP: 追加核心倒计时样式、10秒红闪呼吸发光滤镜特效
  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #15451f 0%, #07170a 100%); color: #f5f7f4; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; overflow: hidden; user-select: none; }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; pointer-events: none; z-index: 100; }
      .gd-header-info { background: rgba(0,0,0,0.7); padding: 6px 18px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.4); pointer-events: auto; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 4px; }
      .gd-exit-btn { pointer-events: auto; background: linear-gradient(180deg, #ff5c5c 0%, #c92a2a 100%); color: white; border: 1px solid #ff7676; padding: 5px 14px; border-radius: 10px; font-weight: bold; font-size: 12px; cursor: pointer; }
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 10; }
      .gd-seat.top { top: 15px; left: 50%; transform: translateX(-50%); }
      .gd-seat.bottom { bottom: 8px; left: 50%; transform: translateX(-50%); width: 98%; max-width: 1100px; display: flex; flex-direction: column; align-items: center; z-index: 50; }
      .gd-seat.left { left: 15px; top: 40%; transform: translateY(-50%); }
      .gd-seat.right { right: 15px; top: 40%; transform: translateY(-50%); }
      
      .gd-player-info { background: rgba(0,0,0,0.65); padding: 8px 15px; border-radius: 14px; text-align: center; min-width: 125px; border: 1px solid rgba(255,255,255,0.08); position: relative; transition: all 0.25s ease; }
      .gd-player-info.active { border-color: #FFD700; background: rgba(0,0,0,0.85); box-shadow: 0 0 18px rgba(255, 215, 0, 0.45); }
      .gd-player-name { font-weight: bold; font-size: 13px; color: #fff; }
      .gd-player-detail { font-size: 11px; color: #FFD700; margin-top: 1px; }
      
      /* ⏱️ 独立精美倒计时模块样式 */
      .gd-timer-box { display: flex; align-items: center; justify-content: center; gap: 4px; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 10px; margin-top: 4px; font-size: 12px; font-weight: bold; color: #00ff66; border: 1px solid rgba(0,255,102,0.2); }
      
      /* 最后10秒高频危险呼吸闪烁特效动画 */
      @keyframes gdWarnFlash {
        0% { background: rgba(180,0,0,0.8); box-shadow: 0 0 4px #ff3333; }
        50% { background: rgba(255,0,0,0.9); box-shadow: 0 0 15px #ff0000, inset 0 0 8px #ff6666; }
        100% { background: rgba(180,0,0,0.8); box-shadow: 0 0 4px #ff3333; }
      }
      .gd-timer-box.danger-alert { color: #ff3333 !important; border-color: #ff3333 !important; animation: gdWarnFlash 0.5s infinite ease-in-out; text-shadow: 0 0 2px #000; }
      
      /* 🌟 弹出控制面板：默认隐藏且下缩，轮到玩家时上弹显现 */
      .gd-action-bar { display: flex; gap: 15px; margin-bottom: 12px; justify-content: center; opacity: 0; transform: translateY(35px) scale(0.92); pointer-events: none; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 80; }
      .gd-action-bar.show { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .gd-action-bar button { border: none; padding: 8px 28px; border-radius: 20px; font-weight: 900; font-size: 14px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.35); transition: transform 0.1s; border: 1px solid transparent; }
      .gd-action-bar button:active { transform: scale(0.95); }
      .gd-action-bar button:disabled { background: #3a3a3a !important; color: #666 !important; cursor: not-allowed; box-shadow: none; border-color: transparent !important; }
      
      .gd-btn-play { background: linear-gradient(180deg, #ffe552 0%, #ff9a00 100%); color: #231200; border-color: #fffa9e !important; }
      .gd-btn-pass { background: linear-gradient(180deg, #ffffff 0%, #cfcfcf 100%); color: #222; border-color: #f0f0f0 !important; }
      .gd-btn-sort { background: linear-gradient(180deg, #52e895 0%, #119652 100%); color: white; border-color: #88ffbf !important; }
      
      /* 27张手牌绝对自适应收缩舱 */
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 150px; width: 100%; padding: 6px 12px; background: rgba(0, 0, 0, 0.25); border-radius: 12px; box-shadow: inset 0 0 15px rgba(0,0,0,0.4); }
      .gd-center-table { position: absolute; width: 400px; height: 180px; border: 2px dashed rgba(255,255,255,0.15); border-radius: 90px; display: flex; justify-content: center; align-items: center; background: rgba(255,255,255,0.01); }
      .gd-trick { display: flex; justify-content: center; align-items: center; }
      .gd-trick-empty { font-size: 13px; opacity: 0.3; letter-spacing: 1px; }
      
      /* 扑克动态比例公式 */
      .gd-card { width: ${CARD_W}px; height: 106px; position: relative; background: #ffffff; border-radius: 6px; box-shadow: -2px 2px 6px rgba(0,0,0,0.35); margin-left: calc(-1 * (${CARD_W}px - 2.8vw)); transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.12s, box-shadow 0.12s; color: #000000; flex-shrink: 0; border: 1px solid #bcbcbc; cursor: pointer; }
      .gd-card:first-child { margin-left: 0 !important; }
      
      .gd-card:hover { transform: translateY(-16px); box-shadow: -2px 6px 14px rgba(0,0,0,0.4); z-index: 300 !important; border-color: #ffb900; }
      .gd-card.sel { transform: translateY(-30px) !important; box-shadow: 0 8px 16px rgba(255,200,0,0.4), -2px 4px 8px rgba(0,0,0,0.3) !important; border: 2px solid #ffaa00 !important; }
      
      .gd-card.red { color: #cc1b1b; }
      .gd-card.black { color: #111827; }
      
      .gd-card .corner { position: absolute; font-size: 15px; line-height: 1.05; padding: 3px 4px; display: flex; flex-direction: column; align-items: center; font-family: "Impact", "Arial Black", sans-serif; font-weight: bold; }
      .gd-card .tl { top: 1px; left: 2px; }
      .gd-card .br { bottom: 1px; right: 2px; transform: rotate(180deg); }
      .gd-card .corner .s { font-size: 11px; margin-top: 1px; }
      .gd-card .center { position: absolute; top: 52%; left: 50%; transform: translate(-50%, -50%); font-size: 30px; opacity: 0.95; }
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
    state.turnCountdown = 30; // 初始赋满30秒
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1800;
  }

  // 2026-05-24 TIMER-AND-POPUP: 重塑头像框渲染结构，按需生成带 10 秒危险动画闪烁的时钟图标
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
      
      // 如果属于当前思考的玩家，立刻追加时钟图标与剩余秒数
      if (isActive) {
        const isDanger = state.turnCountdown <= 10;
        timerHtml = `
          <div class="gd-timer-box ${isDanger ? 'danger-alert' : ''}">
            ⏱️ <span>${Math.ceil(state.turnCountdown)}s</span>
          </div>`;
      }

      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">剩余 ${p.hand ? p.hand.length : 0} 张</div>
          ${timerHtml}
        </div>`;
    });
  }

  // 2026-05-24 TIMER-AND-POPUP: 精确干预面板弹出逻辑
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

    const sortedHand = sortCards(state.players[0].hand);
    hand.innerHTML = sortedHand.map((card, i) => {
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

    // 🌟控制栏“弹出”核心控制：只有轮到南家时，追加类名 .show 浮现弹出
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

  function changeTurn(nextSeat) {
    state.currentTurn = nextSeat;
    state.turnCountdown = 30; // 重置下一轮的30秒生命时钟
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1200;
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
    if (state.trick && state.trick.seat === ((seat + 2) % 4)) {
      state.trick = null;
    }
    playGDSound('pass');
    changeTurn((seat + 1) % 4);
  }

  // 2026-05-24 TIMER-AND-POPUP: 新增全局高精度心跳循环，掌控时间递减与超时自动决策
  function gameHeartbeatLoop() {
    if (!state.active || state.busy) return;
    
    const now = performance.now();
    const elapsedSec = (now - state.lastCountdownTick) / 1000;
    state.lastCountdownTick = now;

    // 递减时间
    const oldCountdown = state.turnCountdown;
    state.turnCountdown = Math.max(0, state.turnCountdown - elapsedSec);

    // 每进入整数秒，若进入最后10秒，触发高音警报嘀嗒反馈
    if (Math.ceil(oldCountdown) !== Math.ceil(state.turnCountdown)) {
      if (state.turnCountdown <= 10 && state.turnCountdown > 0) {
        playGDSound('warn');
      }
      renderSeats(); // 实时绘制秒数数字变化
    }

    // 倒计时彻底归零，触发超时防挂机自动过牌/首发出牌逻辑
    if (state.turnCountdown <= 0) {
      console.log(`[Timer-Timeout] 玩家 ${state.currentTurn} 思考超时，强制触发兜底决断！`);
      if (state.currentTurn === 0) {
        // 玩家超时
        if (state.trick) passTurn(0);
        else {
          const firstCard = [state.players[0].hand[0]];
          playCards(0, firstCard);
        }
      } else {
        // AI超时
        triggerAIMove();
      }
      return;
    }

    // AI常规思考期
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

  function bindRightClickAction(container) {
    if (!container) return;
    on(container, 'contextmenu', (e) => {
      e.preventDefault(); 
      if (state.currentTurn === 0 && state.selected.size > 0) {
        playGDSound('play');
        humanPlay();
      }
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
    console.log('[Guandan] 启动带有动态弹出控制栏与高能红闪倒时钟的高阶沙箱...');
    
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    setTimeout(() => {
      initDeckAndPlayers();
      bindHandInteraction();
      bindRightClickAction(newShell); 
      
      on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
      on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
      on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
        playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
      });
      on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

      renderTable();
      
      // 将原先的固定300ms轮询，升级为高动态精度 100ms 的全局博弈与时间心跳同步器
      state.timer = setInterval(gameHeartbeatLoop, 100);
      state.active = true;
      console.log('[Guandan] 全新倒计时高阶棋牌终端成功开局！');
    }, 16); 
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