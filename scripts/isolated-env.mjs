export function validateIsolatedEnvironment(env) {
  if(env.NOBI_ISOLATED_ACK!=='LOCAL_DISPOSABLE_ONLY') throw new Error('BLOCKED: explicit disposable-local acknowledgment required');
  const url=new URL(env.NOBI_TEST_SUPABASE_URL || 'https://invalid.example');
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !['54321','54421'].includes(url.port) || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new Error('BLOCKED: only dedicated loopback Supabase ports 54321/54421 are allowed');
  const key=env.NOBI_TEST_SUPABASE_ANON_KEY || '';
  if(!key || key.startsWith('sb_secret_')) throw new Error('BLOCKED: local anonymous key required');
  if(key.split('.').length===3) {
    let payload;try {payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch {throw new Error('BLOCKED: invalid public key');}
    if(payload.role!=='anon') throw new Error('BLOCKED: only anon role is allowed');
  } else if(!key.startsWith('sb_publishable_')) throw new Error('BLOCKED: unsupported public key');
  const users=JSON.parse(env.NOBI_TEST_USERS_JSON || '[]');
  if(users.length!==4 || new Set(users.map(u=>u.email)).size!==4 || users.some(u=>typeof u.email!=='string' || typeof u.password!=='string' || !u.email || !u.password)) throw new Error('BLOCKED: four distinct disposable test accounts required');
  return {url:url.origin,key,users};
}

export function createIsolatedFetch(origin,transport=fetch) {
  return (input,init)=>{
    const target=typeof input==='string' || input instanceof URL ? input : input.url;
    if(new URL(target).origin!==origin) throw new Error('Non-local request refused');
    return transport(input,{...init,redirect:'error',signal:AbortSignal.timeout(10000)});
  };
}
