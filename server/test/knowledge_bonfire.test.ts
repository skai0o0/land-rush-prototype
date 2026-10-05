import { studyKnowledge, retentionAt, pruneKnowledge, initializeKnowledge } from "../src/gameplay/knowledge";
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

  room.onJoin(clientA as any, { email: "sv1@hcmut.edu.vn", schoolId: "hcmut", points: 10000 });
  room.onJoin(clientB as any, { email: "sv2@dtu.edu.vn", schoolId: "dtu", points: 10000 });

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

    const before = playerA.personalTroops;
    room.handleClaimAction(clientA as any, { x: 500, y: 502 }, "claim");
    assert.strictEqual(playerA.personalTroops, before - 3, "Exchange costs 3 points");
    assert.ok(tEnemy.knowledge.has("hcmut") && tEnemy.knowledge.has("dtu"));
    assert.strictEqual(tEnemy.knowledge.get("dtu")!.retention, 100, "Exchange never damages existing knowledge");
    assert.strictEqual(tEnemy.sharedExpiresAt, 0, "No capture deadline");
    const dtuTimestamp = tEnemy.knowledge.get("dtu")!.lastStudiedAt;
    room.handleStudyAction(clientA as any, { x: 500, y: 502, points: 2 });
    assert.strictEqual(tEnemy.knowledge.get("dtu")!.lastStudiedAt, dtuTimestamp);
    room.handleStudyAction(clientB as any, { x: 500, y: 502, points: 2 });
    assert.ok(tEnemy.isShared, "Original school studying never ejects other schools");
    // The second school's presence supplies adjacency beyond a shared tile.
    room.landmarkTileMap.delete("501,502"); if (room.state.claimedTiles.has("501,502")) room.state.claimedTiles.delete("501,502");
    room.handleClaimAction(clientA as any, { x: 501, y: 502 });
    assert.ok(room.state.claimedTiles.get("501,502")!.knowledge.has("hcmut"));
    const pointsBeforeInvalid = playerA.personalTroops;
    room.handleStudyAction(clientA as any, { x: 999, y: 999 });
    assert.strictEqual(playerA.personalTroops, pointsBeforeInvalid);
    room.handleStudyAction(clientA as any, { x: 500, y: 502, points: Infinity });
    assert.strictEqual(playerA.personalTroops, pointsBeforeInvalid);
  }
  {
    const tile = new TileState(); tile.ownerId = "dtu";
    tile.lastStudiedAt = Date.now(); initializeKnowledge(tile, Date.now());
    const old = tile.knowledge.get("dtu")!;
    old.lastStudiedAt = Date.now() - 23 * 3600 * 1000;
    studyKnowledge(tile, "hcmut", 3, Date.now());
    assert.ok(!tile.knowledge.has("dtu") && tile.knowledge.has("hcmut"));
    assert.strictEqual(tile.ownerId, "hcmut");
    const a = tile.knowledge.get("hcmut")!;
    const now = a.lastStudiedAt;
    assert.strictEqual(retentionAt(a, now + 13 * 3600 * 1000), 90);
    pruneKnowledge(tile, now + 13 * 3600 * 1000);
    pruneKnowledge(tile, now + 13 * 3600 * 1000);
    assert.strictEqual(retentionAt(a, now + 13 * 3600 * 1000), 90, "Repeated lazy evaluation is idempotent");
    studyKnowledge(tile, "dtu", 3, now + 13 * 3600 * 1000);
    pruneKnowledge(tile, now + 23 * 3600 * 1000);
    assert.ok(!tile.knowledge.has("hcmut") && tile.knowledge.has("dtu"), "Decay is independent");
    studyKnowledge(tile, "hsu", 3, now + 23 * 3600 * 1000);
    assert.strictEqual(tile.knowledge.size, 2);
    pruneKnowledge(tile, now + 50 * 3600 * 1000);
    assert.strictEqual(tile.ownerId, "");
    assert.strictEqual(tile.knowledge.size, 0);
    initializeKnowledge(tile, now + 51 * 3600 * 1000);
    assert.strictEqual(tile.knowledge.size, 0, "Expired knowledge must not resurrect through migration");
  }

  console.log("\n[Test 4] Landmark Beacon & Crystal Contribution (Thắp sáng Đèn hiệu)");
  {
    const lm = Array.from(room.state.landmarks.values())[0];
    assert.ok(lm, "At least one landmark must exist");
    assert.strictEqual(lm.currentCrystals, 0);
    assert.strictEqual(lm.maxCrystals, 1000);
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

    // 4d. Reach 1000 crystals: contribute the remaining 960.
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 960 });
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 1000);
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

    // 1049 crystals is below the 1050 overtake target.
    clientB.clear();
    room.handleContributeCrystalAction(clientB as any, { landmarkId: lm.id, crystals: 1049 });
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), 1049);
    assert.strictEqual(lm.litBySchoolId, "hcmut", "DTU cannot overtake without 5% threshold crystals!");

    // One more crystal reaches exactly 1050 and activates the beacon.
    room.handleContributeCrystalAction(clientB as any, { landmarkId: lm.id, crystals: 1 });
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), 1050);
    assert.strictEqual(lm.litBySchoolId, "dtu", "DTU overtakes beacon upon reaching 5% threshold crystals!");
    assert.strictEqual(lm.ownerId, "dtu");
    assert.strictEqual(lm.buffActive, true);
    assert.strictEqual(lm.currentCrystals, 1050);
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 102 });
    assert.strictEqual(lm.litBySchoolId, "dtu", "1102 is below ceil(1050 * 1.05)");
    room.handleContributeCrystalAction(clientA as any, { landmarkId: lm.id, crystals: 1 });
    assert.strictEqual(lm.litBySchoolId, "hcmut", "1103 satisfies the rounded next overtake target");

    console.log("✅ Test 4 Passed: Landmark Beacon ignition, buffs, and 5% threshold overtake work flawlessly!");
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
    assert.strictEqual(guessResult.payload.crystalsAwarded, 100);
    assert.strictEqual(lm.nameGuessed, true, "Landmark nameGuessed must be true");
    assert.strictEqual(lm.guessedBySchoolId, "hcmut");
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), hcmutCrystalsBefore + 100, "+10 bonus crystals awarded to school");

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
    assert.strictEqual(guessResultB.payload.crystalsAwarded, Math.ceil(Math.ceil((hcmutCrystalsBefore + 100) * 105 / 100) / 10));
    assert.strictEqual(lm.guessedSchools.get("dtu"), true);
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), dtuCrystalsBefore + guessResultB.payload.crystalsAwarded, "+10 bonus crystals awarded to DTU");

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

