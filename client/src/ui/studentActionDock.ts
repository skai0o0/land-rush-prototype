// client/src/ui/studentActionDock.ts
import { Icons } from './icons';

export interface SelectedTileInfo {
  x: number;
  z: number;
  cost: number;
  ownerId?: string | null;
  ownerSchoolName?: string | null;
  isMySchool: boolean;
  canClaim: boolean;
  reasonDisabled?: string;
}

export class StudentActionDock {
  private container: HTMLElement;
  private currentPoints = 100;
  private selectedTile: SelectedTileInfo | null = null;
  private onClaimCallback?: (tile: SelectedTileInfo) => void;
  private onResetCameraCallback?: () => void;

  constructor(parent?: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'student-action-dock';
    this.render();
    (parent || document.body).appendChild(this.container);
  }

  public setPoints(points: number): void {
    this.currentPoints = points;
    this.update();
  }

  public setSelectedTile(tile: SelectedTileInfo | null): void {
    this.selectedTile = tile;
    this.update();
  }

  public onClaim(cb: (tile: SelectedTileInfo) => void): void {
    this.onClaimCallback = cb;
  }

  public onResetCamera(cb: () => void): void {
    this.onResetCameraCallback = cb;
  }

  private update(): void {
    this.render();
  }

  private render(): void {
    if (!this.selectedTile) {
      this.container.innerHTML = `
        <div class="dock-idle-card">
          <div class="dock-icon-hint">${Icons.crosshair('md')}</div>
          <span class="dock-hint-text">Chọn một ô trên bản đồ để xem thông tin và đổi đất</span>
          <button class="dock-btn-icon btn-reset-cam" title="Căn giữa góc nhìn">
            ${Icons.compass('md')}
          </button>
        </div>
      `;
      this.bindIdleEvents();
      return;
    }

    const { x, z, cost, isMySchool, canClaim, reasonDisabled } = this.selectedTile;
    const hasEnoughPoints = this.currentPoints >= cost;
    const claimable = canClaim && hasEnoughPoints && !isMySchool;

    let buttonText = 'ĐỔI ĐIỂM CHIẾM ĐẤT';
    let statusBadge = '';

    if (isMySchool) {
      buttonText = 'LÃNH THỔ CỦA TRƯỜNG';
      statusBadge = `<span class="badge badge-owned">${Icons.check('sm')} Đã sở hữu</span>`;
    } else if (!hasEnoughPoints) {
      buttonText = 'KHÔNG ĐỦ ĐIỂM CỐNG HIẾN';
      statusBadge = `<span class="badge badge-warning">${Icons.lock('sm')} Cần thêm ${cost - this.currentPoints} điểm</span>`;
    } else if (!canClaim && reasonDisabled) {
      buttonText = reasonDisabled.toUpperCase();
      statusBadge = `<span class="badge badge-disabled">${Icons.lock('sm')} ${reasonDisabled}</span>`;
    } else {
      statusBadge = `<span class="badge badge-available">${Icons.tile('sm')} Sẵn sàng đổi</span>`;
    }

    this.container.innerHTML = `
      <div class="dock-active-panel">
        <div class="dock-tile-meta">
          <div class="tile-coords">
            ${Icons.crosshair('sm')}
            <span>Tọa độ: <strong>(${x}, ${z})</strong></span>
          </div>
          ${statusBadge}
        </div>

        <div class="dock-main-action">
          <button id="btn-claim-tile" class="btn-claim ${claimable ? 'is-active' : 'is-disabled'}" ${!claimable ? 'disabled' : ''}>
            <span class="claim-icon">${Icons.claim('md')}</span>
            <span class="claim-label">${buttonText}</span>
            <span class="claim-cost">
              ${Icons.point('sm')}
              <strong>${cost}</strong>
            </span>
          </button>

          <button class="dock-btn-icon btn-reset-cam" title="Căn lại camera">
            ${Icons.compass('md')}
          </button>
        </div>
      </div>
    `;

    this.bindActiveEvents();
  }

  private bindIdleEvents(): void {
    const btnReset = this.container.querySelector('.btn-reset-cam');
    btnReset?.addEventListener('click', () => this.onResetCameraCallback?.());
  }

  private bindActiveEvents(): void {
    const btnClaim = this.container.querySelector('#btn-claim-tile');
    btnClaim?.addEventListener('click', () => {
      if (this.selectedTile && this.onClaimCallback) {
        this.onClaimCallback(this.selectedTile);
      }
    });

    const btnReset = this.container.querySelector('.btn-reset-cam');
    btnReset?.addEventListener('click', () => this.onResetCameraCallback?.());
  }
}
