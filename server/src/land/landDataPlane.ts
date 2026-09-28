import {
  LandState,
  OwnBatchPayload,
  CombatFlushPayload,
  LandSnapshot
} from "../../../shared/land/landState";
import {
  makeSnap,
  makeOwnBatch,
  makeCombat,
  makeAck,
  SnapFrame,
  OwnBatchFrame,
  CombatFrame,
  AckFrame,
  LAND_FRAME_CHANNEL
} from "../../../shared/land/protocol";
import { SCHOOL_IDS } from "../../../shared/constants/schools";

export type LandEmitFn = (type: string, payload: unknown) => void;

// Re-export for existing imports (CampusRoom); single source of truth in shared/land/protocol.
export { LAND_FRAME_CHANNEL };
export const DEFAULT_FLUSH_MS = 50;

/**
 * Room-facing data plane over LandState: safe writes (RangeError → false),
 * batched flush of own_batch/combat frames, and snap/ack helpers.
 */
export class LandDataPlane {
  readonly land = new LandState();

  constructor(private broadcast: LandEmitFn) {}

  /** School numeric id: 0 = uncolored / unknown, 1..N = roster index + 1. */
  schoolNum(schoolId: string): number {
    if (!schoolId) return 0;
    const n = SCHOOL_IDS.indexOf(schoolId) + 1;
    return n > 0 ? n : 0;
  }

  /** Write ownership. Returns false on bad coords (state untouched). */
  setOwner(x: number, y: number, schoolId: string): boolean {
    try {
      this.land.setOwner(x, y, this.schoolNum(schoolId));
      return true;
    } catch (e) {
      if (e instanceof RangeError) return false;
      throw e;
    }
  }

  /** Write combat tile. Returns false on bad coords (state untouched). */
  setCombat(x: number, y: number, hp: number, maxHp: number, defenseTier: number): boolean {
    try {
      this.land.setCombat(x, y, { hp, maxHp, defenseTier });
      return true;
    } catch (e) {
      if (e instanceof RangeError) return false;
      throw e;
    }
  }

  /** Clear combat entry (wire form is hp=0,maxHp=0,tier=0). */
  clearCombat(x: number, y: number): boolean {
    try {
      this.land.clearCombat(x, y);
      return true;
    } catch (e) {
      if (e instanceof RangeError) return false;
      throw e;
    }
  }

  /** Combined write used by claim / capture / bot paths. */
  writeTile(
    x: number,
    y: number,
    schoolId: string,
    hp: number,
    maxHp: number,
    defenseTier: number
  ): boolean {
    const okOwner = this.setOwner(x, y, schoolId);
    const okCombat = this.setCombat(x, y, hp, maxHp, defenseTier);
    return okOwner && okCombat;
  }

  /**
   * Flush dirty ownership/combat. Broadcasts own_batch and/or combat frames
   * only when non-empty. Empty flush does not bump seq and emits nothing.
   */
  flush(ts: number = Date.now()): { own?: OwnBatchFrame; combat?: CombatFrame } {
    const out: { own?: OwnBatchFrame; combat?: CombatFrame } = {};
    const epoch = this.land.epoch;

    const own: OwnBatchPayload = this.land.flushOwnership(ts);
    if (own.sets.length > 0) {
      const frame = makeOwnBatch(own.seq, own.ts, own.sets, epoch);
      this.broadcast(LAND_FRAME_CHANNEL, frame);
      out.own = frame;
    }

    const combat: CombatFlushPayload = this.land.flushCombat(ts);
    if (combat.tiles.length > 0) {
      const frame = makeCombat(combat.seq, combat.ts, combat.tiles, epoch);
      this.broadcast(LAND_FRAME_CHANNEL, frame);
      out.combat = frame;
    }

    return out;
  }

  makeSnapFrame(): SnapFrame {
    const s: LandSnapshot = this.land.snapshot();
    return makeSnap(s.epoch, s.seq, s.w, s.h, s.ownerBase64, s.combat);
  }

  /** Send snap frame to a single client (join / resync). */
  sendSnap(send: LandEmitFn): SnapFrame {
    const frame = this.makeSnapFrame();
    send(LAND_FRAME_CHANNEL, frame);
    return frame;
  }

  /** Broadcast snap to the room (full resync after epoch bump). */
  broadcastSnap(): SnapFrame {
    return this.sendSnap(this.broadcast);
  }

  /** Actor-only ack. */
  sendAck(send: LandEmitFn, op: string, x: number, y: number, ok: boolean, reason?: string): void {
    const frame: AckFrame = makeAck(op, x, y, ok, reason);
    send(LAND_FRAME_CHANNEL, frame);
  }

  /**
   * Reset ownership/combat and bump epoch (used by soft_reset).
   * Caller re-applies tiles, then calls finishReset() to drop rebuild dirty
   * and broadcast a fresh snap so clients resync without huge batches.
   */
  reset(): void {
    this.land.reset();
  }

  finishReset(): SnapFrame {
    this.land.bumpEpoch();
    return this.broadcastSnap();
  }

  /** Current snapshot (epoch, seq, w, h, ownerBase64). */
  snapshot(): LandSnapshot {
    return this.land.snapshot();
  }
}
