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
