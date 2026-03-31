import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // ★ 使用项目本地缓存目录，避免多项目共享 symlinked node_modules 时的锁冲突
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  server: {
    host: true,
    allowedHosts: true,
  },
});