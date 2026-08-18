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

The current release provides the country and territory selection core, `bindFormField()` for native form value and validation integration, `bindSearchList()` for an accessible map-independent search path, optional ISO 3166-2 subdivision loading, and locale-aware labels/search. Configurable availability rules and lighter responsive loading are the next product priorities.

The SVG map is responsive by default and preserves its configured aspect ratio inside a narrow form layout. Small regions receive transparent touch hit targets sized by `touchTargetSize` (24px by default), while the visible country paths remain the accessible keyboard controls. Set `touchTargetSize: 0` to opt out when the host supplies its own interaction layer.

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

Pass a locale to choose a dataset's localized label fields such as `name_ko` or `name_es`. Search is case-insensitive and diacritic-tolerant, and `aliases` lets a host application add product-specific names without changing its GeoJSON. `direction: 'auto'` applies RTL direction for Arabic, Persian, Hebrew, and Urdu locales.

```js
const core = new GeoCore(container, {
  data: worldData,
  locale: 'ko-KR',
  direction: 'auto',
  aliases: { US: ['USA', 'United States'] }
});

core.search('cote d ivoire');
core.select('USA');
console.log(core.getSelected()?.country?.iso2); // stable machine value: US
```

Locale and aliases affect labels and lookup only. Form bindings continue to submit ISO-2/ISO-3 or feature IDs, so billing providers receive stable machine values rather than translated names.

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

## Optional ISO 3166-2 subdivisions

Country data is bundled, but administrative subdivisions are intentionally injected by the host application so each product can choose a licensed and current dataset. The recommended GeoJSON contract for first-level billing regions is:

```json
{
  "type": "Feature",
  "properties": {
    "parentIso2": "KR",
    "iso3166_2": "KR-11",
    "name": "Seoul",
    "level": "admin1"
  }
}
```

Load only the selected country's data, then bind a second input/listbox for a billing state, province, or region:

```js
await core.loadSubdivisions('KR', {
  dataUrl: '/licensed-data/kr-admin1.geojson'
});

const regionBinding = core.bindFormField(
  document.querySelector('[name="billingRegion"]'),
  { scope: 'subdivision', valueKey: 'id', required: true }
);
const regionSearch = core.bindSearchList(
  document.querySelector('#billing-region-search'),
  document.querySelector('#billing-region-results'),
  { scope: 'subdivision', listLabel: 'Billing region results' }
);

core.selectSubdivision('KR-11');
console.log(core.getSelectedSubdivision()?.subdivision);
```

`loadSubdivisions()` filters by `parentIso2`/`parentIso3` and accepts code aliases such as `ISO_3166_2` or a configured `codeProperty`. A code prefixed with the parent country, such as `KR-11`, is also recognized. Pass `allowUnscoped: true` only when the supplied file is already scoped to the selected country. The package does not bundle subdivision boundaries or claim a dataset's license, freshness, or billing eligibility; the host application remains responsible for those choices.

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
