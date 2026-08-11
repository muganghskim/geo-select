import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import GeoCore from '../dist/geo-select-core.esm.js';
import worldData from '../dist/world.esm.js';

function pointCount(coordinates) {
  if (!Array.isArray(coordinates)) return 0;
  if (coordinates.length >= 2 && coordinates.every(value => typeof value === 'number')) return 1;
  return coordinates.reduce((total, value) => total + pointCount(value), 0);
}

test('bundled world data contains usable country boundaries and metadata', () => {
  assert.equal(worldData.type, 'FeatureCollection');
  assert.equal(worldData.features.length, 242);

  const korea = worldData.features.find(feature => feature.properties.iso3 === 'KOR');
  assert.ok(korea);
  assert.ok(pointCount(korea.geometry.coordinates) >= 15);
  assert.equal(korea.properties.iso2, 'KR');
  assert.equal(korea.properties.localizedName, '대한민국');
  assert.equal(korea.properties.continent, 'Asia');
  assert.ok(korea.properties.capitals.some(capital => capital.name === 'Seoul'));
});

test('real country data renders detailed paths and returns normalized country info', () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const core = new GeoCore(container, { data: worldData });

  const paths = [...container.querySelectorAll('path')];
  const koreaIndex = worldData.features.findIndex(feature => feature.properties.iso3 === 'KOR');
  const koreaPath = paths[koreaIndex];
  assert.equal(paths.length, 242);
  assert.ok(koreaPath.getAttribute('d').length > 1000);
  assert.equal(koreaPath.getAttribute('fill-rule'), 'evenodd');

  const korea = core.select('KR');
  assert.equal(korea.id, 'KOR');
  assert.equal(korea.country.iso2, 'KR');
  assert.equal(korea.country.iso3, 'KOR');
  assert.equal(korea.country.localizedName, '대한민국');
  assert.equal(korea.country.capitals[0].name, 'Seoul');
  assert.deepEqual(korea.centroid, [128.129504, 36.384924]);

  assert.deepEqual(core.search('대한민국').map(region => region.id), ['KOR']);
  assert.deepEqual(core.search('Seoul').map(region => region.id), ['KOR']);
  dom.window.close();
});

test('custom MultiPolygon centers use every polygon weighted by area', () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const data = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'Islands', code: 'ISL' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
          [[[10, 0], [14, 0], [14, 4], [10, 4], [10, 0]]]
        ]
      }
    }]
  };
  const core = new GeoCore(container, { data });
  const [longitude, latitude] = core.select('ISL').centroid;

  assert.ok(Math.abs(longitude - 9.8) < 1e-9);
  assert.ok(Math.abs(latitude - 1.8) < 1e-9);
  dom.window.close();
});
