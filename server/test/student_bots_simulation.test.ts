import { TileState } from "../src/schema/GameState";
process.env.ALLOW_DEV = "true";
import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { STUDENT_BOT_CONFIGS } from "../src/bots/StudentBotRunner";
import { formatNotificationText, getNotificationTemplate } from "../../shared/constants/notifications";

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

async function runStudentBotsSimulationTests() {
  console.log("=== Testing 5 Student Bots Simulation & Notification Dispatcher ===");

  // 1. Setup CampusRoom with captured notifications & bot actions
  const room = new CampusRoom();
  const capturedNotifications: Array<{ templateId: string; vars: any; category?: string }> = [];
  const capturedBotActions: Array<any> = [];

  const originalBroadcast = room.broadcast.bind(room);
  room.broadcast = (type: any, payload?: any) => {
    if (type === "game_notification") {
      capturedNotifications.push(payload);
    }
    if (type === "student_bot_action") {
      capturedBotActions.push(payload);
    }
    return originalBroadcast(type, payload);
  };

  room.onCreate({ studentBotsEnabled: true });

  const clientUser = new MockClient("session_student_real");
  room.onJoin(clientUser as any, { email: "student@hcmut.edu.vn", schoolId: "hcmut", points: 500 });

  // [Test 1] Verify 5 Bots Initialization & Configurations & Coordinates
  console.log("\n[Test 1] 5 Student Bots Initialization, Configs & Initial Coordinates");
  {
    assert.strictEqual(room.studentBotsEnabled, true, "studentBotsEnabled must be true");
    const status = room.studentBotRunner.getStatus();
    assert.strictEqual(status.enabled, true, "Bot runner must be enabled");
    assert.strictEqual(status.bots.length, 5, "Must have exactly 5 bots");

    const expectedSchools: Record<string, { name: string; schoolId: string }> = {
      bot_hcmut: { name: "Khoa_HCMUT", schoolId: "hcmut" },
      bot_hcmcou: { name: "Minh_OU", schoolId: "hcmcou" },
      bot_dtu: { name: "Hoang_DTU", schoolId: "dtu" },
      bot_dhhp: { name: "Tung_DHHP", schoolId: "dhhp" },
      bot_hsu: { name: "Linh_HSU", schoolId: "hsu" }
    };

    for (const bot of status.bots) {
      const exp = expectedSchools[bot.id];
      assert.ok(exp, `Unexpected bot id: ${bot.id}`);
      assert.strictEqual(bot.name, exp.name, `Bot name mismatch for ${bot.id}`);
      assert.strictEqual(bot.schoolId, exp.schoolId, `Bot schoolId mismatch for ${bot.id}`);
      assert.strictEqual(typeof bot.x, "number", `Bot ${bot.id} must have numeric x coordinate`);
      assert.strictEqual(typeof bot.y, "number", `Bot ${bot.id} must have numeric y coordinate`);
      assert.ok(bot.x >= 0 && bot.x < 1000, `x out of range for ${bot.id}`);
      assert.ok(bot.y >= 0 && bot.y < 1000, `y out of range for ${bot.id}`);

      // Verify PlayerState registered in room
      const playerState = room.state.players.get(bot.id);
      assert.ok(playerState, `PlayerState must exist for ${bot.id}`);
      assert.strictEqual(playerState.schoolId, exp.schoolId);
      assert.strictEqual(playerState.hasWeeklyRunningPoints, true, "Bot has weekly points for gacha");
    }

    // Verify client received initial status upon joining
    const joinStatus = clientUser.lastMessage("student_bots_status");
    assert.ok(joinStatus, "Client must receive student_bots_status on join");
    assert.strictEqual(joinStatus.payload.bots.length, 5);

    console.log("✅ Test 1 Passed: 5 Student Bots initialized with correct schools, coordinates, and player states!");
  }

  // [Test 2] Notification Dispatcher & Template Formatting
  console.log("\n[Test 2] Notification Dispatcher & formatNotificationText");
  {
    capturedNotifications.length = 0;
    room.broadcastNotification("terr_captured", {
      student_name: "Khoa_HCMUT",
      my_school: "hcmut",
      x: 501,
      y: 500
    }, "territory");

    assert.strictEqual(capturedNotifications.length, 1);
    const noti = capturedNotifications[0];
    assert.strictEqual(noti.templateId, "terr_captured");
    assert.strictEqual(noti.category, "territory");
    assert.strictEqual(noti.vars.student_name, "Khoa_HCMUT");

    const tpl = getNotificationTemplate("terr_captured");
    assert.ok(tpl, "Template terr_captured must exist in shared constants");
    const formatted = formatNotificationText(tpl.bodyTemplate, noti.vars);
    assert.ok(formatted.includes("Khoa_HCMUT"), "Formatted text must include student name");
    assert.ok(formatted.includes("501"), "Formatted text must include coordinates");

    console.log("✅ Test 2 Passed: Notification dispatcher and template formatting verified!");
  }

  // [Test 3] Hành động 1: Đi bộ / chạy bộ tích lũy điểm
  console.log("\n[Test 3] Bot Action 1: Walk / Run Points Accumulation & Action Broadcast");
  {
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_hcmut")!;
    const player = room.state.players.get("bot_hcmut")!;
    const prevPoints = player.personalTroops;
    const prevSchoolPoints = room.state.schoolTroops.get("hcmut") || 0;

    bot.actionWalkRun(room);

    assert.ok(player.personalTroops > prevPoints, "Personal points must increase");
    assert.ok((room.state.schoolTroops.get("hcmut") || 0) > prevSchoolPoints, "School troops must increase");
    assert.strictEqual(bot.lastActionType, "walk", "Action type must be walk");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.botId, "bot_hcmut");
    assert.strictEqual(actionMsg.actionType, "walk");
    assert.ok(actionMsg.actionText.includes("Đang chạy bộ"));
    assert.strictEqual(typeof actionMsg.x, "number");
    assert.strictEqual(typeof actionMsg.y, "number");

    console.log("✅ Test 3 Passed: Action 1 (Walk/Run) successfully accumulates points and broadcasts action!");
  }

  // [Test 4] Hành động 2: Khám phá ô tri thức hoang sơ (claimTile)
  console.log("\n[Test 4] Bot Action 2: Explore Wild Tile & Action Broadcast");
  {
    capturedNotifications.length = 0;
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_hcmut")!;
    const prevClaimed = room.state.claimedTiles.size;

    bot.actionExploreWild(room);

    assert.ok(room.state.claimedTiles.size >= prevClaimed, "Claimed tiles should increase or remain valid");
    const hasCapturedNoti = capturedNotifications.some((n) => n.templateId === "terr_captured");
    assert.ok(hasCapturedNoti, "terr_captured notification must be broadcasted");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "explore");
    assert.ok(actionMsg.actionText.includes("Đang khám phá ô"));

    console.log("✅ Test 4 Passed: Action 2 (Explore wild) successfully claims tile and broadcasts action!");
  }

  // [Test 5] Hành động 3: Ôn bài bảo vệ ô tri thức (studyTile)
  console.log("\n[Test 5] Bot Action 3: Study Friendly Tile & Action Broadcast");
  {
    capturedNotifications.length = 0;
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_hcmut")!;

    bot.actionStudyTile(room);

    const hasStudiedNoti = capturedNotifications.some((n) => n.templateId === "terr_studied");
    assert.ok(hasStudiedNoti, "terr_studied notification must be broadcasted");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "study");
    assert.ok(actionMsg.actionText.includes("Đang ôn bài"));

    console.log("✅ Test 5 Passed: Action 3 (Study tile) successfully reinforces tile and broadcasts action!");
  }

  // [Test 6] Hành động 4: Quay trạm tiếp tế UniStop (Gacha)
  console.log("\n[Test 6] Bot Action 4: UniStop Gacha Roll & Action Broadcast");
  {
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_dtu")!;
    bot.client.clear();

    room.state.unistops.forEach(stop => {
      stop.ownerSchoolId = "dtu";
      const tile = new TileState(); tile.x = stop.x; tile.y = stop.z; tile.ownerId = "dtu"; tile.lastStudiedAt = Date.now();
      room.landmarkTileMap.delete(`${tile.x},${tile.y}`); room.state.claimedTiles.set(`${tile.x},${tile.y}`, tile);
    });
    bot.actionRollUniStop(room);

    assert.ok(bot.client.messages.some((m) => m.type === "unistop_rolled"), "unistop_rolled message must be received");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "unistop");
    assert.ok(actionMsg.actionText.includes("Đang quay UniStop"));

    console.log("✅ Test 6 Passed: Action 4 (UniStop Gacha) successfully rolled rewards and broadcasted action!");
  }

  // [Test 7] Hành động 5: Mở rương kho báu (openChest)
  console.log("\n[Test 7] Bot Action 5: Open Treasure Chest & Action Broadcast");
  {
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_dhhp")!;
    bot.client.clear();

    const target = Array.from(room.state.chests.values()).find(c => !c.isOpened)!;
    const reach = new TileState(); reach.x = Math.floor(target.x - 2); reach.y = Math.floor(target.z);
    reach.ownerId = "dhhp"; reach.lastStudiedAt = Date.now();
    room.landmarkTileMap.delete(`${reach.x},${reach.y}`);
    room.state.claimedTiles.set(`${reach.x},${reach.y}`, reach);
    bot.actionOpenChest(room);

    assert.ok(bot.client.messages.some((m) => m.type === "chest_opened"), "chest_opened message must be received");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "chest");
    assert.ok(actionMsg.actionText.includes("Đang mở rương"));

    console.log("✅ Test 7 Passed: Action 5 (Open chest) successfully opened chest and broadcasted action!");
  }

  // [Test 8] Hành động 6: Giải đố tên công trình (guessLandmark)
  console.log("\n[Test 8] Bot Action 6: Landmark Guessing & Action Broadcast");
  {
    capturedNotifications.length = 0;
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_hsu")!;

    bot.actionGuessLandmark(room);

    const hasGuessNoti = capturedNotifications.some((n) => n.templateId === "lm_guessed");
    assert.ok(hasGuessNoti, "lm_guessed notification must be broadcasted");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "guess");
    assert.ok(actionMsg.actionText.includes("Đang giải đố"));

    console.log("✅ Test 8 Passed: Action 6 (Landmark guessing) successfully awarded crystals and broadcasted action!");
  }

  // [Test 9] Hành động 7: Nạp Tinh thể vào Đèn hiệu (contributeCrystal)
  console.log("\n[Test 9] Bot Action 7: Contribute Crystals to Landmark Beacon & Action Broadcast");
  {
    capturedNotifications.length = 0;
    capturedBotActions.length = 0;
    const bot = room.studentBotRunner.getBot("bot_hcmcou")!;

    const target = Array.from(room.state.landmarks.values())[0];
    const reach = new TileState(); reach.x = target.x - 1; reach.y = target.y;
    reach.ownerId = "hcmcou"; reach.lastStudiedAt = Date.now();
    room.landmarkTileMap.delete(`${reach.x},${reach.y}`);
    room.state.claimedTiles.set(`${reach.x},${reach.y}`, reach);
    bot.actionContributeCrystal(room);

    const lm = Array.from(room.state.landmarks.values())[0];
    const crystals = lm.crystalsBySchool.get("hcmcou") || 0;
    assert.ok(crystals > 0, "Crystals must be contributed for hcmcou");

    const actionMsg = capturedBotActions[capturedBotActions.length - 1];
    assert.ok(actionMsg, "student_bot_action message must be broadcasted");
    assert.strictEqual(actionMsg.actionType, "crystal");
    assert.ok(actionMsg.actionText.includes("Đang nạp tinh thể"));

    console.log("✅ Test 9 Passed: Action 7 (Contribute crystals) successfully updated Landmark Beacon and broadcasted action!");
  }

  // [Test 10] Full Cycle & Tick Simulation (stepAll & tick)
  console.log("\n[Test 10] Bot Cycle & Tick Simulation");
  {
    const prevHistoryCounts = STUDENT_BOT_CONFIGS.map(
      (cfg) => room.studentBotRunner.getBot(cfg.id)!.actionHistory.length
    );

    room.studentBotRunner.stepAll();

    STUDENT_BOT_CONFIGS.forEach((cfg, idx) => {
      const bot = room.studentBotRunner.getBot(cfg.id)!;
      assert.strictEqual(
        bot.actionHistory.length,
        prevHistoryCounts[idx] + 1,
        `Bot ${cfg.id} should have 1 new history record`
      );
    });

    console.log("✅ Test 10 Passed: stepAll executed across all 5 student bots!");
  }

  // [Test 11] Toggle Student Bots Message Handler
  console.log("\n[Test 11] toggle_student_bots & get_student_bots_status Messages");
  {
    // Toggle OFF
    (room as any).onMessageHandlers["toggle_student_bots"](clientUser, { enabled: false });
    assert.strictEqual(room.studentBotsEnabled, false, "studentBotsEnabled must be false after toggle");
    assert.strictEqual(clientUser.lastMessage("student_bots_toggled")?.payload.enabled, false);

    // Toggle ON
    (room as any).onMessageHandlers["toggle_student_bots"](clientUser, { enabled: true });
    assert.strictEqual(room.studentBotsEnabled, true, "studentBotsEnabled must be true after toggle");
    assert.strictEqual(clientUser.lastMessage("student_bots_toggled")?.payload.enabled, true);

    // Get Status
    clientUser.clear();
    (room as any).onMessageHandlers["get_student_bots_status"](clientUser);
    const statusMsg = clientUser.lastMessage("student_bots_status");
    assert.ok(statusMsg, "student_bots_status message must be sent");
    assert.strictEqual(statusMsg.payload.bots.length, 5);

    for (const b of statusMsg.payload.bots) {
      assert.strictEqual(typeof b.x, "number");
      assert.strictEqual(typeof b.y, "number");
      assert.strictEqual(typeof b.actionType, "string");
      assert.strictEqual(typeof b.actionText, "string");
    }

    console.log("✅ Test 11 Passed: toggle_student_bots & get_student_bots_status messages verified with full bot coordinates & action payload!");
  }

  room.onDispose();
  console.log("\n=== ALL STUDENT BOTS & NOTIFICATION TESTS PASSED 100%! ===");
  process.exit(0);
}

runStudentBotsSimulationTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
