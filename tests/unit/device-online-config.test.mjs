import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {deviceOnlineConfig} from '../../scripts/device-online-config.mjs';
test('USB authority configuration requires explicit mode and complete account config',()=>{
 const auth={SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'public'};
 expect(deviceOnlineConfig({},auth)).toBeNull();
 expect(()=>deviceOnlineConfig({NOBI_DEVICE_ONLINE:'other'},auth)).toThrow();
 expect(()=>deviceOnlineConfig({NOBI_DEVICE_ONLINE:'USB_LOCAL_AUTH_VERIFIED'},{})).toThrow();
 expect(deviceOnlineConfig({NOBI_DEVICE_ONLINE:'USB_LOCAL_AUTH_VERIFIED'},auth)).toEqual({mode:'usb-test',url:'http://127.0.0.1:55440',supabaseUrl:auth.SUPABASE_URL,ranked:false});
});
test('production HTTPS endpoint supports a proxy prefix and rejects credential/query injection',()=>{
 const auth={SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'public'};
 expect(deviceOnlineConfig({NOBI_ONLINE_URL:'https://game.example/nobi-online/'},auth).url).toBe('https://game.example/nobi-online');
 expect(deviceOnlineConfig({NOBI_ONLINE_URL:'https://game.example'},auth).url).toBe('https://game.example');
 for(const url of ['http://game.example','https://u:p@game.example','https://game.example?token=x','https://game.example/#x','https://game.example/a%2Fb'])expect(()=>deviceOnlineConfig({NOBI_ONLINE_URL:url},auth)).toThrow();
 expect(()=>deviceOnlineConfig({NOBI_ONLINE_URL:'https://game.example',NOBI_DEVICE_ONLINE:'USB_LOCAL_AUTH_VERIFIED'},auth)).toThrow();
});
