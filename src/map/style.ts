import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { PROTOCOL } from './protocol';

const name: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']];

/**
 * The Terrain Map: hillshade, water, major roads, towns and peaks with heights, nothing else.
 * Fonts are bundled with the app so labels work without network.
 */
export function terrainMapStyle(appBaseUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${new URL('fonts/', appBaseUrl).href}{fontstack}/{range}.pbf`,
    sources: {
      terrain: {
        type: 'raster-dem',
        tiles: [`${PROTOCOL}://mapterhorn/{z}/{x}/{y}`],
        tileSize: 512,
        maxzoom: 12,
        encoding: 'terrarium',
        attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
      },
      vector: {
        type: 'vector',
        tiles: [`${PROTOCOL}://openfreemap/{z}/{x}/{y}`],
        maxzoom: 14,
        attribution:
          '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f2efe6' } },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#3d3a33', 'hillshade-highlight-color': '#ffffff' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'vector',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': '#9cc3e4' },
      },
      {
        id: 'river',
        type: 'line',
        source: 'vector',
        'source-layer': 'waterway',
        filter: ['==', ['get', 'class'], 'river'],
        paint: { 'line-color': '#7aaed8', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 3] },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'vector',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#c98c4b', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 3] },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'vector',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b5462f', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 4] },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'vector',
        'source-layer': 'water_name',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
        paint: { 'text-color': '#2f6496', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      },
      {
        id: 'peak',
        type: 'symbol',
        source: 'vector',
        'source-layer': 'mountain_peak',
        filter: ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]],
        layout: {
          'icon-image': 'peak',
          'icon-size': 0.6,
          'text-field': ['format', name, {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.85 }],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': '#4a3b2a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      },
      {
        id: 'place',
        type: 'symbol',
        source: 'vector',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
        layout: {
          'text-field': name,
          'text-font': ['match', ['get', 'class'], 'village', ['literal', ['Noto Sans Regular']], ['literal', ['Noto Sans Bold']]],
          'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 14, 12],
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': '#222222', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
    ],
  };
}
