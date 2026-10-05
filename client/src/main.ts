import { BEACON_CRYSTALS, beaconOvertakeTarget } from "../../shared/constants/gameplay";
import * as THREE from "three";
import { ChunkGridManager } from "./engine/chunkGridManager";
import { NatureGridManager } from "./engine/natureGridManager";
import { ModelLoader } from "./engine/modelLoader";
import { SceneManager, TileClickEvent } from "./engine/sceneManager";
import { BorderFlagManager } from "./engine/borderFlagManager";
import { SupplyDropManager } from "./engine/supplyDropManager";
import { MegaEmblemManager } from "./engine/megaEmblemManager";
import { FogOfWarManager } from "./engine/fogOfWarManager";
import { ColyseusClient } from "./network/colyseusClient";
import { StatsOverlay } from "./ui/statsOverlay";
import { StudentActionDock, ACTION_MODES, ActionMode } from "./ui/studentActionDock";
import { TileTooltip } from "./ui/tileTooltip";
import { UniStopModal } from "./ui/uniStopModal";
import { FirstLandmarkCard } from "./ui/firstLandmarkCard";
import { firstLandmarkGoal } from "../../shared/engine/studentGuidance";
import { MiniMap } from "./ui/miniMap";
import type { MapEditorPanel } from "./ui/mapEditorPanel";
import type { DevToolsPanel } from "./ui/devToolsPanel";
import { LandmarkModal, LandmarkModalData } from "./ui/landmarkModal";
import { CarouselModal } from "./ui/carouselModal";
import { NotificationBanner } from "./ui/notificationBanner";
import { DEFAULT_NOTIFICATIONS, formatNotificationText, getNotificationTemplate } from "../../shared/constants/notifications";

