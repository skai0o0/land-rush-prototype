import { KnowledgeState, TileState } from "../schema/GameState";

export { EXCHANGE_COST } from "../../../shared/constants/gameplay";
export const NEGLECT_MS = 12 * 3600 * 1000;
export const DECAY_STEP_MS = 3600 * 1000;

/** Upgrade legacy tiles once. Challenger timers never grant knowledge. */
export function initializeKnowledge(tile: TileState, now: number) {
  if (tile.knowledgeInitialized) return;
  tile.knowledgeInitialized = true;
  if (tile.ownerId && !tile.knowledge.size) {
    const entry = new KnowledgeState();
    entry.retention = tile.retention;
    entry.persistent = tile.maxHp === 500;
    entry.lastStudiedAt = tile.lastStudiedAt || now;
    entry.studyCount = tile.studyCountBySchool.get(tile.ownerId) || 1;
    tile.knowledge.set(tile.ownerId, entry);
  }
  tile.sharedExpiresAt = 0;
  projectKnowledge(tile);
}

export function retentionAt(entry: KnowledgeState, now: number, neglectMs = NEGLECT_MS, stepMs = DECAY_STEP_MS) {
  if (entry.persistent) return entry.retention;
  const steps = Math.max(0, Math.floor((now - entry.lastStudiedAt - neglectMs) / stepMs));
  return Math.max(0, entry.retention - steps * 10);
}

/** Prune only expired entries; retention remains a timestamp-based baseline. */
export function pruneKnowledge(tile: TileState, now: number, neglectMs = NEGLECT_MS, stepMs = DECAY_STEP_MS) {
  initializeKnowledge(tile, now);
  let changed = false;
  for (const [school, entry] of tile.knowledge) {
    if (retentionAt(entry, now, neglectMs, stepMs) === 0) {
      tile.knowledge.delete(school);
      if (tile.studyCountBySchool.has(school)) tile.studyCountBySchool.delete(school);
      changed = true;
    }
  }
  projectKnowledge(tile);
  return changed;
}

/** ownerId is a compatibility projection for the dense land plane, never authority. */
export function projectKnowledge(tile: TileState) {
  const schools = Array.from(tile.knowledge.keys()).sort();
  tile.ownerId = schools.includes(tile.ownerId) ? tile.ownerId : schools[0] || "";
  tile.isShared = schools.length > 1;
  tile.sharedWithSchoolId = schools.find(s => s !== tile.ownerId) || "";
  tile.sharedExpiresAt = 0;
  const entry = tile.knowledge.get(tile.ownerId);
  tile.retention = entry?.retention || 0;
  tile.lastStudiedAt = entry?.lastStudiedAt || 0;
}

export function studyKnowledge(tile: TileState, school: string, points: number, now: number, neglectMs = NEGLECT_MS, stepMs = DECAY_STEP_MS) {
  pruneKnowledge(tile, now, neglectMs, stepMs);
  let entry = tile.knowledge.get(school);
  if (!entry) entry = new KnowledgeState();
  entry.retention = 100; // Any valid review starts a fresh 22-hour retention cycle.
  entry.lastStudiedAt = now;
  entry.studyCount += points;
  tile.knowledge.set(school, entry);
  tile.studyCountBySchool.set(school, entry.studyCount);
  projectKnowledge(tile);
}
