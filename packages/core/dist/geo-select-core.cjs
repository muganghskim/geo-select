'use strict';

/** equirectangular projection (lon,lat) -> x,y */
function project(lon, lat, width, height) {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
}
function textValue(...values) {
    for (const value of values) {
        if (value === null || value === undefined)
            continue;
        const text = String(value).trim();
        if (text && text !== '-99')
            return text;
    }
    return undefined;
}
function textValues(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap(item => {
        if (item === null || item === undefined)
            return [];
        const text = String(item).trim();
        return text && text !== '-99' ? [text] : [];
    });
}
function numberValue(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '')
            continue;
        const number = Number(value);
        if (Number.isFinite(number) && number !== -99)
            return number;
    }
    return undefined;
}
function coordinatePair(value) {
    if (!Array.isArray(value) || value.length < 2)
        return undefined;
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
}
function ringCentroid(coords) {
    if (coords.length < 3)
        return null;
    let areaTwice = 0;
    let xSum = 0;
    let ySum = 0;
    for (let index = 0; index < coords.length; index += 1) {
        const [x1, y1] = coords[index];
        const [x2, y2] = coords[(index + 1) % coords.length];
        const cross = x1 * y2 - x2 * y1;
        areaTwice += cross;
        xSum += (x1 + x2) * cross;
        ySum += (y1 + y2) * cross;
    }
    if (Math.abs(areaTwice) < Number.EPSILON)
        return null;
    return {
        x: xSum / (3 * areaTwice),
        y: ySum / (3 * areaTwice),
        area: Math.abs(areaTwice / 2)
    };
}
function polygonCentroid(rings) {
    let weightedX = 0;
    let weightedY = 0;
    let totalArea = 0;
    rings.forEach((ring, index) => {
        const centroid = ringCentroid(ring);
        if (!centroid)
            return;
        const weight = index === 0 ? centroid.area : -centroid.area;
        weightedX += centroid.x * weight;
        weightedY += centroid.y * weight;
        totalArea += weight;
    });
    if (Math.abs(totalArea) < Number.EPSILON)
        return null;
    return { x: weightedX / totalArea, y: weightedY / totalArea, area: Math.abs(totalArea) };
}
function geometryCentroid(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let weightedX = 0;
    let weightedY = 0;
    let totalArea = 0;
    polygons.forEach(rings => {
        const centroid = polygonCentroid(rings);
        if (!centroid)
            return;
        weightedX += centroid.x * centroid.area;
        weightedY += centroid.y * centroid.area;
        totalArea += centroid.area;
    });
    return totalArea ? [weightedX / totalArea, weightedY / totalArea] : null;
}
function featureCentroid(feature) {
    if (!feature.geometry)
        return null;
    const props = (feature.properties || {});
    const explicitCenter = coordinatePair(props.center);
    if (explicitCenter)
        return explicitCenter;
    const labelX = numberValue(props.LABEL_X, props.labelX);
    const labelY = numberValue(props.LABEL_Y, props.labelY);
    if (labelX !== undefined && labelY !== undefined)
        return [labelX, labelY];
    const g = feature.geometry;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon')
        return geometryCentroid(g);
    if (g.type === 'Point') {
        const p = g.coordinates;
        return [p[0], p[1]];
    }
    return null;
}
function countryInfo(props) {
    const capitals = Array.isArray(props.capitals)
        ? props.capitals.flatMap((capital) => {
            if (!capital || typeof capital !== 'object')
                return [];
            const capitalProps = capital;
            const name = textValue(capitalProps.name);
            const coordinates = coordinatePair(capitalProps.coordinates);
            return name && coordinates ? [{ name, coordinates }] : [];
        })
        : undefined;
    const country = {
        iso2: textValue(props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL),
        iso3: textValue(props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3),
        numericCode: textValue(props.numericCode, props.ISO_N3_EH, props.ISO_N3),
        officialName: textValue(props.officialName, props.FORMAL_EN, props.NAME_LONG),
        localizedName: textValue(props.localizedName, props.NAME_KO),
        aliases: textValues(props.aliases || props.nameAliases || props.ALIASES).length
            ? textValues(props.aliases || props.nameAliases || props.ALIASES)
            : undefined,
        continent: textValue(props.continent, props.CONTINENT),
        subregion: textValue(props.subregion, props.SUBREGION),
        capitals: (capitals === null || capitals === void 0 ? void 0 : capitals.length) ? capitals : undefined,
        population: numberValue(props.population, props.POP_EST),
        populationYear: numberValue(props.populationYear, props.POP_YEAR),
        gdpMillionsUsd: numberValue(props.gdpMillionsUsd, props.GDP_MD),
        gdpYear: numberValue(props.gdpYear, props.GDP_YEAR),
        economy: textValue(props.economy, props.ECONOMY),
        incomeGroup: textValue(props.incomeGroup, props.INCOME_GRP),
        wikidataId: textValue(props.wikidataId, props.WIKIDATAID)
    };
    return Object.values(country).some(value => value !== undefined) ? country : undefined;
}
function toRegion(feature) {
    const props = (feature.properties || {});
    const id = textValue(props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3, props.iso_a3, props.id, props.code);
    const name = textValue(props.NAME, props.ADMIN, props.name);
    const cent = featureCentroid(feature) || undefined;
    return { id, name, properties: props, centroid: cent, country: countryInfo(props), level: 'country' };
}
function toSubdivisionRegion(feature) {
    const props = (feature.properties || {});
    const text = (...values) => {
        for (const value of values) {
            if (value === null || value === undefined)
                continue;
            const result = String(value).trim();
            if (result && result !== '-99')
                return result;
        }
        return undefined;
    };
    const subdivision = {
        code: text(props.iso3166_2, props.ISO_3166_2, props.iso31662, props.code, props.code_3166_2),
        name: text(props.name, props.NAME_1, props.NAME, props.nam),
        localizedName: text(props.localizedName, props.NAME_KO, props.name_ko),
        aliases: textValues(props.aliases || props.nameAliases || props.ALIASES).length
            ? textValues(props.aliases || props.nameAliases || props.ALIASES)
            : undefined,
        parentIso2: text(props.parentIso2, props.parent_iso2, props.countryIso2, props.ISO_A2),
        parentIso3: text(props.parentIso3, props.parent_iso3, props.countryIso3, props.ISO_A3),
        level: text(props.level, props.adminLevel, props.admin_level) || 'admin1'
    };
    const id = subdivision.code || text(props.id, props.code) || undefined;
    const name = subdivision.name || subdivision.localizedName || id;
    const cent = featureCentroid(feature) || undefined;
    return { id, name, properties: props, centroid: cent, subdivision, level: 'subdivision' };
}

