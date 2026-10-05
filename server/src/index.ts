import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { CampusRoom } from "./rooms/CampusRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", game: "predator-knowledge-journey" });
});

// Serve client production build if available (Unified single-port for Cloudflare Tunnel)
const clientDistCandidates = [
  path.resolve(process.cwd(), "client/dist"),
  path.resolve(__dirname, "../../client/dist"),
  path.resolve(__dirname, "../../../../client/dist")
];
const clientDist = clientDistCandidates.find((p) => fs.existsSync(p));

if (clientDist) {
  console.log(`[Colyseus Server] Serving client static build from ${clientDist}`);
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/matchmake") ||
      req.path.startsWith("/health") ||
      req.path.startsWith("/colyseus")
    ) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const httpServer = createServer(app);
const gameServer = new Server({
  server: httpServer,
});

// Register the authoritative campus room
gameServer.define("campus_room", CampusRoom);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`[Colyseus Server] Predator Knowledge Journey listening on ws://localhost:${port}`);
  console.log(`[Colyseus Server] Room "campus_room" defined and ready for exploration.`);
});

// Clean shutdown handlers to release port on Windows / ts-node-dev reload
let shuttingDown = false;
const cleanup = async () => {
  if(shuttingDown) return; shuttingDown=true;
  try { await gameServer.gracefullyShutdown(false); httpServer.close(); process.exit(0); }
  catch(error) { console.error("Shutdown flush failed", error); process.exit(1); }
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

