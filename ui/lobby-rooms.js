// Authenticated, public room directory only. No match state or hand data is fetched here.
(() => {
 'use strict';
 let owner=null,visible=false,revision=0,pending=null;
 let state={owner:null,status:'idle',rooms:[],total:0,offset:0,hasNext:false};
 const listeners=new Set(),emit=()=>listeners.forEach(fn=>fn(state));
 const active=()=>visible&&!document.hidden&&!document.body.classList.contains('in-game-match');
 function setUser(user){owner=user?.id||null;revision++;pending=null;state={owner,status:owner?'idle':'login-required',rooms:[],total:0,offset:0,hasNext:false};emit();if(owner&&active())refresh();}
 async function refresh(offset=state.offset){
  if(!owner||pending)return;
  const config=window.NOBI_ONLINE_CONFIG;
  if(!config?.url){state={...state,status:'unavailable'};emit();return;}
  const mine=revision,uid=owner,operation={};pending=operation;
  state={...state,status:'loading',offset:Math.max(0,Math.floor(offset/50)*50)};emit();
  try{
   const sdk=await window.NobiServices.requireClient(),session=await sdk.auth.getSession();
   if(session.error||session.data?.session?.user?.id!==uid)throw Error('auth');
   const response=await fetch(config.url+'/rooms?offset='+state.offset,{headers:{Authorization:'Bearer '+session.data.session.access_token},cache:'no-store',redirect:'error',signal:window.NobiRequestTimeout(15000)});
   if(!response.ok)throw Error('directory');
   const value=await response.json();
   if(mine!==revision||uid!==owner)return;
   if(!Array.isArray(value.rooms)||!Number.isSafeInteger(value.total))throw Error('directory');
   state={owner:uid,status:'ready',rooms:value.rooms.filter(r=>['waiting','playing'].includes(r.status)&&['go','guandan','xiangqi'].includes(r.kind)),total:value.total,offset:state.offset,hasNext:!!value.hasNext};
   // Rooms may finish while browsing a later page; recover to the first page.
   if(!state.rooms.length&&state.offset>0){pending=null;return refresh(0);}
  }catch{if(mine!==revision||uid!==owner)return;state={...state,status:'error',rooms:[],total:0,hasNext:false};}
  finally{if(pending===operation){pending=null;emit();}}
 }
 function setVisible(value){const changed=value!==visible;visible=value;if(changed&&active()&&owner)refresh(0);}
 window.NobiLobbyRooms=Object.freeze({setUser,setVisible,refresh,get:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
 setInterval(()=>{if(owner&&active())refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(owner&&active())refresh();});
 window.addEventListener('pageshow',()=>{if(owner&&active())refresh();});
})();
