(() => {
  'use strict';

  const ROOT_ID = 'guandan-game-container';
  const STYLE_ID = 'gd-style';
  const BTN_PLAY_ID = 'gd-play-btn';
  const BTN_PASS_ID = 'gd-pass-btn';
  const BTN_RETURN_ID = 'gd-return-btn';
  const BTN_SORT_ID = 'gd-sort-btn';
  const BTN_RESTART_ID = 'gd-restart-btn';

  const SUITS = [
    { key: 'spade', label: '♠', name: '黑桃' },
    { key: 'heart', label: '♥', name: '红桃' },
    { key: 'club', label: '♣', name: '梅花' },
    { key: 'diamond', label: '♦', name: '方块' },
  ];

  const RANKS = [
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
    { value: 6, label: '6' },
    { value: 7, label: '7' },
    { value: 8, label: '8' },
    { value: 9, label: '9' },
    { value: 10, label: '10' },
    { value: 11, label: 'J' },
    { value: 12, label: 'Q' },
    { value: 13, label: 'K' },
    { value: 14, label: 'A' },
    { value: 15, label: '2' },
  ];

  const RANK_LABEL = Object.fromEntries(RANKS.map((r) => [r.value, r.label]));
  const VALUE_BY_LABEL = Object.fromEntries(RANKS.map((r) => [r.label, r.value]));
  const VALUE_ORDER = RANKS.map((r) => r.value);
  const SUIT_ORDER = ['spade', 'heart', 'club', 'diamond'];
  const SMALL_JOKER = 16;
  const BIG_JOKER = 17;
  const SEAT_NAMES = ['下家', '对家', '上家', '玩家'];
  const SEAT_POSITIONS = ['南', '东', '北', '西'];
  const TEAM_NAME = ['A组', 'B组'];

  const TEAM_OF = (seat) => seat % 2;
  const NEXT_SEAT = (seat) => (seat + 1) % 4;
  const PREV_SEAT = (seat) => (seat + 3) % 4;
  const isSameTeam = (a, b) => TEAM_OF(a) === TEAM_OF(b);

  const copy = (v) => JSON.parse(JSON.stringify(v));

  const now = () => performance.now();

  const initialState = () => ({
    active: false,
    initialized: false,
    root: null,
    styleNode: null,
    loopTimer: null,
    aiBusy: false,
    aiDelayUntil: 0,
    round: 1,
    trumpRank: 15,
    trumpSuit: null,
    leadSeat: 0,
    currentSeat: 0,
    currentTrick: null,
    currentLeader: null,
    passesInTrick: 0,
    hands: [[], [], [], []],
    selectedIds: new Set(),
    selectedPreview: null,
    log: [],
    lastActionAt: 0,
    history: [],
    finishedSeats: [],
    finishedSet: new Set(),
    scores: [0, 0],
    alerts: [0, 0, 0, 0],
    tributePlan: null,
    lastRoundSummary: '',
    pendingRestart: false,
    locked: false,
    listeners: [],
    cardsById: new Map(),
    humanSeat: 0,
    humanAutoSort: true,
    dom: {},
  });

  const GD = window.GD = window.GD || {};
  if (GD.__guandanLoaded) return;
  GD.__guandanLoaded = true;
  GD.state = initialState();

  let uidSeed = 1;

  function rankLabel(value) {
    if (value === SMALL_JOKER) return '小王';
    if (value === BIG_JOKER) return '大王';
    return RANK_LABEL[value] || String(value);
  }

  function createDeck() {
    const deck = [];
    let deckIndex = 0;
    for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({
            id: `d${deckIndex}-${uidSeed += 1}`,
            deck: deckIndex,
            suit: suit.key,
            suitLabel: suit.label,
            suitName: suit.name,
            rank: rank.value,
            label: rank.label,
            isJoker: false,
            joker: null,
          });
        }
      }
      deck.push({
        id: `d${deckIndex}-${uidSeed += 1}`,
        deck: deckIndex,
        suit: 'joker',
        suitLabel: '🃏',
        suitName: '小王',
        rank: SMALL_JOKER,
        label: '小王',
        isJoker: true,
        joker: 'small',
      });
      deck.push({
        id: `d${deckIndex}-${uidSeed += 1}`,
        deck: deckIndex,
        suit: 'joker',
        suitLabel: '🃏',
        suitName: '大王',
        rank: BIG_JOKER,
        label: '大王',
        isJoker: true,
        joker: 'big',
      });
      deckIndex += 1;
    }
    return deck;
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isWild(card, trumpRank = GD.state.trumpRank) {
    return card.isJoker || (card.suit === 'heart' && card.rank === trumpRank);
  }

  function cardStrength(card, trumpRank = GD.state.trumpRank) {
    if (card.isJoker) return 1000 + card.rank;
    if (card.rank === trumpRank) return 800 + card.rank;
    if (card.suit === 'heart' && card.rank === trumpRank) return 700 + card.rank;
    return card.rank * 10 + SUIT_ORDER.indexOf(card.suit);
  }

  function displayCard(card, trumpRank = GD.state.trumpRank) {
    if (card.isJoker) return card.label;
    const isMain = card.rank === trumpRank;
    const isWildcard = isWild(card, trumpRank);
    const crown = isMain ? '★' : '';
    return `${card.suitLabel}${card.label}${crown}${isWildcard && !card.isJoker ? '·配' : ''}`;
  }

  function getCardsById(ids) {
    const state = GD.state;
    return ids.map((id) => state.cardsById.get(id)).filter(Boolean);
  }

  function sortHand(hand, trumpRank = GD.state.trumpRank) {
    return hand.slice().sort((a, b) => {
      const aw = isWild(a, trumpRank) ? 1 : 0;
      const bw = isWild(b, trumpRank) ? 1 : 0;
      if (aw !== bw) return aw - bw;
      const aj = a.isJoker ? 1 : 0;
      const bj = b.isJoker ? 1 : 0;
      if (aj !== bj) return aj - bj;
      const ar = a.rank === trumpRank ? 100 : a.rank;
      const br = b.rank === trumpRank ? 100 : b.rank;
      if (ar !== br) return ar - br;
      return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    });
  }

  function buildRankCounts(cards, trumpRank = GD.state.trumpRank) {
    const counts = new Map();
    const suitCounts = new Map();
    let wildCount = 0;
    const wildCards = [];
    for (const card of cards) {
      if (isWild(card, trumpRank)) {
        wildCount += 1;
        wildCards.push(card);
        continue;
      }
      counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
      if (!suitCounts.has(card.suit)) suitCounts.set(card.suit, []);
      suitCounts.get(card.suit).push(card);
    }
    return { counts, suitCounts, wildCount, wildCards };
  }

  function scoreForCombo(type, opts) {
    const top = opts.topRank || 0;
    const len = opts.length || 0;
    const count = opts.count || 0;
    switch (type) {
      case 'single': return 1000 + top;
      case 'pair': return 2000 + top;
      case 'triple': return 3000 + top;
      case 'triple_pair': return 4000 + top;
      case 'straight': return 5000 + len * 20 + top;
      case 'pair_seq': return 6000 + len * 20 + top;
      case 'triple_seq': return 7000 + len * 20 + top;
      case 'straight_flush': return 9300 + top;
      case 'bomb': return 9200 + Math.max(0, count - 4) * 200 + top;
      case 'heavenly_bomb': return 10000;
      default: return 0;
    }
  }

  function normalizeCombo(type, cards, meta = {}) {
    const length = cards.length;
    return {
      type,
      group: ['bomb', 'straight_flush', 'heavenly_bomb'].includes(type) ? 'special' : 'normal',
      cards: cards.slice(),
      length,
      topRank: meta.topRank ?? 0,
      count: meta.count ?? length,
      suit: meta.suit ?? null,
      start: meta.start ?? null,
      score: scoreForCombo(type, { topRank: meta.topRank ?? 0, length, count: meta.count ?? length }),
      text: meta.text || type,
    };
  }

  function canBuildStraight(cards, trumpRank = GD.state.trumpRank, targetLength = cards.length) {
    if (targetLength < 5) return null;
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const fixedRanks = [...counts.keys()];
    if (fixedRanks.some((r) => r === 15)) return null;
    const minStart = 3;
    const maxStart = 14 - targetLength + 1;
    let best = null;
    for (let start = minStart; start <= maxStart; start += 1) {
      const end = start + targetLength - 1;
      let need = 0;
      let valid = true;
      for (const [rank, count] of counts.entries()) {
        if (rank < start || rank > end) {
          valid = false;
          break;
        }
        if (count > 1) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      for (let rank = start; rank <= end; rank += 1) {
        if (!counts.has(rank)) need += 1;
      }
      if (need > wildCount) continue;
      const topRank = end;
      const combo = normalizeCombo('straight', cards, { topRank, start, text: `顺子 ${rankLabel(start)}-${rankLabel(end)}` });
      if (!best || combo.score > best.score) best = combo;
    }
    return best;
  }

  function canBuildPairSeq(cards, trumpRank = GD.state.trumpRank, targetLength = cards.length / 2) {
    if (cards.length < 6 || cards.length % 2 !== 0) return null;
    const pairCount = cards.length / 2;
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const minStart = 3;
    const maxStart = 14 - pairCount + 1;
    let best = null;
    for (let start = minStart; start <= maxStart; start += 1) {
      const end = start + pairCount - 1;
      let need = 0;
      let valid = true;
      for (const [rank, count] of counts.entries()) {
        if (rank < start || rank > end) {
          valid = false;
          break;
        }
        if (count > 2) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      for (let rank = start; rank <= end; rank += 1) {
        need += Math.max(0, 2 - (counts.get(rank) || 0));
      }
      if (need > wildCount) continue;
      const combo = normalizeCombo('pair_seq', cards, { topRank: end, start, text: `连对 ${rankLabel(start)}-${rankLabel(end)}` });
      if (!best || combo.score > best.score) best = combo;
    }
    return best;
  }

  function canBuildTripleSeq(cards, trumpRank = GD.state.trumpRank) {
    if (cards.length < 6 || cards.length % 3 !== 0) return null;
    const tripleCount = cards.length / 3;
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const minStart = 3;
    const maxStart = 14 - tripleCount + 1;
    let best = null;
    for (let start = minStart; start <= maxStart; start += 1) {
      const end = start + tripleCount - 1;
      let need = 0;
      let valid = true;
      for (const [rank, count] of counts.entries()) {
        if (rank < start || rank > end) {
          valid = false;
          break;
        }
        if (count > 3) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      for (let rank = start; rank <= end; rank += 1) {
        need += Math.max(0, 3 - (counts.get(rank) || 0));
      }
      if (need > wildCount) continue;
      const combo = normalizeCombo('triple_seq', cards, { topRank: end, start, text: `钢板 ${rankLabel(start)}-${rankLabel(end)}` });
      if (!best || combo.score > best.score) best = combo;
    }
    return best;
  }

  function canBuildStraightFlush(cards, trumpRank = GD.state.trumpRank) {
    if (cards.length !== 5) return null;
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const fixed = cards.filter((c) => !isWild(c, trumpRank));
    const suits = new Set(fixed.map((c) => c.suit));
    if (suits.size > 1) return null;
    const minStart = 3;
    const maxStart = 14 - 5 + 1;
    let best = null;
    for (let start = minStart; start <= maxStart; start += 1) {
      const end = start + 4;
      let need = 0;
      let valid = true;
      for (const [rank, count] of counts.entries()) {
        if (rank < start || rank > end) {
          valid = false;
          break;
        }
        if (count > 1) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      for (let rank = start; rank <= end; rank += 1) {
        need += Math.max(0, 1 - (counts.get(rank) || 0));
      }
      if (need > wildCount) continue;
      const combo = normalizeCombo('straight_flush', cards, { topRank: end, start, suit: fixed[0]?.suit || null, text: `同花顺 ${rankLabel(start)}-${rankLabel(end)}` });
      if (!best || combo.score > best.score) best = combo;
    }
    return best;
  }

  function canBuildSameRank(cards, trumpRank = GD.state.trumpRank, type) {
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const fixedRanks = [...counts.keys()];
    if (fixedRanks.length > 1) return null;
    const target = type === 'single' ? 1 : type === 'pair' ? 2 : type === 'triple' ? 3 : type === 'bomb' ? 4 : null;
    if (target == null) return null;
    if (cards.length < target) return null;
    const rank = fixedRanks[0] || trumpRank;
    const fixedCount = counts.get(rank) || 0;
    if (fixedCount + wildCount < target) return null;
    if (type !== 'bomb' && cards.length !== target) return null;
    if (type === 'bomb' && cards.length < 4) return null;
    return normalizeCombo(type, cards, { topRank: rank, count: cards.length, text: `${type}` });
  }

  function canBuildTriplePair(cards, trumpRank = GD.state.trumpRank) {
    if (cards.length !== 5) return null;
    const { counts, wildCount } = buildRankCounts(cards, trumpRank);
    const ranks = VALUE_ORDER;
    for (const tripleRank of ranks) {
      if (tripleRank === 15) continue;
      const fixedRanks = [...counts.keys()];
      if (fixedRanks.some((r) => r !== tripleRank && r !== 15)) {
        // other fixed ranks may still become the pair rank; check later
      }
      const tripleFixed = counts.get(tripleRank) || 0;
      if (tripleFixed > 3) continue;
      const tripleNeed = Math.max(0, 3 - tripleFixed);
      if (tripleNeed > wildCount) continue;
      const remainWild = wildCount - tripleNeed;
      for (const pairRank of ranks) {
        if (pairRank === tripleRank || pairRank === 15) continue;
        let invalid = false;
        for (const fixedRank of counts.keys()) {
          if (fixedRank !== tripleRank && fixedRank !== pairRank) {
            invalid = true;
            break;
          }
        }
        if (invalid) continue;
        const pairFixed = counts.get(pairRank) || 0;
        if (pairFixed > 2) continue;
        const pairNeed = Math.max(0, 2 - pairFixed);
        if (pairNeed > remainWild) continue;
        return normalizeCombo('triple_pair', cards, { topRank: tripleRank, text: `三带两 ${rankLabel(tripleRank)}` });
      }
    }
    return null;
  }

  function evaluateCombo(cards, trumpRank = GD.state.trumpRank) {
    if (!cards || cards.length === 0) return null;
    if (cards.length === 4 && cards.every((c) => c.isJoker)) {
      return normalizeCombo('heavenly_bomb', cards, { topRank: BIG_JOKER, count: 4, text: '天王炸' });
    }

    const straightFlush = canBuildStraightFlush(cards, trumpRank);
    if (straightFlush) return straightFlush;

    const tripleSeq = canBuildTripleSeq(cards, trumpRank);
    if (tripleSeq) return tripleSeq;

    const pairSeq = canBuildPairSeq(cards, trumpRank);
    if (pairSeq) return pairSeq;

    const straight = canBuildStraight(cards, trumpRank);
    if (straight) return straight;

    const triplePair = canBuildTriplePair(cards, trumpRank);
    if (triplePair) return triplePair;

    const bomb = canBuildSameRank(cards, trumpRank, 'bomb');
    if (bomb) return bomb;

    const triple = canBuildSameRank(cards, trumpRank, 'triple');
    if (triple) return triple;

    const pair = canBuildSameRank(cards, trumpRank, 'pair');
    if (pair) return pair;

    const single = canBuildSameRank(cards, trumpRank, 'single');
    if (single) return single;

    return null;
  }

  function compareCombo(candidate, target) {
    if (!target) return true;
    if (candidate.type === 'heavenly_bomb') {
      return target.type !== 'heavenly_bomb';
    }
    if (target.type === 'heavenly_bomb') return false;

    if (candidate.type === 'straight_flush' || candidate.type === 'bomb') {
      if (target.group === 'special' || target.group === 'normal') {
        return candidate.score > target.score;
      }
    }

    if (target.group === 'special') {
      return candidate.group === 'special' && candidate.score > target.score;
    }

    if (candidate.type !== target.type) return false;
    if (candidate.type === 'straight' || candidate.type === 'pair_seq' || candidate.type === 'triple_seq') {
      if (candidate.length !== target.length) return false;
    }
    if (candidate.type === 'triple_pair') {
      if (target.length !== 5 || candidate.length !== 5) return false;
    }
    if (candidate.type === 'pair' || candidate.type === 'triple' || candidate.type === 'single') {
      if (candidate.length !== target.length) return false;
    }
    return candidate.score > target.score;
  }

  function pickLowestCards(hand, count, trumpRank = GD.state.trumpRank, filterFn = null) {
    const sorted = sortHand(hand, trumpRank).filter((c) => !filterFn || filterFn(c));
    return sorted.slice(0, count);
  }

  function consumeCards(hand, selectedIds) {
    const ids = new Set(selectedIds);
    return hand.filter((card) => ids.has(card.id));
  }

  function removeCardsFromHand(hand, selectedIds) {
    const ids = new Set(selectedIds);
    return hand.filter((card) => !ids.has(card.id));
  }

  function buildMoveFromCards(cards, trumpRank = GD.state.trumpRank) {
    const combo = evaluateCombo(cards, trumpRank);
    if (!combo) return null;
    return combo;
  }

  function selectedCardsFromState() {
    const state = GD.state;
    return getCardsById([...state.selectedIds]);
  }

  function canLeadWith(combo) {
    return !!combo;
  }

  function makeComboFromPattern(type, cards, extra = {}) {
    return normalizeCombo(type, cards, extra);
  }

  function searchExactRankCombo(hand, targetType, minRank = 3, trumpRank = GD.state.trumpRank) {
    const { counts, wildCount } = buildRankCounts(hand, trumpRank);
    const ranks = VALUE_ORDER;
    const candidates = [];
    if (targetType === 'single') {
      for (const card of sortHand(hand, trumpRank)) candidates.push(makeComboFromPattern('single', [card], { topRank: card.rank, text: `单张 ${displayCard(card, trumpRank)}` }));
      return candidates;
    }
    if (targetType === 'pair' || targetType === 'triple' || targetType === 'bomb') {
      const need = targetType === 'pair' ? 2 : targetType === 'triple' ? 3 : 4;
      for (const rank of ranks) {
        if (rank === 15 && targetType !== 'bomb') continue;
        const fixed = counts.get(rank) || 0;
        if (fixed > need) continue;
        const deficit = Math.max(0, need - fixed);
        if (deficit > wildCount) continue;
        const cardsOfRank = hand.filter((c) => !isWild(c, trumpRank) && c.rank === rank).slice(0, fixed);
        const wilds = hand.filter((c) => isWild(c, trumpRank)).slice(0, deficit);
        const comboCards = cardsOfRank.concat(wilds);
        if (comboCards.length === need) {
          candidates.push(makeComboFromPattern(targetType, comboCards, { topRank: rank, count: comboCards.length, text: `${targetType} ${rankLabel(rank)}` }));
        }
      }
    }
    return candidates;
  }

  function buildRunCards(hand, start, length, mult, trumpRank = GD.state.trumpRank) {
    const { counts, wildCards } = buildRankCounts(hand, trumpRank);
    const chosen = [];
    const used = new Set();
    const rankBuckets = new Map();
    for (const card of hand) {
      if (isWild(card, trumpRank)) continue;
      if (!rankBuckets.has(card.rank)) rankBuckets.set(card.rank, []);
      rankBuckets.get(card.rank).push(card);
    }
    for (const arr of rankBuckets.values()) {
      arr.sort((a, b) => cardStrength(a, trumpRank) - cardStrength(b, trumpRank));
    }
    const wildPool = wildCards.slice();
    for (let rank = start; rank < start + length; rank += 1) {
      const available = rankBuckets.get(rank) || [];
      const take = Math.min(mult, available.length);
      for (let i = 0; i < take; i += 1) {
        chosen.push(available[i]);
        used.add(available[i].id);
      }
      const deficit = mult - take;
      for (let i = 0; i < deficit; i += 1) {
        const wild = wildPool.shift();
        if (!wild) return null;
        chosen.push(wild);
        used.add(wild.id);
      }
    }
    return chosen;
  }

  function enumeratePlayOptions(hand, trumpRank = GD.state.trumpRank) {
    const options = [];
    const sorted = sortHand(hand, trumpRank);

    for (const card of sorted) {
      options.push(makeComboFromPattern('single', [card], { topRank: card.rank, text: `单张 ${displayCard(card, trumpRank)}` }));
    }

    const rankSet = [...new Set(hand.filter((c) => !isWild(c, trumpRank)).map((c) => c.rank))];
    const { counts, wildCount } = buildRankCounts(hand, trumpRank);

    for (const rank of VALUE_ORDER) {
      const fixed = counts.get(rank) || 0;
      if (fixed + wildCount >= 2 && fixed <= 2) {
        const cards = buildSameRankCards(hand, rank, 2, trumpRank);
        if (cards) options.push(makeComboFromPattern('pair', cards, { topRank: rank, text: `对子 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 3 && fixed <= 3) {
        const cards = buildSameRankCards(hand, rank, 3, trumpRank);
        if (cards) options.push(makeComboFromPattern('triple', cards, { topRank: rank, text: `三张 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 4 && fixed <= 4) {
        const cards = buildSameRankCards(hand, rank, 4, trumpRank);
        if (cards) options.push(makeComboFromPattern('bomb', cards, { topRank: rank, count: cards.length, text: `炸弹 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 5 && fixed <= 5) {
        const cards = buildSameRankCards(hand, rank, 5, trumpRank);
        if (cards) options.push(makeComboFromPattern('bomb', cards, { topRank: rank, count: cards.length, text: `炸弹 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 6 && fixed <= 6) {
        const cards = buildSameRankCards(hand, rank, 6, trumpRank);
        if (cards) options.push(makeComboFromPattern('bomb', cards, { topRank: rank, count: cards.length, text: `炸弹 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 7 && fixed <= 7) {
        const cards = buildSameRankCards(hand, rank, 7, trumpRank);
        if (cards) options.push(makeComboFromPattern('bomb', cards, { topRank: rank, count: cards.length, text: `炸弹 ${rankLabel(rank)}` }));
      }
      if (fixed + wildCount >= 8 && fixed <= 8) {
        const cards = buildSameRankCards(hand, rank, 8, trumpRank);
        if (cards) options.push(makeComboFromPattern('bomb', cards, { topRank: rank, count: cards.length, text: `炸弹 ${rankLabel(rank)}` }));
      }
    }

    for (let start = 3; start <= 14 - 4; start += 1) {
      for (let len = 5; len <= Math.min(12, hand.length); len += 1) {
        if (start + len - 1 > 14) continue;
        const cards = buildRunCards(hand, start, len, 1, trumpRank);
        if (cards) {
          const combo = evaluateCombo(cards, trumpRank);
          if (combo && combo.type === 'straight') options.push(combo);
        }
      }
    }

    for (let start = 3; start <= 14 - 2; start += 1) {
      for (let len = 3; len <= Math.min(8, Math.floor(hand.length / 2)); len += 1) {
        if (start + len - 1 > 14) continue;
        const cards = buildRunCards(hand, start, len, 2, trumpRank);
        if (cards) {
          const combo = evaluateCombo(cards, trumpRank);
          if (combo && combo.type === 'pair_seq') options.push(combo);
        }
      }
    }

    for (let start = 3; start <= 14 - 1; start += 1) {
      for (let len = 2; len <= Math.min(5, Math.floor(hand.length / 3)); len += 1) {
        if (start + len - 1 > 14) continue;
        const cards = buildRunCards(hand, start, len, 3, trumpRank);
        if (cards) {
          const combo = evaluateCombo(cards, trumpRank);
          if (combo && combo.type === 'triple_seq') options.push(combo);
        }
      }
    }

    for (const tripleRank of VALUE_ORDER) {
      if (tripleRank === 15) continue;
      const cards = buildTriplePairCards(hand, tripleRank, trumpRank);
      if (cards) options.push(makeComboFromPattern('triple_pair', cards, { topRank: tripleRank, text: `三带两 ${rankLabel(tripleRank)}` }));
    }

    const straightFlush = buildStraightFlushOptions(hand, trumpRank);
    if (straightFlush.length) options.push(...straightFlush);

    const heavenly = buildHeavenlyBomb(hand, trumpRank);
    if (heavenly) options.push(heavenly);

    return options.filter(Boolean);
  }

  function buildSameRankCards(hand, rank, need, trumpRank = GD.state.trumpRank) {
    const nonWild = sortHand(hand.filter((c) => !isWild(c, trumpRank) && c.rank === rank), trumpRank);
    const wilds = hand.filter((c) => isWild(c, trumpRank)).slice();
    if (nonWild.length + wilds.length < need) return null;
    const chosen = nonWild.slice(0, Math.min(need, nonWild.length));
    while (chosen.length < need) {
      const wild = wilds.shift();
      if (!wild) return null;
      chosen.push(wild);
    }
    return chosen;
  }

  function buildTriplePairCards(hand, tripleRank, trumpRank = GD.state.trumpRank) {
    const { counts, wildCount } = buildRankCounts(hand, trumpRank);
    const fixedRanks = [...counts.keys()];
    for (const pairRank of VALUE_ORDER) {
      if (pairRank === tripleRank) continue;
      let invalid = false;
      for (const rank of fixedRanks) {
        if (rank !== tripleRank && rank !== pairRank) {
          invalid = true;
          break;
        }
      }
      if (invalid) continue;
      const tripleCards = buildSameRankCards(hand, tripleRank, 3, trumpRank);
      if (!tripleCards) continue;
      const used = new Set(tripleCards.map((c) => c.id));
      const remaining = hand.filter((c) => !used.has(c.id));
      const pairCards = buildSameRankCards(remaining, pairRank, 2, trumpRank);
      if (!pairCards) continue;
      return tripleCards.concat(pairCards);
    }
    return null;
  }

  function buildStraightFlushOptions(hand, trumpRank = GD.state.trumpRank) {
    const results = [];
    for (const suit of SUIT_ORDER) {
      const suitCards = hand.filter((c) => !isWild(c, trumpRank) && c.suit === suit).slice();
      const wilds = hand.filter((c) => isWild(c, trumpRank)).slice();
      const fixedRanks = [...new Set(suitCards.map((c) => c.rank))].sort((a, b) => a - b);
      for (let start = 3; start <= 10; start += 1) {
        const end = start + 4;
        const neededRanks = [];
        let invalid = false;
        for (const card of suitCards) {
          if (card.rank < start || card.rank > end) {
            invalid = true;
            break;
          }
          if (fixedRanks.filter((r) => r === card.rank).length > 1) {
            invalid = true;
            break;
          }
        }
        if (invalid) continue;
        for (let rank = start; rank <= end; rank += 1) {
          const exists = suitCards.some((c) => c.rank === rank);
          if (!exists) neededRanks.push(rank);
        }
        if (neededRanks.length > wilds.length) continue;
        const chosen = [];
        for (let rank = start; rank <= end; rank += 1) {
          const card = suitCards.find((c) => c.rank === rank && !chosen.includes(c));
          if (card) {
            chosen.push(card);
          } else {
            const wild = wilds.shift();
            if (!wild) {
              invalid = true;
              break;
            }
            chosen.push(wild);
          }
        }
        if (invalid || chosen.length !== 5) continue;
        const combo = normalizeCombo('straight_flush', chosen, { topRank: end, suit, text: `同花顺 ${SUIT_ORDER.indexOf(suit)}-${rankLabel(end)}` });
        results.push(combo);
      }
    }
    return results;
  }

  function buildHeavenlyBomb(hand, trumpRank = GD.state.trumpRank) {
    const jokers = hand.filter((c) => c.isJoker);
    if (jokers.length >= 4) {
      return normalizeCombo('heavenly_bomb', jokers.slice(0, 4), { topRank: BIG_JOKER, count: 4, text: '天王炸' });
    }
    return null;
  }

  function chooseLeadCombo(hand, trumpRank = GD.state.trumpRank) {
    const options = enumeratePlayOptions(hand, trumpRank)
      .filter((c) => c.type !== 'bomb' && c.type !== 'straight_flush' && c.type !== 'heavenly_bomb');
    if (options.length === 0) return null;
    options.sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      if (a.score !== b.score) return a.score - b.score;
      return a.topRank - b.topRank;
    });
    return options[0];
  }

  function chooseResponseCombo(hand, target, seat, trumpRank = GD.state.trumpRank) {
    const options = enumeratePlayOptions(hand, trumpRank);
    const teammateLead = target && isSameTeam(seat, target.seat);
    if (teammateLead) {
      if (GD.state.alerts.some((a) => a >= 2)) {
        const pressure = options.filter((c) => compareCombo(c, target) || c.group === 'special');
        pressure.sort((a, b) => a.score - b.score);
        return pressure[0] || null;
      }
      return null;
    }

    const sameType = options.filter((c) => c.type === target.type && c.length === target.length);
    sameType.sort((a, b) => a.score - b.score);
    const normalPick = sameType.find((c) => compareCombo(c, target));
    if (normalPick) return normalPick;

    const specials = options.filter((c) => c.group === 'special' || c.type === 'straight_flush');
    specials.sort((a, b) => a.score - b.score);
    if (specials.length === 0) return null;

    const danger = GD.state.alerts.some((v) => v >= 1);
    if (danger || hand.length <= 8 || (target && target.length <= 2) || GD.state.hands[seat].length <= 6) {
      return specials.find((c) => compareCombo(c, target)) || null;
    }

    if (target && target.type === 'single') {
      const biggerSingle = sameType.find((c) => c.type === 'single');
      if (biggerSingle) return biggerSingle;
    }
    return null;
  }

  function highCards(hand, count, trumpRank = GD.state.trumpRank) {
    return sortHand(hand, trumpRank).slice(-count);
  }

  function lowCards(hand, count, trumpRank = GD.state.trumpRank) {
    return sortHand(hand, trumpRank).slice(0, count);
  }

  function maxCardsByRank(hand, count, trumpRank = GD.state.trumpRank) {
    return sortHand(hand, trumpRank).slice(-count);
  }

  function updateAlerts() {
    const state = GD.state;
    state.alerts = state.hands.map((hand) => {
      const left = hand.length;
      if (left <= 5) return 2;
      if (left <= 10) return 1;
      return 0;
    });
  }

  function teamHasFinished(team) {
    const state = GD.state;
    return state.finishedSeats.some((seat) => TEAM_OF(seat) === team);
  }

  function nextActiveSeat(fromSeat) {
    const state = GD.state;
    let seat = fromSeat;
    for (let i = 0; i < 4; i += 1) {
      seat = NEXT_SEAT(seat);
      if (!state.finishedSet.has(seat) && state.hands[seat].length > 0) return seat;
    }
    return fromSeat;
  }

  function applyTributePlan() {
    const state = GD.state;
    const plan = state.tributePlan;
    if (!plan) return;

    const { mode, fromTeam, toTeam, count } = plan;
    const donorSeats = [0, 1, 2, 3].filter((s) => TEAM_OF(s) === fromTeam && state.hands[s].length > 0);
    const receiverSeats = [0, 1, 2, 3].filter((s) => TEAM_OF(s) === toTeam && state.hands[s].length > 0);

    if (mode === 'anti') {
      state.log.unshift(`抗贡触发：${TEAM_NAME[fromTeam]} 暂停贡牌。`);
      state.tributePlan = null;
      return;
    }

    const transfers = [];
    for (let i = 0; i < Math.min(donorSeats.length, receiverSeats.length); i += 1) {
      const donorSeat = donorSeats[i];
      const receiverSeat = receiverSeats[i];
      const donorPick = highCards(state.hands[donorSeat], count);
      const receiverPick = lowCards(state.hands[receiverSeat], count).filter((c) => !c.isJoker && c.rank <= 10);
      for (const card of donorPick) {
        state.hands[donorSeat] = state.hands[donorSeat].filter((c) => c.id !== card.id);
        state.hands[receiverSeat].push(card);
      }
      for (const card of receiverPick) {
        state.hands[receiverSeat] = state.hands[receiverSeat].filter((c) => c.id !== card.id);
        state.hands[donorSeat].push(card);
      }
      transfers.push(`${SEAT_NAMES[donorSeat]}↔${SEAT_NAMES[receiverSeat]}`);
    }

    state.log.unshift(`贡牌结算：${TEAM_NAME[fromTeam]} 向 ${TEAM_NAME[toTeam]} 交换 ${count} 张。${transfers.join('，')}`);
    state.tributePlan = null;
  }

  function determineTributeFromFinishOrder() {
    const state = GD.state;
    if (state.finishedSeats.length < 2) return null;
    const first = state.finishedSeats[0];
    const second = state.finishedSeats[1];
    const firstTeam = TEAM_OF(first);
    const secondTeam = TEAM_OF(second);
    if (firstTeam !== secondTeam) {
      return { mode: 'normal', fromTeam: secondTeam, toTeam: firstTeam, count: 1 };
    }
    return { mode: 'double', fromTeam: 1 - firstTeam, toTeam: firstTeam, count: 2 };
  }

  function determineAntiTributeFromFinishOrder() {
    const state = GD.state;
    if (state.finishedSeats.length < 4) return null;
    const last = state.finishedSeats[state.finishedSeats.length - 1];
    const beforeLast = state.finishedSeats[state.finishedSeats.length - 2];
    if (TEAM_OF(last) === TEAM_OF(beforeLast)) {
      return { mode: 'anti', fromTeam: TEAM_OF(last), toTeam: 1 - TEAM_OF(last), count: 0 };
    }
    return null;
  }

  function advanceTrumpRank(trumpRank) {
    const cycle = [15, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const idx = cycle.indexOf(trumpRank);
    return cycle[(idx + 1) % cycle.length];
  }

  function dealCards() {
    const state = GD.state;
    const deck = shuffle(createDeck());
    state.cardsById = new Map();
    for (const card of deck) state.cardsById.set(card.id, card);
    state.hands = [[], [], [], []];
    for (let i = 0; i < deck.length; i += 1) {
      state.hands[i % 4].push(deck[i]);
    }
    state.hands = state.hands.map((hand) => sortHand(hand, state.trumpRank));
    state.finishedSeats = [];
    state.finishedSet = new Set();
    state.currentTrick = null;
    state.currentLeader = null;
    state.passesInTrick = 0;
    state.currentSeat = state.leadSeat;
    state.selectedIds = new Set();
    updateAlerts();
    applyTributePlan();
    updateAlerts();
    state.log.unshift(`第 ${state.round} 局开始，主牌：${rankLabel(state.trumpRank)}。`);
  }

  function setRoundResult(message) {
    const state = GD.state;
    state.lastRoundSummary = message;
    state.log.unshift(message);
  }

  function finishSeat(seat) {
    const state = GD.state;
    if (!state.finishedSet.has(seat)) {
      state.finishedSet.add(seat);
      state.finishedSeats.push(seat);
      state.log.unshift(`${SEAT_POSITIONS[seat]} / ${SEAT_NAMES[seat]} 已出完牌。`);
      state.scores[TEAM_OF(seat)] += 1;
    }
  }

  function endRoundIfNeeded() {
    const state = GD.state;
    if (state.hands.every((hand) => hand.length === 0)) {
      const first = state.finishedSeats[0];
      const winnerTeam = TEAM_OF(first ?? 0);
      const tribute = determineTributeFromFinishOrder() || determineAntiTributeFromFinishOrder();
      state.tributePlan = tribute;
      state.trumpRank = advanceTrumpRank(state.trumpRank);
      state.round += 1;
      setRoundResult(`本局结束：${TEAM_NAME[winnerTeam]} 先出完牌。下一局主牌升级为 ${rankLabel(state.trumpRank)}。`);
      state.pendingRestart = true;
      state.aiDelayUntil = now() + 1500;
      render();
      setTimeout(() => {
        if (!state.active) return;
        dealCards();
        state.currentSeat = state.leadSeat;
        state.pendingRestart = false;
        render();
      }, 1500);
    }
  }

  function playCombo(seat, combo) {
    const state = GD.state;
    if (!combo) return false;
    const hand = state.hands[seat];
    const ids = new Set(combo.cards.map((c) => c.id));
    if (combo.cards.some((c) => !hand.some((h) => h.id === c.id))) return false;

    state.hands[seat] = hand.filter((card) => !ids.has(card.id));
    state.currentTrick = {
      ...combo,
      seat,
      seatName: SEAT_NAMES[seat],
      team: TEAM_OF(seat),
    };
    state.currentLeader = seat;
    state.passesInTrick = 0;
    state.selectedIds = new Set();
    state.currentSeat = nextActiveSeat(seat);
    state.lastActionAt = now();
    state.log.unshift(`${SEAT_POSITIONS[seat]} ${SEAT_NAMES[seat]} 出牌：${combo.text || combo.type}。`);
    updateAlerts();
    if (state.hands[seat].length === 0) finishSeat(seat);
    endRoundIfNeeded();
    return true;
  }

  function passTurn(seat) {
    const state = GD.state;
    if (!state.currentTrick) return false;
    state.passesInTrick += 1;
    state.log.unshift(`${SEAT_POSITIONS[seat]} ${SEAT_NAMES[seat]} 过牌。`);
    if (state.passesInTrick >= 3) {
      const trickLeader = state.currentLeader;
      state.currentTrick = null;
      state.currentLeader = null;
      state.passesInTrick = 0;
      state.currentSeat = trickLeader != null ? trickLeader : nextActiveSeat(seat);
      state.log.unshift('一轮结束，重新由出牌方领出。');
    } else {
      state.currentSeat = NEXT_SEAT(seat);
      while (state.finishedSet.has(state.currentSeat) || state.hands[state.currentSeat].length === 0) {
        state.currentSeat = NEXT_SEAT(state.currentSeat);
      }
    }
    state.selectedIds = new Set();
    state.lastActionAt = now();
    return true;
  }

  function humanCanAct() {
    const state = GD.state;
    return state.active && state.currentSeat === state.humanSeat && !state.pendingRestart;
  }

  function actAI(seat) {
    const state = GD.state;
    if (!state.active || state.pendingRestart) return;
    if (state.finishedSet.has(seat) || state.hands[seat].length === 0) {
      state.currentSeat = nextActiveSeat(seat);
      return;
    }
    const hand = state.hands[seat];
    let combo = null;
    if (!state.currentTrick || state.currentLeader === seat) {
      combo = chooseLeadCombo(hand, state.trumpRank);
    } else {
      combo = chooseResponseCombo(hand, state.currentTrick, seat, state.trumpRank);
      const teammateLead = isSameTeam(seat, state.currentTrick.seat);
      if (!combo && teammateLead) {
        state.log.unshift(`${SEAT_POSITIONS[seat]} ${SEAT_NAMES[seat]} 选择放行同伴。`);
        passTurn(seat);
        return;
      }
      if (!combo && !teammateLead) {
        const dangers = state.alerts.some((a, idx) => a >= 1 && TEAM_OF(idx) !== TEAM_OF(seat));
        if (dangers) {
          const specials = enumeratePlayOptions(hand, state.trumpRank)
            .filter((c) => c.group === 'special')
            .sort((a, b) => a.score - b.score);
          combo = specials[0] || null;
        }
      }
    }

    if (!combo) {
      if (!state.currentTrick) {
        combo = chooseLeadCombo(hand, state.trumpRank);
      }
      if (!combo) {
        passTurn(seat);
        render();
        return;
      }
    }

    playCombo(seat, combo);
    render();
  }

  function humanPlaySelected() {
    const state = GD.state;
    if (!humanCanAct()) return;
    const cards = selectedCardsFromState();
    if (cards.length === 0) {
      toast('请先选择要出的牌。');
      return;
    }
    const combo = buildMoveFromCards(cards, state.trumpRank);
    if (!combo) {
      toast('当前选择不构成合法牌型。');
      return;
    }
    if (state.currentTrick && state.currentLeader !== state.humanSeat && !compareCombo(combo, state.currentTrick)) {
      toast('该牌型无法压过当前牌。');
      return;
    }
    if (state.currentTrick && state.currentLeader === state.humanSeat) {
      // 领出阶段可直接出牌。
    }
    if (!playCombo(state.humanSeat, combo)) {
      toast('出牌失败，请重试。');
      return;
    }
    render();
  }

  function humanPass() {
    const state = GD.state;
    if (!humanCanAct() || !state.currentTrick) {
      toast('当前不能过牌。');
      return;
    }
    passTurn(state.humanSeat);
    render();
  }

  function toast(message, timeout = 1600) {
    const state = GD.state;
    const node = state.dom.toast;
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(() => {
      node.classList.remove('is-visible');
    }, timeout);
  }

  function createStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        flex-direction: column;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 38%),
          linear-gradient(180deg, #13212b 0%, #0a1117 100%);
        color: #eef4fb;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }
      #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} .gd-shell {
        display: grid;
        grid-template-rows: auto 1fr auto;
        width: 100%;
        height: 100%;
        min-height: 0;
      }
      #${ROOT_ID} .gd-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        background: rgba(7, 13, 18, 0.88);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        backdrop-filter: blur(10px);
      }
      #${ROOT_ID} .gd-brand {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      #${ROOT_ID} .gd-brand strong {
        font-size: 18px;
        letter-spacing: 0.08em;
      }
      #${ROOT_ID} .gd-brand span {
        font-size: 12px;
        color: rgba(238,244,251,0.72);
      }
      #${ROOT_ID} .gd-top-actions,
      #${ROOT_ID} .gd-badges { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      #${ROOT_ID} .gd-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 11px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.08);
        color: #eef4fb;
        white-space: nowrap;
        font-size: 13px;
      }
      #${ROOT_ID} .gd-chip b { color: #f6c453; }
      #${ROOT_ID} .gd-main {
        display: grid;
        grid-template-columns: minmax(200px, 280px) minmax(0, 1fr) minmax(220px, 320px);
        gap: 14px;
        padding: 14px;
        min-height: 0;
      }
      #${ROOT_ID} .gd-panel {
        background: rgba(9, 14, 21, 0.74);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        backdrop-filter: blur(12px);
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.24);
      }
      #${ROOT_ID} .gd-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #${ROOT_ID} .gd-panel-header h2 { margin: 0; font-size: 14px; letter-spacing: 0.08em; }
      #${ROOT_ID} .gd-panel-body { padding: 12px 14px; }
      #${ROOT_ID} .gd-seat-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      #${ROOT_ID} .gd-seat-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 142px;
        padding: 12px;
        border-radius: 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
      }
      #${ROOT_ID} .gd-seat-card.is-current { outline: 2px solid rgba(246,196,83,0.75); }
      #${ROOT_ID} .gd-seat-card.is-finished { opacity: 0.55; }
      #${ROOT_ID} .gd-seat-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      #${ROOT_ID} .gd-seat-name { font-weight: 800; }
      #${ROOT_ID} .gd-seat-meta { font-size: 12px; color: rgba(238,244,251,0.72); line-height: 1.6; }
      #${ROOT_ID} .gd-seat-hand {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-content: flex-start;
        min-height: 64px;
      }
      #${ROOT_ID} .gd-mini-card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        padding: 6px 7px;
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(233,241,252,0.88));
        color: #17212b;
        font-weight: 800;
        font-size: 12px;
        box-shadow: 0 10px 18px rgba(0,0,0,0.12);
      }
      #${ROOT_ID} .gd-mini-card.is-wild { color: #8b1d2c; border: 1px solid rgba(139,29,44,0.32); }
      #${ROOT_ID} .gd-center {
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: 14px;
        min-height: 0;
      }
      #${ROOT_ID} .gd-table {
        position: relative;
        min-height: 0;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: 12px;
        padding: 18px;
        border-radius: 22px;
        background:
          radial-gradient(circle at center, rgba(255,255,255,0.12), transparent 50%),
          linear-gradient(180deg, rgba(46,68,55,0.88), rgba(18,33,24,0.92));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 30px 72px rgba(0,0,0,0.3) inset, 0 20px 40px rgba(0,0,0,0.18);
      }
      #${ROOT_ID} .gd-center-status {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      #${ROOT_ID} .gd-stat {
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.06);
        font-size: 13px;
        line-height: 1.6;
      }
      #${ROOT_ID} .gd-stat strong { color: #f6c453; }
      #${ROOT_ID} .gd-trick {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        min-height: 130px;
        border-radius: 18px;
        background: rgba(0,0,0,0.18);
        border: 1px dashed rgba(255,255,255,0.12);
      }
      #${ROOT_ID} .gd-trick-card {
        min-width: 46px;
        padding: 8px 10px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(231,239,250,0.9));
        color: #17212b;
        font-weight: 900;
        box-shadow: 0 14px 24px rgba(0,0,0,0.18);
      }
      #${ROOT_ID} .gd-trick-card.wild { color: #8b1d2c; }
      #${ROOT_ID} .gd-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      #${ROOT_ID} .gd-btn {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 11px 14px;
        font-weight: 800;
        cursor: pointer;
        transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;
      }
      #${ROOT_ID} .gd-btn:hover { transform: translateY(-1px); }
      #${ROOT_ID} .gd-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
      #${ROOT_ID} .gd-btn.primary { background: linear-gradient(135deg, #f6c453, #d89d1e); color: #171717; }
      #${ROOT_ID} .gd-btn.ghost { background: rgba(255,255,255,0.08); color: #eef4fb; border: 1px solid rgba(255,255,255,0.1); }
      #${ROOT_ID} .gd-btn.danger { background: rgba(239,68,68,0.95); color: white; }
      #${ROOT_ID} .gd-log {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 100%;
        overflow: auto;
      }
      #${ROOT_ID} .gd-log-item {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.05);
        font-size: 13px;
        line-height: 1.55;
        color: rgba(238,244,251,0.9);
      }
      #${ROOT_ID} .gd-hand-wrap {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(9, 14, 21, 0.78);
        border: 1px solid rgba(255,255,255,0.08);
      }
      #${ROOT_ID} .gd-hand-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        color: rgba(238,244,251,0.8);
        font-size: 13px;
      }
      #${ROOT_ID} .gd-hand {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        min-height: 84px;
      }
      #${ROOT_ID} .gd-hand-card {
        position: relative;
        min-width: 54px;
        padding: 10px 11px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(233,241,252,0.92));
        color: #17212b;
        border: 2px solid transparent;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 14px 26px rgba(0,0,0,0.16);
        transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
      }
      #${ROOT_ID} .gd-hand-card:hover { transform: translateY(-2px); }
      #${ROOT_ID} .gd-hand-card.selected {
        transform: translateY(-10px) scale(1.02);
        border-color: #f6c453;
        box-shadow: 0 18px 28px rgba(246,196,83,0.22);
      }
      #${ROOT_ID} .gd-hand-card.wild { color: #8b1d2c; }
      #${ROOT_ID} .gd-hand-empty {
        padding: 24px 16px;
        text-align: center;
        color: rgba(238,244,251,0.62);
        border: 1px dashed rgba(255,255,255,0.08);
        border-radius: 14px;
      }
      #${ROOT_ID} .gd-toast {
        position: fixed;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        z-index: 1000;
        display: none;
        max-width: min(92vw, 560px);
        padding: 11px 16px;
        border-radius: 999px;
        background: rgba(11,18,31,0.94);
        color: #eef4fb;
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 18px 40px rgba(0,0,0,0.28);
        text-align: center;
        font-size: 13px;
      }
      #${ROOT_ID} .gd-toast.show { display: block; }
      #${ROOT_ID} .gd-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px 14px;
        border-top: 1px solid rgba(255,255,255,0.06);
        background: rgba(7,13,18,0.62);
      }
      #${ROOT_ID} .gd-footer .gd-footer-left,
      #${ROOT_ID} .gd-footer .gd-footer-right { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      @media (max-width: 1200px) {
        #${ROOT_ID} .gd-main { grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); }
        #${ROOT_ID} .gd-right-panel { grid-column: 1 / -1; }
      }
      @media (max-width: 860px) {
        #${ROOT_ID} .gd-main { grid-template-columns: 1fr; }
        #${ROOT_ID} .gd-seat-list { grid-template-columns: 1fr; }
      }
      @media (max-width: 520px) {
        #${ROOT_ID} .gd-topbar { flex-direction: column; align-items: stretch; }
        #${ROOT_ID} .gd-top-actions { justify-content: flex-start; }
        #${ROOT_ID} .gd-footer { flex-direction: column; align-items: stretch; }
      }
    `;
    document.head.appendChild(style);
    GD.state.styleNode = style;
  }

  function createRoot() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="gd-shell">
        <header class="gd-topbar">
          <div class="gd-brand">
            <strong>掼蛋娱乐模式</strong>
            <span>完全独立 · 零污染 · 热插拔 · 本地 1 对 3 AI</span>
          </div>
          <div class="gd-badges" aria-live="polite">
            <span class="gd-chip">局数 <b id="gd-round">1</b></span>
            <span class="gd-chip">主牌 <b id="gd-trump">2</b></span>
            <span class="gd-chip">当前出牌 <b id="gd-current-seat">玩家</b></span>
            <span class="gd-chip">警报 <b id="gd-alert">-</b></span>
          </div>
          <div class="gd-top-actions">
            <button class="gd-btn ghost" id="${BTN_SORT_ID}" type="button">整理手牌</button>
            <button class="gd-btn danger" id="${BTN_RETURN_ID}" type="button">返回主页</button>
          </div>
        </header>

        <main class="gd-main">
          <aside class="gd-panel gd-left-panel">
            <div class="gd-panel-header"><h2>四方座位</h2><span class="gd-chip" id="gd-team-tip">阵营：A组 / B组</span></div>
            <div class="gd-panel-body">
              <div class="gd-seat-list" id="gd-seat-list"></div>
            </div>
          </aside>

          <section class="gd-center">
            <div class="gd-table gd-panel">
              <div class="gd-center-status">
                <div class="gd-stat"><strong>当前轮次：</strong><span id="gd-round-info">第 1 局</span><br><strong>状态：</strong><span id="gd-phase-info">等待发牌</span></div>
                <div class="gd-stat"><strong>当前牌型：</strong><span id="gd-trick-info">—</span><br><strong>领先者：</strong><span id="gd-leader-info">—</span></div>
              </div>
              <div class="gd-trick" id="gd-trick"></div>
              <div class="gd-actions">
                <button class="gd-btn primary" id="${BTN_PLAY_ID}" type="button">出牌</button>
                <button class="gd-btn ghost" id="${BTN_PASS_ID}" type="button">过牌</button>
                <button class="gd-btn ghost" id="${BTN_RESTART_ID}" type="button">重新开始</button>
              </div>
            </div>

            <div class="gd-hand-wrap">
              <div class="gd-hand-title">
                <span>玩家手牌（Seat 0 / 南）</span>
                <span id="gd-hand-hint">点击牌面可多选</span>
              </div>
              <div class="gd-hand" id="gd-player-hand"></div>
            </div>
          </section>

          <aside class="gd-panel gd-right-panel">
            <div class="gd-panel-header"><h2>对局日志 / 计分</h2><span class="gd-chip" id="gd-score">A组 0 : 0 B组</span></div>
            <div class="gd-panel-body">
              <div class="gd-log" id="gd-log"></div>
            </div>
          </aside>
        </main>

        <footer class="gd-footer">
          <div class="gd-footer-left">
            <span class="gd-chip">玩家 <b>Seat 0</b></span>
            <span class="gd-chip">AI 下家 <b>Seat 1</b></span>
            <span class="gd-chip">AI 对家 <b>Seat 2</b></span>
            <span class="gd-chip">AI 上家 <b>Seat 3</b></span>
          </div>
          <div class="gd-footer-right">
            <span class="gd-chip">独立容器 <b>#${ROOT_ID}</b></span>
          </div>
        </footer>
      </div>
      <div class="gd-toast" id="gd-toast"></div>
    `;
    return root;
  }

  function refreshGlobals() {
    const state = GD.state;
    state.dom = {
      root: state.root,
      seatList: state.root.querySelector('#gd-seat-list'),
      playerHand: state.root.querySelector('#gd-player-hand'),
      trick: state.root.querySelector('#gd-trick'),
      log: state.root.querySelector('#gd-log'),
      toast: state.root.querySelector('#gd-toast'),
      round: state.root.querySelector('#gd-round'),
      trump: state.root.querySelector('#gd-trump'),
      currentSeat: state.root.querySelector('#gd-current-seat'),
      alert: state.root.querySelector('#gd-alert'),
      roundInfo: state.root.querySelector('#gd-round-info'),
      phaseInfo: state.root.querySelector('#gd-phase-info'),
      trickInfo: state.root.querySelector('#gd-trick-info'),
      leaderInfo: state.root.querySelector('#gd-leader-info'),
      score: state.root.querySelector('#gd-score'),
      playBtn: state.root.querySelector(`#${BTN_PLAY_ID}`),
      passBtn: state.root.querySelector(`#${BTN_PASS_ID}`),
      returnBtn: state.root.querySelector(`#${BTN_RETURN_ID}`),
      sortBtn: state.root.querySelector(`#${BTN_SORT_ID}`),
      restartBtn: state.root.querySelector(`#${BTN_RESTART_ID}`),
      teamTip: state.root.querySelector('#gd-team-tip'),
    };
  }

  function seatLabel(seat) {
    return `${SEAT_POSITIONS[seat]} · ${SEAT_NAMES[seat]}`;
  }

  function renderSeatCard(seat) {
    const state = GD.state;
    const hand = state.hands[seat];
    const current = seat === state.currentSeat;
    const finished = state.finishedSet.has(seat) || hand.length === 0;
    const trickSeat = state.currentTrick?.seat;
    const lead = trickSeat === seat;
    const handPreview = sortHand(hand, state.trumpRank).slice(0, 10);
    const alert = state.alerts[seat];
    const cardsHtml = handPreview.length
      ? handPreview.map((card) => `<span class="gd-mini-card ${isWild(card, state.trumpRank) ? 'is-wild' : ''}">${displayCard(card, state.trumpRank)}</span>`).join('')
      : '<div class="gd-seat-meta">已无手牌</div>';
    return `
      <div class="gd-seat-card ${current ? 'is-current' : ''} ${finished ? 'is-finished' : ''}">
        <div class="gd-seat-head">
          <div class="gd-seat-name">${seatLabel(seat)}</div>
          <span class="gd-chip">${TEAM_NAME[TEAM_OF(seat)]}</span>
        </div>
        <div class="gd-seat-meta">
          <div>剩余：${hand.length} 张 ${alert === 2 ? '｜<b style="color:#ef4444">报子！</b>' : alert === 1 ? '｜<b style="color:#f6c453">警报</b>' : ''}</div>
          <div>状态：${finished ? '已出完' : current ? '轮到出牌' : lead ? '当前领先' : '等待轮次'}</div>
        </div>
        <div class="gd-seat-hand">${cardsHtml}</div>
      </div>
    `;
  }

  function renderLog() {
    const state = GD.state;
    const items = state.log.slice(0, 10).map((line) => `<div class="gd-log-item">${line}</div>`).join('');
    state.dom.log.innerHTML = items || '<div class="gd-log-item">暂无记录</div>';
  }

  function renderTrick() {
    const state = GD.state;
    const trick = state.currentTrick;
    if (!trick) {
      state.dom.trick.innerHTML = '<div class="gd-stat" style="min-width:240px;text-align:center;">当前无牌桌，等待领出。</div>';
      state.dom.trickInfo.textContent = '—';
      state.dom.leaderInfo.textContent = '—';
      return;
    }
    state.dom.trick.innerHTML = trick.cards.map((card) => `<div class="gd-trick-card ${isWild(card, state.trumpRank) ? 'wild' : ''}">${displayCard(card, state.trumpRank)}</div>`).join('');
    state.dom.trickInfo.textContent = `${trick.text || trick.type} / ${trick.cards.length} 张`;
    state.dom.leaderInfo.textContent = seatLabel(trick.seat);
  }

  function renderHand() {
    const state = GD.state;
    const cards = sortHand(state.hands[state.humanSeat], state.trumpRank);
    if (!cards.length) {
      state.dom.playerHand.innerHTML = '<div class="gd-hand-empty">手牌已清空，等待下一局。</div>';
      return;
    }
    state.dom.playerHand.innerHTML = cards.map((card) => `
      <button type="button" class="gd-hand-card ${state.selectedIds.has(card.id) ? 'selected' : ''} ${isWild(card, state.trumpRank) ? 'wild' : ''}" data-card-id="${card.id}">
        ${displayCard(card, state.trumpRank)}
      </button>
    `).join('');
  }

  function renderSeats() {
    const state = GD.state;
    state.dom.seatList.innerHTML = [0, 1, 2, 3].map(renderSeatCard).join('');
  }

  function renderTop() {
    const state = GD.state;
    state.dom.round.textContent = String(state.round);
    state.dom.trump.textContent = rankLabel(state.trumpRank);
    state.dom.currentSeat.textContent = seatLabel(state.currentSeat);
    const maxAlert = Math.max(...state.alerts);
    state.dom.alert.textContent = maxAlert === 2 ? '报子中' : maxAlert === 1 ? '压牌中' : '平稳';
    state.dom.roundInfo.textContent = `第 ${state.round} 局 / 当前主牌 ${rankLabel(state.trumpRank)}`;
    state.dom.phaseInfo.textContent = state.pendingRestart ? '结算中' : state.currentTrick ? '跟牌中' : '领出阶段';
    state.dom.score.textContent = `${TEAM_NAME[0]} ${state.scores[0]} : ${state.scores[1]} ${TEAM_NAME[1]}`;
  }

  function renderButtons() {
    const state = GD.state;
    const canAct = humanCanAct();
    const canPass = canAct && !!state.currentTrick;
    state.dom.playBtn.disabled = !canAct;
    state.dom.passBtn.disabled = !canPass;
    state.dom.sortBtn.disabled = !state.active;
    state.dom.restartBtn.disabled = !state.active;
  }

  function render() {
    const state = GD.state;
    if (!state.root) return;
    renderTop();
    renderSeats();
    renderTrick();
    renderHand();
    renderLog();
    renderButtons();
  }

  function bindDOMEvents() {
    const state = GD.state;
    const { root } = state;
    if (!root) return;
    const playerHand = state.dom.playerHand;
    const onClickHand = (e) => {
      const btn = e.target.closest('.gd-hand-card');
      if (!btn || !humanCanAct()) return;
      const id = btn.getAttribute('data-card-id');
      if (!id) return;
      if (state.selectedIds.has(id)) state.selectedIds.delete(id);
      else state.selectedIds.add(id);
      renderHand();
    };
    playerHand.addEventListener('click', onClickHand);
    state.listeners.push(() => playerHand.removeEventListener('click', onClickHand));

    const onPlay = () => humanPlaySelected();
    const onPass = () => humanPass();
    const onReturn = () => destroyGame();
    const onSort = () => {
      state.hands[state.humanSeat] = sortHand(state.hands[state.humanSeat], state.trumpRank);
      toast('已整理手牌。');
      render();
    };
    const onRestart = () => {
      state.round = 1;
      state.trumpRank = 15;
      state.leadSeat = 0;
      state.currentSeat = 0;
      state.currentTrick = null;
      state.currentLeader = null;
      state.passesInTrick = 0;
      state.finishedSeats = [];
      state.finishedSet = new Set();
      state.log = ['已重新开始。'];
      state.scores = [0, 0];
      state.tributePlan = null;
      dealCards();
      render();
      toast('已重新开始。');
    };

    state.dom.playBtn.addEventListener('click', onPlay);
    state.dom.passBtn.addEventListener('click', onPass);
    state.dom.returnBtn.addEventListener('click', onReturn);
    state.dom.sortBtn.addEventListener('click', onSort);
    state.dom.restartBtn.addEventListener('click', onRestart);

    state.listeners.push(() => state.dom.playBtn.removeEventListener('click', onPlay));
    state.listeners.push(() => state.dom.passBtn.removeEventListener('click', onPass));
    state.listeners.push(() => state.dom.returnBtn.removeEventListener('click', onReturn));
    state.listeners.push(() => state.dom.sortBtn.removeEventListener('click', onSort));
    state.listeners.push(() => state.dom.restartBtn.removeEventListener('click', onRestart));
  }

  function gameLoop() {
    const state = GD.state;
    if (!state.active || state.pendingRestart) return;
    if (state.currentSeat === state.humanSeat) return;
    if (state.aiBusy) return;
    if (now() < state.aiDelayUntil) return;
    state.aiBusy = true;
    try {
      actAI(state.currentSeat);
    } finally {
      state.aiBusy = false;
    }
  }

  function startLoop() {
    const state = GD.state;
    clearInterval(state.loopTimer);
    state.loopTimer = setInterval(gameLoop, 420);
  }

  function showSelection() {
    const selection = document.getElementById('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'flex';
    if (app) app.style.display = 'none';
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function initGame() {
    const state = GD.state;
    if (state.active) return;
    createStyle();
    const gameSelection = document.getElementById('game-selection');
    const app = document.querySelector('.app');
    if (gameSelection) gameSelection.style.display = 'none';
    if (app) app.style.display = 'none';
    const root = createRoot();
    const insertBeforeNode = document.querySelector('.app') || document.body.firstElementChild;
    document.body.insertBefore(root, insertBeforeNode || null);
    state.root = root;
    refreshGlobals();
    bindDOMEvents();
    state.active = true;
    state.log = ['掼蛋沙箱启动。'];
    dealCards();
    render();
    startLoop();
    state.aiDelayUntil = now() + 700;
    toast('掼蛋模式已启动。');
  }

  function cleanupListeners() {
    const state = GD.state;
    while (state.listeners.length) {
      const fn = state.listeners.pop();
      try { fn(); } catch (_) { /* noop */ }
    }
  }

  function destroyGame() {
    const state = GD.state;
    clearInterval(state.loopTimer);
    clearTimeout(state._toastTimer);
    state.loopTimer = null;
    state.aiBusy = false;
    state.pendingRestart = false;
    state.active = false;
    cleanupListeners();
    if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    if (state.styleNode && state.styleNode.parentNode) state.styleNode.parentNode.removeChild(state.styleNode);
    state.root = null;
    state.styleNode = null;
    GD.state = initialState();
    const selection = document.getElementById('game-selection');
    const app = document.querySelector('.app');
    if (selection) selection.style.display = 'flex';
    if (app) app.style.display = 'none';
    const btn = document.getElementById('go-guandan-btn');
    if (btn) btn.disabled = false;
  }

  function wireEntrances() {
    const btn = document.getElementById('go-guandan-btn');
    if (!btn) return;
    if (btn.dataset.gdBound === '1') return;
    const handler = () => initGame();
    btn.addEventListener('click', handler);
    btn.dataset.gdBound = '1';
    GD.__removeEntrance = () => btn.removeEventListener('click', handler);
  }

  function boot() {
    wireEntrances();
    const state = GD.state;
    if (state.root && state.active) render();
  }

  document.addEventListener('DOMContentLoaded', boot, { once: true });
  if (document.readyState !== 'loading') boot();

  GD.init = initGame;
  GD.destroy = destroyGame;
  GD.render = render;
  GD.reset = () => {
    destroyGame();
    wireEntrances();
  };
})();
