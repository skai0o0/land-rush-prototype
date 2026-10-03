// client/src/ui/devToolsPanel.ts
import { Icons } from './icons';
import { MOCK_STUDENT_ACCOUNTS } from '../../../shared/constants/schools';
import { RunningDatabase } from '../services/runningDatabase';
import { FogOfWarManager } from '../engine/fogOfWarManager';

export interface DevPanelCallbacks {
  onToggleBot: (isRunning: boolean) => void;
  onAddPoints: (amount: number) => void;
  onResetMap: () => void;
  onResetCamera: () => void;
  onToggleGrid?: (show: boolean) => void;
  onToggleFog?: (show: boolean) => void;
  onSwitchAccount?: (email: string, schoolId: string, km: number) => void;
  onToggleMode?: (mode: "normal" | "dev") => void;
  onOpenNewTab?: (schoolId: string, email: string, km: number) => void;
  onOpenDbEditor?: () => void;
  onSetGraphicsTier?: (tier: 'performance' | 'balanced' | 'high') => void;
  onDevSpawnBastion?: () => void;
  onDevSpawnMegaEmblem?: () => void;
  onDevBreachCluster?: () => void;
  onDevMaxFortifyAll?: () => void;
  onSetFogAlpha?: (alpha: number) => void;
  onSetFogColor?: (colorHex: string) => void;
  onSetEdgeSoftness?: (softness: number) => void;
  onSetMeltDuration?: (duration: number) => void;
  onDevResetCooldowns?: () => void;
  onDevAddCrystals?: (amount?: number) => void;
  onDevAddKeys?: (aspire?: number, nitro?: number, predator?: number) => void;
}

export class DevToolsPanel {
  private container: HTMLElement;
  private isOpen = false;
  private isBotRunning = false;
  private showGrid = true;
  private showFog = true;
  private currentMode: "normal" | "dev" = "dev";
  private currentTier: 'performance' | 'balanced' | 'high' = 'balanced';
  private selectedMockEmail: string = MOCK_STUDENT_ACCOUNTS[0].email;
  private currentFogAlpha = 0.6;
  private currentFogColor = "#cfd8e3";
  private currentEdgeSoftness: number = 1.5;
  private currentMeltDuration: number = 1.0;
  private callbacks: DevPanelCallbacks;

  constructor(callbacks: DevPanelCallbacks, parent?: HTMLElement, initialMode: "normal" | "dev" = "dev", initialEmail?: string) {
    this.callbacks = callbacks;
    this.currentMode = initialMode;
    const isMobile = window.innerWidth <= 768 || window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
    this.currentTier = isMobile ? 'performance' : 'balanced';
    if (initialEmail) {
      this.selectedMockEmail = initialEmail;
    }
    this.container = document.createElement('div');
    this.container.className = 'dev-dropdown-container';
    this.container.setAttribute('data-ui', 'true');

    // Isolate pointer and touch events
    const stopProp = (e: Event) => e.stopPropagation();
    this.container.addEventListener('pointerdown', stopProp);
    this.container.addEventListener('mousedown', stopProp);
    this.container.addEventListener('touchstart', stopProp, { passive: true });

    this.render();
    (parent || document.body).appendChild(this.container);
    this.bindEvents();

    // Auto-update student list when database changes
    RunningDatabase.subscribe((students) => {
      // Keep selected email valid
      if (!students.some(s => s.email === this.selectedMockEmail) && students.length > 0) {
        this.selectedMockEmail = students[0].email;
      }
      this.render();
      this.bindEvents();
    });
  }

  public setSelectedAccount(email: string): void {
    this.selectedMockEmail = email;
    this.render();
    this.bindEvents();
  }

  public setMode(mode: "normal" | "dev"): void {
    this.currentMode = mode;
    this.render();
    this.bindEvents();
  }

