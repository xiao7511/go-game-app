# Phase 3A disposable local Supabase

The checked-in CLI is pinned to 2.120.0. Its image download exceeded two 240-second attempts on this machine. The verified fallback uses cached official Supabase Compose images, with no image pull.

Requirements: Node 24, Docker Desktop, project dependencies. Start waits up to 60 seconds for Auth and the Realtime tenant; integration additionally waits for the migrated PostgREST marker and active logical replication slot. All API/DB ports bind 127.0.0.1. Other projects' containers are never selected.

```powershell
npm install --prefix infrastructure/local-supabase
npm run local:start
npm run local:migrate
npm run local:verify
npm run test:integration
npm run authority:local
# Stop only this project (preserves its volume)
npm run local:stop
# Destroy only this disposable project's volume, then rebuild
$env:NOBI_ISOLATED_ACK='LOCAL_DISPOSABLE_ONLY'
npm run local:reset
npm run local:start
npm run local:migrate
```

Compose project `nobi-phase3a-local`; DB container `supabase_db_nobi-phase3a-local`; volume `nobi-phase3a-local-db`; API 55421, PostgreSQL 55422, authority 55430. No Studio, Storage, Edge Functions, mail or Redis is required for these tests. Auth has local email auto-confirm enabled. No production users, passwords or service_role keys are imported. Each real test run creates four random disposable Auth accounts; passwords and sessions live only in test memory. Local DB/JWT secrets are generated into ignored `.nobi-isolated/phase3a/runtime.json`, never printed. Treat this file as local sensitive configuration. Do not run `docker compose config` or inspect container environment into logs.

Official CLI alternative (do not start alongside Compose): `node scripts/local-supabase.mjs start|stop|reset|status`. CLI is bound to this workspace, rejects a linked project, and uses dedicated 5542x ports. Reset needs the same explicit acknowledgement. CLI image downloads are bounded to 240 seconds. Credentials remain in memory.

The authoritative server is a local prototype with server memory owning active states and SQL persisting verified unranked terminal records. SSE sends each user only their own Guandan hand. Restart recovery for an active match is **not implemented**: after process restart such rooms are unavailable and no winner/points is guessed. Phase 3B must add durable command/state recovery before external deployment. Existing browser multiplayer adapters have not yet been switched to this service; their legacy trust model remains a migration blocker.

References: [Supabase local development](https://supabase.com/docs/guides/local-development), [official self-hosted Compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml). The Compose fixture is reduced for testing, not a production deployment.
