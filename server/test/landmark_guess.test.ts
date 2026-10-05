import * as assert from "assert";
import { CampusRoom, normalizeAnswer } from "../src/rooms/CampusRoom";
import { GameState, LandmarkState, PlayerState } from "../src/schema/GameState";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";

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
  console.log("=== Testing Landmark Guessing & Vietnamese Normalization ===");

  // ----------------------------------------------------
  // TEST 1: Vietnamese Normalization Function
  // ----------------------------------------------------
  console.log("\n[Test 1] Vietnamese Normalization (accents, spaces, đ/Đ -> d, lowercase, trim)");
  {
    // Accented vs Unaccented
    assert.strictEqual(
      normalizeAnswer("Đỉnh Fansipan"),
      "dinh fansipan",
      "Should remove accents and convert Đ to d"
    );
    assert.strictEqual(
      normalizeAnswer("dinh fansipan"),
      "dinh fansipan",
      "Unaccented should remain lowercase without changes"
    );
    assert.strictEqual(
      normalizeAnswer("Đỉnh Fansipan"),
      normalizeAnswer("dinh fansipan"),
      "Accented and unaccented must match"
    );

    // Uppercase with accents
    assert.strictEqual(
      normalizeAnswer("ĐỈNH FANSIPAN"),
      "dinh fansipan",
      "Uppercase accented should normalize correctly"
    );

    // Extra whitespace & tabs
    assert.strictEqual(
      normalizeAnswer("   Đỉnh     Fansipan   "),
      "dinh fansipan",
      "Extra spaces and trims must be collapsed"
    );

    // Vietnamese đ / Đ characters
    assert.strictEqual(normalizeAnswer("Núi Bà Đen"), "nui ba den");
    assert.strictEqual(normalizeAnswer("nui ba den"), "nui ba den");
    assert.strictEqual(normalizeAnswer("Động Phong Nha"), "dong phong nha");
    assert.strictEqual(normalizeAnswer("Đồng Đăng"), "dong dang");
    assert.strictEqual(normalizeAnswer("Hoàng thành Thăng Long"), "hoang thanh thang long");
    assert.strictEqual(normalizeAnswer("Kinh Thành Huế"), "kinh thanh hue");
    assert.strictEqual(normalizeAnswer("Toà nhà Bitexco"), "toa nha bitexco");
    assert.strictEqual(normalizeAnswer("Chợ nổi Cái Răng"), "cho noi cai rang");
    assert.strictEqual(normalizeAnswer("Vịnh Hạ Long"), "vinh ha long");
    assert.strictEqual(normalizeAnswer("Núi Ngũ Hành Sơn"), "nui ngu hanh son");

    // Empty & null edge cases
    assert.strictEqual(normalizeAnswer(""), "");
    assert.strictEqual(normalizeAnswer((null as any)), "");
    assert.strictEqual(normalizeAnswer((undefined as any)), "");

    console.log("✅ Test 1 Passed: Normalization handles accents, đ/Đ, spaces, casing flawlessly!");
  }

  // ----------------------------------------------------
  // TEST 2: Landmark Guessing: School A +100 crystals, School B +100 crystals
  // ----------------------------------------------------
  console.log("\n[Test 2] Multi-school Guessing (School A and School B both receive +100 crystals)");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const clientA1 = new MockClient("session_hcmut_1");
    const clientB1 = new MockClient("session_dtu_1");

    room.onJoin(clientA1 as any, { email: "sv1@hcmut.edu.vn", schoolId: "hcmut" });
    room.onJoin(clientB1 as any, { email: "sv1@dtu.edu.vn", schoolId: "dtu" });

    // Pick first landmark (fansipan)
    const lm = Array.from(room.state.landmarks.values())[0];
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    assert.ok(lm, "Landmark must exist");
    assert.strictEqual(lm.guessedSchools.size, 0, "Initially no schools have guessed");

    // School A (HCMUT) student 1 guesses with accents and extra whitespace
    clientA1.clear();
    room.handleGuessLandmark(clientA1 as any, {
      landmarkId: lm.id,
      guess: `   ${config.name}   `
    });

    const resultA = clientA1.lastMessage("landmark_guess_result");
    assert.ok(resultA, "Must receive landmark_guess_result");
    assert.strictEqual(resultA.payload.success, true);
    assert.strictEqual(resultA.payload.crystalsAwarded, 100);
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 100, "HCMUT must receive +100 crystals");
    assert.strictEqual(lm.guessedSchools.get("hcmut"), true, "HCMUT must be marked in guessedSchools");
    assert.strictEqual(lm.nameGuessed, true, "nameGuessed must be true for backward compatibility");
    assert.strictEqual(lm.guessedBySchoolId, "hcmut", "guessedBySchoolId must be hcmut");

    // School B (DTU) is NOT locked out! Student 1 from DTU guesses unaccented lowercase
    clientB1.clear();
    room.handleGuessLandmark(clientB1 as any, {
      landmarkId: lm.id,
      guess: normalizeAnswer(config.name)
    });

    const resultB = clientB1.lastMessage("landmark_guess_result");
    assert.ok(resultB, "School B must be able to guess even after School A guessed");
    assert.strictEqual(resultB.payload.success, true);
    assert.strictEqual(resultB.payload.crystalsAwarded, 100);
    assert.strictEqual(lm.crystalsBySchool.get("dtu"), 100, "DTU must receive +100 crystals");
    assert.strictEqual(lm.guessedSchools.get("dtu"), true, "DTU must be marked in guessedSchools");

    room.onDispose();
    console.log("✅ Test 2 Passed: School A and School B both independently guess and receive +100 crystals!");
  }

  // ----------------------------------------------------
  // TEST 3: Same School Cannot Receive Reward Twice
  // ----------------------------------------------------
  console.log("\n[Test 3] Same School Cannot Guess Twice (Prevention of double reward)");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const clientA1 = new MockClient("session_hcmut_1");
    const clientA2 = new MockClient("session_hcmut_2");

    room.onJoin(clientA1 as any, { email: "sv1@hcmut.edu.vn", schoolId: "hcmut" });
    room.onJoin(clientA2 as any, { email: "sv2@hcmut.edu.vn", schoolId: "hcmut" });

    const lm = Array.from(room.state.landmarks.values())[0];
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];

    // Student A1 guesses correctly
    room.handleGuessLandmark(clientA1 as any, {
      landmarkId: lm.id,
      guess: config.name
    });
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 100);

    // Student A1 tries again -> rejected
    clientA1.clear();
    room.handleGuessLandmark(clientA1 as any, {
      landmarkId: lm.id,
      guess: config.name
    });
    const errA1 = clientA1.lastMessage("error");
    assert.ok(errA1, "Same student must be rejected");
    assert.ok(errA1.payload.message.includes("đã giải đố thành công"));
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 100, "Crystals must NOT increase on repeat guess");

    // Student A2 from SAME school tries to guess -> also rejected
    clientA2.clear();
    room.handleGuessLandmark(clientA2 as any, {
      landmarkId: lm.id,
      guess: config.name
    });
    const errA2 = clientA2.lastMessage("error");
    assert.ok(errA2, "Different student from same school must be rejected");
    assert.ok(errA2.payload.message.includes("đã giải đố thành công"));
    assert.strictEqual(lm.crystalsBySchool.get("hcmut"), 100, "Crystals must NOT increase from same school");

    room.onDispose();
    console.log("✅ Test 3 Passed: Same school cannot guess or receive rewards twice!");
  }

  // ----------------------------------------------------
  // TEST 4: Cooldown 10 Minutes per Student on Wrong Guess
  // ----------------------------------------------------
  console.log("\n[Test 4] Cooldown 10 Minutes per Student on Wrong Guess");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const clientC1 = new MockClient("session_hcmcou_1");
    const clientC2 = new MockClient("session_hcmcou_2");

    room.onJoin(clientC1 as any, { email: "sv1@ou.edu.vn", schoolId: "hcmcou" });
    room.onJoin(clientC2 as any, { email: "sv2@ou.edu.vn", schoolId: "hcmcou" });

    const playerC1 = room.state.players.get("session_hcmcou_1")!;
    const playerC2 = room.state.players.get("session_hcmcou_2")!;

    const lm = Array.from(room.state.landmarks.values())[0];
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];

    // Student C1 guesses incorrectly
    clientC1.clear();
    room.handleGuessLandmark(clientC1 as any, {
      landmarkId: lm.id,
      guess: "Đáp án hoàn toàn sai"
    });

    const wrongErr = clientC1.lastMessage("error");
    assert.ok(wrongErr, "Must return error on incorrect guess");
    assert.ok(wrongErr.payload.message.includes("chưa chính xác"));
    assert.strictEqual(wrongErr.payload.cooldownSeconds, 600);

    const resultC1 = clientC1.lastMessage("landmark_guess_result");
    assert.ok(resultC1, "Must receive landmark_guess_result with success: false");
    assert.strictEqual(resultC1.payload.success, false);

    // Verify 10 min cooldown is set on student C1
    const cd = playerC1.guessCooldowns.get(lm.id) || 0;
    assert.ok(cd > Date.now(), "Cooldown must be set in future");
    assert.ok(cd <= Date.now() + 600000, "Cooldown must not exceed 10 minutes");

    // Student C1 tries again immediately -> rejected by cooldown
    clientC1.clear();
    room.handleGuessLandmark(clientC1 as any, {
      landmarkId: lm.id,
      guess: config.name
    });
    const cdErr = clientC1.lastMessage("error");
    assert.ok(cdErr, "Student in cooldown must be rejected");
    assert.ok(cdErr.payload.message.includes("thời gian chờ"));

    // Student C2 from SAME school does NOT have cooldown and CAN guess!
    clientC2.clear();
    assert.strictEqual(playerC2.guessCooldowns.get(lm.id) || 0, 0, "Student C2 must not have cooldown");
    room.handleGuessLandmark(clientC2 as any, {
      landmarkId: lm.id,
      guess: config.name
    });
    const successC2 = clientC2.lastMessage("landmark_guess_result");
    assert.ok(successC2, "Student C2 should succeed");
    assert.strictEqual(successC2.payload.success, true);
    assert.strictEqual(lm.crystalsBySchool.get("hcmcou"), 100, "HCMCOU received +100 crystals via Student C2");

    room.onDispose();
    console.log("✅ Test 4 Passed: Cooldown of 10 minutes is strictly per-student!");
  }

  // ----------------------------------------------------
  // TEST 5: No Requirement of Path to Landmark
  // ----------------------------------------------------
  console.log("\n[Test 5] Landmark Guessing Does NOT Require Path to Landmark");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const clientD = new MockClient("session_dhhp_1");
    room.onJoin(clientD as any, { email: "sv1@dhhp.edu.vn", schoolId: "dhhp" });

    const lm = Array.from(room.state.landmarks.values())[0];
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];

    // Verify DHHP has NO path to landmark
    assert.strictEqual(
      room.hasPathToLandmark("dhhp", lm),
      false,
      "DHHP has no path to this landmark initially"
    );

    // Guessing should succeed regardless of path
    clientD.clear();
    room.handleGuessLandmark(clientD as any, {
      landmarkId: lm.id,
      guess: config.name
    });

    const resultD = clientD.lastMessage("landmark_guess_result");
    assert.ok(resultD, "Must receive guess result");
    assert.strictEqual(resultD.payload.success, true, "Guessing must succeed without path");
    assert.strictEqual(lm.crystalsBySchool.get("dhhp"), 100);

    room.onDispose();
    console.log("✅ Test 5 Passed: No path requirement for guessing landmark!");
  }

  console.log("\n=== ALL LANDMARK GUESSING & NORMALIZATION TESTS PASSED 100%! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
