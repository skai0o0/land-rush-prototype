import { ChunkGrid, WORLD_FORMAT, schoolBit, encodeMutations } from '../../../shared/world/binary';
import { getSchoolBit } from '../../../shared/constants/schools';
import { Campaign, WorldRepository, KnowledgeRecord, FogRecord, WorldWrite } from './WorldRepository';

/** RAM authority. Persistence dirty state is independent of network flushes. */
export class WorldStore {
  readonly grid: ChunkGrid;
  readonly masks: Uint16Array;
  readonly knowledge = new Map<number, KnowledgeRecord[]>();
  readonly fog = new Map<string, FogRecord>();
  readonly versions = new Map<string, number>();
  private dirty = new Map<string, number>();
  private dirtyFog = new Map<string, number>();
  private pending = new Map<string, Map<number, number>>();
  private networkVersions = new Map<string, number>();
  private networkFog = new Set<string>();
  private changedTiles = new Map<number, number>();
  private inFlight?: Promise<void>;
  private timer?: NodeJS.Timeout;
  lastFlushError?: Error;
  constructor(public campaign: Campaign, public repository: WorldRepository) {
    if (campaign.format !== WORLD_FORMAT || campaign.chunkSize !== 64 || !Number.isInteger(campaign.maxSlots) || campaign.maxSlots < 1 || campaign.maxSlots > 16 || campaign.schools.length > campaign.maxSlots || campaign.schools.some(s=>s.knowledgeBit === undefined || s.knowledgeBit >= campaign.maxSlots) || campaign.width !== 1000 || campaign.height !== 1000) throw new Error('Unsupported campaign format/dimensions');
    this.grid = new ChunkGrid(campaign.width, campaign.height, campaign.chunkSize);
    this.masks = new Uint16Array(this.grid.size);
  }
  syncTile(index: number, entries: { schoolId: string; strength: number; lastStudiedAt: number }[]) {
    const key = this.grid.key(index);
    let mask = 0;
    for (const e of entries) {
      if (!Number.isInteger(e.strength) || e.strength <= 0 || e.strength > 32767 || !Number.isFinite(e.lastStudiedAt)) throw new Error('Invalid sparse knowledge');
      mask |= schoolBit(getSchoolBit(e.schoolId));
    }
    const old = this.knowledge.get(index) || [];
    if (this.masks[index] === mask && old.length === entries.length && entries.every(e => old.some(o => o.schoolId === e.schoolId && o.strength === e.strength && o.lastStudiedAt === e.lastStudiedAt))) return;
    const version = (this.versions.get(key) || 0) + 1;
    this.versions.set(key, version); this.dirty.set(key, version); this.changedTiles.set(index, version);
    if (entries.length) this.knowledge.set(index, entries.map(e => ({ ...e, tileIndex: index, version })));
    else this.knowledge.delete(index);
    if (this.masks[index] !== mask) {
      let pending = this.pending.get(key); if (!pending) this.pending.set(key, pending = new Map());
      pending.set(index, mask); this.masks[index] = mask;
    }
    // Each school's discovery is independent and monotonic, matching the existing 5x5 reveal kernel.
    for (const e of entries) this.revealRect(e.schoolId, index % this.grid.width - 2, Math.floor(index / this.grid.width) - 2, index % this.grid.width + 2, Math.floor(index / this.grid.width) + 2);
  }
  revealRect(schoolId: string, x0: number, z0: number, x1: number, z1: number) {
    getSchoolBit(schoolId);
    for (let z = Math.max(0, z0); z <= Math.min(this.grid.height - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(this.grid.width - 1, x1); x++) {
      const a = this.grid.address(this.grid.index(x, z)), key = `${schoolId}:${a.x},${a.z}`;
      let record = this.fog.get(key);
      if (!record) { record = { schoolId, x: a.x, z: a.z, data: new Uint8Array(this.grid.chunkSize ** 2 / 8), version: 0, format: WORLD_FORMAT }; this.fog.set(key, record); }
      const byte = a.local >> 3, bit = 1 << (a.local & 7);
      if (!(record.data[byte] & bit)) { record.data[byte] |= bit; record.version++; this.dirtyFog.set(key, record.version); this.networkFog.add(key); }
    }
  }
  isRevealed(school: string, index: number) {
    const a = this.grid.address(index), r = this.fog.get(`${school}:${a.x},${a.z}`);
    return !!(r && r.data[a.local >> 3] & (1 << (a.local & 7)));
  }
  networkDeltas() {
    const result: Uint8Array[] = [];
    for (const [key, pending] of this.pending) {
      const [x,z] = key.split(',').map(Number);
      const version=this.versions.get(key)!;
      result.push(encodeMutations(Array.from(pending, ([tileIndex, schoolMask]) => ({ tileIndex, schoolMask, opcode: 0 })), x,z,version,this.networkVersions.get(key)||0));
      this.networkVersions.set(key,version);
    }
    this.pending.clear(); return result;
  }
  chunkPackets() {
    return Array.from(this.versions, ([key, version]) => {
      const [x,z] = key.split(',').map(Number);
      return { x,z,version,format: WORLD_FORMAT,data: this.grid.serialize(this.masks,x,z) };
    });
  }
  fogPackets(school: string) { return Array.from(this.fog.values()).filter(r=>r.schoolId===school).map(r=>({...r,data:r.data.slice()})); }
  fogDeltas() {
    const groups = new Map<string, FogRecord[]>();
    for(const key of this.networkFog) { const r=this.fog.get(key)!;const list=groups.get(r.schoolId)||[];list.push({...r,data:r.data.slice()});groups.set(r.schoolId,list); }
    this.networkFog.clear();return groups;
  }
  async restore() {
    const snapshot = await this.repository.load(this.campaign);
    this.masks.fill(0); this.knowledge.clear(); this.fog.clear(); this.versions.clear();
    for (const r of snapshot.chunks) {
      this.validateVersion(r.version); const key = `${r.x},${r.z}`;
      if (this.versions.has(key)) throw new Error('Duplicate chunk');
      this.grid.deserialize(r.data,this.masks,r.x,r.z,r.format); this.versions.set(key,r.version);
    }
    const expected = new Uint16Array(this.grid.size);
    for (const r of snapshot.knowledge) {
      this.grid.address(r.tileIndex); this.validateVersion(r.version);
      if (!Number.isInteger(r.strength) || r.strength <= 0 || !Number.isFinite(r.lastStudiedAt)) throw new Error('Invalid persisted knowledge');
      const bit = schoolBit(getSchoolBit(r.schoolId));
      if (expected[r.tileIndex] & bit) throw new Error('Duplicate sparse knowledge');
      expected[r.tileIndex] |= bit;
      const records = this.knowledge.get(r.tileIndex) || []; records.push({...r}); this.knowledge.set(r.tileIndex,records);
    }
    for (let i=0;i<this.masks.length;i++) if (expected[i] !== this.masks[i]) throw new Error('Knowledge mask/metadata mismatch');
    for (const r of snapshot.fog) {
      getSchoolBit(r.schoolId); this.validateVersion(r.version);
      if (r.format !== WORLD_FORMAT || r.data.length !== this.grid.chunkSize ** 2 / 8) throw new Error('Incompatible fog chunk');
      const valid = new Set(Array.from(this.grid.cells(r.x,r.z),([,local])=>local));
      for (let local=0;local<this.grid.chunkSize**2;local++) if (!valid.has(local) && (r.data[local>>3] & (1<<(local&7)))) throw new Error('Nonzero fog padding');
      this.fog.set(`${r.schoolId}:${r.x},${r.z}`, {...r,data:r.data.slice()});
    }
    this.dirty.clear(); this.dirtyFog.clear(); this.pending.clear(); this.changedTiles.clear();
    this.networkVersions=new Map(this.versions);this.networkFog.clear();
  }
  private validateVersion(version: number) { if (!Number.isSafeInteger(version) || version < 0) throw new Error('Incompatible chunk version'); }
  start(interval = 3000) {
    if (!Number.isFinite(interval) || interval < 100) throw new Error('Invalid persistence interval');
    this.timer = setInterval(()=>{ this.flush().catch(error=>{ this.lastFlushError=error; console.error('[World persistence] flush failed; dirty data retained',error.message); }); },interval);
    this.timer.unref();
  }
  async flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.dirty.size && !this.dirtyFog.size) return;
    const dirty = new Map(Array.from(this.dirty).slice(0,32)), fogDirty = new Map(Array.from(this.dirtyFog).slice(0,128));
    const changed = new Map(Array.from(this.changedTiles).filter(([index])=>dirty.has(this.grid.key(index))));
    const batch: WorldWrite = { chunks: Array.from(dirty,([key,version])=>{const [x,z]=key.split(',').map(Number);return {x,z,version,format:WORLD_FORMAT,data:this.grid.serialize(this.masks,x,z)};}),
      fog: Array.from(fogDirty,([key])=>({...this.fog.get(key)!,data:this.fog.get(key)!.data.slice()})), changedTiles: Array.from(changed.keys()),
      knowledge: Array.from(changed.keys()).flatMap(index=>(this.knowledge.get(index)||[]).map(r=>({...r}))) };
    this.inFlight = this.repository.save(this.campaign,batch).then(()=>{
      for (const [key,v] of dirty) if (this.dirty.get(key)===v) this.dirty.delete(key);
      for (const [key,v] of fogDirty) if (this.dirtyFog.get(key)===v) this.dirtyFog.delete(key);
      for (const [index,v] of changed) if (this.changedTiles.get(index)===v) this.changedTiles.delete(index);
      this.lastFlushError = undefined;
    }).finally(()=>{this.inFlight=undefined;});
    return this.inFlight;
  }
  async drain() { if (this.timer) clearInterval(this.timer); if (this.inFlight) await this.inFlight; while(this.dirty.size || this.dirtyFog.size) await this.flush(); }
  async close() { await this.drain(); await this.repository.close(); }
}
