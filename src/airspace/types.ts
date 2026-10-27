/** A floor or ceiling as written in the source data. All heights are in metres. */
export type AltitudeLimit =
  | { kind: 'msl'; metres: number }
  | { kind: 'agl'; metres: number }
  | { kind: 'gnd' }
  | { kind: 'fl'; level: number }
  | { kind: 'unlimited' };

/** [longitude, latitude] in degrees, the GeoJSON order. */
export type LonLat = [number, number];

export interface Airspace {
  id: string;
  name: string;
  /** Raw class from the source, trimmed and upper-cased: C, D, CTR, R, Q, P, GP, W, E, TMZ, RMZ, … */
  airspaceClass: string;
  floor: AltitudeLimit;
  ceiling: AltitudeLimit;
  /** Closed ring: the first point equals the last. */
  polygon: LonLat[];
}
