import {Worker} from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardLocalConfig, project } from './local-supabase.mjs';
export const container = `supabase_db_${project}`;
let tcpWorker;
export function localSql(sql) {
 if(process.env.NOBI_LOCAL_DB_TRANSPORT==='tcp'){
  guardLocalConfig();if(!tcpWorker){tcpWorker=new Worker(new URL('./local-pg-worker.mjs',import.meta.url));tcpWorker.unref();}
  const shared=new SharedArrayBuffer(16*1024*1024),flags=new Int32Array(shared,0,3);tcpWorker.postMessage({sql,shared});
  if(Atomics.wait(flags,0,0,20000)==='timed-out'){tcpWorker.terminate();tcpWorker=null;throw Error('isolated SQL worker deadline');}
  const output=Buffer.from(new Uint8Array(shared,12,flags[1])).toString();if(flags[0]!==1)throw Error(output);return output.trim();
 }

 guardLocalConfig();
 const identity=execFileSync('docker',['inspect','--format','{{ or (index .Config.Labels "com.nobi.project") (index .Config.Labels "com.supabase.cli.project") }}',container],{encoding:'utf8',windowsHide:true}).trim();
 if(identity!==project) throw new Error('BLOCKED: container project label mismatch');
 return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true,timeout:15000}).trim();
}
export function literal(value) { return "'"+String(value).replaceAll("'","''")+"'"; }
export function migrate() {
 const dir=new URL('../infrastructure/local-supabase/supabase/migrations/',import.meta.url);
 localSql('create table if not exists public.nobi_local_migrations(name text primary key,sha256 text not null); revoke all on public.nobi_local_migrations from anon,authenticated;');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) {
  const raw=fs.readFileSync(new URL(name,dir),'utf8').replace(/^\uFEFF/,'');
  const sql=raw.replace(/\r\n/g,'\n');
  const hash=crypto.createHash('sha256').update(sql).digest('hex');
  let applied=localSql(`select sha256 from public.nobi_local_migrations where name=${literal(name)}`);
  const rawHash=crypto.createHash('sha256').update(raw).digest('hex');
  if(applied===rawHash&&applied!==hash){localSql(`update public.nobi_local_migrations set sha256=${literal(hash)} where name=${literal(name)} and sha256=${literal(rawHash)}`);applied=hash;}
  if(applied&&applied!==hash)throw new Error('BLOCKED: applied migration changed; rebuild disposable volume explicitly');
  if(!applied) localSql(`begin; ${sql}\ninsert into public.nobi_local_migrations values(${literal(name)},${literal(hash)}); commit;`);
  console.log('PASS: migration '+name);
 }
 localSql("notify pgrst, 'reload schema';");
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 if(process.argv[2]==='migrate') migrate();
 else if(process.argv[2]==='verify') console.log(localSql(fs.readFileSync(new URL('../infrastructure/local-supabase/sql/verify-contract.sql',import.meta.url),'utf8').replace(/^\uFEFF/,'')));
 else throw new Error('Usage: node scripts/local-db.mjs migrate|verify');
}