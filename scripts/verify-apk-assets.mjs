import {extractApkAssets} from './apk-assets.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { verifyBuild } from './verify-build.mjs';
import { verifyRegions,manifest,extractRegion,sha256 } from './verify-assets.mjs';
const options=process.argv.slice(2);
if(options.some(value=>!['--phase=phase3a','--phase=phase3d','--phase=mobile-device'].includes(value)))throw new Error('Unsupported APK verification option');
const phase=options[0]?.split('=')[1]??'phase3a';
const extract=await extractApkAssets(phase);
const sourceGoRendering=verifyRegions();
const appRegions=manifest.protected_regions.filter(entry=>!entry.path.startsWith('www/'));
for(const entry of appRegions){const source=fs.readFileSync(path.join(extract.directory,entry.path),'utf8');if(sha256(extractRegion(source,entry.region))!==entry.baseline_sha256)throw new Error('Changed APK Go rendering: '+entry.region);}
const result={status:'PASS',apkBytes:extract.bytes,apkSha256:extract.sha256,...verifyBuild('mobile',extract.directory),sourceGoRendering,apkGoRendering:{count:appRegions.length,status:'PASS'}};
fs.writeFileSync(path.join('.nobi-isolated',phase,'apk-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
