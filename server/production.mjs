// Single writer with a persistent volume, behind the hosting provider's HTTPS proxy.
import fs from 'node:fs';
import path from 'node:path';
import {publicConfig} from '../scripts/public-config.mjs';
import {startDeviceServer,onlineAuthenticator} from './device-test.mjs';
const config=await publicConfig('',process.env);
if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY)throw new Error('Public Auth configuration required');
const origins=(process.env.NOBI_ALLOWED_ORIGINS||'').split(',').filter(Boolean).map(value=>{const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value)throw new Error('Exact HTTPS origins required');return value;});
if(!origins.length)throw new Error('NOBI_ALLOWED_ORIGINS required');
const database=process.env.NOBI_ROOM_DATABASE;if(!database||!path.isAbsolute(database))throw new Error('Persistent absolute database path required');
fs.mkdirSync(path.dirname(database),{recursive:true});
const port=Number(process.env.PORT||8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const host=process.env.NOBI_BIND_HOST||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('Invalid bind host');
const service=await startDeviceServer({authenticate:onlineAuthenticator(config),database,port,host,origins,production:true});
console.log('Nobi online authority ready; persistent, unranked.');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await service.close();process.exit(0);});
