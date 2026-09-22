import { Room, Client, Delayed } from "colyseus";
import { GameState, TileState, PlayerState, HQState, LandmarkState } from "../schema/GameState";
import { BotManager } from "../bots/BotManager";
import { SCHOOL_IDS, SCHOOL_ROSTER, getSchoolIdFromEmail } from "../../../shared/constants/schools";
import { LANDMARK_IDS, LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import {
  ClientClaimMessage,
  ClientFortifyMessage,
  ClientSetSpeedMessage,
  ClientBulkDispatchMessage,
  ClientSelectSchoolMessage,
  ClientSetRoleMessage,
  PlayerRole
} from "../../../shared/types";

export class CampusRoom extends Room<GameState> {
  private gameInterval?: Delayed;
  private botManager = new BotManager();
  private initialHQTiles: Map<string, { x: number; y: number; defenseTier: number; hp: number }[]> = new Map();
  private landmarkTileMap: Map<string, { landmarkKey: string; isCore: boolean }> = new Map();
  private initialLandmarkTiles: Map<string, { x: number; y: number; hp: number; maxHp: number; defenseTier: number }> = new Map();
  private botsEnabled = false;

  onCreate(options: any) {
    this.autoDispose = false;
    this.setState(new GameState());

    // 1. Spawn 10 School HQs (distance > 180 tiles)
    this.spawnHQs();

    // 2. Spawn 10 Landmarks (distance from HQs > 75 tiles, from each other > 65 tiles)
    this.spawnLandmarks();

    // 3. Initialize initial troops (500 per school)
    for (const schoolId of SCHOOL_IDS) {
      this.state.schoolTroops.set(schoolId, 500);
    }

    // 4. Register Message Handlers
    this.registerMessages();

    // 5. Start Game Loop at default 1x
    this.setSimulationSpeed(1);
  }

  private spawnHQs() {
    const placed: { x: number; y: number }[] = [];
    const minDistance = 180;
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

          this.state.claimedTiles.set(key, tile);
          this.botManager.addOwnedTile(schoolId, tx, ty, this.state);
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

            this.state.claimedTiles.set(key, tile);
            this.landmarkTileMap.set(key, { landmarkKey: lmKey, isCore });
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

  public checkLandmarkCapture(lmKey: string) {
    const lm = this.state.landmarks.get(lmKey);
    const config = LANDMARK_ROSTER[lmKey];
    if (!lm || !config) return;

    const fw = config.footprint.width;
    const fh = config.footprint.height;
    const totalTiles = fw * fh;
    const coreX = lm.x + Math.floor(fw / 2);
    const coreY = lm.y + Math.floor(fh / 2);

    const coreTile = this.state.claimedTiles.get(`${coreX},${coreY}`);
    const coreOwner = coreTile?.ownerId || "";

    let newOwner = "";
    if (coreOwner) {
      let ownedCount = 0;
      for (let dx = 0; dx < fw; dx++) {
        for (let dy = 0; dy < fh; dy++) {
          const t = this.state.claimedTiles.get(`${lm.x + dx},${lm.y + dy}`);
          if (t && t.ownerId === coreOwner) {
            ownedCount++;
          }
        }
      }

      // To capture Landmark: School must control Core node AND >= 35% of total tiles
      if (ownedCount / totalTiles >= 0.35) {
        newOwner = coreOwner;
      }
    }

    if (lm.ownerId !== newOwner) {
      lm.ownerId = newOwner;
      console.log(`[CampusRoom] Landmark ${config.name} (${lmKey}) ownership updated: "${newOwner || 'NEUTRAL'}"`);
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

      // Process Landmark effects & self-repair for all 10 landmarks
      const troopBonusMap: Record<string, number> = {
        landmark_cho_dem: 12,
        landmark_nha_dieu_hanh: 8,
        landmark_cong_chinh: 7,
        landmark_ktx_khu_b: 8,
        landmark_ktx_khu_a: 6,
        landmark_nvhsv: 6,
        landmark_doc_tinh: 6,
        landmark_duong_danh_nhan: 6,
        landmark_tram_xe_buyt: 6,
        landmark_ho_da: 5
      };

      for (const lmKey of LANDMARK_IDS) {
        this.checkLandmarkCapture(lmKey);
        const lm = this.state.landmarks.get(lmKey);
        const config = LANDMARK_ROSTER[lmKey];
        if (lm && config && lm.ownerId) {
          // 1. Troop generation buff based on landmark
          const bonus = troopBonusMap[lmKey] || 5;
          const cur = this.state.schoolTroops.get(lm.ownerId) || 0;
          this.state.schoolTroops.set(lm.ownerId, cur + bonus);

          // 2. Self-repair landmark tiles (+5 HP/sec up to maxHp)
          const fw = config.footprint.width;
          const fh = config.footprint.height;
          for (let dx = 0; dx < fw; dx++) {
            for (let dy = 0; dy < fh; dy++) {
              const t = this.state.claimedTiles.get(`${lm.x + dx},${lm.y + dy}`);
              if (t && t.ownerId === lm.ownerId && t.hp < t.maxHp) {
                t.hp = Math.min(t.maxHp, t.hp + 5);
              }
            }
          }
        }
      }
    }

    // Run Bot autonomous simulation (only if enabled)
    if (this.botsEnabled) {
      this.botManager.processBots(this.state, this);
    }
  }

  private registerMessages() {
    // 1. claim_tile
    this.onMessage("claim_tile", (client, data: ClientClaimMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const { x, y } = data;
      if (x < 0 || x >= 1000 || y < 0 || y >= 1000) return;

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
        client.send("error", { message: "Ô không tiếp giáp với lãnh thổ của bạn!" });
        return;
      }

      const schoolTroops = this.state.schoolTroops.get(player.schoolId) || 0;

      const lmInfo = this.landmarkTileMap.get(key);
      const lmConfig = lmInfo ? LANDMARK_ROSTER[lmInfo.landmarkKey] : null;

      if (lmConfig && existing) {
        // Landmark tile handling
        if (existing.ownerId === player.schoolId) {
          client.send("error", { message: "Ô công trình này đã thuộc quyền kiểm soát của trường bạn!" });
          return;
        }

        const isEnemyControlled = existing.ownerId !== "" && existing.ownerId !== player.schoolId;
        const requiredCost = isEnemyControlled ? lmConfig.attackCost : lmConfig.claimCost;

        if (player.email && player.personalTroops < requiredCost) {
          client.send("error", {
            message: `Không đủ điểm chạy! Cần ${requiredCost} điểm giải chạy để ${isEnemyControlled ? "tấn công" : "đánh chiếm"} ô công trình.`
          });
          return;
        }

        if (schoolTroops < requiredCost) {
          client.send("error", {
            message: `Không đủ quân lực! Cần ${requiredCost} quân để ${isEnemyControlled ? "tấn công" : "đánh chiếm"} ô công trình biểu tượng.`
          });
          return;
        }

        // Deduct troops
        if (player.email) {
          player.personalTroops -= requiredCost;
        }
        this.state.schoolTroops.set(player.schoolId, schoolTroops - requiredCost);

        // Role damage bonus: assault deals +35% damage
        const baseDamage = player.currentRole === "assault" ? Math.floor(40 * 1.35) : 40;
        // Defense Tier absorbs damage (8 per tier)
        const absorbed = existing.defenseTier * 8;
        const damage = Math.max(12, baseDamage - absorbed);

        existing.hp -= damage;

        if (existing.hp <= 0) {
          const oldOwner = existing.ownerId;
          if (oldOwner) {
            this.botManager.removeOwnedTile(oldOwner, x, y, this.state);
          }
          existing.ownerId = player.schoolId;
          // Capture HP is 40% of maxHp
          existing.hp = Math.floor(existing.maxHp * 0.4);
          this.botManager.addOwnedTile(player.schoolId, x, y, this.state);

          // Check if landmark whole structure capture status changed immediately
          this.checkLandmarkCapture(lmInfo.landmarkKey);
        }
      } else if (!existing) {
        // Wild tile: costs 1 point
        if (player.email && player.personalTroops < 1) {
          client.send("error", { message: "Không đủ điểm cống hiến! Cần 1 điểm để mở rộng ô đất." });
          return;
        }

        if (schoolTroops < 1) {
          client.send("error", { message: "Không đủ quân lực!" });
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
        newTile.hp = 100;
        newTile.maxHp = 100;
        newTile.defenseTier = 0;

        this.state.claimedTiles.set(key, newTile);
        this.botManager.addOwnedTile(player.schoolId, x, y, this.state);
      } else if (existing.ownerId !== player.schoolId) {
        // Enemy tile: costs 2 points
        if (player.email && player.personalTroops < 2) {
          client.send("error", { message: "Không đủ điểm cống hiến! Cần 2 điểm để tấn công." });
          return;
        }

        if (schoolTroops < 2) {
          client.send("error", { message: "Không đủ quân lực để tấn công!" });
          return;
        }

        if (player.email) {
          player.personalTroops -= 2;
        }
        this.state.schoolTroops.set(player.schoolId, schoolTroops - 2);
        // Assault role damage bonus (+35%)
        const baseDamage = player.currentRole === "assault" ? Math.floor(40 * 1.35) : 40;
        const absorbed = existing.defenseTier * 8;
        const damage = Math.max(12, baseDamage - absorbed);
        existing.hp -= damage;

        if (existing.hp <= 0) {
          const oldOwner = existing.ownerId;
          if (oldOwner) {
            this.botManager.removeOwnedTile(oldOwner, x, y, this.state);
          }
          existing.ownerId = player.schoolId;
          existing.hp = 60;
          this.botManager.addOwnedTile(player.schoolId, x, y, this.state);
        }
      }
    });

    // 2. fortify_tile
    this.onMessage("fortify_tile", (client, data: ClientFortifyMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const { x, y } = data;
      const key = `${x},${y}`;
      const tile = this.state.claimedTiles.get(key);

      if (!tile || tile.ownerId !== player.schoolId) {
        client.send("error", { message: "Chỉ có thể gia cố ô đất của trường bạn!" });
        return;
      }

      if (tile.defenseTier >= 3) {
        client.send("error", { message: "Ô đất đã đạt cấp phòng thủ tối đa!" });
        return;
      }

      const cost = 1;
      const troops = this.state.schoolTroops.get(player.schoolId) || 0;

      if (player.email && player.personalTroops < cost) {
        client.send("error", { message: `Không đủ điểm cống hiến! Cần ${cost} điểm để gia cố.` });
        return;
      }

      if (troops < cost) {
        client.send("error", { message: "Không đủ quân lực để gia cố!" });
        return;
      }

      if (player.email) {
        player.personalTroops -= cost;
      }
      this.state.schoolTroops.set(player.schoolId, troops - cost);
      tile.defenseTier += 1;
      tile.maxHp += 100;
      tile.hp = tile.maxHp;
    });

    // 3. set_simulation_speed
    this.onMessage("set_simulation_speed", (client, data: ClientSetSpeedMessage) => {
      const speed = data.speed || 1;
      this.setSimulationSpeed(speed);
    });

    // 4. bulk_dispatch
    this.onMessage("bulk_dispatch", (client, data: ClientBulkDispatchMessage) => {
      const amount = data.amount || 500;
      for (const schoolId of SCHOOL_IDS) {
        const cur = this.state.schoolTroops.get(schoolId) || 0;
        this.state.schoolTroops.set(schoolId, cur + amount);
      }
    });

    // 5. soft_reset
    this.onMessage("soft_reset", () => {
      // Clear all claimed tiles
      this.state.claimedTiles.clear();
      this.botManager.reset();

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

          this.state.claimedTiles.set(key, tile);
          this.botManager.addOwnedTile(schoolId, t.x, t.y, this.state);
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
        this.state.claimedTiles.set(key, tile);
      }

      // Reset landmark owners
      this.state.landmarks.forEach((lm) => {
        lm.ownerId = "";
      });
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
    this.onMessage("login_student", (client, data: { email: string; schoolId: string; points: number; mode?: string }) => {
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

      console.log(
        `[CampusRoom] Player ${client.sessionId} logged in as student: ${player.email} [${player.schoolId.toUpperCase()}] - ${player.personalTroops} pts (Mode: ${player.mode}, Locked: ${player.isLockedSchool})`
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

    this.state.players.set(client.sessionId, player);

    // Sync to school troops if needed
    const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
    if (curTroops < initialPoints) {
      this.state.schoolTroops.set(player.schoolId, initialPoints);
    }

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
    console.log("[CampusRoom] Disposed");
  }
}
