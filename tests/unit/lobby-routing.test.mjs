import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
function shell(pc=true) {
  const calls=[]; const classes=new Set();
  const c=sandbox({NobiPlatform:{canUsePCGames:()=>pc},NobiLobby:{notify:m=>calls.push(m)},NobiServices:{ready:Promise.resolve(null),requireUser:async()=>{throw Error('no Auth');}},
    NobiPC:{launch:m=>calls.push(['pc',m])},GD:{initGameMatch:m=>calls.push(['guandan',m])},MP:{startAIGame:()=>calls.push('go')},
    document:{getElementById:()=>({style:{setProperty(){}}}),body:{classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x))}}},alert:m=>calls.push(m)});
  load('ui/registry.js',c); load('game.js',c); return {c,calls,classes};
}
test('coordinator calls only selected legacy engines and rejects mobile PC bypass', async()=>{
  const {c,calls,classes}=shell(false);
  c.selectedGameId='cs16'; await c.launchMatchGame('SINGLE'); expect(classes.size).toBe(0); expect(calls).toEqual(['当前平台不提供此游戏入口']);
  c.selectedGameId='go'; await c.launchMatchGame('NET'); expect(classes.size).toBe(0);
  expect(calls.at(-1)).toContain('请先登录');
  await c.launchMatchGame('SINGLE'); expect(calls.at(-1)).toBe('go');
  expect(classes.has('nobi-playing-go')).toBe(true);
});
test('PC launcher uses original adapter, never claims an in-browser CS session',async()=>{
  const {c,calls,classes}=shell(); c.selectedGameId='cs16'; await c.launchMatchGame('NET');
  expect(calls).toEqual([['pc','NET']]); expect(classes.size).toBe(0);
});
test('display text escapes metadata rather than executing HTML',()=>{
  const c=sandbox(); load('ui/lobby.js',c);
  expect(c.NobiLobby.escape('<img src=x onerror="bad">&')).toBe('&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;');
});

test('real PC adapter retains protocol in a VM without executing Windows commands',()=>{
  const c=sandbox({NobiPlatform:{canUsePCGames:()=>true}}); load('pc/cs16-adapter.js',c);
  c.NobiPC.launch('SINGLE'); expect(c.location.href).toBe('cs16://');
});
