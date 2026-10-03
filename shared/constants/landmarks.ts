export interface LandmarkConfig {
  id: string;
  name: string;
  category: 'scenic' | 'iconic';
  footprint: { width: number; height: number }; // Đơn vị ô tiles (Scale 50x50 ô)
  requiredTroops: number;
  buffDescription: string;
  gameplayRole: string;
  troopBonus?: number;
  modelFileName?: string;
  tileHp: number;
  coreHp: number;
  defenseTier: number;
  claimCost: number;
  attackCost: number;
}

export const LANDMARK_ROSTER: Record<string, LandmarkConfig> = {
  // === 5 DANH LAM THẮNG CẢNH (SCENIC) ===
  fansipan: {
    id: "fansipan",
    name: "Đỉnh Fansipan",
    category: "scenic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 2500,
    tileHp: 600,
    coreHp: 3000,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 8,
    buffDescription: "Nóc nhà Đông Dương: Tầm nhìn học thuật bao quát, tăng 35% độ bền tri thức, +8 Điểm/giây",
    gameplayRole: "highland_fortress",
    modelFileName: "fansipan.glb"
  },
  halong: {
    id: "halong",
    name: "Vịnh Hạ Long",
    category: "scenic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 2000,
    tileHp: 550,
    coreHp: 2600,
    defenseTier: 3,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 7,
    buffDescription: "Vịnh ngàn đảo: Kỳ quan mở rộng tầm nhìn, giảm 30% suy giảm tri thức ven biển, +7 Điểm/giây",
    gameplayRole: "natural_barrier",
    modelFileName: "halong.glb"
  },
  nguhanhson: {
    id: "nguhanhson",
    name: "Núi Ngũ Hành Sơn",
    category: "scenic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 1400,
    tileHp: 450,
    coreHp: 1800,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 4,
    troopBonus: 6,
    buffDescription: "Ngũ Sơn Tinh Tú: Hồi phục độ bền tri thức tự động +6/s cho các vùng tri thức lân cận, +6 Điểm/giây",
    gameplayRole: "healing_sanctuary",
    modelFileName: "nguhanhson.glb"
  },
  phongnha: {
    id: "phongnha",
    name: "Động Phong Nha",
    category: "scenic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 1200,
    tileHp: 400,
    coreHp: 1600,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    troopBonus: 6,
    buffDescription: "Mạng lưới địa đạo: Khám phá mạch tri thức ngầm, giảm 20% chi phí mở rộng vùng tri thức, +6 Điểm/giây",
    gameplayRole: "hidden_corridor",
    modelFileName: "phongnha.glb"
  },
  nuibaden: {
    id: "nuibaden",
    name: "Núi Bà Đen",
    category: "scenic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 1800,
    tileHp: 500,
    coreHp: 2200,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 6,
    buffDescription: "Đỉnh cao chiến lược Đông Nam Bộ: Tăng tốc độ mở rộng tri thức thêm 25%, +6 Điểm/giây",
    gameplayRole: "strategic_overlook",
    modelFileName: "nuibaden.glb"
  },

  // === 5 CÔNG TRÌNH BIỂU TƯỢNG (ICONIC) ===
  thanglong: {
    id: "thanglong",
    name: "Hoàng thành Thăng Long",
    category: "iconic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 2600,
    tileHp: 650,
    coreHp: 3200,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 10,
    buffDescription: "Kinh đô ngàn năm văn hiến: Đỉnh cao học thuật, giảm 25% chi phí mở rộng vùng tri thức toàn bản đồ, +10 Điểm/giây",
    gameplayRole: "capitol",
    modelFileName: "thanglong.glb"
  },
  canghaiphong: {
    id: "canghaiphong",
    name: "Cảng Hải Phòng",
    category: "iconic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 1600,
    tileHp: 480,
    coreHp: 2000,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 8,
    buffDescription: "Đầu mối giao lưu tri thức biển: Tiếp tế tri thức thần tốc, +8 Điểm/giây",
    gameplayRole: "logistics_port",
    modelFileName: "canghaiphong.glb"
  },
  kinhthanhhue: {
    id: "kinhthanhhue",
    name: "Kinh Thành Huế",
    category: "iconic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 2000,
    tileHp: 550,
    coreHp: 2400,
    defenseTier: 3,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 7,
    buffDescription: "Cố đô văn hiến: Tăng 30% độ bền tri thức cho toàn bộ vùng tiếp giáp lân cận, +7 Điểm/giây",
    gameplayRole: "citadel",
    modelFileName: "kinhthanhhue.glb"
  },
  bitexco: {
    id: "bitexco",
    name: "Toà nhà Bitexco",
    category: "iconic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 2200,
    tileHp: 500,
    coreHp: 2200,
    defenseTier: 2,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 12,
    buffDescription: "Biểu tượng năng động hiện đại: Tạo nguồn năng lượng tri thức dồi dào, +12 Điểm/giây cho trường kiểm soát",
    gameplayRole: "economic_hub",
    modelFileName: "bitexco.glb"
  },
  cairang: {
    id: "cairang",
    name: "Chợ nổi Cái Răng",
    category: "iconic",
    footprint: { width: 50, height: 50 },
    requiredTroops: 1400,
    tileHp: 420,
    coreHp: 1600,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    troopBonus: 8,
    buffDescription: "Giao thoa văn hóa sông nước: Gia tăng lưu lượng lan tỏa tri thức, +8 Điểm/giây",
    gameplayRole: "trade_market",
    modelFileName: "cairang.glb"
  }
};

export const LANDMARK_IDS = Object.keys(LANDMARK_ROSTER);

