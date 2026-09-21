// client/src/ui/miniMap.ts
import { Icons } from './icons';
import { getSchoolColor } from "../../../shared/constants/schools";

export class MiniMap {
  public element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 160; // 160x160 px

  // Data
  private hqList: { schoolId: string; x: number; y: number }[] = [];
  private landmarkList: { x: number; y: number }[] = [];
  private claimedTilesRef: Map<string, any> = new Map();
  private playerHQ: { schoolId: string; x: number; y: number } | null = null;

  // Camera frustum position in 0..1000 world space
  private camX = 500;
  private camZ = 500;
  private camFrustum = 70;

  public onPanRequested?: (x: number, y: number) => void;
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

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';
    this.canvas.width = this.size;
    this.canvas.height = this.size;

    const controls = document.createElement('div');
    controls.className = 'minimap-controls';
    controls.innerHTML = `
      <button class="btn-mini-control" id="mbtn-zoom-in" title="Phóng to">${Icons.zoomIn('sm')}</button>
      <button class="btn-mini-control" id="mbtn-zoom-out" title="Thu nhỏ">${Icons.zoomOut('sm')}</button>
      <button class="btn-mini-control" id="mbtn-recenter" title="Căn giữa góc nhìn">${Icons.compass('sm')}</button>
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

  private setupEvents(): void {
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert 0..size to 0..1000
      const worldX = (clickX / this.size) * 1000;
      const worldY = (clickY / this.size) * 1000;

      if (this.onPanRequested) {
        this.onPanRequested(worldX, worldY);
      }
    });

    const controls = this.element.querySelector('.minimap-controls');
    controls?.querySelector('#mbtn-zoom-in')?.addEventListener('click', () => this.onZoomIn?.());
    controls?.querySelector('#mbtn-zoom-out')?.addEventListener('click', () => this.onZoomOut?.());
    controls?.querySelector('#mbtn-recenter')?.addEventListener('click', () => this.onRecenter?.());
  }

  public setPlayerHQ(schoolId: string, x: number, y: number): void {
    this.playerHQ = { schoolId, x, y };
    this.draw();
  }

  public setStaticFeatures(
    hqs: { schoolId: string; x: number; y: number }[],
    landmarks: { x: number; y: number }[]
  ): void {
    this.hqList = hqs;
    this.landmarkList = landmarks;
    this.draw();
  }

  public updateCamera(camX: number, camZ: number, frustumSize: number): void {
    this.camX = camX;
    this.camZ = camZ;
    this.camFrustum = frustumSize;
    this.draw();
  }

  public setClaimedTiles(claimedTiles: any): void {
    this.claimedTilesRef = claimedTiles;
    this.draw();
  }

  public draw(): void {
    const ctx = this.ctx;
    const s = this.size;
    const scale = s / 1000;

    // Background - dark tactical terrain
    ctx.fillStyle = "#0b1320";
    ctx.fillRect(0, 0, s, s);

    // Lake Ho Da
    ctx.fillStyle = "#0e7490";
    ctx.beginPath();
    ctx.arc(500 * scale, 500 * scale, 65 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Main Roads
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // Crossroads
    ctx.moveTo(500 * scale, 0);
    ctx.lineTo(500 * scale, s);
    ctx.moveTo(0, 500 * scale);
    ctx.lineTo(s, 500 * scale);
    // Ring road
    ctx.arc(500 * scale, 500 * scale, 280 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Claimed Tiles
    if (this.claimedTilesRef && this.claimedTilesRef.size > 0) {
      this.claimedTilesRef.forEach((tile: any) => {
        ctx.fillStyle = getSchoolColor(tile.ownerId);
        const px = Math.floor(tile.x * scale);
        const py = Math.floor(tile.y * scale);
        ctx.fillRect(px, py, 2, 2);
      });
    }

    // Landmarks (amber markers)
    ctx.fillStyle = "#f59e0b";
    for (const lm of this.landmarkList) {
      const lx = lm.x * scale;
      const ly = lm.y * scale;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
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

    // Player HQ: Pulsing glowing dot + Star Icon
    if (this.playerHQ) {
      const px = this.playerHQ.x * scale;
      const py = this.playerHQ.y * scale;
      const pulse = 1.0 + 0.25 * Math.sin(Date.now() * 0.006);

      // Outer glow circle
      ctx.save();
      ctx.fillStyle = "rgba(6, 182, 212, 0.35)";
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
      ctx.fillStyle = "#f59e0b";
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

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx, cy, boxW, boxH);
  }
}

export { MiniMap as MiniMapUI };
