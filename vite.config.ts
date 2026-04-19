/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

const isGitHubPages = process.env.DEPLOY_TARGET === 'gh-pages';

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubPages ? '/chat/' : '/',
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
      $assets: path.resolve(__dirname, 'src/assets')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('dexie')) return 'vendor-dexie';
            if (id.includes('zod')) return 'vendor-zod';
            if (id.includes('fflate')) return 'vendor-fflate';
            return 'vendor';
          }
        }
      }
    }
  }
});
