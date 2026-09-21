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
import { getTerrainType } from "./engine/terrainNoise";

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
  const statsOverlay = new StatsOverlay(appEl, {
    schoolId: playerSchoolId,
    schoolName: SCHOOL_ROSTER[playerSchoolId]?.name,
    schoolColor: SCHOOL_ROSTER[playerSchoolId]?.colorHex,
    points: 500
  });
  const actionDock = new StudentActionDock(appEl);
  const tileTooltip = new TileTooltip(appEl);
  const miniMap = new MiniMap(
    appEl,
    () => sceneManager.zoomIn(),
    () => sceneManager.zoomOut(),
    () => flyToPlayerHQ()
  );

  // 3. Initialize DevTools
  const devTools = new DevToolsPanel(appEl, {
    onSpeedSelect: (speed) => colyseusClient.setSimulationSpeed(speed),
    onBulkDispatch: (amount) => colyseusClient.bulkDispatch(amount),
    onSoftReset: () => colyseusClient.softReset()
  });

  // Toast notification helper (no emojis)
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
      showToast(`Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${playerHQCoords.x}, ${playerHQCoords.y}]`);
    } else if (colyseusClient.room) {
      const hq = colyseusClient.room.state.hqs.get(playerSchoolId);
      if (hq) {
        playerHQCoords = { x: hq.x, y: hq.y };
        sceneManager.panTo(hq.x, hq.y);
        showToast(`Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${hq.x}, ${hq.y}]`);
      }
    }
  }

  statsOverlay.onFlyToHQRequested = flyToPlayerHQ;
  sceneManager.onFlyToHQRequested = flyToPlayerHQ;
  actionDock.onResetCamera(() => flyToPlayerHQ());
  actionDock.onClaim((tile) => {
    colyseusClient.claimTile(tile.x, tile.z);
    showToast(`Đổi điểm nhận ô đất (${tile.x}, ${tile.z})`);
  });

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
          actionDock.setPoints(troops);
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
      },
      onDisconnected: (_code) => {
        showToast("Mất kết nối server. Đang tự động kết nối lại...");
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
      actionDock.setPoints(troops);

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
  sceneManager.onTileHover = (x, y, screenX, screenY) => {
    if (!colyseusClient.room) return;
    const tile = colyseusClient.room.state.claimedTiles.get(`${x},${y}`);

    // Check if within any landmark footprint
    let landmarkName: string | undefined;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 6;
      const h = conf?.footprint.height || 6;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        landmarkName = conf?.name || lm.landmarkKey;
      }
    });

    const tType = getTerrainType(x, y);
    let terrainType = "Đồng bằng";
    if (tType === "water") terrainType = "Lòng Hồ Đá";
    else if (tType === "hill") terrainType = "Đồi bazan";
    else if (tType === "road") terrainType = "Đại lộ giao thông";

    const ownerConfig = tile?.ownerId ? SCHOOL_ROSTER[tile.ownerId] : null;
    const ownerSchoolName = ownerConfig ? ownerConfig.name : null;
    const ownerColor = ownerConfig ? ownerConfig.colorHex : undefined;
    const isOwnedByMe = tile?.ownerId === playerSchoolId;
    const cost = landmarkName ? 50 : 10;

    tileTooltip.show(
      {
        x,
        z: y,
        terrainType,
        landmarkName,
        ownerSchoolName,
        ownerColor,
        cost,
        isOwnedByMe
      },
      screenX,
      screenY
    );
  };

  sceneManager.onTileLeave = () => {
    tileTooltip.hide();
  };

  sceneManager.onTileClick = (event: TileClickEvent) => {
    if (!colyseusClient.room) return;
    const { x, y } = event;
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

    // Check landmark
    let landmarkName: string | undefined;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 6;
      const h = conf?.footprint.height || 6;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        landmarkName = conf?.name || lm.landmarkKey;
      }
    });

    const ownerConfig = tile?.ownerId ? SCHOOL_ROSTER[tile.ownerId] : null;
    const ownerSchoolName = ownerConfig ? ownerConfig.name : null;
    const isMySchool = tile?.ownerId === playerSchoolId;
    const cost = landmarkName ? 50 : 10;

    let canClaim = false;
    let reasonDisabled: string | undefined;

    if (isMySchool) {
      canClaim = false;
      reasonDisabled = "Lãnh thổ đã sở hữu";
    } else if (!isAdjacent && (!tile || !tile.ownerId)) {
      canClaim = false;
      reasonDisabled = "Chưa tiếp giáp lãnh thổ";
    } else {
      canClaim = true;
    }

    actionDock.setSelectedTile({
      x,
      z: y,
      cost,
      ownerId: tile?.ownerId || null,
      ownerSchoolName,
      isMySchool,
      canClaim,
      reasonDisabled
    });
  };

  // 7. Connect to Colyseus Server (with auto-retry)
  try {
    const room = await colyseusClient.connect(playerSchoolId);
    showToast("Đã kết nối Colyseus Server thành công");

    // Update initial troop points
    const troops = room.state.schoolTroops.get(playerSchoolId) || 500;
    statsOverlay.updateTroops(troops);
    actionDock.setPoints(troops);

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
    console.error("[App] Could not connect to Colyseus server:", err);
    showToast("Không thể kết nối tới server sau nhiều lần thử. Vui lòng kiểm tra terminal!");
  }
}

// Start application
window.addEventListener("DOMContentLoaded", bootstrap);
