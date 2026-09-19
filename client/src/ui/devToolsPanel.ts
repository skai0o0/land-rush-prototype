import { iconGear, iconLightning, iconSword } from "./icons";

export interface DevToolsCallbacks {
  onSpeedSelect: (speed: number) => void;
  onBulkDispatch: (amount: number) => void;
  onSoftReset: () => void;
}

export class DevToolsPanel {
  public element: HTMLElement;
  private currentSpeed = 1;
  private fpsDisplay!: HTMLElement;
  private tickDisplay!: HTMLElement;

  constructor(container: HTMLElement, private callbacks: DevToolsCallbacks) {
    this.element = document.createElement("div");
    this.element.className = "devtools-panel";
    this.element.innerHTML = `
      <div class="devtools-header">
        <div class="devtools-title">
          ${iconGear(18, "#00f0ff")} <span>DEVTOOLS WEBSOCKET</span>
        </div>
        <div class="devtools-fps" id="devFps">60 FPS</div>
      </div>

      <div class="devtools-content">
        <!-- Speed Controls -->
        <div class="devtools-section">
          <div class="section-title">${iconLightning(14, "#ffd166")} TỐC ĐỘ GIẢ LẬP SERVER</div>
          <div class="btn-group speed-group">
            <button class="dev-btn speed-btn active" data-speed="1">1x</button>
            <button class="dev-btn speed-btn" data-speed="2">2x</button>
            <button class="dev-btn speed-btn" data-speed="5">5x</button>
            <button class="dev-btn speed-btn" data-speed="10">10x</button>
            <button class="dev-btn speed-btn warning-glow" data-speed="50">50x</button>
          </div>
        </div>

        <!-- Troop Dispatch Controls -->
        <div class="devtools-section">
          <div class="section-title">${iconSword(14, "#06d6a0")} PHÁT QUÂN TOÀN TRƯỜNG</div>
          <div class="btn-group troop-group">
            <button class="dev-btn troop-btn" data-amount="500">+500 All</button>
            <button class="dev-btn troop-btn" data-amount="2000">+2.000 All</button>
            <button class="dev-btn troop-btn highlight" data-amount="10000">+10.000 All</button>
          </div>
        </div>

        <!-- Reset & Status -->
        <div class="devtools-section devtools-footer">
          <button class="dev-btn reset-btn" id="btnSoftReset">
            🔄 Soft Reset Map
          </button>
          <div class="server-status">
            <span class="status-dot"></span>
            <span id="devTick">Tick: 0</span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(this.element);

    this.fpsDisplay = this.element.querySelector("#devFps")!;
    this.tickDisplay = this.element.querySelector("#devTick")!;

    this.setupEvents();
  }

  private setupEvents() {
    // Speed buttons
    const speedButtons = this.element.querySelectorAll<HTMLButtonElement>(".speed-btn");
    speedButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const speed = parseInt(btn.getAttribute("data-speed") || "1", 10);
        speedButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentSpeed = speed;
        this.callbacks.onSpeedSelect(speed);
      });
    });

    // Troop buttons
    const troopButtons = this.element.querySelectorAll<HTMLButtonElement>(".troop-btn");
    troopButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const amount = parseInt(btn.getAttribute("data-amount") || "500", 10);
        this.callbacks.onBulkDispatch(amount);
      });
    });

    // Reset button
    const resetBtn = this.element.querySelector<HTMLButtonElement>("#btnSoftReset")!;
    resetBtn.addEventListener("click", () => {
      if (confirm("Xác nhận Soft Reset Map? Lãnh thổ sẽ được đưa về 10 ô HQ ban đầu.")) {
        this.callbacks.onSoftReset();
      }
    });
  }

  public setFps(fps: number) {
    this.fpsDisplay.textContent = `${fps} FPS`;
    if (fps >= 55) {
      this.fpsDisplay.style.color = "#06d6a0";
    } else if (fps >= 30) {
      this.fpsDisplay.style.color = "#ffd166";
    } else {
      this.fpsDisplay.style.color = "#ef476f";
    }
  }

  public setTick(tick: number) {
    this.tickDisplay.textContent = `Tick: ${tick.toLocaleString()}`;
  }
}
