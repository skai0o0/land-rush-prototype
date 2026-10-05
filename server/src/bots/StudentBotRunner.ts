import { PlayerState, TileState } from "../schema/GameState";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { SCHOOL_IDS } from "../../../shared/constants/schools";
import type { CampusRoom } from "../rooms/CampusRoom";

export class MockBotClient {
  public sessionId: string;
  public sentMessages: Array<{ type: string; payload: any }> = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public send(type: string, payload: any): void {
    this.sentMessages.push({ type, payload });
  }

  public clear(): void {
    this.sentMessages = [];
  }

  public get messages(): Array<{ type: string; payload: any }> {
    return this.sentMessages;
  }
}

export interface StudentBotConfig {
  id: string;
  name: string;
  schoolId: string;
  email: string;
}

export const STUDENT_BOT_CONFIGS: StudentBotConfig[] = [
  { id: "bot_hcmut", name: "Khoa_HCMUT", schoolId: "hcmut", email: "khoa@hcmut.edu.vn" },
  { id: "bot_hcmcou", name: "Minh_OU", schoolId: "hcmcou", email: "minh@ou.edu.vn" },
  { id: "bot_dtu", name: "Hoang_DTU", schoolId: "dtu", email: "hoang@dtu.edu.vn" },
  { id: "bot_dhhp", name: "Tung_DHHP", schoolId: "dhhp", email: "tung@dhhp.edu.vn" },
  { id: "bot_hsu", name: "Linh_HSU", schoolId: "hsu", email: "linh@hsu.edu.vn" }
];

export type StudentBotActionType = 'walk' | 'explore' | 'study' | 'unistop' | 'chest' | 'guess' | 'crystal';

export class StudentBot {
  public config: StudentBotConfig;
  public client: MockBotClient;
  public actionStep: number = 0;
  public lastActionTime: number = 0;
  public nextActionDelayMs: number = 2500;
  public lastActionName: string = "Chờ khởi động";
  public lastActionType: StudentBotActionType = "walk";
  public x: number = 500;
  public y: number = 500;
  public actionHistory: Array<{ action: string; timestamp: number }> = [];

  constructor(config: StudentBotConfig, initialX: number = 500, initialY: number = 500) {
    this.config = config;
    this.client = new MockBotClient(config.id);
    this.x = initialX;
    this.y = initialY;
  }

  /**
   * Cập nhật thông tin hành động và broadcast student_bot_action
   */
  public notifyAction(room: CampusRoom, actionType: StudentBotActionType, actionText: string): void {
    this.lastActionType = actionType;
    this.lastActionName = actionText;
    const player = room.state.players.get(this.config.id);
    const payload = {
      botId: this.config.id,
      name: this.config.name,
      schoolId: this.config.schoolId,
      x: this.x,
      y: this.y,
      actionType: this.lastActionType,
      actionText: this.lastActionName,
      points: player ? player.personalTroops : 0,
      crystals: player ? player.crystals : 0
    };
    room.broadcast("student_bot_action", payload);
  }

  /**
   * Hành động 1 - Đi bộ/chạy bộ tích lũy điểm:
   * Cộng điểm tri thức cống hiến cho bot (points += 5..15)
   */
  public actionWalkRun(room: CampusRoom): void {
    const pts = Math.floor(Math.random() * 11) + 5; // 5 to 15 points
    const player = room.state.players.get(this.config.id);
    if (player) {
      player.personalTroops += pts;
    }
    const curSchool = room.state.schoolTroops.get(this.config.schoolId) || 0;
    room.state.schoolTroops.set(this.config.schoolId, curSchool + pts);
    room.checkLeaderboardRankLead();

    // Di chuyển ngẫu nhiên 1-2 ô quanh vị trí hiện tại
    const dx = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const dy = Math.floor(Math.random() * 5) - 2; // -2 to +2
    this.x = Math.max(0, Math.min(999, this.x + dx));
    this.y = Math.max(0, Math.min(999, this.y + dy));

    this.notifyAction(room, "walk", `🏃 Đang chạy bộ (+${pts} pts)`);
  }

