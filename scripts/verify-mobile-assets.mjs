import path from 'node:path';
import fs from 'node:fs';
import { root } from './verify-assets.mjs';
import { verifyBuild } from './verify-build.mjs';
const options=process.argv.slice(2);
if(options.some(value=>!['--platform=android','--platform=ios'].includes(value)))throw new Error('Unsupported native platform');
const selected=options.length?options.map(value=>value.split('=')[1]):['android','ios'];
for(const [platform,dir] of [['android','android/app/src/main/assets/public'],['ios','ios/App/App/public']].filter(([platform])=>selected.includes(platform))) {
  console.log(JSON.stringify({platform,...verifyBuild('mobile',path.join(root,dir))}));
}
for(const dir of selected.map(platform=>platform==='android'?'android/app/src/main/assets/capacitor.config.json':'ios/App/App/capacitor.config.json')) {
  const config=JSON.parse(fs.readFileSync(path.join(root,dir),'utf8'));
  if(config.appId!=='cn.obsmd.gogame'||config.webDir!=='dist/mobile'||config.server?.url) throw new Error('Unexpected native configuration: '+dir);
}
