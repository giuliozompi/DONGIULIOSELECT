import type { PublicCheeseSummary } from '@shared/public-editorial';
import type { CountryBounds, CountryFeature, GeoPosition } from '../admin/editorial/cheeseCountryMap';

export const ATLAS_MARKER_SIZE = 28;
const FRAME_PADDING = 16;
const WORLD = { south: -90, north: 90, centerLongitude: 0, longitudeSpan: 360 };
const wrapLongitude = (delta: number) => ((delta + 540) % 360) - 180;

export function fitAtlasMap(width: number, height: number, country: CountryBounds | null) {
  const { south, north, centerLongitude, longitudeSpan } = country ?? WORLD;
  const latitude = (south + north) / 2;
  // Use the local longitude scale so the fit doesn't stretch the country.
  const longitudeScale = Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  const scale = Math.min(
    Math.max(1, width - FRAME_PADDING * 2) / Math.max(1e-6, longitudeSpan * longitudeScale),
    Math.max(1, height - FRAME_PADDING * 2) / Math.max(1e-6, north - south),
  );
  const project = (longitude: number, lat: number, wrap = country !== null) => ({
    x: width / 2 + (wrap ? wrapLongitude(longitude - centerLongitude) : longitude - centerLongitude) * longitudeScale * scale,
    y: height / 2 - (lat - latitude) * scale,
  });
  return { width, height, project, centerLongitude, focused: country !== null };
}

export function atlasCountryPath(feature: CountryFeature, view: ReturnType<typeof fitAtlasMap>) {
  const { geometry } = feature;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(polygon => {
    if (!polygon[0]?.length) return '';
    // Shift entire polygons, not individual vertices. This keeps outlines
    // continuous when centering a country near the antimeridian.
    const longitude = polygon[0][0][0];
    const offset = view.focused ? wrapLongitude(longitude - view.centerLongitude) - (longitude - view.centerLongitude) : 0;
    return polygon.map(ring => ringPath(ring, offset, view)).join(' ');
  }).join(' ');
}

function ringPath(ring: GeoPosition[], offset: number, view: ReturnType<typeof fitAtlasMap>) {
  if (!ring.length) return '';
  return ring.map(([longitude, latitude], index) => {
    const { x, y } = view.project(longitude + offset, latitude, false);
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

export function atlasMarkerGroups(items: PublicCheeseSummary[], view: ReturnType<typeof fitAtlasMap>) {
  const groups: { x: number; y: number; items: PublicCheeseSummary[] }[] = [];
  for (const item of items) {
    if (item.latitude == null || item.longitude == null ||
        !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
    const { x, y } = view.project(item.longitude, item.latitude);
    if (x < 0 || x > view.width || y < 0 || y > view.height) continue;
    const nearby = groups.find(group => Math.hypot(group.x - x, group.y - y) < ATLAS_MARKER_SIZE + 2);
    // Keep the anchor fixed so a chain of nearby locations doesn't swallow
    // points farther away or shift any individual marker.
    if (nearby) nearby.items.push(item);
    else groups.push({ x, y, items: [item] });
  }
  return groups;
}
