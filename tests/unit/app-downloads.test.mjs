import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';

function downloads(ios,native=false){
  const context=sandbox({NobiPlatform:{isNative:()=>native},NobiAppRelease:{android:{file:'Nobi-android-9.8.7.apk',version:'9.8.7'},ios}});
  load('ui/app-downloads.js',context);return context.NobiAppDownloads.render();
}
test('install labels follow the package version and public invitations open Apple directly',()=>{
  const html=downloads({mode:'public',invitationUrl:'https://testflight.apple.com/join/JSrJ2eYE'});
  expect(html).toContain('下载安卓 App 9.8.7 测试版');expect(html).toContain('app-downloads/Nobi-android-9.8.7.apk');
  expect(html).toContain('href="https://testflight.apple.com/join/JSrJ2eYE"');expect(html).not.toContain('data-ios-download');
});
test.each(['javascript:alert(1)','https://testflight.apple.com.attacker.test/join/abc','https://testflight.apple.com@attacker.test/join/abc','https://testflight.apple.com/join/abc?redirect=bad'])('invalid public invitation falls back to installation help: %s',invitationUrl=>{
  const html=downloads({mode:'public',invitationUrl});expect(html).toContain('data-ios-download');expect(html).not.toContain('href="'+invitationUrl+'"');
});
test('internal-only mode retains instructions and native apps never render download controls',()=>{
  expect(downloads({mode:'internal'})).toContain('查看 iOS 内部测试安装说明');
  expect(downloads({mode:'public',invitationUrl:'https://testflight.apple.com/join/JSrJ2eYE'},true)).toBe('');
});
