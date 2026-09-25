import { Client, Room } from "colyseus.js";
import { ChunkGridManager } from "../engine/chunkGridManager";
import { ModelLoader } from "../engine/modelLoader";
import { NatureGridManager } from "../engine/natureGridManager";
import { getSchoolColor } from "../../../shared/constants/schools";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { PlayerRole } from "../../../shared/types";
import {
  registerLeveledZone,
  getFootprintFoundationHeight,
  isInsideLeveledZone
} from "../engine/terrainNoise";

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
}

export class ColyseusClient {
  private client: Client;
  public room?: Room;
  public territoryCounts: Record<string, number> = {};
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

    // Listen to Landmark additions
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

    room.state.landmarks.onChange((lm: any) => {
      if (lm.ownerId) {
        this.modelLoader.updateLandmarkOwner(lm.landmarkKey, lm.ownerId);
      }
    });

    // Listen to Claimed Tiles (Sparse optimization)
    room.state.claimedTiles.onAdd((tile: any, key: string) => {
      const color = getSchoolColor(tile.ownerId);
      this.chunkGridManager.setTileColor(tile.x, tile.y, color, this.isInitialSyncDone);
      if (!isInsideLeveledZone(tile.x, tile.y)) {
        this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);
      }

      this.territoryCounts[tile.ownerId] = (this.territoryCounts[tile.ownerId] || 0) + 1;
      this.triggerTerritoryUpdate();

      if (typeof tile.onChange === "function") {
        tile.onChange(() => {
          const c = getSchoolColor(tile.ownerId);
          this.chunkGridManager.setTileColor(tile.x, tile.y, c, this.isInitialSyncDone);
          if (!isInsideLeveledZone(tile.x, tile.y)) {
            this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);
          }
        });
      }
    });

    room.state.claimedTiles.onChange((tile: any, key: string) => {
      const color = getSchoolColor(tile.ownerId);
      this.chunkGridManager.setTileColor(tile.x, tile.y, color, this.isInitialSyncDone);
      if (!isInsideLeveledZone(tile.x, tile.y)) {
        this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);
      }
    });

    room.state.claimedTiles.onRemove((tile: any, key: string) => {
      this.chunkGridManager.resetTerrainColor(tile.x, tile.y);
      if (this.territoryCounts[tile.ownerId] && this.territoryCounts[tile.ownerId] > 0) {
        this.territoryCounts[tile.ownerId]--;
      }
      this.triggerTerritoryUpdate();
    });

    // Listen to School Troops
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

  // Tactical Actions
  public claimTile(x: number, y: number) {
    this.room?.send("claim_tile", { x, y });
  }

  public fortifyTile(x: number, y: number) {
    this.room?.send("fortify_tile", { x, y });
  }

  public setSimulationSpeed(speed: number) {
    this.room?.send("set_simulation_speed", { speed });
  }

  public bulkDispatch(amount: number) {
    this.room?.send("bulk_dispatch", { amount });
  }

  public softReset() {
    this.territoryCounts = {};
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
