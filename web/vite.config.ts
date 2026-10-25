import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API server (npm run serve) listens on 4180; in dev, Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, proxy: { "/api": "http://127.0.0.1:4180" } },
});
