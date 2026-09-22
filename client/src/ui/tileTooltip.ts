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
  hp?: number;
  maxHp?: number;
  defenseTier?: number;
  isCore?: boolean;
  buffDescription?: string;
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
    
    if (left + 290 > window.innerWidth) {
      left = clientX - 300;
    }
    if (top + 210 > window.innerHeight) {
      top = clientY - 220;
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;

    const isLandmark = !!tile.landmarkName;
    const ownerName = tile.ownerSchoolName || 'Cứ điểm Trung Lập';
    const ownerColor = tile.ownerColor || '#94a3b8';

    const coreBadge = tile.isCore
      ? `<span style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; letter-spacing: 0.5px; margin-left: 4px;">LÕI</span>`
      : '';

    const hpRow = (tile.hp !== undefined && tile.maxHp !== undefined)
      ? `
        <div class="tooltip-row">
          <span class="row-label">${Icons.shield('sm')} Máu / Giáp:</span>
          <span class="row-value" style="font-weight: 700; color: ${tile.hp < tile.maxHp * 0.4 ? '#f87171' : '#38bdf8'};">
            ${tile.hp} / ${tile.maxHp} HP ${tile.defenseTier ? `(Giáp T${tile.defenseTier})` : ''}
          </span>
        </div>
      `
      : '';

    const buffRow = tile.buffDescription
      ? `
        <div class="tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.15); font-size: 10px; color: #cbd5e1; line-height: 1.3;">
          <span style="display: flex; align-items: center; gap: 4px;">${Icons.lightning('sm')} <em>${tile.buffDescription}</em></span>
        </div>
      `
      : '';

    this.element.innerHTML = `
      <div class="tooltip-header" style="border-left-color: ${ownerColor};">
        <div class="tooltip-title-wrap">
          <span class="tooltip-type-icon" style="color: ${ownerColor}; display: flex; align-items: center;">
            ${isLandmark ? Icons.landmark('sm') : Icons.tile('sm')}
          </span>
          <h4 class="tooltip-title">${isLandmark ? tile.landmarkName : `Ô đất (${tile.x}, ${tile.z})`}</h4>
          ${coreBadge}
        </div>
        <span class="tooltip-terrain-tag">${tile.terrainType}</span>
      </div>

      <div class="tooltip-body">
        <div class="tooltip-row">
          <span class="row-label">${Icons.school('sm')} Phe chiếm giữ:</span>
          <span class="row-value" style="color: ${ownerColor}; font-weight: 600;">${ownerName}</span>
        </div>
        ${hpRow}
        <div class="tooltip-row">
          <span class="row-label">${Icons.point('sm')} Tiêu hao lực:</span>
          <span class="row-value"><strong style="color: #fbbf24;">${tile.cost}</strong> quân</span>
        </div>
        ${buffRow}
      </div>
    `;
  }

  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.element.style.display = 'none';
  }
}
