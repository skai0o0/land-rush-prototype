import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { CampusRoom } from "./rooms/CampusRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", game: "dhqg-land-rush" });
});

const httpServer = createServer(app);
const gameServer = new Server({
  server: httpServer,
});

// Register the authoritative campus room
gameServer.define("campus_room", CampusRoom);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[Colyseus Server] DHQG Land Rush listening on ws://localhost:${port}`);
  console.log(`[Colyseus Server] Room "campus_room" defined and ready for battles.`);
});

// Clean shutdown handlers to release port on Windows / ts-node-dev reload
const cleanup = () => {
  httpServer.close();
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

