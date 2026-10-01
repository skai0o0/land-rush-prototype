---
feature: landstate-data-plane
status: delivered
updated: 2026-09-28
branch: feat/landstate-data-plane
commits: 5ab6131..44cc44b
---

# LandState Data Plane (OMCB-style)

## Report

**What was built** — A compact OMCB-style data plane for the 1000×1000 land-rush map. Ownership lives in a dense `Uint8Array` (0 = uncolored, 1..N = school numeric id) and fortify/HP state lives in a sparse combat map, instead of networked Colyseus `TileState` schema objects. Claim and fortify actions dirty a few indices; a 50ms flush broadcasts coalesced `own_batch` / `combat` frames on a shared `land` channel. Joiners get a `snap` with base64-packed ownership plus the full sparse combat list. Clients apply batches to local bytes, repaint only dirty chunks, maintain incremental territory counts, and drop stale frames by seq/epoch. Game rules (troops, adjacency, landmark costs, defense tiers) are unchanged; `claimedTiles` remains internal server bookkeeping for bots/clusters but is no longer synced.

**Verification** — From `server/`: `landState.test.ts` 5/5, `protocol.test.ts` 6/6, `clientSync.test.ts` 9/9, `landState_integration.test.ts` 7/7, `landState_smoke.test.ts` 4/4, `tsc --noEmit` clean. From `client/`: `tsc --noEmit` clean. Independent review found two criticals (client `claimedTiles` listeners, missing combat in snap) plus a major O(1M) rescan; fix pass addressed all four; re-review APPROVE.

**Journey log** —
- Colyseus `MapSchema` per tile was the bandwidth cliff; packing owner into bytes and batching indices is the win, not Redis (deferred).
- Removing `@type` from `claimedTiles` silently drops it from `room.state`; untyped `tsc` will not catch residual `.get`/`.onAdd` — land handlers must register first and reads must go through landSync.
- Snap that omits warm sparse state (combat) creates join-time holes; include the sparse dump in snap rather than a second frame.
- Ownership and combat flushes each bump `seq` (can be +2 per tick); staleness must use `<=`, not equality.
- Reviewer catching the client join crash before merge is why compose review is not optional on sync rewrites.

## [S1] Problem

The land-rush map is 1000×1000 (1,000,000 tiles). Ownership and combat fields currently live in Colyseus `MapSchema<TileState>` objects (`ownerId` strings, `hp`, `maxHp`, `defenseTier` keyed by `"x,y"`). Every claim/fortify ships fat schema patches. Under many concurrent students this costs too much bandwidth and CPU on both server and client, unlike One Million Checkboxes where the hot path is a packed ownership array plus tiny index deltas.

We need a compact data plane so a player action sends only a few bytes, fan-out is batched, and full resync is a packed snapshot — without dropping land-rush rules (schools, troops, fortify tiers, landmarks).

## [S2] Design

### Decisions (settled)

- Full data plane + wire protocol in this slice; Colyseus remains the **control plane** (players, troops, speed, HQs, landmarks, roles).
- Single Node process; ownership/combat live **in memory**. No Redis in this slice.
- Map size stays **1000×1000**. Index = `y * 1000 + x`.
- School numeric id: `0` = uncolored, `1..N` = `SCHOOL_IDS.indexOf(schoolId) + 1` (same as `CampusRoom.getSchoolNumericId`).

### [S2.1] Two-plane state

**Plane A — Ownership (hot, dense)**

```ts
class LandState {
  readonly width = 1000;
  readonly height = 1000;
  owner: Uint8Array; // length width*height; 0 empty, 1..N school
}
```

- `setOwner(x, y, schoolNumericId)` validates bounds, records dirty index, updates `owner`.
- `getOwner(x, y)` / `getIndex(x, y)` helpers.
- Full snapshot: `Uint8Array` of length 1_000_000 (1MB), transported as base64 on `snap`.

**Plane B — Combat / fortify (warm, sparse)**

```ts
interface CombatTile {
  hp: number;
  maxHp: number;
  defenseTier: number; // 0 land, 1 fence, 2 seawall, 3 tower
}
```

