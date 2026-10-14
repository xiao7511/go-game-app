import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
import {accountAvatar} from '../../server/account-avatar.mjs';
import {roomDirectory} from '../../server/room-directory.mjs';
import {deviceOnlineConfig} from '../../scripts/device-online-config.mjs';

test('account avatar saves to Auth, survives another device and rolls back failures',async()=>{
 const store=new Map();let error=null,verified='alice',saved;
 const context=sandbox({localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},NobiServices:{requireUser:async()=>({id:verified}),requireClient:async()=>({auth:{updateUser:async input=>{saved=input;return {error,data:{user:{id:'alice',user_metadata:input.data}}};}}})}});
 load('ui/avatars.js',context);const avatars=context.NobiAvatars;avatars.setAccount({id:'alice'});
 await avatars.savePreset(2);expect(saved.data.nobi_avatar.id).toBe(2);expect(avatars.current().id).toBe(2);
 store.clear();avatars.setAccount({id:'alice',user_metadata:saved.data});expect(avatars.self('alice')).toBe(avatars.presets[2].src);
 error=new Error('network');await expect(avatars.savePreset(4)).rejects.toThrow('同步失败');expect(avatars.current().id).toBe(2);
 verified='bob';await expect(avatars.saveReset()).rejects.toThrow('账号已切换');expect(avatars.current().id).toBe(2);
});
test('verified portrait metadata rejects script URLs, arbitrary SVGs and oversized data',()=>{
 expect(accountAvatar({user_metadata:{nobi_avatar:{type:'preset',id:3}}})).toBe('ui/avatar-presets/3.svg');
 for(const data of ['javascript:alert(1)','data:image/svg+xml,<svg/>','data:image/jpeg;base64,'+'A'.repeat(20000)])expect(accountAvatar({user_metadata:{nobi_avatar:{type:'upload',data}}})).toBe(null);
});
test('room directory lists all games with pagination and no private state or user IDs',()=>{
 const rooms=Array.from({length:55},(_,i)=>({id:String(i),kind:i%2?'go':'guandan',owner:'owner',names:{owner:'房主'},avatars:{},seats:i===1?['owner','bob']:['owner'],status:i===2?'playing':'waiting',updatedAt:i,engine:{hand:['SECRET']},journal:['SECRET']}));
 const first=roomDirectory(rooms,'visitor');expect(first.total).toBe(55);expect(first.rooms).toHaveLength(50);expect(first.hasNext).toBe(true);expect(JSON.stringify(first)).not.toMatch(/SECRET|owner|journal|seats/);
 const second=roomDirectory(rooms,'visitor',new URLSearchParams('offset=50'));expect(second.rooms).toHaveLength(5);expect(second.rooms.find(r=>r.id==='1').canJoin).toBe(false);expect(second.rooms.find(r=>r.id==='2').canJoin).toBe(false);
 expect(roomDirectory(rooms,'bob',new URLSearchParams('kind=go')).rooms.find(r=>r.id==='1').member).toBe(true);
});
test('production online configuration requires a clean HTTPS endpoint and correct Auth',()=>{
 const auth={SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public'};
 expect(deviceOnlineConfig({NOBI_ONLINE_URL:'https://play.example/'},auth).mode).toBe('production');
 expect(deviceOnlineConfig({NOBI_ONLINE_URL:'https://play.example/nobi-online'},auth).url).toBe('https://play.example/nobi-online');
 for(const url of ['http://play.example','https://u:p@play.example','https://play.example/path?token=x'])expect(()=>deviceOnlineConfig({NOBI_ONLINE_URL:url},auth)).toThrow();
 expect(()=>deviceOnlineConfig({NOBI_ONLINE_URL:'https://play.example',NOBI_DEVICE_ONLINE:'USB_LOCAL_AUTH_VERIFIED'},auth)).toThrow();
});

test('directory excludes ended and blocked rooms before counting and paginating',()=>{
 const rooms=['ended','blocked','waiting','playing'].map((status,i)=>({id:String(i),kind:'go',status,owner:'a',names:{a:'棋手'},seats:['a'],updatedAt:i}));
 const list=roomDirectory(rooms,'a');expect(list.total).toBe(2);expect(list.rooms.map(r=>r.status)).toEqual(['playing','waiting']);
 expect(roomDirectory(rooms,'a',new URLSearchParams('offset=1')).rooms).toHaveLength(1);
});
