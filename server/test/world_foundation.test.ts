import assert from 'node:assert/strict';
import { ChunkGrid, schoolBit, encodeMutations, decodeMutations } from '../../shared/world/binary';
import { WorldClientState } from '../../shared/world/WorldClientState';
import { SCHOOL_IDS, SCHOOL_ROSTER, configureSchoolRegistry } from '../../shared/constants/schools';
import { InMemoryWorldRepository, Campaign, WorldWrite } from '../src/world/WorldRepository';
import { WorldStore } from '../src/world/WorldStore';
import { CampusRoom } from '../src/rooms/CampusRoom';
import { KnowledgeState, TileState } from '../src/schema/GameState';
import { retentionAt } from '../src/gameplay/knowledge';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
  assert.equal(SCHOOL_IDS.length,8);
  assert.deepEqual(SCHOOL_IDS.map(id=>SCHOOL_ROSTER[id].knowledgeBit),[0,1,2,3,4,5,6,7]);
  assert.equal(schoolBit(15),32768);assert.throws(()=>schoolBit(16));
  const critical=['server/src/rooms/CampusRoom.ts','shared/constants/schools.ts','client/src/ui/statsOverlay.ts','client/src/network/colyseusClient.ts','client/src/ui/mapEditorPanel.ts'];
  for(const file of critical) {
    const source=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
    assert(!/SCHOOL_IDS\.slice\(0,\s*5\)|SCHOOL_IDS\.length\s*[!=]==?\s*5|school\w*\s*%\s*5/.test(source),`No fixed five-school capacity in ${file}`);
  }
  const original=structuredClone(Object.values(SCHOOL_ROSTER));
  configureSchoolRegistry([...original,...Array.from({length:8},(_,j)=>({id:`school${j+8}`,name:'Reserved test',shortName:'T',emailDomain:'',colorHex:'#ffffff',accentHex:'#fff',knowledgeBit:j+8,hq:null}))]);
  assert.equal(SCHOOL_IDS.length,16);assert.equal(SCHOOL_ROSTER.school15.knowledgeBit,15);
  const slotRepo=new InMemoryWorldRepository(),slotCampaign=await slotRepo.loadCampaign('slots'),slotWorld=new WorldStore(slotCampaign,slotRepo);
  slotWorld.syncTile(42,[{schoolId:'hcmut',strength:100,lastStudiedAt:1},{schoolId:'school15',strength:70,lastStudiedAt:2}]);
  assert.equal(slotWorld.masks[42],32769);await slotWorld.drain();
  const slotRestart=new WorldStore(slotCampaign,slotRepo);await slotRestart.restore();assert.equal(slotRestart.masks[42],32769);
  configureSchoolRegistry(original);
  const local=new CampusRoom();local.onCreate({});
  assert(!local.state.hqs.has('huce')&&!local.state.hqs.has('ntu')&&!local.state.hqs.has('hcmiu'),'New school HQs remain unassigned');
  process.env.NODE_ENV='production';
  await assert.rejects(local.onAuth({} as any,{schoolId:'hcmut',email:'spoof@hcmut.edu.vn'}),/token required/);
  await assert.rejects(local.onAuth({} as any,{sessionToken:'fake'}),/not configured/);
  assert.throws(()=>local.onJoin({sessionId:'spoof',send:()=>{}} as any,{schoolId:'hcmut'}),/Verified Portal/);
  delete process.env.NODE_ENV;await local.onDispose();
  assert.throws(()=>configureSchoolRegistry([{...original[0]}, {...original[1],knowledgeBit:0}]));
  const repo=new InMemoryWorldRepository(),campaign=await repo.loadCampaign('r2pl-2027'),world=new WorldStore(campaign,repo),grid=new ChunkGrid();
  const edge=grid.index(999,999);assert.deepEqual(grid.address(edge),{x:15,z:15,local:2535});
  assert.equal(Array.from(grid.cells(15,15)).length,1600);assert.throws(()=>grid.address(1_000_000));
  const now=Date.now(),entry=(schoolId:string,strength=100,lastStudiedAt=now)=>({schoolId,strength,lastStudiedAt});
  world.syncTile(edge,[entry('hcmut'),entry('hcmiu',70,now-1000)]);
  assert.equal(world.masks[edge],129);assert(world.isRevealed('hcmut',edge));assert(!world.isRevealed('ntu',edge));
  const encoded=grid.serialize(world.masks,15,15),target=new Uint16Array(1_000_000);
  grid.deserialize(encoded,target,15,15);assert.equal(target[edge],129);
  assert.throws(()=>grid.deserialize(encoded,target,15,15,2));assert.throws(()=>grid.deserialize(encoded.slice(1),target,15,15));
  const padded=encoded.slice();padded[8190]=1;assert.throws(()=>grid.deserialize(padded,target,15,15));
  const packets=world.networkDeltas();assert.equal(packets.length,1);
  assert.equal(decodeMutations(packets[0]).items[0].schoolMask,129);
  const client=new WorldClientState();assert.deepEqual(client.delta(packets[0]),[edge]);assert.equal(client.masks[edge],129);
  assert.equal(client.delta(packets[0]).length,0);
  const corrupt=packets[0].slice();corrupt[2]=2;assert.throws(()=>decodeMutations(corrupt));assert.throws(()=>decodeMutations(packets[0].slice(1)));
  assert.throws(()=>client.delta(encodeMutations([{tileIndex:edge,schoolMask:1,opcode:0}],15,15,5,4)),/resync/);
  assert.throws(()=>client.delta(encodeMutations([{tileIndex:1,schoolMask:1,opcode:0}],15,15,5)),/outside/);
  await world.drain();
  const restarted=new WorldStore(campaign,repo);await restarted.restore();
  assert.equal(restarted.masks[edge],129);assert.equal(restarted.knowledge.get(edge)![1].strength,70);assert.equal(restarted.knowledge.get(edge)![1].lastStudiedAt,now-1000);
  assert(restarted.isRevealed('hcmiu',edge));assert(!restarted.isRevealed('ntu',edge));
  const decayEntry=new KnowledgeState();decayEntry.retention=70;decayEntry.lastStudiedAt=restarted.knowledge.get(edge)![1].lastStudiedAt;
  assert.equal(retentionAt(decayEntry,decayEntry.lastStudiedAt+14*3600000),50);
  restarted.syncTile(edge,[entry('hcmut')]);await restarted.drain();
  const third=new WorldStore(campaign,repo);await third.restore();assert.equal(third.masks[edge],1);assert.equal(third.knowledge.get(edge)!.length,1);
  assert(third.isRevealed('hcmiu',edge),'Discovery survives forgetting');
  // Failure retains dirty state; retry writes exactly the current RAM state.
  class Flaky extends InMemoryWorldRepository { fail=true; async save(c:Campaign,b:WorldWrite){if(this.fail){this.fail=false;throw new Error('offline');}return super.save(c,b);} }
  const flaky=new Flaky(),fw=new WorldStore(campaign,flaky);fw.syncTile(2,[entry('hcmut')]);await assert.rejects(fw.flush(),/offline/);await fw.drain();
  const fr=new WorldStore(campaign,flaky);await fr.restore();assert.equal(fr.masks[2],1);
  // A mutation during SQL I/O must remain dirty after the older batch is acknowledged.
  class Slow extends InMemoryWorldRepository {
    release?:()=>void;
    async save(c:Campaign,b:WorldWrite) { await new Promise<void>(resolve=>this.release=resolve);await super.save(c,b); }
  }
  const slow=new Slow(),sw=new WorldStore(campaign,slow);sw.syncTile(3,[entry('hcmut')]);const first=sw.flush();
  sw.syncTile(3,[entry('dtu',80)]);slow.release!();await first;
  const second=sw.flush();slow.release!();await second;
  const sr=new WorldStore(campaign,slow);await sr.restore();assert.equal(sr.masks[3],4);assert.equal(sr.knowledge.get(3)![0].strength,80);
  // Real room startup + validated actions + repository flush + new room + second presentation cache.
  process.env.ALLOW_DEV='true';
  class ApprovedCampaign extends InMemoryWorldRepository {
    async loadCampaign(code:string) {const c=await super.loadCampaign(code);c.schools=c.schools.map(s=>({...s,hq:s.id==='hcmut'?{x:100,y:100}:null}));return c;}
  }
  const roomRepo=new ApprovedCampaign(),room=new CampusRoom();room.persistenceRepository=roomRepo;await room.onCreate({});
  class ClientMock { messages:{type:string;data:any}[]=[];sessionId='foundation_student';send(type:string,data:any){this.messages.push({type,data});} }
  const player=new ClientMock();room.onJoin(player as any,{schoolId:'hcmut',email:'foundation@hcmut.edu.vn',points:1000,mode:'dev'});
  const explored:number[]=[];
  for(let x=111;x<131;x++) {
    (room as any).handleClaimAction(player,{x,y:100,points:1});
    const i=100000+x;assert.equal(room.world!.masks[i],1,`Validated exploration ${x}`);explored.push(i);
  }
  const shared=room.state.claimedTiles.get('120,100')!;const k=new KnowledgeState();k.retention=80;k.lastStudiedAt=now-2000;shared.knowledge.set('dtu',k);
  (room as any).publishKnowledge(shared);await room.world!.drain();await room.onDispose();
  const room2=new CampusRoom();room2.persistenceRepository=roomRepo;await room2.onCreate({});
  for(const index of explored)assert(room2.world!.masks[index]&1);
  assert.equal(room2.state.claimedTiles.get('120,100')!.knowledge.get('dtu')!.lastStudiedAt,now-2000);
  const spectator=new ClientMock();spectator.sessionId='second_client';room2.onJoin(spectator as any,{schoolId:'ntu',mode:'dev'});
  const presentation=new WorldClientState();
  for(const m of spectator.messages)if(m.type==='world_manifest')presentation.reset(m.data.format);else if(m.type==='world_chunk')presentation.chunk(m.data);
  for(const index of explored)assert.equal(presentation.masks[index],room2.world!.masks[index]);
  assert(!spectator.messages.some(m=>m.type==='fog_chunk'&&m.data.schoolId!=='ntu'));
  assert.equal(room2.world!.isRevealed('ntu',100120),false);await room2.onDispose();
  configureSchoolRegistry(original);
  console.log('World foundation passed: 8/16 registry, masks, edge chunks, packet/version rejection, fog isolation, independent decay, failed/in-flight writes, 20-tile room restart and second-client restore.');
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
