import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // Polyfill Node.js modules for browser compatibility (required for @solana/web3.js)
        nodePolyfills({
          include: ['buffer', 'crypto', 'stream', 'util'],
          globals: {
            Buffer: true,
            global: true,
            process: true
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.TREASURY_PUBLIC_KEY': JSON.stringify(env.TREASURY_PUBLIC_KEY),
        'process.env.VITE_GAME_SERVER_URL': JSON.stringify(env.VITE_GAME_SERVER_URL),
        global: 'globalThis'
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.')
        }
      },
      optimizeDeps: {
        include: ['buffer', '@solana/web3.js'],
        esbuildOptions: {
          define: {
            global: 'globalThis'
          }
        }
      },
      build: {
        rollupOptions: {
          plugins: []
        }
      }
    };
});
