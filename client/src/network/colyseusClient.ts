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
import { expandRect, getHQRect, getLandmarkRect } from "../../../shared/constants/footprint";
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
  onLandmarkLit?: (data: { landmarkId: string; schoolId: string; previousSchoolId?: string; fuel?: number; crystals?: number }) => void;
  onBeaconLit?: (data: { landmarkId: string; schoolId: string; previousSchoolId?: string; fuel?: number; crystals?: number }) => void;
  onLandmarkChange?: (lm: any) => void;
  onTileStudied?: (data: { x: number; y: number; schoolId: string; retention: number; lastStudiedAt: number }) => void;
  onUniStopRolled?: (data: any) => void;
  onChestOpened?: (data: any) => void;
  onChestClaimed?: (data: any) => void;
  onRealGiftWon?: (data: any) => void;
  onMapLayoutUpdated?: (data: any) => void;
  onUniStopAdded?: (stop: any) => void;
  onUniStopChange?: (stop: any) => void;
  onChestAdded?: (chest: any) => void;
  onChestChange?: (chest: any) => void;
  onCrystalContributed?: (data: any) => void;
  onLandmarkGuessed?: (data: { landmarkId: string; landmarkName: string; schoolId: string; studentEmail?: string; bonusCrystals: number }) => void;
  onLandmarkGuessResult?: (data: any) => void;
  onTreasureMapReveal?: (data: { chestId: string; x: number; z: number; tier: string }) => void;
  onPlayerStateChange?: (player: any) => void;
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
        const bounds = expandRect(getHQRect(hq.x, hq.y));
        const foundationHeight = getFootprintFoundationHeight(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
        registerLeveledZone(`hq_${hq.schoolId}`, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, foundationHeight);
        this.chunkGridManager.flattenArea(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, foundationHeight);

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
        const lmKey = lm.landmarkKey || key || lm.id;
        const config = LANDMARK_ROSTER[lmKey] || LANDMARK_ROSTER[lmKey?.replace(/^landmark_/, "")];
        const w = config?.footprint?.width || 14;
        const h = config?.footprint?.height || 12;

        if (!processedLMs.has(lmKey)) {
          processedLMs.add(lmKey);
          collectedLMs.push({ x: lm.x, y: lm.y, width: w, height: h });
        }

        // Landmark leveling: footprint + 2 tile apron margin
        const bounds = expandRect(getLandmarkRect(lm.x, lm.y, w, h));
        const foundationHeight = getFootprintFoundationHeight(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
        registerLeveledZone(`lm_${lmKey}`, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, foundationHeight);
        this.chunkGridManager.flattenArea(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, foundationHeight);

        this.modelLoader.spawnLandmark(lmKey, lm.x, lm.y, lm.ownerId);

        if (this.callbacks.onLandmarkAdded) {
          this.callbacks.onLandmarkAdded({ landmarkKey: lmKey, x: lm.x, y: lm.y, ownerId: lm.ownerId });
        }

        triggerExclusionUpdate();

        if (lm.litBySchoolId) {
          this.modelLoader.setLandmarkBonfire(lmKey, lm.litBySchoolId);
        }

        // Listen for ownership & bonfire changes on this landmark
        if (typeof lm.onChange === "function") {
          lm.onChange(() => {
            if (lm.litBySchoolId !== undefined) {
              this.modelLoader.setLandmarkBonfire(lm.landmarkKey, lm.litBySchoolId);
            }
            if (lm.ownerId) {
              this.modelLoader.updateLandmarkOwner(lm.landmarkKey, lm.ownerId);
            }
            if (this.callbacks.onLandmarkChange) {
              this.callbacks.onLandmarkChange(lm);
            }
          });
        }
      });

      if (typeof room.state.landmarks.onChange === "function") {
        room.state.landmarks.onChange((lm: any) => {
          if (lm.litBySchoolId !== undefined) {
            this.modelLoader.setLandmarkBonfire(lm.landmarkKey, lm.litBySchoolId);
          }
          if (lm.ownerId) {
            this.modelLoader.updateLandmarkOwner(lm.landmarkKey, lm.ownerId);
          }
          if (this.callbacks.onLandmarkChange) {
            this.callbacks.onLandmarkChange(lm);
          }
        });
      }
    }

    // Listen to UniStop additions & changes
    if (room.state.unistops && typeof room.state.unistops.onAdd === "function") {
      room.state.unistops.onAdd((stop: any, key: string) => {
        if (this.callbacks.onUniStopAdded) {
          this.callbacks.onUniStopAdded(stop);
        }
        if (typeof stop.onChange === "function") {
          stop.onChange(() => {
            if (this.callbacks.onUniStopChange) {
              this.callbacks.onUniStopChange(stop);
            }
          });
        }
      });

      if (typeof room.state.unistops.onChange === "function") {
        room.state.unistops.onChange((stop: any) => {
          if (this.callbacks.onUniStopChange) {
            this.callbacks.onUniStopChange(stop);
          }
        });
      }
    }

    // Listen to Chest additions & changes
    if (room.state.chests && typeof room.state.chests.onAdd === "function") {
      room.state.chests.onAdd((chest: any, key: string) => {
        if (this.callbacks.onChestAdded) {
          this.callbacks.onChestAdded(chest);
        }
        if (typeof chest.onChange === "function") {
          chest.onChange(() => {
            if (this.callbacks.onChestChange) {
              this.callbacks.onChestChange(chest);
            }
          });
        }
      });

      if (typeof room.state.chests.onChange === "function") {
        room.state.chests.onChange((chest: any) => {
          if (this.callbacks.onChestChange) {
            this.callbacks.onChestChange(chest);
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

    // Listen to Landmark Lit & Beacon Lit events
    const handleLit = (data: { landmarkId: string; schoolId: string; previousSchoolId?: string; fuel?: number; crystals?: number }) => {
      this.modelLoader.setLandmarkBonfire(data.landmarkId, data.schoolId);
      this.modelLoader.updateLandmarkOwner(data.landmarkId, data.schoolId);
      if (this.callbacks.onLandmarkLit) {
        this.callbacks.onLandmarkLit(data as any);
      }
      if (this.callbacks.onBeaconLit) {
        this.callbacks.onBeaconLit(data);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('landmark_lit', { detail: data }));
        window.dispatchEvent(new CustomEvent('beacon_lit', { detail: data }));
      }
    };

    room.onMessage("landmark_lit", handleLit);
    room.onMessage("beacon_lit", handleLit);

    // Listen to Tile Studied events
    room.onMessage("tile_studied", (data: { x: number; y: number; schoolId: string; retention: number; lastStudiedAt: number }) => {
      if (this.callbacks.onTileStudied) {
        this.callbacks.onTileStudied(data);
      }
    });

    // Listen to UniStop Rolled (CS:GO Carousel Loot)
    room.onMessage("unistop_rolled", (data: any) => {
      if (this.callbacks.onUniStopRolled) {
        this.callbacks.onUniStopRolled(data);
      }
    });

    // Listen to Chest Opened (CS:GO Carousel Loot)
    room.onMessage("chest_opened", (data: any) => {
      if (this.callbacks.onChestOpened) {
        this.callbacks.onChestOpened(data);
      }
    });

    // Listen to Chest Claimed broadcast
    room.onMessage("chest_claimed", (data: any) => {
      if (this.callbacks.onChestClaimed) {
        this.callbacks.onChestClaimed(data);
      }
    });

    // Listen to Real Gift Won broadcast
    room.onMessage("real_gift_won", (data: any) => {
      if (this.callbacks.onRealGiftWon) {
        this.callbacks.onRealGiftWon(data);
      }
    });

    // Listen to Map Layout Updated broadcast
    room.onMessage("map_layout_updated", (data: any) => {
      if (this.callbacks.onMapLayoutUpdated) {
        this.callbacks.onMapLayoutUpdated(data);
      }
    });

    // Listen to Crystal Contributed events
    room.onMessage("crystal_contributed", (data: any) => {
      if (this.callbacks.onCrystalContributed) {
        this.callbacks.onCrystalContributed(data);
      }
    });

    // Listen to Landmark Guessed broadcast
    room.onMessage("landmark_guessed", (data: any) => {
      if (this.callbacks.onLandmarkGuessed) {
        this.callbacks.onLandmarkGuessed(data);
      }
    });

    // Listen to Landmark Guess Result
    room.onMessage("landmark_guess_result", (data: any) => {
      if (this.callbacks.onLandmarkGuessResult) {
        this.callbacks.onLandmarkGuessResult(data);
      }
    });
    room.onMessage("guess_result", (data: any) => {
      if (this.callbacks.onLandmarkGuessResult) {
        this.callbacks.onLandmarkGuessResult(data);
      }
    });

    // Listen to Treasure Map Reveal
    room.onMessage("treasure_map_reveal", (data: any) => {
      if (this.callbacks.onTreasureMapReveal) {
        this.callbacks.onTreasureMapReveal(data);
      }
    });

    // Listen to Player state updates (crystals, keys, troops)
    if (room.state.players && typeof room.state.players.onAdd === "function") {
      room.state.players.onAdd((player: any, key: string) => {
        if (key === room.sessionId && this.callbacks.onPlayerStateChange) {
          this.callbacks.onPlayerStateChange(player);
        }
        if (typeof player.onChange === "function") {
          player.onChange(() => {
            if (key === room.sessionId && this.callbacks.onPlayerStateChange) {
              this.callbacks.onPlayerStateChange(player);
            }
          });
        }
      });
    }

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

  public studyTile(x: number, y: number, points = 1) {
    this.room?.send("studyTile", { x, y, z: y, points });
  }

  public contributeFuel(landmarkId: string, amount: number) {
    this.room?.send("contributeFuel", { landmarkId, amount, points: amount });
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

  public rollUniStop(stopId: string, x?: number, z?: number) {
    this.room?.send("rollUniStop", { stopId, x, z, y: z });
  }

  public openChest(chestId: string, x?: number, z?: number) {
    this.room?.send("openChest", { chestId, x, z, y: z });
  }

  public updateMapLayout(layout: any) {
    this.room?.send("updateMapLayout", layout);
  }

  public guessLandmark(landmarkId: string, guess: string) {
    this.room?.send("guessLandmark", { landmarkId, guess });
  }

  public contributeCrystal(landmarkId: string, amount: number) {
    this.room?.send("contributeCrystal", { landmarkId, amount, crystals: amount });
  }

  public resetCooldowns() {
    this.room?.send("dev_reset_cooldowns");
  }

  public addCrystals(amount = 100) {
    this.room?.send("dev_add_crystals", { amount });
  }

  public addKeys(aspire = 5, nitro = 5, predator = 5) {
    this.room?.send("dev_add_keys", { aspire, nitro, predator });
  }
}
