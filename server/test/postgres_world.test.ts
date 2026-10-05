import assert from 'node:assert/strict';
import { PostgresWorldRepository, Campaign, WorldWrite } from '../src/world/WorldRepository';
import { SCHOOL_ROSTER } from '../../shared/constants/schools';

async function run() {
  const calls:{sql:string;params:any[]}[]=[];let fail=false;
  const writer={query:async(sql:string,params:any[]=[])=>{calls.push({sql,params});if(fail&&sql.startsWith('insert into public.school_fog_chunks'))throw new Error('DB unavailable');return {rows:[]};}};
  const repository=new PostgresWorldRepository('postgresql://placeholder:placeholder@localhost/placeholder');
  // Inject only the connection boundary. Actual query construction, batching and rollback run unchanged.
  (repository as any).writer=writer;(repository as any).ids.set('hcmut','00000000-0000-0000-0000-000000000001');
  const c:Campaign={id:'00000000-0000-0000-0000-000000000002',code:'r2pl-2027',width:1000,height:1000,chunkSize:64,format:1,maxSlots:16,schools:Object.values(SCHOOL_ROSTER)};
  const b:WorldWrite={chunks:[{x:15,z:15,data:new Uint8Array(8192),format:1,version:7}],fog:[{x:15,z:15,schoolId:'hcmut',data:new Uint8Array(512),format:1,version:3}],changedTiles:[999999],knowledge:[{tileIndex:999999,schoolId:'hcmut',strength:80,lastStudiedAt:1700000000000,version:7}]};
  await repository.save(c,b);
  assert.equal(calls[0].sql,'begin');assert.equal(calls.at(-1)!.sql,'commit');assert.equal(calls.length,6);
  assert.deepEqual(calls[1].params[2],[15]);assert(Buffer.isBuffer(calls[1].params[4][0]));assert.equal(calls[1].params[4][0].length,8192);
  assert(calls[3].sql.includes('tile_index=any'));assert.deepEqual(calls[3].params[1],[999999]);
  assert.equal(calls[4].params[4][0].getTime(),1700000000000);
  calls.length=0;fail=true;await assert.rejects(repository.save(c,b),/DB unavailable/);assert.equal(calls.at(-1)!.sql,'rollback');assert(!calls.some(c=>c.sql==='commit'));
  (repository as any).writer=undefined;await repository.close();
  console.log('Postgres adapter query-boundary tests passed: bytea batches, targeted sparse replacement, atomic commit and rollback. No live database connection used.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
