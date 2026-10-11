import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
export const project = 'nobi-phase3a-local';
export const workdir = fileURLToPath(new URL('../infrastructure/local-supabase/', import.meta.url));
export const localUrl = 'http://127.0.0.1:55421';
const cli = path.join(workdir, 'node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
export function guardLocalConfig() {
  const config = fs.readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${project}"`) || !config.includes('port = 55421') || fs.existsSync(path.join(workdir, 'supabase/.temp/project-ref'))) throw new Error('BLOCKED: local project identity/port changed or linked remote project detected');
}
export async function cliCommand(args, timeout = 240000) {
  guardLocalConfig();
  return run(cli, [...args, '--workdir', workdir, '--agent', 'no'], { cwd: workdir, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}
export async function localCredentials() {
  const { runtimeFile, runtime } = await import('./local-compose.mjs');
  if(fs.existsSync(runtimeFile)) { guardLocalConfig(); const data=runtime(); return {url:data.url,key:data.key}; }
  const { stdout } = await cliCommand(['status', '--output', 'json'], 20000);
  const status = JSON.parse(stdout);
  const url = status.API_URL ?? status.api_url;
  const key = status.ANON_KEY ?? status.anon_key;
  if (url !== localUrl || !key) throw new Error('BLOCKED: local status does not match dedicated API');
  return { url, key };
}
function safeOutput(value) {
  return String(value).split(/\r?\n/).filter(line => !/key|secret|token|password|postgresql:\/\//i.test(line)).join('\n').replace(/eyJ[A-Za-z0-9_.-]+/g, '[REDACTED]');
}
async function main() {
  const action = process.argv[2];
  const args = {
    start: ['start', '--exclude', 'studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta'],
    stop: ['stop'], reset: ['db', 'reset', '--local'], status: ['status', '--output', 'json']
  }[action];
  if (!args) throw new Error('Usage: node scripts/local-supabase.mjs start|stop|reset|status');
  if (action === 'reset' && process.env.NOBI_ISOLATED_ACK !== 'LOCAL_DISPOSABLE_ONLY') throw new Error('BLOCKED: reset requires NOBI_ISOLATED_ACK=LOCAL_DISPOSABLE_ONLY');
  const result = await cliCommand(args);
  if (action === 'status') {
    const { url } = await localCredentials();
    console.log(`PASS: ${project} API ${url}; credentials withheld`);
  } else console.log(safeOutput(result.stdout + result.stderr));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.killed ? 'BLOCKED: CLI exceeded 240-second limit' : safeOutput(error.stderr || error.message)); process.exitCode = 1;
});
