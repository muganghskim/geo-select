/** equirectangular projection (lon,lat) -> x,y */
function project(lon, lat, width, height) {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
}
function centroidOfCoordinates(coords) {
    let sumX = 0, sumY = 0, count = 0;
    coords.forEach(([lon, lat]) => {
        sumX += lon;
        sumY += lat;
        count += 1;
    });
    return [sumX / count, sumY / count];
}
function featureCentroid(feature) {
    if (!feature.geometry)
        return null;
    const g = feature.geometry;
    if (g.type === 'Polygon') {
        // Polygon: [ [ [lon,lat], ... ] , ... ]
        const rings = g.coordinates;
        return centroidOfCoordinates(rings[0]);
    }
    if (g.type === 'MultiPolygon') {
        const multipolys = g.coordinates;
        // pick the first polygon's first ring
        if (multipolys.length > 0 && multipolys[0].length > 0) {
            return centroidOfCoordinates(multipolys[0][0]);
        }
        return null;
    }
    if (g.type === 'Point') {
        const p = g.coordinates;
        return [p[0], p[1]];
    }
    return null;
}
function toRegion(feature) {
    const props = (feature.properties || {});
    const id = props.ISO_A3 || props.iso_a3 || props.id || props.code || undefined;
    const name = props.NAME || props.ADMIN || props.name || undefined;
    const cent = featureCentroid(feature) || undefined;
    return { id, name, properties: props, centroid: cent };
}

class GeoCore {
    constructor(container, options = {}) {
        this.svg = null;
        this.geojson = null;
        this.listeners = { select: [] };
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
            path.setAttribute('data-index', String(i));
            // 타입 캐스팅으로 style 사용
            path.style.cursor = 'pointer';
            path.addEventListener('click', () => {
                const region = toRegion(feature);
                this.emit('select', region);
                this.highlight(path);
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
    highlight(pathEl) {
        if (!this.svg)
            return;
        const paths = this.svg.querySelectorAll('path');
        paths.forEach(p => p.setAttribute('fill', this.opts.initialFill));
        pathEl.setAttribute('fill', this.opts.highlightFill);
    }
    on(eventName, handler) {
        this.listeners.select.push(handler);
    }
    emit(eventName, region) {
        this.listeners.select.forEach(h => h(region));
    }
    search(query) {
        if (!this.geojson || !this.svg)
            return;
        const q = query.toLowerCase().trim();
        const matches = [];
        this.geojson.features.forEach((f, i) => {
            const props = (f.properties || {});
            const name = (props.NAME || props.ADMIN || props.name || '').toString().toLowerCase();
            const iso = (props.ISO_A3 || props.iso_a3 || props.code || '').toString().toLowerCase();
            if (name.includes(q) || iso.includes(q))
                matches.push(i);
        });
        const svgPaths = this.svg.querySelectorAll('path');
        svgPaths.forEach((p, idx) => {
            const fill = matches.includes(idx) ? this.opts.highlightFill : this.opts.initialFill;
            p.setAttribute('fill', fill);
        });
    }
    destroy() {
        if (this.svg && this.container.contains(this.svg))
            this.container.removeChild(this.svg);
        this.svg = null;
        this.geojson = null;
        this.listeners = { select: [] };
    }
}

export { GeoCore as default };
//# sourceMappingURL=geo-select-core.esm.js.map
