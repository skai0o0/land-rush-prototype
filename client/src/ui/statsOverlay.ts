// client/src/ui/statsOverlay.ts
import { Icons } from './icons';
import { SCHOOL_ROSTER, SCHOOL_IDS } from '../../../shared/constants/schools';

export interface SchoolRankingEntry {
  schoolId: string;
  points: number;
  tiles?: number;
}

export interface StudentStats {
  studentName: string;
  studentEmail?: string;
  displayName?: string;
  schoolId: string;
  schoolName: string;
  schoolColor: string;
  points: number;
  crystals?: number;
  aspireKeys?: number;
  nitroKeys?: number;
  predatorKeys?: number;
  claimedTiles: number;
  totalSchoolTiles: number;
  controlPercentage: number;
  explorationPercentage?: number;
  revealedTilesCount?: number;
  totalMapTiles?: number;
  mode: "normal" | "dev";
  isLocked: boolean;
  litLandmarksCount?: number;
  schoolRankings?: SchoolRankingEntry[];
}

export class StatsOverlay {
  public element: HTMLElement;
  private stats: StudentStats;
  private schoolKnowledgeMap = new Map<string, number>();
  private schoolRankingsList: SchoolRankingEntry[] = [];
  private showRankingPopover = false;

  public onFlyToHQRequested?: () => void;
  public onSchoolChange?: (schoolId: string) => void;

