// client/src/ui/landmarkModal.ts
import { LANDMARK_ROSTER, LandmarkConfig } from '../../../shared/constants/landmarks';
import { SCHOOL_ROSTER, getSchoolColor } from '../../../shared/constants/schools';
import { Icons } from './icons';

export interface LandmarkModalData {
  landmarkId: string;
  landmarkKey: string;
  name: string;
  category: 'scenic' | 'iconic';
  footprint: { width: number; height: number };
  buffDescription: string;
  gameplayRole: string;
  x: number;
  y: number;
  currentFuel: number;
  maxFuel: number;
  litBySchoolId: string;
  buffActive: boolean;
  fuelBySchool: Record<string, number>;
  userPoints: number;
  playerSchoolId: string;
  hasPath?: boolean;
}

export interface LandmarkModalCallbacks {
  onContributeFuel: (landmarkId: string, amount: number) => void;
  onFocusLandmark?: (x: number, y: number) => void;
}

export class LandmarkModal {
  private overlay: HTMLElement;
  private callbacks: LandmarkModalCallbacks;
  private currentLandmarkId: string | null = null;
  private currentData: LandmarkModalData | null = null;
  private isOpen = false;

  constructor(callbacks: LandmarkModalCallbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.className = 'lm-modal-overlay';
    this.overlay.setAttribute('data-ui', 'true');
    this.overlay.style.display = 'none';

    // Isolate pointer and touch events from 3D scene canvas
    const stopProp = (e: Event) => e.stopPropagation();
    this.overlay.addEventListener('pointerdown', stopProp);
    this.overlay.addEventListener('pointerup', stopProp);
    this.overlay.addEventListener('mousedown', stopProp);
    this.overlay.addEventListener('mouseup', stopProp);
    this.overlay.addEventListener('touchstart', stopProp, { passive: true });
    this.overlay.addEventListener('touchend', stopProp, { passive: true });

    document.body.appendChild(this.overlay);

    this.bindGlobalEvents();
  }

  public open(data: LandmarkModalData): void {
    this.currentLandmarkId = data.landmarkId;
    this.currentData = data;
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.render();
  }

  public update(data: LandmarkModalData): void {
    if (!this.isOpen || this.currentLandmarkId !== data.landmarkId) return;
    this.currentData = data;
    this.render();
  }

  public close(): void {
    this.isOpen = false;
    this.overlay.style.display = 'none';
    this.currentLandmarkId = null;
    this.currentData = null;
  }

  public isVisible(): boolean {
    return this.isOpen;
  }

  public getCurrentLandmarkId(): string | null {
    return this.currentLandmarkId;
  }

