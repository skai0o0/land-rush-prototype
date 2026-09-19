export interface SchoolConfig {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  accentHex: string;
  isDummy?: boolean;
}

export const SCHOOL_ROSTER: Record<string, SchoolConfig> = {
  hcmut: { id: "hcmut", name: "ĐH Bách Khoa", shortName: "HCMUT", colorHex: "#030391", accentHex: "#1488D8" },
  hcmus: { id: "hcmus", name: "ĐH Khoa học Tự nhiên", shortName: "HCMUS", colorHex: "#0054A6", accentHex: "#00B4D8" },
  hcmussh: { id: "hcmussh", name: "ĐH KHXH & Nhân văn", shortName: "USSH", colorHex: "#A6192E", accentHex: "#FDB813" },
  uit: { id: "uit", name: "ĐH Công nghệ Thông tin", shortName: "UIT", colorHex: "#0000FD", accentHex: "#2F6BFF" },
  uel: { id: "uel", name: "ĐH Kinh tế - Luật", shortName: "UEL", colorHex: "#0055A5", accentHex: "#DAA520" },
  iu: { id: "iu", name: "ĐH Quốc tế", shortName: "IU", colorHex: "#B83227", accentHex: "#009CD1" },
  uhs: { id: "uhs", name: "ĐH Khoa học Sức khỏe", shortName: "UHS", colorHex: "#008B8B", accentHex: "#4CBB17" },
  // 3 Trường Giả định (Dummy)
  ubb: { id: "ubb", name: "ĐH Công nghệ Sinh học & Môi trường", shortName: "VNU-UBB", colorHex: "#065F46", accentHex: "#10B981", isDummy: true },
  uflis: { id: "uflis", name: "ĐH Ngoại ngữ & Ngoại giao", shortName: "VNU-UFLIS", colorHex: "#1E40AF", accentHex: "#7C3AED", isDummy: true },
  ulpa: { id: "ulpa", name: "ĐH Luật & Quản trị Công", shortName: "VNU-ULPA", colorHex: "#18181B", accentHex: "#991B1B", isDummy: true }
};

export const SCHOOL_IDS = Object.keys(SCHOOL_ROSTER);

export function getSchoolColor(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.colorHex || "#888888";
}

export function getSchoolAccent(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.accentHex || "#ffffff";
}
