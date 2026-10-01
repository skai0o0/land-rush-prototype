import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { GameState, TileState, PlayerState } from "../src/schema/GameState";
import { SCHOOL_IDS } from "../../shared/constants/schools";
import { LANDMARK_IDS, LANDMARK_ROSTER } from "../../shared/constants/landmarks";

// Helper mock client
class MockClient {
  public sessionId: string;
  public messages: { type: string; payload: any }[] = [];

  constructor(id: string) {
    this.sessionId = id;
  }

  send(type: string, payload?: any) {
    this.messages.push({ type, payload });
  }

  lastMessage(type?: string) {
    if (!type) return this.messages[this.messages.length - 1];
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) return this.messages[i];
    }
    return undefined;
  }

  clear() {
    this.messages = [];
  }
}

async function runTests() {
  console.log("=== Testing Knowledge Overlap, Decay, and Landmark Bonfire ===");

  // Setup room
  const room = new CampusRoom();
  room.onCreate({});

  // Setup 2 mock players: SV Bách Khoa (hcmut) and SV Duy Tân (dtu)
  const clientA = new MockClient("session_hcmut");
  const clientB = new MockClient("session_dtu");

  room.onJoin(clientA as any, { email: "sv1@hcmut.edu.vn", schoolId: "hcmut", points: 1000 });
  room.onJoin(clientB as any, { email: "sv2@dtu.edu.vn", schoolId: "dtu", points: 1000 });

  const playerA = room.state.players.get("session_hcmut")!;
  const playerB = room.state.players.get("session_dtu")!;
  assert.strictEqual(playerA.schoolId, "hcmut");
  assert.strictEqual(playerB.schoolId, "dtu");

  // Get HQ of HCMUT
  const hqA = room.state.hqs.get("hcmut")!;
  assert.ok(hqA, "HCMUT HQ must exist");

  console.log("\n[Test 1] Wild tile claim vs Direct attack removal");
  {
    // Find a wild tile adjacent to HQ A
    const hqTile = room.state.claimedTiles.get(`${hqA.x},${hqA.y}`)!;
    assert.strictEqual(hqTile.ownerId, "hcmut");
    assert.strictEqual(hqTile.retention, 100);

    // Let's create adjacent setup for test:
    // (500, 500) owned by hcmut
    // (500, 501) wild tile
    const tFriendly = new TileState();
    tFriendly.x = 500;
    tFriendly.y = 500;
    tFriendly.ownerId = "hcmut";
    tFriendly.retention = 100;
    tFriendly.lastStudiedAt = Date.now();
    room.state.claimedTiles.set("500,500", tFriendly);
    room.landData.setOwner(500, 500, "hcmut");

    // Client A claims adjacent wild tile (500, 501)
    clientA.clear();
    (room as any).handleClaimAction(clientA, { x: 500, y: 501 }, "claim");
    const claimedWild = room.state.claimedTiles.get("500,501");
    assert.ok(claimedWild, "Adjacent wild tile must be claimed");
    assert.strictEqual(claimedWild.ownerId, "hcmut");
    assert.strictEqual(claimedWild.retention, 100);
    assert.strictEqual(claimedWild.studyCountBySchool.get("hcmut"), 1);

    // Now set up an enemy tile owned by DTU at (500, 502) adjacent to (500, 501)
    const tEnemy = new TileState();
    tEnemy.x = 500;
    tEnemy.y = 502;
    tEnemy.ownerId = "dtu";
    tEnemy.retention = 100;
    tEnemy.hp = 100;
    tEnemy.lastStudiedAt = Date.now();
    room.state.claimedTiles.set("500,502", tEnemy);
    room.landData.setOwner(500, 502, "dtu");

    // Old behavior: claim deals HP damage.
    // New Requirement 1: Direct attack is REMOVED! Must return error guiding to studyTile.
    clientA.clear();
    (room as any).handleClaimAction(clientA, { x: 500, y: 502 }, "claim");
    const err = clientA.lastMessage("error");
    assert.ok(err, "Must send error rejecting direct attack on owned tile");
    assert.ok(err?.payload.message.includes("Không thể tấn công trực tiếp"), "Error message must guide to studyTile");
    assert.strictEqual(tEnemy.ownerId, "dtu", "Owner must not change via direct claim");
    assert.strictEqual(tEnemy.retention, 100, "Retention must not be damaged via claim");
    console.log("✅ Test 1 Passed: Wild tiles claimable, direct attack removed!");
  }

  console.log("\n[Test 2] Knowledge Overlap & studyTile mechanics");
  {
    // 2a. Friendly tile study
    const tFriendly = room.state.claimedTiles.get("500,500")!;
    tFriendly.retention = 60;
    const oldStudiedAt = tFriendly.lastStudiedAt;

    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 500, y: 500, points: 2 });
    assert.strictEqual(tFriendly.retention, 90, "Retention should increase by 2 * 15 = 30");
    assert.ok(tFriendly.lastStudiedAt >= oldStudiedAt, "lastStudiedAt should update");
    assert.ok((tFriendly.studyCountBySchool.get("hcmut") || 0) >= 2, "studyCountBySchool should track study points");

    // 2b. Overlap tile study (DTU tile at 500, 502 adjacent to HCMUT at 500, 501)
    const tOverlap = room.state.claimedTiles.get("500,502")!;
    tOverlap.retention = 50;

    // Student A (HCMUT) studies at overlap tile (500, 502)
    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 500, y: 502, points: 2 });
    assert.strictEqual(tOverlap.studyCountBySchool.get("hcmut"), 2, "Challenger school study points recorded");
    assert.strictEqual(tOverlap.retention, 30, "Challenged neglected retention reduced by 2 * 10 = 20");

    // 2c. Continuous study to 0 retention triggers knowledge transfer
    room.handleStudyAction(clientA as any, { x: 500, y: 502, points: 3 });
    assert.strictEqual(tOverlap.ownerId, "hcmut", "Ownership must transfer to HCMUT when retention <= 0");
    assert.strictEqual(tOverlap.retention, 60, "Transferred tile receives initial 60 retention");

    // 2d. Non-adjacent study rejected
    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 999, y: 999, points: 1 });
    const nonAdjErr = clientA.lastMessage("error");
    assert.ok(nonAdjErr, "Non-adjacent study must be rejected");

    console.log("✅ Test 2 Passed: Friendly study and overlap study contest work perfectly!");
  }

  console.log("\n[Test 3] Decay Heartbeat Loop (Quên bài do bỏ bê)");
  {
    // Setup an overlap tile:
    // (600, 600) owned by hcmut
    // (600, 601) owned by dtu (adjacent!)
    const tA = new TileState();
    tA.x = 600; tA.y = 600; tA.ownerId = "hcmut"; tA.retention = 100; tA.lastStudiedAt = Date.now();
    room.state.claimedTiles.set("600,600", tA);
    room.landData.setOwner(600, 600, "hcmut");

    const tB = new TileState();
    tB.x = 600; tB.y = 601; tB.ownerId = "dtu"; tB.retention = 20;
    // Simulate neglected for 60 seconds (> 30s threshold)
    tB.lastStudiedAt = Date.now() - 60000;
    // DTU hasn't studied, but HCMUT studied this border
    tB.studyCountBySchool.set("hcmut", 5);
    room.state.claimedTiles.set("600,601", tB);
    room.landData.setOwner(600, 601, "dtu");

    // Run knowledge decay
    room.processKnowledgeDecay();
    assert.strictEqual(tB.retention, 10, "Neglected tile should decay by 10");

    // Run again -> retention drops to 0 -> transfer to HCMUT (chăm hơn)
    room.processKnowledgeDecay();
    assert.strictEqual(tB.ownerId, "hcmut", "Neglected tile with retention <= 0 must transfer to diligent neighbor");
    assert.strictEqual(tB.retention, 60, "Newly transferred tile reset to 60 retention");

    // Isolated tile (not overlap, e.g. 700, 700 without enemy neighbor)
    const tIsolated = new TileState();
    tIsolated.x = 700; tIsolated.y = 700; tIsolated.ownerId = "dtu"; tIsolated.retention = 80;
    tIsolated.lastStudiedAt = Date.now() - 60000;
    room.state.claimedTiles.set("700,700", tIsolated);

    room.processKnowledgeDecay();
    assert.strictEqual(tIsolated.retention, 80, "Isolated tile inside territory should NOT decay");

    console.log("✅ Test 3 Passed: Knowledge decay loop decays only neglected overlap tiles and transfers properly!");
  }

  console.log("\n[Test 4] Landmark Bonfire & Fuel Contribution (Thắp lửa Công trình)");
  {
    const lm = Array.from(room.state.landmarks.values())[0];
    assert.ok(lm, "At least one landmark must exist");
    assert.strictEqual(lm.currentFuel, 0);
    assert.strictEqual(lm.maxFuel, 500);
    assert.strictEqual(lm.litBySchoolId, "");
    assert.strictEqual(lm.buffActive, false);

    // 4a. Fuel contribution fails if school has not reached the landmark
    clientA.clear();
    room.handleContributeFuelAction(clientA as any, { landmarkId: lm.id, points: 50 });
    const pathErr = clientA.lastMessage("error");
    assert.ok(pathErr?.payload.message.includes("chưa mở đường"), "Must require path to landmark");

    // 4b. Open path: Claim an adjacent tile to the landmark footprint
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    const adjX = lm.x - 1;
    const adjY = lm.y;
    const pathTile = new TileState();
    pathTile.x = adjX; pathTile.y = adjY; pathTile.ownerId = "hcmut"; pathTile.retention = 100;
    room.state.claimedTiles.set(`${adjX},${adjY}`, pathTile);

    assert.strictEqual(room.hasPathToLandmark("hcmut", lm), true, "School HCMUT now has path to landmark");

    // 4c. Contribute partial fuel (200)
    clientA.clear();
    room.handleContributeFuelAction(clientA as any, { landmarkId: lm.id, points: 200 });
    assert.strictEqual(lm.fuelBySchool.get("hcmut"), 200, "Fuel for HCMUT must be 200");
    assert.strictEqual(lm.currentFuel, 200, "Current fuel must be 200");
    assert.strictEqual(lm.buffActive, false, "Buff must not be active before reaching 500");
    assert.strictEqual(lm.litBySchoolId, "", "Bonfire must not be lit before 500");

    // 4d. Reach maxFuel (contribute 300 more -> total 500)
    room.handleContributeFuelAction(clientA as any, { landmarkId: lm.id, points: 300 });
    assert.strictEqual(lm.fuelBySchool.get("hcmut"), 500);
    assert.strictEqual(lm.litBySchoolId, "hcmut", "HCMUT reached 500 fuel and lit the bonfire!");
    assert.strictEqual(lm.buffActive, true, "Landmark buff must be active");
    assert.strictEqual(lm.ownerId, "hcmut", "Landmark owner set to lighting school");

    // 4e. Landmark buff effect verification in onLogicTick
    const initialTroops = room.state.schoolTroops.get("hcmut") || 0;
    (room as any).onLogicTick();
    const afterTickTroops = room.state.schoolTroops.get("hcmut") || 0;
    const bonus = config.troopBonus || 6;
    assert.ok(afterTickTroops >= initialTroops + bonus, "Lit landmark buff must grant troops/points in logic tick");

    // 4f. Another school (DTU) opens path and overtakes the bonfire
    const dtuAdjTile = new TileState();
    dtuAdjTile.x = lm.x + config.footprint.width;
    dtuAdjTile.y = lm.y;
    dtuAdjTile.ownerId = "dtu";
    dtuAdjTile.retention = 100;
    room.state.claimedTiles.set(`${dtuAdjTile.x},${dtuAdjTile.y}`, dtuAdjTile);

    assert.strictEqual(room.hasPathToLandmark("dtu", lm), true, "DTU now has path to landmark");

    // DTU contributes 520 fuel (> 500)
    clientB.clear();
    room.handleContributeFuelAction(clientB as any, { landmarkId: lm.id, points: 520 });
    assert.strictEqual(lm.litBySchoolId, "dtu", "DTU must overtake bonfire when surpassing current fuel");
    assert.strictEqual(lm.ownerId, "dtu");
    assert.strictEqual(lm.buffActive, true);
    assert.strictEqual(lm.currentFuel, 520);

    console.log("✅ Test 4 Passed: Landmark Bonfire ignition, buffs, and overtake mechanics work flawlessly!");
  }

  console.log("\n[Test 5] Backward compatibility of fortify message");
  {
    // Calling fortify_tile should route to studyTile
    const tFriendly = room.state.claimedTiles.get("500,500")!;
    tFriendly.retention = 70;
    clientA.clear();
    (room as any).handleFortifyAction(clientA, { x: 500, y: 500 }, "fortify");
    assert.ok(tFriendly.retention > 70, "Fortify action must route to study and boost retention");
    console.log("✅ Test 5 Passed: fortify backwards-compatibility preserved!");
  }

  room.onDispose();
  console.log("\n=== ALL KNOWLEDGE OVERLAP & BONFIRE TESTS PASSED SUCCESSFULLY! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test Failed with error:", err);
  process.exit(1);
});

