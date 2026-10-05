export interface FirstLandmarkView {
  id: string;
  name: string;
  distance: number;
  hasPath: boolean;
  guessed: boolean;
  litBySchool: boolean;
  crystals: number;
  targetCrystals: number;
}

export class FirstLandmarkCard {
  private element = document.createElement("section");
  private data?: FirstLandmarkView;
  private signature = "";
  constructor(private onFocus: (id: string) => void, parent: HTMLElement) {
    this.element.className = "first-landmark-card";
    this.element.setAttribute("data-ui", "true");
    this.element.setAttribute("aria-label", "Mục tiêu công trình đầu tiên");
    this.element.hidden = true;
    this.element.innerHTML = `<header><span>MỤC TIÊU ĐẦU TIÊN</span><button type="button" class="goal-collapse" aria-label="Thu gọn mục tiêu" aria-expanded="true">−</button></header>
      <div class="goal-content"><h3></h3><p class="goal-distance"></p><p class="goal-stage"></p><p class="goal-progress"></p>
      <button type="button" class="guidance-primary goal-focus">Xem vị trí công trình</button>
      <p class="guidance-note">Gợi ý gần HQ nhất. Trường vẫn có thể khám phá theo hướng khác.</p></div>`;
    for (const event of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"]) this.element.addEventListener(event, e => e.stopPropagation());
    this.element.querySelector(".goal-focus")!.addEventListener("click", () => { if (this.data) this.onFocus(this.data.id); });
    const collapse = this.element.querySelector<HTMLButtonElement>(".goal-collapse")!;
    collapse.addEventListener("click", () => {
      const content = this.element.querySelector<HTMLElement>(".goal-content")!;
      content.hidden = !content.hidden;
      collapse.textContent = content.hidden ? "+" : "−";
      collapse.setAttribute("aria-label", content.hidden ? "Mở mục tiêu" : "Thu gọn mục tiêu");
      collapse.setAttribute("aria-expanded", String(!content.hidden));
    });
    if (window.matchMedia("(max-width: 600px)").matches) collapse.click();
    parent.appendChild(this.element);
  }
  public update(data?: FirstLandmarkView) {
    this.element.hidden = !data;
    this.data = data;
    const signature = JSON.stringify(data);
    if (!data || signature === this.signature) return;
    this.signature = signature;
    this.element.querySelector("h3")!.textContent = data.name;
    this.element.querySelector(".goal-distance")!.textContent = `Cách HQ khoảng ${data.distance} ô theo đường thẳng`;
    this.element.querySelector(".goal-stage")!.textContent = data.litBySchool ? "Đèn hiệu đang sáng cho trường bạn!" : !data.hasPath ? "Mở rộng các ô tiếp giáp để nối đường tới công trình." : !data.guessed ? "Đã mở đường! Thử giải đố tên công trình để nhận tinh thể." : "Đã giải đố! Cùng trường góp tinh thể để thắp đèn hiệu.";
    this.element.querySelector(".goal-progress")!.textContent = `Tinh thể trường: ${data.crystals.toLocaleString()} / ${data.targetCrystals.toLocaleString()}`;
  }
}
