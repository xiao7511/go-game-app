import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {validateIsolatedEnvironment,createIsolatedFetch} from '../../scripts/isolated-env.mjs';
const fixture=()=>({NOBI_ISOLATED_ACK:'LOCAL_DISPOSABLE_ONLY',NOBI_TEST_SUPABASE_URL:'http://127.0.0.1:54321',NOBI_TEST_SUPABASE_ANON_KEY:'sb_publishable_test_fixture',NOBI_TEST_USERS_JSON:JSON.stringify([0,1,2,3].map(i=>({email:`test${i}@example.invalid`,password:'test-fixture-only'})))});
test('integration smoke refuses production/alternate ports/implicit scope and redirects before networking',()=>{
  for(const url of ['https://production.example','http://127.0.0.1:8000','http://127.0.0.1:54321/path','http://user@127.0.0.1:54321']) expect(()=>validateIsolatedEnvironment({...fixture(),NOBI_TEST_SUPABASE_URL:url})).toThrow();
  expect(()=>validateIsolatedEnvironment({...fixture(),NOBI_ISOLATED_ACK:''})).toThrow();
  expect(validateIsolatedEnvironment(fixture()).url).toBe('http://127.0.0.1:54321');
  const calls=[];const localFetch=createIsolatedFetch('http://127.0.0.1:54321',(input,options)=>calls.push({input,options}));
  expect(()=>localFetch('https://production.example')).toThrow();expect(calls).toHaveLength(0);
  localFetch(new URL('http://127.0.0.1:54321/rest/v1/'),{redirect:'follow'});
  expect(calls[0].options.redirect).toBe('error');expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
});
test('integration smoke rejects server keys and incomplete disposable identities',()=>{
  // Prefix-only non-secret fixture: do not manufacture a token-shaped string in Git.
  expect(()=>validateIsolatedEnvironment({...fixture(),NOBI_TEST_SUPABASE_ANON_KEY:'sb_secret_'})).toThrow();
  const serverRole='fixture.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fixture';
  expect(()=>validateIsolatedEnvironment({...fixture(),NOBI_TEST_SUPABASE_ANON_KEY:serverRole})).toThrow();
  expect(()=>validateIsolatedEnvironment({...fixture(),NOBI_TEST_USERS_JSON:'[]'})).toThrow();
});
