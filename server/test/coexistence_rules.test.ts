import { beaconOvertakeTarget } from "../../shared/constants/gameplay";
process.env.ALLOW_DEV = "true";
import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { TileState } from "../src/schema/GameState";
import { studyKnowledge, retentionAt } from "../src/gameplay/knowledge";
import { BuffDirector, BuffContext } from "../src/gameplay/BuffDirector";

class ClientMock {
  messages: { type: string; data: any }[] = [];
  constructor(public sessionId: string) {}
  send(type: string, data: any) { this.messages.push({ type, data }); }
  clear() { this.messages = []; }
  got(type: string) { return this.messages.some(m => m.type === type); }
}
const room = new CampusRoom(); room.onCreate({});
try {
  const a = new ClientMock("rules_a"), b = new ClientMock("rules_b"), c = new ClientMock("rules_c");
  room.onJoin(a as any, { email: "rules_a@hcmut.edu.vn", points: 1000 });
  room.onJoin(b as any, { email: "rules_b@hcmut.edu.vn", points: 1000 });
  room.onJoin(c as any, { email: "rules_c@dtu.edu.vn", points: 1000 });
  const stop = Array.from(room.state.unistops.values())[0];
  const otherStop = Array.from(room.state.unistops.values())[1];
  const stationTile = new TileState(); stationTile.x = stop.x; stationTile.y = stop.z;
  studyKnowledge(stationTile, "hcmut", 1, Date.now());
  room.landmarkTileMap.delete(`${stop.x},${stop.z}`); room.state.claimedTiles.set(`${stop.x},${stop.z}`, stationTile);
  const otherPresence = new TileState(); otherPresence.x = otherStop.x; otherPresence.y = otherStop.z;
  studyKnowledge(otherPresence, "hcmut", 1, Date.now());
  room.landmarkTileMap.delete(`${otherStop.x},${otherStop.z}`); room.state.claimedTiles.set(`${otherStop.x},${otherStop.z}`, otherPresence);
  stop.ownerSchoolId = "hcmut"; otherStop.ownerSchoolId = "hcmut";
  a.clear(); b.clear(); c.clear();
  room.handleRollUniStop(c as any, { stopId: stop.id });
  assert.ok(!c.got("unistop_rolled"), "Foreign school cannot claim, even without coordinates");
  room.handleRollUniStop(a as any, { stopId: stop.id });
  room.handleRollUniStop(b as any, { stopId: stop.id });
  assert.ok(a.got("unistop_rolled") && b.got("unistop_rolled"), "All students of owner school may claim");
  assert.ok(a.messages.find(m => m.type === "unistop_rolled")!.data.cooldownUntil > Date.now(),
    "Claim response carries the student's private cooldown, not the obsolete station timer");
  a.clear(); stop.cooldownUntil = 0;
  studyKnowledge(stationTile, "dtu", 3, Date.now());
  room.handleRollUniStop(c as any, { stopId: stop.id });
  assert.strictEqual(stop.ownerSchoolId, "hcmut", "Arrival of another school cannot evict a present owner");
  stationTile.knowledge.get("hcmut")!.lastStudiedAt = Date.now() - 22 * 3600 * 1000;
  c.clear();
  room.handleRollUniStop(c as any, { stopId: stop.id });
  assert.ok(c.got("unistop_rolled"), "New owner's students can claim");
  assert.strictEqual(stop.ownerSchoolId, "dtu", "Owner leaves when its last knowledge in the footprint expires");
  studyKnowledge(stationTile, "hcmut", 3, Date.now());
  stationTile.knowledge.get("dtu")!.lastStudiedAt = Date.now() - 22 * 3600 * 1000;
  room.handleRollUniStop(a as any, { stopId: stop.id });
  assert.ok(!a.got("unistop_rolled"), "Ownership changes and global timestamp cannot reset cooldown");
  room.handleRollUniStop(a as any, { stopId: otherStop.id });
  assert.ok(a.got("unistop_rolled"), "Other station has independent cooldown");

  // Isolate territory tests from randomized map objects.
  room.state.claimedTiles.clear(); room.landmarkTileMap.clear();
  const chest = Array.from(room.state.chests.values())[0]; chest.x = 500; chest.z = 500;
  const player = room.state.players.get(a.sessionId)!; player.aspireKeys = 2;
  a.clear();
  room.handleOpenChest(a as any, { chestId: chest.id, x: 500, z: 500 });
  assert.ok(!chest.isOpened && player.aspireKeys === 2, "Coordinates cannot bypass knowledge reach");
  const foreign = new TileState(); foreign.x = 498; foreign.y = 500;
  studyKnowledge(foreign, "dtu", 1, Date.now());
  room.state.claimedTiles.set("498,500", foreign);
  room.handleOpenChest(a as any, { chestId: chest.id });
  assert.ok(!chest.isOpened, "Another school's reach is insufficient");
  studyKnowledge(foreign, "hcmut", 3, Date.now());
  room.handleOpenChest(a as any, { chestId: chest.id });
  assert.ok(chest.isOpened && a.got("chest_opened"), "Shared-school knowledge touching 2x2 footprint qualifies");
  b.clear(); room.state.players.get(b.sessionId)!.aspireKeys = 1;
  room.handleOpenChest(b as any, { chestId: chest.id });
  assert.ok(!b.got("chest_opened"), "Second player cannot reopen globally consumed chest");
  assert.strictEqual(room.state.players.get(b.sessionId)!.aspireKeys, 1);

  const start = new TileState(); start.x = 100; start.y = 100;
  studyKnowledge(start, "dtu", 1, Date.now()); studyKnowledge(start, "hcmut", 3, Date.now());
  room.state.claimedTiles.set("100,100", start);
  room.handleClaimAction(a as any, { x: 101, y: 100 });
  assert.ok(room.tileHasKnowledge(room.state.claimedTiles.get("101,100"), "hcmut"));
  const counted = room.state.schoolKnowledgeTiles.get("hcmut")!;
  const sharedCount = room.state.schoolKnowledgeTiles.get("dtu")!;
  assert.ok(sharedCount > 0, "Each participant receives a campaign tile for shared knowledge");
  const afterExplore = player.personalTroops;
  room.handleClaimAction(a as any, { x: 101, y: 100 });
  assert.strictEqual(player.personalTroops, afterExplore, "Repeat exploration is idempotent");
  assert.strictEqual(room.state.schoolKnowledgeTiles.get("hcmut"), counted, "Study/no-op never inflates campaign tile count");
  room.state.schoolPoints.set("dtu", 1000000);
  room.checkLeaderboardRankLead();
  assert.strictEqual((room as any).currentLeaderSchoolId, "hcmut", "Spending-point balance must not determine campaign rank");
  const remote = new TileState(); remote.x = 900; remote.y = 900;
  studyKnowledge(remote, "dtu", 1, Date.now()); room.state.claimedTiles.set("900,900", remote);
  const points = player.personalTroops;
  room.handleClaimAction(a as any, { x: 900, y: 900 });
  assert.strictEqual(player.personalTroops, points, "Remote exchange rejected before spending");
  assert.strictEqual(remote.knowledge.size, 1);
  // Third school joins the same tile without replacing either participant.
  studyKnowledge(start, "hsu", 3, Date.now());
  assert.strictEqual(start.knowledge.size, 3);
  room.onLeave(a as any, true);
  const reconnect = new ClientMock("rules_a_reconnected");
  room.onJoin(reconnect as any, { email: "rules_a@hcmut.edu.vn" });
  const snapshot = reconnect.messages.find(m => m.type === "knowledge_sync")!.data;
  assert.strictEqual(snapshot.tiles.find((t: any) => t.x === 100 && t.y === 100).schools.length, 3,
    "Reconnect snapshot carries every coexisting school for mixed rendering");
  start.knowledge.get("hcmut")!.lastStudiedAt = Date.now() - 23 * 3600 * 1000;
  const beforeFade = room.state.schoolKnowledgeTiles.get("hcmut")!;
  assert.ok(!room.tileHasKnowledge(start, "hcmut"));
  assert.strictEqual(room.state.schoolKnowledgeTiles.get("hcmut"), beforeFade - 1, "Knowledge fading removes only its school's campaign credit");
  assert.ok(room.tileHasKnowledge(start, "dtu") && room.tileHasKnowledge(start, "hsu"));

  // Housekeeping touches at most its fixed budget, irrespective of tile count.
  room.state.claimedTiles.clear();
  room.state.unistops.clear(); // Isolate housekeeping from bounded station-footprint lazy reads.
  for (let i = 0; i < 1000; i++) {
    const tile = new TileState(); tile.x = i; tile.y = 600;
    studyKnowledge(tile, "dtu", 1, Date.now() - 23 * 3600 * 1000);
    room.state.claimedTiles.set(`${i},600`, tile);
  }
  room.processKnowledgeDecay();
  assert.strictEqual(Array.from(room.state.claimedTiles.values()).filter(t => !t.knowledge.size).length, 256);
} finally { room.onDispose(); }

