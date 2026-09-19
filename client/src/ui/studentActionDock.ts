import { iconSword, iconHammer, iconFlag } from "./icons";
import { PlayerRole } from "../../../shared/types";

export class StudentActionDock {
  public element: HTMLElement;
  private activeRole: PlayerRole = "assault";
  public onRoleSelect?: (role: PlayerRole) => void;

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "student-action-dock";
    this.element.innerHTML = `
      <div class="dock-container">
        <div class="dock-header">CHẾ ĐỘ TÁC CHIẾN SINH VIÊN</div>
        <div class="dock-buttons">
          <button class="tactile-voxel-btn active" data-role="assault" id="btnAssault">
            <span class="btn-icon">${iconSword(22, "#ff4d4d")}</span>
            <div class="btn-text">
              <span class="btn-title">⚔️ TIÊN PHONG</span>
              <span class="btn-buff">+35% Công phá thành</span>
            </div>
          </button>

          <button class="tactile-voxel-btn" data-role="fortify" id="btnFortify">
            <span class="btn-icon">${iconHammer(22, "#ffb703")}</span>
            <div class="btn-text">
              <span class="btn-title">🔨 KIẾN THIẾT</span>
              <span class="btn-buff">-20% Phí gia cố ô đất</span>
            </div>
          </button>

          <button class="tactile-voxel-btn" data-role="support" id="btnSupport">
            <span class="btn-icon">${iconFlag(22, "#06d6a0")}</span>
            <div class="btn-text">
              <span class="btn-title">🚩 TIẾP ỨNG</span>
              <span class="btn-buff">+20% Bảo toàn quân lực</span>
            </div>
          </button>
        </div>
      </div>
    `;

    container.appendChild(this.element);
    this.setupEvents();
  }

  private setupEvents() {
    const buttons = this.element.querySelectorAll<HTMLButtonElement>(".tactile-voxel-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.getAttribute("data-role") as PlayerRole;
        if (!role) return;

        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeRole = role;

        if (this.onRoleSelect) {
          this.onRoleSelect(role);
        }
      });
    });
  }

  public getRole(): PlayerRole {
    return this.activeRole;
  }
}
