import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Pages has a 25 MiB per-file limit. GitHub Pages keeps the verified APK;
// Cloudflare's disposable checkout serves the same URL through our existing R2 bucket.
export async function prepareCloudflareDownloads(root, env=process.env, fetcher=fetch) {
 if(env.CF_PAGES!=='1')throw Error('Run only in a disposable Cloudflare Pages build checkout');
 const context={window:{}};
 vm.runInNewContext(await fs.readFile(path.join(root,'ui/app-release.js'),'utf8'),context,{timeout:100});
 const release=context.window.NobiAppRelease.android;
 if(!/^Nobi-android-\d+\.\d+\.\d+\.apk$/.test(release.file))throw Error('Invalid APK filename');
 const apkPath=path.join(root,'app-downloads',release.file);
 const bytes=await fs.readFile(apkPath);
 if(bytes.length!==release.bytes||createHash('sha256').update(bytes).digest('hex')!==release.sha256)throw Error('Local APK differs from release manifest');
 if(bytes.length<=25*1024*1024)return;
 const url='https://game-pkg.nobistudio.com/'+release.file;
 const response=await fetcher(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(120000)});
 if(response.status!==200||response.headers.get('content-type')?.includes('text/html'))throw Error('R2 APK is not available: '+response.status);
 const hash=createHash('sha256');let count=0;
 for await(const chunk of response.body){count+=chunk.length;hash.update(chunk);}
 if(count!==release.bytes||hash.digest('hex')!==release.sha256)throw Error('R2 APK differs from release manifest');
 const rule=`/app-downloads/${release.file} ${url} 302\n`;
 let redirects='';try{redirects=await fs.readFile(path.join(root,'_redirects'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(redirects.split('\n').some(line=>line.trim().startsWith('/app-downloads/')))throw Error('Review existing download redirect before replacing it');
 await fs.writeFile(path.join(root,'_redirects'),redirects+(redirects&&!redirects.endsWith('\n')?'\n':'')+rule);
 // Only this exact, hash-verified artifact in the disposable CI checkout is removed.
 await fs.unlink(apkPath);
 console.log(JSON.stringify({download:url,bytes:count,sha256:release.sha256,cloudflare:'ready'}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 await prepareCloudflareDownloads(fileURLToPath(new URL('../',import.meta.url)));
}
