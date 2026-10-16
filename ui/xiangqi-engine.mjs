// Shared by browser, AI worker and authoritative server. Coordinates: A10..I1.
export const XIANGQI_RULES='nobi-xiangqi-casual-v1';
export const PIECES={1:['帅','将'],2:['仕','士'],3:['相','象'],4:['马','马'],5:['车','车'],6:['炮','炮'],7:['兵','卒']};
export const sideOf=p=>p>0?0:p<0?1:null;
export const square=i=>'ABCDEFGHI'[i%9]+(10-Math.floor(i/9));
export const pieceName=p=>PIECES[Math.abs(p)]?.[sideOf(p)]??'';
const inside=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
const palace=(r,c,s)=>c>=3&&c<=5&&(s===0?r>=7&&r<=9:r>=0&&r<=2);
export const positionKey=g=>g.turn+':'+g.board.join(',');
export function createGame(){
 const board=Array(90).fill(0),back=[5,4,3,2,1,2,3,4,5];
 for(let c=0;c<9;c++){board[c]=-back[c];board[81+c]=back[c];if(c%2===0){board[27+c]=-7;board[54+c]=7;}}
 // Cannons stand on B8/H8 and B3/H3 (row 2 / row 7).
 board[19]=board[25]=-6;board[64]=board[70]=6;
 const g={board,turn:0,ply:0,quiet:0,status:'playing',result:null,log:[],positions:[]};g.positions=[positionKey(g)];return g;
}
export function targets(board,from){
 const p=board[from];if(!p)return [];
 const s=sideOf(p),type=Math.abs(p),r=Math.floor(from/9),c=from%9,out=[];
 const add=(y,x)=>{if(inside(y,x)&&sideOf(board[y*9+x])!==s)out.push(y*9+x);};
 if(type===5||type===6){
  for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
   let screen=false;
   for(let y=r+dr,x=c+dc;inside(y,x);y+=dr,x+=dc){const q=board[y*9+x];
    if(type===5){add(y,x);if(q)break;}
    else if(!screen){if(!q)add(y,x);else screen=true;}
    else if(q){if(sideOf(q)!==s)add(y,x);break;}
   }
  }
 }else if(type===4){
  for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[-1,2],[1,-2],[-1,-2]]){
   const leg=(r+(Math.abs(dr)===2?Math.sign(dr):0))*9+c+(Math.abs(dc)===2?Math.sign(dc):0);
   if(!board[leg])add(r+dr,c+dc);
  }
 }else if(type===3){
  for(const dr of [-2,2])for(const dc of [-2,2]){const y=r+dr,x=c+dc;if(inside(y,x)&&(s===0?y>=5:y<=4)&&!board[(r+dr/2)*9+c+dc/2])add(y,x);}
 }else if(type===2){for(const dr of [-1,1])for(const dc of [-1,1])if(palace(r+dr,c+dc,s))add(r+dr,c+dc);}
 else if(type===1){
  for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]])if(palace(r+dr,c+dc,s))add(r+dr,c+dc);
  for(const dr of [-1,1])for(let y=r+dr;inside(y,c);y+=dr){const q=board[y*9+c];if(q){if(q===(s===0?-1:1))out.push(y*9+c);break;}}
 }else if(type===7){add(r+(s===0?-1:1),c);if(s===0?r<=4:r>=5){add(r,c-1);add(r,c+1);}}
 return out;
}
export function inCheck(board,side){
 const king=board.indexOf(side===0?1:-1);if(king<0)return true;
 for(let i=0;i<90;i++)if(board[i]&&sideOf(board[i])!==side&&targets(board,i).includes(king))return true;
 return false;
}
export function movedBoard(board,from,to){const next=board.slice();next[to]=next[from];next[from]=0;return next;}
export function legalMoves(game,side=game.turn){
 if(game.status!=='playing')return [];
 const moves=[];
 for(let from=0;from<90;from++)if(sideOf(game.board[from])===side){
  for(const to of targets(game.board,from))if(Math.abs(game.board[to])!==1&&!inCheck(movedBoard(game.board,from,to),side))moves.push({from,to});
 }
 return moves;
}
export function play(game,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=90||to<0||to>=90||!legalMoves(game).some(m=>m.from===from&&m.to===to))throw Error('走法不合法，请重新选择');
 const piece=game.board[from],captured=game.board[to],board=movedBoard(game.board,from,to),turn=1-game.turn;
 const check=inCheck(board,turn),entry={from,to,piece,captured,side:game.turn,check,notation:pieceName(piece)+' '+square(from)+' → '+square(to)+(captured?' 吃'+pieceName(captured):'')+(check?' 将军':'')};
 const quiet=captured||Math.abs(piece)===7&&Math.floor(from/9)!==Math.floor(to/9)?0:game.quiet+1;
 const next={...game,board,turn,ply:game.ply+1,quiet,log:[...game.log,entry],positions:[]};
 next.positions=[...game.positions,positionKey(next)];
 if(!legalMoves(next).length)next.result={winner:game.turn,reason:check?'checkmate':'stalemate'};
 else{
  const indices=[];next.positions.forEach((key,i)=>{if(key===positionKey(next))indices.push(i);});
  if(indices.length>=3){
   const cycle=next.log.slice(indices.at(-3)),checkers=[0,1].filter(side=>{const moves=cycle.filter(m=>m.side===side);return moves.length&&moves.every(m=>m.check);});
   next.result=checkers.length===1?{winner:1-checkers[0],reason:'perpetual-check'}:{winner:null,reason:'repetition'};
  }else if(quiet>=120)next.result={winner:null,reason:'quiet-draw'};
 }
 if(next.result)next.status='ended';return next;
}
const values={1:100000,2:120,3:120,4:420,5:900,6:450,7:90};
function evaluate(board,side){let score=0;for(let i=0;i<90;i++){const p=board[i];if(!p)continue;const type=Math.abs(p),s=sideOf(p),advance=s===0?9-Math.floor(i/9):Math.floor(i/9);score+=(s===side?1:-1)*(values[type]+(type===7?advance*12+(advance>=5?65:0):type===4||type===6?8*(4-Math.abs(i%9-4)):0));}return score;}
// Bounded iterative deepening. Run in a worker so touch input stays responsive.
export function chooseMove(game,{depth=2,budgetMs=500,maxNodes=10000}={}){
 const moves=legalMoves(game);if(!moves.length)return null;
 let best=moves[0],nodes=0;const until=Date.now()+budgetMs,stop={};
 const ordered=(board,list)=>list.sort((a,b)=>(values[Math.abs(board[b.to])]??0)-(values[Math.abs(board[a.to])]??0));
 function search(board,side,left,alpha,beta,ply){
  if(++nodes>maxNodes||Date.now()>until)throw stop;
  const list=legalMoves({board,turn:side,status:'playing'});if(!list.length)return -1000000+ply;
  if(left<=0)return evaluate(board,side);
  let score=-Infinity;
  for(const m of ordered(board,list)){const value=-search(movedBoard(board,m.from,m.to),1-side,left-1,-beta,-alpha,ply+1);score=Math.max(score,value);alpha=Math.max(alpha,value);if(alpha>=beta)break;}
  return score;
 }
 for(let level=1;level<=Math.min(4,Math.max(1,depth));level++){
  let candidate=best,score=-Infinity;
  try{for(const m of ordered(game.board,[best,...moves.filter(m=>m!==best)])){const value=-search(movedBoard(game.board,m.from,m.to),1-game.turn,level-1,-Infinity,-score,1);if(value>score){score=value;candidate=m;}}best=candidate;}
  catch(error){if(error!==stop)throw error;break;}
 }
 return best;
}
export const resultText=result=>!result?'':({checkmate:'将死',stalemate:'困毙',repetition:'重复局面和棋','perpetual-check':'单方长将判负','quiet-draw':'连续 60 回合无吃子或兵卒前进',resignation:'认输','agreed-draw':'双方同意和棋','player-left':'玩家退出','turn-timeout':'回合超时'}[result.reason]??'对局结束');
