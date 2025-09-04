import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",          // ← Tauri paketinde gerekli
  plugins: [react()],
});
