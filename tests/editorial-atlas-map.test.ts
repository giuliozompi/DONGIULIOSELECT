import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getCountryBounds, matchCountryFeature, type CountryFeature } from '../client/src/web/admin/editorial/cheeseCountryMap';
import { ATLAS_MARKER_SIZE, atlasCountryPath, atlasMarkerGroups, fitAtlasMap } from '../client/src/web/editorial/atlasMap';
import { createTodayCountryResolver, pointInGeoFeature } from '../shared/editorial-geography';
import { atlasRegionCountries, atlasRegionCountry, type AtlasRegion } from '../client/src/web/editorial/atlasRegions';

const features: CountryFeature[] = JSON.parse(readFileSync('client/public/editorial/world.geojson', 'utf8')).features;
const boundsFor = (country: string) => {
  const feature = matchCountryFeature(features, country);
  assert.ok(feature);
  const bounds = getCountryBounds(feature, true);
  assert.ok(bounds);
  return bounds;
};
const cheese = (id: string, latitude: number | null, longitude: number | null) => ({
  id, title: id, nameOriginal: '', description: '', region: '', country: 'Италия', latitude, longitude, photo: '', publishedAt: '',
});

test('regional point matching respects polygon holes, borders, islands and invalid coordinates', () => {
  const feature: CountryFeature = { type: 'Feature', properties: {}, geometry: {
    type: 'MultiPolygon', coordinates: [
      [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]],
      [[[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]]],
    ],
  } };
  assert.ok(pointInGeoFeature(feature, { latitude: 1, longitude: 1 }));
  assert.ok(pointInGeoFeature(feature, { latitude: 0, longitude: 0 }));
  assert.ok(pointInGeoFeature(feature, { latitude: 21, longitude: 21 }));
  assert.equal(pointInGeoFeature(feature, { latitude: 5, longitude: 5 }), false);
  assert.equal(pointInGeoFeature(feature, { latitude: 15, longitude: 15 }), false);
  assert.equal(pointInGeoFeature(feature, { latitude: NaN, longitude: 1 }), false);
  assert.equal(pointInGeoFeature(feature, { latitude: 100, longitude: 1 }), false);
  const italy: { features: AtlasRegion[] } = JSON.parse(readFileSync('client/public/editorial/regions-v1/IT.geojson', 'utf8'));
  const piedmont = italy.features.find(feature => feature.properties.id === 'IT-21')!;
  assert.ok(pointInGeoFeature(piedmont, { latitude: 44.4, longitude: 7.42 }));
  assert.equal(pointInGeoFeature(piedmont, { latitude: 37.6, longitude: 14.1 }), false);
});

test('the selected country uses the largest uniform scale inside the centered padded frame', () => {
  for (const name of ['IT', 'Франция', 'Россия', 'Фиджи']) {
    const bounds = boundsFor(name);
    for (const [width, height] of [[710, 452], [320, 320], [270, 490]]) {
      const map = fitAtlasMap(width, height, bounds);
      const topLeft = map.project(bounds.west, bounds.north);
      const bottomRight = map.project(bounds.east, bounds.south);
      assert.ok(Math.abs((topLeft.x + bottomRight.x) / 2 - width / 2) < 0.001, name);
      assert.ok(Math.abs((topLeft.y + bottomRight.y) / 2 - height / 2) < 0.001, name);
      assert.ok(topLeft.x >= 15.999 && topLeft.y >= 15.999, name);
      assert.ok(bottomRight.x <= width - 15.999 && bottomRight.y <= height - 15.999, name);
      assert.ok(Math.abs(topLeft.x - 16) < 0.001 || Math.abs(topLeft.y - 16) < 0.001, name);
    }
  }
});

test('France focuses on European territory including Corsica, not overseas territories', () => {
  const bounds = boundsFor('FR');
  assert.ok(bounds.south >= 41 && bounds.north <= 52);
  assert.ok(bounds.west >= -6 && bounds.east <= 10);
  for (const [width, height] of [[710, 452], [320, 320]]) {
    const map = fitAtlasMap(width, height, bounds);
    for (const [longitude, latitude] of [[2.35, 48.86], [8.74, 41.92]]) {
      const { x, y } = map.project(longitude, latitude);
      assert.ok(x >= 16 && x <= width - 16 && y >= 16 && y <= height - 16);
    }
    for (const [longitude, latitude] of [[-52.33, 4.94], [55.45, -20.88], [45.23, -12.78]]) {
      const { x, y } = map.project(longitude, latitude);
      assert.ok(x < 0 || x > width || y < 0 || y > height);
    }
  }
});

