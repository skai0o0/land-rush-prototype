# R2PL 2027 foundation handoff

Baseline: `2b5e5299b28cc8ba55d357eb8eb9382e44f7a58c`, cloned from `https://github.com/skai0o0/land-rush-prototype.git`. Working branch: `foundation/r2pl-2027`. Changes are local and uncommitted; nothing has been pushed or deployed. The uploaded ZIP was not used.

## Baseline audit

- `shared/constants/schools.ts` held five registry entries, email aliases and demo accounts. HQ spawning, school totals, leaderboard and editor validation mostly iterated the roster already.
- `shared/land/landState.ts` held a 1,000,000-byte single-owner presentation buffer and sparse combat overlays. `server/src/land/landDataPlane.ts` sent owner/combat batches every 50ms with snapshot, sequence and epoch recovery. This compatibility layer is retained.
- `CampusRoom` kept server-only `TileState` objects with independent per-school `KnowledgeState` records. `claimedTiles` had no network decorator, so the existing code already kept the million-tile map outside Colyseus Schema. Decay was lazy plus 256 sparse tiles per housekeeping tick.
- Fog lived in the browser's `FogOfWarManager`; its byte mask and animation texture were GPU presentation data. All claimed owner bytes previously revealed discovery without separating schools.
- `ProfileManager` and `RunningPointsProvider` were memory-backed singletons. They are retained. No separate bot subsystem was found in the baseline; developer mutation/cluster paths use the roster.
- HUD, minimap, notifications and procedural HQ colors generally used the shared registry. The HCMUT-only GLB is an asset availability choice; other schools retain procedural HQs rather than assuming a fixed five-school capacity.

## Implemented architecture

`Colyseus validation -> sparse gameplay knowledge -> Uint16 world presence in RAM -> chunk/network dirty state -> asynchronous WorldRepository flush -> PostgreSQL`

- Campaign registry loads active schools and stable `knowledge_bit` values from PostgreSQL. Eight built-in local/demo schools remain available, with 16 validated slots. Database UUIDs are mapped to internal lowercase school codes.
- `WorldStore` owns a 2,000,000-byte `Uint16Array`. Each school bit is presence only. Strength and timestamps remain separate sparse records and preserve existing independent decay calculations.
- Logical chunks are fixed 64x64. Knowledge BYTEA is 8,192 bytes in explicit little-endian order. Right/bottom edges are padded with zeroes: the bottom-right chunk contains 40x40 real tiles. Restore rejects incorrect formats, lengths, padding, unsafe versions, unknown schools and inconsistent mask/metadata pairs.
- Per-school fog uses 512-byte padded chunk bitsets. Exploration reveals the existing 5x5 kernel only for the participating school. Treasure-map reveal geometry is persisted for that school. Discovery survives knowledge decay. Public HQ/landmark reveal effects remain in the renderer; another school's discovered fog records are never sent to the client.
- Presence deltas are coalesced per chunk at the existing 50ms network tick. The 28-byte header contains magic, binary format, chunk coordinates, current version, record count and base version. Each 8-byte record contains uint32 tile index, uint16 mask, opcode and reserved padding. Missing bases cause an explicit resync request. Full resync sends a registry manifest and chunk snapshots. Fog updates are grouped by school in batches.
- Legacy owner/combat frames remain for Three.js paint and combat/cluster compatibility. The owner field remains a display projection, not shared-knowledge authority. Sparse `knowledge_sync` is retained for existing consumers/tests. GPU fog textures remain expanded for the current view; storage is compact and school-specific.
- `WorldRepository` has memory and PostgreSQL implementations. Gameplay imports the repository contract/store, never Supabase client APIs. PostgreSQL uses parameterized batched writes in one transaction: knowledge chunks, fog chunks, changed sparse tile-school rows. Deletions are persisted through targeted sparse replacement.
- Default flush interval is 3 seconds. A flush handles up to 32 knowledge chunks and 128 fog chunks; a large backlog therefore takes multiple intervals. Shutdown drains the whole backlog. Network flushing never clears persistence dirty state. Failed writes retain dirty state; mutations arriving during an in-flight write remain dirty until their newer revision is acknowledged.
- PostgreSQL uses a small pool and a dedicated session advisory lock to reject a second authoritative writer for the same campaign. Use a direct connection or a session-mode pooler; transaction-mode pooling is incompatible with this lock. Secrets are read only from backend environment variables.
- Startup restores chunks, fog and sparse records before the room can finish creation. Game-rule objects and compatibility overlays are reconstructed from those records. PostgreSQL mode has deterministic default object placement; local mode retains the existing demo spawning behavior.
- Production `onAuth()` requires a game session token through `IdentityProvider`. `PortalIdentityProvider` is intentionally a throwing contract stub until the Portal integration is implemented. Production blocks client identity switching and ignores prototype dev identity options. No Supabase Auth or Supabase Realtime is introduced.
- `PlayerRepository` memory/PostgreSQL implementations prepare identity lookup against `game_users`. Wallets, inventory and cooldown persistence are not implemented: the applied foundation schema does not contain those storage fields. Existing profile/provider abstractions remain intact.

