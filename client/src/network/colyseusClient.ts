import { Client, Room } from "colyseus.js";
import { ChunkGridManager } from "../engine/chunkGridManager";
import { ModelLoader } from "../engine/modelLoader";
import { NatureGridManager } from "../engine/natureGridManager";
import { getSchoolColor } from "../../../shared/constants/schools";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { PlayerRole } from "../../../shared/types";

export interface NetworkCallbacks {
  onConnected?: (room: Room) => void;
  onStateChange?: (state: any) => void;
  onSchoolTroopsChange?: (schoolId: string, troops: number) => void;
  onTerritoryChange?: (territoryCounts: Record<string, number>) => void;
  onHQAdded?: (hq: { schoolId: string; x: number; y: number }) => void;
  onLandmarkAdded?: (lm: { landmarkKey: string; x: number; y: number; ownerId: string }) => void;
  onError?: (message: string) => void;
}

export class ColyseusClient {
  private client: Client;
  public room?: Room;
  public territoryCounts: Record<string, number> = {};

  constructor(
    private chunkGridManager: ChunkGridManager,
    private modelLoader: ModelLoader,
    private natureGridManager: NatureGridManager,
    private callbacks: NetworkCallbacks
  ) {
    // Dynamic endpoint support (connects to same hostname port 2567)
    const host = window.location.hostname || "localhost";
    const port = 2567;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const endpoint = `${protocol}://${host}:${port}`;

    this.client = new Client(endpoint);
  }

  public async connect(selectedSchool = "hcmut"): Promise<Room> {
    console.log("[ColyseusClient] Connecting to campus_room...");

    this.room = await this.client.joinOrCreate("campus_room", {
      schoolId: selectedSchool
    });

    console.log(`[ColyseusClient] Connected successfully! Session ID: ${this.room.sessionId}`);
    if (this.callbacks.onConnected) {
      this.callbacks.onConnected(this.room);
    }

    this.setupStateListeners();
    return this.room;
  }

  private setupStateListeners() {
    if (!this.room) return;

    const room = this.room;
    const collectedHQs: { x: number; y: number }[] = [];
    const collectedLMs: { x: number; y: number; width: number; height: number }[] = [];
    const processedHQs = new Set<string>();
    const processedLMs = new Set<string>();

    // Listen to HQ additions
    room.state.hqs.onAdd((hq: any, key: string) => {
      const hqKey = key || hq.schoolId;
      if (!processedHQs.has(hqKey)) {
        processedHQs.add(hqKey);
        collectedHQs.push({ x: hq.x, y: hq.y });
      }
      this.modelLoader.spawnHQ(hq.schoolId, hq.x, hq.y);

      if (this.callbacks.onHQAdded) {
        this.callbacks.onHQAdded({ schoolId: hq.schoolId, x: hq.x, y: hq.y });
      }

      if (collectedHQs.length >= 10 && collectedLMs.length >= 10) {
        this.natureGridManager.setExclusionZones(collectedHQs, collectedLMs);
      }
    });

    // Listen to Landmark additions
    room.state.landmarks.onAdd((lm: any, key: string) => {
      const lmKey = key || lm.landmarkKey;
      if (!processedLMs.has(lmKey)) {
        processedLMs.add(lmKey);
        const config = LANDMARK_ROSTER[lm.landmarkKey];
        const w = config?.footprint.width || 6;
        const h = config?.footprint.height || 6;
        collectedLMs.push({ x: lm.x, y: lm.y, width: w, height: h });
      }

      this.modelLoader.spawnLandmark(lm.landmarkKey, lm.x, lm.y, lm.ownerId);

      if (this.callbacks.onLandmarkAdded) {
        this.callbacks.onLandmarkAdded({ landmarkKey: lm.landmarkKey, x: lm.x, y: lm.y, ownerId: lm.ownerId });
      }

      if (collectedHQs.length >= 10 && collectedLMs.length >= 10) {
        this.natureGridManager.setExclusionZones(collectedHQs, collectedLMs);
      }

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
      this.chunkGridManager.setTileColor(tile.x, tile.y, color);
      this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);

      this.territoryCounts[tile.ownerId] = (this.territoryCounts[tile.ownerId] || 0) + 1;
      this.triggerTerritoryUpdate();

      if (typeof tile.onChange === "function") {
        tile.onChange(() => {
          const c = getSchoolColor(tile.ownerId);
          this.chunkGridManager.setTileColor(tile.x, tile.y, c);
          this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);
        });
      }
    });

    room.state.claimedTiles.onChange((tile: any, key: string) => {
      const color = getSchoolColor(tile.ownerId);
      this.chunkGridManager.setTileColor(tile.x, tile.y, color);
      this.chunkGridManager.setTileElevation(tile.x, tile.y, (tile.defenseTier || 0) * 0.15);
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
  }

  private triggerTerritoryUpdate() {
    if (this.callbacks.onTerritoryChange) {
      this.callbacks.onTerritoryChange({ ...this.territoryCounts });
    }
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

  public setRole(role: PlayerRole) {
    this.room?.send("set_role", { role });
  }
}
