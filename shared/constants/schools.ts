export interface SchoolConfig {
  id: string;
  name: string;
  shortName: string;
  emailDomain: string;
  colorHex: string;
  accentHex: string;
  isDummy?: boolean;
}

export const SCHOOL_ROSTER: Record<string, SchoolConfig> = {
  hcmut: {
    id: "hcmut",
    name: "Trường Đại học Bách khoa – ĐHQG TP.HCM",
    shortName: "HCMUT",
    emailDomain: "hcmut.edu.vn",
    colorHex: "#0062FF", // Predator Cyber Blue
    accentHex: "#00E5FF" // Neon Cyan
  },
  hcmcou: {
    id: "hcmcou",
    name: "Trường Đại học Mở TP.HCM",
    shortName: "HCMCOU",
    emailDomain: "ou.edu.vn",
    colorHex: "#FF8C00", // Predator Tactical Amber
    accentHex: "#FFD700" // Tactical Gold Yellow
  },
  dtu: {
    id: "dtu",
    name: "Đại học Duy Tân",
    shortName: "DTU",
    emailDomain: "dtu.edu.vn",
    colorHex: "#E60026", // Predator Crimson Strike
    accentHex: "#FF4D6D" // Vivid Neon Coral
  },
  dhhp: {
    id: "dhhp",
    name: "Trường Đại học Hải Phòng",
    shortName: "DHHP",
    emailDomain: "dhhp.edu.vn",
    colorHex: "#00A86B", // Predator Bio Emerald
    accentHex: "#00FF9D" // Neon Green Mint
  },
  hsu: {
    id: "hsu",
    name: "Trường Đại học Hoa Sen",
    shortName: "HSU",
    emailDomain: "sinhvien.hoasen.edu.vn",
    colorHex: "#7928CA", // Predator Cyber Violet
    accentHex: "#FF0080" // Neon Magenta Pink
  }
};

export const SCHOOL_IDS = Object.keys(SCHOOL_ROSTER);

export function getSchoolColor(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.colorHex || "#888888";
}

export function getSchoolAccent(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.accentHex || "#ffffff";
}

// Map domain email của 5 trường (hỗ trợ đầy đủ alias)
export const EMAIL_DOMAIN_TO_SCHOOL: Record<string, string> = {
  // HCMUT / Bách Khoa
  "hcmut.edu.vn": "hcmut",
  "bku.edu.vn": "hcmut",
  "bk.edu.vn": "hcmut",
  "bachkhoa.edu.vn": "hcmut",

  // HCMCOU / Đại học Mở TP.HCM
  "ou.edu.vn": "hcmcou",
  "hcmcou.edu.vn": "hcmcou",

  // DTU / Duy Tân
  "dtu.edu.vn": "dtu",
  "duytan.edu.vn": "dtu",

  // DHHP / Đại học Hải Phòng
  "dhhp.edu.vn": "dhhp",
  "haiphong.edu.vn": "dhhp",

  // HSU / Đại học Hoa Sen
  "sinhvien.hoasen.edu.vn": "hsu",
  "hoasen.edu.vn": "hsu"
};

export function getSchoolIdFromEmail(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.split("@");
  const domain = parts[parts.length - 1]?.trim().toLowerCase();
  return EMAIL_DOMAIN_TO_SCHOOL[domain] || null;
}

// 5 Tài khoản sinh viên đại diện phục vụ Dev Test & Demo
export const MOCK_STUDENT_ACCOUNTS = [
  { email: "sinhvien01@hcmut.edu.vn", schoolId: "hcmut", name: "SV Bách Khoa 01", defaultKm: 50 },
  { email: "sinhvien01@ou.edu.vn", schoolId: "hcmcou", name: "SV Đại học Mở 01", defaultKm: 45 },
  { email: "sinhvien01@dtu.edu.vn", schoolId: "dtu", name: "SV Duy Tân 01", defaultKm: 60 },
  { email: "sinhvien01@dhhp.edu.vn", schoolId: "dhhp", name: "SV ĐH Hải Phòng 01", defaultKm: 55 },
  { email: "sinhvien01@sinhvien.hoasen.edu.vn", schoolId: "hsu", name: "SV Hoa Sen 01", defaultKm: 40 }
] as const;

export const MOCK_ACCOUNTS = MOCK_STUDENT_ACCOUNTS;

