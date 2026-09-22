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

export interface ConfirmCardOptions {
  x: number;
  y: number;
  mode: ActionMode;
  title: string;
  cost: number;
  description: string;
  actionTitle: string;
  ownerName: string;
  ownerColor: string;
  landmarkName?: string;
  canExecute: boolean;
  reasonDisabled?: string;
  onConfirm: () => void;
  onCancel?: () => void;
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
  private smartMode = true;
  private pendingConfirm: ConfirmCardOptions | null = null;
  private onModeChangeCallback?: (mode: ActionMode) => void;
  public onToggleSmart?: (enabled: boolean) => void;

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

  public isSmart(): boolean {
    return this.smartMode;
  }

  public setSmartMode(enabled: boolean): void {
    this.smartMode = enabled;
    this.render();
    this.bindEvents();
  }

  public showConfirmCard(options: ConfirmCardOptions): void {
    this.pendingConfirm = options;
    this.currentMode = options.mode;
    this.render();
    this.bindEvents();
  }

  public clearConfirmCard(): void {
    if (!this.pendingConfirm) return;
    const onCancel = this.pendingConfirm.onCancel;
    this.pendingConfirm = null;
    this.render();
    this.bindEvents();
    onCancel?.();
  }

  // Compatibility helpers
  public setPoints(_points: number): void {}
  public setSelectedTile(_tile: any): void {}
  public onClaim(_cb: (tile: any) => void): void {}
  public onResetCamera(_cb: () => void): void {}

  private render(): void {
    if (this.pendingConfirm) {
      const p = this.pendingConfirm;
      this.container.innerHTML = `
        <div class="mode-dock-bar is-confirm-active">
          <div class="confirm-action-card">
            <div class="confirm-card-header">
              <div class="confirm-tile-meta">
                <span class="confirm-tile-coord">
                  ${p.landmarkName ? Icons.landmark('sm') : Icons.tile('sm')}
                  <strong>${p.landmarkName || `Ô (${p.x}, ${p.y})`}</strong>
                </span>
                <span class="confirm-owner-badge" style="background: ${p.ownerColor}22; color: ${p.ownerColor}; border: 1px solid ${p.ownerColor}44;">
                  ${p.ownerName}
                </span>
              </div>
              <button class="confirm-close-btn" id="btn-cancel-confirm" title="Hủy chọn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div class="confirm-card-body">
              <span class="confirm-desc-text ${!p.canExecute ? 'is-warning' : ''}">
                ${p.reasonDisabled || p.description}
              </span>
            </div>

            <button 
              class="confirm-execute-btn confirm-${p.mode} ${!p.canExecute ? 'is-disabled' : ''}" 
              id="btn-execute-confirm"
              ${!p.canExecute ? 'disabled' : ''}
            >
              <span class="btn-action-label">${p.actionTitle}</span>
              <span class="btn-action-cost">
                ${Icons.star(13)}
                <strong>-${p.cost} điểm</strong>
              </span>
            </button>
          </div>
        </div>
      `;
      return;
    }

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
    if (this.pendingConfirm) {
      const cancelBtn = this.container.querySelector('#btn-cancel-confirm');
      cancelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearConfirmCard();
      });

      const execBtn = this.container.querySelector('#btn-execute-confirm');
      execBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.pendingConfirm && this.pendingConfirm.canExecute) {
          const action = this.pendingConfirm.onConfirm;
          this.pendingConfirm = null;
          this.render();
          this.bindEvents();
          action();
        }
      });
      return;
    }

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
