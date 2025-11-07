import type { Region } from './types';
/** equirectangular projection (lon,lat) -> x,y */
export declare function project(lon: number, lat: number, width: number, height: number): [number, number];
export declare function featureCentroid(feature: GeoJSON.Feature): [number, number] | null;
export declare function toRegion(feature: GeoJSON.Feature): Region;
