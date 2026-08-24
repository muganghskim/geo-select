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

test('reports data loading errors and supports an explicit retry', async () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const previousFetch = globalThis.fetch;
  const errors = [];
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => data };
  };

  try {
    const core = new GeoCore(container, {
      dataUrl: '/world.geo.json',
      onError: error => errors.push(error)
    });
    await core.whenReady();
    assert.equal(core.getStatus(), 'error');
    assert.equal(core.getLoadError()?.message, 'Failed to load geojson: 503');
    assert.equal(errors.length, 1);
    assert.equal(container.getAttribute('role'), 'alert');
    assert.equal(container.getAttribute('data-geo-select-status'), 'error');
    assert.match(container.textContent, /Unable to load region data/);

    assert.equal(await core.retry(), true);
    assert.equal(attempts, 2);
    assert.equal(core.getStatus(), 'ready');
    assert.equal(core.getLoadError(), null);
    assert.equal(container.getAttribute('data-geo-select-status'), 'ready');
    assert.equal(container.getAttribute('role'), null);
    assert.equal(core.getVisibleRegions().length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});

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

test('locale labels, aliases, and diacritic-tolerant search preserve ISO values', () => {
  const dom = new JSDOM('<div id="map"></div><form><input name="country" /></form>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const input = dom.window.document.querySelector('[name="country"]');
  const localizedData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: 'Côte d’Ivoire',
          iso2: 'CI',
          iso3: 'CIV',
          name_es: 'Costa de Marfil'
        },
        geometry: { type: 'Polygon', coordinates: [[[0, 5], [2, 5], [2, 3], [0, 5]]] }
      },
      {
        type: 'Feature',
        properties: { name: 'São Tomé and Príncipe', iso2: 'ST', iso3: 'STP' },
        geometry: { type: 'Polygon', coordinates: [[[6, 1], [8, 1], [8, -1], [6, 1]]] }
      }
    ]
  };
  const core = new GeoCore(container, {
    data: localizedData,
    locale: 'es-MX',
    aliases: { CI: ['Ivory Coast'] }
  });
  const paths = pathsFor(container);

  assert.equal(paths[0].getAttribute('aria-label'), 'Costa de Marfil (CIV)');
  assert.deepEqual(core.search('cote d ivoire').map(region => region.id), ['CIV']);
  assert.deepEqual(core.search('ivory coast').map(region => region.id), ['CIV']);
  assert.deepEqual(core.search('sao tome').map(region => region.id), ['STP']);

  const binding = core.bindFormField(input, { valueKey: 'iso2' });
  assert.equal(core.select('Costa de Marfil')?.country?.iso2, 'CI');
  assert.equal(input.value, 'CI');
  assert.equal(core.getSelected()?.id, 'CIV');
  binding.destroy();
  dom.window.close();
});

test('auto direction supports RTL locales for the map and search list', () => {
  const dom = new JSDOM('<div id="map"></div><input id="search" /><ul id="results"></ul>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const input = dom.window.document.querySelector('#search');
  const list = dom.window.document.querySelector('#results');
  const rtlData = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'Spain', iso2: 'ES', iso3: 'ESP', name_ar: 'إسبانيا' },
      geometry: { type: 'Polygon', coordinates: [[[-9, 44], [-2, 44], [-2, 36], [-9, 44]]] }
    }]
  };
  const core = new GeoCore(container, { data: rtlData, locale: 'ar', direction: 'auto' });
  const binding = core.bindSearchList(input, list);

  assert.equal(container.querySelector('svg').getAttribute('dir'), 'rtl');
  assert.equal(pathsFor(container)[0].getAttribute('aria-label'), 'إسبانيا (ESP)');
  assert.equal(input.getAttribute('dir'), 'rtl');
  assert.equal(list.getAttribute('dir'), 'rtl');

  binding.destroy();
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

