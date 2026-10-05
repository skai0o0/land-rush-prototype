# R2PL foundation polish — 2026-10-05

Checkout: `C:/Users/AMTECH/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an-3/land-rush-prototype`.
Branch `foundation/r2pl-2027`, HEAD `2b5e5299b28cc8ba55d357eb8eb9382e44f7a58c`. Existing uncommitted foundation implementation retained. No commit, push or deployment. Gameplay rules and gacha/chest probabilities unchanged.

## Exact files changed in this pass

- `server/src/identity/PortalIdentityProvider.ts`
- `server/src/profile/PlayerRepository.ts`
- `server/src/rooms/CampusRoom.ts`
- `shared/constants/schools.ts`
- `shared/land/landState.ts`
- `server/package.json`
- `server/test/postgres_acceptance.ts`
- `server/test/foundation_polish.test.ts` (new)
- `docs/foundation-polish-report.md` (new)

## Identity and schools

PortalIdentity now contains portalUserId, studentId, displayName, optional email, schoolCode, campaignId and the retained gameUserId. campaignId means campaigns.id UUID; schoolCode means canonical lowercase gameplay code. PlayerRepository joins schools and returns schoolCode separately from databaseSchoolId, plus studentId/email. Production verifies the campaign and school, uses the Portal student identifier for profiles/session deduplication and uses Portal displayName. A mismatched email domain cannot override Portal school. Default Portal provider still throws; production remains closed until a real adapter is configured. No Portal endpoint was wired.

Baseline 2b5e529 contained no HUCE/NTU/HCMIU domain mappings. Removed their guessed domains from registry and alias lookup. Their dev accounts use reserved `.example.invalid` addresses with explicit school tags. Existing baseline aliases remain dev fallback only.

Registry option (b): guarded singleton, one active campaign registry per process. Every room acquires a lease before initialization. A different campaign or changed registry is rejected while any lease is active; direct configure mutation is rejected. Final disposal restores the previous registry, preventing stale HQs/settings from leaking into later rooms. Tests cover concurrent campaign rejection, same-campaign configuration mismatch, multiple leases, idempotent release and restoration. Multi-campaign hosting still needs separate processes. Public roster consumers remain compatible.

Legacy 1-byte owner buffer retained and explicitly documented as Three.js/compatibility presentation projection, never authoritative Shared Knowledge.

## Real Supabase connector SQL verification — PASSED

Project `land-rush-prototype` / `bvgyaauigbtdtbafiskp`. Verified existing migrations 20261005085657 and 20261005085751. Production `r2pl-2027` inspected read-only; status setup, all eight HQs NULL.

Created isolated `r2pl-2027-acceptance-polish-20261005`, with HCMUT temporary HQ (100,100) and NTU HQ NULL. Inserted a SQL fixture for tile 100111/chunk (1,1):

- world_chunks: 8192-byte little-endian BYTEA, mask 1 at the correct local tile offset, version 1.
- tile_knowledge_state: HCMUT strength 80, lastStudiedAt `2026-10-05T10:00:00Z`, version 1.
- school_fog_chunks: HCMUT 512-byte BYTEA with fixture tile revealed; NTU fog row count 0.
- Constraint-error subtransaction rolled back a strength update from 80 to 79; readback remained 80 with exact timestamp.

Deleted only this disposable campaign; dependent rows cascade. Confirmed zero remaining test campaigns, production still has eight schools and zero assigned HQs. No schema/migration changes and no production writes.

This verifies real SQL storage and constraint rollback through the connector. It does NOT verify app adapter writes, app restore, real socket fog filtering against Postgres, session advisory writer exclusion, or graceful process shutdown.

## Real application DATABASE_URL acceptance — NOT RUN

Exact blocker: DATABASE_URL, SUPABASE_DB_PASSWORD and PGPASSWORD absent from process/user/machine environment. No backend .env found in the Codex workspaces; only .env.example exists. Connected integration exposes SQL tools but no tool for retrieving a raw database password. No credentials fabricated, API key substituted, password reset or secret committed.

`npm run test:postgres --prefix server` built the server and explicitly reported SKIPPED: DATABASE_URL unavailable. Its exit code 0 is a skip, not an acceptance pass. Dedicated test code is now restricted to `r2pl-2027-acceptance` or a suffixed acceptance code, protecting the production campaign from accidental test selection.

Use a backend DATABASE_URL with verified TLS, direct connection or Supavisor Session Pooler, and a fresh dedicated approved acceptance campaign. Transaction pooling is incompatible with the existing session advisory lock. The opt-in live script remains partial coverage: before claiming all requested checks passed, extend/execute explicit writer exclusion, chunk/fog readback, HCMUT fog restore, shared metadata fixture, rollback and graceful shutdown drain checks. On Windows, ChildProcess.kill(SIGTERM) terminates the child and cannot prove graceful signal-handler draining; use a supported graceful stop mechanism or run that shutdown check on suitable infrastructure.

## Verification

Existing dependencies reused; installs unnecessary. Server TypeScript passed; client TypeScript + Vite production build passed after allowing ordinary filesystem access for Vite realpath (sandbox attempt returned EPERM). Existing large-bundle warning remains.

All 19 server suites passed: 15 existing regression suites, foundation, PostgreSQL query-boundary, real WebSocket transport and new foundation polish. Query-boundary tests cover parameterized BYTEA batching/commit/rollback without a live connection. WebSocket suite covers 20 validated actions, lifecycle restart using a retained memory repository, masks/timestamps/new-client resync and fog isolation; it does not use PostgreSQL.

Binary benchmark passed: 10k encode median 0.077 ms / decode 0.132 ms; 64x64 serialize 0.051 ms / deserialize 0.147 ms. Dense presence 1.907 MiB; padded eight-school fog 1 MiB. Default 100-cache tier ran; 500/1000 large allocation tiers skipped by benchmark default. These are workstation cache/binary microbenchmarks, not CCU or SQL throughput acceptance.

## Remaining merge / rollout blockers

- Real app PostgreSQL acceptance remains unverified until backend credentials are available; connector SQL success cannot replace it.
- Production Portal identity adapter and approved production HQ layout remain intentionally unconfigured.
- Complete the live harness checks above before declaring the full requested acceptance target achieved.
- Previously documented transient wallets/inventory/cooldowns/layout persistence limits remain; no new gameplay/economy changes made.
