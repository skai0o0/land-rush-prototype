import * as assert from 'assert';
import {
  ClientLandSync,
  applyOwnBatch,
  applyCombatToMap,
  chunkKeyForIndex,
  chunkKeyForTile,
  shouldDropStaleFrame,
  DEFAULT_CHUNK_SIZE
} from '../../shared/land/clientSync';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  encodeBytesBase64,
  LandState
} from '../../shared/land/landState';
import {
  makeSnap,
  makeOwnBatch,
  makeCombat,
  SnapFrame,
  OwnBatchFrame,
  CombatFrame
} from '../../shared/land/protocol';

async function runTests() {
  console.log('--- Starting Client Sync Tests (T4 / S2.4) ---');

  // Test 1: applyOwnBatch writes only listed indices and reports dirty chunks
  console.log('\n[Test 1] applyOwnBatch dirty tiles + dirty chunks');
  {
    const owner = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    const idxA = 2 * MAP_WIDTH + 3; // x=3,y=2 -> chunk 0,0
    const idxB = 7 * MAP_WIDTH + 55; // x=55,y=7 -> chunk 1,0
    const idxC = 120 * MAP_WIDTH + 3; // x=3,y=120 -> chunk 0,2

    const result = applyOwnBatch(owner, [
      { o: 1, idx: [idxA, idxB] },
      { o: 2, idx: [idxC] }
    ]);

    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.dirtyTiles.length, 3);
    assert.strictEqual(owner[idxA], 1);
    assert.strictEqual(owner[idxB], 1);
    assert.strictEqual(owner[idxC], 2);
    // Untouched neighbours stay 0 — no 1e6 object materialization
    assert.strictEqual(owner[0], 0);
    assert.strictEqual(owner[idxA + 1], 0);

    const chunks = new Set(result.dirtyChunks);
    assert.strictEqual(chunks.has('0,0'), true, 'tile (3,2) -> chunk 0,0');
    assert.strictEqual(chunks.has('1,0'), true, 'tile (55,7) -> chunk 1,0');
    assert.strictEqual(chunks.has('0,2'), true, 'tile (3,120) -> chunk 0,2');
    assert.strictEqual(result.dirtyChunks.length, 3, 'only 3 dirty chunks for 3 tiles');

    // Idempotent re-apply of same values produces no dirty work
    const again = applyOwnBatch(owner, [{ o: 1, idx: [idxA, idxB] }, { o: 2, idx: [idxC] }]);
    assert.strictEqual(again.applied, false);
    assert.strictEqual(again.dirtyTiles.length, 0);
    assert.strictEqual(again.dirtyChunks.length, 0);
    console.log('✅ Test 1 Passed');
  }

  // Test 2: chunk key math matches chunkGridManager (CHUNK_SIZE = 50)
  console.log('\n[Test 2] chunk key helpers');
  {
    assert.strictEqual(chunkKeyForTile(0, 0), '0,0');
    assert.strictEqual(chunkKeyForTile(49, 49), '0,0');
    assert.strictEqual(chunkKeyForTile(50, 0), '1,0');
    assert.strictEqual(chunkKeyForTile(0, 50), '0,1');
    assert.strictEqual(chunkKeyForTile(999, 999), '19,19');
    assert.strictEqual(chunkKeyForIndex(2 * MAP_WIDTH + 3, MAP_WIDTH), '0,0');
    assert.strictEqual(chunkKeyForIndex(7 * MAP_WIDTH + 55, MAP_WIDTH), '1,0');
    assert.strictEqual(DEFAULT_CHUNK_SIZE, 50);
    console.log('✅ Test 2 Passed');
  }

  // Test 3: stale batch / wrong-epoch drop (S2.2)
  console.log('\n[Test 3] stale seq + wrong epoch drop');
  {
    assert.strictEqual(shouldDropStaleFrame({ seq: 5 }, 5, 0), true, 'seq == lastSnapSeq drops');
    assert.strictEqual(shouldDropStaleFrame({ seq: 4 }, 5, 0), true, 'seq < lastSnapSeq drops');
    assert.strictEqual(shouldDropStaleFrame({ seq: 6 }, 5, 0), false, 'seq > lastSnapSeq applies');
    assert.strictEqual(shouldDropStaleFrame({ seq: 6, epoch: 1 }, 5, 0), true, 'wrong epoch drops');
    assert.strictEqual(shouldDropStaleFrame({ seq: 6, epoch: 0 }, 5, 0), false, 'matching epoch applies');
    // Before any snap (lastEpoch = -1) epoch is ignored
    assert.strictEqual(shouldDropStaleFrame({ seq: 1, epoch: 9 }, 0, -1), false);

    const sync = new ClientLandSync();
    sync.applySnap(makeSnap(0, 10, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(sync.size))) as SnapFrame);
    assert.strictEqual(sync.lastSnapSeq, 10);
    assert.strictEqual(sync.epoch, 0);
    assert.strictEqual(sync.ready, true);

    const dropped = sync.applyOwnBatch(makeOwnBatch(5, Date.now(), [{ o: 1, idx: [0] }]) as OwnBatchFrame);
    assert.strictEqual(dropped.applied, false);
    assert.strictEqual(sync.owner[0], 0, 'stale batch must not touch owner bytes');

    const applied = sync.applyOwnBatch(makeOwnBatch(11, Date.now(), [{ o: 1, idx: [0] }]) as OwnBatchFrame);
    assert.strictEqual(applied.applied, true);
    assert.strictEqual(sync.owner[0], 1);
    assert.strictEqual(sync.lastSnapSeq, 11);
    console.log('✅ Test 3 Passed');
  }

  // Test 4: snap fills local Uint8Array from base64 (1e6 bytes, no tile objects)
  console.log('\n[Test 4] snap -> local ownership buffer');
  {
    const server = new LandState();
    server.setOwner(10, 20, 1);
    server.setOwner(999, 999, 3);
    const snap = server.snapshot();
    const frame = makeSnap(snap.epoch, snap.seq, snap.w, snap.h, snap.ownerBase64) as SnapFrame;

    const sync = new ClientLandSync();
    assert.strictEqual(sync.owner.length, 1_000_000);
    const painted = sync.applySnap(frame);

    assert.strictEqual(sync.getOwner(10, 20), 1);
    assert.strictEqual(sync.getOwner(999, 999), 3);
    assert.strictEqual(sync.getOwner(0, 0), 0);
    assert.strictEqual(painted.paintedTiles, 2);
    assert.strictEqual(sync.owner instanceof Uint8Array, true, 'dense bytes, not 1e6 objects');

    // Wrong-size snapshot throws
    const bad = makeSnap(0, 0, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(10))) as SnapFrame;
    assert.throws(() => sync.applySnap(bad), /size mismatch/);
    console.log('✅ Test 4 Passed');
  }

  // Test 5: combat sparse overlay (tooltips/stats) + clear-by-zero
  console.log('\n[Test 5] combat overlay sparse map');
  {
    const sync = new ClientLandSync();
    sync.applySnap(makeSnap(0, 1, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(sync.size))) as SnapFrame);

    const combatFrame = makeCombat(2, Date.now(), [
      { i: 15, hp: 80, maxHp: 100, tier: 2 },
      { i: 999999, hp: 40, maxHp: 100, tier: 0 }
    ]) as CombatFrame;

    const result = sync.applyCombat(combatFrame);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(sync.combat.size, 2);

    const t = sync.getCombatAt(15);
    assert.strictEqual(t?.hp, 80);
    assert.strictEqual(t?.maxHp, 100);
    assert.strictEqual(t?.defenseTier, 2);
    assert.strictEqual(sync.getCombat(15 % MAP_WIDTH, (15 / MAP_WIDTH) | 0)?.hp, 80);

    // Zeroed tile clears the overlay entry
    const cleared = sync.applyCombat(makeCombat(3, Date.now(), [
      { i: 15, hp: 0, maxHp: 0, tier: 0 }
    ]) as CombatFrame);
    assert.strictEqual(cleared.applied, true);
    assert.strictEqual(sync.getCombatAt(15), undefined);
    assert.strictEqual(sync.combat.size, 1);

    // Stale combat frame is ignored
    const stale = sync.applyCombat(makeCombat(1, Date.now(), [
      { i: 20, hp: 10, maxHp: 10, tier: 1 }
    ]) as CombatFrame);
    assert.strictEqual(stale.applied, false);
    assert.strictEqual(sync.getCombatAt(20), undefined);

    // applyCombatToMap standalone
    const map = new Map<number, { hp: number; maxHp: number; defenseTier: number }>();
    applyCombatToMap(map, [{ i: 7, hp: 5, maxHp: 5, tier: 1 }]);
    assert.strictEqual(map.get(7)?.defenseTier, 1);
    console.log('✅ Test 5 Passed');
  }

  // Test 6: countOwners for territory stats without tile objects
  console.log('\n[Test 6] countOwners');
  {
    const sync = new ClientLandSync();
    sync.applyOwnBatch(makeOwnBatch(1, Date.now(), [
      { o: 1, idx: [0, 1, 2] },
      { o: 2, idx: [10] }
    ]) as OwnBatchFrame);
    const counts = sync.countOwners();
    assert.strictEqual(counts[1], 3);
    assert.strictEqual(counts[2], 1);
    assert.strictEqual(counts[0], undefined);
    console.log('✅ Test 6 Passed');
  }

  // Test 7: snap includes sparse combat dump (joiners keep HP/defense)
  console.log('\n[Test 7] snap carries combat list');
  {
    const server = new LandState();
    server.setOwner(10, 20, 1);
    server.setCombat(10, 20, { hp: 80, maxHp: 100, defenseTier: 2 });
    server.setCombat(50, 50, { hp: 40, maxHp: 100, defenseTier: 1 });
    const snap = server.snapshot();
    assert.strictEqual(snap.combat.length, 2, 'snapshot must include sparse combat tiles');

    const frame = makeSnap(snap.epoch, snap.seq, snap.w, snap.h, snap.ownerBase64, snap.combat) as SnapFrame;
    assert.strictEqual(frame.combat?.length, 2);

    const sync = new ClientLandSync();
    sync.applySnap(frame);
    assert.strictEqual(sync.combat.size, 2, 'applySnap must populate combat overlay from snap');
    assert.strictEqual(sync.getCombat(10, 20)?.defenseTier, 2);
    assert.strictEqual(sync.getCombat(10, 20)?.hp, 80);
    assert.strictEqual(sync.getCombat(50, 50)?.defenseTier, 1);

    // Snap without combat list clears the overlay (old server / reset path)
    const bare = makeSnap(1, 5, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(sync.size))) as SnapFrame;
    sync.applySnap(bare);
    assert.strictEqual(sync.combat.size, 0);

    // LandState.applySnapshot restores combat alongside owner bytes
    const restored = new LandState();
    restored.applySnapshot(snap);
    assert.strictEqual(restored.combat.size, 2);
    assert.strictEqual(restored.getCombat(10, 20)?.hp, 80);
    console.log('✅ Test 7 Passed');
  }

  // Test 8: incremental owner counts match full countOwnersFull after batches
  console.log('\n[Test 8] incremental counts == full scan after batches');
  {
    const sync = new ClientLandSync();
    sync.applySnap(makeSnap(0, 1, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(sync.size))) as SnapFrame);

    sync.applyOwnBatch(makeOwnBatch(2, Date.now(), [
      { o: 1, idx: [0, 1, 2, 3, 4] },
      { o: 2, idx: [100, 101] }
    ]) as OwnBatchFrame);
    sync.applyOwnBatch(makeOwnBatch(3, Date.now(), [
      { o: 2, idx: [0, 1] },       // steal two from o=1
      { o: 3, idx: [2] }
    ]) as OwnBatchFrame);
    sync.applyOwnBatch(makeOwnBatch(4, Date.now(), [
      { o: 0, idx: [100, 101, 3] }  // release three
    ]) as OwnBatchFrame);

    const incremental = sync.countOwners();
    const full = sync.countOwnersFull();
    assert.deepStrictEqual(incremental, full, 'incremental counts must match full O(1M) scan');
    // Expected by hand:
    // batch2: o1={0,1,2,3,4}, o2={100,101}
    // batch3: o2 steals 0,1; o3 gets 2  ->  o1={3,4}, o2={0,1,100,101}, o3={2}
    // batch4: release 100,101,3         ->  o1={4}, o2={0,1}, o3={2}
    assert.strictEqual(full[1], 1, 'o=1 keeps only idx 4');
    assert.strictEqual(full[2], 2, 'o=2 keeps idx 0,1');
    assert.strictEqual(full[3], 1, 'o=3 keeps idx 2');

    // Snap rebuild also matches
    const server = new LandState();
    server.setOwner(7, 8, 5);
    server.setOwner(9, 9, 5);
    server.setOwner(1, 1, 2);
    const snap = server.snapshot();
    const sync2 = new ClientLandSync();
    sync2.applySnap(makeSnap(snap.epoch, snap.seq, snap.w, snap.h, snap.ownerBase64, snap.combat) as SnapFrame);
    assert.deepStrictEqual(sync2.countOwners(), sync2.countOwnersFull());
    assert.strictEqual(sync2.countOwners()[5], 2);
    assert.strictEqual(sync2.countOwners()[2], 1);
    console.log('✅ Test 8 Passed');
  }

  // Test 9: live frames carry optional epoch — wrong epoch drops (S2.2)
  console.log('\n[Test 9] own_batch/combat epoch drop');
  {
    const sync = new ClientLandSync();
    sync.applySnap(makeSnap(2, 10, MAP_WIDTH, MAP_HEIGHT, encodeBytesBase64(new Uint8Array(sync.size))) as SnapFrame);
    assert.strictEqual(sync.epoch, 2);

    const staleEpoch = sync.applyOwnBatch(
      makeOwnBatch(11, Date.now(), [{ o: 1, idx: [0] }], 1) as OwnBatchFrame
    );
    assert.strictEqual(staleEpoch.applied, false, 'wrong-epoch own_batch must drop');
    assert.strictEqual(sync.owner[0], 0);

    const okEpoch = sync.applyOwnBatch(
      makeOwnBatch(11, Date.now(), [{ o: 1, idx: [0] }], 2) as OwnBatchFrame
    );
    assert.strictEqual(okEpoch.applied, true);
    assert.strictEqual(sync.owner[0], 1);

    const staleCombat = sync.applyCombat(
      makeCombat(12, Date.now(), [{ i: 5, hp: 10, maxHp: 10, tier: 1 }], 9) as CombatFrame
    );
    assert.strictEqual(staleCombat.applied, false, 'wrong-epoch combat must drop');
    assert.strictEqual(sync.getCombatAt(5), undefined);

    const okCombat = sync.applyCombat(
      makeCombat(12, Date.now(), [{ i: 5, hp: 10, maxHp: 10, tier: 1 }], 2) as CombatFrame
    );
    assert.strictEqual(okCombat.applied, true);
    assert.strictEqual(sync.getCombatAt(5)?.defenseTier, 1);
    console.log('✅ Test 9 Passed');
  }

  console.log('\n--- All Client Sync Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
