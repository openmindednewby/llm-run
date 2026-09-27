import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
});
