import { BEACON_CRYSTALS } from "../../../shared/constants/gameplay";
// client/src/ui/tileTooltip.ts
import { Icons } from './icons';
import { SCHOOL_ROSTER } from '../../../shared/constants/schools';

export interface TileData {
  x: number;
  z: number;
  terrainType: string;
  category?: 'scenic' | 'iconic' | string;
  landmarkName?: string | null;
  landmarkId?: string | null;
  ownerSchoolName?: string | null;
  ownerSchoolId?: string | null;
  ownerColor?: string;
  cost: number;
  isOwnedByMe: boolean;
  isEnemyControlled?: boolean;
  isAdjacent?: boolean;
  isExchangeZone?: boolean; // Khu vực giao lưu tri thức
  isShared?: boolean; // Ô Tri Thức Chung (Shared Knowledge Zone)
  knowledgeSchoolIds?: string[];
  sharedWithSchoolId?: string | null;
  sharedExpiresAt?: number;
  isChallengedByMe?: boolean;
  playerSchoolId?: string;
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
  private countdownInterval?: number;

  constructor(parent?: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'tile-tactical-tooltip';
    this.element.style.display = 'none';
    (parent || document.body).appendChild(this.element);
  }

  public show(tile: TileData, clientX: number, clientY: number): void {
    if (this.countdownInterval) {
      window.clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }

    this.visible = true;
    this.element.style.display = 'block';

    // Auto dock avoiding screen edges
    const offset = 16;
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + 330 > window.innerWidth) {
      left = clientX - 340;
    }
    if (top + 280 > window.innerHeight) {
      top = clientY - 290;
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
            <span>Khu vực bị che phủ bởi sương mù. Khám phá các ô tri thức tiếp giáp từ Trụ sở HQ hoặc Công trình để xua tan sương mù.</span>
          </div>
          <div class="tooltip-row" style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px;">
            <span class="row-label">${Icons.point('sm')} Chi phí Khám phá Ô Tri Thức:</span>
            <span class="row-value"><strong style="color: #00ffe8;">${tile.cost}</strong> Điểm (Points)</span>
          </div>
        </div>
      `;
      return;
    }

    const isLandmark = !!tile.landmarkName || !!tile.isLandmark;
    const isUnclaimed = !tile.ownerSchoolName || tile.ownerSchoolName.includes('hoang sơ') || tile.ownerSchoolName.includes('Chưa có chủ') || tile.ownerSchoolName.includes('CHƯA CÓ CHỦ');
    const ownerName = isUnclaimed ? 'CHƯA CÓ CHỦ' : tile.ownerSchoolName;
    const ownerColor = tile.ownerColor || '#94a3b8';

    const coreBadge = tile.isCore
      ? `<span style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; letter-spacing: 0.5px; margin-left: 4px;">LÕI TRI THỨC</span>`
      : '';

    const sharedBadge = tile.isShared
      ? `<span class="shared-zone-badge" style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px; margin-left: 4px; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);">
          ⚡ Ô TRI THỨC CHUNG
        </span>`
      : '';

    const exchangeBadge = (tile.isExchangeZone && !tile.isShared)
      ? `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px; margin-left: 4px; display: inline-flex; align-items: center; gap: 3px;">
          ${Icons.sword(10)} KHU VỰC GIAO LƯU TRI THỨC
        </span>`
      : '';

    // Shared Knowledge Zone Section (Ô Tri Thức Chung)
    let sharedSection = '';
    if (tile.isShared) {
      const schools = tile.knowledgeSchoolIds || (tile.sharedWithSchoolId || '').split(',').map(id => id.trim()).filter(Boolean);
      const schoolNames = schools.map(id => SCHOOL_ROSTER[id]?.name || 'Trường tham gia').join(' · ');
      sharedSection = `<div class="tooltip-shared-zone" style="padding:8px;color:#fbbf24">
        <strong>Ô TRI THỨC CHUNG</strong><br>
        ${schoolNames}<br>Mỗi trường ôn bài và giữ tri thức độc lập. Tri thức của một trường có thể phai, các trường còn lại vẫn tiếp tục giữ tri thức tại ô này.
      </div>`;
    }

    // Landmark Beacon info (thay cho Bonfire / Than củi)
    let landmarkBeaconSection = '';
    const maxCrystals = tile.maxCrystals !== undefined ? tile.maxCrystals : (tile.maxFuel !== undefined ? tile.maxFuel : BEACON_CRYSTALS);
    const currentCrystals = tile.currentCrystals !== undefined ? tile.currentCrystals : (tile.currentFuel || 0);

    if (isLandmark && maxCrystals !== undefined) {
      const isLit = !!tile.isLit;
      const litSchoolText = isLit
        ? `<strong style="color: ${tile.litBySchoolColor || '#10b981'};">Đèn hiệu đã sáng bởi: ${tile.litBySchoolName || 'Một trường học'}</strong>`
        : `<strong style="color: #00ffe8;">Chưa thắp Đèn hiệu</strong>`;

      landmarkBeaconSection = `
        <div class="tooltip-row" style="background: rgba(0, 255, 232, 0.08); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(0, 255, 232, 0.3); margin-bottom: 5px;">
          <span class="row-label" style="display: flex; align-items: center; gap: 4px; color: #00ffe8;">${Icons.beacon(14)} Đèn hiệu:</span>
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
    let costLabel = 'Chi phí Khám phá Ô Tri Thức:';
    if (tile.isShared) {
      costLabel = 'Chi phí Ôn bài:';
    } else if (tile.isOwnedByMe) {
      costLabel = 'Chi phí Ôn Bài:';
    } else if (tile.isEnemyControlled) {
      costLabel = 'Chi phí Giao lưu Tri Thức:';
    }

    // Header Tag: "Danh lam thắng cảnh" hoặc "Công trình biểu tượng" theo category
    let tagText = tile.terrainType;
    if (isLandmark) {
      if (tile.category === 'scenic') {
        tagText = 'Danh lam thắng cảnh';
      } else if (tile.category === 'iconic') {
        tagText = 'Công trình biểu tượng';
      } else {
        tagText = 'Công trình';
      }
    }

    // Owner Row (Không hiện dòng học viện sở hữu khi là ô chung)
    const ownerRow = !tile.isShared
      ? `
        <div class="tooltip-row">
          <span class="row-label">${Icons.school('sm')} Học viện sở hữu:</span>
          <span class="row-value" style="color: ${ownerColor}; font-weight: 600;">${ownerName}</span>
        </div>
      `
      : '';

    this.element.innerHTML = `
      <div class="tooltip-header" style="border-left-color: ${ownerColor};">
        <div class="tooltip-title-wrap">
          <span class="tooltip-type-icon" style="color: ${ownerColor}; display: flex; align-items: center;">
            ${isLandmark ? Icons.landmark('sm') : Icons.tile('sm')}
          </span>
          <h4 class="tooltip-title">${isLandmark ? tile.landmarkName : `Ô tri thức (${tile.x}, ${tile.z})`}</h4>
          ${coreBadge}
          ${sharedBadge}
          ${exchangeBadge}
        </div>
        <span class="tooltip-terrain-tag">${tagText}</span>
      </div>

      <div class="tooltip-body">
        ${sharedSection}
        ${landmarkBeaconSection}
        ${ownerRow}
        <div class="tooltip-row">
          <span class="row-label">${Icons.point('sm')} ${costLabel}</span>
          <span class="row-value"><strong style="color: #00ffe8;">${tile.cost}</strong> Điểm (Points)</span>
        </div>
        ${buffRow}
      </div>
    `;
  }

  public hide(): void {
    if (this.countdownInterval) {
      window.clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }
    if (!this.visible) return;
    this.visible = false;
    this.element.style.display = 'none';
  }
}
