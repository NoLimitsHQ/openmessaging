import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_BACKEND_URL ?? "http://localhost:4000";

// Geliştirme ortamında tüm API çağrıları ve Socket.io bağlantısı backend'e
// proxy'lenir; böylece CORS ve cookie davranışı üretimdekiyle aynı olur.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/auth": { target: backend, changeOrigin: true },
      "/contacts": { target: backend, changeOrigin: true },
      "/conversations": { target: backend, changeOrigin: true },
      "/health": { target: backend, changeOrigin: true },
      "/socket.io": { target: backend, changeOrigin: true, ws: true },
    },
  },
});
