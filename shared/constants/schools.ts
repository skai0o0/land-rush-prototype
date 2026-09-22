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

// Map domain email .edu.vn của các trường ĐHQG-HCM (hỗ trợ đầy đủ alias)
export const EMAIL_DOMAIN_TO_SCHOOL: Record<string, string> = {
  // HCMUT / Bách Khoa
  "hcmut.edu.vn": "hcmut",
  "bku.edu.vn": "hcmut",
  "bk.edu.vn": "hcmut",
  "bachkhoa.edu.vn": "hcmut",
  // UIT / Công nghệ thông tin
  "uit.edu.vn": "uit",
  // UHS / Sức Khỏe - Y Dược
  "medvnu.edu.vn": "uhs",
  "uhs.edu.vn": "uhs",
  "med.vnu.edu.vn": "uhs",
  // HCMUS / Tự nhiên
  "hcmus.edu.vn": "hcmus",
  "khtn.edu.vn": "hcmus",
  // USSH / Nhân văn
  "hcmussh.edu.vn": "hcmussh",
  "ussh.edu.vn": "hcmussh",
  "ussh.vnu.edu.vn": "hcmussh",
  // UEL / Kinh tế - Luật
  "uel.edu.vn": "uel",
  // IU / Quốc tế
  "hcmiu.edu.vn": "iu",
  "iu.edu.vn": "iu"
};

export function getSchoolIdFromEmail(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.split("@");
  const domain = parts[parts.length - 1]?.trim().toLowerCase();
  return EMAIL_DOMAIN_TO_SCHOOL[domain] || null;
}

// 7 Tài khoản sinh viên đại diện phục vụ Dev Test & Demo
export const MOCK_STUDENT_ACCOUNTS = [
  { email: "sinhvien01@hcmut.edu.vn", schoolId: "hcmut", name: "SV Bách Khoa 01", defaultKm: 50 },
  { email: "sinhvien01@uit.edu.vn", schoolId: "uit", name: "SV CNTT 01", defaultKm: 45 },
  { email: "sinhvien01@medvnu.edu.vn", schoolId: "uhs", name: "SV Khoa Y - Sức Khỏe 01", defaultKm: 60 },
  { email: "sinhvien01@hcmus.edu.vn", schoolId: "hcmus", name: "SV KHTN 01", defaultKm: 55 },
  { email: "sinhvien01@hcmussh.edu.vn", schoolId: "hcmussh", name: "SV KHXH&NV 01", defaultKm: 40 },
  { email: "sinhvien01@uel.edu.vn", schoolId: "uel", name: "SV Kinh tế - Luật 01", defaultKm: 70 },
  { email: "sinhvien01@hcmiu.edu.vn", schoolId: "iu", name: "SV Quốc Tế 01", defaultKm: 65 }
] as const;