test('availability policies apply consistently to map, search, and direct selection', () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const core = new GeoCore(container, {
    data,
    allowedCountries: ['JP', 'KR'],
    excludedCountries: ['KR']
  });
  const paths = pathsFor(container);

  assert.deepEqual(core.getVisibleRegions().map(region => region.id), ['JP']);
  assert.deepEqual(core.search('Korea'), []);
  assert.equal(paths[0].getAttribute('display'), 'none');
  assert.equal(core.select('KR'), null);
  assert.equal(core.select('JP')?.id, 'JP');
  assert.deepEqual(core.getContinents(), ['Asia']);
  dom.window.close();
});

test('regions support keyboard selection and expose accessible state', () => {
  const { core, dom, paths } = createCore();

  assert.equal(paths[0].getAttribute('role'), 'button');
  assert.equal(paths[0].getAttribute('tabindex'), '0');
  assert.equal(paths[0].getAttribute('aria-label'), 'South Korea (KR)');
  assert.equal(paths[0].getAttribute('aria-pressed'), 'false');

  paths[0].dispatchEvent(new dom.window.FocusEvent('focus'));
  assert.equal(paths[0].getAttribute('stroke-width'), '2');

  paths[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ' }));
  assert.equal(core.getSelected()?.id, 'KR');
  assert.equal(paths[0].getAttribute('aria-pressed'), 'true');

  paths[0].dispatchEvent(new dom.window.FocusEvent('blur'));
  assert.equal(paths[0].getAttribute('stroke-width'), '1');

  core.setContinent('Europe');
  assert.equal(paths[0].getAttribute('aria-hidden'), 'true');
  assert.equal(paths[0].getAttribute('tabindex'), '-1');
  dom.window.close();
});

test('responsive maps provide touch targets for small regions without changing selection values', () => {
  const { core, dom, paths } = createCore();
  const svg = document.querySelector('#map svg');
  const hitTarget = document.querySelector('.geo-select-hit-target[data-index="0"]');

  assert.equal(svg.getAttribute('width'), '100%');
  assert.equal(svg.getAttribute('height'), 'auto');
  assert.equal(svg.getAttribute('preserveAspectRatio'), 'xMidYMid meet');
  assert.equal(svg.style.width, '100%');
  assert.equal(svg.style.touchAction, 'manipulation');
  assert.ok(hitTarget);
  assert.equal(hitTarget.getAttribute('aria-hidden'), 'true');
  assert.equal(hitTarget.getAttribute('tabindex'), '-1');

  hitTarget.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(core.getSelected()?.id, 'KR');
  assert.equal(paths[0].getAttribute('aria-pressed'), 'true');

  core.setDisabled(true);
  assert.equal(hitTarget.getAttribute('pointer-events'), 'none');
  core.setDisabled(false);
  assert.equal(hitTarget.getAttribute('pointer-events'), 'all');
  dom.window.close();
});

test('bindFormField synchronizes submitted values, validation, reset, and disabled state', async () => {
  const dom = new JSDOM('<form><input name="billingCountry" value="KR" /></form>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.createElement('div');
  const form = dom.window.document.querySelector('form');
  const input = form.querySelector('input');
  const core = new GeoCore(container, { data });
  const binding = core.bindFormField(input, { required: true, valueKey: 'iso2' });
  let inputEvents = 0;
  let changeEvents = 0;
  input.addEventListener('input', () => { inputEvents += 1; });
  input.addEventListener('change', () => { changeEvents += 1; });

  assert.equal(core.getSelected()?.id, 'KR');
  assert.equal(input.value, 'KR');
  assert.equal(form.elements.billingCountry.value, 'KR');

  core.select('JP');
  assert.equal(input.value, 'JP');
  assert.equal(input.checkValidity(), true);
  assert.equal(inputEvents, 1);
  assert.equal(changeEvents, 1);

  binding.setDisabled(true);
  assert.equal(core.select('KR'), null);
  assert.equal(core.getSelected()?.id, 'JP');
  assert.equal(input.disabled, true);

  binding.setDisabled(false);
  core.clear();
  assert.equal(input.value, '');
  assert.equal(input.checkValidity(), false);

  input.value = 'XX';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(input.value, '');
  assert.equal(input.checkValidity(), false);

  input.value = 'JP';
  form.reset();
  await Promise.resolve();
  assert.equal(core.getSelected()?.id, 'KR');
  assert.equal(input.value, 'KR');

  binding.destroy();
  core.select('JP');
  assert.equal(input.value, 'KR');
  dom.window.close();
});

test('bindSearchList provides an accessible map-independent selection path', () => {
  const dom = new JSDOM('<div id="map"></div><input id="search" /><ul id="results"></ul>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const input = dom.window.document.querySelector('#search');
  const list = dom.window.document.querySelector('#results');
  const core = new GeoCore(container, { data });
  const binding = core.bindSearchList(input, list, { listLabel: 'Countries' });

  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-controls'), 'results');
  assert.equal(list.getAttribute('role'), 'listbox');

  input.dispatchEvent(new dom.window.FocusEvent('focus'));
  assert.equal(list.hidden, false);
  assert.equal(list.querySelectorAll('[role="option"]').length, 2);

  input.value = 'jap';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(list.querySelectorAll('[role="option"]').length, 1);
  assert.equal(list.querySelector('[role="option"]').textContent, 'Japan');
  assert.equal(pathsFor(container)[1].getAttribute('fill'), '#ffcc00');

  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(core.getSelected()?.id, 'JP');
  assert.equal(input.value, 'Japan');
  assert.equal(list.hidden, true);

  core.select('KR');
  assert.equal(input.value, 'South Korea');
  input.dispatchEvent(new dom.window.FocusEvent('focus'));
  assert.equal(list.querySelector('[aria-selected="true"]').textContent, 'South Korea');

  core.clear();
  assert.equal(input.value, '');
  assert.equal(list.hidden, true);

  binding.destroy();
  assert.equal(input.getAttribute('role'), null);
  dom.window.close();
});

function pathsFor(container) {
  return [...container.querySelectorAll('path')];
}

test('loads scoped ISO 3166-2 subdivisions and binds them to billing fields', async () => {
  const dom = new JSDOM('<div id="map"></div><form><input name="billingRegion" /></form><input id="region-search" /><ul id="region-results"></ul>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const regionInput = dom.window.document.querySelector('[name="billingRegion"]');
  const searchInput = dom.window.document.querySelector('#region-search');
  const list = dom.window.document.querySelector('#region-results');
  const core = new GeoCore(container, { data });
  const subdivisions = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-11', name: 'Seoul' },
        geometry: { type: 'Polygon', coordinates: [[[126, 38], [127, 38], [127, 37], [126, 38]]] }
      },
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-26', name: 'Busan' },
        geometry: { type: 'Polygon', coordinates: [[[129, 36], [130, 36], [130, 35], [129, 36]]] }
      },
      {
        type: 'Feature',
        properties: { parentIso2: 'JP', iso3166_2: 'JP-13', name: 'Tokyo' },
        geometry: { type: 'Polygon', coordinates: [[[139, 36], [140, 36], [140, 35], [139, 36]]] }
      }
    ]
  };

  const loaded = await core.loadSubdivisions('KR', { data: subdivisions });
  assert.deepEqual(loaded.map(region => region.id), ['KR-11', 'KR-26']);
  assert.equal(core.getSubdivisionParent()?.id, 'KR');
  assert.deepEqual(core.searchSubdivisions('seoul').map(region => region.id), ['KR-11']);

  const binding = core.bindFormField(regionInput, {
    scope: 'subdivision',
    valueKey: 'id',
    required: true
  });
  const listBinding = core.bindSearchList(searchInput, list, {
    scope: 'subdivision',
    listLabel: 'Billing region results'
  });

  assert.equal(core.selectSubdivision('KR-11')?.subdivision.code, 'KR-11');
  assert.equal(core.getSelectedSubdivision()?.name, 'Seoul');
  assert.equal(regionInput.value, 'KR-11');
  assert.equal(regionInput.checkValidity(), true);

  searchInput.dispatchEvent(new dom.window.FocusEvent('focus'));
  assert.equal(list.querySelectorAll('[role="option"]').length, 2);
  searchInput.value = 'bus';
  searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(list.querySelector('[role="option"]').textContent, 'Busan');

  core.clearSubdivision();
  assert.equal(core.getSelectedSubdivision(), null);
  assert.equal(regionInput.value, '');
  assert.equal(regionInput.checkValidity(), false);

  core.select('JP');
  assert.deepEqual(core.getSubdivisions(), []);
  assert.equal(core.getSubdivisionParent(), null);

  listBinding.destroy();
  binding.destroy();
  dom.window.close();
});

