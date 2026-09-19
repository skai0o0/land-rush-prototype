import { defineConfig } from "vite";
import path from "path";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [topLevelAwait()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  server: {
    port: 5173,
    host: "0.0.0.0"
  }
});