assert.strictEqual(beaconOvertakeTarget(1000), 1050);
assert.strictEqual(beaconOvertakeTarget(1001), 1052);
assert.strictEqual(beaconOvertakeTarget(1050), 1103);
assert.strictEqual(beaconOvertakeTarget(2000), 2100);
const reviewed = new TileState();
const reviewTime = Date.now();
studyKnowledge(reviewed, "hcmut", 1, reviewTime);
assert.strictEqual(retentionAt(reviewed.knowledge.get("hcmut")!, reviewTime + 21 * 3600 * 1000), 10);
assert.strictEqual(retentionAt(reviewed.knowledge.get("hcmut")!, reviewTime + 22 * 3600 * 1000), 0);
studyKnowledge(reviewed, "hcmut", 1, reviewTime + 21 * 3600 * 1000);
assert.strictEqual(retentionAt(reviewed.knowledge.get("hcmut")!, reviewTime + 22 * 3600 * 1000), 100,
  "Review before expiry renews a complete 22-hour cycle");
const contexts: BuffContext[] = [];
const director = new BuffDirector([{ id: "test-comeback", eligible: c => c.schoolRank > 1,
  pointBonus: c => { contexts.push(c); return 8; } }], () => 0);
const scores = new Map([["hcmut", 100], ["dtu", 10]]);
assert.strictEqual(director.bonus("lm1", "hcmut", scores, 6), 6, "Empty eligible pool retains existing buff");
assert.strictEqual(director.bonus("lm2", "dtu", scores, 6), 8);
assert.deepStrictEqual(contexts[0], { landmarkId: "lm2", schoolId: "dtu", activationOrder: 2, schoolRank: 2, comebackGap: 90 });
director.bonus("lm2", "dtu", scores, 6);
assert.strictEqual(contexts[1].activationOrder, 2, "Ticks must not reroll");
director.bonus("lm1", "dtu", scores, 6);
assert.strictEqual(contexts[2].activationOrder, 3, "Overtake receives new context");
director.reset(); director.bonus("lm1", "dtu", scores, 6);
assert.strictEqual(contexts[3].activationOrder, 1);
console.log("Coexistence, station authorization/cooldowns, chest reach/global consumption, bounded decay and Buff Director tests passed.");
process.exit(0);