test('subdivision availability policies filter loaded billing regions by ISO 3166-2 code', async () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const core = new GeoCore(container, { data, allowedSubdivisions: ['KR-26', 'KR-11'] });
  const subdivisions = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-11', name: 'Seoul' },
        geometry: { type: 'Polygon', coordinates: [[[126, 38], [127, 38], [127, 37], [126, 38]]] }
      },
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-26', name: 'Busan' },
        geometry: { type: 'Polygon', coordinates: [[[129, 36], [130, 36], [130, 35], [129, 36]]] }
      },
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-27', name: 'Daegu' },
        geometry: { type: 'Polygon', coordinates: [[[128, 36], [129, 36], [129, 35], [128, 36]]] }
      }
    ]
  };

  assert.deepEqual((await core.loadSubdivisions('KR', {
    data: subdivisions
  })).map(region => region.id), ['KR-11', 'KR-26']);
  assert.equal(core.selectSubdivision('KR-27'), null);
  assert.equal(core.selectSubdivision('KR-26')?.subdivision?.code, 'KR-26');
  dom.window.close();
});

test('wheel zoom follows the pointer and public controls clamp and reset the map scale', () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const container = dom.window.document.querySelector('#map');
  const zoomChanges = [];
  const core = new GeoCore(container, {
    data,
    maxZoom: 1.5,
    zoomStep: 0.25,
    onZoom: scale => zoomChanges.push(scale)
  });
  const svg = container.querySelector('svg');
  const layer = container.querySelector('.geo-select-country-layer');
  const path = container.querySelector('.geo-select-region');
  const capturedPointers = new Set();
  svg.setPointerCapture = pointerId => capturedPointers.add(pointerId);
  svg.hasPointerCapture = pointerId => capturedPointers.has(pointerId);
  svg.releasePointerCapture = pointerId => capturedPointers.delete(pointerId);
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 900,
    bottom: 450,
    width: 900,
    height: 450,
    x: 0,
    y: 0,
    toJSON() { return this; }
  });

  const wheel = new dom.window.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 225,
    clientY: 112.5,
    deltaY: -100
  });
  svg.dispatchEvent(wheel);

  assert.equal(wheel.defaultPrevented, true);
  assert.equal(core.getZoom(), 1.25);
  assert.equal(svg.getAttribute('data-geo-select-zoom'), '1.25');
  assert.equal(layer.getAttribute('transform'), 'translate(-56.25 -28.125) scale(1.25)');

  const pointerEvent = (type, clientX, clientY) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    return event;
  };
  path.dispatchEvent(pointerEvent('pointerdown', 225, 112.5));
  path.dispatchEvent(pointerEvent('pointerup', 225, 112.5));
  path.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(capturedPointers.size, 0);
  assert.equal(core.getSelected()?.id, 'KR');

  core.clear();
  path.dispatchEvent(pointerEvent('pointerdown', 225, 112.5));
  svg.dispatchEvent(pointerEvent('pointermove', 245, 122.5));
  assert.equal(capturedPointers.has(1), true);
  svg.dispatchEvent(pointerEvent('pointerup', 245, 122.5));
  path.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(core.getSelected(), null);

  assert.equal(core.zoomIn(), 1.5);
  assert.equal(core.zoomIn(), 1.5);
  assert.equal(core.zoomOut(), 1.2);
  assert.equal(core.resetZoom(), 1);
  assert.equal(layer.getAttribute('transform'), 'translate(0 0) scale(1)');
  assert.deepEqual(zoomChanges, [1.25, 1.5, 1.2, 1]);

  core.destroy();
  dom.window.close();
  delete globalThis.window;
});

