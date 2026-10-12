(() => {
 'use strict';let owner=null,data=null,revision=0;const listeners=new Set();
 const emit=()=>listeners.forEach(fn=>fn(data));
 const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
 async function refresh(user){const current=++revision;owner=user?.id||null;data=null;emit();if(!owner)return;const uid=owner;
  const profile=window.NobiServices.getProfile(uid).catch(()=>null);
  const history=(async()=>{const config=window.NOBI_ONLINE_CONFIG;if(!['production','usb-test'].includes(config?.mode))return null;const sdk=await window.NobiServices.requireClient(),{data}=await sdk.auth.getSession();if(!data.session)return null;const response=await fetch(config.url+'/me/summary',{headers:{Authorization:'Bearer '+data.session.access_token},signal:window.NobiRequestTimeout(15000),cache:'no-store',redirect:'error'});if(!response.ok)return null;return response.json();})().catch(()=>null);
  const [p,h]=await Promise.all([profile,history]);if(current!==revision||uid!==owner)return;
  data={score:numeric(p?.score??p?.points),rank:Number.isSafeInteger(numeric(p?.ranking))&&numeric(p?.ranking)>0?numeric(p.ranking):null,tier:typeof p?.rank==='string'?p.rank:null,summary:h?.summary||null,history:h?.rows||[]};emit();
 }
 window.NobiAccountInfo=Object.freeze({refresh,get:()=>data,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
 window.addEventListener('pageshow',()=>{if(owner)window.NobiServices.requireUser().then(refresh).catch(()=>refresh(null));});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&owner)window.NobiServices.requireUser().then(refresh).catch(()=>{});});
})();
