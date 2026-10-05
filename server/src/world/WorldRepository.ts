import { SchoolConfig, SCHOOL_ROSTER } from '../../../shared/constants/schools';
import { Pool, PoolClient } from 'pg';

export interface Campaign { id: string; code: string; width: number; height: number; chunkSize: number; format: number; maxSlots: number; schools: SchoolConfig[] }
export interface KnowledgeRecord { tileIndex: number; schoolId: string; strength: number; lastStudiedAt: number; version: number }
export interface ChunkRecord { x: number; z: number; data: Uint8Array; format: number; version: number }
export interface FogRecord extends ChunkRecord { schoolId: string }
export interface WorldSnapshot { chunks: ChunkRecord[]; fog: FogRecord[]; knowledge: KnowledgeRecord[] }
export interface WorldWrite extends WorldSnapshot { changedTiles: number[] }
export interface WorldRepository {
  loadCampaign(code: string): Promise<Campaign>;
  load(campaign: Campaign): Promise<WorldSnapshot>;
  save(campaign: Campaign, batch: WorldWrite): Promise<void>;
  close(): Promise<void>;
}
const copy = <T>(value: T): T => structuredClone(value);
export class InMemoryWorldRepository implements WorldRepository {
  private worlds = new Map<string, WorldSnapshot>();
  async loadCampaign(code: string): Promise<Campaign> {
    return { id: code, code, width: 1000, height: 1000, chunkSize: 64, format: 1, maxSlots: 16, schools: copy(Object.values(SCHOOL_ROSTER)) };
  }
  async load(c: Campaign) { return copy(this.worlds.get(c.id) || { chunks: [], fog: [], knowledge: [] }); }
  async save(c: Campaign, batch: WorldWrite) {
    const next = await this.load(c);
    for (const chunk of batch.chunks) { next.chunks = next.chunks.filter(r => r.x !== chunk.x || r.z !== chunk.z); next.chunks.push(copy(chunk)); }
    for (const fog of batch.fog) { next.fog = next.fog.filter(r => r.schoolId !== fog.schoolId || r.x !== fog.x || r.z !== fog.z); next.fog.push(copy(fog)); }
    const changed = new Set(batch.changedTiles);
    next.knowledge = next.knowledge.filter(r => !changed.has(r.tileIndex)); next.knowledge.push(...copy(batch.knowledge));
    this.worlds.set(c.id, next);
  }
  async close() {}
}

