import assert from 'node:assert/strict';
import { CampusRoom } from '../src/rooms/CampusRoom';
import { PortalIdentity } from '../src/identity/PortalIdentityProvider';
import { ProfileManager } from '../src/profile/ProfileManager';
import { RunningPointsProvider } from '../src/profile/RunningPointsProvider';

async function run() {
  const previous = process.env.NODE_ENV;
  const room = new CampusRoom(); room.onCreate({});
  const points = new RunningPointsProvider();
  room.profileManager = new ProfileManager(points);
  room.runningPointsProvider = points;
  const client = (sessionId: string) => ({sessionId, messages: [] as any[], left: false,
    send(type: string, data: any) {this.messages.push({type,data});}, leave() {this.left=true;}});
  const a=client('a'), b=client('b'), replacement=client('a2');
  const identity = (gameUserId: string, schoolCode: string): PortalIdentity => ({
    gameUserId, portalUserId:'portal-'+gameUserId, studentId:'20270001', displayName:schoolCode,
    email:'same@example.test', schoolCode, campaignId:room.world.campaign.id
  });
  const ia=identity('11111111-1111-4111-8111-111111111111','hcmut');
  const ib=identity('22222222-2222-4222-8222-222222222222','dtu');
  process.env.NODE_ENV='production';
  try {
    room.identityProvider={verifyGameSession:async token=>token==='a'?ia:ib};
    const verifiedA=await room.onAuth(a as any,{sessionToken:'a'});
    const verifiedB=await room.onAuth(b as any,{sessionToken:'b'});
    room.onJoin(a as any,{schoolId:'dtu',points:999999},verifiedA);
    room.onJoin(b as any,{schoolId:'hcmut',points:999999},verifiedB);
    const pa=room.profileManager.getProfile(ia.gameUserId)!;
    const pb=room.profileManager.getProfile(ib.gameUserId)!;
    assert.notEqual(pa,pb); assert.equal(pa.studentId,pb.studentId);
    assert.equal(pa.schoolId,'hcmut'); assert.equal(pb.schoolId,'dtu');
    assert.equal(room.profileManager.getProfile(ia.studentId),undefined);
    assert.equal(room.profileManager.getProfile(ia.portalUserId),undefined);
    assert.equal(room.profileManager.getProfile(ia.email!),undefined);
    assert(!a.left && !b.left); assert.equal((room as any).activeStudentSessions.size,2);
    assert.equal(room.profileManager.getAvailablePoints(ia.gameUserId),0,'Client points ignored');
    room.profileManager.addGamePoints(ia.gameUserId,7);
    assert.equal(room.profileManager.getAvailablePoints(ib.gameUserId),0);
    pa.crystals=10; pb.crystals=20;
    (room as any).hasPathToLandmark=()=>true;
    const landmark=Array.from(room.state.landmarks.values())[0]; assert(landmark);
    room.handleContributeCrystalAction(a as any,{landmarkId:landmark.id,crystals:3});
    assert.equal(pa.crystals,7); assert.equal(pb.crystals,20);
    room.handleContributeCrystalAction(b as any,{landmarkId:landmark.id,crystals:5});
    assert.equal(pa.crystals,7); assert.equal(pb.crystals,15);
    (room as any).syncProfile(a,ia.gameUserId);
    const sync=a.messages.filter(m=>m.type==='profile_sync').pop().data;
    assert.equal(sync.gameUserId,ia.gameUserId); assert.equal(sync.studentId,ia.studentId);
    room.onJoin(replacement as any,{}, {...ia,studentId:'updated-metadata'});
    assert(a.left); assert(!b.left);
    assert.equal(room.profileManager.getProfile(ia.gameUserId),pa);
    assert.equal(pa.studentId,'updated-metadata');
    (room as any).cleanupClient(a);
    assert.equal((room as any).activeStudentSessions.get(ia.gameUserId).sessionId,'a2');
    assert.equal((room as any).activeStudentSessions.get(ib.gameUserId).sessionId,'b');
    (room as any).cleanupClient(b); (room as any).cleanupClient(replacement);
    assert.equal((room as any).activeStudentSessions.size,0);
    console.log('Production identity passed: duplicate MSSV/email across schools, isolated profiles/actions/points, canonical resync and replacement-session cleanup.');
  } finally {
    if(previous===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previous;
    await room.onDispose();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
