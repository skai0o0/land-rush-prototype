// client/src/ui/landmarkModal.ts
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
  currentCrystals: number;
  maxCrystals: number;
  litBySchoolId: string;
  buffActive: boolean;
  crystalsBySchool: Record<string, number>;
  userPoints: number;
  userCrystals?: number;
  playerSchoolId: string;
  hasPath?: boolean;
  nameGuessed?: boolean;
  guessedBySchoolId?: string;
  guessCooldownUntil?: number;
  // Aliases for compatibility
  currentFuel?: number;
  maxFuel?: number;
  fuelBySchool?: Record<string, number>;
}

export interface LandmarkModalCallbacks {
  onContributeCrystal: (landmarkId: string, amount: number) => void;
  onContributeFuel?: (landmarkId: string, amount: number) => void;
  onGuessLandmark?: (landmarkId: string, guess: string) => void;
  onFocusLandmark?: (x: number, y: number) => void;
}

export class LandmarkModal {
  private overlay: HTMLElement;
  private callbacks: LandmarkModalCallbacks;
  private currentLandmarkId: string | null = null;
  private currentData: LandmarkModalData | null = null;
  private isOpen = false;
  private countdownTimer: any = null;

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
    this.bindLitEventListeners();
  }

  /**
   * Listen to both 'beacon_lit' and 'landmark_lit' window events
   */
  private bindLitEventListeners(): void {
    const handleLitEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      this.onBeaconLit(detail);
    };

    window.addEventListener('beacon_lit', handleLitEvent);
    window.addEventListener('landmark_lit', handleLitEvent);
  }

  /**
   * Handle beacon lit notification from socket or custom event
   */
  public onBeaconLit(data: { landmarkId: string; schoolId: string; crystals?: number; fuel?: number }): void {
    if (!this.isOpen || !this.currentData) return;
    const matchId = this.currentLandmarkId === data.landmarkId || this.currentData.landmarkKey === data.landmarkId;
    if (matchId) {
      if (data.schoolId) {
        this.currentData.litBySchoolId = data.schoolId;
        this.currentData.buffActive = true;
      }
      const newCrystals = data.crystals !== undefined ? data.crystals : data.fuel;
      if (newCrystals !== undefined) {
        this.currentData.currentCrystals = newCrystals;
      }
      this.render();
    }
  }

  /**
   * Backward-compatibility alias for onBeaconLit
   */
  public onLandmarkLit(data: { landmarkId: string; schoolId: string; crystals?: number; fuel?: number }): void {
    this.onBeaconLit(data);
  }

  public open(data: LandmarkModalData): void {
    this.currentLandmarkId = data.landmarkId;
    this.currentData = { ...data };
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.render();
    this.startCooldownTimer();
  }

  public update(data: LandmarkModalData): void {
    if (!this.isOpen || this.currentLandmarkId !== data.landmarkId) return;
    this.currentData = { ...data };
    this.render();
  }

  public setGuessCooldown(untilTimestamp: number): void {
    if (this.currentData) {
      this.currentData.guessCooldownUntil = untilTimestamp;
      this.render();
      this.startCooldownTimer();
    }
  }

  public close(): void {
    this.isOpen = false;
    this.stopCooldownTimer();
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

  private startCooldownTimer(): void {
    this.stopCooldownTimer();
    this.countdownTimer = setInterval(() => {
      if (!this.isOpen || !this.currentData) {
        this.stopCooldownTimer();
        return;
      }
      const cd = this.currentData.guessCooldownUntil || 0;
      const now = Date.now();
      const remainingSec = Math.max(0, Math.ceil((cd - now) / 1000));
      const timerEl = this.overlay.querySelector('#lm-guess-timer-text');
      const submitBtn = this.overlay.querySelector('#lm-btn-guess-submit') as HTMLButtonElement | null;
      const guessInput = this.overlay.querySelector('#lm-guess-input') as HTMLInputElement | null;

      if (remainingSec > 0) {
        const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
        const ss = String(remainingSec % 60).padStart(2, '0');
        if (timerEl) {
          timerEl.textContent = `Thời gian chờ thử lại: ${mm}:${ss}`;
        }
        if (submitBtn) submitBtn.disabled = true;
        if (guessInput) guessInput.disabled = true;
      } else {
        if (this.currentData.guessCooldownUntil && this.currentData.guessCooldownUntil > 0) {
          this.currentData.guessCooldownUntil = 0;
          this.render();
        }
      }
    }, 1000);
  }

  private stopCooldownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
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
    const litSchoolColor = isLit ? getSchoolColor(data.litBySchoolId) : '#00ffe8';
    const litSchoolName = litSchool ? litSchool.name : 'Chưa có trường nào thắp Đèn hiệu';

    const categoryBadge = data.category === 'scenic'
      ? `<span class="lm-category-tag scenic">${Icons.map(13)} DANH LAM THẮNG CẢNH</span>`
      : `<span class="lm-category-tag iconic">${Icons.landmark(13)} CÔNG TRÌNH BIỂU TƯỢNG</span>`;

    const curCrystals = data.currentCrystals !== undefined ? data.currentCrystals : (data.currentFuel || 0);
    const maxCrystals = data.maxCrystals || 100;
    const crystalPercent = Math.min(100, Math.round((curCrystals / maxCrystals) * 100));

    // Calculate school rankings for crystal contribution
    const crystalSource = data.crystalsBySchool || data.fuelBySchool || {};
    const schoolCrystalEntries: { schoolId: string; crystals: number }[] = [];
    Object.keys(crystalSource).forEach((sId) => {
      const amt = crystalSource[sId];
      if (amt > 0) {
        schoolCrystalEntries.push({ schoolId: sId, crystals: amt });
      }
    });
    schoolCrystalEntries.sort((a, b) => b.crystals - a.crystals);

    // Personal user balances
    const userCrystals = data.userCrystals || 0;
    const userPoints = data.userPoints || 0;
    const totalResource = userCrystals + userPoints;

    // Guessing status & cooldown
    const now = Date.now();
    const cooldownUntil = data.guessCooldownUntil || 0;
    const isUnderCooldown = cooldownUntil > now;
    const remainingSec = isUnderCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
    const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const ss = String(remainingSec % 60).padStart(2, '0');

    const nameGuessed = !!data.nameGuessed;
    const guessedSchool = data.guessedBySchoolId ? SCHOOL_ROSTER[data.guessedBySchoolId] : null;
    const guessedSchoolName = guessedSchool ? guessedSchool.name : (data.guessedBySchoolId ? data.guessedBySchoolId.toUpperCase() : '');

    this.overlay.innerHTML = `
      <div class="lm-modal-dialog">
        <!-- Top HUD Header -->
        <div class="lm-modal-header">
          <div class="lm-header-left">
            <div class="lm-modal-kicker">
              <span class="lm-kicker-icon">${Icons.beacon(16)}</span>
              <span>[PREDATOR] // THẮP ĐÈN HIỆU CÔNG TRÌNH TRI THỨC</span>
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
          <!-- 1. Beacon Status Banner -->
          <div class="lm-beacon-banner lm-flame-banner ${isLit ? 'is-lit' : 'is-unlit'}" style="--school-color: ${litSchoolColor};">
            <div class="lm-flame-status-left">
              <div class="lm-beacon-orb lm-flame-orb ${isLit ? 'lit-pulse' : ''}" style="color: ${isLit ? litSchoolColor : '#00ffe8'};">
                ${Icons.beacon(28)}
              </div>
              <div class="lm-flame-meta">
                <span class="lm-meta-sub">TRẠNG THÁI ĐÈN HIỆU CÔNG TRÌNH</span>
                <div class="lm-meta-main">
                  ${isLit 
                    ? `<span class="lm-status-text lit">ĐANG THẮP ĐÈN HIỆU BỞI:</span> <strong class="lm-school-highlight" style="color: ${litSchoolColor};">${litSchoolName}</strong>`
                    : `<span class="lm-status-text unlit">CHƯA THẮP ĐÈN HIỆU (CẦN NẠP ĐỦ ${maxCrystals} TINH THỂ)</span>`
                  }
                </div>
              </div>
            </div>
            <div class="lm-flame-status-right">
              <div class="lm-fuel-metric lm-crystal-metric">
                <span class="lm-metric-value" style="color: ${isLit ? litSchoolColor : '#00ffe8'};">${curCrystals}</span>
                <span class="lm-metric-divider">/</span>
                <span class="lm-metric-max">${maxCrystals}</span>
                <span class="lm-metric-unit">Tinh thể</span>
              </div>
            </div>
          </div>

          <!-- 2. Crystal Progress Bar -->
          <div class="lm-progress-block">
            <div class="lm-progress-header">
              <span class="lm-progress-title">
                ${Icons.crystal(14)}
                <span>Tiến độ Nạp Tinh thể: <strong>${curCrystals} / ${maxCrystals} Tinh thể</strong></span>
              </span>
              <span class="lm-progress-percent" style="color: ${isLit ? '#10b981' : '#00ffe8'};">${crystalPercent}%</span>
            </div>
            <div class="lm-progress-track">
              <div 
                class="lm-progress-fill ${isLit ? 'lit-fill' : ''}" 
                style="width: ${crystalPercent}%; background: ${isLit ? `linear-gradient(90deg, ${litSchoolColor}99, ${litSchoolColor})` : 'linear-gradient(90deg, #00ffe8, #0062ff)'}; box-shadow: 0 0 14px ${isLit ? litSchoolColor : 'rgba(0, 255, 232, 0.6)'};"
              >
                <div class="lm-progress-glow-head"></div>
              </div>
            </div>
            <div class="lm-progress-note">
              ${isLit 
                ? `⚡ Đèn hiệu đang chiếu rọi hào quang buff tri thức cho <strong>${litSchool?.shortName || litSchoolName}</strong>. Trường khác có thể nạp vượt mốc (+20 Tinh thể) để thắp đè lên!`
                : `💡 Đạt mốc ${maxCrystals} Tinh thể để thắp sáng Đèn hiệu tri thức và kích hoạt đặc quyền toàn trường!`
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

          <!-- 4. Landmark Guessing Mini-Game UI Section -->
          <div class="lm-guessing-card">
            <div class="lm-guess-header">
              <span class="lm-guess-icon">${Icons.target(16)}</span>
              <span class="lm-guess-title">ĐOÁN TÊN ĐỊA DANH (NHẬN 10% TIẾN ĐỘ = 10 TINH THỂ)</span>
            </div>

            ${nameGuessed
              ? `
                <div class="lm-guess-solved-box">
                  <span class="lm-guess-solved-icon">${Icons.check(16)}</span>
                  <div class="lm-guess-solved-text">
                    Địa danh này đã được giải đố thành công bởi trường <strong>${guessedSchoolName}</strong>! (+10 Tinh thể đã được cộng vào tiến độ Đèn hiệu).
                  </div>
                </div>
              `
              : `
                <div class="lm-guess-form">
                  <div class="lm-guess-input-wrap">
                    <input 
                      type="text" 
                      id="lm-guess-input" 
                      class="lm-guess-input ${isUnderCooldown ? 'is-disabled' : ''}" 
                      placeholder="Nhập tên địa danh viết thường..." 
                      ${isUnderCooldown ? 'disabled' : ''}
                      autocomplete="off"
                    />
                    <button 
                      id="lm-btn-guess-submit" 
                      class="lm-guess-submit-btn ${isUnderCooldown ? 'is-disabled' : ''}" 
                      ${isUnderCooldown ? 'disabled' : ''}
                    >
                      ${Icons.sparkles(14)}
                      <span>Gửi Dự Đoán</span>
                    </button>
                  </div>
                  ${isUnderCooldown
                    ? `<div class="lm-guess-timer" id="lm-guess-timer-text">Thời gian chờ thử lại: ${mm}:${ss}</div>`
                    : `<div class="lm-guess-hint">Mỗi lần đoán sai sẽ áp dụng thời gian chờ thử lại là 10 phút. Tên địa danh không phân biệt hoa thường.</div>`
                  }
                </div>
              `
            }
          </div>

          <!-- 5. Contribution Leaderboard by School -->
          <div class="lm-schools-leaderboard">
            <div class="lm-section-title">
              ${Icons.trophy(14)}
              <span>BẢNG XẾP HẠNG ĐÓNG GÓP TINH THỂ CÁC TRƯỜNG</span>
            </div>
            <div class="lm-schools-list">
              ${schoolCrystalEntries.length === 0
                ? `<div class="lm-no-fuel lm-no-crystals">Chưa có sinh viên trường nào nạp Tinh thể vào công trình này. Hãy là người đầu tiên!</div>`
                : schoolCrystalEntries.map((entry, idx) => {
                    const sc = SCHOOL_ROSTER[entry.schoolId];
                    const scColor = sc ? sc.colorHex : '#94a3b8';
                    const isMySchool = entry.schoolId === data.playerSchoolId;
                    const isLeading = idx === 0 && entry.crystals >= maxCrystals;
                    const pctOfMax = Math.min(100, Math.round((entry.crystals / maxCrystals) * 100));

                    return `
                      <div class="lm-school-row ${isMySchool ? 'is-my-school' : ''}">
                        <div class="lm-row-rank">#${idx + 1}</div>
                        <div class="lm-row-school" style="color: ${scColor};">
                          <span class="lm-school-dot" style="background: ${scColor};"></span>
                          <strong>${sc ? sc.name : entry.schoolId.toUpperCase()}</strong>
                          ${isMySchool ? `<span class="lm-my-badge">(Trường của bạn)</span>` : ''}
                          ${isLeading ? `<span class="lm-leading-beacon lm-leading-flame">⚡ Thắp Đèn hiệu</span>` : ''}
                        </div>
                        <div class="lm-row-amount">
                          <strong>${entry.crystals}</strong>
                          <span>Tinh thể (${pctOfMax}%)</span>
                        </div>
                      </div>
                    `;
                  }).join('')
              }
            </div>
          </div>

          <!-- 6. Contribution Actions: Nạp Tinh Thể (+10, +20, +50) -->
          <div class="lm-contribution-card">
            <div class="lm-contrib-header">
              <div class="lm-contrib-title">
                ${Icons.crystal(16)}
                <span>NẠP TINH THỂ THẮP SÁNG ĐÈN HIỆU</span>
              </div>
              <div class="lm-user-balance-group">
                <div class="lm-user-balance">
                  <span class="lm-balance-label">Tinh thể cá nhân:</span>
                  <span class="lm-balance-val crystal">
                    ${Icons.crystal(14)}
                    <strong>${userCrystals}</strong> Tinh thể
                  </span>
                </div>
                <div class="lm-user-balance">
                  <span class="lm-balance-label">Điểm Tri Thức:</span>
                  <span class="lm-balance-val points">
                    ${Icons.point(14)}
                    <strong>${userPoints}</strong> Điểm
                  </span>
                </div>
              </div>
            </div>

            <div class="lm-contrib-info">
              Sử dụng Tinh thể thu thập từ UniStop/Rương, hoặc tự động quy đổi Điểm Tri Thức nếu thiếu (1 Điểm Tri Thức = 1 Tinh thể để thắp Đèn hiệu).
            </div>

            <div class="lm-contrib-buttons">
              ${[10, 20, 50].map((amt) => {
                const canAfford = totalResource >= amt;
                const hasEnoughCrystals = userCrystals >= amt;
                const missingCrystals = Math.max(0, amt - userCrystals);
                
                let btnActionText = `Nạp <strong>+${amt}</strong> Tinh Thể`;
                let btnSubText = `-${amt} Tinh thể`;
                if (!hasEnoughCrystals && canAfford) {
                  btnActionText = `Quy đổi Điểm sang Tinh Thể`;
                  btnSubText = userCrystals > 0 
                    ? `-${userCrystals} Crystal, -${missingCrystals} Điểm` 
                    : `Quy đổi -${amt} Điểm`;
                } else if (!canAfford) {
                  btnSubText = `Cần ${amt} Tinh thể/Điểm`;
                }

                return `
                  <button 
                    class="lm-fuel-btn lm-crystal-btn ${canAfford ? 'can-afford' : 'cannot-afford'}" 
                    data-amount="${amt}"
                    ${!canAfford ? 'disabled' : ''}
                    title="${canAfford ? (hasEnoughCrystals ? `Nạp ${amt} Tinh thể vào Công trình` : `Quy đổi ${missingCrystals} Điểm sang Tinh thể để thắp Đèn hiệu`) : `Không đủ tài nguyên! Cần ${amt} Tinh thể hoặc Điểm`}"
                  >
                    <span class="lm-btn-icon">${Icons.crystal(16)}</span>
                    <span class="lm-btn-text">${btnActionText}</span>
                    <span class="lm-btn-cost">${btnSubText}</span>
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
            <span>Thắp sáng Đèn hiệu công trình để kích hoạt đặc quyền tri thức cho toàn bộ học viện của bạn!</span>
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

    // Nạp Tinh thể buttons
    const crystalBtns = this.overlay.querySelectorAll('.lm-fuel-btn.can-afford, .lm-crystal-btn.can-afford');
    crystalBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const amtStr = btn.getAttribute('data-amount');
        if (amtStr && this.currentLandmarkId) {
          const amount = parseInt(amtStr, 10);
          if (amount > 0) {
            if (this.callbacks.onContributeCrystal) {
              this.callbacks.onContributeCrystal(this.currentLandmarkId, amount);
            } else if (this.callbacks.onContributeFuel) {
              this.callbacks.onContributeFuel(this.currentLandmarkId, amount);
            }
          }
        }
      });
    });

    // Guess Landmark Submit
    const guessInput = this.overlay.querySelector('#lm-guess-input') as HTMLInputElement | null;
    const guessSubmitBtn = this.overlay.querySelector('#lm-btn-guess-submit') as HTMLButtonElement | null;

    const doSubmitGuess = () => {
      if (!guessInput || !this.currentLandmarkId) return;
      const guess = guessInput.value.trim();
      if (!guess) return;
      if (this.callbacks.onGuessLandmark) {
        this.callbacks.onGuessLandmark(this.currentLandmarkId, guess);
      }
    };

    guessSubmitBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      doSubmitGuess();
    });

    guessInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSubmitGuess();
      }
    });
  }
}