class GeoCore {
    constructor(container, options = {}) {
        var _a;
        this.svg = null;
        this.countrySvgGroup = null;
        this.subdivisionSvgGroup = null;
        this.geojson = null;
        this.listeners = { select: [], 'subdivision-select': [] };
        this.selectedIndex = null;
        this.searchMatches = new Set();
        this.searchQuery = '';
        this.subdivisionSearchMatches = new Set();
        this.subdivisionSearchQuery = '';
        this.continentFilter = null;
        this.disabled = false;
        this.subdivisionDisabled = false;
        this.formBindings = new Set();
        this.searchListBindings = new Set();
        this.searchListId = 0;
        this.subdivisionGeojson = null;
        this.subdivisionOptions = {};
        this.subdivisionParent = null;
        this.selectedSubdivisionIndex = null;
        this.loadStatus = 'idle';
        this.loadError = null;
        if (!container)
            throw new Error('container HTMLElement is required');
        this.container = container;
        this.opts = {
            width: options.width || 900,
            height: options.height || 450,
            touchTargetSize: Math.max((_a = options.touchTargetSize) !== null && _a !== void 0 ? _a : 24, 0),
            dataUrl: options.dataUrl || '',
            data: options.data || null,
            initialFill: options.initialFill || '#e6e6e6',
            highlightFill: options.highlightFill || '#ffcc00',
            locale: options.locale || '',
            direction: options.direction || 'auto',
            aliases: options.aliases || {},
            allowedCountries: options.allowedCountries,
            allowedSubdivisions: options.allowedSubdivisions,
            excludedCountries: options.excludedCountries,
            excludedSubdivisions: options.excludedSubdivisions,
            onReady: options.onReady || (() => { }),
            onError: options.onError || (() => { })
        };
        this.ready = this.init();
    }
    async init() {
        this.loadStatus = 'loading';
        this.loadError = null;
        this.createSvg();
        try {
            if (this.opts.data) {
                this.geojson = this.opts.data;
            }
            else if (this.opts.dataUrl) {
                await this.loadData(this.opts.dataUrl);
            }
            else {
                throw new Error('No geojson provided. Use options.data or options.dataUrl');
            }
            this.render();
            this.loadStatus = 'ready';
            this.container.removeAttribute('role');
            this.container.setAttribute('data-geo-select-status', 'ready');
            this.opts.onReady();
        }
        catch (error) {
            this.handleLoadError(error);
        }
    }
    handleLoadError(error) {
        this.loadError = error instanceof Error ? error : new Error(String(error));
        this.loadStatus = 'error';
        this.container.textContent = 'Unable to load region data. Try again.';
        this.container.setAttribute('role', 'alert');
        this.container.setAttribute('data-geo-select-status', 'error');
        this.opts.onError(this.loadError);
    }
    async loadData(url) {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Failed to load geojson: ${res.status}`);
        this.geojson = await res.json();
    }
    getStatus() {
        return this.loadStatus;
    }
    getLoadError() {
        return this.loadError;
    }
    whenReady() {
        return this.ready;
    }
    async retry() {
        if (!this.opts.dataUrl || this.loadStatus === 'loading')
            return false;
        await this.init();
        return this.loadStatus === 'ready';
    }
    createSvg() {
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
        if (direction)
            svg.setAttribute('dir', direction);
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.maxWidth = '100%';
        svg.style.touchAction = 'manipulation';
        this.svg = svg;
        this.container.appendChild(svg);
    }
    render() {
        if (!this.svg || !this.geojson)
            return;
        const svg = this.svg;
        const g = document.createElementNS(svg.namespaceURI, 'g');
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
            path.style.cursor = 'pointer';
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
                const keyboardEvent = event;
                if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ')
                    return;
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
            if (!this.needsTouchTarget(feature) || !this.opts.touchTargetSize)
                return;
            const region = toRegion(feature);
            if (!region.centroid)
                return;
            const [cx, cy] = project(region.centroid[0], region.centroid[1], this.opts.width, this.opts.height);
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
            target.style.cursor = 'pointer';
            target.addEventListener('click', () => {
                this.selectIndex(index);
            });
            g.appendChild(target);
        });
        svg.appendChild(g);
        this.updateVisibility();
        this.updateHighlights();
        this.syncSearchListBindings('filter');
    }
    clearRenderedSubdivisions() {
        var _a;
        if (this.subdivisionSvgGroup && ((_a = this.svg) === null || _a === void 0 ? void 0 : _a.contains(this.subdivisionSvgGroup))) {
            this.svg.removeChild(this.subdivisionSvgGroup);
        }
        this.subdivisionSvgGroup = null;
        if (this.countrySvgGroup)
            this.countrySvgGroup.setAttribute('display', '');
    }
    subdivisionIdentifier(feature) {
        var _a, _b;
        const props = (feature.properties || {});
        const configured = this.subdivisionOptions.codeProperty
            ? props[this.subdivisionOptions.codeProperty]
            : undefined;
        const region = toSubdivisionRegion(feature);
        const identifier = (_b = configured !== null && configured !== void 0 ? configured : (_a = region.subdivision) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : region.id;
        return identifier === null || identifier === undefined ? undefined : String(identifier);
    }
    renderSubdivisions() {
        var _a;
        if (!this.svg || !((_a = this.subdivisionGeojson) === null || _a === void 0 ? void 0 : _a.features.length)) {
            this.clearRenderedSubdivisions();
            return;
        }
        this.clearRenderedSubdivisions();
        const svg = this.svg;
        const group = document.createElementNS(svg.namespaceURI, 'g');
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
            path.style.cursor = 'pointer';
            path.addEventListener('click', () => {
                if (this.subdivisionDisabled)
                    return;
                const identifier = this.subdivisionIdentifier(feature);
                if (identifier)
                    this.selectSubdivision(identifier);
            });
            path.addEventListener('mouseenter', () => path.setAttribute('opacity', '0.9'));
            path.addEventListener('mouseleave', () => path.setAttribute('opacity', '1'));
            path.addEventListener('keydown', event => {
                const keyboardEvent = event;
                if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ')
                    return;
                event.preventDefault();
                if (this.subdivisionDisabled)
                    return;
                const identifier = this.subdivisionIdentifier(feature);
                if (identifier)
                    this.selectSubdivision(identifier);
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
        if (this.countrySvgGroup)
            this.countrySvgGroup.setAttribute('display', 'none');
        this.updateSubdivisionVisibility();
        this.updateSubdivisionHighlights();
    }
    pathFromGeometry(geom) {
        if (!geom)
            return '';
        const w = this.opts.width;
        const h = this.opts.height;
        const ringToPath = (ring) => ring.map(([lon, lat], idx) => {
            const [x, y] = project(lon, lat, w, h);
            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ') + ' Z';
        if (geom.type === 'Polygon') {
            const rings = geom.coordinates;
            return rings.map(r => ringToPath(r)).join(' ');
        }
        if (geom.type === 'MultiPolygon') {
            const polys = geom.coordinates;
            return polys.map(poly => poly.map(r => ringToPath(r)).join(' ')).join(' ');
        }
        if (geom.type === 'Point') {
            const [lon, lat] = geom.coordinates;
            const [x, y] = project(lon, lat, w, h);
            return `M ${x - 2} ${y - 2} L ${x + 2} ${y - 2} L ${x + 2} ${y + 2} L ${x - 2} ${y + 2} Z`;
        }
        return '';
    }
    needsTouchTarget(feature) {
        if (!this.opts.touchTargetSize || !feature.geometry)
            return false;
        const points = [];
        const collect = (value) => {
            if (!Array.isArray(value))
                return;
            if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
                points.push([value[0], value[1]]);
                return;
            }
            value.forEach(collect);
        };
        const collectGeometry = (geometry) => {
            if (geometry.type === 'GeometryCollection') {
                geometry.geometries.forEach(collectGeometry);
            }
            else {
                collect(geometry.coordinates);
            }
        };
        collectGeometry(feature.geometry);
        if (!points.length)
            return false;
        const projected = points.map(([lon, lat]) => project(lon, lat, this.opts.width, this.opts.height));
        const xs = projected.map(([x]) => x);
        const ys = projected.map(([, y]) => y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);
        return Math.max(width, height) < this.opts.touchTargetSize;
    }
    updateHighlights() {
        var _a;
        const paths = (_a = this.countrySvgGroup) === null || _a === void 0 ? void 0 : _a.querySelectorAll('path.geo-select-region');
        if (!paths)
            return;
        paths.forEach((path, index) => {
            const selected = index === this.selectedIndex;
            const highlighted = selected || this.searchMatches.has(index);
            path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
            path.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }
    updateSubdivisionHighlights() {
        var _a;
        const paths = (_a = this.subdivisionSvgGroup) === null || _a === void 0 ? void 0 : _a.querySelectorAll('path.geo-select-subdivision');
        if (!paths)
            return;
        paths.forEach((path, index) => {
            const selected = index === this.selectedSubdivisionIndex;
            const highlighted = selected || this.subdivisionSearchMatches.has(index);
            path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
            path.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }
    regionFormValue(region, valueKey) {
        var _a, _b, _c;
        if (region.level === 'subdivision') {
            if (valueKey === 'id')
                return region.id || '';
            return ((_a = region.subdivision) === null || _a === void 0 ? void 0 : _a.code) || region.id || '';
        }
        if (valueKey === 'iso2')
            return ((_b = region.country) === null || _b === void 0 ? void 0 : _b.iso2) || region.id || '';
        if (valueKey === 'iso3')
            return ((_c = region.country) === null || _c === void 0 ? void 0 : _c.iso3) || region.id || '';
        return region.id || '';
    }
    selectedFormValue(valueKey, scope) {
        const selected = scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected();
        return selected ? this.regionFormValue(selected, valueKey) : '';
    }
    dispatchFormEvent(input, type) {
        var _a;
        const EventConstructor = ((_a = input.ownerDocument.defaultView) === null || _a === void 0 ? void 0 : _a.Event) || Event;
        input.dispatchEvent(new EventConstructor(type, { bubbles: true }));
    }
    syncFormBinding(binding) {
        const value = this.selectedFormValue(binding.valueKey, binding.scope);
        binding.syncing = true;
        binding.input.value = value;
        binding.input.setCustomValidity('');
        this.dispatchFormEvent(binding.input, 'input');
        this.dispatchFormEvent(binding.input, 'change');
        binding.syncing = false;
    }
    syncFormBindings() {
        this.formBindings.forEach(binding => this.syncFormBinding(binding));
    }
    regionLabelForSearch(region) {
        return this.displayName(region) || (region.level === 'subdivision' ? 'Unnamed subdivision' : 'Unnamed region');
    }
    visibleRegions() {
        if (!this.geojson)
            return [];
        return this.geojson.features
            .map((_, index) => index)
            .filter(index => this.isVisible(index))
            .map(index => toRegion(this.geojson.features[index]));
    }
    searchResults() {
        return this.searchResultsForScope('country');
    }
    searchResultsForScope(scope) {
        if (scope === 'subdivision') {
            if (!this.subdivisionGeojson)
                return [];
            if (!this.subdivisionSearchQuery) {
                return this.subdivisionGeojson.features.map(feature => toSubdivisionRegion(feature));
            }
            return [...this.subdivisionSearchMatches]
                .map(index => toSubdivisionRegion(this.subdivisionGeojson.features[index]));
        }
        if (!this.geojson)
            return [];
        if (!this.searchQuery)
            return this.visibleRegions();
        return [...this.searchMatches].map(index => toRegion(this.geojson.features[index]));
    }
    syncSearchListBindings(reason = 'search', scope = 'country') {
        const selected = scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected();
        if (reason === 'selection' || reason === 'clear') {
            if (scope === 'subdivision') {
                this.subdivisionSearchQuery = '';
                this.subdivisionSearchMatches.clear();
            }
            else {
                this.searchQuery = '';
                this.searchMatches.clear();
                this.updateHighlights();
            }
        }
        this.searchListBindings.forEach(binding => {
            if ((binding.options.scope || 'country') !== scope)
                return;
            if (reason === 'selection') {
                binding.input.value = selected
                    ? (binding.options.getLabel ? binding.options.getLabel(selected) : this.regionLabelForSearch(selected))
                    : '';
                binding.open = false;
            }
            else if (reason === 'clear') {
                binding.input.value = '';
                binding.open = false;
            }
            this.renderSearchList(binding);
        });
    }
    renderSearchList(binding) {
        var _a, _b;
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
        if (binding.activeIndex >= visibleResults.length)
            binding.activeIndex = Math.max(visibleResults.length - 1, 0);
        const selectedId = (_a = (scope === 'subdivision' ? this.getSelectedSubdivision() : this.getSelected())) === null || _a === void 0 ? void 0 : _a.id;
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
                var _a;
                const identifier = region.id || ((_a = region.country) === null || _a === void 0 ? void 0 : _a.iso2) || region.name;
                if (identifier) {
                    if (scope === 'subdivision')
                        this.selectSubdivision(identifier);
                    else
                        this.select(identifier);
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
            (_b = list.children[binding.activeIndex]) === null || _b === void 0 ? void 0 : _b.classList.add('geo-select-search-option-active');
        }
        else {
            input.removeAttribute('aria-activedescendant');
        }
        return visibleResults;
    }
    moveSearchListActive(binding, direction) {
        const results = this.searchResultsForScope(binding.options.scope || 'country');
        const count = binding.options.maxResults > 0 ? Math.min(results.length, binding.options.maxResults) : results.length;
        if (!count)
            return;
        binding.open = true;
        if (direction === 0)
            binding.activeIndex = 0;
        else
            binding.activeIndex = (binding.activeIndex + direction + count) % count;
        this.renderSearchList(binding);
    }
    regionLabel(feature, scope = 'country') {
        var _a, _b;
        const region = scope === 'subdivision' ? toSubdivisionRegion(feature) : toRegion(feature);
        const name = this.displayName(region);
        const id = scope === 'subdivision'
            ? ((_a = region.subdivision) === null || _a === void 0 ? void 0 : _a.code) || region.id
            : ((_b = region.country) === null || _b === void 0 ? void 0 : _b.iso3) || region.id;
        return name && id
            ? `${String(name)} (${String(id)})`
            : String(name || id || (scope === 'subdivision' ? 'Unnamed subdivision' : 'Unnamed region'));
    }
    normalizedText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    }
    localeLanguage() {
        return this.opts.locale.trim().toLowerCase().split(/[-_]/)[0];
    }
    resolvedDirection() {
        if (this.opts.direction === 'ltr' || this.opts.direction === 'rtl')
            return this.opts.direction;
        if (this.opts.direction !== 'auto')
            return undefined;
        return ['ar', 'fa', 'he', 'ur'].includes(this.localeLanguage()) ? 'rtl' : undefined;
    }
    localizedProperty(props) {
        const language = this.localeLanguage();
        if (!language)
            return undefined;
        const languageUpper = language.toUpperCase();
        const keys = [
            `name_${language}`,
            `name-${language}`,
            `NAME_${languageUpper}`,
            `NAME_${language}`
        ];
        for (const key of keys) {
            const value = props[key];
            if (value !== null && value !== undefined && String(value).trim())
                return String(value).trim();
        }
        return undefined;
    }
    displayName(region) {
        var _a, _b, _c, _d;
        const props = region.properties || {};
        const localized = this.localizedProperty(props);
        if (region.level === 'subdivision') {
            return localized
                || (this.localeLanguage() === 'ko' ? (_a = region.subdivision) === null || _a === void 0 ? void 0 : _a.localizedName : undefined)
                || ((_b = region.subdivision) === null || _b === void 0 ? void 0 : _b.name)
                || region.name
                || region.id
                || '';
        }
        if (!this.opts.locale)
            return ((_c = region.country) === null || _c === void 0 ? void 0 : _c.localizedName) || region.name || region.id || '';
        return localized
            || (this.localeLanguage() === 'ko' ? (_d = region.country) === null || _d === void 0 ? void 0 : _d.localizedName : undefined)
            || region.name
            || region.id
            || '';
    }
    featureKeys(feature) {
        const props = (feature.properties || {});
        return [
            props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL,
            props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3,
            props.iso_a3, props.iso3166_2, props.ISO_3166_2, props.code, props.id,
            feature.id
        ].filter(value => value !== null && value !== undefined).map(value => String(value));
    }
    configuredAliases(feature) {
        const aliases = this.opts.aliases;
        return this.featureKeys(feature).flatMap(key => aliases[key] || aliases[key.toUpperCase()] || aliases[key.toLowerCase()] || []);
    }
    searchableValues(feature) {
        const props = (feature.properties || {});
        const capitals = Array.isArray(props.capitals)
            ? props.capitals.map(capital => capital && typeof capital === 'object'
                ? capital.name
                : undefined)
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
    continentFor(feature) {
        const props = (feature.properties || {});
        return String(props.continent || props.CONTINENT || props.CONTINENT_UN || props.REGION_UN || '').trim();
    }
    isVisible(index) {
        if (!this.geojson || !this.isCountryAllowed(this.geojson.features[index]))
            return false;
        if (!this.continentFilter)
            return true;
        return this.continentFor(this.geojson.features[index]).toLowerCase() === this.continentFilter;
    }
    policyCodes(feature) {
        const props = (feature.properties || {});
        return [
            props.iso2, props.ISO_A2_EH, props.ISO_A2, props.POSTAL,
            props.iso3, props.ISO_A3_EH, props.ISO_A3, props.ADM0_A3,
            props.iso_a3, props.code, props.id, feature.id
        ]
            .filter(value => value !== null && value !== undefined && String(value).trim() !== '-99')
            .map(value => this.normalizedText(value));
    }
    matchesPolicy(codes, allowed, excluded) {
        const allowedCodes = (allowed === null || allowed === void 0 ? void 0 : allowed.map(value => this.normalizedText(value))) || [];
        const excludedCodes = (excluded === null || excluded === void 0 ? void 0 : excluded.map(value => this.normalizedText(value))) || [];
        if (allowed && !codes.some(code => allowedCodes.includes(code)))
            return false;
        if (codes.some(code => excludedCodes.includes(code)))
            return false;
        return true;
    }
    isCountryAllowed(feature) {
        return this.matchesPolicy(this.policyCodes(feature), this.opts.allowedCountries, this.opts.excludedCountries);
    }
    updateVisibility() {
        var _a, _b;
        const paths = (_a = this.countrySvgGroup) === null || _a === void 0 ? void 0 : _a.querySelectorAll('path.geo-select-region');
        if (!paths)
            return;
        paths.forEach((path, index) => {
            const visible = this.isVisible(index);
            path.setAttribute('display', visible ? '' : 'none');
            path.setAttribute('aria-hidden', visible ? 'false' : 'true');
            path.setAttribute('tabindex', visible && !this.disabled ? '0' : '-1');
        });
        (_b = this.countrySvgGroup) === null || _b === void 0 ? void 0 : _b.querySelectorAll('.geo-select-hit-target').forEach(target => {
            const index = Number(target.getAttribute('data-index'));
            const visible = Number.isInteger(index) && this.isVisible(index);
            target.setAttribute('display', visible ? '' : 'none');
            target.setAttribute('pointer-events', visible && !this.disabled ? 'all' : 'none');
            target.setAttribute('aria-hidden', 'true');
        });
    }
    updateSubdivisionVisibility() {
        var _a;
        const paths = (_a = this.subdivisionSvgGroup) === null || _a === void 0 ? void 0 : _a.querySelectorAll('path.geo-select-subdivision');
        if (!paths)
            return;
        paths.forEach(path => {
            path.setAttribute('display', '');
            path.setAttribute('aria-hidden', 'false');
            path.setAttribute('aria-disabled', String(this.subdivisionDisabled));
            path.setAttribute('tabindex', this.subdivisionDisabled ? '-1' : '0');
        });
    }
    updateSearchMatches() {
        this.searchMatches.clear();
        if (!this.geojson || !this.searchQuery)
            return;
        this.geojson.features.forEach((feature, index) => {
            if (!this.isVisible(index))
                return;
            if (this.searchableValues(feature).some(value => value.includes(this.searchQuery))) {
                this.searchMatches.add(index);
            }
        });
    }
    on(eventName, handler) {
        this.listeners[eventName].push(handler);
        return () => {
            const handlers = this.listeners[eventName];
            const index = handlers.indexOf(handler);
            if (index !== -1)
                handlers.splice(index, 1);
        };
    }
    emit(eventName, region) {
        this.listeners[eventName].forEach(h => h(region));
    }
    countryIndex(identifier) {
        if (!this.geojson)
            return -1;
        const normalized = this.normalizedText(identifier);
        if (!normalized)
            return -1;
        return this.geojson.features.findIndex((feature, featureIndex) => {
            if (!this.isVisible(featureIndex))
                return false;
            return this.searchableValues(feature).some(value => value === normalized);
        });
    }
    selectIndex(index) {
        if (!this.geojson || index < 0 || index >= this.geojson.features.length)
            return null;
        if (this.disabled)
            return null;
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
    select(identifier) {
        if (!this.geojson)
            return null;
        const index = this.countryIndex(identifier);
        return index === -1 ? null : this.selectIndex(index);
    }
    getSelected() {
        if (!this.geojson || this.selectedIndex === null)
            return null;
        return toRegion(this.geojson.features[this.selectedIndex]);
    }
    getSelectedSubdivision() {
        if (!this.subdivisionGeojson || this.selectedSubdivisionIndex === null)
            return null;
        return toSubdivisionRegion(this.subdivisionGeojson.features[this.selectedSubdivisionIndex]);
    }
    subdivisionValues(feature) {
        const props = (feature.properties || {});
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
    isSubdivisionAllowed(feature) {
        const props = (feature.properties || {});
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
        return this.matchesPolicy(codes, this.opts.allowedSubdivisions, this.opts.excludedSubdivisions);
    }
    subdivisionBelongsTo(feature, parent, options) {
        var _a, _b, _c, _d, _e;
        const props = (feature.properties || {});
        const parentIso2 = (_c = (((_a = parent.country) === null || _a === void 0 ? void 0 : _a.iso2) || (((_b = parent.id) === null || _b === void 0 ? void 0 : _b.length) === 2 ? parent.id : undefined))) === null || _c === void 0 ? void 0 : _c.toLowerCase();
        const parentIso3 = (_e = (_d = parent.country) === null || _d === void 0 ? void 0 : _d.iso3) === null || _e === void 0 ? void 0 : _e.toLowerCase();
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
        if (parentValues.some(value => value === parentIso2 || value === parentIso3))
            return true;
        const code = options.codeProperty
            ? props[options.codeProperty]
            : props.iso3166_2 || props.ISO_3166_2 || props.iso31662 || props.code || props.code_3166_2;
        const normalizedCode = code ? String(code).trim().toLowerCase() : '';
        if (parentIso2 && normalizedCode.startsWith(`${parentIso2}-`))
            return true;
        if (parentIso3 && normalizedCode.startsWith(`${parentIso3}-`))
            return true;
        return options.allowUnscoped === true;
    }
    resetSubdivisionState() {
        this.selectedSubdivisionIndex = null;
        this.subdivisionSearchQuery = '';
        this.subdivisionSearchMatches.clear();
    }
    async loadSubdivisions(parentIdentifier, options = {}) {
        await this.ready;
        if (!this.geojson)
            throw new Error('Country data must be loaded before subdivisions');
        if (options.data && options.dataUrl)
            throw new Error('Use either subdivision data or dataUrl, not both');
        const parentIndex = this.countryIndex(parentIdentifier);
        if (parentIndex === -1)
            throw new Error(`Unknown country: ${parentIdentifier}`);
        const parent = toRegion(this.geojson.features[parentIndex]);
        let data = options.data;
        if (!data && options.dataUrl) {
            const response = await fetch(options.dataUrl);
            if (!response.ok)
                throw new Error(`Failed to load subdivisions: ${response.status}`);
            data = await response.json();
        }
        if (!data)
            throw new Error('Subdivision data or dataUrl is required');
        this.subdivisionOptions = options;
        this.subdivisionGeojson = {
            ...data,
            features: data.features.filter(feature => this.subdivisionBelongsTo(feature, parent, options) && this.isSubdivisionAllowed(feature))
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
    getSubdivisions() {
        return this.subdivisionGeojson
            ? this.subdivisionGeojson.features.map(feature => toSubdivisionRegion(feature))
            : [];
    }
    getSubdivisionParent() {
        return this.subdivisionParent;
    }
    searchSubdivisions(query) {
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
    selectSubdivision(identifier) {
        if (this.subdivisionDisabled || !this.subdivisionGeojson)
            return null;
        const normalized = this.normalizedText(identifier);
        if (!normalized)
            return null;
        const index = this.subdivisionGeojson.features.findIndex(feature => this.subdivisionValues(feature).some(value => value === normalized));
        if (index === -1)
            return null;
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
    getContinents() {
        if (!this.geojson)
            return [];
        return [...new Set(this.geojson.features
                .filter(feature => this.isCountryAllowed(feature))
                .map(feature => this.continentFor(feature))
                .filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    }
    getContinent() {
        return this.continentFilter;
    }
    setContinent(continent) {
        const normalized = (continent === null || continent === void 0 ? void 0 : continent.trim().toLowerCase()) || null;
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
        if (!this.geojson)
            return [];
        return this.geojson.features
            .map((_, index) => index)
            .filter(index => this.isVisible(index))
            .map(index => toRegion(this.geojson.features[index]));
    }
    getVisibleRegions() {
        return this.visibleRegions();
    }
    setDisabled(disabled) {
        var _a, _b;
        this.disabled = disabled;
        this.searchListBindings.forEach(binding => {
            if ((binding.options.scope || 'country') !== 'country')
                return;
            binding.input.disabled = disabled;
            binding.input.setAttribute('aria-disabled', String(disabled));
            if (disabled)
                binding.open = false;
            this.renderSearchList(binding);
        });
        if (!this.svg)
            return;
        this.svg.setAttribute('aria-disabled', String(disabled));
        (_a = this.countrySvgGroup) === null || _a === void 0 ? void 0 : _a.querySelectorAll('path.geo-select-region').forEach(path => {
            path.setAttribute('aria-disabled', String(disabled));
            path.setAttribute('tabindex', disabled || path.getAttribute('display') === 'none' ? '-1' : '0');
        });
        (_b = this.countrySvgGroup) === null || _b === void 0 ? void 0 : _b.querySelectorAll('.geo-select-hit-target').forEach(target => {
            target.setAttribute('pointer-events', disabled || target.getAttribute('display') === 'none' ? 'none' : 'all');
        });
    }
    setSubdivisionDisabled(disabled) {
        this.subdivisionDisabled = disabled;
        this.updateSubdivisionVisibility();
        this.searchListBindings.forEach(binding => {
            if ((binding.options.scope || 'country') !== 'subdivision')
                return;
            binding.input.disabled = disabled;
            binding.input.setAttribute('aria-disabled', String(disabled));
            if (disabled)
                binding.open = false;
            this.renderSearchList(binding);
        });
    }
    bindFormField(input, options = {}) {
        var _a, _b, _c;
        if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') {
            throw new Error('bindFormField requires an input element');
        }
        const binding = {
            input,
            valueKey: options.valueKey || 'iso2',
            scope: options.scope || 'country',
            initialValue: input.value,
            syncing: false,
            onInput: () => {
                if (binding.syncing || (binding.scope === 'subdivision' ? this.subdivisionDisabled : this.disabled))
                    return;
                const value = input.value.trim();
                if (!value) {
                    if (binding.scope === 'subdivision')
                        this.clearSubdivision();
                    else
                        this.clear();
                    input.setCustomValidity('');
                    return;
                }
                const selected = binding.scope === 'subdivision'
                    ? this.selectSubdivision(value)
                    : this.select(value);
                if (!selected) {
                    if (binding.scope === 'subdivision')
                        this.clearSubdivision();
                    else
                        this.clear();
                    input.setCustomValidity('Unknown region value');
                }
            },
            onReset: () => {
                Promise.resolve().then(() => {
                    if (!this.formBindings.has(binding))
                        return;
                    input.value = binding.initialValue;
                    this.dispatchFormEvent(input, 'input');
                });
            }
        };
        if (options.required !== undefined)
            input.required = options.required;
        input.addEventListener('input', binding.onInput);
        input.addEventListener('change', binding.onInput);
        (_a = input.form) === null || _a === void 0 ? void 0 : _a.addEventListener('reset', binding.onReset);
        this.formBindings.add(binding);
        const initialValue = input.value.trim();
        if (initialValue) {
            const selected = binding.scope === 'subdivision'
                ? this.selectSubdivision(initialValue)
                : this.select(initialValue);
            if (!selected)
                input.setCustomValidity('Unknown region value');
        }
        else {
            this.syncFormBinding(binding);
        }
        if (binding.scope === 'subdivision')
            this.setSubdivisionDisabled((_b = options.disabled) !== null && _b !== void 0 ? _b : input.disabled);
        else
            this.setDisabled((_c = options.disabled) !== null && _c !== void 0 ? _c : input.disabled);
        return {
            input,
            setDisabled: disabled => {
                input.disabled = disabled;
                if (binding.scope === 'subdivision')
                    this.setSubdivisionDisabled(disabled);
                else
                    this.setDisabled(disabled);
            },
            destroy: () => {
                var _a;
                input.removeEventListener('input', binding.onInput);
                input.removeEventListener('change', binding.onInput);
                (_a = input.form) === null || _a === void 0 ? void 0 : _a.removeEventListener('reset', binding.onReset);
                this.formBindings.delete(binding);
                if (this.formBindings.size === 0) {
                    if (binding.scope === 'subdivision')
                        this.setSubdivisionDisabled(false);
                    else
                        this.setDisabled(false);
                }
            }
        };
    }
    bindSearchList(input, list, options = {}) {
        var _a;
        if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') {
            throw new Error('bindSearchList requires an input element');
        }
        if (!list || list.nodeType !== 1)
            throw new Error('bindSearchList requires a list element');
        if (!list.id) {
            this.searchListId += 1;
            list.id = `geo-select-search-list-${this.searchListId}`;
        }
        const binding = {
            input,
            list,
            options: {
                ...options,
                listLabel: options.listLabel || 'Region search results',
                emptyMessage: options.emptyMessage || 'No matching regions',
                maxResults: (_a = options.maxResults) !== null && _a !== void 0 ? _a : 0
            },
            activeIndex: 0,
            open: false,
            onFocus: () => {
                if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled)
                    return;
                binding.open = true;
                this.renderSearchList(binding);
            },
            onInput: () => {
                if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled)
                    return;
                binding.open = true;
                if ((options.scope || 'country') === 'subdivision')
                    this.searchSubdivisions(input.value);
                else
                    this.search(input.value);
            },
            onKeyDown: event => {
                var _a;
                if ((options.scope || 'country') === 'subdivision' ? this.subdivisionDisabled : this.disabled)
                    return;
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.moveSearchListActive(binding, 1);
                }
                else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.moveSearchListActive(binding, -1);
                }
                else if (event.key === 'Home') {
                    event.preventDefault();
                    this.moveSearchListActive(binding, 0);
                }
                else if (event.key === 'End') {
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
                }
                else if (event.key === 'Enter') {
                    const results = this.searchResultsForScope(options.scope || 'country');
                    const count = binding.options.maxResults > 0
                        ? Math.min(results.length, binding.options.maxResults)
                        : results.length;
                    const region = results[binding.activeIndex];
                    if (binding.open && region && binding.activeIndex < count) {
                        event.preventDefault();
                        const identifier = region.id || ((_a = region.country) === null || _a === void 0 ? void 0 : _a.iso2) || region.name;
                        if (identifier) {
                            if ((options.scope || 'country') === 'subdivision')
                                this.selectSubdivision(identifier);
                            else
                                this.select(identifier);
                        }
                    }
                }
                else if (event.key === 'Escape') {
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
    search(query) {
        if (!this.geojson || !this.svg)
            return [];
        this.searchQuery = this.normalizedText(query);
        this.updateSearchMatches();
        this.updateHighlights();
        this.syncSearchListBindings('search');
        return [...this.searchMatches].map(index => toRegion(this.geojson.features[index]));
    }
    destroy() {
        if (this.svg && this.container.contains(this.svg))
            this.container.removeChild(this.svg);
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
        this.formBindings.forEach(binding => {
            var _a;
            binding.input.removeEventListener('input', binding.onInput);
            binding.input.removeEventListener('change', binding.onInput);
            (_a = binding.input.form) === null || _a === void 0 ? void 0 : _a.removeEventListener('reset', binding.onReset);
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

module.exports = GeoCore;
//# sourceMappingURL=geo-select-core.cjs.map
