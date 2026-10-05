import { planMapLayout, footprint, Placement } from "../gameplay/mapLayout";
import { BEACON_CRYSTALS, beaconOvertakeTarget, landmarkGuessReward } from "../../../shared/constants/gameplay";
import { initializeKnowledge, pruneKnowledge, studyKnowledge, projectKnowledge, EXCHANGE_COST } from "../gameplay/knowledge";
import { BuffDirector } from "../gameplay/BuffDirector";
import { GameplayEventType } from "../../../shared/types/gameplay";
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
  ClientContributeCrystalMessage,
  ClientContributeFuelMessage,
  ClientGuessLandmarkMessage,
  ClientSetSpeedMessage,
  ClientBulkDispatchMessage,
  ClientSelectSchoolMessage,
  ClientSetRoleMessage,
  ClientRollUniStopMessage,
  ClientOpenChestMessage,
  ClientUpdateMapLayoutMessage,
  PlayerRole,
  ProfileSyncMessage
} from "../../../shared/types";
import { TerritoryClusterEngine } from "../../../shared/engine/territoryClusterEngine";
import { LandDataPlane, LAND_FRAME_CHANNEL, DEFAULT_FLUSH_MS } from "../land/landDataPlane";
import { decodeClientFrame, ClaimFrame, FortifyFrame, StudyFrame, CrystalFrame, FuelFrame } from "../../../shared/land/protocol";
import {
  maskEmail,
  checkAdminKey,
  isSafeInteger,
  isSafeCoordinate,
  isValidSchoolId
} from "../security/sanitizer";
import { RateLimiter } from "../security/rateLimiter";
import { ProfileManager } from "../profile/ProfileManager";
import { RunningPointsProvider } from "../profile/RunningPointsProvider";

/**
 * Chuẩn hóa chuỗi tiếng Việt cho câu đoán và đáp án Landmark:
 * - Chuyển chữ thường .toLowerCase()
 * - Cắt khoảng trắng đầu/cuối .trim()
 * - Gộp khoảng trắng thừa .replace(/\s+/g, ' ')
 * - Bỏ dấu tiếng Việt (bao gồm cả đ/Đ -> d)
 */
export function normalizeAnswer(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
}

export class CampusRoom extends Room<GameState> {
  private stationArrivalSequence = 0;
  private knowledgeCountIndex = new Map<string, number>();
  private updateKnowledgeCounts(tile: TileState) {
    const key = `${tile.x},${tile.y}`;
    const previous = this.knowledgeCountIndex.get(key) || 0;
    let next = 0;
    if (!this.landmarkTileMap.has(key)) {
      for (let i = 0; i < SCHOOL_IDS.length; i++) {
        const entry = tile.knowledge.get(SCHOOL_IDS[i]);
        if (entry && !entry.persistent) next |= 1 << i;
      }
    }
    if (next === previous) return;
    for (let i = 0; i < SCHOOL_IDS.length; i++) {
      const bit = 1 << i;
      const delta = Number(Boolean(next & bit)) - Number(Boolean(previous & bit));
      if (delta) {
        const id = SCHOOL_IDS[i];
        this.state.schoolKnowledgeTiles.set(id, Math.max(0, (this.state.schoolKnowledgeTiles.get(id) || 0) + delta));
      }
    }
    if (next) this.knowledgeCountIndex.set(key, next); else this.knowledgeCountIndex.delete(key);
    this.checkLeaderboardRankLead();
  }
  private rebuildKnowledgeCounts() {
    this.knowledgeCountIndex.clear();
    for (const school of SCHOOL_IDS) this.state.schoolKnowledgeTiles.set(school, 0);
    for (const tile of this.state.claimedTiles.values()) {
      if (this.landmarkTileMap.has(`${tile.x},${tile.y}`)) continue;
      initializeKnowledge(tile, Date.now());
      this.updateKnowledgeCounts(tile);
    }
  }
  private devLog(...args: unknown[]) {
    if (process.env.ALLOW_DEV === "true") console.log(...args);
  }
  private buffDirector = new BuffDirector();
  private decayCursor?: Iterator<[string, TileState]>;
  private eventSequence = 0;
  private emitGameplay(type: GameplayEventType, payload: Record<string, unknown>) {
    this.broadcast("gameplay_event", { version: 1, sequence: ++this.eventSequence, type, at: Date.now(), payload });
  }
  private publishLandmarkMessage(message: "landmark_guessed", payload: Record<string, unknown>) {
    this.emitGameplay("landmark.guessed", payload);
    this.broadcast(message, payload);
  }
  private emitBeacon(data: { landmarkId: string; schoolId: string; [key: string]: unknown }) {
    const lm = this.state.landmarks.get(data.landmarkId);
    const config = lm && LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    this.buffDirector.bonus(data.landmarkId, data.schoolId, new Map(this.state.schoolKnowledgeTiles), config?.troopBonus || 6);
    this.emitGameplay("landmark.activated", data);
    this.broadcast("beacon_lit", data);
  }
  private decayTiming(): [number, number] {
    const dev = this.roomOptions?.mode === "dev" || this.roomOptions?.isDev === true;
    return dev ? [30000, 10000] : [12 * 3600 * 1000, 3600 * 1000];
  }
  public tileHasKnowledge(tile: TileState | undefined, school: string): boolean {
    if (!tile || this.landmarkTileMap.has(`${tile.x},${tile.y}`)) return false;
    const now = Date.now();
    initializeKnowledge(tile, now);
    // HQ foundations are persistent; other participants still decay independently.
    const before = Array.from(tile.knowledge.keys()) as string[];
    if (pruneKnowledge(tile, now, ...this.decayTiming())) {
      this.publishKnowledge(tile);
    }
    this.updateKnowledgeCounts(tile);
    return tile.knowledge.has(school);
  }
  private publishKnowledge(tile: TileState) {
    this.updateKnowledgeCounts(tile);
    this.landData.writeTile(tile.x, tile.y, tile.ownerId, tile.retention, tile.maxHp, tile.defenseTier);
    this.clusterEngine.setTile(tile.x, tile.y, this.getSchoolNumericId(tile.ownerId), tile.defenseTier, tile.retention);
    const schools = Array.from(tile.knowledge.keys()).sort();
    this.broadcast("knowledge_update", { x: tile.x, y: tile.y, schools });
    this.emitGameplay("knowledge.changed", { x: tile.x, y: tile.y, schools });
  }
  private territoryTouches(school: string, x: number, y: number, width: number, height: number): boolean {
    const minX = Math.floor(x) - Math.floor(width / 2), minY = Math.floor(y) - Math.floor(height / 2);
    for (let tx = minX - 1; tx <= minX + width; tx++) {
      for (let ty = minY - 1; ty <= minY + height; ty++) {
        if ((tx < minX || tx >= minX + width) && (ty < minY || ty >= minY + height)) continue;
        if (this.tileHasKnowledge(this.state.claimedTiles.get(`${tx},${ty}`), school)) return true;
      }
    }
    return false;
  }
  private captureReachedStops(_school?: string) {
    for (const stop of this.state.unistops.values()) {
      const present = new Set<string>();
      const minX = Math.floor(stop.x) - 5, minY = Math.floor(stop.z) - 2;
      for (let x = minX; x < minX + 10; x++) {
        for (let y = minY; y < minY + 5; y++) {
          const tile = this.state.claimedTiles.get(`${x},${y}`);
          if (!tile) continue;
          for (const school of SCHOOL_IDS) if (this.tileHasKnowledge(tile, school)) present.add(school);
        }
      }
      for (const school of SCHOOL_IDS) {
        if (present.has(school)) {
          if (!stop.arrivalOrderBySchool.has(school)) stop.arrivalOrderBySchool.set(school, ++this.stationArrivalSequence);
        } else stop.arrivalOrderBySchool.delete(school);
      }
      if (stop.ownerSchoolId && present.has(stop.ownerSchoolId)) continue;
      const previousSchoolId = stop.ownerSchoolId;
      const next = Array.from(present).sort((a, b) =>
        (stop.arrivalOrderBySchool.get(a)! - stop.arrivalOrderBySchool.get(b)!) || a.localeCompare(b))[0] || "";
      if (next !== previousSchoolId) {
        stop.ownerSchoolId = next;
        this.emitGameplay("station.owner_changed", { stopId: stop.id, schoolId: next, previousSchoolId });
      }
    }
  }
  private gameInterval?: Delayed;
  private landFlushInterval?: Delayed;
  private initialHQTiles: Map<string, { x: number; y: number; defenseTier: number; hp: number }[]> = new Map();
  public landmarkTileMap: Map<string, { landmarkKey: string; isCore: boolean }> = new Map();
  private initialLandmarkTiles: Map<string, { x: number; y: number; hp: number; maxHp: number; defenseTier: number }> = new Map();
  private currentLeaderSchoolId: string = "";
  public clusterEngine = new TerritoryClusterEngine(1000, 1000);
  public activeBastions: Map<string, any> = new Map();
  public activeMegaEmblems: Map<string, any> = new Map();
  /** Data-plane authority for ownership/combat (snap / own_batch / combat frames). */
  public landData = new LandDataPlane((type, payload) => this.broadcast(type, payload));
  public rateLimiter = new RateLimiter();
  public playerEmails = new Map<string, string>();
  public clientAdminKeys = new Map<string, string>();
  public profileManager: ProfileManager = ProfileManager.getInstance();
  public runningPointsProvider = RunningPointsProvider.getInstance();
  private activeStudentSessions = new Map<string, { client: Client; sessionId: string }>();
  public get activeSessions() { return this.activeStudentSessions; }
  private profileSyncTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Đồng bộ Profile của sinh viên qua message riêng "profile_sync".
   * Throttled tối đa 4 lần/giây (khoảng 250ms) per client khi thay đổi liên tục.
   */
  public syncProfile(client: Client, studentId: string, immediate: boolean = false): void {
    const doSend = () => {
      const cleanId = (studentId || "").toLowerCase().trim();
      const profile = this.profileManager.getProfile(cleanId);
      if (!profile || !client) return;
      const availablePoints = this.profileManager.getAvailablePoints(cleanId);
      const totalPoints = this.runningPointsProvider.getTotalPoints(cleanId);
      const syncMsg: ProfileSyncMessage = {
        studentId: profile.studentId,
        points: availablePoints,
        totalPoints,
        pointsSpent: profile.pointsSpent,
        gamePointsEarned: profile.gamePointsEarned || 0,
        crystals: profile.crystals,
        aspireKeys: profile.aspireKeys,
        nitroKeys: profile.nitroKeys,
        predatorKeys: profile.predatorKeys,
        guessCooldowns: Object.fromEntries(profile.guessCooldowns),
        unistopCooldowns: Object.fromEntries(profile.unistopCooldowns),
        gifts: profile.gifts
      };
      try {
        if (typeof client.send === "function") {
          client.send("profile_sync", syncMsg);
        }
      } catch (_) {}
      // Đồng thời update PlayerState cục bộ server (không sync qua mạng) nếu cần tương thích
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.points = availablePoints;
        player.crystals = profile.crystals;
        player.aspireKeys = profile.aspireKeys;
        player.nitroKeys = profile.nitroKeys;
        player.predatorKeys = profile.predatorKeys;
      }
    };

