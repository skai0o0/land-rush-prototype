export type PlayerRole = "assault" | "fortify" | "support";
export type GameMode = "normal" | "dev";

export interface StudentAccount {
  email: string;
  schoolId: string;
  name: string;
  defaultKm: number;
}

export interface ClientJoinOptions {
  email?: string;
  schoolId?: string;
  mode?: GameMode;
  points?: number;
}

export interface TileData {
  x: number;
  y: number;
  ownerId: string;
  hp: number;
  maxHp: number;
  defenseTier: number;
}

export interface PlayerData {
  id: string;
  schoolId: string;
  personalTroops: number;
  currentRole: PlayerRole;
}

export interface HQPlacement {
  schoolId: string;
  x: number;
  y: number;
}

export interface LandmarkPlacement {
  id: string;
  landmarkKey: string;
  x: number;
  y: number;
}

export interface ClientClaimMessage {
  x: number;
  y: number;
}

export interface ClientFortifyMessage {
  x: number;
  y: number;
}

export interface ClientSetSpeedMessage {
  speed: number;
}

export interface ClientBulkDispatchMessage {
  amount: number;
}

export interface ClientSelectSchoolMessage {
  schoolId: string;
}

export interface ClientSetRoleMessage {
  role: PlayerRole;
}
