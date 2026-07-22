import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production the SAME Fastify server serves this built app and the API,
// so the frontend always uses relative URLs ("/api/...", "/health") and never
// an external backend domain.
//
// In development Vite serves the app and proxies "/api" and "/health" to the
// local Fastify server, so the browser still only talks to one origin and no
// CORS is involved. Streaming (NDJSON from /api/search/stream) passes through
// the proxy unbuffered.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
