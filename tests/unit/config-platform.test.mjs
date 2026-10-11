import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { sandbox, load } from './legacy-harness.mjs';
import { publicConfig } from '../../scripts/public-config.mjs';

test('single Supabase Auth client and explicit public profile RPC contract', async () => {
  let count=0; const calls=[];
  const client={auth:{getUser:async()=>({data:{user:{id:'auth-id'}},error:null})},schema(name){calls.push(name);return{rpc:async(fn,args)=>{calls.push([fn,args]);return{data:[{user_id:'auth-id'}],error:null};}};}};
  const context=sandbox({CONFIG:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon-fixture'},supabase:{createClient(...args){count++;calls.push(args[2]);return client;}}});
  load('config.js',context);load('supabaseClient.js',context);
  await context.NobiServices.ready;
  expect(await context.NobiServices.requireClient()).toBe(client);
  expect(context.getSupabaseClient()).toBe(client);
  expect((await context.NobiServices.requireUser()).id).toBe('auth-id');
  expect((await context.NobiServices.getProfile('auth-id')).user_id).toBe('auth-id');
  expect(count).toBe(1); expect(calls[0].db.schema).toBe('public');
  expect(calls.slice(-2)).toEqual(['public',['get_player_profile',{player_id:'auth-id'}]]);
  const go=load('multiplayer-ext.js',context,'initSupabaseClient, getPlayerProfile, getCurrentUser');
  expect(await go.initSupabaseClient()).toBe(client);
  expect((await go.getCurrentUser()).id).toBe('auth-id');
  expect((await go.getPlayerProfile('auth-id')).user_id).toBe('auth-id');
  expect(count).toBe(1);
  expect(calls.slice(-2)).toEqual(['public',['get_player_profile',{player_id:'auth-id'}]]);
});
test('anonymous/missing config cannot create authenticated room identity', async () => {
  const context=sandbox({NobiPlatform:{isNative:()=>true}});
  load('config.js',context);load('supabaseClient.js',context);
  await expect(context.NobiServices.requireUser()).rejects.toThrow();
});
test('public build config supports legacy injection but rejects elevated keys and HTTP production', async () => {
  expect((await publicConfig('window.APP_CONFIG_LOCAL={SUPABASE_URL:"https://example.invalid/rest/v1/",SUPABASE_ANON_KEY:"fixture"};')).SUPABASE_URL).toBe('https://example.invalid');
  await expect(publicConfig('',{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:['sb','secret','fixture'].join('_')})).rejects.toThrow();
  const jwt=['header',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'signature'].join('.');
  await expect(publicConfig('',{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:jwt})).rejects.toThrow();
  await expect(publicConfig('',{SUPABASE_URL:'http://example.invalid',SUPABASE_ANON_KEY:'fixture'})).rejects.toThrow();
  await expect(publicConfig('',{SUPABASE_URL:'https://example.invalid'})).rejects.toThrow();
});
test.each([
  ['PC','Windows','Win32',0,'web',true],
  ['Android','Mozilla Android Mobile','Linux',0,'web',false],
  ['iPhone','iPhone','iPhone',0,'web',false],
  ['iPad desktop UA','Macintosh','MacIntel',5,'web',false],
  ['native shell','Windows','Win32',0,'mobile',false]
])('%s PC feature gate', (_name,userAgent,platform,maxTouchPoints,target,expected) => {
  const context=sandbox({navigator:{userAgent,platform,maxTouchPoints},NOBI_BUILD_TARGET:target});
  load('platform.js',context);
  expect(context.NobiPlatform.canUsePCGames()).toBe(expected);
});

test('real logout handler signs out but preserves non-auth settings',async()=>{
  const values=new Map([['nobi-audio-volume','0.6']]);
  const sessions=new Map([['userInfo','fixture']]);let signedOut=0,redirect=null;
  const classes={add(){},remove(){}};
  const element=()=>({style:{setProperty(){}},classList:classes,querySelectorAll:()=>[]});
  const elements=new Map(['app-perfect-selector-mask','perfect-go-solo','perfect-go-net','app-global-signout-trigger'].map(id=>[id,element()]));
  const context=sandbox({
    NobiPlatform:{canUsePCGames:()=>false},NobiServices:{ready:Promise.resolve(null)},
    state:{uid:'fixture-user'},getSupabaseClient:()=>({auth:{async signOut(){signedOut++;}}}),
    localStorage:{getItem:k=>values.get(k)??null,clear(){throw new Error('Preferences must not be cleared');}},
    sessionStorage:{getItem:k=>sessions.get(k)??null,removeItem:k=>sessions.delete(k),clear(){throw new Error('Unexpected bulk clear');}},
    location:{replace:url=>{redirect=url;}},
    document:{readyState:'loading',getElementById:id=>elements.get(id)??null,createElement:element,head:{appendChild(){}},body:{classList:classes,appendChild(){}},addEventListener(){}}
  });
  load('game.js',context);context.renderAppCentralLobby();
  await elements.get('app-global-signout-trigger').onclick({stopPropagation(){}});
  expect(signedOut).toBe(1);expect(redirect).toBe('login.html');
  expect(values.get('nobi-audio-volume')).toBe('0.6');expect(sessions.has('userInfo')).toBe(false);
  expect(context.state.uid).toBeUndefined();
});
