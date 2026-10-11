// Decode actual recorded samples, crop one detonation and fade its tail. No synthesized blast.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../tooling/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const encoded=fs.readFileSync(path.join(root,'assets/sounds/guandan-bomb-recording.mp3')).toString('base64');
const browser=await chromium.launch({channel:process.env.NOBI_BROWSER_CHANNEL||'msedge'});
try{
 const page=await browser.newPage();
 const clip=await page.evaluate(async encoded=>{
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const context=new OfflineAudioContext(1,1,44100),buffer=await context.decodeAudioData(bytes.buffer);
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const mono=new Float32Array(buffer.length);
  for(let i=0;i<mono.length;i++)mono[i]=channels.reduce((sum,c)=>sum+c[i],0)/channels.length;
  const frame=Math.round(buffer.sampleRate*.01);let maxEnergy=0,peakFrame=0;
  for(let start=0;start<mono.length;start+=frame){let energy=0;for(let i=start;i<Math.min(start+frame,mono.length);i++)energy+=mono[i]*mono[i];if(energy>maxEnergy){maxEnergy=energy;peakFrame=start;}}
  const start=Math.max(0,peakFrame-Math.round(buffer.sampleRate*.08));
  const count=Math.min(Math.round(buffer.sampleRate*1.8),mono.length-start),samples=mono.slice(start,start+count);
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));
  const scale=peak>0?.85/peak:1,data=new ArrayBuffer(44+count*2),view=new DataView(data);
  const word=(offset,text)=>[...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  word(0,'RIFF');view.setUint32(4,data.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const fade=Math.min(1,i/(buffer.sampleRate*.004),(count-1-i)/(buffer.sampleRate*.12));view.setInt16(44+i*2,Math.round(samples[i]*scale*fade*32767),true);}
  let binary='';for(const byte of new Uint8Array(data))binary+=String.fromCharCode(byte);
  return {base64:btoa(binary),startSeconds:start/buffer.sampleRate,duration:count/buffer.sampleRate,sampleRate:buffer.sampleRate,sourceDuration:buffer.duration};
 },encoded);
 fs.writeFileSync(path.join(root,'assets/sounds/guandan-bomb.wav'),Buffer.from(clip.base64,'base64'));
 const {base64,...info}=clip;console.log(JSON.stringify(info));
}finally{await browser.close();}