  public setBotStatus(running: boolean): void {
    this.isBotRunning = running;
    const toggle = this.container.querySelector('#bot-toggle-btn');
    if (toggle) {
      toggle.className = `btn-dev-toggle ${this.isBotRunning ? 'active' : ''}`;
      toggle.textContent = this.isBotRunning ? 'ĐANG CHẠY' : 'ĐÃ TẮT';
    }
  }

  public setGraphicsTier(tier: 'performance' | 'balanced' | 'high'): void {
    this.currentTier = tier;
    this.render();
    this.bindEvents();
  }

  public setFps(_fps: number): void {}
  public setTick(_tick: number): void {}

  private render(): void {
    const students = RunningDatabase.getAll();
    const selectedAcc = students.find(a => a.email === this.selectedMockEmail) || students[0];

    this.container.innerHTML = `
      <!-- Nút mở/đóng Dropdown Menu -->
      <button class="dev-dropdown-trigger" id="dev-trigger-btn" title="Cài đặt & Dev Simulation">
        ${Icons.settings('sm')}
        <span class="trigger-label">${this.currentMode === "dev" ? "Dev Control" : "Sinh Viên Mode"}</span>
        <svg class="chevron-icon ${this.isOpen ? 'open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <!-- Menu nội dung (mặc định ẩn) -->
      <div class="dev-dropdown-menu ${this.isOpen ? 'show' : ''}" id="dev-menu-body">
        
        <!-- 1. CHẾ ĐỘ CHƠI -->
        <div class="dev-menu-section">
          <div class="section-title">CHẾ ĐỘ HÀNH TRÌNH</div>
          <div class="dev-row">
            <span>Chế độ:</span>
            <button id="mode-toggle-btn" class="btn-dev-toggle ${this.currentMode === 'dev' ? 'active' : ''}" title="Chuyển giữa chế độ Dev tự do và Khám phá khóa trường">
              ${this.currentMode === 'dev' ? 'DEV (TỰ DO)' : 'KHÁM PHÁ (THEO TRƯỜNG)'}
            </button>
          </div>
        </div>

        <!-- 2. TÀI KHOẢN SINH VIÊN -->
        <div class="dev-menu-section">
          <div class="section-title">TÀI KHOẢN SINH VIÊN (${students.length} TÀI KHOẢN)</div>
          <select id="mock-account-select" class="dev-account-select">
            ${students.map(acc => {
              const balance = RunningDatabase.getStudentBalance(acc.email);
              return `
                <option value="${acc.email}" ${acc.email === this.selectedMockEmail ? 'selected' : ''}>
                  ${acc.name} (${acc.schoolId.toUpperCase()} - ${balance}đ/${acc.km}km)
                </option>
              `;
            }).join('')}
          </select>
          <div class="dev-btn-group" style="margin-top: 4px;">
            <button class="btn-dev-action" id="btn-switch-account" title="Chuyển sang tài khoản sinh viên này ngay trong tab này">Đăng nhập tài khoản</button>
            <button class="btn-dev-action" id="btn-open-tab" title="Mở tab mới với tài khoản này để test nhiều người chơi cùng lúc">Mở tab mới (+)</button>
            <button class="btn-dev-action" id="btn-open-db" style="grid-column: span 2; background: rgba(0, 255, 232, 0.15); border-color: rgba(0, 255, 232, 0.45); color: #00ffe8; font-weight: 700;" title="Mở bảng điều khiển cơ sở dữ liệu giải chạy Road to Predator League">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align: -2px; margin-right: 4px;">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              Quản lý Database Giải Chạy
            </button>
          </div>
        </div>

        <!-- 3. ĐIỂM GIẢI CHẠY (1 KM = 10 ĐIỂM) -->
        <div class="dev-menu-section">
          <div class="section-title">GIẢ LẬP ĐIỂM (POINTS) (1 KM = 10 ĐIỂM)</div>
          <div class="dev-btn-group">
            <button class="btn-dev-action" id="btn-add-50pts">+5 km (50 pts)</button>
            <button class="btn-dev-action" id="btn-add-100pts">+10 km (100 pts)</button>
            <button class="btn-dev-action" id="btn-add-500pts">+50 km (500 pts)</button>
          </div>
        </div>

        <!-- 4. GIẢ LẬP BOT -->
        <div class="dev-menu-section">
          <div class="section-title">GIẢ LẬP BOT (TỰ ĐỘNG)</div>
          <div class="dev-row">
            <span>Trạng thái Bot:</span>
            <button id="bot-toggle-btn" class="btn-dev-toggle ${this.isBotRunning ? 'active' : ''}">
              ${this.isBotRunning ? 'ĐANG CHẠY' : 'ĐÃ TẮT'}
            </button>
          </div>
        </div>

        <!-- 5. CHẾ ĐỘ ĐỒ HỌA & HIỆU NĂNG -->
        <div class="dev-menu-section">
          <div class="section-title">CHẾ ĐỘ ĐỒ HỌA & HIỆU NĂNG</div>
          <div class="dev-btn-group" style="grid-template-columns: 1fr 1fr 1fr;">
            <button class="btn-dev-action ${this.currentTier === 'performance' ? 'active' : ''}" id="tier-perf-btn" title="60 FPS mượt mà cho mobile & máy yếu">60 FPS</button>
            <button class="btn-dev-action ${this.currentTier === 'balanced' ? 'active' : ''}" id="tier-bal-btn" title="Cân bằng hiệu năng và bóng đổ">Cân Bằng</button>
            <button class="btn-dev-action ${this.currentTier === 'high' ? 'active' : ''}" id="tier-high-btn" title="Đồ họa sắc nét cao nhất">Cao Cấp</button>
          </div>
        </div>

        <!-- 6. HỆ THỐNG & CAMERA -->
        <div class="dev-menu-section">
          <div class="section-title">HỆ THỐNG & CAMERA</div>
          <div class="dev-btn-group">
            <button class="btn-dev-action" id="btn-dev-recenter">Căn camera Trụ sở HQ</button>
            <button class="btn-dev-action" id="btn-dev-grid">Ẩn/Hiện lưới</button>
            <button class="btn-dev-action" id="btn-dev-fog">Ẩn/Hiện sương mù</button>
            <button class="btn-dev-action danger" id="btn-dev-reset">Reset Bản Đồ</button>
          </div>
        </div>

        <!-- 7. ĐIỀU CHỈNH SƯƠNG MÙ -->
        <div class="dev-menu-section">
          <div class="section-title">ĐIỀU CHỈNH SƯƠNG MÙ</div>
          <div class="dev-row" style="margin-bottom: 4px;">
            <span>Độ mờ sương:</span>
            <span id="fow-alpha-val" style="font-weight: 700; color: #00ffe8;">${Math.round(this.currentFogAlpha * 100)}%</span>
          </div>
          <input type="range" id="fow-alpha-slider" min="0" max="1" step="0.05" value="${this.currentFogAlpha}" style="width: 100%; accent-color: #00ffe8; cursor: pointer;">
          
          <div class="dev-row" style="margin-top: 6px; margin-bottom: 4px;">
            <span>Độ mềm mép:</span>
            <span id="fow-edge-val" style="font-weight: 700; color: #00ffe8;">${this.currentEdgeSoftness.toFixed(1)} ô</span>
          </div>
          <input type="range" id="fow-edge-slider" min="0" max="2" step="0.1" value="${this.currentEdgeSoftness}" style="width: 100%; accent-color: #00ffe8; cursor: pointer;">

          <div class="dev-row" style="margin-top: 6px; margin-bottom: 4px;">
            <span>Thời gian tan sương:</span>
            <span id="fow-melt-val" style="font-weight: 700; color: #00ffe8;">${this.currentMeltDuration.toFixed(1)}s</span>
          </div>
          <input type="range" id="fow-melt-slider" min="0" max="3" step="0.1" value="${this.currentMeltDuration}" style="width: 100%; accent-color: #00ffe8; cursor: pointer;">

          <div class="dev-row" style="margin-top: 6px;">
            <span>Màu sắc sương:</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="color" id="fow-color-picker" value="${this.currentFogColor}" style="border: 1px solid rgba(0, 255, 232, 0.3); border-radius: 4px; background: none; width: 28px; height: 24px; cursor: pointer; padding: 0;">
              <span id="fow-color-val" style="font-size: 11px; color: var(--text-secondary); font-family: monospace;">${this.currentFogColor}</span>
            </div>
          </div>
        </div>

        <!-- 8. GIẢ LẬP VÙNG TRI THỨC & CỦNG CỐ -->
        <div class="dev-menu-section">
          <div class="section-title" style="color: #00ffe8; display: flex; align-items: center; gap: 6px;">
            ⚡ GIẢ LẬP VÙNG TRI THỨC & CỦNG CỐ
          </div>
          <div class="dev-btn-group" style="grid-template-columns: 1fr;">
            <button class="btn-dev-action" id="btn-spawn-bastion" style="background: rgba(0, 255, 232, 0.08); border-color: rgba(0, 255, 232, 0.3); justify-content: flex-start; text-align: left;" title="Tạo cụm 10x10 Max Tier 3, tự động kích hoạt cắm cờ Predator & Buff Tier 4">
              <span style="font-size: 16px; margin-right: 8px;">🚩</span> Spawn Bastion Tri Thức (10×10)
            </button>
            <button class="btn-dev-action" id="btn-spawn-mega" style="background: rgba(0, 98, 255, 0.15); border-color: rgba(0, 98, 255, 0.35); justify-content: flex-start; text-align: left;" title="Tạo cụm 100x100, phủ Logo trường với khung viền Predator & Buff Tier 6">
              <span style="font-size: 16px; margin-right: 8px;">🌟</span> Spawn Đại Vùng Tri Thức (100×100)
            </button>
            <button class="btn-dev-action" id="btn-breach-cluster" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); justify-content: flex-start; text-align: left;" title="Giả lập đối thủ giao lưu tri thức tại 1 ô lõi, kiểm tra cập nhật cờ/logo và hạ Tier">
              <span style="font-size: 16px; margin-right: 8px;">💥</span> Giao Lưu Kiểm Tra Cụm (Breach)
            </button>
            <button class="btn-dev-action" id="btn-max-fortify" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); justify-content: flex-start; text-align: left;" title="Nâng toàn bộ Vùng tri thức đang sở hữu lên Cấp 3">
              <span style="font-size: 16px; margin-right: 8px;">🛡️</span> Max Củng Cố Toàn Bộ Vùng Tri Thức
            </button>
          </div>
        </div>

        <!-- 9. TIẾP TẾ & VẬT PHẨM (TESTING) -->
        <div class="dev-menu-section">
          <div class="section-title" style="color: #00ffe8; display: flex; align-items: center; gap: 6px;">
            🎁 TIẾP TẾ & VẬT PHẨM (TESTING)
          </div>
          <div class="dev-btn-group" style="grid-template-columns: 1fr;">
            <button class="btn-dev-action" id="btn-dev-reset-cds" style="background: rgba(0, 255, 232, 0.08); border-color: rgba(0, 255, 232, 0.3); justify-content: flex-start; text-align: left;" title="Xóa bỏ thời gian hồi chiêu tất cả trạm UniStop và thử đoán lại địa danh">
              <span style="font-size: 15px; margin-right: 8px;">⏱️</span> Reset Cooldowns UniStop
            </button>
            <button class="btn-dev-action" id="btn-dev-add-crystals" style="background: rgba(0, 180, 216, 0.12); border-color: rgba(0, 180, 216, 0.35); justify-content: flex-start; text-align: left;" title="Cộng ngay +100 Tinh thể để thắp sáng Đèn hiệu">
              <span style="font-size: 15px; margin-right: 8px;">💎</span> +100 Tinh thể
            </button>
            <button class="btn-dev-action" id="btn-dev-add-keys" style="background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.35); justify-content: flex-start; text-align: left;" title="Nhận Chìa khóa: Aspire, Nitro, Predator">
              <span style="font-size: 15px; margin-right: 8px;">🔑</span> +Chìa khóa (Aspire/Nitro/Predator)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Toggle mở/đóng menu
    const trigger = this.container.querySelector('#dev-trigger-btn');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOpen = !this.isOpen;
      this.render();
      this.bindEvents();
    });

    // Đóng khi click ra ngoài
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container.contains(e.target as Node)) {
        this.isOpen = false;
        this.render();
        this.bindEvents();
      }
    });

    // Toggle Chế độ Dev / Normal
    this.container.querySelector('#mode-toggle-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextMode = this.currentMode === 'dev' ? 'normal' : 'dev';
      this.currentMode = nextMode;
      this.callbacks.onToggleMode?.(nextMode);
      this.render();
      this.bindEvents();
    });

    // Thay đổi tài khoản được chọn trong dropdown
    const accSelect = this.container.querySelector('#mock-account-select') as HTMLSelectElement;
    accSelect?.addEventListener('change', (e) => {
      e.stopPropagation();
      this.selectedMockEmail = accSelect.value;
    });

    // Chuyển sang tài khoản đã chọn trong tab hiện tại
    this.container.querySelector('#btn-switch-account')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const student = RunningDatabase.getByEmail(this.selectedMockEmail) || RunningDatabase.getAll()[0];
      if (student) {
        const balance = RunningDatabase.getStudentBalance(student.email);
        this.callbacks.onSwitchAccount?.(student.email, student.schoolId, balance);
      }
    });

    // Mở tab mới với tài khoản đã chọn
    this.container.querySelector('#btn-open-tab')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const student = RunningDatabase.getByEmail(this.selectedMockEmail) || RunningDatabase.getAll()[0];
      if (student) {
        this.callbacks.onOpenNewTab?.(student.schoolId, student.email, student.km);
      }
    });

    // Mở Database Modal
    this.container.querySelector('#btn-open-db')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onOpenDbEditor?.();
    });

    // Bật/tắt Bot
    const botToggle = this.container.querySelector('#bot-toggle-btn');
    botToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isBotRunning = !this.isBotRunning;
      this.setBotStatus(this.isBotRunning);
      this.callbacks.onToggleBot(this.isBotRunning);
    });

    // Cộng điểm test (1 km = 1 điểm)
    this.container.querySelector('#btn-add-50pts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddPoints(50);
    });
    this.container.querySelector('#btn-add-100pts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddPoints(100);
    });
    this.container.querySelector('#btn-add-500pts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddPoints(500);
    });

    // Cấu hình đồ họa & hiệu năng
    const setTier = (tier: 'performance' | 'balanced' | 'high') => {
      this.currentTier = tier;
      this.render();
      this.bindEvents();
      this.callbacks.onSetGraphicsTier?.(tier);
    };
    this.container.querySelector('#tier-perf-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTier('performance');
    });
    this.container.querySelector('#tier-bal-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTier('balanced');
    });
    this.container.querySelector('#tier-high-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTier('high');
    });

    // Camera & Reset
    this.container.querySelector('#btn-dev-recenter')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onResetCamera();
    });
    this.container.querySelector('#btn-dev-grid')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showGrid = !this.showGrid;
      this.callbacks.onToggleGrid?.(this.showGrid);
    });
    this.container.querySelector('#btn-dev-fog')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showFog = !this.showFog;
      this.callbacks.onToggleFog?.(this.showFog);
    });
    this.container.querySelector('#btn-dev-reset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Bạn có chắc muốn đặt lại toàn bộ bản đồ về trạng thái ban đầu?')) {
        this.callbacks.onResetMap();
      }
    });

    // Điều chỉnh sương mù: slider độ mờ, độ mềm mép, thời gian tan & color picker
    const alphaSlider = this.container.querySelector('#fow-alpha-slider') as HTMLInputElement;
    const alphaVal = this.container.querySelector('#fow-alpha-val');
    alphaSlider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(alphaSlider.value);
      this.currentFogAlpha = val;
      if (alphaVal) {
        alphaVal.textContent = `${Math.round(val * 100)}%`;
      }
      this.callbacks.onSetFogAlpha?.(val);
      ((window as any).fogOfWarManager || FogOfWarManager.instance)?.setFogAlpha(val);
    });

    const edgeSlider = this.container.querySelector('#fow-edge-slider') as HTMLInputElement;
    const edgeVal = this.container.querySelector('#fow-edge-val');
    edgeSlider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(edgeSlider.value);
      this.currentEdgeSoftness = val;
      if (edgeVal) {
        edgeVal.textContent = `${val.toFixed(1)} ô`;
      }
      this.callbacks.onSetEdgeSoftness?.(val);
      ((window as any).fogOfWarManager || FogOfWarManager.instance)?.setEdgeSoftness(val);
    });

    const meltSlider = this.container.querySelector('#fow-melt-slider') as HTMLInputElement;
    const meltVal = this.container.querySelector('#fow-melt-val');
    meltSlider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(meltSlider.value);
      this.currentMeltDuration = val;
      if (meltVal) {
        meltVal.textContent = `${val.toFixed(1)}s`;
      }
      this.callbacks.onSetMeltDuration?.(val);
      ((window as any).fogOfWarManager || FogOfWarManager.instance)?.setMeltDuration(val);
    });

    const colorPicker = this.container.querySelector('#fow-color-picker') as HTMLInputElement;
    const colorVal = this.container.querySelector('#fow-color-val');
    colorPicker?.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = colorPicker.value;
      this.currentFogColor = val;
      if (colorVal) {
        colorVal.textContent = val;
      }
      this.callbacks.onSetFogColor?.(val);
      ((window as any).fogOfWarManager || FogOfWarManager.instance)?.setFogColor(val);
    });

    // Giả lập Lãnh thổ & Gia cố
    this.container.querySelector('#btn-spawn-bastion')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevSpawnBastion?.();
    });
    this.container.querySelector('#btn-spawn-mega')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevSpawnMegaEmblem?.();
    });
    this.container.querySelector('#btn-breach-cluster')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevBreachCluster?.();
    });
    this.container.querySelector('#btn-max-fortify')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevMaxFortifyAll?.();
    });
    this.container.querySelector('#btn-dev-reset-cds')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevResetCooldowns?.();
    });
    this.container.querySelector('#btn-dev-add-crystals')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevAddCrystals?.(100);
    });
    this.container.querySelector('#btn-dev-add-keys')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onDevAddKeys?.(5, 5, 5);
    });
  }

  public setFogAlpha(alpha: number): void {
    this.currentFogAlpha = alpha;
    const slider = this.container.querySelector('#fow-alpha-slider') as HTMLInputElement;
    const label = this.container.querySelector('#fow-alpha-val');
    if (slider) slider.value = alpha.toString();
    if (label) label.textContent = `${Math.round(alpha * 100)}%`;
  }

  public setFogColor(color: string): void {
    this.currentFogColor = color;
    const picker = this.container.querySelector('#fow-color-picker') as HTMLInputElement;
    const label = this.container.querySelector('#fow-color-val');
    if (picker) picker.value = color;
    if (label) label.textContent = color;
  }

  public setEdgeSoftness(softness: number): void {
    this.currentEdgeSoftness = softness;
    const slider = this.container.querySelector('#fow-edge-slider') as HTMLInputElement;
    const label = this.container.querySelector('#fow-edge-val');
    if (slider) slider.value = softness.toString();
    if (label) label.textContent = `${softness.toFixed(1)} ô`;
  }

  public setMeltDuration(duration: number): void {
    this.currentMeltDuration = duration;
    const slider = this.container.querySelector('#fow-melt-slider') as HTMLInputElement;
    const label = this.container.querySelector('#fow-melt-val');
    if (slider) slider.value = duration.toString();
    if (label) label.textContent = `${duration.toFixed(1)}s`;
  }
}
