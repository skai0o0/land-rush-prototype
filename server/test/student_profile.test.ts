import { TileState } from "../src/schema/GameState";
import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { RunningPointsProvider } from "../src/profile/RunningPointsProvider";
import { ProfileManager } from "../src/profile/ProfileManager";
import { PlayerState } from "../src/schema/GameState";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";

class MockClient {
  public sessionId: string;
  public messages: { type: string; payload: any }[] = [];
  public leftCode?: number;
  public leftReason?: string;

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

  leave(code?: number, reason?: string) {
    this.leftCode = code;
    this.leftReason = reason;
  }

  clear() {
    this.messages = [];
  }
}

async function runStudentProfileTests() {
  console.log("=== Testing Student Profile System (VIỆC 1 - VIỆC 6) ===");

  // =========================================================================
  // CORE TEST: RunningPointsProvider & ProfileManager Core Math
  // =========================================================================
  console.log("\n[Core Test] RunningPointsProvider Seeded Data, Fallbacks & Profile Math");
  {
    const runningProvider = RunningPointsProvider.getInstance();
    const profileManager = ProfileManager.getInstance();

    // 1. Seeded mock account (sinhvien01@hcmut.edu.vn: 50 km * 10 = 500 pts)
    const seedPoints = runningProvider.getTotalPoints("sinhvien01@hcmut.edu.vn");
    assert.strictEqual(seedPoints, 500, "Seeded account must have 500 points (50km * 10)");

    // 2. Unseeded new student fallback
    process.env.ALLOW_DEV = "true";
    const fallbackPoints = runningProvider.getTotalPoints("newbie_student@hcmut.edu.vn");
    assert.strictEqual(fallbackPoints, 100, "New student must fallback to 100 points in dev");

    // 3. ProfileManager creation & available points math
    const studentId = "test_math_student@hcmut.edu.vn";
    const profile = profileManager.getOrCreateProfile(studentId, "hcmut");
    assert.strictEqual(profile.pointsSpent, 0);
    assert.strictEqual(profileManager.getAvailablePoints(studentId), 100);

    // Deduct 40 points
    const deductOk = profileManager.deductPoints(studentId, 40);
    assert.strictEqual(deductOk, true);
    assert.strictEqual(profile.pointsSpent, 40);
    assert.strictEqual(profileManager.getAvailablePoints(studentId), 60);

    // Over-deduct should fail
    const overDeduct = profileManager.deductPoints(studentId, 70);
    assert.strictEqual(overDeduct, false, "Cannot deduct more than available points");
    assert.strictEqual(profileManager.getAvailablePoints(studentId), 60);

    console.log("✅ Core Test Passed: RunningPointsProvider & ProfileManager math verified!");
  }

  // =========================================================================
  // TIÊU CHUẨN (a): Thoát rồi vào lại -> Giữ nguyên tinh thể, chìa khóa và cooldowns
  // (Cộng tinh thể/chìa vào profile, disconnect, reconnect -> nhận profile_sync giữ nguyên)
  // =========================================================================
  console.log("\n[Tiêu chuẩn a] Thoát rồi vào lại -> Giữ nguyên tinh thể, chìa khóa và cooldowns");
  {
    process.env.ALLOW_DEV = "true";
    const room = new CampusRoom();
    room.onCreate({});

    const email = "persisted_student_a@hcmut.edu.vn";
    const client1 = new MockClient("session_persist_1");

    // 1. Student joins first time
    room.onJoin(client1 as any, { email, schoolId: "hcmut" });
    const initialSync = client1.lastMessage("profile_sync");
    assert.ok(initialSync, "Must receive initial profile_sync on join");

    // 2. Add crystals, keys, and trigger a guess cooldown
    const profileManager = ProfileManager.getInstance();
    profileManager.addCrystals(email, 75);
    profileManager.addKeys(email, "aspire", 3);
    profileManager.addKeys(email, "nitro", 2);
    profileManager.addKeys(email, "predator", 1);

    const lm = Array.from(room.state.landmarks.values())[0];
    client1.clear();
    room.handleGuessLandmark(client1 as any, { landmarkId: lm.id, guess: "Wrong Guess Persist" });
    const guessErr = client1.lastMessage("error");
    assert.ok(guessErr?.payload.message.includes("chưa chính xác"), "Guess should fail and set cooldown");

    const expectedCooldown = profileManager.getGuessCooldown(email, lm.id);
    assert.ok(expectedCooldown > Date.now(), "Cooldown must be set in future");

    // 3. Client disconnects
    room.onLeave(client1 as any, true);

    // 4. Client reconnects in a new session (re-login / reload)
    const client2 = new MockClient("session_persist_2");
    room.onJoin(client2 as any, { email, schoolId: "hcmut" });

    // 5. Must receive profile_sync with PRESERVED crystals, keys, and cooldowns!
    const reconnectedSync = client2.lastMessage("profile_sync");
    assert.ok(reconnectedSync, "Must receive profile_sync upon reconnecting");
    assert.strictEqual(reconnectedSync.payload.studentId, email);
    assert.strictEqual(reconnectedSync.payload.crystals, 75, "Crystals must be preserved exactly");
    assert.strictEqual(reconnectedSync.payload.aspireKeys, 3, "Aspire keys must be preserved");
    assert.strictEqual(reconnectedSync.payload.nitroKeys, 2, "Nitro keys must be preserved");
    assert.strictEqual(reconnectedSync.payload.predatorKeys, 1, "Predator keys must be preserved");

    // Verify cooldown is preserved upon reconnecting (cannot guess landmark again)
    client2.clear();
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    room.handleGuessLandmark(client2 as any, { landmarkId: lm.id, guess: config.name });
    const cdBlockedErr = client2.lastMessage("error");
    assert.ok(cdBlockedErr?.payload.message.includes("thời gian chờ"), "Cooldown must persist across reconnects");

    room.onDispose();
    console.log("✅ Tiêu chuẩn (a) Đạt: Thoát rồi vào lại giữ nguyên tinh thể, chìa khóa và cooldowns!");
  }

  // =========================================================================
  // TIÊU CHUẨN (b): Kết nối thứ hai của cùng tài khoản đẩy kết nối thứ nhất
  // (kết nối cũ nhận "session_replaced", bị ngắt với code 4001)
  // =========================================================================
  console.log("\n[Tiêu chuẩn b] Kết nối thứ hai của cùng tài khoản đẩy kết nối thứ nhất (code 4001)");
  {
    process.env.ALLOW_DEV = "true";
    const room = new CampusRoom();
    room.onCreate({});

    const email = "dualsession_student@hcmut.edu.vn";
    const clientOld = new MockClient("session_old_tab");
    const clientNew = new MockClient("session_new_tab");

    // 1. Client Old joins
    room.onJoin(clientOld as any, { email, schoolId: "hcmut" });
    assert.ok(room.state.players.get("session_old_tab"), "Client Old player must exist in state");
    assert.strictEqual(room.activeSessions.get(email)?.sessionId, "session_old_tab");

    // 2. Client New joins with the EXACT same email
    room.onJoin(clientNew as any, { email, schoolId: "hcmut" });

    // 3. Client Old MUST receive "session_replaced" and be kicked with code 4001
    const kickMsg = clientOld.lastMessage("session_replaced");
    assert.ok(kickMsg, "Client Old must receive session_replaced notification");
    assert.strictEqual(clientOld.leftCode, 4001, "Client Old must be disconnected with code 4001");
    assert.strictEqual(clientOld.leftReason, "Session replaced");

    // 4. Client New is now the single active session
    assert.strictEqual(room.activeSessions.get(email)?.sessionId, "session_new_tab");
    assert.ok(room.state.players.get("session_new_tab"), "Client New player must exist in state");

    room.onDispose();
    console.log("✅ Tiêu chuẩn (b) Đạt: Kết nối thứ hai đẩy kết nối thứ nhất với session_replaced và code 4001!");
  }

  // =========================================================================
  // TIÊU CHUẨN (c): Hai sinh viên khác nhau đều quay được cùng một trạm;
  // cùng một sinh viên quay hai lần liên tiếp (kể cả reload/thoát vào lại) thì lần hai bị từ chối do cooldown.
  // =========================================================================
  console.log("\n[Tiêu chuẩn c] Hai sinh viên khác nhau quay cùng 1 trạm; cùng sinh viên quay lần 2 (kể cả reload) bị từ chối");
  {
    process.env.ALLOW_DEV = "true";
    const room = new CampusRoom();
    room.onCreate({});

    const emailA = "student_c_alpha@hcmut.edu.vn";
    const emailB = "student_c_beta@hcmut.edu.vn";

    const clientA = new MockClient("session_c_a");
    const clientB = new MockClient("session_c_b");

    room.onJoin(clientA as any, { email: emailA, schoolId: "hcmut" });
    room.onJoin(clientB as any, { email: emailB, schoolId: "hcmut" });

    const stop = Array.from(room.state.unistops.values())[0];
    assert.ok(stop, "UniStop must exist on map");
    stop.ownerSchoolId = "hcmut";
    const presence = new TileState(); presence.x = stop.x; presence.y = stop.z;
    presence.ownerId = stop.ownerSchoolId; presence.lastStudiedAt = Date.now();
    room.landmarkTileMap.delete(`${presence.x},${presence.y}`);
    room.state.claimedTiles.set(`${presence.x},${presence.y}`, presence);

    // 1. Sinh viên A quay trạm -> Thành công
    clientA.clear();
    room.handleRollUniStop(clientA as any, { stopId: stop.id, x: stop.x, z: stop.z });
    assert.ok(clientA.lastMessage("unistop_rolled"), "Sinh viên A quay trạm thành công");

    // 2. Sinh viên B quay CÙNG trạm -> Cũng thành công (không bị ảnh hưởng bởi A!)
    clientB.clear();
    room.handleRollUniStop(clientB as any, { stopId: stop.id, x: stop.x, z: stop.z });
    assert.ok(clientB.lastMessage("unistop_rolled"), "Sinh viên B quay cùng trạm thành công!");

    // 3. Sinh viên A quay lần 2 liên tiếp ngay lập tức -> Bị từ chối do cooldown!
    clientA.clear();
    room.handleRollUniStop(clientA as any, { stopId: stop.id, x: stop.x, z: stop.z });
    let cdErr = clientA.lastMessage("error");
    assert.ok(cdErr?.payload.message.includes("hồi chiêu"), "Sinh viên A quay lần 2 bị từ chối do cooldown");

    // 4. Sinh viên A thoát ra (reload trang / disconnect)
    room.onLeave(clientA as any, true);

    // 5. Sinh viên A vào lại bằng session mới
    const clientA_reconnected = new MockClient("session_c_a_reconnected");
    room.onJoin(clientA_reconnected as any, { email: emailA, schoolId: "hcmut" });

    // 6. Sinh viên A thử quay lại trạm đó -> VẪN BỊ TỪ CHỐI do cooldown đã lưu trong profile!
    clientA_reconnected.clear();
    room.handleRollUniStop(clientA_reconnected as any, { stopId: stop.id, x: stop.x, z: stop.z });
    cdErr = clientA_reconnected.lastMessage("error");
    assert.ok(cdErr?.payload.message.includes("hồi chiêu"), "Sinh viên A reload/thoát vào lại vẫn bị từ chối do cooldown");

    room.onDispose();
    console.log("✅ Tiêu chuẩn (c) Đạt: Cooldown cách ly từng sinh viên và duy trì tuyệt đối qua reload!");
  }

  // =========================================================================
  // TIÊU CHUẨN (d): Join options chứa số liệu (options.crystals = 999, options.points = 9999)
  // khi ALLOW_DEV tắt bị bỏ qua hoàn toàn.
  // =========================================================================
  console.log("\n[Tiêu chuẩn d] Join options cheat (crystals=999, points=9999) khi ALLOW_DEV tắt bị bỏ qua hoàn toàn");
  {
    process.env.ALLOW_DEV = "false";
    delete process.env.ADMIN_KEY;

    const room = new CampusRoom();
    room.onCreate({});

    const email = "cheater_d@hcmut.edu.vn";
    const clientCheat = new MockClient("session_cheat_d");

    // Client gửi cheats qua options
    room.onJoin(clientCheat as any, {
      email,
      schoolId: "hcmut",
      points: 9999,
      crystals: 999,
      aspireKeys: 50,
      nitroKeys: 50,
      predatorKeys: 50,
      mode: "dev"
    });

    const player = room.state.players.get("session_cheat_d")!;
    assert.ok(player, "Player must exist");

    // Kiểm tra state của player trên phòng: hoàn toàn bỏ qua options cheat!
    assert.strictEqual(player.crystals, 0, "player.crystals phải bằng 0");
    assert.strictEqual(player.personalTroops, 0, "player.personalTroops phải bằng 0");
    assert.strictEqual(player.aspireKeys, 0, "player.aspireKeys phải bằng 0");
    assert.strictEqual(player.nitroKeys, 0, "player.nitroKeys phải bằng 0");
    assert.strictEqual(player.predatorKeys, 0, "player.predatorKeys phải bằng 0");
    assert.strictEqual(player.mode, "normal", "player.mode bị ép thành normal");

    // Kiểm tra profile trên server: không nhận bất kỳ số liệu cheat nào từ options
    const profileManager = ProfileManager.getInstance();
    const profile = profileManager.getOrCreateProfile(email, "hcmut");
    assert.strictEqual(profile.crystals, 0, "profile.crystals phải bằng 0");
    assert.strictEqual(profile.aspireKeys, 0, "profile.aspireKeys phải bằng 0");
    assert.strictEqual(profile.pointsSpent, 0, "profile.pointsSpent không bị cheat");

    room.onDispose();
    console.log("✅ Tiêu chuẩn (d) Đạt: Options crystals=999, points=9999 bị bỏ qua hoàn toàn khi ALLOW_DEV tắt!");
  }

  // =========================================================================
  // TIÊU CHUẨN (e): State đồng bộ mạng (PlayerState._definition.schema)
  // không còn points, crystals, các keys, guessCooldowns.
  // =========================================================================
  console.log("\n[Tiêu chuẩn e] State đồng bộ mạng (PlayerState._definition.schema) không còn points, crystals, keys, guessCooldowns");
  {
    const player = new PlayerState();
    const schemaDefs = (player as any)._definition?.schema || {};

    // 1. Các trường tài nguyên cá nhân BỊ LOẠI BỎ hoàn toàn khỏi Schema Colyseus
    assert.strictEqual(schemaDefs.points, undefined, "points MUST NOT exist in schema definition");
    assert.strictEqual(schemaDefs.crystals, undefined, "crystals MUST NOT exist in schema definition");
    assert.strictEqual(schemaDefs.aspireKeys, undefined, "aspireKeys MUST NOT exist in schema definition");
    assert.strictEqual(schemaDefs.nitroKeys, undefined, "nitroKeys MUST NOT exist in schema definition");
    assert.strictEqual(schemaDefs.predatorKeys, undefined, "predatorKeys MUST NOT exist in schema definition");
    assert.strictEqual(schemaDefs.guessCooldowns, undefined, "guessCooldowns MUST NOT exist in schema definition");

    // 2. Các trường công khai hợp lệ VẪN ĐƯỢC ĐỒNG BỘ bình thường
    assert.strictEqual(schemaDefs.id, "string", "id must exist in schema");
    assert.strictEqual(schemaDefs.displayName, "string", "displayName must exist in schema");
    assert.strictEqual(schemaDefs.schoolId, "string", "schoolId must exist in schema");
    assert.strictEqual(schemaDefs.mode, "string", "mode must exist in schema");
    assert.strictEqual(schemaDefs.isLockedSchool, "boolean", "isLockedSchool must exist in schema");

    console.log("✅ Tiêu chuẩn (e) Đạt: Schema chỉ đồng bộ thông tin công khai, đã tách rời hoàn toàn tài nguyên cá nhân!");
  }

  console.log("\n=== TẤT CẢ 5 TIÊU CHUẨN NGHIỆM THU (a - e) ĐÃ ĐẠT 100%! ===");
  process.exit(0);
}

runStudentProfileTests().catch((err) => {
  console.error("Student Profile Tests Failed:", err);
  process.exit(1);
});
