import { Room, Client, Delayed } from "colyseus";
import {
  GameState,
  TileState,
  PlayerState,
  HQState,
  LandmarkState,
  UniStopState,
  ChestState
} from "../schema/GameState";
import { BotManager } from "../bots/BotManager";
import { SCHOOL_IDS, SCHOOL_ROSTER, getSchoolIdFromEmail } from "../../../shared/constants/schools";
import { LANDMARK_IDS, LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import {
  UniStopTier,
  ChestTier,
  UNISTOP_CONFIGS,
  CHEST_CONFIGS,
  UNISTOP_LOOT_TABLES,
  CHEST_LOOT_TABLES,
  MAX_UNISTOP_INTERACTION_DISTANCE,
  MAX_CHEST_INTERACTION_DISTANCE,
  rollLoot,
  generateCarouselItems,
  ALL_LOOT_ITEMS
} from "../../../shared/constants/unistops";
import {
  ClientClaimMessage,
  ClientFortifyMessage,
  ClientStudyTileMessage,
  ClientContributeFuelMessage,
  ClientSetSpeedMessage,
  ClientBulkDispatchMessage,
  ClientSelectSchoolMessage,
  ClientSetRoleMessage,
  ClientRollUniStopMessage,
  ClientOpenChestMessage,
  ClientUpdateMapLayoutMessage,
  PlayerRole
} from "../../../shared/types";
import { TerritoryClusterEngine } from "../../../shared/engine/territoryClusterEngine";
import { LandDataPlane, LAND_FRAME_CHANNEL, DEFAULT_FLUSH_MS } from "../land/landDataPlane";
import { decodeClientFrame, ClaimFrame, FortifyFrame, StudyFrame, FuelFrame } from "../../../shared/land/protocol";


export class CampusRoom extends Room<GameState> {
  private gameInterval?: Delayed;
  private landFlushInterval?: Delayed;
  private botManager = new BotManager();
  private initialHQTiles: Map<string, { x: number; y: number; defenseTier: number; hp: number }[]> = new Map();
  private landmarkTileMap: Map<string, { landmarkKey: string; isCore: boolean }> = new Map();
  private initialLandmarkTiles: Map<string, { x: number; y: number; hp: number; maxHp: number; defenseTier: number }> = new Map();
  private botsEnabled = false;
  public clusterEngine = new TerritoryClusterEngine(1000, 1000);
  public activeBastions: Map<string, any> = new Map();
  public activeMegaEmblems: Map<string, any> = new Map();
  /** Data-plane authority for ownership/combat (snap / own_batch / combat frames). */
  public landData = new LandDataPlane((type, payload) => this.broadcast(type, payload));

  public getSchoolNumericId(schoolId: string): number {
    return SCHOOL_IDS.indexOf(schoolId) + 1;
  }

  /** Write-through for bots / cluster paths: LandState owner + combat. */
  public syncLandTile(
    x: number,
    y: number,
    ownerId: string,
    hp: number,
    maxHp: number,
    defenseTier: number
  ): void {
    this.landData.writeTile(x, y, ownerId, hp, maxHp, defenseTier);
  }

  onCreate(options: any) {
    this.autoDispose = false;
    this.setState(new GameState());

    // 1. Spawn 5 School HQs (distance > 200 tiles)
    this.spawnHQs();

    // 2. Spawn 10 Landmarks (distance from HQs > 75 tiles, from each other > 65 tiles)
    this.spawnLandmarks();

    // 2b. Spawn UniStops and Chests
    this.spawnUniStops();
    this.spawnChests();

    // 3. Initialize initial troops (500 per school)
    for (const schoolId of SCHOOL_IDS) {
      this.state.schoolTroops.set(schoolId, 500);
    }

    // 4. Register Message Handlers
    this.registerMessages();

    // 5. Start Game Loop at default 1x
    this.setSimulationSpeed(1);

    // 6. LandState flush timer: broadcast own_batch / combat when non-empty
    this.landFlushInterval = this.clock.setInterval(() => this.landData.flush(), DEFAULT_FLUSH_MS);
  }

  private spawnHQs() {
    const placed: { x: number; y: number }[] = [];
    const minDistance = 200;
    const margin = 120;
    const maxBound = 880;

    for (const schoolId of SCHOOL_IDS) {
      let x = 0;
      let y = 0;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 1000) {
        attempts++;
        x = Math.floor(margin + Math.random() * (maxBound - margin));
        y = Math.floor(margin + Math.random() * (maxBound - margin));

        valid = true;
        for (const p of placed) {
          const dist = Math.hypot(x - p.x, y - p.y);
          if (dist < minDistance) {
            valid = false;
            break;
          }
        }
      }

      placed.push({ x, y });

      const hqState = new HQState();
      hqState.schoolId = schoolId;
      hqState.x = x;
      hqState.y = y;
      this.state.hqs.set(schoolId, hqState);

      // Claim initial HQ territory: Hexagonal footprint diameter ~20 tiles (radius 10)
      const schoolHQTiles: { x: number; y: number; defenseTier: number; hp: number }[] = [];
      const hexRadius = 10;
      for (let dx = -hexRadius; dx <= hexRadius; dx++) {
        const maxY = Math.floor((2 * hexRadius - Math.abs(dx)) / Math.sqrt(3));
        for (let dy = -maxY; dy <= maxY; dy++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || tx >= 1000 || ty < 0 || ty >= 1000) continue;

          const key = `${tx},${ty}`;
          const tile = new TileState();
          tile.x = tx;
          tile.y = ty;
          tile.ownerId = schoolId;
          const dist = Math.hypot(dx, dy);
          tile.defenseTier = dist <= 3 ? 3 : (dist <= 7 ? 2 : 1);
          tile.hp = 500;
          tile.maxHp = 500;
          tile.retention = 100;
          tile.maxRetention = 100;
          tile.lastStudiedAt = Date.now();
          tile.studyCountBySchool.set(schoolId, 10);

          this.state.claimedTiles.set(key, tile);
          this.landData.writeTile(tx, ty, schoolId, tile.hp, tile.maxHp, tile.defenseTier);
          this.botManager.addOwnedTile(schoolId, tx, ty, this.state);
          this.clusterEngine.setTile(tx, ty, this.getSchoolNumericId(schoolId), tile.defenseTier, tile.hp);
          schoolHQTiles.push({ x: tx, y: ty, defenseTier: tile.defenseTier, hp: tile.hp });
        }
      }
      this.initialHQTiles.set(schoolId, schoolHQTiles);
    }
  }

  private spawnLandmarks() {
    const placed: { x: number; y: number }[] = [];
    const minHqDistance = 75;
    const minLmDistance = 65;
    const margin = 100;
    const maxBound = 900;

    const lmMapForBot = new Map<string, { x: number; y: number; landmarkKey: string }>();

    for (const lmKey of LANDMARK_IDS) {
      let x = 0;
      let y = 0;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 1000) {
        attempts++;
        x = Math.floor(margin + Math.random() * (maxBound - margin));
        y = Math.floor(margin + Math.random() * (maxBound - margin));

        valid = true;
        // Check distance against HQs
        this.state.hqs.forEach((hq) => {
          if (Math.hypot(x - hq.x, y - hq.y) < minHqDistance) {
            valid = false;
          }
        });

        if (!valid) continue;

        // Check distance against other landmarks
        for (const p of placed) {
          if (Math.hypot(x - p.x, y - p.y) < minLmDistance) {
            valid = false;
            break;
          }
        }
      }

      placed.push({ x, y });

      const lmState = new LandmarkState();
      lmState.id = lmKey;
      lmState.landmarkKey = lmKey;
      lmState.x = x;
      lmState.y = y;
      lmState.ownerId = "";
      lmState.currentFuel = 0;
      lmState.maxFuel = 500;
      lmState.litBySchoolId = "";
      lmState.buffActive = false;
      this.state.landmarks.set(lmKey, lmState);

      lmMapForBot.set(lmKey, { x, y, landmarkKey: lmKey });

      // Pre-populate Landmark tiles as neutral fortress tiles with high HP & defenseTier
      const config = LANDMARK_ROSTER[lmKey];
      if (config) {
        const fw = config.footprint.width;
        const fh = config.footprint.height;
        const coreX = x + Math.floor(fw / 2);
        const coreY = y + Math.floor(fh / 2);

        for (let dx = 0; dx < fw; dx++) {
          for (let dy = 0; dy < fh; dy++) {
            const tx = x + dx;
            const ty = y + dy;
            const key = `${tx},${ty}`;
            const isCore = (tx === coreX && ty === coreY);

            const tile = new TileState();
            tile.x = tx;
            tile.y = ty;
            tile.ownerId = ""; // neutral fortress
            tile.hp = isCore ? config.coreHp : config.tileHp;
            tile.maxHp = tile.hp;
            tile.defenseTier = isCore ? Math.min(3, config.defenseTier + 1) : config.defenseTier;
            tile.retention = 100;
            tile.maxRetention = 100;
            tile.lastStudiedAt = Date.now();


            this.state.claimedTiles.set(key, tile);
            this.landData.writeTile(tx, ty, "", tile.hp, tile.maxHp, tile.defenseTier);
            this.landmarkTileMap.set(key, { landmarkKey: lmKey, isCore });
            this.clusterEngine.setTile(tx, ty, 0, tile.defenseTier, tile.hp);
            this.initialLandmarkTiles.set(key, {
              x: tx,
              y: ty,
              hp: tile.hp,
              maxHp: tile.maxHp,
              defenseTier: tile.defenseTier
            });
          }
        }
      }
    }

    this.botManager.initLandmarks(lmMapForBot);
  }

  private spawnUniStops() {
    const placed: { x: number; z: number }[] = [];
    const minHqDistance = 35;
    const minLmDistance = 35;
    const minStopDistance = 30;
    const margin = 80;
    const maxBound = 920;

    // 15 UniStops: 8 Aspire, 5 Nitro, 2 Predator
    const tiers: UniStopTier[] = [
      'aspire', 'aspire', 'aspire', 'aspire', 'aspire', 'aspire', 'aspire', 'aspire',
      'nitro', 'nitro', 'nitro', 'nitro', 'nitro',
      'predator', 'predator'
    ];

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      let x = 0;
      let z = 0;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 1000) {
        attempts++;
        x = Math.floor(margin + Math.random() * (maxBound - margin));
        z = Math.floor(margin + Math.random() * (maxBound - margin));

        valid = true;
        // Distance against HQs
        this.state.hqs.forEach((hq) => {
          if (Math.hypot(x - hq.x, z - hq.y) < minHqDistance) {
            valid = false;
          }
        });
        if (!valid) continue;

        // Distance against Landmarks
        this.state.landmarks.forEach((lm) => {
          if (Math.hypot(x - lm.x, z - lm.y) < minLmDistance) {
            valid = false;
          }
        });
        if (!valid) continue;

        // Distance against other placed UniStops
        for (const p of placed) {
          if (Math.hypot(x - p.x, z - p.z) < minStopDistance) {
            valid = false;
            break;
          }
        }
      }

      placed.push({ x, z });
      const cfg = UNISTOP_CONFIGS[tier];
      const stopState = new UniStopState();
      stopState.id = `unistop_${tier}_${i + 1}`;
      stopState.name = `${cfg.name} #${i + 1}`;
      stopState.tier = tier;
      stopState.x = x;
      stopState.z = z;
      stopState.cooldownUntil = 0;
      this.state.unistops.set(stopState.id, stopState);
    }
  }

  private spawnChests() {
    const placed: { x: number; z: number }[] = [];
    const minHqDistance = 40;
    const minLmDistance = 35;
    const minChestDistance = 30;
    const margin = 90;
    const maxBound = 910;

    // 15 Chests: 8 Silver, 5 Gold, 2 Platinum
    const tiers: ChestTier[] = [
      'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver',
      'gold', 'gold', 'gold', 'gold', 'gold',
      'platinum', 'platinum'
    ];

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      let x = 0;
      let z = 0;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 1000) {
        attempts++;
        x = Math.floor(margin + Math.random() * (maxBound - margin));
        z = Math.floor(margin + Math.random() * (maxBound - margin));

        valid = true;
        // Distance against HQs
        this.state.hqs.forEach((hq) => {
          if (Math.hypot(x - hq.x, z - hq.y) < minHqDistance) {
            valid = false;
          }
        });
        if (!valid) continue;

        // Distance against Landmarks
        this.state.landmarks.forEach((lm) => {
          if (Math.hypot(x - lm.x, z - lm.y) < minLmDistance) {
            valid = false;
          }
        });
        if (!valid) continue;

        // Distance against UniStops
        this.state.unistops.forEach((stop) => {
          if (Math.hypot(x - stop.x, z - stop.z) < 20) {
            valid = false;
          }
        });
        if (!valid) continue;

        // Distance against other Chests
        for (const p of placed) {
          if (Math.hypot(x - p.x, z - p.z) < minChestDistance) {
            valid = false;
            break;
          }
        }
      }

      placed.push({ x, z });
      const chestState = new ChestState();
      chestState.id = `chest_${tier}_${i + 1}`;
      chestState.tier = tier;
      chestState.x = x;
      chestState.z = z;
      chestState.isOpened = false;
      chestState.openedBySchoolId = "";
      this.state.chests.set(chestState.id, chestState);
    }
  }


  public checkLandmarkCapture(lmKey: string) {
    const lm = this.state.landmarks.get(lmKey);
    const config = LANDMARK_ROSTER[lmKey];
    if (!lm || !config) return;

    if (lm.litBySchoolId && lm.ownerId !== lm.litBySchoolId) {
      lm.ownerId = lm.litBySchoolId;
      lm.buffActive = true;
      console.log(`[CampusRoom] Landmark ${config.name} (${lmKey}) bonfire controlled by: "${lm.litBySchoolId}"`);
    }
  }

  public handleClusterUpdate(schoolId: string, startX: number, startY: number) {
    const schoolNumId = this.getSchoolNumericId(schoolId);
    if (!schoolNumId) return;

    const result = this.clusterEngine.evaluateCluster(startX, startY);
    if (!result) return;

    // Apply the changes back to state (fortifyTierMap was modified in engine)
    result.tiles.forEach((cIdx: number) => {
      const { x, y } = this.clusterEngine.getCoords(cIdx);
      const key = `${x},${y}`;
      const tile = this.state.claimedTiles.get(key);
      if (tile) {
        const engineTier = this.clusterEngine.getTileFortifyTier(x, y);
        if (tile.defenseTier !== engineTier) {
          tile.defenseTier = engineTier;
          this.landData.setCombat(x, y, tile.hp, tile.maxHp, tile.defenseTier);
        }
      }
    });

    if (result.type === 'bastion') {
      const payload = { schoolId, size: result.clusterSize, borderTiles: result.borderTiles };
      this.activeBastions.set(schoolId, payload);
      this.broadcast("bastion_formed", payload);
    } else if (result.type === 'mega_emblem') {
      const payload = { schoolId, boundingBox: result.boundingBox };
      this.activeMegaEmblems.set(schoolId, payload);
      this.broadcast("mega_emblem_formed", payload);
    }
  }

  public setSimulationSpeed(speed: number) {
    this.state.simulationSpeed = speed;
    if (this.gameInterval) {
      this.gameInterval.clear();
    }

    // Map speed to millisecond intervals
    const intervalMap: Record<number, number> = {
      1: 1000,
      2: 500,
      5: 200,
      10: 100,
      50: 20 // 50 ticks per second
    };

    const ms = intervalMap[speed] || 1000;
    this.gameInterval = this.clock.setInterval(() => this.onLogicTick(), ms);
  }

  private onLogicTick() {
    this.state.currentTick++;

    // Periodic troop generation (+1 troop every 1000ms equivalent)
    const intervalMap: Record<number, number> = { 1: 1000, 2: 500, 5: 200, 10: 100, 50: 20 };
    const ms = intervalMap[this.state.simulationSpeed] || 1000;
    const ticksPerSec = 1000 / ms;

    // Add base troop every ~1 sec or scaled proportionally
    if (this.state.currentTick % Math.max(1, Math.floor(ticksPerSec)) === 0) {
      for (const schoolId of SCHOOL_IDS) {
        const cur = this.state.schoolTroops.get(schoolId) || 0;
        this.state.schoolTroops.set(schoolId, cur + 1);
      }

      // Process Landmark Bonfire effects for lit landmarks
      for (const lmKey of LANDMARK_IDS) {
        this.checkLandmarkCapture(lmKey);
        const lm = this.state.landmarks.get(lmKey);
        const config = LANDMARK_ROSTER[lmKey];
        if (lm && config && lm.buffActive && lm.litBySchoolId) {
          // Troop / Point generation buff based on landmark config
          const bonus = config.troopBonus || 6;
          const cur = this.state.schoolTroops.get(lm.litBySchoolId) || 0;
          this.state.schoolTroops.set(lm.litBySchoolId, cur + bonus);
        }
      }
    }

    // Process Knowledge Decay heartbeat (every 10 ticks = 10s at 1x)
    const decayIntervalTicks = Math.max(1, Math.floor(ticksPerSec)) * 10;
    if (this.state.currentTick % decayIntervalTicks === 0) {
      this.processKnowledgeDecay();
    }


    // Run Bot autonomous simulation (only if enabled)
    if (this.botsEnabled) {
      this.botManager.processBots(this.state, this);
    }
  }

  private sendLandAck(client: Client, op: string, x: number, y: number, ok: boolean, reason?: string) {
    this.landData.sendAck((type, payload) => client.send(type, payload), op, x, y, ok, reason);
  }

  /**
   * Claim path (game rules unchanged). Writes LandState on every mutation.
   * Sends ack to the actor. Handles both legacy "claim_tile" and protocol "claim".
   */
  /**
   * Check if a school has opened a path to the Landmark.
   * Path exists if at least one tile inside or directly adjacent to the Landmark footprint
   * is owned by the school.
   */
  public hasPathToLandmark(schoolId: string, lm: LandmarkState): boolean {
    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    const fw = config?.footprint.width || 14;
    const fh = config?.footprint.height || 14;

    for (let dx = -1; dx <= fw; dx++) {
      for (let dy = -1; dy <= fh; dy++) {
        const tx = lm.x + dx;
        const ty = lm.y + dy;
        if (tx < 0 || tx >= 1000 || ty < 0 || ty >= 1000) continue;
        const t = this.state.claimedTiles.get(`${tx},${ty}`);
        if (t && t.ownerId === schoolId) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Claim path: Mở rộng vùng tri thức cho các ô hoang dã chưa có chủ.
   * Cũ: tấn công trừ HP đất đã có chủ.
   * Mới: Bỏ cơ chế gia cố và tấn công trừ HP. Đất có chủ phải dùng 'Ôn bài' (Giao lưu tri thức).
   */
  private handleClaimAction(client: Client, data: { x: number; y: number }, op: string = "claim") {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { x, y } = data;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
      this.sendLandAck(client, op, x, y, false, "out_of_bounds");
      return;
    }

    const key = `${x},${y}`;
    const existing = this.state.claimedTiles.get(key);

    // Adjacency check
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    let isAdjacent = false;
    for (const [nx, ny] of neighbors) {
      const n = this.state.claimedTiles.get(`${nx},${ny}`);
      if (n && n.ownerId === player.schoolId) {
        isAdjacent = true;
        break;
      }
    }

    if (!isAdjacent) {
      client.send("error", { message: "Ô không tiếp giáp với vùng tri thức của trường bạn!" });
      this.sendLandAck(client, op, x, y, false, "not_adjacent");
      return;
    }

    const schoolTroops = this.state.schoolTroops.get(player.schoolId) || 0;

    // Check Landmark tile
    const lmInfo = this.landmarkTileMap.get(key);
    if (lmInfo) {
      client.send("error", {
        message: "Công trình được thắp lửa bằng Than củi! Hãy dùng tính năng 'Thắp lửa Công trình' để tiếp tế Than củi."
      });
      this.sendLandAck(client, op, x, y, false, "use_contribute_fuel");
      return;
    }

    // 1. Wild tile (chưa có chủ)
    if (!existing || existing.ownerId === "") {
      if (player.email && player.personalTroops < 1) {
        client.send("error", { message: "Không đủ Điểm! Cần 1 Điểm để mở rộng vùng tri thức." });
        this.sendLandAck(client, op, x, y, false, "not_enough_personal");
        return;
      }

      if (schoolTroops < 1) {
        client.send("error", { message: "Không đủ quân lực!" });
        this.sendLandAck(client, op, x, y, false, "not_enough_troops");
        return;
      }

      if (player.email) {
        player.personalTroops -= 1;
      }
      this.state.schoolTroops.set(player.schoolId, schoolTroops - 1);

      const newTile = new TileState();
      newTile.x = x;
      newTile.y = y;
      newTile.ownerId = player.schoolId;
      newTile.retention = 100;
      newTile.maxRetention = 100;
      newTile.hp = 100;
      newTile.maxHp = 100;
      newTile.defenseTier = 0;
      newTile.lastStudiedAt = Date.now();
      newTile.studyCountBySchool.set(player.schoolId, 1);

      this.state.claimedTiles.set(key, newTile);
      if (!this.landData.writeTile(x, y, player.schoolId, newTile.hp, newTile.maxHp, newTile.defenseTier)) {
        this.state.claimedTiles.delete(key);
        if (player.email) player.personalTroops += 1;
        this.state.schoolTroops.set(player.schoolId, schoolTroops);
        this.sendLandAck(client, op, x, y, false, "out_of_bounds");
        return;
      }

      this.botManager.addOwnedTile(player.schoolId, x, y, this.state);
      this.clusterEngine.setTile(x, y, this.getSchoolNumericId(player.schoolId), newTile.defenseTier, newTile.hp);
      this.handleClusterUpdate(player.schoolId, x, y);
      this.sendLandAck(client, op, x, y, true);
      return;
    }

    // 2. Already owned by player's school
    if (existing.ownerId === player.schoolId) {
      this.sendLandAck(client, op, x, y, true);
      return;
    }

    // 3. Tile owned by another school -> DIRECT ATTACK REMOVED!
    // Knowledge Overlap & Decay applies instead.
    client.send("error", {
      message: "Không thể tấn công trực tiếp đất đã có chủ! Hãy dùng 'Ôn bài' (Giao lưu tri thức) tại ô tiếp giáp để củng cố tri thức và giành quyền sở hữu khi đối phương lơ là."
    });
    this.sendLandAck(client, op, x, y, false, "knowledge_exchange_required");
  }

  /**
   * Hành động Ôn bài / Củng cố tri thức (studyTile):
   * - Sinh viên dùng Điểm (Points) để ôn bài tại ô của trường mình hoặc ô tiếp giáp.
   * - Tăng chỉ số retention và cập nhật lastStudiedAt = Date.now().
   * - Tại ô tiếp giáp đối phương: tích luỹ điểm học tập của trường mình và thử thách độ bền tri thức của đối phương.
   */
  public handleStudyAction(
    client: Client,
    data: ClientStudyTileMessage | { x: number; y?: number; z?: number; points?: number },
    op: string = "study"
  ) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const x = Number((data as any).x);
    const y = (data as any).y !== undefined ? Number((data as any).y) : Number((data as any).z);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
      this.sendLandAck(client, op, x, y, false, "out_of_bounds");
      return;
    }

    const key = `${x},${y}`;
    const existing = this.state.claimedTiles.get(key);

    const isFriendly = existing?.ownerId === player.schoolId;
    let isAdjacentToFriendly = false;
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      const n = this.state.claimedTiles.get(`${nx},${ny}`);
      if (n && n.ownerId === player.schoolId) {
        isAdjacentToFriendly = true;
        break;
      }
    }

    if (!isFriendly && !isAdjacentToFriendly) {
      client.send("error", {
        message: "Chỉ có thể ôn bài tại ô tri thức của trường bạn hoặc ô giao lưu tri thức tiếp giáp!"
      });
      this.sendLandAck(client, op, x, y, false, "not_adjacent_or_friendly");
      return;
    }

    const points = Math.max(1, Math.floor(data.points || 1));
    const schoolTroops = this.state.schoolTroops.get(player.schoolId) || 0;

    if (player.email && player.personalTroops < points) {
      client.send("error", { message: `Không đủ Điểm! Cần ${points} Điểm để ôn bài.` });
      this.sendLandAck(client, op, x, y, false, "not_enough_personal");
      return;
    }

    if (schoolTroops < points) {
      client.send("error", { message: "Không đủ quân lực để ôn bài!" });
      this.sendLandAck(client, op, x, y, false, "not_enough_troops");
      return;
    }

    // Deduct points
    if (player.email) {
      player.personalTroops -= points;
    }
    this.state.schoolTroops.set(player.schoolId, schoolTroops - points);

    // Wild tile case: claiming by studying
    if (!existing || existing.ownerId === "") {
      const newTile = new TileState();
      newTile.x = x;
      newTile.y = y;
      newTile.ownerId = player.schoolId;
      newTile.retention = 100;
      newTile.maxRetention = 100;
      newTile.hp = 100;
      newTile.maxHp = 100;
      newTile.defenseTier = 0;
      newTile.lastStudiedAt = Date.now();
      newTile.studyCountBySchool.set(player.schoolId, points);

      this.state.claimedTiles.set(key, newTile);
      this.landData.writeTile(x, y, player.schoolId, newTile.hp, newTile.maxHp, newTile.defenseTier);
      this.botManager.addOwnedTile(player.schoolId, x, y, this.state);
      this.clusterEngine.setTile(x, y, this.getSchoolNumericId(player.schoolId), newTile.defenseTier, newTile.hp);
      this.handleClusterUpdate(player.schoolId, x, y);

      this.sendLandAck(client, op, x, y, true);
      client.send("tile_studied", {
        x,
        y,
        schoolId: player.schoolId,
        retention: newTile.retention,
        lastStudiedAt: newTile.lastStudiedAt
      });
      return;
    }

    // Friendly tile: reinforce retention
    if (isFriendly) {
      existing.retention = Math.min(existing.maxRetention, existing.retention + points * 15);
      existing.lastStudiedAt = Date.now();
      const prevStudy = existing.studyCountBySchool.get(player.schoolId) || 0;
      existing.studyCountBySchool.set(player.schoolId, prevStudy + points);
      existing.hp = existing.retention;

      this.landData.setCombat(x, y, existing.hp, existing.maxHp, existing.defenseTier);
      this.sendLandAck(client, op, x, y, true);
      client.send("tile_studied", {
        x,
        y,
        schoolId: player.schoolId,
        retention: existing.retention,
        lastStudiedAt: existing.lastStudiedAt
      });
      return;
    }

    // Overlap tile of another school (Khu vực giao lưu tri thức)
    const prevEnemyStudy = existing.studyCountBySchool.get(player.schoolId) || 0;
    existing.studyCountBySchool.set(player.schoolId, prevEnemyStudy + points);

    // Diligent study challenges the neglected retention
    existing.retention = Math.max(0, existing.retention - points * 10);
    existing.hp = existing.retention;
    this.landData.setCombat(x, y, existing.hp, existing.maxHp, existing.defenseTier);

    if (existing.retention <= 0) {
      // Diligent study succeeds! Transfer ownership to challenger
      this.transferTileOwnership(existing, player.schoolId, "study_contest");
    }

    this.sendLandAck(client, op, x, y, true);
    client.send("tile_studied", {
      x,
      y,
      schoolId: player.schoolId,
      retention: existing.retention,
      lastStudiedAt: existing.lastStudiedAt
    });
  }

  /**
   * Hành động Than củi & Thắp lửa Công trình (contributeFuel):
   * - Sinh viên đã mở đường tới Công trình dùng Điểm quy đổi thành Than củi (1 Điểm = 1 Than củi).
   * - Đạt maxFuel (500) sẽ thắp lửa và kích hoạt buff cho trường.
   * - Trường khác có thể nạp than củi vượt mốc để thắp lửa đè lên.
   */
  public handleContributeFuelAction(
    client: Client,
    data: { landmarkId: string; points?: number; amount?: number }
  ) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const lmKey = data.landmarkId;
    let lm = this.state.landmarks.get(lmKey);
    if (!lm) {
      for (const [_, item] of this.state.landmarks) {
        if (item.landmarkKey === lmKey || item.id === lmKey) {
          lm = item;
          break;
        }
      }
    }

    if (!lm) {
      client.send("error", { message: "Không tìm thấy Công trình!" });
      return;
    }

    // Path check: student's school must have opened a path to the Landmark
    if (!this.hasPathToLandmark(player.schoolId, lm)) {
      client.send("error", {
        message: "Trường của bạn chưa mở đường tới Công trình này! Hãy mở rộng vùng tri thức tiếp giáp công trình trước."
      });
      return;
    }

    const amount = Math.max(1, Math.floor(data.points || data.amount || 1));
    const schoolTroops = this.state.schoolTroops.get(player.schoolId) || 0;

    if (player.email && player.personalTroops < amount) {
      client.send("error", {
        message: `Không đủ Điểm! Cần ${amount} Điểm để đổi thành Than củi nạp vào Công trình.`
      });
      return;
    }

    if (schoolTroops < amount) {
      client.send("error", { message: "Không đủ quân lực để nạp Than củi!" });
      return;
    }

    // Deduct points
    if (player.email) {
      player.personalTroops -= amount;
    }
    this.state.schoolTroops.set(player.schoolId, schoolTroops - amount);

    // 1 Điểm = 1 Than củi
    const curSchoolFuel = (lm.fuelBySchool.get(player.schoolId) || 0) + amount;
    lm.fuelBySchool.set(player.schoolId, curSchoolFuel);

    // Determine leading school with highest fuel
    let leadingSchoolId = "";
    let maxFuel = 0;
    lm.fuelBySchool.forEach((fuel, sId) => {
      if (fuel > maxFuel) {
        maxFuel = fuel;
        leadingSchoolId = sId;
      }
    });

    lm.currentFuel = maxFuel;

    // Bonfire lighting check:
    // When a school reaches maxFuel (500), it lights the bonfire.
    // Another school can overtake by exceeding the current lit school's fuel!
    if (maxFuel >= lm.maxFuel) {
      if (lm.litBySchoolId !== leadingSchoolId) {
        const prevSchool = lm.litBySchoolId;
        lm.litBySchoolId = leadingSchoolId;
        lm.ownerId = leadingSchoolId;
        lm.buffActive = true;

        // Color landmark footprint tiles to match the lit school
        const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
        if (config) {
          for (let dx = 0; dx < config.footprint.width; dx++) {
            for (let dy = 0; dy < config.footprint.height; dy++) {
              const tx = lm.x + dx;
              const ty = lm.y + dy;
              const t = this.state.claimedTiles.get(`${tx},${ty}`);
              if (t) {
                t.ownerId = leadingSchoolId;
                this.landData.writeTile(tx, ty, leadingSchoolId, t.hp, t.maxHp, t.defenseTier);
              }
            }
          }
        }

        this.broadcast("landmark_lit", {
          landmarkId: lm.id,
          schoolId: leadingSchoolId,
          previousSchoolId: prevSchool,
          fuel: maxFuel
        });

        console.log(
          `[CampusRoom] Landmark ${lm.landmarkKey || lm.id} LIT by ${leadingSchoolId} (${maxFuel}/${lm.maxFuel} fuel)!`
        );
      }
    }

    client.send("fuel_contributed", {
      landmarkId: lm.id,
      schoolId: player.schoolId,
      schoolFuel: curSchoolFuel,
      currentFuel: lm.currentFuel,
      maxFuel: lm.maxFuel,
      litBySchoolId: lm.litBySchoolId,
      buffActive: lm.buffActive
    });
  }

  /**
   * Hành động quay Trạm tiếp tế UniStop (rollUniStop):
   * - Kiểm tra khoảng cách sinh viên tới trạm
   * - Kiểm tra thời gian hồi chiêu
   * - Tính toán trúng thưởng từ Server Weighted RNG (áp dụng điều kiện hasWeeklyRunningPoints cho quà thật)
   * - Phản hồi kết quả kèm Carousel Items
   */
  public handleRollUniStop(client: Client, data: ClientRollUniStopMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!data || !data.stopId) {
      client.send("error", { message: "Mã Trạm tiếp tế không hợp lệ!" });
      return;
    }

    const stop = this.state.unistops.get(data.stopId);
    if (!stop) {
      client.send("error", { message: "Trạm tiếp tế không tồn tại!" });
      return;
    }

    const now = Date.now();
    if (stop.cooldownUntil && now < stop.cooldownUntil) {
      const remainingSec = Math.ceil((stop.cooldownUntil - now) / 1000);
      client.send("error", {
        message: `Trạm tiếp tế đang trong thời gian hồi chiêu! Vui lòng quay lại sau ${remainingSec}s.`
      });
      return;
    }

    // Kiểm tra khoảng cách nếu client gửi toạ độ
    if (data.x !== undefined && (data.z !== undefined || data.y !== undefined)) {
      const targetZ = data.z !== undefined ? data.z : data.y!;
      const dist = Math.hypot(data.x - stop.x, targetZ - stop.z);
      if (dist > MAX_UNISTOP_INTERACTION_DISTANCE) {
        client.send("error", {
          message: `Bạn đang ở quá xa trạm tiếp tế! (Khoảng cách: ${Math.round(dist)}, tối đa: ${MAX_UNISTOP_INTERACTION_DISTANCE})`
        });
        return;
      }
    }

    const tier = stop.tier as UniStopTier;
    const cfg = UNISTOP_CONFIGS[tier] || UNISTOP_CONFIGS.aspire;
    const lootTable = UNISTOP_LOOT_TABLES[tier] || UNISTOP_LOOT_TABLES.aspire;
    const winningItem = rollLoot(lootTable, player.hasWeeklyRunningPoints);

    // Kích hoạt thời gian hồi chiêu
    stop.cooldownUntil = now + cfg.cooldownMs;

    // Cộng phần thưởng cho người chơi
    if (winningItem.type === "points") {
      const pts = winningItem.amount || 20;
      player.personalTroops += pts;
      const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
      this.state.schoolTroops.set(player.schoolId, curTroops + pts);
    } else if (winningItem.type === "charcoal") {
      const charcoal = winningItem.amount || 15;
      player.charcoal = (player.charcoal || 0) + charcoal;
    } else if (winningItem.type === "key") {
      if (winningItem.keyTier === "silver") player.silverKeys = (player.silverKeys || 0) + 1;
      else if (winningItem.keyTier === "gold") player.goldKeys = (player.goldKeys || 0) + 1;
      else if (winningItem.keyTier === "platinum") player.platinumKeys = (player.platinumKeys || 0) + 1;
    }

    if (winningItem.isRealGift) {
      this.broadcast("real_gift_won", {
        studentEmail: player.email || client.sessionId,
        schoolId: player.schoolId,
        item: winningItem,
        source: "unistop",
        sourceId: stop.id
      });
      console.log(
        `[CampusRoom] 🎁 Real Gift won by ${player.email || client.sessionId} (${player.schoolId}): ${winningItem.name}`
      );
    }

    const carouselItems = generateCarouselItems(winningItem, lootTable, 30, 24);

    client.send("unistop_rolled", {
      stopId: stop.id,
      tier: stop.tier,
      winningItem,
      carouselItems,
      winningIndex: 24,
      cooldownUntil: stop.cooldownUntil,
      playerPoints: player.personalTroops,
      playerCharcoal: player.charcoal,
      silverKeys: player.silverKeys,
      goldKeys: player.goldKeys,
      platinumKeys: player.platinumKeys
    });
  }

  /**
   * Hành động mở Rương (openChest):
   * - Kiểm tra sinh viên có chìa khóa tương ứng (Silver / Gold / Platinum)
   * - Kiểm tra khoảng cách
   * - Mở rương và trả về kết quả Carousel
   */
  public handleOpenChest(client: Client, data: ClientOpenChestMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!data || !data.chestId) {
      client.send("error", { message: "Mã Rương không hợp lệ!" });
      return;
    }

    const chest = this.state.chests.get(data.chestId);
    if (!chest) {
      client.send("error", { message: "Rương không tồn tại!" });
      return;
    }

    if (chest.isOpened) {
      client.send("error", {
        message: `Rương đã được mở bởi trường ${chest.openedBySchoolId.toUpperCase()}!`
      });
      return;
    }

    // Kiểm tra khoảng cách nếu client gửi toạ độ
    if (data.x !== undefined && (data.z !== undefined || data.y !== undefined)) {
      const targetZ = data.z !== undefined ? data.z : data.y!;
      const dist = Math.hypot(data.x - chest.x, targetZ - chest.z);
      if (dist > MAX_CHEST_INTERACTION_DISTANCE) {
        client.send("error", {
          message: `Bạn đang ở quá xa rương! (Khoảng cách: ${Math.round(dist)}, tối đa: ${MAX_CHEST_INTERACTION_DISTANCE})`
        });
        return;
      }
    }

    // Kiểm tra chìa khóa tương ứng
    const tier = chest.tier as ChestTier;
    if (tier === "silver") {
      if ((player.silverKeys || 0) < 1) {
        client.send("error", { message: "Bạn cần có Chìa khoá Bạc (Key - Silver) để mở rương này!" });
        return;
      }
      player.silverKeys -= 1;
    } else if (tier === "gold") {
      if ((player.goldKeys || 0) < 1) {
        client.send("error", { message: "Bạn cần có Chìa khoá Vàng (Key - Gold) để mở rương này!" });
        return;
      }
      player.goldKeys -= 1;
    } else if (tier === "platinum") {
      if ((player.platinumKeys || 0) < 1) {
        client.send("error", { message: "Bạn cần có Chìa khoá Bạch Kim (Key - Platinum) để mở rương này!" });
        return;
      }
      player.platinumKeys -= 1;
    }

    chest.isOpened = true;
    chest.openedBySchoolId = player.schoolId;

    const lootTable = CHEST_LOOT_TABLES[tier] || CHEST_LOOT_TABLES.silver;
    const winningItem = rollLoot(lootTable, player.hasWeeklyRunningPoints);

    // Cộng phần thưởng
    if (winningItem.type === "points") {
      const pts = winningItem.amount || 50;
      player.personalTroops += pts;
      const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
      this.state.schoolTroops.set(player.schoolId, curTroops + pts);
    } else if (winningItem.type === "charcoal") {
      const charcoal = winningItem.amount || 30;
      player.charcoal = (player.charcoal || 0) + charcoal;
    } else if (winningItem.type === "key") {
      if (winningItem.keyTier === "silver") player.silverKeys = (player.silverKeys || 0) + 1;
      else if (winningItem.keyTier === "gold") player.goldKeys = (player.goldKeys || 0) + 1;
      else if (winningItem.keyTier === "platinum") player.platinumKeys = (player.platinumKeys || 0) + 1;
    }

    if (winningItem.isRealGift) {
      this.broadcast("real_gift_won", {
        studentEmail: player.email || client.sessionId,
        schoolId: player.schoolId,
        item: winningItem,
        source: "chest",
        sourceId: chest.id
      });
      console.log(
        `[CampusRoom] 🎁 Real Gift won from Chest by ${player.email || client.sessionId} (${player.schoolId}): ${winningItem.name}`
      );
    }

    const carouselItems = generateCarouselItems(winningItem, lootTable, 30, 24);

    client.send("chest_opened", {
      chestId: chest.id,
      tier: chest.tier,
      winningItem,
      carouselItems,
      winningIndex: 24,
      schoolId: player.schoolId,
      playerPoints: player.personalTroops,
      playerCharcoal: player.charcoal,
      silverKeys: player.silverKeys,
      goldKeys: player.goldKeys,
      platinumKeys: player.platinumKeys
    });

    this.broadcast("chest_claimed", {
      chestId: chest.id,
      tier: chest.tier,
      schoolId: player.schoolId
    });
  }

  /**
   * Cập nhật Bản Đồ Linh Hoạt (Map Layout):
   * Nhận tọa độ mới của HQs, Landmarks, UniStops, Chests từ Map Editor và áp dụng ngay vào GameState.
   */
  public handleUpdateMapLayout(client: Client, data: ClientUpdateMapLayoutMessage) {
    if (!data) return;

    let hqsUpdated = 0;
    let landmarksUpdated = 0;
    let unistopsUpdated = 0;
    let chestsUpdated = 0;

    // 1. Update HQs
    if (data.hqs && Array.isArray(data.hqs)) {
      for (const hqData of data.hqs) {
        if (!hqData.schoolId) continue;
        const targetY = hqData.y !== undefined ? hqData.y : (hqData.z ?? 0);
        let hq = this.state.hqs.get(hqData.schoolId);
        if (hq) {
          hq.x = hqData.x;
          hq.y = targetY;
        } else {
          hq = new HQState();
          hq.schoolId = hqData.schoolId;
          hq.x = hqData.x;
          hq.y = targetY;
          this.state.hqs.set(hqData.schoolId, hq);
        }
        hqsUpdated++;
      }
    }

    // 2. Update Landmarks
    if (data.landmarks && Array.isArray(data.landmarks)) {
      for (const lmData of data.landmarks) {
        if (!lmData.id && !lmData.landmarkKey) continue;
        const key = lmData.id || lmData.landmarkKey!;
        const targetY = lmData.y !== undefined ? lmData.y : (lmData.z ?? 0);
        let lm = this.state.landmarks.get(key);
        if (lm) {
          lm.x = lmData.x;
          lm.y = targetY;
          if (lmData.maxFuel) lm.maxFuel = lmData.maxFuel;
        } else {
          lm = new LandmarkState();
          lm.id = key;
          lm.landmarkKey = lmData.landmarkKey || key;
          lm.x = lmData.x;
          lm.y = targetY;
          if (lmData.maxFuel) lm.maxFuel = lmData.maxFuel;
          this.state.landmarks.set(key, lm);
        }
        landmarksUpdated++;
      }
    }

    // 3. Update UniStops
    if (data.unistops && Array.isArray(data.unistops)) {
      for (const uData of data.unistops) {
        if (!uData.id) continue;
        const targetZ = uData.z !== undefined ? uData.z : (uData.y ?? 0);
        let stop = this.state.unistops.get(uData.id);
        if (stop) {
          stop.x = uData.x;
          stop.z = targetZ;
          if (uData.tier) stop.tier = uData.tier;
          if (uData.name) stop.name = uData.name;
        } else {
          stop = new UniStopState();
          stop.id = uData.id;
          stop.tier = uData.tier || 'aspire';
          stop.name = uData.name || `UniStop - ${stop.tier.toUpperCase()}`;
          stop.x = uData.x;
          stop.z = targetZ;
          stop.cooldownUntil = 0;
          this.state.unistops.set(uData.id, stop);
        }
        unistopsUpdated++;
      }
    }

    // 4. Update Chests
    if (data.chests && Array.isArray(data.chests)) {
      for (const cData of data.chests) {
        if (!cData.id) continue;
        const targetZ = cData.z !== undefined ? cData.z : (cData.y ?? 0);
        let chest = this.state.chests.get(cData.id);
        if (chest) {
          chest.x = cData.x;
          chest.z = targetZ;
          if (cData.tier) chest.tier = cData.tier;
          if (cData.isOpened !== undefined) chest.isOpened = cData.isOpened;
          if (cData.openedBySchoolId !== undefined) chest.openedBySchoolId = cData.openedBySchoolId;
        } else {
          chest = new ChestState();
          chest.id = cData.id;
          chest.tier = cData.tier || 'silver';
          chest.x = cData.x;
          chest.z = targetZ;
          chest.isOpened = cData.isOpened || false;
          chest.openedBySchoolId = cData.openedBySchoolId || "";
          this.state.chests.set(cData.id, chest);
        }
        chestsUpdated++;
      }
    }

    this.broadcast("map_layout_updated", data);
    client.send("map_layout_ack", {
      success: true,
      hqsUpdated,
      landmarksUpdated,
      unistopsUpdated,
      chestsUpdated
    });

    console.log(
      `[CampusRoom] Map layout updated: ${hqsUpdated} HQs, ${landmarksUpdated} Landmarks, ${unistopsUpdated} UniStops, ${chestsUpdated} Chests`
    );
  }


  /**
   * Heartbeat kiểm tra quên bài (Decay loop, chạy mỗi 10-15s):
   * Nếu ô tiếp giáp bị "bỏ bê" quá lâu (không có sinh viên ôn bài), retention giảm dần.
   * Khi retention <= 0 và trường đối phương tiếp giáp chăm ôn bài hơn, quyền sở hữu tự động chuyển giao.
   */
  public processKnowledgeDecay() {
    const now = Date.now();
    const DECAY_NEGLECT_THRESHOLD_MS = 30000; // 30s không ôn bài thì coi như bỏ bê
    const DECAY_RETENTION_RATE = 10; // Giảm 10 retention mỗi chu kỳ heartbeat

    for (const [_, tile] of this.state.claimedTiles) {
      if (!tile.ownerId) continue;

      const x = tile.x;
      const y = tile.y;
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ];

      const enemyNeighbors: { schoolId: string; x: number; y: number }[] = [];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= 1000 || ny < 0 || ny >= 1000) continue;
        const n = this.state.claimedTiles.get(`${nx},${ny}`);
        if (n && n.ownerId && n.ownerId !== tile.ownerId) {
          enemyNeighbors.push({ schoolId: n.ownerId, x: nx, y: ny });
        }
      }

      // Chỉ ô tiếp giáp giao lưu tri thức mới bị quên bài khi bỏ bê
      if (enemyNeighbors.length === 0) continue;

      const timeSinceStudied = now - (tile.lastStudiedAt || 0);
      if (timeSinceStudied < DECAY_NEGLECT_THRESHOLD_MS) continue;

      tile.retention = Math.max(0, tile.retention - DECAY_RETENTION_RATE);
      tile.hp = tile.retention;
      this.landData.setCombat(x, y, tile.hp, tile.maxHp, tile.defenseTier);

      if (tile.retention <= 0) {
        let bestCandidate = "";
        let bestScore = -1;

        for (const enemy of enemyNeighbors) {
          const studyAtTile = tile.studyCountBySchool.get(enemy.schoolId) || 0;
          const neighborTile = this.state.claimedTiles.get(`${enemy.x},${enemy.y}`);
          const neighborRetention = neighborTile ? neighborTile.retention : 50;
          const score = studyAtTile * 10 + neighborRetention;

          if (score > bestScore) {
            bestScore = score;
            bestCandidate = enemy.schoolId;
          }
        }

        if (bestCandidate) {
          this.transferTileOwnership(tile, bestCandidate, "decay_diligent");
        } else {
          // Trở thành ô trung lập nếu không có trường nào chăm hơn
          const oldOwner = tile.ownerId;
          this.botManager.removeOwnedTile(oldOwner, x, y, this.state);
          this.clusterEngine.setTile(x, y, 0, 0, 0);
          tile.ownerId = "";
          tile.retention = 0;
          tile.hp = 0;
          this.landData.writeTile(x, y, "", 0, tile.maxHp, tile.defenseTier);
        }
      }
    }
  }

  /**
   * Chuyển quyền sở hữu ô tri thức sang trường chăm hơn.
   */
  public transferTileOwnership(tile: TileState, newSchoolId: string, reason: string) {
    const oldOwner = tile.ownerId;
    const x = tile.x;
    const y = tile.y;

    if (oldOwner) {
      this.botManager.removeOwnedTile(oldOwner, x, y, this.state);
      this.clusterEngine.setTile(x, y, 0, 0, 0);
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < 1000 && ny >= 0 && ny < 1000) {
          this.handleClusterUpdate(oldOwner, nx, ny);
        }
      }
    }

    tile.ownerId = newSchoolId;
    tile.retention = 60; // Độ bền tri thức ban đầu sau khi tiếp quản
    tile.maxRetention = 100;
    tile.hp = tile.retention;
    tile.maxHp = tile.maxRetention;
    tile.lastStudiedAt = Date.now();
    tile.studyCountBySchool.clear();
    tile.studyCountBySchool.set(newSchoolId, 1);

    this.landData.writeTile(x, y, newSchoolId, tile.hp, tile.maxHp, tile.defenseTier);
    this.botManager.addOwnedTile(newSchoolId, x, y, this.state);
    this.clusterEngine.setTile(x, y, this.getSchoolNumericId(newSchoolId), tile.defenseTier, tile.hp);
    this.handleClusterUpdate(newSchoolId, x, y);

    this.broadcast("knowledge_transferred", {
      x,
      y,
      fromSchool: oldOwner,
      toSchool: newSchoolId,
      reason
    });

    console.log(
      `[CampusRoom] Knowledge transferred at (${x}, ${y}) from "${oldOwner}" to "${newSchoolId}" (reason: ${reason})`
    );
  }

  /**
   * Helper cho Bot ôn bài tại ô tiếp giáp.
   */
  public handleBotStudy(schoolId: string, x: number, y: number, points: number = 1) {
    const key = `${x},${y}`;
    const tile = this.state.claimedTiles.get(key);
    if (!tile) return;

    if (tile.ownerId === schoolId) {
      tile.retention = Math.min(tile.maxRetention, tile.retention + points * 15);
      tile.lastStudiedAt = Date.now();
      const prev = tile.studyCountBySchool.get(schoolId) || 0;
      tile.studyCountBySchool.set(schoolId, prev + points);
      tile.hp = tile.retention;
      this.landData.setCombat(x, y, tile.hp, tile.maxHp, tile.defenseTier);
    } else if (tile.ownerId) {
      const prev = tile.studyCountBySchool.get(schoolId) || 0;
      tile.studyCountBySchool.set(schoolId, prev + points);
      tile.retention = Math.max(0, tile.retention - points * 10);
      tile.hp = tile.retention;
      this.landData.setCombat(x, y, tile.hp, tile.maxHp, tile.defenseTier);

      if (tile.retention <= 0) {
        this.transferTileOwnership(tile, schoolId, "bot_study");
      }
    }
  }

  /**
   * Helper cho Bot nạp Than củi vào Công trình.
   */
  public handleBotContributeFuel(schoolId: string, landmarkId: string, amount: number = 20) {
    let lm = this.state.landmarks.get(landmarkId);
    if (!lm) {
      for (const [_, item] of this.state.landmarks) {
        if (item.landmarkKey === landmarkId || item.id === landmarkId) {
          lm = item;
          break;
        }
      }
    }
    if (!lm) return;
    if (!this.hasPathToLandmark(schoolId, lm)) return;

    const cur = (lm.fuelBySchool.get(schoolId) || 0) + amount;
    lm.fuelBySchool.set(schoolId, cur);

    let leadingSchool = "";
    let maxF = 0;
    lm.fuelBySchool.forEach((f, s) => {
      if (f > maxF) {
        maxF = f;
        leadingSchool = s;
      }
    });

    lm.currentFuel = maxF;

    if (maxF >= lm.maxFuel && lm.litBySchoolId !== leadingSchool) {
      const prev = lm.litBySchoolId;
      lm.litBySchoolId = leadingSchool;
      lm.ownerId = leadingSchool;
      lm.buffActive = true;

      this.broadcast("landmark_lit", {
        landmarkId: lm.id,
        schoolId: leadingSchool,
        previousSchoolId: prev,
        fuel: maxF
      });
    }
  }

  /**
   * Fortify path: Backward-compatibility bridge routing to handleStudyAction.
   */
  private handleFortifyAction(client: Client, data: { x: number; y: number }, op: string = "fortify") {
    this.handleStudyAction(client, data, op);
  }


  private registerMessages() {
    // 1. claim_tile (legacy name kept for old clients) + protocol "claim" frame
    this.onMessage("claim_tile", (client, data: ClientClaimMessage) => {
      this.handleClaimAction(client, data || { x: NaN, y: NaN }, "claim_tile");
    });
    this.onMessage("claim", (client, data: ClaimFrame | ClientClaimMessage) => {
      const frame = decodeClientFrame(data) || data;
      this.handleClaimAction(client, { x: (frame as any).x, y: (frame as any).y }, "claim");
    });

    // 1b. studyTile / study_tile / protocol "study"
    this.onMessage("studyTile", (client, data: ClientStudyTileMessage) => {
      this.handleStudyAction(client, data || { x: NaN, y: NaN }, "studyTile");
    });
    this.onMessage("study_tile", (client, data: ClientStudyTileMessage) => {
      this.handleStudyAction(client, data || { x: NaN, y: NaN }, "study_tile");
    });
    this.onMessage("study", (client, data: any) => {
      const frame = decodeClientFrame(data) || data;
      this.handleStudyAction(client, frame, "study");
    });

    // 1c. contributeFuel / contribute_fuel / burnCharcoal / burn_charcoal
    this.onMessage("contributeFuel", (client, data: ClientContributeFuelMessage) => {
      this.handleContributeFuelAction(client, data || { landmarkId: "" });
    });
    this.onMessage("contribute_fuel", (client, data: ClientContributeFuelMessage) => {
      this.handleContributeFuelAction(client, data || { landmarkId: "" });
    });
    this.onMessage("burnCharcoal", (client, data: ClientContributeFuelMessage) => {
      this.handleContributeFuelAction(client, data || { landmarkId: "" });
    });
    this.onMessage("burn_charcoal", (client, data: ClientContributeFuelMessage) => {
      this.handleContributeFuelAction(client, data || { landmarkId: "" });
    });

    // 1d. rollUniStop / roll_unistop
    this.onMessage("rollUniStop", (client, data: ClientRollUniStopMessage) => {
      this.handleRollUniStop(client, data || { stopId: "" });
    });
    this.onMessage("roll_unistop", (client, data: ClientRollUniStopMessage) => {
      this.handleRollUniStop(client, data || { stopId: "" });
    });

    // 1e. openChest / open_chest
    this.onMessage("openChest", (client, data: ClientOpenChestMessage) => {
      this.handleOpenChest(client, data || { chestId: "" });
    });
    this.onMessage("open_chest", (client, data: ClientOpenChestMessage) => {
      this.handleOpenChest(client, data || { chestId: "" });
    });

    // 1f. updateMapLayout / update_map_layout
    this.onMessage("updateMapLayout", (client, data: ClientUpdateMapLayoutMessage) => {
      this.handleUpdateMapLayout(client, data || {});
    });
    this.onMessage("update_map_layout", (client, data: ClientUpdateMapLayoutMessage) => {
      this.handleUpdateMapLayout(client, data || {});
    });

    // 2. fortify_tile (backward-compatibility bridge) + protocol "fortify" frame
    this.onMessage("fortify_tile", (client, data: ClientFortifyMessage) => {
      this.handleFortifyAction(client, data || { x: NaN, y: NaN }, "fortify_tile");
    });
    this.onMessage("fortify", (client, data: FortifyFrame | ClientFortifyMessage) => {
      const frame = decodeClientFrame(data) || data;
      this.handleFortifyAction(client, { x: (frame as any).x, y: (frame as any).y }, "fortify");
    });

    // 2b. protocol frames on the land channel (t: claim | fortify | study | fuel)
    this.onMessage(LAND_FRAME_CHANNEL, (client, data: any) => {
      const frame = decodeClientFrame(data);
      if (!frame) return; // unknown / non-client frame: ignore
      if (frame.t === "claim") {
        this.handleClaimAction(client, frame, "claim");
      } else if (frame.t === "study") {
        this.handleStudyAction(client, frame, "study");
      } else if (frame.t === "fuel") {
        this.handleContributeFuelAction(client, frame);
      } else if (frame.t === "fortify") {
        this.handleFortifyAction(client, frame, "fortify");
      }
    });

    // 3. set_simulation_speed
    this.onMessage("set_simulation_speed", (client, data: ClientSetSpeedMessage) => {
      const speed = data.speed || 1;
      this.setSimulationSpeed(speed);
    });

    // 4. bulk_dispatch (troops only — control plane; no tile writes)
    this.onMessage("bulk_dispatch", (client, data: ClientBulkDispatchMessage) => {
      const amount = data.amount || 500;
      for (const schoolId of SCHOOL_IDS) {
        const cur = this.state.schoolTroops.get(schoolId) || 0;
        this.state.schoolTroops.set(schoolId, cur + amount);
      }
    });

    // 5. soft_reset — full land reload: reset LandState, rebuild tiles, bump epoch + resend snap
    this.onMessage("soft_reset", () => {
      // Clear all claimed tiles
      this.state.claimedTiles.clear();
      this.landData.reset();
      this.botManager.reset();
      this.clusterEngine = new TerritoryClusterEngine(1000, 1000);

      // Restore initial HQ tiles
      for (const [schoolId, tiles] of this.initialHQTiles) {
        for (const t of tiles) {
          const key = `${t.x},${t.y}`;
          const tile = new TileState();
          tile.x = t.x;
          tile.y = t.y;
          tile.ownerId = schoolId;
          tile.defenseTier = t.defenseTier ?? 2;
          tile.hp = t.hp ?? 500;
          tile.maxHp = t.hp ?? 500;
          tile.retention = 100;
          tile.maxRetention = 100;
          tile.lastStudiedAt = Date.now();
          tile.studyCountBySchool.set(schoolId, 10);

          this.state.claimedTiles.set(key, tile);
          this.landData.writeTile(t.x, t.y, schoolId, tile.hp, tile.maxHp, tile.defenseTier);
          this.botManager.addOwnedTile(schoolId, t.x, t.y, this.state);
          this.clusterEngine.setTile(t.x, t.y, this.getSchoolNumericId(schoolId), tile.defenseTier, tile.hp);
        }
        this.state.schoolTroops.set(schoolId, 500);
      }

      // Restore initial Landmark tiles
      for (const [key, t] of this.initialLandmarkTiles) {
        const tile = new TileState();
        tile.x = t.x;
        tile.y = t.y;
        tile.ownerId = "";
        tile.defenseTier = t.defenseTier;
        tile.hp = t.hp;
        tile.maxHp = t.maxHp;
        tile.retention = 100;
        tile.maxRetention = 100;
        tile.lastStudiedAt = Date.now();
        this.state.claimedTiles.set(key, tile);
        this.landData.writeTile(t.x, t.y, "", tile.hp, tile.maxHp, tile.defenseTier);
        this.clusterEngine.setTile(t.x, t.y, 0, tile.defenseTier, tile.hp);
      }

      // Reset landmark owners & bonfires
      this.state.landmarks.forEach((lm) => {
        lm.ownerId = "";
        lm.currentFuel = 0;
        lm.maxFuel = 500;
        lm.litBySchoolId = "";
        lm.buffActive = false;
        lm.fuelBySchool.clear();
      });

      // Reset UniStop cooldowns & Chest status
      this.state.unistops.forEach((stop) => {
        stop.cooldownUntil = 0;
      });
      this.state.chests.forEach((chest) => {
        chest.isOpened = false;
        chest.openedBySchoolId = "";
      });

      // Rebuild dirty is dropped; clients resync from a fresh snap under a new epoch
      this.landData.finishReset();
    });


    // 6. select_school
    this.onMessage("select_school", (client, data: ClientSelectSchoolMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (player.mode === "normal" && player.isLockedSchool) {
        client.send("error", {
          message: `Tài khoản sinh viên (${player.email || "định danh"}) đã được cố định theo trường, không thể chuyển sang trường khác!`
        });
        return;
      }

      if (SCHOOL_ROSTER[data.schoolId]) {
        player.schoolId = data.schoolId;
        console.log(`[CampusRoom] Player ${client.sessionId} switched to school: ${data.schoolId}`);
      }
    });

    // 6b. login_student
    this.onMessage("login_student", (client, data: {
      email: string;
      schoolId: string;
      points: number;
      mode?: string;
      hasWeeklyRunningPoints?: boolean;
      charcoal?: number;
      silverKeys?: number;
      goldKeys?: number;
      platinumKeys?: number;
    }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      player.email = (data.email || "").trim();
      if (SCHOOL_ROSTER[data.schoolId]) {
        player.schoolId = data.schoolId;
      }
      if (typeof data.points === "number" && data.points >= 0) {
        player.personalTroops = data.points;
      }
      if (data.mode) {
        player.mode = data.mode;
        player.isLockedSchool = data.mode === "normal";
      }
      if (data.hasWeeklyRunningPoints !== undefined) {
        player.hasWeeklyRunningPoints = Boolean(data.hasWeeklyRunningPoints);
      }
      if (typeof data.charcoal === "number") player.charcoal = data.charcoal;
      if (typeof data.silverKeys === "number") player.silverKeys = data.silverKeys;
      if (typeof data.goldKeys === "number") player.goldKeys = data.goldKeys;
      if (typeof data.platinumKeys === "number") player.platinumKeys = data.platinumKeys;

      console.log(
        `[CampusRoom] Player ${client.sessionId} logged in as student: ${player.email} [${player.schoolId.toUpperCase()}] - ${player.personalTroops} pts (WeeklyPoints: ${player.hasWeeklyRunningPoints}, Mode: ${player.mode}, Locked: ${player.isLockedSchool})`
      );
    });

    // 7. set_role
    this.onMessage("set_role", (client, data: ClientSetRoleMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player && ["assault", "fortify", "support"].includes(data.role)) {
        player.currentRole = data.role;
      }
    });

    // 8. toggle_bots
    this.onMessage("toggle_bots", (client, data: { enabled: boolean }) => {
      this.botsEnabled = !!data.enabled;
      console.log(`[CampusRoom] Bot simulation enabled: ${this.botsEnabled}`);
    });

    // 9. add_points
    this.onMessage("add_points", (client, data: { amount: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.personalTroops += (data.amount || 100);
        const cur = this.state.schoolTroops.get(player.schoolId) || 0;
        this.state.schoolTroops.set(player.schoolId, cur + (data.amount || 100));
      }
    });

    // 10. dev_spawn_bastion
    this.onMessage("dev_spawn_bastion", (client, data: { schoolId?: string, x?: number, y?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const schoolId = data.schoolId || player.schoolId;
      const hq = this.state.hqs.get(schoolId);
      const startX = data.x !== undefined ? data.x : (hq ? hq.x : 500);
      const startY = data.y !== undefined ? data.y : (hq ? hq.y : 500);

      for (let dx = 0; dx < 10; dx++) {
        for (let dy = 0; dy < 10; dy++) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx < 0 || tx >= 1000 || ty < 0 || ty >= 1000) continue;

          const key = `${tx},${ty}`;
          let tile = this.state.claimedTiles.get(key);
          if (!tile) {
            tile = new TileState();
            tile.x = tx;
            tile.y = ty;
            this.state.claimedTiles.set(key, tile);
          }
          tile.ownerId = schoolId;
          tile.defenseTier = 3;
          tile.hp = 400;
          tile.maxHp = 400;

          this.landData.writeTile(tx, ty, schoolId, tile.hp, tile.maxHp, tile.defenseTier);
          this.botManager.addOwnedTile(schoolId, tx, ty, this.state);
          this.clusterEngine.setTile(tx, ty, this.getSchoolNumericId(schoolId), 3, 100);
        }
      }
      this.handleClusterUpdate(schoolId, startX, startY);
    });

    // 11. dev_spawn_mega_emblem
    this.onMessage("dev_spawn_mega_emblem", (client, data: { schoolId?: string, x?: number, y?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const schoolId = data.schoolId || player.schoolId;
      const hq = this.state.hqs.get(schoolId);
      const startX = data.x !== undefined ? data.x : (hq ? hq.x : 500);
      const startY = data.y !== undefined ? data.y : (hq ? hq.y : 500);

      for (let dx = 0; dx < 100; dx++) {
        for (let dy = 0; dy < 100; dy++) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (tx < 0 || tx >= 1000 || ty < 0 || ty >= 1000) continue;

          const key = `${tx},${ty}`;
          let tile = this.state.claimedTiles.get(key);
          if (!tile) {
            tile = new TileState();
            tile.x = tx;
            tile.y = ty;
            this.state.claimedTiles.set(key, tile);
          }
          tile.ownerId = schoolId;
          tile.defenseTier = 3;
          tile.hp = 400;
          tile.maxHp = 400;

          this.landData.writeTile(tx, ty, schoolId, tile.hp, tile.maxHp, tile.defenseTier);
          this.botManager.addOwnedTile(schoolId, tx, ty, this.state);
          this.clusterEngine.setTile(tx, ty, this.getSchoolNumericId(schoolId), 3, 100);
        }
      }
      this.handleClusterUpdate(schoolId, startX, startY);
    });

    // 12. dev_breach_cluster
    this.onMessage("dev_breach_cluster", (client, data: { schoolId?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const schoolId = data.schoolId || player.schoolId;

      let targetX = -1, targetY = -1;
      let isMega = this.activeMegaEmblems.has(schoolId);
      let isBastion = this.activeBastions.has(schoolId);

      for (const [key, tile] of this.state.claimedTiles) {
         if (tile.ownerId === schoolId) {
            const engineTier = this.clusterEngine.getTileFortifyTier(tile.x, tile.y);
            if (isMega && engineTier >= 6) { targetX = tile.x; targetY = tile.y; break; }
            if (isBastion && engineTier >= 4) { targetX = tile.x; targetY = tile.y; break; }
            if (targetX === -1) { targetX = tile.x; targetY = tile.y; }
         }
      }

      if (targetX !== -1 && targetY !== -1) {
          const toDestroy = isMega ? 25 : (isBastion ? 15 : 5);
          let destroyedCount = 0;
          let queue = [[targetX, targetY]];
          let visited = new Set<string>();
          visited.add(`${targetX},${targetY}`);
          
          const neighborsToUpdate = new Set<string>();

          while (queue.length > 0 && destroyedCount < toDestroy) {
             const [cx, cy] = queue.shift()!;
             const key = `${cx},${cy}`;
             const tile = this.state.claimedTiles.get(key);
             
             if (tile && tile.ownerId === schoolId) {
                tile.ownerId = "";
                tile.defenseTier = 0;
                tile.hp = 0;
                this.landData.setOwner(cx, cy, "");
                this.landData.clearCombat(cx, cy);
                this.botManager.removeOwnedTile(schoolId, cx, cy, this.state);
                this.clusterEngine.setTile(cx, cy, 0, 0, 0);
                destroyedCount++;
                
                const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < 1000 && ny >= 0 && ny < 1000) {
                        const nKey = `${nx},${ny}`;
                        if (!visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push([nx, ny]);
                        }
                        const nTile = this.state.claimedTiles.get(nKey);
                        if (nTile && nTile.ownerId === schoolId) {
                           neighborsToUpdate.add(nKey);
                        }
                    }
                }
             }
          }

          let newMaxSize = 0;
          for (const nk of neighborsToUpdate) {
             const [nx, ny] = nk.split(",").map(Number);
             const res = this.clusterEngine.evaluateCluster(nx, ny);
             if (res && res.clusterSize > newMaxSize) {
                 newMaxSize = res.clusterSize;
             }
             this.handleClusterUpdate(schoolId, nx, ny);
          }
          
          if (isMega && newMaxSize < 10000) {
             this.activeMegaEmblems.delete(schoolId);
             this.broadcast("mega_emblem_broken", { schoolId });
          } else if (isBastion && newMaxSize < 100) {
             this.activeBastions.delete(schoolId);
             this.broadcast("bastion_broken", { schoolId });
          }
          client.send("dev_breach_success", { targetX, targetY, destroyedCount });
      } else {
          client.send("dev_breach_success", { targetX: -1, targetY: -1, destroyedCount: 0 });
      }
    });

    // 13. dev_max_fortify_all
    this.onMessage("dev_max_fortify_all", (client, data: { schoolId?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const schoolId = data.schoolId || player.schoolId;
      
      let lastX = -1;
      let lastY = -1;
      for (const [key, tile] of this.state.claimedTiles) {
          if (tile.ownerId === schoolId) {
              tile.defenseTier = 3;
              tile.hp = 400;
              tile.maxHp = Math.max(tile.maxHp, 400);
              this.landData.setCombat(tile.x, tile.y, tile.hp, tile.maxHp, tile.defenseTier);
              this.clusterEngine.setTile(tile.x, tile.y, this.getSchoolNumericId(schoolId), 3, 100);
              lastX = tile.x;
              lastY = tile.y;
          }
      }
      if (lastX !== -1) {
          this.handleClusterUpdate(schoolId, lastX, lastY);
      }
    });

    // 14. dev_add_keys
    this.onMessage("dev_add_keys", (client, data: { silver?: number; gold?: number; platinum?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        if (data.silver) player.silverKeys = (player.silverKeys || 0) + data.silver;
        if (data.gold) player.goldKeys = (player.goldKeys || 0) + data.gold;
        if (data.platinum) player.platinumKeys = (player.platinumKeys || 0) + data.platinum;
      }
    });

    // 15. dev_reset_unistop_cooldown
    this.onMessage("dev_reset_unistop_cooldown", (client, data: { stopId: string }) => {
      const stop = this.state.unistops.get(data.stopId);
      if (stop) {
        stop.cooldownUntil = 0;
      }
    });

    // 16. dev_set_weekly_points
    this.onMessage("dev_set_weekly_points", (client, data: { hasWeeklyRunningPoints: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.hasWeeklyRunningPoints = Boolean(data.hasWeeklyRunningPoints);
      }
    });
  }

  onJoin(client: Client, options: any) {
    const player = new PlayerState();
    player.id = client.sessionId;

    const email = (options.email || "").trim();
    const mode = options.mode === "dev" ? "dev" : (email ? "normal" : (options.mode || "dev"));
    const emailSchool = email ? getSchoolIdFromEmail(email) : null;
    const requestedSchool = options.schoolId;

    let targetSchool = "hcmut";
    if (emailSchool && SCHOOL_ROSTER[emailSchool]) {
      targetSchool = emailSchool;
    } else if (requestedSchool && SCHOOL_ROSTER[requestedSchool]) {
      targetSchool = requestedSchool;
    }

    player.email = email;
    player.schoolId = targetSchool;
    player.mode = mode;
    player.isLockedSchool = mode === "normal" && !!emailSchool;

    // Running points: 1 km = 1 point
    const initialPoints = typeof options.points === "number" && options.points >= 0
      ? options.points
      : (typeof options.km === "number" && options.km >= 0 ? options.km : 500);

    player.personalTroops = initialPoints;
    player.currentRole = (options.role && ["assault", "fortify", "support"].includes(options.role))
      ? options.role
      : "assault";

    const hasWeeklyPoints = Boolean(
      options.hasWeeklyRunningPoints !== undefined
        ? options.hasWeeklyRunningPoints
        : (typeof options.weeklyPoints === "number" && options.weeklyPoints > 0) ||
          (typeof options.weeklyKm === "number" && options.weeklyKm > 0) ||
          (typeof options.points === "number" && options.points > 0) ||
          (typeof options.km === "number" && options.km > 0)
    );
    player.hasWeeklyRunningPoints = hasWeeklyPoints;

    if (typeof options.charcoal === "number") player.charcoal = options.charcoal;
    if (typeof options.silverKeys === "number") player.silverKeys = options.silverKeys;
    if (typeof options.goldKeys === "number") player.goldKeys = options.goldKeys;
    if (typeof options.platinumKeys === "number") player.platinumKeys = options.platinumKeys;

    this.state.players.set(client.sessionId, player);

    // Sync to school troops if needed
    const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
    if (curTroops < initialPoints) {
      this.state.schoolTroops.set(player.schoolId, initialPoints);
    }

    // Data-plane snap FIRST (before any live batches)
    this.landData.sendSnap((type, payload) => client.send(type, payload));

    client.send("active_clusters_sync", {
      bastions: Array.from(this.activeBastions.values()),
      megaEmblems: Array.from(this.activeMegaEmblems.values())
    });

    console.log(
      `[CampusRoom] Player joined: ${client.sessionId} | School: ${player.schoolId} | Mode: ${player.mode} | Locked: ${player.isLockedSchool} | Points: ${player.personalTroops} | Email: ${player.email || "Guest"}`
    );
  }

  onLeave(client: Client, consented: boolean) {
    this.state.players.delete(client.sessionId);
    console.log(`[CampusRoom] Player left: ${client.sessionId} (consented: ${consented})`);
  }

  onDispose() {
    if (this.gameInterval) {
      this.gameInterval.clear();
    }
    if (this.landFlushInterval) {
      this.landFlushInterval.clear();
    }
    console.log("[CampusRoom] Disposed");
  }
}