  /**
   * Hành động 2 - Khám phá ô tri thức hoang sơ:
   * Tìm ô hoang sơ tiếp giáp lãnh thổ trường mình, gọi claimTile tiêu hao điểm
   */
  public actionExploreWild(room: CampusRoom): void {
    const schoolId = this.config.schoolId;
    const claimed = room.state.claimedTiles;
    let targetCoords: { x: number; y: number } | null = null;

    // Tìm ô hoang sơ tiếp giáp với bất kỳ ô nào thuộc sở hữu của trường
    for (const [_, tile] of claimed) {
      if (tile.ownerId === schoolId) {
        const neighbors = [
          { x: tile.x + 1, y: tile.y },
          { x: tile.x - 1, y: tile.y },
          { x: tile.x, y: tile.y + 1 },
          { x: tile.x, y: tile.y - 1 }
        ];
        for (const n of neighbors) {
          if (n.x < 0 || n.x >= 1000 || n.y < 0 || n.y >= 1000) continue;
          const key = `${n.x},${n.y}`;
          const existing = claimed.get(key);
          if (!existing || existing.ownerId === "") {
            if (!room.landmarkTileMap.has(key)) {
              targetCoords = n;
              break;
            }
          }
        }
        if (targetCoords) break;
      }
    }

    if (targetCoords) {
      const player = room.state.players.get(this.config.id);
      if (player && player.personalTroops < 5) {
        player.personalTroops += 10;
      }
      const schoolTroops = room.state.schoolTroops.get(schoolId) || 0;
      if (schoolTroops < 5) {
        room.state.schoolTroops.set(schoolId, schoolTroops + 10);
      }
      this.x = targetCoords.x;
      this.y = targetCoords.y;
      room.handleClaimAction(this.client as any, targetCoords, "claim");
      this.notifyAction(room, "explore", `🚩 Đang khám phá ô (${targetCoords.x}, ${targetCoords.y})!`);
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Hành động 3 - Ôn bài bảo vệ ô tri thức:
   * Tìm ô có độ bền tri thức thấp hoặc ô của trường để gọi studyTile tăng điểm bảo vệ
   */
  public actionStudyTile(room: CampusRoom): void {
    const schoolId = this.config.schoolId;
    const claimed = room.state.claimedTiles;
    let targetTile: TileState | null = null;

    for (const [_, tile] of claimed) {
      if (tile.ownerId === schoolId) {
        if (!targetTile || tile.retention < targetTile.retention) {
          targetTile = tile;
          if (tile.retention < 80) break;
        }
      }
    }

    if (targetTile) {
      const player = room.state.players.get(this.config.id);
      if (player && player.personalTroops < 5) {
        player.personalTroops += 10;
      }
      const schoolTroops = room.state.schoolTroops.get(schoolId) || 0;
      if (schoolTroops < 5) {
        room.state.schoolTroops.set(schoolId, schoolTroops + 10);
      }
      this.x = targetTile.x;
      this.y = targetTile.y;
      room.handleStudyAction(this.client as any, { x: targetTile.x, y: targetTile.y, points: 2 }, "study");
      this.notifyAction(room, "study", `📚 Đang ôn bài bảo vệ ô (${targetTile.x}, ${targetTile.y})`);
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Hành động 4 - Quay trạm tiếp tế UniStop (Gacha):
   * Ghé trạm UniStop gần nhất, thực hiện lượt gacha nhận điểm, tinh thể, chìa khóa
   */
  public actionRollUniStop(room: CampusRoom): void {
    const unistops = Array.from(room.state.unistops.values());
    if (unistops.length > 0) {
      const stop = unistops[Math.floor(Math.random() * unistops.length)];
      if (stop.cooldownUntil > Date.now()) {
        stop.cooldownUntil = 0; // Đặt lại cooldown cho chu kỳ giả lập
      }
      this.x = stop.x;
      this.y = stop.z;
      room.handleRollUniStop(this.client as any, { stopId: stop.id, x: stop.x, y: stop.z });
      this.notifyAction(room, "unistop", `🎰 Đang quay UniStop (${stop.name})`);
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Hành động 5 - Mở rương kho báu:
   * Dùng chìa khóa mở rương ngẫu nhiên trên bản đồ (nhận tinh thể lớn hoặc quà)
   */
  public actionOpenChest(room: CampusRoom): void {
    let chest = Array.from(room.state.chests.values()).find((c) => !c.isOpened);
    if (!chest) {
      const allChests = Array.from(room.state.chests.values());
      if (allChests.length > 0) {
        chest = allChests[0];
        chest.isOpened = false;
        chest.openedBySchoolId = "";
      }
    }

    if (chest) {
      const player = room.state.players.get(this.config.id);
      if (player) {
        if (chest.tier === "aspire") player.aspireKeys = Math.max(player.aspireKeys, 1);
        else if (chest.tier === "nitro") player.nitroKeys = Math.max(player.nitroKeys, 1);
        else if (chest.tier === "predator") player.predatorKeys = Math.max(player.predatorKeys, 1);
      }
      this.x = chest.x;
      this.y = chest.z;
      room.handleOpenChest(this.client as any, { chestId: chest.id, x: chest.x, y: chest.z });
      this.notifyAction(room, "chest", `💎 Đang mở rương (${chest.tier.toUpperCase()})`);
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Hành động 6 - Giải đố tên công trình:
   * Thử đoán tên công trình gần đó bằng tên địa danh chuẩn hóa để nhận +10 tinh thể
   */
  public actionGuessLandmark(room: CampusRoom): void {
    const schoolId = this.config.schoolId;
    const landmarks = Array.from(room.state.landmarks.values());
    const unguesseds = landmarks.filter((lm) => !lm.guessedSchools.get(schoolId));
    const targetLm = unguesseds.length > 0 ? unguesseds[0] : landmarks[0];

    if (targetLm) {
      const config = LANDMARK_ROSTER[targetLm.landmarkKey || targetLm.id];
      if (config) {
        const player = room.state.players.get(this.config.id);
        if (player) {
          player.guessCooldowns.set(targetLm.id, 0);
        }
        if (targetLm.guessedSchools.get(schoolId)) {
          targetLm.guessedSchools.set(schoolId, false);
        }
        this.x = targetLm.x;
        this.y = targetLm.y;
        room.handleGuessLandmark(this.client as any, {
          landmarkId: targetLm.id,
          guess: config.name
        });
        this.notifyAction(room, "guess", `🏛️ Đang giải đố ${config.name}`);
      }
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Hành động 7 - Nạp Tinh thể vào Đèn hiệu:
   * Nạp tinh thể của bot vào Đèn hiệu công trình để cùng toàn trường thắp sáng đèn hiệu
   */
  public actionContributeCrystal(room: CampusRoom): void {
    const schoolId = this.config.schoolId;
    const landmarks = Array.from(room.state.landmarks.values());
    if (landmarks.length > 0) {
      const lm = landmarks[0];
      // Đảm bảo mở đường tới công trình nếu chưa có
      if (!room.hasPathToLandmark(schoolId, lm)) {
        const px = Math.max(0, lm.x - 1);
        const py = lm.y;
        const key = `${px},${py}`;
        let tile = room.state.claimedTiles.get(key);
        if (!tile) {
          tile = new TileState();
          tile.x = px;
          tile.y = py;
          tile.ownerId = schoolId;
          tile.hp = 100;
          tile.maxHp = 100;
          tile.retention = 100;
          tile.maxRetention = 100;
          tile.lastStudiedAt = Date.now();
          room.state.claimedTiles.set(key, tile);
        } else {
          tile.ownerId = schoolId;
        }
        room.landData.writeTile(px, py, schoolId, tile.hp, tile.maxHp, tile.defenseTier);
      }

      const player = room.state.players.get(this.config.id);
      if (player) {
        player.crystals = Math.max(player.crystals, 10);
      }
      this.x = lm.x;
      this.y = lm.y;
      room.handleContributeCrystalAction(this.client as any, { landmarkId: lm.id, crystals: 5 });
      this.notifyAction(room, "crystal", `⚡ Đang nạp tinh thể (${lm.id})`);
    } else {
      this.actionWalkRun(room);
    }
  }

  /**
   * Thực hiện hành động theo chỉ mục (0..6)
   */
  public stepAction(stepIndex: number, room: CampusRoom): void {
    const actionMod = ((stepIndex % 7) + 7) % 7;
    switch (actionMod) {
      case 0:
        this.actionWalkRun(room);
        break;
      case 1:
        this.actionExploreWild(room);
        break;
      case 2:
        this.actionStudyTile(room);
        break;
      case 3:
        this.actionRollUniStop(room);
        break;
      case 4:
        this.actionOpenChest(room);
        break;
      case 5:
        this.actionGuessLandmark(room);
        break;
      case 6:
        this.actionContributeCrystal(room);
        break;
    }

    const now = Date.now();
    this.lastActionTime = now;
    this.nextActionDelayMs = 2000 + Math.floor(Math.random() * 2001); // 2000ms - 4000ms
    this.actionHistory.push({ action: this.lastActionName, timestamp: now });
    if (this.actionHistory.length > 20) {
      this.actionHistory.shift();
    }
  }
}

export class StudentBotRunner {
  private bots: Map<string, StudentBot> = new Map();
  private room: CampusRoom;
  private isRunning: boolean = false;

  constructor(room: CampusRoom) {
    this.room = room;
    for (const cfg of STUDENT_BOT_CONFIGS) {
      const hq = room.state.hqs.get(cfg.schoolId);
      const initX = hq ? hq.x : 500;
      const initY = hq ? hq.y : 500;
      this.bots.set(cfg.id, new StudentBot(cfg, initX, initY));
    }
  }

  public ensureBotPlayer(bot: StudentBot): void {
    let player = this.room.state.players.get(bot.config.id);
    if (!player) {
      player = new PlayerState();
      player.id = bot.config.id;
      player.email = bot.config.email;
      player.schoolId = bot.config.schoolId;
      player.mode = "normal";
      player.isLockedSchool = true;
      player.points = 150;
      player.crystals = 10;
      player.aspireKeys = 2;
      player.nitroKeys = 1;
      player.predatorKeys = 1;
      player.hasWeeklyRunningPoints = true;
      this.room.state.players.set(bot.config.id, player);
    }
  }

  public start(): void {
    for (const bot of this.bots.values()) {
      this.ensureBotPlayer(bot);
      const hq = this.room.state.hqs.get(bot.config.schoolId);
      if (hq) {
        bot.x = hq.x;
        bot.y = hq.y;
      }
      bot.lastActionTime = Date.now();
      bot.nextActionDelayMs = 1500 + Math.floor(Math.random() * 1500);
    }
    this.isRunning = true;
    console.log("[StudentBotRunner] 5 Student Bots started.");
    
    // Broadcast initial state immediately so client renders 5 characters right away
    this.room.broadcast("student_bots_status", this.getStatus());

    // Trigger initial actions
    this.stepAll();
    this.stepAll();
  }

  public stop(): void {
    this.isRunning = false;
    console.log("[StudentBotRunner] 5 Student Bots stopped.");
  }

  public getStatus(): {
    enabled: boolean;
    bots: Array<{
      id: string;
      name: string;
      schoolId: string;
      x: number;
      y: number;
      actionType: StudentBotActionType;
      actionText: string;
      points: number;
      crystals: number;
      lastAction: string;
    }>;
  } {
    const list = Array.from(this.bots.values()).map((bot) => {
      const player = this.room.state.players.get(bot.config.id);
      return {
        id: bot.config.id,
        name: bot.config.name,
        schoolId: bot.config.schoolId,
        x: bot.x,
        y: bot.y,
        actionType: bot.lastActionType,
        actionText: bot.lastActionName,
        points: player?.personalTroops || 0,
        crystals: player?.crystals || 0,
        lastAction: bot.lastActionName
      };
    });

    return {
      enabled: this.isRunning,
      bots: list
    };
  }

  public tick(): void {
    if (!this.isRunning) return;
    const now = Date.now();

    for (const bot of this.bots.values()) {
      this.ensureBotPlayer(bot);
      if (now - bot.lastActionTime >= bot.nextActionDelayMs) {
        bot.stepAction(bot.actionStep++, this.room);
      }
    }
  }

  /**
   * Thực thi ngay 1 bước hành động cho toàn bộ 5 bot (phục vụ test và dev)
   */
  public stepAll(): void {
    for (const bot of this.bots.values()) {
      this.ensureBotPlayer(bot);
      bot.stepAction(bot.actionStep++, this.room);
    }
  }

  /**
   * Thực thi hành động cụ thể cho bot
   */
  public executeBotStep(botId: string, actionStep?: number): void {
    const bot = this.bots.get(botId);
    if (!bot) return;
    this.ensureBotPlayer(bot);
    const step = actionStep !== undefined ? actionStep : bot.actionStep++;
    bot.stepAction(step, this.room);
  }

  public getBot(botId: string): StudentBot | undefined {
    return this.bots.get(botId);
  }
}
