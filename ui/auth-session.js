// A live Auth session, rather than cached profile metadata, controls these pages.
(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 const destination=params.get('return')==='online'?'online.html?game='+(params.get('game')==='go'?'go':'guandan'):'game.html';
 window.NobiAuthDestination=destination;
 addEventListener('DOMContentLoaded',()=>{
  const form=document.querySelector('#login-form,#register-form');
  if(!form)return;
  form.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='正在检查登录状态…';form.before(status);
  const tools=document.createElement('div');tools.className='auth-connection-tools';
  const retry=document.createElement('button');retry.type='button';retry.textContent='重试连接';retry.hidden=true;
  const diagnose=document.createElement('button');diagnose.type='button';diagnose.textContent='检测登录网络';
  const result=document.createElement('p');result.setAttribute('role','status');result.className='auth-network-status';
  tools.append(retry,diagnose,result);form.after(tools);
  let checking=false,subscribed=false;
  async function check(){
   if(checking)return;checking=true;retry.disabled=true;status.hidden=false;status.textContent='正在检查登录状态…';
   try{
    if(await window.NobiServices.signedUser()){location.replace(destination);return;}
    form.hidden=false;status.hidden=true;retry.hidden=true;
    if(!subscribed){const sdk=await window.NobiServices.requireClient();sdk.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session?.user)location.replace(destination);});subscribed=true;}
   }catch(_){status.textContent='暂时无法确认登录状态，请重试连接；不会替换已登录账号。';retry.hidden=false;}
   finally{checking=false;retry.disabled=false;}
  }
  retry.onclick=check;
  diagnose.onclick=async()=>{
   diagnose.disabled=true;result.textContent='正在检测登录服务…';
   try{await window.NobiServices.checkLoginNetwork();result.textContent='登录服务连接正常。';if(retry.hidden===false)await check();}
   catch(error){result.textContent=error.message||'无法连接登录服务，请检查网络后重试。';}
   finally{diagnose.disabled=false;}
  };
  check();
 });
})();
