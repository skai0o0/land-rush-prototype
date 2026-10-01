export interface LandmarkConfig {
  id: string;
  name: string;
  category: 'scenic' | 'iconic';
  footprint: { width: number; height: number }; // Đơn vị ô tiles (Scale ~14-18 ô)
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
    footprint: { width: 16, height: 16 },
    requiredTroops: 2500,
    tileHp: 600,
    coreHp: 3000,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 8,
    buffDescription: "Nóc nhà Đông Dương: Tầm nhìn bao quát, tăng 35% kháng lực phòng thủ, +8 quân/giây",
    gameplayRole: "highland_fortress",
    modelFileName: "fansipan.glb"
  },
  halong: {
    id: "halong",
    name: "Vịnh Hạ Long",
    category: "scenic",
    footprint: { width: 18, height: 16 },
    requiredTroops: 2000,
    tileHp: 550,
    coreHp: 2600,
    defenseTier: 3,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 7,
    buffDescription: "Vịnh ngàn đảo: Chiến luỹ tự nhiên chia cắt, giảm 30% hao quân ven biển, +7 quân/giây",
    gameplayRole: "natural_barrier",
    modelFileName: "halong.glb"
  },
  nguhanhson: {
    id: "nguhanhson",
    name: "Núi Ngũ Hành Sơn",
    category: "scenic",
    footprint: { width: 14, height: 12 },
    requiredTroops: 1400,
    tileHp: 450,
    coreHp: 1800,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 4,
    troopBonus: 6,
    buffDescription: "Ngũ Sơn Linh Khí: Hồi phục sinh lực tự động +6 HP/s cho cứ điểm, +6 quân/giây",
    gameplayRole: "healing_sanctuary",
    modelFileName: "nguhanhson.glb"
  },
  phongnha: {
    id: "phongnha",
    name: "Động Phong Nha",
    category: "scenic",
    footprint: { width: 14, height: 10 },
    requiredTroops: 1200,
    tileHp: 400,
    coreHp: 1600,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    troopBonus: 6,
    buffDescription: "Mạng lưới địa đạo: Ẩn mật chuyển quân, giảm 20% chi phí viễn chinh mở rộng, +6 quân/giây",
    gameplayRole: "hidden_corridor",
    modelFileName: "phongnha.glb"
  },
  nuibaden: {
    id: "nuibaden",
    name: "Núi Bà Đen",
    category: "scenic",
    footprint: { width: 16, height: 14 },
    requiredTroops: 1800,
    tileHp: 500,
    coreHp: 2200,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 6,
    buffDescription: "Đỉnh cao chiến lược Đông Nam Bộ: Tăng tốc độ cơ động lãnh thổ thêm 25%, +6 quân/giây",
    gameplayRole: "strategic_overlook",
    modelFileName: "nuibaden.glb"
  },

  // === 5 CÔNG TRÌNH BIỂU TƯỢNG (ICONIC) ===
  thanglong: {
    id: "thanglong",
    name: "Hoàng thành Thăng Long",
    category: "iconic",
    footprint: { width: 18, height: 16 },
    requiredTroops: 2600,
    tileHp: 650,
    coreHp: 3200,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 10,
    buffDescription: "Đế đô tối cao: Giảm 25% chi phí chiếm đất toàn bản đồ, +10 quân/giây",
    gameplayRole: "capitol",
    modelFileName: "thanglong.glb"
  },
  canghaiphong: {
    id: "canghaiphong",
    name: "Cảng Hải Phòng",
    category: "iconic",
    footprint: { width: 16, height: 12 },
    requiredTroops: 1600,
    tileHp: 480,
    coreHp: 2000,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 8,
    buffDescription: "Đầu mối logistics biển: Tiếp tế khí tài thần tốc, +8 quân/giây",
    gameplayRole: "logistics_port",
    modelFileName: "canghaiphong.glb"
  },
  kinhthanhhue: {
    id: "kinhthanhhue",
    name: "Kinh Thành Huế",
    category: "iconic",
    footprint: { width: 16, height: 16 },
    requiredTroops: 2000,
    tileHp: 550,
    coreHp: 2400,
    defenseTier: 3,
    claimCost: 3,
    attackCost: 5,
    troopBonus: 7,
    buffDescription: "Thành trì kiên cố: Tăng 30% giáp hộ vệ cho toàn bộ ô phòng tuyến lân cận, +7 quân/giây",
    gameplayRole: "citadel",
    modelFileName: "kinhthanhhue.glb"
  },
  bitexco: {
    id: "bitexco",
    name: "Toà nhà Bitexco",
    category: "iconic",
    footprint: { width: 14, height: 14 },
    requiredTroops: 2200,
    tileHp: 500,
    coreHp: 2200,
    defenseTier: 2,
    claimCost: 4,
    attackCost: 6,
    troopBonus: 12,
    buffDescription: "Trung tâm tài chính kinh tế: Tạo ngân sách dồi dào, +12 quân/giây cho phe kiểm soát",
    gameplayRole: "economic_hub",
    modelFileName: "bitexco.glb"
  },
  cairang: {
    id: "cairang",
    name: "Chợ nổi Cái Răng",
    category: "iconic",
    footprint: { width: 14, height: 12 },
    requiredTroops: 1400,
    tileHp: 420,
    coreHp: 1600,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    troopBonus: 8,
    buffDescription: "Đầu mối giao thương đường thuỷ: Gia tăng lưu lượng chiêu mộ quân, +8 quân/giây",
    gameplayRole: "trade_market",
    modelFileName: "cairang.glb"
  }
};

export const LANDMARK_IDS = Object.keys(LANDMARK_ROSTER);

