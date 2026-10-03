/** Broadcast channel for land data-plane frames (snap / own_batch / combat / ack). */
export const LAND_FRAME_CHANNEL = 'land';

export interface ClaimFrame {
  t: 'claim';
  x: number;
  y: number;
}

export interface FortifyFrame {
  t: 'fortify';
  x: number;
  y: number;
}

export interface StudyFrame {
  t: 'study';
  x: number;
  y: number;
  points?: number;
}

export interface CrystalFrame {
  t: 'crystal';
  landmarkId: string;
  crystals?: number;
  amount?: number;
  points?: number;
}

export interface FuelFrame {
  t: 'fuel';
  landmarkId: string;
  crystals?: number;
  amount?: number;
  points?: number;
}

export interface SnapFrame {

  t: 'snap';
  epoch: number;
  seq: number;
  w: number;
  h: number;
  ownerBase64: string;
  /** Sparse combat/fortify dump so joiners see HP/defense on fortified tiles. */
  combat?: CombatTileWire[];
}

export interface OwnSet {
  o: number;
  idx: number[];
}

export interface OwnBatchFrame {
  t: 'own_batch';
  seq: number;
  ts: number;
  /** Room epoch at flush time (S2.2 wrong-epoch drop on live frames). */
  epoch?: number;
  sets: OwnSet[];
}

export interface CombatTileWire {
  i: number;
  hp: number;
  maxHp: number;
  tier: number;
}

export interface CombatFrame {
  t: 'combat';
  seq: number;
  ts: number;
  /** Room epoch at flush time (S2.2 wrong-epoch drop on live frames). */
  epoch?: number;
  tiles: CombatTileWire[];
}

export interface AckFrame {
  t: 'ack';
  op: string;
  x: number;
  y: number;
  ok: boolean;
  reason?: string;
}

export type ClientFrame = ClaimFrame | FortifyFrame | StudyFrame | CrystalFrame | FuelFrame;
export type ServerFrame = SnapFrame | OwnBatchFrame | CombatFrame | AckFrame;
export type AnyFrame = ClientFrame | ServerFrame;

