import { Schema, MapSchema, type } from "@colyseus/schema";

export class TileState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") ownerId: string = "";
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("number") defenseTier: number = 0; // 0: Đất thường, 1: Cọc rào, 2: Bờ kè, 3: Tháp canh
  @type("number") retention: number = 100; // Độ bền tri thức (0 - 100)
  @type("number") maxRetention: number = 100;
  @type("number") lastStudiedAt: number = 0; // Timestamp lần cuối được sinh viên ôn bài
  @type({ map: "number" }) studyCountBySchool = new MapSchema<number>(); // Ghi nhận độ chăm ôn bài của từng trường
}

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") email: string = "";
  @type("string") schoolId: string = "hcmut";
  @type("number") personalTroops: number = 100;
  @type("string") currentRole: string = "assault"; // assault | fortify | support
  @type("string") mode: string = "normal"; // normal | dev
  @type("boolean") isLockedSchool: boolean = true;
  @type("number") charcoal: number = 0;
  @type("number") silverKeys: number = 0;
  @type("number") goldKeys: number = 0;
  @type("number") platinumKeys: number = 0;
  @type("boolean") hasWeeklyRunningPoints: boolean = false;
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
  @type("number") currentFuel: number = 0; // Lượng than củi hiện tại của trường dẫn đầu
  @type("number") maxFuel: number = 500; // Mặc định 500 than củi để thắp lửa
  @type("string") litBySchoolId: string = ""; // ID trường đang thắp lửa (ban đầu "")
  @type({ map: "number" }) fuelBySchool = new MapSchema<number>(); // Than củi từng trường nạp
  @type("boolean") buffActive: boolean = false; // Kích hoạt buff khi đạt maxFuel
}

export class UniStopState extends Schema {
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
  @type("string") tier: string = "silver"; // 'silver' | 'gold' | 'platinum'
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  @type("boolean") isOpened: boolean = false;
  @type("string") openedBySchoolId: string = "";

  get y(): number { return this.z; }
  set y(val: number) { this.z = val; }
}

export class GameState extends Schema {
  // Internal server-side tile bookkeeping (BotManager / game rules).
  // NOT networked: ownership/combat paint state lives in LandState (data plane)
  // and is synced via snap/own_batch/combat frames. No @type on purpose.
  claimedTiles = new MapSchema<TileState>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: "number" }) schoolTroops = new MapSchema<number>();
  @type({ map: HQState }) hqs = new MapSchema<HQState>();
  @type({ map: LandmarkState }) landmarks = new MapSchema<LandmarkState>();
  @type({ map: UniStopState }) unistops = new MapSchema<UniStopState>();
  @type({ map: ChestState }) chests = new MapSchema<ChestState>();
  @type("number") simulationSpeed: number = 1; // 1x, 2x, 5x, 10x, 50x
  @type("number") currentTick: number = 0;
}

