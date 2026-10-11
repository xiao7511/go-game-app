// Checks a running Debug APK on a physical device through its own WebView CDP endpoint.
// Caller forwards localhost:9223 to webview_devtools_remote_<app pid> using ADB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const serial=process.argv[2];
if(!serial||!/^[a-zA-Z0-9._:-]+$/.test(serial))throw new Error('Usage: node scripts/android-webview-smoke.mjs <authorized-device-serial>');
const remaining=process.argv[3]==='--remaining';
if(process.argv.length>4||(process.argv[3]&&!remaining))throw new Error('Unsupported device test argument');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk)throw new Error('Set ANDROID_HOME to the actual SDK path');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const shell=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8',windowsHide:true}).trim();
const directory=path.resolve('.nobi-isolated/mobile-device');fs.mkdirSync(directory,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const target=pages.find(page=>{try{const url=new URL(page.url);return url.hostname==='localhost'&&url.pathname==='/game.html';}catch{return false;}});
if(!target)throw new Error('Open Nobi game lobby on the installed Debug APK first');
const ws=new WebSocket(target.webSocketDebuggerUrl);
let id=0;const pending=new Map();
ws.addEventListener('message',event=>{const reply=JSON.parse(event.data);if(reply.id&&pending.has(reply.id)){const task=pending.get(reply.id);pending.delete(reply.id);clearTimeout(task.timer);reply.error?task.reject(new Error(reply.error.message)):task.resolve(reply.result);}});
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
const command=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;const timer=setTimeout(()=>{pending.delete(request);reject(new Error('CDP timeout: '+method));},45000);pending.set(request,{resolve,reject,timer});ws.send(JSON.stringify({id:request,method,params}));});
async function evaluate(fn,arg){const result=await command('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg)??'undefined'})`,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw new Error('WebView evaluation failed: '+String(result.exceptionDetails.exception?.description||result.exceptionDetails.text).split('\n')[0]);return result.result.value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,expected,timeout=10000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await evaluate(fn)===expected)return;await sleep(150);}throw new Error('Device state did not reach expected value: '+fn.toString());}
let viewBounds;
async function tap(selector){const point=await evaluate(selector=>{const node=[...document.querySelectorAll(selector)].find(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');if(!node)throw new Error('Control missing');node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=node.getBoundingClientRect();if(node.hasAttribute('data-card-id')){for(const y of [r.y+r.height/2,r.y+12])for(let x=Math.max(4,r.x+4);x<Math.min(innerWidth-4,r.right-4);x+=4)if(node.contains(document.elementFromPoint(x,y)))return {x,y,width:innerWidth};throw new Error('Card has no exposed touch region');}return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth};},selector);
 if(!viewBounds||viewBounds.cssWidth!==point.width){shell('uiautomator','dump','/data/local/tmp/nobi-device-window.xml');const xml=shell('cat','/data/local/tmp/nobi-device-window.xml');const bounds=/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);if(!bounds)throw new Error('Native WebView bounds unavailable');viewBounds={left:Number(bounds[1]),top:Number(bounds[2]),scale:(Number(bounds[3])-Number(bounds[1]))/point.width,cssWidth:point.width};}
 shell('input','tap',String(Math.round(viewBounds.left+point.x*viewBounds.scale)),String(Math.round(viewBounds.top+point.y*viewBounds.scale)));await sleep(100);
}
async function shot(name){const result=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(result.data,'base64'));}
const result={startedAt:new Date().toISOString(),scope:'Physical Android native Debug WebView; local single-player and bomb renderer fixture, no rated/online room created',checks:[],status:'RUNNING'};
if(remaining){const prior=JSON.parse(fs.readFileSync(path.join(directory,'android-device-result.json'),'utf8'));if(prior.checks.length!==7||prior.checks.some(check=>check.status!=='PASS'))throw new Error('Run the initial device checks before continuing');result.checks=prior.checks;result.decoded=prior.decoded;result.initialChecksAt=prior.startedAt;}
const pass=name=>{result.checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const rotation={auto:shell('settings','get','system','accelerometer_rotation'),user:shell('settings','get','system','user_rotation')};
const windowRotation=shell('wm','user-rotation');
let audioSettings,playHooked=false;
try{
 await command('Runtime.enable');
 result.device={model:shell('getprop','ro.product.model'),android:shell('getprop','ro.build.version.release'),api:shell('getprop','ro.build.version.sdk')};
 result.initial=await evaluate(()=>({native:Capacitor.isNativePlatform(),loggedIn:!!NobiLobby.getState().user,onlineConfig:!!NobiConfig.get().SUPABASE_URL&&!!NobiConfig.get().SUPABASE_ANON_KEY,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}));
 assert.equal(result.initial.native,true);assert.equal(result.initial.onlineConfig,true);if(!remaining)pass('Native startup and bundled online public configuration');
 audioSettings=await evaluate(()=>NobiAudio.getSettings());
 await evaluate(()=>{window.nobiDevicePlays=[];window.nobiDeviceOriginalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.nobiDevicePlays.push(new URL(this.src).pathname);return window.nobiDeviceOriginalPlay.call(this);};});playHooked=true;
 await evaluate(()=>{NobiAudio.setSettings({musicEnabled:true,effectsEnabled:true,promptEnabled:true});});
 if(!remaining){
 if(await evaluate(()=>document.body.classList.contains('in-game-match'))){shell('wm','user-rotation','lock','1');await until(()=>innerWidth>innerHeight,true);await tap('[data-gd-exit]');await until(()=>document.querySelector('#guandan-game-container')===null,true);}
 await evaluate(()=>{location.hash='/home';});
 shell('wm','user-rotation','lock','0');
 await until(()=>innerHeight>innerWidth,true);await tap('[data-launch="guandan"]');
 await until(()=>document.querySelectorAll('[data-gd-hand] .gd-card').length,27);
 assert.equal(await evaluate(()=>getComputedStyle(document.querySelector('#gd-landscape-tips')).display!=='none'),true);
 await shot('android-guandan-portrait');pass('Real portrait orientation prompt and 27-card deal');
 shell('wm','user-rotation','lock','1');await until(()=>innerWidth>innerHeight,true);
 await until(()=>getComputedStyle(document.querySelector('#gd-landscape-tips')).display==='none',true);
 const clock=await evaluate(()=>{const a=document.querySelector('[data-gd-turn-clock]').getBoundingClientRect(),b=document.querySelector('[data-gd-play]').getBoundingClientRect();return {above:a.bottom<=b.top,centered:Math.abs(a.x+a.width/2-b.x-b.width/2)<1};});
 assert.equal(clock.above,true);assert.equal(clock.centered,true);await shot('android-guandan-landscape');pass('Actual landscape layout and countdown above play');
 await tap('[data-gd-hand] .gd-card');assert.equal(await evaluate(()=>GD.state.selected.size),1);
 await tap('[data-gd-clear]');assert.equal(await evaluate(()=>GD.state.selected.size),0);
 await tap('[data-gd-hint]');assert.equal(await evaluate(()=>GD.state.selected.size>0),true);
 await tap('[data-gd-play]');await until(()=>GD.state.players[0].hand.length<27,true);pass('Trusted device touch selection, clear, hint and legal play');
 await tap('[data-match-settings]');
 for(const track of ['nocturne','dreaming','moonlight']){
  await evaluate(track=>{const select=document.querySelector('[data-match-track]');select.value=track;select.dispatchEvent(new Event('input',{bubbles:true}));},track);
  assert.equal(await evaluate(()=>NobiAudio.getStatus().playing),true);
  assert.equal(await evaluate(()=>NobiAudio.getStatus().trackId),track);
 }
 await shot('android-classical-settings');pass('Three classical recordings switch and play in native WebView');
 const decoded=await evaluate(async()=>{const context=new OfflineAudioContext(1,1,22050),out=[];for(const track of NobiAudio.getTracks('guandan')){const response=await fetch(track.src);const audio=await context.decodeAudioData(await response.arrayBuffer());out.push({id:track.id,status:response.status,duration:audio.duration});}const response=await fetch('assets/sounds/guandan-bomb.wav');const audio=await context.decodeAudioData(await response.arrayBuffer());out.push({id:'bomb',status:response.status,duration:audio.duration});return out;});
 assert.equal(decoded.length,4);assert(decoded.slice(0,3).every(track=>track.status===200&&track.duration>180));assert(Math.abs(decoded[3].duration-1.8)<.02);result.decoded=decoded;pass('Real phone decodes three MP3 recordings and recorded bomb WAV');
 await evaluate(()=>{NobiAudio.setSettings({musicEnabled:false});});await sleep(600);assert.equal(await evaluate(()=>NobiAudio.getStatus().playing),false);
 await evaluate(()=>{NobiAudio.setSettings({musicEnabled:true});});await until(()=>NobiAudio.getStatus().playing,true);pass('Native mute and music resume');
 }else{shell('wm','user-rotation','lock','1');await until(()=>innerWidth>innerHeight,true);if(await evaluate(()=>!document.querySelector('#guandan-game-container'))){await evaluate(async()=>{window.selectedGameId='guandan';await launchMatchGame('SINGLE');});await until(()=>document.querySelectorAll('[data-gd-hand] .gd-card').length,27);}}
 if(await evaluate(()=>!!document.querySelector('dialog')?.open))await evaluate(()=>document.querySelector('.dialog-actions button').click());
 // Isolated, legal four-of-a-kind fixture exercises the actual renderer and play action only.
 await evaluate(()=>{const deck=GD.createNetworkDeal().flat(),bomb=deck.filter(c=>c.kind==='normal'&&c.rank==='5').slice(0,4),remaining=deck.filter(c=>!bomb.includes(c));const first=[...bomb,...remaining.splice(0,23)];GD.startNetworkGame([first,...[0,1,2].map(()=>remaining.splice(0,27))],[0,1,2,3].map(i=>({uid:'device-fixture-'+i,nickname:'真机测试 '+i})),0,0,()=>{},false);window.nobiDeviceBomb=bomb.map(c=>c.id);});
 await evaluate(()=>{window.nobiDeviceBombActivations=0;const effect=document.querySelector('[data-gd-bomb-effect]');window.nobiDeviceBombObserver=new MutationObserver(()=>{if(!effect.hidden)window.nobiDeviceBombActivations++;});window.nobiDeviceBombObserver.observe(effect,{attributes:true,attributeFilter:['hidden']});});
 // Renderer fixture selection uses the existing click handler to select exact physical card IDs.
 await evaluate(()=>window.nobiDeviceBomb.forEach(id=>document.querySelector(`[data-gd-hand] [data-card-id="${id}"]`).click()));
 assert.equal(await evaluate(()=>GD.state.selected.size),4);
 await evaluate(()=>document.querySelector('[data-gd-play]').click());await until(()=>window.nobiDeviceBombActivations>0,true,3000);await shot('android-bomb');
 assert.equal(await evaluate(()=>GD.state.players[0].hand.length),23);
 assert.equal(await evaluate(()=>window.nobiDevicePlays.filter(p=>p.endsWith('guandan-bomb.wav')).length),1);pass('Bomb renderer fixture via actual DOM handlers animates and plays recorded explosion once');
 shell('input','keyevent','3');await sleep(800);assert.equal(await evaluate(()=>NobiAudio.getStatus().suspended),true);assert.equal(await evaluate(()=>NobiAudio.getStatus().playing),false);pass('Android Home suspends background music');
 shell('am','start','-n','cn.obsmd.gogame/.MainActivity');await until(()=>NobiAudio.getStatus().playing,true);pass('Foreground returns and music resumes');
 await evaluate(()=>document.querySelector('[data-gd-exit]').click());await until(()=>document.querySelector('#guandan-game-container')===null,true);await sleep(600);assert.equal(await evaluate(()=>NobiAudio.getStatus().playing),false);pass('Return to lobby stops game music');
 result.status='PASS';
 result.notTested=['Manual speaker listening','SIM/mobile-network handoff','Incoming call/headphone interruptions','Four-user online match','Low-memory recovery','iOS native runtime'];
}catch(error){result.status='FAIL';result.failure=error.message;try{result.failureState=await evaluate(()=>({hand:GD.state.players[0].hand.length,selected:GD.state.selected.size,selectedRanks:[...GD.state.selected].map(id=>GD.state.cardsById.get(id)?.rank),lastType:GD.state.lastPlayedTrick?.type,turn:GD.state.currentTurn,active:GD.state.active,bombPlays:window.nobiDevicePlays?.filter(p=>p.endsWith('guandan-bomb.wav')).length,bombActivations:window.nobiDeviceBombActivations}));}catch{}console.error('Device check failed: '+error.message);process.exitCode=2;}
finally{
 try{if(result.status==='FAIL')await evaluate(()=>{if(document.body.classList.contains('in-game-match')){GD.destroy();backToCentralLobby();}});}catch{}
 try{if(audioSettings)await evaluate(settings=>NobiAudio.setSettings(settings),audioSettings);if(playHooked)await evaluate(()=>{HTMLMediaElement.prototype.play=window.nobiDeviceOriginalPlay;window.nobiDeviceBombObserver?.disconnect();delete window.nobiDeviceOriginalPlay;delete window.nobiDevicePlays;delete window.nobiDeviceBomb;delete window.nobiDeviceBombActivations;delete window.nobiDeviceBombObserver;});}catch{}
 for(const [key,value] of [['accelerometer_rotation',rotation.auto],['user_rotation',rotation.user]]){if(value==='null')shell('settings','delete','system',key);else shell('settings','put','system',key,value);}
 const locked=/^lock (\d)$/.exec(windowRotation);if(locked)shell('wm','user-rotation','lock',locked[1]);else shell('wm','user-rotation','free');
 result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'android-device-result.json'),JSON.stringify(result,null,2));ws.close();console.log('Device result: '+result.status);
 shell('rm','-f','/data/local/tmp/nobi-device-window.xml');
}
