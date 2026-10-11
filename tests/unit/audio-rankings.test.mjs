import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';

function audio(saved='{}') {
  const values=new Map([['nobi.audio.v1',saved]]), elements=[], jobs=new Map(); let id=0,time=0;
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  class FakeAudio {
    constructor(src){this.src=src;this.paused=true;this.volume=1;this.handlers={};elements.push(this);}
    async play(){this.paused=false;if(this.reject)throw Error('autoplay');}
    pause(){this.paused=true;this.handlers.pause?.();}
    addEventListener(type,fn){this.handlers[type]=fn;}
  }
  const c=sandbox({Audio:FakeAudio,localStorage:storage}); load('ui/audio-manifest.js',c);load('ui/audio-manager.js',c);
  function create(extra={}) {return c.NobiAudioFactory.create({storage,makeAudio:src=>new FakeAudio(src),schedule:fn=>{jobs.set(++id,fn);return id;},cancel:n=>jobs.delete(n),now:()=>time,...extra});}
  function advance(){time+=500;for(const [key,fn]of [...jobs]){jobs.delete(key);fn();}}
  return {c,values,elements,create,advance,jobs};
}
const tracks={scenes:{lobby:{src:'assets/music/lobby.mp3',license:'test fixture, not shipped'},guandan:{src:'assets/music/guandan.mp3',license:'test fixture, not shipped'},go:null,result:null},effects:{click:'assets/sounds/button-25.mp3',yourTurn:'assets/sounds/button-3.mp3'}};

test('audio settings persist independently of Auth and recover from corrupted preferences',()=>{
  const a=audio('not json');const manager=a.create();
  expect(manager.getSettings().musicEnabled).toBe(true);
  manager.setSettings({musicEnabled:true,musicVolume:2,effectsVolume:-1,promptVolume:.42});
  const restored=a.create().getSettings();expect(restored.musicEnabled).toBe(true);expect(restored.musicVolume).toBe(1);expect(restored.effectsVolume).toBe(0);expect(restored.promptVolume).toBe(.42);
  expect(a.values.size).toBe(1);
});
test('original Guandan music is available, other scenes do not create music elements',async()=>{
  const a=audio();const manager=a.create();manager.setSettings({musicEnabled:true});await manager.unlock();
  for(const scene of ['lobby','go','result']){await manager.setScene(scene);expect(manager.getStatus().available).toBe(false);expect(manager.getStatus().playing).toBe(false);}
  expect(a.elements).toHaveLength(0);
  await manager.setScene('guandan');a.advance();expect(manager.getStatus().playing).toBe(true);
  expect(a.elements.at(-1).src).toBe('assets/music/guandan-moonlight.mp3');expect(a.elements.at(-1).loop).toBe(true);
  manager.setSettings({musicEnabled:false});a.advance();expect(a.elements.at(-1).paused).toBe(true);
});
test('effects wait for interaction; effect/prompt mute and volume domains are independent',async()=>{
  const a=audio();const manager=a.create(); expect(await manager.playEffect('click')).toBe(false);
  await manager.unlock();manager.setSettings({effectsVolume:.2,promptVolume:.7});
  expect(await manager.playEffect('click')).toBe(true);expect(a.elements.at(-1).volume).toBe(.2);
  expect(await manager.playEffect('yourTurn')).toBe(true);expect(a.elements.at(-1).volume).toBe(.7);
  manager.setSettings({effectsEnabled:false});expect(a.elements[0].paused).toBe(true);expect(a.elements[1].paused).toBe(false);
  expect(await manager.playEffect('click')).toBe(false); manager.suspend();expect(a.elements.every(e=>e.paused)).toBe(true);
  expect(await manager.playEffect('yourTurn')).toBe(false);await manager.resume();expect(await manager.playEffect('yourTurn')).toBe(true);
});
test('authorised-track interface crossfades scenes and background cancels fades',async()=>{
  const a=audio();const manager=a.create({manifest:tracks});manager.setSettings({musicEnabled:true});await manager.unlock();a.advance();
  expect(a.elements[0].volume).toBe(.35);await manager.setScene('guandan');a.advance();
  expect(a.elements[0].paused).toBe(true);expect(a.elements[1].volume).toBe(.35);
  manager.suspend();expect(a.jobs.size).toBe(0);expect(manager.getStatus().playing).toBe(false);expect(a.elements.every(e=>e.paused)).toBe(true);
  await manager.resume();a.advance();expect(manager.getStatus().playing).toBe(true);
  await manager.setScene('result');a.advance();expect(a.elements.every(e=>e.paused)).toBe(true);
});
test('autoplay rejection is reported and can be retried by user interaction',async()=>{
  const a=audio();let reject=true;
  const manager=a.create({manifest:tracks,makeAudio:src=>{const element={src,volume:1,paused:true,async play(){if(reject)throw Error('blocked');this.paused=false;},pause(){this.paused=true;}};return element;}});
  manager.setSettings({musicEnabled:true});await manager.unlock();expect(manager.getStatus().blocked).toBe('autoplay');
  reject=false;await manager.unlock();a.advance();expect(manager.getStatus().blocked).toBeNull();expect(manager.getStatus().playing).toBe(true);
});
test('late play promise cannot revive audio after a mobile interruption',async()=>{
  const a=audio();let resolvePlay;let paused=true;
  const manager=a.create({manifest:tracks,makeAudio:()=>({volume:1,get paused(){return paused;},play(){return new Promise(resolve=>{resolvePlay=()=>{paused=false;resolve();};});},pause(){paused=true;}})});
  manager.setSettings({musicEnabled:true});const pending=manager.unlock();manager.suspend();resolvePlay();await pending;
  expect(paused).toBe(true);expect(manager.getStatus().playing).toBe(false);
});
test('audio source validation rejects remote, traversal and unlicensed music',()=>{
  const a=audio();
  for(const src of ['https://example.invalid/song.mp3','assets/music/../song.mp3']) expect(()=>a.create({manifest:{...tracks,scenes:{...tracks.scenes,lobby:{src,license:'fixture'}}}})).toThrow();
  expect(()=>a.create({manifest:{...tracks,scenes:{...tracks.scenes,lobby:{src:'assets/music/song.mp3'}}}})).toThrow();
});

