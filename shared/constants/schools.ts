export interface SchoolConfig {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  accentHex: string;
  isDummy?: boolean;
}

export const SCHOOL_ROSTER: Record<string, SchoolConfig> = {
  hcmut: { id: "hcmut", name: "ĐH Bách Khoa", shortName: "HCMUT", colorHex: "#0055a5", accentHex: "#1488D8" },
  hcmus: { id: "hcmus", name: "ĐH Khoa học Tự nhiên", shortName: "HCMUS", colorHex: "#004b87", accentHex: "#00B4D8" },
  hcmussh: { id: "hcmussh", name: "ĐH KHXH & Nhân văn", shortName: "USSH", colorHex: "#990000", accentHex: "#FDB813" },
  uit: { id: "uit", name: "ĐH Công nghệ Thông tin", shortName: "UIT", colorHex: "#005a9c", accentHex: "#f26522" },
  uel: { id: "uel", name: "ĐH Kinh tế - Luật", shortName: "UEL", colorHex: "#005696", accentHex: "#DAA520" },
  iu: { id: "iu", name: "ĐH Quốc tế", shortName: "IU", colorHex: "#002147", accentHex: "#f1a91e" },
  uhs: { id: "uhs", name: "ĐH Khoa học Sức khỏe", shortName: "UHS", colorHex: "#008b8b", accentHex: "#4CBB17" },
  // 3 Trường Giả định (Dummy)
  ubb: { id: "ubb", name: "ĐH Công nghệ Sinh học & Môi trường", shortName: "VNU-UBB", colorHex: "#008b8b", accentHex: "#10B981", isDummy: true },
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
