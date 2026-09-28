// Pure client-side land sync helpers (no THREE / DOM).
// Used by the browser client and by server/test/clientSync.test.ts.
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  decodeBytesBase64,
  shouldDropBatch,
  CombatTile,
  OwnBatchEntry,
  CombatWireTile
} from './landState';
import { SnapFrame, OwnBatchFrame, CombatFrame } from './protocol';

export const DEFAULT_CHUNK_SIZE = 50;

export interface DirtyTileChange {
  x: number;
  y: number;
  owner: number;
  prevOwner: number;
}

export interface ApplyOwnBatchResult {
  applied: boolean;
  dirtyTiles: DirtyTileChange[];
  /** "cx,cy" keys of chunks whose instances need a color/matrix refresh. */
  dirtyChunks: string[];
}

export function chunkKeyForIndex(idx: number, mapWidth: number, chunkSize: number = DEFAULT_CHUNK_SIZE): string {
  const x = idx % mapWidth;
  const y = (idx / mapWidth) | 0;
  const cx = Math.floor(x / chunkSize);
  const cy = Math.floor(y / chunkSize);
  return `${cx},${cy}`;
}

export function chunkKeyForTile(x: number, y: number, chunkSize: number = DEFAULT_CHUNK_SIZE): string {
  return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`;
}

/**
 * Apply one own_batch to a flat owner buffer.
 * Only listed indices are written; dirty chunk keys are derived from those
 * indices so the render path can invalidate just those chunks.
 */
export function applyOwnBatch(
  owner: Uint8Array,
  sets: OwnBatchEntry[],
  mapWidth: number = MAP_WIDTH,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): ApplyOwnBatchResult {
  const dirtyTiles: DirtyTileChange[] = [];
  const dirtyChunks = new Set<string>();

  for (const set of sets) {
    const o = set.o;
    if (!Number.isInteger(o) || o < 0 || o > 255) continue;
    for (const idx of set.idx) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= owner.length) continue;
      const prevOwner = owner[idx];
      if (prevOwner === o) continue;
      owner[idx] = o;
      const x = idx % mapWidth;
      const y = (idx / mapWidth) | 0;
      dirtyTiles.push({ x, y, owner: o, prevOwner });
      dirtyChunks.add(chunkKeyForTile(x, y, chunkSize));
    }
  }

  return { applied: dirtyTiles.length > 0, dirtyTiles, dirtyChunks: Array.from(dirtyChunks) };
}

export interface ApplyCombatResult {
  applied: boolean;
  tiles: CombatWireTile[];
}

/** Sparse combat/fortify overlay. Zeroed entries clear the overlay slot. */
export function applyCombatToMap(
  combat: Map<number, CombatTile>,
  tiles: CombatWireTile[]
): ApplyCombatResult {
  const touched: CombatWireTile[] = [];
  for (const tile of tiles) {
    if (!Number.isInteger(tile.i) || tile.i < 0) continue;
    const cleared = tile.hp === 0 && tile.maxHp === 0 && tile.tier === 0;
    if (cleared) {
      if (combat.delete(tile.i)) {
        touched.push(tile);
      }
    } else {
      combat.set(tile.i, { hp: tile.hp, maxHp: tile.maxHp, defenseTier: tile.tier });
      touched.push(tile);
    }
  }
  return { applied: touched.length > 0, tiles: touched };
}

/**
 * Staleness rule (S2.2): drop when epoch is known and mismatched, or when
 * seq is not strictly newer than the last snapshot's seq.
 * Frames without an epoch field only take the seq check.
 */
export function shouldDropStaleFrame(
  frame: { seq: number; epoch?: number },
  lastSnapSeq: number,
  lastEpoch: number
): boolean {
  if (frame.epoch !== undefined && lastEpoch >= 0 && frame.epoch !== lastEpoch) {
    return true;
  }
  return shouldDropBatch(lastSnapSeq, frame.seq);
}

/**
 * Client mirror of the server data plane. Holds a dense ownership Uint8Array
 * and a sparse combat Map — never 1e6 tile objects.
 */
export class ClientLandSync {
  readonly width = MAP_WIDTH;
  readonly height = MAP_HEIGHT;
  readonly size = MAP_WIDTH * MAP_HEIGHT;

  owner: Uint8Array = new Uint8Array(this.size);
  combat = new Map<number, CombatTile>();
  /** Incremental owner → tile-count (maintained on snap/own_batch; no 1e6 rescan). */
  ownerCounts = new Map<number, number>();

  epoch = -1;
  lastSnapSeq = -1;
  /** True once a snap (or live batch) has been received. */
  ready = false;

  applySnap(frame: SnapFrame): { paintedTiles: number } {
    const bytes = decodeBytesBase64(frame.ownerBase64);
    if (bytes.length !== this.size) {
      throw new Error(`snapshot size mismatch: ${bytes.length}`);
    }
    this.owner.set(bytes);
    this.epoch = frame.epoch;
    this.lastSnapSeq = frame.seq;
    this.combat.clear();
    this.ready = true;

    // CRITICAL 2: snap carries the sparse combat dump so joiners keep HP/defense.
    if (frame.combat && frame.combat.length > 0) {
      applyCombatToMap(this.combat, frame.combat);
    }

    // Rebuild incremental owner counts once on snap (O(1M) here is fine).
    this.ownerCounts.clear();
    let paintedTiles = 0;
    for (let i = 0; i < this.size; i++) {
      const o = this.owner[i];
      if (o !== 0) {
        paintedTiles++;
        this.ownerCounts.set(o, (this.ownerCounts.get(o) || 0) + 1);
      }
    }
    return { paintedTiles };
  }

  shouldDrop(seq: number, epoch?: number): boolean {
    return shouldDropStaleFrame({ seq, epoch }, this.lastSnapSeq, this.epoch);
  }

  applyOwnBatch(frame: OwnBatchFrame, chunkSize: number = DEFAULT_CHUNK_SIZE): ApplyOwnBatchResult {
    if (this.shouldDrop(frame.seq, frame.epoch)) {
      return { applied: false, dirtyTiles: [], dirtyChunks: [] };
    }
    this.lastSnapSeq = Math.max(this.lastSnapSeq, frame.seq);
    this.ready = true;
    const result = applyOwnBatch(this.owner, frame.sets, this.width, chunkSize);
    // Incremental owner counts: adjust only by dirty tiles (no 1e6 rescan).
    for (const change of result.dirtyTiles) {
      if (change.prevOwner !== 0) {
        const prev = (this.ownerCounts.get(change.prevOwner) || 0) - 1;
        if (prev <= 0) this.ownerCounts.delete(change.prevOwner);
        else this.ownerCounts.set(change.prevOwner, prev);
      }
      if (change.owner !== 0) {
        this.ownerCounts.set(change.owner, (this.ownerCounts.get(change.owner) || 0) + 1);
      }
    }
    return result;
  }

  applyCombat(frame: CombatFrame): ApplyCombatResult {
    if (this.shouldDrop(frame.seq, frame.epoch)) {
      return { applied: false, tiles: [] };
    }
    this.lastSnapSeq = Math.max(this.lastSnapSeq, frame.seq);
    return applyCombatToMap(this.combat, frame.tiles);
  }

  getOwner(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.owner[y * this.width + x];
  }

  getOwnerAt(idx: number): number {
    if (idx < 0 || idx >= this.size) return 0;
    return this.owner[idx];
  }

  getCombatAt(idx: number): CombatTile | undefined {
    return this.combat.get(idx);
  }

  getCombat(x: number, y: number): CombatTile | undefined {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return this.combat.get(y * this.width + x);
  }

  /**
   * Owner counts for territory stats. Backed by the incremental map
   * (updated on snap/own_batch) — O(owners), never a 1e6 scan.
   * Use countOwnersFull() when a ground-truth full scan is needed.
   */
  countOwners(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const [o, n] of this.ownerCounts) {
      if (n > 0) counts[o] = n;
    }
    return counts;
  }

  /** Full O(1M) scan — reference implementation for tests / rare reconcilation. */
  countOwnersFull(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (let i = 0; i < this.size; i++) {
      const o = this.owner[i];
      if (o !== 0) counts[o] = (counts[o] || 0) + 1;
    }
    return counts;
  }

  reset(): void {
    this.owner.fill(0);
    this.combat.clear();
    this.ownerCounts.clear();
    this.epoch = -1;
    this.lastSnapSeq = -1;
    this.ready = false;
  }
}