  private bindGlobalEvents(): void {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  private render(): void {
    if (!this.currentData) return;

    const data = this.currentData;
    const isLit = !!data.litBySchoolId && data.litBySchoolId !== '';
    const litSchool = isLit ? SCHOOL_ROSTER[data.litBySchoolId] : null;
    const litSchoolColor = isLit ? getSchoolColor(data.litBySchoolId) : '#94a3b8';
    const litSchoolName = litSchool ? litSchool.name : 'Chưa có trường nào thắp lửa';

    const categoryBadge = data.category === 'scenic'
      ? `<span class="lm-category-tag scenic">${Icons.map(13)} DANH LAM THẮNG CẢNH</span>`
      : `<span class="lm-category-tag iconic">${Icons.landmark(13)} CÔNG TRÌNH BIỂU TƯỢNG</span>`;

    const fuelPercent = Math.min(100, Math.round((data.currentFuel / data.maxFuel) * 100));

    // Calculate school rankings for fuel contribution
    const schoolFuelEntries: { schoolId: string; fuel: number }[] = [];
    if (data.fuelBySchool) {
      Object.keys(data.fuelBySchool).forEach((sId) => {
        const amt = data.fuelBySchool[sId];
        if (amt > 0) {
          schoolFuelEntries.push({ schoolId: sId, fuel: amt });
        }
      });
    }
    schoolFuelEntries.sort((a, b) => b.fuel - a.fuel);

    this.overlay.innerHTML = `
      <div class="lm-modal-dialog">
        <!-- Top HUD Header -->
        <div class="lm-modal-header">
          <div class="lm-header-left">
            <div class="lm-modal-kicker">
              <span class="lm-kicker-icon">${Icons.flame(16)}</span>
              <span>PREDATOR // THẮP LỬA CÔNG TRÌNH TRI THỨC</span>
            </div>
            <div class="lm-title-wrap">
              <h2 class="lm-title">${data.name.toUpperCase()}</h2>
              ${categoryBadge}
            </div>
          </div>
          <button class="lm-modal-close" id="lm-btn-close" title="Đóng [Esc]">
            ${Icons.close(18)}
          </button>
        </div>

        <!-- Scrollable Modal Content -->
        <div class="lm-modal-body">
          <!-- 1. Flame & Bonfire Status Banner -->
          <div class="lm-flame-banner ${isLit ? 'is-lit' : 'is-unlit'}" style="--school-color: ${litSchoolColor};">
            <div class="lm-flame-status-left">
              <div class="lm-flame-orb ${isLit ? 'lit-pulse' : ''}" style="color: ${litSchoolColor};">
                ${Icons.flame(28)}
              </div>
              <div class="lm-flame-meta">
                <span class="lm-meta-sub">TRẠNG THÁI NGỌN LỬA CÔNG TRÌNH</span>
                <div class="lm-meta-main">
                  ${isLit 
                    ? `<span class="lm-status-text lit">ĐANG THẮP LỬA BỞI:</span> <strong class="lm-school-highlight" style="color: ${litSchoolColor};">${litSchoolName}</strong>`
                    : `<span class="lm-status-text unlit">CHƯA THẮP LỬA (CẦN NẠP ĐỦ ${data.maxFuel} THAN CỦI)</span>`
                  }
                </div>
              </div>
            </div>
            <div class="lm-flame-status-right">
              <div class="lm-fuel-metric">
                <span class="lm-metric-value" style="color: ${isLit ? litSchoolColor : '#00ffe8'};">${data.currentFuel}</span>
                <span class="lm-metric-divider">/</span>
                <span class="lm-metric-max">${data.maxFuel}</span>
                <span class="lm-metric-unit">Than củi</span>
              </div>
            </div>
          </div>

          <!-- 2. Fuel Progress Bar -->
          <div class="lm-progress-block">
            <div class="lm-progress-header">
              <span class="lm-progress-title">
                ${Icons.flame(14)}
                <span>Tiến độ Nạp Than củi: <strong>${data.currentFuel} / ${data.maxFuel} Than củi</strong></span>
              </span>
              <span class="lm-progress-percent" style="color: ${isLit ? '#10b981' : '#00ffe8'};">${fuelPercent}%</span>
            </div>
            <div class="lm-progress-track">
              <div 
                class="lm-progress-fill ${isLit ? 'lit-fill' : ''}" 
                style="width: ${fuelPercent}%; background: ${isLit ? `linear-gradient(90deg, ${litSchoolColor}99, ${litSchoolColor})` : 'linear-gradient(90deg, #00ffe8, #ff8c00)'}; box-shadow: 0 0 14px ${isLit ? litSchoolColor : 'rgba(0, 255, 232, 0.6)'};"
              >
                <div class="lm-progress-glow-head"></div>
              </div>
            </div>
            <div class="lm-progress-note">
              ${isLit 
                ? `🔥 Công trình đang rực sáng buff tri thức cho <strong>${litSchool?.shortName || litSchoolName}</strong>. Trường khác có thể nạp than củi vượt mốc để thắp đè lên!`
                : `💡 Đạt mốc ${data.maxFuel} Than củi để thắp sáng ngọn lửa và kích hoạt đặc quyền tri thức toàn trường!`
              }
            </div>
          </div>

          <!-- 3. Buff Description Box -->
          <div class="lm-buff-box ${data.buffActive ? 'buff-active' : ''}">
            <div class="lm-buff-header">
              <span class="lm-buff-icon">${Icons.lightning(16)}</span>
              <span class="lm-buff-label">HIỆU ỨNG ĐẶC QUYỀN TRI THỨC (BUFF)</span>
              ${data.buffActive
                ? `<span class="lm-buff-badge active">${Icons.check(12)} ĐANG KÍCH HOẠT</span>`
                : `<span class="lm-buff-badge inactive">${Icons.lock(12)} ĐANG BẢO LƯU</span>`
              }
            </div>
            <div class="lm-buff-content">
              ${data.buffDescription}
            </div>
            <div class="lm-buff-foot">
              <span>Quy mô footprint: <strong>${data.footprint.width} × ${data.footprint.height} ô tiles</strong></span>
              <span>Vị trí: <strong>(${data.x}, ${data.y})</strong></span>
            </div>
          </div>

          <!-- 4. Contribution Leaderboard by School -->
          <div class="lm-schools-leaderboard">
            <div class="lm-section-title">
              ${Icons.trophy(14)}
              <span>BẢNG XẾP HẠNG ĐÓNG GÓP THAN CỦI CÁC TRƯỜNG</span>
            </div>
            <div class="lm-schools-list">
              ${schoolFuelEntries.length === 0
                ? `<div class="lm-no-fuel">Chưa có sinh viên trường nào nạp than củi vào công trình này. Hãy là người đầu tiên!</div>`
                : schoolFuelEntries.map((entry, idx) => {
                    const sc = SCHOOL_ROSTER[entry.schoolId];
                    const scColor = sc ? sc.colorHex : '#94a3b8';
                    const isMySchool = entry.schoolId === data.playerSchoolId;
                    const isLeading = idx === 0 && entry.fuel >= data.maxFuel;
                    const pctOfMax = Math.min(100, Math.round((entry.fuel / data.maxFuel) * 100));

                    return `
                      <div class="lm-school-row ${isMySchool ? 'is-my-school' : ''}">
                        <div class="lm-row-rank">#${idx + 1}</div>
                        <div class="lm-row-school" style="color: ${scColor};">
                          <span class="lm-school-dot" style="background: ${scColor};"></span>
                          <strong>${sc ? sc.name : entry.schoolId.toUpperCase()}</strong>
                          ${isMySchool ? `<span class="lm-my-badge">(Trường của bạn)</span>` : ''}
                          ${isLeading ? `<span class="lm-leading-flame">🔥 Thắp lửa</span>` : ''}
                        </div>
                        <div class="lm-row-amount">
                          <strong>${entry.fuel}</strong>
                          <span>Than củi (${pctOfMax}%)</span>
                        </div>
                      </div>
                    `;
                  }).join('')
              }
            </div>
          </div>

          <!-- 5. Contribution Actions (Points -> Charcoal Fuel) -->
          <div class="lm-contribution-card">
            <div class="lm-contrib-header">
              <div class="lm-contrib-title">
                ${Icons.flame(16)}
                <span>TIẾP TẾ THAN CỦI CHO CÔNG TRÌNH</span>
              </div>
              <div class="lm-user-balance">
                <span class="lm-balance-label">Số dư Điểm cá nhân:</span>
                <span class="lm-balance-val">
                  ${Icons.point(14)}
                  <strong>${data.userPoints}</strong> Điểm (Points)
                </span>
              </div>
            </div>

            <div class="lm-contrib-info">
              Quy đổi Điểm giải chạy của bạn thành Than củi tiếp lửa: <strong>1 Điểm = 1 Than củi</strong>.
            </div>

            <div class="lm-contrib-buttons">
              ${[10, 50, 100].map((amt) => {
                const canAfford = data.userPoints >= amt;
                return `
                  <button 
                    class="lm-fuel-btn ${canAfford ? 'can-afford' : 'cannot-afford'}" 
                    data-amount="${amt}"
                    ${!canAfford ? 'disabled' : ''}
                    title="${canAfford ? `Nạp ${amt} Than củi vào Công trình` : `Không đủ Điểm! Cần ${amt} Điểm`}"
                  >
                    <span class="lm-btn-icon">${Icons.flame(16)}</span>
                    <span class="lm-btn-text">Nạp <strong>+${amt}</strong> Than củi</span>
                    <span class="lm-btn-cost">-${amt} Điểm</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="lm-modal-footer">
          <div class="lm-footer-hint">
            ${Icons.lightning(12)}
            <span>Thắp sáng ngọn lửa công trình để khẳng định sức mạnh tri thức của học viện bạn!</span>
          </div>
          <button class="lm-footer-close-btn" id="lm-btn-footer-close">
            Đóng Giao Diện
          </button>
        </div>
      </div>
    `;

    this.bindActionEvents();
  }

  private bindActionEvents(): void {
    const closeBtn = this.overlay.querySelector('#lm-btn-close');
    closeBtn?.addEventListener('click', () => this.close());

    const footerCloseBtn = this.overlay.querySelector('#lm-btn-footer-close');
    footerCloseBtn?.addEventListener('click', () => this.close());

    const fuelBtns = this.overlay.querySelectorAll('.lm-fuel-btn.can-afford');
    fuelBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const amtStr = btn.getAttribute('data-amount');
        if (amtStr && this.currentLandmarkId) {
          const amount = parseInt(amtStr, 10);
          if (amount > 0) {
            this.callbacks.onContributeFuel(this.currentLandmarkId, amount);
          }
        }
      });
    });
  }
}
