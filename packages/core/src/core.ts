import type { GeoCoreOptions, Region } from './types';
import { project, toRegion } from './utils';

export class GeoCore {
  private container: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private opts: Required<GeoCoreOptions>;
  private geojson: GeoJSON.FeatureCollection | null = null;
  private listeners: { select: ((r: Region) => void)[] } = { select: [] };

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
        const region = toRegion(feature);
        this.emit('select', region);
        this.highlight(path as SVGPathElement);
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

  private highlight(pathEl: SVGPathElement) {
    if (!this.svg) return;
    const paths = this.svg.querySelectorAll('path');
    paths.forEach(p => (p as SVGPathElement).setAttribute('fill', this.opts.initialFill));
    pathEl.setAttribute('fill', this.opts.highlightFill);
  }

  on(eventName: 'select', handler: (r: Region) => void) {
    this.listeners.select.push(handler);
  }

  private emit(eventName: 'select', region: Region) {
    this.listeners.select.forEach(h => h(region));
  }

  search(query: string) {
    if (!this.geojson || !this.svg) return;
    const q = query.toLowerCase().trim();
    const matches: number[] = [];
    this.geojson.features.forEach((f, i) => {
      const props = (f.properties || {}) as any;
      const name = (props.NAME || props.ADMIN || props.name || '').toString().toLowerCase();
      const iso = (props.ISO_A3 || props.iso_a3 || props.code || '').toString().toLowerCase();
      if (name.includes(q) || iso.includes(q)) matches.push(i);
    });
    const svgPaths = this.svg.querySelectorAll('path');
    svgPaths.forEach((p, idx) => {
      const fill = matches.includes(idx) ? this.opts.highlightFill : this.opts.initialFill;
      (p as SVGPathElement).setAttribute('fill', fill);
    });
  }

  destroy() {
    if (this.svg && this.container.contains(this.svg)) this.container.removeChild(this.svg);
    this.svg = null;
    this.geojson = null;
    this.listeners = { select: [] };
  }
}