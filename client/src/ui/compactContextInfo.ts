import { ACTION_MODES } from './studentActionDock';
import type { TileData } from './tileTooltip';

/** Mobile summary shares the same tile state as the desktop inspector. */
export function compactContextInfo(tile: TileData): HTMLElement {
  const card = document.createElement('section');
  card.className = 'compact-context-info';
  const landmark = Boolean(tile.landmarkName || tile.isLandmark);
  const title = document.createElement('strong');
  title.textContent = tile.isFogCovered ? 'Khu vực Sương Mù' : landmark ? tile.landmarkName || 'Công trình' : 'Ô tri thức';
  const state = document.createElement('span');
  state.className = 'compact-context-status';
  state.textContent = tile.isFogCovered ? 'Chưa khám phá' : landmark ? tile.isLit ? 'Đèn hiệu đã sáng' : 'Chưa thắp đèn hiệu' : tile.isShared ? 'Tri thức chung' : tile.isOwnedByMe ? 'Trường bạn' : tile.isEnemyControlled ? 'Giao lưu tri thức' : tile.ownerSchoolName || 'Chưa có chủ';
  const coords = document.createElement('small');
  coords.textContent = `(${tile.x}, ${tile.z})`;
  const cost = document.createElement('span');
  cost.className = 'compact-context-cost';
  // Tile cost is supplied by the existing gameplay selection; never infer rates from a mockup.
  cost.textContent = `${tile.isOwnedByMe || tile.isShared ? 'Ôn bài' : tile.isEnemyControlled ? 'Giao lưu' : 'Khám phá'} · ${tile.cost} Điểm`;
  if (landmark && !tile.isFogCovered) cost.textContent = `Thắp Đèn Hiệu · ${ACTION_MODES.beacon.cost} Tinh Thể`;
  card.append(title, state, coords, cost);
  return card;
}
