export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1000;

export interface CombatTile {
  hp: number;
  maxHp: number;
  defenseTier: number;
}

export interface OwnBatchEntry {
  o: number;
  idx: number[];
}

export interface OwnBatchPayload {
  seq: number;
  ts: number;
  sets: OwnBatchEntry[];
}

export interface CombatWireTile {
  i: number;
  hp: number;
  maxHp: number;
  tier: number;
}

export interface CombatFlushPayload {
  seq: number;
  ts: number;
  tiles: CombatWireTile[];
}

export interface LandSnapshot {
  epoch: number;
  seq: number;
  w: number;
  h: number;
  ownerBase64: string;
  /** Sparse combat/fortify tiles so joiners keep HP/defense after snap. */
  combat: CombatWireTile[];
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) {
    table[B64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

export function encodeBytesBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      B64_CHARS[chunk & 63];
  }
  const rem = n - i;
  if (rem === 1) {
    const chunk = bytes[i] << 16;
    out += B64_CHARS[(chunk >> 18) & 63] + B64_CHARS[(chunk >> 12) & 63] + '==';
  } else if (rem === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      '=';
  }
  return out;
}

export function decodeBytesBase64(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const n = clean.length;
  const byteLen = Math.floor((n * 3) / 4);
  const out = new Uint8Array(byteLen);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < n; i++) {
    const v = B64_LOOKUP[clean.charCodeAt(i)];
    if (v < 0) {
      throw new Error(`invalid base64 character at ${i}`);
    }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export function shouldDropBatch(lastSnapSeq: number, batchSeq: number): boolean {
  return batchSeq <= lastSnapSeq;
}

export class LandState {
  readonly width = MAP_WIDTH;
  readonly height = MAP_HEIGHT;
  readonly size = MAP_WIDTH * MAP_HEIGHT;

  /** One-byte Three.js/legacy display projection only. NOT authoritative Shared Knowledge;
   * independent school presence/strength lives in WorldStore masks and sparse records. */
  owner: Uint8Array;
  combat = new Map<number, CombatTile>();

  private ownershipDirty = new Map<number, number>();
  private combatDirty = new Set<number>();
  private _seq = 0;
  private _epoch = 0;

  constructor() {
    this.owner = new Uint8Array(this.size);
  }

  get seq(): number {
    return this._seq;
  }

  get epoch(): number {
    return this._epoch;
  }

  getIndex(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new RangeError(`tile out of bounds: (${x}, ${y})`);
    }
    return y * this.width + x;
  }

  setOwner(x: number, y: number, schoolNumericId: number): void {
    if (!Number.isInteger(schoolNumericId) || schoolNumericId < 0 || schoolNumericId > 255) {
      throw new RangeError(`schoolNumericId out of range: ${schoolNumericId}`);
    }
    const idx = this.getIndex(x, y);
    if (this.owner[idx] === schoolNumericId) return;
    this.owner[idx] = schoolNumericId;
    this.markOwnershipDirty(schoolNumericId, idx);
  }

  setOwnerAt(idx: number, schoolNumericId: number): void {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.size) {
      throw new RangeError(`index out of bounds: ${idx}`);
    }
    if (!Number.isInteger(schoolNumericId) || schoolNumericId < 0 || schoolNumericId > 255) {
      throw new RangeError(`schoolNumericId out of range: ${schoolNumericId}`);
    }
    if (this.owner[idx] === schoolNumericId) return;
    this.owner[idx] = schoolNumericId;
    this.markOwnershipDirty(schoolNumericId, idx);
  }

  getOwner(x: number, y: number): number {
    return this.owner[this.getIndex(x, y)];
  }

  getOwnerAt(idx: number): number {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.size) {
      throw new RangeError(`index out of bounds: ${idx}`);
    }
    return this.owner[idx];
  }

  private markOwnershipDirty(schoolNumericId: number, idx: number): void {
    this.ownershipDirty.set(idx, schoolNumericId);
  }

  flushOwnership(ts: number = Date.now()): OwnBatchPayload {
    const byOwner = new Map<number, number[]>();
    for (const [idx, o] of this.ownershipDirty) {
      let list = byOwner.get(o);
      if (!list) {
        list = [];
        byOwner.set(o, list);
      }
      list.push(idx);
    }
    const sets: OwnBatchEntry[] = [];
    const keys = Array.from(byOwner.keys()).sort((a, b) => a - b);
    for (const o of keys) {
      sets.push({ o, idx: byOwner.get(o)!.sort((a, b) => a - b) });
    }
    this.ownershipDirty.clear();
    if (sets.length > 0) {
      this._seq += 1;
    }
    return { seq: this._seq, ts, sets };
  }

  setCombat(x: number, y: number, tile: CombatTile): void {
    this.setCombatAt(this.getIndex(x, y), tile);
  }

  setCombatAt(idx: number, tile: CombatTile): void {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.size) {
      throw new RangeError(`index out of bounds: ${idx}`);
    }
    this.combat.set(idx, {
      hp: tile.hp,
      maxHp: tile.maxHp,
      defenseTier: tile.defenseTier
    });
    this.combatDirty.add(idx);
  }

  getCombat(x: number, y: number): CombatTile | undefined {
    return this.combat.get(this.getIndex(x, y));
  }

  getCombatAt(idx: number): CombatTile | undefined {
    return this.combat.get(idx);
  }

  clearCombat(x: number, y: number): void {
    this.clearCombatAt(this.getIndex(x, y));
  }

  clearCombatAt(idx: number): void {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.size) {
      throw new RangeError(`index out of bounds: ${idx}`);
    }
    this.combat.delete(idx);
    this.combatDirty.add(idx);
  }

  flushCombat(ts: number = Date.now()): CombatFlushPayload {
    const tiles: CombatWireTile[] = [];
    const dirty = Array.from(this.combatDirty).sort((a, b) => a - b);
    for (const i of dirty) {
      const t = this.combat.get(i);
      if (t) {
        tiles.push({ i, hp: t.hp, maxHp: t.maxHp, tier: t.defenseTier });
      } else {
        tiles.push({ i, hp: 0, maxHp: 0, tier: 0 });
      }
    }
    this.combatDirty.clear();
    if (tiles.length > 0) {
      this._seq += 1;
    }
    return { seq: this._seq, ts, tiles };
  }

  /** Full sparse combat dump (for snap / post-snap joiner sync). */
  combatList(): CombatWireTile[] {
    const tiles: CombatWireTile[] = [];
    const keys = Array.from(this.combat.keys()).sort((a, b) => a - b);
    for (const i of keys) {
      const t = this.combat.get(i)!;
      tiles.push({ i, hp: t.hp, maxHp: t.maxHp, tier: t.defenseTier });
    }
    return tiles;
  }

  snapshot(): LandSnapshot {
    return {
      epoch: this._epoch,
      seq: this._seq,
      w: this.width,
      h: this.height,
      ownerBase64: encodeBytesBase64(this.owner),
      combat: this.combatList()
    };
  }

  applySnapshot(snap: LandSnapshot): void {
    const bytes = decodeBytesBase64(snap.ownerBase64);
    if (bytes.length !== this.size) {
      throw new Error(`snapshot size mismatch: ${bytes.length}`);
    }
    this.owner.set(bytes);
    this._epoch = snap.epoch;
    this._seq = snap.seq;
    this.ownershipDirty.clear();
    this.combatDirty.clear();
    this.combat.clear();
    if (snap.combat) {
      for (const t of snap.combat) {
        if (!Number.isInteger(t.i) || t.i < 0 || t.i >= this.size) continue;
        if (t.hp === 0 && t.maxHp === 0 && t.tier === 0) continue;
        this.combat.set(t.i, { hp: t.hp, maxHp: t.maxHp, defenseTier: t.tier });
      }
    }
  }

  bumpEpoch(): number {
    this._epoch += 1;
    this.ownershipDirty.clear();
    this.combatDirty.clear();
    return this._epoch;
  }

  reset(): void {
    this.owner.fill(0);
    this.combat.clear();
    this.ownershipDirty.clear();
    this.combatDirty.clear();
    this.bumpEpoch();
  }
}
