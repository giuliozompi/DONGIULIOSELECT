import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fitCountryBounds, getCountryBounds, matchCountryFeature, type CountryFeature } from '../client/src/web/admin/editorial/cheeseCountryMap';

const features: CountryFeature[] = JSON.parse(readFileSync('client/public/editorial/world.geojson', 'utf8')).features;
const find = (name: string) => {
  const feature = matchCountryFeature(features, name);
  assert.ok(feature, name);
  return feature;
};

test('country matching recognizes exact Russian, original-language and ISO names without parent-territory confusion', () => {
  for (const [names, code] of [
    [['Италия', 'Italia', 'Italy', 'IT', 'ITA', '  италия  '], 'IT'],
    [['Франция', 'France', 'FR'], 'FR'],
    [['Россия', 'РФ', 'Российская Федерация', 'RU'], 'RU'],
    [['UK', 'Великобритания', 'GB'], 'GB'],
    [['США', 'USA', 'US'], 'US'],
    [['Denmark', 'Дания', 'DK'], 'DK'],
  ] as const) {
    for (const name of names) assert.equal(find(name).properties.ISO_A2_EH, code, name);
  }
  for (const unknown of ['', ' ', 'Страна которой нет', 'Ital', 'France extra'])
    assert.equal(matchCountryFeature(features, unknown), null);
});

test('country focus uses mainland France and compact antimeridian-aware bounds for Russia and Fiji', () => {
  const france = getCountryBounds(find('France'))!;
  assert.ok(france.south > 40 && france.north < 52);
  assert.ok(france.longitudeSpan < 20 && france.centerLongitude > -6 && france.centerLongitude < 10);
  const russia = getCountryBounds(find('RU'))!;
  assert.ok(russia.longitudeSpan > 130 && russia.longitudeSpan < 200);
  const fiji = getCountryBounds(find('FJ'))!;
  assert.ok(fiji.longitudeSpan < 10 && Math.abs(fiji.centerLongitude) > 170);
  assert.ok(fiji.south < -10 && fiji.north < 0);
});

test('country extents fit padded desktop and mobile viewports with finite Mercator coordinates', () => {
  const mercatorY = (lat: number) => {
    const safeLatitude = Math.max(-85.0511287798066, Math.min(85.0511287798066, lat));
    return (1 - Math.asinh(Math.tan(safeLatitude * Math.PI / 180)) / Math.PI) / 2;
  };
  for (const name of ['IT', 'FR', 'RU', 'FJ', 'US', 'NZ', 'IS', 'DK']) {
    const bounds = getCountryBounds(find(name))!;
    for (const width of [290, 590]) {
      const fit = fitCountryBounds(bounds, width, 224);
      assert.ok(Number.isFinite(fit.latitude) && Number.isFinite(fit.longitude), name);
      assert.ok(fit.zoom >= 0 && fit.zoom <= 9);
      const worldSize = 256 * 2 ** fit.zoom;
      assert.ok(worldSize * bounds.longitudeSpan / 360 <= width - 56 + 0.001, `${name} horizontal bounds`);
      assert.ok(worldSize * Math.abs(mercatorY(bounds.north) - mercatorY(bounds.south)) <= 224 - 56 + 0.001, `${name} vertical bounds`);
    }
    assert.ok(fitCountryBounds(bounds, 290, 224).zoom <= fitCountryBounds(bounds, 590, 224).zoom);
  }
});

test('every feature with usable geometry yields a finite country view', () => {
  for (const feature of features) {
    const bounds = getCountryBounds(feature);
    if (!bounds) continue;
    const view = fitCountryBounds(bounds, 590, 224);
    assert.ok(Object.values(view).every(Number.isFinite), String(feature.properties.NAME));
  }
});
