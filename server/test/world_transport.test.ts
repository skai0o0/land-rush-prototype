import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'colyseus';
import { Client } from 'colyseus.js';
import { CampusRoom } from '../src/rooms/CampusRoom';
import { InMemoryWorldRepository } from '../src/world/WorldRepository';
import { WorldClientState } from '../../shared/world/WorldClientState';

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function run() {
  process.env.ALLOW_DEV='true';
  class FixtureRepository extends InMemoryWorldRepository {
    async loadCampaign(code:string) {const c=await super.loadCampaign(code);c.schools=c.schools.map(s=>({...s,hq:s.id==='hcmut'?{x:100,y:100}:null}));return c;}
  }
  const repo=new FixtureRepository();let authority:CampusRoom;
  class PersistentFixtureRoom extends CampusRoom { constructor(){super();this.persistenceRepository=repo;authority=this;} }
  const start=async()=>{
    const http=createServer(),server=new Server({server:http,greet:false,gracefullyShutdown:false});
    server.define('foundation_transport',PersistentFixtureRoom);await server.listen(0,'127.0.0.1');
    return {server,url:`ws://127.0.0.1:${(http.address() as any).port}`};
  };
  let service=await start();const socket=await new Client(service.url).joinOrCreate('foundation_transport',{schoolId:'hcmut',email:'transport@hcmut.edu.vn',points:1000,mode:'dev'});
  const cache=new WorldClientState();let deltaCount=0;
  socket.onMessage('*',()=>{});
  socket.onMessage('world_manifest',m=>cache.reset(m.format));
  socket.onMessage('world_chunk',m=>cache.chunk(m));
  socket.onMessage('world_delta',m=>{cache.delta(m);deltaCount++;});
  socket.onMessage('fog_reset',m=>cache.resetFog(m.schoolId,m.format));
  socket.onMessage('fog_chunk',m=>cache.fogChunk(m));
  socket.onMessage('fog_batch',m=>m.records.forEach(r=>cache.fogChunk(r)));
  await wait(100);
  for(let x=111;x<131;x++){socket.send('claim_tile',{x,y:100,points:1});await wait(10);}
  await wait(200);
  for(let x=111;x<131;x++)assert.equal(cache.masks[100000+x],1,'Live binary delta must cross real WebSocket');
  assert(cache.fog.size>0,'Binary fog chunks must decode across the real transport');
  assert(cache.fog.get('1,1')![((100%64)*64+120%64)>>3] & (1<<(((100%64)*64+120%64)&7)), 'Own-school discovery arrives');
  assert(deltaCount>0&&deltaCount<20,'Mutations coalesce into fewer frames than tile actions');
  const timestamp=authority!.world!.knowledge.get(100120)![0].lastStudiedAt;
  await authority!.world!.drain();await socket.leave();await service.server.gracefullyShutdown(false);
  service=await start();const other=await new Client(service.url).joinOrCreate('foundation_transport',{schoolId:'ntu',mode:'dev'});
  const restored=new WorldClientState();const schoolFog:string[]=[];other.onMessage('*',()=>{});
  other.onMessage('world_manifest',m=>restored.reset(m.format));other.onMessage('world_chunk',m=>restored.chunk(m));
  other.onMessage('world_delta',m=>restored.delta(m));other.onMessage('fog_chunk',m=>schoolFog.push(m.schoolId));other.onMessage('fog_batch',m=>schoolFog.push(m.schoolId));
  // Request explicit resync as well as initial join, checking the maintainable recovery path.
  other.send('world_resync');await wait(250);
  for(let x=111;x<131;x++)assert.equal(restored.masks[100000+x],1,'New client sees restored knowledge');
  assert.equal(authority!.world!.knowledge.get(100120)![0].lastStudiedAt,timestamp);
  assert(schoolFog.every(s=>s==='ntu'));assert(!authority!.world!.isRevealed('ntu',100120));
  await other.leave();await service.server.gracefullyShutdown(false);
  console.log(`Real WebSocket acceptance passed: 20 validated tile actions, ${deltaCount} delta frames, server lifecycle restart with memory repository, timestamp restore, new-client resync, isolated fog. PostgreSQL is not exercised.`);
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
