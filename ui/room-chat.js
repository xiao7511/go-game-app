(() => {
 'use strict';
 let transport=null,unsubscribe=null,messages=[],dialog,list,input,status,sendButton,previousFocus,pending=null;
 const append=message=>{if(!message||typeof message.id!=='string'||typeof message.text!=='string')return;const index=messages.findIndex(item=>item.id===message.id&&item.seat===message.seat);if(index>=0)messages[index]=message;else messages.push(message);messages.sort((a,b)=>a.sentAt.localeCompare(b.sentAt));messages=messages.slice(-50);paint();};
 function paint(){
  if(!list)return;
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
  list.replaceChildren(...messages.map(message=>{
   const item=document.createElement('li'),name=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');
   item.dataset.chatMessage=message.id;item.dataset.seat=String(message.seat);name.textContent=message.nickname||'Nobi 玩家';
   time.dateTime=message.sentAt;time.textContent=new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});body.textContent=message.text;
   item.append(name,time,body);return item;
  }));
  if(!messages.length){const empty=document.createElement('li');empty.className='chat-empty';empty.textContent='向同房间的玩家打个招呼吧';list.append(empty);}
  if(nearBottom)list.scrollTop=list.scrollHeight;
 }
 function close(){if(dialog?.close)dialog.close();else dialog?.removeAttribute('open');previousFocus?.focus?.({preventScroll:true});}
 async function submit(event){
  event.preventDefault();if(!transport||sendButton.disabled)return;
  const text=input.value.trim();if(!text||Array.from(text).length>200){status.textContent='请输入 1 到 200 个字的消息';return;}
  const current=transport;
  if(!pending||pending.text!==text)pending={messageId:crypto.randomUUID(),text};
  sendButton.disabled=true;status.textContent='正在发送…';
  try{const result=await current.send(pending);if(current!==transport)return;append(result.message);input.value='';pending=null;status.textContent='已发送';input.focus();}
  catch(error){if(current===transport)status.textContent=error?.message||'消息未确认，请检查连接后重试';}
  finally{if(current===transport)sendButton.disabled=false;}
 }
 async function open(){
  previousFocus=document.activeElement;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='nobi-chat-dialog';dialog.setAttribute('aria-labelledby','room-chat-title');document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog)close();});}
  dialog.replaceChildren();const header=document.createElement('header'),title=document.createElement('h2'),button=document.createElement('button');
  title.id='room-chat-title';title.textContent='房间聊天';button.type='button';button.textContent='关闭';button.onclick=close;header.append(title,button);dialog.append(header);
  list=null;input=null;status=null;sendButton=null;
  if(!transport){const note=document.createElement('p');note.className='chat-empty';note.textContent='单机对局没有其他玩家。进入好友联机房间后，即可与同房间玩家聊天。';dialog.append(note);}
  else{
   const note=document.createElement('p');note.className='chat-note';note.textContent='仅同房间成员可见 · 最近 50 条消息';
   list=document.createElement('ol');list.className='chat-messages';list.setAttribute('aria-label','房间消息');list.setAttribute('aria-live','polite');
   const form=document.createElement('form');form.className='chat-composer';form.onsubmit=submit;
   input=document.createElement('input');input.type='text';input.maxLength=400;input.placeholder='说点什么…';input.setAttribute('aria-label','聊天消息');input.autocomplete='off';
   sendButton=document.createElement('button');sendButton.type='submit';sendButton.textContent='发送';status=document.createElement('p');status.className='chat-status';status.setAttribute('role','status');
   form.append(input,sendButton);dialog.append(note,list,form,status);paint();
   const current=transport;status.textContent='正在同步消息…';
   current.load().then(result=>{if(current!==transport||!list)return;for(const message of result.messages)append(message);status.textContent='';list.scrollTop=list.scrollHeight;}).catch(error=>{if(current===transport&&status)status.textContent=error.message||'消息加载失败，请关闭后重试';});
  }
  if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
  input?.focus();
 }
 function connect(next){
  if(transport?.roomId===next?.roomId)return;
  unsubscribe?.();unsubscribe=null;transport=next;messages=[];pending=null;close();
  if(next)unsubscribe=next.subscribe(append);
 }
 window.NobiRoomChat=Object.freeze({open,close,connect});
})();
