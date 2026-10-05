export interface SchoolConfig {
  id: string;
  name: string;
  shortName: string;
  /** Dev fallback only; empty when baseline supplies no mapping. */
  emailDomain: string;
  colorHex: string;
  accentHex: string;
  isDummy?: boolean;
  knowledgeBit?: number;
  databaseId?: string;
  hq?: { x: number; y: number } | null;
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
,
  huce: { id: "huce", name: "Đại học Xây dựng Hà Nội", shortName: "HUCE", emailDomain: "", colorHex: "#E7C547", accentHex: "#FFF0A0", hq: null },
  ntu: { id: "ntu", name: "Đại học Nha Trang", shortName: "NTU", emailDomain: "", colorHex: "#00B8D9", accentHex: "#80FFFF", hq: null },
  hcmiu: { id: "hcmiu", name: "Đại học Quốc tế - ĐHQG-HCM", shortName: "HCMIU", emailDomain: "", colorHex: "#E85D9E", accentHex: "#FFB8DD", hq: null }
};

export const SCHOOL_IDS = Object.keys(SCHOOL_ROSTER);
SCHOOL_IDS.forEach((id, bit) => SCHOOL_ROSTER[id].knowledgeBit = bit);
// Compatibility singleton: only one campaign registry may be active per process.
// Rooms acquire leases before initializing. Other campaigns need separate processes.
let activeRegistry: { campaignId: string; fingerprint: string; leases: number; previous: SchoolConfig[] } | undefined;
const fingerprintOf = (schools: SchoolConfig[]) => JSON.stringify([...schools].sort((a,b)=>a.id.localeCompare(b.id)));
export function acquireSchoolRegistry(campaignId: string, schools: SchoolConfig[]): () => void {
  const fingerprint = fingerprintOf(schools);
  if (activeRegistry) {
    if (activeRegistry.campaignId !== campaignId || activeRegistry.fingerprint !== fingerprint)
      throw new Error('One active campaign registry per process');
    activeRegistry.leases++;
  } else {
    const previous = structuredClone(Object.values(SCHOOL_ROSTER));
    configureSchoolRegistry(schools);
    activeRegistry = { campaignId, fingerprint, leases: 1, previous };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--activeRegistry!.leases === 0) {
      const previous = activeRegistry!.previous;
      activeRegistry = undefined;
      configureSchoolRegistry(previous);
    }
  };
}
export function configureSchoolRegistry(schools: SchoolConfig[]) {
  if (activeRegistry) throw new Error('Cannot mutate an active campaign registry');
  if (!schools.length || schools.length > 16) throw new Error("Invalid campaign roster");
  const bits = new Set<number>(), ids = new Set<string>();
  for (const s of schools) {
    if (!s.id || ids.has(s.id) || !Number.isInteger(s.knowledgeBit) || s.knowledgeBit! < 0 || s.knowledgeBit! > 15 || bits.has(s.knowledgeBit!)) throw new Error("Invalid school slots");
    bits.add(s.knowledgeBit!); ids.add(s.id);
  }
  for (const id of Object.keys(SCHOOL_ROSTER)) delete SCHOOL_ROSTER[id];
  SCHOOL_IDS.splice(0, SCHOOL_IDS.length, ...[...schools].sort((a,b)=>a.knowledgeBit!-b.knowledgeBit!).map(s=>s.id));
  for (const s of schools) SCHOOL_ROSTER[s.id] = structuredClone(s);
}
export function getSchoolBit(id: string): number {
  const bit = SCHOOL_ROSTER[id]?.knowledgeBit;
  if (bit === undefined) throw new Error("Unknown campaign school: " + id);
  return bit;
}

export function getSchoolColor(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.colorHex || "#888888";
}

export function getSchoolAccent(schoolId: string): string {
  return SCHOOL_ROSTER[schoolId]?.accentHex || "#ffffff";
}

// Dev-only email aliases (hỗ trợ đầy đủ alias)
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

// Tài khoản sinh viên đại diện phục vụ Dev Test & Demo
export const MOCK_STUDENT_ACCOUNTS = [
  { email: "sinhvien01@hcmut.edu.vn", schoolId: "hcmut", name: "SV Bách Khoa 01", defaultKm: 50 },
  { email: "sinhvien01@ou.edu.vn", schoolId: "hcmcou", name: "SV Đại học Mở 01", defaultKm: 45 },
  { email: "sinhvien01@dtu.edu.vn", schoolId: "dtu", name: "SV Duy Tân 01", defaultKm: 60 },
  { email: "sinhvien01@dhhp.edu.vn", schoolId: "dhhp", name: "SV ĐH Hải Phòng 01", defaultKm: 55 },
  { email: "sinhvien01@sinhvien.hoasen.edu.vn", schoolId: "hsu", name: "SV Hoa Sen 01", defaultKm: 40 },
  ...["huce", "ntu", "hcmiu"].map(id => ({ email: "sinhvien01@" + id + ".example.invalid", schoolId: id, name: "SV " + SCHOOL_ROSTER[id].shortName, defaultKm: 40 }))
] as const;

export const MOCK_ACCOUNTS = MOCK_STUDENT_ACCOUNTS;

