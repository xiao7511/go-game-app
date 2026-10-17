import {createGame,legalMoves,play,inCheck,sideOf,square,pieceName,chooseMove,positionKey,resultText} from './xiangqi-engine.mjs';
import {xiangqiMoveEffect} from './xiangqi-feedback.mjs';

let root,game,mode='solo',seat=0,flipped=false,selected=null,preview=null,undo=[],send=null,available=true,thinking=false,worker=null,ticket=0,depth=2,lastStatus='',deadline=0,clock=null,layoutObserver=null;
let audioRoom=null;
const landings=new Map();
function clearLandings(){for(const {animation} of landings.values())animation.cancel();landings.clear();}
function moveFeedback(before,after){
 const effect=xiangqiMoveEffect(before,after);if(!effect)return;window.NobiAudio?.playEffect(effect);
 clearLandings();
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const to=after.log.at(-1).to,button=$(`[data-square="${to}"]`);if(!button?.animate)return;
 const animation=button.animate([{filter:'none'},{filter:'brightness(1.8) drop-shadow(0 0 7px #ffe39a)'},{filter:'none'}],{duration:500,iterations:Infinity,easing:'ease-in-out'});
 animation.id='xq-landing';landings.set(button,{animation,piece:after.board[to]});
}
function commitSoloMove(from,to){const before=game;game=play(game,from,to);selected=preview=null;render();moveFeedback(before,game);}
const $=selector=>root.querySelector(selector);
const text=(selector,value)=>{const node=$(selector);if(node.textContent!==value)node.textContent=value;};
const coord=index=>{const i=flipped?89-index:index;return {x:(i%9+.5)/9*100,y:(Math.floor(i/9)+.5)/10*100};};
const grid=()=>{
 let lines='';for(let r=0;r<10;r++)lines+=`<path d="M50 ${r*100+50}H850"/>`;
 for(let c=0;c<9;c++)lines+=c===0||c===8?`<path d="M${c*100+50} 50V950"/>`:`<path d="M${c*100+50} 50V450M${c*100+50} 550V950"/>`;
 let marks='';for(const [c,r] of [[1,2],[7,2],[1,7],[7,7],...[3,6].flatMap(r=>[0,2,4,6,8].map(c=>[c,r]))]){const x=c*100+50,y=r*100+50;for(const dx of [-1,1])for(const dy of [-1,1])if((c>0||dx>0)&&(c<8||dx<0))marks+=`<path d="M${x+dx*13} ${y+dy*31}V${y+dy*13}H${x+dx*31}"/>`;}
 return `<svg viewBox="0 0 900 1000" aria-hidden="true"><defs><linearGradient id="xq-river" x2="0" y2="1"><stop stop-color="#b68b4b" stop-opacity=".16"/><stop offset=".5" stop-color="#f9e4bd" stop-opacity=".5"/><stop offset="1" stop-color="#b68b4b" stop-opacity=".16"/></linearGradient></defs><rect x="50" y="450" width="800" height="100" fill="url(#xq-river)"/><rect x="39" y="39" width="822" height="922" rx="2" fill="none" stroke="#82572f" stroke-width="3"/><g fill="none" stroke="#79532e" stroke-width="2.2" stroke-linecap="square">${lines}<path d="M350 50L550 250M550 50L350 250M350 750L550 950M550 750L350 950"/></g><g fill="none" stroke="#79532e" stroke-width="2.8">${marks}</g><g fill="#805a35" font-size="47" font-family="STKaiti,KaiTi,serif" font-weight="600" letter-spacing="12"><text x="173" y="518">楚 河</text><text x="543" y="518">汉 界</text></g></svg>`;
};
function mount(){
 if(root)return;
 root=document.createElement('section');root.id='nobi-xiangqi';root.className='nobi-xiangqi';root.setAttribute('aria-label','中国象棋对局');
 root.innerHTML=`<header class="xq-header"><div><span class="xq-eyebrow">NOBI · CHINESE CHESS</span><h1>中国象棋</h1></div><span class="xq-mode"></span><button type="button" data-xq="exit">返回大厅</button></header><div class="xq-layout"><div class="xq-arena"><div class="xq-player" data-player="opponent"><img alt=""><div><strong></strong><small></small></div><span data-xq-turn="opponent"></span></div><div class="xq-board-wrap"><div class="xq-board" role="group" aria-label="中国象棋棋盘">${grid()}<div class="xq-squares"></div></div></div><div class="xq-player" data-player="self"><img alt=""><div><strong></strong><small></small></div><span data-xq-turn="self"></span></div></div><aside class="xq-panel"><div class="xq-summary"><div class="xq-panel-title"><span class="xq-chip">红方先行</span><span data-xq-ply>第 1 回合</span></div><p class="xq-status" role="status" aria-live="polite"></p><p class="xq-instruction">点击棋子，再选择落点，确认后走棋。</p><div class="xq-confirm-row"><button type="button" class="xq-primary" data-xq="confirm">确认走棋</button><button type="button" data-xq="cancel">取消选择</button></div></div><div class="xq-quick-actions"><button type="button" data-xq="hint">走棋提示</button><button type="button" data-xq="undo">悔棋</button><button type="button" data-xq="chat" data-match-chat>聊天</button><button type="button" data-xq="options">更多</button></div><p class="xq-feedback" role="status"></p></aside></div><dialog class="xq-options" aria-labelledby="xq-options-title"><h2 id="xq-options-title">对局设置</h2><div class="xq-actions"><button type="button" data-xq="draw">申请和棋</button><button type="button" data-xq="resign">认输</button><button type="button" data-xq="flip">翻转棋盘</button><button type="button" data-xq="music">音乐：关</button><button type="button" data-xq="rules">玩法说明</button></div><div class="xq-solo-settings"><label>我执<select data-xq-side aria-label="选择执棋颜色"><option value="0">红方 · 先手</option><option value="1">黑方 · 后手</option></select></label><label>人机难度<select data-xq-depth aria-label="选择象棋人机难度"><option value="1">入门</option><option value="2" selected>标准</option><option value="3">进阶</option></select></label><button type="button" data-xq="restart">重新开局</button></div><details class="xq-record"><summary>棋谱 <span data-xq-record-count>0 步</span></summary><ol></ol></details><button type="button" data-xq="close-options">返回棋盘</button></dialog><dialog class="xq-dialog"><h2></h2><div class="xq-dialog-copy"></div><button type="button" data-xq="close-dialog">继续</button></dialog>`;
 document.body.append(root);
 const effects=document.createElement('button');effects.type='button';effects.dataset.xq='effects';$('.xq-actions').append(effects);
 clock=setInterval(tick,1000);
 layoutObserver=new ResizeObserver(fitBoard);layoutObserver.observe($('.xq-arena'));
 const squares=$('.xq-squares');
 for(let i=0;i<90;i++){const button=document.createElement('button');button.type='button';button.className='xq-cell';button.dataset.square=String(i);button.onclick=()=>select(i);squares.append(button);}
 root.onclick=event=>{const button=event.target.closest('[data-xq]');if(button&&!button.disabled)action(button.dataset.xq);};
 $('[data-xq-side]').onchange=()=>restart(Number($('[data-xq-side]').value));
 $('[data-xq-depth]').onchange=()=>{depth=Number($('[data-xq-depth]').value);};
}
function fitBoard(){
 if(!root)return;const arena=$('.xq-arena'),wrap=$('.xq-board-wrap');
 const players=[...arena.querySelectorAll('.xq-player')].filter(n=>getComputedStyle(n).position!=='absolute');
 const gap=parseFloat(getComputedStyle(arena).rowGap)||0,pad=parseFloat(getComputedStyle(wrap).paddingLeft)||0;
 const free=arena.clientHeight-players.reduce((h,n)=>h+n.offsetHeight,0)-gap*players.length;
 const width=Math.max(0,Math.min(arena.clientWidth,(free-2*pad)*.9+2*pad));
 wrap.style.width=width+'px';
}
function accountPlayer(){return {nickname:window.state?.userNickname||'我',avatar:window.NobiAvatars?.self('我')};}
function player(node,info,side){const target=$(`[data-player="${node}"]`),name=info?.nickname||'等待好友',src=window.NobiAvatars?.safe(info?.avatar)||window.NobiAvatars?.forKey(name)||'ui/avatar-presets/0.svg';target.querySelector('img').src=src;target.querySelector('strong').textContent=name;target.querySelector('small').textContent=(side===0?'红方':'黑方')+(mode==='solo'?(node==='self'?' · 我':' · 人机'):' · 好友联机');}
function canMove(){return game?.status==='playing'&&available&&!thinking&&game.turn===seat;}
function render(){
 if(!root||!game)return;
 for(const [button,{animation,piece}] of landings)if(game.board[Number(button.dataset.square)]!==piece){animation.cancel();landings.delete(button);}
 const moves=selected===null?[]:legalMoves(game).filter(m=>m.from===selected),last=game.log.at(-1),check=inCheck(game.board,game.turn);
 root.dataset.mode=mode;root.dataset.status=game.status;root.dataset.turn=String(game.turn);root.dataset.thinking=String(thinking);
 for(const button of $('.xq-squares').children){const i=Number(button.dataset.square),p=game.board[i],{x,y}=coord(i);button.style.left=x+'%';button.style.top=y+'%';
  button.className='xq-cell'+(p?' has-piece '+(p>0?'red':'black'):'')+(i===selected?' selected':'')+(moves.some(m=>m.to===i)?' legal':'')+(preview?.to===i?' preview':'')+(last&&(last.from===i||last.to===i)?' last-move':'')+(Math.abs(p)===1&&sideOf(p)===game.turn&&check?' checked':'');
  button.textContent=pieceName(p);button.setAttribute('aria-label',(p?(p>0?'红':'黑')+pieceName(p)+' ':'空位 ')+square(i));button.setAttribute('aria-pressed',String(selected===i));button.disabled=!canMove();
 }
 text('.xq-mode',mode==='solo'?'人机对弈':'好友联机');text('[data-xq-ply]','第 '+(Math.floor(game.ply/2)+1)+' 回合');
 const result=game.result;const status=result?`${result.winner===null?'和棋':result.winner===seat?'你赢了':'本局失利'} · ${resultText(result)}`:game.status==='waiting'?'等待房主开始对局':!available?'正在同步棋局，请稍候':thinking?'对手正在思考…':(game.turn===seat?'轮到你走棋':'等待对手走棋')+(check?' · 将军，必须应将':'');
 text('.xq-status',status);text('.xq-instruction',preview?'待确认：'+pieceName(game.board[preview.from])+' '+square(preview.from)+' → '+square(preview.to):'点击棋子，再选择落点，确认后走棋。');
 $('[data-xq="confirm"]').disabled=!preview||!canMove();$('[data-xq="cancel"]').disabled=selected===null;
 $('[data-xq="undo"]').disabled=!available||(mode==='solo'?!undo.length:game.ply<2)||game.status!=='playing';$('[data-xq="hint"]').disabled=!canMove();
 for(const id of ['resign','draw'])$('[data-xq="'+id+'"]').disabled=!available||game.status!=='playing';
 $('[data-xq="draw"]').hidden=mode==='solo';$('[data-xq="chat"]').hidden=mode==='solo';$('.xq-solo-settings').hidden=mode!=='solo';
 text('[data-xq-turn="self"]',game.status==='playing'&&game.turn===seat?'走棋中':'');text('[data-xq-turn="opponent"]',game.status==='playing'&&game.turn!==seat?'走棋中':'');
 text('[data-xq-record-count]',game.ply+' 步');const list=$('.xq-record ol');list.replaceChildren(...game.log.slice(-60).map(entry=>{const item=document.createElement('li');item.textContent=(entry.side===0?'红 ':'黑 ')+entry.notation;return item;}));
 const audio=window.NobiAudio?.getSettings();text('[data-xq="music"]','音乐与音效设置');
 text('[data-xq="effects"]','音效：'+(audio?.effectsEnabled?'开':'关'));$('[data-xq="effects"]').setAttribute('aria-pressed',String(!!audio?.effectsEnabled));
 if(result&&lastStatus!=='ended'){showDialog('本局结束',status);window.NobiAudio?.setScene('result');}lastStatus=game.status;
 tick();requestAnimationFrame(fitBoard);
}
function tick(){if(!root||mode!=='online'||game?.status!=='playing'||!deadline)return;const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000)),label=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');text('[data-xq-turn="'+(game.turn===seat?'self':'opponent')+'"]','走棋中 · '+label);}
function message(value){if(root)text('.xq-feedback',value);}
function select(i){
 if(!canMove())return;
 if(worker&&!thinking)stopAI();
 if(selected===i){selected=null;preview=null;message('');}
 else if(sideOf(game.board[i])===seat){selected=i;preview=null;message('');}
 else if(selected!==null&&legalMoves(game).some(m=>m.from===selected&&m.to===i)){preview={from:selected,to:i};message('');}
 else message('这个位置不能走，请选择提示的落点。');
 render();
}
function stopAI(){ticket++;worker?.terminate();worker=null;thinking=false;}
function askAI(hint=false){
 stopAI();const mine=++ticket,key=positionKey(game);thinking=!hint;if(!hint)render();else message('正在寻找走法…');
 const accept=move=>{if(!root||mine!==ticket||key!==positionKey(game))return;worker?.terminate();worker=null;thinking=false;if(!move){message('提示暂不可用，请直接选择棋子。');render();return;}
  if(hint){selected=move.from;preview=move;message('提示已标出，点击“确认走棋”后执行。');render();}else commitSoloMove(move.from,move.to);
 };
 try{worker=new Worker(new URL('./xiangqi-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=event=>{if(event.data.ticket===mine)accept(event.data.error?null:event.data.move);};worker.onerror=()=>{if(root&&mine===ticket)accept(chooseMove(game,{depth:1,budgetMs:80,maxNodes:500}));};worker.postMessage({ticket:mine,game,depth});}
 catch{setTimeout(()=>{if(mine===ticket)accept(chooseMove(game,{depth:1,budgetMs:80,maxNodes:500}));},0);}
}
function restart(side=seat,force=false){
 if(!force&&game?.ply&&game.status==='playing'&&!confirm('重新开局会结束当前单机对局，是否继续？')){$('[data-xq-side]').value=String(seat);return;}
 stopAI();clearLandings();seat=side;flipped=seat===1;game=createGame();undo=[];selected=preview=null;lastStatus='';$('[data-xq-side]').value=String(seat);player('self',accountPlayer(),seat);player('opponent',{nickname:'Nobi 棋友 · 人机',avatar:'ui/avatar-presets/4.svg'},1-seat);message('');window.NobiAudio?.setScene('xiangqi');render();root.scrollTop=0;$('.xq-panel').scrollTop=0;if(seat===1)askAI();
}
function showDialog(title,copy){text('.xq-dialog h2',title);text('.xq-dialog-copy',copy);const dialog=$('.xq-dialog');if(!dialog.open)dialog.showModal();}
async function action(id){
 if(['draw','resign','rules'].includes(id))$('.xq-options').close();
 if(id==='confirm'&&preview&&canMove()){
  const move=preview;selected=preview=null;
  if(mode==='online'){available=false;render();await send('move',move);}
  else{stopAI();undo.push(game);commitSoloMove(move.from,move.to);if(game.status==='playing')askAI();}return;
 }
 if(id==='cancel'){selected=preview=null;message('');render();}
 if(id==='hint'&&canMove())askAI(true);
 if(id==='undo'){
  if(mode==='online'){await send('undo-request');return;}
  stopAI();const previous=undo.pop();if(previous){clearLandings();game=previous;selected=preview=null;lastStatus='';message('已撤回你和人机最近一轮走棋。');render();}
 }
 if(id==='restart')restart();
 if(id==='flip'){flipped=!flipped;render();}
 if(id==='draw')await send('draw-request');
 if(id==='resign'&&confirm('确认认输并结束本局？')){if(mode==='online')await send('resign-request');else{stopAI();game={...game,status:'ended',result:{winner:1-seat,reason:'resignation'}};render();}}
 if(id==='music'){ $('.xq-options').close();window.NobiMatchSettings?.open(); }
 if(id==='effects'&&window.NobiAudio){const settings=window.NobiAudio.getSettings();window.NobiAudio.setSettings({effectsEnabled:!settings.effectsEnabled});render();}
 if(id==='chat')window.NobiRoomChat?.open();
 if(id==='rules')showDialog('象棋玩法 · 休闲对局','红方先行。车走直线，马走日且不能蹩马腿，相（象）走田且不能塞象眼、不能过河；仕（士）和帅（将）在九宫内走，双方将帅不能照面。炮隔一个棋子吃子；兵卒只向前，过河后可横走，不能后退。选子后可再次点击取消，选择目标后确认走棋。将死或困毙的一方判负。本版单方连续长将循环判负，其他三次重复局面判和；连续 60 回合无吃子或兵卒前进判和。双方也可申请和棋。首版采用休闲循环裁定，不包含赛事长捉细则，联机对局暂不计积分。');
 if(id==='options'){render();$('.xq-options').showModal();}
 if(id==='close-options')$('.xq-options').close();
 if(id==='close-dialog')$('.xq-dialog').close();
 if(id==='exit'){
  if(mode==='online'){await send('exit');return;}
  if(game.status==='playing'&&game.ply&&!confirm('退出当前象棋对局并返回大厅？'))return;
  destroy();window.backToCentralLobby?.();
 }
}
function startSolo(){mode='solo';audioRoom=null;available=true;mount();restart(0,true);}
function applyAuthoritySnapshot(snapshot,command,enabled){
 if(snapshot.gameType!=='xiangqi')return;
 const first=!root||mode!=='online'||audioRoom!==snapshot.roomId,before=first?null:game;mode='online';audioRoom=snapshot.roomId;mount();seat=snapshot.privateState.seat;send=command;available=enabled;deadline=snapshot.deadline;
 const state=snapshot.publicState;
 if(snapshot.status==='waiting'){clearLandings();game={...createGame(),status:'waiting'};message('等待两位玩家就位，由房主开始对局。');}
 else{const changed=!game||game.ply!==state.ply||positionKey(game)!==state.positionKey;game={...state,status:snapshot.status,result:snapshot.result};if(changed){if(!xiangqiMoveEffect(before,game))clearLandings();selected=preview=null;message('');}}
 if(first){clearLandings();flipped=seat===1;lastStatus='';selected=preview=null;}player('self',snapshot.players.find(p=>p.seat===seat),seat);player('opponent',snapshot.players.find(p=>p.seat!==seat),1-seat);render();moveFeedback(before,game);
}
function destroy(){clearLandings();layoutObserver?.disconnect();layoutObserver=null;stopAI();clearInterval(clock);clock=null;deadline=0;audioRoom=null;root?.remove();root=null;game=null;selected=preview=null;undo=[];lastStatus='';}
window.XQ=Object.freeze({startSolo,applyAuthoritySnapshot,destroy,getView:()=>game?{...game,selected,preview,seat,thinking}:null});
