export type Region = {
  id?: string;
  name?: string;
  properties?: Record<string, any>;
  centroid?: [number, number]; // [lon, lat]
};

export type GeoCoreOptions = {
  width?: number;
  height?: number;
  dataUrl?: string;
  data?: GeoJSON.FeatureCollection;
  initialFill?: string;
  highlightFill?: string;
  onReady?: () => void;
};