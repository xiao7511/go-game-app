import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {createGame,legalMoves,targets,play,inCheck,movedBoard,positionKey,chooseMove} from '../../ui/xiangqi-engine.mjs';
const fixture=(pieces,turn=0)=>{const g=createGame();g.board=Array(90).fill(0);for(const [i,p] of pieces)g.board[i]=p;g.turn=turn;g.positions=[positionKey(g)];return g;};
test('standard 32-piece setup and independently known opening perft: 44 / 1920',()=>{
 const g=createGame();expect(g.board.filter(Boolean)).toHaveLength(32);expect(g.board[19]).toBe(-6);expect(g.board[70]).toBe(6);
 const moves=legalMoves(g);expect(moves).toHaveLength(44);let nodes=0;for(const m of moves)nodes+=legalMoves({board:movedBoard(g.board,m.from,m.to),turn:1,status:'playing'}).length;expect(nodes).toBe(1920);
});
test('horse legs and elephant eyes block moves; elephants stay on their own river side',()=>{
 const g=fixture([[4,-1],[85,1],[49,7],[40,4],[31,7],[58,3],[48,7]]);
 expect(targets(g.board,40)).not.toContain(21);expect(targets(g.board,40)).toContain(51);
 expect(targets(g.board,58)).not.toContain(38);expect(targets(g.board,58)).toContain(74);
 const b=fixture([[4,-1],[85,1],[49,7],[47,3]]).board;expect(targets(b,47).every(i=>Math.floor(i/9)>=5)).toBe(true);
});
test('palace restrictions and pawn crossing never allow a backward move',()=>{
 const g=createGame();expect(targets(g.board,85)).toEqual([76]);expect(targets(g.board,84)).toEqual([76]);
 expect(targets(g.board,54)).toEqual([45]);const b=fixture([[4,-1],[85,1],[40,7]]).board;
 expect(targets(b,40).sort((a,b)=>a-b)).toEqual([31,39,41]);expect(targets(b,40)).not.toContain(49);
});
test('cannons need exactly one screen when capturing and none when moving',()=>{
 const g=createGame();expect(targets(g.board,64)).toContain(1);expect(targets(g.board,64)).not.toContain(19);
 const b=fixture([[4,-1],[85,1],[49,7],[64,6],[37,-7],[19,-4],[1,-5]]).board;
 expect(targets(b,64)).toContain(19);expect(targets(b,64)).not.toContain(1);expect(targets(b,64)).not.toContain(28);
});
test('moves cannot expose facing generals, ignore check, capture a friendly piece or take the general',()=>{
 const g=fixture([[4,-1],[85,1],[49,5],[54,7]]);expect(()=>play(g,49,48)).toThrow();
 const checked=fixture([[4,-1],[85,1],[49,7],[76,-5],[54,7]]);expect(inCheck(checked.board,0)).toBe(true);expect(()=>play(checked,54,45)).toThrow();
 expect(()=>play(createGame(),81,82)).toThrow();expect(()=>play(createGame(),-1,4)).toThrow();expect(()=>play(createGame(),54,45.5)).toThrow();
 const attack=fixture([[4,-1],[85,1],[49,5]]);expect(legalMoves(attack).some(m=>m.to===4)).toBe(false);
});
test('checkmate and stalemate both lose, with the correct result reason',()=>{
 const mate=play(fixture([[4,-1],[85,1],[49,7],[14,5],[9,5]]),9,0);expect(mate.result).toEqual({winner:0,reason:'checkmate'});expect(legalMoves(mate)).toEqual([]);
 const stale=play(fixture([[4,-1],[85,1],[49,7],[12,5],[23,5]]),23,14);expect(stale.result).toEqual({winner:0,reason:'stalemate'});
});
test('quiet repeated play draws; one-sided perpetual check loses rather than forcing a draw',()=>{
 let g=createGame();for(let cycle=0;cycle<2;cycle++)for(const [f,t] of [[82,63],[1,18],[63,82],[18,1]])g=play(g,f,t);
 expect(g.result).toEqual({winner:null,reason:'repetition'});
 let checking=fixture([[3,-1],[85,1],[49,7],[12,5]],1);
 for(let cycle=0;cycle<2;cycle++)for(const [f,t] of [[3,4],[12,13],[4,3],[13,12]])checking=play(checking,f,t);
 expect(checking.result).toEqual({winner:1,reason:'perpetual-check'});
});
test('quiet-move draw resets on capture or a pawn advance and input is immutable',()=>{
 const g=createGame();g.quiet=119;const old=JSON.stringify(g),next=play(g,82,63);expect(next.result?.reason).toBe('quiet-draw');expect(JSON.stringify(g)).toBe(old);
 expect(play(g,54,45).quiet).toBe(0);expect(play(g,64,1).quiet).toBe(0);
});
test('bounded AI returns legal moves and selects mate rather than material',()=>{
 const g=createGame(),before=JSON.stringify(g),move=chooseMove(g,{depth:2,budgetMs:500,maxNodes:2000});expect(legalMoves(g)).toContainEqual(move);expect(JSON.stringify(g)).toBe(before);
 const mate=fixture([[4,-1],[85,1],[49,7],[14,5],[9,5]]),answer=chooseMove(mate,{depth:2,budgetMs:1000,maxNodes:6000});expect(play(mate,answer.from,answer.to).result?.winner).toBe(0);
});
