import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareCloudflareDownloads} from '../../scripts/prepare-cloudflare-downloads.mjs';

test('Cloudflare download preparation fails closed and only replaces the verified CI artifact',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nobi-cf-download-'));
 const bytes=Buffer.alloc(25*1024*1024+1,7),file='Nobi-android-1.0.8.apk';
 const apk=path.join(root,'app-downloads',file);
 try{
  await fs.mkdir(path.join(root,'ui'));await fs.mkdir(path.join(root,'app-downloads'));
  await fs.writeFile(apk,bytes);await fs.writeFile(path.join(root,'ui/app-release.js'),'window.NobiAppRelease='+JSON.stringify({android:{file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}));
  await fs.writeFile(path.join(root,'_redirects'),'/old /new 302\n');
  const missing=async()=>new Response('missing',{status:404});
  await expect(prepareCloudflareDownloads(root,{},missing)).rejects.toThrow('disposable');
  await expect(prepareCloudflareDownloads(root,{CF_PAGES:'1'},missing)).rejects.toThrow('not available');
  await expect(prepareCloudflareDownloads(root,{CF_PAGES:'1'},async()=>new Response('wrong'))).rejects.toThrow('differs');
  expect((await fs.stat(apk)).size).toBe(bytes.length);
  expect(await fs.readFile(path.join(root,'_redirects'),'utf8')).toBe('/old /new 302\n');
  let requested;
  await prepareCloudflareDownloads(root,{CF_PAGES:'1'},async url=>{requested=url;return new Response(bytes,{headers:{'content-type':'application/vnd.android.package-archive'}});});
  expect(requested).toBe('https://game-pkg.nobistudio.com/'+file);
  await expect(fs.stat(apk)).rejects.toMatchObject({code:'ENOENT'});
  expect(await fs.readFile(path.join(root,'_redirects'),'utf8')).toBe('/old /new 302\n/app-downloads/'+file+' https://game-pkg.nobistudio.com/'+file+' 302\n');
  expect(await fs.stat(path.join(root,'ui/app-release.js'))).toBeTruthy();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
