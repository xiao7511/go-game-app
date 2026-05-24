/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (全真牌桌沉浸式 UI 优化版)
 */
(() => {
  'use strict';

  // 🌟 核心防线：防重复加载
  //if (window.GD && window.GD.__loaded) {
   // console.log('[Guandan-AntiLoad] 检测到脚本重复加载，已自动拦截并跳过。');
  //  return;
 // }

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
    // Pass sound
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t); o.stop(t + 0.11);
  }

  // --- 规则逻辑：牌型判定 ---
  function getMoveType(cards) {
    const n = cards.length;
    const values = cards.map(c => c.value).sort((a, b) => a - b);
    const grouped = new Map();
    cards.forEach(c => grouped.set(c.value, (grouped.get(c.value) || 0) + 1));
    const counts = [...grouped.values()].sort((a, b) => a - b);
    
    // 炸弹：四张同值、五张同花顺、六张及以上同值、四王
    const isFourKings = n === 4 && cards.every(c => c.kind === 'joker');
    const isSameVal = counts.length === 1;
    if (isFourKings) return { type: 'bomb', weight: 999, size: 4 };
    if (isSameVal && n >= 4) return { type: 'bomb', weight: values[0] + n * 10, size: n };
    
    // 其他牌型
    if (n === 1) return { type: 'single', weight: values[0], size: 1 };
    if (n === 2 && isSameVal) return { type: 'pair', weight: values[0], size: 2 };
    if (n === 3 && isSameVal) return { type: 'triple', weight: values[0], size: 3 };
    if (n === 5 && counts.includes(3) && counts.includes(2)) return { type: 'full_house', weight: values[2], size: 5 };
    
    return null;
  }

  // 🌟 全新 UI 样式注入：真实的 2D 牌桌布局
  function injectResponsiveStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} {
        position: fixed; inset: 0; z-index: 9999;
        background: radial-gradient(circle at center, #1e5e36 0%, #0d321a 100%); /* 经典绿呢绒牌桌 */
        color: #f5f7f4; font-family: system-ui, -apple-system, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
      }
      #${ROOT_ID} * { box-sizing: border-box; }
      
      /* 顶部信息栏 */
      .gd-header {
        position: absolute; top: 0; left: 0; right: 0;
        display: flex; justify-content: space-between; align-items: center;
        padding: 15px 25px; pointer-events: none; z-index: 10;
      }
      .gd-header-info {
        background: rgba(0,0,0,0.4); padding: 8px 16px; border-radius: 20px;
        border: 1px solid rgba(255,215,0,0.3); pointer-events: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); backdrop-filter: blur(4px);
      }
      .gd-header-info span { color: #FFD700; font-weight: bold; margin: 0 5px; }
      
      .gd-exit-btn {
        pointer-events: auto; background: #ef4444; color: white;
        border: none; padding: 8px 16px; border-radius: 12px; font-weight: bold;
        cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
      }
      .gd-exit-btn:hover { background: #dc2626; transform: translateY(-2px); }

      /* 游戏竞技场 (牌桌) */
      .gd-arena {
        position: relative; flex: 1; display: flex; justify-content: center; align-items: center;
        width: 100%; height: 100%; overflow: hidden;
      }

      /* 座位信息 (东南西北) */
      .gd-seat {
        position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px;
        transition: all 0.3s ease;
      }
      .gd-seat.top { top: 20px; left: 50%; transform: translateX(-50%); }
      .gd-seat.bottom { bottom: 20px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 900px; }
      .gd-seat.left { left: 20px; top: 50%; transform: translateY(-50%); }
      .gd-seat.right { right: 20px; top: 50%; transform: translateY(-50%); }

      .gd-player-info {
        background: rgba(0,0,0,0.5); padding: 8px 16px; border-radius: 12px;
        text-align: center; border: 2px solid transparent; min-width: 120px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .gd-player-info.active {
        border-color: #FFD700; background: rgba(0,0,0,0.7);
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
      }
      .gd-player-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
      .gd-player-detail { font-size: 12px; opacity: 0.8; display: flex; align-items: center; justify-content: center; gap: 5px; }
      .gd-card-icon { color: #FFD700; font-size: 14px; }

      /* 玩家操作栏（核心需求：在上端跳出） */
      .gd-action-bar {
        display: flex; gap: 15px; margin-bottom: 20px; justify-content: center;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        transform: translateY(30px); opacity: 0; pointer-events: none;
      }
      .gd-action-bar.show {
        transform: translateY(0); opacity: 1; pointer-events: auto;
      }
      .gd-action-bar button {
        border: none; padding: 12px 24px; border-radius: 20px; font-weight: 900;
        font-size: 16px; cursor: pointer; transition: all 0.2s;
        box-shadow: 0 6px 16px rgba(0,0,0,0.4);
      }
      .gd-action-bar button:active { transform: scale(0.95); }
      .gd-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      .gd-btn-play { background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; }
      .gd-btn-play:hover:not(:disabled) { box-shadow: 0 8px 25px rgba(255, 215, 0, 0.6); }
      .gd-btn-pass, .gd-btn-sort { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(5px); }
      .gd-btn-pass:hover:not(:disabled), .gd-btn-sort:hover:not(:disabled) { background: rgba(255,255,255,0.25); }

      /* 玩家手牌区域 */
      .gd-hand {
        display: flex; align-items: flex-end; justify-content: center;
        height: 140px; width: 100%;
      }

      /* 中心公共牌桌 */
      .gd-center-table {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 400px; height: 200px; display: flex; justify-content: center; align-items: center;
        border-radius: 100px; border: 2px dashed rgba(255,255,255,0.15);
        background: rgba(0,0,0,0.1); pointer-events: none;
      }
      .gd-trick { display: flex; justify-content: center; align-items: center; }
      .gd-trick-empty { opacity: 0.5; font-size: 18px; letter-spacing: 2px; }

      /* 真实物理扑克牌样式 */
      .gd-card {
        width: ${CARD_W}px; aspect-ratio: 1 / 1.42; position: relative;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; user-select: none;
        background: linear-gradient(135deg, #ffffff 0%, #f4f4f4 100%);
        border-radius: 8px; border: 1px solid #d0d0d0;
        box-shadow: -2px 2px 5px rgba(0,0,0,0.2), inset 0 0 3px rgba(255,255,255,1);
        margin-left: -48px; /* 卡牌重叠 */
        transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.15s ease;
        font-family: "Times New Roman", "Georgia", serif; pointer-events: auto;
      }
      .gd-hand .gd-card:first-child { margin-left: 0; }
      .gd-trick .gd-card { margin-left: -55px; box-shadow: -3px 4px 10px rgba(0,0,0,0.3); } /* 桌面的牌靠得更紧 */
      .gd-trick .gd-card:first-child { margin-left: 0; }

      /* 选中/悬停态 */
      .gd-hand .gd-card:hover, .gd-hand .gd-card.sel {
        transform: translateY(-24px) rotate(1deg); border-color: #FFD700;
        box-shadow: -4px 12px 24px rgba(0,0,0,0.4), inset 0 0 2px #FFD700;
      }

      /* 牌面元素 */
      .gd-card.red { color: #cc0000; }
      .gd-card.black { color: #111111; }
      .gd-card .corner { position: absolute; display: flex; flex-direction: column; align-items: center; line-height: 0.9; }
      .gd-card .corner .r { font-size: 22px; font-weight: bold; }
      .gd-card .corner .s { font-size: 14px; margin-top: 2px; }
      .gd-card .tl { top: 5px; left: 6px; }
      .gd-card .br { right: 6px; bottom: 5px; transform: rotate(180deg); }
      .gd-card .center { font-size: 32px; opacity: 0.85; transform: translateY(-2px); }

      /* 吐司提示 */
      .gd-toast {
        position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8); color: #fff; padding: 12px 24px; border-radius: 30px;
        font-size: 16px; opacity: 0; transition: opacity 0.2s ease; pointer-events: none; z-index: 100;
      }

      /* 移动端适配 */
      @media (max-width: 768px) {
        .gd-card { width: 60px; margin-left: -35px; }
        .gd-trick .gd-card { margin-left: -40px; }
        .gd-center-table { width: 300px; height: 160px; }
        .gd-action-bar button { padding: 10px 18px; font-size: 14px; }
        .gd-seat.left { left: 10px; } .gd-seat.right { right: 10px; }
      }
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

  function initPlayers(deck) {
    state.players = SEATS.map((seat) => ({ ...seat, hand: [], finished: false }));
    deck.forEach((card, idx) => state.players[idx % 4].hand.push(card));
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
/*
  function beats(next, prev) {
    if (!next) return false;
    if (!prev) return true;
    if (next.type === 'rocket') return true;
    if (prev.type === 'rocket') return false;
    if (next.type === 'straight_flush' && prev.type !== 'straight_flush' && prev.type !== 'rocket') {
      if (prev.type === 'bomb') return next.size > 5;
      return true;
    }
    if (next.type === 'bomb' && prev.type !== 'bomb' && prev.type !== 'rocket' && prev.type !== 'straight_flush') return true;
    if (next.type !== prev.type) return false;
    if (next.size !== prev.size) return false;
    return next.weight > prev.weight;
  }*/
 // --- 规则逻辑：大小比较 ---
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

  function createShell() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <!-- 顶部信息 -->
      <div class="gd-header">
        <div class="gd-header-info">
          主级: <span data-gd-rank>${state.currentRank}</span> | 
          牌型: <span data-gd-move>—</span>
        </div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>

      <!-- 中心竞技场 -->
      <div class="gd-arena">
        
        <!-- 北家 -->
        <div class="gd-seat top" data-gd-seat="2"></div>
        <!-- 西家 -->
        <div class="gd-seat left" data-gd-seat="3"></div>
        <!-- 东家 -->
        <div class="gd-seat right" data-gd-seat="1"></div>

        <!-- 中心公共出牌区 -->
        <div class="gd-center-table">
          <div class="gd-trick" data-gd-trick></div>
        </div>

        <!-- 南家 (玩家自己) -->
        <div class="gd-seat bottom" data-gd-seat="0">
          <!-- 核心需求：悬浮在牌面上方的操作栏，默认隐藏，轮到时跳出 -->
          <div class="gd-action-bar" data-gd-action-bar>
            <button class="gd-btn-play" data-gd-play>出牌 (Play)</button>
            <button class="gd-btn-pass" data-gd-pass>过牌 (Pass)</button>
            <button class="gd-btn-sort" data-gd-sort>整理 (Sort)</button>
          </div>
          <!-- 玩家手牌 -->
          <div class="gd-hand" data-gd-hand></div>
        </div>

      </div>
      <div class="gd-toast" data-gd-toast></div>
    `;
    return root;
  }
/*
  function renderSeats() {
    // 渲染三个 AI 对手的座位信息
    [1, 2, 3].forEach(seatIdx => {
      const p = state.players[seatIdx];
      const seatNode = state.root?.querySelector(`[data-gd-seat="${seatIdx}"]`);
      if (!seatNode) return;
      
      const isActive = state.currentTurn === seatIdx;
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">
            <span class="gd-card-icon">🂠</span> 剩余 ${p.hand.length} 张
          </div>
        </div>
      `;
    });
  }*/
function renderSeats() {
    // 强制遍历所有座位 ID (0-3)，保证 DOM 永远有内容
    SEATS.forEach((seat, idx) => {
      const seatNode = state.root?.querySelector(`[data-gd-seat="${idx}"]`);
      if (!seatNode) return;

      const p = state.players[idx];
      
      // 1. 如果没有玩家数据，显示占位符，防止信息消失
      if (!p) {
        seatNode.innerHTML = `<div class="gd-player-info">等待加入...</div>`;
        return;
      }

      // 2. 正常渲染逻辑
      const isActive = state.currentTurn === idx;
      const cardCount = p.hand ? p.hand.length : 0;
      
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">
            <span class="gd-card-icon">🂠</span> 剩余 ${cardCount} 张
          </div>
        </div>
      `;
    });
}
/*
  function renderTable() {
    const root = state.root;
    if (!root) return;

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
  }*/
  function renderTable() {
    // 🌟 防御性升级：直接从当前文档树内抓取活跃的真实游戏根容器，避开闭包指针错位
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    // 绝对防御：如果核心 UI 容器在 DOM 解析中未就绪，直接安全返回，不给 null 任何报错机会
    if (!hand || !trick) return; 

    // 更新公共桌牌 (Trick)
    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      if (move) move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">等待出牌...</span>`;
      if (move) move.textContent = '—';
    }

    // 更新玩家南家手牌
    const me = state.players[0];
    if (me && me.hand) {
      hand.innerHTML = sortCards(me.hand).map(formatCard).join('');
      
      // 更新选中态样式
      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
      });
    }

    // 智能操作栏显隐控制
    if (actionBar) {
      if (state.currentTurn === 0 && me && me.hand.length > 0) {
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
    state._toastText = msg;
    renderTable(); // 借用 render 顺便更新 toast
  }

 function initDeckAndPlayers() {
    const deck = makeDeck();
    initPlayers(deck); // 在此安全生成 4 个玩家的数据与手牌
    console.log('[Guandan] 玩家数据初始化完毕:', state.players); 
    
    state.selected.clear();
    state.currentTurn = 0;
    state.trick = null;
    state.active = true;
    state.busy = false;
    state.aiDelay = 0;
    // 🌟 移除原本这里的 showToast()，避免在 DOM 绑定尚未彻底完成时意外触发不成熟的 renderTable()
  }
/*
  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    const ids = new Set(cards.map(c => c.id));
    player.hand = player.hand.filter(c => !ids.has(c.id));
    player.finished = player.hand.length === 0;
    
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 500; // AI 思考延迟，让出牌有节奏感

    playGDSound(move.type === 'bomb' || move.type === 'rocket' ? 'bomb' : 'play');
    // --- 在此处调用 ---
    // 只有在出牌后才检查游戏是否结束
    if (player.finished) {
       if (checkGameOver()) return; // 如果游戏结束，提前返回，不再触发后续渲染
    }

    renderTable();
    return true;
  }*/
 // 2. 重写出牌逻辑
  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    
    // 增加恭喜提醒与终止判定
    if (player.hand.length === 0) {
      showToast(`恭喜 ${player.name} 出完牌！`);
    }
    
    if (checkGameOver()) return true;

    state.currentTurn = (seat + 1) % 4;
    state.aiDelay = performance.now() + 500;
    renderTable();
    return true;
  }

  /*
  function passTurn(seat) {
    if (!state.trick) return false;
    if (state.trick.seat === seat) state.trick = null;
    state.currentTurn = (seat + 1) % 4;
    playGDSound('pass');
    renderTable();
    return true;
  }*/

  // AI 基础逻辑保持不变
  function bestOpening(hand) {
    const sorted = sortCards(hand);
    const byValue = groupsByValue(sorted);
    const pair = [...byValue.values()].find(g => g.length >= 2);
    const triple = [...byValue.values()].find(g => g.length >= 3);
    const bomb = [...byValue.values()].find(g => g.length >= 4);
    if (pair && pair.length === 2) return pair;
    if (triple && triple.length === 3) return triple;
    if (bomb && bomb.length >= 4) return bomb.slice(0, 4);
    return [sorted[0]];
  }

  function chooseFollowMove(hand, last) {
    const sorted = sortCards(hand);
    const byValue = [...groupsByValue(sorted).entries()].sort((a, b) => a[0] - b[0]);
    if (!last) return bestOpening(sorted);
    if (state.trick && sameTeam(state.currentTurn, state.trick.seat) && hand.length > 8) return null;

    if (last.type === 'single' || last.type === 'pair' || last.type === 'triple') {
      for (const [v, g] of byValue) { if (v > last.weight && g.length >= last.size) return g.slice(0, last.size); }
    }
    if (last.type !== 'bomb' && last.type !== 'rocket') {
      const bomb = byValue.find(([, g]) => g.length >= 4);
      if (bomb) return bomb[1].slice(0, Math.min(bomb[1].length, 8));
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
      if (!player || player.finished) { state.currentTurn = (seat + 1) % 4; renderTable(); return; }

      const choice = state.trick ? chooseFollowMove(player.hand, state.trick) : bestOpening(player.hand);
      if (choice && choice.length) playCards(seat, choice);
      else passTurn(seat);
    } finally {
      state.busy = false;
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

  // --- 针对问题 4 & 5：增加胜负判定与恭喜逻辑 ---
  /*function checkGameOver() {
    const team0 = [state.players[0], state.players[2]];
    const team1 = [state.players[1], state.players[3]];
    
    const team0Done = team0.every(p => p.finished);
    const team1Done = team1.every(p => p.finished);

    if (team0Done || team1Done) {
      state.active = false;
      const msg = team0Done ? "🎉 恭喜！你们赢得了比赛！" : "💔 很遗憾，对手获胜了。";
      showToast(msg);
      setTimeout(() => {
        if(confirm(`${msg} 是否再来一局？`)) {
          initDeckAndPlayers();
          renderTable();
        } else {
          destroy();
        }
      }, 1000);
      return true;
    }
    return false;
  }*/

  // --- 胜负判定 ---
  function checkGameOver() {
    const team0Done = [state.players[0], state.players[2]].every(p => p.hand.length === 0);
    const team1Done = [state.players[1], state.players[3]].every(p => p.hand.length === 0);
    if (team0Done || team1Done) {
      alert(team0Done ? "🎉 你们获胜了！" : "💔 对手获胜了。");
      return true;
    }
    return false;
  }

  // --- 针对问题 2 & 3：修复无人要牌与轮转逻辑 ---
  function passTurn(seat) {
    // 核心修复：如果是你或者你的对家打出的牌被所有人过，trick 归零，轮到下家出牌
    const nextTurn = (seat + 1) % 4;
    
    // 检查是否无人要
    if (state.trick && state.trick.seat === ((seat + 2) % 4)) {
      state.trick = null; // 无人要，开启新一轮
    }
    
    state.currentTurn = nextTurn;
    playGDSound('pass');
    renderTable();
  }

  function bindHandInteraction() {
    // 直接从实时文档树中抓取最新的手牌区 DOM 绑定事件
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

  /*function init() {
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
    on(state.root.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(state.root.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    initDeckAndPlayers();
    renderTable();
    
    state.timer = setInterval(triggerAIMove, 300);
    state.active = true;
    console.log('[Guandan] 全真牌桌沙箱初始化完毕。');
  }*/
 // --- 核心修复：更鲁棒的初始化绑定 ---

  function init() {
    console.log('[Guandan] 开始安全初始化流程...');
    
    // 1. 彻底清除页面上可能残留的同名旧 DOM 容器
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) {
      oldContainer.remove();
    }
    
    // 清除可能正在运行的旧定时器
    if (state.timer) {
      clearInterval(state.timer);
    }

    injectResponsiveStyles();
    
    // 隐藏大厅
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    // 2. 🌟 必须先创建并挂载全新的独立壳体到 body，让页面中绝对存在该 DOM 元素！
    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; // 确保全局引用指向最新挂载的 DOM

    // 3. 实时重新初始化数据（此时内部 showToast 触发渲染时，DOM 已经 100% 存在了）
    initDeckAndPlayers();
    
    // 4. 手牌事件绑定
    bindHandInteraction();
    
    // 5. 精准关联核心操作按钮事件
    on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
    on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    // 6. 激发首次全面强行渲染
    renderTable();
    
    // 开启 AI 轮询
    state.timer = setInterval(triggerAIMove, 300);
    state.active = true;
    console.log('[Guandan] 全真桌牌沙箱初始化成功，手牌已强制分发渲染。');
  }

// ==========================================
  // 🌟 统一且唯一的启动按钮绑定逻辑（替换原有所有底层绑定）
  // ==========================================
  
  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    
    // 使用 onclick 覆盖确保全局唯一性，防止多重 addEventListener 堆叠
    btn.onclick = (e) => {
      e.preventDefault(); // 阻止可能存在的默认表单或锚点行为
      if (typeof GD.init === 'function') {
        GD.init(); 
      } else {
        init();
      }
    };
  }

  // 将核心生命周期安全暴露给沙箱
  Object.assign(GD, { init, destroy, playGDSound, injectResponsiveStyles, triggerAIMove });

  // 确保在任何页面加载状态下都能准确安全地绑定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();