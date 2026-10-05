// client/src/ui/notificationStudioModal.ts
import { DEFAULT_NOTIFICATIONS, NotificationTemplate, NotificationCategory, formatNotificationText } from '../../../shared/constants/notifications';
import { NotificationBanner } from './notificationBanner';
import { Icons } from './icons';

const STORAGE_KEY = 'predator_campus_notifications_v1';

export const STUDIO_MOCK_DATA: Record<string, any> = {
  student_name: 'Minh Quân (BK)',
  my_school: 'ĐH Bách Khoa',
  enemy_school: 'ĐH Kinh Tế (UEH)',
  x: 45,
  y: 82,
  landmark_name: 'Hồ Con Rùa',
  time_left: '2m 30s',
  chest_tier: 'Predator Gold Tier 3',
  gift_name: 'Bình Giữ Nhiệt Predator',
  rank: 2,
  delta_points: 120,
  added_points: 50,
  km: 5.0
};

interface VariableItem {
  key: string;
  label: string;
  desc: string;
  example: string;
}

const NOTIFICATION_VARIABLES: VariableItem[] = [
  { key: '{student_name}', label: '{student_name}', desc: 'Tên sinh viên', example: 'Minh Quân (BK)' },
  { key: '{my_school}', label: '{my_school}', desc: 'Trường phe mình', example: 'ĐH Bách Khoa' },
  { key: '{enemy_school}', label: '{enemy_school}', desc: 'Trường đối thủ', example: 'ĐH Kinh Tế (UEH)' },
  { key: '{x}', label: '{x}', desc: 'Tọa độ X', example: '45' },
  { key: '{y}', label: '{y}', desc: 'Tọa độ Y', example: '82' },
  { key: '{landmark_name}', label: '{landmark_name}', desc: 'Tên kỳ quan / Đèn hiệu', example: 'Hồ Con Rùa' },
  { key: '{time_left}', label: '{time_left}', desc: 'Thời gian đếm ngược', example: '2m 30s' },
  { key: '{chest_tier}', label: '{chest_tier}', desc: 'Bậc rương / tiếp tế', example: 'Predator Gold Tier 3' },
  { key: '{gift_name}', label: '{gift_name}', desc: 'Quà hiện vật', example: 'Bình Giữ Nhiệt Predator' },
  { key: '{rank}', label: '{rank}', desc: 'Thứ hạng', example: '2' },
  { key: '{delta_points}', label: '{delta_points}', desc: 'Khoảng cách điểm', example: '120' },
  { key: '{added_points}', label: '{added_points}', desc: 'Điểm cộng thưởng', example: '50' },
  { key: '{km}', label: '{km}', desc: 'Số km hoàn thành', example: '5.0' },
];

export class NotificationStudioModal {
  private overlay: HTMLElement;
  private isOpen = false;
  private templates: NotificationTemplate[] = [];
  private activeCategory: 'all' | NotificationCategory = 'all';
  private searchQuery = '';
  private lastFocusedInput: HTMLInputElement | HTMLTextAreaElement | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'notif-studio-overlay';
    this.overlay.setAttribute('data-ui', 'true');
    this.overlay.style.display = 'none';

    // Prevent pointer events from bubbling into 3D scene
    const stopProp = (e: Event) => e.stopPropagation();
    this.overlay.addEventListener('pointerdown', stopProp);
    this.overlay.addEventListener('mousedown', stopProp);
    this.overlay.addEventListener('touchstart', stopProp, { passive: true });
    this.overlay.addEventListener('wheel', stopProp, { passive: false });

    document.body.appendChild(this.overlay);

