import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { root, verifyCards, sha256, manifest, extractRegion } from './verify-assets.mjs';
import { verifyDistribution } from './security-audit.mjs';
import {webDownloadAssets} from './app-download-assets.mjs';

export function verifyBuild(target='web',base=path.join(root,'dist',target)) {
  verifyCards(base); verifyDistribution(base);
  for(const entry of manifest.protected_regions.filter(entry=>!entry.path.startsWith('www/'))) {
    const source=fs.readFileSync(path.join(base,entry.path),'utf8');
    if(sha256(extractRegion(source,entry.region))!==entry.baseline_sha256) throw new Error('Changed compiled Go rendering: '+entry.region);
  }
  for(const name of ['ui/xiangqi-engine.mjs','ui/xiangqi.js','ui/xiangqi-worker.mjs','ui/xiangqi-loader.js','ui/xiangqi.css','ui/xiangqi-cover.svg',...['like','cheer','respect','laugh','think','celebrate'].map(id=>'ui/chat-stickers/'+id+'.svg'),...(target==='web'?webDownloadAssets:[]),'ui/lobby-rooms.js','ui/game-invitations.js','ui/game-invitations.css','ui/auth-session.js','ui/navigation.js','ui/navigation.css','ui/go-match.css','ui/avatars.js',...Array.from({length:8},(_,id)=>`ui/avatar-presets/${id}.svg`),'ui/guandan-rules.mjs','ui/guandan-engine.mjs','ui/guandan-deal.mjs','ui/account-info.js','ui/room-chat.js','ui/room-chat.css','ui/audio-manifest.js','ui/audio-manager.js','ui/rankings.js','ui/match.js','ui/match.css','ui/online.js','ui/online.css','ui/request-timeout.js']) {
    if(sha256(fs.readFileSync(path.join(base,name)))!==sha256(fs.readFileSync(path.join(root,name)))) throw new Error('Stale UI module: '+name);
  }
  for(const name of ['index.html','login.html','register.html','game.html','online.html','online-config.js','game.js','multiplayer-ext.js','guandan-game.js','guandan-mp-ext.js','config.js','supabaseClient.js','config.local.js','platform.js','vendor/supabase.js','ui/registry.js','ui/lobby.js','ui/lobby.css','ui/tokens.css','ui/auth.css','ui/brand.svg']) {
    if(!fs.statSync(path.join(base,name)).size) throw new Error('Missing/empty build file: '+name);
    if((name.startsWith('ui/') || ['game.js','multiplayer-ext.js','guandan-game.js','guandan-mp-ext.js'].includes(name)) && sha256(fs.readFileSync(path.join(base,name)))!==sha256(fs.readFileSync(path.join(root,name)))) throw new Error('Stale script/resource: '+name);
  }
  for(const folder of ['assets/sounds','assets/music']) for(const name of fs.readdirSync(path.join(root,folder))) {
    if(sha256(fs.readFileSync(path.join(base,folder,name)))!==sha256(fs.readFileSync(path.join(root,folder,name)))) throw new Error('Missing/changed audio: '+name);
  }
  for(const name of ['reference-upgrade.css','lobby-night-v3.jpg','guandan-room-v3.jpg','go-cover-v3.jpg','cs16-cover-v1.jpg']) {
    if(sha256(fs.readFileSync(path.join(base,'ui',name)))!==sha256(fs.readFileSync(path.join(root,'ui',name)))) throw new Error('Missing/changed reference presentation asset: '+name);
  }
  if(target==='web'){
    const releaseContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'ui/app-release.js'),'utf8'),releaseContext,{timeout:100});
    const release=releaseContext.window.NobiAppRelease.android;
    const apk=fs.readFileSync(path.join(base,'app-downloads',release.file));if(apk.length!==release.bytes||sha256(apk)!==release.sha256)throw new Error('Incorrect published Android download');
  } else {
    if(fs.existsSync(path.join(base,'app-downloads')))throw new Error('Web download APK must not be bundled inside the App');
    for(const name of webDownloadAssets)if(fs.existsSync(path.join(base,name)))throw new Error('Web download metadata must not be bundled inside the App: '+name);
  }
  const html=fs.readFileSync(path.join(base,'game.html'),'utf8');
  if(target==='mobile' && (fs.existsSync(path.join(base,'pc')) || html.includes('pc/cs16-adapter.js'))) throw new Error('PC adapter in App');
  if(target==='web' && !fs.statSync(path.join(base,'pc/cs16-adapter.js')).size) throw new Error('PC adapter missing');
  for(const name of ['index.html','login.html','register.html','game.html','online.html']) {
    const content=fs.readFileSync(path.join(base,name),'utf8').replace(/<!--[\s\S]*?-->/g,'');
    for(const match of content.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const url=match[1].split(/[?#]/)[0];
      if(/^(?:https?:|data:|mailto:|javascript:)/.test(url) || !url) continue;
      if(url.startsWith('/') || !fs.existsSync(path.join(base,url))) throw new Error(`Invalid local path in ${name}: ${url}`);
    }
  }
  return {target,cards:56,sounds:fs.readdirSync(path.join(root,'assets/sounds')).length,music:fs.readdirSync(path.join(root,'assets/music')).length,publication:'PASS',status:'PASS'};
}
if(process.argv[1]?.endsWith('verify-build.mjs')) for(const target of ['web','mobile']) console.log(JSON.stringify(verifyBuild(target)));
