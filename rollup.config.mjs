import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "cjs",
    sourcemap: true,
  },
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: "./tsconfig.json",
    }),
  ],
  external: [
    // List external dependencies that shouldn't be bundled
    "hono",
    "@hono/node-server",
    "marked",
    "suncalc",
  ],
};
