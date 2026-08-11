(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.GeoSelectCore = factory());
})(this, (function () { 'use strict';

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
        return { id, name, properties: props, centroid: cent, country: countryInfo(props) };
    }

    class GeoCore {
        constructor(container, options = {}) {
            this.svg = null;
            this.geojson = null;
            this.listeners = { select: [] };
            this.selectedIndex = null;
            this.searchMatches = new Set();
            this.searchQuery = '';
            this.continentFilter = null;
            if (!container)
                throw new Error('container HTMLElement is required');
            this.container = container;
            this.opts = {
                width: options.width || 900,
                height: options.height || 450,
                dataUrl: options.dataUrl || '',
                data: options.data || null,
                initialFill: options.initialFill || '#e6e6e6',
                highlightFill: options.highlightFill || '#ffcc00',
                onReady: options.onReady || (() => { })
            };
            void this.init();
        }
        async init() {
            this.createSvg();
            if (this.opts.data) {
                this.geojson = this.opts.data;
                this.render();
                this.opts.onReady();
            }
            else if (this.opts.dataUrl) {
                await this.loadData(this.opts.dataUrl);
                this.render();
                this.opts.onReady();
            }
            else {
                this.container.textContent = 'No geojson provided. Use options.data or options.dataUrl';
            }
        }
        async loadData(url) {
            const res = await fetch(url);
            if (!res.ok)
                throw new Error('Failed to load geojson');
            this.geojson = await res.json();
        }
        createSvg() {
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
        render() {
            if (!this.svg || !this.geojson)
                return;
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
            svg.appendChild(g);
            this.updateVisibility();
            this.updateHighlights();
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
        updateHighlights() {
            if (!this.svg)
                return;
            const paths = this.svg.querySelectorAll('path');
            paths.forEach((path, index) => {
                const selected = index === this.selectedIndex;
                const highlighted = selected || this.searchMatches.has(index);
                path.setAttribute('fill', highlighted ? this.opts.highlightFill : this.opts.initialFill);
                path.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        }
        regionLabel(feature) {
            const props = (feature.properties || {});
            const name = props.localizedName || props.NAME_KO || props.NAME || props.ADMIN || props.name;
            const id = props.iso3 || props.ISO_A3_EH || props.ISO_A3 || props.iso_a3 || props.code || props.id;
            return name && id ? `${String(name)} (${String(id)})` : String(name || id || 'Unnamed region');
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
        continentFor(feature) {
            const props = (feature.properties || {});
            return String(props.continent || props.CONTINENT || props.CONTINENT_UN || props.REGION_UN || '').trim();
        }
        isVisible(index) {
            if (!this.geojson || !this.continentFilter)
                return true;
            return this.continentFor(this.geojson.features[index]).toLowerCase() === this.continentFilter;
        }
        updateVisibility() {
            if (!this.svg)
                return;
            this.svg.querySelectorAll('path').forEach((path, index) => {
                const visible = this.isVisible(index);
                path.setAttribute('display', visible ? '' : 'none');
                path.setAttribute('aria-hidden', visible ? 'false' : 'true');
                path.setAttribute('tabindex', visible ? '0' : '-1');
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
            this.listeners.select.push(handler);
            return () => {
                const index = this.listeners.select.indexOf(handler);
                if (index !== -1)
                    this.listeners.select.splice(index, 1);
            };
        }
        emit(eventName, region) {
            this.listeners.select.forEach(h => h(region));
        }
        selectIndex(index) {
            if (!this.geojson || index < 0 || index >= this.geojson.features.length)
                return null;
            this.selectedIndex = index;
            const region = toRegion(this.geojson.features[index]);
            this.updateHighlights();
            this.emit('select', region);
            return region;
        }
        select(identifier) {
            if (!this.geojson)
                return null;
            const normalized = identifier.trim().toLowerCase();
            if (!normalized)
                return null;
            const index = this.geojson.features.findIndex((feature, featureIndex) => {
                if (!this.isVisible(featureIndex))
                    return false;
                return this.searchableValues(feature).some(value => value === normalized);
            });
            return index === -1 ? null : this.selectIndex(index);
        }
        getSelected() {
            if (!this.geojson || this.selectedIndex === null)
                return null;
            return toRegion(this.geojson.features[this.selectedIndex]);
        }
        clear() {
            this.selectedIndex = null;
            this.searchMatches.clear();
            this.searchQuery = '';
            this.updateHighlights();
        }
        reset() {
            this.clear();
        }
        getContinents() {
            if (!this.geojson)
                return [];
            return [...new Set(this.geojson.features.map(feature => this.continentFor(feature)).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
        }
        getContinent() {
            return this.continentFilter;
        }
        setContinent(continent) {
            const normalized = (continent === null || continent === void 0 ? void 0 : continent.trim().toLowerCase()) || null;
            this.continentFilter = normalized;
            if (this.selectedIndex !== null && !this.isVisible(this.selectedIndex)) {
                this.selectedIndex = null;
            }
            this.updateVisibility();
            this.updateSearchMatches();
            this.updateHighlights();
            if (!this.geojson)
                return [];
            return this.geojson.features
                .map((_, index) => index)
                .filter(index => this.isVisible(index))
                .map(index => toRegion(this.geojson.features[index]));
        }
        search(query) {
            if (!this.geojson || !this.svg)
                return [];
            this.searchQuery = query.toLowerCase().trim();
            this.updateSearchMatches();
            this.updateHighlights();
            return [...this.searchMatches].map(index => toRegion(this.geojson.features[index]));
        }
        destroy() {
            if (this.svg && this.container.contains(this.svg))
                this.container.removeChild(this.svg);
            this.svg = null;
            this.geojson = null;
            this.listeners = { select: [] };
            this.selectedIndex = null;
            this.searchMatches.clear();
            this.searchQuery = '';
            this.continentFilter = null;
        }
    }

    return GeoCore;

}));
//# sourceMappingURL=geo-select-core.umd.js.map
