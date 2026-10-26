import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:9000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: parseInt(process.env.SERVICE_PORT as string),
    proxy: {
      "/health": apiTarget,
      "/api": apiTarget,
      "/llm": apiTarget,
    },
  },
});
