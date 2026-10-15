import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, sha256 } from './verify-assets.mjs';

export const sensitiveExtension = /\.(key|pem|p12|pfx|jks|keystore|mobileprovision|csr|cer|crt)$/i;
export function distributionFiles(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? distributionFiles(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
export function verifyDistribution(dir) {
  for (const file of distributionFiles(dir)) {
    if (sensitiveExtension.test(file) || /(?:^|[\\/])(?:node_modules|docs|www|\.git|\.env)(?:[\\/.]|$)/.test(file)) throw new Error('Forbidden publication file: ' + path.relative(dir,file));
    if (/\.(js|html|json|txt)$/i.test(file)) {
      const text=fs.readFileSync(file,'utf8');
      if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----|sb_secret_[a-zA-Z0-9_-]+/.test(text)) throw new Error('Sensitive material in distribution: ' + path.relative(dir,file));
    }
  }
  return 'PASS';
}

function derNode(buffer, offset=0) {
  const tag=buffer[offset++]; let size=buffer[offset++];
  if (size & 128) { const count=size & 127; size=0; for(let i=0;i<count;i++) size=size*256+buffer[offset++]; }
  const start=offset, end=start+size;
  if (!Number.isSafeInteger(end) || end>buffer.length) throw new Error('Invalid ASN.1');
  return {tag,start,end,bytes:buffer.subarray(start,end)};
}
function children(buffer,node) { const nodes=[];let p=node.start;while(p<node.end){const n=derNode(buffer,p);nodes.push({...n,encoded:buffer.subarray(p,n.end)});p=n.end;}return nodes; }
export function inspectMaterials() {
  const findings=[];
  const keyPath=path.join(root,'ios_development.key');
  if(fs.existsSync(keyPath)) {
    const data=fs.readFileSync(keyPath); let parsed=false,type='UNKNOWN',fingerprint=null;
    try { const key=crypto.createPrivateKey(data); parsed=true;type=key.asymmetricKeyType;fingerprint=sha256(crypto.createPublicKey(key).export({format:'der',type:'spki'})); } catch (_) {}
    findings.push({file:'ios_development.key',type:'private key',bytes:data.length,parseable_private_material:parsed,algorithm:type,public_key_sha256:fingerprint,risk:parsed?'CRITICAL':'HIGH / NOT VERIFIED'});
  }
  if(fs.existsSync(path.join(root,'ios_development.csr'))) {
    const text=fs.readFileSync(path.join(root,'ios_development.csr'),'utf8');
    let verified=false, fingerprint=null;
    try {
      const der=Buffer.from(text.replace(/-----[^\n]+-----/g,'').replace(/\s/g,''),'base64');
      const [info,algorithm,signature]=children(der,derNode(der));
      const parts=children(der,info), spki=parts[2];
      const key=crypto.createPublicKey({key:spki.encoded,format:'der',type:'spki'});
      fingerprint=sha256(spki.encoded);
      const oid=children(der,algorithm)[0].bytes.toString('hex');
      const hash=({'2a864886f70d01010b':'sha256','2a864886f70d01010c':'sha384','2a864886f70d01010d':'sha512','2a8648ce3d040302':'sha256'})[oid];
      verified=!!hash && signature.bytes[0]===0 && crypto.verify(hash,info.encoded,key,signature.bytes.subarray(1));
    } catch (_) {}
    findings.push({file:'ios_development.csr',type:'certificate signing request (NOT certificate)',signature_verified:verified,public_key_sha256:fingerprint,expiry:'not applicable; certificate issuance/revocation NOT VERIFIED'});
  }
  if(fs.existsSync(path.join(root,'my-release-key.jks'))) {
    const data=fs.readFileSync(path.join(root,'my-release-key.jks'));
    let format='unknown signing container';
    if(data.subarray(0,4).toString('hex')==='feedfeed') format='JKS container';
    else {
      try {
        const parts=children(data,derNode(data));
        if(parts[0].tag===2 && parts[0].bytes.toString('hex')==='03' && parts[1].tag===0x30 && children(data,parts[1])[0].bytes.toString('hex').startsWith('2a864886f70d0107')) format='PKCS12/PFX signing container (not JKS despite extension)';
      } catch (_) {}
    }
    findings.push({file:'my-release-key.jks',type:format,bytes:data.length,private_entries_and_validity:'NOT VERIFIED: no password requested or guessed',risk:'HIGH: tracked signing container'});
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--staged')) {
    const repoOption=process.argv.indexOf('--repo'),stagedRoot=repoOption<0?root:path.resolve(process.argv[repoOption+1]??'');
    if(stagedRoot!==root&&!stagedRoot.startsWith(root+path.sep))throw new Error('Staged guard repository must stay inside workspace');
    const names=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR'],{cwd:stagedRoot,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
    for(const name of names) {
      if(/^(?:\.nobi-isolated|\.nobi-stage)\//.test(name))throw new Error('Generated credential/staging directory forbidden: '+name);
      if(sensitiveExtension.test(name) || /(^|\/)\.env(?!\.example$)/.test(name)) throw new Error('Forbidden staged material: '+name);
      const data=execFileSync('git',['show',':'+name],{cwd:stagedRoot,maxBuffer:(/\.apk$/i.test(name)?64:16)*1024*1024});
      if(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----|sb_secret_[a-zA-Z0-9_-]+/.test(data.toString('utf8'))) throw new Error('Secret in staged file: '+name);
    }
    console.log('Staged-material guard PASS');
  } else {
    const findings=inspectMaterials();console.log(JSON.stringify(findings,null,2));
    if(findings.some(f=>f.risk)) process.exitCode=1; // Existing exposure is a real FAIL, never hidden.
  }
}
