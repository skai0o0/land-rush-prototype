import { StudentProfile, StudentProfileEntity } from "./StudentProfile";
import { RunningPointsProvider } from "./RunningPointsProvider";
import { getSchoolIdFromEmail } from "../../../shared/constants/schools";

export class ProfileManager {
  private static instance: ProfileManager;
  private profiles: Map<string, StudentProfile> = new Map();
  private pointsProvider: RunningPointsProvider;

  constructor(pointsProvider?: RunningPointsProvider) {
    this.pointsProvider = pointsProvider || RunningPointsProvider.getInstance();
  }

  public static getInstance(): ProfileManager {
    if (!ProfileManager.instance) {
      ProfileManager.instance = new ProfileManager();
    }
    return ProfileManager.instance;
  }

  /**
   * Lấy hoặc khởi tạo Profile của sinh viên.
   * KHÔNG BAO GIỜ bị xoá khi sinh viên ngắt kết nối.
   */
  public getOrCreateProfile(studentId: string, schoolId?: string): StudentProfile {
    const cleanId = (studentId || "guest").toLowerCase().trim();
    let profile = this.profiles.get(cleanId);
    if (!profile) {
      const resolvedSchool = schoolId || getSchoolIdFromEmail(cleanId) || "hcmut";
      profile = new StudentProfileEntity(cleanId, cleanId, resolvedSchool);
      this.profiles.set(cleanId, profile);
    } else {
      profile.lastSeenAt = Date.now();
      if (schoolId && (!profile.schoolId || profile.schoolId === "hcmut")) {
        profile.schoolId = schoolId;
      }
    }
    return profile;
  }

  public getProfile(studentId: string): StudentProfile | undefined {
    const cleanId = (studentId || "").toLowerCase().trim();
    return this.profiles.get(cleanId);
  }

  /**
   * Tính số điểm khả dụng của sinh viên:
   * availablePoints = totalPoints (từ RunningPointsProvider) - pointsSpent
   */
  public getAvailablePoints(studentId: string): number {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    const totalPoints = this.pointsProvider.getTotalPoints(cleanId);
    return Math.max(0, totalPoints - profile.pointsSpent);
  }

  /**
   * Trừ điểm khi sinh viên thực hiện hành động (lan toả tri thức, ôn bài, đổi điểm).
   */
  public deductPoints(studentId: string, amount: number): boolean {
    if (amount <= 0) return true;
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    const available = this.getAvailablePoints(cleanId);
    if (available < amount) {
      return false;
    }
    profile.pointsSpent += amount;
    return true;
  }

  /**
   * Hoàn điểm hoặc nạp thêm điểm tiêu dùng
   */
  public refundPoints(studentId: string, amount: number): void {
    if (amount <= 0) return;
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.pointsSpent = Math.max(0, profile.pointsSpent - amount);
  }

  public addCrystals(studentId: string, amount: number): number {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.crystals = Math.max(0, (profile.crystals || 0) + amount);
    return profile.crystals;
  }

  public deductCrystals(studentId: string, amount: number): boolean {
    if (amount <= 0) return true;
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    if ((profile.crystals || 0) < amount) {
      return false;
    }
    profile.crystals -= amount;
    return true;
  }

  public addKeys(studentId: string, tier: "aspire" | "nitro" | "predator" | "silver" | "gold" | "platinum", count: number = 1): void {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    if (tier === "aspire" || tier === "silver") {
      profile.aspireKeys = (profile.aspireKeys || 0) + count;
    } else if (tier === "nitro" || tier === "gold") {
      profile.nitroKeys = (profile.nitroKeys || 0) + count;
    } else if (tier === "predator" || tier === "platinum") {
      profile.predatorKeys = (profile.predatorKeys || 0) + count;
    }
  }

  public deductKeys(studentId: string, tier: "aspire" | "nitro" | "predator" | "silver" | "gold" | "platinum", count: number = 1): boolean {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    if (tier === "aspire" || tier === "silver") {
      if ((profile.aspireKeys || 0) < count) return false;
      profile.aspireKeys -= count;
      return true;
    } else if (tier === "nitro" || tier === "gold") {
      if ((profile.nitroKeys || 0) < count) return false;
      profile.nitroKeys -= count;
      return true;
    } else if (tier === "predator" || tier === "platinum") {
      if ((profile.predatorKeys || 0) < count) return false;
      profile.predatorKeys -= count;
      return true;
    }
    return false;
  }

  public getUniStopCooldown(studentId: string, stopId: string): number {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    return profile.unistopCooldowns.get(stopId) || 0;
  }

  public setUniStopCooldown(studentId: string, stopId: string, untilMs: number): void {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.unistopCooldowns.set(stopId, untilMs);
  }

  public getGuessCooldown(studentId: string, landmarkKey: string): number {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    return profile.guessCooldowns.get(landmarkKey) || 0;
  }

  public setGuessCooldown(studentId: string, landmarkKey: string, untilMs: number): void {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.guessCooldowns.set(landmarkKey, untilMs);
  }

  public addGift(studentId: string, gift: any): void {
    const cleanId = (studentId || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.gifts.push({
      ...gift,
      wonAt: Date.now()
    });
  }

  public clearAll(): void {
    this.profiles.clear();
  }
}
