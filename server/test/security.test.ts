import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { maskEmail, checkAdminKey, isSafeInteger, isSafeCoordinate, isValidSchoolId } from "../src/security/sanitizer";
import { RateLimiter } from "../src/security/rateLimiter";
import { PlayerState } from "../src/schema/GameState";

class MockClient {
  public sessionId: string;
  public messages: { type: string; payload: any }[] = [];
  public leftCode: number | null = null;
  public leftReason: string | null = null;

  constructor(id: string) {
    this.sessionId = id;
  }

  send(type: string, payload?: any) {
    this.messages.push({ type, payload });
  }

  leave(code?: number, data?: string) {
    this.leftCode = code ?? 1000;
    this.leftReason = data ?? "";
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

async function runSecurityTests() {
  console.log("=== Testing Security Hardening, Sanitizers, Dev Gate & Rate Limiting ===");

  // ========================================================
  // TEST 1: Input Sanitizers & Email Masking (VIỆC 1 & 3 & 5)
  // ========================================================
  console.log("\n[Test 1] Sanitizers, Admin Key & Email Masking");
  {
    // 1. maskEmail
    assert.strictEqual(maskEmail(""), "anonymous");
    assert.strictEqual(maskEmail(undefined), "anonymous");
    assert.strictEqual(maskEmail("   "), "anonymous");
    assert.strictEqual(maskEmail("a@hcmut.edu.vn"), "a***");
    assert.strictEqual(maskEmail("ab@ou.edu.vn"), "ab***");
    assert.strictEqual(maskEmail("abc@dtu.edu.vn"), "a***c");
    assert.strictEqual(maskEmail("abcd@dhhp.edu.vn"), "a***d");
    assert.strictEqual(maskEmail("abcde@hsu.edu.vn"), "ab***de");
    assert.strictEqual(maskEmail("sinhvien@hcmut.edu.vn"), "si***en");
    assert.strictEqual(maskEmail("nguyenvana@gmail.com"), "ng***na");

    // 2. checkAdminKey (Constant-time comparison)
    process.env.ADMIN_KEY = "super_secret_admin_key_2026";
    assert.strictEqual(checkAdminKey("super_secret_admin_key_2026"), true);
    assert.strictEqual(checkAdminKey("wrong_key"), false);
    assert.strictEqual(checkAdminKey(""), false);
    assert.strictEqual(checkAdminKey(undefined), false);
    assert.strictEqual(checkAdminKey("super_secret_admin_key_2027"), false);

    delete process.env.ADMIN_KEY;
    assert.strictEqual(checkAdminKey("super_secret_admin_key_2026"), false);

    // 3. isSafeInteger
    assert.strictEqual(isSafeInteger(10), true);
    assert.strictEqual(isSafeInteger(0), true);
    assert.strictEqual(isSafeInteger(-5, -10, 0), true);
    assert.strictEqual(isSafeInteger(10.5), false);
    assert.strictEqual(isSafeInteger(NaN), false);
    assert.strictEqual(isSafeInteger(Infinity), false);
    assert.strictEqual(isSafeInteger("10" as any), false);
    assert.strictEqual(isSafeInteger(5, 10, 20), false);

    // 4. isSafeCoordinate
    assert.strictEqual(isSafeCoordinate(0), true);
    assert.strictEqual(isSafeCoordinate(500), true);
    assert.strictEqual(isSafeCoordinate(1000), true);
    assert.strictEqual(isSafeCoordinate(-1), false);
    assert.strictEqual(isSafeCoordinate(1001), false);
    assert.strictEqual(isSafeCoordinate(NaN), false);

    // 5. isValidSchoolId
    assert.strictEqual(isValidSchoolId("hcmut"), true);
    assert.strictEqual(isValidSchoolId("hcmcou"), true);
    assert.strictEqual(isValidSchoolId("dtu"), true);
    assert.strictEqual(isValidSchoolId("dhhp"), true);
    assert.strictEqual(isValidSchoolId("hsu"), true);
    assert.strictEqual(isValidSchoolId("fake_school"), false);
    assert.strictEqual(isValidSchoolId(""), false);

    console.log("✅ Test 1 Passed: Input sanitizers, email masking & timingSafeEqual verified!");
  }

  // ========================================================
  // TEST 2: Environment Dev Switch (ALLOW_DEV=false) (VIỆC 2)
  // ========================================================
  console.log("\n[Test 2] Environment Dev Switch (ALLOW_DEV=false)");
  {
    process.env.ALLOW_DEV = "false";
    delete process.env.ADMIN_KEY;

    const room = new CampusRoom();
    room.onCreate({});

    // Client attempts to join with arbitrary starting points, crystals, keys, and dev mode
    const client = new MockClient("session_prod_user");
    room.onJoin(client as any, {
      email: "cheater@hcmut.edu.vn",
      schoolId: "hcmut",
      points: 99999,
      crystals: 500,
      aspireKeys: 10,
      nitroKeys: 10,
      predatorKeys: 10,
      mode: "dev"
    });

    const player = room.state.players.get("session_prod_user")!;
    assert.ok(player, "Player must exist in room");

    // All client-supplied cheats must be completely ignored
    assert.strictEqual(player.mode, "normal", "Mode must be forced to normal when ALLOW_DEV is disabled");
    assert.strictEqual(player.personalTroops, 0, "Points must be 0 when ALLOW_DEV is disabled");
    assert.strictEqual(player.crystals, 0, "Crystals must be 0 when ALLOW_DEV is disabled");
    assert.strictEqual(player.aspireKeys, 0, "Aspire keys must be 0 when ALLOW_DEV is disabled");
    assert.strictEqual(player.nitroKeys, 0, "Nitro keys must be 0 when ALLOW_DEV is disabled");
    assert.strictEqual(player.predatorKeys, 0, "Predator keys must be 0 when ALLOW_DEV is disabled");
    assert.strictEqual(player.displayName, "ch***er", "Display name must be masked");

    // [Requirement b] join with options.crystals = 999 -> crystals unchanged (remains 0)
    const client999 = new MockClient("session_crystals_999");
    room.onJoin(client999 as any, {
      email: "cheater999@hcmut.edu.vn",
      schoolId: "hcmut",
      crystals: 999
    });
    const player999 = room.state.players.get("session_crystals_999")!;
    assert.ok(player999, "Player 999 must exist");
    assert.strictEqual(player999.crystals, 0, "Joining with options.crystals = 999 must result in 0 crystals");

    // Verify private storage on server
    assert.strictEqual(room.playerEmails.get("session_prod_user"), "cheater@hcmut.edu.vn");

    // [Requirement a] Test ALL dev commands when ALLOW_DEV is false:
    // Every dev command must be rejected with error AND room/player state must NOT change!

    // 1. add_points
    client.clear();
    (room as any).onMessageHandlers["add_points"](client, { amount: 500 });
    let err = client.lastMessage("error");
    assert.ok(err, "add_points must be rejected when ALLOW_DEV is disabled");
    assert.ok(err.payload.message.includes("nhà phát triển"));
    assert.strictEqual(player.personalTroops, 0, "Points state must remain 0");

    // 2. dev_add_crystals
    client.clear();
    (room as any).onMessageHandlers["dev_add_crystals"](client, { amount: 100 });
    err = client.lastMessage("error");
    assert.ok(err, "dev_add_crystals must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(player.crystals, 0, "Crystals state must remain 0");

    // 3. dev_add_keys
    client.clear();
    (room as any).onMessageHandlers["dev_add_keys"](client, { aspire: 10, nitro: 10, predator: 10 });
    err = client.lastMessage("error");
    assert.ok(err, "dev_add_keys must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(player.aspireKeys, 0, "Keys state must remain 0");

    // 4. dev_reset_cooldowns
    client.clear();
    (room as any).onMessageHandlers["dev_reset_cooldowns"](client, {});
    err = client.lastMessage("error");
    assert.ok(err, "dev_reset_cooldowns must be rejected when ALLOW_DEV is disabled");

    // 5. set_simulation_speed
    client.clear();
    const prevSpeed = room.state.simulationSpeed;
    (room as any).onMessageHandlers["set_simulation_speed"](client, { speed: 10 });
    err = client.lastMessage("error");
    assert.ok(err, "set_simulation_speed must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(room.state.simulationSpeed, prevSpeed, "simulationSpeed must remain unchanged");

    // 6. toggle_bots
    client.clear();
    (room as any).onMessageHandlers["toggle_bots"](client, { enabled: true });
    err = client.lastMessage("error");
    assert.ok(err, "toggle_bots must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual((room as any).botsEnabled, false, "Bot simulation must remain stopped");

    // 7. toggle_student_bots
    client.clear();
    (room as any).onMessageHandlers["toggle_student_bots"](client, { enabled: true });
    err = client.lastMessage("error");
    assert.ok(err, "toggle_student_bots must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual((room as any).studentBotsEnabled, false, "studentBotsEnabled must remain false");

    // 8. get_student_bots_status
    client.clear();
    (room as any).onMessageHandlers["get_student_bots_status"](client, {});
    err = client.lastMessage("error");
    assert.ok(err, "get_student_bots_status must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(client.lastMessage("student_bots_status"), undefined, "student_bots_status must not be returned");

    // 9. bulk_dispatch
    client.clear();
    const hcmutTroopsBefore = room.state.schoolTroops.get("hcmut") || 0;
    (room as any).onMessageHandlers["bulk_dispatch"](client, { amount: 1000 });
    err = client.lastMessage("error");
    assert.ok(err, "bulk_dispatch must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(room.state.schoolTroops.get("hcmut"), hcmutTroopsBefore, "schoolTroops must remain unchanged");

    // 10. set_role
    client.clear();
    (room as any).onMessageHandlers["set_role"](client, { role: "assault" });
    err = client.lastMessage("error");
    assert.ok(err, "set_role must be rejected when ALLOW_DEV is disabled");

    // 11. login_student
    client.clear();
    (room as any).onMessageHandlers["login_student"](client, {
      email: "hacker@hcmut.edu.vn",
      schoolId: "hcmut",
      points: 50000,
      mode: "dev"
    });
    err = client.lastMessage("error");
    assert.ok(err, "login_student must be rejected when ALLOW_DEV is disabled");
    assert.strictEqual(player.mode, "normal", "Player mode must remain normal");

    // 12. update_map_layout without admin key
    client.clear();
    (room as any).onMessageHandlers["update_map_layout"](client, {
      hqs: [{ schoolId: "hcmut", x: 999, y: 999 }]
    });
    err = client.lastMessage("error");
    assert.ok(err, "update_map_layout without adminKey must be rejected");

    // 13. updateMapLayout without admin key
    client.clear();
    (room as any).onMessageHandlers["updateMapLayout"](client, {
      hqs: [{ schoolId: "hcmut", x: 999, y: 999 }]
    });
    err = client.lastMessage("error");
    assert.ok(err, "updateMapLayout without adminKey must be rejected");

    // 14. soft_reset without admin key
    client.clear();
    (room as any).onMessageHandlers["soft_reset"](client, {});
    err = client.lastMessage("error");
    assert.ok(err, "soft_reset without admin key must be rejected");

    room.onDispose();
    console.log("✅ Test 2 Passed: ALLOW_DEV=false strictly zeroes cheats and gates ALL 14 dev commands!");
  }

  // ========================================================
  // TEST 3: Admin Key Exception for soft_reset & updateMapLayout (VIỆC 1 & 3)
  // ========================================================
  console.log("\n[Test 3] Admin Key Exception for soft_reset & updateMapLayout");
  {
    process.env.ALLOW_DEV = "false";
    process.env.ADMIN_KEY = "authorized_admin_token";

    const room = new CampusRoom();
    room.onCreate({});

    // Client joins with matching admin key
    const adminClient = new MockClient("session_admin");
    room.onJoin(adminClient as any, {
      email: "admin@r2pl.vn",
      schoolId: "hcmut",
      adminKey: "authorized_admin_token"
    });

    // 1. soft_reset with admin key must be allowed
    adminClient.clear();
    (room as any).onMessageHandlers["soft_reset"](adminClient, {});
    const softErr = adminClient.lastMessage("error");
    assert.strictEqual(softErr, undefined, "soft_reset with adminKey must not return error");

    // 2. updateMapLayout with admin key must be allowed
    adminClient.clear();
    (room as any).onMessageHandlers["updateMapLayout"](adminClient, {
      hqs: [{ schoolId: "hcmut", x: 200, y: 200 }]
    });
    let ack = adminClient.lastMessage("map_layout_ack");
    assert.ok(ack, "updateMapLayout with adminKey must receive ack");
    assert.strictEqual(ack.payload.success, true);
    assert.strictEqual(room.state.hqs.get("hcmut")!.x, 200);

    // 3. update_map_layout (snake_case) with admin key must be allowed
    adminClient.clear();
    (room as any).onMessageHandlers["update_map_layout"](adminClient, {
      hqs: [{ schoolId: "hcmut", x: 250, y: 250 }]
    });
    ack = adminClient.lastMessage("map_layout_ack");
    assert.ok(ack, "update_map_layout with adminKey must receive ack");
    assert.strictEqual(ack.payload.success, true);
    assert.strictEqual(room.state.hqs.get("hcmut")!.x, 250);

    // 4. Client with WRONG admin key must be rejected
    const badClient = new MockClient("session_bad_admin");
    room.onJoin(badClient as any, {
      email: "intruder@domain.com",
      adminKey: "wrong_admin_token"
    });

    badClient.clear();
    (room as any).onMessageHandlers["soft_reset"](badClient, {});
    let badErr = badClient.lastMessage("error");
    assert.ok(badErr, "soft_reset with bad adminKey must be rejected");

    badClient.clear();
    (room as any).onMessageHandlers["update_map_layout"](badClient, {
      hqs: [{ schoolId: "hcmut", x: 100, y: 100 }]
    });
    badErr = badClient.lastMessage("error");
    assert.ok(badErr, "update_map_layout with bad adminKey must be rejected");

    room.onDispose();
    console.log("✅ Test 3 Passed: Admin Key exception allows map updates & soft_reset securely!");
  }

  // ========================================================
  // TEST 4: Rate Limiting & Abuse Prevention (VIỆC 4)
  // ========================================================
  console.log("\n[Test 4] Rate Limiting (Token Bucket, Sensitive Cooldown & Disconnect)");
  {
    const limiter = new RateLimiter({
      capacity: 5,
      refillRate: 1, // 1 token per sec
      sensitiveCooldownMs: 1000,
      maxViolations: 3
    });

    const sessionId = "spammer_session";

    // 1. Burst 5 messages allowed
    for (let i = 0; i < 5; i++) {
      const res = limiter.check(sessionId, "chat_msg");
      assert.strictEqual(res.allowed, true, `Request ${i + 1} within capacity must be allowed`);
    }

    // 2. 6th message exceeds bucket capacity -> violation 1
    const v1 = limiter.check(sessionId, "chat_msg");
    assert.strictEqual(v1.allowed, false, "6th request must exceed capacity");
    assert.strictEqual(v1.disconnect, false, "Violation 1 should not disconnect yet");
    assert.strictEqual(limiter.getViolations(sessionId), 1);

    // 3. Violation 2
    const v2 = limiter.check(sessionId, "chat_msg");
    assert.strictEqual(v2.allowed, false);
    assert.strictEqual(v2.disconnect, false);
    assert.strictEqual(limiter.getViolations(sessionId), 2);

    // 4. Violation 3 -> exceeds maxViolations (3) -> disconnect!
    const v3 = limiter.check(sessionId, "chat_msg");
    assert.strictEqual(v3.allowed, false);
    assert.strictEqual(v3.disconnect, true, "Violations >= maxViolations must trigger disconnect");
    assert.ok(v3.reason?.includes("Spam detected"));

    // 5. Sensitive action cooldown test
    const sensitiveId = "student_rolling_gacha";
    const now = 100000;
    const resA = limiter.check(sensitiveId, "rollUniStop", now);
    assert.strictEqual(resA.allowed, true, "First roll must be allowed");

    // Second roll within 1000ms (e.g. +500ms)
    const resB = limiter.check(sensitiveId, "rollUniStop", now + 500);
    assert.strictEqual(resB.allowed, false, "Roll within 1000ms must be rejected");

    // Third roll after 1000ms (e.g. +1100ms)
    const resC = limiter.check(sensitiveId, "rollUniStop", now + 1100);
    assert.strictEqual(resC.allowed, true, "Roll after 1000ms cooldown must be allowed");

    // 6. Test in CampusRoom: disconnect integration
    const room = new CampusRoom();
    room.onCreate({});
    process.env.ALLOW_DEV = "true";

    const spamClient = new MockClient("room_spammer");
    room.onJoin(spamClient as any, { email: "spam@hcmut.edu.vn" });

    // Exhaust tokens and trigger 5 violations to force disconnect
    for (let i = 0; i < 40; i++) {
      (room as any).onMessageHandlers["select_school"](spamClient, { schoolId: "hcmut" });
    }
    // Now bucket is exhausted, next 5 calls cause violations
    for (let i = 0; i < 5; i++) {
      (room as any).onMessageHandlers["select_school"](spamClient, { schoolId: "hcmut" });
    }

    assert.strictEqual(spamClient.leftCode, 4000, "Spamming client must be kicked with code 4000");
    assert.ok(spamClient.leftReason?.includes("Spam detected"), "Leave reason must indicate spam detected");

    // onLeave cleans up state
    room.onLeave(spamClient as any, false);
    assert.strictEqual(room.playerEmails.has("room_spammer"), false, "playerEmails must be cleaned up");
    assert.strictEqual(room.rateLimiter.getViolations("room_spammer"), 0, "RateLimiter state must be removed");

    // [Requirement c] spam 100 message/giây -> bị chặn và bị ngắt kết nối (leave)
    const fastSpamClient = new MockClient("room_fast_spammer_100");
    room.onJoin(fastSpamClient as any, { email: "spam100@hcmut.edu.vn" });
    let blockedCount = 0;
    for (let i = 0; i < 100; i++) {
      (room as any).onMessageHandlers["select_school"](fastSpamClient, { schoolId: "hcmut" });
      const lastErr = fastSpamClient.lastMessage("error");
      if (lastErr && lastErr.payload.message.includes("nhanh")) {
        blockedCount++;
      }
    }
    assert.ok(blockedCount > 0, "Messages exceeding rate capacity must be blocked");
    assert.strictEqual(fastSpamClient.leftCode, 4000, "Spamming 100 msg/sec must trigger disconnect with code 4000");
    assert.ok(fastSpamClient.leftReason?.includes("Spam detected"), "Leave reason must indicate spam detected");

    room.onDispose();
    console.log("✅ Test 4 Passed: Rate limiter burst, sensitive cooldown & 100 msg/s disconnect verified!");
  }

  // ========================================================
  // TEST 5: Privacy Protection - Email unsynced in Schema (VIỆC 5)
  // ========================================================
  console.log("\n[Test 5] Privacy Protection - Email unsynced in Schema");
  {
    const player = new PlayerState();
    player.id = "session_test";
    player.email = "private_student@hcmut.edu.vn";
    player.displayName = maskEmail(player.email);

    // Verify displayName is set
    assert.strictEqual(player.displayName, "pr***nt");

    // In Colyseus schema, decorated fields are in _definition.schema
    const schemaFields = (PlayerState as any)._definition?.schema;
    assert.ok(schemaFields, "Schema definition must exist");
    assert.strictEqual(schemaFields["email"], undefined, "player.email MUST NOT be in serialized schema");
    assert.strictEqual(schemaFields["displayName"], "string", "player.displayName MUST be serialized as string");

    // [Requirement d] state JSON gửi cho client (toJSON() / JSON.stringify) không chứa email
    const stringifiedPlayer = JSON.stringify(player);
    assert.strictEqual(
      stringifiedPlayer.includes("private_student@hcmut.edu.vn"),
      false,
      "JSON.stringify(player) MUST NOT contain raw email"
    );
    assert.strictEqual(
      stringifiedPlayer.includes('"email"'),
      false,
      "JSON.stringify(player) MUST NOT contain 'email' field key"
    );
    assert.ok(
      stringifiedPlayer.includes('"displayName":"pr***nt"'),
      "JSON.stringify(player) must contain masked displayName"
    );

    // Verify room state JSON serialization does not leak email
    const room = new CampusRoom();
    room.onCreate({});
    const client = new MockClient("session_privacy_room");
    room.onJoin(client as any, { email: "real_secret@hcmut.edu.vn", schoolId: "hcmut" });

    const roomStateJson = JSON.stringify(room.state);
    assert.strictEqual(
      roomStateJson.includes("real_secret@hcmut.edu.vn"),
      false,
      "JSON.stringify(room.state) MUST NOT contain raw email"
    );
    assert.strictEqual(
      roomStateJson.includes('"email"'),
      false,
      "JSON.stringify(room.state) MUST NOT contain 'email' key"
    );

    room.onDispose();
    console.log("✅ Test 5 Passed: email is excluded from network schema sync, toJSON/stringify never leaks email!");
  }

  console.log("\n=== ALL SECURITY & DEV HARDENING TESTS PASSED 100%! ===");
  process.exit(0);
}

runSecurityTests().catch((err) => {
  console.error("Security tests failed:", err);
  process.exit(1);
});
