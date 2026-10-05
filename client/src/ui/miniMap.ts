// client/src/ui/miniMap.ts
import { Icons } from './icons';
import { getSchoolColor, SCHOOL_IDS } from "../../../shared/constants/schools";
import type { FogOfWarManager } from "../engine/fogOfWarManager";

export class MiniMap {
  public element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 160; // 160x160 px

  // Data
  private hqList: { schoolId: string; x: number; y: number }[] = [];
  private landmarkList: { x: number; y: number }[] = [];
  private claimedTilesRef: Map<string, any> = new Map();
  /** Dense owner bytes (1000x1000) from LandState sync — no 1e6 tile objects. */
  private knowledgeSchools: ReadonlyMap<string, string[]> = new Map();
  public setKnowledgeSchools(schools: ReadonlyMap<string, string[]>) { this.knowledgeSchools = schools; this.requestRedraw(); }
  private landOwnerBytes: Uint8Array | null = null;
  private playerHQ: { schoolId: string; x: number; y: number } | null = null;
  private unistopList: { id: string; tier: string; x: number; z: number }[] = [];
  private chestList: { id: string; tier: string; x: number; z: number; isOpened: boolean }[] = [];
  private fogManager: FogOfWarManager | null = null;
  private isDrawPending = false;

  // Camera frustum position in 0..1000 world space
  private camX = 500;
  private camZ = 500;
  private camFrustum = 70;

  // Live Drag & Pan state (Vuốt & Lia)
  private isDragging = false;
  private dragMoved = 0;
  private isExpanded = false;

  public onPanRequested?: (x: number, y: number) => void;
  public onPanLive?: (x: number, y: number, isDragging: boolean) => void;
  public onZoomIn?: () => void;
  public onZoomOut?: () => void;
  public onRecenter?: () => void;

  constructor(
    parent?: HTMLElement,
    onZoomIn?: () => void,
    onZoomOut?: () => void,
    onRecenter?: () => void
  ) {
    this.onZoomIn = onZoomIn;
    this.onZoomOut = onZoomOut;
    this.onRecenter = onRecenter;

    this.element = document.createElement('div');
    this.element.className = 'minimap-wrapper';
    this.element.setAttribute('data-ui', 'true');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';
    this.canvas.width = this.size;
    this.canvas.height = this.size;

    const controls = document.createElement('div');
    controls.className = 'minimap-controls';
    controls.innerHTML = `
      <button class="btn-mini-control" id="mbtn-zoom-in" title="Phóng to">${Icons.zoomIn('sm')}</button>
      <button class="btn-mini-control" id="mbtn-zoom-out" title="Thu nhỏ">${Icons.zoomOut('sm')}</button>
      <button class="btn-mini-control" id="mbtn-recenter" title="Căn giữa Trụ sở HQ">${Icons.compass('sm')}</button>
    `;

    this.element.appendChild(this.canvas);
    this.element.appendChild(controls);
    (parent || document.body).appendChild(this.element);

    this.ctx = this.canvas.getContext('2d')!;

    this.setupEvents();
    this.draw();
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    this.element.classList.toggle('is-expanded', this.isExpanded);
    this.requestRedraw();
  }

