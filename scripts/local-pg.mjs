// Dedicated loopback-only PostgreSQL bridge. Protocol v3 simple queries, no remote URL input.
// https://www.postgresql.org/docs/17/protocol-message-formats.html
import net from 'node:net';import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {guardLocalConfig,project,localUrl} from './local-supabase.mjs';
const runtimeFile=new URL('../.nobi-isolated/phase3a/runtime.json',import.meta.url);
const int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b;};
const packet=(type,body)=>Buffer.concat([Buffer.from(type),int(body.length+4),body]);
const md5=x=>crypto.createHash('md5').update(x).digest('hex');
export async function queryLocal(sql){
 guardLocalConfig();const config=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));if(config.project!==project||config.url!==localUrl||typeof config.dbPassword!=='string')throw Error('BLOCKED: isolated runtime identity mismatch');
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:'127.0.0.1',port:55422});let buffer=Buffer.alloc(0),stage='auth',rows=[],failed=false,nonce,first,expectedServer;
  const stop=error=>{if(failed)return;failed=true;socket.destroy();reject(error);};socket.setTimeout(15000,()=>stop(Error('local PostgreSQL deadline')));socket.on('error',()=>stop(Error('local PostgreSQL unavailable')));
  socket.on('connect',()=>{const startup=Buffer.from('user\0postgres\0database\0postgres\0application_name\0nobi-phase3d-local\0\0');socket.write(Buffer.concat([int(startup.length+8),int(196608),startup]));});
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);try{while(buffer.length>=5){const size=buffer.readInt32BE(1);if(size<4||size>32*1024*1024)throw Error('invalid local PostgreSQL frame');if(buffer.length<size+1)break;const type=String.fromCharCode(buffer[0]),body=buffer.subarray(5,size+1);buffer=buffer.subarray(size+1);
   if(type==='R'){
    const mode=body.readInt32BE(0);
    if(mode===3)socket.write(packet('p',Buffer.from(config.dbPassword+'\0')));
    else if(mode===5)socket.write(packet('p',Buffer.from('md5'+md5(Buffer.concat([Buffer.from(md5(config.dbPassword+'postgres')),body.subarray(4)]))+'\0')));
    else if(mode===10){if(!body.subarray(4).toString().split('\0').includes('SCRAM-SHA-256'))throw Error('unsupported local authentication');nonce=crypto.randomBytes(18).toString('base64');first='n=postgres,r='+nonce;const initial=Buffer.from('n,,'+first);socket.write(packet('p',Buffer.concat([Buffer.from('SCRAM-SHA-256\0'),int(initial.length),initial])));}
    else if(mode===11){const challenge=body.subarray(4).toString(),fields=Object.fromEntries(challenge.split(',').map(x=>[x[0],x.slice(2)])),iterations=Number(fields.i);if(!fields.r?.startsWith(nonce)||fields.r.length<=nonce.length||!Number.isInteger(iterations)||iterations<4096||iterations>1000000)throw Error('invalid SCRAM challenge');const final='c=biws,r='+fields.r,auth=first+','+challenge+','+final,salted=crypto.pbkdf2Sync(config.dbPassword,Buffer.from(fields.s,'base64'),iterations,32,'sha256'),hmac=(key,text)=>crypto.createHmac('sha256',key).update(text).digest(),clientKey=hmac(salted,'Client Key'),signature=hmac(crypto.createHash('sha256').update(clientKey).digest(),auth),proof=Buffer.from(clientKey.map((n,i)=>n^signature[i]));expectedServer=hmac(hmac(salted,'Server Key'),auth);socket.write(packet('p',Buffer.from(final+',p='+proof.toString('base64'))));}
    else if(mode===12){const signature=Buffer.from(body.subarray(4).toString().slice(2),'base64');if(!expectedServer||signature.length!==expectedServer.length||!crypto.timingSafeEqual(signature,expectedServer))throw Error('local server authentication failed');}
    else if(mode!==0)throw Error('unsupported local PostgreSQL authentication');
   }else if(type==='E'){// SQL payload and credentials are never included in errors.
    const fields=body.toString().split('\0'),code=fields.find(x=>x.startsWith('C'))?.slice(1)??'unknown';throw Error('local PostgreSQL query rejected ('+code+')');
   }else if(type==='D'){let offset=2;const columns=[];for(let i=0;i<body.readInt16BE(0);i++){const n=body.readInt32BE(offset);offset+=4;columns.push(n===-1?'':body.subarray(offset,offset+n).toString());if(n!==-1)offset+=n;}rows.push(columns.join('|'));}
   else if(type==='Z'){
    if(stage==='auth'){stage='guard';socket.write(packet('Q',Buffer.from('select public.nobi_isolated_fixture();\0')));}
    else if(stage==='guard'){if(rows.join('\n')!=='nobi-phase3a-local-v1')throw Error('BLOCKED: isolated database marker mismatch');rows=[];stage='query';socket.write(packet('Q',Buffer.from(sql+'\0')));}
    else {const output=rows.join('\n');failed=true;socket.end(packet('X',Buffer.alloc(0)));resolve(output);}
   }
  }}catch(error){stop(error);}});
  socket.on('end',()=>{if(!failed)stop(Error('local PostgreSQL closed early'));});
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){let sql='';for await(const chunk of process.stdin)sql+=chunk;try{console.log(await queryLocal(sql));}catch(error){console.error(error.message);process.exitCode=1;}}
