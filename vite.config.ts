import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react(), VitePWA({
    registerType: 'prompt', includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: { name: '中华航空 · 航线经营', short_name: '中华航空', description: '横屏单机航空运输经营游戏',
      lang: 'zh-CN', id: './', start_url: './', scope: './', display: 'standalone', orientation: 'landscape',
      theme_color: '#174c4a', background_color: '#f4f3ed',
      icons: [{src: 'icon-192.png', sizes: '192x192', type: 'image/png'}, {src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable'}] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,webmanifest}'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      cleanupOutdatedCaches: true, clientsClaim: true, navigateFallback: 'index.html' }
  })],
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { renderer: ['pixi.js'], ui: ['react', 'react-dom', 'zustand'], storage: ['dexie'] } } } }
});
