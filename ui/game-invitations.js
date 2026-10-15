(() => {
 'use strict';
 let owner=null,revision=0,pending=false,rows=[],friend=null,sendId=null;
 const listeners=new Set(),emit=()=>listeners.forEach(fn=>fn(rows));
 let badge,inbox,compose,list,inboxNotice,composeNotice,submit,kind,cancel;
 const title=id=>id==='go'?'围棋':'掼蛋';
 function mount(){
  if(badge)return;
  badge=document.createElement('button');badge.className='nobi-invite-badge';badge.hidden=true;badge.onclick=openInbox;document.body.append(badge);
  inbox=document.createElement('dialog');inbox.id='nobi-invitations';inbox.className='nobi-invitation-dialog';inbox.setAttribute('aria-labelledby','nobi-inbox-title');inbox.innerHTML='<div class="invite-dialog-head"><h2 id="nobi-inbox-title">对战邀请</h2><button type="button" data-close aria-label="关闭邀请">×</button></div><p>接受邀请后进入好友的等待房间。</p><ul class="invite-list"></ul><p class="invite-notice" role="status"></p><button type="button" data-refresh>刷新邀请</button>';document.body.append(inbox);list=inbox.querySelector('ul');inboxNotice=inbox.querySelector('.invite-notice');inbox.querySelector('[data-close]').onclick=()=>inbox.close();inbox.querySelector('[data-refresh]').onclick=()=>refresh(true);
  compose=document.createElement('dialog');compose.id='nobi-invite-player';compose.className='nobi-invitation-dialog';compose.setAttribute('aria-labelledby','nobi-compose-title');compose.innerHTML='<div class="invite-dialog-head"><h2 id="nobi-compose-title">邀请好友对战</h2><button type="button" data-close aria-label="取消邀请">×</button></div><p data-friend-name></p><label>选择游戏<select><option value="go">围棋 · 双人对战</option><option value="guandan">掼蛋 · 四人对战</option></select></label><p>发送后进入你的等待房间，好友确认加入后即可开始。</p><p class="invite-notice" role="status"></p><button type="button" data-submit>发出邀请并进入房间</button>';document.body.append(compose);kind=compose.querySelector('select');composeNotice=compose.querySelector('.invite-notice');submit=compose.querySelector('[data-submit]');cancel=compose.querySelector('[data-close]');cancel.onclick=()=>compose.close();kind.onchange=()=>{sendId=crypto.randomUUID();};compose.addEventListener('cancel',event=>{if(pending)event.preventDefault();});submit.onclick=send;
 }
 async function request(path,body){const uid=owner,sdk=await window.NobiServices.requireClient(),session=await sdk.auth.getSession();if(session.error||!uid||session.data?.session?.user?.id!==uid)throw Error('登录已失效，请重新登录');let response,value;try{response=await fetch(window.NOBI_ONLINE_CONFIG.url+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:window.NobiRequestTimeout(15000),cache:'no-store',redirect:'error'});value=await response.json();}catch{throw Error('邀请服务暂时无法连接，请稍后重试');}if(!response.ok)throw Error(value.error||'邀请服务暂时不可用');return value;}
 function render(){
  mount();const count=rows.filter(r=>r.direction==='received'&&r.status==='pending').length;badge.hidden=!owner||!count;badge.textContent='对战邀请 '+count;badge.setAttribute('aria-label',count+' 条新的对战邀请');
  list.replaceChildren();
  for(const row of rows){
   const item=document.createElement('li'),copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=row.direction==='received'?row.fromName+' 邀请你': '邀请 '+row.toName;detail.textContent=title(row.kind)+' · '+({pending:'等待回复',accepted:'已接受',declined:'已拒绝',cancelled:'已取消',expired:'已过期'}[row.status]||'已结束');copy.append(name,detail);item.append(copy);
   if(row.direction==='received'&&row.status==='pending')for(const [action,label] of [['accept','接受并进入'],['decline','拒绝']]){const button=document.createElement('button');button.textContent=label;button.dataset.inviteAction=action;button.dataset.inviteId=row.id;button.onclick=()=>respond(row,action,button);item.append(button);}
   else if(row.direction==='sent'&&row.status==='pending'){const button=document.createElement('button');button.textContent='取消邀请';button.onclick=()=>respond(row,'cancel',button);item.append(button);}
   list.append(item);
  }
  if(!rows.length){const item=document.createElement('li');item.textContent='暂无对战邀请';list.append(item);}emit();
 }
 async function refresh(showError=false){
  if(!owner||pending||!window.NOBI_ONLINE_CONFIG?.url)return;
  const mine=revision;
  try{const value=await request('/me/invitations');if(mine!==revision)return;rows=Array.isArray(value.invitations)?value.invitations:[];if(inbox)inboxNotice.textContent='';render();}catch{if(showError&&mine===revision){mount();inboxNotice.textContent='邀请暂时无法加载，请稍后刷新。';}}
 }
 function setUser(user){if(owner&&owner===user?.id){refresh();return;}owner=user?.id||null;revision++;rows=[];friend=null;pending=false;if(badge){badge.hidden=true;inbox.close();compose.close();list.replaceChildren();}emit();if(owner)refresh();}
 function openInbox(){mount();inboxNotice.textContent='';render();if(!inbox.open)inbox.showModal();refresh(true);}
 function invite(player){if(!owner)return;mount();friend=player;sendId=crypto.randomUUID();compose.querySelector('[data-friend-name]').textContent='邀请 '+player.nickname;kind.value=player.kinds.includes('go')?'go':'guandan';composeNotice.textContent='';submit.disabled=cancel.disabled=kind.disabled=false;if(!compose.open)compose.showModal();}
 async function send(){
  if(pending||!friend)return;const mine=revision;pending=true;submit.disabled=cancel.disabled=kind.disabled=true;composeNotice.textContent='正在发送邀请…';
  try{const value=await request('/invitations',{friendKey:friend.friendKey,kind:kind.value,requestId:sendId});if(mine!==revision)return;if(!['pending','accepted'].includes(value.status))throw Error('邀请已过期，请重新选择好友');location.href='online.html?game='+value.kind+'&room='+encodeURIComponent(value.roomId);}
  catch(error){if(mine===revision)composeNotice.textContent=error.message;}
  finally{if(mine===revision){pending=false;submit.disabled=cancel.disabled=kind.disabled=false;}}
 }
 async function respond(row,action,button){
  if(pending)return;
  if(action==='accept'&&(document.body.dataset.roomPhase==='playing'||document.body.classList.contains('in-game-match'))){inboxNotice.textContent='请先退出当前对局，再接受邀请。';return;}
  const mine=revision;pending=true;button.disabled=true;
  try{const value=await request('/invitations/'+row.id+'/'+action,{});if(mine!==revision)return;if(action==='accept'){location.href='online.html?game='+value.kind+'&room='+encodeURIComponent(value.roomId);return;}pending=false;await refresh(true);}
  catch(error){if(mine===revision)inboxNotice.textContent=error.message;}
  finally{if(mine===revision){pending=false;button.disabled=false;}}
 }
 window.NobiInvitations=Object.freeze({setUser,invite,openInbox,refresh,get:()=>rows,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
 setInterval(()=>{if(owner&&!document.hidden)refresh();},10000);
 document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)refresh();});
})();
