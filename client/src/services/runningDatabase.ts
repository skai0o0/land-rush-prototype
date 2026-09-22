// client/src/services/runningDatabase.ts
import { MOCK_STUDENT_ACCOUNTS, getSchoolIdFromEmail } from "../../../shared/constants/schools";

export interface StudentRunningRecord {
  id: string;
  email: string;
  name: string;
  schoolId: string;
  km: number;
  pointsSpent: number;
  lastUpdated?: number;
}

const STORAGE_KEY = "landrush_running_database";

export class RunningDatabase {
  private static students: StudentRunningRecord[] = [];
  private static listeners: Array<(students: StudentRunningRecord[]) => void> = [];
  private static initialized = false;

  private static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.students = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn("[RunningDatabase] Failed to read from localStorage:", e);
    }

    // Default mock records from the 7 VNU schools
    this.resetToDefaults();
  }

  public static resetToDefaults(): void {
    this.students = MOCK_STUDENT_ACCOUNTS.map((acc, idx) => ({
      id: `stu_${acc.schoolId}_${idx + 1}`,
      email: acc.email,
      name: acc.name,
      schoolId: acc.schoolId,
      km: acc.defaultKm,
      pointsSpent: 0,
      lastUpdated: Date.now()
    }));
    this.save();
  }

  private static save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.students));
    } catch (e) {
      console.error("[RunningDatabase] Failed to save to localStorage:", e);
    }
    this.notify();
  }

  private static notify(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.students]);
      } catch (e) {
        console.error("[RunningDatabase] Listener error:", e);
      }
    }
  }

  public static subscribe(listener: (students: StudentRunningRecord[]) => void): () => void {
    this.init();
    this.listeners.push(listener);
    listener([...this.students]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public static getAll(): StudentRunningRecord[] {
    this.init();
    return [...this.students];
  }

  public static getByEmail(email: string): StudentRunningRecord | null {
    this.init();
    const clean = email.trim().toLowerCase();
    const student = this.students.find(s => s.email.toLowerCase() === clean);
    return student ? { ...student } : null;
  }

  public static getOrCreate(email: string, defaultKm = 50, name?: string): StudentRunningRecord {
    this.init();
    const clean = email.trim().toLowerCase();
    let student = this.students.find(s => s.email.toLowerCase() === clean);
    if (!student) {
      const schoolId = getSchoolIdFromEmail(clean) || "hcmut";
      student = {
        id: `stu_${Date.now()}`,
        email: clean,
        name: name || `Sinh viên ${clean.split("@")[0]}`,
        schoolId,
        km: defaultKm,
        pointsSpent: 0,
        lastUpdated: Date.now()
      };
      this.students.push(student);
      this.save();
    }
    return { ...student };
  }

  public static getStudentBalance(email: string): number {
    const student = this.getByEmail(email);
    if (!student) return 0;
    return Math.max(0, Math.round(student.km) - (student.pointsSpent || 0));
  }

  public static updateKm(email: string, km: number): StudentRunningRecord | null {
    this.init();
    const clean = email.trim().toLowerCase();
    const student = this.students.find(s => s.email.toLowerCase() === clean);
    if (!student) return null;

    student.km = Math.max(0, parseFloat(km.toFixed(1)));
    student.lastUpdated = Date.now();
    this.save();
    return { ...student };
  }

  public static addKm(email: string, addedKm: number): StudentRunningRecord | null {
    this.init();
    const clean = email.trim().toLowerCase();
    const student = this.students.find(s => s.email.toLowerCase() === clean);
    if (!student) return null;

    student.km = Math.max(0, parseFloat((student.km + addedKm).toFixed(1)));
    student.lastUpdated = Date.now();
    this.save();
    return { ...student };
  }

  public static deductPoints(email: string, points: number): boolean {
    this.init();
    const clean = email.trim().toLowerCase();
    const student = this.students.find(s => s.email.toLowerCase() === clean);
    if (!student) return false;

    student.pointsSpent = (student.pointsSpent || 0) + points;
    student.lastUpdated = Date.now();
    this.save();
    return true;
  }

  public static addStudent(email: string, name: string, km: number): StudentRunningRecord {
    this.init();
    const clean = email.trim().toLowerCase();
    const existing = this.students.find(s => s.email.toLowerCase() === clean);
    if (existing) {
      existing.name = name;
      existing.km = km;
      existing.lastUpdated = Date.now();
      this.save();
      return { ...existing };
    }

    const schoolId = getSchoolIdFromEmail(clean) || "hcmut";
    const newStudent: StudentRunningRecord = {
      id: `stu_${Date.now()}`,
      email: clean,
      name,
      schoolId,
      km: Math.max(0, parseFloat(km.toFixed(1))),
      pointsSpent: 0,
      lastUpdated: Date.now()
    };
    this.students.push(newStudent);
    this.save();
    return { ...newStudent };
  }

  public static deleteStudent(email: string): boolean {
    this.init();
    const clean = email.trim().toLowerCase();
    const prevLen = this.students.length;
    this.students = this.students.filter(s => s.email.toLowerCase() !== clean);
    if (this.students.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }
}