test('classical selection persists, crossfades immediately in Guandan and rejects unknown paths',async()=>{
  const a=audio();const manager=a.create();await manager.unlock();await manager.setScene('guandan');a.advance();
  expect(manager.getTracks('guandan').map(t=>t.id)).toEqual(['moonlight','nocturne','dreaming']);
  manager.setSettings({guandanTrack:'nocturne'});await new Promise(resolve=>setImmediate(resolve));a.advance();
  expect(manager.getStatus().trackId).toBe('nocturne');expect(a.elements[0].paused).toBe(true);
  expect(a.elements.at(-1).src).toBe('assets/music/guandan-nocturne.mp3');
  expect(a.create().getSettings().guandanTrack).toBe('nocturne');
  manager.setSettings({guandanTrack:'../../private'});expect(manager.getSettings().guandanTrack).toBe('moonlight');
});

test('rapid track changes leave only the latest music playing and mute cancels every fading track',async()=>{
  const a=audio();const manager=a.create();await manager.unlock();await manager.setScene('guandan');a.advance();
  manager.setSettings({guandanTrack:'nocturne'});manager.setSettings({guandanTrack:'dreaming'});
  await new Promise(resolve=>setImmediate(resolve));a.advance();
  expect(a.elements.filter(e=>!e.paused).map(e=>e.src)).toEqual(['assets/music/guandan-dreaming.mp3']);
  manager.setSettings({guandanTrack:'moonlight'});manager.setSettings({musicEnabled:false});
  await new Promise(resolve=>setImmediate(resolve));a.advance();expect(a.elements.every(e=>e.paused)).toBe(true);
});
test('rank provider is unavailable by default; validates queries, demo rows and failures',async()=>{
  const c=sandbox();load('ui/rankings.js',c);const query={gameId:'go',scope:'global',period:'season',userId:null};
  expect(await c.NobiRankings.load(query)).toEqual({status:'unavailable',rows:[],myRank:null});
  let passed;const demo=c.NobiRankingFactory.create(async args=>{passed=args;return{status:'demo',rows:[{nickname:'明确演示',rank:1,score:10}],myRank:null};});
  expect((await demo.load(query)).status).toBe('demo');expect(passed.gameId).toBe('go');
  await expect(demo.load({...query,gameId:'cs16'})).rejects.toThrow();
  await expect(c.NobiRankingFactory.create(async()=>({status:'ready',rows:[{nickname:'bad',rank:0,score:NaN}]})).load(query)).rejects.toThrow();
  await expect(c.NobiRankingFactory.create(async()=>({status:'unavailable',rows:[{nickname:'bad',rank:1,score:100}]})).load(query)).rejects.toThrow();
});
