import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [
            resolve(__dirname, 'index.html'),
            resolve(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
          ],
          theme: {
            extend: {
              colors: {
                primary: {
                  50: '#eff6ff',
                  100: '#dbeafe',
                  200: '#bfdbfe',
                  300: '#93c5fd',
                  400: '#60a5fa',
                  500: '#3b82f6',
                  600: '#2563eb',
                  700: '#1d4ed8',
                  800: '#1e40af',
                  900: '#1e3a8a',
                },
              },
            },
          },
          plugins: [],
        }),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:28470',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:28470',
        ws: true,
      },
    },
  },
});
