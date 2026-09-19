import * as THREE from "three";
import { ChunkGridManager } from "./engine/chunkGridManager";
import { NatureGridManager } from "./engine/natureGridManager";
import { ModelLoader } from "./engine/modelLoader";
import { SceneManager, TileClickEvent } from "./engine/sceneManager";
import { ColyseusClient } from "./network/colyseusClient";
import { StatsOverlay } from "./ui/statsOverlay";
import { StudentActionDock } from "./ui/studentActionDock";
import { TileTooltip } from "./ui/tileTooltip";
import { MiniMap } from "./ui/miniMap";
import { DevToolsPanel } from "./ui/devToolsPanel";
import { PlayerRole } from "../../shared/types";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";
import { SCHOOL_ROSTER } from "../../shared/constants/schools";

async function bootstrap() {
  const container = document.getElementById("canvas-container")!;
  const appEl = document.getElementById("app")!;

  let playerSchoolId = "hcmut";
  let playerRole: PlayerRole = "assault";
  let playerHQCoords: { x: number; y: number } | null = null;

  // 1. Initialize Engine subsystems
  const chunkGridManager = new ChunkGridManager();
  const natureGridManager = new NatureGridManager();
  const modelLoader = new ModelLoader();
  const sceneManager = new SceneManager(container, chunkGridManager);

  // Expose Three.js scene and library to window for console inspection & debugging
  (window as any).__THREE_SCENE__ = sceneManager.scene;
  (window as any).scene = sceneManager.scene;
  (window as any).THREE = THREE;

  // Add render groups to scene
  sceneManager.scene.add(chunkGridManager.group);
  sceneManager.scene.add(natureGridManager.group);
  sceneManager.scene.add(modelLoader.group);

  // Build baseline nature vegetation immediately so map is vibrant from frame 1
  natureGridManager.buildProps();

  // 2. Initialize UI components
  const statsOverlay = new StatsOverlay(appEl);
  const actionDock = new StudentActionDock(appEl);
  const tileTooltip = new TileTooltip(appEl);
  const miniMap = new MiniMap(appEl);

  // 3. Initialize DevTools
  const devTools = new DevToolsPanel(appEl, {
    onSpeedSelect: (speed) => colyseusClient.setSimulationSpeed(speed),
    onBulkDispatch: (amount) => colyseusClient.bulkDispatch(amount),
    onSoftReset: () => colyseusClient.softReset()
  });

  // Toast notification helper
  function showToast(msg: string) {
    const toast = document.createElement("div");
    toast.className = "toast-msg";
    toast.textContent = msg;
    appEl.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  // Fly to Player HQ handler (Click card or press [H] / [Space])
  function flyToPlayerHQ() {
    if (playerHQCoords) {
      sceneManager.panTo(playerHQCoords.x, playerHQCoords.y);
      showToast(`🎯 Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${playerHQCoords.x}, ${playerHQCoords.y}]`);
    } else if (colyseusClient.room) {
      const hq = colyseusClient.room.state.hqs.get(playerSchoolId);
      if (hq) {
        playerHQCoords = { x: hq.x, y: hq.y };
        sceneManager.panTo(hq.x, hq.y);
        showToast(`🎯 Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${hq.x}, ${hq.y}]`);
      }
    }
  }

  statsOverlay.onFlyToHQRequested = flyToPlayerHQ;
  sceneManager.onFlyToHQRequested = flyToPlayerHQ;

  // Frame update for rotating banners/crystals
  sceneManager.onFrameUpdate = (delta) => {
    modelLoader.update(delta);
  };

  // 4. Initialize Network Client
  const colyseusClient = new ColyseusClient(
    chunkGridManager,
    modelLoader,
    natureGridManager,
    {
      onConnected: (room) => {
        console.log(`[App] Joined room: ${room.name}`);
        updateMiniMapStatic();

        // Check if player's HQ is already in state on join
        const existingHQ = room.state.hqs.get(playerSchoolId);
        if (existingHQ) {
          playerHQCoords = { x: existingHQ.x, y: existingHQ.y };
          sceneManager.panTo(existingHQ.x, existingHQ.y);
          const school = SCHOOL_ROSTER[playerSchoolId];
          sceneManager.setPlayerHQBeacon(existingHQ.x, existingHQ.y, school?.accentHex || "#1488D8");
          miniMap.setPlayerHQ(playerSchoolId, existingHQ.x, existingHQ.y);
        }

        // Listen to room ticks
        room.onStateChange((state) => {
          devTools.setTick(state.currentTick);
          miniMap.setClaimedTiles(state.claimedTiles);
        });
      },
      onHQAdded: (hq) => {
        updateMiniMapStatic();

        // 1. Camera Auto-Focus on Player HQ immediately
        if (hq.schoolId === playerSchoolId) {
          playerHQCoords = { x: hq.x, y: hq.y };
          sceneManager.panTo(hq.x, hq.y);

          // 3. Vertical Light Beacon at HQ
          const school = SCHOOL_ROSTER[playerSchoolId];
          sceneManager.setPlayerHQBeacon(hq.x, hq.y, school?.accentHex || "#1488D8");

          // 4. MiniMap HQ Marker
          miniMap.setPlayerHQ(playerSchoolId, hq.x, hq.y);
        }
      },
      onLandmarkAdded: () => {
        updateMiniMapStatic();
      },
      onSchoolTroopsChange: (schoolId, troops) => {
        if (schoolId === playerSchoolId) {
          statsOverlay.updateTroops(troops);
        }
      },
      onTerritoryChange: (territoryCounts) => {
        statsOverlay.updateTerritory(territoryCounts);
        if (colyseusClient.room) {
          miniMap.setClaimedTiles(colyseusClient.room.state.claimedTiles);
        }
      },
      onError: (msg) => {
        showToast(msg);
      }
    }
  );

  function updateMiniMapStatic() {
    if (!colyseusClient.room) return;
    const hqs: { schoolId: string; x: number; y: number }[] = [];
    const lms: { x: number; y: number }[] = [];

    colyseusClient.room.state.hqs.forEach((hq: any) => {
      hqs.push({ schoolId: hq.schoolId, x: hq.x, y: hq.y });
    });
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      lms.push({ x: lm.x, y: lm.y });
    });

    miniMap.setStaticFeatures(hqs, lms);
  }

  // 5. Connect UI callbacks
  statsOverlay.onSchoolChange = (schoolId) => {
    playerSchoolId = schoolId;
    colyseusClient.selectSchool(schoolId);
    if (colyseusClient.room) {
      const troops = colyseusClient.room.state.schoolTroops.get(schoolId) || 0;
      statsOverlay.updateTroops(troops);

      // Smoothly pan camera to player's new HQ & update beacon
      const hq = colyseusClient.room.state.hqs.get(schoolId);
      if (hq) {
        playerHQCoords = { x: hq.x, y: hq.y };
        sceneManager.panTo(hq.x, hq.y);
        const school = SCHOOL_ROSTER[schoolId];
        sceneManager.setPlayerHQBeacon(hq.x, hq.y, school?.accentHex || "#1488D8");
        miniMap.setPlayerHQ(schoolId, hq.x, hq.y);
      }
    }
  };

  actionDock.onRoleSelect = (role) => {
    playerRole = role;
    colyseusClient.setRole(role);
  };

  miniMap.onPanRequested = (x, y) => {
    sceneManager.panTo(x, y);
  };

  sceneManager.onCameraMove = (camX, camZ, frustumSize) => {
    miniMap.updateCamera(camX, camZ, frustumSize);
  };

  sceneManager.onFpsUpdate = (fps) => {
    devTools.setFps(fps);
  };

  // 6. Raycast Hover & Click Handlers
  sceneManager.onTileHover = (x, y) => {
    if (!colyseusClient.room) return;
    const tile = colyseusClient.room.state.claimedTiles.get(`${x},${y}`);

    // Check adjacency
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    let isAdjacent = false;
    for (const [nx, ny] of neighbors) {
      const n = colyseusClient.room.state.claimedTiles.get(`${nx},${ny}`);
      if (n && n.ownerId === playerSchoolId) {
        isAdjacent = true;
        break;
      }
    }

    // Check if within any landmark footprint
    let landmarkId: string | undefined;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 6;
      const h = conf?.footprint.height || 6;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        landmarkId = lm.landmarkKey;
      }
    });

    tileTooltip.update(
      {
        x,
        y,
        ownerId: tile?.ownerId,
        defenseTier: tile?.defenseTier,
        hp: tile?.hp,
        maxHp: tile?.maxHp,
        isAdjacent,
        landmarkId
      },
      playerSchoolId
    );
  };

  sceneManager.onTileClick = (event: TileClickEvent) => {
    if (!colyseusClient.room) return;
    const { x, y } = event;
    const tile = colyseusClient.room.state.claimedTiles.get(`${x},${y}`);

    if (tile && tile.ownerId === playerSchoolId) {
      // Friendly tile: Fortify
      colyseusClient.fortifyTile(x, y);
    } else {
      // Wild or Enemy tile: Claim / Attack
      colyseusClient.claimTile(x, y);
    }
  };

  // 7. Connect to Colyseus Server
  try {
    const room = await colyseusClient.connect(playerSchoolId);

    // Initial check for HQ coordinates
    setTimeout(() => {
      const hq = room.state.hqs.get(playerSchoolId);
      if (hq) {
        playerHQCoords = { x: hq.x, y: hq.y };
        sceneManager.panTo(hq.x, hq.y);
        const school = SCHOOL_ROSTER[playerSchoolId];
        sceneManager.setPlayerHQBeacon(hq.x, hq.y, school?.accentHex || "#1488D8");
        miniMap.setPlayerHQ(playerSchoolId, hq.x, hq.y);
      }
    }, 200);
  } catch (err) {
    console.warn("[App] Could not connect to Colyseus server. Waiting for server...", err);
    showToast("Đang kết nối tới Colyseus Server ws://localhost:2567...");
  }
}

// Start application
window.addEventListener("DOMContentLoaded", bootstrap);
