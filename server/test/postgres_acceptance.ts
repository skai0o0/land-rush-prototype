import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { Pool } from 'pg';
import { Client, Room } from 'colyseus.js';
import { WorldClientState } from '../../shared/world/WorldClientState';

/** Opt-in against a dedicated approved test campaign. Never guesses coordinates or secrets. */
async function run() {
  if (!process.env.DATABASE_URL) {console.log('SKIPPED: DATABASE_URL unavailable; PostgreSQL restart acceptance not verified.');return;}
  const code=process.env.ACCEPTANCE_CAMPAIGN_CODE;
  if(!code || !/^r2pl-2027-acceptance(?:-[a-z0-9-]+)?$/.test(code))throw new Error('Set ACCEPTANCE_CAMPAIGN_CODE to a dedicated test campaign with approved temporary HCMUT HQ layout; this test changes ~20 tiles.');
  const db=new Pool({connectionString:process.env.DATABASE_URL,max:2}),port=Number(process.env.ACCEPTANCE_PORT||'2579');
  let child:ChildProcess|undefined,room:Room|undefined;
  const stop=async()=>{if(room){await room.leave();room=undefined;}if(child){const current=child;const closed=new Promise<void>(resolve=>current.once('exit',()=>resolve()));current.kill('SIGTERM');await closed;child=undefined;}};
  const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  const start=async()=>{
    child=spawn(process.execPath,[path.resolve(__dirname,'../build/server/src/index.js')],{env:{...process.env,NODE_ENV:'test',ALLOW_DEV:'true',PORT:String(port),CAMPAIGN_CODE:code,WORLD_FLUSH_MS:'2000'},stdio:'ignore',windowsHide:true});
    for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return;}catch{}await wait(100);}
    throw new Error('Acceptance server failed to start; check build, database connectivity and campaign format');
  };
  try {
    const {rows}=await db.query(`select c.id,cs.hq_x,cs.hq_z from public.campaigns c join public.campaign_schools cs on cs.campaign_id=c.id join public.schools s on s.id=cs.school_id where c.code=$1 and s.code='HCMUT'`,[code]);
    if(!rows.length||rows[0].hq_x===null)throw new Error('Approved HCMUT HQ required; no coordinates will be invented.');
    const c=rows[0],x0=c.hq_x+11,z=c.hq_z,indices=Array.from({length:20},(_,i)=>z*1000+x0+i);
    await start();room=await new Client(`ws://127.0.0.1:${port}`).joinOrCreate('campus_room',{schoolId:'hcmut',email:'acceptance@hcmut.edu.vn',points:1000,mode:'dev'});
    const cache=new WorldClientState();const wireErrors:string[]=[];
    room.onMessage('*',()=>{});room.onMessage('world_manifest',m=>cache.reset(m.format));room.onMessage('world_chunk',m=>cache.chunk(m));room.onMessage('world_delta',m=>{try{cache.delta(m);}catch(e){wireErrors.push(String(e));}});
    room.send('world_resync');await wait(100);
    for(let i=0;i<20;i++){room.send('claim_tile',{x:x0+i,y:z,points:1});await wait(100);}
    await wait(5000);for(const i of indices)assert(cache.masks[i]&1,'Exploration must pass authoritative validation');assert.deepEqual(wireErrors,[]);
    const expected=await db.query('select tile_index,school_id,strength,last_studied_at,version from public.tile_knowledge_state where campaign_id=$1 and tile_index=any($2::integer[]) order by tile_index,school_id',[c.id,indices]);
    assert(expected.rows.length>=20,'Dirty chunks and sparse metadata must flush to PostgreSQL');
    const expectedMasks=indices.map(i=>cache.masks[i]);await stop();await start();
    room=await new Client(`ws://127.0.0.1:${port}`).joinOrCreate('campus_room',{schoolId:'ntu',mode:'dev'});
    const restored=new WorldClientState(),fogSchools:string[]=[];room.onMessage('*',()=>{});room.onMessage('world_manifest',m=>restored.reset(m.format));room.onMessage('world_chunk',m=>restored.chunk(m));room.onMessage('world_delta',m=>restored.delta(m));room.onMessage('fog_chunk',m=>fogSchools.push(m.schoolId));room.onMessage('fog_batch',m=>fogSchools.push(m.schoolId));room.send('world_resync');await wait(1000);
    assert.deepEqual(indices.map(i=>restored.masks[i]),expectedMasks);assert(fogSchools.every(s=>s==='ntu'));
    const actual=await db.query('select tile_index,school_id,strength,last_studied_at,version from public.tile_knowledge_state where campaign_id=$1 and tile_index=any($2::integer[]) order by tile_index,school_id',[c.id,indices]);assert.deepEqual(actual.rows,expected.rows);
    console.log('PASS: process start -> 20 authoritative tile actions -> PostgreSQL flush -> process termination -> restart -> exact knowledge/strength/timestamp restore -> new client; school fog messages isolated.');
    console.log('Shared multischool persistence is covered by unit fixtures; this live test verifies existing sparse rows without manufacturing another school\'s territory.');
  } finally {await stop();await db.end();}
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error.message);process.exit(1);});
