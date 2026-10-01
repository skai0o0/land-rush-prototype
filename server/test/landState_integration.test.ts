import * as assert from 'assert';
import {
  LandDataPlane,
  LAND_FRAME_CHANNEL,
  DEFAULT_FLUSH_MS
} from '../src/land/landDataPlane';
import {
  decodeFrame,
  OwnBatchFrame,
  CombatFrame,
  SnapFrame,
  AckFrame
} from '../../shared/land/protocol';
import { decodeBytesBase64 } from '../../shared/land/landState';
import { SCHOOL_IDS } from '../../shared/constants/schools';

interface BroadcastRecord {
  type: string;
  payload: any;
}

function makePlane() {
  const sent: BroadcastRecord[] = [];
  const plane = new LandDataPlane((type, payload) => {
    sent.push({ type, payload });
  });
  return { plane, sent };
}

function framesOfType(sent: BroadcastRecord[], t: string): any[] {
  return sent
    .filter(r => r.type === LAND_FRAME_CHANNEL)
    .map(r => r.payload)
    .filter(f => f && f.t === t);
}

async function runTests() {
  console.log('--- Starting LandState Integration Tests (CampusRoom data plane) ---');

  // Test 1: claim write produces ownership dirty; flush emits own_batch shape
  console.log('\n[Test 1] claim → ownership dirty → flush emits own_batch');
  {
    const { plane, sent } = makePlane();
    const schoolNum = plane.schoolNum('hcmut');
    assert.strictEqual(schoolNum, SCHOOL_IDS.indexOf('hcmut') + 1);

    // Simulate the wild-tile claim write path used by CampusRoom.handleClaimAction
    const x = 12;
    const y = 34;
    const ok = plane.writeTile(x, y, 'hcmut', 100, 100, 0);
    assert.strictEqual(ok, true);

    // Dirty is pending: seq not yet bumped (flush has not run)
    assert.strictEqual(plane.land.seq, 0);
    assert.strictEqual(sent.length, 0);

    const result = plane.flush(1111);
    assert.ok(result.own, 'flush must emit own_batch after claim');
    const batch = result.own as OwnBatchFrame;
    assert.strictEqual(batch.t, 'own_batch');
    assert.strictEqual(batch.ts, 1111);
    assert.strictEqual(batch.seq, 1);
    assert.strictEqual(batch.sets.length, 1);
    assert.strictEqual(batch.sets[0].o, schoolNum);
    assert.deepStrictEqual(batch.sets[0].idx, [y * 1000 + x]);
    assert.strictEqual(batch.epoch, plane.land.epoch, 'live own_batch frame must carry room epoch (S2.2)');

    // Wire frame shape
    const wire = decodeFrame(JSON.parse(JSON.stringify(batch)));
    assert.ok(wire && wire.t === 'own_batch');

    const broadcasts = framesOfType(sent, 'own_batch');
    assert.strictEqual(broadcasts.length, 1, 'own_batch must be broadcast on flush channel');

    console.log('✅ Test 1 Passed');
  }

  // Test 2: invalid coords → RangeError path → no state change
  console.log('\n[Test 2] invalid coords → no state change (RangeError caught)');
  {
    const { plane, sent } = makePlane();
    plane.writeTile(5, 5, 'hcmut', 100, 100, 0);
    plane.flush(1);
    const seqAfterSetup = plane.land.seq;

    // Out of bounds / non-integer — LandDataPlane catches RangeError and returns false
    assert.strictEqual(plane.setOwner(-1, 0, 'hcmut'), false);
    assert.strictEqual(plane.setOwner(0, -1, 'hcmut'), false);
    assert.strictEqual(plane.setOwner(1000, 0, 'hcmut'), false);
    assert.strictEqual(plane.setOwner(0, 1000, 'hcmut'), false);
    assert.strictEqual(plane.setOwner(1.5, 0, 'hcmut'), false);
    assert.strictEqual(plane.writeTile(-1, 100, 'hcmut', 100, 100, 0), false);
    assert.strictEqual(plane.setCombat(2000, 2000, 1, 1, 0), false);

    // State untouched
    assert.strictEqual(plane.land.getOwner(0, 0), 0);
    assert.strictEqual(plane.land.getOwner(5, 5), plane.schoolNum('hcmut'));
    assert.strictEqual(plane.land.seq, seqAfterSetup);

    // No dirty leaked from failed writes
    const empty = plane.flush(2);
    assert.strictEqual(empty.own, undefined);
    assert.strictEqual(empty.combat, undefined);
    assert.strictEqual(plane.land.seq, seqAfterSetup);
    assert.strictEqual(framesOfType(sent, 'own_batch').length, 1, 'no extra own_batch from failed writes');

    console.log('✅ Test 2 Passed');
  }

  // Test 3: combat update emits combat frame
  console.log('\n[Test 3] combat update → flush emits combat frame');
  {
    const { plane, sent } = makePlane();
    plane.writeTile(7, 8, 'hcmut', 100, 100, 0);
    plane.flush(10);
    // writeTile also marks combat dirty, so the setup flush already emitted one combat frame
    const combatAfterSetup = framesOfType(sent, 'combat').length;
    assert.ok(combatAfterSetup >= 1);

    // Fortify path: defenseTier 0→1, maxHp 100→200, hp refilled
    const ok = plane.setCombat(7, 8, 200, 200, 1);
    assert.strictEqual(ok, true);

    const result = plane.flush(2222);
    assert.ok(result.combat, 'flush must emit combat frame after fortify');
    const combat = result.combat as CombatFrame;
    assert.strictEqual(combat.t, 'combat');
    assert.strictEqual(combat.ts, 2222);
    assert.strictEqual(combat.tiles.length, 1);
    assert.strictEqual(combat.tiles[0].i, 8 * 1000 + 7);
    assert.strictEqual(combat.tiles[0].hp, 200);
    assert.strictEqual(combat.tiles[0].maxHp, 200);
    assert.strictEqual(combat.tiles[0].tier, 1);
    assert.strictEqual(combat.epoch, plane.land.epoch, 'live combat frame must carry room epoch (S2.2)');

    const broadcasts = framesOfType(sent, 'combat');
    assert.strictEqual(broadcasts.length, combatAfterSetup + 1, 'fortify combat frame must be broadcast');
    const wire = decodeFrame(JSON.parse(JSON.stringify(combat)));
    assert.ok(wire && wire.t === 'combat');

    // Damage-only combat update (claim damage without capture)
    plane.setCombat(7, 8, 160, 200, 1);
    const dmg = plane.flush(2223);
    assert.ok(dmg.combat);
    assert.strictEqual(dmg.combat!.tiles[0].hp, 160);

    console.log('✅ Test 3 Passed');
  }

  // Test 4: empty flush does not bump seq and emits no broadcast
  console.log('\n[Test 4] empty flush → no seq bump, no broadcast');
  {
    const { plane, sent } = makePlane();
    const seq0 = plane.land.seq;
    const epoch0 = plane.land.epoch;

    const r1 = plane.flush(1);
    assert.strictEqual(r1.own, undefined);
    assert.strictEqual(r1.combat, undefined);
    assert.strictEqual(plane.land.seq, seq0);
    assert.strictEqual(sent.length, 0);

    // Double-tick idempotence
    const r2 = plane.flush(2);
    assert.strictEqual(r2.own, undefined);
    assert.strictEqual(r2.combat, undefined);
    assert.strictEqual(plane.land.seq, seq0);
    assert.strictEqual(plane.land.epoch, epoch0);
    assert.strictEqual(sent.length, 0);

    // After a real change, seq bumps only for non-empty payloads; empty flushes after do not.
    // writeTile dirties both ownership and combat, so one flush tick bumps seq by 2
    // (once in flushOwnership, once in flushCombat).
    plane.writeTile(0, 0, 'hcmut', 100, 100, 0);
    const r3 = plane.flush(3);
    assert.ok(r3.own);
    assert.ok(r3.combat);
    const seq1 = plane.land.seq;
    assert.strictEqual(seq1, seq0 + 2);

    const r4 = plane.flush(4);
    assert.strictEqual(r4.own, undefined);
    assert.strictEqual(r4.combat, undefined);
    assert.strictEqual(plane.land.seq, seq1);

    // Ownership-only change bumps seq by exactly 1
    plane.setOwner(1, 1, 'hcmut');
    const r5 = plane.flush(5);
    assert.ok(r5.own);
    assert.strictEqual(r5.combat, undefined);
    assert.strictEqual(plane.land.seq, seq1 + 1);

    console.log('✅ Test 4 Passed');
  }

  // Test 5: snap on join (first frame) + ack helper
  console.log('\n[Test 5] snap frame shape + ack helper');
  {
    const { plane } = makePlane();
    plane.writeTile(1, 2, 'hcmut', 100, 100, 0);
    plane.writeTile(3, 4, 'hcmut', 150, 200, 2);
    plane.flush(50);

    const clientInbox: BroadcastRecord[] = [];
    const send = (type: string, payload: unknown) => clientInbox.push({ type, payload });

    // Join path: snap first
    const snap = plane.sendSnap(send) as SnapFrame;
    assert.strictEqual(clientInbox.length, 1);
    assert.strictEqual(clientInbox[0].type, LAND_FRAME_CHANNEL);
    assert.strictEqual(snap.t, 'snap');
    assert.strictEqual(snap.w, 1000);
    assert.strictEqual(snap.h, 1000);
    assert.ok(snap.epoch >= 0);
    assert.ok(snap.seq >= 1);

    // Snapshot bytes round-trip: claimed tiles visible in packed owner array
    const owner = decodeBytesBase64(snap.ownerBase64);
    assert.strictEqual(owner.length, 1_000_000);
    assert.strictEqual(owner[2 * 1000 + 1], plane.schoolNum('hcmut'));
    assert.strictEqual(owner[4 * 1000 + 3], plane.schoolNum('hcmut'));
    assert.strictEqual(owner[0], 0);

    // CRITICAL 2: snap carries sparse combat so joiners keep HP/defense
    assert.ok(Array.isArray(snap.combat), 'snap must include combat list');
    const fortified = (snap.combat || []).find(t => t.i === 4 * 1000 + 3);
    assert.ok(fortified, 'fortified tile must appear in snap combat dump');
    assert.strictEqual(fortified!.hp, 150);
    assert.strictEqual(fortified!.maxHp, 200);
    assert.strictEqual(fortified!.tier, 2);

    // Ack to actor
    plane.sendAck(send, 'claim', 1, 2, true);
    plane.sendAck(send, 'claim', -1, 0, false, 'out_of_bounds');
    const acks = clientInbox.filter(r => r.payload && r.payload.t === 'ack');
    assert.strictEqual(acks.length, 2);
    const okAck = acks[0].payload as AckFrame;
    const badAck = acks[1].payload as AckFrame;
    assert.strictEqual(okAck.ok, true);
    assert.strictEqual(okAck.op, 'claim');
    assert.strictEqual(badAck.ok, false);
    assert.strictEqual(badAck.reason, 'out_of_bounds');

    console.log('✅ Test 5 Passed');
  }

  // Test 6: reset path — bump epoch + snap resync (soft_reset contract)
  console.log('\n[Test 6] reset → epoch bump + snap resync, dirty dropped');
  {
    const { plane, sent } = makePlane();
    plane.writeTile(10, 10, 'hcmut', 100, 100, 0);
    plane.flush(100);
    const epochBefore = plane.land.epoch;
    const seqBefore = plane.land.seq;

    plane.reset();
    assert.strictEqual(plane.land.getOwner(10, 10), 0);
    assert.strictEqual(plane.land.epoch, epochBefore + 1);

    // Rebuild writes (as soft_restore does) then finishReset drops rebuild dirty
    plane.writeTile(20, 20, 'hcmut', 500, 500, 3);
    const snap = plane.finishReset() as SnapFrame;
    assert.strictEqual(snap.t, 'snap');
    assert.strictEqual(snap.epoch, epochBefore + 2, 'finishReset bumps epoch again');

    // Rebuild dirty must not have leaked into a broadcast batch after finishReset
    const batches = framesOfType(sent, 'own_batch');
    assert.strictEqual(batches.length, 1, 'only the pre-reset flush batch');
    const snaps = framesOfType(sent, 'snap');
    assert.strictEqual(snaps.length, 1);

    // Empty flush after finishReset: no seq bump
    const seqAfter = plane.land.seq;
    const empty = plane.flush(999);
    assert.strictEqual(empty.own, undefined);
    assert.strictEqual(plane.land.seq, seqAfter);

    // Ownership preserved under the resync snap
    const owner = decodeBytesBase64(snap.ownerBase64);
    assert.strictEqual(owner[20 * 1000 + 20], plane.schoolNum('hcmut'));

    console.log('✅ Test 6 Passed');
  }

  // Test 7: flush window constant + channel name
  console.log('\n[Test 7] flush defaults');
  {
    assert.strictEqual(DEFAULT_FLUSH_MS, 50);
    assert.strictEqual(LAND_FRAME_CHANNEL, 'land');
    console.log('✅ Test 7 Passed');
  }

  console.log('\n--- All LandState Integration Tests Passed ---');
}

runTests().catch((err) => {
  console.error('Integration tests FAILED:', err);
  process.exit(1);
});
