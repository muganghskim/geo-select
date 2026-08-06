import type { GeoCoreOptions, Region } from './types.js';
import { project, toRegion } from './utils.js';

export class GeoCore {
  private container: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private opts: Required<GeoCoreOptions>;
  private geojson: GeoJSON.FeatureCollection | null = null;
  private listeners: { select: ((r: Region) => void)[] } = { select: [] };
  private selectedIndex: number | null = null;
  private searchMatches = new Set<number>();

  constructor(container: HTMLElement | null, options: GeoCoreOptions = {}) {
    if (!container) throw new Error('container HTMLElement is required');
    this.container = container;
    this.opts = {
      width: options.width || 900,
      height: options.height || 450,
      dataUrl: options.dataUrl || '',
      data: options.data || (null as any),
      initialFill: options.initialFill || '#e6e6e6',
      highlightFill: options.highlightFill || '#ffcc00',
      onReady: options.onReady || (() => {})
    };

    void this.init();
  }

  private async init() {
    this.createSvg();
    if (this.opts.data) {
      this.geojson = this.opts.data;
      this.render();
      this.opts.onReady();
    } else if (this.opts.dataUrl) {
      await this.loadData(this.opts.dataUrl);
      this.render();
      this.opts.onReady();
    } else {
      this.container.textContent = 'No geojson provided. Use options.data or options.dataUrl';
    }
  }

  private async loadData(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load geojson');
    this.geojson = await res.json();
  }

  private createSvg() {
    this.container.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(this.opts.width));
    svg.setAttribute('height', String(this.opts.height));
    svg.setAttribute('viewBox', `0 0 ${this.opts.width} ${this.opts.height}`);
    svg.style.display = 'block';
    this.svg = svg;
    this.container.appendChild(svg);
  }

  private render() {
    if (!this.svg || !this.geojson) return;
    const svg = this.svg;
    const g = document.createElementNS(svg.namespaceURI, 'g');

    this.geojson.features.forEach((feature, i) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      const d = this.pathFromGeometry(feature.geometry);
      path.setAttribute('d', d);
      path.setAttribute('fill', this.opts.initialFill);
      path.setAttribute('stroke', '#999');
      path.setAttribute('data-index', String(i));
      // 타입 캐스팅으로 style 사용
      (path as SVGPathElement).style.cursor = 'pointer';

      path.addEventListener('click', () => {
        this.selectIndex(i);
      });

      path.addEventListener('mouseenter', () => {
        path.setAttribute('opacity', '0.9');
      });
      path.addEventListener('mouseleave', () => {
        path.setAttribute('opacity', '1');
      });

      g.appendChild(path);
    });

    svg.appendChild(g);
  }

  private pathFromGeometry(geom: GeoJSON.Geometry | null): string {
    if (!geom) return '';
    const w = this.opts.width;
    const h = this.opts.height;

    const ringToPath = (ring: number[][]) =>
      ring.map(([lon, lat], idx) => {
        const [x, y] = project(lon, lat, w, h);
        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ') + ' Z';

    if (geom.type === 'Polygon') {
      const rings = geom.coordinates as number[][][];
      return rings.map(r => ringToPath(r)).join(' ');
    }
    if (geom.type === 'MultiPolygon') {
      const polys = geom.coordinates as number[][][][];
      return polys.map(poly => poly.map(r => ringToPath(r)).join(' ')).join(' ');
    }
    if (geom.type === 'Point') {
      const [lon, lat] = geom.coordinates as number[];
      const [x, y] = project(lon, lat, w, h);
      return `M ${x - 2} ${y - 2} L ${x + 2} ${y - 2} L ${x + 2} ${y + 2} L ${x - 2} ${y + 2} Z`;
    }
    return '';
  }

  private updateHighlights() {
    if (!this.svg) return;
    const paths = this.svg.querySelectorAll('path');
    paths.forEach((path, index) => {
      const highlighted = index === this.selectedIndex || this.searchMatches.has(index);
      path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
    });
  }

  on(eventName: 'select', handler: (r: Region) => void) {
    this.listeners.select.push(handler);
    return () => {
      const index = this.listeners.select.indexOf(handler);
      if (index !== -1) this.listeners.select.splice(index, 1);
    };
  }

  private emit(eventName: 'select', region: Region) {
    this.listeners.select.forEach(h => h(region));
  }

  private selectIndex(index: number): Region | null {
    if (!this.geojson || index < 0 || index >= this.geojson.features.length) return null;
    this.selectedIndex = index;
    const region = toRegion(this.geojson.features[index]);
    this.updateHighlights();
    this.emit('select', region);
    return region;
  }

  select(identifier: string): Region | null {
    if (!this.geojson) return null;
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) return null;

    const index = this.geojson.features.findIndex(feature => {
      const props = (feature.properties || {}) as Record<string, unknown>;
      const values = [
        props.ISO_A3,
        props.iso_a3,
        props.code,
        props.id,
        props.NAME,
        props.ADMIN,
        props.name
      ];
      return values.some(value => String(value ?? '').toLowerCase() === normalized);
    });

    return index === -1 ? null : this.selectIndex(index);
  }

  getSelected(): Region | null {
    if (!this.geojson || this.selectedIndex === null) return null;
    return toRegion(this.geojson.features[this.selectedIndex]);
  }

  clear() {
    this.selectedIndex = null;
    this.searchMatches.clear();
    this.updateHighlights();
  }

  reset() {
    this.clear();
  }

  search(query: string): Region[] {
    if (!this.geojson || !this.svg) return [];
    const q = query.toLowerCase().trim();
    const matches: number[] = [];
    if (q) {
      this.geojson.features.forEach((feature, index) => {
        const props = (feature.properties || {}) as Record<string, unknown>;
        const name = String(props.NAME || props.ADMIN || props.name || '').toLowerCase();
        const iso = String(props.ISO_A3 || props.iso_a3 || props.code || '').toLowerCase();
        if (name.includes(q) || iso.includes(q)) matches.push(index);
      });
    }

    this.searchMatches = new Set(matches);
    this.updateHighlights();
    return matches.map(index => toRegion(this.geojson!.features[index]));
  }

  destroy() {
    if (this.svg && this.container.contains(this.svg)) this.container.removeChild(this.svg);
    this.svg = null;
    this.geojson = null;
    this.listeners = { select: [] };
    this.selectedIndex = null;
    this.searchMatches.clear();
  }
}
