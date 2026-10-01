# Land Rush — LandState Data Plane Delivery Report

**Project:** DHQG Land Rush (`dhqg-land-rush`)  
**Feature:** OMCB-style compact land data plane  
**Branch:** `feat/landstate-data-plane`  
**Base:** `main` @ `5ab6131`  
**Head:** `293d98d` (impl `44cc44b` + docs `293d98d`)  
**Workspace:** `.worktrees/landstate-data-plane`  
**Date:** 2026-09-28  
**Status:** Delivered (review APPROVE)

---

## 1. Problem

The map is **1000×1000 = 1,000,000 tiles** (same scale as *One Million Checkboxes*). Before this work, every claimed tile was a Colyseus `TileState` schema object (`ownerId` string, `hp`, `maxHp`, `defenseTier`) in a networked `MapSchema`. Each claim/fortify shipped fat binary patches of the whole object graph. That design does not scale to many concurrent students.

**Goal:** send only a few bytes per action, batch fan-out, keep game rules intact.

---

## 2. What changed

### Architecture (OMCB-inspired)

| Layer | Before | After |
|-------|--------|--------|
| Ownership | `MapSchema<TileState>` + string school ids | Dense `Uint8Array(1_000_000)` (0 = uncolored, 1..N = school) |
| Fortify / HP | Same objects as paint | Sparse `Map<index, {hp, maxHp, defenseTier}>` |
| Per action | Full schema patch | Dirty index + 50ms coalesced batch |
| Join | Full claimed map in Colyseus state | `snap`: base64 owner bytes + sparse combat list |
| Client | Schema listeners + tile objects | Local bytes, dirty-chunk paint, incremental counts |

### New modules

| File | Role |
|------|------|
| `shared/land/landState.ts` | LandState: owner bytes, combat map, dirty sets, seq/epoch, snapshot |
| `shared/land/protocol.ts` | `snap` / `own_batch` / `combat` / `claim` / `fortify` / `ack` + codecs |
| `shared/land/clientSync.ts` | ClientLandSync: apply snap/batch, dirty chunks, owner counts |
| `server/src/land/landDataPlane.ts` | Room-facing wrapper: flush, sendSnap, acks, reset |

### Modified

| File | Change |
|------|--------|
| `server/src/schema/GameState.ts` | `claimedTiles` no longer `@type` (internal only) |
| `server/src/rooms/CampusRoom.ts` | Write-through LandDataPlane; flush timer 50ms; snap on join; acks |
| `server/src/bots/BotManager.ts` | `syncLandTile` write-through |
| `client/src/network/colyseusClient.ts` | Land frames first; removed claimedTiles listeners |
| `client/src/main.ts` | Tooltips/adjacency via landSync |
| `client/src/ui/miniMap.ts` | Paint from owner bytes |

### Protocol (channel `land`)

- **C→S:** `claim` / `fortify` `{x,y}` (~40 B)
- **S→C:** `own_batch` (owner-grouped indices), `combat` (sparse), `snap` (join), `ack`
- **Staleness:** monotonic `seq` + `epoch`; client drops `seq <= lastSnapSeq` or wrong epoch

### Out of scope (unchanged)

Game rules (troops, adjacency, landmark costs, tiers), 3D/visuals, Redis/multi-process, map size, auth.

---

## 3. Process

Compose Next: grill (scope) → worktree → spec → implement (parallel agents) → verify → review → fix criticals → re-review → finalize.

| Step | Result |
|------|--------|
| Spec | `docs/compose/spec/landstate-data-plane.md` |
| Implement | 3 workers (core ×2, UI) |
| Smoke | Coalescing + stale-seq tests |
| Review | **REQUEST CHANGES** (2 critical, 1 major) |
| Fix | claimedTiles client crash; combat-in-snap; incremental counts |
| Re-review | **APPROVE** |

---

## 4. Verification

From `server/` and `client/` (fresh orchestrator runs):

| Check | Result |
|-------|--------|
| `landState.test.ts` | 5/5 PASS |
| `protocol.test.ts` | 6/6 PASS |
| `clientSync.test.ts` | 9/9 PASS |
| `landState_integration.test.ts` | 7/7 PASS |
| `landState_smoke.test.ts` | 4/4 PASS |
| server `tsc --noEmit` | PASS |
| client `tsc --noEmit` | PASS |

---

## 5. Load benchmark (server PID, 16 cores)

**Scenario:** bots × 10 schools, claim/fortify on `land`, 60s steady, CPU/RAM 1s samples.

### 500-bot run

| Metric | Value |
|--------|------:|
| Joined | 500 / 500 (slow ramp) |
| Stable during 60s | ~178 (client-side drops) |
| Actions | 44,748 (~745/s) |
| Acks ok / err | 30,993 / 12,849 |
| **CPU avg / max** | **1.9% / 37.6%** of 16 cores |
| **CPU overall** | **3.4%** (~31 CPU-sec / 60s) |
| **RAM Working set** | **112 → 301 MB** (avg 299) |
| **RAM Private** | **124 → 323 MB** (avg 322) |

### Stable 300-bot run (0 disconnects)

| Metric | Value |
|--------|------:|
| Actions | 103,500 (**~1,721/s**, 5.7/s/bot) |
| CPU overall | ~2% (max sample 16%) |
| RAM WS / Private | 265→341 MB / 281→354 MB |

### Bandwidth (300-bot × 60s, WebSocket instrumentation)

| Direction | Total | Avg | Peak |
|-----------|------:|----:|-----:|
| Client → Server | 0.44 MB | **0.007 MB/s** | 0.026 MB/s |
| Server → Client | 201.6 MB | **3.35 MB/s** | **6.12 MB/s** |

| Per action | Bytes |
|------------|------:|
| Ingress | ~25 B |
| Egress | **~11.6 KB** |

| Frame | Avg payload |
|-------|------------:|
| claim/fortify | ~40 B |
| ack | ~72 B |
| **own_batch** | **~254 B** |
| combat | ~2.4 KB |
| snap (join) | ~1.57 MB |
| other schema | dominant lifetime cost |

**Note:** localhost WS does not show on NIC counters; numbers are from wrapped sockets.

---

## 6. Conclusions

1. **Server CPU and RAM are fine** at hundreds of concurrent claimers (~2–3% of 16 cores, ~300–350 MB).
2. **Land protocol works:** tiny ingress, compact `own_batch`; the old schema-per-tile path is gone.
3. **Bandwidth is the remaining cost:** join `snap` (~1.5 MB/client) and leftover Colyseus schema patches dominate; deltas are small.
4. **Load-generator ceiling** ~300 stable colyseus.js clients per Node process (client-side), not server crash.

---

## 7. Recommended next steps

1. **Compress `snap`** (deflate/lz4) — biggest single win for join egress.
2. **Coalesce `combat` more aggressively** (batch with ownership flush; drop default 100/100/0 noise).
3. **Quiet control-plane schema** — don’t rebroadcast players/troops every tick if unchanged.
4. Optional binary frames / Redis only if multi-process or multi-server is required.
5. Merge `feat/landstate-data-plane` → `main` after playtest.

---

## 8. How to run

```powershell
# Dev
npm run dev
# Client http://localhost:5173  Server ws://localhost:2567

# Benchmark (from worktree)
$env:BOTS='300'; $env:DURATION_SEC='60'; $env:ACTIONS_PER_SEC='10'
node scripts/bench-landstate.mjs
```

**Artifacts:** `bench-results/` (CSV/JSON), `docs/compose/spec/landstate-data-plane.md`, `scripts/bench-landstate.mjs` (uncommitted bench harness).
