import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          dapp: ['@evefrontier/dapp-kit'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls in dev to avoid CORS with the Rust/Axum indexer
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
      // Gas station proxy -- avoids CORS from browser to localhost:3001
      '/gas': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/gas/, ''),
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
