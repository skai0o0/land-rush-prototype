import { Client, Room } from "colyseus.js";
import { ChunkGridManager } from "../engine/chunkGridManager";
import { ModelLoader } from "../engine/modelLoader";
import { NatureGridManager } from "../engine/natureGridManager";
import { getSchoolColor, SCHOOL_IDS } from "../../../shared/constants/schools";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { PlayerRole } from "../../../shared/types";
import {
  registerLeveledZone,
  getFootprintFoundationHeight,
  isInsideLeveledZone
} from "../engine/terrainNoise";
import { ClientLandSync, DirtyTileChange } from "../../../shared/land/clientSync";
import { MAP_WIDTH, CombatTile } from "../../../shared/land/landState";
import {
  decodeServerFrame,
  makeClaim,
  makeFortify,
  ServerFrame,
  SnapFrame,
  OwnBatchFrame,
  CombatFrame,
  AckFrame,
  LAND_FRAME_CHANNEL
} from "../../../shared/land/protocol";

// Re-export so UI modules share the single protocol constant.
export { LAND_FRAME_CHANNEL };

export interface NetworkCallbacks {
  onConnected?: (room: Room) => void;
  onDisconnected?: (code: number) => void;
  onStateChange?: (state: any) => void;
  onSchoolTroopsChange?: (schoolId: string, troops: number) => void;
  onTerritoryChange?: (territoryCounts: Record<string, number>) => void;
  onHQAdded?: (hq: { schoolId: string; x: number; y: number }) => void;
  onLandmarkAdded?: (lm: { landmarkKey: string; x: number; y: number; ownerId: string }) => void;
  onError?: (message: string) => void;
  onBastionFormed?: (data: { schoolId: string; size: number; borderTiles: any[] }) => void;
  onBastionBroken?: (data: { schoolId: string; clusterId?: string }) => void;
  onMegaEmblemFormed?: (data: { schoolId: string; boundingBox: number[] }) => void;
  onMegaEmblemBroken?: (data: { schoolId: string; clusterId?: string }) => void;
  onActiveClustersSync?: (data: { bastions: any[]; megaEmblems: any[] }) => void;
  onDevBreachSuccess?: (data: { targetX: number; targetY: number; destroyedCount?: number }) => void;
  /** Fired after snap/own_batch/combat so UI can refresh owner/combat overlays. */
  onLandSync?: (info: { kind: "snap" | "own_batch" | "combat"; dirtyTiles?: DirtyTileChange[] }) => void;
  onLandAck?: (ack: AckFrame) => void;
}

export class ColyseusClient {
  private client: Client;
  public room?: Room;
  public territoryCounts: Record<string, number> = {};
  /** Dense ownership bytes + sparse combat overlay (no 1e6 tile objects). */
  public readonly landSync = new ClientLandSync();
  private lastJoinOptions: any = { schoolId: "hcmut" };
  private isReconnecting = false;
  private territoryDebounceTimer: any = null;
  private isInitialSyncDone = false;

  constructor(
    private chunkGridManager: ChunkGridManager,
    private modelLoader: ModelLoader,
    private natureGridManager: NatureGridManager,
    private callbacks: NetworkCallbacks
  ) {
    // Dynamic endpoint support:
    // 1. Env override via VITE_COLYSEUS_URL
    // 2. Local dev server (port 5173) -> connects to ws://localhost:2567
    // 3. Cloudflare Tunnel / Production (port 80/443/custom domain) -> connects to same host/protocol
    const envUrl = (import.meta as any).env?.VITE_COLYSEUS_URL;
    let endpoint: string;

    if (envUrl) {
      endpoint = envUrl;
    } else if (window.location.port === "5173") {
      endpoint = `ws://${window.location.hostname || "localhost"}:2567`;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      endpoint = `${protocol}://${window.location.host}`;
    }

    console.log(`[ColyseusClient] Initializing endpoint: ${endpoint}`);
    this.client = new Client(endpoint);
  }

