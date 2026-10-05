import { ChunkGrid, decodeMutations, WORLD_FORMAT } from './binary';

/** Presentation cache only. Server messages are the sole source of mutations. */
export class WorldClientState {
  readonly grid = new ChunkGrid();
  readonly masks = new Uint16Array(this.grid.size);
  readonly versions = new Map<string, number>();
  readonly fog = new Map<string, Uint8Array>();
  private fogVersions = new Map<string, number>();
  schoolId = '';
  reset(format: number) {
    if (format !== WORLD_FORMAT) throw new Error('Unsupported server world format');
    this.masks.fill(0); this.versions.clear();
  }
  chunk(r: {x:number;z:number;data:Uint8Array;format:number;version:number}) {
    const key=`${r.x},${r.z}`, previous=this.versions.get(key);
    if (!Number.isSafeInteger(r.version) || r.version<0) throw new Error('Invalid world version');
    if (previous !== undefined && r.version < previous) return [];
    this.grid.deserialize(new Uint8Array(r.data),this.masks,r.x,r.z,r.format);this.versions.set(key,r.version);
    return Array.from(this.grid.cells(r.x,r.z),([i])=>i);
  }
  delta(bytes: Uint8Array) {
    const packet=decodeMutations(new Uint8Array(bytes)),key=`${packet.chunkX},${packet.chunkZ}`;
    if (packet.version <= (this.versions.get(key) ?? -1)) return [];
    if ((this.versions.get(key) ?? 0) < packet.baseVersion) throw new Error('Missing world delta; resync required');
    // Validate the entire packet before applying any records.
    for (const item of packet.items) if(this.grid.key(item.tileIndex)!==key) throw new Error('Mutation outside packet chunk');
    for (const item of packet.items) this.masks[item.tileIndex]=item.schoolMask;
    this.versions.set(key,packet.version); return packet.items.map(m=>m.tileIndex);
  }
  resetFog(schoolId: string, format: number) {
    if(format!==WORLD_FORMAT)throw new Error('Unsupported fog format');
    this.schoolId=schoolId;this.fog.clear();this.fogVersions.clear();
  }
  fogChunk(r: {schoolId:string;x:number;z:number;data:Uint8Array;format:number;version:number}) {
    if(r.schoolId!==this.schoolId)return;
    // Colyseus MessagePack decodes binary fields as ArrayBuffer in browsers/Node.
    r.data=new Uint8Array(r.data);
    if(r.format!==WORLD_FORMAT || r.data.length!==512 || !Number.isSafeInteger(r.version))throw new Error('Incompatible fog chunk');
    this.grid.cells(r.x,r.z).next();const key=`${r.x},${r.z}`;
    if(r.version<=(this.fogVersions.get(key)??-1))return;
    this.fog.set(key,new Uint8Array(r.data));this.fogVersions.set(key,r.version);
  }
}
