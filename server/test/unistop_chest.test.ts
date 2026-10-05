process.env.ALLOW_DEV = "true";
import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { GameState, UniStopState, ChestState, PlayerState } from "../src/schema/GameState";
import {
  UNISTOP_CONFIGS,
  CHEST_CONFIGS,
  LOOT_ITEMS,
  UNISTOP_LOOT_TABLES,
  CHEST_LOOT_TABLES,
  rollLoot,
  generateCarouselItems,
  UniStopTier,
  ChestTier
} from "../../shared/constants/unistops";

// Mock client helper
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
  console.log("=== Testing UniStop, Chest, Key & Map Layout Logic ===");

  // ----------------------------------------------------
  // TEST 1: Constants, Tiers, Loot Tables & Weighted RNG
  // ----------------------------------------------------
  console.log("\n[Test 1] Constants, Tiers, Loot Tables & Server Weighted RNG");
  {
    // Check UniStop configs & cooldowns
    assert.ok(UNISTOP_CONFIGS.aspire, "UniStop Aspire config must exist");
    assert.ok(UNISTOP_CONFIGS.nitro, "UniStop Nitro config must exist");
    assert.ok(UNISTOP_CONFIGS.predator, "UniStop Predator config must exist");
    assert.strictEqual(UNISTOP_CONFIGS.aspire.name, "UniStop - Aspire");
    assert.strictEqual(UNISTOP_CONFIGS.nitro.name, "UniStop - Nitro");
    assert.strictEqual(UNISTOP_CONFIGS.predator.name, "UniStop - Predator");
    assert.strictEqual(UNISTOP_CONFIGS.aspire.cooldownMs, 12 * 3600 * 1000, "Aspire cooldown must be 12h");
    assert.strictEqual(UNISTOP_CONFIGS.nitro.cooldownMs, 24 * 3600 * 1000, "Nitro cooldown must be 24h");
    assert.strictEqual(UNISTOP_CONFIGS.predator.cooldownMs, 24 * 3600 * 1000, "Predator cooldown must be 24h");

    // Check Chest configs
    assert.ok(CHEST_CONFIGS.aspire, "Chest Aspire config must exist");
    assert.ok(CHEST_CONFIGS.nitro, "Chest Nitro config must exist");
    assert.ok(CHEST_CONFIGS.predator, "Chest Predator config must exist");
    assert.strictEqual(CHEST_CONFIGS.aspire.chestName, "Chest - Aspire");
    assert.strictEqual(CHEST_CONFIGS.nitro.chestName, "Chest - Nitro");
    assert.strictEqual(CHEST_CONFIGS.predator.chestName, "Chest - Predator");
    assert.strictEqual(CHEST_CONFIGS.aspire.requiredKey, "aspire");
    assert.strictEqual(CHEST_CONFIGS.nitro.requiredKey, "nitro");
    assert.strictEqual(CHEST_CONFIGS.predator.requiredKey, "predator");

    // Check Loot items
    assert.ok(LOOT_ITEMS.points_x1 && LOOT_ITEMS.points_x2 && LOOT_ITEMS.points_x3 && LOOT_ITEMS.points_x5, "Point items must exist");
    assert.ok(LOOT_ITEMS.crystal_1 && LOOT_ITEMS.crystal_2 && LOOT_ITEMS.crystal_3 && LOOT_ITEMS.crystal_4 && LOOT_ITEMS.crystal_5 && LOOT_ITEMS.crystal_10, "Crystal items must exist");
    assert.ok(LOOT_ITEMS.treasure_map, "Treasure map must exist");
    assert.ok(LOOT_ITEMS.key_aspire && LOOT_ITEMS.key_nitro && LOOT_ITEMS.key_predator, "Key items must exist");
    assert.ok(LOOT_ITEMS.gift_tshirt && LOOT_ITEMS.gift_keychain && LOOT_ITEMS.gift_socks, "Real gift items must exist");
    assert.strictEqual(LOOT_ITEMS.gift_tshirt.isRealGift, true, "gift_tshirt must have isRealGift: true");
    assert.strictEqual(LOOT_ITEMS.gift_keychain.isRealGift, true, "gift_keychain must have isRealGift: true");
    assert.strictEqual(LOOT_ITEMS.gift_socks.isRealGift, true, "gift_socks must have isRealGift: true");

    // Check Loot Tables total weights (all must equal 1000 for exact percentages)
    const sumTable = (table: any[]) => table.reduce((sum, item) => sum + item.weight, 0);
    assert.strictEqual(sumTable(UNISTOP_LOOT_TABLES.aspire), 1000, "UniStop Aspire loot table sum must be 1000");
    assert.strictEqual(sumTable(UNISTOP_LOOT_TABLES.nitro), 1000, "UniStop Nitro loot table sum must be 1000");
    assert.strictEqual(sumTable(UNISTOP_LOOT_TABLES.predator), 1000, "UniStop Predator loot table sum must be 1000");
    assert.strictEqual(sumTable(CHEST_LOOT_TABLES.aspire), 1000, "Chest Aspire loot table sum must be 1000");
    assert.strictEqual(sumTable(CHEST_LOOT_TABLES.nitro), 1000, "Chest Nitro loot table sum must be 1000");
    assert.strictEqual(sumTable(CHEST_LOOT_TABLES.predator), 1000, "Chest Predator loot table sum must be 1000");

    // Verify chest loot tables have crystal_1, crystal_5, crystal_10 (1, 5, 10 crystals) and no crystal_2 or crystal_3
    const chestTiers: ChestTier[] = ["aspire", "nitro", "predator"];
    for (const tier of chestTiers) {
      const table = CHEST_LOOT_TABLES[tier];
      const itemIds = table.map((item) => item.id);
      assert.ok(itemIds.includes("crystal_1"), `${tier} chest must contain crystal_1`);
      assert.ok(itemIds.includes("crystal_5"), `${tier} chest must contain crystal_5`);
      assert.ok(itemIds.includes("crystal_10"), `${tier} chest must contain crystal_10`);
      assert.ok(!itemIds.includes("crystal_2"), `${tier} chest must NOT contain crystal_2`);
      assert.ok(!itemIds.includes("crystal_3"), `${tier} chest must NOT contain crystal_3`);
    }

    // Test Weighted RNG without weekly running points: NEVER roll real gifts
    const predatorLootTable = UNISTOP_LOOT_TABLES.predator;
    for (let i = 0; i < 500; i++) {
      const rolled = rollLoot(predatorLootTable, false);
      assert.strictEqual(
        rolled.isRealGift || false,
        false,
        "Student without weekly running points must NEVER receive a real gift"
      );
    }

    // Test Weighted RNG with weekly running points: Can roll real gifts
    const rolledGift = rollLoot(predatorLootTable, true, () => 0.99999);
    assert.strictEqual(rolledGift.isRealGift, true, "Student with weekly running points must be able to roll real gifts");
    const blockedGift = rollLoot(predatorLootTable, false, () => 0.99999);
    assert.strictEqual(blockedGift.isRealGift || false, false, "Student without weekly running points must NEVER receive a real gift even at upper bound");

    // Test Carousel Generation
    const winningItem = LOOT_ITEMS.gift_tshirt;
    const carousel = generateCarouselItems(winningItem, predatorLootTable, 30, 24);
    assert.strictEqual(carousel.length, 30, "Carousel items length must be 30");
    assert.strictEqual(carousel[24].id, winningItem.id, "Winning item must be at index 24");

    console.log("✅ Test 1 Passed: Tiers, loot tables, exact weights, and weighted RNG gating verified!");
  }

  // ----------------------------------------------------
  // TEST 2: Schema Initialization & Map Spawning
  // ----------------------------------------------------
  console.log("\n[Test 2] Schema Initialization & Map Spawning");
  {
    const room = new CampusRoom();
    room.onCreate({});

    assert.ok(room.state.unistops.size >= 15, "At least 15 UniStops must be spawned on the map");
    assert.ok(room.state.chests.size >= 15, "At least 15 Chests must be spawned on the map");

    // Check tier distribution in spawned stops
    let aspireCount = 0;
    let nitroCount = 0;
    let predatorCount = 0;
    room.state.unistops.forEach((stop) => {
      assert.ok(stop.x >= 0 && stop.x <= 1000, "UniStop x must be within map bounds");
      assert.ok(stop.z >= 0 && stop.z <= 1000, "UniStop z must be within map bounds");
      assert.strictEqual(stop.cooldownUntil, 0, "Initial cooldown must be 0");
      if (stop.tier === "aspire") aspireCount++;
      if (stop.tier === "nitro") nitroCount++;
      if (stop.tier === "predator") predatorCount++;
    });
    assert.ok(aspireCount > 0 && nitroCount > 0 && predatorCount > 0, "All 3 UniStop tiers must be spawned");

    // Check chests
    let aspireChestCount = 0;
    let nitroChestCount = 0;
    let predatorChestCount = 0;
    room.state.chests.forEach((chest) => {
      assert.ok(chest.x >= 0 && chest.x <= 1000, "Chest x must be within map bounds");
      assert.ok(chest.z >= 0 && chest.z <= 1000, "Chest z must be within map bounds");
      assert.strictEqual(chest.isOpened, false, "Initial isOpened must be false");
      assert.strictEqual(chest.openedBySchoolId, "", "Initial openedBySchoolId must be empty");
      if (chest.tier === "aspire") aspireChestCount++;
      if (chest.tier === "nitro") nitroChestCount++;
      if (chest.tier === "predator") predatorChestCount++;
    });
    assert.ok(aspireChestCount > 0 && nitroChestCount > 0 && predatorChestCount > 0, "All 3 Chest tiers must be spawned");

    room.onDispose();
    console.log("✅ Test 2 Passed: Spawning of UniStops and Chests verified!");
  }

  // ----------------------------------------------------
  // TEST 3: UniStop Roll Action, Cooldown & Distance Checks
  // ----------------------------------------------------
  console.log("\n[Test 3] UniStop Roll Action, Distance Check & Cooldown Mechanics");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const client = new MockClient("session_student_1");
    room.onJoin(client as any, {
      email: "sv@hcmut.edu.vn",
      schoolId: "hcmut",
      points: 200,
      hasWeeklyRunningPoints: true
    });

    const player = room.state.players.get("session_student_1")!;
    assert.strictEqual(player.hasWeeklyRunningPoints, true);

    // Pick first UniStop
    const stop = Array.from(room.state.unistops.values())[0];
    assert.ok(stop, "UniStop must exist");

    // Case 1: Student is too far (> 50 tiles)
    client.clear();
    room.handleRollUniStop(client as any, {
      stopId: stop.id,
      x: stop.x + 100,
      z: stop.z + 100
    });
    const farErr = client.lastMessage("error");
    assert.ok(farErr, "Must return error when player is too far from UniStop");
    assert.ok(farErr.payload.message.includes("quá xa"), "Error message must indicate distance");

    // Case 2: Student is in range (<= 50 tiles)
    client.clear();
    room.handleRollUniStop(client as any, {
      stopId: stop.id,
      x: stop.x,
      z: stop.z
    });

    const rolledMsg = client.lastMessage("unistop_rolled");
    assert.ok(rolledMsg, "Must receive unistop_rolled message on success");
    assert.strictEqual(rolledMsg.payload.stopId, stop.id);
    assert.ok(rolledMsg.payload.winningItem, "Winning item must be returned");
    assert.strictEqual(rolledMsg.payload.carouselItems.length, 30, "Carousel items length must be 30");
    assert.strictEqual(rolledMsg.payload.carouselItems[24].id, rolledMsg.payload.winningItem.id);

    // Verify cooldown is set
    assert.ok(stop.cooldownUntil > Date.now(), "Cooldown must be set after rolling");

    // Case 3: Rolling again while in cooldown -> must be rejected
    client.clear();
    room.handleRollUniStop(client as any, {
      stopId: stop.id,
      x: stop.x,
      z: stop.z
    });
    const cdErr = client.lastMessage("error");
    assert.ok(cdErr, "Must reject rolling while cooldown is active");
    assert.ok(cdErr.payload.message.includes("hồi chiêu"), "Error message must indicate cooldown");

    // Reset cooldown and roll again
    stop.cooldownUntil = 0;
    client.clear();
    room.handleRollUniStop(client as any, {
      stopId: stop.id,
      x: stop.x,
      z: stop.z
    });
    assert.ok(client.lastMessage("unistop_rolled"), "Roll should succeed after cooldown expires");

    room.onDispose();
    console.log("✅ Test 3 Passed: UniStop roll, distance check, and cooldown mechanics work as expected!");
  }

  // ----------------------------------------------------
  // TEST 4: Chest & Key Mechanics (Aspire, Nitro, Predator)
  // ----------------------------------------------------
  console.log("\n[Test 4] Chest & Key Mechanics (Requirement checks, opening & carousel)");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const client = new MockClient("session_student_2");
    room.onJoin(client as any, {
      email: "runner@dtu.edu.vn",
      schoolId: "dtu",
      points: 100,
      hasWeeklyRunningPoints: false
    });

    const player = room.state.players.get("session_student_2")!;

    // Find chests
    let aspireChest: ChestState | undefined;
    let nitroChest: ChestState | undefined;
    let predatorChest: ChestState | undefined;

    room.state.chests.forEach((c) => {
      if (c.tier === "aspire" && !aspireChest) aspireChest = c;
      if (c.tier === "nitro" && !nitroChest) nitroChest = c;
      if (c.tier === "predator" && !predatorChest) predatorChest = c;
    });

    assert.ok(aspireChest && nitroChest && predatorChest, "All chest tiers must be present");

    // 1. Try to open Aspire Chest without Aspire Key
    client.clear();
    player.aspireKeys = 0;
    room.handleOpenChest(client as any, {
      chestId: aspireChest.id,
      x: aspireChest.x,
      z: aspireChest.z
    });
    let keyErr = client.lastMessage("error");
    assert.ok(keyErr, "Opening Aspire Chest without Aspire Key must fail");
    assert.ok(keyErr.payload.message.includes("Chìa khoá Aspire"), "Error message must mention Aspire Key");

    // 2. Grant Aspire Key and open Aspire Chest
    player.aspireKeys = 1;
    client.clear();
    room.handleOpenChest(client as any, {
      chestId: aspireChest.id,
      x: aspireChest.x,
      z: aspireChest.z
    });
    const openedMsg = client.lastMessage("chest_opened");
    assert.ok(openedMsg, "Must receive chest_opened message");
    assert.strictEqual(openedMsg.payload.chestId, aspireChest.id);
    assert.strictEqual(aspireChest.isOpened, true, "Chest must be marked as opened");
    assert.strictEqual(aspireChest.openedBySchoolId, "dtu", "Chest must record opened school");
    assert.strictEqual(player.aspireKeys, 0, "Aspire key must be consumed");
    assert.strictEqual(openedMsg.payload.carouselItems.length, 30);
    assert.strictEqual(openedMsg.payload.carouselItems[24].id, openedMsg.payload.winningItem.id);

    // 3. Try to open already opened chest -> should fail
    client.clear();
    player.aspireKeys = 1;
    room.handleOpenChest(client as any, {
      chestId: aspireChest.id,
      x: aspireChest.x,
      z: aspireChest.z
    });
    const alreadyErr = client.lastMessage("error");
    assert.ok(alreadyErr, "Opening already opened chest must fail");
    assert.ok(alreadyErr.payload.message.includes("đã được mở"), "Error must indicate chest is already opened");

    // 4. Test Nitro and Predator Keys
    player.nitroKeys = 1;
    client.clear();
    room.handleOpenChest(client as any, {
      chestId: nitroChest.id,
      x: nitroChest.x,
      z: nitroChest.z
    });
    assert.ok(client.lastMessage("chest_opened"), "Opening Nitro chest with Nitro Key must succeed");
    assert.strictEqual(nitroChest.isOpened, true);
    assert.strictEqual(player.nitroKeys, 0);

    player.predatorKeys = 1;
    client.clear();
    room.handleOpenChest(client as any, {
      chestId: predatorChest.id,
      x: predatorChest.x,
      z: predatorChest.z
    });
    assert.ok(client.lastMessage("chest_opened"), "Opening Predator chest with Predator Key must succeed");
    assert.strictEqual(predatorChest.isOpened, true);
    assert.strictEqual(player.predatorKeys, 0);

    room.onDispose();
    console.log("✅ Test 4 Passed: Chest opening, key consumption, and state locking work flawlessly!");
  }

  // ----------------------------------------------------
  // TEST 5: Flexible Map Layout Update (Map Editor Support)
  // ----------------------------------------------------
  console.log("\n[Test 5] Flexible Map Layout Updates (updateMapLayout)");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const client = new MockClient("session_editor");
    room.onJoin(client as any, { email: "admin@r2pl.vn", mode: "dev" });

    client.clear();
    room.handleUpdateMapLayout(client as any, {
      hqs: [
        { schoolId: "hcmut", x: 150, y: 150 },
        { schoolId: "dtu", x: 750, y: 750 }
      ],
      landmarks: [
        { id: "fansipan", x: 220, y: 330, maxCrystals: 150 }
      ],
      unistops: [
        { id: "custom_stop_1", name: "Trạm Trung Tâm", tier: "predator", x: 500, z: 500 }
      ],
      chests: [
        { id: "custom_chest_1", tier: "predator", x: 520, z: 520 }
      ]
    });

    const ack = client.lastMessage("map_layout_ack");
    assert.ok(ack, "Client must receive map_layout_ack");
    assert.strictEqual(ack.payload.success, true);
    assert.strictEqual(ack.payload.hqsUpdated, 2);
    assert.strictEqual(ack.payload.landmarksUpdated, 1);
    assert.strictEqual(ack.payload.unistopsUpdated, 1);
    assert.strictEqual(ack.payload.chestsUpdated, 1);

    // Verify state updates in GameState
    const hqHcmut = room.state.hqs.get("hcmut")!;
    assert.strictEqual(hqHcmut.x, 150);
    assert.strictEqual(hqHcmut.y, 150);

    const lmFansipan = room.state.landmarks.get("fansipan")!;
    assert.strictEqual(lmFansipan.x, 220);
    assert.strictEqual(lmFansipan.y, 330);
    assert.strictEqual(lmFansipan.maxCrystals, 150);

    const customStop = room.state.unistops.get("custom_stop_1")!;
    assert.ok(customStop, "custom_stop_1 must be added to GameState unistops");
    assert.strictEqual(customStop.name, "Trạm Trung Tâm");
    assert.strictEqual(customStop.tier, "predator");
    assert.strictEqual(customStop.x, 500);
    assert.strictEqual(customStop.z, 500);

    const customChest = room.state.chests.get("custom_chest_1")!;
    assert.ok(customChest, "custom_chest_1 must be added to GameState chests");
    assert.strictEqual(customChest.tier, "predator");
    assert.strictEqual(customChest.x, 520);
    assert.strictEqual(customChest.z, 520);
    assert.strictEqual(customChest.isOpened, false);

    room.onDispose();
    console.log("✅ Test 5 Passed: updateMapLayout successfully modifies GameState in real time!");
  }

  // ----------------------------------------------------
  // TEST 6: Soft Reset preserves objects and clears states
  // ----------------------------------------------------
  console.log("\n[Test 6] Soft Reset clears cooldowns and opened status");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const stop = Array.from(room.state.unistops.values())[0];
    const chest = Array.from(room.state.chests.values())[0];

    stop.cooldownUntil = Date.now() + 50000;
    chest.isOpened = true;
    chest.openedBySchoolId = "hcmut";

    // Trigger soft_reset
    (room as any).onMessageHandlers["soft_reset"](new MockClient("admin"), {});

    assert.strictEqual(stop.cooldownUntil, 0, "soft_reset must clear unistop cooldowns");
    assert.strictEqual(chest.isOpened, false, "soft_reset must reset chest isOpened to false");
    assert.strictEqual(chest.openedBySchoolId, "", "soft_reset must clear chest openedBySchoolId");

    room.onDispose();
    console.log("✅ Test 6 Passed: soft_reset cleanly resets UniStop and Chest status!");
  }

  // ----------------------------------------------------
  // TEST 7: Dev Reset Cooldowns command
  // ----------------------------------------------------
  console.log("\n[Test 7] dev_reset_cooldowns clears cooldowns");
  {
    const room = new CampusRoom();
    room.onCreate({});

    const client = new MockClient("session_dev");
    room.onJoin(client as any, { email: "dev@r2pl.vn", mode: "dev" });
    const player = room.state.players.get("session_dev")!;
    player.guessCooldowns.set("fansipan", Date.now() + 600000);

    const stop = Array.from(room.state.unistops.values())[0];
    stop.cooldownUntil = Date.now() + 60000;

    client.clear();
    (room as any).onMessageHandlers["dev_reset_cooldowns"](client, {});
    const ack = client.lastMessage("dev_reset_cooldowns_ack");
    assert.ok(ack, "Must receive dev_reset_cooldowns_ack");
    assert.strictEqual(player.guessCooldowns.size, 0, "Player guess cooldowns must be cleared");
    assert.strictEqual(stop.cooldownUntil, 0, "UniStop cooldown must be cleared");

    room.onDispose();
    console.log("✅ Test 7 Passed: dev_reset_cooldowns works properly!");
  }

  console.log("\n=== ALL UNISTOP, CHEST & MAP LAYOUT TESTS PASSED 100%! ===");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
