// Explicit opt-in. Never loads .env, config.local.js, production URL or service keys.
import assert from 'node:assert/strict';
import {createClient} from '../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import {validateIsolatedEnvironment,createIsolatedFetch} from './isolated-env.mjs';
import {guandan} from '../tests/unit/legacy-harness.mjs';
let config;
try {config=validateIsolatedEnvironment(process.env);} catch {console.error('BLOCKED: isolated loopback URL, public key, four test accounts and explicit acknowledgment are required. No network requests sent.');process.exit(2);}
const localFetch=createIsolatedFetch(config.url);
const clients=config.users.map(()=>createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate) {const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline) throw new Error('Timeout');await pause(25);}}
async function subscribe(channel) {await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Subscribe timeout')),10000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error('Subscribe failed'));}});});}
const ok=result=>{assert.equal(result.error,null);return result.data;};
let roomCode;
try {
  const marker=ok(await clients[0].rpc('nobi_test_environment'));
  assert.equal(marker,'nobi-phase2-disposable-v1');
  const users=[];
  for(let i=0;i<4;i++) users.push(ok(await clients[i].auth.signInWithPassword(config.users[i])).user);
  assert.equal(new Set(users.map(user=>user.id)).size,4);
  console.log('PASS: disposable marker / four real Auth sessions');
  roomCode='T'+Math.random().toString(36).slice(2,7).toUpperCase().padEnd(5,'0');
  const board=Array.from({length:19},()=>Array(19).fill(0));
  ok(await clients[0].schema('game').from('game_rooms').insert({code:roomCode,black_id:users[0].id,board_state:board,next_turn:'black',status:'waiting'}));
  ok(await clients[1].schema('game').from('game_rooms').update({white_id:users[1].id,status:'playing'}).eq('code',roomCode));
  const joined=ok(await clients[1].schema('game').from('game_rooms').select('*').eq('code',roomCode).single());
  assert.equal(joined.white_id,users[1].id);
  ok(await clients[0].rpc('get_player_profile',{player_id:users[1].id}));
  board[9][9]=1;ok(await clients[0].schema('game').from('game_rooms').update({board_state:board,next_turn:'white'}).eq('code',roomCode));
  const snapshot=ok(await clients[1].schema('game').from('game_rooms').select('*').eq('code',roomCode).single());
  assert.equal(snapshot.next_turn,'white');assert.equal(snapshot.board_state[9][9],1);
  console.log('PASS: Go room create / join / profile / snapshot contract (not rules E2E)');
  const engines=users.map(()=>guandan());const hands=engines[0].context.GD.createNetworkDeal();
  const seats=users.map((u,i)=>({uid:u.id,nickname:'Test seat '+i}));
  engines.forEach((engine,i)=>assert.equal(engine.context.GD.startNetworkGame(hands,seats,i,0,()=>{},i===0),true));
  let delivered=0;
  const stream='room_guandan_PHASE2_'+roomCode;
  const sockets=clients.map((client,i)=>client.channel(stream,{config:{broadcast:{self:false,ack:true}}}).on('broadcast',{event:'PLAY_CARDS'},({payload})=>{
    if(engines[i].context.GD.applyNetworkAction(payload)) delivered++;
  }));
  for(const socket of sockets) await subscribe(socket);
  const action={type:'PLAY_CARDS',seat:0,sequence:1,cardIds:[hands[0][0].id]};
  assert.equal(engines[0].context.GD.applyNetworkAction(action),true);
  assert.equal(await sockets[0].send({type:'broadcast',event:'PLAY_CARDS',payload:action}),'ok');
  await waitFor(()=>delivered===3);
  console.log('PASS: real Realtime transport / four existing Guandan rule instances / turn sync');
  await clients[3].removeChannel(sockets[3]);
  const restored=clients[3].channel(stream,{config:{broadcast:{self:false,ack:true}}});let reconnected=false;
  restored.on('broadcast',{event:'RECONNECT_PROBE'},()=>{reconnected=true;});await subscribe(restored);
  await sockets[0].send({type:'broadcast',event:'RECONNECT_PROBE',payload:{probe:true}});await waitFor(()=>reconnected);
  console.log('PASS: transport unsubscribe / resubscribe (NOT game state recovery)');
  ok(await clients[0].schema('game').from('game_rooms').update({status:'ended'}).eq('code',roomCode));
  const ended=ok(await clients[1].schema('game').from('game_rooms').select('status').eq('code',roomCode).single());assert.equal(ended.status,'ended');
  console.log('PASS: isolated ended-state persistence; room intentionally retained for inspection');
  console.log('NOT RUN: frontend reconnect/quit/game-over E2E, authoritative scoring, RLS negative/concurrency tests. Transport smoke is not release acceptance.');
} catch {console.error('FAIL: isolated integration smoke; no credentials or server payload printed. Inspect the local test instance.');process.exitCode=1;}
finally {await Promise.all(clients.map(client=>client.removeAllChannels().catch(()=>{})));await Promise.all(clients.map(client=>client.auth.signOut().catch(()=>{})));}
