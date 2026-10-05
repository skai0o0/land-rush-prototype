export interface StudentProfile {
  /** Production gameplay key. Legacy dev profiles continue to use normalized email. */
  gameUserId?: string;
  portalUserId?: string;
  campaignId?: string;
  /** MSSV metadata in production; legacy dev identifier for prototype clients. */
  studentId: string;
  email: string;
  schoolId: string;
  pointsSpent: number;
  gamePointsEarned: number;
  crystals: number;
  aspireKeys: number;
  nitroKeys: number;
  predatorKeys: number;
  guessCooldowns: Map<string, number>;
  unistopCooldowns: Map<string, number>;
  gifts: any[];
  lastSeenAt: number;
}

export class StudentProfileEntity implements StudentProfile {
  public gameUserId?: string;
  public portalUserId?: string;
  public campaignId?: string;
  public studentId: string;
  public email: string;
  public schoolId: string;
  public pointsSpent: number = 0;
  public gamePointsEarned: number = 0;
  public crystals: number = 0;
  public aspireKeys: number = 0;
  public nitroKeys: number = 0;
  public predatorKeys: number = 0;
  public guessCooldowns: Map<string, number> = new Map();
  public unistopCooldowns: Map<string, number> = new Map();
  public gifts: any[] = [];
  public lastSeenAt: number = Date.now();

  constructor(studentId: string, email: string, schoolId: string = "hcmut") {
    this.studentId = studentId.toLowerCase().trim();
    this.email = email.trim();
    this.schoolId = schoolId;
    this.lastSeenAt = Date.now();
  }
}
