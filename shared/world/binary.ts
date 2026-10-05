export const WORLD_FORMAT = 1;
export const CHUNK_SIZE = 64;
export const MAX_SCHOOL_SLOTS = 16;
export type Mutation = { tileIndex: number; schoolMask: number; opcode: number };

export function schoolBit(bit: number): number {
  if (!Number.isInteger(bit) || bit < 0 || bit >= MAX_SCHOOL_SLOTS) throw new RangeError('Invalid school bit');
  return 1 << bit;
}

/** Little endian, fixed 64x64 padded chunks; edge padding must remain zero. */
export class ChunkGrid {
  constructor(public width = 1000, public height = 1000, public chunkSize = CHUNK_SIZE) {
    if (![width, height, chunkSize].every(n => Number.isSafeInteger(n) && n > 0)) throw new RangeError('Invalid grid');
  }
  get size() { return this.width * this.height; }
  index(x: number, z: number) {
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x >= this.width || z >= this.height) throw new RangeError('Tile outside grid');
    return z * this.width + x;
  }
  address(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) throw new RangeError('Invalid tile index');
    const x = index % this.width, z = Math.floor(index / this.width), s = this.chunkSize;
    return { x: Math.floor(x / s), z: Math.floor(z / s), local: (z % s) * s + x % s };
  }
  key(index: number) { const a = this.address(index); return `${a.x},${a.z}`; }
  *cells(cx: number, cz: number): Generator<[number, number]> {
    if (!Number.isInteger(cx) || !Number.isInteger(cz) || cx < 0 || cz < 0 || cx >= Math.ceil(this.width / this.chunkSize) || cz >= Math.ceil(this.height / this.chunkSize)) throw new RangeError('Invalid chunk');
    for (let z = 0; z < this.chunkSize; z++) for (let x = 0; x < this.chunkSize; x++) {
      const wx = cx * this.chunkSize + x, wz = cz * this.chunkSize + z;
      if (wx < this.width && wz < this.height) yield [wz * this.width + wx, z * this.chunkSize + x];
    }
  }
  serialize(masks: Uint16Array, cx: number, cz: number) {
    const bytes = new Uint8Array(this.chunkSize ** 2 * 2), view = new DataView(bytes.buffer);
    for (const [i, local] of this.cells(cx, cz)) view.setUint16(local * 2, masks[i], true);
    return bytes;
  }
  deserialize(bytes: Uint8Array, masks: Uint16Array, cx: number, cz: number, format = WORLD_FORMAT) {
    if (format !== WORLD_FORMAT || bytes.length !== this.chunkSize ** 2 * 2) throw new Error('Incompatible knowledge chunk');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const valid = new Set<number>();
    for (const [i, local] of this.cells(cx, cz)) { valid.add(local); masks[i] = view.getUint16(local * 2, true); }
    for (let local = 0; local < this.chunkSize ** 2; local++) if (!valid.has(local) && view.getUint16(local * 2, true)) throw new Error('Nonzero edge padding');
  }
}

/** Header: magic u16, format u16, chunk x/z u16, version f64, count u32, baseVersion f64.
 * Records: tileIndex u32, schoolMask u16, opcode u8, reserved u8. */
export function encodeMutations(items: Mutation[], chunkX: number, chunkZ: number, version: number, baseVersion = 0): Uint8Array {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid version');
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0 || baseVersion > version || ![chunkX,chunkZ].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)) throw new Error('Invalid chunk/base version');
  const bytes = new Uint8Array(28 + items.length * 8), view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5250, true); view.setUint16(2, WORLD_FORMAT, true);
  view.setUint16(4, chunkX, true); view.setUint16(6, chunkZ, true);
  view.setFloat64(8, version, true); view.setUint32(16, items.length, true);
  view.setFloat64(20, baseVersion, true);
  items.forEach((m, j) => {
    if (!Number.isInteger(m.tileIndex) || m.tileIndex < 0 || m.tileIndex > 0xffffffff || !Number.isInteger(m.schoolMask) || m.schoolMask < 0 || m.schoolMask > 65535 || ![0, 1].includes(m.opcode)) throw new Error('Invalid mutation');
    const offset = 28 + j * 8;
    view.setUint32(offset, m.tileIndex, true); view.setUint16(offset + 4, m.schoolMask, true); view.setUint8(offset + 6, m.opcode);
  }); return bytes;
}
export function decodeMutations(bytes: Uint8Array) {
  if (bytes.byteLength < 28) throw new Error('Truncated world packet');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint16(0, true) !== 0x5250 || v.getUint16(2, true) !== WORLD_FORMAT || bytes.length !== 28 + v.getUint32(16, true) * 8) throw new Error('Incompatible world packet');
  const version = v.getFloat64(8, true);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid packet version');
  const baseVersion=v.getFloat64(20,true);
  if(!Number.isSafeInteger(baseVersion)||baseVersion<0||baseVersion>version)throw new Error('Invalid base version');
  const items: Mutation[] = [];
  for (let o = 28; o < bytes.length; o += 8) {
    const opcode = v.getUint8(o + 6);
    if (![0, 1].includes(opcode) || v.getUint8(o + 7)) throw new Error('Invalid opcode');
    items.push({ tileIndex: v.getUint32(o, true), schoolMask: v.getUint16(o + 4, true), opcode });
  }
  return { chunkX: v.getUint16(4, true), chunkZ: v.getUint16(6, true), version, baseVersion, items };
}
