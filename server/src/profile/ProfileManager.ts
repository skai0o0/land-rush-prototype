import { StudentProfile, StudentProfileEntity } from "./StudentProfile";
import { RunningPointsProvider } from "./RunningPointsProvider";
import { getSchoolIdFromEmail } from "../../../shared/constants/schools";

/** All lookup/mutation arguments are gameplay keys: gameUserId in production, normalized email in legacy dev mode. */
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
  public getOrCreateProfile(profileKey: string, schoolId?: string): StudentProfile {
    const cleanId = (profileKey || "guest").toLowerCase().trim();
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

  public getProfile(profileKey: string): StudentProfile | undefined {
    const cleanId = (profileKey || "").toLowerCase().trim();
    return this.profiles.get(cleanId);
  }

  /**
   * Tính số điểm khả dụng của sinh viên:
   * availablePoints = runningPoints + gamePointsEarned - pointsSpent
   */
  public getAvailablePoints(profileKey: string): number {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    const totalPoints = this.pointsProvider.getTotalPoints(cleanId);
    return Math.max(0, totalPoints + (profile.gamePointsEarned || 0) - profile.pointsSpent);
  }

  /** Exact game rewards; never modify running distance or weekly eligibility. */
  public addGamePoints(profileKey: string, amount: number): number {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid game reward");
    const profile = this.getOrCreateProfile(profileKey);
    profile.gamePointsEarned = (profile.gamePointsEarned || 0) + amount;
    return this.getAvailablePoints(profileKey);
  }

  /**
   * Trừ điểm khi sinh viên thực hiện hành động (lan toả tri thức, ôn bài, đổi điểm).
   */
  public deductPoints(profileKey: string, amount: number): boolean {
    if (amount <= 0) return true;
    const cleanId = (profileKey || "").toLowerCase().trim();
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
  public refundPoints(profileKey: string, amount: number): void {
    if (amount <= 0) return;
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.pointsSpent = Math.max(0, profile.pointsSpent - amount);
  }

  public addCrystals(profileKey: string, amount: number): number {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.crystals = Math.max(0, (profile.crystals || 0) + amount);
    return profile.crystals;
  }

  public deductCrystals(profileKey: string, amount: number): boolean {
    if (amount <= 0) return true;
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    if ((profile.crystals || 0) < amount) {
      return false;
    }
    profile.crystals -= amount;
    return true;
  }

  public addKeys(profileKey: string, tier: "aspire" | "nitro" | "predator" | "silver" | "gold" | "platinum", count: number = 1): void {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    if (tier === "aspire" || tier === "silver") {
      profile.aspireKeys = (profile.aspireKeys || 0) + count;
    } else if (tier === "nitro" || tier === "gold") {
      profile.nitroKeys = (profile.nitroKeys || 0) + count;
    } else if (tier === "predator" || tier === "platinum") {
      profile.predatorKeys = (profile.predatorKeys || 0) + count;
    }
  }

  public deductKeys(profileKey: string, tier: "aspire" | "nitro" | "predator" | "silver" | "gold" | "platinum", count: number = 1): boolean {
    const cleanId = (profileKey || "").toLowerCase().trim();
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

  public getUniStopCooldown(profileKey: string, stopId: string): number {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    return profile.unistopCooldowns.get(stopId) || 0;
  }

  public setUniStopCooldown(profileKey: string, stopId: string, untilMs: number): void {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.unistopCooldowns.set(stopId, untilMs);
  }

  public getGuessCooldown(profileKey: string, landmarkKey: string): number {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    return profile.guessCooldowns.get(landmarkKey) || 0;
  }

  public setGuessCooldown(profileKey: string, landmarkKey: string, untilMs: number): void {
    const cleanId = (profileKey || "").toLowerCase().trim();
    const profile = this.getOrCreateProfile(cleanId);
    profile.guessCooldowns.set(landmarkKey, untilMs);
  }

  public addGift(profileKey: string, gift: any): void {
    const cleanId = (profileKey || "").toLowerCase().trim();
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
