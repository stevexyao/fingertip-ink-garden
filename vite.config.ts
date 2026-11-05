import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { port: 5186, strictPort: true },
  preview: { port: 5186, strictPort: true },
  build: { target: 'es2022' },
});
