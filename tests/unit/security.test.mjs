import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {verifyDistribution,sensitiveExtension} from '../../scripts/security-audit.mjs';

test('publication guard rejects signing materials and private-key content',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nobi-security-test-'));
  try {
    fs.writeFileSync(path.join(dir,'index.html'),'<html>fixture</html>');
    expect(verifyDistribution(dir)).toBe('PASS');
    fs.writeFileSync(path.join(dir,'signing.key'),'fixture-not-a-key');
    expect(()=>verifyDistribution(dir)).toThrow();fs.unlinkSync(path.join(dir,'signing.key'));
    fs.writeFileSync(path.join(dir,'config.js'),['-----BEGIN','PRIVATE KEY-----'].join(' '));
    expect(()=>verifyDistribution(dir)).toThrow();
  } finally {
    if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('nobi-security-test-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('all signing/CSR/certificate extension classes are guarded',()=>{
  for(const name of ['x.key','x.pem','x.p12','x.pfx','x.jks','x.keystore','x.mobileprovision','x.csr','x.cer','x.crt']) expect(sensitiveExtension.test(name)).toBe(true);
  expect(sensitiveExtension.test('game.js')).toBe(false);
});

// GHSA-27p8-2357-5qqv: opt-in well-formed serialization must reject a mutated doctype.
test('xmldom rejects doctype markup injection with requireWellFormed',async()=>{
  const {DOMImplementation,XMLSerializer}=await import('../../node_modules/@xmldom/xmldom/lib/index.js');
  const impl=new DOMImplementation();
  const type=impl.createDocumentType('root','','');
  type.name='root><!--unexpected--';
  const document=impl.createDocument(null,'root',type);
  expect(()=>new XMLSerializer().serializeToString(document,{requireWellFormed:true})).toThrow();
});

test('Capacitor plist dependency preserves nested native configuration',async()=>{
  const {default:plist}=await import('../../node_modules/plist/index.js');
  const config={appId:'cn.obsmd.gogame',title:'Nobi 掼蛋',enabled:true,count:27,plugins:{cards:['heart-2','heart-2'],sound:false}};
  expect(plist.parse(plist.build(config))).toEqual(config);
});
