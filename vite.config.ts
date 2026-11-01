import { defineConfig } from 'vite';

// Rutas relativas para asegurar la carga de assets en subdirectorios de GitHub Pages
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist'
  }
});
