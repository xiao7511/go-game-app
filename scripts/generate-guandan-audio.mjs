// Original countdown cue only. Music and real bomb recordings are imported separately.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rate=22050, tau=2*Math.PI;
function wav(file,seconds,sample){
  const count=Math.round(seconds*rate),buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
  buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
  buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample(i/rate)))*32767),44+i*2);
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),buffer);
}
wav('assets/sounds/guandan-countdown.wav',.16,t=>.32*Math.sin(tau*880*t)*Math.min(1,t/.005)*Math.exp(-t*28)*Math.min(1,(.16-t)/.025));
console.log('Generated original Guandan countdown cue; recordings unchanged.');
