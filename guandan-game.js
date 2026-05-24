/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 - 终极接风、胜负进阶判定与按钮归位版
 * 2026-05-24 完美闭环重构
 */
(() => {
  'use strict';

  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 90; 

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
    currentRank: 2, // 当前主级
    currentTurn: 0,
    selected: new Set(),
    players: [],
    trick: null, // 当前桌面牌：{ type, weight, size, cards, seat }
    timer: null,
    root: null,
    styleNode: null,
    active: false,
    busy: false,
    cardsById: new Map(),
    listeners: [],
    aiDelay: 0,
    turnCountdown: 30,
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
    const values = cards.map((c) => c.value).sort((a,b) => a-b);
    const grouped = new Map();
    for (const c of cards) {
      if (!grouped.has(c.value)) grouped.set(c.value, []);
      grouped.get(c.value).push(c);
    }
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    
    if (n === 1) return { type: '单张', weight: values[0], size: 1 };
    if (n === 2 && counts.length === 1) return { type: '对子', weight: values[0], size: 2 };
    if (n === 3 && counts.length === 1) return { type: '三张', weight: values[0], size: 3 };
    if (n >= 4 && counts.length === 1) return { type: '炸弹', weight: values[0] * 100 + n, size: n };
    
    if (n === 5 && counts[0] === 2 && counts[1] === 3) {
      const mainVal = [...grouped.entries()].find(([k,v]) => v.length === 3)[0];
      return { type: '三带两', weight: mainVal, size: 5 };
    }
    return null;
  }

  function beats(next, prev) {
    if (next.type === '炸弹' && prev.type !== '炸弹') return true;
    if (next.type === '炸弹' && prev.type === '炸弹') {
      if (next.size !== prev.size) return next.size > prev.size;
      return next.weight > prev.weight;
    }
    return next.type === prev.type && next.size === prev.size && next.weight > prev.weight;
  }

  function formatCard(card) {
    let centerHtml = '';
    if (card.kind === 'joker') {
      centerHtml = `<div class="gd-card-art-txt">${card.rank === 'W' ? '👑' : '🃏'}</div>`;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      let avatar = card.rank === 'J' ? '⚔️' : card.rank === 'Q' ? '🌸' : '👑';
      centerHtml = `<div class="gd-card-court-bg">${card.rank}</div><div class="gd-card-court-avatar">${avatar}</div>`;
    } else {
      const num = parseInt(card.rank) || 10;
      if (num <= 10) {
        const suitsArr = Array(Math.min(num, 6)).fill(`<span class="gd-mini-suit">${card.symbol}</span>`);
        centerHtml = `<div class="gd-card-grid-suits">${suitsArr.join('')}</div>`;
      } else {
        centerHtml = `<div class="center">${card.symbol}</div>`;
      }
    }
    return `
      <div class="gd-card ${card.color}" data-card-id="${card.id}">
        <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
        ${centerHtml}
        <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
      </div>`;
  }

  // 🎨 高级大厅 UI 级联样式表
  function injectResponsiveStyles() {
    let s = document.getElementById(STYLE_ID);
    if (s) s.remove();
    
    s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #134e20 0%, #031206 100%); color: #f5f7f4; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; overflow: hidden; user-select: none; }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; z-index: 9999; pointer-events: none; }
      .gd-header-info { background: rgba(0,0,0,0.75); padding: 10px 24px; border-radius: 12px; border: 1px solid rgba(255,215,0,0.4); font-size: 15px; font-weight: bold; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 4px; }
      .gd-exit-btn { background: linear-gradient(180deg, #ff5252 0%, #c92a2a 100%); color: white; border: none; padding: 10px 22px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 14px; pointer-events: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
      
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      /* 座位与布局体系 */
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; }
      .gd-seat.top { top: 30px; left: 50%; transform: translateX(-50%); } 
      .gd-seat.left { left: 40px; top: 40%; transform: translateY(-50%); }
      .gd-seat.right { right: 40px; top: 40%; transform: translateY(-50%); }
      
      /* ✨ 优化点 1：南家整体上提抬高，腾出下方独立手牌区域 */
      .gd-seat.bottom { bottom: 200px; left: 50%; transform: translateX(-50%); }
      
      /* ✨ 优化点 2：控制栏移回南家头像和时钟上方 */
      .gd-player-action-container { display: flex; justify-content: center; width: 100%; margin-bottom: 12px; height: 55px; }
      .gd-action-bar { display: none; gap: 20px; justify-content: center; width: auto; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: none; padding: 10px 38px; border-radius: 24px; font-weight: 900; font-size: 18px; cursor: pointer; box-shadow: 0 6px 15px rgba(0,0,0,0.5); transition: transform 0.1s; }
      .gd-action-bar button:active { transform: scale(0.95); }
      .gd-btn-play { background: linear-gradient(180deg, #fff3bf 0%, #fab005 100%); color: #111; }
      .gd-btn-pass { background: linear-gradient(180deg, #ffffff 0%, #cfd8dc 100%); color: #222; }
      .gd-btn-sort { background: linear-gradient(180deg, #63e6be 0%, #0ca678 100%); color: white; }
      .gd-action-bar button:disabled { background: #495057 !important; color: #868e96 !important; cursor: not-allowed; box-shadow: none; transform: none; }
      
      /* 头像信息大框 */
      .gd-player-info { background: rgba(10,25,14,0.92); padding: 14px 28px; border-radius: 16px; text-align: center; min-width: 170px; border: 2px solid rgba(255,255,255,0.18); box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
      .gd-player-info.active { border-color: #FFD700; box-shadow: 0 0 25px rgba(255, 215, 0, 0.5); background: rgba(20,45,25,0.95); }
      .gd-player-name { font-weight: 800; font-size: 17px; color: #fff; }
      .gd-player-detail { font-size: 14px; color: #FFD700; margin-top: 6px; font-weight: bold; }
      .gd-player-finished { color: #868e96 !important; font-style: italic; }
      
      /* 时钟挂载于信息框上方 */
      .gd-timer-outer { height: 35px; display: flex; align-items: center; justify-content: center; width: 100%; margin-bottom: 4px; }
      .gd-timer-box { display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9); padding: 4px 14px; border-radius: 20px; font-size: 15px; font-weight: 900; color: #00ff66; border: 1px solid #00ff66; box-shadow: 0 0 12px rgba(0,255,102,0.5); }
      .gd-timer-box.danger { color: #ff3838 !important; border-color: #ff3838 !important; box-shadow: 0 0 15px #ff3838 !important; }
      
      /* ✨ 优化点 3：中央公共竞技出牌大区 */
      .gd-center-table { position: absolute; width: 620px; height: 260px; border: 2px dashed rgba(255,255,255,0.2); border-radius: 130px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.15); box-shadow: inset 0 0 30px rgba(0,0,0,0.3); }
      
      /* ✨ 优化点 4：当前出牌玩家源头展示标签 */
      .gd-move-owner-tag { font-size: 15px; font-weight: bold; color: #FFD700; background: rgba(0,0,0,0.6); padding: 4px 16px; border-radius: 10px; border: 1px solid rgba(255,215,0,0.3); margin-bottom: 12px; letter-spacing: 0.5px; }
      .gd-trick { display: flex; justify-content: center; align-items: center; width: 100%; min-height: 135px; }
      .gd-trick-empty { font-size: 16px; color: rgba(255,255,255,0.2); font-weight: bold; letter-spacing: 1px; }
      
      /* 底部独立手牌 */
      .gd-hand-container { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 96%; max-width: 1200px; z-index: 1000; }
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 145px; width: 100%; padding: 5px; }
      
      /* 物理卡牌微调 */
      .gd-card { width: ${CARD_W}px; height: 132px; position: relative; background: #ffffff; border-radius: 9px; box-shadow: -4px 4px 8px rgba(0,0,0,0.35); margin-left: calc(-1 * (${CARD_W}px - 2.5vw)); transition: transform 0.1s ease; color: #000; border: 1px solid #bbb; overflow: hidden; }
      .gd-card:first-child { margin-left: 0 !important; }
      .gd-trick .gd-card { margin-left: -55px; box-shadow: -5px 5px 12px rgba(0,0,0,0.4); }
      .gd-trick .gd-card:first-child { margin-left: 0 !important; }
      
      .gd-card.sel { transform: translateY(-35px) !important; border: 2px solid #ff9f00 !important; box-shadow: 0 8px 20px rgba(255,159,0,0.6); }
      .gd-card:hover { z-index: 9999 !important; transform: translateY(-15px); }
      
      .gd-card.red { color: #d63031; }
      .gd-card.black { color: #2d3436; }
      .gd-card .corner { position: absolute; font-size: 20px; line-height: 1.0; padding: 4px 6px; display: flex; flex-direction: column; align-items: center; font-weight: bold; }
      .gd-card .tl { top: 2px; left: 2px; }
      .gd-card .br { bottom: 2px; right: 2px; transform: rotate(180deg); }
      
      .gd-card-grid-suits { position: absolute; inset: 26px 14px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; align-content: center; justify-items: center; opacity: 0.75; }
      .gd-mini-suit { font-size: 13px; }
      .gd-card-court-bg { position: absolute; font-size: 75px; font-weight: 900; color: rgba(0,0,0,0.06); top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: serif; }
      .gd-card-court-avatar { position: absolute; font-size: 30px; top: 50%; left: 50%; transform: translate(-50%, -46%); opacity: 0.85; }
      .gd-card-art-txt { position: absolute; font-size: 34px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-header">
        <div class="gd-header-info">当前主级: <span data-gd-rank>${state.currentRank}</span> | 桌上牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>

      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>
        
        <div class="gd-center-table">
          <div class="gd-move-owner-tag" data-gd-owner-tag>桌上风向：等待开局</div>
          <div class="gd-trick" data-gd-trick></div>
        </div>
        
        <div class="gd-seat bottom" data-gd-seat="0">
          <div class="gd-player-action-container">
            <div class="gd-action-bar" data-gd-action-bar>
              <button class="gd-btn-play" data-gd-play>出 牌</button>
              <button class="gd-btn-pass" data-gd-pass>过 牌</button>
              <button class="gd-btn-sort" data-gd-sort>整 理</button>
            </div>
          </div>
          <div class="gd-timer-outer" data-gd-timer-zone></div>
          <div class="gd-player-info" data-gd-info-zone></div>
        </div>
        
        <div class="gd-hand-container">
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

  // ⏱️ 渲染玩家席位（自动过滤已出完牌的空手玩家）
  function renderSeats() {
    const container = document.getElementById(ROOT_ID);
    if (!container) return;
    
    SEATS.forEach((seat, idx) => {
      const p = state.players[idx];
      if (!p) return;
      const isActive = state.currentTurn === idx;
      const isFinished = p.hand.length === 0;

      let timerInnerHtml = '';
      if (isActive && !isFinished) {
        const isDanger = state.turnCountdown <= 10;
        timerInnerHtml = `<div class="gd-timer-box ${isDanger ? 'danger' : ''}">⏱️ ${Math.ceil(state.turnCountdown)}s</div>`;
      }

      let infoBody = `
        <div class="gd-player-name">${p.name}</div>
        <div class="gd-player-detail ${isFinished ? 'gd-player-finished' : ''}">
          ${isFinished ? '🎉 已出完 (空手)' : `剩余 ${p.hand.length} 张`}
        </div>
      `;

      if (idx === 0) {
        // 南家独立定向更新，防止污染手牌与控制区
        const tZone = container.querySelector('[data-gd-timer-zone]');
        const iZone = container.querySelector('[data-gd-info-zone]');
        if (tZone) tZone.innerHTML = timerInnerHtml;
        if (iZone) {
          iZone.innerHTML = infoBody;
          if (isActive) iZone.classList.add('active');
          else iZone.classList.remove('active');
        }
      } else {
        const seatNode = container.querySelector(`[data-gd-seat="${idx}"]`);
        if (seatNode) {
          seatNode.innerHTML = `
            <div class="gd-timer-outer">${timerInnerHtml}</div>
            <div class="gd-player-info ${isActive && !isFinished ? 'active' : ''}">
              ${infoBody}
            </div>
          `;
        }
      }
    });
  }

  // 🃏 综合牌桌核心重绘
  function renderTable() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const ownerTag = root.querySelector('[data-gd-owner-tag]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    if (!hand || !trick) return;

    // ✨ 优化点 2 落实：动态更新当前桌面上牌是由哪位玩家击出的
    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      const ownerName = state.players[state.trick.seat]?.name || '未知';
      if (ownerTag) ownerTag.textContent = `【${ownerName}】打出：`;
      if (move) move.textContent = `${state.trick.type} (${state.trick.cards.length}张)`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等 待 各 家 出 牌 ...</span>`;
      if (ownerTag) ownerTag.textContent = '桌上风向：享有自由出牌权 🌟';
      if (move) move.textContent = '—';
    }

    const me = state.players[0];
    if (me && me.hand) {
      hand.innerHTML = me.hand.map((card, i) => {
        return `
          <div class="gd-card ${card.color}" data-card-id="${card.id}" style="z-index: ${20 + i};">
            <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
            ${['J','Q','K'].includes(card.rank) ? `<div class="gd-card-court-bg">${card.rank}</div><div class="gd-card-court-avatar">${card.rank === 'J' ? '⚔️' : card.rank === 'Q' ? '🌸' : '👑'}</div>` : (card.kind === 'joker' ? `<div class="gd-card-art-txt">${card.rank === 'W' ? '👑' : '🃏'}</div>` : `<div class="gd-card-grid-suits">${Array(Math.min(parseInt(card.rank)||10, 6)).fill(`<span class="gd-mini-suit">${card.symbol}</span>`).join('')}</div>`)}
            <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
          </div>`;
      }).join('');

      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
      });
    }

    // 唤醒控制台
    if (actionBar) {
      if (state.currentTurn === 0 && me && me.hand.length > 0) {
        actionBar.classList.add('show');
        const playBtn = root.querySelector('[data-gd-play]');
        const passBtn = root.querySelector('[data-gd-pass]');
        if (playBtn) playBtn.disabled = state.selected.size === 0;
        if (passBtn) passBtn.disabled = !state.trick; // 享有自由出牌权时不允许点过牌
      } else {
        actionBar.classList.remove('show');
      }
    }
  }

  // 🏁 ✨ 优化点 3：检查双打游戏是否终结并自动进阶级数
  function checkGameEndStatus() {
    const p0 = state.players[0].hand.length === 0; // 南
    const p1 = state.players[1].hand.length === 0; // 东
    const p2 = state.players[2].hand.length === 0; // 北
    const p3 = state.players[3].hand.length === 0; // 西

    // 南北同盟均出完牌 -> 胜利
    if (p0 && p2) {
      state.currentRank += 1; // 实时进阶级数
      const rankNode = document.querySelector('[data-gd-rank]');
      if (rankNode) rankNode.textContent = state.currentRank;
      alert(`🎉 恭喜胜利！\n你与对家配合默契，双双出完牌！主级进阶至：${state.currentRank}`);
      destroy();
      return true;
    }
    // 东西同盟均出完牌 -> 失败
    if (p1 && p3) {
      alert(`💔 遗憾失败！\n对手两家已全部跑光。请重整旗鼓再来一局！`);
      destroy();
      return true;
    }
    return false;
  }

  // ✨ 优化点 3：核心轮转调度器（处理接风、智能级联跳过已出完牌玩家）
  function changeTurn(nextSeat) {
    if (checkGameEndStatus()) return;

    // 寻找下一个还没出完牌的有效玩家
    let loops = 0;
    while (state.players[nextSeat].hand.length === 0 && loops < 4) {
      nextSeat = (nextSeat + 1) % 4;
      loops++;
    }

    // 接风/借风逻辑：如果转了一圈回来发现回到了上次出牌人（或者出牌人出完牌后无人要，回到了出完牌的人那里）
    if (state.trick && state.trick.seat === nextSeat) {
      state.trick = null; // 牌权清空，下一个人无条件重新享有自由出牌权！
    }

    state.currentTurn = nextSeat;
    state.turnCountdown = 30;
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1000;
    renderTable();

    // 如果智能级联切到的人已经出完牌了（极端防御情况），继续切
    if (state.players[state.currentTurn].hand.length === 0) {
      changeTurn((state.currentTurn + 1) % 4);
    }
  }

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;
    
    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    
    // 如果此人打完这手牌刚刚好跑完，且场上还没达到总终结条件
    const isFinishedRightNow = player.hand.length === 0;
    
    changeTurn((seat + 1) % 4);
    return true;
  }

  function passTurn(seat) {
    // 如果下一个人是当时出牌的人，说明一圈没人要，牌权清空
    if (state.trick && state.trick.seat === ((seat + 1) % 4)) {
      state.trick = null;
    }
    changeTurn((seat + 1) % 4);
  }

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

  // 🤖 智能单机版 AI 出牌策略决策器
  function triggerAIMove() {
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      if (!player || player.hand.length === 0) { changeTurn((seat + 1) % 4); return; }
      
      const hand = player.hand;
      
      // AI 享有首发/自由出牌权
      if (!state.trick) {
        // 首选对子
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].value === hand[i+1].value) {
            playCards(seat, [hand[i], hand[i+1]]);
            return;
          }
        }
        // 次选单张
        playCards(seat, [hand[0]]);
        return;
      }

      // AI 跟牌管牌逻辑
      if (state.trick.type === '单张') {
        const target = hand.find(c => c.value > state.trick.weight);
        if (target) { playCards(seat, [target]); return; }
      } else if (state.trick.type === '对子' && hand.length >= 2) {
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].value === hand[i+1].value && hand[i].value > state.trick.weight) {
            playCards(seat, [hand[i], hand[i+1]]);
            return;
          }
        }
      }

      // 管不起过牌
      passTurn(seat);
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

    on(hand, 'contextmenu', (e) => {
      e.preventDefault(); 
      if (state.currentTurn !== 0) return;
      const card = e.target.closest('.gd-card');
      if (!card) return;
      const id = card.getAttribute('data-card-id');
      if (!state.selected.has(id)) state.selected.add(id);
      humanPlay();
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
    console.log('[Guandan] 全自动接风进阶判定版初始化...');
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

    // 初始化同步全局左上角进阶等级展示
    const rankNode = newShell.querySelector('[data-gd-rank]');
    if (rankNode) rankNode.textContent = state.currentRank;

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