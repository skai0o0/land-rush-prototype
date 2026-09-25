import { Client } from "colyseus.js";

async function testClaim() {
  const client = new Client("ws://localhost:2567");
  try {
    const room = await client.joinOrCreate("campus_room", { schoolId: "hcmut" });
    console.log("Connected to room:", room.sessionId);

    // Get HQ of hcmut
    const hq = room.state.hqs.get("hcmut");
    console.log("HCMUT HQ:", hq?.x, hq?.y);

    // Listen for error messages
    room.onMessage("error", (msg) => {
      console.log("Received server error:", msg);
    });

    // Try to claim a tile far away from HQ: (10, 10)
    console.log("Sending claim_tile for (10, 10)...");
    room.send("claim_tile", { x: 10, y: 10 });

    await new Promise(r => setTimeout(r, 1000));

    // Check if (10, 10) is claimed
    const t = room.state.claimedTiles.get("10,10");
    console.log("Tile (10, 10) in claimedTiles:", t ? t.ownerId : "NOT CLAIMED");

    await room.leave();
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testClaim();
