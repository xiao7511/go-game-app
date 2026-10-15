(() => {
 'use strict';
 const stickers=[['like','点赞','👍'],['cheer','加油','💪'],['respect','抱拳','🤝'],['laugh','哈哈','😄'],['think','思考','🤔'],['celebrate','好棋','🎉']];
 const phrases=['大家好，请多指教！','好棋！','打得漂亮！','让我想一想。','稍等一下，谢谢。','合作愉快！','再来一局？','谢谢，辛苦了！'];
 let transport=null,unsubscribe=null,messages=[],dialog,list,input,status,sendButton,previousFocus,pending=null,sending=false,initialized=false,epoch=0,unread=new Set(),syncing=null,toolbox,jump;
 const messageKey=m=>m.seat+':'+m.id;
 const atBottom=()=>!list||list.scrollHeight-list.scrollTop-list.clientHeight<45;
 const stickerFor=text=>stickers.find(([,name])=>text==='[表情：'+name+']');
 function badges(){
  const count=unread.size;
  for(const button of document.querySelectorAll('[data-match-chat],[data-online-chat]')){
   if(count)button.dataset.chatUnread=count>99?'99+':String(count);else delete button.dataset.chatUnread;
   button.setAttribute('aria-label',count?'聊天，'+count+' 条未读消息':'聊天');
  }
  if(jump){jump.hidden=!count;const label=count+' 条新消息 · 查看';if(jump.textContent!==label)jump.textContent=label;}
 }
 function read(){unread.clear();badges();}
 function append(message,live=true){
  if(!message||typeof message.id!=='string'||typeof message.text!=='string'||!Number.isInteger(message.seat)||typeof message.sentAt!=='string')return;
  const key=messageKey(message),index=messages.findIndex(item=>messageKey(item)===key),viewing=dialog?.open&&!document.hidden&&atBottom();
  if(index>=0)messages[index]=message;else{messages.push(message);if(live&&message.seat!==transport?.selfSeat&&!viewing)unread.add(key);}
  messages.sort((a,b)=>a.sentAt.localeCompare(b.sentAt));messages=messages.slice(-50);
  const retained=new Set(messages.map(messageKey));for(const key of unread)if(!retained.has(key))unread.delete(key);
  paint();if(viewing)read();else badges();
 }
 function paint(){
  if(!list)return;const bottom=atBottom(),position=list.scrollTop;
  list.replaceChildren(...messages.map(message=>{
   const item=document.createElement('li'),avatar=document.createElement('img'),bubble=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');
   const mine=message.seat===transport?.selfSeat;item.className=mine?'chat-message mine':'chat-message';item.dataset.chatMessage=message.id;item.dataset.seat=String(message.seat);
   avatar.className='chat-avatar';avatar.alt='';avatar.src=window.NobiAvatars?.safe(message.avatar)||window.NobiAvatars?.forKey(message.nickname||message.seat)||'ui/avatar-presets/0.svg';
   name.textContent=mine?'我':message.nickname||'Nobi 玩家';time.dateTime=message.sentAt;time.textContent=new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
   const sticker=stickerFor(message.text);if(sticker){const image=document.createElement('img');image.className='chat-sticker';image.src='ui/chat-stickers/'+sticker[0]+'.svg';image.alt=sticker[1];body.append(image);}else body.textContent=message.text;
   bubble.append(name,time,body);item.append(avatar,bubble);return item;
  }));
  if(!messages.length){const empty=document.createElement('li');empty.className='chat-empty';empty.textContent='发一句问候，认识同桌的好友';list.append(empty);}
  list.scrollTop=bottom?list.scrollHeight:position;
 }
 function close(){if(dialog?.open){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}previousFocus?.focus?.({preventScroll:true});}
 async function sync(){
  if(!transport||syncing)return syncing;const current=transport,version=epoch;
  syncing=(async()=>{try{const result=await current.load();if(current!==transport)return;for(const message of result.messages)append(message,initialized);initialized=true;if(status)status.textContent='';}catch(error){if(current===transport&&status)status.textContent=error.message||'消息同步失败，请重试';}finally{if(version===epoch)syncing=null;}})();return syncing;
 }
 async function send(text,clearDraft=false){
  if(!transport||sending)return;
  text=text.trim();if(!text||Array.from(text).length>200){status.textContent='请输入 1 到 200 个字的消息';return;}
  const current=transport;if(!pending||pending.text!==text)pending={messageId:crypto.randomUUID(),text};
  sending=true;controls();status.textContent='正在发送…';
  try{const result=await current.send(pending);if(current!==transport)return;append(result.message,false);if(clearDraft&&input.value.trim()===text)input.value='';pending=null;status.textContent='已发送';list.scrollTop=list.scrollHeight;read();}
  catch(error){if(current===transport)status.textContent=error?.message||'发送未确认，点击发送可重试';}
  finally{if(current===transport){sending=false;controls();}}
 }
 function controls(){for(const button of dialog?.querySelectorAll('.chat-composer button,.chat-toolbox button')||[])button.disabled=sending;if(input)input.disabled=sending;}
 function size(){if(dialog)dialog.style.setProperty('--chat-viewport',Math.floor(window.visualViewport?.height||innerHeight)+'px');}
 function choose(kind){
  toolbox.replaceChildren();toolbox.dataset.kind=kind;
  for(const value of kind==='stickers'?stickers:phrases){const button=document.createElement('button');button.type='button';
   if(kind==='stickers'){const [id,name]=value,image=document.createElement('img');image.src='ui/chat-stickers/'+id+'.svg';image.alt=name;button.setAttribute('aria-label','发送表情：'+name);button.append(image);button.onclick=()=>send('[表情：'+name+']');}
   else{button.textContent=value;button.onclick=()=>send(value);}
   toolbox.append(button);
  }controls();
 }
 async function open(){
  previousFocus=document.activeElement;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='nobi-chat-dialog';dialog.setAttribute('aria-labelledby','room-chat-title');document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog)close();});dialog.addEventListener('close',()=>previousFocus?.focus?.({preventScroll:true}));}
  dialog.replaceChildren();const header=document.createElement('header'),heading=document.createElement('div'),title=document.createElement('h2'),subtitle=document.createElement('small'),button=document.createElement('button');
  title.id='room-chat-title';title.textContent='同桌聊天';subtitle.textContent='仅房间成员可见';button.type='button';button.textContent='关闭';button.onclick=close;heading.append(title,subtitle);header.append(heading,button);dialog.append(header);
  list=null;input=null;status=null;sendButton=null;jump=null;toolbox=null;
  if(!transport){const note=document.createElement('p');note.className='chat-empty';note.textContent='进入好友联机房间后，即可与同桌玩家聊天。';dialog.append(note);}
  else{
   list=document.createElement('ol');list.className='chat-messages';list.setAttribute('aria-label','房间消息');list.setAttribute('aria-live','polite');list.onscroll=()=>{if(atBottom())read();};
   jump=document.createElement('button');jump.type='button';jump.className='chat-jump';jump.hidden=true;jump.onclick=()=>{list.scrollTop=list.scrollHeight;read();};
   const tabs=document.createElement('nav');tabs.className='chat-tools';tabs.setAttribute('aria-label','聊天工具');toolbox=document.createElement('div');toolbox.className='chat-toolbox';
   for(const [id,label] of [['phrases','快捷短句'],['stickers','表情包']]){const tab=document.createElement('button');tab.type='button';tab.textContent=label;tab.setAttribute('aria-pressed',String(id==='phrases'));tab.onclick=()=>{tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));choose(id);};tabs.append(tab);}
   const form=document.createElement('form');form.className='chat-composer';form.onsubmit=event=>{event.preventDefault();send(input.value,true);};
   input=document.createElement('input');input.type='text';input.maxLength=400;input.placeholder='和同桌说点什么…';input.setAttribute('aria-label','聊天消息');input.autocomplete='off';
   sendButton=document.createElement('button');sendButton.type='submit';sendButton.textContent='发送';status=document.createElement('p');status.className='chat-status';status.setAttribute('role','status');
   form.append(input,sendButton);dialog.append(list,jump,tabs,toolbox,form,status);choose('phrases');paint();read();
  }
  size();if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
  if(list){list.scrollTop=list.scrollHeight;await sync();list.scrollTop=list.scrollHeight;read();}
 }
 function connect(next){
  if(transport?.roomId===next?.roomId)return;
  unsubscribe?.();unsubscribe=null;transport=next;epoch++;messages=[];pending=null;sending=false;initialized=false;unread.clear();syncing=null;close();badges();
  if(next){unsubscribe=next.subscribe(message=>append(message,true));sync();}
 }
 addEventListener('DOMContentLoaded',()=>new MutationObserver(badges).observe(document.body,{childList:true,subtree:true}));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});addEventListener('online',()=>sync());
 window.visualViewport?.addEventListener('resize',size);
 window.NobiRoomChat=Object.freeze({open,close,connect,getUnreadCount:()=>unread.size});
})();
