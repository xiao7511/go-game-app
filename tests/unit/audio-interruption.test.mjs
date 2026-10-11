import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
test('an effect resolving after background/resume cannot revive an untracked sound',async()=>{
  let complete,paused=true;
  const c=sandbox();load('ui/audio-manifest.js',c);load('ui/audio-manager.js',c);
  const manager=c.NobiAudioFactory.create({makeAudio:()=>({volume:1,play:()=>new Promise(resolve=>{complete=()=>{paused=false;resolve();};}),pause(){paused=true;}})});
  await manager.unlock();const pending=manager.playEffect('click');manager.suspend();await manager.resume();complete();
  expect(await pending).toBe(false);expect(paused).toBe(true);
});

test('both real engines delegate sounds, and results use the shared scene without a second synth',()=>{
  const events=[];
  const c=sandbox({NobiAudio:{playEffect:name=>events.push(name),setScene:scene=>events.push(scene)},AudioContext:class{constructor(){throw Error('Duplicate audio engine');}}});
  const gd=load('guandan-game.js',c,'playGDSound');gd.playGDSound('click');gd.playGDSound('pass');
  const go=load('multiplayer-ext.js',c,'playSound, showGameOverOverlay');go.playSound('placeStone');go.showGameOverOverlay('black');
  expect(events).toEqual(['click','pass','placeStone','result']);
});
