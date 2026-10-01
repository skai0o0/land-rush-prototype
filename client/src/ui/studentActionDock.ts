// client/src/ui/studentActionDock.ts
import { Icons } from './icons';

export type ActionMode = 'explore' | 'study' | 'bonfire' | 'claim' | 'fortify' | 'attack';

export interface ModeConfig {
  id: 'explore' | 'study' | 'bonfire';
  title: string;
  cost: number;
  icon: (size: any) => string;
  description: string;
}

export const ACTION_MODES: Record<'explore' | 'study' | 'bonfire', ModeConfig> = {
  explore: {
    id: 'explore',
    title: 'Khám phá',
    cost: 1,
    icon: Icons.claim,
    description: 'Mở rộng Vùng tri thức hoang sơ tiếp giáp'
  },
  study: {
    id: 'study',
    title: 'Ôn bài',
    cost: 1,
    icon: Icons.book,
    description: 'Củng cố tri thức ô trường mình hoặc giao lưu tri thức xói mòn ô đối phương tiếp giáp'
  },
  bonfire: {
    id: 'bonfire',
    title: 'Thắp lửa',
    cost: 10,
    icon: Icons.flame,
    description: 'Thắp lửa Công trình bằng Than củi quy đổi từ Điểm cá nhân'
  }
};

export class StudentActionDock {
  private container: HTMLElement;
  private currentMode: 'explore' | 'study' | 'bonfire' = 'explore';
  private smartMode = true;
  private onModeChangeCallback?: (mode: 'explore' | 'study' | 'bonfire') => void;
  public onToggleSmart?: (enabled: boolean) => void;
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

  public getActiveMode(): 'explore' | 'study' | 'bonfire' {
    return this.currentMode;
  }

  public setMode(mode: ActionMode): void {
    // Normalize legacy modes
    let normalized: 'explore' | 'study' | 'bonfire' = 'explore';
    if (mode === 'explore' || mode === 'claim') normalized = 'explore';
    else if (mode === 'study' || mode === 'fortify' || mode === 'attack') normalized = 'study';
    else if (mode === 'bonfire') normalized = 'bonfire';

    if (this.currentMode === normalized) return;
    this.currentMode = normalized;
    this.render();
    this.bindEvents();
  }

  public onModeChange(cb: (mode: 'explore' | 'study' | 'bonfire') => void): void {
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

  // Compatibility helpers
  public setPoints(_points: number): void {}
  public setSelectedTile(_tile: any): void {}
  public onClaim(_cb: (tile: any) => void): void {}
  public onResetCamera(_cb: () => void): void {}

  private render(): void {
    const modes = [ACTION_MODES.explore, ACTION_MODES.study, ACTION_MODES.bonfire];

    this.container.innerHTML = `
      <div class="mode-dock-bar">
        <div class="dock-header-bar">
          <button class="smart-toggle-pill ${this.smartMode ? 'active' : ''}" id="btn-smart-toggle" title="Chuyển chế độ Tự Động (Smart Context) hoặc Thủ Công (Manual)">
            <span class="smart-indicator"></span>
            <span class="smart-icon">${Icons.lightning(13)}</span>
            <span class="smart-text">${this.smartMode ? 'Tự Động' : 'Thủ Công'}</span>
          </button>
          <span class="dock-label-hint">${this.smartMode ? 'Tự đổi Khám phá / Ôn bài khi chạm ô đất' : 'Chọn thao tác tương tác:'}</span>
        </div>
        <div class="mode-buttons-group">
          ${modes.map((mode) => {
            const isActive = this.currentMode === mode.id;
            return `
              <button 
                class="mode-btn ${isActive ? 'is-active' : ''} ${mode.id === 'bonfire' ? 'mode-bonfire-btn' : ''}" 
                data-mode="${mode.id}"
                title="${mode.description}"
              >
                <span class="mode-icon">${mode.icon('sm')}</span>
                <span class="mode-name">${mode.title}</span>
                <span class="mode-cost">
                  ${mode.id === 'bonfire' ? Icons.flame(12) : Icons.star(12)}
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
        const mode = btn.getAttribute('data-mode') as 'explore' | 'study' | 'bonfire';
        if (mode) {
          if (mode === 'bonfire') {
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
