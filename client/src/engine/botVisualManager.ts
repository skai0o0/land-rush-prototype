// client/src/engine/botVisualManager.ts
import * as THREE from "three";
import { SceneManager } from "./sceneManager";
import { getTerrainHeight } from "./terrainNoise";

export interface BotVisualConfig {
  id: string;
  name: string;
  shortName: string;
  schoolId: string;
  colorHex: string;
  colorNum: number;
  initX: number;
  initY: number;
}

export const BOT_VISUAL_CONFIGS: BotVisualConfig[] = [
  {
    id: "bot_hcmut",
    name: "Khoa_HCMUT",
    shortName: "BK",
    schoolId: "hcmut",
    colorHex: "#00ffe8", // Neon Cyan
    colorNum: 0x00ffe8,
    initX: 200,
    initY: 208
  },
  {
    id: "bot_hcmcou",
    name: "Minh_OU",
    shortName: "OU",
    schoolId: "hcmcou",
    colorHex: "#10b981", // Emerald Green
    colorNum: 0x10b981,
    initX: 800,
    initY: 208
  },
  {
    id: "bot_dtu",
    name: "Hoang_DTU",
    shortName: "DTU",
    schoolId: "dtu",
    colorHex: "#f97316", // Tactical Orange
    colorNum: 0xf97316,
    initX: 500,
    initY: 812
  },
  {
    id: "bot_dhhp",
    name: "Tung_DHHP",
    shortName: "DHHP",
    schoolId: "dhhp",
    colorHex: "#a855f7", // Cyber Purple
    colorNum: 0xa855f7,
    initX: 220,
    initY: 772
  },
  {
    id: "bot_hsu",
    name: "Linh_HSU",
    shortName: "HSU",
    schoolId: "hsu",
    colorHex: "#ec4899", // Neon Pink
    colorNum: 0xec4899,
    initX: 780,
    initY: 772
  }
];

interface BotInstance {
  config: BotVisualConfig;
  x: number;
  y: number;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  rotationY: number;
  targetRotationY: number;
  actionType: string;
  actionText: string;
  group: THREE.Group;
  auraMesh: THREE.Mesh;
  beaconMesh: THREE.Mesh;
  nametagSprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  isActionPopping: boolean;
  popProgress: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  scale: number;
  maxScale: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export class BotVisualManager {
  private sceneManager: SceneManager;
  private bots: Map<string, BotInstance> = new Map();
  private shockwaves: ShockwaveRing[] = [];
  private hudStrip: HTMLElement | null = null;
  private isVisible = true;

  constructor(sceneManager: SceneManager, parentEl?: HTMLElement) {
    this.sceneManager = sceneManager;

    // Create 3D Bot instances in scene
    for (const cfg of BOT_VISUAL_CONFIGS) {
      const instance = this.createBotInstance(cfg);
      this.bots.set(cfg.id, instance);
      this.sceneManager.scene.add(instance.group);
    }

    // Create Spectator Strip HUD
    this.createSpectatorStripHUD(parentEl);
  }

  private createBotInstance(cfg: BotVisualConfig): BotInstance {
    const group = new THREE.Group();
    group.name = `student_bot_${cfg.id}`;
    group.userData = { isStudentBot: true, botId: cfg.id };

    const initialHeight = getTerrainHeight(cfg.initX, cfg.initY);
    const currentPos = new THREE.Vector3(cfg.initX, initialHeight, cfg.initY);
    const targetPos = currentPos.clone();
    group.position.copy(currentPos);
    group.scale.set(1.6, 1.6, 1.6);

    // 1. Ground Aura Ring
    const auraGeo = new THREE.RingGeometry(0.9, 1.8, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: cfg.colorNum,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.05;
    group.add(auraMesh);

    // Inner glow disc
    const innerDiscGeo = new THREE.CircleGeometry(0.9, 24);
    const innerDiscMat = new THREE.MeshBasicMaterial({
      color: cfg.colorNum,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });
    const innerDiscMesh = new THREE.Mesh(innerDiscGeo, innerDiscMat);
    innerDiscMesh.rotation.x = -Math.PI / 2;
    innerDiscMesh.position.y = 0.04;
    group.add(innerDiscMesh);

    // 2. Stylized Cyber-Student Body
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6
    });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.2, 0.28, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.2, 0.28, 0);
    group.add(rightLeg);

    // Torso / Jacket
    const torsoGeo = new THREE.CylinderGeometry(0.38, 0.46, 0.95, 16);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: cfg.colorNum,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.7
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.position.y = 0.9;
    group.add(torsoMesh);

