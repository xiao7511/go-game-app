import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import yauzl from 'yauzl';

// Read only local Debug APKs. Extract only public web assets into a new ignored directory.
export async function extractApkAssets(phase='phase3a') {
  if(!['phase3a','phase3d','mobile-device'].includes(phase))throw new Error('Unsupported APK verification phase');
  const root=await fs.realpath('.');
  const buildRoot=await fs.realpath(path.join(root,'android/app/build'));
  const apk=await fs.realpath(path.join(buildRoot,'outputs/apk/debug/app-debug.apk'));
  if(!apk.toLowerCase().startsWith((buildRoot+path.sep).toLowerCase()))throw new Error('APK outside Android build directory');
  const bytes=(await fs.stat(apk)).size;
  if(bytes>256*1024*1024)throw new Error('APK exceeds verification size limit');
  const sha256=createHash('sha256').update(await fs.readFile(apk)).digest('hex');
  const directory=path.join(root,'.nobi-isolated',phase,'apk-'+sha256.slice(0,12)+'-'+randomUUID());
  await fs.mkdir(directory,{recursive:true});
  const targetRoot=await fs.realpath(directory);
  if(!targetRoot.toLowerCase().startsWith((root+path.sep).toLowerCase()))throw new Error('Extraction outside workspace');
  let total=0,count=0;
  const seen=new Set();
  await new Promise((resolve,reject)=>yauzl.open(apk,{lazyEntries:true,strictFileNames:true},(error,zip)=>{
    if(error)return reject(error);
    const fail=err=>{zip.close();reject(err);};
    zip.on('error',fail);
    zip.on('end',resolve);
    zip.on('entry',entry=>{
      void (async()=>{
        if(/\.(key|pem|p12|pfx|jks|keystore|mobileprovision|csr|cer|crt)$/i.test(entry.fileName))throw new Error('Forbidden signing material in APK');
        if(!entry.fileName.startsWith('assets/public/')||entry.fileName.endsWith('/'))return zip.readEntry();
        const relative=entry.fileName.slice('assets/public/'.length);
        const file=path.resolve(targetRoot,relative);
        if(!file.toLowerCase().startsWith((targetRoot+path.sep).toLowerCase()))throw new Error('Unsafe ZIP path');
        const identity=file.toLowerCase();
        if(seen.has(identity))throw new Error('Duplicate APK asset');
        seen.add(identity);
        total+=entry.uncompressedSize;count++;
        if(total>256*1024*1024||count>10000)throw new Error('APK asset extraction limit exceeded');
        await fs.mkdir(path.dirname(file),{recursive:true});
        const parent=await fs.realpath(path.dirname(file));
        if(parent!==targetRoot&&!parent.toLowerCase().startsWith((targetRoot+path.sep).toLowerCase()))throw new Error('Unsafe APK extraction parent');
        const stream=await new Promise((yes,no)=>zip.openReadStream(entry,(err,input)=>err?no(err):yes(input)));
        await pipeline(stream,createWriteStream(file,{flags:'wx'}));
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  }));
  if(!count)throw new Error('APK contains no public web assets');
  return {directory,bytes,sha256,count};
}
