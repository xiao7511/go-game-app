(() => {
  'use strict';
// 1. 常量定义区域
  const SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  
  // 2. 🌟 找到或在这里新建样式注入函数 🌟
  function injectStyles() {
    // 如果已经存在同名样式表，则不再重复注入
    if (document.getElementById('gd-dynamic-styles')) return;

    const style = document.createElement('style');
    style.id = 'gd-dynamic-styles'; // 加上 ID 方便辨识
    style.innerHTML = `
      /* ========================================== */
      /* 🌟 在这里无脑粘贴我上一轮给你的全部 CSS 优化样式 🌟 */
      /* ========================================== */
      #guandan-game-container {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: radial-gradient(circle, #195a32 0%, #0d321b 100%);
        box-shadow: inset 0 0 100px rgba(0,0,0,0.6);
        z-index: 9999; display: flex; flex-direction: column;
        overflow: hidden;
      }
      #gd-battlefield {
        flex: 1; position: relative; display: flex; align-items: center; justify-content: center;
        max-height: calc(100vh - 210px);
      }
      .gd-poker {
        width: 75px; height: 105px; background: #ffffff; border-radius: 6px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.4); border: 1px solid #dddddd;
        position: relative; cursor: pointer; user-select: none; transition: transform 0.1s ease-out;
        margin-left: -40px; display: flex; flex-direction: column; justify-content: space-between; padding: 6px;
      }
      .gd-poker .corner-top { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
      .gd-poker .corner-bottom { display: flex; flex-direction: column; align-items: center; line-height: 1.1; transform: rotate(180deg); }
      .gd-poker .card-value { font-size: 19px; font-weight: bold; font-family: "Georgia", serif; }
      .gd-poker .card-suit { font-size: 14px; }
      .gd-poker.red { color: #d63031; }
      .gd-poker.black { color: #2d3436; }
      .gd-poker.selected { transform: translateY(-24px); border: 2px solid #f1c40f; box-shadow: 0 8px 20px rgba(241,196,15,0.6); }
      #gd-action-bar {
        width: 100%; max-width: 400px;
        margin: 0 auto; display: flex; gap: 16px; justify-content: center; 
        padding: 10px 0; height: 60px; box-sizing: border-box;
        position: absolute; bottom: 135px; left: 50%; transform: translateX(-50%); z-index: 10;
      }
      .gd-btn {
        flex: 1; height: 40px; font-size: 15px; font-weight: bold; border-radius: 20px; border: none; cursor: pointer;
      }
      .gd-btn-primary { background: linear-gradient(135deg, #2ecc71, #27ae60); color: #fff; }
      .gd-btn-secondary { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: #2c3e50; }

      @media (max-width: 768px) {
        .gd-poker { width: 55px; height: 78px; margin-left: -32px; padding: 4px; }
        .gd-poker .card-value { font-size: 15px; }
        .gd-poker .card-suit { font-size: 11px; }
        #gd-action-bar { bottom: 105px; max-width: 85vw; }
      }
    `;
    document.head.appendChild(style);
  }


  const GD = (window.GD = window.GD || {});
  if (GD.__loaded) return;
  GD.__loaded = true;

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const CARD_W = 75;
  const SUITS = [
    { key: 'S', symbol: '♠', color: 'black' },
    { key: 'H', symbol: '♥', color: 'red' },
    { key: 'C', symbol: '♣', color: 'black' },
    { key: 'D', symbol: '♦', color: 'red' },
  ];
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 3]));
  const SEATS = [
    { id: 0, name: '南家', short: 'South', team: 0 },
    { id: 1, name: '东家', short: 'East', team: 1 },
    { id: 2, name: '北家', short: 'North', team: 0 },
    { id: 3, name: '西家', short: 'West', team: 1 },
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
    deckSeed: 0,
  };

  GD.state = state;

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtor ? new AudioCtor() : null;

  const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sameTeam = (a, b) => state.players[a]?.team === state.players[b]?.team;
  const isJoker = (c) => c.kind === 'joker';
  const isRed = (c) => c.suit === 'H' || isJoker(c);
  const sortCards = (cards) => cards.slice().sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
  const rankLabel = (c) => c.kind === 'joker' ? c.label : c.rank;
  const teamLabel = (team) => (team === 0 ? 'A组' : 'B组');

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
      o.type = 'sine';
      o.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t);
      o.stop(t + 0.055);
      return;
    }

    if (type === 'play') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(660, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.start(t);
      o.stop(t + 0.13);
      return;
    }

    if (type === 'bomb') {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.45);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.start(t);
      o.stop(t + 0.46);
      return;
    }

    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t);
    o.stop(t + 0.11);
  }

  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID}{position:fixed;inset:0;z-index:9999;background:#07160f;color:#f5f7f4;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;overflow:hidden}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .gd-shell{height:100%;display:grid;grid-template-rows:auto 1fr auto}
      #${ROOT_ID} .gd-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:rgba(0,0,0,.28);border-bottom:1px solid rgba(212,175,55,.18);backdrop-filter:blur(10px)}
      #${ROOT_ID} .gd-top strong{display:block;font-size:16px;letter-spacing:.08em}
      #${ROOT_ID} .gd-top small{display:block;font-size:12px;opacity:.72;margin-top:3px}
      #${ROOT_ID} .gd-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      #${ROOT_ID} .gd-pill{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(212,175,55,.18);font-size:12px}
      #${ROOT_ID} .gd-main{min-height:0;display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr) minmax(180px,240px);gap:12px;padding:12px}
      #${ROOT_ID} .gd-panel{min-height:0;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid rgba(212,175,55,.12);border-radius:18px;box-shadow:0 18px 38px rgba(0,0,0,.25)}
      #${ROOT_ID} .gd-panel-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(212,175,55,.12)}
      #${ROOT_ID} .gd-panel-b{padding:10px 12px}
      #${ROOT_ID} .gd-table{min-height:0;display:grid;grid-template-rows:auto 1fr auto;gap:12px;padding:14px;background:radial-gradient(circle, #1b5e36 0%, #0c2b19 100%);border-radius:22px;border:2px solid #d4af37;box-shadow:inset 0 0 0 2px rgba(212,175,55,.28), inset 0 0 72px rgba(0,0,0,.18)}
      #${ROOT_ID} .gd-seats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${ROOT_ID} .gd-seat{padding:10px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
      #${ROOT_ID} .gd-seat.active{outline:2px solid rgba(212,175,55,.95);outline-offset:0}
      #${ROOT_ID} .gd-seat .meta{font-size:12px;opacity:.84;line-height:1.5}
      #${ROOT_ID} .gd-board{display:grid;grid-template-rows:auto 1fr auto;gap:12px;min-height:0}
      #${ROOT_ID} .gd-trick{min-height:118px;display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;padding:12px;border-radius:18px;background:rgba(0,0,0,.16);border:1px dashed rgba(255,255,255,.18)}
      #${ROOT_ID} .gd-trick-empty{opacity:.72}
      #${ROOT_ID} .gd-card,#${ROOT_ID} .gd-mini{background:#fff;color:#111;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.4);border:1px solid rgba(0,0,0,.12);font-family:"Georgia",serif}
      #${ROOT_ID} .gd-card{width:${CARD_W}px;aspect-ratio:1 / 1.4;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:transform .1s ease-out, box-shadow .1s ease-out, border-color .1s ease-out;background:linear-gradient(180deg,#fff,#f7f7f7);margin-left:-5vw;overflow:hidden}
      #${ROOT_ID} .gd-card:first-child{margin-left:0}
      #${ROOT_ID} .gd-card:hover,#${ROOT_ID} .gd-card.sel{transform:translateY(-24px);border-color:#d4af37;box-shadow:0 8px 16px rgba(0,0,0,.42)}
      #${ROOT_ID} .gd-card.red{color:#d63031}
      #${ROOT_ID} .gd-card.black{color:#2d3436}
      #${ROOT_ID} .gd-card .corner{position:absolute;display:flex;flex-direction:column;align-items:flex-start;line-height:1}
      #${ROOT_ID} .gd-card .corner span{display:block}
      #${ROOT_ID} .gd-card .corner .r{font-size:15px;font-weight:700}
      #${ROOT_ID} .gd-card .corner .s{font-size:10px;margin-top:2px}
      #${ROOT_ID} .gd-card .tl{top:6px;left:6px}
      #${ROOT_ID} .gd-card .br{right:6px;bottom:6px;transform:rotate(180deg)}
      #${ROOT_ID} .gd-card .center{font-size:18px;font-weight:700;transform:translateY(-1px)}
      #${ROOT_ID} .gd-hand{display:flex;align-items:flex-end;justify-content:center;flex-wrap:nowrap;overflow:auto;padding:8px 6px 0;min-height:140px;max-height:20vh}
      #${ROOT_ID} .gd-controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:10px 12px 12px}
      #${ROOT_ID} button{border:0;border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer;transition:transform .12s ease,opacity .12s ease,box-shadow .12s ease}
      #${ROOT_ID} button:active{transform:translateY(1px)}
      #${ROOT_ID} .primary{background:linear-gradient(135deg,#f6d365,#fda085);color:#1a1a1a;box-shadow:0 10px 22px rgba(246,211,101,.18)}
      #${ROOT_ID} .ghost{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.14)}
      #${ROOT_ID} .danger{background:#ef4444;color:#fff}
      #${ROOT_ID} .gd-log{display:flex;flex-direction:column;gap:8px;max-height:100%;overflow:auto}
      #${ROOT_ID} .gd-log p{margin:0;padding:8px 10px;background:rgba(255,255,255,.05);border-radius:12px;font-size:13px;line-height:1.45}
      #${ROOT_ID} .gd-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;background:rgba(0,0,0,.22);border-top:1px solid rgba(212,175,55,.15)}
      #${ROOT_ID} .gd-toast{opacity:0;transition:opacity .15s ease;color:#f4d38f}
      #${ROOT_ID} .gd-mini{padding:4px 6px;font-size:11px;display:inline-flex;align-items:center;justify-content:center}
      @media (max-width: 980px){
        #${ROOT_ID} .gd-main{grid-template-columns:1fr;grid-template-rows:auto auto auto;overflow:auto}
        #${ROOT_ID} .gd-table{min-height:auto}
        #${ROOT_ID} .gd-hand{max-height:18vh}
      }
      @media (max-width: 768px){
        #${ROOT_ID} .gd-card{width:11vw;min-width:54px;max-width:64px}
        #${ROOT_ID} .gd-top{flex-direction:column;align-items:flex-start}
        #${ROOT_ID} .gd-badges{justify-content:flex-start}
        #${ROOT_ID} .gd-seats{grid-template-columns:1fr}
        #${ROOT_ID} .gd-hand{max-height:18vh;padding-top:6px}
      }
      @media (max-width: 480px){
        #${ROOT_ID} .gd-card{min-width:48px}
        #${ROOT_ID} .gd-card .center{font-size:16px}
        #${ROOT_ID} .gd-foot{flex-direction:column;align-items:flex-start}
      }
    `;
    document.head.appendChild(s);
    state.styleNode = s;
  }

  function makeDeck() {
    const deck = [];
    for (let d = 0; d < 2; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({
            id: uid(),
            kind: 'normal',
            rank,
            suit: suit.key,
            suitSymbol: suit.symbol,
            color: suit.color,
            value: RANK_VALUE[rank],
          });
        }
      }
      deck.push({ id: uid(), kind: 'joker', label: '小王', rank: '小王', suit: 'J', suitSymbol: '🃏', color: 'red', value: 16 });
      deck.push({ id: uid(), kind: 'joker', label: '大王', rank: '大王', suit: 'J', suitSymbol: '🃏', color: 'black', value: 17 });
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.cardsById = new Map(deck.map((c) => [c.id, c]));
    return deck;
  }

  function initPlayers(deck) {
    state.players = SEATS.map((seat) => ({
      seat: seat.id,
      name: seat.name,
      short: seat.short,
      team: seat.team,
      hand: [],
      finished: false,
    }));
    deck.forEach((card, idx) => {
      state.players[idx % 4].hand.push(card);
    });
    state.players.forEach((p) => p.hand.sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit)));
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
    const values = cards.map((c) => c.value);
    const grouped = groupsByValue(cards);
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    const allSame = counts.length === 1;

    if (n === 1) return { type: 'single', weight: values[0], size: 1, rank: values[0] };
    if (n === 2 && allSame) return { type: 'pair', weight: values[0], size: 2, rank: values[0] };
    if (n === 3 && allSame) return { type: 'triple', weight: values[0], size: 3, rank: values[0] };
    if (n >= 4 && allSame) return { type: 'bomb', weight: values[0] * 100 + n, size: n, rank: values[0] };

    if (n === 5 && rankSeq(values) && sameSuit(cards)) return { type: 'straight_flush', weight: values[0], size: 5, rank: values[0] };
    if (n === 4 && cards.every((c) => c.kind === 'joker')) return { type: 'rocket', weight: 9999, size: 4, rank: 9999 };

    if (n >= 5 && rankSeq(values) && values.every((v) => v < 16)) return { type: 'straight', weight: values[0], size: n, rank: values[0] };
    if (n >= 6 && n % 2 === 0 && [...grouped.values()].every((x) => x.length === 2)) {
      const pairVals = [...grouped.keys()].sort((a, b) => a - b);
      if (rankSeq(pairVals) && pairVals.every((v) => v < 16)) return { type: 'pair_seq', weight: pairVals[0], size: n, rank: pairVals[0] };
    }
    if (n >= 6 && n % 3 === 0 && [...grouped.values()].every((x) => x.length === 3)) {
      const tripleVals = [...grouped.keys()].sort((a, b) => a - b);
      if (rankSeq(tripleVals) && tripleVals.every((v) => v < 16)) return { type: 'triple_seq', weight: tripleVals[0], size: n, rank: tripleVals[0] };
    }
    if (n === 5) {
      const triple = [...grouped.entries()].find(([, x]) => x.length === 3);
      const pair = [...grouped.entries()].find(([, x]) => x.length === 2);
      if (triple && pair) return { type: 'full_house', weight: Number(triple[0]), size: 5, rank: Number(triple[0]) };
    }
    return null;
  }

  function moveStrength(move) {
    if (!move) return -1;
    const hierarchy = {
      single: 1,
      pair: 2,
      triple: 3,
      full_house: 4,
      straight: 5,
      pair_seq: 6,
      triple_seq: 7,
      bomb: 8,
      straight_flush: 9,
      rocket: 10,
    };
    return (hierarchy[move.type] || 0) * 100000 + (move.rank || 0) * 100 + (move.size || 0);
  }

  function beats(next, prev) {
    if (!next) return false;
    if (!prev) return true;
    if (next.type === 'rocket') return true;
    if (prev.type === 'rocket') return false;
    if (next.type === 'straight_flush' && prev.type !== 'straight_flush' && prev.type !== 'rocket') {
      if (prev.type === 'bomb') return next.size > 5; // 5张同花顺强于5炸但弱于6炸
      return true;
    }
    if (next.type === 'bomb' && prev.type !== 'bomb' && prev.type !== 'rocket' && prev.type !== 'straight_flush') return true;
    if (next.type !== prev.type) return false;
    if (next.size !== prev.size) return false;
    return next.weight > prev.weight;
  }

  function formatCard(card) {
    const cls = card.color === 'red' ? 'red' : 'black';
    return `
      <button class="gd-card ${cls}" type="button" data-card-id="${card.id}" aria-label="${rankLabel(card)}${card.suitSymbol}">
        <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.suitSymbol}</span></span>
        <span class="center">${rankLabel(card)}</span>
        <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.suitSymbol}</span></span>
      </button>`;
  }

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-shell">
        <div class="gd-top">
          <div>
            <strong>掼蛋娱乐模式</strong>
            <small>window.GD 独立沙箱 · 1 对 3 本地 AI</small>
          </div>
          <div class="gd-badges">
            <span class="gd-pill">主级：<b data-gd-rank>${state.currentRank}</b></span>
            <span class="gd-pill">当前：<b data-gd-turn>南家</b></span>
            <span class="gd-pill">牌型：<b data-gd-move>—</b></span>
          </div>
        </div>

        <div class="gd-main">
          <section class="gd-panel">
            <div class="gd-panel-h"><b>四方座位</b><span class="gd-pill">A组 / B组</span></div>
            <div class="gd-panel-b">
              <div class="gd-seats" data-gd-seats></div>
            </div>
          </section>

          <section class="gd-table">
            <div class="gd-board">
              <div class="gd-panel" style="background:rgba(0,0,0,.12)">
                <div class="gd-panel-h"><b>公共牌桌</b><span class="gd-pill">108 张 / 双副牌</span></div>
                <div class="gd-panel-b"><div class="gd-trick" data-gd-trick></div></div>
              </div>
              <div class="gd-panel">
                <div class="gd-panel-h"><b>玩家手牌（南家）</b><span class="gd-pill">点击选择</span></div>
                <div class="gd-panel-b"><div class="gd-hand" data-gd-hand></div></div>
              </div>
            </div>
            <div class="gd-controls">
              <button class="primary" data-gd-play>出牌</button>
              <button class="ghost" data-gd-pass>过牌</button>
              <button class="ghost" data-gd-sort>整理</button>
              <button class="danger" data-gd-exit>返回主页</button>
            </div>
          </section>

          <section class="gd-panel">
            <div class="gd-panel-h"><b>日志 / 计分</b><span class="gd-pill">闭环对局</span></div>
            <div class="gd-panel-b">
              <div class="gd-log" data-gd-log></div>
              <div class="gd-pill" style="display:block;margin-top:10px;text-align:center">剩余牌：<b data-gd-score></b></div>
            </div>
          </section>
        </div>

        <div class="gd-foot">
          <span>纯 CSS + Web Audio API · 移动端自适应 · 零污染沙箱</span>
          <span class="gd-toast" data-gd-toast></span>
        </div>
      </div>`;
    return root;
  }

  function renderSeats() {
    const seats = state.root?.querySelector('[data-gd-seats]');
    if (!seats) return;
    seats.innerHTML = state.players.map((p) => {
      const preview = sortCards(p.hand).slice(0, 8).map((c) => `<span class="gd-mini ${c.color}">${rankLabel(c)}${c.suitSymbol}</span>`).join('');
      return `
        <div class="gd-seat ${p.seat === state.currentTurn ? 'active' : ''}">
          <b>${p.name} · ${teamLabel(p.team)}</b>
          <div class="meta">${p.hand.length} 张${p.hand.length <= 10 ? '｜报子' : ''}${p.hand.length <= 5 ? '｜危险' : ''}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${preview}</div>
        </div>`;
    }).join('');
  }

  function renderTable() {
    const root = state.root;
    if (!root) return;

    const trick = root.querySelector('[data-gd-trick]');
    const hand = root.querySelector('[data-gd-hand]');
    const log = root.querySelector('[data-gd-log]');
    const turn = root.querySelector('[data-gd-turn]');
    const rank = root.querySelector('[data-gd-rank]');
    const move = root.querySelector('[data-gd-move]');
    const score = root.querySelector('[data-gd-score]');
    const playBtn = root.querySelector('[data-gd-play]');
    const passBtn = root.querySelector('[data-gd-pass]');
    const toast = root.querySelector('[data-gd-toast]');

    renderSeats();

    if (state.trick) {
      trick.innerHTML = state.trick.cards.map((c) => `<span class="gd-mini ${c.color}">${rankLabel(c)}${c.suitSymbol}</span>`).join('');
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌</span>`;
    }

    const me = state.players[0];
    hand.innerHTML = sortCards(me.hand).map((c) => formatCard(c)).join('');
    turn.textContent = state.players[state.currentTurn]?.name || '—';
    rank.textContent = String(state.currentRank);
    move.textContent = state.trick ? `${state.trick.type} · ${state.trick.cards.length}` : '—';
    score.textContent = state.players.map((p) => p.hand.length).join(' / ');
    log.innerHTML = state.logs.map((m) => `<p>${m}</p>`).join('');
    playBtn.disabled = state.currentTurn !== 0;
    passBtn.disabled = state.currentTurn !== 0 || !state.trick;
    if (toast) toast.textContent = state._toastText || '';

    hand.querySelectorAll('[data-card-id]').forEach((btn) => {
      const id = btn.getAttribute('data-card-id');
      if (state.selected.has(id)) btn.classList.add('sel');
    });
  }

  function toast(msg) {
    const node = state.root?.querySelector('[data-gd-toast]');
    if (!node) return;
    state._toastText = msg;
    node.style.opacity = '1';
    clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(() => {
      node.style.opacity = '0';
      state._toastText = '';
    }, 1200);
  }

  function log(msg) {
    state.logs.unshift(msg);
    state.logs = state.logs.slice(0, 10);
  }

  function initDeckAndPlayers() {
    const deck = makeDeck();
    initPlayers(deck);
    state.selected = new Set();
    state.currentTurn = 0;
    state.trick = null;
    state.logs = ['掼蛋已启动'];
    state.active = true;
    state.busy = false;
    state.aiDelay = 0;
  }

  function removeSelectedFromHand(hand, ids) {
    const set = new Set(ids);
    return hand.filter((c) => !set.has(c.id));
  }

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move) return false;
    if (state.trick && !beats(move, state.trick)) return false;

    const player = state.players[seat];
    player.hand = removeSelectedFromHand(player.hand, cards.map((c) => c.id));
    player.finished = player.hand.length === 0;
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 180;

    playGDSound(move.type === 'bomb' || move.type === 'rocket' ? 'bomb' : 'play');
    log(`${player.name} 出牌：${move.type}`);
    if (player.finished) log(`${player.name} 已出完牌`);
    renderTable();
    return true;
  }

  function passTurn(seat) {
    if (!state.trick) return false;
    log(`${state.players[seat].name} 过牌`);
    if (state.trick && state.trick.seat === seat) state.trick = null;
    state.currentTurn = (seat + 1) % 4;
    playGDSound('pass');
    renderTable();
    return true;
  }

  function bestOpening(hand) {
    const sorted = sortCards(hand);
    const byValue = groupsByValue(sorted);
    const pair = [...byValue.values()].find((g) => g.length >= 2);
    const triple = [...byValue.values()].find((g) => g.length >= 3);
    const bomb = [...byValue.values()].find((g) => g.length >= 4);
    if (pair && pair.length === 2) return pair;
    if (triple && triple.length === 3) return triple;
    if (bomb && bomb.length >= 4) return bomb.slice(0, 4);
    return [sorted[0]];
  }

  function chooseFollowMove(hand, last) {
    const sorted = sortCards(hand);
    const byValue = [...groupsByValue(sorted).entries()].sort((a, b) => a[0] - b[0]);
    const teamWin = state.trick && sameTeam(state.currentTurn, state.trick.seat);
    const danger = state.players.some((p, i) => i !== state.currentTurn && p.hand.length <= 5);

    if (!last) return bestOpening(sorted);
    if (teamWin && hand.length > 8) return null; // 同伙领出时优先放行

    if (last.type === 'single' || last.type === 'pair' || last.type === 'triple') {
      for (const [value, group] of byValue) {
        if (value > last.weight && group.length >= last.size) return group.slice(0, last.size);
      }
    }

    if (last.type !== 'bomb' && last.type !== 'rocket' && (danger || hand.length <= 8)) {
      const bomb = byValue.find(([, group]) => group.length >= 4);
      if (bomb) return bomb[1].slice(0, Math.min(bomb[1].length, 8));
    }

    if (last.type === 'bomb') {
      for (const [value, group] of byValue) {
        if (group.length >= last.size && group.length >= 4 && (group.length > last.size || value > last.weight)) {
          return group.slice(0, last.size);
        }
      }
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
      if (!player || player.finished) {
        state.currentTurn = (seat + 1) % 4;
        renderTable();
        return;
      }

      const lead = !state.trick;
      const sameSide = state.trick && sameTeam(seat, state.trick.seat);
      const danger = state.players.some((p, i) => i !== seat && p.hand.length <= 5);
      let choice = null;

      if (lead) {
        choice = bestOpening(player.hand);
      } else if (sameSide && player.hand.length > 6) {
        choice = null;
      } else {
        choice = chooseFollowMove(player.hand, state.trick);
      }

      if (choice && choice.length) {
        playCards(seat, choice);
      } else {
        passTurn(seat);
      }

      if (danger && state.currentTurn !== 0) state.aiDelay = performance.now() + 120;
    } finally {
      state.busy = false;
    }
  }

  function humanPlay() {
    if (state.currentTurn !== 0) return;
    const cards = [...state.selected].map((id) => state.cardsById.get(id)).filter(Boolean);
    const move = typeOf(cards);
    if (!move) return toast('牌型不合法');
    if (state.trick && !beats(move, state.trick)) return toast('压不过当前牌');
    if (!cards.length) return toast('请先选择牌');
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
      const btn = e.target.closest('[data-card-id]');
      if (!btn || state.currentTurn !== 0) return;
      const id = btn.getAttribute('data-card-id');
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      playGDSound('click');
      renderTable();
    });
  }

  function applyShellExit() {
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';
  }

  function destroy() {
    clearInterval(state.timer);
    state.timer = null;
    state.active = false;
    state.busy = false;
    state.selected.clear();
    state.trick = null;
    state.players = [];
    state.logs = [];
    offAll();
    if (state.root?.parentNode) state.root.remove();
    if (state.styleNode?.parentNode) state.styleNode.remove();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'flex';
    state.root = null;
    state.styleNode = null;
    GD.state = state;
  }

  function init() {
    if (state.active) return;
    injectResponsiveStyles();
    applyShellExit();

    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    state.root = createShell();
    document.body.appendChild(state.root);

    bindHandInteraction();

    const playBtn = state.root.querySelector('[data-gd-play]');
    const passBtn = state.root.querySelector('[data-gd-pass]');
    const sortBtn = state.root.querySelector('[data-gd-sort]');
    const exitBtn = state.root.querySelector('[data-gd-exit]');

    on(playBtn, 'click', () => { playGDSound('click'); humanPlay(); });
    on(passBtn, 'click', () => { playGDSound('click'); humanPass(); });
    on(sortBtn, 'click', () => { playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); });
    on(exitBtn, 'click', () => { playGDSound('click'); destroy(); });

    initDeckAndPlayers();
    renderTable();
    state.timer = setInterval(triggerAIMove, 260);
    state.active = true;
    GD.state = state;
  }

  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn || btn.dataset.gdBound) return;
    btn.dataset.gdBound = '1';
    on(btn, 'click', init, { passive: true });
  }

  GD.init = init;
  GD.destroy = destroy;
  GD.playGDSound = playGDSound;
  GD.injectResponsiveStyles = injectResponsiveStyles;
  GD.renderLayout = init;
  GD.triggerAIMove = triggerAIMove;

  document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  if (document.readyState !== 'loading') bindLaunchButton();

  // 3. 在最底部的初始化入口里，确保第一步执行它
  window.GD = {
    init: () => {
      injectStyles(); // 🟢 唤醒样式注入
      console.log('[Guandan] 动态自适应样式挂载完毕。');
      // 后续的初始化对局逻辑...
    }
  };
})();
