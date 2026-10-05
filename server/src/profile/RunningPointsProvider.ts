import { MOCK_STUDENT_ACCOUNTS, getSchoolIdFromEmail } from "../../../shared/constants/schools";

export interface StudentRunningRecord {
  studentId: string;
  email: string;
  name: string;
  schoolId: string;
  km: number;
  totalPoints: number;
  lastUpdated: number;
}

export class RunningPointsProvider {
  private static instance: RunningPointsProvider;
  private records: Map<string, StudentRunningRecord> = new Map();

  constructor() {
    this.seedDefaults();
  }

  public static getInstance(): RunningPointsProvider {
    if (!RunningPointsProvider.instance) {
      RunningPointsProvider.instance = new RunningPointsProvider();
    }
    return RunningPointsProvider.instance;
  }

  private seedDefaults(): void {
    for (const acc of MOCK_STUDENT_ACCOUNTS) {
      const studentId = acc.email.toLowerCase().trim();
      const km = acc.defaultKm || 50;
      this.records.set(studentId, {
        studentId,
        email: acc.email,
        name: acc.name,
        schoolId: acc.schoolId,
        km,
        totalPoints: Math.round(km * 10),
        lastUpdated: Date.now()
      });
    }
  }

  /**
   * Tra cứu tổng điểm chạy bộ tích luỹ của sinh viên.
   * Quy đổi: 1 km = 10 điểm (ví dụ 50 km = 500 điểm).
   * Mặc định fallback 100 điểm nếu là tài khoản sinh viên mới chưa có lịch sử.
   */
  public getTotalPoints(studentId: string): number {
    const cleanId = (studentId || "").toLowerCase().trim();
    const record = this.records.get(cleanId);
    if (record) {
      return record.totalPoints;
    }
    return 100; // Fallback 100 điểm cho sinh viên mới
  }

  public getRecord(studentId: string): StudentRunningRecord | undefined {
    const cleanId = (studentId || "").toLowerCase().trim();
    return this.records.get(cleanId);
  }

  public setKm(studentId: string, km: number, name?: string, schoolId?: string): StudentRunningRecord {
    const cleanId = (studentId || "").toLowerCase().trim();
    const existing = this.records.get(cleanId);
    const resolvedSchool = schoolId || (existing ? existing.schoolId : (getSchoolIdFromEmail(cleanId) || "hcmut"));
    const resolvedName = name || (existing ? existing.name : cleanId.split("@")[0]);
    const validKm = Math.max(0, km);
    const totalPoints = Math.round(validKm * 10);

    const record: StudentRunningRecord = {
      studentId: cleanId,
      email: cleanId,
      name: resolvedName,
      schoolId: resolvedSchool,
      km: validKm,
      totalPoints,
      lastUpdated: Date.now()
    };
    this.records.set(cleanId, record);
    return record;
  }

  public addKm(studentId: string, addedKm: number): StudentRunningRecord {
    const cleanId = (studentId || "").toLowerCase().trim();
    const existing = this.records.get(cleanId);
    const currentKm = existing ? existing.km : 10;
    return this.setKm(cleanId, currentKm + addedKm);
  }

  public setTotalPoints(studentId: string, points: number): StudentRunningRecord {
    const cleanId = (studentId || "").toLowerCase().trim();
    const validPoints = Math.max(0, points);
    const km = Math.round(validPoints / 10);
    return this.setKm(cleanId, km);
  }
}
