// client/src/ui/studentActionDock.ts
import { Icons } from './icons';

export type ActionMode = 'explore' | 'study' | 'beacon' | 'bonfire' | 'claim' | 'fortify' | 'attack';
export type DockMode = 'explore' | 'study' | 'beacon';

export interface ModeConfig {
  id: DockMode;
  title: string;
  subtitle?: string;
  cost: number;
  costType: 'points' | 'crystals';
  icon: (size: any) => string;
  description: string;
}

export interface KeyInventory {
  aspire: number;
  nitro: number;
  predator: number;
}

export const ACTION_MODES: Record<DockMode, ModeConfig> = {
  explore: {
    id: 'explore',
    title: 'Khám Phá',
    subtitle: 'Vùng Tri Thức',
    cost: 1,
    costType: 'points',
    icon: Icons.claim,
    description: 'Khai phá và mở rộng Vùng Tri Thức hoang sơ tiếp giáp'
  },
  study: {
    id: 'study',
    title: 'Ôn Bài',
    subtitle: 'Củng cố Tri Thức',
    cost: 1,
    costType: 'points',
    icon: Icons.book,
    description: 'Ôn Bài / Củng cố Tri Thức (Study / Reinforce): Tăng độ bền ô trường mình hoặc giao lưu tri thức ô đối phương tiếp giáp'
  },
  beacon: {
    id: 'beacon',
    title: 'Thắp Đèn Hiệu',
    subtitle: 'Công Trình',
    cost: 10,
    costType: 'crystals',
    icon: Icons.crystal,
    description: 'Nạp Tinh thể để thắp sáng Đèn hiệu Công trình tri thức'
  }
};

// Backward-compatibility alias
(ACTION_MODES as any).bonfire = ACTION_MODES.beacon;

export class StudentActionDock {
  private container: HTMLElement;
  private currentMode: DockMode = 'explore';
  private smartMode = true;
  private points: number = 500;
  private crystals: number = 0;
  private keys: KeyInventory = { aspire: 0, nitro: 0, predator: 0 };

  private onModeChangeCallback?: (mode: DockMode) => void;
  public onToggleSmart?: (enabled: boolean) => void;
  public onBeaconAction?: () => void;
  public onBonfireAction?: () => void;

  constructor(parent?: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'student-mode-dock';
    this.container.setAttribute('data-ui', 'true');

    // Isolate all pointer/mouse/touch interactions from propagating to 3D canvas
    const stopProp = (e: Event) => e.stopPropagation();
    this.container.addEventListener('pointerdown', stopProp);
    this.container.addEventListener('pointerup', stopProp);
    this.container.addEventListener('mousedown', stopProp);
    this.container.addEventListener('mouseup', stopProp);
    this.container.addEventListener('touchstart', stopProp, { passive: true });
    this.container.addEventListener('touchend', stopProp, { passive: true });

    this.render();
    (parent || document.body).appendChild(this.container);
    this.bindEvents();
  }

  public getActiveMode(): DockMode {
    return this.currentMode;
  }

  public setMode(mode: ActionMode | string): void {
    // Normalize legacy modes
    let normalized: DockMode = 'explore';
    if (mode === 'explore' || mode === 'claim') normalized = 'explore';
    else if (mode === 'study' || mode === 'fortify' || mode === 'attack') normalized = 'study';
    else if (mode === 'beacon' || mode === 'bonfire') normalized = 'beacon';

    if (this.currentMode === normalized) return;
    this.currentMode = normalized;
    this.render();
    this.bindEvents();
  }

  public onModeChange(cb: (mode: DockMode) => void): void {
    this.onModeChangeCallback = cb;
  }

  public isSmart(): boolean {
    return this.smartMode;
  }

  public setSmartMode(enabled: boolean): void {
    this.smartMode = enabled;
    this.render();
    this.bindEvents();
  }

  /**
   * Set student knowledge points
   */
  public setPoints(points: number): void {
    if (this.points === points) return;
    this.points = points;
    const ptEl = this.container.querySelector('#dock-res-points-val');
    if (ptEl) {
      ptEl.textContent = points.toLocaleString();
    } else {
      this.render();
      this.bindEvents();
    }
  }

  /**
   * Set student crystals
   */
  public setCrystals(crystals: number): void {
    if (this.crystals === crystals) return;
    this.crystals = crystals;
    const cryEl = this.container.querySelector('#dock-res-crystals-val');
    if (cryEl) {
      cryEl.textContent = crystals.toLocaleString();
    } else {
      this.render();
      this.bindEvents();
    }
  }

  /**
   * Set student keys (Aspire, Nitro, Predator)
   */
  public setKeys(aspireOrAll: any, nitro?: number, predator?: number): void {
    if (typeof aspireOrAll === 'object' && aspireOrAll !== null) {
      this.keys = {
        aspire: aspireOrAll.aspire || aspireOrAll.silver || 0,
        nitro: aspireOrAll.nitro || aspireOrAll.gold || 0,
        predator: aspireOrAll.predator || aspireOrAll.platinum || 0
      };
    } else if (typeof aspireOrAll === 'number') {
      this.keys = {
        aspire: aspireOrAll,
        nitro: nitro || 0,
        predator: predator || 0
      };
    }
    const totalKeys = this.keys.aspire + this.keys.nitro + this.keys.predator;
    const keyEl = this.container.querySelector('#dock-res-keys-val');
    if (keyEl) {
      keyEl.textContent = totalKeys.toString();
    } else {
      this.render();
      this.bindEvents();
    }
  }