test('overlapping small-region targets select the country nearest to the pointer after zoom', () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const nearbyCountries = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'South Korea', code: 'KR' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[126, 38], [128, 38], [128, 36], [126, 38]]]
        }
      },
      {
        type: 'Feature',
        properties: { name: 'North Korea', code: 'KP' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[126, 42], [128, 42], [128, 40], [126, 42]]]
        }
      }
    ]
  };
  const core = new GeoCore(container, { data: nearbyCountries });
  const svg = container.querySelector('svg');
  const targets = container.querySelectorAll('.geo-select-hit-target');
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 900,
    bottom: 450,
    width: 900,
    height: 450,
    x: 0,
    y: 0,
    toJSON() { return this; }
  });

  assert.equal(targets.length, 2);
  assert.equal(core.zoomIn(), 1.25);
  assert.equal(targets[0].getAttribute('r'), '9.6');
  const firstX = Number(targets[0].getAttribute('cx'));
  const firstY = Number(targets[0].getAttribute('cy'));
  targets[1].dispatchEvent(new dom.window.MouseEvent('click', {
    bubbles: true,
    clientX: -112.5 + firstX * 1.25,
    clientY: -56.25 + firstY * 1.25
  }));

  assert.equal(core.getSelected()?.id, 'KR');
  dom.window.close();
});

