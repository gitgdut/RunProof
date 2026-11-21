import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    // GitHub Pages serves this app under /RunProof/; override with VITE_BASE=/ for a domain root.
    base: env.VITE_BASE || '/RunProof/',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
