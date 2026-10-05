process.env.ALLOW_DEV = "true";
import * as assert from "assert";
import { TileState } from "../src/schema/GameState";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { ProfileManager } from "../src/profile/ProfileManager";
import { RunningPointsProvider } from "../src/profile/RunningPointsProvider";
import { landmarkGuessReward, beaconOvertakeTarget } from "../../shared/constants/gameplay";
import { studyKnowledge } from "../src/gameplay/knowledge";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";

class ClientMock {
  messages: {type:string;data:any}[]=[];
  constructor(public sessionId:string) {}
  send(type:string,data:any) {this.messages.push({type,data});}
  last(type:string) {return this.messages.filter(m=>m.type===type).pop()?.data;}
}
const room=new CampusRoom();room.onCreate({});
try {
  const a=new ClientMock("editor_a"),b=new ClientMock("editor_b");
  room.onJoin(a as any,{email:"editor_a@hcmut.edu.vn",points:500});
  room.onJoin(b as any,{email:"editor_b@dtu.edu.vn",points:500});
  const manager=ProfileManager.getInstance(),provider=RunningPointsProvider.getInstance();
  const id="editor_a@hcmut.edu.vn",before=manager.getAvailablePoints(id),runningBefore=provider.getTotalPoints(id);
  for (const amount of [1,2,3,5]) manager.addGamePoints(id,amount);
  assert.strictEqual(manager.getAvailablePoints(id),before+11,"Small rewards remain exact");
  assert.strictEqual(provider.getTotalPoints(id),runningBefore,"Game loot must never count as running points");
  assert.ok(manager.deductPoints(id,11));assert.strictEqual(manager.getAvailablePoints(id),before);
  assert.strictEqual(manager.getOrCreateProfile(id).gamePointsEarned,11);
  assert.throws(()=>manager.addGamePoints(id,NaN));assert.throws(()=>manager.addGamePoints(id,-1));
  assert.strictEqual(landmarkGuessReward(1000),100);assert.strictEqual(landmarkGuessReward(1050),105);
  assert.strictEqual(landmarkGuessReward(beaconOvertakeTarget(1050)),111);

  // Deterministic layout independent of random campaign spawn positions.
  room.state.claimedTiles.clear();room.state.hqs.clear();room.state.landmarks.clear();room.state.unistops.clear();room.state.chests.clear();
  room.landmarkTileMap.clear();(room as any).initialHQTiles.clear();(room as any).initialLandmarkTiles.clear();
  room.handleUpdateMapLayout(a as any,{
    hqs:[{schoolId:"hcmut",x:100,y:100}],landmarks:[{id:"fansipan",landmarkKey:"fansipan",x:200,y:200}],
    unistops:[{id:"test_stop",x:300,z:300,tier:"aspire"}],chests:[{id:"test_chest",x:400,z:400,tier:"aspire"}]
  });
  assert.strictEqual(a.last("map_layout_ack").success,true);
  const lm=room.state.landmarks.get("fansipan")!,stop=room.state.unistops.get("test_stop")!,chest=room.state.chests.get("test_chest")!;
  const random=Math.random;
  const walletBefore=manager.getAvailablePoints(id);
  try {
    Math.random=()=>0; // Select the existing first entry: 1 point. Do not change tables.
    for (const [x,y] of [[300,300],[398,400]]) {
      const t=new TileState();t.x=x;t.y=y;studyKnowledge(t,"hcmut",1,Date.now());room.state.claimedTiles.set(`${x},${y}`,t);
    }
    room.handleRollUniStop(a as any,{stopId:stop.id});
    assert.strictEqual(a.last("unistop_rolled").winningItem.amount,1);
    assert.strictEqual(manager.getAvailablePoints(id),walletBefore+1);
    manager.addKeys(id,"aspire",1);room.state.players.get(a.sessionId)!.aspireKeys=1;
    room.handleOpenChest(a as any,{chestId:chest.id});
    assert.strictEqual(a.last("chest_opened").winningItem.amount,1);
    assert.strictEqual(manager.getAvailablePoints(id),walletBefore+2);
    assert.strictEqual(provider.getTotalPoints(id),runningBefore);
  } finally {Math.random=random;}
  assert.ok(room.landmarkTileMap.has("200,200"));assert.ok(room.tileHasKnowledge(room.state.claimedTiles.get("100,100"),"hcmut"));
  const personalCrystals=manager.getOrCreateProfile(id).crystals;
  room.handleGuessLandmark(a as any,{landmarkId:lm.id,guess:"  DINH FANSIPAN  "});
  assert.strictEqual(manager.getOrCreateProfile(id).crystals,personalCrystals,"School progress must not also mint spendable personal crystals");
  assert.strictEqual(a.last("landmark_guess_result").crystalsAwarded,100);
  room.handleGuessLandmark(a as any,{landmarkId:lm.id,guess:LANDMARK_ROSTER.fansipan.name});
  assert.strictEqual(lm.crystalsBySchool.get("hcmut"),100,"Reward is once per school");
  lm.litBySchoolId="hcmut";lm.ownerId="hcmut";lm.buffActive=true;lm.crystalsBySchool.set("hcmut",1000);
  room.handleGuessLandmark(b as any,{landmarkId:lm.id,guess:LANDMARK_ROSTER.fansipan.name});
  assert.strictEqual(b.last("landmark_guess_result").crystalsAwarded,105,"Later schools also receive 10% of their current target");
  const oldHQ=room.state.claimedTiles.get("100,100")!;studyKnowledge(oldHQ,"dtu",3,Date.now());
  manager.setUniStopCooldown(id,stop.id,Date.now()+600000);const cooldown=manager.getUniStopCooldown(id,stop.id);
  chest.isOpened=true;chest.openedBySchoolId="hcmut";
  const crystals=lm.crystalsBySchool.get("hcmut");const epoch=(room as any).landData.snapshot().epoch;
  room.handleUpdateMapLayout(a as any,{
    hqs:[{schoolId:"hcmut",x:600,y:100}],landmarks:[{id:"fansipan",x:250,y:200}],
    unistops:[{id:stop.id,x:310,z:300}],chests:[{id:chest.id,x:410,z:400,isOpened:false}]
  });
  assert.strictEqual(a.last("map_layout_ack").success,true);
  assert.ok(!room.landmarkTileMap.has("200,200") && room.landmarkTileMap.has("250,200"));
  assert.ok(!room.state.claimedTiles.has("200,200"),"Old landmark footprint disappears");
  assert.ok(!room.tileHasKnowledge(oldHQ,"hcmut") && room.tileHasKnowledge(oldHQ,"dtu"),"Moving HQ only removes its supplied foundations");
  assert.ok(room.tileHasKnowledge(room.state.claimedTiles.get("600,100"),"hcmut"));
  assert.strictEqual(lm.crystalsBySchool.get("hcmut"),crystals);assert.strictEqual(lm.guessedSchools.get("dtu"),true);
  assert.ok(chest.isOpened);assert.strictEqual(manager.getUniStopCooldown(id,stop.id),cooldown);
  assert.ok((room as any).landData.snapshot().epoch>epoch);
  const landmarkX=lm.x;
  room.handleUpdateMapLayout(a as any,{landmarks:[{id:lm.id,x:350,y:200}],hqs:[{schoolId:"hcmut",x:999,y:999}]});
  assert.strictEqual(a.last("map_layout_ack").success,false);assert.strictEqual(lm.x,landmarkX,"Invalid batch is atomic");
  room.handleUpdateMapLayout(a as any,{landmarks:[{id:lm.id,x:590,y:90}]});
  assert.strictEqual(a.last("map_layout_ack").success,false,"Overlapping footprints rejected");
  room.handleUpdateMapLayout(a as any,{landmarks:[{id:lm.id,x:80,y:80}]});
  assert.strictEqual(a.last("map_layout_ack").success,false,"Student knowledge cannot be overwritten");
  room.handleUpdateMapLayout(a as any,{chests:[{id:chest.id,x:NaN,z:400}]});
  assert.strictEqual(a.last("map_layout_ack").success,false);
  // Swapping reserved footprints is evaluated against the final layout.
  room.handleUpdateMapLayout(a as any,{unistops:[{id:stop.id,x:410,z:400}],chests:[{id:chest.id,x:310,z:300}]});
  assert.strictEqual(a.last("map_layout_ack").success,true);assert.ok(chest.isOpened);
  room.handleUpdateMapLayout(a as any,{landmarks:[{id:"duplicate_fansipan",landmarkKey:"fansipan",x:700,y:700}]});
  assert.strictEqual(a.last("map_layout_ack").success,false,"A campaign landmark cannot be duplicated");
  oldHQ.knowledge.get("dtu")!.lastStudiedAt=Date.now()-22*3600*1000;
  room.handleUpdateMapLayout(a as any,{landmarks:[{id:lm.id,x:80,y:80}]});
  assert.strictEqual(a.last("map_layout_ack").success,true,"Expired knowledge is evaluated lazily when validating a destination");
  console.log("✅ Exact rewards, per-school 10% puzzles, atomic editor relocation and lifecycle preservation passed");
} finally {room.onDispose();}
process.exit(0);
