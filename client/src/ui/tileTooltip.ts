// client/src/ui/tileTooltip.ts
import { Icons } from './icons';

export interface TileData {
  x: number;
  z: number;
  terrainType: string;
  landmarkName?: string | null;
  ownerSchoolName?: string | null;
  ownerColor?: string;
  cost: number;
  isOwnedByMe: boolean;
}

export class TileTooltip {
  private element: HTMLElement;
  private visible = false;

  constructor(parent?: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'tile-tactical-tooltip';
    this.element.style.display = 'none';
    (parent || document.body).appendChild(this.element);
  }

  public show(tile: TileData, clientX: number, clientY: number): void {
    this.visible = true;
    this.element.style.display = 'block';
    
    // Tự động neo vị trí tránh tràn mép màn hình
    const offset = 16;
    let left = clientX + offset;
    let top = clientY + offset;
    
    if (left + 260 > window.innerWidth) {
      left = clientX - 270;
    }
    if (top + 160 > window.innerHeight) {
      top = clientY - 170;
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;

    const isLandmark = !!tile.landmarkName;
    const ownerName = tile.ownerSchoolName || 'Đất tự do';
    const ownerColor = tile.ownerColor || '#64748b';

    this.element.innerHTML = `
      <div class="tooltip-header" style="border-left-color: ${ownerColor};">
        <div class="tooltip-title-wrap">
          <span class="tooltip-type-icon" style="color: ${ownerColor}; display: flex; align-items: center;">
            ${isLandmark ? Icons.landmark('sm') : Icons.tile('sm')}
          </span>
          <h4 class="tooltip-title">${isLandmark ? tile.landmarkName : `Ô đất (${tile.x}, ${tile.z})`}</h4>
        </div>
        <span class="tooltip-terrain-tag">${tile.terrainType}</span>
      </div>

      <div class="tooltip-body">
        <div class="tooltip-row">
          <span class="row-label">${Icons.school('sm')} Kiểm soát:</span>
          <span class="row-value" style="color: ${ownerColor}; font-weight: 600;">${ownerName}</span>
        </div>
        <div class="tooltip-row">
          <span class="row-label">${Icons.point('sm')} Chi phí đổi:</span>
          <span class="row-value"><strong>${tile.cost}</strong> điểm</span>
        </div>
      </div>
    `;
  }

  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.element.style.display = 'none';
  }
}
