import { Room, Client, Delayed } from "colyseus";
import { GameState, TileState, PlayerState, HQState, LandmarkState } from "../schema/GameState";
import { BotManager } from "../bots/BotManager";
import { SCHOOL_IDS, SCHOOL_ROSTER } from "../../../shared/constants/schools";
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
  private initialHQTiles: Map<string, { x: number; y: number }[]> = new Map();

  onCreate(options: any) {
    this.setState(new GameState());

    // 1. Spawn 10 School HQs (distance > 180 tiles)
    this.spawnHQs();

    // 2. Spawn 10 Landmarks (distance from HQs > 70 tiles, from each other > 60 tiles)
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

      // Claim initial HQ territory (3x3 footprint centered at x, y)
      const schoolHQTiles: { x: number; y: number }[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const tx = x + dx;
          const ty = y + dy;
          const key = `${tx},${ty}`;

          const tile = new TileState();
          tile.x = tx;
          tile.y = ty;
          tile.ownerId = schoolId;
          tile.defenseTier = 3;
          tile.hp = 500;
          tile.maxHp = 500;

          this.state.claimedTiles.set(key, tile);
          this.botManager.addOwnedTile(schoolId, tx, ty, this.state);
          schoolHQTiles.push({ x: tx, y: ty });
        }
      }
      this.initialHQTiles.set(schoolId, schoolHQTiles);
    }
  }

  private spawnLandmarks() {
    const placed: { x: number; y: number }[] = [];
    const minHqDistance = 70;
    const minLmDistance = 60;
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
    }

    this.botManager.initLandmarks(lmMapForBot);
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
    // If tick interval is ms, ticks per second = 1000 / ms.
    const intervalMap: Record<number, number> = { 1: 1000, 2: 500, 5: 200, 10: 100, 50: 20 };
    const ms = intervalMap[this.state.simulationSpeed] || 1000;
    const ticksPerSec = 1000 / ms;

    // Add base troop every ~1 sec or scaled proportionally
    if (this.state.currentTick % Math.max(1, Math.floor(ticksPerSec)) === 0) {
      for (const schoolId of SCHOOL_IDS) {
        const cur = this.state.schoolTroops.get(schoolId) || 0;
        this.state.schoolTroops.set(schoolId, cur + 1);
      }
    }

    // Process Landmark effects (e.g. Chợ Đêm bonus +10 troops/sec to owner)
    const choDem = this.state.landmarks.get("landmark_cho_dem");
    if (choDem) {
      const centerTile = this.state.claimedTiles.get(`${choDem.x},${choDem.y}`);
      if (centerTile && centerTile.ownerId) {
        choDem.ownerId = centerTile.ownerId;
        if (this.state.currentTick % Math.max(1, Math.floor(ticksPerSec)) === 0) {
          const cur = this.state.schoolTroops.get(centerTile.ownerId) || 0;
          this.state.schoolTroops.set(centerTile.ownerId, cur + 10);
        }
      }
    }

    // Run Bot autonomous simulation
    this.botManager.processBots(this.state, this);
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

      if (!existing) {
        // Wild tile: costs 5 troops
        if (schoolTroops < 5) {
          client.send("error", { message: "Không đủ quân lực!" });
          return;
        }

        this.state.schoolTroops.set(player.schoolId, schoolTroops - 5);
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
        // Enemy tile: costs 15 troops
        if (schoolTroops < 15) {
          client.send("error", { message: "Không đủ quân lực để tấn công!" });
          return;
        }

        this.state.schoolTroops.set(player.schoolId, schoolTroops - 15);
        // Assault role damage bonus (+35%)
        const damage = player.currentRole === "assault" ? Math.floor(40 * 1.35) : 40;
        existing.hp -= damage;

        if (existing.hp <= 0) {
          const oldOwner = existing.ownerId;
          this.botManager.removeOwnedTile(oldOwner, x, y, this.state);
          existing.ownerId = player.schoolId;
          existing.hp = 60;
          existing.maxHp = 100;
          existing.defenseTier = 0;
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

      const cost = player.currentRole === "fortify" ? 8 : 10;
      const troops = this.state.schoolTroops.get(player.schoolId) || 0;
      if (troops < cost) {
        client.send("error", { message: "Không đủ quân lực để gia cố!" });
        return;
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
          tile.defenseTier = 3;
          tile.hp = 500;
          tile.maxHp = 500;

          this.state.claimedTiles.set(key, tile);
          this.botManager.addOwnedTile(schoolId, t.x, t.y, this.state);
        }
        this.state.schoolTroops.set(schoolId, 500);
      }
    });

    // 6. select_school
    this.onMessage("select_school", (client, data: ClientSelectSchoolMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player && SCHOOL_ROSTER[data.schoolId]) {
        player.schoolId = data.schoolId;
      }
    });

    // 7. set_role
    this.onMessage("set_role", (client, data: ClientSetRoleMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player && ["assault", "fortify", "support"].includes(data.role)) {
        player.currentRole = data.role;
      }
    });
  }

  onJoin(client: Client, options: any) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.schoolId = options.schoolId || "hcmut";
    player.personalTroops = 100;
    player.currentRole = "assault";

    this.state.players.set(client.sessionId, player);
    console.log(`[CampusRoom] Player joined: ${client.sessionId} as ${player.schoolId}`);
  }

  onLeave(client: Client, consented: boolean) {
    this.state.players.delete(client.sessionId);
    console.log(`[CampusRoom] Player left: ${client.sessionId}`);
  }

  onDispose() {
    if (this.gameInterval) {
      this.gameInterval.clear();
    }
    console.log("[CampusRoom] Disposed");
  }
}
