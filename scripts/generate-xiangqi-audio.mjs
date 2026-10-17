// Derive a clear board click from the same local sample used for Go placement.
// Decode only during asset preparation; shipped games play local WAV files.
import fs from 'node:fs/promises';
import {chromium} from '../tooling/node_modules/@playwright/test/index.mjs';
const rate=44100,source=await fs.readFile(new URL('../assets/sounds/button-22.mp3',import.meta.url));
const browser=await chromium.launch({channel:process.env.NOBI_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 const decoded=await page.evaluate(async bytes=>{
  const context=new OfflineAudioContext(1,1,44100),buffer=await context.decodeAudioData(new Uint8Array(bytes).buffer);
  const output=new Float32Array(buffer.length);for(let channel=0;channel<buffer.numberOfChannels;channel++){const input=buffer.getChannelData(channel);for(let i=0;i<output.length;i++)output[i]+=input[i]/buffer.numberOfChannels;}
  return Array.from(output);
 },Array.from(source));
 const peak=Math.max(...decoded.map(Math.abs)),threshold=peak*.003;
 let start=decoded.findIndex(x=>Math.abs(x)>threshold),end=decoded.findLastIndex(x=>Math.abs(x)>threshold)+1;
 start=Math.max(0,start-132);end=Math.min(decoded.length,end+441);
 const stone=decoded.slice(start,end).map(x=>Math.tanh(x/peak*1.7));
 for(const kind of ['move','capture']){
  const capture=kind==='capture',gap=Math.round(rate*.065),count=stone.length+(capture?gap:0),samples=new Float32Array(count);
  for(let i=0;i<stone.length;i++){samples[i]+=stone[i];if(capture)samples[i+gap]+=stone[i]*.85;}
  const gain=(capture ? .97 : .94)/Math.max(...samples.map(Math.abs));
  const buffer=Buffer.alloc(44+count*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++){const fade=Math.min(1,i/44,(count-1-i)/220);buffer.writeInt16LE(Math.round(samples[i]*gain*fade*32767),44+i*2);}
  await fs.writeFile(new URL(`../assets/sounds/xiangqi-${kind}.wav`,import.meta.url),buffer);
  console.log(kind,{seconds:count/rate,peak:Math.max(...samples.map(Math.abs))*gain,rms:Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/count)*gain});
 }
}finally{await browser.close();}
