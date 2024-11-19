import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: {
		entry: "./src/index.ts",
		resolve: true,
	},
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	external: ["react", "react-dom", "next", "next/image"],
	esbuildOptions(options) {
		options.banner = {
			js: `
        if (typeof window !== 'undefined') {
          window.global = window;
        }
      `,
		};
	},
	platform: "browser",
	target: ["es2020", "node18"],
	minify: true,
	outDir: "dist",
});
