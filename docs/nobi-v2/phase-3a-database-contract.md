# Phase 3A database contract results

Checked against source and the disposable PostgreSQL 17 instance, not the production catalog.

| Contract | Existing source | Local result |
|---|---|---|
| Auth | `supabaseClient.js`, login/register | Four independent real GoTrue signup/password-login sessions PASS |
| Profile | public RPC `get_player_profile(player_id uuid)` | Returns only ID/nickname/display rank; authenticated EXECUTE, anon denied PASS |
| Go legacy rooms | `multiplayer-ext.js` explicitly selects `game.game_rooms` | Missing from original SQL; local columns added, create limited to caller's empty waiting room; atomic join RPC PASS |
| Historical SQL | `game.waiting_room`, `game.game_sessions`, `game.moves` | Object names retained; RLS on, client move/session writes revoked PASS |
| Unified room/member | New `game.rooms`, `game.room_members` | Create RPC, row-locked join, unique user/seat, participant-only reads PASS |
| Turns/state/actions | TS authority, DB `rooms.turn/version`, `command_receipts` | Rules checked before receipt; client UPDATE denied, unique actor/request ID and room/version PASS |
| Terminal record | `game.match_records` | Only dedicated authority role writes; ranked=false enforced by constraint PASS |
| Ranking preparation | Seasons, per-game ratings, events and security-invoker ranking view | Two games / season / tied rank query; client rating/history/result writes denied PASS |
| Realtime | Four explicit publication tables | Real postgres-change WebSocket, authenticated RLS and reconnect PASS |

`public` holds the profile and disposable marker RPC. `auth.users` is read only inside a narrow SECURITY DEFINER profile function with empty search_path; Auth passwords/tokens are not projected. `game` holds gameplay contracts. Original `supabase_schema.sql` assumes a pre-existing `game` schema and omits the actual Go room table; original participant UPDATE policies do not enforce turns, rules or trusted results. The local contract therefore intentionally denies legacy client snapshot updates. Existing UI adapters remain on their current path until Phase 3B migration, rather than being silently switched to an incompatible schema.

Supabase's image default privileges grant anon function EXECUTE directly. Revoking PUBLIC alone was insufficient; migration 002 explicitly revokes anon. PostgreSQL 17 required explicit SET-role membership; migration 004 grants the container-local operator only the narrow `nobi_authority` role. This role has no login, no rating write grants and no production credentials.

Reproduce catalog assertions: `npm run local:verify`. Real negative permissions and concurrency tests: `npm run test:integration`. Migration files are checksummed and recorded; editing an applied migration is rejected. Rebuild the explicitly disposable volume to change a fixture. No `supabase link`, `db push`, production configuration or SQL editor operation was used. Actual production objects/RLS/RPC/publication remain NOT VERIFIED.

Cold-start validation found asynchronous tenant initialization, PostgREST schema-cache refresh and lazy logical-slot creation. Readiness now checks actual health/marker responses and an active replication slot before the first fixture mutation; published changes themselves must still be delivered and asserted. Startup checks are bounded and are not substituted for real event delivery. Migration checksums normalize LF/CRLF and only upgrade an existing checksum when the unchanged raw SQL hash matches.

Realtime clients explicitly await setAuth for their own real user token. Before the first database mutation, the cold-start test asserts both an active logical slot and the actual realtime.subscription row for the authenticated user and game.rooms entity. SUBSCRIBED alone was insufficient during fresh self-host initialization; no synthetic event or mock result is counted as delivery.
