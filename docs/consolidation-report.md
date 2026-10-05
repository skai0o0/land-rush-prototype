# R2PL 2027 foundation consolidation

Baseline: `2b5e5299b28cc8ba55d357eb8eb9382e44f7a58c`. Remote default: `main`.

Discovery found three independent checkouts, rather than two linked worktrees.
The `this-is-an` checkout was clean at `2d21af7`; `this-is-an-2` was clean at
`2b5e529`. The foundation and polish were layered in the dirty `this-is-an-3`
checkout. The original foundation patch was also preserved in outputs.

The complete dirty state was committed on `safety/r2pl-polish-snapshot-20261005`
(`165ca8e`). An additional linked worktree at `work/foundation-checkout` recreated
the original foundation from the saved patch. Foundation commit `e3fdec1` and
polish commit `ce8bd92` reconstruct exactly the preserved combined snapshot.
Identity correction `4eb02d8` follows the polish and integration merge `2fd5020`
combines the work on `integration/r2pl-2027`.

Production profile, points, cooldown and active session lookups now use
`gameUserId`. MSSV and email are metadata; Portal identity remains external.
See `identity-contract.md` for campaign UUID resolution and adapter boundaries.

Validation on the integration branch:

- `npm run build`: passed. Windows sandbox denied Vite realpath on the first
  attempt; the approved build outside that restriction passed. Existing bundle
  size warning remains.
- `npm test`: all 20 suites passed, including duplicate MSSV/email users in
  different schools and replacement-session cleanup.
- Real WebSocket test: 20 validated actions, 7 delta frames, room lifecycle
  restart through the in-memory repository, metadata restore and isolated fog.
- `npm run bench:world --prefix server`: passed; recorded in `world-benchmark.md`.
  Dense presence uses 2,000,000 bytes; padded fog uses 1 MiB for 8 schools.
  Median 10k encode/decode/apply: 0.074/0.131/0.071 ms. 100 simulated caches:
  2.276 ms aggregate apply. This does not measure concurrent socket capacity.
- `npm run test:postgres --prefix server`: server compiled; acceptance explicitly
  SKIPPED. DATABASE_URL is absent in process, user and machine environments.
  SQL query-boundary fixtures verify BYTEA batching, commit and rollback;
  in-memory tests verify failed/in-flight writes and drain behavior.

The only remaining live verification gap is application acceptance against
PostgreSQL/Supabase: disposable-campaign validated actions, BYTEA/sparse/fog
flush, process restart, client resync, fog isolation, advisory writer exclusion,
transaction rollback and graceful drain. These have not been represented as
passing live tests. No database writes were performed during consolidation.

Read-only Supabase verification: `r2pl-2027` remains `setup`, with 8 schools
and 0 assigned HQs. Historical migrations were not reapplied.

Later implementation work remains: real Portal/running provider integration,
durable player wallets, and approved HQ layout. These are outside consolidation.
Binary format v1 is explicit; incompatible stored versions fail rather than
being guessed. Retain the safety branches and original foundation worktree until
the integration is accepted.