  public updateResources(points: number, crystals: number, keys?: any): void {
    this.points = points;
    this.crystals = crystals;
    if (keys !== undefined) {
      this.setKeys(keys);
    } else {
      this.render();
      this.bindEvents();
    }
  }

  // Compatibility helpers
  public setSelectedTile(_tile: any): void {}
  public onClaim(_cb: (tile: any) => void): void {}
  public onResetCamera(_cb: () => void): void {}

  private render(): void {
    const modes = [ACTION_MODES.explore, ACTION_MODES.study, ACTION_MODES.beacon];
    const totalKeys = this.keys.aspire + this.keys.nitro + this.keys.predator;

    this.container.innerHTML = `
      <div class="mode-dock-bar">
        <!-- 1. Resource Bar: Điểm Tri Thức, Tinh Thể, Chìa Khóa -->
        <div class="dock-resource-bar" title="Tài nguyên sinh viên: Điểm Tri Thức, Tinh Thể và Chìa Khóa Rương">
          <!-- Điểm Tri Thức (Points) -->
          <div class="dock-res-pill points" title="Điểm Tri Thức (Points) tích luỹ từ giải chạy để Khám phá & Ôn bài">
            <span class="dock-res-icon point-glow">${Icons.point(13)}</span>
            <span class="dock-res-label">Điểm Tri Thức:</span>
            <span class="dock-res-val point-number" id="dock-res-points-val">${this.points.toLocaleString()}</span>
          </div>

          <!-- Tinh Thể (Crystals) -->
          <div class="dock-res-pill crystals" title="Tinh Thể (Crystals) thu thập từ UniStop/Rương để Thắp Đèn Hiệu">
            <span class="dock-res-icon crystal-glow">${Icons.crystal(13)}</span>
            <span class="dock-res-label">Tinh Thể:</span>
            <span class="dock-res-val crystal-number" id="dock-res-crystals-val">${this.crystals.toLocaleString()}</span>
          </div>

          <!-- Chìa Khóa (Keys) -->
          <div class="dock-res-pill keys" title="Chìa khóa mở Rương (Aspire: ${this.keys.aspire} | Nitro: ${this.keys.nitro} | Predator: ${this.keys.predator})">
            <span class="dock-res-icon key-glow">${Icons.key(13)}</span>
            <span class="dock-res-label">Chìa Khóa:</span>
            <span class="dock-res-val key-number" id="dock-res-keys-val">${totalKeys}</span>
            <div class="dock-keys-mini-tags">
              <span class="key-tag-mini aspire" title="Chìa Aspire: ${this.keys.aspire}">${this.keys.aspire}A</span>
              <span class="key-tag-mini nitro" title="Chìa Nitro: ${this.keys.nitro}">${this.keys.nitro}N</span>
              <span class="key-tag-mini predator" title="Chìa Predator: ${this.keys.predator}">${this.keys.predator}P</span>
            </div>
          </div>
        </div>

        <!-- 2. Header Bar: Smart Mode Switcher -->
        <div class="dock-header-bar">
          <button class="smart-toggle-pill ${this.smartMode ? 'active' : ''}" id="btn-smart-toggle" title="Chuyển chế độ Tự Động (Smart Context) hoặc Thủ Công (Manual)">
            <span class="smart-indicator"></span>
            <span class="smart-icon">${Icons.lightning(13)}</span>
            <span class="smart-text">${this.smartMode ? 'Tự Động' : 'Thủ Công'}</span>
          </button>
          <span class="dock-label-hint">${this.smartMode ? 'Tự đổi Khám phá / Ôn bài khi chạm ô đất' : 'Chọn thao tác tương tác:'}</span>
        </div>

        <!-- 3. Action Buttons Group: Khám Phá | Ôn Bài | Thắp Đèn Hiệu -->
        <div class="mode-buttons-group">
          ${modes.map((mode) => {
            const isActive = this.currentMode === mode.id;
            const isBeacon = mode.id === 'beacon';
            const isStudy = mode.id === 'study';
            const costIcon = isBeacon ? Icons.crystal(12) : Icons.point(12);
            const costUnit = isBeacon ? 'Tinh thể' : 'Điểm';

            return `
              <button 
                class="mode-btn ${isActive ? 'is-active' : ''} ${isBeacon ? 'mode-beacon-btn mode-bonfire-btn' : ''} ${isStudy ? 'mode-study-btn' : ''}" 
                data-mode="${mode.id}"
                title="${mode.description}"
              >
                <span class="mode-icon">${mode.icon('sm')}</span>
                <span class="mode-text-wrap">
                  <span class="mode-name">${mode.title}</span>
                  ${mode.subtitle ? `<span class="mode-sub">${mode.subtitle}</span>` : ''}
                </span>
                <span class="mode-cost" title="Chi phí: ${mode.cost} ${costUnit}">
                  ${costIcon}
                  <strong>${mode.cost}</strong>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const smartToggleBtn = this.container.querySelector('#btn-smart-toggle');
    smartToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.smartMode = !this.smartMode;
      this.render();
      this.bindEvents();
      this.onToggleSmart?.(this.smartMode);
    });

    const buttons = this.container.querySelectorAll('.mode-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rawMode = btn.getAttribute('data-mode');
        const mode = (rawMode === 'bonfire' ? 'beacon' : rawMode) as DockMode;
        if (mode) {
          if (mode === 'beacon') {
            this.onBeaconAction?.();
            this.onBonfireAction?.();
          }
          if (mode !== this.currentMode) {
            this.currentMode = mode;
            this.render();
            this.bindEvents();
            this.onModeChangeCallback?.(this.currentMode);
          }
        }
      });
    });
  }
}
