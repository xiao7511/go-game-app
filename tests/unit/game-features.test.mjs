import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';

const empty=()=>Array.from({length:19},()=>Array(19).fill(0));
function analysis(){const context=sandbox();load('ui/go-analysis.js',context);return context.NobiGoAnalysis;}

test('area count adds stones and single-colour regions with komi; shared regions stay neutral',()=>{
  const go=analysis();const board=empty();
  for(let r=0;r<19;r++){board[r][9]=1;board[r][10]=2;}
  const score=go.areaScore(board);
  expect(score).toMatchObject({blackStones:19,whiteStones:19,blackArea:171,whiteArea:152,neutral:0,komi:7.5});
  expect(score.black).toBe(190);expect(score.white).toBe(178.5);expect(score.winner).toBe('black');
  const open=go.areaScore((()=>{const b=empty();b[3][3]=1;b[15][15]=2;return b;})());
  expect(open.neutral).toBe(359);expect(open.winner).toBe('white');
});

test('estimate keeps board immutable, marks enclosed areas and counts atari stones inside enemy influence as dead',()=>{
  const go=analysis();const board=empty();
  for(const [r,c] of [[0,2],[1,2],[2,2],[2,1],[2,0]]) board[r][c]=1;
  const snapshot=JSON.stringify(board);const result=go.estimate(board);
  expect(JSON.stringify(board)).toBe(snapshot);
  expect(result.owner[0][0]).toBe(1);expect(result.owner[1][1]).toBe(1);
  const dead=empty();for(const [r,c] of [[3,4],[4,3],[5,4],[3,3],[3,5],[5,3],[5,5],[4,6],[2,4],[6,4]]) dead[r][c]=1;dead[4][4]=2;
  expect(go.estimate(dead).dead.white).toBe(1);
});

test('casual AI captures when possible, saves its own atari group and never fills its own eye',()=>{
  const go=analysis();const random=()=>0;
  const capture=empty();capture[4][4]=1;capture[3][4]=2;capture[5][4]=2;capture[4][3]=2;
  expect(go.chooseMove(capture,2,null,random)).toMatchObject({row:4,col:5});
  const rescue=empty();rescue[0][0]=2;rescue[1][0]=1;
  expect(go.chooseMove(rescue,2,null,random)).toMatchObject({row:0,col:1});
  const eyes=empty();for(let r=0;r<19;r++)for(let c=0;c<19;c++)eyes[r][c]=2;eyes[0][0]=0;eyes[18][18]=0;
  expect(go.chooseMove(eyes,2,null,random)).toBeNull();
  expect(go.simulate(capture,4,5,2,null).captured).toBe(1);
  expect(go.simulate(capture,4,5,2,{row:4,col:5})).toBeNull();
});

test('single-player count ends the local game with an area result and is unavailable online',()=>{
  const context=sandbox();load('ui/go-analysis.js',context);
  context.confirm=()=>true;
  const api=load('multiplayer-ext.js',context,'state,startAIGame');
  api.startAIGame();api.state.board[3][3]=1;
  const score=context.MP.scoreSoloGame();
  expect(score).toMatchObject({winner:'black',black:361,white:7.5});expect(context.MP.getViewState()).toMatchObject({ended:true,blackCaptures:0});
  expect(context.MP.scoreSoloGame()).toBeNull();
  api.state.gameMode='MULTIPLAYER';api.state.matchEnded=false;expect(context.MP.scoreSoloGame()).toBeNull();
});

function guandanRound(order){
  const context=sandbox();
  const api=load('guandan-game.js',context,'state,makeDeck,checkGameOver,cardCounter,get order(){return finishOrder},set order(v){finishOrder=v}');
  const deck=api.makeDeck();
  api.state.players=[0,1,2,3].map(id=>({id,name:'p'+id,team:id%2,hand:deck.slice(id*27,id*27+27),rankOutOrder:null}));
  api.order=[];order.forEach((seat,i)=>{api.state.players[seat].hand=[];api.state.players[seat].rankOutOrder=i+1;api.order.push(seat);});
  api.state.teamLevels=[0,0];api.state.currentRankIndex=0;api.state.active=true;
  return api;
}

test('Guandan upgrades by partner place (3/2/1), tracks both teams and fills all four places',()=>{
  const sweep=guandanRound([0,2]);expect(sweep.checkGameOver()).toBe(true);
  expect([...sweep.state.teamLevels]).toEqual([3,0]);expect(sweep.state.currentRankIndex).toBe(3);
  expect(sweep.state.players.map(p=>p.rankOutOrder).sort()).toEqual([1,2,3,4]);
  const third=guandanRound([1,0,3]);third.checkGameOver();
  expect([...third.state.teamLevels]).toEqual([0,2]);expect(third.state.currentRankIndex).toBe(2);
  const last=guandanRound([0,1,3]);last.checkGameOver();
  expect([...last.state.teamLevels]).toEqual([1,0]);expect(last.state.players[2].rankOutOrder).toBe(4);
  const ongoing=guandanRound([0]);expect(ongoing.checkGameOver()).toBe(false);
});

test('Guandan card counter subtracts own hand and played cards from two decks',()=>{
  const api=guandanRound([]);api.state.currentRankIndex=0;
  const all=api.state.players.flatMap(p=>p.hand);
  const jokers=all.filter(c=>c.label==='大王');const aces=all.filter(c=>c.rank==='A').slice(0,3);
  api.state.players[0].hand=[jokers[0],aces[0]];api.state.playedCards.clear();
  for(const card of aces.slice(1)) api.state.playedCards.set(card.id,card);
  expect(api.cardCounter().map(([label,n])=>[label,n])).toEqual([['大王',1],['小王',2],['A',5],['级2',8]]);
});

test('Guandan local turn timer is 30s and prompts are shown in front of the acting seat',()=>{
  const context=sandbox();
  const api=load('guandan-game.js',context,'state,makeDeck,passTurn,seatMessage');
  expect(api.state.countdown).toBe(30);
  const deck=api.makeDeck();
  api.state.players=[0,1,2,3].map(id=>({id,name:'p'+id,team:id%2,hand:deck.slice(id*27,id*27+27),rankOutOrder:null}));
  api.state.active=true;api.state.currentTurn=1;api.state.trick={type:'单张',weight:3,size:1,seat:0,cards:[deck[0]]};
  expect(api.passTurn(1)).toBe(true);
  expect(api.seatMessage(1,api.state.players[1],false)).toMatchObject({text:'不出',kind:'pass'});
  expect(api.seatMessage(2,api.state.players[2],true)).toBeNull();
  api.state.seatActions[3]={text:'对子',kind:'play'};
  expect(api.seatMessage(3,api.state.players[3],false)).toBeNull();
  expect(api.seatMessage(0,api.state.players[0],true).kind).toBe('turn');
  api.state.players[3].rankOutOrder=1;expect(api.seatMessage(3,api.state.players[3],false)).toMatchObject({text:'头游',kind:'done'});
});

test('avatars offer stable presets and only accept image data or https sources',()=>{
  const context=sandbox();load('ui/avatars.js',context);const avatars=context.NobiAvatars;
  expect(avatars.presets).toHaveLength(8);
  expect(avatars.presets.every(p=>p.src.startsWith('data:image/svg+xml'))).toBe(true);
  expect(avatars.forKey('东家')).toBe(avatars.forKey('东家'));
  avatars.setAccountAvatar('javascript:alert(1)');expect(avatars.self('me').startsWith('data:image/svg+xml')).toBe(true);
  avatars.setAccountAvatar('https://example.com/a.png');expect(avatars.self('me')).toBe('https://example.com/a.png');
});
