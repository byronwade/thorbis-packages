import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'events/index': 'src/events/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  outDir: 'dist',
  external: ['react', 'react-dom', 'idb'],
  esbuildOptions(options) {
    options.conditions = ['import', 'module'];
  },
});