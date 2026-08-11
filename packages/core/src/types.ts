export type CountryCapital = {
  name: string;
  coordinates: [number, number];
};

export type CountryInfo = {
  iso2?: string;
  iso3?: string;
  numericCode?: string;
  officialName?: string;
  localizedName?: string;
  continent?: string;
  subregion?: string;
  capitals?: CountryCapital[];
  population?: number;
  populationYear?: number;
  gdpMillionsUsd?: number;
  gdpYear?: number;
  economy?: string;
  incomeGroup?: string;
  wikidataId?: string;
};

export type Region = {
  id?: string;
  name?: string;
  properties?: Record<string, any>;
  centroid?: [number, number]; // [lon, lat]
  country?: CountryInfo;
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

export type FormValueKey = 'id' | 'iso2' | 'iso3';

export type FormFieldOptions = {
  valueKey?: FormValueKey;
  required?: boolean;
  disabled?: boolean;
};

export type FormFieldBinding = {
  input: HTMLInputElement;
  setDisabled(disabled: boolean): void;
  destroy(): void;
};
