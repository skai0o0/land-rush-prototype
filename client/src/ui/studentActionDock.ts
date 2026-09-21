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
    cost: 10,
    icon: Icons.claim,
    description: 'Mở rộng sang ô trống lân cận'
  },
  fortify: {
    id: 'fortify',
    title: 'Gia cố',
    cost: 15,
    icon: Icons.shield,
    description: 'Tăng phòng thủ ô đất của trường'
  },
  attack: {
    id: 'attack',
    title: 'Tấn công',
    cost: 25,
    icon: Icons.sword,
    description: 'Tranh chấp ô đất của đối thủ'
  }
};

export class StudentActionDock {
  private container: HTMLElement;
  private currentMode: ActionMode = 'claim';
  private onModeChangeCallback?: (mode: ActionMode) => void;

  constructor(parent?: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'student-mode-dock';
    this.render();
    (parent || document.body).appendChild(this.container);
    this.bindEvents();
  }

  public getActiveMode(): ActionMode {
    return this.currentMode;
  }

  public setMode(mode: ActionMode): void {
    this.currentMode = mode;
    this.render();
    this.bindEvents();
  }

  public onModeChange(cb: (mode: ActionMode) => void): void {
    this.onModeChangeCallback = cb;
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
        <div class="dock-label-hint">
          <span class="hint-text">Chế độ thao tác khi click vào ô đất:</span>
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
                  ${Icons.point(14)}
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
    const buttons = this.container.querySelectorAll('.mode-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
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
