import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { guandan, load } from './legacy-harness.mjs';

const seats = [0,1,2,3].map(i=>({uid:'user'+i,nickname:'player'+i}));
test('network deal rotates seats and applies legal play/pass once to existing engine', () => {
  const host=guandan(), guest=guandan();
  const hands=host.context.GD.createNetworkDeal(); const sent=[];
  expect(host.context.GD.startNetworkGame(hands,seats,0,0,a=>sent.push(a),true)).toBe(true);
  expect(guest.context.GD.startNetworkGame(hands,seats,1,0,()=>{})).toBe(true);
  expect(guest.api.state.players[0].hand.map(c=>c.id)).toEqual(host.api.state.players[1].hand.map(c=>c.id));
  const card=host.api.state.players[0].hand[0];
  expect(host.api.playCards(0,[card])).toBe(true);
  expect(sent).toHaveLength(1);
  expect(guest.context.GD.applyNetworkAction(sent[0])).toBe(true);
  expect(guest.context.GD.applyNetworkAction(sent[0])).toBe(false);
  expect(guest.api.state.players[3].hand).toHaveLength(26);
  expect(guest.api.state.currentTurn).toBe(0);
  const pass={type:'PASS_TURN',seat:1,sequence:2};
  expect(host.context.GD.applyNetworkAction(pass)).toBe(true);
  expect(guest.context.GD.applyNetworkAction(pass)).toBe(true);
  expect(host.api.state.currentTurn).toBe(2); expect(guest.api.state.currentTurn).toBe(1);
});
test('network rejects malformed deck, unknown cards, out-of-turn and skipped sequence', () => {
  const {context,api}=guandan(); const hands=context.GD.createNetworkDeal();
  expect(context.GD.startNetworkGame(hands,seats,0,0,()=>{})).toBe(true);
  const before=api.state.players[0].hand.length;
  for (const action of [
    {type:'PLAY_CARDS',seat:0,sequence:1,cardIds:['unknown']},
    {type:'PLAY_CARDS',seat:1,sequence:1,cardIds:[hands[1][0].id]},
    {type:'PLAY_CARDS',seat:0,sequence:3,cardIds:[hands[0][0].id]},
    {type:'PASS_TURN',seat:0,sequence:1}
  ]) expect(context.GD.applyNetworkAction(action)).toBe(false);
  expect(api.state.players[0].hand).toHaveLength(before);
  const invalid=hands.map(hand=>hand.slice());invalid[0][0]=null;
  expect(()=>context.GD.startNetworkGame(invalid,seats,0,0,()=>{})).not.toThrow();
  expect(context.GD.startNetworkGame(invalid,seats,0,0,()=>{})).toBe(false);
  hands[0][0]={...hands[0][0],id:'\" onload=alert(1)'};
  expect(context.GD.startNetworkGame(hands,seats,0,0,()=>{})).toBe(false);
});

test('malformed room/start messages never crash subscribed transport', async () => {
  const {context}=guandan();const events={};
  const channel={on(_t,f,fn){events[f.event]=fn;return this;},subscribe(){return this;},send(){return Promise.resolve('ok');}};
  context.state={uid:'user0',userNickname:'fixture'};context.GD.initGameMatch=()=>{};
  context.getSupabaseClient=()=>({channel:()=>channel});
  load('guandan-mp-ext.js',context);await context.GD_MP.startNetMatch();
  for(const event of ['PLAYER_JOIN','ROOM_SYNC','GAME_START','PLAY_CARDS','PASS_TURN']) {
    expect(()=>events[event]({payload:null})).not.toThrow();
    expect(()=>events[event]({payload:{}})).not.toThrow();
  }
});
test('real subscribed handlers update core and reject duplicate/forged messages', async () => {
  const {context,api}=guandan(); const events={}; const sends=[];
  const channel={on(_t,f,fn){events[f.event]=fn;return this;},subscribe(){return this;},send(p){sends.push(p);return Promise.resolve('ok');}};
  context.state={uid:'user0',userNickname:'fixture'};
  context.GD.initGameMatch=()=>{}; // DOM is covered by Playwright; actual rules remain loaded.
  context.getSupabaseClient=()=>({channel:()=>channel,removeChannel(){}});
  load('guandan-mp-ext.js',context);
  await context.GD_MP.startNetMatch();
  const hands=context.GD.createNetworkDeal();
  events.GAME_START({payload:{hands,seats,hostTurn:0}});
  const action={seat:0,sequence:1,uid:'user0',cardIds:[hands[0][0].id]};
  expect(events.PLAY_CARDS({payload:{...action,uid:'forged'}})).toBe(false);
  expect(events.PLAY_CARDS({payload:action})).toBe(true);
  expect(events.PLAY_CARDS({payload:action})).toBe(false);
  expect(api.state.players[0].hand).toHaveLength(26);
  expect(events.PASS_TURN({payload:{seat:1,sequence:2,uid:'user1'}})).toBe(true);
  expect(api.state.currentTurn).toBe(2);
});
