# geo-select-core

Vanilla JS core for interactive world-region selection. The core accepts a GeoJSON FeatureCollection and renders a simple SVG map using an equirectangular projection.

## Product intent

geo-select is designed to replace cumbersome country and region `<select>` fields in production signup, onboarding, and billing-address flows. Its north star is not a decorative map: it is an accessible, locale-aware form control that adds spatial interaction while returning stable ISO-based values to the host application.

Development follows these principles:

- Preserve standard form semantics. Map interaction must integrate cleanly with values, validation, disabled states, resets, and `input`/`change` events.
- Keep the map, search results, and an accessible list synchronized. The map must never be the only way to select a small country or territory.
- Show names appropriate for the user's locale while exposing stable ISO identifiers to application code.
- Treat location inference as a suggestion only. Never silently commit a country on the user's behalf.
- Stay framework- and payment-provider-independent. The package selects billing geography; it does not collect card data or replace payment compliance checks.
- Keep boundary and subdivision datasets optional so form-heavy applications can load only the detail they need.

The current release provides the country and territory selection core, `bindFormField()` for native form value and validation integration, and `bindSearchList()` for an accessible map-independent search path. ISO 3166-2 subdivision support, broader localization, configurable availability rules, and lighter responsive loading are the next product priorities.

## Install

```bash
npm install geo-select-core
```

## Quick start

```html
<div id="map"></div>
<script type="module">
import GeoCore from 'geo-select-core';
import worldData from 'geo-select-core/world';

const container = document.getElementById('map');
const core = new GeoCore(container, { data: worldData });
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

To connect the selected ISO value to a signup or billing form, bind a named input. The binding keeps the input value, `input`/`change` events, required validation, programmatic selection, and form reset synchronized:

```html
<form id="signup-form">
  <input name="billingCountry" aria-label="Billing country" />
</form>
```

```js
const countryInput = document.querySelector('[name="billingCountry"]');
const binding = core.bindFormField(countryInput, {
  valueKey: 'iso2',
  required: true
});

core.select('KR');
console.log(new FormData(document.querySelector('#signup-form')).get('billingCountry'));

binding.setDisabled(true);
binding.destroy();
```

Use a text input or a visually hidden text input when browser constraint validation is required; native `type="hidden"` controls are excluded from constraint validation. `valueKey` accepts `iso2` (default), `iso3`, or `id`.

For a map-independent accessible path, connect a search input to a listbox. The list opens on focus, supports Arrow keys and Enter, and stays synchronized when a region is selected on the map or cleared through the core API:

```html
<input id="country-search" type="search" aria-label="Country" />
<ul id="country-results"></ul>
```

```js
const searchBinding = core.bindSearchList(
  document.querySelector('#country-search'),
  document.querySelector('#country-results'),
  { listLabel: 'Country results' }
);

core.setContinent('Asia');
core.select('KR');
searchBinding.destroy();
```

`bindSearchList()` renders safe text nodes from the current GeoJSON results and does not silently select a result while typing. Style `.geo-select-search-option-active` in the host application to match its active keyboard option state.

CommonJS projects can load the same default export:

```js
const GeoCore = require('geo-select-core');
```

The package includes ESM, CommonJS, UMD, and TypeScript declaration outputs. Importing `geo-select-core/world` loads the optional Natural Earth 1:50m dataset with 242 country and territory boundaries. The main core entry stays small, and custom GeoJSON can still be supplied through `data` or `dataUrl`.

`select()` accepts an exact country or region code/name and returns the selected region, or `null` when no match exists. `search()` returns every matching region while synchronizing map highlights. `clear()` resets both selection and search highlights; `reset()` remains available as an alias.

`setContinent()` filters visible regions, search results, and selectable map paths using a `continent`, `CONTINENT`, `CONTINENT_UN`, or `REGION_UN` GeoJSON property. Pass `null` or an empty string to clear the filter. `getContinents()` returns the available values from the loaded data.

Rendered regions are keyboard accessible buttons: focus a visible region and press Enter or Space to select it. Hidden regions are removed from the tab order, and selected regions expose `aria-pressed="true"`.

With the bundled world data, each returned `Region` contains a normalized `country` object with ISO-2/3 and numeric codes, official and Korean names, continent and subregion, capitals and coordinates, population, GDP, economy, income group, and Wikidata ID. `centroid` uses Natural Earth's cartographic label position when available and falls back to an area-weighted centroid for custom Polygon and MultiPolygon data.

Country boundaries and metadata are derived from Natural Earth public-domain data. See `DATA_LICENSE.md` for source details.

## Notes

- 초기 버전은 간단한 projection(평면)과 기본 렌더링만 제공합니다.
- 고해상도 렌더링, topojson 지원, 경계 smoothing 등은 향후 개선 예정입니다.
