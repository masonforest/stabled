import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig(({ command }) => {
  return {
  plugins: [react()],
  root: "./src/frontend",
  build: {
    emptyOutDir: true,
    outDir: "../../templates",
    rollupOptions: {
      input: {
          magic: './src/frontend/magic.html',
      }
    }
  },
}});
