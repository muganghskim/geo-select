import { readFile, writeFile } from 'node:fs/promises';

const [countriesPath, capitalsPath, outputPath] = process.argv.slice(2);
if (!countriesPath || !capitalsPath || !outputPath) {
  throw new Error('Usage: node scripts/build-world-data.mjs <countries.geojson> <capitals.geojson> <output.geojson>');
}

const [countries, places] = await Promise.all([
  readFile(countriesPath, 'utf8').then(JSON.parse),
  readFile(capitalsPath, 'utf8').then(JSON.parse)
]);

function text(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized && normalized !== '-99') return normalized;
  }
  return undefined;
}

function number(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const normalized = Number(value);
    if (Number.isFinite(normalized) && normalized !== -99) return normalized;
  }
  return undefined;
}

const capitalsByCode = new Map();
for (const feature of places.features) {
  const props = feature.properties || {};
  if (Number(props.adm0cap) !== 1) continue;
  const code = text(props.adm0_a3, props.sov_a3);
  const name = text(props.nameascii, props.name);
  const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
  if (!code || !name || !Array.isArray(coordinates)) continue;
  const capital = { name, coordinates: [Number(coordinates[0]), Number(coordinates[1])] };
  const entries = capitalsByCode.get(code) || [];
  entries.push(capital);
  capitalsByCode.set(code, entries);
}

const features = countries.features.map(feature => {
  const props = feature.properties || {};
  const iso3 = text(props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3, props.SOV_A3);
  const iso2 = text(props.ISO_A2_EH, props.ISO_A2, props.POSTAL);
  const numericCode = text(props.ISO_N3_EH, props.ISO_N3);
  const centerX = number(props.LABEL_X);
  const centerY = number(props.LABEL_Y);
  const capitals = capitalsByCode.get(iso3) || capitalsByCode.get(text(props.ADM0_A3)) || [];

  return {
    type: 'Feature',
    id: iso3,
    properties: {
      name: text(props.NAME_EN, props.ADMIN, props.NAME),
      localizedName: text(props.NAME_KO),
      officialName: text(props.FORMAL_EN, props.NAME_LONG),
      code: iso3,
      iso2,
      iso3,
      numericCode,
      continent: text(props.CONTINENT),
      subregion: text(props.SUBREGION),
      capitals: capitals.length ? capitals : undefined,
      population: number(props.POP_EST),
      populationYear: number(props.POP_YEAR),
      gdpMillionsUsd: number(props.GDP_MD),
      gdpYear: number(props.GDP_YEAR),
      economy: text(props.ECONOMY),
      incomeGroup: text(props.INCOME_GRP),
      wikidataId: text(props.WIKIDATAID),
      center: centerX !== undefined && centerY !== undefined ? [centerX, centerY] : undefined
    },
    geometry: feature.geometry
  };
});

const output = {
  type: 'FeatureCollection',
  name: 'Natural Earth admin-0 countries, 1:50m',
  source: 'https://www.naturalearthdata.com/',
  license: 'Public domain',
  features
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`Wrote ${features.length} countries to ${outputPath}`);
