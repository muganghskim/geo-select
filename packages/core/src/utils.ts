import type { CountryCapital, CountryInfo, Region, SubdivisionInfo } from './types.js';

/** equirectangular projection (lon,lat) -> x,y */
export function project(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

type WeightedCentroid = {
  x: number;
  y: number;
  area: number;
};

function textValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-99') return text;
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number !== -99) return number;
  }
  return undefined;
}

function coordinatePair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
}

function ringCentroid(coords: number[][]): WeightedCentroid | null {
  if (coords.length < 3) return null;

  let areaTwice = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const [x1, y1] = coords[index];
    const [x2, y2] = coords[(index + 1) % coords.length];
    const cross = x1 * y2 - x2 * y1;
    areaTwice += cross;
    xSum += (x1 + x2) * cross;
    ySum += (y1 + y2) * cross;
  }

  if (Math.abs(areaTwice) < Number.EPSILON) return null;
  return {
    x: xSum / (3 * areaTwice),
    y: ySum / (3 * areaTwice),
    area: Math.abs(areaTwice / 2)
  };
}

function polygonCentroid(rings: number[][][]): WeightedCentroid | null {
  let weightedX = 0;
  let weightedY = 0;
  let totalArea = 0;

  rings.forEach((ring, index) => {
    const centroid = ringCentroid(ring);
    if (!centroid) return;
    const weight = index === 0 ? centroid.area : -centroid.area;
    weightedX += centroid.x * weight;
    weightedY += centroid.y * weight;
    totalArea += weight;
  });

  if (Math.abs(totalArea) < Number.EPSILON) return null;
  return { x: weightedX / totalArea, y: weightedY / totalArea, area: Math.abs(totalArea) };
}

function geometryCentroid(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] | null {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let weightedX = 0;
  let weightedY = 0;
  let totalArea = 0;

  polygons.forEach(rings => {
    const centroid = polygonCentroid(rings as number[][][]);
    if (!centroid) return;
    weightedX += centroid.x * centroid.area;
    weightedY += centroid.y * centroid.area;
    totalArea += centroid.area;
  });

  return totalArea ? [weightedX / totalArea, weightedY / totalArea] : null;
}

export function featureCentroid(feature: GeoJSON.Feature): [number, number] | null {
  if (!feature.geometry) return null;
  const props = (feature.properties || {}) as Record<string, unknown>;
  const explicitCenter = coordinatePair(props.center);
  if (explicitCenter) return explicitCenter;

  const labelX = numberValue(props.LABEL_X, props.labelX);
  const labelY = numberValue(props.LABEL_Y, props.labelY);
  if (labelX !== undefined && labelY !== undefined) return [labelX, labelY];

  const g = feature.geometry;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return geometryCentroid(g);
  if (g.type === 'Point') {
    const p = g.coordinates as number[];
    return [p[0], p[1]];
  }
  return null;
}

function countryInfo(props: Record<string, unknown>): CountryInfo | undefined {
  const capitals = Array.isArray(props.capitals)
    ? props.capitals.flatMap((capital): CountryCapital[] => {
        if (!capital || typeof capital !== 'object') return [];
        const capitalProps = capital as Record<string, unknown>;
        const name = textValue(capitalProps.name);
        const coordinates = coordinatePair(capitalProps.coordinates);
        return name && coordinates ? [{ name, coordinates }] : [];
      })
    : undefined;

  const country: CountryInfo = {
    iso2: textValue(props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL),
    iso3: textValue(props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3),
    numericCode: textValue(props.numericCode, props.ISO_N3_EH, props.ISO_N3),
    officialName: textValue(props.officialName, props.FORMAL_EN, props.NAME_LONG),
    localizedName: textValue(props.localizedName, props.NAME_KO),
    continent: textValue(props.continent, props.CONTINENT),
    subregion: textValue(props.subregion, props.SUBREGION),
    capitals: capitals?.length ? capitals : undefined,
    population: numberValue(props.population, props.POP_EST),
    populationYear: numberValue(props.populationYear, props.POP_YEAR),
    gdpMillionsUsd: numberValue(props.gdpMillionsUsd, props.GDP_MD),
    gdpYear: numberValue(props.gdpYear, props.GDP_YEAR),
    economy: textValue(props.economy, props.ECONOMY),
    incomeGroup: textValue(props.incomeGroup, props.INCOME_GRP),
    wikidataId: textValue(props.wikidataId, props.WIKIDATAID)
  };

  return Object.values(country).some(value => value !== undefined) ? country : undefined;
}

export function toRegion(feature: GeoJSON.Feature): Region {
  const props = (feature.properties || {}) as Record<string, unknown>;
  const id = textValue(
    props.iso3,
    props.ISO_A3_EH,
    props.ISO_A3,
    props.ADM0_A3,
    props.iso_a3,
    props.id,
    props.code
  );
  const name = textValue(props.NAME, props.ADMIN, props.name);
  const cent = featureCentroid(feature) || undefined;
  return { id, name, properties: props, centroid: cent, country: countryInfo(props), level: 'country' };
}

export function toSubdivisionRegion(feature: GeoJSON.Feature): Region {
  const props = (feature.properties || {}) as Record<string, unknown>;
  const text = (...values: unknown[]): string | undefined => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      const result = String(value).trim();
      if (result && result !== '-99') return result;
    }
    return undefined;
  };
  const subdivision: SubdivisionInfo = {
    code: text(props.iso3166_2, props.ISO_3166_2, props.iso31662, props.code, props.code_3166_2),
    name: text(props.name, props.NAME_1, props.NAME, props.nam),
    localizedName: text(props.localizedName, props.NAME_KO, props.name_ko),
    parentIso2: text(props.parentIso2, props.parent_iso2, props.countryIso2, props.ISO_A2),
    parentIso3: text(props.parentIso3, props.parent_iso3, props.countryIso3, props.ISO_A3),
    level: text(props.level, props.adminLevel, props.admin_level) || 'admin1'
  };
  const id = subdivision.code || text(props.id, props.code) || undefined;
  const name = subdivision.name || subdivision.localizedName || id;
  const cent = featureCentroid(feature) || undefined;
  return { id, name, properties: props, centroid: cent, subdivision, level: 'subdivision' };
}
