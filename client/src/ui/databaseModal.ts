// client/src/ui/databaseModal.ts
import { RunningDatabase, StudentRunningRecord } from '../services/runningDatabase';
import { SCHOOL_ROSTER, getSchoolIdFromEmail } from '../../../shared/constants/schools';
import { Icons } from './icons';

export interface DatabaseModalCallbacks {
  onSelectStudent?: (student: StudentRunningRecord) => void;
  onOpenNewTab?: (schoolId: string, email: string, km: number) => void;
  onStudentUpdated?: (student: StudentRunningRecord) => void;
}

export class DatabaseModal {
  private overlay: HTMLElement;
  private callbacks: DatabaseModalCallbacks;
  private unsubscribe?: () => void;
  private isOpen = false;

  constructor(callbacks: DatabaseModalCallbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.className = 'db-modal-overlay';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);

    this.bindGlobalEvents();
  }

  public open(): void {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.render();

    // Subscribe to database changes
    this.unsubscribe = RunningDatabase.subscribe(() => {
      if (this.isOpen) {
        this.render();
      }
    });
  }

  public close(): void {
    this.isOpen = false;
    this.overlay.style.display = 'none';
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
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
    const students = RunningDatabase.getAll();

    const totalStudents = students.length;
    const totalKm = students.reduce((sum, s) => sum + s.km, 0);
    const totalSpent = students.reduce((sum, s) => sum + (s.pointsSpent || 0), 0);
    const totalAvailable = Math.max(0, Math.round(totalKm) - totalSpent);

    this.overlay.innerHTML = `
      <div class="db-modal-dialog">
        <!-- Modal Header -->
        <div class="db-modal-header">
          <div class="db-header-titles">
            <div class="db-modal-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color: var(--accent-blue);">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              <span>QUẢN LÝ DATABASE GIẢI CHẠY (1 KM = 1 ĐIỂM)</span>
            </div>
            <div class="db-modal-subtitle">
              Hệ thống đồng bộ trực tiếp từ Giải chạy Sinh viên ĐHQG. Không tăng điểm theo thời gian - điểm chỉ sinh ra từ km chạy bộ.
            </div>
          </div>
          <button class="db-modal-close" id="db-btn-close" title="Đóng [Esc]">${Icons.close(18)}</button>
        </div>

        <!-- Metrics Overview Strip -->
        <div class="db-metrics-strip">
          <div class="db-metric-card">
            <span class="db-metric-label">VẬN ĐỘNG VIÊN</span>
            <span class="db-metric-value">${totalStudents} <small>SV</small></span>
          </div>
          <div class="db-metric-card">
            <span class="db-metric-label">TỔNG QUÃNG ĐƯỜNG</span>
            <span class="db-metric-value text-blue">${totalKm.toFixed(1)} <small>km</small></span>
          </div>
          <div class="db-metric-card">
            <span class="db-metric-label">ĐÃ CỐNG HIẾN</span>
            <span class="db-metric-value text-yellow">${totalSpent.toLocaleString()} <small>điểm</small></span>
          </div>
          <div class="db-metric-card">
            <span class="db-metric-label">ĐIỂM KHẢ DỤNG</span>
            <span class="db-metric-value text-green">${totalAvailable.toLocaleString()} <small>điểm</small></span>
          </div>
        </div>

        <!-- Student Database Table -->
        <div class="db-table-wrapper">
          <table class="db-student-table">
            <thead>
              <tr>
                <th>TRƯỜNG</th>
                <th>EMAIL SINH VIÊN (.EDU.VN)</th>
                <th>HỌ VÀ TÊN</th>
                <th style="text-align: center;">QUÃNG ĐƯỜNG (KM)</th>
                <th style="text-align: center;">ĐÃ TIÊU</th>
                <th style="text-align: center;">ĐIỂM KHẢ DỤNG</th>
                <th style="text-align: right;">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              ${students.map(s => {
                const school = SCHOOL_ROSTER[s.schoolId] || { shortName: s.schoolId.toUpperCase(), colorHex: "#64748b" };
                const balance = Math.max(0, Math.round(s.km) - (s.pointsSpent || 0));
                return `
                  <tr data-email="${s.email}">
                    <td>
                      <span class="db-school-badge" style="--school-color: ${school.colorHex}">
                        ${school.shortName}
                      </span>
                    </td>
                    <td>
                      <div class="db-email-cell">
                        <strong>${s.email}</strong>
                      </div>
                    </td>
                    <td>
                      <span class="db-name-cell">${s.name}</span>
                    </td>
                    <td style="text-align: center;">
                      <div class="db-km-input-wrapper">
                        <input type="number" step="1" min="0" max="9999" class="db-km-input" value="${s.km}" data-email="${s.email}" />
                        <span class="db-km-unit">km</span>
                      </div>
                    </td>
                    <td style="text-align: center;">
                      <span class="db-spent-pill">-${s.pointsSpent || 0}</span>
                    </td>
                    <td style="text-align: center;">
                      <span class="db-balance-pill ${balance > 0 ? 'positive' : 'zero'}">
                        ${balance} pts
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div class="db-row-actions">
                        <button class="btn-db-action btn-db-login" data-email="${s.email}" title="Đăng nhập tài khoản sinh viên này ngay trong game">
                          Đăng nhập
                        </button>
                        <button class="btn-db-action btn-db-tab" data-email="${s.email}" title="Mở tab mới với tài khoản này để test nhiều người chơi">
                          Tab mới
                        </button>
                        <button class="btn-db-action btn-db-delete" data-email="${s.email}" title="Xóa tài khoản này khỏi mock database">
                          &times;
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Add New Student Section -->
        <div class="db-add-section">
          <div class="db-add-title">THÊM SINH VIÊN GIẢI CHẠY MỚI</div>
          <form id="form-add-student" class="db-add-form">
            <input type="email" id="input-new-email" class="db-input" placeholder="sinhvienXX@uit.edu.vn" required />
            <input type="text" id="input-new-name" class="db-input" placeholder="Họ và Tên sinh viên" required />
            <input type="number" id="input-new-km" class="db-input km" placeholder="Số km (ví dụ 80)" min="0" step="1" value="60" required />
            <button type="submit" class="btn-db-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: -2px; margin-right: 4px;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Thêm sinh viên
            </button>
          </form>
          <div class="db-add-hint">
            Hỗ trợ tự động nhận diện 7 trường ĐHQG theo email: @hcmut.edu.vn, @uit.edu.vn, @medvnu.edu.vn, @hcmus.edu.vn, @hcmussh.edu.vn, @uel.edu.vn, @hcmiu.edu.vn.
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="db-modal-footer">
          <button class="btn-db-reset" id="db-btn-reset" title="Khôi phục 7 tài khoản mặc định">
            Khôi phục dữ liệu gốc (Reset DB)
          </button>
          <button class="btn-db-close" id="db-btn-close-bottom">
            Đóng
          </button>
        </div>
      </div>
    `;

    this.bindDialogEvents();
  }

  private bindDialogEvents(): void {
    // Close buttons
    this.overlay.querySelector('#db-btn-close')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#db-btn-close-bottom')?.addEventListener('click', () => this.close());

    // Reset button
    this.overlay.querySelector('#db-btn-reset')?.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn khôi phục danh sách sinh viên ban đầu về mặc định?')) {
        RunningDatabase.resetToDefaults();
        this.render();
      }
    });

    // Inline KM inputs
    const kmInputs = this.overlay.querySelectorAll('.db-km-input');
    kmInputs.forEach((input) => {
      const inp = input as HTMLInputElement;
      const email = inp.dataset.email!;

      const handleSave = () => {
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val >= 0) {
          const updated = RunningDatabase.updateKm(email, val);
          if (updated) {
            this.callbacks.onStudentUpdated?.(updated);
          }
          this.render();
        }
      };

      inp.addEventListener('change', handleSave);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          inp.blur();
        }
      });
    });

    // Login buttons
    const loginBtns = this.overlay.querySelectorAll('.btn-db-login');
    loginBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const email = (e.currentTarget as HTMLElement).dataset.email!;
        const student = RunningDatabase.getByEmail(email);
        if (student) {
          this.callbacks.onSelectStudent?.(student);
          this.close();
        }
      });
    });

    // Open Tab buttons
    const tabBtns = this.overlay.querySelectorAll('.btn-db-tab');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const email = (e.currentTarget as HTMLElement).dataset.email!;
        const student = RunningDatabase.getByEmail(email);
        if (student) {
          this.callbacks.onOpenNewTab?.(student.schoolId, student.email, student.km);
        }
      });
    });

    // Delete buttons
    const deleteBtns = this.overlay.querySelectorAll('.btn-db-delete');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const email = (e.currentTarget as HTMLElement).dataset.email!;
        if (confirm(`Bạn có chắc muốn xóa sinh viên ${email}?`)) {
          RunningDatabase.deleteStudent(email);
          this.render();
        }
      });
    });

    // Form Add Student
    const addForm = this.overlay.querySelector('#form-add-student') as HTMLFormElement;
    addForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInp = this.overlay.querySelector('#input-new-email') as HTMLInputElement;
      const nameInp = this.overlay.querySelector('#input-new-name') as HTMLInputElement;
      const kmInp = this.overlay.querySelector('#input-new-km') as HTMLInputElement;

      const email = emailInp.value.trim();
      const name = nameInp.value.trim();
      const km = parseFloat(kmInp.value) || 0;

      if (!email || !email.includes('@')) {
        alert('Vui lòng nhập địa chỉ email hợp lệ!');
        return;
      }

      const schoolId = getSchoolIdFromEmail(email);
      if (!schoolId) {
        if (!confirm(`Tên miền email ${email.split('@')[1]} chưa thuộc danh sách 7 trường ĐHQG chính thức. Hệ thống sẽ gán mặc định về HCMUT. Bạn có muốn tiếp tục?`)) {
          return;
        }
      }

      const newStudent = RunningDatabase.addStudent(email, name, km);
      this.callbacks.onStudentUpdated?.(newStudent);
      this.callbacks.onSelectStudent?.(newStudent);
      this.close();
    });
  }
}
