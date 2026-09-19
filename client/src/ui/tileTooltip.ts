import { SCHOOL_ROSTER } from "../../../shared/constants/schools";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { iconShield, iconMapGrid, iconCross, iconCheck } from "./icons";
import { getTerrainType, getTerrainHeight } from "../engine/terrainNoise";

export interface TooltipTileData {
  x: number;
  y: number;
  ownerId?: string;
  defenseTier?: number;
  hp?: number;
  maxHp?: number;
  isAdjacent?: boolean;
  landmarkId?: string;
}

export class TileTooltip {
  public element: HTMLElement;
  private coordEl!: HTMLElement;
  private ownerEl!: HTMLElement;
  private defenseEl!: HTMLElement;
  private hpBarEl!: HTMLElement;
  private hpTextEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private landmarkInfoEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "tile-tooltip";
    this.element.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-icon">${iconMapGrid(16, "#64dfdf")}</span>
        <span class="tooltip-coords" id="ttCoords">[X: 500, Y: 500]</span>
        <span class="tooltip-badge" id="ttOwnerBadge">Hoang</span>
      </div>

      <div class="tooltip-body">
        <div class="tooltip-row">
          <span class="tt-lbl">Chủ sở hữu:</span>
          <span class="tt-val" id="ttOwnerName">Đất tự nhiên vô chủ</span>
        </div>

        <div class="tooltip-row">
          <span class="tt-lbl">Phòng thủ:</span>
          <span class="tt-val" id="ttDefense">Cấp 0 (Đất tự nhiên)</span>
        </div>

        <div class="tooltip-hp-row">
          <div class="hp-meta">
            <span class="tt-lbl">Máu bảo hộ:</span>
            <span class="tt-hp-text" id="ttHpText">100 / 100</span>
          </div>
          <div class="tt-hp-bar-bg">
            <div class="tt-hp-bar-fill" id="ttHpBar" style="width: 100%;"></div>
          </div>
        </div>

        <div class="tooltip-status" id="ttStatus">
          ${iconCheck(14, "#06d6a0")} <span>Sẵn sàng hành động</span>
        </div>

        <div class="tooltip-landmark-info" id="ttLandmarkInfo" style="display: none;">
          <div class="lm-title" id="ttLmTitle">Công trình Biểu tượng</div>
          <div class="lm-buff" id="ttLmBuff">Hiệu ứng chiến lược</div>
        </div>
      </div>
    `;

    container.appendChild(this.element);

    this.coordEl = this.element.querySelector("#ttCoords")!;
    this.ownerEl = this.element.querySelector("#ttOwnerName")!;
    this.defenseEl = this.element.querySelector("#ttDefense")!;
    this.hpBarEl = this.element.querySelector("#ttHpBar")!;
    this.hpTextEl = this.element.querySelector("#ttHpText")!;
    this.statusEl = this.element.querySelector("#ttStatus")!;
    this.landmarkInfoEl = this.element.querySelector("#ttLandmarkInfo")!;
  }

  public update(data: TooltipTileData, playerSchoolId: string) {
    this.coordEl.textContent = `[X: ${data.x}, Y: ${data.y}]`;

    const defenseNames = [
      "Cấp 0 (Đất tự nhiên)",
      "Cấp 1 (Cọc rào gỗ)",
      "Cấp 2 (Bờ kè kiên cố)",
      "Cấp 3 (Tháp canh pháo đài)"
    ];

    if (data.ownerId && SCHOOL_ROSTER[data.ownerId]) {
      const school = SCHOOL_ROSTER[data.ownerId];
      this.ownerEl.innerHTML = `<span class="school-pill" style="background:${school.colorHex}">${school.shortName}</span> ${school.name}`;
      const tier = data.defenseTier || 0;
      this.defenseEl.textContent = defenseNames[tier] || defenseNames[0];

      const hp = data.hp ?? 100;
      const maxHp = data.maxHp ?? 100;
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      this.hpTextEl.textContent = `${hp} / ${maxHp}`;
      this.hpBarEl.style.width = `${pct}%`;
      this.hpBarEl.style.backgroundColor = hp > 40 ? "#06d6a0" : "#ef476f";

      if (data.ownerId === playerSchoolId) {
        this.statusEl.innerHTML = `${iconCheck(14, "#06d6a0")} <span style="color:#06d6a0">Lãnh thổ của trường bạn (Click để Gia cố)</span>`;
      } else {
        this.statusEl.innerHTML = `${iconCross(14, "#ef476f")} <span style="color:#ef476f">Lãnh thổ đối thủ (Click để Tấn công)</span>`;
      }
    } else {
      const tType = getTerrainType(data.x, data.y);
      const tHeight = getTerrainHeight(data.x, data.y);
      let desc = "Đất hoang vô chủ";
      if (tType === "water") desc = "Vùng lòng Hồ Đá (Nước sâu)";
      else if (tType === "hill") desc = "Đồi đá dốc bazan";
      else if (tType === "road") desc = "Đại lộ giao thông chính";

      this.ownerEl.textContent = desc;
      this.defenseEl.textContent = "Cấp 0 (Chưa công sự)";
      this.hpTextEl.textContent = "100 / 100";
      this.hpBarEl.style.width = "100%";
      this.hpBarEl.style.backgroundColor = "#ffd166";

      if (data.isAdjacent) {
        this.statusEl.innerHTML = `${iconCheck(14, "#06d6a0")} <span style="color:#06d6a0">Tiếp giáp lãnh thổ (Click để Chiếm)</span>`;
      } else {
        this.statusEl.innerHTML = `${iconCross(14, "#888")} <span style="color:#888">Chưa liền thổ (Mở rộng từ biên giới)</span>`;
      }
    }

    if (data.landmarkId && LANDMARK_ROSTER[data.landmarkId]) {
      const lm = LANDMARK_ROSTER[data.landmarkId];
      this.landmarkInfoEl.style.display = "block";
      const titleEl = this.landmarkInfoEl.querySelector("#ttLmTitle")!;
      const buffEl = this.landmarkInfoEl.querySelector("#ttLmBuff")!;
      titleEl.textContent = `🏛️ ${lm.name}`;
      buffEl.textContent = lm.buffDescription;
    } else {
      this.landmarkInfoEl.style.display = "none";
    }
  }

  public show() {
    this.element.style.display = "block";
  }

  public hide() {
    this.element.style.display = "none";
  }
}
