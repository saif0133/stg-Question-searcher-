import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend always uses relative "/api/..." URLs (same origin as the site).
//
// In production, Netlify rewrites /api/* to serverless functions.
// In development, run `netlify dev` from the repo root: it starts this Vite
// server (targetPort 5173), runs the functions, and applies the /api rewrite
// on one origin (http://localhost:8888) — so no proxy and no CORS are needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