## Migrations and remote verification

Retrieved the exact original SQL bodies and version identifiers from `supabase_migrations.schema_migrations` on project `bvgyaauigbtdtbafiskp`:

1. `supabase/migrations/20261005085657_initial_game_foundation_r2pl_2027.sql`
2. `supabase/migrations/20261005085751_foundation_security_and_index_hardening.sql`

These files are historical mirrors, not new migrations. Neither was reapplied. Read-only inspection confirmed all seven foundation tables, RLS enabled on all seven, zero public policies, `set_updated_at` search path set to `pg_catalog`, and the FK indexes from the hardening migration. Campaign configuration is 1000x1000, chunk size 64, format 1, capacity 16, eight seeded school bits 0-7. All eight HQ coordinates remain NULL. No remote data was changed during this task.

## Layout approval and compatibility limits

- HUCE, NTU and HCMIU receive no invented HQ positions. In PostgreSQL mode *every* NULL HQ is skipped. Local mode retains random HQ spawning for the five pre-existing demo school definitions; new schools appear as unassigned editor entries and receive coordinates only when the user explicitly places them.
- Use the local editor to export the reviewed map. Approve/update `campaign_schools` separately when ready, then set `WORLD_LAYOUT_FILE` to the reviewed JSON. Its HQs must match the database assignments exactly. No layout file is generated or silently persisted in this task.
- Runtime relocation of persistent campaign foundations is rejected with an explicit editor response. The current database schema has no complete landmark/station/chest layout storage. Allowing relocation and then forgetting its geometry on restart would corrupt HQ persistence/decay semantics. Local editor relocation remains supported. A future fully persistent editor needs a reviewed layout-storage extension.
- Unknown/non-v1 BYTEA data, including empty default chunk payloads, fails explicitly. There is no automatic conversion of old single-owner bytes into authoritative shared presence. Existing remote rows need inspection before adopting another binary writer's format.
- `version` uses the safe integer range in JavaScript, although PostgreSQL stores bigint; restore fails beyond that range.
- Persisted sparse fields are strength, `lastStudiedAt`, version and tile/school identifiers. HQ persistence flags are reconstructed from approved geometry. Historical study counters and arbitrary developer fortification are not stored by the current foundation schema.
- School presence and discovery are persistent. Profiles, running balances, inventories, station/chest consumption and beacon/puzzle progress retain the baseline transient behavior. This is a foundation change, not a completed production account/economy integration.
- Abrupt process termination can lose RAM mutations since the last successful flush. Graceful disposal drains writes, but host/service shutdown deadlines and database outages still require operational monitoring. Flush errors are logged and dirty state retained; no successful database verification is claimed here.
- The existing gameplay/loot probability definitions are unchanged. Existing overlap, decay, rewards, chest, UniStop and landmark regression suites all passed.

## Verification results

