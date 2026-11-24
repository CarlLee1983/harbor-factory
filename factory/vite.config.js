import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const local = (file) => fileURLToPath(new URL(file, import.meta.url));

// Only the factory build substitutes presentation modules. Both entries use
// the same turn controller, map, dice and save format.
export default defineConfig({
  root: local('./'),
  base: './',
  resolve: {
    alias: [
      { find: /^\.\/board\.js$/, replacement: local('./board.js') },
      { find: /^\.\/character-preview\.js$/, replacement: local('./character-preview.js') },
      { find: /^\.\/turn-panel\.js$/, replacement: local('./turn-panel.js') },
      { find: /^\.\/(portraits|place-art)\.js$/, replacement: local('./skin-art.js') },
    ],
  },
  server: { fs: { allow: [local('../')] } },
});