    this.loadTemplates();
  }

  private loadTemplates(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.templates = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[NotificationStudioModal] Failed to read saved templates:', err);
    }
    // Deep clone defaults
    this.templates = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATIONS));
  }

  private saveTemplates(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates));
      this.showFeedbackToast('Đã lưu cấu hình thông báo vào trình duyệt! 💾');
    } catch (err) {
      console.error('[NotificationStudioModal] Failed to save templates:', err);
      this.showFeedbackToast('Lỗi khi lưu cấu hình vào localStorage!');
    }
  }

  private resetToDefaults(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.templates = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATIONS));
    this.render();
    this.bindEvents();
    this.showFeedbackToast('Đã khôi phục mẫu câu mặc định thành công! 🔄');
  }

  private exportJson(): void {
    try {
      const jsonStr = JSON.stringify(this.templates, null, 2);
      navigator.clipboard.writeText(jsonStr);
      this.showFeedbackToast('Đã sao chép JSON cấu hình cho Developer! 📋');
    } catch {
      this.showFeedbackToast('Không thể sao chép vào bộ nhớ tạm.');
    }
  }

  public open(): void {
    this.isOpen = true;
    this.loadTemplates();
    this.render();
    this.bindEvents();
    this.overlay.style.display = 'flex';
    this.overlay.classList.add('studio-open');
  }

  public close(): void {
    this.isOpen = false;
    this.overlay.classList.remove('studio-open');
    setTimeout(() => {
      this.overlay.style.display = 'none';
    }, 200);
  }

  public getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  private showFeedbackToast(msg: string): void {
    NotificationBanner.show({
      title: 'Notification Studio',
      body: msg,
      icon: '✨',
      durationMs: 3000,
      category: 'territory'
    });
  }

  private getFilteredTemplates(): NotificationTemplate[] {
    return this.templates.filter((t) => {
      const matchesCat = this.activeCategory === 'all' || t.category === this.activeCategory;
      if (!matchesCat) return false;
      if (!this.searchQuery) return true;
      const q = this.searchQuery.toLowerCase();
      return (
        t.id.toLowerCase().includes(q) ||
        t.titleTemplate.toLowerCase().includes(q) ||
        t.bodyTemplate.toLowerCase().includes(q)
      );
    });
  }

  private getCategoryLabel(cat: NotificationCategory): { label: string; color: string } {
    switch (cat) {
      case 'territory': return { label: 'LÃNH THỔ', color: '#00ffe8' };
      case 'landmark': return { label: 'ĐÈN HIỆU', color: '#fbbf24' };
      case 'gacha': return { label: 'TIẾP TẾ & RƯƠNG', color: '#a855f7' };
      case 'rank': return { label: 'XẾP HẠNG', color: '#10b981' };
    }
  }

  private getTargetBadge(target: string): string {
    switch (target) {
      case 'school_online': return 'Trường (Online)';
      case 'school': return 'Toàn Trường';
      case 'personal': return 'Cá Nhân';
      case 'all': return 'Toàn Server';
      default: return target;
    }
  }

  private render(): void {
    const filtered = this.getFilteredTemplates();

    this.overlay.innerHTML = `
      <div class="notif-studio-window">
        <!-- MODAL HEADER -->
        <div class="studio-header">
          <div class="studio-header-title-box">
            <div class="studio-app-badge">PREDATOR CAMPUS • HUD NOTIFICATIONS</div>
            <h2 class="studio-title">
              <span class="studio-title-icon">📢</span> Notification Studio
              <span class="studio-version-tag">In-Game Push Engine</span>
            </h2>
            <p class="studio-subtitle">Quản lý ngữ cảnh, tùy biến phong cách Duolingo & Bắn thử thông báo tức thì lên màn hình game.</p>
          </div>
          <button class="studio-close-btn" id="studio-close-x" title="Đóng Studio">✕</button>
        </div>

        <!-- TỪ ĐIỂN BIẾN SỐ -->
        <div class="studio-section studio-vars-section">
          <div class="studio-section-title">
            <span>📌 TỪ ĐIỂN BIẾN SỐ (BẤM 1 CHẠM ĐỂ CHÉP HOẶC CHÈN VÀO Ô ĐANG GÕ)</span>
            <span class="studio-vars-hint">Nhấp vào thẻ để sao chép biến</span>
          </div>
          <div class="studio-vars-grid">
            ${NOTIFICATION_VARIABLES.map(v => `
              <button class="studio-var-pill" data-var="${v.key}" title="${v.desc} (Ví dụ: ${v.example})">
                <code>${v.key}</code>
                <span class="var-desc">${v.desc}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- BỘ LỌC CATEGORY & TÌM KIẾM -->
        <div class="studio-toolbar">
          <div class="studio-category-tabs">
            <button class="studio-cat-tab ${this.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
              🌐 Tất cả (${this.templates.length})
            </button>
            <button class="studio-cat-tab ${this.activeCategory === 'territory' ? 'active' : ''}" data-cat="territory">
              🛡️ Lãnh thổ (${this.templates.filter(t => t.category === 'territory').length})
            </button>
            <button class="studio-cat-tab ${this.activeCategory === 'landmark' ? 'active' : ''}" data-cat="landmark">
              🏛️ Công trình & Đèn hiệu (${this.templates.filter(t => t.category === 'landmark').length})
            </button>
            <button class="studio-cat-tab ${this.activeCategory === 'gacha' ? 'active' : ''}" data-cat="gacha">
              🎁 Tiếp tế & Rương (${this.templates.filter(t => t.category === 'gacha').length})
            </button>
            <button class="studio-cat-tab ${this.activeCategory === 'rank' ? 'active' : ''}" data-cat="rank">
              🏆 Bảng xếp hạng (${this.templates.filter(t => t.category === 'rank').length})
            </button>
          </div>
          <div class="studio-search-box">
            <input 
              type="text" 
              id="studio-search-input" 
              placeholder="🔍 Tìm theo ID, tiêu đề hoặc nội dung..." 
              value="${this.searchQuery}" 
            />
          </div>
        </div>

        <!-- DANH SÁCH THẺ MẪU CÂU (CUỘN ĐƯỢC) -->
        <div class="studio-cards-container">
          ${filtered.length === 0 ? `
            <div class="studio-empty-state">
              <span style="font-size: 32px; display: block; margin-bottom: 8px;">🔍</span>
              Không tìm thấy mẫu thông báo nào phù hợp với bộ lọc hiện tại.
            </div>
          ` : filtered.map((tpl) => {
            const catMeta = this.getCategoryLabel(tpl.category);
            return `
              <div class="studio-card" data-template-id="${tpl.id}">
                <div class="studio-card-header">
                  <div class="studio-card-badges">
                    <span class="studio-badge-cat" style="color: ${catMeta.color}; border-color: ${catMeta.color};">
                      ${catMeta.label}
                    </span>
                    <span class="studio-badge-id">#${tpl.id}</span>
                    <span class="studio-badge-target">🎯 ${this.getTargetBadge(tpl.target)}</span>
                  </div>
                  <button class="studio-fire-btn" data-fire-id="${tpl.id}" title="Lấy dữ liệu mock và đẩy banner thông báo ngay lập tức!">
                    🚀 BẮN THỬ NGAY
                  </button>
                </div>

                <div class="studio-form-row">
                  <label class="studio-form-label">Tiêu đề (Title Template):</label>
                  <input 
                    type="text" 
                    class="studio-input-title" 
                    data-id="${tpl.id}" 
                    value="${this.escapeHtml(tpl.titleTemplate)}" 
                    placeholder="Nhập tiêu đề thông báo..." 
                  />
                </div>

                <div class="studio-form-row">
                  <label class="studio-form-label">Nội dung (Body Template):</label>
                  <textarea 
                    class="studio-textarea-body" 
                    data-id="${tpl.id}" 
                    rows="2" 
                    placeholder="Nhập nội dung thông báo..."
                  >${this.escapeHtml(tpl.bodyTemplate)}</textarea>
                </div>

                ${tpl.sassyExamples && tpl.sassyExamples.length > 0 ? `
                  <div class="studio-sassy-box">
                    <div class="studio-sassy-label">
                      <span>🦉 GỢI Ý CÂU CỢT NHẢ DUOLINGO (BẤM ĐỂ ÁP DỤNG NGAY):</span>
                    </div>
                    <div class="studio-sassy-list">
                      ${tpl.sassyExamples.map((ex, exIdx) => `
                        <button class="studio-sassy-pill" data-apply-id="${tpl.id}" data-sassy-idx="${exIdx}">
                          <span class="sassy-title-badge">${this.escapeHtml(ex.title)}</span>
                          <span class="sassy-body-preview">${this.escapeHtml(ex.body)}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- FOOTER ACTIONS -->
        <div class="studio-footer">
          <div class="studio-footer-left">
            <span class="studio-stat-info">Tổng cộng <strong>${this.templates.length}</strong> mẫu thông báo in-game push</span>
          </div>
          <div class="studio-footer-actions">
            <button class="btn-studio-secondary" id="btn-studio-restore" title="Xóa dữ liệu tùy chỉnh và lấy lại bản gốc">
              🔄 Khôi Phục Mặc Định
            </button>
            <button class="btn-studio-secondary" id="btn-studio-export-json" title="Xuất dữ liệu dưới dạng JSON để commit vào code nguồn">
              📋 Xuất JSON Cho Dev
            </button>
            <button class="btn-studio-primary" id="btn-studio-save" title="Lưu lại cấu hình vào localStorage">
              💾 Lưu Cấu Hình
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Close button
    this.overlay.querySelector('#studio-close-x')?.addEventListener('click', () => {
      this.close();
    });

    // Close on background backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Keyboard ESC to close
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        window.removeEventListener('keydown', handleKey);
      }
    };
    window.addEventListener('keydown', handleKey);

    // Track focused inputs for inserting variables
    const textInputs = this.overlay.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '.studio-input-title, .studio-textarea-body'
    );
    textInputs.forEach((input) => {
      input.addEventListener('focus', () => {
        this.lastFocusedInput = input;
      });
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-id');
        const isTitle = input.classList.contains('studio-input-title');
        const targetTpl = this.templates.find((t) => t.id === id);
        if (targetTpl) {
          if (isTitle) {
            targetTpl.titleTemplate = input.value;
          } else {
            targetTpl.bodyTemplate = input.value;
          }
        }
      });
    });

    // Variable Pills: Copy and insert into last focused input
    const varPills = this.overlay.querySelectorAll<HTMLButtonElement>('.studio-var-pill');
    varPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const varText = pill.getAttribute('data-var');
        if (!varText) return;

        // Copy to clipboard
        navigator.clipboard.writeText(varText);

        // Insert at cursor if input is active
        if (this.lastFocusedInput && document.body.contains(this.lastFocusedInput)) {
          const input = this.lastFocusedInput;
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const val = input.value;
          input.value = val.substring(0, start) + varText + val.substring(end);
          input.selectionStart = input.selectionEnd = start + varText.length;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          this.showFeedbackToast(`Đã chèn ${varText} vào ô soạn thảo! ✨`);
        } else {
          this.showFeedbackToast(`Đã sao chép ${varText} vào clipboard! 📋`);
        }

        // Pill visual click feedback
        pill.classList.add('var-copied');
        setTimeout(() => pill.classList.remove('var-copied'), 600);
      });
    });

    // Category Tabs
    const catTabs = this.overlay.querySelectorAll<HTMLButtonElement>('.studio-cat-tab');
    catTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const cat = tab.getAttribute('data-cat') as any;
        this.activeCategory = cat || 'all';
        this.render();
        this.bindEvents();
      });
    });

    // Search query
    const searchInput = this.overlay.querySelector<HTMLInputElement>('#studio-search-input');
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      // Re-render cards without losing search input focus
      const container = this.overlay.querySelector('.studio-cards-container');
      if (container) {
        const filtered = this.getFilteredTemplates();
        container.innerHTML = filtered.length === 0 ? `
          <div class="studio-empty-state">
            <span style="font-size: 32px; display: block; margin-bottom: 8px;">🔍</span>
            Không tìm thấy mẫu thông báo nào phù hợp với bộ lọc hiện tại.
          </div>
        ` : filtered.map((tpl) => {
          const catMeta = this.getCategoryLabel(tpl.category);
          return `
            <div class="studio-card" data-template-id="${tpl.id}">
              <div class="studio-card-header">
                <div class="studio-card-badges">
                  <span class="studio-badge-cat" style="color: ${catMeta.color}; border-color: ${catMeta.color};">
                    ${catMeta.label}
                  </span>
                  <span class="studio-badge-id">#${tpl.id}</span>
                  <span class="studio-badge-target">🎯 ${this.getTargetBadge(tpl.target)}</span>
                </div>
                <button class="studio-fire-btn" data-fire-id="${tpl.id}" title="Lấy dữ liệu mock và đẩy banner thông báo ngay lập tức!">
                  🚀 BẮN THỬ NGAY
                </button>
              </div>

              <div class="studio-form-row">
                <label class="studio-form-label">Tiêu đề (Title Template):</label>
                <input 
                  type="text" 
                  class="studio-input-title" 
                  data-id="${tpl.id}" 
                  value="${this.escapeHtml(tpl.titleTemplate)}" 
                  placeholder="Nhập tiêu đề thông báo..." 
                />
              </div>

              <div class="studio-form-row">
                <label class="studio-form-label">Nội dung (Body Template):</label>
                <textarea 
                  class="studio-textarea-body" 
                  data-id="${tpl.id}" 
                  rows="2" 
                  placeholder="Nhập nội dung thông báo..."
                >${this.escapeHtml(tpl.bodyTemplate)}</textarea>
              </div>

              ${tpl.sassyExamples && tpl.sassyExamples.length > 0 ? `
                <div class="studio-sassy-box">
                  <div class="studio-sassy-label">
                    <span>🦉 GỢI Ý CÂU CỢT NHẢ DUOLINGO (BẤM ĐỂ ÁP DỤNG NGAY):</span>
                  </div>
                  <div class="studio-sassy-list">
                    ${tpl.sassyExamples.map((ex, exIdx) => `
                      <button class="studio-sassy-pill" data-apply-id="${tpl.id}" data-sassy-idx="${exIdx}">
                        <span class="sassy-title-badge">${this.escapeHtml(ex.title)}</span>
                        <span class="sassy-body-preview">${this.escapeHtml(ex.body)}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
        this.bindCardEvents();
      }
    });

    this.bindCardEvents();

    // Footer buttons
    this.overlay.querySelector('#btn-studio-save')?.addEventListener('click', () => {
      this.saveTemplates();
    });

    this.overlay.querySelector('#btn-studio-restore')?.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn khôi phục toàn bộ mẫu câu về mặc định ban đầu không?')) {
        this.resetToDefaults();
      }
    });

    this.overlay.querySelector('#btn-studio-export-json')?.addEventListener('click', () => {
      this.exportJson();
    });
  }

  private bindCardEvents(): void {
    // Sassy Examples: Apply immediately
    const sassyBtns = this.overlay.querySelectorAll<HTMLButtonElement>('.studio-sassy-pill');
    sassyBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tplId = btn.getAttribute('data-apply-id');
        const sassyIdx = Number(btn.getAttribute('data-sassy-idx'));
        const tpl = this.templates.find((t) => t.id === tplId);
        if (tpl && tpl.sassyExamples && tpl.sassyExamples[sassyIdx]) {
          const ex = tpl.sassyExamples[sassyIdx];
          tpl.titleTemplate = ex.title;
          tpl.bodyTemplate = ex.body;

          // Update inputs in DOM
          const titleInput = this.overlay.querySelector<HTMLInputElement>(`.studio-input-title[data-id="${tplId}"]`);
          const bodyTextarea = this.overlay.querySelector<HTMLTextAreaElement>(`.studio-textarea-body[data-id="${tplId}"]`);
          if (titleInput) titleInput.value = ex.title;
          if (bodyTextarea) bodyTextarea.value = ex.body;

          // Card flash animation
          const card = btn.closest('.studio-card');
          card?.classList.add('card-highlight-flash');
          setTimeout(() => card?.classList.remove('card-highlight-flash'), 500);

          this.showFeedbackToast(`Đã áp dụng câu cợt nhả: "${ex.title}"! 🦉`);
        }
      });
    });

    // Test Fire Buttons: Format with mock data and trigger NotificationBanner.show(...)
    const fireBtns = this.overlay.querySelectorAll<HTMLButtonElement>('.studio-fire-btn');
    fireBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tplId = btn.getAttribute('data-fire-id');
        const tpl = this.templates.find((t) => t.id === tplId);
        if (!tpl) return;

        // Read current typed values from card
        const titleInput = this.overlay.querySelector<HTMLInputElement>(`.studio-input-title[data-id="${tplId}"]`);
        const bodyTextarea = this.overlay.querySelector<HTMLTextAreaElement>(`.studio-textarea-body[data-id="${tplId}"]`);
        const rawTitle = titleInput ? titleInput.value : tpl.titleTemplate;
        const rawBody = bodyTextarea ? bodyTextarea.value : tpl.bodyTemplate;

        // Substitute mock data variables
        const formattedTitle = formatNotificationText(rawTitle, STUDIO_MOCK_DATA);
        const formattedBody = formatNotificationText(rawBody, STUDIO_MOCK_DATA);

        // Show floating in-game push notification!
        NotificationBanner.show({
          title: formattedTitle,
          body: formattedBody,
          icon: tpl.icon,
          category: tpl.category,
          durationMs: 6000
        });

        // Flash button
        btn.classList.add('fire-triggered');
        setTimeout(() => btn.classList.remove('fire-triggered'), 400);
      });
    });

    // Input listeners for dynamic rebind
    const textInputs = this.overlay.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '.studio-input-title, .studio-textarea-body'
    );
    textInputs.forEach((input) => {
      input.addEventListener('focus', () => {
        this.lastFocusedInput = input;
      });
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-id');
        const isTitle = input.classList.contains('studio-input-title');
        const targetTpl = this.templates.find((t) => t.id === id);
        if (targetTpl) {
          if (isTitle) {
            targetTpl.titleTemplate = input.value;
          } else {
            targetTpl.bodyTemplate = input.value;
          }
        }
      });
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