| Check | Result |
|---|---|
| Full server TypeScript build | Passed |
| Client TypeScript and Vite production build | Passed; Vite required normal filesystem access because the sandbox denied `realpath` |
| Existing baseline regression suites | 15/15 passed |
| New foundation, PostgreSQL query-boundary and real WebSocket suites | 3/3 passed |
| 16-slot high-bit shared presence save/restore | Passed (`0x8001`) |
| Edge chunks, malformed format/packet/version rejection, resync | Passed |
| School-specific fog and independent sparse decay timestamps | Passed |
| Failed writes and mutations during in-flight persistence | Passed |
| 20 validated actions -> repository flush -> new room -> second client | Passed using a retained memory repository |
| Real WebSocket server lifecycle restart + new-client resync | Passed using a retained memory repository; 20 actions produced 6-7 presence delta frames |
| Live PostgreSQL/Supabase process restart acceptance | **Not run: DATABASE_URL unavailable** |

The attached `.env` contained browser Supabase URL/publishable-key settings only. Those are not PostgreSQL credentials. Remote schema reads used the connector, but the application adapter was not tested by substituting connector SQL for its real database connection.

Run:

```text
npm ci
npm ci --prefix server
npm ci --prefix client
npm run build
npm test
npm run bench:world --prefix server
npm run test:postgres --prefix server
```

The opt-in PostgreSQL acceptance script needs `DATABASE_URL` and `ACCEPTANCE_CAMPAIGN_CODE` pointing to a dedicated campaign with an already approved HCMUT HQ (and reviewed layout if needed). It starts a real server process, sends ~20 validated actions, checks flushed sparse rows, terminates/restarts the process and compares exact masks/strength/timestamps seen by another client. It changes those test tiles and deliberately refuses to invent HQs. It does not manufacture an opposing school's territory to force a shared tile; shared multischool persistence is covered in repository/room fixtures.

## Benchmark

See `docs/world-benchmark.md` for all measured medians, p95, packets, memory, GC and event-loop observations. On the final run: 10k encode 0.075ms, decode 0.129ms; 100/500 validated mutation apply 0.012/0.057ms median; chunk serialize/deserialize 0.212/0.143ms median. Dense knowledge is 1.907 MiB. Eight-school padded fog is 1 MiB. These costs exclude sparse object overhead and the retained 1MB display-owner buffer.

Cache simulations completed at 100, 500 and 1000 clients. They allocate full-sized buffers and touch one tested chunk, not one million cells per client. They do **not** establish real concurrent-player capacity, WebSocket load capacity, GPU frame rate or PostgreSQL throughput. Event-loop/GC results include allocations and explicit GC; timings vary by run.

## Files changed

Modified:

- `shared/constants/schools.ts`
- `server/src/rooms/CampusRoom.ts`
- `server/src/index.ts`
- `server/package.json`, `server/package-lock.json`
- `client/src/network/colyseusClient.ts`
- `client/src/main.ts`
- `client/src/ui/databaseModal.ts`
- `client/src/ui/mapEditorPanel.ts`

Added:

- `.env.example`
- `shared/world/binary.ts`, `shared/world/WorldClientState.ts`
- `server/src/world/WorldRepository.ts`, `server/src/world/WorldStore.ts`
- `server/src/profile/PlayerRepository.ts`
- `server/src/identity/PortalIdentityProvider.ts`
- `server/test/world_foundation.test.ts`, `server/test/postgres_world.test.ts`, `server/test/world_transport.test.ts`, `server/test/postgres_acceptance.ts`
- `server/bench/world.ts`
- The two historical migration files listed above
- `docs/world-benchmark.md`, `docs/foundation-report.md`

## Remaining work

1. Supply a backend PostgreSQL connection string and run the opt-in live acceptance against a dedicated, approved-layout test campaign. Verify TLS, writer lock, real BYTEA serialization, transaction rollback and deployment shutdown behavior against that service.
2. Review the eight-school layout, assign approved HQs, and deploy the matching layout JSON. The current connected campaign remains in setup with no HQs assigned.
3. Implement the Portal identity adapter and persistent player wallet/inventory/cooldown schema in a separate phase; production joins intentionally stay closed until identity is configured.
4. If runtime persistent map editing is required, add reviewed campaign layout persistence rather than allowing geometry to disappear on restart.
5. Run deployment-specific socket/gameplay/SQL load tests. Dependency installation reported existing audit findings (server: 16; client: 2). No broad dependency upgrades were attempted in this gameplay-preserving task. Vite also reports the existing large main bundle.
