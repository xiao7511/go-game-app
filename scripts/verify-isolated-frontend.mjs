// Refuse stale staged files when reusing the dedicated local development server.
import fs from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './verify-assets.mjs';
export async function verifyIsolatedFrontend(){
 const files=['guandan-game.js','game.js','multiplayer-ext.js','ui/guandan-rules.mjs','ui/online.js','ui/online.css','ui/match.css'];
 for(const name of files){const response=await fetch('http://127.0.0.1:5189/'+name,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok||sha256(Buffer.from(await response.arrayBuffer()))!==sha256(await fs.readFile(path.join(root,name))))throw Error('BLOCKED: isolated frontend has stale source: '+name);}
 console.log('Verified isolated frontend source hashes (7 files); dedicated localhost only.');
}