    if (immediate) {
      if (this.profileSyncTimers.has(client.sessionId)) {
        clearTimeout(this.profileSyncTimers.get(client.sessionId)!);
        this.profileSyncTimers.delete(client.sessionId);
      }
      doSend();
      return;
    }
    if (this.profileSyncTimers.has(client.sessionId)) return;
    const timer = setTimeout(() => {
      this.profileSyncTimers.delete(client.sessionId);
      doSend();
    }, 250);
    this.profileSyncTimers.set(client.sessionId, timer);
  }

  public getSchoolNumericId(schoolId: string): number {
    return SCHOOL_IDS.indexOf(schoolId) + 1;
  }

  /**
   * Broadcast in-game notifications to all clients or a specific client.
   */
  public broadcastNotification(
    templateId: string,
    vars: Record<string, string | number>,
    category?: string,
    client?: Client
  ): void {
    const payload = { templateId, vars, category };
    if (client && typeof client.send === "function") {
      client.send("game_notification", payload);
    } else if (typeof this.broadcast === "function") {
      this.broadcast("game_notification", payload);
    }
  }

  /**
   * Campaign ranking counts active explored knowledge; shared tiles count for each school.
   */
  public checkLeaderboardRankLead(): void {
    const sorted = SCHOOL_IDS.map((id) => ({
      schoolId: id,
      points: this.state.schoolKnowledgeTiles.get(id) || 0
    })).sort((a, b) => b.points - a.points);

    const newLeader = sorted[0];
    const secondPlace = sorted[1];
    if (newLeader && newLeader.schoolId !== this.currentLeaderSchoolId && newLeader.points > (secondPlace?.points || 0)) {
      const delta = newLeader.points - (secondPlace ? secondPlace.points : 0);
      const prevLeader = this.currentLeaderSchoolId;
      this.currentLeaderSchoolId = newLeader.schoolId;
      if (prevLeader !== "") {
        this.broadcastNotification(
          "rank_lead",
          {
            my_school: newLeader.schoolId,
            delta_points: delta
          },
          "ranking"
        );
      }
    }
  }

  /** Write-through for cluster presentation paths: LandState owner + combat. */
  public syncLandTile(
    x: number,
    y: number,
    ownerId: string,
    hp: number,
    maxHp: number,
    defenseTier: number
  ): void {
    this.landData.writeTile(x, y, ownerId, hp, maxHp, defenseTier);
    const tile = this.state.claimedTiles.get(`${x},${y}`);
    if (tile && !this.landmarkTileMap.has(`${x},${y}`)) {
      initializeKnowledge(tile, Date.now());
      this.updateKnowledgeCounts(tile);
      this.captureReachedStops(ownerId);
    }
  }

  private roomOptions: any = {};

  onCreate(options: any) {
    this.maxClients = parseInt(process.env.MAX_CLIENTS || "500", 10) || 500;
    this.roomOptions = options || {};
    this.autoDispose = false;
    this.setState(new GameState());

    // 1. Spawn 5 School HQs (distance > 200 tiles)
    this.spawnHQs();

    // 2. Spawn 10 Landmarks (distance from HQs > 75 tiles, from each other > 65 tiles)
    this.spawnLandmarks();

    // 2b. Spawn UniStops and Chests
    this.spawnUniStops();
    this.spawnChests();
    this.rebuildKnowledgeCounts();

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
      lmState.currentCrystals = 0;
      lmState.maxCrystals = BEACON_CRYSTALS;
      lmState.litBySchoolId = "";
      lmState.buffActive = false;
      lmState.nameGuessed = false;
      lmState.guessedBySchoolId = "";
      this.state.landmarks.set(lmKey, lmState);

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

    // 15 Chests: 8 Aspire, 5 Nitro, 2 Predator
    const tiers: ChestTier[] = [
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
      this.devLog(`[CampusRoom] Landmark ${config.name} (${lmKey}) bonfire controlled by: "${lm.litBySchoolId}"`);
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
          const bonus = this.buffDirector.bonus(lmKey, lm.litBySchoolId, new Map(this.state.schoolKnowledgeTiles), config.troopBonus || 6);
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
    const fw = config?.footprint.width || 50;
    const fh = config?.footprint.height || 50;

    for (let dx = -1; dx <= fw; dx++) {
      for (let dy = -1; dy <= fh; dy++) {
        const tx = lm.x + dx;
        const ty = lm.y + dy;
        if (tx < 0 || tx >= 1000 || ty < 0 || ty >= 1000) continue;
        const t = this.state.claimedTiles.get(`${tx},${ty}`);
        if (this.tileHasKnowledge(t, schoolId)) {
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
  public handleClaimAction(client: Client, data: { x: number; y: number }, op: string = "claim") {
    const player = this.state.players.get(client.sessionId);
    if (player && isSafeCoordinate(data.x) && isSafeCoordinate(data.y) &&
      this.tileHasKnowledge(this.state.claimedTiles.get(`${data.x},${data.y}`), player.schoolId)) {
      this.sendLandAck(client, op, data.x, data.y, true); return;
    }
    this.handleStudyAction(client, { ...data, points: 1 }, op);
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
    const x = Number(data.x), y = Number(data.y ?? (data as any).z);
    if (!isSafeCoordinate(x) || !isSafeCoordinate(y)) {
      this.sendLandAck(client, op, x, y, false, "out_of_bounds"); return;
    }
    const key = `${x},${y}`;
    if (this.landmarkTileMap.has(key)) {
      this.sendLandAck(client, op, x, y, false, "use_contribute_crystal"); return;
    }
    let tile = this.state.claimedTiles.get(key);
    const friendly = this.tileHasKnowledge(tile, player.schoolId);
    const adjacent = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].some(([nx,ny]) =>
      this.tileHasKnowledge(this.state.claimedTiles.get(`${nx},${ny}`), player.schoolId));
    if (!friendly && !adjacent) {
      client.send("error", { message: "Ô không tiếp giáp với vùng tri thức của trường bạn!" });
      this.sendLandAck(client, op, x, y, false, "not_adjacent_or_friendly"); return;
    }
    const points = data.points ?? 1;
    if (!Number.isSafeInteger(points) || points < 1 || points > 1000000) {
      this.sendLandAck(client, op, x, y, false, "invalid_points"); return;
    }
    const adding = !friendly;
    const minimum = adding && tile && tile.knowledge.size ? EXCHANGE_COST : 1;
    const cost = Math.max(minimum, points);
    const studentId = (player.email || client.sessionId).toLowerCase().trim();
    const schoolPoints = this.state.schoolTroops.get(player.schoolId) || 0;
    if (schoolPoints < cost || !this.profileManager.deductPoints(studentId, cost)) {
      client.send("error", { message: `Không đủ Điểm! Cần ${cost} Điểm.` });
      this.sendLandAck(client, op, x, y, false, "not_enough_points"); return;
    }
    this.state.schoolTroops.set(player.schoolId, schoolPoints - cost);
    player.personalTroops = this.profileManager.getAvailablePoints(studentId);
    this.syncProfile(client, studentId);
    if (!tile) {
      tile = new TileState(); tile.x = x; tile.y = y;
      this.state.claimedTiles.set(key, tile);
    }
    studyKnowledge(tile, player.schoolId, cost, Date.now(), ...this.decayTiming());
    this.publishKnowledge(tile);
    this.handleClusterUpdate(player.schoolId, x, y);
    this.captureReachedStops(player.schoolId);
    this.emitGameplay(adding ? "knowledge.added" : "knowledge.studied", { x, y, schoolId: player.schoolId, cost, shared: tile.isShared });
    this.broadcastNotification(adding ? "terr_captured" : "terr_studied", {
      student_name: player.displayName || maskEmail(player.email), my_school: player.schoolId, x, y
    }, "territory");
    this.sendLandAck(client, op, x, y, true);
    const entry = tile.knowledge.get(player.schoolId)!;
    client.send("tile_studied", { x, y, schoolId: player.schoolId, retention: entry.retention, lastStudiedAt: entry.lastStudiedAt });
  }

  /**
   * Hành động Tinh thể & Thắp sáng Đèn hiệu Công trình (contributeCrystal):
   * - Sinh viên dùng Tinh thể (hoặc quy đổi từ Điểm/personalTroops nếu không đủ Tinh thể).
   * - Đạt maxCrystals (1000) sẽ thắp sáng Đèn hiệu và kích hoạt buff cho trường.
   * - Overtake rule: Trường khác muốn cướp Đèn hiệu phải đạt crystals >= ceil(ownerCrystals * 1.05).
   */
  public handleContributeCrystalAction(
    client: Client,
    data: { landmarkId: string; crystals?: number; amount?: number; points?: number }
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

    const amount = Math.max(1, Math.floor(data.crystals || data.amount || data.points || 1));
    const studentId = (player.email || client.sessionId).toLowerCase().trim();
    const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
    if (player.crystals !== undefined && player.crystals > (profile.crystals || 0)) {
      profile.crystals = player.crystals;
    }
    const availableCrystals = profile.crystals || 0;

    if (availableCrystals >= amount) {
      this.profileManager.deductCrystals(studentId, amount);
      player.crystals = profile.crystals;
    } else {
      const neededPoints = amount - availableCrystals;
      const schoolTroops = this.state.schoolTroops.get(player.schoolId) || 0;
      const availablePoints = this.profileManager.getAvailablePoints(studentId);

      if (availablePoints < neededPoints) {
        client.send("error", {
          message: `Không đủ Tinh thể hoặc Điểm! Bạn có ${availableCrystals} Tinh thể, cần thêm ${neededPoints} Điểm để nạp đủ ${amount} Tinh thể.`
        });
        return;
      }

      if (schoolTroops < neededPoints) {
        client.send("error", { message: "Không đủ quân lực để nạp Tinh thể!" });
        return;
      }

      if (availableCrystals > 0) {
        this.profileManager.deductCrystals(studentId, availableCrystals);
      }
      this.profileManager.deductPoints(studentId, neededPoints);
      player.crystals = profile.crystals;
      player.personalTroops = this.profileManager.getAvailablePoints(studentId);
      this.state.schoolTroops.set(player.schoolId, schoolTroops - neededPoints);
    }
    this.syncProfile(client, studentId);

    const curSchoolCrystals = (lm.crystalsBySchool.get(player.schoolId) || 0) + amount;
    lm.crystalsBySchool.set(player.schoolId, curSchoolCrystals);

    let litChanged = false;
    const prevSchool = lm.litBySchoolId;

    if (!lm.litBySchoolId || !lm.buffActive) {
      // First school to reach maxCrystals (1000) lights the beacon
      if (curSchoolCrystals >= lm.maxCrystals) {
        lm.litBySchoolId = player.schoolId;
        lm.ownerId = player.schoolId;
        lm.buffActive = true;
        litChanged = true;
      }
    } else if (lm.litBySchoolId !== player.schoolId) {
      // Overtake competition rule: at least 5% more crystals than the current owner!
      const ownerCrystals = lm.crystalsBySchool.get(lm.litBySchoolId) || lm.maxCrystals;
      if (curSchoolCrystals >= beaconOvertakeTarget(ownerCrystals)) {
        lm.litBySchoolId = player.schoolId;
        lm.ownerId = player.schoolId;
        lm.buffActive = true;
        litChanged = true;
      }
    }

    if (lm.litBySchoolId) {
      lm.currentCrystals = lm.crystalsBySchool.get(lm.litBySchoolId) || 0;
    } else {
      let maxC = 0;
      lm.crystalsBySchool.forEach((c) => {
        if (c > maxC) maxC = c;
      });
      lm.currentCrystals = maxC;
    }

    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    if (prevSchool && prevSchool !== player.schoolId) {
      this.broadcastNotification(
        "lm_under_attack",
        {
          enemy_school: player.schoolId,
          landmark_name: "Công trình bí ẩn"
        },
        "landmark"
      );
    }

    if (litChanged) {
      if (config) {
        for (let dx = 0; dx < config.footprint.width; dx++) {
          for (let dy = 0; dy < config.footprint.height; dy++) {
            const tx = lm.x + dx;
            const ty = lm.y + dy;
            const t = this.state.claimedTiles.get(`${tx},${ty}`);
            if (t) {
              t.ownerId = player.schoolId;
              this.landData.writeTile(tx, ty, player.schoolId, t.hp, t.maxHp, t.defenseTier);
            }
          }
        }
      }

      this.emitBeacon({
        landmarkId: lm.id,
        schoolId: player.schoolId,
        previousSchoolId: prevSchool,
        crystals: curSchoolCrystals,
        fuel: curSchoolCrystals
      });

      this.broadcast("landmark_lit", {
        landmarkId: lm.id,
        schoolId: player.schoolId,
        previousSchoolId: prevSchool,
        crystals: curSchoolCrystals,
        fuel: curSchoolCrystals
      });

      this.broadcastNotification(
        "lm_lit_buff",
        {
          landmark_name: "Công trình bí ẩn",
          my_school: player.schoolId
        },
        "landmark"
      );

      this.devLog(
        `[CampusRoom] Landmark ${lm.landmarkKey || lm.id} BEACON LIT by ${player.schoolId} (${curSchoolCrystals}/${lm.maxCrystals} crystals)!`
      );
    }

    const payload = {
      landmarkId: lm.id,
      schoolId: player.schoolId,
      schoolCrystals: curSchoolCrystals,
      currentCrystals: lm.currentCrystals,
      maxCrystals: lm.maxCrystals,
      litBySchoolId: lm.litBySchoolId,
      buffActive: lm.buffActive,
      // Backward compatibility aliases
      schoolFuel: curSchoolCrystals,
      currentFuel: lm.currentCrystals,
      maxFuel: lm.maxCrystals
    };

    this.emitGameplay("landmark.crystals_contributed", { landmarkId: lm.id, schoolId: player.schoolId, crystals: lm.crystalsBySchool.get(player.schoolId) || 0 });
    client.send("crystal_contributed", payload);
    client.send("fuel_contributed", payload);
  }

  /** Backward-compatible alias for contributeFuel */
  public handleContributeFuelAction(
    client: Client,
    data: { landmarkId: string; points?: number; amount?: number; crystals?: number }
  ) {
    return this.handleContributeCrystalAction(client, data);
  }

  /**
   * Hành động Giải đố Tên Công trình (guessLandmark):
   * - Chuẩn hóa cả câu đoán và đáp án (bỏ dấu tiếng Việt, lowercase, trim, khoảng trắng thừa).
   * - Mỗi trường được đoán đúng 1 lần cho mỗi công trình và nhận 10% mốc thắp hiện tại một lần.
   * - Trường khác KHÔNG bị khóa (nếu trường A đoán đúng rồi, trường B vẫn có quyền đoán).
   * - Cooldown 10 phút (600,000 ms) mỗi lần đoán sai tính theo từng sinh viên.
   */
  public handleGuessLandmark(
    client: Client,
    data: { landmarkId: string; guess: string }
  ) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!data || !data.landmarkId) {
      client.send("error", { message: "Mã Công trình không hợp lệ!" });
      return;
    }

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

    if (lm.guessedSchools.get(player.schoolId)) {
      client.send("error", {
        message: `Trường của bạn (${player.schoolId.toUpperCase()}) đã giải đố thành công Công trình này rồi!`
      });
      return;
    }

    const now = Date.now();
    const studentId = (player.email || client.sessionId).toLowerCase().trim();
    if (!player.guessCooldowns.has(lm.id)) {
      this.profileManager.setGuessCooldown(studentId, lm.id, 0);
    }
    const cd = this.profileManager.getGuessCooldown(studentId, lm.id) || (player.guessCooldowns.get(lm.id) || 0);
    if (now < cd) {
      const remainingSec = Math.ceil((cd - now) / 1000);
      client.send("error", {
        message: `Bạn đang trong thời gian chờ đoán lại tên công trình này! Còn ${remainingSec}s.`
      });
      return;
    }

    const config = LANDMARK_ROSTER[lm.landmarkKey || lm.id];
    if (!config) {
      client.send("error", { message: "Không tìm thấy thông tin cấu hình Công trình!" });
      return;
    }

    const normGuess = normalizeAnswer(data.guess || "");
    const aliases = Array.isArray((config as any).aliases) ? (config as any).aliases : [];
    const validTargets = [config.name, ...aliases];
    const isCorrect = validTargets.some((target) => normalizeAnswer(target) === normGuess);

    if (isCorrect) {
      lm.guessedSchools.set(player.schoolId, true);
      lm.nameGuessed = true;
      if (!lm.guessedBySchoolId) {
        lm.guessedBySchoolId = player.schoolId;
      }

      const target = lm.buffActive && lm.litBySchoolId && lm.litBySchoolId !== player.schoolId
        ? beaconOvertakeTarget(lm.crystalsBySchool.get(lm.litBySchoolId) || lm.maxCrystals)
        : lm.maxCrystals;
      const bonusCrystals = landmarkGuessReward(target);
      const currentCrystals = lm.crystalsBySchool.get(player.schoolId) || 0;
      const curSchoolCrystals = currentCrystals + bonusCrystals;
      lm.crystalsBySchool.set(player.schoolId, curSchoolCrystals);

      let litChanged = false;
      const prevSchool = lm.litBySchoolId;
      if (!lm.litBySchoolId || !lm.buffActive) {
        if (curSchoolCrystals >= lm.maxCrystals) {
          lm.litBySchoolId = player.schoolId;
          lm.ownerId = player.schoolId;
          lm.buffActive = true;
          litChanged = true;
        }
      } else if (lm.litBySchoolId !== player.schoolId) {
        const ownerCrystals = lm.crystalsBySchool.get(lm.litBySchoolId) || lm.maxCrystals;
        if (curSchoolCrystals >= beaconOvertakeTarget(ownerCrystals)) {
          lm.litBySchoolId = player.schoolId;
          lm.ownerId = player.schoolId;
          lm.buffActive = true;
          litChanged = true;
        }
      }

      if (lm.litBySchoolId) {
        lm.currentCrystals = lm.crystalsBySchool.get(lm.litBySchoolId) || 0;
      } else {
        let maxC = 0;
        lm.crystalsBySchool.forEach((c) => {
          if (c > maxC) maxC = c;
        });
        lm.currentCrystals = Math.min(lm.maxCrystals, maxC);
      }

      if (litChanged) {
        for (let dx = 0; dx < config.footprint.width; dx++) {
          for (let dy = 0; dy < config.footprint.height; dy++) {
            const tx = lm.x + dx;
            const ty = lm.y + dy;
            const t = this.state.claimedTiles.get(`${tx},${ty}`);
            if (t) {
              t.ownerId = player.schoolId;
              this.landData.writeTile(tx, ty, player.schoolId, t.hp, t.maxHp, t.defenseTier);
            }
          }
        }

        this.emitBeacon({
          landmarkId: lm.id,
          schoolId: player.schoolId,
          previousSchoolId: prevSchool,
          crystals: curSchoolCrystals,
          fuel: curSchoolCrystals
        });

        this.broadcast("landmark_lit", {
          landmarkId: lm.id,
          schoolId: player.schoolId,
          previousSchoolId: prevSchool,
          crystals: curSchoolCrystals,
          fuel: curSchoolCrystals
        });

        this.broadcastNotification(
          "lm_lit_buff",
          {
            landmark_name: "Công trình bí ẩn",
            my_school: player.schoolId
          },
          "landmark"
        );
      }

      this.publishLandmarkMessage("landmark_guessed", {
        landmarkId: lm.id,
        landmarkName: "Công trình bí ẩn",
        schoolId: player.schoolId,
        studentEmail: maskEmail(player.email) || client.sessionId,
        displayName: player.displayName || maskEmail(player.email) || client.sessionId,
        bonusCrystals
      });

      this.broadcastNotification(
        "lm_guessed",
        {
          student_name: player.displayName || (player.email ? maskEmail(player.email) : client.sessionId),
          landmark_name: "Công trình bí ẩn",
          my_school: player.schoolId
        },
        "landmark"
      );

      // Gamenote awards school beacon progress, not an additional spendable copy.
      this.syncProfile(client, studentId);

      client.send("landmark_guess_result", {
        success: true,
        landmarkId: lm.id,
        landmarkName: config.name,
        crystalsAwarded: bonusCrystals,
        currentCrystals: curSchoolCrystals
      });
    } else {
      const cooldownEnd = Date.now() + 600000;
      this.profileManager.setGuessCooldown(studentId, lm.id, cooldownEnd);
      player.guessCooldowns.set(lm.id, cooldownEnd);
      this.syncProfile(client, studentId);

      client.send("error", {
        message: "Câu trả lời chưa chính xác! Thời gian chờ đoán lại là 10 phút.",
        cooldownSeconds: 600
      });

      client.send("landmark_guess_result", {
        success: false,
        landmarkId: lm.id,
        cooldownUntil: cooldownEnd
      });
    }
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

    this.captureReachedStops(player.schoolId);
    if (stop.ownerSchoolId !== player.schoolId) {
      client.send("error", { message: "Chỉ sinh viên trường sở hữu Trạm tiếp tế mới được nhận đồ!" }); return;
    }
    const now = Date.now();
    const studentId = (player.email || client.sessionId).toLowerCase().trim();
    const studentCd = this.profileManager.getUniStopCooldown(studentId, stop.id);
    const effectiveCd = studentCd;

    if (effectiveCd && now < effectiveCd) {
      const remainingSec = Math.ceil((effectiveCd - now) / 1000);
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

    // Kích hoạt thời gian hồi chiêu per-student
    const cdUntil = now + cfg.cooldownMs;
    this.profileManager.setUniStopCooldown(studentId, stop.id, cdUntil);
    this.emitGameplay("station.claimed", { stopId: stop.id, schoolId: player.schoolId, cooldownUntil: cdUntil });

    // Cộng phần thưởng cho người chơi
    if (winningItem.type === "points") {
      const pts = winningItem.amount || 1;
      this.profileManager.addGamePoints(studentId, pts);
      player.personalTroops = this.profileManager.getAvailablePoints(studentId);
      const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
      this.state.schoolTroops.set(player.schoolId, curTroops + pts);
    } else if (winningItem.type === "crystal" || winningItem.type === ("charcoal" as any)) {
      const cry = winningItem.amount || 1;
      player.crystals = this.profileManager.addCrystals(studentId, cry);
    } else if (winningItem.type === "key") {
      this.profileManager.addKeys(studentId, winningItem.keyTier as any, 1);
      const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
      player.aspireKeys = profile.aspireKeys;
      player.nitroKeys = profile.nitroKeys;
      player.predatorKeys = profile.predatorKeys;
    } else if (winningItem.type === "treasure_map") {
      const unopenedChests = Array.from(this.state.chests.values()).filter((c) => !c.isOpened);
      if (unopenedChests.length > 0) {
        const targetChest = unopenedChests[Math.floor(Math.random() * unopenedChests.length)];
        client.send("treasure_map_reveal", {
          chestId: targetChest.id,
          x: targetChest.x,
          z: targetChest.z,
          tier: targetChest.tier
        });
      }
    }

    if (winningItem.isRealGift) {
      this.profileManager.addGift(studentId, winningItem);
      this.broadcast("real_gift_won", {
        studentEmail: maskEmail(player.email) || client.sessionId,
        displayName: player.displayName || maskEmail(player.email) || client.sessionId,
        schoolId: player.schoolId,
        item: winningItem,
        source: "unistop",
        sourceId: stop.id
      });
      this.broadcastNotification(
        "chest_real_gift",
        {
          student_name: player.displayName || (player.email ? maskEmail(player.email) : client.sessionId),
          gift_name: winningItem.name,
          my_school: player.schoolId
        },
        "chest"
      );
      this.devLog(
        `[CampusRoom] 🎁 Real Gift won by ${player.displayName || maskEmail(player.email) || client.sessionId} (${player.schoolId}): ${winningItem.name}`
      );
    }

    this.broadcastNotification(
      "unistop_ready",
      {
        chest_tier: stop.tier,
        time_left: "Ngay bây giờ"
      },
      "chest",
      client
    );

    this.syncProfile(client, studentId);

    const carouselItems = generateCarouselItems(winningItem, lootTable, 30, 24);

    client.send("unistop_rolled", {
      stopId: stop.id,
      tier: stop.tier,
      winningItem,
      carouselItems,
      winningIndex: 24,
      cooldownUntil: stop.cooldownUntil,
      playerPoints: player.personalTroops,
      playerCrystals: player.crystals,
      playerCharcoal: player.crystals,
      aspireKeys: player.aspireKeys,
      nitroKeys: player.nitroKeys,
      predatorKeys: player.predatorKeys,
      silverKeys: player.aspireKeys,
      goldKeys: player.nitroKeys,
      platinumKeys: player.predatorKeys
    });
  }

  /**
   * Hành động mở Rương (openChest):
   * - Kiểm tra sinh viên có chìa khóa tương ứng (Aspire / Nitro / Predator)
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

    if (!this.territoryTouches(player.schoolId, chest.x, chest.z, 2, 2)) {
      client.send("error", { message: "Vùng tri thức của trường bạn chưa tiếp giáp rương!" }); return;
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
    const studentId = (player.email || client.sessionId).toLowerCase().trim();
    const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
    const tier = chest.tier as ChestTier;
    if (tier === "aspire" || (tier as any) === "silver") {
      if (player.aspireKeys !== undefined) profile.aspireKeys = player.aspireKeys;
    } else if (tier === "nitro" || (tier as any) === "gold") {
      if (player.nitroKeys !== undefined) profile.nitroKeys = player.nitroKeys;
    } else if (tier === "predator" || (tier as any) === "platinum") {
      if (player.predatorKeys !== undefined) profile.predatorKeys = player.predatorKeys;
    }
    if (!this.profileManager.deductKeys(studentId, tier, 1)) {
      if (tier === "aspire" || (tier as any) === "silver") {
        client.send("error", { message: "Bạn cần có Chìa khoá Aspire (Key - Aspire) để mở rương này!" });
      } else if (tier === "nitro" || (tier as any) === "gold") {
        client.send("error", { message: "Bạn cần có Chìa khoá Nitro (Key - Nitro) để mở rương này!" });
      } else if (tier === "predator" || (tier as any) === "platinum") {
        client.send("error", { message: "Bạn cần có Chìa khoá Predator (Key - Predator) để mở rương này!" });
      } else {
        client.send("error", { message: `Bạn cần có Chìa khoá ${tier} để mở rương này!` });
      }
      return;
    }

    player.aspireKeys = profile.aspireKeys;
    player.nitroKeys = profile.nitroKeys;
    player.predatorKeys = profile.predatorKeys;

    chest.isOpened = true;
    chest.openedBySchoolId = player.schoolId;
    this.emitGameplay("chest.opened", { chestId: chest.id, schoolId: player.schoolId });

    const lootTable = CHEST_LOOT_TABLES[tier] || CHEST_LOOT_TABLES.aspire;
    const winningItem = rollLoot(lootTable, player.hasWeeklyRunningPoints);

    // Cộng phần thưởng
    if (winningItem.type === "points") {
      const pts = winningItem.amount || 1;
      this.profileManager.addGamePoints(studentId, pts);
      player.personalTroops = this.profileManager.getAvailablePoints(studentId);
      const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
      this.state.schoolTroops.set(player.schoolId, curTroops + pts);
    } else if (winningItem.type === "crystal" || winningItem.type === ("charcoal" as any)) {
      const cry = winningItem.amount || 1;
      player.crystals = this.profileManager.addCrystals(studentId, cry);
    } else if (winningItem.type === "key") {
      this.profileManager.addKeys(studentId, winningItem.keyTier as any, 1);
      player.aspireKeys = profile.aspireKeys;
      player.nitroKeys = profile.nitroKeys;
      player.predatorKeys = profile.predatorKeys;
    } else if (winningItem.type === "treasure_map") {
      const unopenedChests = Array.from(this.state.chests.values()).filter((c) => !c.isOpened && c.id !== chest.id);
      if (unopenedChests.length > 0) {
        const targetChest = unopenedChests[Math.floor(Math.random() * unopenedChests.length)];
        client.send("treasure_map_reveal", {
          chestId: targetChest.id,
          x: targetChest.x,
          z: targetChest.z,
          tier: targetChest.tier
        });
      }
    }

    if (winningItem.isRealGift) {
      this.profileManager.addGift(studentId, winningItem);
      this.broadcast("real_gift_won", {
        studentEmail: maskEmail(player.email) || client.sessionId,
        displayName: player.displayName || maskEmail(player.email) || client.sessionId,
        schoolId: player.schoolId,
        item: winningItem,
        source: "chest",
        sourceId: chest.id
      });
      this.broadcastNotification(
        "chest_real_gift",
        {
          student_name: player.displayName || (player.email ? maskEmail(player.email) : client.sessionId),
          gift_name: winningItem.name,
          my_school: player.schoolId
        },
        "chest"
      );
      this.devLog(
        `[CampusRoom] 🎁 Real Gift won from Chest by ${player.displayName || maskEmail(player.email) || client.sessionId} (${player.schoolId}): ${winningItem.name}`
      );
    }

    if (
      winningItem.rarity === "epic" ||
      winningItem.rarity === "legendary" ||
      (winningItem.type === "crystal" && (winningItem.amount || 0) >= 10)
    ) {
      this.broadcastNotification(
        "chest_opened_big",
        {
          student_name: player.displayName || (player.email ? maskEmail(player.email) : client.sessionId),
          chest_tier: chest.tier,
          gift_name: winningItem.name || "Gói Tinh Thể Khủng"
        },
        "chest"
      );
    }

    this.syncProfile(client, studentId);

    const carouselItems = generateCarouselItems(winningItem, lootTable, 30, 24);

    client.send("chest_opened", {
      chestId: chest.id,
      tier: chest.tier,
      winningItem,
      carouselItems,
      winningIndex: 24,
      schoolId: player.schoolId,
      playerPoints: player.personalTroops,
      playerCrystals: player.crystals,
      playerCharcoal: player.crystals,
      aspireKeys: player.aspireKeys,
      nitroKeys: player.nitroKeys,
      predatorKeys: player.predatorKeys,
      silverKeys: player.aspireKeys,
      goldKeys: player.nitroKeys,
      platinumKeys: player.predatorKeys
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
    if (!this.isDevCommandAllowed(client, "update_map_layout", data)) return;
    let plan: Placement[];
    try { plan = planMapLayout(this.state, data, this.landmarkTileMap, ...this.decayTiming()); }
    catch (error) {
      const message = (error as Error).message;
      client.send("map_layout_ack", {success:false,message});
      client.send("error", {message});
      return;
    }
    const moved = plan.filter(p=>p.moved);
    // Remove the old reserved geometry, retaining other schools' knowledge at old HQs.
    for (const p of moved) {
      if (p.kind === "hqs") {
        for (const t of this.initialHQTiles.get(p.id) || []) {
          const tile=this.state.claimedTiles.get(`${t.x},${t.y}`);
          if (!tile) continue;
          initializeKnowledge(tile,Date.now());
          if (tile.knowledge.get(p.id)?.persistent) tile.knowledge.delete(p.id);
          tile.maxHp=100; tile.hp=100; tile.defenseTier=0;
          projectKnowledge(tile);
          if (!tile.knowledge.size) this.state.claimedTiles.delete(`${t.x},${t.y}`);
        }
      } else if (p.kind === "landmarks") {
        for (const [key, info] of this.landmarkTileMap) if (info.landmarkKey === p.id) {
          this.landmarkTileMap.delete(key); this.initialLandmarkTiles.delete(key); this.state.claimedTiles.delete(key);
        }
      }
    }
    for (const p of plan) {
      if (p.kind === "hqs") {
        let hq=this.state.hqs.get(p.id);
        if (!hq) {hq=new HQState(); hq.schoolId=p.id; this.state.hqs.set(p.id,hq);}
        hq.x=p.x; hq.y=p.y;
        if (!p.moved) continue;
        const initial: {x:number;y:number;defenseTier:number;hp:number}[]=[];
        for (const [x,y] of footprint(p)) {
          const key=`${x},${y}`;
          const tile=this.state.claimedTiles.get(key) || new TileState();
          tile.x=x; tile.y=y;
          initializeKnowledge(tile,Date.now());
          studyKnowledge(tile,p.id,10,Date.now()); tile.knowledge.get(p.id)!.persistent=true;
          tile.hp=500; tile.maxHp=500;
          const dist=Math.hypot(x-p.x,y-p.y);
          tile.defenseTier=dist<=3 ? 3 : dist<=7 ? 2 : 1;
          projectKnowledge(tile);
          this.state.claimedTiles.set(key,tile);
          initial.push({x,y,hp:500,defenseTier:tile.defenseTier});
        }
        this.initialHQTiles.set(p.id,initial);
      } else if (p.kind === "landmarks") {
        let lm=this.state.landmarks.get(p.id);
        if (!lm) {lm=new LandmarkState();lm.id=p.id;lm.landmarkKey=p.configKey!;this.state.landmarks.set(p.id,lm);}
        lm.x=p.x; lm.y=p.y; lm.maxCrystals=p.threshold!;
        if (!p.moved) continue;
        const config=LANDMARK_ROSTER[p.configKey!];
        for (const [x,y] of footprint(p)) {
          const key=`${x},${y}`, isCore=x===p.x+Math.floor(config.footprint.width/2) && y===p.y+Math.floor(config.footprint.height/2);
          const tile=new TileState();tile.x=x;tile.y=y;tile.ownerId=lm.litBySchoolId;
          tile.hp=isCore ? config.coreHp : config.tileHp;tile.maxHp=tile.hp;
          tile.defenseTier=isCore ? Math.min(3,config.defenseTier+1) : config.defenseTier;
          this.state.claimedTiles.set(key,tile);
          this.landmarkTileMap.set(key,{landmarkKey:p.id,isCore});
          this.initialLandmarkTiles.set(key,{x,y,hp:tile.hp,maxHp:tile.maxHp,defenseTier:tile.defenseTier});
        }
      } else if (p.kind === "unistops") {
        let stop=this.state.unistops.get(p.id);
        if (!stop) {stop=new UniStopState();stop.id=p.id;this.state.unistops.set(p.id,stop);}
        stop.x=p.x; stop.z=p.y; stop.tier=p.tier as UniStopTier;
        stop.name=p.name || `UniStop - ${p.tier!.toUpperCase()}`;
        if (p.moved) stop.arrivalOrderBySchool.clear();
      } else {
        let chest=this.state.chests.get(p.id);
        if (!chest) {chest=new ChestState();chest.id=p.id;this.state.chests.set(p.id,chest);}
        chest.x=p.x;chest.z=p.y;chest.tier=p.tier as ChestTier;
        // Existing tombstones are authoritative; layout imports never revive opened chests.
      }
    }
    this.landData.reset();
    this.clusterEngine=new TerritoryClusterEngine(1000,1000);
    for (const tile of this.state.claimedTiles.values()) {
      if (!this.landmarkTileMap.has(`${tile.x},${tile.y}`)) {
        pruneKnowledge(tile,Date.now(),...this.decayTiming());
      }
      this.landData.writeTile(tile.x,tile.y,tile.ownerId,tile.hp,tile.maxHp,tile.defenseTier);
      this.clusterEngine.setTile(tile.x,tile.y,this.getSchoolNumericId(tile.ownerId),tile.defenseTier,tile.hp);
    }
    this.decayCursor=undefined;
    this.rebuildKnowledgeCounts();this.captureReachedStops();
    this.landData.finishReset();
    this.broadcast("knowledge_sync",{tiles:Array.from(this.state.claimedTiles.values()).filter(t=>!this.landmarkTileMap.has(`${t.x},${t.y}`) && t.knowledge.size>1).map(t=>({x:t.x,y:t.y,schools:Array.from(t.knowledge.keys()).sort()}))});
    const layout={
      hqs:Array.from(this.state.hqs.values()).map(h=>({schoolId:h.schoolId,x:h.x,y:h.y})),
      landmarks:Array.from(this.state.landmarks.values()).map(l=>({id:l.id,landmarkKey:l.landmarkKey,x:l.x,y:l.y,maxCrystals:l.maxCrystals})),
      unistops:Array.from(this.state.unistops.values()).map(s=>({id:s.id,name:s.name,tier:s.tier,x:s.x,z:s.z})),
      chests:Array.from(this.state.chests.values()).map(c=>({id:c.id,tier:c.tier,x:c.x,z:c.z,isOpened:c.isOpened}))
    };
    this.broadcast("map_layout_updated",layout);
    client.send("map_layout_ack",{success:true,moved:moved.length,hqsUpdated:data.hqs?.length || 0,landmarksUpdated:data.landmarks?.length || 0,unistopsUpdated:data.unistops?.length || 0,chestsUpdated:data.chests?.length || 0});
  }


  /**
   * Heartbeat kiểm tra quên bài (Decay loop, chạy mỗi 10-15s):
   * Nếu ô tiếp giáp bị "bỏ bê" quá lâu (không có sinh viên ôn bài), retention giảm dần.
   * Mỗi trường tự quên tri thức theo timestamp; không có hẹn giờ chuyển chủ.
   */
  public processKnowledgeDecay() {
    // Bounded housekeeping; all authorization paths also evaluate timestamps lazily.
    if (!this.decayCursor) this.decayCursor = this.state.claimedTiles.entries();
    for (let budget = 0; budget < 256; budget++) {
      const next = this.decayCursor.next();
      if (next.done) { this.decayCursor = undefined; break; }
      const tile = next.value[1];
      if (this.landmarkTileMap.has(`${tile.x},${tile.y}`)) continue;
      initializeKnowledge(tile, Date.now());
      const before = Array.from(tile.knowledge.keys()) as string[];
      if (pruneKnowledge(tile, Date.now(), ...this.decayTiming())) {
        this.publishKnowledge(tile);
      }
    }
    this.captureReachedStops();
  }

  /**
   * Fortify path: Vô hiệu hoá cơ chế gia cố cũ, thông báo thay thế bằng cơ chế Giao lưu tri thức & Ôn bài.
   */
  private handleFortifyAction(client: Client, _data?: any, _op: string = "fortify") {
    client.send("error", {
      message: "Cơ chế gia cố đã được thay thế bằng cơ chế Giao lưu tri thức & Ôn bài!"
    });
  }

  /**
   * Kiểm tra quyền thực thi lệnh nhà phát triển / quản trị viên.
   * - Nếu ALLOW_DEV=true: cho phép toàn bộ lệnh.
   * - Nếu ALLOW_DEV tắt: chặn các lệnh dev/reset/toggles/bulk,
   *   ngoại trừ soft_reset và updateMapLayout nếu có ADMIN_KEY hợp lệ.
   */
  public isDevCommandAllowed(client: Client, command: string, data?: any): boolean {
    if (process.env.ALLOW_DEV === "true") {
      return true;
    }

    // Ngoại lệ: update_map_layout và soft_reset được phép nếu có adminKey chính xác
    if (command === "soft_reset" || command === "update_map_layout" || command === "updateMapLayout") {
      const providedKey = (data && data.adminKey) || (client ? this.clientAdminKeys.get(client.sessionId) : undefined);
      if (checkAdminKey(providedKey)) {
        return true;
      }
    }

    const isDevCmd =
      command.startsWith("dev_") ||
      command === "soft_reset" ||
      command === "add_points" ||
      command === "set_simulation_speed" ||
      command === "bulk_dispatch" ||
      command === "set_role" ||
      command === "login_student" ||
      command === "update_map_layout" ||
      command === "updateMapLayout";

    if (isDevCmd) {
      if (client && typeof client.send === "function") {
        client.send("error", { message: "Lệnh nhà phát triển bị vô hiệu hóa!" });
      }
      return false;
    }

    return true;
  }

  /**
   * Wrapper đăng ký message handler với kiểm soát bảo mật đa tầng:
   * 1. Rate Limiting (Token Bucket 20 msg/s, burst 40, sensitive 1 msg/s, disconnect khi >= 5 vi phạm)
   * 2. Dev Command Gate (ALLOW_DEV switch & ADMIN_KEY)
   * 3. Input Coordinate Sanitization
   * 4. Error Boundary Try/Catch bảo vệ server không bị sập
   */
  private registerHandler<T = any>(
    messageType: string,
    handler: (client: Client, data: T) => void,
    options?: { validateCoords?: boolean }
  ) {
    this.onMessage(messageType, (client: Client, data: T) => {
      try {
        if (client && client.sessionId) {
          const rateCheck = this.rateLimiter.check(client.sessionId, messageType);
          if (!rateCheck.allowed) {
            if (rateCheck.disconnect) {
              console.warn(`[CampusRoom] Disconnecting ${client.sessionId}: ${rateCheck.reason}`);
              try {
                client.leave(4000, rateCheck.reason);
              } catch (_) {}
            } else {
              client.send("error", { message: "Thao tác quá nhanh, vui lòng thử lại sau ít giây!" });
            }
            return;
          }
        }

        if (client && !this.isDevCommandAllowed(client, messageType, data)) {
          return;
        }

        if (options?.validateCoords && data && typeof data === "object") {
          const d = data as any;
          if (d.x !== undefined && !isSafeCoordinate(d.x)) {
            client.send("error", { message: "Tọa độ X không hợp lệ!" });
            return;
          }
          if (d.y !== undefined && !isSafeCoordinate(d.y)) {
            client.send("error", { message: "Tọa độ Y không hợp lệ!" });
            return;
          }
          if (d.z !== undefined && !isSafeCoordinate(d.z)) {
            client.send("error", { message: "Tọa độ Z không hợp lệ!" });
            return;
          }
        }

        handler(client, data);
      } catch (err) {
        console.error(`[CampusRoom] Error in message '${messageType}' from ${client?.sessionId}:`, err);
        try {
          client?.send("error", { message: "Có lỗi xảy ra khi xử lý yêu cầu!" });
        } catch (_) {}
      }
    });
  }

  private registerMessages() {
    // 1. claim_tile (legacy name kept for old clients) + protocol "claim" frame
    this.registerHandler("claim_tile", (client, data: ClientClaimMessage) => {
      this.handleClaimAction(client, data || { x: NaN, y: NaN }, "claim_tile");
    }, { validateCoords: true });
    this.registerHandler("convert_points", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const amount = data?.points || 0;
      const studentId = (player.email || client.sessionId).toLowerCase().trim();
      const available = this.profileManager.getAvailablePoints(studentId);
      if (!isSafeInteger(amount, 1, 1000000) || available < amount) {
        client.send("error", { message: "Không đủ điểm để chuyển đổi!" });
        return;
      }
      this.profileManager.deductPoints(studentId, amount);
      const newCrystals = this.profileManager.addCrystals(studentId, amount);
      player.personalTroops = this.profileManager.getAvailablePoints(studentId);
      player.crystals = newCrystals;
      this.syncProfile(client, studentId);
      client.send("points_converted", { points: amount, crystals: amount });
    });
    this.registerHandler("claim", (client, data: ClaimFrame | ClientClaimMessage) => {
      const frame = decodeClientFrame(data) || data;
      this.handleClaimAction(client, { x: (frame as any).x, y: (frame as any).y }, "claim");
    }, { validateCoords: true });

    // 1b. studyTile / study_tile / protocol "study"
    this.registerHandler("studyTile", (client, data: ClientStudyTileMessage) => {
      this.handleStudyAction(client, data || { x: NaN, y: NaN }, "studyTile");
    }, { validateCoords: true });
    this.registerHandler("study_tile", (client, data: ClientStudyTileMessage) => {
      this.handleStudyAction(client, data || { x: NaN, y: NaN }, "study_tile");
    }, { validateCoords: true });
    this.registerHandler("study", (client, data: any) => {
      const frame = decodeClientFrame(data) || data;
      this.handleStudyAction(client, frame, "study");
    }, { validateCoords: true });

    // 1c. contributeCrystal / contribute_crystal / contributeFuel / contribute_fuel / burnCharcoal / burn_charcoal
    this.registerHandler("contributeCrystal", (client, data: ClientContributeCrystalMessage) => {
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });
    this.registerHandler("contribute_crystal", (client, data: ClientContributeCrystalMessage) => {
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });
    this.registerHandler("contributeFuel", (client, data: ClientContributeFuelMessage) => {
      console.warn("[CampusRoom] 'contributeFuel' message is deprecated. Use 'contributeCrystal' instead.");
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });
    this.registerHandler("contribute_fuel", (client, data: ClientContributeFuelMessage) => {
      console.warn("[CampusRoom] 'contribute_fuel' message is deprecated. Use 'contribute_crystal' instead.");
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });
    this.registerHandler("burnCharcoal", (client, data: ClientContributeFuelMessage) => {
      console.warn("[CampusRoom] 'burnCharcoal' message is deprecated. Use 'contributeCrystal' instead.");
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });
    this.registerHandler("burn_charcoal", (client, data: ClientContributeFuelMessage) => {
      console.warn("[CampusRoom] 'burn_charcoal' message is deprecated. Use 'contribute_crystal' instead.");
      this.handleContributeCrystalAction(client, data || { landmarkId: "" });
    });

    // 1c2. guessLandmark / guess_landmark
    this.registerHandler("guessLandmark", (client, data: ClientGuessLandmarkMessage) => {
      this.handleGuessLandmark(client, data || { landmarkId: "", guess: "" });
    });
    this.registerHandler("guess_landmark", (client, data: ClientGuessLandmarkMessage) => {
      this.handleGuessLandmark(client, data || { landmarkId: "", guess: "" });
    });

    // 1d. rollUniStop / roll_unistop
    this.registerHandler("rollUniStop", (client, data: ClientRollUniStopMessage) => {
      this.handleRollUniStop(client, data || { stopId: "" });
    }, { validateCoords: true });
    this.registerHandler("roll_unistop", (client, data: ClientRollUniStopMessage) => {
      this.handleRollUniStop(client, data || { stopId: "" });
    }, { validateCoords: true });

    // 1e. openChest / open_chest
    this.registerHandler("openChest", (client, data: ClientOpenChestMessage) => {
      this.handleOpenChest(client, data || { chestId: "" });
    }, { validateCoords: true });
    this.registerHandler("open_chest", (client, data: ClientOpenChestMessage) => {
      this.handleOpenChest(client, data || { chestId: "" });
    }, { validateCoords: true });

    // 1f. updateMapLayout / update_map_layout
    this.registerHandler("updateMapLayout", (client, data: ClientUpdateMapLayoutMessage) => {
      this.handleUpdateMapLayout(client, data || {});
    });
    this.registerHandler("update_map_layout", (client, data: ClientUpdateMapLayoutMessage) => {
      this.handleUpdateMapLayout(client, data || {});
    });

    // 2. fortify_tile (backward-compatibility bridge) + protocol "fortify" frame
    this.registerHandler("fortify_tile", (client, data: ClientFortifyMessage) => {
      this.handleFortifyAction(client, data || { x: NaN, y: NaN }, "fortify_tile");
    }, { validateCoords: true });
    this.registerHandler("fortify", (client, data: FortifyFrame | ClientFortifyMessage) => {
      const frame = decodeClientFrame(data) || data;
      this.handleFortifyAction(client, { x: (frame as any).x, y: (frame as any).y }, "fortify");
    }, { validateCoords: true });

    // 2b. protocol frames on the land channel (t: claim | fortify | study | crystal | fuel)
    this.registerHandler(LAND_FRAME_CHANNEL, (client, data: any) => {
      const frame = decodeClientFrame(data);
      if (!frame) return; // unknown / non-client frame: ignore
      if (frame.t === "claim") {
        this.handleClaimAction(client, frame, "claim");
      } else if (frame.t === "study") {
        this.handleStudyAction(client, frame, "study");
      } else if (frame.t === "crystal" || frame.t === "fuel") {
        this.handleContributeCrystalAction(client, frame);
      } else if (frame.t === "fortify") {
        this.handleFortifyAction(client, frame, "fortify");
      }
    });

    // 3. set_simulation_speed
    this.registerHandler("set_simulation_speed", (client, data: ClientSetSpeedMessage) => {
      const speed = isSafeInteger(data?.speed, 1, 100) ? data.speed : 1;
      this.setSimulationSpeed(speed);
    });

    // 4. bulk_dispatch (troops only — control plane; no tile writes)
    this.registerHandler("bulk_dispatch", (client, data: ClientBulkDispatchMessage) => {
      const amount = isSafeInteger(data?.amount, 1, 100000) ? data.amount : 500;
      for (const schoolId of SCHOOL_IDS) {
        const cur = this.state.schoolTroops.get(schoolId) || 0;
        this.state.schoolTroops.set(schoolId, cur + amount);
      }
    });

    // 5. soft_reset — full land reload: reset LandState, rebuild tiles, bump epoch + resend snap
    this.registerHandler("soft_reset", () => {
      // Clear all claimed tiles
      this.state.claimedTiles.clear();
      this.decayCursor = undefined;
      this.knowledgeCountIndex.clear();
      this.currentLeaderSchoolId = "";
      this.stationArrivalSequence = 0;
      for (const school of SCHOOL_IDS) this.state.schoolKnowledgeTiles.set(school, 0);
      this.buffDirector.reset();
      this.broadcast("knowledge_sync", { tiles: [] });
      this.landData.reset();
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

      // Reset landmark owners & beacons
      this.state.landmarks.forEach((lm) => {
        lm.ownerId = "";
        lm.currentCrystals = 0;
        lm.maxCrystals = BEACON_CRYSTALS;
        lm.litBySchoolId = "";
        lm.buffActive = false;
        lm.nameGuessed = false;
        lm.guessedBySchoolId = "";
        lm.crystalsBySchool.clear();
        lm.guessedSchools.clear();
      });

      // Reset UniStop cooldowns & Chest status
      this.state.unistops.forEach((stop) => {
        stop.ownerSchoolId = "";
        stop.arrivalOrderBySchool.clear();
        stop.cooldownUntil = 0;
      });
      this.state.chests.forEach((chest) => {
        chest.isOpened = false;
        chest.openedBySchoolId = "";
      });

      this.state.players.forEach((p) => {
        p.guessCooldowns.clear();
      });

      // Rebuild dirty is dropped; clients resync from a fresh snap under a new epoch
      this.landData.finishReset();
    });


    // 6. select_school
    this.registerHandler("select_school", (client, data: ClientSelectSchoolMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (player.mode === "normal" && player.isLockedSchool) {
        client.send("error", {
          message: `Tài khoản sinh viên (${player.displayName || "định danh"}) đã được cố định theo trường, không thể chuyển sang trường khác!`
        });
        return;
      }

      if (isValidSchoolId(data?.schoolId)) {
        player.schoolId = data.schoolId;
        this.devLog(`[CampusRoom] Player ${client.sessionId} switched to school: ${data.schoolId}`);
      } else {
        client.send("error", { message: "Mã trường không hợp lệ!" });
      }
    });

    // 6b. login_student
    this.registerHandler("login_student", (client, data: {
      email: string;
      schoolId: string;
      points: number;
      mode?: string;
      hasWeeklyRunningPoints?: boolean;
      crystals?: number;
      charcoal?: number;
      aspireKeys?: number;
      nitroKeys?: number;
      predatorKeys?: number;
      silverKeys?: number;
      goldKeys?: number;
      platinumKeys?: number;
    }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const email = (data.email || "").trim();
      const studentId = (email || client.sessionId).toLowerCase().trim();

      // Check single active session per studentId
      const existingSession = this.activeStudentSessions.get(studentId);
      if (existingSession && existingSession.sessionId !== client.sessionId) {
        try {
          existingSession.client.send("session_replaced", { message: "Tài khoản đã đăng nhập ở nơi khác" });
          existingSession.client.leave(4001, "Session replaced");
        } catch (_) {}
      }
      this.activeStudentSessions.set(studentId, { client, sessionId: client.sessionId });

      player.email = email;
      player.displayName = maskEmail(email);
      if (email) {
        this.playerEmails.set(client.sessionId, email);
      }

      if (isValidSchoolId(data.schoolId)) {
        player.schoolId = data.schoolId;
      }

      const targetSchool = player.schoolId || "hcmut";
      const profile = this.profileManager.getOrCreateProfile(studentId, targetSchool);

      const isDevAllowed = process.env.ALLOW_DEV === "true";
      if (isDevAllowed) {
        if (isSafeInteger(data.points, 0, 10000000)) {
          this.runningPointsProvider.setTotalPoints(studentId, data.points);
          profile.pointsSpent = 0;
        }
        if (typeof data.crystals === "number") profile.crystals = data.crystals;
        else if (typeof data.charcoal === "number") profile.crystals = data.charcoal;
        if (typeof data.aspireKeys === "number") profile.aspireKeys = data.aspireKeys;
        else if (typeof data.silverKeys === "number") profile.aspireKeys = data.silverKeys;
        if (typeof data.nitroKeys === "number") profile.nitroKeys = data.nitroKeys;
        else if (typeof data.goldKeys === "number") profile.nitroKeys = data.goldKeys;
        if (typeof data.predatorKeys === "number") profile.predatorKeys = data.predatorKeys;
        else if (typeof data.platinumKeys === "number") profile.predatorKeys = data.platinumKeys;
      }

      player.personalTroops = this.profileManager.getAvailablePoints(studentId);
      player.crystals = profile.crystals;
      player.aspireKeys = profile.aspireKeys;
      player.nitroKeys = profile.nitroKeys;
      player.predatorKeys = profile.predatorKeys;

      if (data.mode) {
        player.mode = data.mode;
        player.isLockedSchool = data.mode === "normal";
      }
      if (data.hasWeeklyRunningPoints !== undefined) {
        player.hasWeeklyRunningPoints = Boolean(data.hasWeeklyRunningPoints);
      }

      this.syncProfile(client, studentId, true);

      this.devLog(
        `[CampusRoom] Player ${client.sessionId} logged in as student: ${player.displayName} [${player.schoolId.toUpperCase()}] - ${player.personalTroops} pts (WeeklyPoints: ${player.hasWeeklyRunningPoints}, Mode: ${player.mode}, Locked: ${player.isLockedSchool})`
      );
    });

    // 7. set_role
    this.registerHandler("set_role", (client, data: ClientSetRoleMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player && ["assault", "fortify", "support"].includes(data.role)) {
        player.currentRole = data.role;
      }
    });

    // 9. add_points
    this.registerHandler("add_points", (client, data: { amount: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const added = isSafeInteger(data?.amount, 1, 1000000) ? data.amount : 100;
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        const curTotal = this.runningPointsProvider.getTotalPoints(studentId);
        this.runningPointsProvider.setTotalPoints(studentId, curTotal + added);
        player.personalTroops = this.profileManager.getAvailablePoints(studentId);
        const cur = this.state.schoolTroops.get(player.schoolId) || 0;
        this.state.schoolTroops.set(player.schoolId, cur + added);
        this.syncProfile(client, studentId);
      }
    });

    // 10. dev_spawn_bastion
    this.registerHandler("dev_spawn_bastion", (client, data: { schoolId?: string, x?: number, y?: number }) => {
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
          this.clusterEngine.setTile(tx, ty, this.getSchoolNumericId(schoolId), 3, 100);
        }
      }
      this.handleClusterUpdate(schoolId, startX, startY);
    }, { validateCoords: true });

    // 11. dev_spawn_mega_emblem
    this.registerHandler("dev_spawn_mega_emblem", (client, data: { schoolId?: string, x?: number, y?: number }) => {
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
          this.clusterEngine.setTile(tx, ty, this.getSchoolNumericId(schoolId), 3, 100);
        }
      }
      this.handleClusterUpdate(schoolId, startX, startY);
    }, { validateCoords: true });

    // 12. dev_breach_cluster
    this.registerHandler("dev_breach_cluster", (client, data: { schoolId?: string }) => {
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
             
             if (tile && this.tileHasKnowledge(tile, schoolId)) {
                tile.knowledge.delete(schoolId);
                projectKnowledge(tile);
                if (!tile.knowledge.size) { tile.defenseTier = 0; tile.hp = 0; }
                this.publishKnowledge(tile);
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
    this.registerHandler("dev_max_fortify_all", (client, data: { schoolId?: string }) => {
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
    this.registerHandler("dev_add_keys", (client, data: {
      aspire?: number; nitro?: number; predator?: number;
      silver?: number; gold?: number; platinum?: number;
    }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        if (data.aspire) this.profileManager.addKeys(studentId, "aspire", data.aspire);
        if (data.nitro) this.profileManager.addKeys(studentId, "nitro", data.nitro);
        if (data.predator) this.profileManager.addKeys(studentId, "predator", data.predator);
        if (data.silver) this.profileManager.addKeys(studentId, "silver", data.silver);
        if (data.gold) this.profileManager.addKeys(studentId, "gold", data.gold);
        if (data.platinum) this.profileManager.addKeys(studentId, "platinum", data.platinum);

        const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
        player.aspireKeys = profile.aspireKeys;
        player.nitroKeys = profile.nitroKeys;
        player.predatorKeys = profile.predatorKeys;
        this.syncProfile(client, studentId);
      }
    });

    // 14b. dev_add_crystals
    this.registerHandler("dev_add_crystals", (client, data: { amount?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        const added = data.amount || 10;
        player.crystals = this.profileManager.addCrystals(studentId, added);
        this.syncProfile(client, studentId);
      }
    });

    // 15. dev_reset_unistop_cooldown
    this.registerHandler("dev_reset_unistop_cooldown", (client, data: { stopId: string }) => {
      const stop = this.state.unistops.get(data.stopId);
      if (stop) {
        stop.cooldownUntil = 0;
      }
      const player = this.state.players.get(client.sessionId);
      if (player && data?.stopId) {
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
        profile.unistopCooldowns.delete(data.stopId);
        this.syncProfile(client, studentId);
      }
    });

    // 15b. dev_reset_cooldowns (clears player guessCooldowns and all unistop cooldowns)
    this.registerHandler("dev_reset_cooldowns", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        const profile = this.profileManager.getOrCreateProfile(studentId, player.schoolId);
        profile.guessCooldowns.clear();
        profile.unistopCooldowns.clear();
        player.guessCooldowns.clear();
        this.syncProfile(client, studentId);
      }
      this.state.unistops.forEach((stop) => {
        stop.cooldownUntil = 0;
      });
      client.send("dev_reset_cooldowns_ack", { success: true });
    });

    // 16. dev_set_weekly_points
    this.registerHandler("dev_set_weekly_points", (client, data: { hasWeeklyRunningPoints: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.hasWeeklyRunningPoints = Boolean(data.hasWeeklyRunningPoints);
        const studentId = (player.email || client.sessionId).toLowerCase().trim();
        this.syncProfile(client, studentId);
      }
    });
  }

  onJoin(client: Client, options: any) {
    const isDevAllowed = process.env.ALLOW_DEV === "true";
    const player = new PlayerState();
    player.id = client.sessionId;

    const email = (options?.email || "").trim().toLowerCase();
    const studentId = email || client.sessionId;

    if (email) {
      this.playerEmails.set(client.sessionId, email);
    }
    if (options?.adminKey) {
      this.clientAdminKeys.set(client.sessionId, String(options.adminKey));
    }

    const mode = isDevAllowed
      ? (options?.mode === "dev" ? "dev" : (email ? "normal" : (options?.mode || "dev")))
      : "normal";
    const emailSchool = email ? getSchoolIdFromEmail(email) : null;
    const requestedSchool = options?.schoolId;

    let targetSchool = "hcmut";
    if (emailSchool && SCHOOL_ROSTER[emailSchool]) {
      targetSchool = emailSchool;
    } else if (requestedSchool && SCHOOL_ROSTER[requestedSchool]) {
      targetSchool = requestedSchool;
    }

    // Nạp/tạo profile
    const profile = this.profileManager.getOrCreateProfile(studentId, targetSchool);

    // Một kết nối duy nhất per studentId
    const existingSession = this.activeStudentSessions.get(studentId);
    if (existingSession && existingSession.sessionId !== client.sessionId) {
      try {
        existingSession.client.send("session_replaced", { message: "Tài khoản đã đăng nhập ở nơi khác" });
        existingSession.client.leave(4001, "Session replaced");
      } catch (_) {}
    }
    this.activeStudentSessions.set(studentId, { client, sessionId: client.sessionId });

    player.email = email;
    player.displayName = maskEmail(email);
    player.schoolId = targetSchool;
    player.mode = mode;
    player.isLockedSchool = mode === "normal" && !!emailSchool;

    // Running points: 1 km = 1 point
    // When ALLOW_DEV is disabled (default), ignores client-supplied starting points, crystals, keys
    let initialPoints = 0;
    if (isDevAllowed) {
      initialPoints = typeof options?.points === "number" && options.points >= 0
        ? options.points
        : (typeof options?.km === "number" && options.km >= 0 ? options.km : 500);
      this.runningPointsProvider.setTotalPoints(studentId, initialPoints);
      profile.pointsSpent = 0;
    } else {
      initialPoints = 0;
    }

    player.personalTroops = initialPoints;
    player.currentRole = (options?.role && ["assault", "fortify", "support"].includes(options.role))
      ? options.role
      : "assault";

    const hasWeeklyPoints = isDevAllowed
      ? Boolean(
          options?.hasWeeklyRunningPoints !== undefined
            ? options.hasWeeklyRunningPoints
            : (typeof options?.weeklyPoints === "number" && options.weeklyPoints > 0) ||
              (typeof options?.weeklyKm === "number" && options.weeklyKm > 0) ||
              (typeof options?.points === "number" && options.points > 0) ||
              (typeof options?.km === "number" && options.km > 0)
        )
      : false;
    player.hasWeeklyRunningPoints = hasWeeklyPoints;

    if (isDevAllowed) {
      if (typeof options?.crystals === "number") profile.crystals = options.crystals;
      else if (typeof options?.charcoal === "number") profile.crystals = options.charcoal;
      if (typeof options?.aspireKeys === "number") profile.aspireKeys = options.aspireKeys;
      else if (typeof options?.silverKeys === "number") profile.aspireKeys = options.silverKeys;
      if (typeof options?.nitroKeys === "number") profile.nitroKeys = options.nitroKeys;
      else if (typeof options?.goldKeys === "number") profile.nitroKeys = options.goldKeys;
      if (typeof options?.predatorKeys === "number") profile.predatorKeys = options.predatorKeys;
      else if (typeof options?.platinumKeys === "number") profile.predatorKeys = options.platinumKeys;
    } else {
      profile.crystals = 0;
      profile.aspireKeys = 0;
      profile.nitroKeys = 0;
      profile.predatorKeys = 0;
    }

    player.crystals = profile.crystals;
    player.aspireKeys = profile.aspireKeys;
    player.nitroKeys = profile.nitroKeys;
    player.predatorKeys = profile.predatorKeys;

    for (const [k, v] of profile.guessCooldowns.entries()) {
      if (v > Date.now()) {
        player.guessCooldowns.set(k, v);
      }
    }

    this.state.players.set(client.sessionId, player);

    // Sync to school troops if needed
    const curTroops = this.state.schoolTroops.get(player.schoolId) || 0;
    if (curTroops < initialPoints) {
      this.state.schoolTroops.set(player.schoolId, initialPoints);
    }

    // Data-plane snap FIRST (before any live batches)
    this.landData.sendSnap((type, payload) => client.send(type, payload));

    // Send profile sync immediately to this client
    this.syncProfile(client, studentId, true);

    client.send("active_clusters_sync", {
      bastions: Array.from(this.activeBastions.values()),
      megaEmblems: Array.from(this.activeMegaEmblems.values())
    });

    client.send("knowledge_sync", { tiles: Array.from(this.state.claimedTiles.values())
      .filter(tile => { if (this.landmarkTileMap.has(`${tile.x},${tile.y}`)) return false; initializeKnowledge(tile, Date.now()); if (pruneKnowledge(tile, Date.now(), ...this.decayTiming())) this.publishKnowledge(tile); this.updateKnowledgeCounts(tile); return tile.isShared; })
      .map(tile => ({ x: tile.x, y: tile.y, schools: Array.from(tile.knowledge.keys()).sort() })) });

    this.devLog(
      `[CampusRoom] Player joined: ${client.sessionId} | School: ${player.schoolId} | Mode: ${player.mode} | Locked: ${player.isLockedSchool} | Points: ${player.personalTroops} | Name: ${player.displayName}`
    );
  }

  onLeave(client: Client, consented?: boolean) {
    const isRealClient = Boolean(this.clients && this.clients.includes(client));
    if (!consented && isRealClient) {
      return this.allowReconnection(client, 60)
        .then(() => {
          // Reconnected!
        })
        .catch(() => {
          this.cleanupClient(client, consented);
        });
    }
    this.cleanupClient(client, consented);
  }

  private cleanupClient(client: Client, consented?: boolean) {
    const email = this.playerEmails.get(client.sessionId);
    if (email) {
      const studentId = email.toLowerCase().trim();
      const active = this.activeStudentSessions.get(studentId);
      if (active && active.sessionId === client.sessionId) {
        this.activeStudentSessions.delete(studentId);
      }
    } else {
      const active = this.activeStudentSessions.get(client.sessionId);
      if (active && active.sessionId === client.sessionId) {
        this.activeStudentSessions.delete(client.sessionId);
      }
    }

    this.playerEmails.delete(client.sessionId);
    this.clientAdminKeys.delete(client.sessionId);
    this.rateLimiter.removeClient(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.profileSyncTimers.has(client.sessionId)) {
      clearTimeout(this.profileSyncTimers.get(client.sessionId)!);
      this.profileSyncTimers.delete(client.sessionId);
    }
    this.devLog(`[CampusRoom] Player left: ${client.sessionId} (consented: ${consented})`);
  }

  onDispose() {
    if (this.gameInterval) {
      this.gameInterval.clear();
    }
    if (this.landFlushInterval) {
      this.landFlushInterval.clear();
    }
    this.profileSyncTimers.forEach((timer) => clearTimeout(timer));
    this.profileSyncTimers.clear();
    this.devLog("[CampusRoom] Disposed");
  }
}
