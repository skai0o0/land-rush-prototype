export interface LandmarkConfig {
  id: string;
  name: string;
  footprint: { width: number; height: number }; // Đơn vị ô tiles
  requiredTroops: number;
  buffDescription: string;
  gameplayRole: string;
  modelFileName?: string;
}

export const LANDMARK_ROSTER: Record<string, LandmarkConfig> = {
  landmark_ho_da: {
    id: "landmark_ho_da",
    name: "Cụm Hồ Đá Làng Đại học",
    footprint: { width: 7, height: 6 },
    requiredTroops: 1200,
    buffDescription: "Vật cản chia cắt chiến lược, giảm 30% hao quân ven hồ",
    gameplayRole: "chokepoint",
    modelFileName: "ho_da.glb"
  },
  landmark_doc_tinh: {
    id: "landmark_doc_tinh",
    name: "Dốc tình Nhân Văn",
    footprint: { width: 6, height: 3 },
    requiredTroops: 600,
    buffDescription: "Hành lang tăng 25% tốc độ mở rộng quân",
    gameplayRole: "speed_corridor",
    modelFileName: "doc_tinh.glb"
  },
  landmark_duong_danh_nhan: {
    id: "landmark_duong_danh_nhan",
    name: "Đường Danh nhân",
    footprint: { width: 6, height: 2 },
    requiredTroops: 800,
    buffDescription: "Tăng 20% điểm nghiên cứu và uy thế lãnh thổ",
    gameplayRole: "morale_aura",
    modelFileName: "duong_danh_nhan.glb"
  },
  landmark_nha_dieu_hanh: {
    id: "landmark_nha_dieu_hanh",
    name: "Khu Nhà Điều hành ĐHQG",
    footprint: { width: 6, height: 5 },
    requiredTroops: 2000,
    buffDescription: "Đại bản doanh tối cao, giảm 25% chi phí công thành toàn map",
    gameplayRole: "capitol",
    modelFileName: "nha_dieu_hanh.glb"
  },
  landmark_nvhsv: {
    id: "landmark_nvhsv",
    name: "\"Lâu đài trắng\" Nhà Văn hóa Sinh viên",
    footprint: { width: 8, height: 7 },
    requiredTroops: 1500,
    buffDescription: "Trạm điều phối văn hóa, giảm 20% quân khai hoang",
    gameplayRole: "recovery_hub",
    modelFileName: "nvh_sinh_vien.glb"
  },
  landmark_cho_dem: {
    id: "landmark_cho_dem",
    name: "Chợ đêm Làng Đại học",
    footprint: { width: 5, height: 4 },
    requiredTroops: 900,
    buffDescription: "Cứ điểm kinh tế, tự động sinh +10 quân/giây",
    gameplayRole: "gold_mine",
    modelFileName: "cho_dem.glb"
  },
  landmark_ktx_khu_a: {
    id: "landmark_ktx_khu_a",
    name: "Ký túc xá Khu A",
    footprint: { width: 7, height: 6 },
    requiredTroops: 1000,
    buffDescription: "Doanh trại quân sự, giảm 50% thời gian tuyển lính cơ bản",
    gameplayRole: "barracks",
    modelFileName: "ktx_khu_a.glb"
  },
  landmark_ktx_khu_b: {
    id: "landmark_ktx_khu_b",
    name: "Ký túc xá Khu B",
    footprint: { width: 9, height: 8 },
    requiredTroops: 2500,
    buffDescription: "Đại đô thị pháo đài, x2 máu phòng thủ cho các ô liền kề",
    gameplayRole: "mega_fortress",
    modelFileName: "ktx_khu_b.glb"
  },
  landmark_tram_xe_buyt: {
    id: "landmark_tram_xe_buyt",
    name: "Đầu mối Bến Xe buýt ĐHQG",
    footprint: { width: 5, height: 3 },
    requiredTroops: 700,
    buffDescription: "Cổng dịch chuyển tức thời quân lực giữa các bến đã chiếm",
    gameplayRole: "teleport_gate",
    modelFileName: "tram_xe_buyt.glb"
  },
  landmark_cong_chinh: {
    id: "landmark_cong_chinh",
    name: "Nút giao Cổng chính ĐHQG",
    footprint: { width: 8, height: 6 },
    requiredTroops: 1800,
    buffDescription: "Chốt chặn phòng tuyến cửa ngõ, tăng 35% kháng lực xâm lăng",
    gameplayRole: "frontier_gate",
    modelFileName: "cong_chinh.glb"
  }
};

export const LANDMARK_IDS = Object.keys(LANDMARK_ROSTER);
