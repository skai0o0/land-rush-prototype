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

  public hasFriendlyNeighbor(schoolId: string, x: number, y: number, state: GameState): boolean {
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
      const nTile = state.claimedTiles.get(`${nx},${ny}`);
      if (nTile && nTile.ownerId === schoolId) {
        return true;
      }
    }
    return false;
  }

  public removeOwnedTile(schoolId: string, x: number, y: number, state: GameState) {
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    let hasFriendly = false;
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
      const nTile = state.claimedTiles.get(`${nx},${ny}`);
      if (nTile && nTile.ownerId === schoolId) {
        hasFriendly = true;
        break;
      }
    }

    const frontier = this.frontiers.get(schoolId);
    if (frontier) {
      if (hasFriendly) {
        frontier.add(`${x},${y}`);
      } else {
        frontier.delete(`${x},${y}`);
      }

      // Clean up orphaned frontier tiles that depended on (x, y)
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
        const nKey = `${nx},${ny}`;
        if (frontier.has(nKey)) {
          if (!this.hasFriendlyNeighbor(schoolId, nx, ny, state)) {
            frontier.delete(nKey);
          }
        }
      }
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
        const candKey = frontierArray[randIdx];
        const [cx, cy] = candKey.split(",").map(Number);
        if (!this.hasFriendlyNeighbor(schoolId, cx, cy, state)) {
          frontier.delete(candKey);
          continue;
        }
        candidates.push(candKey);
      }

      let bestKey: string | null = null;
      let bestScore = -1;

      for (const key of candidates) {
        const parts = key.split(",");
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);

        const existing = state.claimedTiles.get(key);
        let score = 0;

        // Is it part of a landmark footprint?
        const isLandmark = this.landmarkTileMap.has(key);
        const lmKey = this.landmarkTileMap.get(key);
        const lmConfig = lmKey ? LANDMARK_ROSTER[lmKey] : null;

        if (isLandmark && lmConfig) {
          const isEnemyControlled = existing && existing.ownerId !== "" && existing.ownerId !== schoolId;
          const cost = isEnemyControlled ? lmConfig.attackCost : lmConfig.claimCost;

          if (troops >= cost) {
            // Highly prized strategic target! Prioritize core and damaged tiles
            const isCore = existing ? existing.maxHp >= lmConfig.coreHp : false;
            const coreBonus = isCore ? 300 : 0;
            const hpFactor = existing ? (existing.maxHp - existing.hp) * 0.2 : 0;
            score = 1200 + coreBonus + hpFactor + Math.random() * 25;
          } else {
            score = 0; // Not enough troops to contest landmark
          }
        } else if (existing && existing.ownerId !== schoolId) {
          // Normal enemy tile
          if (troops >= 15) {
            // Lower HP = higher score
            score = 50 + (100 - existing.hp) * 0.5 + Math.random() * 10;
          } else {
            score = 0;
          }
        } else if (!existing) {
          // Normal wild tile
          score = 10 + Math.random() * 5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }

      if (!bestKey || bestScore <= 0) continue;

      const [tx, ty] = bestKey.split(",").map(Number);
      if (!this.hasFriendlyNeighbor(schoolId, tx, ty, state)) {
        frontier.delete(bestKey);
        continue;
      }

      const isLandmark = this.landmarkTileMap.has(bestKey);
      const lmKey = this.landmarkTileMap.get(bestKey);
      const lmConfig = lmKey ? LANDMARK_ROSTER[lmKey] : null;
      const existing = state.claimedTiles.get(bestKey);

      if (isLandmark && lmConfig && existing) {
        // Landmark fortress tile action
        const isEnemyControlled = existing.ownerId !== "" && existing.ownerId !== schoolId;
        const cost = isEnemyControlled ? lmConfig.attackCost : lmConfig.claimCost;

        if (troops >= cost) {
          state.schoolTroops.set(schoolId, troops - cost);
          const rawDamage = 40;
          const armorReduction = existing.defenseTier * 8;
          const damage = Math.max(12, rawDamage - armorReduction);
          existing.hp -= damage;

          if (existing.hp <= 0) {
            const oldOwner = existing.ownerId;
            if (oldOwner) {
              this.removeOwnedTile(oldOwner, tx, ty, state);
              if (room?.clusterEngine) {
                room.clusterEngine.setTile(tx, ty, 0, 0, 0);
                const nbors = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
                for (const [nx, ny] of nbors) {
                  if (nx >= 0 && nx < 1000 && ny >= 0 && ny < 1000) {
                    room.handleClusterUpdate?.(oldOwner, nx, ny);
                  }
                }
              }
            }
            existing.ownerId = schoolId;
            // Retain fortress stats on capture (40% max HP)
            existing.hp = Math.floor(existing.maxHp * 0.4);
            this.addOwnedTile(schoolId, tx, ty, state);

            if (room?.clusterEngine) {
              const numId = typeof room.getSchoolNumericId === "function" ? room.getSchoolNumericId(schoolId) : 0;
              room.clusterEngine.setTile(tx, ty, numId, existing.defenseTier, existing.hp);
              if (typeof room.handleClusterUpdate === "function") {
                room.handleClusterUpdate(schoolId, tx, ty);
              }
            }

            if (typeof room.checkLandmarkCapture === "function") {
              room.checkLandmarkCapture(lmKey);
            }
          } else {
            if (room?.clusterEngine && existing.ownerId) {
              const numId = typeof room.getSchoolNumericId === "function" ? room.getSchoolNumericId(existing.ownerId) : 0;
              room.clusterEngine.setTile(tx, ty, numId, existing.defenseTier, existing.hp);
            }
          }
        }
      } else if (existing && existing.ownerId !== schoolId) {
        // Normal enemy tile attack
        if (troops >= 15) {
          state.schoolTroops.set(schoolId, troops - 15);
          const rawDamage = 40;
          const armorReduction = existing.defenseTier * 8;
          const damage = Math.max(12, rawDamage - armorReduction);
          existing.hp -= damage;

          if (existing.hp <= 0) {
            const oldOwner = existing.ownerId;
            if (oldOwner) {
              this.removeOwnedTile(oldOwner, tx, ty, state);
              if (room?.clusterEngine) {
                room.clusterEngine.setTile(tx, ty, 0, 0, 0);
                const nbors = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
                for (const [nx, ny] of nbors) {
                  if (nx >= 0 && nx < 1000 && ny >= 0 && ny < 1000) {
                    room.handleClusterUpdate?.(oldOwner, nx, ny);
                  }
                }
              }
            }
            existing.ownerId = schoolId;
            existing.hp = 60;
            existing.maxHp = 100;
            existing.defenseTier = 0;
            this.addOwnedTile(schoolId, tx, ty, state);

            if (room?.clusterEngine) {
              const numId = typeof room.getSchoolNumericId === "function" ? room.getSchoolNumericId(schoolId) : 0;
              room.clusterEngine.setTile(tx, ty, numId, existing.defenseTier, existing.hp);
              if (typeof room.handleClusterUpdate === "function") {
                room.handleClusterUpdate(schoolId, tx, ty);
              }
            }
          } else {
            if (room?.clusterEngine && existing.ownerId) {
              const numId = typeof room.getSchoolNumericId === "function" ? room.getSchoolNumericId(existing.ownerId) : 0;
              room.clusterEngine.setTile(tx, ty, numId, existing.defenseTier, existing.hp);
            }
          }
        }
      } else if (!existing) {
        // Normal wild tile claim
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

          if (room?.clusterEngine) {
            const numId = typeof room.getSchoolNumericId === "function" ? room.getSchoolNumericId(schoolId) : 0;
            room.clusterEngine.setTile(tx, ty, numId, newTile.defenseTier, newTile.hp);
            if (typeof room.handleClusterUpdate === "function") {
              room.handleClusterUpdate(schoolId, tx, ty);
            }
          }
        }
      }
    }
  }
}
