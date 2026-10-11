import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function toolchain() {
 const sdk=process.env.ANDROID_HOME??process.env.ANDROID_SDK_ROOT??path.join(process.env.LOCALAPPDATA??'','Android/Sdk');
 const base=path.resolve('.nobi-isolated/toolchains/jdk17');
 const folder=fs.existsSync(base)?fs.readdirSync(base).find(n=>fs.existsSync(path.join(base,n,'bin/java.exe'))):null;
 const javaHome=folder?path.join(base,folder):process.env.JAVA_HOME;
 const wrapper=fs.readFileSync('android/gradle/wrapper/gradle-wrapper.properties','utf8');
 const variables=fs.readFileSync('android/variables.gradle','utf8');
 const checks={sdkPlatform34:fs.existsSync(path.join(sdk,'platforms/android-34/android.jar')),buildTools34:fs.existsSync(path.join(sdk,'build-tools/34.0.0/aapt2.exe')),java17:false,gradle:/gradle-(\d+\.\d+\.\d+)-/.exec(wrapper)?.[1],capacitor:JSON.parse(fs.readFileSync('node_modules/@capacitor/core/package.json','utf8')).version,compileSdk:Number(/compileSdkVersion = (\d+)/.exec(variables)?.[1]),targetSdk:Number(/targetSdkVersion = (\d+)/.exec(variables)?.[1])};
 if(javaHome){const result=spawnSync(path.join(javaHome,'bin/java.exe'),['-version'],{encoding:'utf8',windowsHide:true});checks.java17=result.status===0&&/version "17\./.test(result.stderr);}
 return {sdk,javaHome,checks};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const data=toolchain();console.log(JSON.stringify(data.checks));if(!data.checks.sdkPlatform34||!data.checks.buildTools34||!data.checks.java17)process.exitCode=2;}
