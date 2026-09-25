import { BotManager } from '../src/bots/BotManager';
import { GameState, TileState } from '../src/schema/GameState';
import { SCHOOL_IDS } from '../../shared/constants/schools';
import { TerritoryClusterEngine } from '../../shared/engine/territoryClusterEngine';
import * as assert from 'assert';

console.log('--- Starting BotManager Adjacency & ClusterEngine Sync Tests ---');

// Mock room object
class MockRoom {
  public clusterEngine = new TerritoryClusterEngine(1000, 1000);
  public updates: { schoolId: string; x: number; y: number }[] = [];

  public getSchoolNumericId(schoolId: string): number {
    return SCHOOL_IDS.indexOf(schoolId) + 1;
  }

  public handleClusterUpdate(schoolId: string, x: number, y: number) {
    this.updates.push({ schoolId, x, y });
  }

  public checkLandmarkCapture(_lmKey: string) {}
}

const state = new GameState();
const botManager = new BotManager();
const mockRoom = new MockRoom();

// Test 1: Spaced HQs initialization and clusterEngine sync
console.log('\n[Test 1] Spaced HQs Initialization');
let i = 0;
for (const schoolId of SCHOOL_IDS) {
  const x = 150 + (i % 4) * 200;
  const y = 150 + Math.floor(i / 4) * 250;
  i++;
  const hexRadius = 10;
  for (let dx = -hexRadius; dx <= hexRadius; dx++) {
    const maxY = Math.floor((2 * hexRadius - Math.abs(dx)) / Math.sqrt(3));
    for (let dy = -maxY; dy <= maxY; dy++) {
      const tx = x + dx;
      const ty = y + dy;
      const key = `${tx},${ty}`;
      const tile = new TileState();
      tile.x = tx;
      tile.y = ty;
      tile.ownerId = schoolId;
      tile.defenseTier = 1;
      tile.hp = 100;
      tile.maxHp = 100;
      state.claimedTiles.set(key, tile);
      botManager.addOwnedTile(schoolId, tx, ty, state);
      mockRoom.clusterEngine.setTile(tx, ty, mockRoom.getSchoolNumericId(schoolId), tile.defenseTier, tile.hp);
    }
  }
  state.schoolTroops.set(schoolId, 500);
}
console.log('✅ HQs initialized successfully');

// Test 2: Process 50 bot expansion steps
console.log('\n[Test 2] Process 50 Bot Expansion Steps');
for (let step = 0; step < 50; step++) {
  botManager.processBots(state, mockRoom);
}

// Verify Adjacency for ALL claimed tiles in state
let disconnectedCount = 0;
let totalChecked = 0;
for (const [key, tile] of state.claimedTiles) {
  if (!tile.ownerId) continue;
  totalChecked++;
  const [x, y] = key.split(',').map(Number);
  const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  let hasFriendly = false;
  for (const [nx, ny] of neighbors) {
    const n = state.claimedTiles.get(`${nx},${ny}`);
    if (n && n.ownerId === tile.ownerId) {
      hasFriendly = true;
      break;
    }
  }
  if (!hasFriendly) {
    console.error(`❌ Disconnected tile found: (${x}, ${y}) owned by ${tile.ownerId}`);
    disconnectedCount++;
  }
}

assert.strictEqual(disconnectedCount, 0, `No disconnected tiles allowed, found: ${disconnectedCount}`);
console.log(`✅ Adjacency verified: ${totalChecked} tiles checked, 0 disconnected.`);

// Test 3: Verify clusterEngine.ownerMap is 100% synchronized with state.claimedTiles
console.log('\n[Test 3] Verify clusterEngine.ownerMap Synchronization');
let desyncCount = 0;
const engineState = mockRoom.clusterEngine.getFullState();

for (const [key, tile] of state.claimedTiles) {
  const [x, y] = key.split(',').map(Number);
  const expectedNumId = tile.ownerId ? mockRoom.getSchoolNumericId(tile.ownerId) : 0;
  const engineNumId = engineState.ownerMap[mockRoom.clusterEngine.getIndex(x, y)];
  if (expectedNumId !== engineNumId) {
    console.error(`❌ Desync at (${x}, ${y}): state=${tile.ownerId} (${expectedNumId}), engine=${engineNumId}`);
    desyncCount++;
  }
}

assert.strictEqual(desyncCount, 0, `clusterEngine.ownerMap must match state.claimedTiles 100%, found desyncs: ${desyncCount}`);
console.log(`✅ clusterEngine synchronization verified: 100% match (${totalChecked} tiles checked).`);

// Test 4: Orphaned Frontier Pruning on Tile Loss
console.log('\n[Test 4] Orphaned Frontier Pruning on Tile Loss');
// Create an isolated branch: school "uit" owns (100, 100) and (100, 101)
const uitNumId = mockRoom.getSchoolNumericId('uit');
const tBranch1 = new TileState(); tBranch1.x = 100; tBranch1.y = 100; tBranch1.ownerId = 'uit';
const tBranch2 = new TileState(); tBranch2.x = 100; tBranch2.y = 101; tBranch2.ownerId = 'uit';
state.claimedTiles.set('100,100', tBranch1);
state.claimedTiles.set('100,101', tBranch2);
botManager.addOwnedTile('uit', 100, 100, state);
botManager.addOwnedTile('uit', 100, 101, state);

// (100, 102) is a neighbor of (100, 101) and was added to frontier
const uitFrontier = (botManager as any).frontiers.get('uit') as Set<string>;
assert.strictEqual(uitFrontier.has('100,102'), true, '(100, 102) should be in frontier');

// Now simulate losing (100, 101) - remove from state and call removeOwnedTile
state.claimedTiles.delete('100,101');
botManager.removeOwnedTile('uit', 100, 101, state);

// (100, 102) has NO other friendly neighbor, so it MUST have been pruned from frontier!
assert.strictEqual(uitFrontier.has('100,102'), false, '(100, 102) must be pruned from frontier because it has no friendly neighbors');
console.log('✅ Orphaned frontier tile (100, 102) successfully pruned upon tile loss.');

console.log('\n--- All BotManager Tests Passed Successfully! ---');
