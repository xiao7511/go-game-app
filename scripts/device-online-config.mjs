export function deviceOnlineConfig(env,auth) {
 if(env.NOBI_ONLINE_URL){
  if(env.NOBI_DEVICE_ONLINE)throw new Error('Production and USB modes cannot be combined');
  const url=new URL(env.NOBI_ONLINE_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(url.pathname))throw new Error('Clean HTTPS online endpoint required');
  if(!auth.SUPABASE_URL||!auth.SUPABASE_ANON_KEY)throw new Error('Online account configuration required');
  return {mode:'production',url:url.origin+url.pathname.replace(/\/$/,''),supabaseUrl:auth.SUPABASE_URL,ranked:false};
 }
 if(!env.NOBI_DEVICE_ONLINE)return null;
 if(env.NOBI_DEVICE_ONLINE!=='USB_LOCAL_AUTH_VERIFIED')throw new Error('Unsupported device online mode');
 if(!auth.SUPABASE_URL||!auth.SUPABASE_ANON_KEY)throw new Error('Online account configuration required');
 return {mode:'usb-test',url:'http://127.0.0.1:55440',supabaseUrl:auth.SUPABASE_URL,ranked:false};
}
