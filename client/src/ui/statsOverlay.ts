import { SCHOOL_ROSTER, SCHOOL_IDS, SchoolConfig } from "../../../shared/constants/schools";
import { iconSword, iconMapGrid, iconTrophy, iconFlag } from "./icons";

export class StatsOverlay {
  public element: HTMLElement;
  private troopCountEl!: HTMLElement;
  private tileCountEl!: HTMLElement;
  private domPctEl!: HTMLElement;
  private schoolNameEl!: HTMLElement;
  private schoolBadgeEl!: HTMLElement;
  private dominanceBarEl!: HTMLElement;
  private schoolSelectEl!: HTMLSelectElement;

  private currentSchoolId = "hcmut";
  public onSchoolChange?: (schoolId: string) => void;
  public onFlyToHQRequested?: () => void;

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "stats-overlay";
    this.element.innerHTML = `
      <div class="top-hud-main">
        <div class="school-profile" id="schoolProfileCard" title="Nhấp vào để Bay về Căn cứ HQ (Phím tắt [H] hoặc [Space])" style="cursor: pointer;">
          <div class="school-badge" id="schoolBadge">BK</div>
          <div class="school-info">
            <div class="school-title-row">
              <span class="school-name" id="schoolName">ĐH Bách Khoa</span>
              <span class="hq-fly-pill" title="Phím tắt: [H] hoặc [Space]">🎯 [H] Về HQ</span>
              <select id="schoolSelect" class="school-select-btn" title="Đổi trường đại diện">
                ${SCHOOL_IDS.map((id) => `<option value="${id}">${SCHOOL_ROSTER[id].shortName}</option>`).join("")}
              </select>
            </div>
            <span class="sub-label">ĐHQG-HCM LAND RUSH • CHIẾN DỊCH TRANH HÙNG</span>
          </div>
        </div>

        <div class="tactical-metrics">
          <div class="metric-card metric-troops" title="Quân lực hiện có của trường">
            <span class="metric-icon">${iconSword(18, "#ffd166")}</span>
            <div class="metric-content">
              <span class="metric-val" id="troopCount">500</span>
              <span class="metric-lbl">QUÂN LỰC</span>
            </div>
          </div>

          <div class="metric-card metric-territory" title="Số ô lãnh thổ đang kiểm soát">
            <span class="metric-icon">${iconMapGrid(18, "#06d6a0")}</span>
            <div class="metric-content">
              <span class="metric-val" id="tileCount">9</span>
              <span class="metric-lbl">LÃNH THỔ</span>
            </div>
          </div>

          <div class="metric-card metric-dominance" title="Thị phần kiểm soát toàn bản đồ">
            <span class="metric-icon">${iconTrophy(18, "#118ab2")}</span>
            <div class="metric-content">
              <span class="metric-val" id="domPct">10.0%</span>
              <span class="metric-lbl">THỊ PHẦN</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Dominance Bar (Thanh Thị Phần Lãnh Thổ) -->
      <div class="dominance-bar-container" title="Thị phần lãnh thổ 10 trường ĐHQG">
        <div class="dominance-bar" id="dominanceBar"></div>
      </div>
    `;

    container.appendChild(this.element);

    this.troopCountEl = this.element.querySelector("#troopCount")!;
    this.tileCountEl = this.element.querySelector("#tileCount")!;
    this.domPctEl = this.element.querySelector("#domPct")!;
    this.schoolNameEl = this.element.querySelector("#schoolName")!;
    this.schoolBadgeEl = this.element.querySelector("#schoolBadge")!;
    this.dominanceBarEl = this.element.querySelector("#dominanceBar")!;
    this.schoolSelectEl = this.element.querySelector("#schoolSelect") as HTMLSelectElement;

    this.setupEvents();
    this.setSchool(this.currentSchoolId);
  }

  private setupEvents() {
    this.schoolSelectEl.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      this.setSchool(target.value);
      if (this.onSchoolChange) {
        this.onSchoolChange(target.value);
      }
    });

    const card = this.element.querySelector("#schoolProfileCard");
    card?.addEventListener("click", (e) => {
      // Don't trigger if user was interacting with the select dropdown
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      if (this.onFlyToHQRequested) {
        this.onFlyToHQRequested();
      }
    });
  }

  public setSchool(schoolId: string) {
    this.currentSchoolId = schoolId;
    const config = SCHOOL_ROSTER[schoolId];
    if (!config) return;

    this.schoolNameEl.textContent = config.name;
    this.schoolBadgeEl.textContent = config.shortName.slice(0, 4);
    this.schoolBadgeEl.style.backgroundColor = config.colorHex;
    this.schoolBadgeEl.style.borderColor = config.accentHex;
    this.schoolSelectEl.value = schoolId;
  }

  public updateTroops(troops: number) {
    this.troopCountEl.textContent = troops.toLocaleString();
  }

  public updateTerritory(territoryCounts: Record<string, number>) {
    let totalClaimed = 0;
    for (const id of SCHOOL_IDS) {
      totalClaimed += territoryCounts[id] || 0;
    }

    const myTiles = territoryCounts[this.currentSchoolId] || 0;
    this.tileCountEl.textContent = myTiles.toLocaleString();

    const myPct = totalClaimed > 0 ? ((myTiles / totalClaimed) * 100).toFixed(1) : "0.0";
    this.domPctEl.textContent = `${myPct}%`;

    // Render multi-segment dominance bar
    this.dominanceBarEl.innerHTML = "";
    if (totalClaimed === 0) return;

    for (const id of SCHOOL_IDS) {
      const count = territoryCounts[id] || 0;
      if (count === 0) continue;

      const pct = (count / totalClaimed) * 100;
      const school = SCHOOL_ROSTER[id];
      const segment = document.createElement("div");
      segment.className = "dom-segment";
      segment.style.width = `${pct}%`;
      segment.style.backgroundColor = school.colorHex;
      segment.title = `${school.shortName}: ${count} ô (${pct.toFixed(1)}%)`;
      this.dominanceBarEl.appendChild(segment);
    }
  }
}
