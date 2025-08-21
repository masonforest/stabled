import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig(({ command }) => {
  return {
  plugins: [react()],
  root: "./src/frontend",
  server: {
    allowedHosts: ["9282e462638f.ngrok-free.app"],
    proxy: {
      '/sse': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,      
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
  build: {
    emptyOutDir: true,
    outDir: "../../templates",
    rollupOptions: {
      input: {
          index: './src/frontend/index.html',
      }
    }
  },
}});
