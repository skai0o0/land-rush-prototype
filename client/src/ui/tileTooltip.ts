// client/src/ui/tileTooltip.ts
import { Icons } from './icons';

export interface TileData {
  x: number;
  z: number;
  terrainType: string;
  landmarkName?: string | null;
  landmarkId?: string | null;
  ownerSchoolName?: string | null;
  ownerColor?: string;
  cost: number;
  isOwnedByMe: boolean;
  isEnemyControlled?: boolean;
  isAdjacent?: boolean;
  isExchangeZone?: boolean; // Khu vực giao lưu tri thức
  retention?: number;
  maxRetention?: number;
  hp?: number;
  maxHp?: number;
  defenseTier?: number;
  isCore?: boolean;
  buffDescription?: string;
  isFogCovered?: boolean;
  // Landmark specific
  isLandmark?: boolean;
  litBySchoolName?: string | null;
  litBySchoolColor?: string;
  currentCrystals?: number;
  maxCrystals?: number;
  currentFuel?: number;
  maxFuel?: number;
  isLit?: boolean;
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

    // Auto dock avoiding screen edges
    const offset = 16;
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + 320 > window.innerWidth) {
      left = clientX - 330;
    }
    if (top + 250 > window.innerHeight) {
      top = clientY - 260;
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;

    // Special layout for tiles covered in Fog of War
    if (tile.isFogCovered) {
      this.element.innerHTML = `
        <div class="tooltip-header" style="border-left-color: #00ffe8;">
          <div class="tooltip-title-wrap">
            <span class="tooltip-type-icon" style="color: #00ffe8; display: flex; align-items: center;">
              ${Icons.lock('sm')}
            </span>
            <h4 class="tooltip-title">Khu vực Sương Mù (${tile.x}, ${tile.z})</h4>
          </div>
          <span class="tooltip-terrain-tag" style="background: rgba(0, 255, 232, 0.15); color: #00ffe8; border-color: rgba(0, 255, 232, 0.4);">CHƯA KHÁM PHÁ</span>
        </div>

        <div class="tooltip-body">
          <div class="tooltip-fog-warning">
            ${Icons.lock(14)}
            <span>SƯƠNG MÙ CHE PHỦ - CẦN MỞ ĐƯỜNG ĐỂ KHÁM PHÁ</span>
          </div>
          <div class="tooltip-row" style="color: #94a3b8; font-size: 11px; line-height: 1.45; margin-bottom: 6px;">
            <span>Khu vực bị che phủ bởi sương mù. Khai phá các ô tri thức tiếp giáp từ Trụ sở HQ hoặc Công trình Đèn hiệu tri thức để xua tan sương mù.</span>
          </div>
          <div class="tooltip-row" style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px;">
            <span class="row-label">${Icons.point('sm')} Chi phí Khai phá Vùng Tri Thức:</span>
            <span class="row-value"><strong style="color: #00ffe8;">${tile.cost}</strong> Điểm Tri Thức (Points)</span>
          </div>
        </div>
      `;
      return;
    }

    const isLandmark = !!tile.landmarkName || !!tile.isLandmark;
    const isUnclaimed = !tile.ownerSchoolName || tile.ownerSchoolName.includes('hoang sơ') || tile.ownerSchoolName.includes('Chưa có chủ');
    const ownerName = isUnclaimed ? 'Vùng tri thức hoang sơ (Chưa khai phá)' : tile.ownerSchoolName;
    const ownerColor = tile.ownerColor || '#94a3b8';

    const coreBadge = tile.isCore
      ? `<span style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; letter-spacing: 0.5px; margin-left: 4px;">LÕI TRI THỨC</span>`
      : '';

    const exchangeBadge = tile.isExchangeZone
      ? `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px; margin-left: 4px; display: inline-flex; align-items: center; gap: 3px;">
          ${Icons.sword(10)} KHU VỰC GIAO LƯU TRI THỨC
        </span>`
      : '';

    // Knowledge Retention value (thay cho Máu / HP)
    const retention = tile.retention !== undefined ? tile.retention : (tile.hp !== undefined ? tile.hp : 100);
    const maxRetention = tile.maxRetention !== undefined ? tile.maxRetention : (tile.maxHp !== undefined ? tile.maxHp : 100);

    // Cột Mốc Tri Thức (thay cho Cấp phòng thủ)
    let knowledgeTierLabel = '';
    if (tile.defenseTier !== undefined && tile.defenseTier > 0) {
      knowledgeTierLabel = `(Cột Mốc Tri Thức Cấp ${tile.defenseTier})`;
    }

    const retentionRow = `
      <div class="tooltip-row">
        <span class="row-label">${Icons.shield('sm')} Độ bền Tri Thức (Retention):</span>
        <span class="row-value" style="font-weight: 700; color: ${retention < maxRetention * 0.4 ? '#f87171' : '#00ffe8'};">
          ${retention} / ${maxRetention} ${knowledgeTierLabel ? `<small style="font-size: 10px; color: #38bdf8;">${knowledgeTierLabel}</small>` : ''}
        </span>
      </div>
    `;

    // Landmark Beacon info (thay cho Bonfire / Than củi)
    let landmarkBeaconSection = '';
    const maxCrystals = tile.maxCrystals !== undefined ? tile.maxCrystals : (tile.maxFuel !== undefined ? tile.maxFuel : 100);
    const currentCrystals = tile.currentCrystals !== undefined ? tile.currentCrystals : (tile.currentFuel || 0);

    if (isLandmark && maxCrystals !== undefined) {
      const isLit = !!tile.isLit;
      const litSchoolText = isLit
        ? `<strong style="color: ${tile.litBySchoolColor || '#10b981'};">Đang thắp Đèn hiệu bởi: ${tile.litBySchoolName || 'Một trường học'}</strong>`
        : `<strong style="color: #00ffe8;">Chưa thắp Đèn hiệu</strong>`;

      landmarkBeaconSection = `
        <div class="tooltip-row" style="background: rgba(0, 255, 232, 0.08); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(0, 255, 232, 0.3); margin-bottom: 5px;">
          <span class="row-label" style="display: flex; align-items: center; gap: 4px; color: #00ffe8;">${Icons.beacon(14)} Đèn hiệu Tri Thức:</span>
          <span class="row-value">${litSchoolText}</span>
        </div>
        <div class="tooltip-row" style="margin-bottom: 5px;">
          <span class="row-label" style="display: flex; align-items: center; gap: 4px;">${Icons.crystal(12)} Tiến độ Tinh thể:</span>
          <span class="row-value"><strong style="color: #00ffe8;">${currentCrystals} / ${maxCrystals} Tinh thể</strong></span>
        </div>
      `;
    }

    const buffRow = tile.buffDescription
      ? `
        <div class="tooltip-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.15); font-size: 10px; color: #cbd5e1; line-height: 1.3;">
          <span style="display: flex; align-items: center; gap: 4px;">${Icons.lightning('sm')} <em>${tile.buffDescription}</em></span>
        </div>
      `
      : '';

    // Action Cost Label
    let costLabel = 'Chi phí Khai phá Vùng Tri Thức:';
    if (tile.isOwnedByMe) {
      costLabel = 'Chi phí Ôn Bài / Củng cố:';
    } else if (tile.isEnemyControlled) {
      costLabel = 'Chi phí Giao lưu Tri Thức:';
    }

    this.element.innerHTML = `
      <div class="tooltip-header" style="border-left-color: ${ownerColor};">
        <div class="tooltip-title-wrap">
          <span class="tooltip-type-icon" style="color: ${ownerColor}; display: flex; align-items: center;">
            ${isLandmark ? Icons.landmark('sm') : Icons.tile('sm')}
          </span>
          <h4 class="tooltip-title">${isLandmark ? tile.landmarkName : `Vùng tri thức (${tile.x}, ${tile.z})`}</h4>
          ${coreBadge}
          ${exchangeBadge}
        </div>
        <span class="tooltip-terrain-tag">${tile.terrainType}</span>
      </div>

      <div class="tooltip-body">
        ${landmarkBeaconSection}
        <div class="tooltip-row">
          <span class="row-label">${Icons.school('sm')} Học viện sở hữu:</span>
          <span class="row-value" style="color: ${ownerColor}; font-weight: 600;">${ownerName}</span>
        </div>
        ${retentionRow}
        <div class="tooltip-row">
          <span class="row-label">${Icons.point('sm')} ${costLabel}</span>
          <span class="row-value"><strong style="color: #00ffe8;">${tile.cost}</strong> Điểm Tri Thức (Points)</span>
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
