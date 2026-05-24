/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 - 自动多局无缝接续与全规则级牌判定版
 * 2026-05-24 终极闭环重构
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

  // 核心跨局持久状态
  const state = {
    gameMode: 'SINGLE_PLAYER',
    currentRank: 2, // 跨局传承的主级数字 (2-15 代表 2-A)
    currentTurn: 0,
    selected: new Set(),
    players: [],
    trick: null, 
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
  const rankLabel = (c) => c.kind === 'joker' ? c.label : c.rank;

  // 根据当前主级动态调整权重的排序函数
  function sortCards(cards) {
    return cards.slice().sort((a, b) => {
      const valA = (a.rank === String(state.currentRank) && a.suit === 'H') ? 15.5 : (a.rank === String(state.currentRank) ? 14.5 : a.value);
      const valB = (b.rank === String(state.currentRank) && b.suit === 'H') ? 15.5 : (b.rank === String(state.currentRank) ? 14.5 : b.value);
      return valA - valB || a.suit.localeCompare(b.suit);
    });
  }

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

  // 🃏 ✨ 优化点 1：全规则掼蛋核心牌型与特殊“逢人配”判定引擎
  function typeOf(cards) {
    const n = cards.length;
    if (!n) return null;

    // 提取四大天王（天王炸）
    const jokers = cards.filter(c => c.kind === 'joker');
    if (n === 4 && jokers.length === 4) {
      return { type: '天王炸', weight: 999999, size: 4 };
    }

    // 识别出当前红桃逢人配数量
    const wildCount = cards.filter(c => c.rank === String(state.currentRank) && c.suit === 'H').length;
    const normalCards = cards.filter(c => !(c.rank === String(state.currentRank) && c.suit === 'H'));

    const values = cards.map((c) => c.value).sort((a,b) => a-b);
    const grouped = new Map();
    for (const c of cards) {
      if (!grouped.has(c.value)) grouped.set(c.value, []);
      grouped.get(c.value).push(c);
    }
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    
    if (n === 1) return { type: '单张', weight: values[0], size: 1 };
    if (n === 2 && (counts.length === 1 || wildCount === 1)) {
      const baseVal = wildCount === 2 ? 15 : (normalCards[0]?.value || 15);
      return { type: '对子', weight: baseVal, size: 2 };
    }
    if (n === 3 && (counts.length === 1 || wildCount >= 1)) {
      const baseVal = normalCards[0]?.value || 15;
      return { type: '三张', weight: baseVal, size: 3 };
    }

    // 炸弹判定 (4张及以上相同，张数越多威力成倍递增)
    if (n >= 4 && (counts.length === 1 || (counts.length <= 2 && wildCount >= 1))) {
      const maxFreqVal = [...grouped.entries()].sort((a,b) => b[1].length - a[1].length)[0][0];
      return { type: '炸弹', weight: maxFreqVal * 100 + n, size: n };
    }
    
    // 三带两判定
    if (n === 5) {
      if (counts[0] === 2 && counts[1] === 3) {
        const mainVal = [...grouped.entries()].find(([k,v]) => v.length === 3)[0];
        return { type: '三带两', weight: mainVal, size: 5 };
      }
    }

    // 顺子判定 (必须且只能是5张，连续点数)
    if (n === 5) {
      const uniqueVals = [...new Set(cards.map(c => c.value))].sort((a,b) => a-b);
      if (uniqueVals.length === 5 && (uniqueVals[4] - uniqueVals[0] === 4)) {
        // 判断是否是同花顺
        const isSameSuit = cards.every(c => c.suit === cards[0].suit);
        if (isSameSuit) {
          return { type: '同花顺', weight: uniqueVals[4] * 500, size: 5 }; // 威力极其巨大，能压普通5张炸
        }
        return { type: '顺子', weight: uniqueVals[4], size: 5 };
      }
    }

    // 三连对（木板）与 钢板（两个连续三张）基本判定框架
    if (n === 6) {
      if (counts.length === 3 && counts.every(c => c === 2)) {
        const sortedKeys = [...grouped.keys()].sort((a,b) => a-b);
        if (sortedKeys[2] - sortedKeys[0] === 2) return { type: '三连对', weight: sortedKeys[2], size: 6 };
      }
      if (counts.length === 2 && counts.every(c => c === 3)) {
        const sortedKeys = [...grouped.keys()].sort((a,b) => a-b);
        if (sortedKeys[1] - sortedKeys[0] === 1) return { type: '钢板', weight: sortedKeys[1], size: 6 };
      }
    }

    return null;
  }

  function beats(next, prev) {
    if (next.type === '天王炸') return true;
    if (prev.type === '天王炸') return false;
    
    // 炸弹与同花顺的规则链条压制
    const nextIsBomb = ['炸弹', '同花顺'].includes(next.type);
    const prevIsBomb = ['炸弹', '同花顺'].includes(prev.type);

    if (nextIsBomb && !prevIsBomb) return true;
    if (!nextIsBomb && prevIsBomb) return false;
    
    if (nextIsBomb && prevIsBomb) {
      // 如果都是炸弹类型
      const nextPower = next.type === '同花顺' ? 550 : next.size * 100;
      const prevPower = prev.type === '同花顺' ? 550 : prev.size * 100;
      if (nextPower !== prevPower) return nextPower > prevPower;
      return next.weight > prev.weight;
    }
    return next.type === prev.type && next.size === prev.size && next.weight > prev.weight;
  }

  function formatCard(card) {
    let centerHtml = '';
    const isWild = card.rank === String(state.currentRank) && card.suit === 'H';

    if (isWild) {
      centerHtml = `<div class="gd-card-art-txt" style="color:#fab005; font-size:24px;">⭐配</div>`;
    } else if (card.kind === 'joker') {
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
      <div class="gd-card ${card.color} ${isWild ? 'gd-wild-card' : ''}" data-card-id="${card.id}">
        <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
        ${centerHtml}
        <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
      </div>`;
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
      .gd-seat.bottom { bottom: 200px; left: 50%; transform: translateX(-50%); }
      
      .gd-player-action-container { display: flex; justify-content: center; width: 100%; margin-bottom: 12px; height: 55px; }
      .gd-action-bar { display: none; gap: 20px; justify-content: center; width: auto; }
      .gd-action-bar.show { display: flex !important; }
      .gd-action-bar button { border: none; padding: 10px 38px; border-radius: 24px; font-weight: 900; font-size: 18px; cursor: pointer; box-shadow: 0 6px 15px rgba(0,0,0,0.5); transition: transform 0.1s; }
      .gd-action-bar button:active { transform: scale(0.95); }
      .gd-btn-play { background: linear-gradient(180deg, #fff3bf 0%, #fab005 100%); color: #111; }
      .gd-btn-pass { background: linear-gradient(180deg, #ffffff 0%, #cfd8dc 100%); color: #222; }
      .gd-btn-sort { background: linear-gradient(180deg, #63e6be 0%, #0ca678 100%); color: white; }
      .gd-action-bar button:disabled { background: #495057 !important; color: #868e96 !important; cursor: not-allowed; box-shadow: none; transform: none; }
      
      .gd-player-info { background: rgba(10,25,14,0.92); padding: 14px 28px; border-radius: 16px; text-align: center; min-width: 170px; border: 2px solid rgba(255,255,255,0.18); box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
      .gd-player-info.active { border-color: #FFD700; box-shadow: 0 0 25px rgba(255, 215, 0, 0.5); background: rgba(20,45,25,0.95); }
      .gd-player-name { font-weight: 800; font-size: 17px; color: #fff; }
      .gd-player-detail { font-size: 14px; color: #FFD700; margin-top: 6px; font-weight: bold; }
      .gd-player-finished { color: #66bb6a !important; font-style: italic; font-weight: bold; }
      
      .gd-timer-outer { height: 35px; display: flex; align-items: center; justify-content: center; width: 100%; margin-bottom: 4px; }
      .gd-timer-box { display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9); padding: 4px 14px; border-radius: 20px; font-size: 15px; font-weight: 900; color: #00ff66; border: 1px solid #00ff66; box-shadow: 0 0 12px rgba(0,255,102,0.5); }
      .gd-timer-box.danger { color: #ff3838 !important; border-color: #ff3838 !important; box-shadow: 0 0 15px #ff3838 !important; }
      
      .gd-center-table { position: absolute; width: 620px; height: 260px; border: 2px dashed rgba(255,255,255,0.2); border-radius: 130px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.15); box-shadow: inset 0 0 30px rgba(0,0,0,0.3); }
      .gd-move-owner-tag { font-size: 15px; font-weight: bold; color: #FFD700; background: rgba(0,0,0,0.6); padding: 4px 16px; border-radius: 10px; border: 1px solid rgba(255,215,0,0.3); margin-bottom: 12px; }
      .gd-trick { display: flex; justify-content: center; align-items: center; width: 100%; min-height: 135px; }
      .gd-trick-empty { font-size: 16px; color: rgba(255,255,255,0.2); font-weight: bold; }
      
      .gd-hand-container { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); width: 96%; max-width: 1200px; z-index: 1000; }
      .gd-hand { display: flex; align-items: flex-end; justify-content: center; min-height: 145px; width: 100%; padding: 5px; }
      
      .gd-card { width: ${CARD_W}px; height: 132px; position: relative; background: #ffffff; border-radius: 9px; box-shadow: -4px 4px 8px rgba(0,0,0,0.35); margin-left: calc(-1 * (${CARD_W}px - 2.5vw)); transition: transform 0.1s ease; color: #000; border: 1px solid #bbb; overflow: hidden; }
      .gd-card:first-child { margin-left: 0 !important; }
      .gd-trick .gd-card { margin-left: -55px; box-shadow: -5px 5px 12px rgba(0,0,0,0.4); }
      .gd-trick .gd-card:first-child { margin-left: 0 !important; }
      
      .gd-card.sel { transform: translateY(-35px) !important; border: 2px solid #ff9f00 !important; box-shadow: 0 8px 20px rgba(255,159,0,0.6); }
      .gd-card:hover { z-index: 9999 !important; transform: translateY(-15px); }
      
      .gd-wild-card { border: 2px dashed #fab005 !important; background: #fffdf0 !important; }
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
        <div class="gd-header-info">当前主级: 打 <span data-gd-rank>${state.currentRank === 11 ? 'J' : state.currentRank === 12 ? 'Q' : state.currentRank === 13 ? 'K' : state.currentRank === 14 ? 'A' : state.currentRank}</span> | 桌上牌型: <span data-gd-move>—</span></div>
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

  // 开始指定的一局（洗牌与重设各家手牌）
  function startNewRound() {
    const deck = makeDeck();
    state.players.forEach((p, idx) => {
      p.hand = [];
    });
    deck.forEach((card, idx) => {
      state.players[idx % 4].hand.push(card);
    });
    state.players.forEach((p) => {
      p.hand = sortCards(p.hand);
    });
    state.selected.clear();
    state.trick = null;
    state.currentTurn = 0; // 新局始终由玩家首发
    state.turnCountdown = 30;
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1000;
    
    // 同步刷新主级
    const rankNode = document.querySelector('[data-gd-rank]');
    if (rankNode) {
      const labelMap = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
      rankNode.textContent = labelMap[state.currentRank] || state.currentRank;
    }
    renderTable();
  }

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
          ${isFinished ? '🏅 已出完 (跑光)' : `剩余 ${p.hand.length} 张`}
        </div>
      `;

      if (idx === 0) {
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

    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      const ownerName = state.players[state.trick.seat]?.name || '未知';
      if (ownerTag) ownerTag.textContent = `【${ownerName}】打出：`;
      if (move) move.textContent = `${state.trick.type} (${state.trick.cards.length}张)`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">桌面上空空如也，等待出牌...</span>`;
      if (ownerTag) ownerTag.textContent = '桌上风向：享有自由出牌权 🌟';
      if (move) move.textContent = '—';
    }

    const me = state.players[0];
    if (me && me.hand) {
      hand.innerHTML = me.hand.map((card, i) => {
        const isWild = card.rank === String(state.currentRank) && card.suit === 'H';
        return `
          <div class="gd-card ${card.color} ${isWild ? 'gd-wild-card' : ''}" data-card-id="${card.id}" style="z-index: ${20 + i};">
            <span class="corner tl"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
            ${isWild ? `<div class="gd-card-art-txt" style="color:#fab005; font-size:24px;">⭐配</div>` : (['J','Q','K'].includes(card.rank) ? `<div class="gd-card-court-bg">${card.rank}</div><div class="gd-card-court-avatar">${card.rank === 'J' ? '⚔️' : card.rank === 'Q' ? '🌸' : '👑'}</div>` : (card.kind === 'joker' ? `<div class="gd-card-art-txt">${card.rank === 'W' ? '👑' : '🃏'}</div>` : `<div class="gd-card-grid-suits">${Array(Math.min(parseInt(card.rank)||10, 6)).fill(`<span class="gd-mini-suit">${card.symbol}</span>`).join('')}</div>`))}
            <span class="corner br"><span class="r">${rankLabel(card)}</span><span class="s">${card.symbol}</span></span>
          </div>`;
      }).join('');

      hand.querySelectorAll('[data-card-id]').forEach((cardDOM) => {
        if (state.selected.has(cardDOM.getAttribute('data-card-id'))) {
          cardDOM.classList.add('sel');
        }
      });
    }

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

  // ✨ 优化点 2：单把终结触发多局级数晋升与洗牌接续机制
  function checkGameEndStatus() {
    const p0 = state.players[0].hand.length === 0; // 南 (你)
    const p1 = state.players[1].hand.length === 0; // 东
    const p2 = state.players[2].hand.length === 0; // 北 (对家)
    const p3 = state.players[3].hand.length === 0; // 西

    // 南北同盟双扣或出完
    if (p0 && p2) {
      state.currentRank = Math.min(14, state.currentRank + 2); // 连升二级
      setTimeout(() => {
        alert(`🎉 恭喜本把大获全胜！\n你与对家率先跑光！南北同盟主级获得进阶！\n下一把即将自动发牌，当前主级：打 ${state.currentRank === 11 ? 'J' : state.currentRank === 12 ? 'Q' : state.currentRank === 13 ? 'K' : state.currentRank === 14 ? 'A' : state.currentRank}`);
        startNewRound(); // 🔄 自动洗牌开下局
      }, 600);
      return true;
    }
    // 东西阵营率先出完
    if (p1 && p3) {
      setTimeout(() => {
        alert(`💔 遗憾失败！\n对手两家抢先出完牌。请调整策略在下一把打回来！\n下一把即将自动发牌，当前主级不变。`);
        startNewRound(); // 🔄 自动洗牌开下局
      }, 600);
      return true;
    }
    return false;
  }

  function changeTurn(nextSeat) {
    if (checkGameEndStatus()) return;

    let loops = 0;
    while (state.players[nextSeat].hand.length === 0 && loops < 4) {
      nextSeat = (nextSeat + 1) % 4;
      loops++;
    }

    // 完美接风：如果转了一圈没人要，牌权属于最后出牌人的同盟或下家
    if (state.trick && state.trick.seat === nextSeat) {
      state.trick = null; 
    }

    state.currentTurn = nextSeat;
    state.turnCountdown = 30;
    state.lastCountdownTick = performance.now();
    state.aiDelay = performance.now() + 1000;
    renderTable();

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
    
    changeTurn((seat + 1) % 4);
    return true;
  }

  function passTurn(seat) {
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

  function triggerAIMove() {
    state.busy = true;
    try {
      const seat = state.currentTurn;
      const player = state.players[seat];
      if (!player || player.hand.length === 0) { changeTurn((seat + 1) % 4); return; }
      
      const hand = player.hand;
      
      if (!state.trick) {
        for (let i = 0; i < hand.length - 1; i++) {
          if (hand[i].value === hand[i+1].value) {
            playCards(seat, [hand[i], hand[i+1]]);
            return;
          }
        }
        playCards(seat, [hand[0]]);
        return;
      }

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
    console.log('[Guandan] 多局连打全规则引擎版激活...');
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell;

    // 跨局基础选手池初始化一次
    state.players = SEATS.map((seat) => ({ id: seat.id, name: seat.name, pos: seat.pos, hand: [] }));

    bindHandInteraction();

    on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); passTurn(0); });
    on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    // 🎬 直接开动首局
    startNewRound();

    state.timer = setInterval(gameHeartbeatLoop, 100);
    state.active = true;
  }

  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    btn.onclick = (e) => { e.preventDefault(); init(); };
  }

  Object.assign(GD, { init, destroy, startNewRound, playGDSound, injectResponsiveStyles });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();