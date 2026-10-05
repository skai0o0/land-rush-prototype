export const EXPLORATION_COST = 1;
export const EXCHANGE_COST = 3;
export const BEACON_CRYSTALS = 1000;
/** Award once per school, at the current activation target; whole crystals round up. */
export function landmarkGuessReward(targetCrystals: number): number {
  return Math.ceil(targetCrystals / 10);
}
/** Integer arithmetic prevents floating-point ceil errors (e.g. 1001 * 1.05). */
export function beaconOvertakeTarget(currentOwnerCrystals: number): number {
  return Math.max(BEACON_CRYSTALS, Math.ceil(currentOwnerCrystals * 105 / 100));
}
