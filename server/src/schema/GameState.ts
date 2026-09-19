import { Schema, MapSchema, type } from "@colyseus/schema";

export class TileState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") ownerId: string = "";
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("number") defenseTier: number = 0; // 0: Đất thường, 1: Cọc rào, 2: Bờ kè, 3: Tháp canh
}

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") schoolId: string = "hcmut";
  @type("number") personalTroops: number = 100;
  @type("string") currentRole: string = "assault"; // assault | fortify | support
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
}

export class GameState extends Schema {
  // Chỉ lưu các ô đã có chủ hoặc đang tranh chấp (Sparse Optimization cho 1 triệu ô)
  @type({ map: TileState }) claimedTiles = new MapSchema<TileState>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: "number" }) schoolTroops = new MapSchema<number>();
  @type({ map: HQState }) hqs = new MapSchema<HQState>();
  @type({ map: LandmarkState }) landmarks = new MapSchema<LandmarkState>();
  @type("number") simulationSpeed: number = 1; // 1x, 2x, 5x, 10x, 50x
  @type("number") currentTick: number = 0;
}