  public async connect(
    options: { schoolId?: string; email?: string; mode?: "normal" | "dev"; points?: number; km?: number } | string = "hcmut",
    maxRetries = 20,
    retryDelay = 1000
  ): Promise<Room> {
    let attempt = 0;
    const joinOptions = typeof options === "string" ? { schoolId: options } : options;
    this.lastJoinOptions = { ...joinOptions };
    this.territoryCounts = {};

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[ColyseusClient] Connecting to campus_room (attempt ${attempt}/${maxRetries})...`, joinOptions);

        this.room = await this.client.joinOrCreate("campus_room", joinOptions);

        console.log(`[ColyseusClient] Connected successfully! Session ID: ${this.room.sessionId}`);
        if (this.callbacks.onConnected) {
          this.callbacks.onConnected(this.room);
        }

        this.setupStateListeners();
        this.isInitialSyncDone = false;
        setTimeout(() => {
          this.isInitialSyncDone = true;
        }, 1200);
        return this.room;
      } catch (err) {
        if (attempt >= maxRetries) {
          console.error(`[ColyseusClient] All ${maxRetries} connection attempts failed.`);
          throw err;
        }
        console.warn(`[ColyseusClient] Server not ready yet. Retrying in ${retryDelay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
    throw new Error("Could not connect to Colyseus server");
  }

  private setupStateListeners() {
    if (!this.room) return;

    const room = this.room;

    // LandState data plane (S2.4): register FIRST so snap/own_batch/combat/ack
    // always attach even if control-plane schema maps are empty or missing.
    const handleLandPayload = (payload: unknown) => {
      const frame = decodeServerFrame(payload as any);
      if (!frame) return;
      this.handleLandFrame(frame);
    };
    room.onMessage(LAND_FRAME_CHANNEL, handleLandPayload);
    room.onMessage("snap", handleLandPayload);
    room.onMessage("own_batch", handleLandPayload);
    room.onMessage("combat", handleLandPayload);
    room.onMessage("ack", handleLandPayload);

    const collectedHQs: { x: number; y: number }[] = [];
    const collectedLMs: { x: number; y: number; width: number; height: number }[] = [];
    const processedHQs = new Set<string>();
    const processedLMs = new Set<string>();

    let exclusionDebounceTimer: any = null;
    const triggerExclusionUpdate = () => {
      clearTimeout(exclusionDebounceTimer);
      exclusionDebounceTimer = setTimeout(() => {
        this.natureGridManager.setExclusionZones(collectedHQs, collectedLMs);
      }, 50);
    };

    // Listen to HQ additions
    if (room.state.hqs && typeof room.state.hqs.onAdd === "function") {
      room.state.hqs.onAdd((hq: any, key: string) => {
        const hqKey = key || hq.schoolId;
        if (!processedHQs.has(hqKey)) {
          processedHQs.add(hqKey);
          collectedHQs.push({ x: hq.x, y: hq.y });
        }

        // HQ leveling: diameter ~20 tiles (radius 10) + 2 tiles apron
        const hqMinX = hq.x - 12;
        const hqMaxX = hq.x + 12;
        const hqMinY = hq.y - 12;
        const hqMaxY = hq.y + 12;
        const foundationHeight = getFootprintFoundationHeight(hqMinX, hqMaxX, hqMinY, hqMaxY);
        registerLeveledZone(`hq_${hq.schoolId}`, hqMinX, hqMaxX, hqMinY, hqMaxY, foundationHeight);
        this.chunkGridManager.flattenArea(hqMinX, hqMaxX, hqMinY, hqMaxY, foundationHeight);

        this.modelLoader.spawnHQ(hq.schoolId, hq.x, hq.y);

        if (this.callbacks.onHQAdded) {
          this.callbacks.onHQAdded({ schoolId: hq.schoolId, x: hq.x, y: hq.y });
        }

        triggerExclusionUpdate();
      });
    }

    // Listen to Landmark additions
    if (room.state.landmarks && typeof room.state.landmarks.onAdd === "function") {
      room.state.landmarks.onAdd((lm: any, key: string) => {
        const lmKey = key || lm.landmarkKey;
        const config = LANDMARK_ROSTER[lm.landmarkKey];
        const w = config?.footprint.width || 14;
        const h = config?.footprint.height || 12;

        if (!processedLMs.has(lmKey)) {
          processedLMs.add(lmKey);
          collectedLMs.push({ x: lm.x, y: lm.y, width: w, height: h });
        }

        // Landmark leveling: footprint + 1 tile apron margin
        const lmMinX = lm.x - 1;
        const lmMaxX = lm.x + w;
        const lmMinY = lm.y - 1;
        const lmMaxY = lm.y + h;
        const foundationHeight = getFootprintFoundationHeight(lmMinX, lmMaxX, lmMinY, lmMaxY);
        registerLeveledZone(`lm_${lm.landmarkKey}`, lmMinX, lmMaxX, lmMinY, lmMaxY, foundationHeight);
        this.chunkGridManager.flattenArea(lmMinX, lmMaxX, lmMinY, lmMaxY, foundationHeight);

        this.modelLoader.spawnLandmark(lm.landmarkKey, lm.x, lm.y, lm.ownerId);

        if (this.callbacks.onLandmarkAdded) {
          this.callbacks.onLandmarkAdded({ landmarkKey: lm.landmarkKey, x: lm.x, y: lm.y, ownerId: lm.ownerId });
        }

        triggerExclusionUpdate();

        // Listen for ownership changes on this landmark
        if (typeof lm.onChange === "function") {
          lm.onChange(() => {
            if (lm.ownerId) {
              this.modelLoader.updateLandmarkOwner(lm.landmarkKey, lm.ownerId);
            }
          });
        }
      });

      if (typeof room.state.landmarks.onChange === "function") {
        room.state.landmarks.onChange((lm: any) => {
          if (lm.ownerId) {
            this.modelLoader.updateLandmarkOwner(lm.landmarkKey, lm.ownerId);
          }
        });
      }
    }

    // NOTE: claimedTiles is intentionally NOT networked (no @type on GameState).
    // Ownership/HP/defense paint and territory counts come from land frames only.

    // Listen to School Troops
    if (room.state.schoolTroops && typeof room.state.schoolTroops.onAdd === "function") {
      room.state.schoolTroops.onAdd((troops: number, schoolId: string) => {
        if (this.callbacks.onSchoolTroopsChange) {
          this.callbacks.onSchoolTroopsChange(schoolId, troops);
        }
      });

      room.state.schoolTroops.onChange((troops: number, schoolId: string) => {
        if (this.callbacks.onSchoolTroopsChange) {
          this.callbacks.onSchoolTroopsChange(schoolId, troops);
        }
      });
    }

    // Listen to Errors
    room.onMessage("error", (data: { message: string }) => {
      if (this.callbacks.onError) {
        this.callbacks.onError(data.message);
      }
    });

    // Listen to Bastion & Mega Emblem events
    room.onMessage("bastion_formed", (data: { schoolId: string; size: number; borderTiles: any[] }) => {
      if (this.callbacks.onBastionFormed) {
        this.callbacks.onBastionFormed(data);
      }
    });

    room.onMessage("bastion_broken", (data: { schoolId: string; clusterId?: string }) => {
      if (this.callbacks.onBastionBroken) {
        this.callbacks.onBastionBroken(data);
      }
    });

    room.onMessage("mega_emblem_formed", (data: { schoolId: string; boundingBox: number[] }) => {
      if (this.callbacks.onMegaEmblemFormed) {
        this.callbacks.onMegaEmblemFormed(data);
      }
    });

    room.onMessage("mega_emblem_broken", (data: { schoolId: string; clusterId?: string }) => {
      if (this.callbacks.onMegaEmblemBroken) {
        this.callbacks.onMegaEmblemBroken(data);
      }
    });

    room.onMessage("active_clusters_sync", (data: { bastions: any[]; megaEmblems: any[] }) => {
      if (this.callbacks.onActiveClustersSync) {
        this.callbacks.onActiveClustersSync(data);
      }
    });

    room.onMessage("dev_breach_success", (data: { targetX: number; targetY: number; destroyedCount?: number }) => {
      if (this.callbacks.onDevBreachSuccess) {
        this.callbacks.onDevBreachSuccess(data);
      }
    });

    // Listen to room disconnect
    room.onLeave((code) => {
      console.warn(`[ColyseusClient] Disconnected from room (code ${code}).`);
      if (this.callbacks.onDisconnected) {
        this.callbacks.onDisconnected(code);
      }
      if (code !== 1000 && !this.isReconnecting) {
        this.isReconnecting = true;
        setTimeout(() => {
          this.isReconnecting = false;
          this.connect(this.lastJoinOptions).catch((e) => console.error("[ColyseusClient] Reconnect failed:", e));
        }, 2000);
      }
    });
  }

  private triggerTerritoryUpdate() {
    clearTimeout(this.territoryDebounceTimer);
    this.territoryDebounceTimer = setTimeout(() => {
      if (this.callbacks.onTerritoryChange) {
        this.callbacks.onTerritoryChange({ ...this.territoryCounts });
      }
    }, 80);
  }

  // ── LandState data plane (T4 / S2.4) ───────────────────────────────────────

  private handleLandFrame(frame: ServerFrame) {
    switch (frame.t) {
      case "snap":
        this.applySnapFrame(frame);
        break;
      case "own_batch":
        this.applyOwnBatchFrame(frame);
        break;
      case "combat":
        this.applyCombatFrame(frame);
        break;
      case "ack":
        if (this.callbacks.onLandAck) this.callbacks.onLandAck(frame);
        break;
    }
  }

  /** Full ownership resync: fill local Uint8Array, repaint owned tiles only. */
  private applySnapFrame(frame: SnapFrame) {
    try {
      this.landSync.applySnap(frame);
    } catch (e) {
      console.error("[ColyseusClient] snap rejected:", e);
      return;
    }

    this.rebuildTerritoryCountsFromLand();
    this.paintAllOwnedTilesFromLand();

    if (this.callbacks.onLandSync) {
      this.callbacks.onLandSync({ kind: "snap" });
    }
  }

  /**
   * Coalesced ownership delta: write local bytes, then repaint ONLY the
   * tiles that actually changed (their chunks get instanceColor.needsUpdate
   * via setTileColor / resetTerrainColor — never a whole-map repaint).
   */
  private applyOwnBatchFrame(frame: OwnBatchFrame) {
    const result = this.landSync.applyOwnBatch(frame);
    if (!result.applied) {
      // Stale (seq <= lastSnapSeq) or no-op batch — drop without touching render.
      return;
    }

    for (const change of result.dirtyTiles) {
      this.paintLandTile(change);
    }

    this.rebuildTerritoryCountsFromLand();
    this.triggerTerritoryUpdate();

    if (this.callbacks.onLandSync) {
      this.callbacks.onLandSync({ kind: "own_batch", dirtyTiles: result.dirtyTiles });
    }
  }

  /**
   * Sparse HP/defense overlay: update the combat map tooltips/stats read from,
   * and nudge elevation for tier changes on those tiles only.
   */
  private applyCombatFrame(frame: CombatFrame) {
    const result = this.landSync.applyCombat(frame);
    if (!result.applied) return;

    for (const tile of result.tiles) {
      const x = tile.i % MAP_WIDTH;
      const y = (tile.i / MAP_WIDTH) | 0;
      if (!isInsideLeveledZone(x, y)) {
        this.chunkGridManager.setTileElevation(x, y, (tile.tier || 0) * 0.15);
      }
    }

    if (this.callbacks.onLandSync) {
      this.callbacks.onLandSync({ kind: "combat" });
    }
  }

  private paintLandTile(change: DirtyTileChange) {
    if (change.owner === 0) {
      this.chunkGridManager.resetTerrainColor(change.x, change.y);
      return;
    }
    const schoolId = SCHOOL_IDS[change.owner - 1];
    const color = getSchoolColor(schoolId || "");
    this.chunkGridManager.setTileColor(change.x, change.y, color, this.isInitialSyncDone);
    const combat = this.landSync.getCombatAt(change.y * MAP_WIDTH + change.x);
    if (combat && !isInsideLeveledZone(change.x, change.y)) {
      this.chunkGridManager.setTileElevation(change.x, change.y, (combat.defenseTier || 0) * 0.15);
    }
  }

  /** Snapshot paint: walk dense bytes once, color only non-zero owners. */
  private paintAllOwnedTilesFromLand() {
    const owner = this.landSync.owner;
    const w = this.landSync.width;
    const h = this.landSync.height;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const o = owner[row + x];
        if (o === 0) continue;
        const schoolId = SCHOOL_IDS[o - 1];
        this.chunkGridManager.setTileColor(x, y, getSchoolColor(schoolId || ""), false);
        const combat = this.landSync.combat.get(row + x);
        if (combat && !isInsideLeveledZone(x, y)) {
          this.chunkGridManager.setTileElevation(x, y, (combat.defenseTier || 0) * 0.15);
        }
      }
    }
  }

  private rebuildTerritoryCountsFromLand() {
    // Incremental counts (O(owners)) — never a 1e6 scan per batch.
    const counts = this.landSync.countOwners();
    const next: Record<string, number> = {};
    for (const key of Object.keys(counts)) {
      const o = Number(key);
      const schoolId = SCHOOL_IDS[o - 1];
      if (schoolId) next[schoolId] = counts[o];
    }
    this.territoryCounts = next;
  }

  /** Owner bytes for minimap / tooltips (dense, no tile objects). */
  public getLandOwner(x: number, y: number): number {
    return this.landSync.getOwner(x, y);
  }

  public getLandCombat(x: number, y: number) {
    return this.landSync.getCombat(x, y);
  }

  /**
   * Schema claimedTiles fallback — only used when the field still exists and
   * exposes .get (i.e. a build that re-typed it). Prefer landSync first.
   */
  private getSchemaTile(x: number, y: number): any | undefined {
    const map = (this.room?.state as any)?.claimedTiles;
    if (!map || typeof map.get !== "function") return undefined;
    return map.get(`${x},${y}`);
  }

  /** School id for a tile via land overlay; schema fallback only if typed. */
  public getTileOwnerSchoolId(x: number, y: number): string | null {
    const landOwnerNum = this.landSync.getOwner(x, y);
    if (landOwnerNum > 0) {
      return SCHOOL_IDS[landOwnerNum - 1] ?? null;
    }
    const schemaTile = this.getSchemaTile(x, y);
    return schemaTile?.ownerId || null;
  }

  /** Combat info (hp/maxHp/defenseTier) via land overlay; schema fallback only if typed. */
  public getTileCombatInfo(x: number, y: number): { hp: number; maxHp: number; defenseTier: number } | undefined {
    const landCombat = this.landSync.getCombat(x, y);
    if (landCombat) return landCombat;
    const schemaTile = this.getSchemaTile(x, y);
    if (!schemaTile) return undefined;
    return { hp: schemaTile.hp, maxHp: schemaTile.maxHp, defenseTier: schemaTile.defenseTier };
  }

  /** True if any 4-neighbour is owned by schoolId (land overlay first). */
  public isAdjacentToSchool(x: number, y: number, schoolId: string): boolean {
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (this.getTileOwnerSchoolId(nx, ny) === schoolId) return true;
    }
    return false;
  }

  // Tactical Actions
  // T3 CampusRoom routes "claim_tile" | "claim" | LAND_FRAME_CHANNEL all into the
  // same handler — send exactly ONE frame per action to avoid double-processing.
  public claimTile(x: number, y: number) {
    this.room?.send(LAND_FRAME_CHANNEL, makeClaim(x, y));
  }

  public fortifyTile(x: number, y: number) {
    this.room?.send(LAND_FRAME_CHANNEL, makeFortify(x, y));
  }

  public setSimulationSpeed(speed: number) {
    this.room?.send("set_simulation_speed", { speed });
  }

  public bulkDispatch(amount: number) {
    this.room?.send("bulk_dispatch", { amount });
  }

  public softReset() {
    this.territoryCounts = {};
    this.landSync.reset();
    this.room?.send("soft_reset");
  }

  public selectSchool(schoolId: string) {
    this.room?.send("select_school", { schoolId });
  }

  public loginStudent(email: string, schoolId: string, points: number, mode?: string) {
    this.room?.send("login_student", { email, schoolId, points, mode });
  }

  public setRole(role: PlayerRole) {
    this.room?.send("set_role", { role });
  }

  public toggleBots(enabled: boolean) {
    this.room?.send("toggle_bots", { enabled });
  }

  public addPoints(amount: number) {
    this.room?.send("add_points", { amount });
  }
}
