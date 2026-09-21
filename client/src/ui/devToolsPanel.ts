// client/src/ui/devToolsPanel.ts
import { Icons } from './icons';

export interface DevPanelCallbacks {
  onToggleBot: (isRunning: boolean) => void;
  onAddPoints: (amount: number) => void;
  onResetMap: () => void;
  onResetCamera: () => void;
  onToggleGrid?: (show: boolean) => void;
}

export class DevToolsPanel {
  private container: HTMLElement;
  private isOpen = false;
  private isBotRunning = false;
  private showGrid = true;
  private callbacks: DevPanelCallbacks;

  constructor(callbacks: DevPanelCallbacks, parent?: HTMLElement) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.className = 'dev-dropdown-container';
    this.render();
    (parent || document.body).appendChild(this.container);
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

  public setFps(_fps: number): void {}
  public setTick(_tick: number): void {}

  private render(): void {
    this.container.innerHTML = `
      <!-- Nút mở/đóng Dropdown Menu -->
      <button class="dev-dropdown-trigger" id="dev-trigger-btn" title="Cài đặt & Dev Simulation">
        ${Icons.settings('sm')}
        <span class="trigger-label">Dev Simulation</span>
        <svg class="chevron-icon ${this.isOpen ? 'open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <!-- Menu nội dung (mặc định ẩn) -->
      <div class="dev-dropdown-menu ${this.isOpen ? 'show' : ''}" id="dev-menu-body">
        <div class="dev-menu-section">
          <div class="section-title">GIẢ LẬP BOT (TỰ ĐỘNG)</div>
          <div class="dev-row">
            <span>Trạng thái Bot:</span>
            <button id="bot-toggle-btn" class="btn-dev-toggle ${this.isBotRunning ? 'active' : ''}">
              ${this.isBotRunning ? 'ĐANG CHẠY' : 'ĐÃ TẮT'}
            </button>
          </div>
        </div>

        <div class="dev-menu-section">
          <div class="section-title">HỖ TRỢ TEST & ĐIỂM SỐ</div>
          <div class="dev-btn-group">
            <button class="btn-dev-action" id="btn-add-100pts">+100 Điểm</button>
            <button class="btn-dev-action" id="btn-add-500pts">+500 Điểm</button>
          </div>
        </div>

        <div class="dev-menu-section">
          <div class="section-title">HỆ THỐNG & CAMERA</div>
          <div class="dev-btn-group">
            <button class="btn-dev-action" id="btn-dev-recenter">Căn camera</button>
            <button class="btn-dev-action" id="btn-dev-grid">Ẩn/Hiện lưới</button>
            <button class="btn-dev-action danger" id="btn-dev-reset">Reset Bản Đồ</button>
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

    // Bật/tắt Bot
    const botToggle = this.container.querySelector('#bot-toggle-btn');
    botToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isBotRunning = !this.isBotRunning;
      this.setBotStatus(this.isBotRunning);
      this.callbacks.onToggleBot(this.isBotRunning);
    });

    // Cộng điểm test
    this.container.querySelector('#btn-add-100pts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddPoints(100);
    });
    this.container.querySelector('#btn-add-500pts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddPoints(500);
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
