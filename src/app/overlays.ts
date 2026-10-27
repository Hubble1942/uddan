import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { airspacesToGeoJson, overlapsVertically, type Airspace } from '../airspace';
import type { Fix } from '../position/fix';

const AIRSPACE = 'airspace';
const TRACK = 'track';
const PILOT = 'pilot';
const empty = { type: 'FeatureCollection' as const, features: [] };

const classColour: ExpressionSpecification = [
  'match',
  ['get', 'airspaceClass'],
  ['R', 'P', 'Q', 'GP', 'D-OTHER'],
  '#d22d2d',
  ['CTR', 'C', 'D', 'A', 'B'],
  '#1f5fbf',
  ['TMZ', 'RMZ'],
  '#6b6b6b',
  'W',
  '#e08a00',
  'E',
  '#2f8f46',
  '#7b3fb0',
];

/** Images drawn at runtime, so the app needs no sprite sheet. */
function drawImages(map: MapLibreMap) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.beginPath();
  ctx.moveTo(size / 2, 8);
  ctx.lineTo(size - 8, size - 10);
  ctx.lineTo(8, size - 10);
  ctx.closePath();
  ctx.fillStyle = '#5b4632';
  ctx.fill();
  map.addImage('peak', ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(size / 2, 3);
  ctx.lineTo(size - 8, size - 5);
  ctx.lineTo(size / 2, size - 15);
  ctx.lineTo(8, size - 5);
  ctx.closePath();
  ctx.fillStyle = '#f5b700';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  map.addImage('pilot', ctx.getImageData(0, 0, size, size), { pixelRatio: 1 });
}

export function addOverlays(map: MapLibreMap) {
  drawImages(map);
  map.addSource(AIRSPACE, { type: 'geojson', data: empty, promoteId: 'id' });
  map.addSource(TRACK, { type: 'geojson', data: empty });
  map.addSource(PILOT, { type: 'geojson', data: empty });

  const relevant: ExpressionSpecification = ['boolean', ['feature-state', 'relevant'], false];
  map.addLayer({
    id: 'airspace-fill',
    type: 'fill',
    source: AIRSPACE,
    paint: { 'fill-color': classColour, 'fill-opacity': ['case', relevant, 0.3, 0.04] },
  });
  map.addLayer({
    id: 'airspace-line',
    type: 'line',
    source: AIRSPACE,
    paint: { 'line-color': classColour, 'line-width': ['case', relevant, 3, 1.2], 'line-opacity': ['case', relevant, 1, 0.7] },
  });
  map.addLayer({
    id: 'airspace-label',
    type: 'symbol',
    source: AIRSPACE,
    minzoom: 9,
    layout: {
      'text-field': ['concat', ['get', 'name'], '\n', ['get', 'ceilingLabel'], '\n', ['get', 'floorLabel']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
    },
    paint: { 'text-color': classColour, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  });
  map.addLayer({
    id: 'track',
    type: 'line',
    source: TRACK,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#c2185b', 'line-width': 2.5 },
  });
  map.addLayer({
    id: 'pilot',
    type: 'symbol',
    source: PILOT,
    layout: {
      'icon-image': 'pilot',
      'icon-rotate': ['get', 'track'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

export function showAirspaces(map: MapLibreMap, airspaces: Airspace[]) {
  (map.getSource(AIRSPACE) as GeoJSONSource).setData(airspacesToGeoJson(airspaces) as Parameters<GeoJSONSource['setData']>[0]);
}

/** Highlights each Airspace whose floor-to-ceiling band overlaps the pilot's Altitude ± Vertical Margin. */
export function markRelevantAirspaces(
  map: MapLibreMap,
  airspaces: Airspace[],
  altitude: number | null,
  verticalMargin: number,
  groundElevation: number | null,
) {
  for (const airspace of airspaces) {
    map.setFeatureState(
      { source: AIRSPACE, id: airspace.id },
      { relevant: overlapsVertically(airspace, altitude, verticalMargin, groundElevation) },
    );
  }
}

export function showPilot(map: MapLibreMap, fix: Fix, track: number | null) {
  (map.getSource(PILOT) as GeoJSONSource).setData({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] },
    properties: { track: track ?? 0 },
  });
}

export function showTrackLog(map: MapLibreMap, fixes: readonly Fix[]) {
  (map.getSource(TRACK) as GeoJSONSource).setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: fixes.map((f) => [f.lon, f.lat]) },
    properties: {},
  });
}
