import type {
  FormFieldBinding,
  FormFieldOptions,
  FormValueKey,
  GeoCoreOptions,
  Region,
  SearchListBinding,
  SearchListOptions
} from './types.js';
import { project, toRegion } from './utils.js';

type FormBindingState = {
  input: HTMLInputElement;
  valueKey: FormValueKey;
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

export class GeoCore {
  private container: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private opts: Required<GeoCoreOptions>;
  private geojson: GeoJSON.FeatureCollection | null = null;
  private listeners: { select: ((r: Region) => void)[] } = { select: [] };
  private selectedIndex: number | null = null;
  private searchMatches = new Set<number>();
  private searchQuery = '';
  private continentFilter: string | null = null;
  private disabled = false;
  private formBindings = new Set<FormBindingState>();
  private searchListBindings = new Set<SearchListBindingState>();
  private searchListId = 0;

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
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Interactive region map');
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

    svg.appendChild(g);
    this.updateVisibility();
    this.updateHighlights();
    this.syncSearchListBindings('filter');
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
      const selected = index === this.selectedIndex;
      const highlighted = selected || this.searchMatches.has(index);
      path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
      path.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  private regionFormValue(region: Region, valueKey: FormValueKey): string {
    if (valueKey === 'iso2') return region.country?.iso2 || region.id || '';
    if (valueKey === 'iso3') return region.country?.iso3 || region.id || '';
    return region.id || '';
  }

  private selectedFormValue(valueKey: FormValueKey): string {
    const selected = this.getSelected();
    return selected ? this.regionFormValue(selected, valueKey) : '';
  }

  private dispatchFormEvent(input: HTMLInputElement, type: 'input' | 'change') {
    const EventConstructor = input.ownerDocument.defaultView?.Event || Event;
    input.dispatchEvent(new EventConstructor(type, { bubbles: true }));
  }

  private syncFormBinding(binding: FormBindingState) {
    const value = this.selectedFormValue(binding.valueKey);
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
    return region.country?.localizedName || region.name || region.id || 'Unnamed region';
  }

  private visibleRegions(): Region[] {
    if (!this.geojson) return [];
    return this.geojson.features
      .map((_, index) => index)
      .filter(index => this.isVisible(index))
      .map(index => toRegion(this.geojson!.features[index]));
  }

  private searchResults(): Region[] {
    if (!this.geojson) return [];
    if (!this.searchQuery) return this.visibleRegions();
    return [...this.searchMatches].map(index => toRegion(this.geojson!.features[index]));
  }

  private syncSearchListBindings(reason: 'search' | 'selection' | 'clear' | 'filter' = 'search') {
    const selected = this.getSelected();
    if (reason === 'selection' || reason === 'clear') {
      this.searchQuery = '';
      this.searchMatches.clear();
      this.updateHighlights();
    }
    this.searchListBindings.forEach(binding => {
      if (reason === 'selection') {
        binding.input.value = selected ? (binding.options.getLabel || this.regionLabelForSearch)(selected) : '';
        binding.open = false;
      } else if (reason === 'clear') {
        binding.input.value = '';
        binding.open = false;
      }
      this.renderSearchList(binding);
    });
  }

  private renderSearchList(binding: SearchListBindingState): Region[] {
    const results = this.searchResults();
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
    const selectedId = this.getSelected()?.id;
    visibleResults.forEach((region, index) => {
      const option = list.ownerDocument.createElement('li');
      const optionId = `${list.id}-option-${index}`;
      const label = (binding.options.getLabel || this.regionLabelForSearch)(region);
      option.id = optionId;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(region.id === selectedId));
      option.setAttribute('tabindex', '-1');
      option.textContent = label;
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => {
        const identifier = region.id || region.country?.iso2 || region.name;
        if (identifier) this.select(identifier);
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
    const results = this.searchResults();
    const count = binding.options.maxResults > 0 ? Math.min(results.length, binding.options.maxResults) : results.length;
    if (!count) return;
    binding.open = true;
    if (direction === 0) binding.activeIndex = 0;
    else binding.activeIndex = (binding.activeIndex + direction + count) % count;
    this.renderSearchList(binding);
  }

  private regionLabel(feature: GeoJSON.Feature): string {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const name = props.localizedName || props.NAME_KO || props.NAME || props.ADMIN || props.name;
    const id = props.iso3 || props.ISO_A3_EH || props.ISO_A3 || props.iso_a3 || props.code || props.id;
    return name && id ? `${String(name)} (${String(id)})` : String(name || id || 'Unnamed region');
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
      .map(value => String(value).toLowerCase());
  }

  private continentFor(feature: GeoJSON.Feature): string {
    const props = (feature.properties || {}) as Record<string, unknown>;
    return String(
      props.continent || props.CONTINENT || props.CONTINENT_UN || props.REGION_UN || ''
    ).trim();
  }

  private isVisible(index: number): boolean {
    if (!this.geojson || !this.continentFilter) return true;
    return this.continentFor(this.geojson.features[index]).toLowerCase() === this.continentFilter;
  }

  private updateVisibility() {
    if (!this.svg) return;
    this.svg.querySelectorAll('path').forEach((path, index) => {
      const visible = this.isVisible(index);
      path.setAttribute('display', visible ? '' : 'none');
      path.setAttribute('aria-hidden', visible ? 'false' : 'true');
      path.setAttribute('tabindex', visible && !this.disabled ? '0' : '-1');
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
    if (this.disabled) return null;
    this.selectedIndex = index;
    const region = toRegion(this.geojson.features[index]);
    this.updateHighlights();
    this.syncFormBindings();
    this.syncSearchListBindings('selection');
    this.emit('select', region);
    return region;
  }

  select(identifier: string): Region | null {
    if (!this.geojson) return null;
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) return null;

    const index = this.geojson.features.findIndex((feature, featureIndex) => {
      if (!this.isVisible(featureIndex)) return false;
      return this.searchableValues(feature).some(value => value === normalized);
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
    return [...new Set(this.geojson.features.map(feature => this.continentFor(feature)).filter(Boolean))]
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
    if (!this.svg) return;
    this.svg.setAttribute('aria-disabled', String(disabled));
    this.svg.querySelectorAll('path').forEach(path => {
      path.setAttribute('aria-disabled', String(disabled));
      path.setAttribute('tabindex', disabled || path.getAttribute('display') === 'none' ? '-1' : '0');
    });
    this.searchListBindings.forEach(binding => {
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
      initialValue: input.value,
      syncing: false,
      onInput: () => {
        if (binding.syncing || this.disabled) return;
        const value = input.value.trim();
        if (!value) {
          this.clear();
          input.setCustomValidity('');
          return;
        }

        const selected = this.select(value);
        if (!selected) {
          this.clear();
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
      if (!this.select(initialValue)) input.setCustomValidity('Unknown region value');
    } else {
      this.syncFormBinding(binding);
    }
    this.setDisabled(options.disabled ?? input.disabled);

    return {
      input,
      setDisabled: disabled => {
        input.disabled = disabled;
        this.setDisabled(disabled);
      },
      destroy: () => {
        input.removeEventListener('input', binding.onInput);
        input.removeEventListener('change', binding.onInput);
        input.form?.removeEventListener('reset', binding.onReset);
        this.formBindings.delete(binding);
        if (this.formBindings.size === 0) this.setDisabled(false);
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
        if (this.disabled) return;
        binding.open = true;
        this.renderSearchList(binding);
      },
      onInput: () => {
        if (this.disabled) return;
        binding.open = true;
        this.search(input.value);
      },
      onKeyDown: event => {
        if (this.disabled) return;
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
          const results = this.searchResults();
          const count = binding.options.maxResults > 0
            ? Math.min(results.length, binding.options.maxResults)
            : results.length;
          if (count) {
            binding.open = true;
            binding.activeIndex = count - 1;
            this.renderSearchList(binding);
          }
        } else if (event.key === 'Enter') {
          const results = this.searchResults();
          const count = binding.options.maxResults > 0
            ? Math.min(results.length, binding.options.maxResults)
            : results.length;
          const region = results[binding.activeIndex];
          if (binding.open && region && binding.activeIndex < count) {
            event.preventDefault();
            const identifier = region.id || region.country?.iso2 || region.name;
            if (identifier) this.select(identifier);
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
    list.setAttribute('role', 'listbox');
    input.addEventListener('focus', binding.onFocus);
    input.addEventListener('input', binding.onInput);
    input.addEventListener('keydown', binding.onKeyDown);
    this.searchListBindings.add(binding);
    this.renderSearchList(binding);

    return {
      refresh: () => {
        this.renderSearchList(binding);
        return this.searchResults();
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
      }
    };
  }

  search(query: string): Region[] {
    if (!this.geojson || !this.svg) return [];
    this.searchQuery = query.toLowerCase().trim();
    this.updateSearchMatches();
    this.updateHighlights();
    this.syncSearchListBindings('search');
    return [...this.searchMatches].map(index => toRegion(this.geojson!.features[index]));
  }

  destroy() {
    if (this.svg && this.container.contains(this.svg)) this.container.removeChild(this.svg);
    this.svg = null;
    this.geojson = null;
    this.listeners = { select: [] };
    this.selectedIndex = null;
    this.searchMatches.clear();
    this.searchQuery = '';
    this.continentFilter = null;
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
  }
}
