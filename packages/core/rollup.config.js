import typescript from "@rollup/plugin-typescript";

export default {
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
};
