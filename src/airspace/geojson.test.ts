import { describe, expect, it } from 'vitest';
import { airspacesToGeoJson } from './geojson';
import type { Airspace } from './types';

const ctr: Airspace = {
  id: 'openair-0',
  name: 'Testdorf CTR',
  airspaceClass: 'CTR',
  floor: { kind: 'gnd' },
  ceiling: { kind: 'fl', level: 95 },
  polygon: [
    [7.4, 46.9],
    [7.6, 46.9],
    [7.6, 47],
    [7.4, 46.9],
  ],
};

describe('airspacesToGeoJson', () => {
  it('makes one Polygon feature per Airspace with labelled limits', () => {
    expect(airspacesToGeoJson([ctr])).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ctr.polygon] },
          properties: {
            id: 'openair-0',
            name: 'Testdorf CTR',
            airspaceClass: 'CTR',
            floorLabel: 'GND',
            ceilingLabel: '≈2900 m (FL95)',
          },
        },
      ],
    });
  });

  it('makes an empty collection from no Airspaces', () => {
    expect(airspacesToGeoJson([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
