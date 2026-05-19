(() => {
  'use strict';

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const SUITS = { S: '♠', H: '♥', C: '♣', D: '♦' };
  const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const W = Object.fromEntries(RANKS.map((v, i) => [v, i + 3]));
  const JOKER = { '小王': 16, '大王': 17 };
  const SEATS = ['South', 'East', 'North', 'West'];
  const TEAM = [0, 1, 0, 1]; // 0: South/North, 1: East/West

  const state = {
    gameMode: 'SINGLE_PLAYER',
    currentRank: 2,
    players: [],
    currentTurn: 0,
    lastMove: null,
    selected: new Set(),
    root: null,
    timer: null,
    ctx: null,
    active: false,
    busy: false,
    logs: [],
    cardsById: new Map(),
    styleNode: null,
    listeners: [],
    aiDelay: 0,
    loopTick: 0,
  };

  const GD = (window.GD = window.GD || {});
  if (GD.__loaded) return;
  GD.__loaded = true;
  GD.state = state;

  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const isJoker = (c) => c.v === '小王' || c.v === '大王';
  const isRed = (c) => c.s === SUITS.H || isJoker(c);
  const sortCards = (arr) => arr.slice().sort((a, b) => a.w - b.w || a.s.localeCompare(b.s));
  const seatName = (i) => ['南', '东', '北', '西'][i];
  const teamName = (i) => (TEAM[i] === 0 ? 'A组' : 'B组');
  const sameTeam = (a, b) => TEAM[a] === TEAM[b];

  function getCtx() {
    if (!state.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      state.ctx = new AC();
    }
    if (state.ctx.state === 'suspended') state.ctx.resume().catch(() => {});
    return state.ctx;
  }

  function beep(type) {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    if (type === 'click') {
      o.type = 'sine'; o.frequency.setValueAtTime(920, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.start(t); o.stop(t + 0.07);
    } else if (type === 'play') {
      o.type = 'triangle'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.075);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    } else if (type === 'bomb') {
      o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.start(t); o.stop(t + 0.45);
    } else {
      o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.start(t); o.stop(t + 0.13);
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID}{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#08130b;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .gd-shell{height:100%;display:grid;grid-template-rows:auto 1fr auto}
      #${ROOT_ID} .gd-top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;background:rgba(0,0,0,.28);backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,215,0,.18)}
      #${ROOT_ID} .gd-badges{display:flex;gap:8px;flex-wrap:wrap}
      #${ROOT_ID} .gd-pill{padding:6px 10px;border:1px solid rgba(255,215,0,.22);border-radius:999px;background:rgba(255,255,255,.06);font-size:12px}
      #${ROOT_ID} .gd-main{display:grid;grid-template-columns:minmax(190px, 250px) minmax(0,1fr) minmax(190px, 260px);gap:12px;padding:12px;min-height:0}
      #${ROOT_ID} .gd-panel{min-height:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,215,0,.16);border-radius:18px;box-shadow:0 16px 34px rgba(0,0,0,.22);overflow:hidden}
      #${ROOT_ID} .gd-panel-h{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,215,0,.12)}
      #${ROOT_ID} .gd-panel-b{padding:10px 12px}
      #${ROOT_ID} .gd-table{min-height:calc(100vh - 190px);display:grid;grid-template-rows:auto 1fr auto;gap:12px;padding:16px;background:radial-gradient(circle, #195a32 0%, #0d321b 100%);border-radius:22px;border:2px solid rgba(255,215,0,.65);box-shadow:inset 0 0 60px rgba(0,0,0,.22)}
      #${ROOT_ID} .gd-seats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${ROOT_ID} .gd-seat{padding:10px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
      #${ROOT_ID} .gd-seat.active{outline:2px solid rgba(255,215,0,.85)}
      #${ROOT_ID} .gd-seat .meta{font-size:12px;opacity:.8;line-height:1.5}
      #${ROOT_ID} .gd-trick{min-height:110px;display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;padding:10px;border-radius:18px;background:rgba(0,0,0,.15);border:1px dashed rgba(255,255,255,.16)}
      #${ROOT_ID} .gd-card,#${ROOT_ID} .gd-mini{background:#fff;color:#111;border-radius:14px;box-shadow:0 6px 12px rgba(0,0,0,.4);border:2px solid transparent;font-weight:800}
      #${ROOT_ID} .gd-card{width:75px;height:106px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;margin-left:-40px;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
      #${ROOT_ID} .gd-card:first-child{margin-left:0}
      #${ROOT_ID} .gd-card:hover,#${ROOT_ID} .gd-card.sel{transform:translateY(-20px);border-color:#d4af37;box-shadow:0 10px 20px rgba(0,0,0,.45)}
      #${ROOT_ID} .gd-card.red{color:#b11226}
      #${ROOT_ID} .gd-hand{display:flex;align-items:flex-end;justify-content:center;flex-wrap:nowrap;overflow:auto;padding:4px 4px 0;min-height:132px}
      #${ROOT_ID} .gd-controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:10px}
      #${ROOT_ID} button{border:0;border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer}
      #${ROOT_ID} .primary{background:linear-gradient(135deg,#f6d365,#fda085)}
      #${ROOT_ID} .ghost{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.12)}
      #${ROOT_ID} .danger{background:#ef4444;color:#fff}
      #${ROOT_ID} .gd-log{display:flex;flex-direction:column;gap:8px;max-height:100%;overflow:auto}
      #${ROOT_ID} .gd-log p{margin:0;padding:8px 10px;background:rgba(255,255,255,.05);border-radius:12px;font-size:13px;line-height:1.45}
      #${ROOT_ID} .gd-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,215,0,.15)}
      @media (max-width: 980px){#${ROOT_ID} .gd-main{grid-template-columns:1fr}#${ROOT_ID} .gd-table{min-height:calc(100vh - 250px)}}
      @media (max-width: 640px){#${ROOT_ID} .gd-card{width:56px;height:82px;margin-left:-24px;font-size:12px}#${ROOT_ID} .gd-table{padding:10px}#${ROOT_ID} .gd-seats{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function initDeck() {
    const deck = [];
    const suits = Object.values(SUITS);
    for (let k = 0; k < 2; k++) {
      for (const s of suits) for (const v of RANKS) deck.push({ id: uid(), v, s, isRed: s === SUITS.H, w: W[v] });
      deck.push({ id: uid(), v: '小王', s: '🃏', isRed: true, w: JOKER['小王'] });
      deck.push({ id: uid(), v: '大王', s: '🃏', isRed: false, w: JOKER['大王'] });
    }
    for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
    state.cardsById = new Map(deck.map((c) => [c.id, c]));
    state.players = [0, 1, 2, 3].map((seat) => ({ seat, name: seatName(seat), team: TEAM[seat], hand: [] }));
    deck.forEach((c, i) => state.players[i % 4].hand.push(c));
    state.players.forEach((p) => p.hand.sort((a, b) => a.w - b.w));
    state.currentTurn = 0;
    state.lastMove = null;
    state.selected = new Set();
    state.logs = ['掼蛋已启动'];
    state.aiDelay = 0;
    state.active = true;
  }

  function moveType(cards) {
    const n = cards.length;
    const ws = cards.map((c) => c.w).sort((a, b) => a - b);
    const counts = cards.reduce((m, c) => (m[c.w] = (m[c.w] || 0) + 1, m), {});
    const uniq = Object.keys(counts).length;
    if (n === 1) return { t: 'single', w: ws[0], n };
    if (n === 2 && uniq === 1) return { t: 'pair', w: ws[0], n };
    if (n === 3 && uniq === 1) return { t: 'triple', w: ws[0], n };
    if (n >= 4 && uniq === 1) return { t: 'bomb', w: ws[0], n };
    return null;
  }

  function beats(a, b) {
    if (!b) return true;
    if (a.t === 'bomb' && b.t !== 'bomb') return true;
    if (a.t !== b.t) return false;
    if (a.n !== b.n) return false;
    return a.w > b.w;
  }

  function pickLowest(hand, n = 1) { return sortCards(hand).slice(0, n); }

  function findSmallestBigger(hand, last) {
    const g = hand.reduce((m, c) => ((m[c.w] ||= []).push(c), m), {});
    if (!last) return pickLowest(hand, 1);
    if (last.t === 'single' || last.t === 'pair' || last.t === 'triple') {
      for (const w of Object.keys(g).map(Number).sort((a, b) => a - b)) {
        if (w > last.w && g[w].length >= last.n) return g[w].slice(0, last.n);
      }
    }
    for (const w of Object.keys(g).map(Number).sort((a, b) => a - b)) if (g[w].length >= 4 && (last.t !== 'bomb' || w > last.w)) return g[w].slice(0, 4);
    return null;
  }

  function playGDSound(type) { beep(type); }

  function log(msg) { state.logs.unshift(msg); state.logs = state.logs.slice(0, 10); }

  function renderTable() {
    const r = state.root;
    if (!r) return;
    const seats = r.querySelector('[data-gd-seats]');
    const trick = r.querySelector('[data-gd-trick]');
    const logEl = r.querySelector('[data-gd-log]');
    const hand = r.querySelector('[data-gd-hand]');
    const turn = r.querySelector('[data-gd-turn]');
    const rank = r.querySelector('[data-gd-rank]');
    const move = r.querySelector('[data-gd-move]');
    const score = r.querySelector('[data-gd-score]');

    seats.innerHTML = state.players.map((p) => {
      const preview = sortCards(p.hand).slice(0, 8).map((c) => `<span class="gd-mini ${c.isRed ? 'red' : ''}" style="padding:4px 6px;margin:2px;display:inline-flex">${c.v}${c.s}</span>`).join('');
      return `<div class="gd-seat ${p.seat === state.currentTurn ? 'active' : ''}"><b>${seatName(p.seat)} · ${teamName(p.seat)}</b><div class="meta">${p.hand.length} 张${p.hand.length <= 10 ? '｜报子' : ''}${p.hand.length <= 5 ? '｜快报子' : ''}</div><div style="display:flex;flex-wrap:wrap">${preview}</div></div>`;
    }).join('');

    trick.innerHTML = state.lastMove ? state.lastMove.cards.map((c) => `<span class="gd-mini ${c.isRed ? 'red' : ''}" style="padding:10px 12px">${c.v}${c.s}</span>`).join('') : '<span style="opacity:.7">等待出牌</span>';
    hand.innerHTML = sortCards(state.players[0].hand).map((c) => `<button class="gd-card ${c.isRed ? 'red' : ''} ${state.selected.has(c.id) ? 'sel' : ''}" data-id="${c.id}" type="button">${c.v}<br>${c.s}</button>`).join('');
    turn.textContent = `${seatName(state.currentTurn)} (${teamName(state.currentTurn)})`;
    rank.textContent = String(state.currentRank);
    move.textContent = state.lastMove ? `${state.lastMove.t} · ${state.lastMove.cards.length}` : '—';
    score.textContent = `${state.players[0].hand.length} / ${state.players[1].hand.length} / ${state.players[2].hand.length} / ${state.players[3].hand.length}`;
    logEl.innerHTML = state.logs.map((x) => `<p>${x}</p>`).join('');
    r.querySelector('[data-gd-play]').disabled = state.currentTurn !== 0;
    r.querySelector('[data-gd-pass]').disabled = state.currentTurn !== 0 || !state.lastMove;
  }

  function playCards(seat, cards) {
    const player = state.players[seat];
    const mv = moveType(cards);
    if (!mv) return false;
    if (!beats(mv, state.lastMove)) return false;
    const ids = new Set(cards.map((c) => c.id));
    player.hand = player.hand.filter((c) => !ids.has(c.id));
    state.selected.clear();
    state.lastMove = { ...mv, cards, seat };
    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 280;
    playGDSound(mv.t === 'bomb' ? 'bomb' : 'play');
    log(`${seatName(seat)} 出牌：${mv.t}`);
    if (!player.hand.length) log(`${seatName(seat)} 已出完牌`);
    renderTable();
    return true;
  }

  function passTurn(seat) {
    state.currentTurn = (seat + 1) % 4;
    playGDSound('pass');
    log(`${seatName(seat)} 过牌`);
    if (state.lastMove && state.currentTurn === state.lastMove.seat) state.lastMove = null;
    renderTable();
  }

  function triggerAIMove() {
    if (!state.active || state.busy || state.currentTurn === 0 || performance.now() < state.aiDelay) return;
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      const lead = !state.lastMove;
      const teammateWinning = state.lastMove && sameTeam(seat, state.lastMove.seat);
      let choice = null;
      if (lead || teammateWinning) choice = pickLowest(player.hand, 1);
      else choice = findSmallestBigger(player.hand, state.lastMove);
      if (choice) playCards(seat, choice); else passTurn(seat);
    } finally {
      state.busy = false;
    }
  }

  function humanPlay() {
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map((id) => state.cardsById.get(id)).filter(Boolean);
    const mv = moveType(cards);
    if (!mv) return toast('牌型不合法');
    if (!beats(mv, state.lastMove)) return toast('压不过当前牌');
    playCards(0, cards);
  }

  function humanPass() { if (state.currentTurn === 0 && state.lastMove) passTurn(0); }
  function toast(msg) { const t = state.root.querySelector('[data-gd-toast]'); t.textContent = msg; t.style.opacity = '1'; clearTimeout(state._toast); state._toast = setTimeout(() => (t.style.opacity = '0'), 1200); }

  function renderHand() {
    const hand = state.root.querySelector('[data-gd-hand]');
    hand.onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b || state.currentTurn !== 0) return;
      const id = b.getAttribute('data-id');
      state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
      playGDSound('click');
      renderTable();
    };
  }

  function destroy() {
    clearInterval(state.timer);
    state.timer = null;
    state.active = false;
    state.selected.clear();
    state.logs = [];
    state.players = [];
    state.lastMove = null;
    state.currentTurn = 0;
    if (state.root && state.root.parentNode) state.root.remove();
    if (state.styleNode && state.styleNode.parentNode) state.styleNode.remove();
    const sel = document.getElementById('game-selection'); if (sel) sel.style.display = 'block';
    const app = document.querySelector('.app'); if (app) app.style.display = '';
    state.root = null; state.styleNode = null; state.cardsById = new Map();
    state.ctx?.close?.().catch(() => {});
    state.ctx = null;
    window.GD.state = state;
  }

  function init() {
    if (state.active) return;
    injectStyles();
    const sel = document.getElementById('game-selection'); if (sel) sel.style.display = 'none';
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-shell">
        <div class="gd-top">
          <div><b>掼蛋娱乐模式</b><div style="opacity:.75;font-size:12px">window.GD 独立沙箱 / 1 对 3 本地 AI</div></div>
          <div class="gd-badges">
            <span class="gd-pill">当前轮次：<b data-gd-rank>2</b></span>
            <span class="gd-pill">当前出牌：<b data-gd-turn>南</b></span>
            <span class="gd-pill">当前牌型：<b data-gd-move>—</b></span>
          </div>
        </div>
        <div class="gd-main">
          <section class="gd-panel">
            <div class="gd-panel-h"><b>四方座位</b><span class="gd-pill">A组 / B组</span></div>
            <div class="gd-panel-b"><div class="gd-seats" data-gd-seats></div></div>
          </section>
          <section class="gd-table">
            <div class="gd-panel" style="background:rgba(0,0,0,.12)"><div class="gd-panel-h"><b>公共牌桌</b><span class="gd-pill">108 张 / 双副牌</span></div><div class="gd-panel-b"><div class="gd-trick" data-gd-trick></div></div></div>
            <div class="gd-panel"><div class="gd-panel-h"><b>玩家手牌（South）</b><span class="gd-pill">点击多选</span></div><div class="gd-panel-b"><div class="gd-hand" data-gd-hand></div></div></div>
            <div class="gd-controls">
              <button class="primary" data-gd-play>出牌</button>
              <button class="ghost" data-gd-pass>过牌</button>
              <button class="ghost" data-gd-sort>整理</button>
              <button class="danger" data-gd-exit>返回主页</button>
            </div>
          </section>
          <section class="gd-panel">
            <div class="gd-panel-h"><b>日志 / 计分</b><span class="gd-pill">剩余牌</span></div>
            <div class="gd-panel-b"><div class="gd-log" data-gd-log></div><div class="gd-pill" style="display:block;margin-top:10px;text-align:center">A / B = <b data-gd-score></b></div></div>
          </section>
        </div>
        <div class="gd-foot"><span>桌面/移动自适应 · 纯 Canvas/AudioContext 无资源依赖</span><span data-gd-toast style="opacity:0;transition:opacity .15s ease"></span></div>
      </div>`;
    state.root = root;
    document.body.appendChild(root);
    const exit = root.querySelector('[data-gd-exit]');
    const play = root.querySelector('[data-gd-play]');
    const pass = root.querySelector('[data-gd-pass]');
    const sort = root.querySelector('[data-gd-sort]');
    exit.onclick = () => { playGDSound('click'); destroy(); };
    play.onclick = () => { playGDSound('click'); humanPlay(); };
    pass.onclick = () => { playGDSound('click'); humanPass(); };
    sort.onclick = () => { state.players[0].hand = sortCards(state.players[0].hand); playGDSound('click'); renderTable(); };
    initDeck();
    renderHand();
    renderTable();
    state.timer = setInterval(() => { state.loopTick++; triggerAIMove(); }, 260);
    state.active = true;
    window.GD.destroy = destroy;
    window.GD.render = renderTable;
    window.GD.playGDSound = playGDSound;
  }

  function boot() {
    const btn = document.getElementById('go-guandan-btn');
    if (btn && !btn.dataset.gdBound) {
      btn.dataset.gdBound = '1';
      btn.addEventListener('click', init, { passive: true });
    }
  }

  window.GD.init = init;
  window.GD.destroy = destroy;
  window.GD.playGDSound = playGDSound;

  document.addEventListener('DOMContentLoaded', boot, { once: true });
  if (document.readyState !== 'loading') boot();
})();
