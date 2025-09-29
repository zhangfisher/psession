import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: "src/index.ts",
		platform: "neutral",
		dts: true,
		format: ["esm", "cjs"],
		sourcemap: true,
		minify: true,
	},
]);
