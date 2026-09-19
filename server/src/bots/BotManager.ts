import { GameState, TileState } from "../schema/GameState";
import { SCHOOL_IDS } from "../../../shared/constants/schools";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";

export class BotManager {
  // Cache of frontier tile keys for each school: schoolId -> Set<string ("x,y")>
  private frontiers: Map<string, Set<string>> = new Map();
  // Quick lookup for landmark tile footprints
  private landmarkTileMap: Map<string, string> = new Map();

  constructor() {
    for (const schoolId of SCHOOL_IDS) {
      this.frontiers.set(schoolId, new Set());
    }
  }

  public initLandmarks(landmarks: Map<string, { x: number; y: number; landmarkKey: string }>) {
    this.landmarkTileMap.clear();
    for (const [_, lm] of landmarks) {
      const config = LANDMARK_ROSTER[lm.landmarkKey];
      const w = config?.footprint.width || 4;
      const h = config?.footprint.height || 4;
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          this.landmarkTileMap.set(`${lm.x + dx},${lm.y + dy}`, lm.landmarkKey);
        }
      }
    }
  }

  public reset() {
    for (const schoolId of SCHOOL_IDS) {
      this.frontiers.set(schoolId, new Set());
    }
  }

  public addOwnedTile(schoolId: string, x: number, y: number, state: GameState) {
    const frontier = this.frontiers.get(schoolId);
    if (!frontier) return;

    // This tile is now owned, so remove from this school's frontier
    frontier.delete(`${x},${y}`);

    // Check neighbors: if neighbor is not owned by this school, add to frontier
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
      const key = `${nx},${ny}`;
      const existing = state.claimedTiles.get(key);
      if (!existing || existing.ownerId !== schoolId) {
        frontier.add(key);
      }
    }
  }

  public removeOwnedTile(schoolId: string, x: number, y: number, state: GameState) {
    // If tile lost, it might become frontier for this school again if adjacent to another owned tile
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    let hasFriendlyNeighbor = false;
    for (const [nx, ny] of neighbors) {
      const nTile = state.claimedTiles.get(`${nx},${ny}`);
      if (nTile && nTile.ownerId === schoolId) {
        hasFriendlyNeighbor = true;
        break;
      }
    }
    if (hasFriendlyNeighbor) {
      this.frontiers.get(schoolId)?.add(`${x},${y}`);
    }
  }

  public processBots(state: GameState, room: any) {
    // Each bot school attempts to expand if it has sufficient troops
    for (const schoolId of SCHOOL_IDS) {
      const troops = state.schoolTroops.get(schoolId) || 0;
      if (troops < 5) continue; // Minimum troops needed for wild tile

      const frontier = this.frontiers.get(schoolId);
      if (!frontier || frontier.size === 0) continue;

      // Sample candidates from frontier (up to 12 random candidates to evaluate score)
      const candidates: string[] = [];
      const frontierArray = Array.from(frontier);
      const sampleSize = Math.min(frontierArray.length, 12);
      
      for (let i = 0; i < sampleSize; i++) {
        const randIdx = Math.floor(Math.random() * frontierArray.length);
        candidates.push(frontierArray[randIdx]);
      }

      let bestKey: string | null = null;
      let bestScore = -1;
      let isEnemyTarget = false;

      for (const key of candidates) {
        const parts = key.split(",");
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);

        const existing = state.claimedTiles.get(key);
        let score = 0;

        // Is it part of a landmark footprint?
        const isLandmark = this.landmarkTileMap.has(key);

        if (isLandmark && troops >= 15) {
          score = 1000 + Math.random() * 20;
        } else if (existing && existing.ownerId !== schoolId) {
          // Enemy tile
          if (troops >= 15) {
            // Lower HP = higher score
            score = 50 + (100 - existing.hp) * 0.5 + Math.random() * 10;
          } else {
            score = 0;
          }
        } else if (!existing) {
          // Wild tile
          score = 10 + Math.random() * 5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
          isEnemyTarget = existing && existing.ownerId !== schoolId;
        }
      }

      if (!bestKey || bestScore <= 0) continue;

      const [tx, ty] = bestKey.split(",").map(Number);
      
      if (isEnemyTarget) {
        if (troops >= 15) {
          // Attack enemy tile
          state.schoolTroops.set(schoolId, troops - 15);
          const tile = state.claimedTiles.get(bestKey);
          if (tile) {
            tile.hp -= 40;
            if (tile.hp <= 0) {
              const oldOwner = tile.ownerId;
              this.removeOwnedTile(oldOwner, tx, ty, state);
              tile.ownerId = schoolId;
              tile.hp = 60;
              tile.maxHp = 100;
              tile.defenseTier = 0;
              this.addOwnedTile(schoolId, tx, ty, state);
            }
          }
        }
      } else {
        // Claim wild tile
        if (troops >= 5) {
          state.schoolTroops.set(schoolId, troops - 5);
          const newTile = new TileState();
          newTile.x = tx;
          newTile.y = ty;
          newTile.ownerId = schoolId;
          newTile.hp = 100;
          newTile.maxHp = 100;
          newTile.defenseTier = 0;

          state.claimedTiles.set(bestKey, newTile);
          this.addOwnedTile(schoolId, tx, ty, state);
        }
      }
    }
  }
}
