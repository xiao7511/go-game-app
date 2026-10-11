import fs from 'node:fs';
import path from 'node:path';
import {root,sha256} from './verify-assets.mjs';
export function canonicalDevHtml(source) {
 return String(source)
  .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','<script src="vendor/supabase.js"></script>')
  .replace(/\n\s*<script type="module" src="\/@vite\/client"><\/script>\n/g,'')
  .replace(/\r\n?/g,'\n').trim();
}
export async function verifyDevServer() {
 for(const name of ['game.html','game.js','guandan-game.js','multiplayer-ext.js','ui/lobby.js','ui/lobby.css','ui/match.js','ui/match.css']) {
  const response=await fetch('http://127.0.0.1:5178/'+name,{signal:AbortSignal.timeout(5000)});
  const remote=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(root,name));
  const same=name.endsWith('.html')?canonicalDevHtml(remote)===canonicalDevHtml(local):sha256(remote)===sha256(local);
  if(response.status!==200||!same)throw new Error('Existing dev server is not current Nobi source: '+name);
 }
 console.log('Existing Nobi dev server on 5178 verified; it will not be stopped by tests.');
}
if(process.argv[1]?.endsWith('verify-dev-server.mjs'))await verifyDevServer();
