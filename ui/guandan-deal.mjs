import {RANKS} from './guandan-rules.mjs';
export function validateDeal(hands) {
    if (!Array.isArray(hands) || hands.length !== 4 || hands.some(h => !Array.isArray(h) || h.length !== 27))
        throw Error('four 27-card hands required');
    const all = hands.flat(), ids = new Set(), faces = new Map();
    for (const c of all) {
        if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || ids.has(c.id) || ![0, 1].includes(c.deck))
            throw Error('invalid physical card');
        ids.add(c.id);
        if (c.kind === 'normal' && RANKS.includes(c.rank) && ['S', 'H', 'C', 'D'].includes(c.suit) && c.value === RANKS.indexOf(c.rank) + 2) { }
        else if (c.kind === 'joker' && c.suit === 'J' && ((c.value === 16 && c.rank === 'BJ' && c.label === '小王') || (c.value === 17 && c.rank === 'RJ' && c.label === '大王'))) { }
        else
            throw Error('invalid card face');
        const face = c.deck + ':' + c.suit + ':' + c.rank;
        faces.set(face, (faces.get(face) ?? 0) + 1);
    }
    if (ids.size !== 108 || faces.size !== 108 || [...faces.values()].some(n => n !== 1))
        throw Error('incomplete double deck');
}
