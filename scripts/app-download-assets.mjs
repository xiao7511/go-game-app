import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {root} from './verify-assets.mjs';
export const webDownloadAssets=['ui/app-release.js','ui/app-downloads.js','ui/app-downloads.css'];
export async function appRelease(){const context={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'ui/app-release.js'),'utf8'),context,{timeout:100});return context.window.NobiAppRelease;}
export async function copyAppDownloads(publicDir){
 const release=await appRelease(),file=release.android.file;
 if(!/^Nobi-android-\d+\.\d+\.\d+\.apk$/.test(file))throw Error('Invalid public APK filename');
 const bytes=await fs.readFile(path.join(root,'app-downloads',file));
 if(bytes.length!==release.android.bytes||createHash('sha256').update(bytes).digest('hex')!==release.android.sha256)throw Error('Public Android package does not match approved delivered release');
 await fs.mkdir(path.join(publicDir,'app-downloads'),{recursive:true});await fs.writeFile(path.join(publicDir,'app-downloads',file),bytes);
}
