import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import GeoCore from '../dist/geo-select-core.esm.js';

const data = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'South Korea', code: 'KR', continent: 'Asia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126, 38], [130, 38], [130, 34], [126, 38]]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Japan', code: 'JP', continent: 'Asia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[130, 46], [146, 46], [146, 30], [130, 46]]]
      }
    }
  ]
};

function createCore() {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const core = new GeoCore(container, { data });
  return { core, dom, paths: [...container.querySelectorAll('path')] };
}

test('select, getSelected, clear, and reset share one state', () => {
  const { core, dom, paths } = createCore();

  assert.equal(core.getSelected(), null);
  assert.equal(core.select('KR')?.name, 'South Korea');
  assert.equal(core.getSelected()?.id, 'KR');
  assert.equal(paths[0].getAttribute('fill'), '#ffcc00');

  assert.equal(core.select('missing'), null);
  assert.equal(core.getSelected()?.id, 'KR');

  core.clear();
  assert.equal(core.getSelected(), null);
  assert.equal(paths[0].getAttribute('fill'), '#e6e6e6');

  core.select('Japan');
  core.reset();
  assert.equal(core.getSelected(), null);
  dom.window.close();
});

test('click selection emits events and subscriptions can be removed', () => {
  const { core, dom, paths } = createCore();
  const selected = [];
  const unsubscribe = core.on('select', region => selected.push(region.id));

  paths[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(selected, ['JP']);
  assert.equal(core.getSelected()?.id, 'JP');

  unsubscribe();
  paths[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(selected, ['JP']);
  assert.equal(core.getSelected()?.id, 'KR');
  dom.window.close();
});

test('search returns matches and keeps selection highlighting synchronized', () => {
  const { core, dom, paths } = createCore();

  core.select('KR');
  assert.deepEqual(core.search('jap').map(region => region.id), ['JP']);
  assert.equal(paths[0].getAttribute('fill'), '#ffcc00');
  assert.equal(paths[1].getAttribute('fill'), '#ffcc00');

  assert.deepEqual(core.search(''), []);
  assert.equal(paths[0].getAttribute('fill'), '#ffcc00');
  assert.equal(paths[1].getAttribute('fill'), '#e6e6e6');

  core.clear();
  assert.equal(paths[0].getAttribute('fill'), '#e6e6e6');
  dom.window.close();
});

test('continent filters visibility, search, and selectable regions together', () => {
  const { core, dom, paths } = createCore();

  assert.deepEqual(core.getContinents(), ['Asia']);
  assert.deepEqual(core.setContinent('asia').map(region => region.id), ['KR', 'JP']);
  assert.equal(core.getContinent(), 'asia');
  assert.deepEqual(core.search('Japan').map(region => region.id), ['JP']);
  assert.equal(paths[0].getAttribute('display'), '');
  assert.equal(paths[1].getAttribute('display'), '');

  assert.deepEqual(core.setContinent('Europe'), []);
  assert.equal(paths[0].getAttribute('display'), 'none');
  assert.deepEqual(core.search('Korea'), []);
  assert.equal(core.select('KR'), null);

  core.clear();
  core.setContinent('asia');
  assert.equal(paths[1].getAttribute('fill'), '#e6e6e6');

  assert.deepEqual(core.setContinent(null).map(region => region.id), ['KR', 'JP']);
  assert.equal(paths[0].getAttribute('display'), '');
  dom.window.close();
});