  private calcWorldCoords(clientX: number, clientY: number): { worldX: number; worldY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width || this.size;
    const scaleY = rect.height || this.size;
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / scaleX));
    const normY = Math.max(0, Math.min(1, (clientY - rect.top) / scaleY));
    return {
      worldX: Math.round(normX * 960 + 20),
      worldY: Math.round(normY * 960 + 20)
    };
  }

  private setupEvents(): void {
    // 1. Mouse Drag & Pan
    this.canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = true;
      this.dragMoved = 0;
      this.canvas.classList.add("is-dragging");

      const { worldX, worldY } = this.calcWorldCoords(e.clientX, e.clientY);
      this.camX = worldX;
      this.camZ = worldY;
      this.requestRedraw();
      this.onPanLive?.(worldX, worldY, true);
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      this.dragMoved += Math.hypot(e.movementX, e.movementY);
      const { worldX, worldY } = this.calcWorldCoords(e.clientX, e.clientY);
      this.camX = worldX;
      this.camZ = worldY;
      this.requestRedraw();
      this.onPanLive?.(worldX, worldY, true);
    });

    window.addEventListener("mouseup", (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.canvas.classList.remove("is-dragging");
      const { worldX, worldY } = this.calcWorldCoords(e.clientX, e.clientY);
      this.onPanLive?.(worldX, worldY, false);
      if (this.dragMoved < 6 && this.onPanRequested) {
        this.onPanRequested(worldX, worldY);
      }
    });

    // 2. Touch Swipe & Live Pan (Vuốt & Lia)
    this.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this.dragMoved = 0;
        this.canvas.classList.add("is-dragging");

        const touch = e.touches[0];
        const { worldX, worldY } = this.calcWorldCoords(touch.clientX, touch.clientY);
        this.camX = worldX;
        this.camZ = worldY;
        this.requestRedraw();
        this.onPanLive?.(worldX, worldY, true);
      }
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      this.dragMoved += 4;
      const { worldX, worldY } = this.calcWorldCoords(touch.clientX, touch.clientY);
      this.camX = worldX;
      this.camZ = worldY;
      this.requestRedraw();
      this.onPanLive?.(worldX, worldY, true);
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.canvas.classList.remove("is-dragging");
      const touch = e.changedTouches[0];
      if (touch) {
        const { worldX, worldY } = this.calcWorldCoords(touch.clientX, touch.clientY);
        this.onPanLive?.(worldX, worldY, false);
        if (this.dragMoved < 10 && this.onPanRequested) {
          this.onPanRequested(worldX, worldY);
        }
      }
    };

    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    // 3. MiniMap Controls
    const stopProp = (e: Event) => e.stopPropagation();
    this.element.addEventListener('pointerdown', stopProp);
    this.element.addEventListener('mousedown', stopProp);
    this.element.addEventListener('touchstart', stopProp, { passive: true });

    const controls = this.element.querySelector('.minimap-controls');
    controls?.querySelectorAll('.btn-mini-control').forEach((btn) => {
      btn.addEventListener('pointerdown', stopProp);
      btn.addEventListener('mousedown', stopProp);
      btn.addEventListener('touchstart', stopProp, { passive: true });
    });

    controls?.querySelector('#mbtn-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoomIn?.();
    });
    controls?.querySelector('#mbtn-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoomOut?.();
    });
    controls?.querySelector('#mbtn-recenter')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRecenter?.();
    });
  }

  public requestRedraw(): void {
    if (this.isDrawPending) return;
    this.isDrawPending = true;
    requestAnimationFrame(() => {
      this.isDrawPending = false;
      this.draw();
    });
  }

  public setPlayerHQ(schoolId: string, x: number, y: number): void {
    this.playerHQ = { schoolId, x, y };
    this.requestRedraw();
  }

  public setStaticFeatures(
    hqs: { schoolId: string; x: number; y: number }[],
    landmarks: { x: number; y: number }[]
  ): void {
    this.hqList = hqs;
    this.landmarkList = landmarks;
    this.requestRedraw();
  }

  public updateCamera(camX: number, camZ: number, frustumSize: number): void {
    this.camX = camX;
    this.camZ = camZ;
    this.camFrustum = frustumSize;
    this.requestRedraw();
  }

  public setClaimedTiles(claimedTiles: any): void {
    this.claimedTilesRef = claimedTiles;
    this.requestRedraw();
  }

  /** Wire dense LandState owner bytes (preferred over schema claimedTiles). */
  public setLandOwnerBytes(owner: Uint8Array | null): void {
    this.landOwnerBytes = owner;
    this.requestRedraw();
  }

  public setFogOfWarManager(fog: FogOfWarManager): void {
    this.fogManager = fog;
    this.requestRedraw();
  }

  public setUniStops(unistops: { id: string; tier: string; x: number; z: number }[]): void {
    this.unistopList = unistops;
    this.requestRedraw();
  }

  public setChests(chests: { id: string; tier: string; x: number; z: number; isOpened: boolean }[]): void {
    this.chestList = chests;
    this.requestRedraw();
  }

  public draw(): void {
    const ctx = this.ctx;
    const s = this.size;
    const scale = s / 1000;

    // Background - Minecraft grass terrain
    ctx.fillStyle = "#4d7c2a";
    ctx.fillRect(0, 0, s, s);

    // Lake Ho Da - Minecraft Water
    ctx.fillStyle = "#3f76e4";
    ctx.beginPath();
    ctx.arc(500 * scale, 500 * scale, 65 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Main Roads - Minecraft Dirt Path
    ctx.strokeStyle = "#9c875d";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    // Crossroads
    ctx.moveTo(500 * scale, 0);
    ctx.lineTo(500 * scale, s);
    ctx.moveTo(0, 500 * scale);
    ctx.lineTo(s, 500 * scale);
    // Ring road
    ctx.arc(500 * scale, 500 * scale, 280 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Claimed Tiles — prefer dense LandState owner bytes (S2.4), fall back to schema map
    if (this.landOwnerBytes && this.landOwnerBytes.length === 1000 * 1000) {
      const owner = this.landOwnerBytes;
      for (let y = 0; y < 1000; y++) {
        const row = y * 1000;
        for (let x = 0; x < 1000; x++) {
          const o = owner[row + x];
          if (o === 0) continue;
          const schoolId = SCHOOL_IDS[o - 1];
          const schools = this.knowledgeSchools.get(`${x},${y}`);
          if (schools && schools.length > 1) {
            const rgb = schools.map(school => parseInt(getSchoolColor(school).slice(1), 16));
            const average = (shift: number) => Math.round(rgb.reduce((sum, color) => sum + ((color >> shift) & 255), 0) / rgb.length);
            ctx.fillStyle = `rgb(${average(16)},${average(8)},${average(0)})`;
          } else ctx.fillStyle = getSchoolColor(schoolId || "");
          const px = Math.floor(x * scale);
          const py = Math.floor(y * scale);
          ctx.fillRect(px, py, 2, 2);
        }
      }
    } else if (this.claimedTilesRef && this.claimedTilesRef.size > 0) {
      this.claimedTilesRef.forEach((tile: any) => {
        ctx.fillStyle = getSchoolColor(tile.ownerId);
        const px = Math.floor(tile.x * scale);
        const py = Math.floor(tile.y * scale);
        ctx.fillRect(px, py, 2, 2);
      });
    }

    // Fog of War Overlay: Tactical Predator Cyber Mist covering unexplored territories
    if (this.fogManager) {
      ctx.save();
      ctx.globalAlpha = 0.90;
      ctx.drawImage(this.fogManager.fogCanvas, 0, 0, s, s);
      ctx.restore();
    }

    // Landmarks (radiant amber markers with beacon aura)
    for (const lm of this.landmarkList) {
      const lx = lm.x * scale;
      const ly = lm.y * scale;

      ctx.save();
      // Amber ambient beacon aura
      ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
      ctx.beginPath();
      ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Sharp core
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10 HQs (pulsing school squares)
    for (const hq of this.hqList) {
      const hx = hq.x * scale;
      const hy = hq.y * scale;
      ctx.fillStyle = getSchoolColor(hq.schoolId);
      ctx.fillRect(hx - 2.5, hy - 2.5, 5, 5);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 2.5, hy - 2.5, 5, 5);
    }

    // UniStops: Diamonds with tier glow (Aspire: silver, Nitro: orange, Predator: neon cyan)
    for (const stop of this.unistopList) {
      const sx = stop.x * scale;
      const sy = stop.z * scale;
      const isPredator = stop.tier === 'predator';
      const color = isPredator ? '#00ffe8' : (stop.tier === 'nitro' ? '#ff5722' : '#cbd5e1');

      ctx.save();
      if (isPredator) {
        ctx.fillStyle = "rgba(0, 255, 232, 0.4)";
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 2.5);
      ctx.lineTo(sx + 2.5, sy);
      ctx.lineTo(sx, sy + 2.5);
      ctx.lineTo(sx - 2.5, sy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Chests: Small treasure boxes (Silver, Gold, Platinum)
    for (const chest of this.chestList) {
      if (chest.isOpened) continue;
      const cx = chest.x * scale;
      const cy = chest.z * scale;

      ctx.save();
      if (chest.isOpened) {
        ctx.fillStyle = "rgba(71, 85, 105, 0.45)";
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      } else {
        const color = chest.tier === 'platinum' ? '#00ffe8' : (chest.tier === 'gold' ? '#fbbf24' : '#e2e8f0');
        ctx.fillStyle = color;
        ctx.fillRect(cx - 1.8, cy - 1.8, 3.6, 3.6);
        ctx.strokeStyle = "#080c14";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(cx - 1.8, cy - 1.8, 3.6, 3.6);
      }
      ctx.restore();
    }

    // Player HQ: Pulsing glowing dot + Star Icon
    if (this.playerHQ) {
      const px = this.playerHQ.x * scale;
      const py = this.playerHQ.y * scale;
      const pulse = 1.0 + 0.25 * Math.sin(Date.now() * 0.006);

      // Outer glow circle
      ctx.save();
      ctx.fillStyle = "rgba(0, 255, 232, 0.4)";
      ctx.beginPath();
      ctx.arc(px, py, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Inner pulse ring
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Star emblem
      ctx.fillStyle = "#00ffe8";
      ctx.beginPath();
      const spikes = 4;
      const outerR = 5;
      const innerR = 2;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.moveTo(px, py - outerR);
      for (let i = 0; i < spikes; i++) {
        let x = px + Math.cos(rot) * outerR;
        let y = py + Math.sin(rot) * outerR;
        ctx.lineTo(x, y);
        rot += step;
        x = px + Math.cos(rot) * innerR;
        y = py + Math.sin(rot) * innerR;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(px, py - outerR);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Camera Frustum Box
    const boxW = Math.max(10, (this.camFrustum * 1.8) * scale);
    const boxH = Math.max(10, (this.camFrustum * 1.8) * scale);
    const cx = this.camX * scale - boxW / 2;
    const cy = this.camZ * scale - boxH / 2;

    ctx.strokeStyle = "#00ffe8";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx, cy, boxW, boxH);
  }
}

export { MiniMap as MiniMapUI };
