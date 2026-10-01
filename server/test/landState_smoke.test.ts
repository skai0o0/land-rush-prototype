import * as assert from 'assert';
import {
  LandDataPlane,
  LAND_FRAME_CHANNEL
} from '../src/land/landDataPlane';
import {
  decodeFrame,
  encodeFrame,
  OwnBatchFrame,
  SnapFrame,
  CombatFrame
} from '../../shared/land/protocol';
import {
  ClientLandSync,
  shouldDropStaleFrame
} from '../../shared/land/clientSync';
import { shouldDropBatch, decodeBytesBase64 } from '../../shared/land/landState';

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
    .filter((r) => r.type === LAND_FRAME_CHANNEL)
    .map((r) => r.payload)
    .filter((f) => f && f.t === t);
}

/** Round-trip through the wire codec so smoke covers encode → decode → apply. */
function wire<T>(frame: T): T {
  return decodeFrame(JSON.parse(JSON.stringify(frame))) as T;
}

/**
 * T5 smoke (S2.2, S2.3). Unit-level over LandDataPlane + ClientLandSync is
 * sufficient: coalescing is owned by LandState's dirty-set flush (what
 * LandDataPlane.flush broadcasts), and snapshot/stale-drop is the client-side
 * staleness rule on real wire frames. A full Colyseus room would only re-run
 * the same flush path behind a timer; CampusRoom wiring is already covered by
 * landState_integration.test.ts.
 */
