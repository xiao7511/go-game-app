import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { go, guandan } from './legacy-harness.mjs';

const normal = (rank, suit = 'S', id = rank + suit) => ({ id, kind: 'normal', rank, suit });
test('Go placement, occupied intersection and liberties', () => {
  const { api } = go();
  expect(api.placeStone(5, 5, 1).success).toBe(true);
  expect(api.placeStone(5, 5, 2).success).toBe(false);
  expect(api.bfsLiberties(5, 5, 1, api.state.board).liberties).toBe(4);
});
test('Go captures once and rejects suicide without altering board', () => {
  const { api } = go();
  api.state.board[1][1] = 2;
  [[0,1],[1,0],[1,2]].forEach(([r,c]) => api.state.board[r][c] = 1);
  expect(api.placeStone(2, 1, 1).captured).toBe(1);
  expect(api.state.blackCaptures).toBe(1); expect(api.state.board[1][1]).toBe(0);
  const before = JSON.stringify(api.state.board);
  expect(api.placeStone(1, 1, 2).success).toBe(false);
  expect(JSON.stringify(api.state.board)).toBe(before);
});
test('Go AI capture commits once after side-effect-free candidate evaluation', () => {
  const { api } = go();
  api.startAIGame(); api.state.currentTurn = 'white';
  api.state.board[1][1] = 1;
  [[0,1],[1,0],[1,2]].forEach(([r,c]) => api.state.board[r][c] = 2);
  api.triggerAIMove();
  expect(api.state.whiteCaptures).toBe(1);
  expect(api.state.board[2][1]).toBe(2); expect(api.state.board[1][1]).toBe(0);
  expect(api.state.currentTurn).toBe('black');
});
test('Go switching to solo disconnects old room and ignores its late broadcast', async () => {
  const {api}=go();const events={};let removed=0;
  const channel={on(_t,f,fn){events[f.event]=fn;return this;},subscribe(){return this;}};
  api.state.supabase={channel:()=>channel,removeChannel(){removed++;return Promise.resolve();}};
  api.state.isInRoom=true;
  await api.initRoomChannel('OLDROOM');api.startAIGame();
  await events.move({payload:{row:1,col:1,color:2}});
  expect(api.state.isInRoom).toBe(false);expect(removed).toBe(1);
  expect(api.state.board[1][1]).toBe(0);
});
test('Guandan two decks contain 108 unique identities and original image paths', () => {
  const { api } = guandan(); const deck = api.makeDeck();
  expect(deck).toHaveLength(108); expect(new Set(deck.map(c=>c.id)).size).toBe(108);
  expect(deck.filter(c=>c.kind==='joker')).toHaveLength(4);
  for (const c of deck) expect(api.formatCard(c)).toContain('./images/cards/');
});
test('Guandan existing singles, pairs, triples, bombs and comparison', () => {
  const { api } = guandan();
  expect(api.typeOf([normal('3')]).type).toBe('单张');
  expect(api.typeOf([normal('4'),normal('4','D')]).type).toBe('对子');
  expect(api.typeOf([normal('5'),normal('5','D'),normal('5','C')]).type).toBe('三张');
  const bomb = api.typeOf(['S','D','H','C'].map(s=>normal('7',s)));
  expect(bomb.type).toBe('炸弹'); expect(api.beats(bomb,api.typeOf([normal('A')]))).toBe(true);
  expect(api.beats(api.typeOf([normal('4')]),api.typeOf([normal('3')]))).toBe(true);
  expect(api.typeOf([normal('3'),normal('7')])).toBeNull();
});
test('Guandan existing sequences, consecutive pairs, full house and joker bomb', () => {
  const {api}=guandan();
  expect(api.typeOf(['3','4','5','6','7'].map((r,i)=>normal(r,i%2?'D':'S'))).type).toBe('顺子');
  expect(api.typeOf(['3','4','5','6','7'].map(r=>normal(r,'S'))).type).toBe('同花顺');
  expect(api.typeOf(['3','4','5'].flatMap(r=>[normal(r,'S'),normal(r,'D')])).type).toBe('连对');
  expect(api.typeOf([normal('3','S'),normal('3','D'),normal('4','S'),normal('5','D'),normal('6','S')])).toBeNull();
  expect(api.typeOf([normal('3','S'),normal('3','D'),normal('3','C'),normal('4','S'),normal('4','D')]).type).toBe('三带两');
  expect(api.typeOf([16,16,17,17].map((value,i)=>({id:'j'+i,kind:'joker',value,label:value===16?'小王':'大王',rank:'joker',suit:'J'}))).type).toBe('天王炸');
});
test('Guandan cannot remove foreign cards, act out of turn, or pass without a trick', () => {
  const { api } = guandan();
  api.state.players = [0,1,2,3].map(i=>({ name:'fixture', hand:[normal('3','S','seat'+i),normal('4','D','extra'+i)] }));
  api.state.active=true; api.state.currentTurn=0;
  expect(api.playCards(1,[api.state.players[1].hand[0]])).toBe(false);
  expect(api.playCards(0,[normal('A')])).toBe(false);
  expect(api.passTurn(0)).toBe(false);
  expect(api.state.players[0].hand).toHaveLength(2);
});
