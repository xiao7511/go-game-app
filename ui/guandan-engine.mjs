import { validateDeal } from './guandan-deal.mjs';
import { classify, cardWeight, isWild, ruleConfig, initialSeries, upgradeSeries } from './guandan-rules.mjs';
export class GuandanEngine {
    config;
    series;
    state;
    order = [];
    constructor(hands, series = initialSeries(), config = {}) {
        validateDeal(hands);
        this.config = ruleConfig(config);
        this.series = structuredClone(series);
        this.state = { players: hands.map(hand => ({ hand: structuredClone(hand) })), currentTurn: series.firstLeader ?? 0, trick: null, lastPlayedTrick: null, active: true, passed: [], played: [], phase: 'playing', tribute: null };
        this.prepareTribute();
    }
    prepareTribute() {
        const s = this.state, order = this.series.previousOrder;
        if (!order)
            return;
        const double = order[0] % 2 === order[1] % 2, donors = double ? order.slice(2) : [order[3]], receivers = double ? order.slice(0, 2) : [order[0]];
        const bigCounts = donors.map((i) => s.players[i].hand.filter((c) => c.kind === 'joker' && c.value === 17).length);
        const anti = double ? (this.config.doubleAnti === 'team-two-big-jokers' ? bigCounts.reduce((a, b) => a + b, 0) === 2 : bigCounts.some((n) => n === 2)) : bigCounts[0] === 2;
        if (anti) {
            s.currentTurn = order[0];
            s.tribute = { phase: 'anti', donors, receivers, revealed: donors.flatMap((i) => s.players[i].hand.filter((c) => c.kind === 'joker' && c.value === 17)) };
            return;
        }
        s.phase = 'tribute';
        s.currentTurn = donors[0];
        s.tribute = { phase: 'give', double, donors, receivers, submitted: {}, assignments: [], returned: {} };
    }
    tributeOptions(seat) {
        const t = this.state.tribute;
        if (this.state.phase !== 'tribute')
            return [];
        const hand = this.state.players[seat].hand;
        if (t.phase === 'give' && t.donors.includes(seat) && !t.submitted[seat]) {
            const eligible = hand.filter(c => !isWild(c, this.series.level)), highest = Math.max(...eligible.map(c => cardWeight(c, this.series.level)));
            return eligible.filter(c => cardWeight(c, this.series.level) === highest).map(c => c.id);
        }
        if (t.phase === 'return' && t.receivers.includes(seat) && !t.returned[seat]) {
            const eligible = hand.filter(c => !isWild(c, this.series.level)), low = eligible.filter(c => c.kind === 'normal' && Number(c.rank) <= this.config.returnMax && (!this.config.returnExcludesLevel || c.rank !== this.series.level));
            const lowest = Math.min(...eligible.map(c => cardWeight(c, this.series.level)));
            return (low.length ? low : eligible.filter(c => cardWeight(c, this.series.level) === lowest)).map(c => c.id);
        }
        return [];
    }
    tribute(seat, id) {
        const s = this.state, t = s.tribute;
        if (s.phase !== 'tribute' || s.currentTurn !== seat || !this.tributeOptions(seat).includes(id))
            return false;
        const hand = s.players[seat].hand;
        if (t.phase === 'give') {
            t.submitted[seat] = id;
            const waiting = t.donors.filter((i) => !t.submitted[i]);
            if (waiting.length) {
                s.currentTurn = waiting[0];
                return true;
            }
            const sorted = t.donors.slice().sort((a, b) => cardWeight(s.players[b].hand.find((c) => c.id === t.submitted[b]), this.series.level) - cardWeight(s.players[a].hand.find((c) => c.id === t.submitted[a]), this.series.level));
            if (t.double) {
                const a = s.players[sorted[0]].hand.find((c) => c.id === t.submitted[sorted[0]]), b = s.players[sorted[1]].hand.find((c) => c.id === t.submitted[sorted[1]]);
                if (cardWeight(a, this.series.level) === cardWeight(b, this.series.level)) {
                    const next = (this.series.previousOrder[0] + 1) % 4;
                    sorted.splice(0, 2, next, (next + 2) % 4);
                }
            }
            t.assignments = sorted.map((from, i) => ({ from, to: t.receivers[i], card: s.players[from].hand.find((c) => c.id === t.submitted[from]) }));
            // All tribute commitments are accepted before any received card enters a hand.
            for (const transfer of t.assignments) {
                s.players[transfer.from].hand = s.players[transfer.from].hand.filter((c) => c.id !== transfer.card.id);
                s.players[transfer.to].hand.push(transfer.card);
            }
            t.phase = 'return';
            s.currentTurn = t.receivers[0];
            return true;
        }
        t.returned[seat] = id;
        const waiting = t.receivers.filter((i) => !t.returned[i]);
        if (waiting.length) {
            s.currentTurn = waiting[0];
            return true;
        }
        for (const transfer of t.assignments) {
            const card = s.players[transfer.to].hand.find((c) => c.id === t.returned[transfer.to]);
            s.players[transfer.to].hand = s.players[transfer.to].hand.filter((c) => c.id !== card.id);
            s.players[transfer.from].hand.push(card);
        }
        s.phase = 'playing';
        t.phase = 'complete';
        s.currentTurn = t.assignments[0].from;
        return true;
    }
    publicTribute() {
        const t = this.state.tribute;
        if (!t)
            return null;
        if (t.phase === 'anti')
            return structuredClone(t);
        return { phase: t.phase, double: t.double, donors: t.donors, receivers: t.receivers, submitted: Object.keys(t.submitted).map(Number), returned: Object.keys(t.returned).map(Number), assignments: t.assignments.map((x) => ({ from: x.from, to: x.to, card: x.card })) };
    }
    get api() { return { state: this.state, finishOrder: () => this.order.slice() }; }
    play(seat, ids, declaration = null) {
        const s = this.state;
        if (!s.active || s.phase !== 'playing' || s.currentTurn !== seat || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
            return false;
        const hand = s.players[seat].hand, cards = ids.map(id => hand.find(c => c.id === id));
        if (cards.some(c => !c))
            return false;
        const combo = classify(cards, this.series.level, this.config, s.trick, declaration);
        if (!combo)
            return false;
        s.players[seat].hand = hand.filter(c => !ids.includes(c.id));
        s.played.push(...cards);
        s.trick = { ...combo, seat, cards };
        s.lastPlayedTrick = s.trick;
        s.passed = [];
        if (!s.players[seat].hand.length) {
            this.order.push(seat);
            if (this.order.length === 3) {
                this.order.push([0, 1, 2, 3].find(i => !this.order.includes(i)));
                s.active = false;
                s.phase = 'ended';
                return true;
            }
        }
        s.currentTurn = this.nextSeat(seat);
        return true;
    }
    pass(seat) {
        const s = this.state;
        if (!s.active || s.phase !== 'playing' || s.currentTurn !== seat || !s.trick)
            return false;
        if (!s.passed.includes(seat))
            s.passed.push(seat);
        const outstanding = [0, 1, 2, 3].filter(i => s.players[i].hand.length && i !== s.trick.seat && !s.passed.includes(i));
        if (!outstanding.length) {
            const leader = s.trick.seat, partner = (leader + 2) % 4;
            s.currentTurn = s.players[leader].hand.length ? leader : s.players[partner].hand.length ? partner : this.nextSeat(leader);
            s.trick = null;
            s.passed = [];
        }
        else
            s.currentTurn = this.nextSeat(seat);
        return true;
    }
    nextSeat(seat) { for (let d = 1; d <= 4; d++) {
        const i = (seat + d) % 4;
        if (this.state.players[i].hand.length)
            return i;
    } throw Error('no live seat'); }
    result() { if (this.state.active || this.order.length !== 4)
        throw Error('round incomplete'); return { reason: 'rules-complete', ...upgradeSeries(this.series, this.order, this.config) }; }
    integrity() { const all = [...this.state.players.flatMap((p) => p.hand), ...this.state.played]; return { total: all.length, unique: new Set(all.map(c => c.id)).size }; }
}
