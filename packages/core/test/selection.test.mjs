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
