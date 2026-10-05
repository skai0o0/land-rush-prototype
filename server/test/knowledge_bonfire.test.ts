process.env.ALLOW_DEV = "true";
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

    // Ensure test coordinates are not reserved by random landmark footprints
    ["500,500", "500,501", "500,502"].forEach((k) => (room as any).landmarkTileMap.delete(k));
    if (room.state.claimedTiles.has("500,501")) room.state.claimedTiles.delete("500,501");

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

  console.log("\n[Test 2] Knowledge Overlap & studyTile mechanics (Shared Zone)");
  {
    const tFriendly = room.state.claimedTiles.get("500,500")!;
    tFriendly.retention = 60;
    const oldStudiedAt = tFriendly.lastStudiedAt;

    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 500, y: 500, points: 2 });
    assert.strictEqual(tFriendly.retention, 90, "Retention should increase by 2 * 15 = 30");
    assert.ok(tFriendly.lastStudiedAt >= oldStudiedAt, "lastStudiedAt should update");

    const tOverlap = room.state.claimedTiles.get("500,502")!;
    tOverlap.retention = 50;

    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 500, y: 502, points: 2 });
    assert.strictEqual(tOverlap.isShared, true, "Tile must become shared zone");
    assert.strictEqual(tOverlap.sharedWithSchoolId, "hcmut", "Must be shared with HCMUT");
    assert.ok(tOverlap.sharedExpiresAt > Date.now(), "Shared zone expiration must be set");

    clientB.clear();
    room.handleStudyAction(clientB as any, { x: 500, y: 502, points: 2 });
    assert.strictEqual(tOverlap.isShared, false, "Rebuffed shared zone");
    assert.strictEqual(tOverlap.sharedWithSchoolId, "", "Rebuffed shared zone");

    clientA.clear();
    room.handleStudyAction(clientA as any, { x: 999, y: 999, points: 1 });
    const nonAdjErr = clientA.lastMessage("error");
    assert.ok(nonAdjErr, "Non-adjacent study must be rejected");

    console.log("-> Test 2 Passed");
  }

  console.log("\n[Test 3] Decay Heartbeat Loop & Shared Zone Expiration");
  {
    const tB = new TileState();
    tB.x = 600; tB.y = 601; tB.ownerId = "dtu"; tB.retention = 20;
    tB.isShared = true;
    tB.sharedWithSchoolId = "hcmut";
    tB.sharedExpiresAt = Date.now() - 1000;
    room.state.claimedTiles.set("600,601", tB);
    room.landData.setOwner(600, 601, "dtu");

    room.processKnowledgeDecay();
    assert.strictEqual(tB.ownerId, "hcmut", "Expired shared zone must transfer to challenger");
    assert.strictEqual(tB.isShared, false, "Shared state must reset");
    assert.strictEqual(tB.retention, 60, "Newly transferred tile reset to 60 retention");

    console.log("-> Test 3 Passed");
  }

  console.log("\n[Test 4] Landmark Beacon & Crystal Contribution (Thắp sáng Đèn hiệu)");
  {
    const lm = Array.from(room.state.landmarks.values())[0];
    assert.ok(lm, "At least one landmark must exist");
    assert.strictEqual(lm.currentCrystals, 0);
    assert.strictEqual(lm.maxCrystals, 100);
    assert.strictEqual(lm.litBySchoolId, "");
    assert.strictEqual(lm.buffActive, false);

    // 4a. Crystal contribution fails if school has not reached the landmark
    clientA.clear();
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 50 });
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

    // 4c. Resource check: Player A has 10 crystals, contributes 40 -> 10 crystals used, 30 points deducted
    playerA.crystals = 10;
    const prevPoints = playerA.personalTroops;
    clientA.clear();
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 40 });
    assert.strictEqual(playerA.crystals, 0, "Crystals must be consumed first");
    assert.strictEqual(playerA.personalTroops, prevPoints - 30, "Remaining 30 deducted from points");
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 40, "Crystals for HCMUT must be 40");
    assert.strictEqual(lm.currentCrystals, 40, "Current crystals must be 40");
    assert.strictEqual(lm.buffActive, false, "Buff must not be active before reaching 100");
    assert.strictEqual(lm.litBySchoolId, "", "Beacon must not be lit before 100 crystals");

    // 4d. Reach maxCrystals (contribute 60 more -> total 100)
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 60 });
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 100);
    assert.strictEqual(lm.litBySchoolId, "hcmut", "HCMUT reached 100 crystals and lit the beacon!");
    assert.strictEqual(lm.buffActive, true, "Landmark buff must be active");
    assert.strictEqual(lm.ownerId, "hcmut", "Landmark owner set to lighting school");

    // 4e. Landmark buff effect verification in onLogicTick
    const initialTroops = room.state.schoolTroops.get("hcmut") || 0;
    (room as any).onLogicTick();
    const afterTickTroops = room.state.schoolTroops.get("hcmut") || 0;
    const bonus = config.troopBonus || 6;
    assert.ok(afterTickTroops >= initialTroops + bonus, "Lit landmark buff must grant troops/points in logic tick");

    // 4f. Overtake competition rule:
    // Another school (DTU) opens path to landmark
    const dtuAdjTile = new TileState();
    dtuAdjTile.x = lm.x + config.footprint.width;
    dtuAdjTile.y = lm.y;
    dtuAdjTile.ownerId = "dtu";
    dtuAdjTile.retention = 100;
    room.state.claimedTiles.set(`${dtuAdjTile.x},${dtuAdjTile.y}`, dtuAdjTile);

    assert.strictEqual(room.hasPathToLandmark("dtu", lm), true, "DTU now has path to landmark");

    // DTU contributes 110 crystals (< 100 + 20 = 120) -> MUST NOT OVERTAKE
    clientB.clear();
    room.handleContributeCrystalAction(clientB as any, { landmarkId: lm.id, crystals: 110 });
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), 110);
    assert.strictEqual(lm.litBySchoolId, "hcmut", "DTU cannot overtake without delta >= 20 crystals!");

    // DTU contributes 10 more crystals (total 120 >= 100 + 20) -> OVERTAKES BEACON!
    room.handleContributeCrystalAction(clientB as any, { landmarkId: lm.id, crystals: 10 });
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), 120);
    assert.strictEqual(lm.litBySchoolId, "dtu", "DTU overtakes beacon upon reaching delta >= 20 crystals!");
    assert.strictEqual(lm.ownerId, "dtu");
    assert.strictEqual(lm.buffActive, true);
    assert.strictEqual(lm.currentCrystals, 120);

    console.log("✅ Test 4 Passed: Landmark Beacon ignition, buffs, and delta >= 20 overtake work flawlessly!");
  }

  console.log("\n[Test 5] Landmark Guessing Mechanics (Giải đố Tên Công trình)");
  {
    const lm = Array.from(room.state.landmarks.values())[0];
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    assert.strictEqual(lm.nameGuessed, false);

    // 5a. Incorrect guess -> returns error and triggers 10 min cooldown
    clientA.clear();
    room.handleGuessLandmark(clientA as any, { landmarkId: lm.id, guess: "Tên Sai Hoàn Toàn" });
    const wrongErr = clientA.lastMessage("error");
    assert.ok(wrongErr, "Must return error on wrong guess");
    assert.ok(wrongErr?.payload.message.includes("chưa chính xác"), "Error must state wrong answer");
    const cd = playerA.guessCooldowns.get(lm.id) || 0;
    assert.ok(cd > Date.now(), "10 minute cooldown must be set on wrong guess");

    // 5b. Guessing again during cooldown -> rejected
    clientA.clear();
    room.handleGuessLandmark(clientA as any, { landmarkId: lm.id, guess: config.name });
    const cdErr = clientA.lastMessage("error");
    assert.ok(cdErr, "Must reject guess while cooldown active");
    assert.ok(cdErr?.payload.message.includes("thời gian chờ"), "Error must state cooldown waiting");

    // 5c. Clear cooldown and guess correctly
    playerA.guessCooldowns.delete(lm.id);
    const dtuCrystalsBefore = lm.crystalsBySchool.get("dtu") || 0;
    const hcmutCrystalsBefore = lm.crystalsBySchool.get("hcmut") || 0;

    clientA.clear();
    // Test case-insensitivity and trim
    room.handleGuessLandmark(clientA as any, { landmarkId: lm.id, guess: `  ${config.name.toUpperCase()}  ` });
    const guessResult = clientA.lastMessage("landmark_guess_result");
    assert.ok(guessResult, "Must receive landmark_guess_result");
    assert.strictEqual(guessResult.payload.success, true);
    assert.strictEqual(guessResult.payload.crystalsAwarded, 10);
    assert.strictEqual(lm.nameGuessed, true, "Landmark nameGuessed must be true");
    assert.strictEqual(lm.guessedBySchoolId, "hcmut");
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), hcmutCrystalsBefore + 10, "+10 bonus crystals awarded to school");

    // 5d. Subsequent guess when already guessed -> rejected
    clientA.clear();
    room.handleGuessLandmark(clientA as any, { landmarkId: lm.id, guess: config.name });
    const alreadyGuessedErr = clientA.lastMessage("error");
    assert.ok(alreadyGuessedErr?.payload.message.includes("đã giải đố"), "Must reject if already guessed");
 
    // 5e. Other school (DTU) CAN still guess and receive +10 crystals
    clientB.clear();
    room.handleGuessLandmark(clientB as any, { landmarkId: lm.id, guess: config.name });
    const guessResultB = clientB.lastMessage("landmark_guess_result");
    assert.ok(guessResultB, "Other school must be able to guess");
    assert.strictEqual(guessResultB.payload.success, true);
    assert.strictEqual(guessResultB.payload.crystalsAwarded, 10);
    assert.strictEqual(lm.guessedSchools.get("dtu"), true);
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), dtuCrystalsBefore + 10, "+10 bonus crystals awarded to DTU");

    console.log("✅ Test 5 Passed: Landmark guessing cooldowns, case-insensitive match, and rewards verified!");
  }

  console.log("\n[Test 6] Disabled fortify action and backward compatibility of contributeFuel message");
  {
    // Calling fortify / fortify_tile must return replaced mechanism error message
    clientA.clear();
    (room as any).handleFortifyAction(clientA, { x: 500, y: 500 }, "fortify");
    const fortifyErr = clientA.lastMessage("error");
    assert.ok(fortifyErr, "Fortify action must return error");
    assert.ok(
      fortifyErr?.payload.message.includes("Cơ chế gia cố đã được thay thế bằng cơ chế Giao lưu tri thức & Ôn bài!"),
      "Must inform user that fortify is replaced by study mechanics"
    );

    // Calling contributeFuel should route to handleContributeCrystalAction
    const lm = Array.from(room.state.landmarks.values())[0];
    const prevCrystals = lm.crystalsBySchool.get("hcmut") || 0;
    room.handleContributeFuelAction(clientA as any, { landmarkId: lm.id, points: 5 });
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), prevCrystals + 5, "contributeFuel must route to crystal contribution");
    console.log("✅ Test 6 Passed: fortify disabled with notice and contributeFuel backwards-compatibility preserved!");
  }

  room.onDispose();
  console.log("\n=== ALL KNOWLEDGE OVERLAP & BONFIRE TESTS PASSED SUCCESSFULLY! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test Failed with error:", err);
  process.exit(1);
});

