// Download one Windows JDK 17 into ignored project tooling; never changes global JAVA_HOME.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const dir=path.resolve('.nobi-isolated/toolchains');fs.mkdirSync(dir,{recursive:true});
try {
 const response=await fetch('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse',{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('metadata HTTP '+response.status);
 const assets=await response.json(),asset=assets[0],pack=asset.binary.package;
 if(!/^https:\/\/github.com\/adoptium\/temurin17-binaries\/releases\/download\//.test(pack.link)||!pack.name.endsWith('.zip')||!/^[a-f0-9]{64}$/.test(pack.checksum))throw new Error('unexpected JDK distribution');
 const zip=path.join(dir,'jdk17.zip'),download=await fetch(pack.link,{signal:AbortSignal.timeout(180000)});
 if(!download.ok)throw new Error('download HTTP '+download.status);
 await pipeline(Readable.fromWeb(download.body),fs.createWriteStream(zip));
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(zip))hash.update(chunk);
 if(hash.digest('hex')!==pack.checksum)throw new Error('checksum mismatch');
 fs.writeFileSync(path.join(dir,'jdk17-download.json'),JSON.stringify({version:asset.version.openjdk_version,sha256:pack.checksum,url:pack.link},null,2));
 console.log('PASS: verified Windows JDK 17 ZIP '+asset.version.openjdk_version);
} catch(error) {console.error('BLOCKED: JDK download '+error.message);process.exitCode=2;}
