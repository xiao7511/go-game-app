import fs from 'node:fs';
import {randomInt} from 'node:crypto';
import vm from 'node:vm';
export function rules(kind: 'go' | 'guandan', competitive=false) {
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 const context:any={console:{log(){},warn(){},error(){}},document:{readyState:'loading',getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},localStorage:storage,sessionStorage:storage,setTimeout:()=>1,setInterval:()=>1,clearTimeout(){},clearInterval(){},performance:{now:()=>10000},URL,URLSearchParams,AbortController,atob,navigator:{userAgent:'Windows',platform:'Win32'},location:{href:'http://localhost/game.html',search:'',origin:'http://localhost',pathname:'/game.html'},addEventListener(){},dispatchEvent(){},alert(){}};
 context.Math=Object.assign(Object.create(Math),{random:()=>randomInt(0,281474976710655)/281474976710655});
 context.window=context;
 const filename=kind==='go'?'multiplayer-ext.js':'guandan-game.js';
 let source=fs.readFileSync(new URL('../'+filename,import.meta.url),'utf8');
 if(competitive&&kind==='guandan')source=source.replace('if (!team0Alive || !team1Alive || aliveCount <= 1)', 'if (aliveCount <= 1)');
 const end=source.lastIndexOf('})();');
 if(end<0) throw new Error('Unsupported legacy rule module');
 const hooks=kind==='go'?'state,placeStone,getKo:()=>window.state.koPoint,setKo:(value)=>{window.state.koPoint=value}':'state,typeOf,beats,finishOrder:()=>finishOrder';
 source=source.slice(0,end)+`window.__authority={${hooks}};\n`+source.slice(end);
 vm.runInNewContext(source,context,{filename,timeout:3000});
 return {api:context.__authority,GD:context.GD};
}
