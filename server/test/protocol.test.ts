import * as assert from 'assert';
import { encodeBytesBase64, decodeBytesBase64 } from '../../shared/land/landState';
import {
  encodeFrame,
  decodeFrame,
  decodeClientFrame,
  decodeServerFrame,
  makeClaim,
  makeFortify,
  makeSnap,
  makeOwnBatch,
  makeCombat,
  makeAck,
  ClaimFrame,
  FortifyFrame,
  SnapFrame,
  OwnBatchFrame,
  CombatFrame,
  AckFrame
} from '../../shared/land/protocol';

function roundTrip<T>(frame: T & { t: string }): T {
  const decoded = decodeFrame(encodeFrame(frame as any));
  assert.ok(decoded, `frame ${frame.t} must decode`);
  assert.deepStrictEqual(decoded, frame, `frame ${frame.t} must round-trip`);
  return decoded as T;
}

async function runTests() {
  console.log('--- Starting Protocol Codec Tests ---');

  // Test 1: claim / fortify (C->S)
  console.log('\n[Test 1] claim + fortify');
  {
    const claim = roundTrip<ClaimFrame>(makeClaim(12, 34));
    assert.strictEqual(claim.t, 'claim');
    assert.strictEqual(claim.x, 12);
    assert.strictEqual(claim.y, 34);

    const fortify = roundTrip<FortifyFrame>(makeFortify(99, 1));
    assert.strictEqual(fortify.t, 'fortify');

    const viaJson = decodeClientFrame('{"t":"claim","x":1,"y":2}');
    assert.deepStrictEqual(viaJson, { t: 'claim', x: 1, y: 2 });
    assert.strictEqual(decodeClientFrame('{"t":"snap","epoch":1,"seq":1,"w":1,"h":1,"ownerBase64":""}'), null);
    console.log('✅ Test 1 Passed');
  }

  // Test 2: snap (S->C) with 1MB base64 owner
  console.log('\n[Test 2] snap + 1M byte base64 round-trip');
  {
    const owner = new Uint8Array(1_000_000);
    for (let i = 0; i < owner.length; i++) {
      owner[i] = (i * 7) % 256;
    }
    const ownerBase64 = encodeBytesBase64(owner);
    const snap = roundTrip<SnapFrame>(makeSnap(2, 41, 1000, 1000, ownerBase64));
    assert.strictEqual(snap.epoch, 2);
    assert.strictEqual(snap.seq, 41);
    assert.strictEqual(snap.w, 1000);
    assert.strictEqual(snap.h, 1000);
    assert.strictEqual(snap.combat, undefined, 'combat optional — omitted when not provided');

    const back = decodeBytesBase64(snap.ownerBase64);
    assert.strictEqual(back.length, 1_000_000);
    assert.ok(Buffer.from(back).equals(Buffer.from(owner)), 'snap ownerBase64 must round-trip 1e6 bytes');

    // Snap with sparse combat dump (CRITICAL 2: joiners keep HP/defense)
    const withCombat = roundTrip<SnapFrame>(
      makeSnap(2, 42, 1000, 1000, ownerBase64, [
        { i: 15, hp: 80, maxHp: 100, tier: 2 },
        { i: 999999, hp: 40, maxHp: 100, tier: 0 }
      ])
    );
    assert.strictEqual(withCombat.combat?.length, 2);
    assert.deepStrictEqual(withCombat.combat?.[0], { i: 15, hp: 80, maxHp: 100, tier: 2 });
    assert.strictEqual(decodeFrame({ t: 'snap', epoch: 1, seq: 1, w: 1, h: 1, ownerBase64: 'x', combat: 'bad' }), null);
    console.log('✅ Test 2 Passed');
  }

  // Test 3: own_batch (S->C)
  console.log('\n[Test 3] own_batch');
  {
    const batch = roundTrip<OwnBatchFrame>(
      makeOwnBatch(7, 1000, [
        { o: 1, idx: [10, 11, 12] },
        { o: 0, idx: [999999] }
      ])
    );
    assert.strictEqual(batch.seq, 7);
    assert.strictEqual(batch.ts, 1000);
    assert.strictEqual(batch.epoch, undefined);
    assert.strictEqual(batch.sets.length, 2);
    assert.deepStrictEqual(batch.sets[0], { o: 1, idx: [10, 11, 12] });
    assert.deepStrictEqual(batch.sets[1], { o: 0, idx: [999999] });

    // Optional epoch (S2.2 wrong-epoch drop on live frames)
    const withEpoch = roundTrip<OwnBatchFrame>(makeOwnBatch(8, 1001, [{ o: 2, idx: [1] }], 3));
    assert.strictEqual(withEpoch.epoch, 3);
    assert.strictEqual(decodeFrame({ t: 'own_batch', seq: 1, ts: 1, sets: [], epoch: 'x' }), null);
    console.log('✅ Test 3 Passed');
  }

  // Test 4: combat (S->C)
  console.log('\n[Test 4] combat');
  {
    const combat = roundTrip<CombatFrame>(
      makeCombat(8, 2000, [
        { i: 5, hp: 80, maxHp: 100, tier: 2 },
        { i: 6, hp: 0, maxHp: 0, tier: 0 }
      ])
    );
    assert.strictEqual(combat.seq, 8);
    assert.strictEqual(combat.epoch, undefined);
    assert.strictEqual(combat.tiles.length, 2);
    assert.deepStrictEqual(combat.tiles[0], { i: 5, hp: 80, maxHp: 100, tier: 2 });

    const withEpoch = roundTrip<CombatFrame>(makeCombat(9, 2001, [{ i: 5, hp: 1, maxHp: 1, tier: 0 }], 4));
    assert.strictEqual(withEpoch.epoch, 4);
    assert.strictEqual(decodeFrame({ t: 'combat', seq: 1, ts: 1, tiles: [], epoch: 1.5 }), null);
    console.log('✅ Test 4 Passed');
  }

  // Test 5: ack (S->C)
  console.log('\n[Test 5] ack');
  {
    const ok = roundTrip<AckFrame>(makeAck('claim', 3, 4, true));
    assert.deepStrictEqual(ok, { t: 'ack', op: 'claim', x: 3, y: 4, ok: true });

    const bad = roundTrip<AckFrame>(makeAck('fortify', 3, 4, false, 'out_of_bounds'));
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.reason, 'out_of_bounds');
    console.log('✅ Test 5 Passed');
  }

  // Test 6: invalid / unknown frames
  console.log('\n[Test 6] invalid / unknown frames');
  {
    assert.strictEqual(decodeFrame('{"t":"nope"}'), null);
    assert.strictEqual(decodeFrame('not json'), null);
    assert.strictEqual(decodeFrame(null as any), null);
    assert.strictEqual(decodeFrame('{"t":"claim","x":1}'), null);
    assert.strictEqual(decodeFrame('{"t":"own_batch","seq":1,"ts":1,"sets":[{"o":1,"idx":"bad"}]}'), null);
    assert.strictEqual(decodeFrame('{"t":"ack","op":"claim","x":1,"y":2,"ok":"yes"}'), null);
    assert.strictEqual(decodeServerFrame('{"t":"claim","x":1,"y":2}'), null);

    const asObject = decodeFrame({ t: 'claim', x: 9, y: 8 });
    assert.deepStrictEqual(asObject, { t: 'claim', x: 9, y: 8 });
    console.log('✅ Test 6 Passed');
  }

  console.log('\n--- All Protocol Codec Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
