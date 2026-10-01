import * as assert from 'assert';
import {
  LandState,
  encodeBytesBase64,
  decodeBytesBase64,
  shouldDropBatch,
  MAP_WIDTH,
  MAP_HEIGHT
} from '../../shared/land/landState';

async function runTests() {
  console.log('--- Starting LandState Tests ---');

  // Test 1: setOwner bounds reject
  console.log('\n[Test 1] setOwner bounds reject');
  {
    const s = new LandState();
    assert.strictEqual(s.width, MAP_WIDTH);
    assert.strictEqual(s.height, MAP_HEIGHT);
    assert.strictEqual(s.owner.length, 1_000_000);

    assert.throws(() => s.setOwner(-1, 0, 1), RangeError);
    assert.throws(() => s.setOwner(0, -1, 1), RangeError);
    assert.throws(() => s.setOwner(1000, 0, 1), RangeError);
    assert.throws(() => s.setOwner(0, 1000, 1), RangeError);
    assert.throws(() => s.setOwner(1.5, 0, 1), RangeError);
    assert.throws(() => s.setOwner(0, 0, -1), RangeError);
    assert.throws(() => s.setOwner(0, 0, 256), RangeError);
    assert.throws(() => s.setOwnerAt(-1, 1), RangeError);
    assert.throws(() => s.setOwnerAt(1_000_000, 1), RangeError);

    // Rejected writes must not touch state
    assert.strictEqual(s.getOwner(0, 0), 0);
    assert.strictEqual(s.seq, 0);

    // Boundary tiles are legal
    s.setOwner(0, 0, 1);
    s.setOwner(999, 999, 2);
    assert.strictEqual(s.getOwner(0, 0), 1);
    assert.strictEqual(s.getOwner(999, 999), 2);
    assert.strictEqual(s.getIndex(3, 4), 4 * 1000 + 3);
    assert.throws(() => s.getIndex(-1, 0), RangeError);
    console.log('✅ Test 1 Passed');
  }

  // Test 2: dirty flush payload shape and clear
  console.log('\n[Test 2] dirty flush payload shape and clear');
  {
    const s = new LandState();
    s.setOwner(1, 2, 1);
    s.setOwner(3, 2, 1);
    s.setOwner(5, 5, 2);
    // Re-set same value: no extra dirty
    s.setOwner(1, 2, 1);
    // Change mind before flush: final value wins
    s.setOwner(5, 5, 3);

    const ts = 123456;
    const batch = s.flushOwnership(ts);
    assert.strictEqual(batch.ts, ts);
    assert.strictEqual(batch.seq, 1);
    assert.strictEqual(batch.sets.length, 2);

    const byO = new Map(batch.sets.map(e => [e.o, e.idx]));
    assert.deepStrictEqual(byO.get(1), [2 * 1000 + 1, 2 * 1000 + 3]);
    assert.deepStrictEqual(byO.get(3), [5 * 1000 + 5]);

    // Dirty cleared: second flush is empty and does not bump seq
    const empty = s.flushOwnership(ts + 1);
    assert.deepStrictEqual(empty.sets, []);
    assert.strictEqual(empty.seq, 1);

    // New change bumps seq monotonically
    s.setOwner(0, 0, 1);
    const batch2 = s.flushOwnership();
    assert.strictEqual(batch2.seq, 2);
    assert.deepStrictEqual(batch2.sets, [{ o: 1, idx: [0] }]);

    // Combat flush shape + clear
    s.setCombat(4, 5, { hp: 80, maxHp: 100, defenseTier: 2 });
    s.setCombat(7, 8, { hp: 40, maxHp: 100, defenseTier: 0 });
    const cts = 999;
    const combat = s.flushCombat(cts);
    assert.strictEqual(combat.ts, cts);
    assert.strictEqual(combat.seq, 3);
    assert.strictEqual(combat.tiles.length, 2);
    assert.deepStrictEqual(combat.tiles[0], { i: 5 * 1000 + 4, hp: 80, maxHp: 100, tier: 2 });
    assert.deepStrictEqual(combat.tiles[1], { i: 8 * 1000 + 7, hp: 40, maxHp: 100, tier: 0 });

    const combatEmpty = s.flushCombat();
    assert.deepStrictEqual(combatEmpty.tiles, []);
    assert.strictEqual(combatEmpty.seq, 3);

    s.clearCombat(4, 5);
    const combatClear = s.flushCombat();
    assert.deepStrictEqual(combatClear.tiles, [{ i: 5 * 1000 + 4, hp: 0, maxHp: 0, tier: 0 }]);
    assert.strictEqual(s.getCombat(4, 5), undefined);
    console.log('✅ Test 2 Passed');
  }

  // Test 3: snapshot base64 round-trip
  console.log('\n[Test 3] snapshot base64 round-trip (1e6 bytes)');
  {
    // Raw helper round-trip on full 1MB pattern
    const raw = new Uint8Array(1_000_000);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i % 251;
    }
    const b64 = encodeBytesBase64(raw);
    const back = decodeBytesBase64(b64);
    assert.strictEqual(back.length, 1_000_000);
    assert.ok(Buffer.from(back).equals(Buffer.from(raw)), 'base64 round-trip must be byte-identical');

    const s = new LandState();
    s.setOwner(0, 0, 1);
    s.setOwner(999, 999, 9);
    s.setOwner(500, 500, 3);
    const snap = s.snapshot();
    assert.strictEqual(snap.epoch, 0);
    assert.strictEqual(snap.seq, 0);
    assert.strictEqual(snap.w, 1000);
    assert.strictEqual(snap.h, 1000);
    assert.strictEqual(snap.ownerBase64.length, Math.ceil(1_000_000 / 3) * 4);

    const decoded = decodeBytesBase64(snap.ownerBase64);
    assert.strictEqual(decoded.length, 1_000_000);
    assert.strictEqual(decoded[0], 1);
    assert.strictEqual(decoded[999 * 1000 + 999], 9);
    assert.strictEqual(decoded[500 * 1000 + 500], 3);

    const restored = new LandState();
    restored.applySnapshot(snap);
    assert.strictEqual(restored.getOwner(0, 0), 1);
    assert.strictEqual(restored.getOwner(999, 999), 9);
    assert.strictEqual(restored.getOwner(500, 500), 3);
    assert.strictEqual(restored.epoch, snap.epoch);
    assert.strictEqual(restored.seq, snap.seq);
    assert.ok(Buffer.from(restored.owner).equals(Buffer.from(s.owner)), 'applySnapshot restores full owner bytes');
    console.log('✅ Test 3 Passed');
  }

  // Test 4: stale-seq drop helper
  console.log('\n[Test 4] stale-seq drop helper');
  {
    assert.strictEqual(shouldDropBatch(10, 10), true, 'seq == lastSnapSeq must drop');
    assert.strictEqual(shouldDropBatch(10, 9), true, 'seq < lastSnapSeq must drop');
    assert.strictEqual(shouldDropBatch(10, 11), false, 'seq > lastSnapSeq must apply');
    assert.strictEqual(shouldDropBatch(0, 1), false);
    console.log('✅ Test 4 Passed');
  }

  // Test 5: epoch bump / reset
  console.log('\n[Test 5] epoch bump / reset');
  {
    const s = new LandState();
    s.setOwner(1, 1, 1);
    s.flushOwnership();
    const e0 = s.epoch;
    const e1 = s.bumpEpoch();
    assert.strictEqual(e1, e0 + 1);
    assert.strictEqual(s.epoch, e1);

    s.reset();
    assert.strictEqual(s.getOwner(1, 1), 0);
    assert.strictEqual(s.combat.size, 0);
    assert.strictEqual(s.epoch, e1 + 1);
    console.log('✅ Test 5 Passed');
  }

  console.log('\n--- All LandState Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
