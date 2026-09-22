export interface LandmarkConfig {
  id: string;
  name: string;
  footprint: { width: number; height: number }; // Đơn vị ô tiles (Scale up to lớn ~12-18 ô)
  requiredTroops: number;
  buffDescription: string;
  gameplayRole: string;
  modelFileName?: string;
  tileHp: number;
  coreHp: number;
  defenseTier: number;
  claimCost: number;
  attackCost: number;
}

export const LANDMARK_ROSTER: Record<string, LandmarkConfig> = {
  landmark_ho_da: {
    id: "landmark_ho_da",
    name: "Cụm Hồ Đá Làng Đại học",
    footprint: { width: 18, height: 16 },
    requiredTroops: 1600,
    tileHp: 500,
    coreHp: 2000,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    buffDescription: "Vật cản chia cắt hiểm trở, giảm 30% hao quân ven hồ, +5 quân/giây",
    gameplayRole: "chokepoint",
    modelFileName: "ho_da.glb"
  },
  landmark_doc_tinh: {
    id: "landmark_doc_tinh",
    name: "Dốc tình Nhân Văn",
    footprint: { width: 14, height: 8 },
    requiredTroops: 1000,
    tileHp: 400,
    coreHp: 1400,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    buffDescription: "Hành lang chiến lược: Tăng 25% tốc độ mở rộng quân, +6 quân/giây",
    gameplayRole: "speed_corridor",
    modelFileName: "doc_tinh.glb"
  },
  landmark_duong_danh_nhan: {
    id: "landmark_duong_danh_nhan",
    name: "Đường Danh nhân",
    footprint: { width: 16, height: 6 },
    requiredTroops: 1200,
    tileHp: 450,
    coreHp: 1500,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    buffDescription: "Đại lộ danh vọng: Tăng 25% uy thế lãnh thổ, +6 quân/giây",
    gameplayRole: "morale_aura",
    modelFileName: "duong_danh_nhan.glb"
  },
  landmark_nha_dieu_hanh: {
    id: "landmark_nha_dieu_hanh",
    name: "Khu Nhà Điều hành ĐHQG",
    footprint: { width: 16, height: 14 },
    requiredTroops: 2200,
    tileHp: 550,
    coreHp: 2800,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    buffDescription: "Đại bản doanh tối cao: Giảm 25% chi phí chiếm đất toàn map, +8 quân/giây",
    gameplayRole: "capitol",
    modelFileName: "nha_dieu_hanh.glb"
  },
  landmark_nvhsv: {
    id: "landmark_nvhsv",
    name: "\"Lâu đài trắng\" Nhà Văn hóa Sinh viên",
    footprint: { width: 16, height: 16 },
    requiredTroops: 1800,
    tileHp: 500,
    coreHp: 2200,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 5,
    buffDescription: "Trung tâm điều phối văn hóa: Tự động sửa chữa hồi phục +5 HP/s cho mọi ô đất",
    gameplayRole: "recovery_hub",
    modelFileName: "nvh_sinh_vien.glb"
  },
  landmark_cho_dem: {
    id: "landmark_cho_dem",
    name: "Chợ đêm Làng Đại học",
    footprint: { width: 14, height: 12 },
    requiredTroops: 1200,
    tileHp: 400,
    coreHp: 1600,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 4,
    buffDescription: "Cứ điểm kinh tế sầm uất: Tự động tiếp tế +12 quân/giây cho phe chiếm giữ",
    gameplayRole: "gold_mine",
    modelFileName: "cho_dem.glb"
  },
  landmark_ktx_khu_a: {
    id: "landmark_ktx_khu_a",
    name: "Ký túc xá Khu A",
    footprint: { width: 14, height: 12 },
    requiredTroops: 1400,
    tileHp: 450,
    coreHp: 1800,
    defenseTier: 2,
    claimCost: 3,
    attackCost: 4,
    buffDescription: "Doanh trại quân sự: Tiếp vận tân binh liên tục +6 quân/giây",
    gameplayRole: "barracks",
    modelFileName: "ktx_khu_a.glb"
  },
  landmark_ktx_khu_b: {
    id: "landmark_ktx_khu_b",
    name: "Ký túc xá Khu B",
    footprint: { width: 18, height: 16 },
    requiredTroops: 2500,
    tileHp: 600,
    coreHp: 3000,
    defenseTier: 3,
    claimCost: 4,
    attackCost: 6,
    buffDescription: "Đại đô thị pháo đài: Hồi phục +10 HP/s cho các ô cứ điểm, x2 máu phòng thủ",
    gameplayRole: "mega_fortress",
    modelFileName: "ktx_khu_b.glb"
  },
  landmark_tram_xe_buyt: {
    id: "landmark_tram_xe_buyt",
    name: "Đầu mối Bến Xe buýt ĐHQG",
    footprint: { width: 14, height: 10 },
    requiredTroops: 1000,
    tileHp: 400,
    coreHp: 1400,
    defenseTier: 2,
    claimCost: 2,
    attackCost: 4,
    buffDescription: "Đầu mối giao thông huyết mạch: Tiếp tế thần tốc +6 quân/giây",
    gameplayRole: "teleport_gate",
    modelFileName: "tram_xe_buyt.glb"
  },
  landmark_cong_chinh: {
    id: "landmark_cong_chinh",
    name: "Nút giao Cổng chính ĐHQG",
    footprint: { width: 18, height: 12 },
    requiredTroops: 2000,
    tileHp: 550,
    coreHp: 2400,
    defenseTier: 3,
    claimCost: 3,
    attackCost: 5,
    buffDescription: "Chốt chặn phòng tuyến cửa ngõ: Tăng 35% kháng lực xâm lăng, +7 quân/giây",
    gameplayRole: "frontier_gate",
    modelFileName: "cong_chinh.glb"
  }
};

export const LANDMARK_IDS = Object.keys(LANDMARK_ROSTER);
