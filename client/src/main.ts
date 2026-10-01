import * as THREE from "three";
import { ChunkGridManager } from "./engine/chunkGridManager";
import { NatureGridManager } from "./engine/natureGridManager";
import { ModelLoader } from "./engine/modelLoader";
import { SceneManager, TileClickEvent } from "./engine/sceneManager";
import { BorderFlagManager } from "./engine/borderFlagManager";
import { MegaEmblemManager } from "./engine/megaEmblemManager";
import { FogOfWarManager } from "./engine/fogOfWarManager";
import { ColyseusClient } from "./network/colyseusClient";
import { StatsOverlay } from "./ui/statsOverlay";
import { StudentActionDock, ACTION_MODES, ActionMode } from "./ui/studentActionDock";
import { TileTooltip } from "./ui/tileTooltip";
import { MiniMap } from "./ui/miniMap";
import { DevToolsPanel } from "./ui/devToolsPanel";
import { DatabaseModal } from "./ui/databaseModal";
import { LandmarkModal, LandmarkModalData } from "./ui/landmarkModal";
import { RunningDatabase } from "./services/runningDatabase";
import { PlayerRole, GameMode } from "../../shared/types";
import { LANDMARK_ROSTER } from "../../shared/constants/landmarks";
import { SCHOOL_ROSTER, SCHOOL_IDS, getSchoolIdFromEmail } from "../../shared/constants/schools";
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
  const fogOfWarManager = new FogOfWarManager();
  const chunkGridManager = new ChunkGridManager();
  chunkGridManager.setFogOfWar(fogOfWarManager);

  const natureGridManager = new NatureGridManager();
  const modelLoader = new ModelLoader();
  const borderFlagManager = new BorderFlagManager();
  const megaEmblemManager = new MegaEmblemManager();
  const sceneManager = new SceneManager(container, chunkGridManager);

  // Expose Three.js scene, library and subsystems to window for console inspection & debugging
  (window as any).__THREE_SCENE__ = sceneManager.scene;
  (window as any).scene = sceneManager.scene;
  (window as any).THREE = THREE;
  (window as any).fogOfWarManager = fogOfWarManager;

  // Add render groups to scene
  sceneManager.scene.add(chunkGridManager.group);
  sceneManager.scene.add(natureGridManager.group);
  sceneManager.scene.add(modelLoader.group);
  sceneManager.scene.add(borderFlagManager.group);
  sceneManager.scene.add(megaEmblemManager.group);
  sceneManager.scene.add(fogOfWarManager.group);

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
  miniMap.setFogOfWarManager(fogOfWarManager);

  // Fog of War Event Listeners
  fogOfWarManager.onExplorationChanged = (stats) => {
    statsOverlay.updateExploration(stats.revealedCount, stats.percentage);
    miniMap.draw();
  };

  fogOfWarManager.onTilesRevealed = (tiles) => {
    chunkGridManager.revealTiles(tiles, false);
  };

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

  // Helper to open Landmark Bonfire Modal for a specific landmark
  function openLandmarkModalFor(landmarkId: string) {
    if (!colyseusClient?.room?.state?.landmarks) return;

    let targetLM: any = colyseusClient.room.state.landmarks.get(landmarkId);
    if (!targetLM) {
      colyseusClient.room.state.landmarks.forEach((lm: any) => {
        if (lm.id === landmarkId || lm.landmarkKey === landmarkId) {
          targetLM = lm;
        }
      });
    }

    if (!targetLM) {
      showActionToast("Không tìm thấy thông tin Công trình!", "warning");
      return;
    }

    const lmKey = targetLM.landmarkKey || targetLM.id;
    const config = LANDMARK_ROSTER[lmKey] || LANDMARK_ROSTER[lmKey.replace(/^landmark_/, "")];
    const name = config?.name || lmKey;
    const category = config?.category || 'scenic';
    const footprint = config?.footprint || { width: 14, height: 12 };
    const buffDescription = config?.buffDescription || "Tăng cường năng lực tri thức cho học viện kiểm soát.";
    const gameplayRole = config?.gameplayRole || "strategic_monument";

    const fuelBySchool: Record<string, number> = {};
    if (targetLM.fuelBySchool) {
      if (typeof targetLM.fuelBySchool.forEach === "function") {
        targetLM.fuelBySchool.forEach((val: number, key: string) => {
          fuelBySchool[key] = val;
        });
      } else {
        for (const [k, v] of Object.entries(targetLM.fuelBySchool)) {
          fuelBySchool[k] = Number(v);
        }
      }
    }

    const data: LandmarkModalData = {
      landmarkId: targetLM.id || lmKey,
      landmarkKey: lmKey,
      name,
      category,
      footprint,
      buffDescription,
      gameplayRole,
      x: targetLM.x,
      y: targetLM.y,
      currentFuel: targetLM.currentFuel || 0,
      maxFuel: targetLM.maxFuel || 500,
      litBySchoolId: targetLM.litBySchoolId || "",
      buffActive: targetLM.buffActive || false,
      fuelBySchool,
      userPoints,
      playerSchoolId
    };

    landmarkModal.open(data);
  }

  // Find nearest landmark to current camera center
  function getNearestLandmark(): any | null {
    if (!colyseusClient?.room?.state?.landmarks) return null;
    let nearest: any = null;
    let minDist = Infinity;
    const center = sceneManager.getTargetPosition();
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const dist = Math.hypot(lm.x - center.x, lm.y - center.z);
      if (dist < minDist) {
        minDist = dist;
        nearest = lm;
      }
    });
    return nearest;
  }

  // Initialize Landmark Bonfire Modal
  const landmarkModal = new LandmarkModal({
    onContributeFuel: (landmarkId, amount) => {
      if (userPoints < amount) {
        showActionToast(`Không đủ Điểm! Cần ${amount} Điểm để nạp Than củi.`, "warning");
        return;
      }

      if (playerEmail) {
        RunningDatabase.deductPoints(playerEmail, amount);
        userPoints = RunningDatabase.getStudentBalance(playerEmail);
      } else {
        userPoints -= amount;
      }
      statsOverlay.updateStats({ points: userPoints });

      colyseusClient.contributeFuel(landmarkId, amount);

      const lmConf = LANDMARK_ROSTER[landmarkId] || LANDMARK_ROSTER[landmarkId.replace(/^landmark_/, "")];
      const lmName = lmConf?.name || landmarkId;
      showActionToast(`Đã nạp +${amount} Than củi vào ${lmName}! (-${amount} Điểm)`);

      setTimeout(() => {
        openLandmarkModalFor(landmarkId);
      }, 80);
    },
    onFocusLandmark: (x, y) => {
      sceneManager.panTo(x, y, { duration: 1.0, zoom: 0.8 });
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
        showActionToast(show ? "Đã hiển thị lưới Vùng tri thức" : "Đã ẩn lưới Vùng tri thức");
      },
      onToggleFog: (show) => {
        fogOfWarManager.setMistVisible(show);
        showActionToast(show ? "Đã hiển thị Sương Mù Predator" : "Đã tạm ẩn Sương Mù Predator");
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
        showActionToast(mode === "dev" ? "Đã chuyển sang Dev Mode (Tự do đổi trường)" : "Đã chuyển sang Khám Phá Mode (Theo trường sinh viên)");
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
          showActionToast(`Đang giả lập Spawn Bastion Tri Thức (10x10) cho ${playerSchoolId}...`);
        }
      },
      onDevSpawnMegaEmblem: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_spawn_mega_emblem", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Spawn Đại Vùng Tri Thức (100x100) cho ${playerSchoolId}...`);
        }
      },
      onDevBreachCluster: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_breach_cluster", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Giao lưu kiểm tra Cụm cho ${playerSchoolId}...`);
        }
      },
      onDevMaxFortifyAll: () => {
        if (colyseusClient?.room) {
          colyseusClient.room.send("dev_max_fortify_all", { schoolId: playerSchoolId });
          showActionToast(`Đang giả lập Max Củng Cố Toàn Bộ Vùng Tri Thức cho ${playerSchoolId}...`);
        }
      }
    },
    appEl,
    currentGameMode,
    playerEmail
  );

  // Frame update for rotating banners/crystals, animated tile flips and rolling cyber mist
  sceneManager.onFrameUpdate = (delta) => {
    const now = performance.now();
    chunkGridManager.update(delta, now);
    modelLoader.update(delta);
    fogOfWarManager.update(delta, now);
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

        // 1. Reveal HQs and Landmarks vision zones from room state
        if (room.state.hqs) {
          const hqsToReveal: { x: number; y: number }[] = [];
          room.state.hqs.forEach((hq: any) => hqsToReveal.push({ x: hq.x, y: hq.y }));
          fogOfWarManager.revealHQs(hqsToReveal);
        }
        if (room.state.landmarks) {
          const lmsToReveal: { x: number; y: number; width?: number; height?: number }[] = [];
          room.state.landmarks.forEach((lm: any) => {
            const conf = LANDMARK_ROSTER[lm.landmarkKey];
            lmsToReveal.push({ x: lm.x, y: lm.y, width: conf?.footprint.width, height: conf?.footprint.height });
          });
          fogOfWarManager.revealLandmarks(lmsToReveal);
        }
        fogOfWarManager.syncAllClaimedTiles(colyseusClient.landSync.owner);

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
          // Ownership paint comes from land frames (snap/own_batch), not schema.
          miniMap.setLandOwnerBytes(colyseusClient.landSync.owner);
        });
      },
      onHQAdded: (hq) => {
        schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
        fogOfWarManager.revealHQs([{ x: hq.x, y: hq.y }]);
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
      onLandmarkAdded: (lm) => {
        updateMiniMapStatic();
        if (lm) {
          const conf = LANDMARK_ROSTER[lm.landmarkKey];
          fogOfWarManager.revealLandmarks([
            { x: lm.x, y: lm.y, width: conf?.footprint.width, height: conf?.footprint.height }
          ]);
          if ((lm as any).litBySchoolId) {
            modelLoader.setLandmarkBonfire(lm.landmarkKey, (lm as any).litBySchoolId);
          }
        }
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
      onLandmarkLit: (data) => {
        const sc = SCHOOL_ROSTER[data.schoolId];
        const lmConf = LANDMARK_ROSTER[data.landmarkId] || LANDMARK_ROSTER[data.landmarkId.replace(/^landmark_/, "")];
        showActionToast(
          `🔥 ${sc ? sc.name : data.schoolId.toUpperCase()} đã THẮP LỬA thành công ${lmConf ? lmConf.name : data.landmarkId}!`
        );
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === data.landmarkId) {
          openLandmarkModalFor(data.landmarkId);
        }
      },
      onLandmarkChange: (lm) => {
        const lmId = lm.id || lm.landmarkKey;
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === lmId) {
          openLandmarkModalFor(lmId);
        }
      },
      onTileStudied: (data) => {
        if (data.schoolId === playerSchoolId) {
          showActionToast(`Đã ôn bài thành công tại (${data.x}, ${data.y})! Độ bền tri thức: ${data.retention}/100`);
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
        miniMap.setLandOwnerBytes(colyseusClient.landSync.owner);
      },
      onLandSync: (info) => {
        // Wire dense owner bytes into the minimap (S2.4) — no 1e6 tile objects.
        miniMap.setLandOwnerBytes(colyseusClient.landSync.owner);
        if (info.kind === "snap") {
          statsOverlay.updateTerritory(colyseusClient.territoryCounts);
          fogOfWarManager.syncAllClaimedTiles(colyseusClient.landSync.owner);
        } else if (info.kind === "own_batch") {
          statsOverlay.updateTerritory(colyseusClient.territoryCounts);
          if (info.dirtyTiles) {
            for (const change of info.dirtyTiles) {
              if (change.owner > 0) {
                fogOfWarManager.revealClaimedTile(change.x, change.y, true);
              }
            }
          }
        }
      },
      onLandAck: (ack) => {
        if (!ack.ok && ack.reason) {
          showActionToast(ack.reason, "warning");
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
  // Helper to find landmark at coords
  function getLandmarkAt(x: number, y: number) {
    if (!colyseusClient?.room?.state?.landmarks) return null;
    let found: { config: any; name: string; landmarkId: string; landmarkKey: string; state: any } | null = null;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      const conf = LANDMARK_ROSTER[lm.landmarkKey];
      const w = conf?.footprint.width || 14;
      const h = conf?.footprint.height || 12;
      if (x >= lm.x && x < lm.x + w && y >= lm.y && y < lm.y + h) {
        found = {
          config: conf,
          name: conf?.name || lm.landmarkKey,
          landmarkId: lm.id || lm.landmarkKey,
          landmarkKey: lm.landmarkKey,
          state: lm
        };
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

  function isAdjacentToSchool(x: number, y: number, schoolId: string): boolean {
    return colyseusClient.isAdjacentToSchool(x, y, schoolId);
  }

  // 6. Raycast Hover & Click Handlers
  sceneManager.onTileHover = (x, y, screenX, screenY) => {
    if (!colyseusClient.room) return;
    // LandState data plane overlay (T4): authoritative owner/combat when present.
    const landCombat = colyseusClient.getTileCombatInfo(x, y);
    const landOwnerSchoolId = colyseusClient.getTileOwnerSchoolId(x, y);

    // Check if within any landmark footprint
    let landmarkName: string | undefined;
    let landmarkConfig: any = null;
    let landmarkState: any = null;
    let isCore = false;

    const lmFound = getLandmarkAt(x, y);
    if (lmFound) {
      landmarkName = lmFound.name;
      landmarkConfig = lmFound.config;
      landmarkState = lmFound.state;
      const w = lmFound.config?.footprint.width || 14;
      const h = lmFound.config?.footprint.height || 12;
      const coreX = lmFound.state.x + Math.floor(w / 2);
      const coreY = lmFound.state.y + Math.floor(h / 2);
      if (x === coreX && y === coreY) {
        isCore = true;
      }
    }

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

    const resolvedOwnerId = landOwnerSchoolId;
    const ownerConfig = resolvedOwnerId ? SCHOOL_ROSTER[resolvedOwnerId] : null;
    const ownerSchoolName = ownerConfig ? ownerConfig.name : (landmarkName ? "Cứ điểm Trung Lập" : null);
    const ownerColor = ownerConfig ? ownerConfig.colorHex : undefined;
    const isOwnedByMe = resolvedOwnerId === playerSchoolId;
    const isEnemyControlled = !!resolvedOwnerId && resolvedOwnerId !== "" && !isOwnedByMe;
    const isAdjacent = isAdjacentToSchool(x, y, playerSchoolId);
    const isExchangeZone = isEnemyControlled && isAdjacent;

    const cost = 1;
    const hp = landCombat?.hp;
    const maxHp = landCombat?.maxHp;
    const defenseTier = landCombat?.defenseTier;
    const isRevealed = fogOfWarManager.isRevealed(x, y);

    // Landmark Bonfire info
    let litBySchoolName: string | null = null;
    let litBySchoolColor: string | undefined = undefined;
    let currentFuel = 0;
    let maxFuel = 500;
    let isLit = false;

    if (landmarkState) {
      currentFuel = landmarkState.currentFuel || 0;
      maxFuel = landmarkState.maxFuel || 500;
      if (landmarkState.litBySchoolId && landmarkState.litBySchoolId !== "") {
        isLit = true;
        const litSc = SCHOOL_ROSTER[landmarkState.litBySchoolId];
        litBySchoolName = litSc ? litSc.name : landmarkState.litBySchoolId.toUpperCase();
        litBySchoolColor = litSc ? litSc.colorHex : undefined;
      }
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
          isEnemyControlled,
          isAdjacent,
          isExchangeZone,
          retention: hp,
          maxRetention: maxHp,
          hp,
          maxHp,
          defenseTier,
          isCore,
          buffDescription: landmarkConfig?.buffDescription,
          isFogCovered: !isRevealed,
          isLandmark: !!landmarkName,
          litBySchoolName,
          litBySchoolColor,
          currentFuel,
          maxFuel,
          isLit
        },
        screenX,
        screenY
      );
    }
  };

  sceneManager.onTileLeave = () => {
    tileTooltip.hide();
  };

  // Evaluate smart context for a given tile
  function evaluateTileContext(x: number, y: number, modeOverride?: ActionMode) {
    const ownerSchool = colyseusClient.getTileOwnerSchoolId(x, y);
    const isOwnedByMe = ownerSchool === playerSchoolId;
    const isOwnedByEnemy = !!ownerSchool && ownerSchool !== "" && !isOwnedByMe;
    const isAdjacent = isAdjacentToSchool(x, y, playerSchoolId);

    const lm = getLandmarkAt(x, y);
    const landmarkName = lm?.name || getHQNameAt(x, y) || undefined;
    const landmarkId = lm?.landmarkId;

    const ownerConfig = ownerSchool ? SCHOOL_ROSTER[ownerSchool] : null;
    const ownerName = ownerConfig ? ownerConfig.name : (landmarkName ? "Vùng tri thức chưa khám phá" : "Vùng tri thức chưa khám phá");
    const ownerColor = ownerConfig ? ownerConfig.colorHex : "#94a3b8";

    // Auto infer mode if not overridden
    let mode: 'explore' | 'study' | 'bonfire';
    if (modeOverride) {
      if (modeOverride === "claim" || modeOverride === "explore") mode = "explore";
      else if (modeOverride === "fortify" || modeOverride === "attack" || modeOverride === "study") mode = "study";
      else if (modeOverride === "bonfire") mode = "bonfire";
      else mode = "explore";
    } else {
      if (lm) mode = "bonfire";
      else if (isOwnedByMe || isOwnedByEnemy) mode = "study";
      else mode = "explore";
    }

    let cost = 1;
    let title = "Khám phá tri thức";
    let actionTitle = "XÁC NHẬN KHÁM PHÁ";
    let description = "Khám phá mở rộng Vùng tri thức hoang sơ tiếp giáp";
    let canExecute = true;
    let reasonDisabled: string | undefined;

    if (mode === "explore") {
      cost = ACTION_MODES.explore.cost;
      title = "Khám phá tri thức";
      actionTitle = landmarkName ? `KHÁM PHÁ ${landmarkName.toUpperCase()} (${cost}đ)` : `XÁC NHẬN KHÁM PHÁ (${cost}đ)`;
      description = landmarkName ? `Hành trình mở đường tới ${landmarkName}` : "Khám phá mở rộng Vùng tri thức hoang sơ tiếp giáp";
      if (isOwnedByMe) {
        canExecute = false;
        reasonDisabled = "Vùng này đã thuộc quyền kiểm soát của trường bạn";
      } else if (isOwnedByEnemy) {
        canExecute = false;
        reasonDisabled = "Vùng này đang thuộc trường khác, hãy dùng chế độ ÔN BÀI để giao lưu tri thức";
      } else if (!isAdjacent) {
        canExecute = false;
        reasonDisabled = "Chỉ có thể khám phá các ô liền kề với trường bạn";
      } else if (userPoints < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm (points) để khám phá`;
      }
    } else if (mode === "study") {
      cost = ACTION_MODES.study.cost;
      title = "Ôn bài & Giao lưu tri thức";
      if (isOwnedByMe) {
        actionTitle = `ÔN BÀI CỦNG CỐ (${cost}đ)`;
        description = "Ôn bài tăng Độ bền tri thức (Retention) cho ô trường bạn";
      } else if (isOwnedByEnemy) {
        actionTitle = `GIAO LƯU TRI THỨC (${cost}đ)`;
        description = `Giao lưu tri thức làm xói mòn retention của ${ownerConfig?.shortName || ownerSchool?.toUpperCase() || "đối thủ"}`;
        if (!isAdjacent) {
          canExecute = false;
          reasonDisabled = "Chỉ có thể giao lưu tại các ô tiếp giáp với trường bạn";
        }
      } else {
        actionTitle = `ÔN BÀI KHAI PHÁ (${cost}đ)`;
        description = "Ôn bài khai phá vùng tri thức hoang sơ tiếp giáp";
        if (!isAdjacent) {
          canExecute = false;
          reasonDisabled = "Chỉ có thể ôn bài tại các ô tiếp giáp với trường bạn";
        }
      }

      if (userPoints < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm (points) để ôn bài`;
      }
    } else if (mode === "bonfire") {
      cost = ACTION_MODES.bonfire.cost;
      title = "Thắp lửa Công trình";
      actionTitle = landmarkName ? `THẮP LỬA ${landmarkName.toUpperCase()}` : "THẮP LỬA CÔNG TRÌNH";
      description = "Mở Modal Thắp lửa Công trình bằng Than củi quy đổi từ Điểm";
      canExecute = true;
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
      landmarkId,
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

    const { x, y, mode, cost, landmarkName, landmarkId } = ctx;

    if (mode === "bonfire") {
      const targetId = landmarkId || getNearestLandmark()?.id || getNearestLandmark()?.landmarkKey;
      if (targetId) {
        openLandmarkModalFor(targetId);
      } else {
        showActionToast("Không tìm thấy Công trình lân cận!", "warning");
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

    if (mode === "explore") {
      colyseusClient.claimTile(x, y);
      showActionToast(
        landmarkName
          ? `Đã mở đường khám phá ${landmarkName}! -${cost} điểm (points)`
          : `Đã khai phá thành công Vùng tri thức (${x}, ${y})! -${cost} điểm (points)`
      );
    } else if (mode === "study") {
      colyseusClient.studyTile(x, y, 1);
      const isOwnedByMe = colyseusClient.getTileOwnerSchoolId(x, y) === playerSchoolId;
      const isOwnedByEnemy = !!colyseusClient.getTileOwnerSchoolId(x, y) && !isOwnedByMe;
      if (isOwnedByMe) {
        showActionToast(`Đã ôn bài củng cố tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
      } else if (isOwnedByEnemy) {
        showActionToast(`Đã giao lưu tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
      } else {
        showActionToast(`Đã ôn bài khai phá tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
      }
    }
  }

  actionDock.onToggleSmart = (enabled) => {
    showActionToast(
      enabled
        ? "Đã bật chế độ Tự Động (Smart Context Action)"
        : "Đã chuyển sang chế độ Thủ Công (Manual Mode)"
    );
  };

  actionDock.onBonfireAction = () => {
    const nearest = getNearestLandmark();
    if (nearest) {
      openLandmarkModalFor(nearest.id || nearest.landmarkKey);
      sceneManager.panTo(nearest.x, nearest.y, { duration: 0.9, zoom: 0.8 });
    } else {
      showActionToast("Chưa có Công trình nào xuất hiện trên bản đồ!", "warning");
    }
  };

  sceneManager.onMissClick = () => {
    if (selectedMobileTile) {
      clearSelectedTile();
    }
  };

  // 6. Action Execution Handler: Desktop 1-Click vs Mobile 1-Tap Select -> 2-Tap Execute
  sceneManager.onTileClick = (event: TileClickEvent) => {
    const { x, y } = event;

    // Direct click on any Landmark footprint opens the LandmarkModal immediately!
    const lm = getLandmarkAt(x, y);
    if (lm) {
      openLandmarkModalFor(lm.landmarkId || lm.landmarkKey);
      sceneManager.setSelectedTileMarker(x, y, "#ff8c00");
      setTimeout(() => sceneManager.clearSelectedTileMarker(), 850);
      return;
    }

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

    const markerColor = ctx.mode === "study" ? "#10b981" : ctx.mode === "bonfire" ? "#ff8c00" : "#00ffe8";

    if (!isMobile) {
      // DESKTOP: 1-Click direct execution (Fast & fluid)
      actionDock.setMode(ctx.mode);
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
