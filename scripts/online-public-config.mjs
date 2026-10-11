import { publicConfig } from './public-config.mjs';

// Fetch the same public anon configuration used by the deployed login page.
// This is opt-in for the local development server, never a build-time default.
export async function onlinePublicConfig(origin, request = fetch) {
  const source=new URL(origin);
  if(source.protocol!=='https:' || source.username || source.password || source.pathname!=='/' || source.search || source.hash) throw new Error('Invalid public configuration origin');
  const response=await request(new URL('/get-config',source),{
    headers:{Referer:new URL('/login.html',source).href},
    redirect:'error',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) throw new Error('Online public login configuration is unavailable (HTTP '+response.status+')');
  const config=await publicConfig('',await response.json());
  if(!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) throw new Error('Online public login configuration is empty');
  return config;
}
