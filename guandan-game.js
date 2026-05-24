/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (终极防御：全面解决 DOM 找不到节点导致的 null 报错版)
 */
(() => {
  'use strict';

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  
  const GD = (window.GD = window.GD || {});
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 80; 
  
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
    currentRank: 3, 
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
  };

  GD.state = state;

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;
  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  
  function sortCards(cards) {
    if (!cards) return [];
    return cards.slice().sort((a, b) => {
      const valA = a.rank === String(state.currentRank) ? (a.suit === 'H' ? 15.5 : 14.5) : a.value;
      const valB = b.rank === String(state.currentRank) ? (b.suit === 'H' ? 15.5 : 14.5) : b.value;
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
      #${ROOT_ID} { position: fixed; inset: 0; z-index: 9999; background: radial-gradient(circle at center, #134e20 0%, #031206 100%); color: #f5f7f4; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; overflow: hidden; user-select: none; }
      #${ROOT_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      
      .gd-header { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; z-index: 9999; pointer-events: none; }
      .gd-header-info { background: rgba(0,0,0,0.75); padding: 10px 24px; border-radius: 12px; border: 1px solid rgba(255,215,0,0.4); font-size: 15px; font-weight: bold; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 4px; }
      .gd-exit-btn { background: linear-gradient(180deg, #ff5252 0%, #c92a2a 100%); color: white; border: none; padding: 10px 22px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 14px; pointer-events: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
      
      .gd-arena { position: relative; flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
      
      .gd-seat { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 50; }
      .gd-seat.top { top: 30px; left: 50%; transform: translateX(-50%); } 
      .gd-seat.left { left: 40px; top: 40%; transform: translateY(-50%); }
      .gd-seat.right { right: 40px; top: 40%; transform: translateY(-50%); }
      .gd-seat.bottom { bottom: 180px; left: 50%; transform: translateX(-50%); }
      
      .gd-action-bar { display: none; gap: 20px; justify-content: center; width: auto; margin-bottom: 12px; height: 45px; z-index: 1005; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: none; padding: 8px 30px; border-radius: 20px; font-weight: 900; font-size: 16px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
      .gd-btn-play { background: linear-gradient(180deg, #fff3bf 0%, #fab005 100%); color: #111; }
      .gd-btn-pass { background: linear-gradient(180deg, #ffffff 0%, #cfd8dc 100%); color: #222; }
      .gd-btn-sort { background: linear-gradient(180deg, #63e6be 0%, #0ca678 100%); color: white; }
      .gd-action-bar button:disabled { background: #495057 !important; color: #868e96 !important; cursor: not-allowed; box-shadow: none; }
      
      .gd-player-info { background: rgba(10,25,14,0.92); padding: 12px 24px; border-radius: 14px; text-align: center; min-width: 150px; border: 2px solid rgba(255,255,255,0.15); box-shadow: 0 6px 15px rgba(0,0,0,0.4); }
      .gd-player-info.active { border-color: #FFD700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); background: rgba(20,45,25,0.95); }
      .gd-player-name { font-weight: 800; font-size: 16px; color: #fff; }
      .gd-player-detail { font-size: 13px; color: #FFD700; margin-top: 4px; }
      
      .gd-center-table { position: absolute; width: 500px; height: 220px; border: 2px dashed rgba(255,255,255,0.15); border-radius: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.1); }
      .gd-trick { display: flex; justify-content: center; align-items: center; width: 100%; min-height: 120px; }
      .gd-trick-empty { font-size: 15px; color: rgba(255,255,255,0.2); font-weight: bold; }
      
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 140px; width: 95vw; position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); z-index: 1000; }
      
      .gd-card { width: ${CARD_W}px; height: 118px; position: relative; background: #ffffff; border-radius: 8px; box-shadow: -3px 3px 6px rgba(0,0,0,0.3); margin-left: -50px; transition: transform 0.1s ease; color: #000; border: 1px solid #bbb; overflow: hidden; }
      .gd-card:first-child { margin-left: 0 !important; }
      .gd-trick .gd-card { margin-left: -45px; box-shadow: -4px 4px 10px rgba(0,0,0,0.4); }
      .gd-trick .gd-card:first-child { margin-left: 0 !important; }
      
      .gd-card.sel { transform: translateY(-30px) !important; border: 2px solid #ff9f00 !important; box-shadow: 0 6px 15px rgba(255,159,0,0.5); }
      .gd-card:hover { z-index: 9999 !important; transform: translateY(-12px); }
      
      .gd-wild-card { border: 2px dashed #fab005 !important; background: #fffdf0 !important; }
      .gd-card.red { color: #d63031; }
      .gd-card.black { color: #2d3436; }
      .gd-card .corner { position: absolute; font-size: 16px; line-height: 1.0; padding: 4px; display: flex; flex-direction: column; align-items: center; font-weight: bold; }
      .gd-card .tl { top: 2px; left: 2px; }
      .gd-card .br { bottom: 2px; right: 2px; transform: rotate(180deg); }
      .gd-card .center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 28px; }
      
      .gd-toast { position: fixed; top: 15%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); border: 1px solid #ff9f00; color: #fff; padding: 12px 32px; border-radius: 20px; font-size: 15px; font-weight: bold; z-index: 10005; opacity: 0; transition: opacity 0.2s ease; pointer-events: none; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
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

  function startNewRound() {
    const deck = makeDeck();
    state.players.forEach((p) => { p.hand = []; });
    deck.forEach((card, idx) => { state.players[idx % 4].hand.push(card); });
    state.players.forEach((p) => { p.hand = sortCards(p.hand); });
    
    state.selected.clear();
    state.trick = null;
    state.currentTurn = 0; 
    state.aiDelay = performance.now() + 600;
    state.active = true;   
    state.busy = false;

    const rankNode = document.querySelector('[data-gd-rank]');
    if (rankNode) {
      const labelMap = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
      rankNode.textContent = labelMap[state.currentRank] || state.currentRank;
    }
    renderTable();
  }

  function groupsByValue(cards) {
    const map = new Map();
    for (const c of cards) {
      if (!map.has(c.value)) map.set(c.value, []);
      map.get(c.value).push(c);
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
    const wildCount = cards.filter(c => c.rank === String(state.currentRank) && c.suit === 'H').length;
    const values = cards.map((c) => c.value);
    const grouped = groupsByValue(cards);
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    const allSame = counts.length === 1;

    if (n === 1) return { type: 'single', weight: values[0], size: 1 };
    if (n === 2 && (allSame || wildCount === 1)) return { type: 'pair', weight: values[0], size: 2 };
    if (n === 3 && (allSame || wildCount >= 1)) return { type: 'triple', weight: values[0], size: 3 };
    if (n >= 4 && (allSame || (counts.length <= 2 && wildCount >= 1))) return { type: 'bomb', weight: values[0] * 100 + n, size: n };
    if (n === 5 && rankSeq(values) && sameSuit(cards)) return { type: 'straight_flush', weight: values[0], size: 5 };
    if (n === 4 && cards.every((c) => c.kind === 'joker')) return { type: 'rocket', weight: 9999, size: 4 };
    if (n >= 5 && rankSeq(values) && values.every((v) => v < 16)) return { type: 'straight', weight: values[0], size: n };
    
    if (n >= 6 && n % 2 === 0 && [...grouped.values()].every((x) => x.length === 2)) {
      const pairVals = [...grouped.keys()].sort((a, b) => a - b);
      if (rankSeq(pairVals) && pairVals.every((v) => v < 16)) return { type: 'pair_seq', weight: pairVals[0], size: n };
    }
    if (n === 5) {
      const triple = [...grouped.entries()].find(([, x]) => x.length === 3);
      const pair = [...grouped.entries()].find(([, x]) => x.length === 2);
      if (triple && pair) return { type: 'full_house', weight: Number(triple[0]), size: 5 };
    }
    return null;
  }

  function beats(next, prev) {
    if (next.type === 'rocket') return true;
    if (prev.type === 'rocket') return false;
    if (next.type === 'bomb' && prev.type !== 'bomb') return true;
    if (next.type === 'bomb' && prev.type === 'bomb') {
      if (next.size !== prev.size) return next.size > prev.size;
      return next.weight > prev.weight;
    }
    return next.type === prev.type && next.size === prev.size && next.weight > prev.weight;
  }

  function formatCard(card) {
    const isWild = card.rank === String(state.currentRank) && card.suit === 'H';
    return `
      <div class="gd-card ${card.color} ${isWild ? 'gd-wild-card' : ''}" data-card-id="${card.id}">
        <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
        <span class="center">${isWild ? '⭐' : card.symbol}</span>
        <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
      </div>`;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-header">
        <div class="gd-header-info">当前主级: 打 <span data-gd-rank>${state.currentRank}</span> | 桌上牌型: <span data-gd-move>—</span></div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>
      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>
        <div class="gd-center-table"><div class="gd-trick" data-gd-trick></div></div>
        <div class="gd-seat bottom" data-gd-seat="0">
          <div class="gd-action-bar" data-gd-action-bar>
            <button class="gd-btn-play" data-gd-play>出 牌</button>
            <button class="gd-btn-pass" data-gd-pass>过 牌</button>
            <button class="gd-btn-sort" data-gd-sort>整 理</button>
          </div>
          <div class="gd-hand" data-gd-hand></div>
        </div>
      </div>
      <div class="gd-toast" data-gd-toast></div>
    `;
    return root;
  }

  function renderSeats() {
    if (!state.root) return;
    SEATS.forEach((seat, idx) => {
      const seatNode = state.root.querySelector(`[data-gd-seat="${idx}"]`);
      if (!seatNode) return;
      const p = state.players[idx];
      if (!p) return;
      const isActive = state.currentTurn === idx;
      const cardCount = p.hand ? p.hand.length : 0;
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">🂠 ${cardCount === 0 ? '🏅 已跑光' : `剩余 ${cardCount} 张`}</div>
        </div>`;
    });
  }

  // 🌟 终极防御：全面进行空指针安全拦截，绝不发生 innerHTML of null 崩溃
  function renderTable() {
    const root = document.getElementById(ROOT_ID) || state.root;
    if (!root) return; 
    
    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    if (trick) {
      if (state.trick) {
        trick.innerHTML = state.trick.cards.map(formatCard).join('');
        if (move) move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
      } else {
        trick.innerHTML = `<span class="gd-trick-empty">桌上干净，等待出牌...</span>`;
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
      if (state.currentTurn === 0 && me.hand.length > 0) {
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

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    
    if (player.hand.length === 0) showToast(`👏 恭喜 ${player.name} 出光手牌！`);
    if (checkGameOver()) return true;

    let nextTurn = (seat + 1) % 4;
    while (state.players[nextTurn].hand.length === 0) nextTurn = (nextTurn + 1) % 4;

    if (state.trick && state.trick.seat === nextTurn) state.trick = null;

    state.currentTurn = nextTurn;
    state.aiDelay = performance.now() + 600;
    renderTable();
    return true;
  }

  function passTurn(seat) {
    let nextTurn = (seat + 1) % 4;
    while (state.players[nextTurn].hand.length === 0) nextTurn = (nextTurn + 1) % 4;
    if (state.trick && state.trick.seat === nextTurn) state.trick = null;
    state.currentTurn = nextTurn;
    playGDSound('pass');
    renderTable();
  }

  function checkGameOver() {
    const team0Done = state.players[0].hand.length === 0 && state.players[2].hand.length === 0;
    const team1Done = state.players[1].hand.length === 0 && state.players[3].hand.length === 0;

    if (team0Done || team1Done) {
      state.active = false; 
      let winMsg = "";
      if (team0Done) {
        state.currentRank = Math.min(14, state.currentRank + 2);
        winMsg = `🎉 完胜！你与队友(南北同盟) 成功跑光！\n主级连升2级！即将开启下一局。`;
      } else {
        winMsg = `💔 局势失守！对手(东西同盟) 抢先全部出完！\n主级维持不变。即将开启下一局。`;
      }
      setTimeout(() => { alert(winMsg); startNewRound(); }, 300);
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
    
    if (last.type === 'single' || last.type === 'pair' || last.type === 'triple') {
      for (const [v, g] of byValue) { 
        if (v > last.weight && g.length >= last.size) return g.slice(0, last.size); 
      }
    }
    if (last.type !== 'bomb') {
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
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map(id => state.cardsById.get(id)).filter(Boolean);
    if (!cards.length) return showToast('请先选择想要击出的牌');
    const move = typeOf(cards);
    if (!move) return showToast('牌型不符合掼蛋规则！');
    if (state.trick && !beats(move, state.trick)) return showToast('不够大！压不上面前的牌型');
    playCards(0, cards);
  }

  function bindHandInteraction() {
    const container = document.getElementById(ROOT_ID);
    const hand = container?.querySelector('[data-gd-hand]');
    if (!hand) return;
    on(hand, 'click', (e) => {
      const card = e.target.closest('.gd-card');
      if (!card || state.currentTurn !== 0) return;
      const id = card.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });
  }

  function destroy() {
    clearInterval(state.timer);
    state.active = false; offAll();
    if (state.root) state.root.remove();
    if (state.styleNode) state.styleNode.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
  }

  function init() {
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles(); 
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    state.players = SEATS.map((seat) => ({ ...seat, hand: [] }));
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