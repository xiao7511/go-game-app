/**
 * guandan-game.js
 * 掼蛋扑克游戏扩展包 (多局自动接续与主级修复版)
 */
(() => {
  'use strict';

  const GD_ICON_SUITS = { SPADE: '♠', HEART: '♥', CLUB: '♣', DIAMOND: '♦' };
  
  // 初始化或提取全局 GD 对象沙箱
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

  // 🌟 核心状态持久化（修复点：currentRank 初始默认设为 3）
  const state = {
    gameMode: 'SINGLE_PLAYER',
    currentRank: 3, // 默认打 3
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
  
  // 考虑到主级动态排序：将当前正在打的级牌权重提高
  function sortCards(cards) {
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
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t); o.stop(t + 0.11);
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

  // 🌟 核心扩展：多局无缝自动连打洗牌机制
  function startNewRound() {
    const deck = makeDeck();
    state.players.forEach((p, idx) => {
      p.hand = [];
    });
    // 重新发牌
    deck.forEach((card, idx) => {
      state.players[idx % 4].hand.push(card);
    });
    // 重新理牌
    state.players.forEach((p) => {
      p.hand = sortCards(p.hand);
    });
    
    state.selected.clear();
    state.trick = null;
    state.currentTurn = 0; // 新一局始终由你（南家）先出牌
    state.aiDelay = performance.now() + 600;
    state.active = true;   // 恢复心跳轮询
    state.busy = false;

    // 刷新级牌界面标签
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
    
    // 动态识别红桃逢人配（百搭级牌）
    const wildCount = cards.filter(c => c.rank === String(state.currentRank) && c.suit === 'H').length;

    const values = cards.map((c) => c.value);
    const grouped = groupsByValue(cards);
    const counts = [...grouped.values()].map((x) => x.length).sort((a, b) => a - b);
    const allSame = counts.length === 1;

    if (n === 1) return { type: 'single', weight: values[0], size: 1, rank: values[0] };
    if (n === 2 && (allSame || wildCount === 1)) return { type: 'pair', weight: values[0], size: 2, rank: values[0] };
    if (n === 3 && (allSame || wildCount >= 1)) return { type: 'triple', weight: values[0], size: 3, rank: values[0] };
    if (n >= 4 && (allSame || (counts.length <= 2 && wildCount >= 1))) return { type: 'bomb', weight: values[0] * 100 + n, size: n, rank: values[0] };

    if (n === 5 && rankSeq(values) && sameSuit(cards)) return { type: 'straight_flush', weight: values[0], size: 5, rank: values[0] };
    if (n === 4 && cards.every((c) => c.kind === 'joker')) return { type: 'rocket', weight: 9999, size: 4, rank: 9999 };

    if (n >= 5 && rankSeq(values) && values.every((v) => v < 16)) return { type: 'straight', weight: values[0], size: n, rank: values[0] };
    if (n >= 6 && n % 2 === 0 && [...grouped.values()].every((x) => x.length === 2)) {
      const pairVals = [...grouped.keys()].sort((a, b) => a - b);
      if (rankSeq(pairVals) && pairVals.every((v) => v < 16)) return { type: 'pair_seq', weight: pairVals[0], size: n, rank: pairVals[0] };
    }
    if (n === 5) {
      const triple = [...grouped.entries()].find(([, x]) => x.length === 3);
      const pair = [...grouped.entries()].find(([, x]) => x.length === 2);
      if (triple && pair) return { type: 'full_house', weight: Number(triple[0]), size: 5, rank: Number(triple[0]) };
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
        <div class="gd-header-info">
          当前主级: 打 <span data-gd-rank>${state.currentRank}</span> | 
          桌上牌型: <span data-gd-move>—</span>
        </div>
        <button class="gd-exit-btn" data-gd-exit>退出沙箱</button>
      </div>

      <div class="gd-arena">
        <div class="gd-seat top" data-gd-seat="2"></div>
        <div class="gd-seat left" data-gd-seat="3"></div>
        <div class="gd-seat right" data-gd-seat="1"></div>

        <div class="gd-center-table">
          <div class="gd-trick" data-gd-trick></div>
        </div>

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
    SEATS.forEach((seat, idx) => {
      const seatNode = state.root?.querySelector(`[data-gd-seat="${idx}"]`);
      if (!seatNode) return;
      const p = state.players[idx];
      if (!p) {
        seatNode.innerHTML = `<div class="gd-player-info">等待加入...</div>`;
        return;
      }
      const isActive = state.currentTurn === idx;
      const cardCount = p.hand ? p.hand.length : 0;
      
      seatNode.innerHTML = `
        <div class="gd-player-info ${isActive ? 'active' : ''}">
          <div class="gd-player-name">${p.name}</div>
          <div class="gd-player-detail">
            <span class="gd-card-icon">🂠</span> ${cardCount === 0 ? '🏅 已跑光' : `剩余 ${cardCount} 张`}
          </div>
        </div>
      `;
    });
  }

  function renderTable() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    renderSeats();

    const trick = root.querySelector('[data-gd-trick]');
    const move = root.querySelector('[data-gd-move]');
    const hand = root.querySelector('[data-gd-hand]');
    const actionBar = root.querySelector('[data-gd-action-bar]');

    if (!hand || !trick) return; 

    if (state.trick) {
      trick.innerHTML = state.trick.cards.map(formatCard).join('');
      if (move) move.textContent = `${state.trick.type} · ${state.trick.cards.length}张`;
    } else {
      trick.innerHTML = `<span class="gd-trick-empty">桌上干净，等待出牌...</span>`;
      if (move) move.textContent = '—';
    }

    const me = state.players[0];
    if (me && me.hand) {
      hand.innerHTML = sortCards(me.hand).map(formatCard).join('');
      
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

  function showToast(msg) {
    const toastNode = document.querySelector('[data-gd-toast]');
    if (toastNode) {
      toastNode.textContent = msg;
      toastNode.style.opacity = '1';
      clearTimeout(state._toastTimer);
      state._toastTimer = setTimeout(() => { toastNode.style.opacity = '0'; }, 1800);
    }
  }

  function playCards(seat, cards) {
    const move = typeOf(cards);
    if (!move || (state.trick && !beats(move, state.trick))) return false;

    const player = state.players[seat];
    player.hand = player.hand.filter(c => !cards.includes(c));
    
    state.trick = { ...move, cards, seat };
    state.selected.clear();
    
    if (player.hand.length === 0) {
      showToast(`👏 恭喜 ${player.name} 出光手牌！`);
    }
    
    // 每次有人出完牌，立即验证整场终局
    if (checkGameOver()) return true;

    // 寻找下一个有牌的活跃玩家
    let nextTurn = (seat + 1) % 4;
    while (state.players[nextTurn].hand.length === 0) {
      nextTurn = (nextTurn + 1) % 4;
    }

    // 接风规则：如果一轮转回来没人压，且出牌的人手牌已经打光
    if (state.trick && state.trick.seat === nextTurn) {
      state.trick = null; // 清空桌面，接风者获得自由出牌权
    }

    state.currentTurn = nextTurn;
    state.aiDelay = performance.now() + 600;
    renderTable();
    return true;
  }

  function passTurn(seat) {
    let nextTurn = (seat + 1) % 4;
    while (state.players[nextTurn].hand.length === 0) {
      nextTurn = (nextTurn + 1) % 4;
    }
    
    if (state.trick && state.trick.seat === nextTurn) {
      state.trick = null; // 桌上一圈无人要，清空
    }
    
    state.currentTurn = nextTurn;
    playGDSound('pass');
    renderTable();
  }

  // 🌟 核心升级：修复弹出框卡死，并实现自动升级继续下一局
  function checkGameOver() {
    const team0Done = state.players[0].hand.length === 0 && state.players[2].hand.length === 0; // 南北
    const team1Done = state.players[1].hand.length === 0 && state.players[3].hand.length === 0; // 东西

    if (team0Done || team1Done) {
      state.active = false; // 🚫 立即挂起定时器，防止 alert 拦截时后台继续轮询报错
      
      let winMsg = "";
      if (team0Done) {
        state.currentRank = Math.min(14, state.currentRank + 2); // 南北同盟胜，级数+2
        winMsg = `🎉 完胜！你与队友(南北同盟) 成功包揽前两名跑光！\n主级连升2级！即将自动开启下一局。`;
      } else {
        winMsg = `💔 局势失守！对手(东西同盟) 抢先全部出完！\n主级维持不变，再接再厉！即将自动开启下一局。`;
      }

      // 用异步宏任务包裹弹窗，确保 DOM 渲染完最后一手牌后弹出，关闭后自动下一把
      setTimeout(() => {
        alert(winMsg);
        startNewRound(); // 🔄 自动洗牌分牌继续下一把！
      }, 300);

      return true;
    }
    return false;
  }

  function bestOpening(hand) {
    const sorted = sortCards(hand);
    const byValue = groupsByValue(sorted);
    const pair = [...byValue.values()].find(g => g.length === 2);
    const triple = [...byValue.values()].find(g => g.length === 3);
    if (pair) return pair;
    if (triple) return triple;
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
    // 绝杀时看情况丢四张大炸
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
      if (!player || player.hand.length === 0) { 
        passTurn(seat); 
        return; 
      }

      const choice = state.trick ? chooseFollowMove(player.hand, state.trick) : bestOpening(player.hand);
      if (choice && choice.length) {
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
    if (!cards.length) return showToast('请先选择想要击出的牌');
    const move = typeOf(cards);
    if (!move) return showToast('牌型不符合掼蛋规则！');
    if (state.trick && !beats(move, state.trick)) return showToast('不够大！压不上面前的牌型');
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
    console.log('[Guandan] 安全接续与打3修正版引擎载入成功...');
    const oldContainer = document.getElementById(ROOT_ID);
    if (oldContainer) oldContainer.remove();
    if (state.timer) clearInterval(state.timer);

    injectResponsiveStyles();
    const selection = document.getElementById('game-selection');
    if (selection) selection.style.display = 'none';

    const newShell = createShell();
    document.body.appendChild(newShell);
    state.root = newShell; 

    // 初始化4个固定玩家座位
    state.players = SEATS.map((seat) => ({ ...seat, hand: [] }));

    // 🎬 直接开动全自动连打洗牌机制
    startNewRound();
    bindHandInteraction();
    
    on(newShell.querySelector('[data-gd-play]'), 'click', () => { playGDSound('click'); humanPlay(); });
    on(newShell.querySelector('[data-gd-pass]'), 'click', () => { playGDSound('click'); humanPass(); });
    on(newShell.querySelector('[data-gd-sort]'), 'click', () => { 
      playGDSound('click'); state.players[0].hand = sortCards(state.players[0].hand); renderTable(); 
    });
    on(newShell.querySelector('[data-gd-exit]'), 'click', () => { playGDSound('click'); destroy(); });

    state.timer = setInterval(triggerAIMove, 200);
  }
  
  function bindLaunchButton() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    btn.onclick = (e) => {
      e.preventDefault();
      init();
    };
  }

  Object.assign(GD, { init, destroy, startNewRound, playGDSound, injectResponsiveStyles, triggerAIMove });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLaunchButton, { once: true });
  } else {
    bindLaunchButton();
  }
})();