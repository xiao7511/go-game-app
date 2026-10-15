// A live Auth session, rather than cached profile metadata, controls these pages.
(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 const destination=params.get('return')==='online'?'online.html?game='+(params.get('game')==='go'?'go':'guandan'):'game.html';
 window.NobiAuthDestination=destination;
 addEventListener('DOMContentLoaded',async()=>{
  const form=document.querySelector('#login-form,#register-form');
  if(!form)return;
  form.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='正在检查登录状态…';form.before(status);
  try{
   if(await window.NobiServices.signedUser()){location.replace(destination);return;}
   form.hidden=false;status.remove();
   const sdk=await window.NobiServices.requireClient();
   sdk.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session?.user)location.replace(destination);});
  }catch(_){status.textContent='暂时无法确认登录状态，请检查网络后刷新。';}
 });
})();
