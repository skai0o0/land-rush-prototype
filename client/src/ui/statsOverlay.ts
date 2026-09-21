// client/src/ui/statsOverlay.ts
import { Icons } from './icons';
import { SCHOOL_ROSTER, SCHOOL_IDS } from '../../../shared/constants/schools';

export interface StudentStats {
  studentName: string;
  schoolId: string;
  schoolName: string;
  schoolColor: string;
  points: number;
  claimedTiles: number;
  totalSchoolTiles: number;
  controlPercentage: number;
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
      ...initialStats
    };

    this.element = document.createElement('header');
    this.element.className = 'stats-top-hud';
    this.render();
    (parent || document.body).appendChild(this.element);
  }

  public updateStats(newStats: Partial<StudentStats>): void {
    this.stats = { ...this.stats, ...newStats };
    this.render();
  }

  public updateTroops(points: number): void {
    this.updateStats({ points });
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

    this.updateStats({
      totalSchoolTiles: myTiles,
      controlPercentage: pct
    });
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="hud-left">
        <div class="school-pill" id="btnFlyHQ" style="--school-color: ${this.stats.schoolColor}; cursor: pointer;" title="Bay về Căn cứ HQ [H / Space]">
          <div class="school-icon-wrapper">
            ${Icons.school('md')}
          </div>
          <div class="school-info">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="school-code">${this.stats.schoolId.toUpperCase()}</span>
              <select id="headerSchoolSelect" class="header-school-select" title="Đổi trường đại diện">
                ${SCHOOL_IDS.map((id) => `<option value="${id}" ${id === this.stats.schoolId ? "selected" : ""}>${SCHOOL_ROSTER[id].shortName}</option>`).join("")}
              </select>
            </div>
            <span class="student-name">${this.stats.schoolName}</span>
          </div>
        </div>
      </div>

      <div class="hud-center">
        <!-- Điểm cống hiến hiện có -->
        <div class="stat-badge stat-points">
          <div class="stat-icon-box point-glow">
            ${Icons.point('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐIỂM CỐNG HIẾN</span>
            <span class="stat-value point-number">${this.stats.points.toLocaleString()}</span>
          </div>
        </div>

        <!-- Ô đất trường đang kiểm soát -->
        <div class="stat-badge stat-territory">
          <div class="stat-icon-box">
            ${Icons.tile('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">LÃNH THỔ TRƯỜNG</span>
            <span class="stat-value">${this.stats.totalSchoolTiles} <small style="font-size:11px; color:var(--text-secondary);">ô (${this.stats.controlPercentage}%)</small></span>
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
    const pill = this.element.querySelector('#btnFlyHQ');
    pill?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      this.onFlyToHQRequested?.();
    });

    const select = this.element.querySelector('#headerSchoolSelect') as HTMLSelectElement;
    select?.addEventListener('change', (e) => {
      e.stopPropagation();
      const val = (e.target as HTMLSelectElement).value;
      this.setSchool(val);
      this.onSchoolChange?.(val);
    });
  }
}