  constructor(parent?: HTMLElement, initialStats?: Partial<StudentStats>) {
    const defaultSchool = SCHOOL_ROSTER["hcmut"];
    const defaultDisplayName = initialStats?.displayName || (initialStats?.studentEmail ? initialStats.studentEmail.split('@')[0] : "Sinh viên Khám phá");
    this.stats = {
      studentName: defaultDisplayName,
      displayName: defaultDisplayName,
      schoolId: "hcmut",
      schoolName: defaultSchool?.name || "HCMUT",
      schoolColor: defaultSchool?.colorHex || "#0062FF",
      points: 500,
      crystals: 0,
      aspireKeys: 0,
      nitroKeys: 0,
      predatorKeys: 0,
      claimedTiles: 0,
      totalSchoolTiles: 9,
      controlPercentage: 10.0,
      explorationPercentage: 0.0,
      revealedTilesCount: 0,
      totalMapTiles: 1000000,
      mode: "dev",
      isLocked: false,
      litLandmarksCount: 0,
      ...initialStats
    };

    // Initialize default points map
    for (const sId of SCHOOL_IDS) {
      this.schoolKnowledgeMap.set(sId, 0);
    }

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

  /**
   * Cập nhật Điểm Tri Thức (Points)
   */
  public updatePoints(points: number): void {
    if (this.stats.points === points) return;
    this.stats.points = points;


    const pointEl = this.element.querySelector('.stat-points .stat-value');
    if (pointEl) {
      pointEl.textContent = points.toLocaleString();
    } else {
      this.render();
    }
    this.updateRankDisplay();
  }

  /**
   * Backward-compatibility alias for updatePoints
   */
  public updateTroops(points: number): void {
    this.updatePoints(points);
  }

  /**
   * Cập nhật Bảng xếp hạng Ô Tri Thức các trường (School Ranking)
   * Hiển thị số ô tri thức đã mở rộng còn hiệu lực.
   */
  public updateSchoolRankings(rankings: SchoolRankingEntry[] | Record<string, number>): void {
    if (Array.isArray(rankings)) {
      this.schoolRankingsList = rankings.map(r => ({
        schoolId: r.schoolId,
        points: r.points !== undefined ? r.points : ((r as any).troops || 0),
        tiles: r.tiles
      }));
      for (const r of this.schoolRankingsList) {
        this.schoolKnowledgeMap.set(r.schoolId, r.points);
      }
    } else if (typeof rankings === 'object' && rankings !== null) {
      this.schoolRankingsList = Object.entries(rankings).map(([schoolId, pts]) => ({
        schoolId,
        points: pts
      }));
      for (const [sId, pts] of Object.entries(rankings)) {
        this.schoolKnowledgeMap.set(sId, pts);
      }
    }
    this.schoolRankingsList.sort((a, b) => b.points - a.points);
    this.updateRankDisplay();
  }

  /**
   * Cập nhật Điểm Tri Thức cho 1 trường học cụ thể
   */
  public updateSchoolPoints(schoolId: string, points: number): void {
    this.schoolKnowledgeMap.set(schoolId, points);
    this.recalculateRankings();
    this.updateRankDisplay();
  }

  private recalculateRankings(): void {
    const list: SchoolRankingEntry[] = [];
    for (const id of SCHOOL_IDS) {
      list.push({
        schoolId: id,
        points: this.schoolKnowledgeMap.get(id) || 0
      });
    }
    list.sort((a, b) => b.points - a.points);
    this.schoolRankingsList = list;
  }

  private getSchoolRankText(): string {
    if (this.schoolRankingsList.length === 0) {
      this.recalculateRankings();
    }
    const idx = this.schoolRankingsList.findIndex(r => r.schoolId === this.stats.schoolId);
    if (idx === -1) {
      return `Hạng #1 (Ô)`;
    }
    const myEntry = this.schoolRankingsList[idx];
    const rank = 1 + this.schoolRankingsList.filter(r => r.points > myEntry.points).length;
    return `#${rank} (${myEntry.points.toLocaleString()} ô)`;
  }

  private updateRankDisplay(): void {
    const rankEl = this.element.querySelector('#stat-school-rank-text');
    if (rankEl) {
      rankEl.textContent = this.getSchoolRankText();
    }
    const popoverBody = this.element.querySelector('#school-ranking-rows-container');
    if (popoverBody) {
      popoverBody.innerHTML = this.renderRankingRows();
    }
  }

  public updateCrystals(crystals: number): void {
    if (this.stats.crystals === crystals) return;
    this.stats.crystals = crystals;
    const crystalEl = this.element.querySelector('.stat-crystals .stat-value');
    if (crystalEl) {
      crystalEl.textContent = crystals.toLocaleString();
    } else {
      this.render();
    }
  }

  /**
   * Thống kê số lượng Công trình đã Thắp Đèn Hiệu
   */
  public updateLitLandmarks(count: number): void {
    if (this.stats.litLandmarksCount === count) return;
    this.stats.litLandmarksCount = count;
    const beaconEl = this.element.querySelector('.stat-beacons .stat-value');
    if (beaconEl) {
      beaconEl.textContent = `${count} công trình`;
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

  private renderRankingRows(): string {
    if (this.schoolRankingsList.length === 0) {
      this.recalculateRankings();
    }
    return this.schoolRankingsList.map((entry, idx) => {
      const sc = SCHOOL_ROSTER[entry.schoolId];
      const isMe = entry.schoolId === this.stats.schoolId;
      const color = sc?.colorHex || '#94a3b8';
      const name = sc?.name || entry.schoolId.toUpperCase();
      const rankColor = idx === 0 ? '#fbbf24' : (idx === 1 ? '#cbd5e1' : (idx === 2 ? '#b45309' : '#64748b'));

      return `
        <div class="ranking-row ${isMe ? 'is-my-school' : ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-radius: 4px; background: ${isMe ? 'rgba(0, 255, 232, 0.12)' : 'rgba(255,255,255,0.03)'}; margin-bottom: 4px; border-left: 3px solid ${color};">
          <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
            <span style="font-weight: 800; font-size: 11px; color: ${rankColor}; width: 22px;">#${1 + this.schoolRankingsList.filter(r => r.points > entry.points).length}</span>
            <span style="font-weight: 700; font-size: 11px; color: ${color}; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${name}</span>
            ${isMe ? `<span style="font-size: 9px; font-weight: 700; background: rgba(0, 255, 232, 0.2); color: #00ffe8; padding: 1px 4px; border-radius: 2px; white-space: nowrap;">Trường bạn</span>` : ''}
          </div>
          <div style="font-weight: 800; font-size: 11px; color: #fbbf24; white-space: nowrap; margin-left: 8px;">
            ${entry.points.toLocaleString()} <span style="font-weight: 600; font-size: 10px; color: var(--text-secondary);">ô</span>
          </div>
        </div>
      `;
    }).join('');
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
                (this.stats.displayName || this.stats.studentEmail)
                  ? `<span class="school-locked-pill" title="Tài khoản sinh viên: ${this.stats.displayName || this.stats.studentEmail}">
                      ${Icons.lock(11)}
                      <span class="locked-email-text">${this.stats.displayName || (this.stats.studentEmail ? this.stats.studentEmail.split('@')[0] : '')}</span>
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
        <!-- Điểm Tri Thức tích luỹ hiện có (Points) -->
        <div class="stat-badge stat-points" title="Điểm Tri Thức (Points) tích luỹ từ hoạt động chạy bộ">
          <div class="stat-icon-box point-glow">
            ${Icons.star(16)}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐIỂM TRI THỨC</span>
            <span class="stat-value point-number">${this.stats.points.toLocaleString()}</span>
          </div>
        </div>

        <!-- Tinh thể cá nhân (Crystals) -->
        <div class="stat-badge stat-crystals" title="Tinh thể (Crystals) thu thập từ UniStop/Rương để thắp sáng Đèn hiệu">
          <div class="stat-icon-box crystal-glow" style="color: #00ffe8;">
            ${Icons.crystal(16)}
          </div>
          <div class="stat-content">
            <span class="stat-label">TINH THỂ</span>
            <span class="stat-value crystal-number" style="color: #00ffe8;">${(this.stats.crystals || 0).toLocaleString()}</span>
          </div>
        </div>

        <!-- Ô tri thức trường đang kiểm soát -->
        <div class="stat-badge stat-territory" title="Ô tri thức trường đang kiểm soát">
          <div class="stat-icon-box">
            ${Icons.tile('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">Ô TRI THỨC</span>
            <span class="stat-value">${this.stats.totalSchoolTiles} <small class="territory-pct-text">ô (${this.stats.controlPercentage}%)</small></span>
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

      <div class="hud-right" style="position: relative;">
        <!-- Bảng xếp hạng Ô Tri Thức các trường (School Points Ranking) -->
        <div class="stat-badge stat-school-rank" id="btnSchoolRankPopover" style="cursor: pointer;" title="Bảng xếp hạng Ô Tri Thức các trường học [Nhấp để xem chi tiết]">
          <div class="stat-icon-box" style="color: #fbbf24;">
            ${Icons.trophy('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">XẾP HẠNG Ô TRI THỨC</span>
            <span class="stat-value" id="stat-school-rank-text" style="color: #fbbf24;">${this.getSchoolRankText()}</span>
          </div>
        </div>

        <!-- Thống kê Công trình đã Thắp Đèn Hiệu -->
        <div class="stat-badge stat-beacons" title="Số lượng Công trình Tri Thức trường đã Thắp Đèn Hiệu">
          <div class="stat-icon-box beacon-glow" style="color: #00ffe8;">
            ${Icons.beacon('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐÈN HIỆU ĐÃ THẮP</span>
            <span class="stat-value beacon-number">${this.stats.litLandmarksCount || 0} công trình</span>
          </div>
        </div>

        <!-- Ô tri thức sinh viên đã khám phá -->
        <div class="stat-badge stat-rank" title="Số ô tri thức sinh viên đã khám phá">
          <div class="stat-icon-box">
            ${Icons.tile('md')}
          </div>
          <div class="stat-content">
            <span class="stat-label">ĐÃ KHÁM PHÁ</span>
            <span class="stat-value">${this.stats.claimedTiles} ô</span>
          </div>
        </div>

        <!-- Popover Bảng xếp hạng Ô Tri Thức Các Trường -->
        <div class="school-ranking-popover" id="school-ranking-popover" style="display: ${this.showRankingPopover ? 'block' : 'none'};">
          <div class="ranking-popover-header">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #fbbf24;">
              ${Icons.trophy('sm')}
              <span>BẢNG XẾP HẠNG TRI THỨC (POINTS)</span>
            </div>
            <button class="ranking-popover-close" id="btn-close-ranking-popover">&times;</button>
          </div>
          <div class="ranking-popover-body" id="school-ranking-rows-container" style="max-height: 280px; overflow-y: auto;">
            ${this.renderRankingRows()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const stopProp = (e: Event) => e.stopPropagation();
    const interactiveElements = this.element.querySelectorAll('.school-pill, .stat-badge, .school-ranking-popover');
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

    // Toggle Ranking Popover
    const rankBadge = this.element.querySelector('#btnSchoolRankPopover');
    const popover = this.element.querySelector('#school-ranking-popover') as HTMLElement;
    rankBadge?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showRankingPopover = !this.showRankingPopover;
      if (popover) {
        popover.style.display = this.showRankingPopover ? 'block' : 'none';
      }
    });

    const closeBtn = this.element.querySelector('#btn-close-ranking-popover');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showRankingPopover = false;
      if (popover) {
        popover.style.display = 'none';
      }
    });

    // Close popover when clicking outside
    document.addEventListener('click', () => {
      if (this.showRankingPopover) {
        this.showRankingPopover = false;
        if (popover) {
          popover.style.display = 'none';
        }
      }
    });
  }
}
