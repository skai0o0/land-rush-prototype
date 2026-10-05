import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: [
      ".trycloudflare.com"
    ],
    proxy: {
      "/matchmake": {
        target: "http://localhost:2567",
        changeOrigin: true
      },
      "^/(campus_room)": {
        target: "ws://localhost:2567",
        ws: true,
        changeOrigin: true
      }
    }
  }
});