import { GameMode } from "../../shared/types";
import { LANDMARK_HINTS } from "../../shared/constants/landmarkPuzzle";
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

  const currentGameMode: GameMode = modeParam === "dev" || (modeParam !== "normal" && Boolean(devParam)) ? "dev" : "normal";
  const RunningDatabase = currentGameMode === "dev" ? (await import("./dev/runningDatabase")).RunningDatabase : undefined;
  let playerEmail = emailParam || (currentGameMode === "normal" ? "sinhvien01@hcmut.edu.vn" : "");
  
  // Running points & personal crystals
  let userPoints = 500;
  let userCrystals = 0;
  if (currentGameMode === "dev" && playerEmail) {
    let initialKm = 50;
    if (kmParam) {
      const parsedKm = parseFloat(kmParam);
      if (!isNaN(parsedKm) && parsedKm >= 0) initialKm = parsedKm;
    } else if (currentGameMode === "dev" && pointsParam) {
      const parsedPts = parseInt(pointsParam, 10);
      if (!isNaN(parsedPts) && parsedPts >= 0) initialKm = parsedPts;
    }
    RunningDatabase.getOrCreate(playerEmail, initialKm);
    if (kmParam && !isNaN(parseFloat(kmParam))) {
      RunningDatabase.updateKm(playerEmail, parseFloat(kmParam));
    }
    userPoints = RunningDatabase.getStudentBalance(playerEmail);
  } else if (currentGameMode === "dev" && kmParam) {
    const km = parseFloat(kmParam);
    if (!isNaN(km) && km >= 0) userPoints = Math.round(km);
  } else if (currentGameMode === "dev" && pointsParam) {
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

  let playerHQCoords: { x: number; y: number } | null = null;
  const schoolHQMap = new Map<string, { x: number; y: number }>();

  // 1. Initialize Engine subsystems
  const fogOfWarManager = new FogOfWarManager();
  const chunkGridManager = new ChunkGridManager();
  chunkGridManager.setFogOfWar(fogOfWarManager);

  const natureGridManager = new NatureGridManager();
  natureGridManager.setFogOfWar(fogOfWarManager);

  const modelLoader = new ModelLoader();
  modelLoader.setFogOfWar(fogOfWarManager);

  const borderFlagManager = new BorderFlagManager();
  borderFlagManager.setFogOfWar(fogOfWarManager);

  const supplyDropManager = new SupplyDropManager();
  supplyDropManager.setFogOfWar(fogOfWarManager);

  const megaEmblemManager = new MegaEmblemManager();
  const sceneManager = new SceneManager(container, chunkGridManager);

  // Expose Three.js scene, library and subsystems to window for console inspection & debugging
  (window as any).__THREE_SCENE__ = sceneManager.scene;
  (window as any).scene = sceneManager.scene;
  (window as any).THREE = THREE;
  (window as any).fogOfWarManager = fogOfWarManager;
  (window as any).supplyDropManager = supplyDropManager;

  // Add render groups to scene
  sceneManager.scene.add(chunkGridManager.group);
  sceneManager.scene.add(natureGridManager.group);
  sceneManager.scene.add(modelLoader.group);
  sceneManager.scene.add(borderFlagManager.group);
  sceneManager.scene.add(supplyDropManager.group);
  sceneManager.scene.add(megaEmblemManager.group);
  sceneManager.scene.add(fogOfWarManager.group);

  // Build baseline nature vegetation immediately so map is vibrant from frame 1
  natureGridManager.buildProps();
  let isSessionReplaced = false;

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
    crystals: userCrystals,
    mode: currentGameMode,
    studentEmail: playerEmail,
    displayName: playerEmail ? playerEmail.split('@')[0] : undefined,
    isLocked: currentGameMode === "normal"
  });
  const actionDock = new StudentActionDock(appEl);
  actionDock.updateResources(userPoints, userCrystals);
  const carouselModal = new CarouselModal();
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
  const uniStopModal = new UniStopModal(id => {
    if (!isSessionReplaced && colyseusClient?.room) colyseusClient.rollUniStop(id);
  }, appEl);
  const firstLandmarkCard = new FirstLandmarkCard(id => {
    if (isSessionReplaced) return;
    const lm = colyseusClient?.room?.state.landmarks.get(id);
    if (!lm) return;
    const footprint = LANDMARK_ROSTER[lm.landmarkKey || lm.id]?.footprint || { width: 40, height: 40 };
    const x = lm.x + (footprint.width - 1) / 2, y = lm.y + (footprint.height - 1) / 2;
    sceneManager.panTo(x, y, { duration: 0.8, zoom: 0.8 });
    sceneManager.setSelectedTileMarker(Math.floor(x), Math.floor(y), "#00ffe8");
    setTimeout(() => sceneManager.clearSelectedTileMarker(), 1200);
  }, appEl);
  function uniStopView(stop: any) {
    const profile = colyseusClient?.currentProfile;
    return {
      id: stop.id, tier: stop.tier, ownerSchoolId: stop.ownerSchoolId || "",
      schoolId: profile?.schoolId || playerSchoolId,
      cooldownUntil: profile?.unistopCooldowns?.[stop.id] || 0,
      profileReady: !!profile, hasWeeklyRunningPoints: !!profile?.hasWeeklyRunningPoints
    };
  }
  function refreshStudentGuidance() {
    const state = colyseusClient?.room?.state;
    if (!state || isSessionReplaced) { firstLandmarkCard.update(); uniStopModal.close(); return; }
    if (uniStopModal.isOpen()) {
      const stop = state.unistops.get(uniStopModal.getStopId());
      if (stop) uniStopModal.update(uniStopView(stop)); else uniStopModal.close();
    }
    const school = colyseusClient.currentProfile?.schoolId || playerSchoolId;
    const hq = state.hqs.get(school);
    const goals = Array.from(state.landmarks.values()).map((lm: any) => {
      const footprint = LANDMARK_ROSTER[lm.landmarkKey || lm.id]?.footprint || { width: 40, height: 40 };
      return { id: lm.id, landmarkKey: lm.landmarkKey || lm.id, x: lm.x, y: lm.y, ...footprint };
    });
    const goal = firstLandmarkGoal(hq, goals);
    if (!goal) { firstLandmarkCard.update(); return; }
    const lm = state.landmarks.get(goal.id);
    if (!lm) { firstLandmarkCard.update(); return; }
    let hasPath = false;
    // Inspect this landmark's perimeter, never the full million-tile map.
    for (let x = goal.x - 1; x <= goal.x + goal.width && !hasPath; x++) {
      for (let y = goal.y - 1; y <= goal.y + goal.height; y++) {
        if (x >= goal.x && x < goal.x + goal.width && y >= goal.y && y < goal.y + goal.height) continue;
        if (colyseusClient.hasSchoolKnowledge(x, y, school)) { hasPath = true; break; }
      }
    }
    const guessed = !!lm.guessedSchools?.get(school);
    const target = lm.buffActive && lm.litBySchoolId && lm.litBySchoolId !== school
      ? beaconOvertakeTarget(lm.crystalsBySchool?.get(lm.litBySchoolId) || BEACON_CRYSTALS)
      : Math.max(BEACON_CRYSTALS, lm.maxCrystals || BEACON_CRYSTALS);
    firstLandmarkCard.update({
      id: goal.id, name: guessed ? LANDMARK_ROSTER[goal.landmarkKey]?.name || "Công trình đã giải đố" : "Công trình bí ẩn",
      distance: goal.distance, hasPath, guessed, litBySchool: lm.buffActive && lm.litBySchoolId === school,
      crystals: lm.crystalsBySchool?.get(school) || 0, targetCrystals: target
    });
  }
  let guidanceRefreshQueued = false;
  function scheduleStudentGuidance() {
    if (guidanceRefreshQueued) return;
    guidanceRefreshQueued = true;
    setTimeout(() => { guidanceRefreshQueued = false; refreshStudentGuidance(); }, 250);
  }

  // Helper to sync HQ coordinates map from room state
  function updateHQMapFromRoom() {
    if (colyseusClient?.room?.state?.hqs) {
      colyseusClient.room.state.hqs.forEach((hq: any) => {
        schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
      });
    }
  }

  // Helper to count how many landmarks are lit by player's school
  function updateSchoolLitLandmarksCount() {
    if (!colyseusClient?.room?.state?.landmarks) return;
    let count = 0;
    colyseusClient.room.state.landmarks.forEach((lm: any) => {
      if (lm.litBySchoolId && lm.litBySchoolId === playerSchoolId) {
        count++;
      }
    });
    statsOverlay.updateLitLandmarks(count);
  }

  // Mobile Selected Tile State: 1-Tap Select -> 2nd Tap on SAME tile Executes!
  let selectedMobileTile: { x: number; y: number; timestamp: number } | null = null;

  function clearSelectedTile() {
    selectedMobileTile = null;
    tileTooltip.hide();
    sceneManager.clearSelectedTileMarker();
  }

  // Fly to Player HQ handler (Click card, click button or press [H] / [Space])
  function flyToPlayerHQ() {
    if (isSessionReplaced) return;
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
    if (isSessionReplaced || currentGameMode !== "dev" || !RunningDatabase) return;
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
      displayName: playerEmail ? playerEmail.split('@')[0] : undefined,
      points: userPoints,
      isLocked: false
    });
    actionDock.setPoints(userPoints);

    // 2. Cập nhật DevTools dropdown nếu có
    if (devTools) {
      devTools?.setSelectedAccount(playerEmail);
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
  const databaseModal = currentGameMode === "dev" ? new (await import("./ui/databaseModal")).DatabaseModal({
    onSelectStudent: (student) => {
      if (isSessionReplaced) return;
      loginAsStudent(student.email, student.schoolId, student.km);
    },
    onOpenNewTab: (schoolId, email, km) => {
      if (isSessionReplaced) return;
      const url = new URL(window.location.href);
      url.searchParams.set("school", schoolId);
      if (email) url.searchParams.set("email", email);
      if (km) url.searchParams.set("km", km.toString());
      url.searchParams.set("mode", currentGameMode);
      window.open(url.toString(), "_blank");
      showActionToast(`Đang mở phiên mới cho ${schoolId.toUpperCase()} trong tab mới...`);
    },
    onStudentUpdated: (student) => {
      if (isSessionReplaced) return;
      if (playerEmail && student.email.toLowerCase() === playerEmail.toLowerCase()) {
        userPoints = RunningDatabase.getStudentBalance(playerEmail);
        statsOverlay.updateStats({ points: userPoints });
        showActionToast(`Đã đồng bộ điểm giải chạy: ${userPoints} điểm (${student.km} km)`);
      }
    }
  }) : undefined;

  // Helper to open Landmark Beacon Modal for a specific landmark
  function openLandmarkModalFor(landmarkId: string) {
    if (isSessionReplaced) return;
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
    const footprint = config?.footprint || { width: 40, height: 40 };
    const buffDescription = config?.buffDescription || "Tăng cường năng lực tri thức cho học viện kiểm soát.";
    const gameplayRole = config?.gameplayRole || "strategic_monument";

    const crystalsBySchool: Record<string, number> = {};
    const crystalMap = targetLM.crystalsBySchool || targetLM.fuelBySchool;
    if (crystalMap) {
      if (typeof crystalMap.forEach === "function") {
        crystalMap.forEach((val: number, key: string) => {
          crystalsBySchool[key] = val;
        });
      } else {
        for (const [k, v] of Object.entries(crystalMap)) {
          crystalsBySchool[k] = Number(v);
        }
      }
    }

    const curCrystals = targetLM.currentCrystals !== undefined ? targetLM.currentCrystals : (targetLM.currentFuel || 0);
    const maxCrystals = targetLM.maxCrystals || BEACON_CRYSTALS;

    let guessCooldownUntil = 0;
    const targetKey = targetLM.id || lmKey;
    const profileCd = colyseusClient?.currentProfile?.guessCooldowns;
    if (profileCd) {
      if (typeof (profileCd as any).get === "function") {
        guessCooldownUntil = (profileCd as any).get(targetKey) || (profileCd as any).get(lmKey) || 0;
      } else {
        guessCooldownUntil = profileCd[targetKey] || profileCd[lmKey] || 0;
      }
    }
    if (!guessCooldownUntil) {
      const player = colyseusClient?.room?.sessionId ? colyseusClient.room.state.players?.get?.(colyseusClient.room.sessionId) : null;
      if (player?.guessCooldowns) {
        guessCooldownUntil = player.guessCooldowns.get ? (player.guessCooldowns.get(targetKey) || player.guessCooldowns.get(lmKey) || 0) : (player.guessCooldowns[targetKey] || 0);
      }
    }

    const currentPoints = colyseusClient?.currentProfile?.points !== undefined ? colyseusClient.currentProfile.points : userPoints;
    const currentCrystals = colyseusClient?.currentProfile?.crystals !== undefined ? colyseusClient.currentProfile.crystals : userCrystals;

    const data: LandmarkModalData = {
      landmarkId: targetLM.id || lmKey,
      landmarkKey: lmKey,
      hint: LANDMARK_HINTS[lmKey],
      name,
      category,
      footprint,
      buffDescription,
      gameplayRole,
      x: targetLM.x,
      y: targetLM.y,
      currentCrystals: curCrystals,
      maxCrystals,
      litBySchoolId: targetLM.litBySchoolId || "",
      buffActive: targetLM.buffActive || false,
      crystalsBySchool,
      userPoints: currentPoints,
      userCrystals: currentCrystals,
      playerSchoolId,
      nameGuessed: !!targetLM.nameGuessed,
      guessedBySchoolId: targetLM.guessedBySchoolId || "",
      guessedSchools: targetLM.guessedSchools,
      guessCooldownUntil,
      currentFuel: curCrystals,
      maxFuel: maxCrystals,
      fuelBySchool: crystalsBySchool
    };

    landmarkModal.show(data);
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

  function handleConvertPoints(amount: number) {
    if (isSessionReplaced) return;
    const curPts = colyseusClient?.currentProfile?.points !== undefined ? colyseusClient.currentProfile.points : userPoints;
    if (curPts < amount) {
      showActionToast(`Không đủ Điểm Tri Thức! Bạn cần ít nhất ${amount} Điểm Tri Thức để quy đổi.`, "warning");
      return;
    }
    colyseusClient.send("convert_points", { points: amount });
    if (currentGameMode === "dev" && playerEmail) {
      RunningDatabase.deductPoints(playerEmail, amount);
      userPoints = RunningDatabase.getStudentBalance(playerEmail);
    } else {
      userPoints = Math.max(0, userPoints - amount);
    }
    userCrystals += amount;
    if (colyseusClient?.currentProfile) {
      colyseusClient.currentProfile.points = userPoints;
      colyseusClient.currentProfile.crystals = userCrystals;
    }
    statsOverlay.updateStats({ points: userPoints, crystals: userCrystals });
    actionDock.updateResources(userPoints, userCrystals);

    const activeLmId = landmarkModal.getCurrentLandmarkId();
    if (landmarkModal.isVisible() && activeLmId) {
      openLandmarkModalFor(activeLmId);
    }
    showActionToast(`Đã quy đổi: ${amount} Điểm Tri Thức ➔ +${amount} Tinh Thể thành công!`, "success");
  }

  // Initialize Landmark Beacon Modal
  const landmarkModal = new LandmarkModal({
    onContributeCrystal: (landmarkId, amount) => {
      if (isSessionReplaced) return;
      const curPts = colyseusClient?.currentProfile?.points !== undefined ? colyseusClient.currentProfile.points : userPoints;
      const curCrys = colyseusClient?.currentProfile?.crystals !== undefined ? colyseusClient.currentProfile.crystals : userCrystals;
      const totalAvailable = curCrys + curPts;
      if (totalAvailable < amount) {
        showActionToast(`Không đủ tài nguyên! Cần ${amount} Tinh thể hoặc Điểm để nạp.`, "warning");
        return;
      }

      if (userCrystals >= amount) {
        userCrystals -= amount;
      } else {
        const neededPoints = amount - userCrystals;
        userCrystals = 0;
        if (playerEmail) {
          RunningDatabase.deductPoints(playerEmail, neededPoints);
          userPoints = RunningDatabase.getStudentBalance(playerEmail);
        } else {
          userPoints -= neededPoints;
        }
      }
      if (colyseusClient?.currentProfile) {
        colyseusClient.currentProfile.points = userPoints;
        colyseusClient.currentProfile.crystals = userCrystals;
      }
      statsOverlay.updateStats({ points: userPoints, crystals: userCrystals });
      actionDock.updateResources(userPoints, userCrystals);

      colyseusClient.contributeCrystal(landmarkId, amount);

      const lmConf = LANDMARK_ROSTER[landmarkId] || LANDMARK_ROSTER[landmarkId.replace(/^landmark_/, "")];
      const lmName = "Công trình";
      showActionToast(`Đã nạp +${amount} Tinh thể vào ${lmName}!`);

      setTimeout(() => {
        openLandmarkModalFor(landmarkId);
      }, 80);
    },
    onContributeFuel: (landmarkId, amount) => {
      if (isSessionReplaced) return;
      colyseusClient.contributeCrystal(landmarkId, amount);
    },
    onGuessLandmark: (landmarkId, guess) => {
      if (isSessionReplaced) return;
      colyseusClient.guessLandmark(landmarkId, guess);
      showActionToast(`Đang gửi dự đoán tên công trình: "${guess}"...`);
    },
    onFocusLandmark: (x, y) => {
      if (isSessionReplaced) return;
      sceneManager.panTo(x, y, { duration: 1.0, zoom: 0.8 });
    },
    onConvertPoints: (amount: number) => {
      if (isSessionReplaced) return;
      handleConvertPoints(amount);
    }
  });

  landmarkModal.onConvertPoints = (amount: number) => {
    if (isSessionReplaced) return;
    handleConvertPoints(amount);
  };

  function showSessionReplacedModal(customMessage?: string) {
    uniStopModal.close();
    firstLandmarkCard.update();
    isSessionReplaced = true;
    if (colyseusClient) {
      colyseusClient.isSessionReplaced = true;
    }

    if (landmarkModal.isVisible()) {
      landmarkModal.close();
    }
    if (carouselModal.isOpen()) {
      carouselModal.close();
    }

    let modalEl = document.getElementById("session-replaced-modal");
    if (!modalEl) {
      modalEl = document.createElement("div");
      modalEl.id = "session-replaced-modal";
      modalEl.className = "session-replaced-overlay";
      modalEl.setAttribute("data-ui", "true");
      modalEl.innerHTML = `
        <div class="session-replaced-card">
          <div class="session-replaced-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 class="session-replaced-title">Tài khoản đã đăng nhập ở nơi khác</h2>
          <p class="session-replaced-desc" id="session-replaced-desc-text"></p>
          <div class="session-replaced-actions">
            <button type="button" class="session-replaced-reload-btn" id="session-replaced-reload-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Tải lại trang
            </button>
          </div>
        </div>
      `;

      const stopProp = (e: Event) => e.stopPropagation();
      modalEl.addEventListener("pointerdown", stopProp);
      modalEl.addEventListener("pointerup", stopProp);
      modalEl.addEventListener("mousedown", stopProp);
      modalEl.addEventListener("mouseup", stopProp);
      modalEl.addEventListener("touchstart", stopProp);
      modalEl.addEventListener("touchend", stopProp);
      modalEl.addEventListener("click", stopProp);

      document.body.appendChild(modalEl);

      const reloadBtn = modalEl.querySelector("#session-replaced-reload-btn");
      if (reloadBtn) {
        reloadBtn.addEventListener("click", () => {
          window.location.reload();
        });
      }
    }

    const descEl = modalEl.querySelector("#session-replaced-desc-text");
    if (descEl) {
      descEl.textContent = customMessage || "Phiên làm việc của tài khoản này đã được bắt đầu trên một tab hoặc thiết bị khác. Vui lòng tải lại trang để tiếp tục trải nghiệm trên phiên này.";
    }
  }

  // Initialize Notification Studio Modal
  const notificationStudioModal = currentGameMode === "dev" ? new (await import("./ui/notificationStudioModal")).NotificationStudioModal() : undefined;
  (window as any).NotificationBanner = NotificationBanner;
  (window as any).notificationStudioModal = notificationStudioModal;

  if (currentGameMode === "dev" && (urlParams.get("notifStudio") === "open" || urlParams.get("studio") === "open")) {
    notificationStudioModal?.open();
  }
  if (currentGameMode === "dev" && (urlParams.get("pushBanner") === "test" || urlParams.get("banner") === "test")) {
    NotificationBanner.show({
      title: "CẢNH BÁO: Ô TRI THỨC SẮP MẤT! 🔥",
      body: "Tri thức tại (45, 82) sắp phai. Hãy ôn bài để duy trì kiến thức của trường mình!",
      category: "territory",
      durationMs: 60000
    });
  }

  let mapEditor: MapEditorPanel | undefined;
  if (currentGameMode === "dev") {
  const { MapEditorPanel } = await import("./ui/mapEditorPanel");
  mapEditor = new MapEditorPanel({
    onFocusItem: item => sceneManager.panTo(item.x, item.y, {duration:0.6}),
    onItemRelocated: () => showActionToast("Đã sửa bản nháp. Bấm áp dụng để lưu bố trí."),
    onApplyToServer: layout => colyseusClient.updateMapLayout(layout),
    onImportLayout: layout => mapEditor?.updateData(layout.hqs || [],layout.landmarks || [],layout.unistops || [],layout.chests || []),
    onNotification: (message,type) => showActionToast(message,type === "info" ? "success" : type || "success")
  });
  const editorButton = document.createElement("button");
  editorButton.textContent="Map Editor";
  editorButton.setAttribute("data-ui","true");
  editorButton.style.cssText="position:fixed;right:18px;top:100px;z-index:1000;padding:8px;color:#00ffe8;background:#0f172a;border:1px solid #00ffe8;border-radius:6px;cursor:pointer";
  editorButton.onclick=()=>{
    const s=colyseusClient?.room?.state;
    if (!s) return;
    mapEditor?.updateData(Array.from(s.hqs.values()) as any[],Array.from(s.landmarks.values()) as any[],Array.from(s.unistops.values()) as any[],Array.from(s.chests.values()) as any[]);
    mapEditor?.toggle();
  };
  appEl.appendChild(editorButton);
  }

  // 3. Initialize DevTools Dropdown
  if (currentGameMode === "dev") {
  const { DevToolsPanel } = await import("./ui/devToolsPanel");
  devTools = new DevToolsPanel(
    {
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
        showActionToast(show ? "Đã hiển thị lưới Ô tri thức" : "Đã ẩn lưới Ô tri thức");
      },
      onToggleFog: (show) => {
        fogOfWarManager.setMistVisible(show);
        showActionToast(show ? "Đã hiển thị Sương Mù Predator" : "Đã tạm ẩn Sương Mù Predator");
      },
      onToggleMode: (mode) => {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", mode);
        if (mode === "normal") url.searchParams.delete("dev");
        window.location.assign(url.toString());
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
        databaseModal?.open();
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
          showActionToast(`Đang giả lập Ôn bài toàn bộ Vùng Tri Thức cho ${playerSchoolId}...`);
        }
      },
      onDevResetCooldowns: () => {
        colyseusClient?.resetCooldowns();
        showActionToast("Đã reset cooldown UniStop & thử lại đoán công trình!");
      },
      onDevAddCrystals: (amount = 100) => {
        userCrystals += amount;
        statsOverlay.updateStats({ crystals: userCrystals });
        colyseusClient?.addCrystals(amount);
        showActionToast(`+${amount} Tinh thể kiểm thử!`);
      },
      onDevAddKeys: (aspire = 5, nitro = 5, predator = 5) => {
        colyseusClient?.addKeys(aspire, nitro, predator);
        showActionToast("Đã cộng chìa khóa kiểm thử (5 Aspire, 5 Nitro, 5 Predator)!");
      },
      onSetFogAlpha: (alpha) => fogOfWarManager.setFogAlpha(alpha),
      onSetFogColor: (color) => fogOfWarManager.setFogColor(color),
      onSetTerritoryOpacity: (alpha) => {
        colyseusClient?.setTerritoryTintAlpha(alpha);
      },
      onOpenNotificationStudio: () => {
        notificationStudioModal?.open();
      },
    },
    appEl,
    currentGameMode,
    playerEmail
  );
  }

  // Frame update for rotating banners/crystals, animated tile flips and rolling cyber mist
  sceneManager.onFrameUpdate = (delta) => {
    const now = performance.now();
    chunkGridManager.update(delta, now);
    modelLoader.update(delta);
    supplyDropManager.update(delta);
    fogOfWarManager.update(delta, now);
  };

  // Helper to immediately reveal all 5 HQs and all 10 Landmarks
  function revealAllHQsAndLandmarks(state?: any) {
    const s = state || colyseusClient?.room?.state;
    if (!s) return;

    // 1. Reveal All 5 Headquarters
    if (s.hqs) {
      const hqsToReveal: { schoolId?: string; x: number; y: number }[] = [];
      s.hqs.forEach((hq: any) => {
        if (hq && typeof hq.x === "number" && typeof hq.y === "number") {
          hqsToReveal.push({ schoolId: hq.schoolId, x: hq.x, y: hq.y });
          schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
        }
      });
      if (hqsToReveal.length > 0) {
        fogOfWarManager.revealHQs(hqsToReveal);
      }
    }

    // 2. Reveal All 10 Landmarks
    if (s.landmarks) {
      const lmsToReveal: { x: number; y: number; width?: number; height?: number; solved?: boolean }[] = [];
      s.landmarks.forEach((lm: any, key: string) => {
        if (lm && typeof lm.x === "number" && typeof lm.y === "number") {
          const lmKey = lm.landmarkKey || lm.id || key;
          const conf = LANDMARK_ROSTER[lmKey] || LANDMARK_ROSTER[lmKey?.replace(/^landmark_/, "")];
          lmsToReveal.push({
            x: lm.x,
            y: lm.y,
            width: conf?.footprint?.width || 14,
            height: conf?.footprint?.height || 12,
            solved: !!lm.guessedSchools?.get(playerSchoolId)
          });
        }
      });
      if (lmsToReveal.length > 0) {
        fogOfWarManager.revealLandmarks(lmsToReveal);
      }
    }
  }

  // 4. Initialize Network Client
  colyseusClient = new ColyseusClient(
    chunkGridManager,
    modelLoader,
    natureGridManager,
    {
      onConnected: (room) => {
        (window as any).colyseusClient = colyseusClient;
        console.log(`[App] Joined room: ${room.name}`);
        updateHQMapFromRoom();
        updateMiniMapStatic();

        // 1. Reveal all 5 HQs and all 10 Landmarks vision zones immediately
        revealAllHQsAndLandmarks(room.state);
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
          scheduleStudentGuidance();
          devTools?.setTick(state.currentTick);
          // Ownership paint comes from land frames (snap/own_batch), not schema.
          miniMap.setLandOwnerBytes(colyseusClient.landSync.owner);
        });
      },
      onHQAdded: (hq) => {
        schoolHQMap.set(hq.schoolId, { x: hq.x, y: hq.y });
        fogOfWarManager.revealHQs([{ x: hq.x, y: hq.y }]);
        revealAllHQsAndLandmarks(colyseusClient?.room?.state);
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
      onMapLayoutUpdated: layout => {
        scheduleStudentGuidance();
        fogOfWarManager.resetVision();
        miniMap.setStaticFeatures(layout.hqs || [],layout.landmarks || []);
        miniMap.setUniStops(layout.unistops || []);miniMap.setChests(layout.chests || []);
        for (const stop of layout.unistops || []) supplyDropManager.updateUniStop(stop.id,stop);
        for (const chest of layout.chests || []) supplyDropManager.updateChest(chest.id,chest);
        for (const hq of layout.hqs || []) schoolHQMap.set(hq.schoolId,{x:hq.x,y:hq.y});
        fogOfWarManager.revealHQs(layout.hqs || []);
        fogOfWarManager.revealLandmarks((layout.landmarks || []).map((lm:any)=>({...lm,...LANDMARK_ROSTER[lm.landmarkKey]?.footprint,solved:!!colyseusClient.room?.state.landmarks.get(lm.id)?.guessedSchools?.get(playerSchoolId)})));
        fogOfWarManager.syncAllClaimedTiles(colyseusClient.landSync.owner);
        const ownHQ=(layout.hqs || []).find((h:any)=>h.schoolId===playerSchoolId);
        if (ownHQ) {
          playerHQCoords={x:ownHQ.x,y:ownHQ.y};
          sceneManager.setPlayerHQBeacon(ownHQ.x,ownHQ.y,SCHOOL_ROSTER[playerSchoolId]?.accentHex || "#1488D8");
          miniMap.setPlayerHQ(playerSchoolId,ownHQ.x,ownHQ.y);
        }
        mapEditor?.updateData(layout.hqs || [],layout.landmarks || [],layout.unistops || [],layout.chests || []);
        showActionToast("Đã cập nhật bố trí và footprint gameplay.","success");
      },
      onLandmarkAdded: (lm) => {
        updateMiniMapStatic();
        if (lm) {
          const lmKey = lm.landmarkKey || (lm as any).id;
          const conf = LANDMARK_ROSTER[lmKey] || LANDMARK_ROSTER[lmKey?.replace(/^landmark_/, "")];
          fogOfWarManager.revealLandmarks([
            { x: lm.x, y: lm.y, width: conf?.footprint?.width || 14, height: conf?.footprint?.height || 12 }
          ]);
          if ((lm as any).litBySchoolId) {
            modelLoader.setLandmarkBonfire(lmKey, (lm as any).litBySchoolId);
          }
          updateSchoolLitLandmarksCount();
        }
        revealAllHQsAndLandmarks(colyseusClient?.room?.state);
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
          `⚡ ${sc ? sc.name : data.schoolId.toUpperCase()} đã THẮP SÁNG ĐÈN HIỆU Công trình!`
        );
        landmarkModal.onBeaconLit(data);
        updateSchoolLitLandmarksCount();
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === data.landmarkId) {
          openLandmarkModalFor(data.landmarkId);
        }
      },
      onBeaconLit: (data) => {
        landmarkModal.onBeaconLit(data);
        updateSchoolLitLandmarksCount();
      },
      onCrystalContributed: (data) => {
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === data.landmarkId) {
          openLandmarkModalFor(data.landmarkId);
        }
      },
      onLandmarkGuessed: (data) => {
        const sc = SCHOOL_ROSTER[data.schoolId];
        const schoolName = sc ? sc.name : data.schoolId.toUpperCase();
        showActionToast(`🎉 ${schoolName} đã giải đố thành công ${data.landmarkName}! (+${data.bonusCrystals || 0} Tinh thể)`, "success");
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === data.landmarkId) {
          openLandmarkModalFor(data.landmarkId);
        }
      },
      onLandmarkGuessResult: (data) => {
        if (data.success) {
          showActionToast(`Đoán chính xác! Thưởng +${data.crystalsAwarded || 0} Tinh thể cho trường bạn!`, "success");
        } else {
          showActionToast("Câu trả lời chưa chính xác! Thời gian chờ đoán lại là 10 phút.", "warning");
          if (data.cooldownUntil) {
            landmarkModal.setGuessCooldown(data.cooldownUntil);
            if (colyseusClient?.currentProfile) {
              if (!colyseusClient.currentProfile.guessCooldowns) {
                colyseusClient.currentProfile.guessCooldowns = {};
              }
              const lmId = landmarkModal.getCurrentLandmarkId();
              if (lmId) {
                colyseusClient.currentProfile.guessCooldowns[lmId] = data.cooldownUntil;
              }
            }
          }
        }
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId() === data.landmarkId) {
          openLandmarkModalFor(data.landmarkId);
        }
      },
      onTreasureMapReveal: (data) => {
        showActionToast(`🗺️ Bản đồ kho báu hé lộ Rương ${data.tier?.toUpperCase()} tại toạ độ (${data.x}, ${data.z})!`, "success");
        // Reveal fog of war around chest location
        fogOfWarManager.revealCircle(data.x, data.z, 14);
      },
      onPlayerStateChange: (player) => {
        if (colyseusClient.currentProfile) {
          userPoints = colyseusClient.currentProfile.points;
          userCrystals = colyseusClient.currentProfile.crystals;
          const displayName = colyseusClient.currentProfile.displayName || player.displayName || player.email;
          statsOverlay.updateStats({
            points: userPoints,
            crystals: userCrystals,
            aspireKeys: colyseusClient.currentProfile.aspireKeys,
            nitroKeys: colyseusClient.currentProfile.nitroKeys,
            predatorKeys: colyseusClient.currentProfile.predatorKeys,
            ...(displayName ? { displayName } : {})
          });
          actionDock.updateResources(userPoints, userCrystals, {
            aspire: colyseusClient.currentProfile.aspireKeys,
            nitro: colyseusClient.currentProfile.nitroKeys,
            predator: colyseusClient.currentProfile.predatorKeys
          });
        } else {
          if (player.crystals !== undefined) userCrystals = player.crystals;
          if (player.personalTroops !== undefined && !playerEmail) userPoints = player.personalTroops;
          const displayName = player.displayName || player.email;
          statsOverlay.updateStats({
            points: userPoints,
            crystals: userCrystals,
            aspireKeys: player.aspireKeys,
            nitroKeys: player.nitroKeys,
            predatorKeys: player.predatorKeys,
            ...(displayName ? { displayName } : {})
          });
          actionDock.updateResources(userPoints, userCrystals, {
            aspire: player.aspireKeys,
            nitro: player.nitroKeys,
            predator: player.predatorKeys
          });
        }
        if (landmarkModal.isVisible() && landmarkModal.getCurrentLandmarkId()) {
          openLandmarkModalFor(landmarkModal.getCurrentLandmarkId()!);
        }
      },
      onProfileSync: (profile) => {
        scheduleStudentGuidance();
        userPoints = profile.points;
        userCrystals = profile.crystals;
        if (profile.schoolId && profile.schoolId !== playerSchoolId && currentGameMode !== "normal") {
          playerSchoolId = profile.schoolId;
          statsOverlay.setSchool(playerSchoolId);
        }
        statsOverlay.updateStats({
          points: userPoints,
          crystals: userCrystals,
          aspireKeys: profile.aspireKeys,
          nitroKeys: profile.nitroKeys,
          predatorKeys: profile.predatorKeys,
          displayName: profile.displayName || (profile.email ? profile.email.split('@')[0] : undefined),
          studentEmail: profile.email
        });
        actionDock.updateResources(userPoints, userCrystals, {
          aspire: profile.aspireKeys,
          nitro: profile.nitroKeys,
          predator: profile.predatorKeys
        });
        const activeLmId = landmarkModal.getCurrentLandmarkId();
        if (landmarkModal.isVisible() && activeLmId) {
          openLandmarkModalFor(activeLmId);
        }
      },
      onSessionReplaced: (data) => {
        showSessionReplacedModal(data?.message);
      },
      onUniStopAdded: (stop) => {
        supplyDropManager.addUniStop(stop);
      },
      onUniStopChange: (stop) => {
        supplyDropManager.updateUniStop(stop.id, stop);
        scheduleStudentGuidance();
      },
      onChestAdded: (chest) => {
        supplyDropManager.addChest(chest);
      },
      onChestChange: (chest) => {
        supplyDropManager.updateChest(chest.id, chest);
      },
      onUniStopRolled: (data) => {
        uniStopModal.close();
        if (data.playerPoints !== undefined) {
          userPoints = data.playerPoints;
          if (colyseusClient?.currentProfile) colyseusClient.currentProfile.points = userPoints;
        }
        if (data.playerCrystals !== undefined) {
          userCrystals = data.playerCrystals;
          if (colyseusClient?.currentProfile) colyseusClient.currentProfile.crystals = userCrystals;
        }
        statsOverlay.updateStats({ points: userPoints, crystals: userCrystals });
        actionDock.updateResources(userPoints, userCrystals);
        carouselModal.spin({
          title: `UniStop - ${data.tier?.toUpperCase() || 'ASPIRE'}`,
          subtitle: 'TRẠM TIẾP TẾ TRI THỨC',
          sourceType: 'unistop',
          tier: data.tier || 'aspire',
          items: data.carouselItems || [],
          winningIndex: data.winningIndex ?? 24,
          winningItem: data.winningItem,
          onClaim: (item) => {
            showActionToast(`Đã nhận ${item.name}!`, "success");
          }
        });
      },
      onChestOpened: (data) => {
        if (data.playerPoints !== undefined) {
          userPoints = data.playerPoints;
          if (colyseusClient?.currentProfile) colyseusClient.currentProfile.points = userPoints;
        }
        if (data.playerCrystals !== undefined) {
          userCrystals = data.playerCrystals;
          if (colyseusClient?.currentProfile) colyseusClient.currentProfile.crystals = userCrystals;
        }
        statsOverlay.updateStats({ points: userPoints, crystals: userCrystals });
        actionDock.updateResources(userPoints, userCrystals);
        carouselModal.spin({
          title: `Rương Kho Báu - ${data.tier?.toUpperCase() || 'ASPIRE'}`,
          subtitle: 'KHO BÁU PREDATOR GAMING',
          sourceType: 'chest',
          tier: data.tier || 'aspire',
          items: data.carouselItems || [],
          winningIndex: data.winningIndex ?? 24,
          winningItem: data.winningItem,
          onClaim: (item) => {
            showActionToast(`Đã nhận phần thưởng ${item.name}!`, "success");
          }
        });
      },
      onChestClaimed: (data) => {
        const sc = SCHOOL_ROSTER[data.schoolId];
        showActionToast(`📦 Trường ${sc ? sc.shortName : data.schoolId.toUpperCase()} đã mở một Rương ${data.tier?.toUpperCase()}!`);
      },
      onRealGiftWon: (data) => {
        showActionToast(`🎁 Chúc mừng ${data.displayName || data.studentEmail || data.schoolId.toUpperCase()} vừa trúng QUÀ THẬT: ${data.item?.name}!`, "success");
      },
      onLandmarkChange: (lm) => {
        revealAllHQsAndLandmarks(colyseusClient?.room?.state);
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
      onPointsConverted: (pts, crystals) => {
        showActionToast(`Quy đổi thành công: ${pts} Điểm Tri Thức ➔ +${crystals} Tinh Thể!`, "success");
      },
      onGameplayEvent: (event) => {
        if (event.type === "knowledge.added" && event.payload.shared) {
          showActionToast(`Ô tri thức chung (${event.payload.x}, ${event.payload.y}) đã có thêm tri thức của ${event.payload.schoolId}!`, "success");
        }
      },
      onCampaignRankings: counts => statsOverlay.updateSchoolRankings(counts),
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
        scheduleStudentGuidance();
        miniMap.setKnowledgeSchools(colyseusClient.knowledgeSchools);
        statsOverlay.updateTerritory(territoryCounts);
        miniMap.setLandOwnerBytes(colyseusClient.landSync.owner);
      },
      onLandSync: (info) => {
        scheduleStudentGuidance();
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
        uniStopModal.finishRequest();
        showActionToast(msg, "error");
      },
      onDisconnected: (_code) => {
        uniStopModal.close();
        showActionToast("Mất kết nối server. Đang tự động kết nối lại...", "warning");
      },
      onGameNotification: (data: { templateId: string; vars: Record<string, any>; category?: string }) => {
        // Priority 1: Check active template in notificationStudioModal (LocalStorage)
        let tpl = notificationStudioModal?.getTemplate(data.templateId);
        // Priority 2: Fallback to shared constants
        if (!tpl) {
          tpl = getNotificationTemplate(data.templateId) || DEFAULT_NOTIFICATIONS.find((t) => t.id === data.templateId);
        }
        if (!tpl) {
          console.warn("[App] Notification template not found for id:", data.templateId);
          return;
        }

        const title = formatNotificationText(tpl.titleTemplate, data.vars || {});
        const body = formatNotificationText(tpl.bodyTemplate, data.vars || {});

        NotificationBanner.show({
          title,
          body,
          icon: tpl.icon,
          category: (data.category as any) || tpl.category,
          durationMs: 5000
        });
      },
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
    if (isSessionReplaced) return;
    if (currentGameMode === "normal") {
      showActionToast("Tài khoản sinh viên đã được định danh cố định theo trường!", "warning");
      return;
    }
    playerSchoolId = schoolId;
    colyseusClient.selectSchool(schoolId);
    if (colyseusClient.room) {
      if (!playerEmail) {
        const troops = colyseusClient.currentProfile?.points ?? userPoints;
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
    devTools?.setFps(fps);
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
          name: lm.guessedSchools?.get(playerSchoolId) ? (conf?.name || "Công trình") : "Công trình bí ẩn",
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
  const showTileContext = (x: number, y: number, screenX: number, screenY: number) => {
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
    const isOwnedByMe = colyseusClient.hasSchoolKnowledge(x, y, playerSchoolId);
    const isEnemyControlled = !!resolvedOwnerId && resolvedOwnerId !== "" && !isOwnedByMe;
    const isAdjacent = isAdjacentToSchool(x, y, playerSchoolId);
    const isExchangeZone = isEnemyControlled && isAdjacent;

    const cost = isEnemyControlled ? 3 : 1;
    const hp = landCombat?.hp;
    const maxHp = landCombat?.maxHp;
    const defenseTier = landCombat?.defenseTier;
    const isRevealed = fogOfWarManager.isRevealed(x, y);

    // Landmark Bonfire info
    let litBySchoolName: string | null = null;
    let litBySchoolColor: string | undefined = undefined;
    let currentFuel = 0;
    let maxFuel = BEACON_CRYSTALS;
    let isLit = false;

    if (landmarkState) {
      currentFuel = landmarkState.currentFuel || 0;
      maxFuel = landmarkState.maxFuel || BEACON_CRYSTALS;
      if (landmarkState.litBySchoolId && landmarkState.litBySchoolId !== "") {
        isLit = true;
        const litSc = SCHOOL_ROSTER[landmarkState.litBySchoolId];
        litBySchoolName = litSc ? litSc.name : landmarkState.litBySchoolId.toUpperCase();
        litBySchoolColor = litSc ? litSc.colorHex : undefined;
      }
    }

    const sharedInfo = colyseusClient.getTileSharedInfo(x, y);
    const isShared = !!sharedInfo?.isShared;
    const sharedWithSchoolId = sharedInfo?.sharedWithSchoolId || null;
    const sharedExpiresAt = sharedInfo?.sharedExpiresAt;

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
          isShared,
          sharedWithSchoolId,
          knowledgeSchoolIds: sharedWithSchoolId?.split(",").map(id => id.trim()).filter(Boolean),
          sharedExpiresAt,
          playerSchoolId,
          retention: hp,
          maxRetention: maxHp,
          hp,
          maxHp,
          defenseTier,
          isCore,
          buffDescription: landmarkState?.guessedSchools?.get(playerSchoolId) ? landmarkConfig?.buffDescription : undefined,
          category: landmarkConfig?.category,
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
  };

  sceneManager.onTileHover = (x, y, screenX, screenY) => {
    if (window.innerWidth > 768) showTileContext(x, y, screenX, screenY);
  };
  sceneManager.onTileLeave = () => {
    if (window.innerWidth > 768) tileTooltip.hide();
  };

  // Evaluate smart context for a given tile
  function evaluateTileContext(x: number, y: number, modeOverride?: ActionMode) {
    const ownerSchool = colyseusClient.getTileOwnerSchoolId(x, y);
    const isOwnedByMe = colyseusClient.hasSchoolKnowledge(x, y, playerSchoolId);
    const isOwnedByEnemy = !!ownerSchool && ownerSchool !== "" && !isOwnedByMe;
    const isEnemyControlled = isOwnedByEnemy;
    const isAdjacent = isAdjacentToSchool(x, y, playerSchoolId);

    const lm = getLandmarkAt(x, y);
    const landmarkName = lm?.name || getHQNameAt(x, y) || undefined;
    const landmarkId = lm?.landmarkId;

    const ownerConfig = ownerSchool ? SCHOOL_ROSTER[ownerSchool] : null;
    const ownerName = ownerConfig ? ownerConfig.name : (landmarkName ? "Ô tri thức chưa khám phá" : "Ô tri thức chưa khám phá");
    const ownerColor = ownerConfig ? ownerConfig.colorHex : "#94a3b8";

    // Auto infer mode if not overridden
    let mode: 'explore' | 'study' | 'beacon';
    if (modeOverride) {
      if (modeOverride === "claim" || modeOverride === "explore") mode = "explore";
      else if (modeOverride === "fortify" || modeOverride === "attack" || modeOverride === "study") mode = "study";
      else if (modeOverride === "beacon" || modeOverride === "bonfire") mode = "beacon";
      else mode = "explore";
    } else {
      if (lm) mode = "beacon";
      else if (isOwnedByMe || isOwnedByEnemy) mode = "study";
      else mode = "explore";
    }

    let cost = 1;
    let title = "Khám phá tri thức";
    let actionTitle = "XÁC NHẬN KHÁM PHÁ";
    let description = "Khám phá ô tri thức hoang sơ tiếp giáp";
    let canExecute = true;
    let reasonDisabled: string | undefined;

    if (mode === "explore") {
      cost = ACTION_MODES.explore.cost;
      title = "Khám phá tri thức";
      actionTitle = landmarkName ? `KHÁM PHÁ ${landmarkName.toUpperCase()} (${cost}đ)` : `XÁC NHẬN KHÁM PHÁ (${cost}đ)`;
      description = landmarkName ? `Hành trình mở đường tới ${landmarkName}` : "Khám phá ô tri thức hoang sơ tiếp giáp";
      if (isOwnedByMe) {
        canExecute = false;
        reasonDisabled = "Ô này đã thuộc quyền kiểm soát của trường bạn";
      } else if (isEnemyControlled) {
        canExecute = false;
        reasonDisabled = "Ô này đang thuộc trường khác, hãy dùng chế độ ÔN BÀI để giao lưu tri thức";
      } else if (!isAdjacent) {
        canExecute = false;
        reasonDisabled = "Chỉ có thể khám phá các ô liền kề với trường bạn";
      } else if ((colyseusClient?.currentProfile?.points !== undefined ? colyseusClient.currentProfile.points : userPoints) < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm (points) để khám phá`;
      }
    } else if (mode === "study") {
      cost = isEnemyControlled ? 3 : ACTION_MODES.study.cost;
      title = "Ôn bài & Giao lưu tri thức";
      if (isOwnedByMe) {
        actionTitle = `ÔN BÀI (${cost}đ)`;
        description = "Ôn bài tăng Độ bền tri thức (Retention) cho ô trường bạn";
      } else if (isEnemyControlled) {
        actionTitle = `GIAO LƯU TRI THỨC (${cost}đ)`;
        description = "Thêm tri thức của trường bạn vào ô chung; mỗi trường ôn bài độc lập";
        if (!isAdjacent) {
          canExecute = false;
          reasonDisabled = "Chỉ có thể giao lưu tại các ô tiếp giáp với trường bạn";
        }
      } else {
        actionTitle = `KHÁM PHÁ (${cost}đ)`;
        description = "Khám phá ô tri thức hoang sơ tiếp giáp";
        if (!isAdjacent) {
          canExecute = false;
          reasonDisabled = "Chỉ có thể ôn bài tại các ô tiếp giáp với trường bạn";
        }
      }

      if ((colyseusClient?.currentProfile?.points !== undefined ? colyseusClient.currentProfile.points : userPoints) < cost) {
        canExecute = false;
        reasonDisabled = `Không đủ điểm! Cần ${cost} điểm (points) để ôn bài`;
      }
    } else if (mode === "beacon") {
      cost = ACTION_MODES.beacon.cost;
      title = "Thắp Đèn hiệu Công trình";
      actionTitle = landmarkName ? `THẮP ĐÈN HIỆU ${landmarkName.toUpperCase()}` : "THẮP ĐÈN HIỆU";
      description = "Mở giao diện nạp Tinh thể và giải đố công trình để thắp sáng Đèn hiệu";
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
    if (isSessionReplaced) return;
    if (!ctx.canExecute) {
      if (ctx.reasonDisabled) {
        showActionToast(ctx.reasonDisabled, "warning");
      }
      return;
    }

    const { x, y, mode, cost, landmarkName, landmarkId } = ctx;

    if (mode === "beacon" || (mode as any) === "bonfire") {
      const targetId = landmarkId || getNearestLandmark()?.id || getNearestLandmark()?.landmarkKey;
      if (targetId) {
        openLandmarkModalFor(targetId);
      } else {
        showActionToast("Không tìm thấy Công trình lân cận!", "warning");
      }
      return;
    }

    // Deduct points from database or state
    if (currentGameMode === "dev" && playerEmail) {
      RunningDatabase.deductPoints(playerEmail, ctx.cost);
      userPoints = RunningDatabase.getStudentBalance(playerEmail);
    } else {
      userPoints -= ctx.cost;
    }
    if (colyseusClient?.currentProfile) {
      colyseusClient.currentProfile.points = userPoints;
    }
    statsOverlay.updateStats({ points: userPoints });
    actionDock.setPoints(userPoints);

    if (mode === "explore") {
      colyseusClient.claimTile(x, y);
      showActionToast(
        landmarkName
          ? `Đã mở đường khám phá ${landmarkName}! -${cost} điểm (points)`
          : `Đã khám phá ô tri thức tại (${x}, ${y})! -${cost} điểm (points)`
      );
    } else if (mode === "study") {
      colyseusClient.studyTile(x, y, 1);
      const isOwnedByMe = colyseusClient.getTileOwnerSchoolId(x, y) === playerSchoolId;
      const isOwnedByEnemy = !!colyseusClient.getTileOwnerSchoolId(x, y) && !isOwnedByMe;
      if (isOwnedByMe) {
        showActionToast(`Đã ôn bài tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
      } else if (isOwnedByEnemy) {
        showActionToast(`Đã giao lưu tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
      } else {
        showActionToast(`Đã khám phá ô tri thức tại (${x}, ${y})! -${cost} điểm (points)`);
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

  actionDock.onBeaconAction = () => {
    if (isSessionReplaced) return;
    const nearest = getNearestLandmark();
    if (nearest) {
      openLandmarkModalFor(nearest.id || nearest.landmarkKey);
      sceneManager.panTo(nearest.x, nearest.y, { duration: 0.9, zoom: 0.8 });
    } else {
      showActionToast("Chưa có Công trình nào xuất hiện trên bản đồ!", "warning");
    }
  };
  actionDock.onBonfireAction = actionDock.onBeaconAction;

  actionDock.setClient(colyseusClient);

  sceneManager.onMissClick = () => {
    if (selectedMobileTile) {
      clearSelectedTile();
    }
  };

  // 6. Action Execution Handler: Desktop 1-Click vs Mobile 1-Tap Select -> 2-Tap Execute
  sceneManager.onTileClick = (event: TileClickEvent) => {
    if (isSessionReplaced) return;
    const { x, y } = event;
    if (window.innerWidth <= 768) showTileContext(x, y, 0, 0);
    if (mapEditor?.isRelocating()) { mapEditor?.completeRelocate(x,y); return; }

    // Direct click on any Landmark footprint opens the LandmarkModal immediately!
    const lm = getLandmarkAt(x, y);
    if (lm) {
      openLandmarkModalFor(lm.landmarkId || lm.landmarkKey);
      sceneManager.setSelectedTileMarker(x, y, "#00ffe8");
      setTimeout(() => sceneManager.clearSelectedTileMarker(), 850);
      return;
    }

    // Inspect the station before spending the student's private supply turn.
    if (colyseusClient?.room?.state?.unistops) {
      let clickedStop: any = null;
      colyseusClient.room.state.unistops.forEach((stop: any) => {
        const targetZ = stop.z !== undefined ? stop.z : stop.y;
        if (x >= stop.x - 5 && x < stop.x + 5 && y >= targetZ - 2 && y < targetZ + 3) clickedStop = stop;
      });
      if (clickedStop) {
        uniStopModal.open(uniStopView(clickedStop));
        sceneManager.setSelectedTileMarker(x, y, "#00ffe8");
        setTimeout(() => sceneManager.clearSelectedTileMarker(), 850);
        return;
      }
    }

    // Direct click on any Chest opens chest
    if (colyseusClient?.room?.state?.chests) {
      let clickedChest: any = null;
      colyseusClient.room.state.chests.forEach((chest: any) => {
        const targetZ = chest.z !== undefined ? chest.z : chest.y;
        const dist = Math.hypot(chest.x - x, targetZ - y);
        if (dist <= 2.5) clickedChest = chest;
      });
      if (clickedChest) {
        if (clickedChest.isOpened) {
          showActionToast(`Rương này đã được mở bởi ${clickedChest.openedBySchoolId?.toUpperCase()}!`, "warning");
        } else {
          const tier = (clickedChest.tier || "aspire").toLowerCase();
          const profile = colyseusClient?.currentProfile;
          let hasKey = true;
          let requiredKeyName = "Aspire";
          if (profile) {
            if (tier === "aspire" || tier === "silver") {
              hasKey = (profile.aspireKeys || 0) >= 1;
              requiredKeyName = "Aspire (Key - Aspire)";
            } else if (tier === "nitro" || tier === "gold") {
              hasKey = (profile.nitroKeys || 0) >= 1;
              requiredKeyName = "Nitro (Key - Nitro)";
            } else if (tier === "predator" || tier === "platinum") {
              hasKey = (profile.predatorKeys || 0) >= 1;
              requiredKeyName = "Predator (Key - Predator)";
            }
          }
          if (!hasKey) {
            showActionToast(`Bạn cần có Chìa khoá ${requiredKeyName} để mở rương này!`, "warning");
            return;
          }
          colyseusClient.openChest(clickedChest.id, x, y);
        }
        sceneManager.setSelectedTileMarker(x, y, "#f59e0b");
        setTimeout(() => sceneManager.clearSelectedTileMarker(), 850);
        return;
      }
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

    const markerColor = ctx.mode === "study" ? "#10b981" : ctx.mode === "beacon" ? "#00ffe8" : "#00ffe8";

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
    revealAllHQsAndLandmarks(room.state);
    const myPlayer = room.state.players?.get ? room.state.players.get(room.sessionId) : (room.state.players ? room.state.players[room.sessionId] : null);
    const syncDisplayName = myPlayer?.displayName || (playerEmail ? playerEmail.split('@')[0] : undefined);
    if (syncDisplayName) {
      statsOverlay.updateStats({ displayName: syncDisplayName });
    }
    showActionToast(
      currentGameMode === "normal"
        ? `Đã đăng nhập: ${playerEmail} [${playerSchoolId.toUpperCase()}] - ${userPoints} điểm giải chạy`
        : `Đã kết nối Colyseus Server [Dev Mode: ${playerSchoolId.toUpperCase()}]`
    );

    // Initialize campaign rankings by explored knowledge tiles
    if (room.state.schoolKnowledgeTiles) {
      room.state.schoolKnowledgeTiles.forEach((pts: number, sId: string) => {
        statsOverlay.updateSchoolPoints(sId, pts);
      });
    }

    // Update initial troop points (Only if NOT logged in as a student)
    if (!playerEmail && currentGameMode === "dev") {
      const troops = colyseusClient.currentProfile?.points ?? userPoints;
      userPoints = troops;
      statsOverlay.updateTroops(troops);
    } else {
      statsOverlay.updateStats({ points: userPoints });
    }

    if (colyseusClient.currentProfile) {
      userPoints = colyseusClient.currentProfile.points;
      userCrystals = colyseusClient.currentProfile.crystals;
      statsOverlay.updateStats({
        points: userPoints,
        crystals: userCrystals,
        aspireKeys: colyseusClient.currentProfile.aspireKeys,
        nitroKeys: colyseusClient.currentProfile.nitroKeys,
        predatorKeys: colyseusClient.currentProfile.predatorKeys,
        displayName: colyseusClient.currentProfile.displayName || syncDisplayName,
        studentEmail: colyseusClient.currentProfile.email
      });
      actionDock.updateResources(userPoints, userCrystals, {
        aspire: colyseusClient.currentProfile.aspireKeys,
        nitro: colyseusClient.currentProfile.nitroKeys,
        predator: colyseusClient.currentProfile.predatorKeys
      });
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