- Sparse `Map<index, CombatTile>` for non-default tiles.
- Included as a list on `snap` so joiners keep HP/defense.

**Plane C — Static (cold)**

- HQs, landmarks, simulation speed, roster — stay on Colyseus `GameState` / join payload.

### [S2.2] Wire protocol

JSON frames with short `t` discriminator on Colyseus channel `"land"` (`LAND_FRAME_CHANNEL` in `shared/land/protocol.ts`).

| Type | Direction | Payload |
|------|-----------|---------|
| `snap` | S→C | `{ t, epoch, seq, w, h, ownerBase64, combat? }` |
| `claim` | C→S | `{ t, x, y }` |
| `fortify` | C→S | `{ t, x, y }` |
| `own_batch` | S→C | `{ t, seq, ts, epoch?, sets: [{ o, idx[] }] }` |
| `combat` | S→C | `{ t, seq, ts, epoch?, tiles: [{ i, hp, maxHp, tier }] }` |
| `ack` | S→C | `{ t, op, x, y, ok, reason? }` |

**Batching** — dirty ownership grouped by school; flush every 50ms or when dirty exceeds a cap; empty flush does not bump `seq` and does not broadcast.

**Ordering** — monotonic `seq`; snapshot carries `epoch` + `seq`; clients drop batches with `seq <= lastSnapSeq` or mismatched `epoch` (optional `epoch` on live frames).

### [S2.3] Server layout

```
CampusRoom (Colyseus)
  ├─ GameState (control: players, troops, hqs, landmarks, speed)
  ├─ LandDataPlane / LandState (owner[] + combat Map + seq/epoch)
  ├─ claim/fortify handlers → rules unchanged + land writes + ack
  └─ flush timer → own_batch / combat on "land"
```

- `claimedTiles` MapSchema is internal (no `@type`); bots/clusters keep using it.
- All tile-mutation paths write through `landData` (spawn, claim, fortify, bots, bastion, mega-emblem, soft_reset).

### [S2.4] Client layout

- Local `Uint8Array` + sparse combat overlay; never 1M tile objects.
- `applyOwnBatch` updates bytes and dirty chunks only; incremental `ownerCounts`.
- Tooltips/adjacency/minimap read landSync first (guarded schema fallback).
- Sends one protocol claim/fortify frame per action on `land` (legacy names still accepted server-side).

### [S2.5] Game rules (unchanged)

Claim/fortify validation stays as in `CampusRoom`: bounds, adjacency, troops/costs, landmark costs, defense tiers, roles.

### [S2.6] Errors

- Invalid bounds → `ack` ok:false; no state mutation.
- Unknown frames ignored.
- Empty flush idempotent under double ticks.

## [S3] Out of Scope

- Redis, multi-process pub/sub, horizontal workers.
- Binary/protobuf frames.
- Changing map size, school roster, 3D systems, bots AI, auth.
- Cloudflare / tc / production bandwidth caps.
- Live migration of an already-running production room.

## Tasks

- [x] T1: LandState module (owner Uint8Array, combat sparse map, dirty sets, seq/epoch, snapshot base64) — acceptance: unit tests cover setOwner bounds, dirty flush payload shape, snapshot round-trip, stale-seq helper (covers: S2.1, S2.2)
- [x] T2: Shared protocol types + codecs for snap/own_batch/combat/claim/fortify/ack — acceptance: encode/decode tests for each frame; base64 snapshot round-trips 1M bytes (covers: S2.2)
- [x] T3: CampusRoom integration — claim/fortify/bulk/cluster/bastion paths write LandState; remove networked claimedTiles; flush timer broadcasts batches — acceptance: server tests claim produces own_batch within flush window; combat path emits combat frame; existing claim rules still enforced (covers: S2.3, S2.5, S2.6)
- [x] T4: Client sync + render dirty chunks — acceptance: client applies snap and own_batch to local map and updates only dirty chunks; claim/fortify send new messages (covers: S2.4)
- [x] T5: End-to-end smoke (server test or scripted room) — acceptance: multi-claim coalesces to fewer broadcasts than claims; snapshot then old seq batch is dropped (covers: S2.2, S2.3)
