import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function publicConfig(local = '', env = {}) {
  const window = {};
  if (local) vm.runInNewContext(local, { window }, { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
  let injected = { ...(window.CONFIG || {}), ...(window.LOCAL_CONFIG || {}), ...(window.APP_CONFIG_LOCAL || {}) };
  if (env.SUPABASE_URL || env.SUPABASE_ANON_KEY) injected = { SUPABASE_URL: env.SUPABASE_URL || '', SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || '' };
  const context = { window: { CONFIG: injected, NobiPlatform: { isNative: () => true } }, URL, atob, console, CustomEvent: class {}, setTimeout: () => 1 };
  vm.runInNewContext(await fs.readFile(path.join(root, 'config.js'), 'utf8'), context, { timeout: 100 });
  // Explicit normalization throws on secret key: fail build, not a silent empty config.
  const config = context.window.NobiConfig.normalize(injected);
  if (!!config.SUPABASE_URL !== !!config.SUPABASE_ANON_KEY) throw new Error('Both public Supabase URL and anonymous key must be supplied together');
  return config;
}
