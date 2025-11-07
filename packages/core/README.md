# geo-select-core


Vanilla JS core for interactive world-region selection. This minimal core expects a GeoJSON FeatureCollection (countries) and renders a simple SVG map (equirectangular projection).


## Quick start
```html
<div id="map"></div>
<script type="module">
import GeoCore from './dist/index.esm.js';
const container = document.getElementById('map');
const core = new GeoCore(container, { dataUrl: '/data/world.geo.json' });
core.on('select', r => console.log('selected', r));
</script>
```


## Notes
- 초기 버전은 간단한 projection(평면)과 기본 렌더링만 제공합니다.
- 고해상도 렌더링, topojson 지원, 경계 smoothing 등은 향후 개선 예정입니다.
