import {afterEach,expect,test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import plist from 'plist';
import {verifyMetadata} from '../../scripts/verify-ios-release.mjs';

const root=path.resolve('.');
const fixtures=[];
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";

afterEach(()=>{
  for(const directory of fixtures.splice(0)) {
    if(path.dirname(directory)===path.join(root,'.nobi-isolated')&&path.basename(directory).startsWith('ios-version-test-')) fs.rmSync(directory,{recursive:true,force:true});
  }
});

function runSigning({ci='1',latest='',current='1',status='0',message,incorrectBuild='',incorrectMarketing='',agvFailure=''}={}) {
  const base=path.join(root,'.nobi-isolated');
  fs.mkdirSync(base,{recursive:true});
  const directory=fs.mkdtempSync(path.join(base,'ios-version-test-'));
  fixtures.push(directory);
  for(const name of ['scripts','bin','ios/App/App','ios/App/App.xcodeproj']) fs.mkdirSync(path.join(directory,name),{recursive:true});
  for(const name of ['codemagic-ios.sh','verify-ios-release.mjs']) fs.copyFileSync(path.join(root,'scripts',name),path.join(directory,'scripts',name));
  const project=fs.readFileSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8').replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,`CURRENT_PROJECT_VERSION = ${current};`);
  fs.writeFileSync(path.join(directory,'ios/App/App.xcodeproj/project.pbxproj'),project);
  fs.copyFileSync(path.join(root,'ios/App/App/Info.plist'),path.join(directory,'ios/App/App/Info.plist'));
  const mock=path.join(directory,'mock-tools.mjs');
  fs.writeFileSync(mock,`import fs from 'node:fs';
import path from 'node:path';
import plist from 'plist';
const [tool,...args]=process.argv.slice(2),root=process.env.NOBI_TEST_ROOT;
fs.appendFileSync(path.join(root,'commands.jsonl'),JSON.stringify({tool,args})+'\\n');
if(tool==='app-store-connect') {
  if(process.env.MOCK_MESSAGE) console.error(process.env.MOCK_MESSAGE);
  if(process.env.MOCK_LATEST) console.log(process.env.MOCK_LATEST);
  process.exit(Number(process.env.MOCK_STATUS));
}
if(tool==='agvtool') {
  const project=path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),file=path.join(root,'ios/App/App/Info.plist');
  const text=fs.readFileSync(project,'utf8');
  if(args[0]==='what-version') console.log([...text.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match=>match[1]).join('\\n'));
  else {
    if(process.env.MOCK_AGV_FAILURE) process.exit(5);
    const info=plist.parse(fs.readFileSync(file,'utf8'));
    if(args[0]==='new-version') {
      fs.writeFileSync(project,text.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,'CURRENT_PROJECT_VERSION = '+args[2]+';'));
      info.CFBundleVersion=process.env.MOCK_INCORRECT_BUILD||args[2];
    } else if(args[0]==='new-marketing-version') info.CFBundleShortVersionString=process.env.MOCK_INCORRECT_MARKETING||args[1];
    else process.exit(4);
    fs.writeFileSync(file,plist.build(info));
  }
}
`);
  for(const tool of ['app-store-connect','agvtool','xcode-project']) {
    const file=path.join(directory,'bin',tool);
    fs.writeFileSync(file,`#!/usr/bin/env bash\nexec ${quote(process.execPath.replaceAll('\\','/'))} ${quote(mock.replaceAll('\\','/'))} ${quote(tool)} "$@"\n`);
    fs.chmodSync(file,0o755);
  }
  const result=spawnSync(bash,['scripts/codemagic-ios.sh','signing'],{
    cwd:directory,encoding:'utf8',timeout:20000,windowsHide:true,
    env:{...process.env,PATH:path.join(directory,'bin')+path.delimiter+process.env.PATH,
      APP_STORE_APPLE_ID:'6821625687',NOBI_IOS_MARKETING_VERSION:'1.0',BUILD_NUMBER:ci,
      NOBI_TEST_ROOT:directory,MOCK_LATEST:latest,MOCK_STATUS:status,
      MOCK_MESSAGE:message??(latest?'':`Did not find latest build for app 6821625687`),
      MOCK_INCORRECT_BUILD:incorrectBuild,MOCK_INCORRECT_MARKETING:incorrectMarketing,MOCK_AGV_FAILURE:agvFailure}
  });
  return {result,directory,commands:fs.existsSync(path.join(directory,'commands.jsonl'))?fs.readFileSync(path.join(directory,'commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[]};
}

test.each([
  ['first upload',{},'1'],
  ['next CI run while Apple history is still empty',{ci:'2'},'2'],
  ['subsequent upload',{ci:'2',latest:'1'},'2'],
  ['failed CI attempts consume numbers',{ci:'8',latest:'3'},'8'],
  ['manually uploaded higher Apple build',{ci:'2',latest:'40'},'41'],
  ['checked-in project build floor',{ci:'2',latest:'1',current:'7'},'7']
])('%s writes the selected number into both Xcode configurations and Info.plist',(_name,options,expected)=>{
  const {result,directory,commands}=runSigning(options);
  expect(result.error).toBeUndefined();
  expect(result.status,result.stderr).toBe(0);
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'build/ios/release-version.json'),'utf8'));
  expect(metadata).toEqual({bundleId:'cn.obsmd.gogame',buildNumber:expected,marketingVersion:'1.0'});
  const info=plist.parse(fs.readFileSync(path.join(directory,'ios/App/App/Info.plist'),'utf8'));
  expect(info.CFBundleVersion).toBe(expected);
  expect(info.CFBundleShortVersionString).toBe('1.0');
  expect(commands[0]).toEqual({tool:'xcode-project',args:['use-profiles']});
  expect(commands.find(command=>command.tool==='app-store-connect').args).toEqual([
    'get-latest-testflight-build-number','6821625687','--platform','IOS','--pre-release-version','1.0','--log-stream','stderr','--no-color'
  ]);
});

test.each([
  ['authentication failure',{status:'1',message:'401 Unauthorized'}],
  ['permission failure',{status:'1',message:'403 Forbidden'}],
  ['network failure',{status:'1',message:'Connection timed out'}],
  ['no-history text with unsuccessful command',{status:'1'}],
  ['unexpected successful empty output',{message:''}],
  ['error text without a failure exit code',{message:'403 Forbidden'}],
  ['malformed output',{latest:'None'}],
  ['noninteger history',{latest:'1.2'}],
  ['missing Codemagic counter',{ci:''}],
  ['invalid Codemagic counter',{ci:'0'}],
  ['invalid project build',{current:'unknown'}],
  ['integer overflow',{latest:'9999'}]
])('%s cannot be treated as a first upload',(_name,options)=>{
  const {result,directory,commands}=runSigning(options);
  expect(result.status).not.toBe(0);
  expect(fs.existsSync(path.join(directory,'build/ios/release-version.json'))).toBe(false);
  expect(commands.some(command=>command.tool==='agvtool'&&command.args[0]==='new-version')).toBe(false);
});

test.each([
  ['agvtool failure',{agvFailure:'yes'}],
  ['incorrect CFBundleVersion write',{incorrectBuild:'9'}],
  ['incorrect marketing version write',{incorrectMarketing:'1.1'}]
])('%s stops the release before archive',(_name,options)=>{
  const {result,directory}=runSigning(options);
  expect(result.status).not.toBe(0);
  expect(fs.existsSync(path.join(directory,'build/ios/release-version.json'))).toBe(false);
});

test('exported IPA metadata must match the recorded version and game identifier',()=>{
  const expected={buildNumber:'1',marketingVersion:'1.0'};
  const valid={CFBundleIdentifier:'cn.obsmd.gogame',CFBundleVersion:'1',CFBundleShortVersionString:'1.0'};
  expect(()=>verifyMetadata(valid,expected)).not.toThrow();
  for(const [key,value] of [['CFBundleVersion','2'],['CFBundleShortVersionString','1.1'],['CFBundleIdentifier','com.nobistudio.app']]) expect(()=>verifyMetadata({...valid,[key]:value},expected)).toThrow();
});
