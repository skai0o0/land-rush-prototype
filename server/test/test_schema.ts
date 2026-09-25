import { MapSchema, Schema, type } from "@colyseus/schema";

class TileState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") ownerId: string = "";
}

class State extends Schema {
  @type({ map: TileState }) claimedTiles = new MapSchema<TileState>();
}

const s1 = new State();
const t1 = new TileState();
t1.x = 10;
t1.y = 20;
t1.ownerId = "hcmut";
s1.claimedTiles.set("10,20", t1);

// Encode from server
const bytes = s1.encode();

// Decode on client
const clientState = new State();
clientState.decode(bytes);

console.log("Client get 10,20:", clientState.claimedTiles.get("10,20")?.ownerId);
console.log("Client get 10,21:", clientState.claimedTiles.get("10,21")?.ownerId);
console.log("Client keys:", Array.from(clientState.claimedTiles.keys()));
