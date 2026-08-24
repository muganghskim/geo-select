import type {
  FormFieldBinding,
  FormFieldOptions,
  FormValueKey,
  GeoCoreOptions,
  GeoLoadStatus,
  Region,
  SearchListBinding,
  SearchListOptions,
  SubdivisionDataOptions
} from './types.js';
import { project, toRegion, toSubdivisionRegion } from './utils.js';

type FormBindingState = {
  input: HTMLInputElement;
  valueKey: FormValueKey;
  scope: 'country' | 'subdivision';
  initialValue: string;
  syncing: boolean;
  onInput: () => void;
  onReset: () => void;
};

type SearchListBindingState = {
  input: HTMLInputElement;
  list: HTMLElement;
  options: SearchListOptions & {
    listLabel: string;
    emptyMessage: string;
    maxResults: number;
  };
  activeIndex: number;
  open: boolean;
  onFocus: () => void;
  onInput: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

type ResolvedGeoCoreOptions = Omit<
  Required<GeoCoreOptions>,
  'allowedCountries' | 'allowedSubdivisions' | 'excludedCountries' | 'excludedSubdivisions'
> & Pick<
  GeoCoreOptions,
  'allowedCountries' | 'allowedSubdivisions' | 'excludedCountries' | 'excludedSubdivisions'
>;

export class GeoCore {
  private container: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private countrySvgGroup: SVGGElement | null = null;
  private subdivisionSvgGroup: SVGGElement | null = null;
  private opts: ResolvedGeoCoreOptions;
  private ready: Promise<void>;
  private geojson: GeoJSON.FeatureCollection | null = null;
  private listeners: {
    select: ((r: Region) => void)[];
    'subdivision-select': ((r: Region) => void)[];
  } = { select: [], 'subdivision-select': [] };
  private selectedIndex: number | null = null;
  private searchMatches = new Set<number>();
  private searchQuery = '';
  private subdivisionSearchMatches = new Set<number>();
  private subdivisionSearchQuery = '';
  private continentFilter: string | null = null;
  private disabled = false;
  private subdivisionDisabled = false;
  private formBindings = new Set<FormBindingState>();
  private searchListBindings = new Set<SearchListBindingState>();
  private searchListId = 0;
  private subdivisionGeojson: GeoJSON.FeatureCollection | null = null;
  private subdivisionOptions: SubdivisionDataOptions = {};
  private subdivisionParent: Region | null = null;
  private selectedSubdivisionIndex: number | null = null;
  private loadStatus: GeoLoadStatus = 'idle';
  private loadError: Error | null = null;
  private zoomScale = 1;
  private zoomX = 0;
  private zoomY = 0;
  private panPointerId: number | null = null;
  private panPoint: [number, number] | null = null;
  private panMoved = false;
  private suppressNextClick = false;

  constructor(container: HTMLElement | null, options: GeoCoreOptions = {}) {
    if (!container) throw new Error('container HTMLElement is required');
    this.container = container;
    this.opts = {
      width: options.width || 900,
      height: options.height || 450,
      touchTargetSize: Math.max(options.touchTargetSize ?? 24, 0),
      zoom: options.zoom ?? true,
      maxZoom: Math.max(options.maxZoom ?? 8, 1),
      zoomStep: Math.max(options.zoomStep ?? 0.25, 0.01),
      dataUrl: options.dataUrl || '',
      data: options.data || (null as any),
      initialFill: options.initialFill || '#e6e6e6',
      highlightFill: options.highlightFill || '#ffcc00',
      locale: options.locale || '',
      direction: options.direction || 'auto',
      aliases: options.aliases || {},
      allowedCountries: options.allowedCountries,
      allowedSubdivisions: options.allowedSubdivisions,
      excludedCountries: options.excludedCountries,
      excludedSubdivisions: options.excludedSubdivisions,
      onReady: options.onReady || (() => {}),
      onZoom: options.onZoom || (() => {}),
      onError: options.onError || (() => {})
    };

    this.ready = this.init();
  }

  private async init() {
    this.loadStatus = 'loading';
    this.loadError = null;
    this.createSvg();
    try {
      if (this.opts.data) {
        this.geojson = this.opts.data;
      } else if (this.opts.dataUrl) {
        await this.loadData(this.opts.dataUrl);
      } else {
        throw new Error('No geojson provided. Use options.data or options.dataUrl');
      }
      this.render();
      this.loadStatus = 'ready';
      this.container.removeAttribute('role');
      this.container.setAttribute('data-geo-select-status', 'ready');
      this.opts.onReady();
    } catch (error) {
      this.handleLoadError(error);
    }
  }

  private handleLoadError(error: unknown) {
    this.loadError = error instanceof Error ? error : new Error(String(error));
    this.loadStatus = 'error';
    this.container.textContent = 'Unable to load region data. Try again.';
    this.container.setAttribute('role', 'alert');
    this.container.setAttribute('data-geo-select-status', 'error');
    this.opts.onError(this.loadError);
  }

  private async loadData(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load geojson: ${res.status}`);
    this.geojson = await res.json();
  }

  getStatus(): GeoLoadStatus {
    return this.loadStatus;
  }

  getLoadError(): Error | null {
    return this.loadError;
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  async retry(): Promise<boolean> {
    if (!this.opts.dataUrl || this.loadStatus === 'loading') return false;
    await this.init();
    return this.loadStatus === 'ready';
  }

  private createSvg() {
    this.container.innerHTML = '';
    this.container.removeAttribute('role');
    this.container.setAttribute('data-geo-select-status', 'loading');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');
    svg.setAttribute('viewBox', `0 0 ${this.opts.width} ${this.opts.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Interactive region map');
    const direction = this.resolvedDirection();
    if (direction) svg.setAttribute('dir', direction);
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '100%';
    svg.style.touchAction = 'manipulation';
    svg.setAttribute('data-geo-select-zoom', '1');
    this.bindMapNavigation(svg);
    this.svg = svg;
    this.container.appendChild(svg);
  }

  private bindMapNavigation(svg: SVGSVGElement) {
    svg.addEventListener('wheel', event => {
      if (!this.opts.zoom || event.deltaY === 0) return;
      event.preventDefault();
      const [x, y] = this.svgPoint(event.clientX, event.clientY);
      const factor = event.deltaY < 0 ? 1 + this.opts.zoomStep : 1 / (1 + this.opts.zoomStep);
      this.zoomAt(this.zoomScale * factor, x, y);
    }, { passive: false });

    svg.addEventListener('pointerdown', event => {
      if (!this.opts.zoom || this.zoomScale <= 1 || event.button !== 0) return;
      this.panPointerId = event.pointerId;
      this.panPoint = this.svgPoint(event.clientX, event.clientY);
      this.panMoved = false;
      svg.setPointerCapture?.(event.pointerId);
      svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('pointermove', event => {
      if (event.pointerId !== this.panPointerId || !this.panPoint) return;
      const point = this.svgPoint(event.clientX, event.clientY);
      const deltaX = point[0] - this.panPoint[0];
      const deltaY = point[1] - this.panPoint[1];
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) this.panMoved = true;
      this.zoomX += deltaX;
      this.zoomY += deltaY;
      this.panPoint = point;
      this.clampZoomPosition();
      this.applyZoomTransform();
    });

    const finishPan = (event: PointerEvent) => {
      if (event.pointerId !== this.panPointerId) return;
      this.suppressNextClick = this.panMoved;
      if (this.suppressNextClick) {
        globalThis.setTimeout(() => {
          this.suppressNextClick = false;
        }, 0);
      }
      svg.releasePointerCapture?.(event.pointerId);
      this.panPointerId = null;
      this.panPoint = null;
      this.panMoved = false;
      svg.style.cursor = this.zoomScale > 1 ? 'grab' : '';
    };
    svg.addEventListener('pointerup', finishPan);
    svg.addEventListener('pointercancel', finishPan);
    svg.addEventListener('click', event => {
      if (!this.suppressNextClick) return;
      this.suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  private svgPoint(clientX: number, clientY: number): [number, number] {
    if (!this.svg) return [this.opts.width / 2, this.opts.height / 2];
    const rect = this.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return [this.opts.width / 2, this.opts.height / 2];
    const scale = Math.min(rect.width / this.opts.width, rect.height / this.opts.height);
    const offsetX = (rect.width - this.opts.width * scale) / 2;
    const offsetY = (rect.height - this.opts.height * scale) / 2;
    return [
      Math.min(this.opts.width, Math.max(0, (clientX - rect.left - offsetX) / scale)),
      Math.min(this.opts.height, Math.max(0, (clientY - rect.top - offsetY) / scale))
    ];
  }

  private clampZoomPosition() {
    if (this.zoomScale <= 1) {
      this.zoomX = 0;
      this.zoomY = 0;
      return;
    }
    this.zoomX = Math.min(0, Math.max(this.opts.width * (1 - this.zoomScale), this.zoomX));
    this.zoomY = Math.min(0, Math.max(this.opts.height * (1 - this.zoomScale), this.zoomY));
  }

  private applyZoomTransform() {
    const transform = `translate(${this.zoomX} ${this.zoomY}) scale(${this.zoomScale})`;
    this.countrySvgGroup?.setAttribute('transform', transform);
    this.subdivisionSvgGroup?.setAttribute('transform', transform);
    if (this.svg) {
      this.svg.setAttribute('data-geo-select-zoom', String(this.zoomScale));
      this.svg.style.cursor = this.zoomScale > 1 ? 'grab' : '';
    }
  }

  private zoomAt(scale: number, centerX: number, centerY: number): number {
    if (!this.opts.zoom || !Number.isFinite(scale)) return this.zoomScale;
    const nextScale = Math.min(this.opts.maxZoom, Math.max(1, scale));
    if (nextScale === this.zoomScale) return this.zoomScale;
    const ratio = nextScale / this.zoomScale;
    this.zoomX = centerX - (centerX - this.zoomX) * ratio;
    this.zoomY = centerY - (centerY - this.zoomY) * ratio;
    this.zoomScale = nextScale;
    this.clampZoomPosition();
    this.applyZoomTransform();
    this.opts.onZoom(this.zoomScale);
    return this.zoomScale;
  }

  getZoom(): number {
    return this.zoomScale;
  }

  zoomIn(): number {
    return this.zoomAt(
      this.zoomScale * (1 + this.opts.zoomStep),
      this.opts.width / 2,
      this.opts.height / 2
    );
  }

  zoomOut(): number {
    return this.zoomAt(
      this.zoomScale / (1 + this.opts.zoomStep),
      this.opts.width / 2,
      this.opts.height / 2
    );
  }

  resetZoom(): number {
    return this.zoomAt(1, this.opts.width / 2, this.opts.height / 2);
  }

  private render() {
    if (!this.svg || !this.geojson) return;
    const svg = this.svg;
    const g = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement;
    g.setAttribute('class', 'geo-select-country-layer');
    this.countrySvgGroup = g;

    this.geojson.features.forEach((feature, i) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      const d = this.pathFromGeometry(feature.geometry);
      path.setAttribute('d', d);
      path.setAttribute('fill', this.opts.initialFill);
      path.setAttribute('stroke', '#999');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('clip-rule', 'evenodd');
      path.setAttribute('data-index', String(i));
      path.setAttribute('class', 'geo-select-region');
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('focusable', 'true');
      path.setAttribute('aria-label', this.regionLabel(feature));
      path.setAttribute('aria-pressed', 'false');
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
      path.addEventListener('keydown', event => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
        event.preventDefault();
        this.selectIndex(i);
      });
      path.addEventListener('focus', () => {
        path.setAttribute('stroke', '#333');
        path.setAttribute('stroke-width', '2');
      });
      path.addEventListener('blur', () => {
        path.setAttribute('stroke', '#999');
        path.setAttribute('stroke-width', '1');
      });

      g.appendChild(path);
    });

    this.geojson.features.forEach((feature, index) => {
      if (!this.needsTouchTarget(feature) || !this.opts.touchTargetSize) return;
      const region = toRegion(feature);
      if (!region.centroid) return;
      const [cx, cy] = project(
        region.centroid[0],
        region.centroid[1],
        this.opts.width,
        this.opts.height
      );
      const target = document.createElementNS(svg.namespaceURI, 'circle');
      target.setAttribute('class', 'geo-select-hit-target');
      target.setAttribute('data-index', String(index));
      target.setAttribute('cx', String(cx));
      target.setAttribute('cy', String(cy));
      target.setAttribute('r', String(this.opts.touchTargetSize / 2));
      target.setAttribute('fill', '#000');
      target.setAttribute('fill-opacity', '0');
      target.setAttribute('aria-hidden', 'true');
      target.setAttribute('tabindex', '-1');
      target.setAttribute('pointer-events', 'all');
      (target as SVGCircleElement).style.cursor = 'pointer';
      target.addEventListener('click', () => {
        this.selectIndex(index);
      });
      g.appendChild(target);
    });

    svg.appendChild(g);
    this.applyZoomTransform();
    this.updateVisibility();
    this.updateHighlights();
    this.syncSearchListBindings('filter');
  }

  private clearRenderedSubdivisions() {
    if (this.subdivisionSvgGroup && this.svg?.contains(this.subdivisionSvgGroup)) {
      this.svg.removeChild(this.subdivisionSvgGroup);
    }
    this.subdivisionSvgGroup = null;
    if (this.countrySvgGroup) this.countrySvgGroup.setAttribute('display', '');
  }

  private subdivisionIdentifier(feature: GeoJSON.Feature): string | undefined {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const configured = this.subdivisionOptions.codeProperty
      ? props[this.subdivisionOptions.codeProperty]
      : undefined;
    const region = toSubdivisionRegion(feature);
    const identifier = configured ?? region.subdivision?.code ?? region.id;
    return identifier === null || identifier === undefined ? undefined : String(identifier);
  }

  private renderSubdivisions() {
    if (!this.svg || !this.subdivisionGeojson?.features.length) {
      this.clearRenderedSubdivisions();
      return;
    }

    this.clearRenderedSubdivisions();
    const svg = this.svg;
    const group = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement;
    group.setAttribute('class', 'geo-select-subdivision-layer');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Subdivision map');

    this.subdivisionGeojson.features.forEach((feature, index) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', this.pathFromGeometry(feature.geometry));
      path.setAttribute('fill', this.opts.initialFill);
      path.setAttribute('stroke', '#666');
      path.setAttribute('stroke-width', '1');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('clip-rule', 'evenodd');
      path.setAttribute('data-index', String(index));
      path.setAttribute('class', 'geo-select-subdivision');
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', this.subdivisionDisabled ? '-1' : '0');
      path.setAttribute('focusable', 'true');
      path.setAttribute('aria-label', this.regionLabel(feature, 'subdivision'));
      path.setAttribute('aria-pressed', 'false');
      path.setAttribute('aria-disabled', String(this.subdivisionDisabled));
      (path as SVGPathElement).style.cursor = 'pointer';

      path.addEventListener('click', () => {
        if (this.subdivisionDisabled) return;
        const identifier = this.subdivisionIdentifier(feature);
        if (identifier) this.selectSubdivision(identifier);
      });
      path.addEventListener('mouseenter', () => path.setAttribute('opacity', '0.9'));
      path.addEventListener('mouseleave', () => path.setAttribute('opacity', '1'));
      path.addEventListener('keydown', event => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
        event.preventDefault();
        if (this.subdivisionDisabled) return;
        const identifier = this.subdivisionIdentifier(feature);
        if (identifier) this.selectSubdivision(identifier);
      });
      path.addEventListener('focus', () => {
        path.setAttribute('stroke', '#222');
        path.setAttribute('stroke-width', '2');
      });
      path.addEventListener('blur', () => {
        path.setAttribute('stroke', '#666');
        path.setAttribute('stroke-width', '1');
      });
      group.appendChild(path);
    });

    this.subdivisionSvgGroup = group;
    svg.appendChild(group);
    this.applyZoomTransform();
    if (this.countrySvgGroup) this.countrySvgGroup.setAttribute('display', 'none');
    this.updateSubdivisionVisibility();
    this.updateSubdivisionHighlights();
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

  private needsTouchTarget(feature: GeoJSON.Feature): boolean {
    if (!this.opts.touchTargetSize || !feature.geometry) return false;
    const points: [number, number][] = [];
    const collect = (value: unknown) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        points.push([value[0], value[1]]);
        return;
      }
      value.forEach(collect);
    };
    const collectGeometry = (geometry: GeoJSON.Geometry) => {
      if (geometry.type === 'GeometryCollection') {
        geometry.geometries.forEach(collectGeometry);
      } else {
        collect(geometry.coordinates);
      }
    };
    collectGeometry(feature.geometry);
    if (!points.length) return false;

    const projected = points.map(([lon, lat]) => project(lon, lat, this.opts.width, this.opts.height));
    const xs = projected.map(([x]) => x);
    const ys = projected.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return Math.max(width, height) < this.opts.touchTargetSize;
  }

  private updateHighlights() {
    const paths = this.countrySvgGroup?.querySelectorAll('path.geo-select-region');
    if (!paths) return;
    paths.forEach((path, index) => {
      const selected = index === this.selectedIndex;
      const highlighted = selected || this.searchMatches.has(index);
      path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
      path.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  private updateSubdivisionHighlights() {
    const paths = this.subdivisionSvgGroup?.querySelectorAll('path.geo-select-subdivision');
    if (!paths) return;
    paths.forEach((path, index) => {
      const selected = index === this.selectedSubdivisionIndex;
      const highlighted = selected || this.subdivisionSearchMatches.has(index);
      path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
      path.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  private regionFormValue(region: Region, valueKey: FormValueKey): string {
    if (region.level === 'subdivision') {
      if (valueKey === 'id') return region.id || '';
      return region.subdivision?.code || region.id || '';
    }
    if (valueKey === 'iso2') return region.country?.iso2 || region.id || '';
    if (valueKey === 'iso3') return region.country?.iso3 || region.id || '';
    return region.id || '';
  }

  private selectedFormValue(valueKey: FormValueKey, scope: 'country' | 'subdivision'): string {
    const selected = scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected();
    return selected ? this.regionFormValue(selected, valueKey) : '';
  }

  private dispatchFormEvent(input: HTMLInputElement, type: 'input' | 'change') {
    const EventConstructor = input.ownerDocument.defaultView?.Event || Event;
    input.dispatchEvent(new EventConstructor(type, { bubbles: true }));
  }

  private syncFormBinding(binding: FormBindingState) {
    const value = this.selectedFormValue(binding.valueKey, binding.scope);
    binding.syncing = true;
    binding.input.value = value;
    binding.input.setCustomValidity('');
    this.dispatchFormEvent(binding.input, 'input');
    this.dispatchFormEvent(binding.input, 'change');
    binding.syncing = false;
  }

  private syncFormBindings() {
    this.formBindings.forEach(binding => this.syncFormBinding(binding));
  }

  private regionLabelForSearch(region: Region): string {
    return this.displayName(region) || (region.level === 'subdivision' ? 'Unnamed subdivision' : 'Unnamed region');
  }

  private visibleRegions(): Region[] {
    if (!this.geojson) return [];
    return this.geojson.features
      .map((_, index) => index)
      .filter(index => this.isVisible(index))
      .map(index => toRegion(this.geojson!.features[index]));
  }

  private searchResults(): Region[] {
    return this.searchResultsForScope('country');
  }

  private searchResultsForScope(scope: 'country' | 'subdivision'): Region[] {
    if (scope === 'subdivision') {
      if (!this.subdivisionGeojson) return [];
      if (!this.subdivisionSearchQuery) {
        return this.subdivisionGeojson.features.map(feature => toSubdivisionRegion(feature));
      }
      return [...this.subdivisionSearchMatches]
        .map(index => toSubdivisionRegion(this.subdivisionGeojson!.features[index]));
    }
    if (!this.geojson) return [];
    if (!this.searchQuery) return this.visibleRegions();
    return [...this.searchMatches].map(index => toRegion(this.geojson!.features[index]));
  }

  private syncSearchListBindings(
    reason: 'search' | 'selection' | 'clear' | 'filter' = 'search',
    scope: 'country' | 'subdivision' = 'country'
  ) {
    const selected = scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected();
    if (reason === 'selection' || reason === 'clear') {
      if (scope === 'subdivision') {
        this.subdivisionSearchQuery = '';
        this.subdivisionSearchMatches.clear();
      } else {
        this.searchQuery = '';
        this.searchMatches.clear();
        this.updateHighlights();
      }
    }
    this.searchListBindings.forEach(binding => {
      if ((binding.options.scope || 'country') !== scope) return;
      if (reason === 'selection') {
        binding.input.value = selected
          ? (binding.options.getLabel ? binding.options.getLabel(selected) : this.regionLabelForSearch(selected))
          : '';
        binding.open = false;
      } else if (reason === 'clear') {
        binding.input.value = '';
        binding.open = false;
      }
      this.renderSearchList(binding);
    });
  }

  private renderSearchList(binding: SearchListBindingState): Region[] {
    const scope = binding.options.scope || 'country';
    const results = this.searchResultsForScope(scope);
    const visibleResults = binding.options.maxResults > 0
      ? results.slice(0, binding.options.maxResults)
      : results;
    const list = binding.list;
    const input = binding.input;
    list.textContent = '';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', binding.options.listLabel);
    list.hidden = !binding.open;
    input.setAttribute('aria-expanded', String(binding.open));

    if (binding.activeIndex >= visibleResults.length) binding.activeIndex = Math.max(visibleResults.length - 1, 0);
    const selectedId = (scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected())?.id;
    visibleResults.forEach((region, index) => {
      const option = list.ownerDocument.createElement('li');
      const optionId = `${list.id}-option-${index}`;
      const label = binding.options.getLabel ? binding.options.getLabel(region) : this.regionLabelForSearch(region);
      option.id = optionId;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(region.id === selectedId));
      option.setAttribute('tabindex', '-1');
      option.textContent = label;
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => {
        const identifier = region.id || region.country?.iso2 || region.name;
        if (identifier) {
          if (scope === 'subdivision') this.selectSubdivision(identifier);
          else this.select(identifier);
        }
      });
      list.appendChild(option);
    });

    if (!visibleResults.length && binding.open) {
      const empty = list.ownerDocument.createElement('li');
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = binding.options.emptyMessage;
      list.appendChild(empty);
    }

    if (binding.open && visibleResults.length) {
      const activeId = `${list.id}-option-${binding.activeIndex}`;
      input.setAttribute('aria-activedescendant', activeId);
      list.children[binding.activeIndex]?.classList.add('geo-select-search-option-active');
    } else {
      input.removeAttribute('aria-activedescendant');
    }
    return visibleResults;
  }

  private moveSearchListActive(binding: SearchListBindingState, direction: 1 | -1 | 0) {
    const results = this.searchResultsForScope(binding.options.scope || 'country');
    const count = binding.options.maxResults > 0 ? Math.min(results.length, binding.options.maxResults) : results.length;
    if (!count) return;
    binding.open = true;
    if (direction === 0) binding.activeIndex = 0;
    else binding.activeIndex = (binding.activeIndex + direction + count) % count;
    this.renderSearchList(binding);
  }

  private regionLabel(feature: GeoJSON.Feature, scope: 'country' | 'subdivision' = 'country'): string {
    const region = scope === 'subdivision' ? toSubdivisionRegion(feature) : toRegion(feature);
    const name = this.displayName(region);
    const id = scope === 'subdivision'
      ? region.subdivision?.code || region.id
      : region.country?.iso3 || region.id;
    return name && id
      ? `${String(name)} (${String(id)})`
      : String(name || id || (scope === 'subdivision' ? 'Unnamed subdivision' : 'Unnamed region'));
  }

  private normalizedText(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private localeLanguage(): string {
    return this.opts.locale.trim().toLowerCase().split(/[-_]/)[0];
  }

  private resolvedDirection(): 'ltr' | 'rtl' | undefined {
    if (this.opts.direction === 'ltr' || this.opts.direction === 'rtl') return this.opts.direction;
    if (this.opts.direction !== 'auto') return undefined;
    return ['ar', 'fa', 'he', 'ur'].includes(this.localeLanguage()) ? 'rtl' : undefined;
  }

  private localizedProperty(props: Record<string, unknown>): string | undefined {
    const language = this.localeLanguage();
    if (!language) return undefined;
    const languageUpper = language.toUpperCase();
    const keys = [
      `name_${language}`,
      `name-${language}`,
      `NAME_${languageUpper}`,
      `NAME_${language}`
    ];
    for (const key of keys) {
      const value = props[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return undefined;
  }

  private displayName(region: Region): string {
    const props = region.properties || {};
    const localized = this.localizedProperty(props);
    if (region.level === 'subdivision') {
      return localized
        || (this.localeLanguage() === 'ko' ? region.subdivision?.localizedName : undefined)
        || region.subdivision?.name
        || region.name
        || region.id
        || '';
    }
    if (!this.opts.locale) return region.country?.localizedName || region.name || region.id || '';
    return localized
      || (this.localeLanguage() === 'ko' ? region.country?.localizedName : undefined)
      || region.name
      || region.id
      || '';
  }

  private featureKeys(feature: GeoJSON.Feature): string[] {
    const props = (feature.properties || {}) as Record<string, unknown>;
    return [
      props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL,
      props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3,
      props.iso_a3, props.iso3166_2, props.ISO_3166_2, props.code, props.id,
      feature.id
    ].filter(value => value !== null && value !== undefined).map(value => String(value));
  }

  private configuredAliases(feature: GeoJSON.Feature): string[] {
    const aliases = this.opts.aliases;
    return this.featureKeys(feature).flatMap(key => aliases[key] || aliases[key.toUpperCase()] || aliases[key.toLowerCase()] || []);
  }

  private searchableValues(feature: GeoJSON.Feature): string[] {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const capitals = Array.isArray(props.capitals)
      ? props.capitals.map(capital =>
          capital && typeof capital === 'object'
            ? (capital as Record<string, unknown>).name
            : undefined
        )
      : [];
    return [
      props.NAME,
      props.NAME_EN,
      props.NAME_KO,
      props.ADMIN,
      props.name,
      props.officialName,
      props.localizedName,
      this.localizedProperty(props),
      ...(Array.isArray(props.aliases) ? props.aliases : [props.aliases, props.nameAliases, props.ALIASES]),
      ...this.configuredAliases(feature),
      props.ISO_A2,
      props.ISO_A2_EH,
      props.ISO_A3,
      props.ISO_A3_EH,
      props.iso2,
      props.iso3,
      props.iso_a3,
      props.code,
      props.id,
      ...capitals
    ]
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => this.normalizedText(value));
  }

  private continentFor(feature: GeoJSON.Feature): string {
    const props = (feature.properties || {}) as Record<string, unknown>;
    return String(
      props.continent || props.CONTINENT || props.CONTINENT_UN || props.REGION_UN || ''
    ).trim();
  }

  private isVisible(index: number): boolean {
    if (!this.geojson || !this.isCountryAllowed(this.geojson.features[index])) return false;
    if (!this.continentFilter) return true;
    return this.continentFor(this.geojson.features[index]).toLowerCase() === this.continentFilter;
  }

  private policyCodes(feature: GeoJSON.Feature): string[] {
    const props = (feature.properties || {}) as Record<string, unknown>;
    return [
      props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL,
      props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3,
      props.iso_a3, props.code, props.id, feature.id
    ]
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
      .map(value => this.normalizedText(value));
  }

  private matchesPolicy(codes: string[], allowed: string[] | undefined, excluded: string[] | undefined): boolean {
    const allowedCodes = allowed?.map(value => this.normalizedText(value)) || [];
    const excludedCodes = excluded?.map(value => this.normalizedText(value)) || [];
    if (allowed && !codes.some(code => allowedCodes.includes(code))) return false;
    if (codes.some(code => excludedCodes.includes(code))) return false;
    return true;
  }

  private isCountryAllowed(feature: GeoJSON.Feature): boolean {
    return this.matchesPolicy(
      this.policyCodes(feature),
      this.opts.allowedCountries,
      this.opts.excludedCountries
    );
  }

  private updateVisibility() {
    const paths = this.countrySvgGroup?.querySelectorAll('path.geo-select-region');
    if (!paths) return;
    paths.forEach((path, index) => {
      const visible = this.isVisible(index);
      path.setAttribute('display', visible ? '' : 'none');
      path.setAttribute('aria-hidden', visible ? 'false' : 'true');
      path.setAttribute('tabindex', visible && !this.disabled ? '0' : '-1');
    });
    this.countrySvgGroup?.querySelectorAll<SVGCircleElement>('.geo-select-hit-target').forEach(target => {
      const index = Number(target.getAttribute('data-index'));
      const visible = Number.isInteger(index) && this.isVisible(index);
      target.setAttribute('display', visible ? '' : 'none');
      target.setAttribute('pointer-events', visible && !this.disabled ? 'all' : 'none');
      target.setAttribute('aria-hidden', 'true');
    });
  }

  private updateSubdivisionVisibility() {
    const paths = this.subdivisionSvgGroup?.querySelectorAll('path.geo-select-subdivision');
    if (!paths) return;
    paths.forEach(path => {
      path.setAttribute('display', '');
      path.setAttribute('aria-hidden', 'false');
      path.setAttribute('aria-disabled', String(this.subdivisionDisabled));
      path.setAttribute('tabindex', this.subdivisionDisabled ? '-1' : '0');
    });
  }

  private updateSearchMatches() {
    this.searchMatches.clear();
    if (!this.geojson || !this.searchQuery) return;

    this.geojson.features.forEach((feature, index) => {
      if (!this.isVisible(index)) return;
      if (this.searchableValues(feature).some(value => value.includes(this.searchQuery))) {
        this.searchMatches.add(index);
      }
    });
  }

  on(eventName: 'select' | 'subdivision-select', handler: (r: Region) => void) {
    this.listeners[eventName].push(handler);
    return () => {
      const handlers = this.listeners[eventName];
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    };
  }

  private emit(eventName: 'select' | 'subdivision-select', region: Region) {
    this.listeners[eventName].forEach(h => h(region));
  }

  private countryIndex(identifier: string): number {
    if (!this.geojson) return -1;
    const normalized = this.normalizedText(identifier);
    if (!normalized) return -1;
    return this.geojson.features.findIndex((feature, featureIndex) => {
      if (!this.isVisible(featureIndex)) return false;
      return this.searchableValues(feature).some(value => value === normalized);
    });
  }

  private selectIndex(index: number): Region | null {
    if (!this.geojson || index < 0 || index >= this.geojson.features.length) return null;
    if (this.disabled) return null;
    this.selectedIndex = index;
    const region = toRegion(this.geojson.features[index]);
    const parentChanged = this.subdivisionParent !== null && this.subdivisionParent.id !== region.id;
    this.resetSubdivisionState();
    if (parentChanged) {
      this.subdivisionGeojson = null;
      this.subdivisionParent = null;
      this.subdivisionOptions = {};
      this.clearRenderedSubdivisions();
    }
    this.updateHighlights();
    this.syncFormBindings();
    this.syncSearchListBindings('clear', 'subdivision');
    this.syncSearchListBindings('selection');
    this.emit('select', region);
    return region;
  }

  select(identifier: string): Region | null {
    if (!this.geojson) return null;
    const index = this.countryIndex(identifier);

    return index === -1 ? null : this.selectIndex(index);
  }

  getSelected(): Region | null {
    if (!this.geojson || this.selectedIndex === null) return null;
    return toRegion(this.geojson.features[this.selectedIndex]);
  }

  getSelectedSubdivision(): Region | null {
    if (!this.subdivisionGeojson || this.selectedSubdivisionIndex === null) return null;
    return toSubdivisionRegion(this.subdivisionGeojson.features[this.selectedSubdivisionIndex]);
  }

  private subdivisionValues(feature: GeoJSON.Feature): string[] {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const configured = this.subdivisionOptions;
    const values = [
      configured.codeProperty ? props[configured.codeProperty] : undefined,
      props.iso3166_2,
      props.ISO_3166_2,
      props.iso31662,
      props.code,
      props.code_3166_2,
      props.name,
      props.NAME_1,
      props.NAME,
      props.localizedName,
      props.NAME_KO,
      props.name_ko,
      this.localizedProperty(props),
      ...(Array.isArray(props.aliases) ? props.aliases : [props.aliases, props.nameAliases, props.ALIASES]),
      ...this.configuredAliases(feature),
      props.capital
    ];
    return values
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => this.normalizedText(value));
  }

  private isSubdivisionAllowed(feature: GeoJSON.Feature): boolean {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const codes = [
      this.subdivisionOptions.codeProperty ? props[this.subdivisionOptions.codeProperty] : undefined,
      props.iso3166_2,
      props.ISO_3166_2,
      props.iso31662,
      props.code,
      props.code_3166_2,
      feature.id
    ]
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
      .map(value => this.normalizedText(value));
    return this.matchesPolicy(
      codes,
      this.opts.allowedSubdivisions,
      this.opts.excludedSubdivisions
    );
  }

  private subdivisionBelongsTo(
    feature: GeoJSON.Feature,
    parent: Region,
    options: SubdivisionDataOptions
  ): boolean {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const parentIso2 = (parent.country?.iso2 || (parent.id?.length === 2 ? parent.id : undefined))?.toLowerCase();
    const parentIso3 = parent.country?.iso3?.toLowerCase();
    const parentValues = [
      options.parentProperty ? props[options.parentProperty] : undefined,
      props.parentIso2,
      props.parent_iso2,
      props.countryIso2,
      props.parentIso3,
      props.parent_iso3,
      props.countryIso3,
      props.ADM0_A3,
      props.ISO_A2,
      props.ISO_A3
    ]
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
      .map(value => String(value).trim().toLowerCase());

    if (parentValues.some(value => value === parentIso2 || value === parentIso3)) return true;
    const code = options.codeProperty
      ? props[options.codeProperty]
      : props.iso3166_2 || props.ISO_3166_2 || props.iso31662 || props.code || props.code_3166_2;
    const normalizedCode = code ? String(code).trim().toLowerCase() : '';
    if (parentIso2 && normalizedCode.startsWith(`${parentIso2}-`)) return true;
    if (parentIso3 && normalizedCode.startsWith(`${parentIso3}-`)) return true;
    return options.allowUnscoped === true;
  }

  private resetSubdivisionState() {
    this.selectedSubdivisionIndex = null;
    this.subdivisionSearchQuery = '';
    this.subdivisionSearchMatches.clear();
  }

  async loadSubdivisions(
    parentIdentifier: string,
    options: SubdivisionDataOptions = {}
  ): Promise<Region[]> {
    await this.ready;
    if (!this.geojson) throw new Error('Country data must be loaded before subdivisions');
    if (options.data && options.dataUrl) throw new Error('Use either subdivision data or dataUrl, not both');

    const parentIndex = this.countryIndex(parentIdentifier);
    if (parentIndex === -1) throw new Error(`Unknown country: ${parentIdentifier}`);
    const parent = toRegion(this.geojson.features[parentIndex]);
    let data = options.data;
    if (!data && options.dataUrl) {
      const response = await fetch(options.dataUrl);
      if (!response.ok) throw new Error(`Failed to load subdivisions: ${response.status}`);
      data = await response.json() as GeoJSON.FeatureCollection;
    }
    if (!data) throw new Error('Subdivision data or dataUrl is required');

    this.subdivisionOptions = options;
    this.subdivisionGeojson = {
      ...data,
      features: data.features.filter(feature =>
        this.subdivisionBelongsTo(feature, parent, options) && this.isSubdivisionAllowed(feature)
      )
    };
    this.subdivisionParent = parent;
    this.selectedSubdivisionIndex = null;
    this.subdivisionSearchQuery = '';
    this.subdivisionSearchMatches.clear();
    this.renderSubdivisions();
    this.syncFormBindings();
    this.syncSearchListBindings('clear', 'subdivision');
    return this.getSubdivisions();
  }

  getSubdivisions(): Region[] {
    return this.subdivisionGeojson
      ? this.subdivisionGeojson.features.map(feature => toSubdivisionRegion(feature))
      : [];
  }

  getSubdivisionParent(): Region | null {
    return this.subdivisionParent;
  }

  searchSubdivisions(query: string): Region[] {
    this.subdivisionSearchQuery = this.normalizedText(query);
    this.subdivisionSearchMatches.clear();
    if (this.subdivisionGeojson && this.subdivisionSearchQuery) {
      this.subdivisionGeojson.features.forEach((feature, index) => {
        if (this.subdivisionValues(feature).some(value => value.includes(this.subdivisionSearchQuery))) {
          this.subdivisionSearchMatches.add(index);
        }
      });
    }
    this.updateSubdivisionHighlights();
    this.syncSearchListBindings('search', 'subdivision');
    return this.searchResultsForScope('subdivision');
  }

  selectSubdivision(identifier: string): Region | null {
    if (this.subdivisionDisabled || !this.subdivisionGeojson) return null;
    const normalized = this.normalizedText(identifier);
    if (!normalized) return null;
    const index = this.subdivisionGeojson.features.findIndex(feature =>
      this.subdivisionValues(feature).some(value => value === normalized)
    );
    if (index === -1) return null;
    this.selectedSubdivisionIndex = index;
    const region = toSubdivisionRegion(this.subdivisionGeojson.features[index]);
    this.updateSubdivisionHighlights();
    this.syncFormBindings();
    this.syncSearchListBindings('selection', 'subdivision');
    this.emit('subdivision-select', region);
    return region;
  }

  clearSubdivision() {
    this.resetSubdivisionState();
    this.updateSubdivisionHighlights();
    this.syncFormBindings();
    this.syncSearchListBindings('clear', 'subdivision');
  }

  clear() {
    this.selectedIndex = null;
    this.searchMatches.clear();
    this.searchQuery = '';
    this.updateHighlights();
    this.syncFormBindings();
    this.syncSearchListBindings('clear');
  }

  reset() {
    this.clear();
  }

  getContinents(): string[] {
    if (!this.geojson) return [];
    return [...new Set(this.geojson.features
      .filter(feature => this.isCountryAllowed(feature))
      .map(feature => this.continentFor(feature))
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  getContinent(): string | null {
    return this.continentFilter;
  }

  setContinent(continent: string | null): Region[] {
    const normalized = continent?.trim().toLowerCase() || null;
    this.continentFilter = normalized;
    let selectionCleared = false;

    if (this.selectedIndex !== null && !this.isVisible(this.selectedIndex)) {
      this.selectedIndex = null;
      this.syncFormBindings();
      selectionCleared = true;
    }
    this.updateVisibility();
    this.updateSearchMatches();
    this.updateHighlights();
    this.syncSearchListBindings(selectionCleared ? 'clear' : 'filter');
    if (!this.geojson) return [];
    return this.geojson.features
      .map((_, index) => index)
      .filter(index => this.isVisible(index))
      .map(index => toRegion(this.geojson!.features[index]));
  }

  getVisibleRegions(): Region[] {
    return this.visibleRegions();
  }

  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    this.searchListBindings.forEach(binding => {
      if ((binding.options.scope || 'country') !== 'country') return;
      binding.input.disabled = disabled;
      binding.input.setAttribute('aria-disabled', String(disabled));
      if (disabled) binding.open = false;
      this.renderSearchList(binding);
    });
    if (!this.svg) return;
    this.svg.setAttribute('aria-disabled', String(disabled));
    this.countrySvgGroup?.querySelectorAll('path.geo-select-region').forEach(path => {
      path.setAttribute('aria-disabled', String(disabled));
      path.setAttribute('tabindex', disabled || path.getAttribute('display') === 'none' ? '-1' : '0');
    });
    this.countrySvgGroup?.querySelectorAll<SVGCircleElement>('.geo-select-hit-target').forEach(target => {
      target.setAttribute(
        'pointer-events',
        disabled || target.getAttribute('display') === 'none' ? 'none' : 'all'
      );
    });
  }

  setSubdivisionDisabled(disabled: boolean) {
    this.subdivisionDisabled = disabled;
    this.updateSubdivisionVisibility();
    this.searchListBindings.forEach(binding => {
      if ((binding.options.scope || 'country') !== 'subdivision') return;
      binding.input.disabled = disabled;
      binding.input.setAttribute('aria-disabled', String(disabled));
      if (disabled) binding.open = false;
      this.renderSearchList(binding);
    });
  }

  bindFormField(input: HTMLInputElement, options: FormFieldOptions = {}): FormFieldBinding {
    if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') {
      throw new Error('bindFormField requires an input element');
    }

    const binding: FormBindingState = {
      input,
      valueKey: options.valueKey || 'iso2',
      scope: options.scope || 'country',
      initialValue: input.value,
      syncing: false,
      onInput: () => {
        if (binding.syncing || (binding.scope === 'subdivision' ? this.subdivisionDisabled : this.disabled)) return;
        const value = input.value.trim();
        if (!value) {
          if (binding.scope === 'subdivision') this.clearSubdivision();
          else this.clear();
          input.setCustomValidity('');
          return;
        }

        const selected = binding.scope === 'subdivision'
          ? this.selectSubdivision(value)
          : this.select(value);
        if (!selected) {
          if (binding.scope === 'subdivision') this.clearSubdivision();
          else this.clear();
          input.setCustomValidity('Unknown region value');
        }
      },
      onReset: () => {
        Promise.resolve().then(() => {
          if (!this.formBindings.has(binding)) return;
          input.value = binding.initialValue;
          this.dispatchFormEvent(input, 'input');
        });
      }
    };

    if (options.required !== undefined) input.required = options.required;
    input.addEventListener('input', binding.onInput);
    input.addEventListener('change', binding.onInput);
    input.form?.addEventListener('reset', binding.onReset);
    this.formBindings.add(binding);

    const initialValue = input.value.trim();
    if (initialValue) {
      const selected = binding.scope === 'subdivision'
        ? this.selectSubdivision(initialValue)
        : this.select(initialValue);
      if (!selected) input.setCustomValidity('Unknown region value');
    } else {
      this.syncFormBinding(binding);
    }
    if (binding.scope === 'subdivision') this.setSubdivisionDisabled(options.disabled ?? input.disabled);
    else this.setDisabled(options.disabled ?? input.disabled);

    return {
      input,
      setDisabled: disabled => {
        input.disabled = disabled;
        if (binding.scope === 'subdivision') this.setSubdivisionDisabled(disabled);
        else this.setDisabled(disabled);
      },
      destroy: () => {
        input.removeEventListener('input', binding.onInput);
        input.removeEventListener('change', binding.onInput);
        input.form?.removeEventListener('reset', binding.onReset);
        this.formBindings.delete(binding);
        if (this.formBindings.size === 0) {
          if (binding.scope === 'subdivision') this.setSubdivisionDisabled(false);
          else this.setDisabled(false);
        }
      }
    };
  }

  bindSearchList(
    input: HTMLInputElement,
    list: HTMLElement,
    options: SearchListOptions = {}
  ): SearchListBinding {
    if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') {
      throw new Error('bindSearchList requires an input element');
    }
    if (!list || list.nodeType !== 1) throw new Error('bindSearchList requires a list element');

    if (!list.id) {
      this.searchListId += 1;
      list.id = `geo-select-search-list-${this.searchListId}`;
    }
    const binding: SearchListBindingState = {
      input,
      list,
      options: {
        ...options,
        listLabel: options.listLabel || 'Region search results',
        emptyMessage: options.emptyMessage || 'No matching regions',
        maxResults: options.maxResults ?? 0
      },
      activeIndex: 0,
      open: false,
      onFocus: () => {
        if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled) return;
        binding.open = true;
        this.renderSearchList(binding);
      },
      onInput: () => {
        if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled) return;
        binding.open = true;
        if ((options.scope || 'country') === 'subdivision') this.searchSubdivisions(input.value);
        else this.search(input.value);
      },
      onKeyDown: event => {
        if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.moveSearchListActive(binding, 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.moveSearchListActive(binding, -1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          this.moveSearchListActive(binding, 0);
        } else if (event.key === 'End') {
          event.preventDefault();
          const results = this.searchResultsForScope(options.scope || 'country');
          const count = binding.options.maxResults > 0
            ? Math.min(results.length, binding.options.maxResults)
            : results.length;
          if (count) {
            binding.open = true;
            binding.activeIndex = count - 1;
            this.renderSearchList(binding);
          }
        } else if (event.key === 'Enter') {
          const results = this.searchResultsForScope(options.scope || 'country');
          const count = binding.options.maxResults > 0
            ? Math.min(results.length, binding.options.maxResults)
            : results.length;
          const region = results[binding.activeIndex];
          if (binding.open && region && binding.activeIndex < count) {
            event.preventDefault();
            const identifier = region.id || region.country?.iso2 || region.name;
            if (identifier) {
              if ((options.scope || 'country') === 'subdivision') this.selectSubdivision(identifier);
              else this.select(identifier);
            }
          }
        } else if (event.key === 'Escape') {
          binding.open = false;
          this.renderSearchList(binding);
        }
      }
    };

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    const direction = this.resolvedDirection();
    if (direction) {
      input.setAttribute('dir', direction);
      list.setAttribute('dir', direction);
    }
    list.setAttribute('role', 'listbox');
    input.addEventListener('focus', binding.onFocus);
    input.addEventListener('input', binding.onInput);
    input.addEventListener('keydown', binding.onKeyDown);
    this.searchListBindings.add(binding);
    this.renderSearchList(binding);

    return {
      refresh: () => {
        this.renderSearchList(binding);
        return this.searchResultsForScope(options.scope || 'country');
      },
      destroy: () => {
        input.removeEventListener('focus', binding.onFocus);
        input.removeEventListener('input', binding.onInput);
        input.removeEventListener('keydown', binding.onKeyDown);
        this.searchListBindings.delete(binding);
        list.textContent = '';
        list.hidden = true;
        input.removeAttribute('role');
        input.removeAttribute('aria-autocomplete');
        input.removeAttribute('aria-controls');
        input.removeAttribute('aria-expanded');
        input.removeAttribute('aria-activedescendant');
        input.removeAttribute('dir');
        list.removeAttribute('dir');
      }
    };
  }

  search(query: string): Region[] {
    if (!this.geojson || !this.svg) return [];
    this.searchQuery = this.normalizedText(query);
    this.updateSearchMatches();
    this.updateHighlights();
    this.syncSearchListBindings('search');
    return [...this.searchMatches].map(index => toRegion(this.geojson!.features[index]));
  }

  destroy() {
    if (this.svg && this.container.contains(this.svg)) this.container.removeChild(this.svg);
    this.svg = null;
    this.countrySvgGroup = null;
    this.subdivisionSvgGroup = null;
    this.geojson = null;
    this.listeners = { select: [], 'subdivision-select': [] };
    this.selectedIndex = null;
    this.searchMatches.clear();
    this.searchQuery = '';
    this.subdivisionSearchMatches.clear();
    this.subdivisionSearchQuery = '';
    this.continentFilter = null;
    this.subdivisionGeojson = null;
    this.subdivisionParent = null;
    this.selectedSubdivisionIndex = null;
    this.loadStatus = 'idle';
    this.loadError = null;
    this.zoomScale = 1;
    this.zoomX = 0;
    this.zoomY = 0;
    this.panPointerId = null;
    this.panPoint = null;
    this.panMoved = false;
    this.suppressNextClick = false;
    this.formBindings.forEach(binding => {
      binding.input.removeEventListener('input', binding.onInput);
      binding.input.removeEventListener('change', binding.onInput);
      binding.input.form?.removeEventListener('reset', binding.onReset);
    });
    this.formBindings.clear();
    this.searchListBindings.forEach(binding => {
      binding.input.removeEventListener('focus', binding.onFocus);
      binding.input.removeEventListener('input', binding.onInput);
      binding.input.removeEventListener('keydown', binding.onKeyDown);
      binding.list.textContent = '';
    });
    this.searchListBindings.clear();
    this.disabled = false;
    this.subdivisionDisabled = false;
  }
}