test('renders loaded subdivisions as an accessible map layer and restores the country map', async () => {
  const dom = new JSDOM('<div id="map"></div>');
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector('#map');
  const core = new GeoCore(container, { data });
  const subdivisions = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-11', name: 'Seoul' },
        geometry: { type: 'Polygon', coordinates: [[[126, 38], [127, 38], [127, 37], [126, 38]]] }
      },
      {
        type: 'Feature',
        properties: { parentIso2: 'KR', iso3166_2: 'KR-26', name: 'Busan' },
        geometry: { type: 'Polygon', coordinates: [[[129, 36], [130, 36], [130, 35], [129, 36]]] }
      }
    ]
  };

  await core.loadSubdivisions('KR', { data: subdivisions });
  const countryLayer = container.querySelector('.geo-select-country-layer');
  const subdivisionLayer = container.querySelector('.geo-select-subdivision-layer');
  assert.equal(countryLayer.getAttribute('display'), 'none');
  assert.equal(subdivisionLayer.getAttribute('role'), 'group');
  assert.deepEqual(
    [...subdivisionLayer.querySelectorAll('path')].map(path => path.getAttribute('aria-label')),
    ['Seoul (KR-11)', 'Busan (KR-26)']
  );

  const subdivisionPaths = subdivisionLayer.querySelectorAll('path');
  subdivisionPaths[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(core.getSelectedSubdivision()?.id, 'KR-11');
  assert.equal(subdivisionPaths[0].getAttribute('aria-pressed'), 'true');

  core.searchSubdivisions('bus');
  assert.equal(subdivisionPaths[1].getAttribute('fill'), '#ffcc00');
  core.setSubdivisionDisabled(true);
  assert.equal(subdivisionPaths[1].getAttribute('tabindex'), '-1');
  core.setSubdivisionDisabled(false);
  subdivisionPaths[1].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(core.getSelectedSubdivision()?.id, 'KR-26');

  core.select('JP');
  assert.equal(container.querySelector('.geo-select-subdivision-layer'), null);
  assert.equal(countryLayer.getAttribute('display'), '');
  assert.equal(pathsFor(container).length, 2);
  dom.window.close();
});