    // Student Backpack on Back
    const packGeo = new THREE.BoxGeometry(0.46, 0.65, 0.32);
    const packMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: cfg.colorNum,
      emissiveIntensity: 0.15,
      roughness: 0.6
    });
    const packMesh = new THREE.Mesh(packGeo, packMat);
    packMesh.position.set(0, 0.9, -0.32);
    group.add(packMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.36, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.2
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.55;
    group.add(headMesh);

    // Cyber Visor / Neon Glasses
    const visorGeo = new THREE.BoxGeometry(0.48, 0.16, 0.22);
    const visorMat = new THREE.MeshStandardMaterial({
      color: cfg.colorNum,
      emissive: cfg.colorNum,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.9
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 1.58, 0.26);
    group.add(visorMesh);

    // 3. Floating Diamond Beacon Gem above Head
    const beaconGeo = new THREE.OctahedronGeometry(0.24, 0);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: cfg.colorNum,
      emissive: cfg.colorNum,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 2.25;
    beaconMesh.scale.set(1.4, 1.4, 1.4);
    group.add(beaconMesh);

    // 4. Floating 3D Nametag & Speech Bubble Sprite
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const nametagSprite = new THREE.Sprite(spriteMat);
    nametagSprite.position.y = 4.2;
    nametagSprite.scale.set(4.5, 2.25, 1);
    group.add(nametagSprite);

    const instance: BotInstance = {
      config: cfg,
      x: cfg.initX,
      y: cfg.initY,
      currentPos,
      targetPos,
      rotationY: 0,
      targetRotationY: 0,
      actionType: "idle",
      actionText: cfg.id === "bot_hcmut" ? "🚩 Đang khám phá Vùng Tri Thức" :
                  cfg.id === "bot_hcmcou" ? "📚 Đang ôn bài bảo vệ lãnh thổ" :
                  cfg.id === "bot_dtu" ? "💎 Đang nạp tinh thể Đèn hiệu" :
                  cfg.id === "bot_dhhp" ? "🎁 Đang mở rương kho báu" : "🎲 Đang quay UniStop Gacha",
      group,
      auraMesh,
      beaconMesh,
      nametagSprite,
      canvas,
      ctx,
      texture,
      isActionPopping: false,
      popProgress: 0
    };

    this.drawNametagCanvas(instance);
    return instance;
  }

  private drawNametagCanvas(bot: BotInstance): void {
    const { ctx, canvas, config, actionText } = bot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw frosted card background
    const x = 20;
    const y = 30;
    const w = 472;
    const h = 196;
    const radius = 24;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = "rgba(10, 16, 28, 0.92)";
    ctx.fill();

    // Glowing border in school color
    ctx.lineWidth = 6;
    ctx.strokeStyle = config.colorHex;
    ctx.shadowColor = config.colorHex;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.restore();

    // Header badge: [BK] Khoa_HCMUT
    ctx.save();
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";

    // School short pill
    ctx.fillStyle = config.colorHex;
    ctx.beginPath();
    ctx.roundRect(42, 60, 85, 42, 10);
    ctx.fill();

    ctx.fillStyle = "#060913";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText(config.shortName, 84, 82);

    // Student Bot Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(config.name, 142, 82);
    ctx.restore();

    // Separator line
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(42, 118);
    ctx.lineTo(470, 118);
    ctx.stroke();
    ctx.restore();

    // Action Bubble text (Line 2)
    ctx.save();
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Truncate if long
    let displayAction = actionText || "Đang hành động...";
    if (displayAction.length > 28) {
      displayAction = displayAction.substring(0, 27) + "…";
    }
    ctx.fillText(displayAction, 45, 160);
    ctx.restore();

    bot.texture.needsUpdate = true;
  }

  /**
   * Spawn expanding ground wave shockwave ring at bot location
   */
  public spawnGroundShockwave(x: number, y: number, colorNum: number): void {
    const h = getTerrainHeight(x, y) + 0.08;
    const ringGeo = new THREE.RingGeometry(0.5, 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorNum,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, h, y);
    this.sceneManager.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      material: ringMat,
      scale: 1.0,
      maxScale: 4.8,
      opacity: 0.9,
      life: 0,
      maxLife: 0.85
    });
  }

  /**
   * Handle realtime action message from server
   */
  public handleBotAction(data: {
    botId: string;
    name: string;
    schoolId: string;
    x: number;
    y: number;
    actionType: string;
    actionText: string;
    points?: number;
    crystals?: number;
  }): void {
    const bot = this.bots.get(data.botId);
    if (!bot) return;

    bot.x = data.x;
    bot.y = data.y;
    bot.actionType = data.actionType;
    bot.actionText = data.actionText;

    const terrainH = getTerrainHeight(data.x, data.y);
    bot.targetPos.set(data.x, terrainH, data.y);

    // If bot was far away (e.g. initial spawn vs server location), snap immediately instead of gliding across whole map
    if (bot.currentPos.distanceTo(bot.targetPos) > 40) {
      bot.currentPos.copy(bot.targetPos);
      bot.group.position.copy(bot.currentPos);
    }

    // Compute rotation towards movement target
    const dx = bot.targetPos.x - bot.currentPos.x;
    const dz = bot.targetPos.z - bot.currentPos.z;
    if (Math.hypot(dx, dz) > 0.1) {
      bot.targetRotationY = Math.atan2(dx, dz);
    }

    // Shockwave ring on meaningful actions
    if (data.actionType === "explore" || data.actionType === "study" || data.actionType === "crystal") {
      this.spawnGroundShockwave(data.x, data.y, bot.config.colorNum);
    }

    // Trigger nametag pop bounce
    bot.isActionPopping = true;
    bot.popProgress = 0;
    this.drawNametagCanvas(bot);

    // Update Spectator HUD Strip
    this.updateHUDCard(bot);
  }

  /**
   * Synchronize initial bot positions with dynamically generated HQs
   */
  public syncHQs(hqs: any): void {
    if (!hqs) return;
    for (const bot of this.bots.values()) {
      const hq = typeof hqs.get === "function" ? hqs.get(bot.config.schoolId) : hqs[bot.config.schoolId];
      if (hq) {
        bot.x = hq.x;
        bot.y = hq.y + 6; // Đặt ngay trước thềm HQ
        const terrainH = getTerrainHeight(bot.x, bot.y);
        bot.currentPos.set(bot.x, terrainH, bot.y);
        bot.targetPos.copy(bot.currentPos);
        bot.group.position.copy(bot.currentPos);
        this.drawNametagCanvas(bot);
      }
    }
  }

  /**
   * Handle bulk bot status update
   */
  public handleBotsStatus(data: { enabled: boolean; count?: number; bots?: any[] }): void {
    // Always keep 3D bots visible on the map as lively school representatives
    this.isVisible = true;
    for (const bot of this.bots.values()) {
      bot.group.visible = true;
    }
    if (this.hudStrip) {
      this.hudStrip.style.display = "flex";
    }

    if (data.bots && Array.isArray(data.bots)) {
      for (const b of data.bots) {
        this.handleBotAction(b);
      }
    }
  }

  /**
   * Create Bottom Spectator Strip HUD
   */
  private createSpectatorStripHUD(parentEl?: HTMLElement): void {
    const container = parentEl || document.getElementById("app") || document.body;

    const strip = document.createElement("div");
    strip.id = "bot-spectator-strip";
    strip.className = "bot-spectator-strip";
    strip.setAttribute("data-ui", "true");

    strip.innerHTML = `
      <div class="bot-strip-header">
        <span class="bot-strip-dot"></span>
        <span class="bot-strip-title">5 BOTS LIVE</span>
      </div>
      <div class="bot-strip-cards">
        ${BOT_VISUAL_CONFIGS.map((cfg) => `
          <div class="bot-strip-card" data-bot-id="${cfg.id}" style="--bot-color: ${cfg.colorHex};">
            <div class="bot-card-badge" style="background: ${cfg.colorHex}; color: #000;">
              ${cfg.shortName}
            </div>
            <div class="bot-card-info">
              <span class="bot-card-name">${cfg.name}</span>
              <span class="bot-card-action" id="hud-action-${cfg.id}">${
                cfg.id === "bot_hcmut" ? "🚩 Đang khám phá" :
                cfg.id === "bot_hcmcou" ? "📚 Đang ôn bài" :
                cfg.id === "bot_dtu" ? "💎 Nạp tinh thể" :
                cfg.id === "bot_dhhp" ? "🎁 Mở rương" : "🎲 Quay UniStop"
              }</span>
            </div>
            <button class="bot-card-spectate-btn" data-bot-id="${cfg.id}" title="Bay camera tới quan sát bot này ngay!">
              👁️ Xem
            </button>
          </div>
        `).join("")}
      </div>
    `;

    // Isolate pointer events from 3D canvas
    const stopProp = (e: Event) => e.stopPropagation();
    strip.addEventListener("pointerdown", stopProp);
    strip.addEventListener("mousedown", stopProp);
    strip.addEventListener("touchstart", stopProp, { passive: true });

    // Spectate Click Handler
    strip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-bot-id]");
      if (target) {
        const botId = target.getAttribute("data-bot-id");
        if (botId) {
          this.spectateBot(botId);
        }
      }
    });

    container.appendChild(strip);
    this.hudStrip = strip;
  }

  private updateHUDCard(bot: BotInstance): void {
    if (!this.hudStrip) return;
    const actionEl = this.hudStrip.querySelector(`#hud-action-${bot.config.id}`);
    if (actionEl) {
      actionEl.textContent = bot.actionText;
    }
    const card = this.hudStrip.querySelector(`.bot-strip-card[data-bot-id="${bot.config.id}"]`);
    if (card) {
      card.classList.add("card-action-flash");
      setTimeout(() => card.classList.remove("card-action-flash"), 600);
    }
  }

  /**
   * Fly camera to watch bot
   */
  public spectateBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (!bot) return;

    this.sceneManager.panTo(bot.x, bot.y, {
      duration: 1.0,
      zoom: 0.32,
      arc: true
    });

    // Spawn highlight pulse ring
    this.spawnGroundShockwave(bot.x, bot.y, bot.config.colorNum);
  }

  /**
   * Check if user clicked on any 3D bot mesh
   */
  public checkBotRaycast(raycaster: THREE.Raycaster): boolean {
    if (!this.isVisible) return false;
    for (const bot of this.bots.values()) {
      const intersects = raycaster.intersectObjects(bot.group.children, true);
      if (intersects.length > 0) {
        this.spectateBot(bot.config.id);
        return true;
      }
    }
    return false;
  }

  /**
   * Frame update loop
   */
  public update(delta: number, now: number): void {
    if (!this.isVisible) return;

    // 1. Update each 3D bot instance
    for (const bot of this.bots.values()) {
      // Smooth position interpolation
      const dist = bot.currentPos.distanceTo(bot.targetPos);
      if (dist > 0.05) {
        const step = Math.min(1.0, delta * 4.5);
        bot.currentPos.lerp(bot.targetPos, step);
        bot.currentPos.y = getTerrainHeight(bot.currentPos.x, bot.currentPos.z);
        bot.group.position.copy(bot.currentPos);
      }

      // Smooth rotation
      const diffRot = bot.targetRotationY - bot.rotationY;
      bot.rotationY += diffRot * Math.min(1.0, delta * 6.0);
      bot.group.rotation.y = bot.rotationY;

      // Aura rotation & gentle breathing pulse
      bot.auraMesh.rotation.z += delta * 1.2;
      const pulse = 1.0 + Math.sin(now * 0.004) * 0.08;
      bot.auraMesh.scale.set(pulse, pulse, pulse);

      // Beacon gem spin & vertical bob
      bot.beaconMesh.rotation.y += delta * 2.5;
      bot.beaconMesh.position.y = 2.25 + Math.sin(now * 0.005 + bot.config.initX) * 0.12;

      // Nametag pop bounce animation
      if (bot.isActionPopping) {
        bot.popProgress += delta * 3.5;
        if (bot.popProgress >= 1.0) {
          bot.isActionPopping = false;
          bot.nametagSprite.scale.set(4.5, 2.25, 1);
        } else {
          // Bounce overshoot curve
          const s = 1.0 + Math.sin(bot.popProgress * Math.PI) * 0.35;
          bot.nametagSprite.scale.set(4.5 * s, 2.25 * s, 1);
        }
      }
    }

    // 2. Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life += delta;
      const progress = sw.life / sw.maxLife;
      if (progress >= 1.0) {
        this.sceneManager.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const scaleVal = 1.0 + progress * (sw.maxScale - 1.0);
        sw.mesh.scale.set(scaleVal, scaleVal, scaleVal);
        sw.material.opacity = (1.0 - progress) * sw.opacity;
      }
    }
  }

  public getBot(botId: string): BotInstance | undefined {
    return this.bots.get(botId);
  }

  public getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    for (const bot of this.bots.values()) {
      bot.group.visible = visible;
    }
    if (this.hudStrip) {
      this.hudStrip.style.display = visible ? "flex" : "none";
    }
  }
}
