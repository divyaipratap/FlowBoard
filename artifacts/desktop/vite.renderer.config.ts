import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  root: path.resolve(import.meta.dirname, "src"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/index.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:3099",
    },
  },
});
