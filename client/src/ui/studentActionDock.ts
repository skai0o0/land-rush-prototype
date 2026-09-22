// client/src/ui/studentActionDock.ts
import { Icons } from './icons';

export type ActionMode = 'claim' | 'fortify' | 'attack';

export interface ModeConfig {
  id: ActionMode;
  title: string;
  cost: number;
  icon: (size: any) => string;
  description: string;
}

export const ACTION_MODES: Record<ActionMode, ModeConfig> = {
  claim: {
    id: 'claim',
    title: 'Chiếm đất',
    cost: 1,
    icon: Icons.claim,
    description: 'Mở rộng sang ô trống lân cận'
  },
  fortify: {
    id: 'fortify',
    title: 'Gia cố',
    cost: 1,
    icon: Icons.shield,
    description: 'Tăng phòng thủ ô đất của trường'
  },
  attack: {
    id: 'attack',
    title: 'Tấn công',
    cost: 2,
    icon: Icons.sword,
    description: 'Tranh chấp ô đất của đối thủ'
  }
};

export class StudentActionDock {
  private container: HTMLElement;
  private currentMode: ActionMode = 'claim';
  private smartMode = true;
  private onModeChangeCallback?: (mode: ActionMode) => void;
  public onToggleSmart?: (enabled: boolean) => void;

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

  public getActiveMode(): ActionMode {
    return this.currentMode;
  }

  public setMode(mode: ActionMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.render();
    this.bindEvents();
  }

  public onModeChange(cb: (mode: ActionMode) => void): void {
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
    const modes = Object.values(ACTION_MODES);

    this.container.innerHTML = `
      <div class="mode-dock-bar">
        <div class="dock-header-bar">
          <button class="smart-toggle-pill ${this.smartMode ? 'active' : ''}" id="btn-smart-toggle" title="Chuyển chế độ Tự Động (Smart Context) hoặc Thủ Công (Manual)">
            <span class="smart-indicator"></span>
            <span class="smart-icon">${Icons.lightning(13)}</span>
            <span class="smart-text">${this.smartMode ? 'Tự Động' : 'Thủ Công'}</span>
          </button>
          <span class="dock-label-hint">${this.smartMode ? 'Tự đổi Chiếm / Gia cố / Tấn công khi chạm ô' : 'Chọn thao tác tương tác:'}</span>
        </div>
        <div class="mode-buttons-group">
          ${modes.map((mode) => {
            const isActive = this.currentMode === mode.id;
            return `
              <button 
                class="mode-btn ${isActive ? 'is-active' : ''}" 
                data-mode="${mode.id}"
                title="${mode.description}"
              >
                <span class="mode-icon">${mode.icon('sm')}</span>
                <span class="mode-name">${mode.title}</span>
                <span class="mode-cost">
                  ${Icons.star(12)}
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
        const mode = btn.getAttribute('data-mode') as ActionMode;
        if (mode && mode !== this.currentMode) {
          this.currentMode = mode;
          this.render();
          this.bindEvents();
          this.onModeChangeCallback?.(this.currentMode);
        }
      });
    });
  }
}
