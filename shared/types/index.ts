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
  retention?: number;
  maxRetention?: number;
  lastStudiedAt?: number;
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

export interface ClientStudyTileMessage {
  x: number;
  y?: number;
  z?: number;
  points?: number;
}

export interface ClientContributeFuelMessage {
  landmarkId: string;
  points?: number;
  amount?: number;
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

export interface ClientRollUniStopMessage {
  stopId: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface ClientOpenChestMessage {
  chestId: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface MapHQPlacement {
  schoolId: string;
  x: number;
  y?: number;
  z?: number;
}

export interface MapLandmarkPlacement {
  id: string;
  landmarkKey?: string;
  x: number;
  y?: number;
  z?: number;
  maxFuel?: number;
}

export interface MapUniStopPlacement {
  id: string;
  name?: string;
  tier: 'aspire' | 'nitro' | 'predator';
  x: number;
  z?: number;
  y?: number;
}

export interface MapChestPlacement {
  id: string;
  tier: 'silver' | 'gold' | 'platinum';
  x: number;
  z?: number;
  y?: number;
  isOpened?: boolean;
  openedBySchoolId?: string;
}

export interface ClientUpdateMapLayoutMessage {
  hqs?: MapHQPlacement[];
  landmarks?: MapLandmarkPlacement[];
  unistops?: MapUniStopPlacement[];
  chests?: MapChestPlacement[];
}

