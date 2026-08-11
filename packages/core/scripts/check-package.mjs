import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  await readFile(resolve(packageRoot, 'package.json'), 'utf8')
);

const expectedEntries = {
  main: 'dist/geo-select-core.cjs',
  module: 'dist/geo-select-core.esm.js',
  types: 'dist/index.d.ts',
};

const expectedPackageFiles = [
  'DATA_LICENSE.md',
  'dist/*.d.ts',
  'dist/geo-select-core.cjs',
  'dist/geo-select-core.cjs.map',
  'dist/geo-select-core.esm.js',
  'dist/geo-select-core.esm.js.map',
  'dist/geo-select-core.umd.js',
  'dist/geo-select-core.umd.js.map',
  'dist/world.cjs',
  'dist/world.cjs.map',
  'dist/world.esm.js',
  'dist/world.esm.js.map',
];

for (const [field, expected] of Object.entries(expectedEntries)) {
  if (packageJson[field] !== expected) {
    throw new Error(`${field} must point to ${expected}`);
  }
  await access(resolve(packageRoot, expected));
}

const rootExport = packageJson.exports?.['.'];
if (
  rootExport?.types !== `./${expectedEntries.types}` ||
  rootExport?.import !== `./${expectedEntries.module}` ||
  rootExport?.require !== `./${expectedEntries.main}`
) {
  throw new Error('exports must match the package entry points');
}

const worldExport = packageJson.exports?.['./world'];
if (
  worldExport?.types !== './dist/world.d.ts' ||
  worldExport?.import !== './dist/world.esm.js' ||
  worldExport?.require !== './dist/world.cjs'
) {
  throw new Error('world export must match the optional data entry points');
}

if (JSON.stringify(packageJson.files) !== JSON.stringify(expectedPackageFiles)) {
  throw new Error('files must contain only supported package outputs');
}

const esmModule = await import(
  pathToFileURL(resolve(packageRoot, expectedEntries.module)).href
);
if (typeof esmModule.default !== 'function') {
  throw new Error('ESM entry point must provide the GeoCore default export');
}

const require = createRequire(import.meta.url);
const commonJsExport = require(resolve(packageRoot, expectedEntries.main));
if (typeof commonJsExport !== 'function') {
  throw new Error('CommonJS entry point must export the GeoCore constructor');
}

const esmWorld = await import(pathToFileURL(resolve(packageRoot, 'dist/world.esm.js')).href);
if (esmWorld.default?.type !== 'FeatureCollection' || esmWorld.default.features.length < 240) {
  throw new Error('ESM world entry point must provide the full country collection');
}

const commonJsWorld = require(resolve(packageRoot, 'dist/world.cjs'));
if (commonJsWorld?.type !== 'FeatureCollection' || commonJsWorld.features.length < 240) {
  throw new Error('CommonJS world entry point must provide the full country collection');
}

console.log('Package entry points are valid.');
