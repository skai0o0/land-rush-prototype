import * as THREE from "three";
import { ChunkGridManager } from "./engine/chunkGridManager";
import { NatureGridManager } from "./engine/natureGridManager";
import { ModelLoader } from "./engine/modelLoader";
import { SceneManager, TileClickEvent } from "./engine/sceneManager";
import { BorderFlagManager } from "./engine/borderFlagManager";
import { MegaEmblemManager } from "./engine/megaEmblemManager";
import { ColyseusClient } from "./network/colyseusClient";
import { StatsOverlay } from "./ui/statsOverlay";
import { StudentActionDock, ACTION_MODES, ActionMode } from "./ui/studentActionDock";
import { TileTooltip } from "./ui/tileTooltip";
import { MiniMap } from "./ui/miniMap";
import { DevToolsPanel } from "./ui/devToolsPanel";
import { DatabaseModal } from "./ui/databaseModal";
import { RunningDatabase } from "./services/runningDatabase";
import { PlayerRole, GameMode } from "../../shared/types";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";
import { SCHOOL_ROSTER, getSchoolIdFromEmail } from "../../shared/constants/schools";
import { getTerrainType } from "./engine/terrainNoise";

async function bootstrap() {
  const container = document.getElementById("canvas-container")!;
  const appEl = document.getElementById("app")!;

  // Parse URL Query Params for Student Identity & Mode
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get("email");
  const kmParam = urlParams.get("km");
  const pointsParam = urlParams.get("points");
  const devParam = urlParams.get("dev");
  const modeParam = urlParams.get("mode");

  let currentGameMode: GameMode = (modeParam === "normal" || (!devParam && emailParam)) ? "normal" : "dev";
  let playerEmail = emailParam || (currentGameMode === "normal" ? "sinhvien01@hcmut.edu.vn" : "");
  
  // Running points: 1 km = 1 point from database
  let userPoints = 500;
  if (playerEmail) {
    let initialKm = 50;
    if (kmParam) {
      const parsedKm = parseFloat(kmParam);
      if (!isNaN(parsedKm) && parsedKm >= 0) initialKm = parsedKm;
    } else if (pointsParam) {
      const parsedPts = parseInt(pointsParam, 10);
      if (!isNaN(parsedPts) && parsedPts >= 0) initialKm = parsedPts;
    }
    RunningDatabase.getOrCreate(playerEmail, initialKm);
    if (kmParam && !isNaN(parseFloat(kmParam))) {
      RunningDatabase.updateKm(playerEmail, parseFloat(kmParam));
    }
    userPoints = RunningDatabase.getStudentBalance(playerEmail);
  } else if (kmParam) {
    const km = parseFloat(kmParam);
    if (!isNaN(km) && km >= 0) userPoints = Math.round(km);
  } else if (pointsParam) {
    const pts = parseInt(pointsParam, 10);
    if (!isNaN(pts) && pts >= 0) userPoints = pts;
  }

  // Derive initial school from email or query param
  let playerSchoolId = "hcmut";
  const emailSchool = playerEmail ? getSchoolIdFromEmail(playerEmail) : null;
  const schoolParam = urlParams.get("school");
  if (emailSchool && SCHOOL_ROSTER[emailSchool]) {
    playerSchoolId = emailSchool;
  } else if (schoolParam && SCHOOL_ROSTER[schoolParam]) {
    playerSchoolId = schoolParam;
  }

  let playerRole: PlayerRole = "assault";
  let playerHQCoords: { x: number; y: number } | null = null;
  const schoolHQMap = new Map<string, { x: number; y: number }>();

  // 1. Initialize Engine subsystems
  const chunkGridManager = new ChunkGridManager();
  const natureGridManager = new NatureGridManager();
  const modelLoader = new ModelLoader();
  const borderFlagManager = new BorderFlagManager();
  const megaEmblemManager = new MegaEmblemManager();
  const sceneManager = new SceneManager(container, chunkGridManager);

  // Expose Three.js scene and library to window for console inspection & debugging
  (window as any).__THREE_SCENE__ = sceneManager.scene;
  (window as any).scene = sceneManager.scene;
  (window as any).THREE = THREE;

  // Add render groups to scene
  sceneManager.scene.add(chunkGridManager.group);
  sceneManager.scene.add(natureGridManager.group);
  sceneManager.scene.add(modelLoader.group);
  sceneManager.scene.add(borderFlagManager.group);
  sceneManager.scene.add(megaEmblemManager.group);

  // Build baseline nature vegetation immediately so map is vibrant from frame 1
  natureGridManager.buildProps();

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
    points: userPoints,
    mode: currentGameMode,
    studentEmail: playerEmail,
    isLocked: currentGameMode === "normal"
  });
  const actionDock = new StudentActionDock(appEl);
  const tileTooltip = new TileTooltip(appEl);
  const miniMap = new MiniMap(
    appEl,
    () => sceneManager.zoomIn(),
    () => sceneManager.zoomOut(),
    () => flyToPlayerHQ()
  );

  let colyseusClient: ColyseusClient;

  // Helper to sync HQ coordinates map from room state
  function updateHQMapFromRoom() {
    if (colyseusClient?.room?.state?.hqs) {
      colyseusClient.room.state.hqs.forEach((hq: any) => {
        schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
      });
    }
  }

  // Mobile Selected Tile State: 1-Tap Select -> 2nd Tap on SAME tile Executes!
  let selectedMobileTile: { x: number; y: number; timestamp: number } | null = null;

  function clearSelectedTile() {
    selectedMobileTile = null;
    sceneManager.clearSelectedTileMarker();
  }

  // Fly to Player HQ handler (Click card, click button or press [H] / [Space])
  function flyToPlayerHQ() {
    clearSelectedTile();
    updateHQMapFromRoom();
    let target = schoolHQMap.get(playerSchoolId) || null;
    if (!target && colyseusClient.room && colyseusClient.room.state && colyseusClient.room.state.hqs) {
      const hq = colyseusClient.room.state.hqs.get(playerSchoolId);
      if (hq) {
        target = { x: hq.x, y: hq.y };
        schoolHQMap.set(playerSchoolId, target);
      }
    }

    if (target) {
      playerHQCoords = target;
      sceneManager.panTo(target.x, target.y, { duration: 1.25, zoom: 0.72, arc: true });
      const school = SCHOOL_ROSTER[playerSchoolId];
      sceneManager.setPlayerHQBeacon(target.x, target.y, school?.accentHex || "#1488D8");
      miniMap.setPlayerHQ(playerSchoolId, target.x, target.y);
      showActionToast(`Bay về Căn cứ HQ ${school?.shortName || playerSchoolId.toUpperCase()} [${target.x}, ${target.y}]`);
    } else {
      showActionToast(`Đang định vị Căn cứ HQ của ${playerSchoolId.toUpperCase()}...`, "warning");
    }
  }

  statsOverlay.onFlyToHQRequested = flyToPlayerHQ;
  sceneManager.onFlyToHQRequested = flyToPlayerHQ;

  let devTools: DevToolsPanel;

  function loginAsStudent(email: string, schoolId?: string, km?: number) {
    clearSelectedTile();
    playerEmail = email.trim();
    const resolvedSchool = (schoolId && SCHOOL_ROSTER[schoolId])
      ? schoolId
      : (getSchoolIdFromEmail(playerEmail) || playerSchoolId || "hcmut");
    playerSchoolId = resolvedSchool;

    if (km !== undefined) {
      RunningDatabase.getOrCreate(playerEmail, km);
    }
    userPoints = RunningDatabase.getStudentBalance(playerEmail);

    // 1. Cập nhật HUD & School
    statsOverlay.setSchool(playerSchoolId);
    statsOverlay.updateStats({
      studentEmail: playerEmail,
      points: userPoints,
      isLocked: currentGameMode === "normal"
    });

    // 2. Cập nhật DevTools dropdown nếu có
    if (devTools) {
      devTools.setSelectedAccount(playerEmail);
    }

    // 3. Đồng bộ đăng nhập sinh viên tới Server qua Colyseus
    colyseusClient?.loginStudent(playerEmail, playerSchoolId, userPoints, currentGameMode);

    // 4. Cập nhật query parameters trên URL trình duyệt
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("email", playerEmail);
      url.searchParams.set("school", playerSchoolId);
      url.searchParams.set("km", userPoints.toString());
      window.history.pushState({}, "", url.toString());
    } catch (e) {
      console.warn("[App] Failed to update browser URL:", e);
    }

    const schoolConfig = SCHOOL_ROSTER[playerSchoolId];
    showActionToast(`Đã đăng nhập: ${playerEmail} [${schoolConfig?.shortName || playerSchoolId.toUpperCase()}] - ${userPoints} điểm giải chạy`);
    flyToPlayerHQ();
  }

  // Initialize Database Modal
  const databaseModal = new DatabaseModal({
    onSelectStudent: (student) => {
      loginAsStudent(student.email, student.schoolId, student.km);
    },
    onOpenNewTab: (schoolId, email, km) => {
      const url = new URL(window.location.href);
      url.searchParams.set("school", schoolId);
      if (email) url.searchParams.set("email", email);
      if (km) url.searchParams.set("km", km.toString());
      url.searchParams.set("mode", currentGameMode);
      window.open(url.toString(), "_blank");
      showActionToast(`Đang mở phiên mới cho ${schoolId.toUpperCase()} trong tab mới...`);
    },
    onStudentUpdated: (student) => {
      if (playerEmail && student.email.toLowerCase() === playerEmail.toLowerCase()) {
        userPoints = RunningDatabase.getStudentBalance(playerEmail);
        statsOverlay.updateStats({ points: userPoints });
        showActionToast(`Đã đồng bộ điểm giải chạy: ${userPoints} điểm (${student.km} km)`);
      }
    }
  });

  // 3. Initialize DevTools Dropdown
  devTools = new DevToolsPanel(
    {
      onToggleBot: (running) => {
        isBotSimulationRunning = running;
        colyseusClient.toggleBots(running);
        showActionToast(running ? "Đã bật giả lập bot" : "Đã tắt giả lập bot");
      },
      onAddPoints: (amount) => {
        const addedKm = amount / 10;
        if (playerEmail) {
          RunningDatabase.addKm(playerEmail, addedKm);
          userPoints = RunningDatabase.getStudentBalance(playerEmail);
        } else {
          userPoints += amount;
        }
        statsOverlay.updateStats({ points: userPoints });
        colyseusClient.addPoints(amount);
        showActionToast(`Đã nhận +${amount} điểm cống hiến (+${addedKm} km)!`);
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
      },
      onToggleMode: (mode) => {
        currentGameMode = mode;
        statsOverlay.updateStats({
          mode: currentGameMode,
          isLocked: currentGameMode === "normal",
          studentEmail: playerEmail
        });
        if (playerEmail) {
          colyseusClient?.loginStudent(playerEmail, playerSchoolId, userPoints, currentGameMode);
        }
        showActionToast(mode === "dev" ? "Đã chuyển sang Dev Mode (Tự do đổi trường)" : "Đã chuyển sang Normal Mode (Khóa trường sinh viên)");
      },
      onSwitchAccount: (email, schoolId, km) => {
        loginAsStudent(email, schoolId, km);
      },
      onOpenNewTab: (schoolId, email, km) => {
        const url = new URL(window.location.href);
        url.searchParams.set("school", schoolId);
        if (email) url.searchParams.set("email", email);
        if (km) url.searchParams.set("km", km.toString());
        url.searchParams.set("mode", currentGameMode);
        window.open(url.toString(), "_blank");
        showActionToast(`Đang mở phiên mới cho ${schoolId.toUpperCase()} trong tab mới...`);
      },
      onOpenDbEditor: () => {
        databaseModal.open();
      },
      onSetGraphicsTier: (tier) => {
        sceneManager.setGraphicsTier(tier);
        natureGridManager.setShadowCasting(tier === 'high');
        const tierName = tier === 'performance' ? '60 FPS Mượt Mà' : tier === 'balanced' ? 'Cân Bằng' : 'Chất Lượng Cao';
        showActionToast(`Đã chuyển cấu hình đồ họa: ${tierName}`);
      },
      onDevSpawnBastion: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_spawn_bastion", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Spawn Bastion (10x10) cho ${playerSchoolId}...`);
        }
      },
      onDevSpawnMegaEmblem: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_spawn_mega_emblem", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Spawn Đại Lãnh Thổ (100x100) cho ${playerSchoolId}...`);
        }
      },
      onDevBreachCluster: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_breach_cluster", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Chọc thủng cụm cho ${playerSchoolId}...`);
        }
      },
      onDevMaxFortifyAll: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_max_fortify_all", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Max Gia Cố Toàn Bộ Đất cho ${playerSchoolId}...`);
        }
      }
    },
    appEl,
    currentGameMode,
    playerEmail
  );

  // Frame update for rotating banners/crystals and animated tile flips
  sceneManager.onFrameUpdate = (delta) => {
    chunkGridManager.update(delta, performance.now());
    modelLoader.update(delta);
  };

  // 4. Initialize Network Client
  colyseusClient = new ColyseusClient(
    chunkGridManager,
    modelLoader,
    natureGridManager,
    {
      onConnected: (room) => {
        console.log(`[App] Joined room: ${room.name}`);
        updateHQMapFromRoom();
        updateMiniMapStatic();

        // Check if player's HQ is already in state on join
        const existingHQ = schoolHQMap.get(playerSchoolId) || room.state.hqs.get(playerSchoolId);
        if (existingHQ) {
          playerHQCoords = { x: existingHQ.x, y: existingHQ.y };
          sceneManager.panTo(existingHQ.x, existingHQ.y, { duration: 1.15, zoom: 0.72 });
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
        schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
        updateMiniMapStatic();

        // 1. Camera Auto-Focus on Player HQ immediately
        if (hq.schoolId === playerSchoolId) {
          playerHQCoords = { x: hq.x, y: hq.y };
          sceneManager.panTo(hq.x, hq.y, { duration: 1.15, zoom: 0.72 });

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
      onBastionFormed: (data) => {
        borderFlagManager.addBastionFlags(data.schoolId, data.borderTiles);
      },
      onBastionBroken: (data) => {
        borderFlagManager.removeBorderFlags(data.schoolId);
      },
      onMegaEmblemFormed: (data) => {
        const [minX, minY, maxX, maxY] = data.boundingBox;
        megaEmblemManager.addMegaEmblem(data.schoolId, minX, minY, maxX, maxY);
        borderFlagManager.registerMegaEmblemZone(minX, minY, maxX, maxY);
      },
      onMegaEmblemBroken: (data) => {
        megaEmblemManager.removeMegaEmblem(data.schoolId);
      },
      onActiveClustersSync: (data) => {
        if (data.bastions) {
          data.bastions.forEach((b: any) => {
            borderFlagManager.addBastionFlags(b.schoolId, b.borderTiles);
          });
        }
        if (data.megaEmblems) {
          data.megaEmblems.forEach((m: any) => {
            const [minX, minY, maxX, maxY] = m.boundingBox;
            megaEmblemManager.addMegaEmblem(m.schoolId, minX, minY, maxX, maxY);
            borderFlagManager.registerMegaEmblemZone(minX, minY, maxX, maxY);
          });
        }
      },
      onDevBreachSuccess: (data) => {
        if (data.targetX >= 0 && data.targetY >= 0) {
          showActionToast(`Đã chọc thủng cụm tại tọa độ (${data.targetX}, ${data.targetY})!`);
        } else {
          showActionToast("Không tìm thấy cụm lãnh thổ phù hợp để chọc thủng!", "warning");
        }
      },
      onSchoolTroopsChange: (schoolId, troops) => {
        // Sinh viên không nhận điểm tự động theo thời gian, điểm lấy từ database giải chạy!
        if (playerEmail || currentGameMode === "normal") {
          return;
        }
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
    if (currentGameMode === "normal") {
      showActionToast("Tài khoản sinh viên đã được định danh cố định theo trường!", "warning");
      return;
    }
    playerSchoolId = schoolId;
    colyseusClient.selectSchool(schoolId);
    if (colyseusClient.room) {
      if (!playerEmail) {
        const troops = colyseusClient.room.state.schoolTroops.get(schoolId) || 0;
        userPoints = troops;
        statsOverlay.updateTroops(troops);
      }
      flyToPlayerHQ();
    }
  };


  miniMap.onPanLive = (x, y, isDragging) => {
    if (isDragging) {
      sceneManager.setTargetPosition(x, y);
    } else {
      sceneManager.panTo(x, y, { duration: 0.35, arc: false });
    }
  };

  miniMap.onPanRequested = (x, y) => {
    sceneManager.panTo(x, y, { duration: 0.65 });
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
    let landmarkConfig: any = null;
    let isCore = false;

    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 14;
      const h = conf?.footprint.height || 12;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        landmarkName = conf?.name || lm.landmarkKey;
        landmarkConfig = conf;
        const coreX = lm.x + Math.floor(w / 2);
        const coreY = lm.y + Math.floor(h / 2);
        if (x === coreX && y === coreY) {
          isCore = true;
        }
      }
    });

    // Check if within any school HQ zone (Hexagonal footprint diameter ~20 tiles)
    if (colyseusClient.room && !landmarkName) {
      colyseusClient.room.state.hqs.forEach((hq: any) => {
        const dx = Math.abs(x - hq.x);
        const dy = Math.abs(y - hq.y);
        if (dx <= 10 && (dx + Math.sqrt(3) * dy) <= 20) {
          const sc = SCHOOL_ROSTER[hq.schoolId];
          landmarkName = `Căn cứ HQ ${sc?.shortName || hq.schoolId.toUpperCase()}`;
        }
      });
    }

    const tType = getTerrainType(x, y);
    let terrainType = "Đồng bằng";
    if (tType === "water") terrainType = "Lòng Hồ Đá";
    else if (tType === "hill") terrainType = "Đồi bazan";
    else if (tType === "road") terrainType = "Đại lộ giao thông";

    const ownerConfig = tile?.ownerId ? SCHOOL_ROSTER[tile.ownerId] : null;
    const ownerSchoolName = ownerConfig ? ownerConfig.name : (landmarkName ? "Cứ điểm Trung Lập" : null);
    const ownerColor = ownerConfig ? ownerConfig.colorHex : undefined;
    const isOwnedByMe = tile?.ownerId === playerSchoolId;

    let cost = 1;
    if (landmarkConfig) {
      const isEnemyControlled = tile?.ownerId && tile.ownerId !== "" && tile.ownerId !== playerSchoolId;
      cost = isEnemyControlled ? landmarkConfig.attackCost : landmarkConfig.claimCost;
    } else if (tile?.ownerId && !isOwnedByMe) {
      cost = 2;
    }

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      tileTooltip.show(
        {
          x,
          z: y,
          terrainType,
          landmarkName,
          ownerSchoolName,
          ownerColor,
          cost,
          isOwnedByMe,
          hp: tile?.hp,
          maxHp: tile?.maxHp,
          defenseTier: tile?.defenseTier,
          isCore,
          buffDescription: landmarkConfig?.buffDescription
        },
        screenX,
        screenY
      );
    }
  };

  sceneManager.onTileLeave = () => {
    tileTooltip.hide();
  };

  function isAdjacentToSchool(x: number, y: number, schoolId: string): boolean {
    if (!colyseusClient.room) return false;
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

  // Helper to find landmark at coords
  function getLandmarkAt(x: number, y: number) {
    if (!colyseusClient?.room?.state?.landmarks) return null;
    let found: { config: any; name: string } | null = null;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 14;
      const h = conf?.footprint.height || 12;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        found = { config: conf, name: conf?.name || lm.landmarkKey };
      }
    });
    return found;
  }

  // Helper to find school HQ name at coords
  function getHQNameAt(x: number, y: number) {
    if (!colyseusClient?.room?.state?.hqs) return null;
    let foundName: string | null = null;
    colyseusClient.room.state.hqs.forEach((hq: any) => {
      const dx = Math.abs(x - hq.x);
      const dy = Math.abs(y - hq.y);
      if (dx <= 10 && (dx + Math.sqrt(3) * dy) <= 20) {
        const sc = SCHOOL_ROSTER[hq.schoolId];
        foundName = `Căn cứ HQ ${sc?.shortName || hq.schoolId.toUpperCase()}`;
      }
    });
    return foundName;
  }

  // Evaluate smart context for a given tile
  function evaluateTileContext(x: number, y: number, modeOverride?: ActionMode) {
    const tile = colyseusClient.room?.state.claimedTiles.get(`${x},${y}`);
    const ownerSchool = tile?.ownerId;
    const isOwnedByMe = ownerSchool === playerSchoolId;
    const isOwnedByEnemy = !!ownerSchool && ownerSchool !== "" && !isOwnedByMe;
    const isAdjacent = isAdjacentToSchool(x, y, playerSchoolId);

    const lm = getLandmarkAt(x, y);
    const landmarkConfig = lm?.config;
    const landmarkName = lm?.name || getHQNameAt(x, y) || undefined;

    const ownerConfig = ownerSchool ? SCHOOL_ROSTER[ownerSchool] : null;
    const ownerName = ownerConfig ? ownerConfig.name : (landmarkName ? "Cứ điểm Trung Lập" : "Đất Hoang / Trung Lập");
    const ownerColor = ownerConfig ? ownerConfig.colorHex : "#94a3b8";

    // Auto infer mode if not overridden
    let mode: ActionMode;
    if (modeOverride) {
      mode = modeOverride;
    } else {
      if (isOwnedByMe) mode = "fortify";
      else if (isOwnedByEnemy) mode = "attack";
      else mode = "claim";
    }

    let cost = 1;
    let title = "Chiếm đất";
    let actionTitle = "XÁC NHẬN CHIẾM ĐẤT";
    let description = "Mở rộng quyền kiểm soát sang ô đất trống lân cận";
    let canExecute = true;
    let reasonDisabled: string | undefined;

    if (mode === "claim") {
      cost = landmarkConfig ? landmarkConfig.claimCost : ACTION_MODES.claim.cost;
      title = "Mở rộng lãnh thổ";
      actionTitle = landmarkName ? `CHIẾM CỨ ĐIỂM (${cost}đ)` : `XÁC NHẬN CHIẾM ĐẤT (${cost}đ)`;
      description = landmarkName ? `Mở rộng sang cứ điểm ${landmarkName}` : "Mở rộng sang ô đất trống lân cận";
      if (isOwnedByMe) {
        canExecute = false;
        reasonDisabled = "Ô này đã thuộc quyền kiểm soát của trường bạn";
      } else if (isOwnedByEnemy) {
        canExecute = false;
        reasonDisabled = "Ô này đã bị đối thủ chiếm, cần dùng chế độ TẤN CÔNG";
      } else if (!isAdjacent) {
        canExecute = false;
        reasonDisabled = "Chỉ có thể mở rộng các ô liền kề với trường bạn";
      } else if (userPoints < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm để mở rộng`;
      }
    } else if (mode === "fortify") {
      cost = ACTION_MODES.fortify.cost;
      title = "Gia cố phòng thủ";
      const currentTier = tile?.defenseTier || 0;
      actionTitle = `GIA CỐ PHÒNG THỦ (${cost}đ)`;
      description = currentTier >= 3 ? "Đã đạt cấp phòng thủ tối đa (Giáp T3)" : `Nâng cấp giáp lên T${currentTier + 1} (+100 HP)`;
      if (!isOwnedByMe) {
        canExecute = false;
        reasonDisabled = "Chỉ có thể gia cố các ô đất thuộc trường của bạn";
      } else if (currentTier >= 3) {
        canExecute = false;
        reasonDisabled = "Ô đất này đã đạt cấp phòng thủ tối đa (T3)";
      } else if (userPoints < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm để gia cố`;
      }
    } else if (mode === "attack") {
      cost = landmarkConfig ? landmarkConfig.attackCost : ACTION_MODES.attack.cost;
      title = "Công phá đối thủ";
      actionTitle = `CÔNG PHÁ CỨ ĐIỂM (${cost}đ)`;
      description = `Tấn công tranh chấp cứ điểm của ${ownerConfig?.shortName || ownerSchool?.toUpperCase() || "đối thủ"}`;
      if (isOwnedByMe) {
        canExecute = false;
        reasonDisabled = "Không thể tấn công ô đất của chính trường bạn";
      } else if (!ownerSchool || ownerSchool === "") {
        canExecute = false;
        reasonDisabled = "Ô này chưa có phe kiểm soát, hãy dùng chế độ CHIẾM ĐẤT";
      } else if (!isAdjacent) {
        canExecute = false;
        reasonDisabled = "Chỉ có thể tấn công các ô liền kề với lãnh thổ của bạn";
      } else if (userPoints < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm để tấn công`;
      }
    }

    return {
      x,
      y,
      mode,
      title,
      cost,
      description,
      actionTitle,
      ownerName,
      ownerColor,
      landmarkName,
      canExecute,
      reasonDisabled
    };
  }

  // Execute validated action on a tile
  function executeTileAction(ctx: ReturnType<typeof evaluateTileContext>) {
    if (!ctx.canExecute) {
      if (ctx.reasonDisabled) {
        showActionToast(ctx.reasonDisabled, "warning");
      }
      return;
    }

    // Deduct points from database or state
    if (playerEmail) {
      RunningDatabase.deductPoints(playerEmail, ctx.cost);
      userPoints = RunningDatabase.getStudentBalance(playerEmail);
    } else {
      userPoints -= ctx.cost;
    }
    statsOverlay.updateStats({ points: userPoints });

    const { x, y, mode, cost, landmarkName } = ctx;

    if (mode === "claim") {
      colyseusClient.claimTile(x, y);
      showActionToast(
        landmarkName
          ? `Đã tấn công chiếm cứ điểm ${landmarkName}! -${cost} điểm`
          : `Đã mở rộng thành công ô (${x}, ${y})! -${cost} điểm`
      );
    } else if (mode === "fortify") {
      colyseusClient.fortifyTile(x, y);
      const tile = colyseusClient.room?.state.claimedTiles.get(`${x},${y}`);
      const currentTier = tile?.defenseTier || 0;
      chunkGridManager.setTileElevation(x, y, (currentTier + 1) * 0.15);
      showActionToast(`Đã gia cố phòng thủ ô (${x}, ${y})! -${cost} điểm`);
    } else if (mode === "attack") {
      colyseusClient.claimTile(x, y);
      showActionToast(
        landmarkName
          ? `Đã xuất kích công phá ${landmarkName} (${x}, ${y})! -${cost} điểm`
          : `Đã xuất kích tấn công ô (${x}, ${y}) của đối thủ! -${cost} điểm`
      );
    }
  }

  actionDock.onToggleSmart = (enabled) => {
    showActionToast(
      enabled
        ? "Đã bật chế độ Tự Động (Smart Context Action)"
        : "Đã chuyển sang chế độ Thủ Công (Manual Mode)"
    );
  };

  sceneManager.onMissClick = () => {
    if (selectedMobileTile) {
      clearSelectedTile();
    }
  };

  // 6. Action Execution Handler: Desktop 1-Click vs Mobile 1-Tap Select -> 2-Tap Execute
  sceneManager.onTileClick = (event: TileClickEvent) => {
    const { x, y } = event;
    const isSmart = actionDock.isSmart();
    const modeOverride = isSmart ? undefined : actionDock.getActiveMode();
    const ctx = evaluateTileContext(x, y, modeOverride);

    const isTouchDevice = (typeof window !== "undefined") && (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 768 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
    const isMobile = isTouchDevice && (window.innerWidth <= 900 || window.innerHeight <= 600);

    if (!isMobile) {
      // DESKTOP: 1-Click direct execution (Fast & fluid as desired)
      actionDock.setMode(ctx.mode);
      const markerColor = ctx.mode === "fortify" ? "#10b981" : ctx.mode === "attack" ? "#ef4444" : "#0ea5e9";
      sceneManager.setSelectedTileMarker(x, y, markerColor);
      executeTileAction(ctx);
      setTimeout(() => sceneManager.clearSelectedTileMarker(), 650);
      return;
    }

    // MOBILE FLOW:
    const now = performance.now();

    // Condition A: User taps on the ALREADY SELECTED tile -> EXECUTE IMMEDIATELY!
    if (
      selectedMobileTile &&
      selectedMobileTile.x === x &&
      selectedMobileTile.y === y &&
      (now - selectedMobileTile.timestamp) > 100 // Prevent accidental double-touch bounce
    ) {
      if (ctx.canExecute) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try { navigator.vibrate(25); } catch (_) {}
        }
        executeTileAction(ctx);
        clearSelectedTile();
      } else {
        if (ctx.reasonDisabled) {
          showActionToast(ctx.reasonDisabled, "warning");
        }
      }
      return;
    }

    // Condition B: 1st tap on this tile (or switching selection to another tile) -> SELECT IT!
    selectedMobileTile = { x, y, timestamp: now };
    actionDock.setMode(ctx.mode);

    // 3D visual selection marker (glowing tactical frame)
    const markerColor = ctx.mode === "fortify" ? "#10b981" : ctx.mode === "attack" ? "#ef4444" : "#0ea5e9";
    sceneManager.setSelectedTileMarker(x, y, markerColor);

    if (!ctx.canExecute && ctx.reasonDisabled) {
      showActionToast(ctx.reasonDisabled, "warning");
    }
  };

  // 7. Connect to Colyseus Server (with auto-retry)
  try {
    const room = await colyseusClient.connect({
      schoolId: playerSchoolId,
      email: playerEmail,
      mode: currentGameMode,
      points: userPoints
    });
    showActionToast(
      currentGameMode === "normal"
        ? `Đã đăng nhập: ${playerEmail} [${playerSchoolId.toUpperCase()}] - ${userPoints} điểm giải chạy`
        : `Đã kết nối Colyseus Server [Dev Mode: ${playerSchoolId.toUpperCase()}]`
    );

    // Update initial troop points (Only if NOT logged in as a student)
    if (!playerEmail && currentGameMode === "dev") {
      const troops = room.state.schoolTroops.get(playerSchoolId) || 500;
      userPoints = troops;
      statsOverlay.updateTroops(troops);
    } else {
      statsOverlay.updateStats({ points: userPoints });
    }

    // Initial check for HQ coordinates
    setTimeout(() => {
      flyToPlayerHQ();
    }, 200);
  } catch (err) {
    console.error("[App] Could not connect to Colyseus server:", err);
    showActionToast("Không thể kết nối tới server sau nhiều lần thử. Vui lòng kiểm tra terminal!", "error");
  }
}

// Start application
window.addEventListener("DOMContentLoaded", bootstrap);