export function encodeFrame(frame: AnyFrame): string {
  return JSON.stringify(frame);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function decodeClaim(v: any): ClaimFrame | null {
  if (!isInt(v.x) || !isInt(v.y)) return null;
  return { t: 'claim', x: v.x, y: v.y };
}

function decodeFortify(v: any): FortifyFrame | null {
  if (!isInt(v.x) || !isInt(v.y)) return null;
  return { t: 'fortify', x: v.x, y: v.y };
}

function decodeStudy(v: any): StudyFrame | null {
  if (!isInt(v.x) || !isInt(v.y)) return null;
  const frame: StudyFrame = { t: 'study', x: v.x, y: v.y };
  if (v.points !== undefined) {
    if (!isNum(v.points) || v.points < 0) return null;
    frame.points = v.points;
  }
  return frame;
}

function decodeCrystal(v: any): CrystalFrame | null {
  if (!isStr(v.landmarkId) || !v.landmarkId) return null;
  const frame: CrystalFrame = { t: 'crystal', landmarkId: v.landmarkId };
  if (v.crystals !== undefined) {
    if (!isNum(v.crystals) || v.crystals < 0) return null;
    frame.crystals = v.crystals;
  }
  if (v.amount !== undefined) {
    if (!isNum(v.amount) || v.amount < 0) return null;
    frame.amount = v.amount;
  }
  if (v.points !== undefined) {
    if (!isNum(v.points) || v.points < 0) return null;
    frame.points = v.points;
  }
  return frame;
}

function decodeFuel(v: any): FuelFrame | null {
  if (!isStr(v.landmarkId) || !v.landmarkId) return null;
  const frame: FuelFrame = { t: 'fuel', landmarkId: v.landmarkId };
  if (v.crystals !== undefined) {
    if (!isNum(v.crystals) || v.crystals < 0) return null;
    frame.crystals = v.crystals;
  }
  if (v.amount !== undefined) {
    if (!isNum(v.amount) || v.amount < 0) return null;
    frame.amount = v.amount;
  }
  if (v.points !== undefined) {
    if (!isNum(v.points) || v.points < 0) return null;
    frame.points = v.points;
  }
  return frame;
}


function decodeCombatTiles(v: any): CombatTileWire[] | null {
  if (!Array.isArray(v)) return null;
  const tiles: CombatTileWire[] = [];
  for (const tile of v) {
    if (tile == null || !isInt(tile.i) || !isNum(tile.hp) || !isNum(tile.maxHp) || !isInt(tile.tier)) return null;
    tiles.push({ i: tile.i, hp: tile.hp, maxHp: tile.maxHp, tier: tile.tier });
  }
  return tiles;
}

function decodeSnap(v: any): SnapFrame | null {
  if (!isInt(v.epoch) || !isInt(v.seq) || !isInt(v.w) || !isInt(v.h) || !isStr(v.ownerBase64)) return null;
  const frame: SnapFrame = { t: 'snap', epoch: v.epoch, seq: v.seq, w: v.w, h: v.h, ownerBase64: v.ownerBase64 };
  if (v.combat !== undefined) {
    const tiles = decodeCombatTiles(v.combat);
    if (!tiles) return null;
    frame.combat = tiles;
  }
  return frame;
}

function decodeOwnBatch(v: any): OwnBatchFrame | null {
  if (!isInt(v.seq) || !isNum(v.ts) || !Array.isArray(v.sets)) return null;
  if (v.epoch !== undefined && !isInt(v.epoch)) return null;
  const sets: OwnSet[] = [];
  for (const s of v.sets) {
    if (s == null || !isInt(s.o) || !Array.isArray(s.idx)) return null;
    const idx: number[] = [];
    for (const i of s.idx) {
      if (!isInt(i)) return null;
      idx.push(i);
    }
    sets.push({ o: s.o, idx });
  }
  const frame: OwnBatchFrame = { t: 'own_batch', seq: v.seq, ts: v.ts, sets };
  if (v.epoch !== undefined) frame.epoch = v.epoch;
  return frame;
}

function decodeCombat(v: any): CombatFrame | null {
  if (!isInt(v.seq) || !isNum(v.ts) || !Array.isArray(v.tiles)) return null;
  if (v.epoch !== undefined && !isInt(v.epoch)) return null;
  const tiles = decodeCombatTiles(v.tiles);
  if (!tiles) return null;
  const frame: CombatFrame = { t: 'combat', seq: v.seq, ts: v.ts, tiles };
  if (v.epoch !== undefined) frame.epoch = v.epoch;
  return frame;
}

function decodeAck(v: any): AckFrame | null {
  if (!isStr(v.op) || !isInt(v.x) || !isInt(v.y) || typeof v.ok !== 'boolean') return null;
  const frame: AckFrame = { t: 'ack', op: v.op, x: v.x, y: v.y, ok: v.ok };
  if (v.reason !== undefined) {
    if (!isStr(v.reason)) return null;
    frame.reason = v.reason;
  }
  return frame;
}

function decodeObject(raw: string | object): any | null {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (raw != null && typeof raw === 'object') {
    return raw;
  }
  return null;
}

export function decodeFrame(raw: string | object): AnyFrame | null {
  const v = decodeObject(raw);
  if (v == null || typeof v.t !== 'string') return null;
  switch (v.t) {
    case 'claim':
      return decodeClaim(v);
    case 'fortify':
      return decodeFortify(v);
    case 'study':
      return decodeStudy(v);
    case 'crystal':
      return decodeCrystal(v);
    case 'fuel':
      return decodeFuel(v);
    case 'snap':
      return decodeSnap(v);
    case 'own_batch':
      return decodeOwnBatch(v);
    case 'combat':
      return decodeCombat(v);
    case 'ack':
      return decodeAck(v);
    default:
      return null;
  }
}

export function decodeClientFrame(raw: string | object): ClientFrame | null {
  const f = decodeFrame(raw);
  if (f && (f.t === 'claim' || f.t === 'fortify' || f.t === 'study' || f.t === 'crystal' || f.t === 'fuel')) return f;
  return null;
}

export function decodeServerFrame(raw: string | object): ServerFrame | null {
  const f = decodeFrame(raw);
  if (f && (f.t === 'snap' || f.t === 'own_batch' || f.t === 'combat' || f.t === 'ack')) return f;
  return null;
}

export function makeClaim(x: number, y: number): ClaimFrame {
  return { t: 'claim', x, y };
}

export function makeFortify(x: number, y: number): FortifyFrame {
  return { t: 'fortify', x, y };
}

export function makeStudy(x: number, y: number, points?: number): StudyFrame {
  const frame: StudyFrame = { t: 'study', x, y };
  if (points !== undefined) frame.points = points;
  return frame;
}

export function makeCrystal(landmarkId: string, crystals?: number, points?: number): CrystalFrame {
  const frame: CrystalFrame = { t: 'crystal', landmarkId };
  if (crystals !== undefined) frame.crystals = crystals;
  if (points !== undefined) frame.points = points;
  return frame;
}

export function makeFuel(landmarkId: string, points?: number): FuelFrame {
  const frame: FuelFrame = { t: 'fuel', landmarkId };
  if (points !== undefined) frame.points = points;
  return frame;
}


export function makeSnap(
  epoch: number,
  seq: number,
  w: number,
  h: number,
  ownerBase64: string,
  combat?: CombatTileWire[]
): SnapFrame {
  const frame: SnapFrame = { t: 'snap', epoch, seq, w, h, ownerBase64 };
  if (combat !== undefined) frame.combat = combat;
  return frame;
}

export function makeOwnBatch(seq: number, ts: number, sets: OwnSet[], epoch?: number): OwnBatchFrame {
  const frame: OwnBatchFrame = { t: 'own_batch', seq, ts, sets };
  if (epoch !== undefined) frame.epoch = epoch;
  return frame;
}

export function makeCombat(seq: number, ts: number, tiles: CombatTileWire[], epoch?: number): CombatFrame {
  const frame: CombatFrame = { t: 'combat', seq, ts, tiles };
  if (epoch !== undefined) frame.epoch = epoch;
  return frame;
}

export function makeAck(op: string, x: number, y: number, ok: boolean, reason?: string): AckFrame {
  const frame: AckFrame = { t: 'ack', op, x, y, ok };
  if (reason !== undefined) frame.reason = reason;
  return frame;
}
