# geo-select-core

Vanilla JS core for interactive world-region selection. The core accepts a GeoJSON FeatureCollection and renders a simple SVG map using an equirectangular projection.

## Install

```bash
npm install geo-select-core
```

## Quick start

```html
<div id="map"></div>
<script type="module">
import GeoCore from 'geo-select-core';

const container = document.getElementById('map');
const core = new GeoCore(container, { dataUrl: '/data/world.geo.json' });
core.on('select', r => console.log('selected', r));
</script>
```

CommonJS projects can load the same default export:

```js
const GeoCore = require('geo-select-core');
```

The package includes ESM, CommonJS, UMD, and TypeScript declaration outputs. Map data is supplied by the consumer through `data` or `dataUrl`.

## Notes

- 초기 버전은 간단한 projection(평면)과 기본 렌더링만 제공합니다.
- 고해상도 렌더링, topojson 지원, 경계 smoothing 등은 향후 개선 예정입니다.
