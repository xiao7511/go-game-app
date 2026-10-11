import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { onlinePublicConfig } from '../../scripts/online-public-config.mjs';

test('online dev config uses the deployed public endpoint and only returns public fields',async()=>{
  let url,options;
  const config=await onlinePublicConfig('https://example.invalid',async(u,o)=>{
    url=u.href;options=o;
    return {ok:true,json:async()=>({SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'anon-fixture',extra:'not published'})};
  });
  expect(url).toBe('https://example.invalid/get-config');
  expect(options.headers.Referer).toBe('https://example.invalid/login.html');
  expect(options.redirect).toBe('error');
  expect(config).toEqual({SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'anon-fixture'});
});

test('online dev config fails closed for unavailable, missing or elevated credentials',async()=>{
  await expect(onlinePublicConfig('http://example.invalid')).rejects.toThrow('Invalid public configuration origin');
  await expect(onlinePublicConfig('https://example.invalid',async()=>({ok:false,status:403}))).rejects.toThrow('HTTP 403');
  await expect(onlinePublicConfig('https://example.invalid',async()=>({ok:true,json:async()=>({})}))).rejects.toThrow('empty');
  await expect(onlinePublicConfig('https://example.invalid',async()=>({ok:true,json:async()=>({SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:['sb','secret','fixture'].join('_')})}))).rejects.toThrow('Secret key forbidden');
});
