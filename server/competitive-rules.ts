import {createHash} from 'node:crypto';
export const competitiveConfig=Object.freeze({version:'nobi-competitive-v1',go:{rules:'Chinese-area-agreement-v1',komi:7.5,size:19,minMoves:2},guandan:{rules:'guandan-standard-v1',level:'2',teams:[[0,2],[1,3]],tribute:true},elo:{initial:1500,k:32},turnMs:120000});
const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
export function guandanResult(order:number[],level='2') {
 if(order.length!==4||new Set(order).size!==4||order.some(s=>!Number.isInteger(s)||s<0||s>3)||!ranks.includes(level))throw new Error('invalid finish order or level');
 const winner=order[0]%2,partner=order[0]===0?2:order[0]===2?0:order[0]===1?3:1,partnerPlace=order.indexOf(partner)+1;
 const upgrade=partnerPlace===2?3:partnerPlace===3?2:1;
 return {reason:'rules-complete',winner,finishOrder:order,placements:order.map((seat,index)=>({seat,place:index+1,team:seat%2})),teams:[[0,2],[1,3]],level,upgrade,nextLevel:ranks[Math.min(12,ranks.indexOf(level)+upgrade)],rules:'nobi-single-hand-v1'};
}
const neighbors=(r:number,c:number,n:number)=>[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([a,b])=>a>=0&&a<n&&b>=0&&b<n);
export function scoreArea(input:number[][],dead:number[][]=[],neutral:number[][]=[],komi=7.5) {
 const n=input.length;if(n!==19||input.some(row=>row.length!==n||row.some(v=>![0,1,2].includes(v)))||komi!==7.5)throw new Error('invalid scoring board/config');
 const board=input.map(row=>row.slice()),validate=(points:number[][])=>{if(!Array.isArray(points)||points.length>361)throw new Error('invalid points');const keys=new Set<string>();for(const p of points){if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isInteger(v))||p.some(v=>v<0||v>=n))throw new Error('invalid point');const key=p.join(',');if(keys.has(key))throw new Error('duplicate point');keys.add(key);}return keys;};
 const removed=validate(dead),neutralKeys=validate(neutral),groups=new Set<string>();let deadBlack=0,deadWhite=0;
 for(const [r,c] of dead){const color=input[r][c];if(!color)throw new Error('dead point is empty');const stack=[[r,c]],seen=new Set<string>();while(stack.length){const [a,b]=stack.pop()!,key=a+','+b;if(seen.has(key))continue;seen.add(key);if(!removed.has(key))throw new Error('whole dead group required');for(const [x,y] of neighbors(a,b,n))if(input[x][y]===color&&!seen.has(x+','+y))stack.push([x,y]);}groups.add(r+','+c);if(color===1)deadBlack++;else deadWhite++;board[r][c]=0;}
 let blackStones=0,whiteStones=0,blackTerritory=0,whiteTerritory=0,neutralPoints=0;const visited=new Set<string>();
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  if(board[r][c]){if(neutralKeys.has(r+','+c))throw new Error('neutral point is occupied');if(board[r][c]===1)blackStones++;else whiteStones++;continue;}
  if(visited.has(r+','+c))continue;const stack=[[r,c]],region:string[]=[],border=new Set<number>();
  while(stack.length){const [a,b]=stack.pop()!,key=a+','+b;if(visited.has(key))continue;visited.add(key);region.push(key);for(const [x,y] of neighbors(a,b,n)){if(board[x][y])border.add(board[x][y]);else if(!visited.has(x+','+y))stack.push([x,y]);}}
  const marked=region.filter(key=>neutralKeys.has(key)).length;if(marked&&marked!==region.length)throw new Error('whole neutral region required');
  if(marked||border.size!==1)neutralPoints+=region.length;else if(border.has(1))blackTerritory+=region.length;else whiteTerritory+=region.length;
 }
 const blackArea=blackStones+blackTerritory,whiteArea=whiteStones+whiteTerritory,margin=blackArea-whiteArea-komi;
 return {rules:competitiveConfig.go.rules,komi,blackStones,whiteStones,blackTerritory,whiteTerritory,neutralPoints,deadBlack,deadWhite,blackArea,whiteArea,blackTotal:blackArea,whiteTotal:whiteArea+komi,margin,winner:margin>0?0:margin<0?1:null,dead:dead.map(p=>p.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),neutral:neutral.map(p=>p.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1])};
}
export function scoreProposal(board:number[][],dead:number[][],neutral:number[][]){const score=scoreArea(board,dead,neutral);return {proposalId:createHash('sha256').update(JSON.stringify(score)).digest('hex'),score};}
export function eloDeltas(ratings:number[],winner:number|null){if(![2,4].includes(ratings.length)||ratings.some(v=>!Number.isInteger(v)||v<0)||!(winner===null||winner===0||winner===1))throw new Error('invalid Elo input');const averages=[0,1].map(team=>ratings.filter((_,seat)=>seat%2===team).reduce((a,b)=>a+b,0)/(ratings.length/2));const expected=1/(1+10**((averages[1]-averages[0])/400));let delta=Math.round(32*((winner===null?.5:winner===0?1:0)-expected));const losingTeam=delta>0?1:0;delta=Math.sign(delta)*Math.min(Math.abs(delta),...ratings.filter((_,seat)=>seat%2===losingTeam));return ratings.map((_,seat)=>delta===0?0:seat%2===0?delta:-delta);}
export const tier=(rating:number)=>rating<1200?'青铜':rating<1500?'白银':rating<1800?'黄金':rating<2100?'铂金':rating<2400?'钻石':'大师';
