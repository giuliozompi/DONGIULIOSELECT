import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getCountryBounds, matchCountryFeature, type CountryFeature } from '../client/src/web/admin/editorial/cheeseCountryMap';
import { ATLAS_MARKER_SIZE, atlasMarkerGroups, fitAtlasMap } from '../client/src/web/editorial/atlasMap';

const features: CountryFeature[] = JSON.parse(readFileSync('client/public/editorial/world.geojson', 'utf8')).features;
const boundsFor = (country: string) => {
  const feature = matchCountryFeature(features, country);
  assert.ok(feature);
  const bounds = getCountryBounds(feature);
  assert.ok(bounds);
  return bounds;
};
const cheese = (id: string, latitude: number | null, longitude: number | null) => ({
  id, title: id, nameOriginal: '', description: '', region: '', country: 'Италия', latitude, longitude, photo: '', publishedAt: '',
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
