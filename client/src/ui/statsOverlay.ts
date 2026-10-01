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
  explorationPercentage?: number;
  revealedTilesCount?: number;
  totalMapTiles?: number;
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
      studentName: "Sinh viên Khám phá",
      schoolId: "hcmut",
      schoolName: defaultSchool?.name || "HCMUT",
      schoolColor: defaultSchool?.colorHex || "#0062FF",
      points: 500,
      claimedTiles: 0,
      totalSchoolTiles: 9,
      controlPercentage: 10.0,
      explorationPercentage: 0.0,
      revealedTilesCount: 0,
      totalMapTiles: 1000000,
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
      terrValEl.innerHTML = `${myTiles} <small style="font-size:11px; color:var(--text-secondary);">vùng (${pct}%)</small>`;
    } else {
      this.render();
    }
  }

  public updateExploration(revealedCount: number, percentage: number): void {
    if (this.stats.revealedTilesCount === revealedCount && this.stats.explorationPercentage === percentage) {
      return;
    }

    this.stats.revealedTilesCount = revealedCount;
    this.stats.explorationPercentage = percentage;

    const expValEl = this.element.querySelector('.stat-exploration .stat-value');
    if (expValEl) {
      expValEl.innerHTML = `${percentage.toFixed(2)}% <small class="exploration-sub">(${revealedCount.toLocaleString()} ô)</small>`;
    } else {
      this.render();
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="hud-left">
        <!-- Predator R2PL Gaming Brand Tag -->
        <div class="hud-brand-tag" title="Acer Predator // Road to Predator League">
          <span class="brand-predator-text"><span class="predator-bracket">[</span>PREDATOR<span class="predator-bracket">]</span></span>
          <span class="brand-r2pl-badge">R2PL</span>
        </div>

        <div class="school-pill" id="btnFlyHQ" style="--school-color: ${this.stats.schoolColor};" title="Chạm để bay về Trụ sở Headquarters [Phím tắt: H / Space]">
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
                  : `<span class="school-hq-jump-hint" title="Chạm để bay về Trụ sở Headquarters">${Icons.crosshair(11)} HQ</span>`
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
        <!-- Điểm tích luỹ hiện có -->
        <div class="stat-badge stat-points" title="Điểm (Points) tích luỹ từ giải chạy">
          <div class="stat-icon-box point-glow">
            ${Icons.star(16)}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐIỂM (POINTS)</span>
            <span class="stat-value point-number">${this.stats.points.toLocaleString()}</span>
          </div>
        </div>

        <!-- Vùng tri thức trường đang kiểm soát -->
        <div class="stat-badge stat-territory" title="Vùng tri thức (Knowledge) trường kiểm soát">
          <div class="stat-icon-box">
            ${Icons.tile('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">VÙNG TRI THỨC</span>
            <span class="stat-value">${this.stats.totalSchoolTiles} <small class="territory-pct-text">(${this.stats.controlPercentage}%)</small></span>
          </div>
        </div>

        <!-- Tiến độ khám phá bản đồ toàn cục (Xua tan sương mù) -->
        <div class="stat-badge stat-exploration" title="Tiến độ khám phá toàn bản đồ (Khám phá ô đất để xua tan sương mù)">
          <div class="stat-icon-box exploration-glow">
            ${Icons.compass('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">TIẾN ĐỘ KHÁM PHÁ</span>
            <span class="stat-value exploration-number">${(this.stats.explorationPercentage || 0).toFixed(2)}% <small class="exploration-sub">(${(this.stats.revealedTilesCount || 0).toLocaleString()} ô)</small></span>
          </div>
        </div>
      </div>

      <div class="hud-right">
        <div class="stat-badge stat-rank" title="Số vùng tri thức sinh viên đã khai phá">
          <div class="stat-icon-box">
            ${Icons.trophy('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐÃ KHÁM PHÁ</span>
            <span class="stat-value">${this.stats.claimedTiles} vùng</span>
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
