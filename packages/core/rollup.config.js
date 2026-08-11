import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/geo-select-core.umd.js",
        format: "umd",
        name: "GeoSelectCore",
        sourcemap: true,
      },
      {
        file: "dist/geo-select-core.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/geo-select-core.cjs",
        format: "cjs",
        exports: "default",
        sourcemap: true,
      },
    ],
    plugins: [typescript()],
  },
  {
    input: "src/world.ts",
    output: [
      {
        file: "dist/world.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/world.cjs",
        format: "cjs",
        exports: "default",
        sourcemap: true,
      },
    ],
    plugins: [json({ compact: true }), typescript({ declaration: false })],
  },
];
