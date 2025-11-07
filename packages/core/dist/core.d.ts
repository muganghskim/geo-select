import type { GeoCoreOptions, Region } from './types';
export declare class GeoCore {
    private container;
    private svg;
    private opts;
    private geojson;
    private listeners;
    constructor(container: HTMLElement | null, options?: GeoCoreOptions);
    private init;
    private loadData;
    private createSvg;
    private render;
    private pathFromGeometry;
    private highlight;
    on(eventName: 'select', handler: (r: Region) => void): void;
    private emit;
    search(query: string): void;
    destroy(): void;
}
