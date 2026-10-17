// Wikimedia MP3 transcodes of Charlie Huang's guqin recordings, CC BY 2.5.
// Sources and attribution travel with the audio in assets/music/chinese-classical-credits.txt.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sources=[['pingsha','5/5a','Pingsha_Luoyan'],['liushui','e/e0','Liu_Shui'],['duyi','b/bc','Kongzi_Duyi']];
for(const [id,hash,name] of sources){
 const url=`https://upload.wikimedia.org/wikipedia/commons/transcoded/${hash}/${name}.ogg/${name}.ogg.mp3`;
 const response=await fetch(url,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':'NobiGames/1.0 (guqin asset import; source attribution included)'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('audio/'))throw Error(`Audio import failed: ${id} HTTP ${response.status}`);
 const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length<100000)throw Error('Incomplete music: '+id);
 await fs.writeFile(new URL(`../assets/music/chinese-${id}.mp3`,import.meta.url),buffer);
 console.log(id,buffer.length,createHash('sha256').update(buffer).digest('hex'));
}
