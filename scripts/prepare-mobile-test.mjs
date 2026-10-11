// Explicit online-account test build. Only the deployed site's public anon config is bundled.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {onlinePublicConfig} from './online-public-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),usb=args.includes('--usb-test'),options=args.filter(value=>value!=='--usb-test');
if(options.length>1||options.some(value=>!['--platform=android','--platform=ios'].includes(value)))throw new Error('Use --platform=android or --platform=ios, or no arguments for both');
const platforms=options.length?[options[0].split('=')[1]]:['android','ios'];
if(usb&&(platforms.length!==1||platforms[0]!=='android'))throw new Error('USB test build requires --platform=android');
const host=(await fs.readFile(path.join(root,'CNAME'),'utf8')).trim();
if(!/^[a-z0-9.-]+$/i.test(host))throw new Error('Invalid configured site hostname');
const config=await onlinePublicConfig('https://'+host);
const result=spawnSync(process.execPath,['scripts/frontend.mjs','build','mobile'],{
 cwd:root,env:{...process.env,...config,NOBI_DEVICE_ONLINE:usb?'USB_LOCAL_AUTH_VERIFIED':''},stdio:'inherit',windowsHide:true
});
if(result.error||result.status!==0)throw new Error('Mobile test build failed');
for(const platform of platforms){
 const copy=spawnSync(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','copy',platform],{cwd:root,stdio:'inherit',windowsHide:true});
 if(copy.error||copy.status!==0)throw new Error('Native copy failed: '+platform);
}
const check=spawnSync(process.execPath,['scripts/verify-mobile-assets.mjs',...platforms.map(platform=>'--platform='+platform)],{cwd:root,stdio:'inherit',windowsHide:true});
if(check.error||check.status!==0)throw new Error('Native asset verification failed');
console.log('Mobile online-account test assets ready; public anonymous key not logged.');
