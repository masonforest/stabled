import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "./src/frontend",
  build: {
    emptyOutDir: true,
    outDir: "../../templates",
    rollupOptions: {
      input: {
          index: './src/frontend/index.html',
          magic: './src/frontend/magic.html',
      }
    }
  },
});
