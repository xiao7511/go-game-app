// Explicit local-only administrator provisioning, separate from editable Auth metadata.
import fs from 'node:fs';import {localCredentials} from './local-supabase.mjs';import {localSql,literal} from './local-db.mjs';
await localCredentials();if(process.env.NOBI_ISOLATED_ACK!=='LOCAL_DISPOSABLE_ONLY')throw new Error('BLOCKED: local admin provisioning requires explicit disposable acknowledgment');
const id=process.argv[2];if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id??''))throw new Error('Use a local test Auth UUID');
if(localSql(`select exists(select 1 from auth.users where id=${literal(id)}::uuid and email like '%@phase3b.manual.test')`)!=='t')throw new Error('BLOCKED: only recorded manual local accounts may be provisioned');
const accounts=JSON.parse(fs.readFileSync('.nobi-isolated/phase3b/manual-accounts.json','utf8'));if(!accounts.accounts.some(account=>account.id===id))throw new Error('BLOCKED: account not in local credential record');
localSql(process.argv.includes('--revoke')?`delete from nobi_private.admin_users where user_id=${literal(id)}::uuid`:`insert into nobi_private.admin_users values(${literal(id)}::uuid) on conflict do nothing`);console.log('PASS: local test administrator allowlist updated; no credentials printed');
