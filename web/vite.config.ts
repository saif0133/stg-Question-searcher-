import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend calls the backend through "/api".
// In development Vite proxies those requests to the Fastify server,
// so credentials never travel through query strings and there is no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
