import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load,guandan,go} from './legacy-harness.mjs';

test('advisory clock counts only active turn, pauses background and resets sessions',()=>{
  const context=sandbox();load('ui/match.js',context);let now=0;
  const clock=context.NobiMatchView.createClock(()=>now);
  clock.update({key:'a',turn:'black',active:true});now=5000;
  expect(clock.update({key:'a',turn:'white',active:true})).toEqual({black:5,white:0});now=8000;
  expect(clock.update({key:'a',turn:'white',active:false})).toEqual({black:5,white:3});now=20000;
  expect(clock.update({key:'a',turn:'black',active:true})).toEqual({black:5,white:3});
  expect(clock.update({key:'b',turn:'black',active:true})).toEqual({black:0,white:0});
  expect(context.NobiMatchView.formatTime(125)).toBe('02:05');
  expect(context.NobiMatchView.coordinate({row:9,col:9})).toBe('K10');
});

test('Guandan suggestions pass existing rules and never mutate or submit cards',()=>{
  const {context,api}=guandan();const hints=load('guandan-game.js',context,'state,hintCards,typeOf,beats');
  const hands=context.GD.createNetworkDeal(),seats=[0,1,2,3].map(i=>({uid:'u'+i,nickname:'p'+i}));
  context.GD.startNetworkGame(hands,seats,0,0,()=>{});
  const before=hints.state.players[0].hand.map(c=>c.id);
  const suggestion=hints.hintCards();expect(suggestion.length).toBeGreaterThan(0);expect(hints.typeOf(suggestion)).not.toBeNull();
  expect(hints.state.players[0].hand.map(c=>c.id)).toEqual(before);
  hints.state.trick={type:'天王炸',weight:9999,size:4};
  const follow=hints.hintCards();expect(follow.length===0 || hints.beats(hints.typeOf(follow),hints.state.trick)).toBe(true);
  hints.state.currentTurn=1;expect(hints.hintCards()).toHaveLength(0);
});

test('Go view is cloned and local journal resets without changing original board rules',()=>{
  const {context,api}=go();api.state.viewMoves=[{row:9,col:9,color:1,number:1}];
  const view=context.MP.getViewState();view.moves[0].row=0;
  expect(api.state.viewMoves[0].row).toBe(9);api.startAIGame();
  expect(context.MP.getViewState().moves).toHaveLength(0);expect(api.state.board.flat().every(v=>v===0)).toBe(true);
});

test('exiting Go cancels an outstanding AI response before it can mutate the old game',async()=>{
  const jobs=new Map();let nextId=0;
  const context=sandbox({setTimeout:fn=>{const id=++nextId;jobs.set(id,fn);return id;},clearTimeout:id=>jobs.delete(id)});
  const api=load('multiplayer-ext.js',context,'state,startAIGame,handleMultiplayerMove,leaveRoom');
  api.startAIGame();await api.handleMultiplayerMove(9,9);
  expect(jobs.size).toBeGreaterThan(0);
  await api.leaveRoom();
  for(const fn of jobs.values()) fn();
  expect(api.state.board.flat().filter(v=>v!==0)).toHaveLength(1);
});

test('Go touch preview and cancellation never mutate the board; confirmation commits once',async()=>{
  const context=sandbox();
  const api=load('multiplayer-ext.js',context,'state,startAIGame,previewPoint,confirmPreview,cancelPreview');
  api.startAIGame();
  const before=JSON.stringify(api.state.board);
  expect(api.previewPoint(9,9)).toBe(true);
  expect(JSON.stringify(api.state.board)).toBe(before);
  const view=context.MP.getViewState();view.preview.row=0;
  expect(api.state.previewMove.row).toBe(9);
  api.cancelPreview();await api.confirmPreview();
  expect(JSON.stringify(api.state.board)).toBe(before);
  expect(api.previewPoint(-1,9)).toBe(false);
  api.previewPoint(9,9);await api.confirmPreview();await api.confirmPreview();
  expect(api.state.board.flat().filter(Boolean)).toHaveLength(1);
  expect(api.state.currentTurn).toBe('white');
  expect(api.previewPoint(10,10)).toBe(false);
});

test('Go solo undo restores captures, ko and journal and cancels the pending AI job',async()=>{
  const jobs=new Map();let nextId=0;
  const context=sandbox({setTimeout:fn=>{const id=++nextId;jobs.set(id,fn);return id;},clearTimeout:id=>jobs.delete(id)});
  const api=load('multiplayer-ext.js',context,'state,startAIGame,handleMultiplayerMove,undoSoloTurn');
  api.startAIGame();
  api.state.board[1][1]=2;
  for(const [r,c] of [[0,1],[1,0],[1,2]]) api.state.board[r][c]=1;
  api.state.blackCaptures=4;api.state.whiteCaptures=3;context.state.koPoint={row:8,col:8};
  const before=JSON.stringify(api.state.board);
  await api.handleMultiplayerMove(2,1);
  expect(api.state.blackCaptures).toBe(5);expect(jobs.size).toBe(1);
  expect(api.undoSoloTurn()).toBe(true);expect(jobs.size).toBe(0);
  expect(JSON.stringify(api.state.board)).toBe(before);
  expect([api.state.blackCaptures,api.state.whiteCaptures]).toEqual([4,3]);
  expect(context.state.koPoint).toEqual({row:8,col:8});
  expect(context.MP.getViewState().moves).toHaveLength(0);expect(api.state.currentTurn).toBe('black');
  expect(api.undoSoloTurn()).toBe(false);
});

test('Go undo after an AI reply restores one full turn and is unavailable in network mode',async()=>{
  const context=sandbox();
  const api=load('multiplayer-ext.js',context,'state,startAIGame,handleMultiplayerMove,triggerAIMove,undoSoloTurn');
  api.startAIGame();await api.handleMultiplayerMove(9,9);api.triggerAIMove();
  const first=JSON.stringify(api.state.board);
  const row=api.state.board.findIndex(r=>r.includes(0));const col=api.state.board[row].indexOf(0);
  await api.handleMultiplayerMove(row,col);api.triggerAIMove();
  expect(context.MP.getViewState().moves).toHaveLength(4);
  expect(api.undoSoloTurn()).toBe(true);expect(JSON.stringify(api.state.board)).toBe(first);
  expect(context.MP.getViewState().moves).toHaveLength(2);
  api.state.gameMode='MULTIPLAYER';
  expect(api.undoSoloTurn()).toBe(false);expect(context.MP.getViewState().canUndo).toBe(false);
});

test('Go ended game clears preview and rejects further moves, AI and undo until a new solo game',async()=>{
  const context=sandbox();
  const api=load('multiplayer-ext.js',context,'state,startAIGame,previewPoint,showGameOverOverlay,handleMultiplayerMove,triggerAIMove,undoSoloTurn');
  api.startAIGame();api.previewPoint(9,9);api.showGameOverOverlay('white','resign');
  expect(context.MP.getViewState()).toMatchObject({ended:true,preview:null,canUndo:false});
  await api.handleMultiplayerMove(9,9);api.state.currentTurn='white';api.triggerAIMove();
  expect(api.state.board.flat().filter(Boolean)).toHaveLength(0);
  expect(api.undoSoloTurn()).toBe(false);
  api.startAIGame();expect(context.MP.getViewState().ended).toBe(false);
});
