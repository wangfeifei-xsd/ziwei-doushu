import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(),{name:'ziwei-service-health',configureServer(server){server.middlewares.use('/__ziwei_health',(_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({ok:true,service:'ziwei-app-web',instance:process.env.ZIWEI_SERVICE_ID||''}));});}}], base: './', clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || '127.0.0.1',
    hmr: process.env.TAURI_DEV_HOST ? { protocol: 'ws', host: process.env.TAURI_DEV_HOST, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1100 },
});