async function runTests() {
  console.log('--- Starting LandState Smoke Tests (T5 / S2.2, S2.3) ---');

  // Test 1: N ownership writes in one flush window → ONE own_batch, indices grouped by owner
  console.log('\n[Test 1] multi-claim coalesces to one own_batch grouped by owner');
  {
    const { plane, sent } = makePlane();
    const o1 = plane.schoolNum('hcmut');
    const o2 = plane.schoolNum('hcmus');
    const o3 = plane.schoolNum('uit');
    assert.ok(o1 > 0 && o2 > 0 && o3 > 0, 'schools resolve to numeric ids');
    assert.ok(o1 !== o2 && o2 !== o3, 'distinct schools → distinct ids');

    // 12 claims inside one flush window (no flush between writes)
    const claims: Array<{ x: number; y: number; school: string; o: number }> = [];
    for (let i = 0; i < 4; i++) {
      claims.push({ x: 10 + i, y: 20, school: 'hcmut', o: o1 });
    }
    for (let i = 0; i < 5; i++) {
      claims.push({ x: 30 + i, y: 40, school: 'hcmus', o: o2 });
    }
    for (let i = 0; i < 3; i++) {
      claims.push({ x: 50 + i, y: 60, school: 'uit', o: o3 });
    }
    const nClaims = claims.length; // 12
    assert.strictEqual(nClaims, 12);

    for (const c of claims) {
      assert.strictEqual(plane.writeTile(c.x, c.y, c.school, 100, 100, 0), true);
    }

    // Nothing broadcast yet: dirty waits for the flush window
    assert.strictEqual(framesOfType(sent, 'own_batch').length, 0);
    assert.strictEqual(plane.land.seq, 0);

    const result = plane.flush(5000);
    assert.ok(result.own, 'flush must emit own_batch');
    const batch = wire(result.own as OwnBatchFrame);

    // Criterion: ONE own_batch for N claims (strictly fewer broadcasts than claims)
    const ownBroadcasts = framesOfType(sent, 'own_batch');
    assert.strictEqual(ownBroadcasts.length, 1, 'N claims in one window → exactly 1 own_batch');
    assert.ok(ownBroadcasts.length < nClaims, 'broadcasts must be fewer than claims');

    // All indices present, grouped by owner
    const byO = new Map(batch.sets.map((e) => [e.o, e.idx.slice()]));
    assert.strictEqual(batch.sets.length, 3, 'one set per owner');
    assert.deepStrictEqual(byO.get(o1), [20 * 1000 + 10, 20 * 1000 + 11, 20 * 1000 + 12, 20 * 1000 + 13]);
    assert.deepStrictEqual(byO.get(o2), [40 * 1000 + 30, 40 * 1000 + 31, 40 * 1000 + 32, 40 * 1000 + 33, 40 * 1000 + 34]);
    assert.deepStrictEqual(byO.get(o3), [60 * 1000 + 50, 60 * 1000 + 51, 60 * 1000 + 52]);

    const totalIdx = batch.sets.reduce((n, e) => n + e.idx.length, 0);
    assert.strictEqual(totalIdx, nClaims, 'every claim index appears exactly once');
    assert.strictEqual(batch.seq, 1);
    assert.strictEqual(batch.ts, 5000);

    // Second window with more claims: still one broadcast per window, not per claim
    for (let i = 0; i < 6; i++) {
      assert.strictEqual(plane.setOwner(100 + i, 100, 'hcmut'), true);
    }
    const second = plane.flush(5100);
    assert.ok(second.own);
    const secondBatch = wire(second.own as OwnBatchFrame);
    assert.strictEqual(framesOfType(sent, 'own_batch').length, 2, 'two windows → two own_batch total');
    assert.strictEqual(secondBatch.sets.length, 1);
    assert.strictEqual(secondBatch.sets[0].o, o1);
    assert.strictEqual(secondBatch.sets[0].idx.length, 6);
    // writeTile dirties ownership AND combat; each non-empty flush channel bumps
    // seq, so window 1 ends at seq 2 and this own_batch carries seq 3. Only
    // monotonicity matters for the coalescing criterion.
    assert.ok(secondBatch.seq > batch.seq, 'seq increases across windows');
    assert.strictEqual(secondBatch.seq, 3);

    // writeTile also dirties combat; that is a separate combat frame, not extra own_batch
    assert.strictEqual(framesOfType(sent, 'own_batch').length, 2);

    console.log('✅ Test 1 Passed');
  }

  // Test 2: e2e pipe — snap join, coalesced own_batch applies all claims on the client
  console.log('\n[Test 2] e2e pipe: snap join + coalesced batch → client converges');
  {
    const { plane, sent } = makePlane();
    const clientInbox: BroadcastRecord[] = [];
    const sendToClient = (type: string, payload: unknown) => clientInbox.push({ type, payload });

    // Some history so snap.seq is non-zero
    plane.writeTile(0, 0, 'hcmut', 100, 100, 0);
    plane.flush(1000);
    const historyOwn = framesOfType(sent, 'own_batch').length;
    assert.strictEqual(historyOwn, 1);

    // Join: snap first (S2.2 ordering)
    const snap = wire(plane.sendSnap(sendToClient) as SnapFrame);
    assert.strictEqual(clientInbox.length, 1);
    assert.strictEqual(snap.t, 'snap');

    const client = new ClientLandSync();
    client.applySnap(snap);
    assert.strictEqual(client.ready, true);
    assert.strictEqual(client.getOwner(0, 0), plane.schoolNum('hcmut'));

    // N claims then one flush → one wire own_batch
    const n = 8;
    for (let i = 0; i < n; i++) {
      assert.strictEqual(plane.writeTile(200 + i, 300, 'hcmus', 100, 100, 0), true);
    }
    const flushed = plane.flush(2000);
    assert.ok(flushed.own);
    const batch = wire(flushed.own as OwnBatchFrame);
    assert.strictEqual(framesOfType(sent, 'own_batch').length, historyOwn + 1, 'one own_batch for the 8-claim window');

    const applied = client.applyOwnBatch(batch);
    assert.strictEqual(applied.applied, true);
    assert.strictEqual(applied.dirtyTiles.length, n, 'all N claims land from one batch');
    for (let i = 0; i < n; i++) {
      assert.strictEqual(client.getOwner(200 + i, 300), plane.schoolNum('hcmus'));
    }

    // Client owner buffer matches server after snap + live batch
    assert.ok(Buffer.from(client.owner).equals(Buffer.from(plane.land.owner)), 'client owner bytes converge with server');

    console.log('✅ Test 2 Passed');
  }

  // Test 3: snapshot then old-seq batch is dropped (shouldDropBatch / shouldDropStaleFrame)
  console.log('\n[Test 3] snapshot then old-seq batch is dropped');
  {
    // Helper contract (S2.2)
    assert.strictEqual(shouldDropBatch(10, 10), true, 'seq == lastSnapSeq drops');
    assert.strictEqual(shouldDropBatch(10, 9), true, 'seq < lastSnapSeq drops');
    assert.strictEqual(shouldDropBatch(10, 11), false, 'seq > lastSnapSeq applies');
    assert.strictEqual(shouldDropStaleFrame({ seq: 10 }, 10, 0), true);
    assert.strictEqual(shouldDropStaleFrame({ seq: 11, epoch: 1 }, 10, 0), true, 'wrong epoch drops');
    assert.strictEqual(shouldDropStaleFrame({ seq: 11, epoch: 0 }, 10, 0), false);

    const { plane, sent } = makePlane();

    // Server history: batch A (seq=1), then later work batch B (seq=2+)
    plane.writeTile(1, 1, 'hcmut', 100, 100, 0);
    const flushA = plane.flush(3000);
    assert.ok(flushA.own);
    const batchA = wire(flushA.own as OwnBatchFrame);
    assert.strictEqual(batchA.seq, 1);

    plane.writeTile(2, 2, 'hcmus', 100, 100, 0);
    const flushB = plane.flush(3100);
    assert.ok(flushB.own);
    const batchB = wire(flushB.own as OwnBatchFrame);
    assert.ok(batchB.seq > batchA.seq, 'seq is monotonic');

    // A late joiner gets a snap at the current seq (includes both claims)
    const clientInbox: BroadcastRecord[] = [];
    const sendToClient = (type: string, payload: unknown) => clientInbox.push({ type, payload });
    const snap = wire(plane.sendSnap(sendToClient) as SnapFrame);
    const client = new ClientLandSync();
    client.applySnap(snap);
    const lastSnapSeq = client.lastSnapSeq;
    assert.ok(lastSnapSeq >= batchB.seq, 'snap.seq covers all flushed work');

    // In-flight / reordered OLD batch arrives AFTER the snapshot → must drop
    const staleDrop = client.applyOwnBatch(batchA);
    assert.strictEqual(staleDrop.applied, false, 'old-seq batch after snap must drop');
    assert.strictEqual(staleDrop.dirtyTiles.length, 0);
    // Snap content preserved: (1,1) still the snap-time owner, not re-applied from stale batch
    assert.strictEqual(client.getOwner(1, 1), plane.schoolNum('hcmut'));

    // Same drop at the raw helper level for a reconstructed old frame
    assert.strictEqual(client.shouldDrop(batchA.seq), true);
    assert.strictEqual(shouldDropBatch(client.lastSnapSeq, batchA.seq), true);

    // Batch with seq == snap.seq also drops (already covered by snapshot)
    const sameSeq = { ...batchB, seq: client.lastSnapSeq, sets: [{ o: 9, idx: [999999] }] } as OwnBatchFrame;
    const sameDrop = client.applyOwnBatch(sameSeq);
    assert.strictEqual(sameDrop.applied, false);
    assert.strictEqual(client.getOwnerAt(999999), 0, 'same-seq batch must not paint');

    // Wrong-epoch frame drops even when seq is newer (shouldDropStaleFrame)
    const wrongEpoch = { ...batchB, seq: client.lastSnapSeq + 5, sets: [{ o: 1, idx: [500] }] } as OwnBatchFrame;
    assert.strictEqual(shouldDropStaleFrame({ seq: wrongEpoch.seq, epoch: client.epoch + 1 }, client.lastSnapSeq, client.epoch), true);
    assert.strictEqual(client.shouldDrop(wrongEpoch.seq, client.epoch + 1), true);

    // A truly new live batch still applies
    plane.writeTile(3, 3, 'uit', 100, 100, 0);
    const flushC = plane.flush(3200);
    assert.ok(flushC.own);
    const batchC = wire(flushC.own as OwnBatchFrame);
    assert.ok(batchC.seq > client.lastSnapSeq);
    const okApply = client.applyOwnBatch(batchC);
    assert.strictEqual(okApply.applied, true, 'newer-seq live batch applies');
    assert.strictEqual(client.getOwner(3, 3), plane.schoolNum('uit'));

    // Stale combat frame is dropped the same way
    const staleCombat = wire({ t: 'combat', seq: 0, ts: 1, tiles: [{ i: 42, hp: 1, maxHp: 1, tier: 1 }] } as CombatFrame);
    const combatDrop = client.applyCombat(staleCombat);
    assert.strictEqual(combatDrop.applied, false);
    assert.strictEqual(client.getCombatAt(42), undefined);

    // Broadcast count stays coalesced throughout (1 per non-empty window)
    assert.strictEqual(framesOfType(sent, 'own_batch').length, 3);

    console.log('✅ Test 3 Passed');
  }

  // Test 4: snapshot bytes are the packed authority — decode matches plane state
  console.log('\n[Test 4] snapshot packed bytes match plane after coalesced claims');
  {
    const { plane } = makePlane();
    const owners = ['hcmut', 'hcmus', 'uit'];
    let expected = 0;
    for (let i = 0; i < 30; i++) {
      const school = owners[i % owners.length];
      if (plane.setOwner(i, 500, school)) expected++;
    }
    const flush = plane.flush(9000);
    assert.ok(flush.own);
    const snap = wire(plane.makeSnapFrame());
    const owner = decodeBytesBase64(snap.ownerBase64);
    assert.strictEqual(owner.length, 1_000_000);
    for (let i = 0; i < 30; i++) {
      assert.strictEqual(owner[500 * 1000 + i], plane.schoolNum(owners[i % owners.length]));
    }
    assert.strictEqual(snap.seq, flush.own!.seq, 'snap.seq equals last own_batch seq after flush');

    const client = new ClientLandSync();
    client.applySnap(snap);
    assert.ok(Buffer.from(client.owner).equals(Buffer.from(owner)), 'client snap apply is byte-identical');
    console.log('✅ Test 4 Passed');
  }

  console.log('\n--- All LandState Smoke Tests Passed (T5) ---');
}

runTests().catch((err) => {
  console.error('Smoke tests FAILED:', err);
  process.exit(1);
});
