import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const isWatch = !!process.env.ROLLUP_WATCH;

export default {
	input: "src/plugin.ts",
	output: {
		file: "com.jan.musiccast.sdPlugin/bin/plugin.js",
		sourcemap: isWatch,
		format: "es",
	},
	plugins: [
		typescript({ noEmit: false, outDir: "com.jan.musiccast.sdPlugin/bin", sourceMap: isWatch }),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
		!isWatch && terser(),
	],
};
