import * as THREE from "three";
import { ChunkGridManager } from "./engine/chunkGridManager";
import { NatureGridManager } from "./engine/natureGridManager";
import { ModelLoader } from "./engine/modelLoader";
import { SceneManager, TileClickEvent } from "./engine/sceneManager";
import { ColyseusClient } from "./network/colyseusClient";
import { StatsOverlay } from "./ui/statsOverlay";
import { StudentActionDock, ACTION_MODES, ActionMode } from "./ui/studentActionDock";
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

  let userPoints = 500;
  let isBotSimulationRunning = false;

  // Toast notification helper (100% no emojis)
  function showActionToast(message: string, type: "success" | "error" | "warning" = "success") {
    const toast = document.createElement("div");
    toast.className = `action-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  // 2. Initialize UI components
  const statsOverlay = new StatsOverlay(appEl, {
    schoolId: playerSchoolId,
    schoolName: SCHOOL_ROSTER[playerSchoolId]?.name,
    schoolColor: SCHOOL_ROSTER[playerSchoolId]?.colorHex,
    points: userPoints
  });
  const actionDock = new StudentActionDock(appEl);
  const tileTooltip = new TileTooltip(appEl);
  const miniMap = new MiniMap(
    appEl,
    () => sceneManager.zoomIn(),
    () => sceneManager.zoomOut(),
    () => flyToPlayerHQ()
  );

  // 3. Initialize DevTools Dropdown (hidden by default, bot off by default)
  const devTools = new DevToolsPanel(
    {
      onToggleBot: (running) => {
        isBotSimulationRunning = running;
        colyseusClient.toggleBots(running);
        showActionToast(running ? "Đã bật giả lập bot" : "Đã tắt giả lập bot");
      },
      onAddPoints: (amount) => {
        userPoints += amount;
        statsOverlay.updateStats({ points: userPoints });
        colyseusClient.addPoints(amount);
        showActionToast(`Đã nhận +${amount} điểm cống hiến!`);
      },
      onResetMap: () => {
        colyseusClient.softReset();
        showActionToast("Đã đặt lại toàn bộ bản đồ về trạng thái ban đầu");
      },
      onResetCamera: () => {
        flyToPlayerHQ();
      },
      onToggleGrid: (show) => {
        chunkGridManager.group.visible = show;
        showActionToast(show ? "Đã hiển thị lưới ô đất" : "Đã ẩn lưới ô đất");
      }
    },
    appEl
  );

  // Fly to Player HQ handler (Click card or press [H] / [Space])
  function flyToPlayerHQ() {
    if (playerHQCoords) {
      sceneManager.panTo(playerHQCoords.x, playerHQCoords.y);
      showActionToast(`Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${playerHQCoords.x}, ${playerHQCoords.y}]`);
    } else if (colyseusClient.room) {
      const hq = colyseusClient.room.state.hqs.get(playerSchoolId);
      if (hq) {
        playerHQCoords = { x: hq.x, y: hq.y };
        sceneManager.panTo(hq.x, hq.y);
        showActionToast(`Bay về Căn cứ HQ ${SCHOOL_ROSTER[playerSchoolId]?.shortName} [${hq.x}, ${hq.y}]`);
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
          userPoints = troops;
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
        showActionToast(msg, "error");
      },
      onDisconnected: (_code) => {
        showActionToast("Mất kết nối server. Đang tự động kết nối lại...", "warning");
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
      userPoints = troops;
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

  function isAdjacentToSchool(x: number, y: number, schoolId: string): boolean {
    if (!colyseusClient.room) return true;
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      const n = colyseusClient.room.state.claimedTiles.get(`${nx},${ny}`);
      if (n && n.ownerId === schoolId) {
        return true;
      }
    }
    return false;
  }

  // 6. One-Click Action: Click on 3D grid immediately validates, deducts points, and executes action
  sceneManager.onTileClick = (event: TileClickEvent) => {
    const { x, y } = event;
    const currentMode = actionDock.getActiveMode();
    const config = ACTION_MODES[currentMode];

    // 1. Point check
    if (userPoints < config.cost) {
      showActionToast(`Không đủ điểm! Cần ${config.cost} điểm để ${config.title.toLowerCase()}.`, "error");
      return;
    }

    const tile = colyseusClient.room?.state.claimedTiles.get(`${x},${y}`);
    const ownerSchool = tile?.ownerId;

    // 2. Execute according to selected mode
    switch (currentMode) {
      case "claim": {
        if (ownerSchool === playerSchoolId) {
          showActionToast("Ô này đã thuộc quyền kiểm soát của trường bạn!", "warning");
          return;
        }
        if (!isAdjacentToSchool(x, y, playerSchoolId)) {
          showActionToast("Chỉ có thể mở rộng các ô đất liền kề với trường bạn!", "warning");
          return;
        }

        userPoints -= config.cost;
        statsOverlay.updateStats({ points: userPoints });
        colyseusClient.claimTile(x, y);

        const schoolColor = SCHOOL_ROSTER[playerSchoolId]?.colorHex || "#0055a5";
        chunkGridManager.setTileColor(x, y, schoolColor);
        showActionToast(`Đã mở rộng thành công ô (${x}, ${y})! -${config.cost} điểm`);
        break;
      }

      case "fortify": {
        if (ownerSchool !== playerSchoolId) {
          showActionToast("Chỉ có thể gia cố các ô đất thuộc trường của bạn!", "warning");
          return;
        }
        userPoints -= config.cost;
        statsOverlay.updateStats({ points: userPoints });
        colyseusClient.fortifyTile(x, y);

        const currentTier = tile?.defenseTier || 0;
        chunkGridManager.setTileElevation(x, y, (currentTier + 1) * 0.15);
        showActionToast(`Đã gia cố phòng thủ ô (${x}, ${y})! -${config.cost} điểm`);
        break;
      }

      case "attack": {
        if (ownerSchool === playerSchoolId) {
          showActionToast("Không thể tấn công ô đất của chính trường bạn!", "warning");
          return;
        }
        if (!ownerSchool) {
          showActionToast("Ô đất tự do, hãy dùng chế độ Chiếm Đất để đổi!", "warning");
          return;
        }
        userPoints -= config.cost;
        statsOverlay.updateStats({ points: userPoints });
        colyseusClient.claimTile(x, y); // sends attack to enemy tile

        showActionToast(`Đã xuất kích tấn công ô (${x}, ${y}) của đối thủ! -${config.cost} điểm`);
        break;
      }
    }
  };

  // 7. Connect to Colyseus Server (with auto-retry)
  try {
    const room = await colyseusClient.connect(playerSchoolId);
    showActionToast("Đã kết nối Colyseus Server thành công");

    // Update initial troop points
    const troops = room.state.schoolTroops.get(playerSchoolId) || 500;
    userPoints = troops;
    statsOverlay.updateTroops(troops);

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
    showActionToast("Không thể kết nối tới server sau nhiều lần thử. Vui lòng kiểm tra terminal!", "error");
  }
}

// Start application
window.addEventListener("DOMContentLoaded", bootstrap);
