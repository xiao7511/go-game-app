// Release metadata checks only; no certificate/private-key access.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import plist from 'plist';

const bundleId='cn.obsmd.gogame';
const manifestPath='build/ios/release-version.json';

export function verifyMetadata(info, expected) {
  if(info.CFBundleIdentifier!==bundleId) throw new Error('Unexpected IPA bundle identifier');
  if(info.CFBundleVersion!==expected.buildNumber) throw new Error('CFBundleVersion does not match the selected build number');
  if(info.CFBundleShortVersionString!==expected.marketingVersion||expected.marketingVersion!=='1.0') throw new Error('CFBundleShortVersionString must remain 1.0');
}

export function verifyProject(root, buildNumber, marketingVersion) {
  if(!/^[1-9][0-9]{0,3}$/.test(buildNumber)||marketingVersion!=='1.0') throw new Error('Invalid release version');
  const project=fs.readFileSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8');
  const builds=[...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/g)].map(match=>match[1].trim());
  const versions=[...project.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map(match=>match[1].trim());
  const identifiers=[...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map(match=>match[1].trim());
  if(builds.length!==2||builds.some(value=>value!==buildNumber)) throw new Error('Debug/Release CURRENT_PROJECT_VERSION mismatch');
  if(versions.length!==2||versions.some(value=>value!==marketingVersion)) throw new Error('Debug/Release MARKETING_VERSION mismatch');
  if(identifiers.length!==2||identifiers.some(value=>value!==bundleId)) throw new Error('Debug/Release bundle identifier mismatch');
  const info=plist.parse(fs.readFileSync(path.join(root,'ios/App/App/Info.plist'),'utf8'));
  if(![bundleId,'$(PRODUCT_BUNDLE_IDENTIFIER)'].includes(info.CFBundleIdentifier)) throw new Error('Unexpected project Info.plist bundle identifier');
  // agvtool writes both plist keys explicitly; do not accept unresolved variables.
  verifyMetadata({...info,CFBundleIdentifier:bundleId},{buildNumber,marketingVersion});
  const expected={bundleId,buildNumber,marketingVersion};
  const output=path.join(root,manifestPath);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(expected,null,2)+'\n');
  return expected;
}

function verifyIpa(root) {
  const expected=JSON.parse(fs.readFileSync(path.join(root,manifestPath),'utf8'));
  const directory=path.join(root,'build/ios/ipa');
  const packages=fs.readdirSync(directory).filter(name=>name.endsWith('.ipa'));
  if(packages.length!==1) throw new Error('Expected exactly one exported IPA');
  const ipa=path.join(directory,packages[0]);
  const entries=execFileSync('unzip',['-Z1',ipa],{encoding:'utf8'}).split(/\r?\n/);
  const infos=entries.filter(name=>/^Payload\/[^/]+\.app\/Info\.plist$/.test(name));
  if(infos.length!==1) throw new Error('Expected one main app Info.plist in IPA');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nobi-ipa-version-'));
  try {
    const file=path.join(temporary,'Info.plist');
    fs.writeFileSync(file,execFileSync('unzip',['-p',ipa,infos[0]]));
    const xml=execFileSync('plutil',['-convert','xml1','-o','-',file],{encoding:'utf8'});
    verifyMetadata(plist.parse(xml),expected);
    console.log(`Verified IPA metadata: ${bundleId} ${expected.marketingVersion} (${expected.buildNumber})`);
  } finally {
    // Only remove this newly created task-specific temporary directory.
    if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('nobi-ipa-version-')) fs.rmSync(temporary,{recursive:true,force:true});
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [mode,buildNumber,marketingVersion]=process.argv.slice(2);
  if(mode==='project') {
    const expected=verifyProject(process.cwd(),buildNumber,marketingVersion);
    console.log(`Verified iOS project: ${bundleId} ${expected.marketingVersion} (${expected.buildNumber})`);
  } else if(mode==='ipa') verifyIpa(process.cwd());
  else throw new Error('Use project BUILD_NUMBER 1.0 or ipa');
}