/** One authoritative writer per campaign. Backend-only PostgreSQL; no Data API. */
export class PostgresWorldRepository implements WorldRepository {
  readonly pool: Pool;
  private writer?: PoolClient;
  private closed = false;
  private ids = new Map<string, string>();
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  }
  async loadCampaign(code: string): Promise<Campaign> {
    const { rows } = await this.pool.query('select * from public.campaigns where code=$1', [code]);
    if (rows.length !== 1) throw new Error('Campaign not found');
    const c = rows[0];
    this.writer = await this.pool.connect();
    // Requires a direct/session-mode connection, not transaction pooling.
    const lock = await this.writer.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked', ['r2pl-world:' + c.id]);
    if (!lock.rows[0].locked) { this.writer.release(); this.writer = undefined; throw new Error('Campaign already has an authoritative writer'); }
    const roster = await this.pool.query(`select s.*, cs.hq_x,cs.hq_z from public.schools s join public.campaign_schools cs on cs.school_id=s.id
      where cs.campaign_id=$1 and cs.status='active' and s.is_active order by s.knowledge_bit`, [c.id]);
    const schools = roster.rows.map(s => {
      const id = s.code.toLowerCase(), base = SCHOOL_ROSTER[id]; this.ids.set(id, s.id);
      return { ...base, id, databaseId: s.id, knowledgeBit: s.knowledge_bit, name: s.display_name, shortName: s.short_name,
        emailDomain: base?.emailDomain || '', colorHex: base?.colorHex || `hsl(${s.knowledge_bit * 137.5 % 360},70%,50%)`, accentHex: base?.accentHex || '#ffffff',
        hq: s.hq_x === null ? null : { x: s.hq_x, y: s.hq_z } };
    });
    return { id: c.id, code, width: c.map_width, height: c.map_height, chunkSize: c.chunk_size, format: c.binary_format_version, maxSlots: c.max_school_slots, schools };
  }
  async load(c: Campaign): Promise<WorldSnapshot> {
    const [chunks, fog, knowledge] = await Promise.all([
      this.pool.query('select * from public.world_chunks where campaign_id=$1', [c.id]),
      this.pool.query('select f.*, s.code from public.school_fog_chunks f join public.schools s on s.id=f.school_id where campaign_id=$1', [c.id]),
      this.pool.query('select k.*, s.code from public.tile_knowledge_state k join public.schools s on s.id=k.school_id where campaign_id=$1', [c.id])
    ]);
    const chunk = r => ({ x: r.chunk_x, z: r.chunk_z, data: new Uint8Array(r.knowledge_data || r.fog_data), format: r.format_version, version: Number(r.version) });
    return { chunks: chunks.rows.map(chunk), fog: fog.rows.map(r => ({ ...chunk(r), schoolId: r.code.toLowerCase() })),
      knowledge: knowledge.rows.map(r => ({ tileIndex: r.tile_index, schoolId: r.code.toLowerCase(), strength: r.strength, lastStudiedAt: new Date(r.last_studied_at).getTime(), version: Number(r.version) })) };
  }
  async save(c: Campaign, batch: WorldWrite) {
    if (!this.writer) throw new Error('Campaign writer not acquired');
    const db = this.writer;
    await db.query('begin');
    try {
      // Bounded batches, parameterized bytea arrays, one statement per table.
      if (batch.chunks.length) await db.query(`insert into public.world_chunks(campaign_id,chunk_x,chunk_z,knowledge_data,format_version,version)
        select $1,x,z,data,$2,v from unnest($3::smallint[],$4::smallint[],$5::bytea[],$6::bigint[]) t(x,z,data,v)
        on conflict(campaign_id,chunk_x,chunk_z) do update set knowledge_data=excluded.knowledge_data,format_version=excluded.format_version,version=excluded.version,updated_at=now()`,
        [c.id,c.format,batch.chunks.map(r=>r.x),batch.chunks.map(r=>r.z),batch.chunks.map(r=>Buffer.from(r.data)),batch.chunks.map(r=>r.version)]);
      if (batch.fog.length) await db.query(`insert into public.school_fog_chunks(campaign_id,school_id,chunk_x,chunk_z,fog_data,format_version,version)
        select $1,s,x,z,data,$2,v from unnest($3::uuid[],$4::smallint[],$5::smallint[],$6::bytea[],$7::bigint[]) t(s,x,z,data,v)
        on conflict(campaign_id,school_id,chunk_x,chunk_z) do update set fog_data=excluded.fog_data,format_version=excluded.format_version,version=excluded.version,updated_at=now()`,
        [c.id,c.format,batch.fog.map(r=>this.schoolUuid(r.schoolId)),batch.fog.map(r=>r.x),batch.fog.map(r=>r.z),batch.fog.map(r=>Buffer.from(r.data)),batch.fog.map(r=>r.version)]);
      if (batch.changedTiles.length) await db.query('delete from public.tile_knowledge_state where campaign_id=$1 and tile_index=any($2::integer[])', [c.id,batch.changedTiles]);
      if (batch.knowledge.length) await db.query(`insert into public.tile_knowledge_state(campaign_id,tile_index,school_id,strength,last_studied_at,version)
        select $1,i,s,k,ts,v from unnest($2::integer[],$3::uuid[],$4::smallint[],$5::timestamptz[],$6::bigint[]) t(i,s,k,ts,v)`,
        [c.id,batch.knowledge.map(r=>r.tileIndex),batch.knowledge.map(r=>this.schoolUuid(r.schoolId)),batch.knowledge.map(r=>r.strength),batch.knowledge.map(r=>new Date(r.lastStudiedAt)),batch.knowledge.map(r=>r.version)]);
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; }
  }
  private schoolUuid(id: string) { const uuid = this.ids.get(id); if (!uuid) throw new Error('Unknown campaign school'); return uuid; }
  async close() {
    if(this.closed)return;this.closed=true;
    if (this.writer) { await this.writer.query('select pg_advisory_unlock_all()'); this.writer.release(); this.writer = undefined; }
    await this.pool.end();
  }
}
export function createWorldRepository(): WorldRepository {
  return process.env.DATABASE_URL ? new PostgresWorldRepository(process.env.DATABASE_URL) : new InMemoryWorldRepository();
}
