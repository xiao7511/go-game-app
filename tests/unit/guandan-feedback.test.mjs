import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
import {Authority} from '../../server/authority.ts';

test('countdown sounds once per final second, respects background and never advances network turns',()=>{
  let time=0,tick;const sounds=[],number={textContent:''};
  const node={hidden:true,querySelector:()=>number,toggleAttribute(){}};
  const context=sandbox({Date:class extends Date{static now(){return time;}},NobiAudio:{playEffect:name=>sounds.push(name)},setInterval:fn=>{tick=fn;return 1;}});
  const api=load('guandan-game.js',context,'state,startCountdown');
  Object.assign(api.state,{root:{querySelector:()=>node},active:true,gameMode:'NET_BATTLE',currentTurn:0});
  api.startCountdown();expect(number.textContent).toBe('30');expect(node.hidden).toBe(false);
  time=19000;tick();expect(sounds).toHaveLength(0);
  for(time=20000;time<30000;time+=1000){tick();tick();}
  expect(sounds).toHaveLength(10);tick();expect(api.state.currentTurn).toBe(0);
  api.state.currentTurn=1;api.startCountdown();expect(node.hidden).toBe(true);
  api.state.currentTurn=0;api.startCountdown();context.document.hidden=true;time+=20000;tick();expect(sounds).toHaveLength(10);
});

test('avatar preferences are per account and multiplayer seats use each account portrait',()=>{
  const store=new Map();const context=sandbox({localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
  load('ui/avatars.js',context);const avatars=context.NobiAvatars;
  avatars.setAccount({id:'alice',user_metadata:{avatar_url:'https://example.invalid/alice.png'}});
  expect(avatars.self('alice')).toBe('https://example.invalid/alice.png');avatars.choosePreset(2);
  avatars.setAccount({id:'bob',user_metadata:{avatar_url:'https://example.invalid/bob.png'}});
  expect(avatars.self('bob')).toBe('https://example.invalid/bob.png');avatars.choosePreset(4);
  avatars.setAccount({id:'alice'});expect(avatars.self('alice')).toBe(avatars.presets[2].src);
  const api=load('guandan-game.js',context,'state,playerAvatar');api.state.gameMode='NET_BATTLE';
  expect(api.playerAvatar(1,{uid:'bob',avatar:'https://example.invalid/bob.png'})).toBe('https://example.invalid/bob.png');
  expect(api.playerAvatar(1,{uid:'bob',avatar:'javascript:bad'})).toBe(avatars.forKey('bob'));
  const hands=context.GD.createNetworkDeal(),seats=[0,1,2,3].map(i=>({uid:'u'+i,nickname:'p'+i,avatar:'https://example.invalid/'+i+'.png'}));
  context.GD.startNetworkGame(hands,seats,2,0,()=>{});
  expect(api.state.players[1].uid).toBe('u3');expect(api.state.players[1].avatar).toBe(seats[3].avatar);
});

test('bomb effect triggers once for a public play, not for repeated renders or normal cards',()=>{
  const sounds=[],node={hidden:true,innerHTML:''};const context=sandbox({NobiAudio:{playEffect:name=>sounds.push(name)}});
  const api=load('guandan-game.js',context,'state,paintBombEffect');api.state.root={querySelector:()=>node};
  api.state.lastPlayedTrick={seat:1,type:'炸弹',cards:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]};
  api.paintBombEffect();api.paintBombEffect();expect(sounds).toEqual(['bomb']);expect(node.hidden).toBe(false);
  api.state.lastPlayedTrick={seat:2,type:'单张',cards:[{id:'e'}]};api.paintBombEffect();expect(sounds).toHaveLength(1);
  api.state.lastPlayedTrick={seat:2,type:'天王炸',cards:[{id:'f'}]};api.paintBombEffect();expect(sounds).toHaveLength(2);
});

test('countdown obeys prompt settings even when ordinary effects are muted',async()=>{
  const elements=[];class Audio{constructor(src){this.src=src;this.paused=true;elements.push(this);}async play(){this.paused=false;}pause(){this.paused=true;}}
  const context=sandbox({Audio});load('ui/audio-manifest.js',context);load('ui/audio-manager.js',context);
  const audio=context.NobiAudio;await audio.unlock();audio.setSettings({effectsEnabled:false,promptVolume:.4});
  expect(await audio.playEffect('countdown')).toBe(true);expect(elements.at(-1).volume).toBe(.4);
  audio.setSettings({promptEnabled:false});expect(elements.at(-1).paused).toBe(true);
  expect(await audio.playEffect('countdown')).toBe(false);expect(await audio.playEffect('bomb')).toBe(false);
});

test('authority retains public account portraits across snapshot restoration',async()=>{
  const authority=new Authority();authority.create('portraits','guandan','alice');authority.join('portraits','bob',1);
  const room=authority.rooms.get('portraits');room.avatars={alice:'https://example.invalid/alice.png',bob:'https://example.invalid/bob.png'};
  expect(authority.view(room,'alice').players[1].avatar).toBe(room.avatars.bob);
  const restored=new Authority();await restored.restore(authority.exportState(room));
  expect(restored.view(restored.rooms.get('portraits'),'bob').players[0].avatar).toBe(room.avatars.alice);
});
