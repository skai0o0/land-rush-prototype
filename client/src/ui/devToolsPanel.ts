// client/src/ui/devToolsPanel.ts
import { Icons } from './icons';
import { MOCK_STUDENT_ACCOUNTS } from '../../../shared/constants/schools';
import { RunningDatabase } from '../services/runningDatabase';

export interface DevPanelCallbacks {
  onToggleBot: (isRunning: boolean) => void;
  onAddPoints: (amount: number) => void;
  onResetMap: () => void;
  onResetCamera: () => void;
  onToggleGrid?: (show: boolean) => void;
  onSwitchAccount?: (email: string, schoolId: string, km: number) => void;
  onToggleMode?: (mode: "normal" | "dev") => void;
  onOpenNewTab?: (schoolId: string, email: string, km: number) => void;
  onOpenDbEditor?: () => void;
  onSetGraphicsTier?: (tier: 'performance' | 'balanced' | 'high') => void;
}

export class DevToolsPanel {
  private container: HTMLElement;
  private isOpen = false;
  private isBotRunning = false;
  private showGrid = true;
  private currentMode: "normal" | "dev" = "dev";
  private currentTier: 'performance' | 'balanced' | 'high' = 'balanced';
  private selectedMockEmail: string = MOCK_STUDENT_ACCOUNTS[0].email;
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
          <div class="section-title">CHẾ ĐỘ TÁC CHIẾN</div>
          <div class="dev-row">
            <span>Chế độ:</span>
            <button id="mode-toggle-btn" class="btn-dev-toggle ${this.currentMode === 'dev' ? 'active' : ''}" title="Chuyển giữa chế độ Dev tự do và Normal khóa trường">
              ${this.currentMode === 'dev' ? 'DEV (TỰ DO)' : 'NORMAL (KHÓA TRƯỜNG)'}
            </button>
          </div>
        </div>

        <!-- 2. TÀI KHOẢN MẪU 7 TRƯỜNG ĐHQG -->
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
            <button class="btn-dev-action" id="btn-open-db" style="grid-column: span 2; background: rgba(14, 165, 233, 0.2); border-color: rgba(56, 189, 248, 0.5); color: #38bdf8; font-weight: 700;" title="Mở bảng điều khiển cơ sở dữ liệu giải chạy sinh viên ĐHQG">
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
          <div class="section-title">GIẢ LẬP ĐIỂM CHẠY (1 KM = 10 ĐIỂM)</div>
          <div class="dev-btn-group">
            <button class="btn-dev-action" id="btn-add-50pts">+5 km (50đ)</button>
            <button class="btn-dev-action" id="btn-add-100pts">+10 km (100đ)</button>
            <button class="btn-dev-action" id="btn-add-500pts">+50 km (500đ)</button>
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
            <button class="btn-dev-action" id="btn-dev-recenter">Căn camera HQ</button>
            <button class="btn-dev-action" id="btn-dev-grid">Ẩn/Hiện lưới</button>
            <button class="btn-dev-action danger" id="btn-dev-reset" style="grid-column: span 2;">Reset Toàn Bộ Bản Đồ</button>
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
    this.container.querySelector('#btn-dev-reset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Bạn có chắc muốn đặt lại toàn bộ bản đồ về trạng thái ban đầu?')) {
        this.callbacks.onResetMap();
      }
    });
  }
}
