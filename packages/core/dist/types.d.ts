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
    aliases?: string[];
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
export type SubdivisionInfo = {
    code?: string;
    name?: string;
    localizedName?: string;
    aliases?: string[];
    parentIso2?: string;
    parentIso3?: string;
    level?: string;
};
export type Region = {
    id?: string;
    name?: string;
    properties?: Record<string, any>;
    centroid?: [number, number];
    country?: CountryInfo;
    subdivision?: SubdivisionInfo;
    level?: 'country' | 'subdivision';
};
export type GeoLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type GeoCoreOptions = {
    width?: number;
    height?: number;
    /** Minimum touch target diameter in SVG pixels for small regions. Set to 0 to disable. */
    touchTargetSize?: number;
    /** Enables pointer-centered wheel zoom and mouse drag panning. */
    zoom?: boolean;
    /** Maximum map scale. Values below 1 are clamped to 1. */
    maxZoom?: number;
    /** Scale change used by each wheel tick and zoomIn/zoomOut call. */
    zoomStep?: number;
    dataUrl?: string;
    data?: GeoJSON.FeatureCollection;
    initialFill?: string;
    highlightFill?: string;
    /** Locale used for labels. Empty keeps the dataset's legacy localized-name fallback. */
    locale?: string;
    /** Text direction for the map and bound search lists. */
    direction?: 'ltr' | 'rtl' | 'auto';
    /** Additional searchable aliases keyed by ISO code, feature id, or subdivision code. */
    aliases?: Record<string, string[]>;
    /** ISO-2, ISO-3, feature-id, or ISO 3166-2 codes permitted by the host product. */
    allowedCountries?: string[];
    allowedSubdivisions?: string[];
    /** Exclusions always win when a code appears in both policy lists. */
    excludedCountries?: string[];
    excludedSubdivisions?: string[];
    onReady?: () => void;
    /** Called whenever the map scale changes. */
    onZoom?: (scale: number) => void;
    /** Called when the initial or retried GeoJSON load fails. */
    onError?: (error: Error) => void;
};
export type FormValueKey = 'id' | 'iso2' | 'iso3';
export type FormFieldOptions = {
    valueKey?: FormValueKey;
    scope?: 'country' | 'subdivision';
    required?: boolean;
    disabled?: boolean;
};
export type FormFieldBinding = {
    input: HTMLInputElement;
    setDisabled(disabled: boolean): void;
    destroy(): void;
};
export type SearchListOptions = {
    scope?: 'country' | 'subdivision';
    listLabel?: string;
    emptyMessage?: string;
    maxResults?: number;
    getLabel?: (region: Region) => string;
};
export type SearchListBinding = {
    refresh(): Region[];
    destroy(): void;
};
export type SubdivisionDataOptions = {
    data?: GeoJSON.FeatureCollection;
    dataUrl?: string;
    parentProperty?: string;
    codeProperty?: string;
    nameProperty?: string;
    allowUnscoped?: boolean;
};