test('the rendered Russian outline fits completely, including both sides of the antimeridian', () => {
  const feature = matchCountryFeature(features, 'Россия')!;
  const bounds = boundsFor('RU');
  assert.ok(bounds.east < -160 && bounds.east > -175);
  for (const [width, height] of [[710, 452], [320, 320]]) {
    const frame = fitAtlasMap(width, height, bounds);
    const pairs = [...atlasCountryPath(feature, frame).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
    assert.ok(pairs.length > 500);
    for (const [, x, y] of pairs) {
      assert.ok(Number(x) >= 15.99 && Number(x) <= width - 15.99, `Longitude clipped: ${x}`);
      assert.ok(Number(y) >= 15.99 && Number(y) <= height - 15.99, `Latitude clipped: ${y}`);
    }
  }
});

test('offline region outlines are unique and fit the available map frame in every supported country', () => {
  const expected: Record<string, number> = { IT: 20, FR: 13, ES: 19, NL: 12, CH: 26, DE: 16, AT: 9, GR: 14, PT: 20, GB: 4 };
  for (const [code, name] of Object.entries(atlasRegionCountries)) {
    const feature = matchCountryFeature(features, name);
    assert.ok(feature, name);
    assert.equal(atlasRegionCountry(feature, name), code);
    const regions: AtlasRegion[] = JSON.parse(readFileSync(`client/public/editorial/regions-v1/${code}.geojson`, 'utf8')).features;
    assert.equal(regions.length, expected[code], name);
    assert.equal(new Set(regions.map(region => region.properties.id)).size, regions.length);
    for (const region of regions) {
      const bounds = getCountryBounds(region, true);
      assert.ok(bounds && bounds.longitudeSpan > 0 && bounds.north > bounds.south, region.properties.name);
      const fitted = fitAtlasMap(340, 320, bounds);
      const path = atlasCountryPath(region, fitted);
      const pairs = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
      assert.ok(pairs.length >= 4);
      for (const [, x, y] of pairs) {
        assert.ok(Number(x) >= 15.99 && Number(x) <= 324.01, `${region.properties.name}: x=${x}`);
        assert.ok(Number(y) >= 15.99 && Number(y) <= 304.01, `${region.properties.name}: y=${y}`);
      }
    }
  }
  assert.equal(atlasRegionCountry(matchCountryFeature(features, 'Голландия'), 'Голландия'), 'NL');
  assert.equal(atlasRegionCountry(matchCountryFeature(features, 'Япония'), 'Япония'), undefined);
});

test('renamed countries use a current name; dissolved states use their saved location without guessing', () => {
  const classify = createTodayCountryResolver(features);
  const at = (latitude: number, longitude: number) => ({ latitude, longitude });
  assert.equal(classify('СССР', at(59.22, 39.89)), 'Россия');
  assert.equal(classify('Unione Sovietica', at(41.71, 44.79)), 'Грузия');
  assert.equal(classify('USSR', at(43.24, 76.89)), 'Казахстан');
  assert.equal(classify('Чехословакия', at(50.08, 14.43)), 'Чехия');
  assert.equal(classify('Cecoslovacchia', at(48.15, 17.11)), 'Словакия');
  assert.equal(classify('Югославия', at(44.81, 20.47)), 'Сербия');
  assert.equal(classify('Цейлон'), 'Шри-Ланка');
  assert.equal(classify('Zaire'), 'Демократическая Республика Конго');
  assert.equal(classify('Italia'), 'Италия');
  assert.equal(classify('СССР'), 'СССР');
  assert.equal(classify('СССР', at(0, -90)), 'СССР');
  assert.equal(classify('Шри-Ланка', at(0, -90)), 'Шри-Ланка');
});

test('different Italian localities stay separate while genuinely overlapping points remain available in a group', () => {
  const points = [cheese('Castelmagno', 44.4, 7.21), cheese('Same origin', 44.4, 7.21),
    cheese('Gorgonzola', 45.53, 9.4), cheese('Sicilia', 37.56, 14.27), cheese('Sardegna', 40.5, 8.3),
    cheese('Outside frame', 35.67, 139.65), cheese('Missing', null, null)];
  for (const [width, height] of [[700, 450], [300, 320]]) {
    const map = fitAtlasMap(width, height, boundsFor('IT'));
    const groups = atlasMarkerGroups(points, map);
    assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [
      ['Castelmagno', 'Same origin'], ['Gorgonzola'], ['Sicilia'], ['Sardegna'],
    ]);
    for (const [index, group] of groups.entries()) {
      const { latitude, longitude } = group.items[0];
      assert.deepEqual({ x: group.x, y: group.y }, map.project(longitude!, latitude!));
      assert.ok(groups.slice(0, index).every(prior => Math.hypot(prior.x - group.x, prior.y - group.y) >= ATLAS_MARKER_SIZE));
    }
  }
});
