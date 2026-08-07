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
const unsubscribe = core.on('select', r => console.log('selected', r));

core.select('KR');
console.log(core.getSelected());
console.log(core.search('Korea'));
core.setContinent('Asia');
console.log(core.getContinents());
core.clear();
unsubscribe();
</script>
```

CommonJS projects can load the same default export:

```js
const GeoCore = require('geo-select-core');
```

The package includes ESM, CommonJS, UMD, and TypeScript declaration outputs. Map data is supplied by the consumer through `data` or `dataUrl`.

`select()` accepts an exact country or region code/name and returns the selected region, or `null` when no match exists. `search()` returns every matching region while synchronizing map highlights. `clear()` resets both selection and search highlights; `reset()` remains available as an alias.

`setContinent()` filters visible regions, search results, and selectable map paths using a `continent`, `CONTINENT`, `CONTINENT_UN`, or `REGION_UN` GeoJSON property. Pass `null` or an empty string to clear the filter. `getContinents()` returns the available values from the loaded data.

## Notes

- 초기 버전은 간단한 projection(평면)과 기본 렌더링만 제공합니다.
- 고해상도 렌더링, topojson 지원, 경계 smoothing 등은 향후 개선 예정입니다.
