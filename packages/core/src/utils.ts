import type { Region } from './types';

/** equirectangular projection (lon,lat) -> x,y */
export function project(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

function centroidOfCoordinates(coords: number[][]): [number, number] {
  let sumX = 0, sumY = 0, count = 0;
  coords.forEach(([lon, lat]) => {
    sumX += lon;
    sumY += lat;
    count += 1;
  });
  return [sumX / count, sumY / count];
}

export function featureCentroid(feature: GeoJSON.Feature): [number, number] | null {
  if (!feature.geometry) return null;
  const g = feature.geometry;
  if (g.type === 'Polygon') {
    // Polygon: [ [ [lon,lat], ... ] , ... ]
    const rings = g.coordinates as number[][][];
    return centroidOfCoordinates(rings[0]);
  }
  if (g.type === 'MultiPolygon') {
    const multipolys = g.coordinates as number[][][][];
    // pick the first polygon's first ring
    if (multipolys.length > 0 && multipolys[0].length > 0) {
      return centroidOfCoordinates(multipolys[0][0]);
    }
    return null;
  }
  if (g.type === 'Point') {
    const p = g.coordinates as number[];
    return [p[0], p[1]];
  }
  return null;
}

export function toRegion(feature: GeoJSON.Feature): Region {
  const props = (feature.properties || {}) as any;
  const id = props.ISO_A3 || props.iso_a3 || props.id || props.code || undefined;
  const name = props.NAME || props.ADMIN || props.name || undefined;
  const cent = featureCentroid(feature) || undefined;
  return { id, name, properties: props, centroid: cent };
}