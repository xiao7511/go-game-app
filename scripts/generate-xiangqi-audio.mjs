// Original procedural wood impacts; no third-party recording or runtime synth.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const rate=44100,tau=Math.PI*2;
export function xiangqiSound(kind) {
 if(!['move','capture'].includes(kind))throw Error('Unknown Xiangqi cue');
 const capture=kind==='capture',duration=capture ? .26 : .16,count=Math.round(rate*duration),samples=[];
 const hits=capture?[[0,430,1],[.027,810,.48]]:[[0,640,1]];
 let seed=0x5849414e,filtered=0;
 for(let i=0;i<count;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;filtered=.42*filtered+.58*(seed/4294967296*2-1);
  const t=i/rate;let value=0;
  for(const [offset,pitch,gain] of hits){const d=t-offset;if(d<0)continue;
   const attack=1-Math.exp(-d*5000);
   value+=gain*attack*(.6*Math.sin(tau*pitch*d)*Math.exp(-48*d)+.24*Math.sin(tau*pitch*2.23*d)*Math.exp(-75*d)+.14*Math.sin(tau*pitch*3.86*d)*Math.exp(-120*d)+.35*filtered*Math.exp(-150*d));
  }
  samples.push(value*Math.min(1,(duration-t)/.015));
 }
 const peak=Math.max(...samples.map(Math.abs)),gain=(capture ? .72 : .58)/peak,buffer=Buffer.alloc(44+count*2);
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(samples[i]*gain*32767),44+i*2);
 return buffer;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=new URL('../assets/sounds/',import.meta.url);
 for(const kind of ['move','capture'])fs.writeFileSync(new URL('xiangqi-'+kind+'.wav',directory),xiangqiSound(kind));
 console.log('Generated Xiangqi wood move and capture WAV cues.');
}
