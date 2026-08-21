// vite.config.js
// Le dice a Vite que la web tiene DOS páginas, no una.
// Sin esto, exito.html no llega a dist/ y el cliente que paga ve un 404.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        exito: fileURLToPath(new URL('./exito.html', import.meta.url)),
      },
    },
  },
});