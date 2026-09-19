import { getSchoolColor, SCHOOL_ROSTER } from "../../../shared/constants/schools";
import { isHoDaLake, isRoad } from "../engine/terrainNoise";

export class MiniMap {
  public element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 180; // 180x180 px radar

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

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "minimap-radar";
    this.element.innerHTML = `
      <div class="radar-header">
        <span class="radar-title">TACTICAL RADAR</span>
        <span class="radar-coord" id="radarCoord">500, 500</span>
      </div>
      <canvas width="${this.size}" height="${this.size}" class="radar-canvas"></canvas>
    `;

    container.appendChild(this.element);

    this.canvas = this.element.querySelector(".radar-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;

    this.setupEvents();
    this.draw();
  }

  private setupEvents() {
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
  }

  public setPlayerHQ(schoolId: string, x: number, y: number) {
    this.playerHQ = { schoolId, x, y };
    this.draw();
  }

  public setStaticFeatures(
    hqs: { schoolId: string; x: number; y: number }[],
    landmarks: { x: number; y: number }[]
  ) {
    this.hqList = hqs;
    this.landmarkList = landmarks;
    this.draw();
  }

  public updateCamera(camX: number, camZ: number, frustumSize: number) {
    this.camX = camX;
    this.camZ = camZ;
    this.camFrustum = frustumSize;

    const coordEl = this.element.querySelector("#radarCoord");
    if (coordEl) coordEl.textContent = `${Math.round(camX)}, ${Math.round(camZ)}`;

    this.draw();
  }

  public setClaimedTiles(claimedTiles: any) {
    this.claimedTilesRef = claimedTiles;
    this.draw();
  }

  public draw() {
    const ctx = this.ctx;
    const s = this.size;
    const scale = s / 1000;

    // Background - dark tactical terrain
    ctx.fillStyle = "#2d3732";
    ctx.fillRect(0, 0, s, s);

    // Lake Ho Da
    ctx.fillStyle = "#1ca3a3";
    ctx.beginPath();
    ctx.arc(500 * scale, 500 * scale, 65 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Main Roads
    ctx.strokeStyle = "#4a525a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Crossroads
    ctx.moveTo(500 * scale, 0);
    ctx.lineTo(500 * scale, s);
    ctx.moveTo(0, 500 * scale);
    ctx.lineTo(s, 500 * scale);
    // Ring road
    ctx.arc(500 * scale, 500 * scale, 280 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Claimed Tiles (Draw as colored pixels/squares)
    if (this.claimedTilesRef && this.claimedTilesRef.size > 0) {
      this.claimedTilesRef.forEach((tile: any) => {
        ctx.fillStyle = getSchoolColor(tile.ownerId);
        const px = Math.floor(tile.x * scale);
        const py = Math.floor(tile.y * scale);
        ctx.fillRect(px, py, 2, 2);
      });
    }

    // Landmarks (gold stars/diamonds)
    ctx.fillStyle = "#ffd166";
    for (const lm of this.landmarkList) {
      const lx = lm.x * scale;
      const ly = lm.y * scale;
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 10 HQs (pulsing school squares)
    for (const hq of this.hqList) {
      const hx = hq.x * scale;
      const hy = hq.y * scale;
      ctx.fillStyle = getSchoolColor(hq.schoolId);
      ctx.fillRect(hx - 3, hy - 3, 6, 6);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 3, hy - 3, 6, 6);
    }

    // Player HQ: Pulsing glowing dot + Star Icon
    if (this.playerHQ) {
      const px = this.playerHQ.x * scale;
      const py = this.playerHQ.y * scale;
      const color = getSchoolColor(this.playerHQ.schoolId);
      const pulse = 1.0 + 0.3 * Math.sin(Date.now() * 0.006);

      // Outer glow circle
      ctx.save();
      ctx.fillStyle = "rgba(0, 240, 255, 0.35)";
      ctx.beginPath();
      ctx.arc(px, py, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Inner pulse ring
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 7 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Star emblem
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      const spikes = 4;
      const outerR = 6;
      const innerR = 2.5;
      let rot = Math.PI / 2 * 3;
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
      ctx.strokeStyle = "#12181b";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Camera Frustum Box
    const boxW = Math.max(12, (this.camFrustum * 1.8) * scale);
    const boxH = Math.max(12, (this.camFrustum * 1.8) * scale);
    const cx = this.camX * scale - boxW / 2;
    const cy = this.camZ * scale - boxH / 2;

    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, boxW, boxH);

    // Crosshair in camera view
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.beginPath();
    ctx.moveTo(this.camX * scale - 4, this.camZ * scale);
    ctx.lineTo(this.camX * scale + 4, this.camZ * scale);
    ctx.moveTo(this.camX * scale, this.camZ * scale - 4);
    ctx.lineTo(this.camX * scale, this.camZ * scale + 4);
    ctx.stroke();
  }
}
