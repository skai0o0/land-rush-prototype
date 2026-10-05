import { BEACON_CRYSTALS } from "../../../shared/constants/gameplay";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class KnowledgeState extends Schema {
  persistent = false;
  @type("number") retention = 100;
  @type("number") lastStudiedAt = 0;
  @type("number") studyCount = 0;
}

export class TileState extends Schema {
  @type({ map: KnowledgeState }) knowledge = new MapSchema<KnowledgeState>();
  knowledgeInitialized = false;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") ownerId: string = "";
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("number") defenseTier: number = 0; // 0: Đất thường, 1: Cọc rào, 2: Bờ kè, 3: Tháp canh
  @type("number") retention: number = 100; // Độ bền tri thức (0 - 100)
  @type("number") maxRetention: number = 100;
  @type("number") lastStudiedAt: number = 0; // Timestamp lần cuối được sinh viên ôn bài
  @type({ map: "number" }) studyCountBySchool = new MapSchema<number>();
  @type("boolean") isShared: boolean = false;
  @type("string") sharedWithSchoolId: string = "";
  @type("number") sharedExpiresAt: number = 0; // Ghi nhận độ chăm ôn bài của từng trường
}

export class PlayerState extends Schema {
  @type("string") id: string = "";
  email: string = "";
  @type("string") displayName: string = "";
  @type("string") schoolId: string = "hcmut";
  points: number = 100;
  get personalTroops(): number { return this.points; }
  set personalTroops(val: number) { this.points = val; }
  get currentRole(): string { return "support"; }
  set currentRole(_: string) {} // assault | fortify | support
  @type("string") mode: string = "normal"; // normal | dev
  @type("boolean") isLockedSchool: boolean = true;
  crystals: number = 0;
  aspireKeys: number = 0;
  nitroKeys: number = 0;
  predatorKeys: number = 0;
  guessCooldowns = new MapSchema<number>();
  hasWeeklyRunningPoints: boolean = false;

  get charcoal(): number { return this.crystals; }
  set charcoal(val: number) { this.crystals = val; }
  get silverKeys(): number { return this.aspireKeys; }
  set silverKeys(val: number) { this.aspireKeys = val; }
  get goldKeys(): number { return this.nitroKeys; }
  set goldKeys(val: number) { this.nitroKeys = val; }
  get platinumKeys(): number { return this.predatorKeys; }
  set platinumKeys(val: number) { this.predatorKeys = val; }
}

export class HQState extends Schema {
  @type("string") schoolId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class LandmarkState extends Schema {
  @type("string") id: string = "";
  @type("string") landmarkKey: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") ownerId: string = "";
  @type("number") currentCrystals: number = 0; // Lượng tinh thể hiện tại của trường dẫn đầu
  @type("number") maxCrystals: number = BEACON_CRYSTALS; // Mặc định 1000 tinh thể để thắp sáng đèn hiệu
  @type("string") litBySchoolId: string = ""; // ID trường đang thắp sáng đèn hiệu (ban đầu "")
  @type({ map: "number" }) crystalsBySchool = new MapSchema<number>(); // Tinh thể từng trường nạp
  @type({ map: "boolean" }) guessedSchools = new MapSchema<boolean>(); // Các trường đã giải đố thành công
  @type("boolean") buffActive: boolean = false; // Kích hoạt buff khi đạt maxCrystals hoặc overtake
  @type("boolean") nameGuessed: boolean = false;
  @type("string") guessedBySchoolId: string = "";

  get currentFuel(): number { return this.currentCrystals; }
  set currentFuel(val: number) { this.currentCrystals = val; }
  get maxFuel(): number { return this.maxCrystals; }
  set maxFuel(val: number) { this.maxCrystals = val; }
  get fuelBySchool(): MapSchema<number> { return this.crystalsBySchool; }
  set fuelBySchool(val: MapSchema<number>) { this.crystalsBySchool = val; }
}

export class UniStopState extends Schema {
  @type("string") ownerSchoolId = "";
  arrivalOrderBySchool = new Map<string, number>(); // Server-only arrival order; never a cooldown.
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") tier: string = "aspire"; // 'aspire' | 'nitro' | 'predator'
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  @type("number") cooldownUntil: number = 0;

  get y(): number { return this.z; }
  set y(val: number) { this.z = val; }
}

export class ChestState extends Schema {
  @type("string") id: string = "";
  @type("string") tier: string = "aspire"; // 'aspire' | 'nitro' | 'predator'
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  @type("boolean") isOpened: boolean = false;
  @type("string") openedBySchoolId: string = "";

  get y(): number { return this.z; }
  set y(val: number) { this.z = val; }
}

export class GameState extends Schema {
  // Internal server-side tile bookkeeping (knowledge / game rules).
  // NOT networked: ownership/combat paint state lives in LandState (data plane)
  // and is synced via snap/own_batch/combat frames. No @type on purpose.
  claimedTiles = new MapSchema<TileState>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: "number" }) schoolKnowledgeTiles = new MapSchema<number>();
  @type({ map: "number" }) schoolPoints = new MapSchema<number>();
  get schoolTroops() { return this.schoolPoints; }
  set schoolTroops(val) { this.schoolPoints = val; }
  @type({ map: HQState }) hqs = new MapSchema<HQState>();
  @type({ map: LandmarkState }) landmarks = new MapSchema<LandmarkState>();
  @type({ map: UniStopState }) unistops = new MapSchema<UniStopState>();
  @type({ map: ChestState }) chests = new MapSchema<ChestState>();
  @type("number") simulationSpeed: number = 1; // 1x, 2x, 5x, 10x, 50x
  @type("number") currentTick: number = 0;
}

