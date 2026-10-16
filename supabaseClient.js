/* One Auth/Realtime client; database schema is explicit at each boundary. */
(() => {
  'use strict';
  let client = null;
  let signingIn = null;
  let authRequest = null;
  // Keep the SDK's project URL/storage key and JWT issuer unchanged. Only the
  // production Auth HTTP transport uses our dual-stack HTTPS gateway.
  const productionAuth='https://kogjjfccyncdszuuwlun.supabase.co';
  const authGateway='https://api.nobistudio.com/nobi-online/auth/';
  function createAuthFetch(base,request=window.fetch.bind(window),timeoutMs=12000) {
    const source=new URL(base);
    return async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url??input.href);
      if(url.origin!==source.origin||!url.pathname.startsWith('/auth/v1/'))return request(input,init);
      const target=source.origin===productionAuth?authGateway+url.pathname.slice('/auth/v1/'.length)+url.search:url.href;
      const controller=new AbortController(),parent=init.signal??input?.signal;
      let timedOut=false;
      const cancel=()=>controller.abort(parent.reason);
      if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      try{
        const outbound=typeof Request!=='undefined'&&input instanceof Request?new Request(target,input):target;
        const response=await request(outbound,{...init,signal:controller.signal});
        // Cover reading the body as well as connecting: a stalled response must
        // not leave the login button or session verification pending forever.
        const body=await response.arrayBuffer();
        return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(error){
        if(parent?.aborted)throw error;
        const failure=new Error(timedOut?'登录服务连接超时，请检查网络后重试。':'无法连接登录服务，请检查当前网络后重试。');
        failure.name='AuthNetworkError';throw failure;
      }finally{clearTimeout(timer);parent?.removeEventListener('abort',cancel);}
    };
  }
  function getClient() { return client; }
  async function requireClient() {
    await ready;
    if (!client) throw new Error('Supabase 配置不可用，请检查公开配置');
    return client;
  }
  async function requireUser() {
    const sdk = await requireClient();
    const { data, error } = await sdk.auth.getUser();
    if (error || !data?.user?.id) throw new Error('请先登录后再进行联机对局');
    return data.user;
  }
  async function signedUser() {
    const sdk = await requireClient();
    const session = await sdk.auth.getSession();
    if(session.error) throw session.error;
    if(!session.data?.session) return null;
    const {data,error} = await sdk.auth.getUser();
    if(error) throw error;
    return data?.user || null;
  }
  function signInOnce(credentials) {
    if(signingIn) return signingIn;
    const authenticate = async()=>{
      const sdk=await requireClient(),user=await signedUser();
      if(user){const {data,error}=await sdk.auth.getSession();return {data:{...data,user},error,alreadySignedIn:true};}
      return sdk.auth.signInWithPassword(credentials);
    };
    signingIn=(navigator.locks?.request?navigator.locks.request('nobi-account-sign-in',authenticate):authenticate()).finally(()=>{signingIn=null;});
    return signingIn;
  }
  async function getProfile(playerId) {
    const sdk = await requireClient();
    const { data, error } = await sdk.schema('public').rpc('get_player_profile', { player_id: playerId });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }
  async function checkLoginNetwork(){
    await requireClient();
    const config=window.NobiConfig.get();
    const response=await authRequest(config.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:config.SUPABASE_ANON_KEY}});
    if(!response.ok)throw new Error('登录服务暂时不可用（HTTP '+response.status+'），请稍后重试。');
    let result;try{result=await response.json();}catch(_){throw new Error('登录服务响应异常，请稍后重试。');}
    if(result.name!=='GoTrue')throw new Error('登录服务响应异常，请稍后重试。');
    return {ok:true};
  }
  const ready = window.NobiConfig.ready.then(config => {
    if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase?.createClient) {
      authRequest=createAuthFetch(config.SUPABASE_URL);
      client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { db: { schema: 'public' }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !window.NobiPlatform?.isNative() },global:{fetch:authRequest} });
    }
    return client;
  });
  window.NobiServices = Object.freeze({ ready, getClient, requireClient, requireUser, getProfile, signedUser, signInOnce, checkLoginNetwork });
  window.getSupabaseClient = getClient;
})();
