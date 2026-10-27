import { formatLimit } from './altitude';
import type { Airspace, LonLat } from './types';

export interface AirspaceFeatureProperties {
  id: string;
  name: string;
  airspaceClass: string;
  floorLabel: string;
  ceilingLabel: string;
}

export interface AirspaceFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: LonLat[][] };
  properties: AirspaceFeatureProperties;
}

export interface AirspaceFeatureCollection {
  type: 'FeatureCollection';
  features: AirspaceFeature[];
}

export function airspacesToGeoJson(airspaces: Airspace[]): AirspaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: airspaces.map((airspace) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [airspace.polygon] },
      properties: {
        id: airspace.id,
        name: airspace.name,
        airspaceClass: airspace.airspaceClass,
        floorLabel: formatLimit(airspace.floor),
        ceilingLabel: formatLimit(airspace.ceiling),
      },
    })),
  };
}
