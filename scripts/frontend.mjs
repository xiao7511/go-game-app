import fs from 'node:fs/promises';
import path from 'node:path';
import { build, createServer, preview, loadEnv } from '../tooling/node_modules/vite/dist/node/index.js';
import { build as bundle } from '../tooling/node_modules/esbuild/lib/main.js';
import { root, verifyCards, verifyRegions } from './verify-assets.mjs';
import { publicConfig } from './public-config.mjs';
import { verifyBuild } from './verify-build.mjs';
import { deviceOnlineConfig } from './device-online-config.mjs';
import { copyAppDownloads, webDownloadAssets } from './app-download-assets.mjs';

const action = process.argv[2] || 'build';
const target = process.argv[3] === 'mobile' ? 'mobile' : 'web';
const subpath = process.argv[3] === 'subpath';
const isolated=process.argv[3]==='isolated';
const online=process.argv[3]==='online';
if(isolated&&action!=='dev')throw new Error('BLOCKED: isolated credentials are development-only; use the normal Web/App build');
if(online&&action!=='dev')throw new Error('Online login configuration is development-only; use the normal Web/App build');
const stageTarget=isolated?'isolated':online?'online':target;
const stage = path.join(root, '.nobi-stage', stageTarget);
const outDir = path.join(root, 'dist', target);
const pages = ['index.html', 'login.html', 'register.html', 'game.html', 'online.html'];
const scripts = ['config.js', 'supabaseClient.js', 'platform.js', 'game.js', 'multiplayer-ext.js', 'guandan-game.js', 'guandan-mp-ext.js'];

if (action !== 'preview') {
  verifyCards(); verifyRegions();
  // Only this explicitly validated generated directory is cleaned; source/history never are.
  if (path.relative(root, stage) !== path.join('.nobi-stage', stageTarget)) throw new Error('Unsafe stage path');
  await fs.rm(stage, { recursive: true, force: true });
  const publicDir = path.join(stage, 'public');
  await fs.mkdir(publicDir, { recursive: true });
  for (const name of scripts) await fs.copyFile(path.join(root, name), path.join(publicDir, name));
  for (const name of ['images/cards', 'assets/sounds', 'assets/music', 'ui']) await fs.cp(path.join(root, name), path.join(publicDir, name), { recursive: true });
  // Download metadata contains the APK hash. Keep it Web-only so an APK never
  // embeds its own download hash and native assets remain independently verifiable.
  if(target==='mobile')for(const name of webDownloadAssets)await fs.rm(path.join(publicDir,name),{force:true});
  for (const name of ['manifest.json', 'icon-192-v1.png', 'icon-512-v1.png', 'apple-touch-icon-v1.png', 'favicon-v1.ico', 'icon.svg']) await fs.copyFile(path.join(root, name), path.join(publicDir, name));
  if (target === 'web') {
    await copyAppDownloads(publicDir);
    await fs.copyFile(path.join(root, 'CNAME'), path.join(publicDir, 'CNAME'));
    await fs.cp(path.join(root, 'pc'), path.join(publicDir, 'pc'), { recursive: true });
  }
  const env = isolated||online?{}:{ ...loadEnv('production', root, ''), ...process.env };
  let local = '';
  try { if(!isolated&&!online)local = await fs.readFile(path.join(root, 'config.local.js'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if(isolated){const {localCredentials}=await import('./local-supabase.mjs');const config=await localCredentials();env.SUPABASE_URL=config.url;env.SUPABASE_ANON_KEY=config.key;}
  if(online){
    const host=(await fs.readFile(path.join(root,'CNAME'),'utf8')).trim();
    if(!/^[a-z0-9.-]+$/i.test(host))throw new Error('Invalid game site hostname');
    const {onlinePublicConfig}=await import('./online-public-config.mjs');
    Object.assign(env,await onlinePublicConfig('https://'+host));
    console.log('Online account login configured for local development; anonymous key not logged.');
  }
  // Public configuration only. Never inject a service-role/secret key.
  const authConfig=await publicConfig(local,env);
  await fs.writeFile(path.join(publicDir, 'config.local.js'), `window.CONFIG=${JSON.stringify(authConfig)};\n`);
  await fs.writeFile(path.join(publicDir,'online-config.js'),isolated?'window.NOBI_ONLINE_CONFIG={url:"http://127.0.0.1:55430",supabaseUrl:"http://127.0.0.1:55421"};\n':`window.NOBI_ONLINE_CONFIG=${JSON.stringify(deviceOnlineConfig(process.env,authConfig))};\n`);
  await fs.writeFile(path.join(publicDir, 'build-target.js'), `window.NOBI_BUILD_TARGET=${JSON.stringify(target)};\n`);
  await bundle({ entryPoints: [path.join(root, 'tooling/sdk-entry.js')], outfile: path.join(publicDir, 'vendor/supabase.js'), bundle: true, minify: true, platform: 'browser', target: 'es2020', format: 'iife' });
  for (const name of pages) {
    let html = await fs.readFile(path.join(root, name), 'utf8');
    html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/g, '<script src="vendor/supabase.js"></script>');
    if (target === 'mobile') html = html.replace(/<script src="pc\/cs16-adapter.js"><\/script>/g, '');
    if (target === 'mobile') html = html.replace(/<script src="ui\/app-(?:release|downloads)\.js"><\/script>/g,'').replace(/<link rel="stylesheet" href="ui\/app-downloads\.css">/g,'');
    await fs.writeFile(path.join(stage, name), html);
  }
}

const config = { configFile: false, root: stage, publicDir: path.join(stage, 'public'), base: subpath ? '/go-game-app/' : './',
  build: { outDir, emptyOutDir: true, cssMinify: false, rollupOptions: { input: Object.fromEntries(pages.map(name => [name.slice(0, -5), path.join(stage, name)])) } },
  server: { host: '127.0.0.1', port: 5178, strictPort: true, fs: { strict: true, allow: [stage] } },
  preview: { host: '127.0.0.1', port: subpath ? 4175 : target === 'mobile' ? 4174 : 4173, strictPort: true }
};
if(isolated)config.server.port=5189;
if (action === 'build') { await build(config); console.log(JSON.stringify(verifyBuild(target))); console.log(`Built ${target}: dist/${target}`); }
else if (action === 'dev') { const server = await createServer(config); await server.listen(); server.printUrls(); }
else if (action === 'preview') { const server = await preview(config); server.printUrls(); }
else throw new Error(`Unknown action: ${action}`);
