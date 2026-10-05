export interface BuffContext {
  landmarkId: string;
  schoolId: string;
  activationOrder: number;
  schoolRank: number;
  comebackGap: number;
}
export interface BuffDefinition {
  id: string;
  eligible: (context: BuffContext) => boolean;
  pointBonus: (context: BuffContext) => number;
}

/** Server-only pool. No unapproved buff designs or pool contents enter client state. */
export class BuffDirector {
  private order = 0;
  private active = new Map<string, { context: BuffContext; buff?: BuffDefinition }>();
  constructor(private pool: readonly BuffDefinition[] = [], private choose = Math.random) {}
  bonus(landmarkId: string, schoolId: string, scores: ReadonlyMap<string, number>, fallback: number) {
    let activation = this.active.get(landmarkId);
    if (!activation || activation.context.schoolId !== schoolId) {
      const score = scores.get(schoolId) || 0;
      const context: BuffContext = {
        landmarkId, schoolId, activationOrder: ++this.order,
        schoolRank: 1 + Array.from(scores.values()).filter(s => s > score).length,
        comebackGap: Math.max(0, ...scores.values()) - score
      };
      const eligible = this.pool.filter(buff => buff.eligible(context));
      activation = { context, buff: eligible[Math.min(eligible.length - 1, Math.floor(this.choose() * eligible.length))] };
      this.active.set(landmarkId, activation);
    }
    return activation.buff ? activation.buff.pointBonus(activation.context) : fallback;
  }
  deactivate(landmarkId: string) { this.active.delete(landmarkId); }
  reset() { this.active.clear(); this.order = 0; }
}
