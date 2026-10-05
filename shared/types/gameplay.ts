export type GameplayEventType =
  | "knowledge.changed" | "knowledge.added" | "knowledge.studied"
  | "station.owner_changed" | "station.claimed" | "chest.opened"
  | "landmark.activated" | "landmark.crystals_contributed" | "landmark.guessed";

/** Versioned room-local event envelope. sequence restarts with a new room. */
export interface GameplayEvent {
  version: 1;
  sequence: number;
  at: number;
  type: GameplayEventType;
  payload: Record<string, unknown>;
}
