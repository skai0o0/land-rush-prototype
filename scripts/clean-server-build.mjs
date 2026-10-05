// Deleted source modules must not survive in the generated release output.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const server = path.join(root, "server");
const target = path.resolve(server, "build");
if (path.dirname(target) !== server || path.basename(target) !== "build") throw new Error("Invalid generated build target");
if (fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.realpathSync(target) !== target) throw new Error("Unexpected build path");
fs.rmSync(target, { recursive: true, force: true });
