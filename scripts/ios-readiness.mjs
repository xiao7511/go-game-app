// Windows-compatible static preparation checks; never claims an Xcode archive or upload.
import fs from 'node:fs';
import path from 'node:path';
import plist from 'plist';
import {verifyBuild} from './verify-build.mjs';
const root=path.resolve('.');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const project=read('ios/App/App.xcodeproj/project.pbxproj');
if(!project.includes('PRODUCT_BUNDLE_IDENTIFIER = cn.obsmd.gogame;'))throw new Error('Unexpected iOS bundle ID');
if(!project.includes('PrivacyInfo.xcprivacy in Resources'))throw new Error('App privacy manifest is not in Copy Bundle Resources');
const privacy=plist.parse(read('ios/App/App/PrivacyInfo.xcprivacy'));
if(!privacy.NSPrivacyAccessedAPITypes?.some(api=>api.NSPrivacyAccessedAPIType==='NSPrivacyAccessedAPICategoryUserDefaults'&&api.NSPrivacyAccessedAPITypeReasons?.includes('CA92.1')))throw new Error('Missing UserDefaults reason');
const info=plist.parse(read('ios/App/App/Info.plist'));
for(const direction of ['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'])if(!info.UISupportedInterfaceOrientations.includes(direction))throw new Error('Missing phone orientation');
const capacitorPrivacy=plist.parse(read('node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy'));
if(!capacitorPrivacy.NSPrivacyAccessedAPITypes?.length)throw new Error('Missing SDK privacy manifest');
const icon=fs.readFileSync(path.join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
if(icon.readUInt32BE(16)!==1024||icon.readUInt32BE(20)!==1024||icon[25]!==2)throw new Error('Expected opaque 1024px iOS icon');
const nativeConfig=JSON.parse(read('ios/App/App/capacitor.config.json'));
if(nativeConfig.appId!=='cn.obsmd.gogame'||nativeConfig.server?.url)throw new Error('Unexpected native server configuration');
const result={checkedAt:new Date().toISOString(),staticPreparation:'PASS',assets:verifyBuild('mobile',path.join(root,'ios/App/App/public')),
 bundleId:nativeConfig.appId,minimumOS:'13.0',icon:'1024px opaque RGB',privacy:'UserDefaults CA92.1 + bundled Capacitor manifests',
 archive:'NOT_RUN',testFlightUpload:'NOT_RUN',testFlightReady:false,
 remaining:['Human-triggered Codemagic macOS/Xcode build, signed IPA export and Apple upload','Reuse existing nobi-apple integration and signing identities','Unique build number selected by the stable Codemagic workflow and Apple history','Human internal TestFlight build assignment after Apple processing','Run real iPhone testing']};
fs.mkdirSync('.nobi-isolated/mobile-device',{recursive:true});
fs.writeFileSync('.nobi-isolated/mobile-device/ios-readiness.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
