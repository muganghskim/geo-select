import type { GeoCoreOptions, Region } from './types.js';
export declare class GeoCore {
    private container;
    private svg;
    private opts;
    private geojson;
    private listeners;
    private selectedIndex;
    private searchMatches;
    constructor(container: HTMLElement | null, options?: GeoCoreOptions);
    private init;
    private loadData;
    private createSvg;
    private render;
    private pathFromGeometry;
    private updateHighlights;
    on(eventName: 'select', handler: (r: Region) => void): () => void;
    private emit;
    private selectIndex;
    select(identifier: string): Region | null;
    getSelected(): Region | null;
    clear(): void;
    reset(): void;
    search(query: string): Region[];
    destroy(): void;
}
