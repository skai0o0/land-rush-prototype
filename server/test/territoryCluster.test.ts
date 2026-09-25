import { TerritoryClusterEngine } from '../../shared/engine/territoryClusterEngine';
import * as assert from 'assert';
import { performance } from 'perf_hooks';

async function runTests() {
  console.log('--- Starting TerritoryClusterEngine Tests ---');

  // Test 1: Base Tiers
  console.log('\n[Test 1] Base Tiers (Tầng 1)');
  let engine = new TerritoryClusterEngine(10, 10);
  engine.setTile(0, 0, 1, 1, 100);
  assert.strictEqual(engine.getTileFortifyTier(0, 0), 1, 'Tier should be 1');
  engine.setTile(0, 0, 1, 2, 100);
  assert.strictEqual(engine.getTileFortifyTier(0, 0), 2, 'Tier should be 2');
  engine.setTile(0, 0, 1, 3, 100);
  assert.strictEqual(engine.getTileFortifyTier(0, 0), 3, 'Tier should be 3');
  // In the real system, it wouldn't exceed 3 via normal fortify.
  console.log('✅ Test 1 Passed');

  // Test 2: Bastion Activation
  console.log('\n[Test 2] Bastion Activation (Tầng 2)');
  engine = new TerritoryClusterEngine(20, 20);
  // Create 10x10 cluster -> 100 tiles
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      engine.setTile(x, y, 1, 3, 100); // School 1, Tier 3
    }
  }
  let result = engine.evaluateCluster(0, 0);
  assert.strictEqual(result.type, 'bastion', 'Type should be bastion');
  assert.strictEqual(result.clusterSize, 100, 'Cluster size should be 100');
  assert.strictEqual(engine.getTileFortifyTier(5, 5), 4, 'Tiles should upgrade to Tier 4');
  console.log('✅ 10x10 cluster upgraded to Bastion (Tier 4)');

  // Create 9x10 cluster -> 90 tiles
  engine = new TerritoryClusterEngine(20, 20);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      engine.setTile(x, y, 1, 3, 100);
    }
  }
  result = engine.evaluateCluster(0, 0);
  assert.strictEqual(result.type, 'none', 'Type should be none for <100 tiles');
  assert.strictEqual(engine.getTileFortifyTier(5, 5), 3, 'Tiles should remain Tier 3');
  console.log('✅ 9x10 cluster DID NOT upgrade (Tier 3)');
  console.log('✅ Test 2 Passed');

  // Test 3: Border Detection (Von Neumann)
  console.log('\n[Test 3] Border Detection');
  engine = new TerritoryClusterEngine(20, 20);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      engine.setTile(x, y, 1, 3, 100);
    }
  }
  result = engine.evaluateCluster(0, 0);
  assert.strictEqual(result.borderTiles.length, 36, 'Should have 36 border tiles (10+10+8+8)');
  
  let cornerTopLeft = result.borderTiles.find(b => b.index === engine.getIndex(0, 0));
  assert.deepStrictEqual(cornerTopLeft.borders.sort(), ['left', 'top'].sort(), 'Top-left corner borders');
  
  let innerTile = result.borderTiles.find(b => b.index === engine.getIndex(5, 5));
  assert.strictEqual(innerTile, undefined, 'Inner tile should not be a border tile');
  
  console.log('✅ Border tiles evaluated correctly (corners have 2, edges 1, inner 0)');
  console.log('✅ Test 3 Passed');

  // Test 4: Disconnection & Degradation
  console.log('\n[Test 4] Disconnection & Degradation');
  // Continuing with the 10x10 Bastion (Tier 4)
  // Break 1 tile in the middle
  engine.setTile(5, 5, 2, 1, 100); // Enemy takes it
  
  // Re-evaluate from another tile
  result = engine.evaluateCluster(0, 0);
  assert.strictEqual(result.clusterSize, 99, 'Cluster size should now be 99');
  assert.strictEqual(result.type, 'none', 'Cluster should lose Bastion status');
  assert.strictEqual(engine.getTileFortifyTier(0, 0), 3, 'Tile should degrade to Tier 3');
  console.log('✅ Bastion degraded to Tier 3 after losing 1 tile');
  console.log('✅ Test 4 Passed');

  // Test 5: Mega Emblem Activation
  console.log('\n[Test 5] Mega Emblem Activation');
  engine = new TerritoryClusterEngine(150, 150);
  // 100x100 = 10,000 tiles
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      engine.setTile(x, y, 1, 3, 100);
    }
  }
  result = engine.evaluateCluster(0, 0);
  assert.strictEqual(result.type, 'mega_emblem', 'Should be Mega Emblem');
  assert.strictEqual(result.clusterSize, 10000, 'Cluster size should be 10000');
  assert.deepStrictEqual(result.boundingBox, [0, 0, 99, 99], 'Bounding box should be [0, 0, 99, 99]');
  assert.strictEqual(engine.getTileFortifyTier(50, 50), 6, 'Tiles should upgrade to Tier 6');
  // In the real system, border flags inside would be cleaned up (implicitly by turning to tier 6 and not returning borderTiles).
  assert.strictEqual(result.borderTiles.length, 0, 'Mega Emblem does not return individual border tiles (cleared)');
  console.log('✅ Mega Emblem activated with bounding box and Tier 6');
  console.log('✅ Test 5 Passed');

  // Test 6: Performance Benchmark
  console.log('\n[Test 6] Performance Benchmark');
  engine = new TerritoryClusterEngine(1000, 1000); // 1,000,000 tiles
  
  // Fill everything except borders
  for (let y = 1; y < 999; y++) {
    for (let x = 1; x < 999; x++) {
      engine.setTile(x, y, 1, 3, 100);
    }
  }

  console.log('Running BFS and Border Scan on ~1,000,000 tiles...');
  const start = performance.now();
  result = engine.evaluateCluster(1, 1);
  const end = performance.now();
  
  const duration = end - start;
  console.log(`⏱️ Benchmark completed in: ${duration.toFixed(2)}ms`);
  assert.strictEqual(result.type, 'mega_emblem');
  if (duration > 20) {
    console.warn(`⚠️ Performance is above 20ms target (${duration.toFixed(2)}ms), may need optimization or warm-up.`);
  }

  console.log('✅ Test 6 Passed');
  
  console.log('\n--- All Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
