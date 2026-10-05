import assert from 'node:assert/strict';
import { SCHOOL_ROSTER, acquireSchoolRegistry, configureSchoolRegistry, getSchoolIdFromEmail } from '../../shared/constants/schools';
import { CampusRoom } from '../src/rooms/CampusRoom';
import { PostgresPlayerRepository } from '../src/profile/PlayerRepository';
import { PortalIdentity } from '../src/identity/PortalIdentityProvider';
async function run() {
  const schools = structuredClone(Object.values(SCHOOL_ROSTER));
  for (const code of ['huce','ntu','hcmiu']) {
    assert.equal(SCHOOL_ROSTER[code].emailDomain, '');
    assert.equal(getSchoolIdFromEmail('student@'+code+'.edu.vn'), null);
  }
  const a=acquireSchoolRegistry('campaign-a',schools), a2=acquireSchoolRegistry('campaign-a',schools);
  const before=JSON.stringify(SCHOOL_ROSTER);
  assert.throws(()=>acquireSchoolRegistry('campaign-b',schools),/One active/);
  assert.throws(()=>acquireSchoolRegistry('campaign-a',schools.map(s=>({...s,hq:{x:4,y:4}}))),/One active/);
  assert.throws(()=>configureSchoolRegistry(schools),/Cannot mutate/);
  a(); assert.throws(()=>acquireSchoolRegistry('campaign-b',schools),/One active/);
  assert.equal(JSON.stringify(SCHOOL_ROSTER),before); a2(); a2();
  const b=acquireSchoolRegistry('campaign-b',schools.map(s=>({...s,hq:{x:4,y:4}}))); b();
  assert.equal(JSON.stringify(SCHOOL_ROSTER),before,'Disposal restores previous registry; no stale campaign HQs');
  const repo=new PostgresPlayerRepository({query:async(sql:string,params:any[])=>{
    assert(sql.includes('join public.schools')); assert.deepEqual(params,['campaign-uuid','portal-id']);
    return {rows:[{id:'game-id',portal_user_id:'portal-id',student_id:'student-id',display_name:'Portal Name',school_id:'school-uuid',school_code:'hcmut',campaign_id:'campaign-uuid',status:'active'}]};
  }} as any);
  const record=await repo.findByPortalId('campaign-uuid','portal-id');
  assert.equal(record!.schoolCode,'hcmut'); assert.equal(record!.databaseSchoolId,'school-uuid'); assert.equal(record!.studentId,'student-id');
  const room=new CampusRoom(); room.onCreate({});
  const identity:PortalIdentity={gameUserId:'game-id',portalUserId:'portal-id',studentId:'student-id',displayName:'Portal Name',email:'student@dtu.edu.vn',schoolCode:'hcmut',campaignId:room.world.campaign.id};
  room.identityProvider={verifyGameSession:async()=>identity};
  process.env.NODE_ENV='production';
  try {
    assert.equal(await room.onAuth({} as any,{sessionToken:'fixture'}),identity);
    identity.campaignId='other'; await assert.rejects(room.onAuth({} as any,{sessionToken:'fixture'}),/campaign mismatch/);
    identity.campaignId=room.world.campaign.id; identity.schoolCode='school-uuid';
    await assert.rejects(room.onAuth({} as any,{sessionToken:'fixture'}),/not active/);
    identity.schoolCode='hcmut';
    const client={sessionId:'portal-fixture',send:()=>{}};
    room.onJoin(client as any,{schoolId:'dtu'},identity);
    const player=room.state.players.get(client.sessionId)!;
    assert.equal(player.schoolId,'hcmut'); assert.equal(player.displayName,'Portal Name'); assert(player.isLockedSchool);
    assert.equal((room as any).portalStudentIds.get(client.sessionId),'student-id');
    (room as any).cleanupClient(client); assert(!(room as any).activeStudentSessions.has('student-id'));
  } finally { delete process.env.NODE_ENV; await room.onDispose(); }
  console.log('Foundation polish passed: canonical identity, campaign mismatch, UUID mapping, dev domains, registry leases and rejected cross-campaign contamination.');
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
