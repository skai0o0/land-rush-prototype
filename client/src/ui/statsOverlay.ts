// client/src/ui/statsOverlay.ts
import { Icons } from './icons';
import { SCHOOL_ROSTER, SCHOOL_IDS } from '../../../shared/constants/schools';

export interface StudentStats {
  studentName: string;
  studentEmail?: string;
  schoolId: string;
  schoolName: string;
  schoolColor: string;
  points: number;
  claimedTiles: number;
  totalSchoolTiles: number;
  controlPercentage: number;
  mode: "normal" | "dev";
  isLocked: boolean;
}

export class StatsOverlay {
  public element: HTMLElement;
  private stats: StudentStats;

  public onFlyToHQRequested?: () => void;
  public onSchoolChange?: (schoolId: string) => void;

  constructor(parent?: HTMLElement, initialStats?: Partial<StudentStats>) {
    const defaultSchool = SCHOOL_ROSTER["hcmut"];
    this.stats = {
      studentName: "Chiến binh ĐHQG",
      schoolId: "hcmut",
      schoolName: defaultSchool?.name || "ĐH Bách Khoa",
      schoolColor: defaultSchool?.colorHex || "#0055a5",
      points: 500,
      claimedTiles: 0,
      totalSchoolTiles: 9,
      controlPercentage: 10.0,
      mode: "dev",
      isLocked: false,
      ...initialStats
    };

    this.element = document.createElement('header');
    this.element.className = 'stats-top-hud';
    this.element.setAttribute('data-ui', 'true');
    this.render();
    (parent || document.body).appendChild(this.element);
  }

  public updateStats(newStats: Partial<StudentStats>): void {
    this.stats = { ...this.stats, ...newStats };
    this.render();
  }

  public updateTroops(points: number): void {
    if (this.stats.points === points) return;
    this.stats.points = points;
    const pointEl = this.element.querySelector('.stat-points .stat-value');
    if (pointEl) {
      pointEl.textContent = points.toLocaleString();
    } else {
      this.render();
    }
  }

  public setSchool(schoolId: string): void {
    const school = SCHOOL_ROSTER[schoolId];
    if (!school) return;
    this.updateStats({
      schoolId,
      schoolName: school.name,
      schoolColor: school.colorHex
    });
  }

  public updateTerritory(territoryCounts: Record<string, number>): void {
    let totalClaimed = 0;
    for (const id of SCHOOL_IDS) {
      totalClaimed += territoryCounts[id] || 0;
    }

    const myTiles = territoryCounts[this.stats.schoolId] || 0;
    const pct = totalClaimed > 0 ? parseFloat(((myTiles / totalClaimed) * 100).toFixed(1)) : 0;

    if (this.stats.totalSchoolTiles === myTiles && this.stats.controlPercentage === pct) {
      return;
    }

    this.stats.totalSchoolTiles = myTiles;
    this.stats.controlPercentage = pct;

    const terrValEl = this.element.querySelector('.stat-territory .stat-value');
    if (terrValEl) {
      terrValEl.innerHTML = `${myTiles} <small style="font-size:11px; color:var(--text-secondary);">ô (${pct}%)</small>`;
    } else {
      this.render();
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="hud-left">
        <div class="school-pill" id="btnFlyHQ" style="--school-color: ${this.stats.schoolColor};" title="Chạm để bay về Căn cứ HQ [Phím tắt: H / Space]">
          <div class="school-icon-wrapper">
            ${Icons.school('md')}
          </div>
          <div class="school-info">
            <div class="school-title-row">
              <span class="school-code">${this.stats.schoolId.toUpperCase()}</span>
              ${
                this.stats.studentEmail
                  ? `<span class="school-locked-pill" title="Tài khoản sinh viên: ${this.stats.studentEmail}">
                      ${Icons.lock(11)}
                      <span class="locked-email-text">${this.stats.studentEmail.split('@')[0]}</span>
                    </span>`
                  : `<span class="school-hq-jump-hint" title="Chạm để bay về HQ">${Icons.crosshair(11)} HQ</span>`
              }
              ${
                this.stats.mode === "dev"
                  ? `<span class="dev-mode-pill" title="Chế độ nhà phát triển">DEV</span>`
                  : ''
              }
            </div>
            <span class="student-name">${this.stats.schoolName}</span>
          </div>
        </div>
      </div>

      <div class="hud-center">
        <!-- Điểm cống hiến hiện có -->
        <div class="stat-badge stat-points" title="Điểm cống hiến giải chạy">
          <div class="stat-icon-box point-glow">
            ${Icons.star(16)}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐIỂM</span>
            <span class="stat-value point-number">${this.stats.points.toLocaleString()}</span>
          </div>
        </div>

        <!-- Ô đất trường đang kiểm soát (hiển thị trên tablet/desktop) -->
        <div class="stat-badge stat-territory" title="Lãnh thổ trường kiểm soát">
          <div class="stat-icon-box">
            ${Icons.tile('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">LÃNH THỔ</span>
            <span class="stat-value">${this.stats.totalSchoolTiles} <small class="territory-pct-text">(${this.stats.controlPercentage}%)</small></span>
          </div>
        </div>
      </div>

      <div class="hud-right">
        <div class="stat-badge stat-rank">
          <div class="stat-icon-box">
            ${Icons.trophy('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐÃ ĐỔI</span>
            <span class="stat-value">${this.stats.claimedTiles} ô</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const stopProp = (e: Event) => e.stopPropagation();
    const interactiveElements = this.element.querySelectorAll('.school-pill, .stat-badge');
    interactiveElements.forEach((el) => {
      el.addEventListener('pointerdown', stopProp);
      el.addEventListener('mousedown', stopProp);
      el.addEventListener('touchstart', stopProp, { passive: true });
    });

    const pill = this.element.querySelector('#btnFlyHQ');
    pill?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onFlyToHQRequested?.();
    });
  }
}
