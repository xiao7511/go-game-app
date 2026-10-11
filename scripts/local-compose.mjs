import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { guardLocalConfig,project,workdir,localUrl } from './local-supabase.mjs';
const run=promisify(execFile);
export const runtimeFile=fileURLToPath(new URL('../.nobi-isolated/phase3a/runtime.json',import.meta.url));
export function runtime(){const data=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));if(data.project!==project||data.url!==localUrl)throw new Error('BLOCKED: runtime identity mismatch');return data;}
function prepare(){
 if(fs.existsSync(runtimeFile))return runtime();
 const data={project,url:localUrl,backend:'compose',dbPassword:crypto.randomBytes(32).toString('hex'),jwtSecret:crypto.randomBytes(48).toString('hex'),realtimeEncryption:crypto.randomBytes(8).toString('hex'),secretBase:crypto.randomBytes(64).toString('hex')};
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({role:'anon',iss:'nobi-local',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400*365})).toString('base64url');
 data.key=header+'.'+payload+'.'+crypto.createHmac('sha256',data.jwtSecret).update(header+'.'+payload).digest('base64url');
 fs.mkdirSync(path.dirname(runtimeFile),{recursive:true});fs.writeFileSync(runtimeFile,JSON.stringify(data),{mode:0o600});return data;
}
const safe=text=>String(text).split(/\r?\n/).filter(line=>!/password|secret|token|key|postgres:\/\//i.test(line)).join('\n');
async function main(){
 guardLocalConfig();const action=process.argv[2],data=prepare();
 const args={start:['up','-d','--pull','never'],stop:['down'],reset:['down','--volumes']}[action];
 if(!args)throw new Error('Usage: node scripts/local-compose.mjs start|stop|reset');
 if(action==='reset'&&process.env.NOBI_ISOLATED_ACK!=='LOCAL_DISPOSABLE_ONLY')throw new Error('BLOCKED: disposable acknowledgement required for volume reset');
 const names=(await run('docker',['container','ls','-a','--format','{{.Names}}'],{windowsHide:true})).stdout.trim().split(/\r?\n/);
 const container='supabase_db_'+project;
 if(names.includes(container)) {
  const label=(await run('docker',['inspect','--format','{{ index .Config.Labels "com.nobi.project" }}',container],{windowsHide:true})).stdout.trim();
  if(label!==project)throw new Error('BLOCKED: database container ownership mismatch');
 }
 if(action==='reset') {
  const volumes=(await run('docker',['volume','ls','--format','{{.Name}}'],{windowsHide:true})).stdout.trim().split(/\r?\n/);
  if(volumes.includes('nobi-phase3a-local-db')) {
   const label=(await run('docker',['volume','inspect','--format','{{ index .Labels "com.nobi.project" }}','nobi-phase3a-local-db'],{windowsHide:true})).stdout.trim();
   if(label!==project)throw new Error('BLOCKED: disposable volume ownership mismatch');
  }
 }
 const env={...process.env,NOBI_LOCAL_DB_PASSWORD:data.dbPassword,NOBI_LOCAL_JWT_SECRET:data.jwtSecret,NOBI_LOCAL_REALTIME_ENCRYPTION:data.realtimeEncryption,NOBI_LOCAL_SECRET_BASE:data.secretBase};
 const result=await run('docker',['compose','--project-name',project,'--file',path.join(workdir,'compose.yaml'),...args],{env,timeout:120000,windowsHide:true,maxBuffer:1024*1024});
 console.log(safe(result.stdout+result.stderr));
 if(action==='start'){const {waitForLocalReady}=await import('./local-ready.mjs');await waitForLocalReady({url:data.url,key:data.key});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(safe(error.stderr||error.message)||'BLOCKED: local Compose operation failed');process.exitCode=2;});
