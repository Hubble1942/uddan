import { describe, expect, it } from 'vitest';
import { toFix } from './geolocationSource';

const coords = (overrides: Partial<GeolocationCoordinates>) =>
  ({ latitude: 46.69, longitude: 7.86, altitude: 1550, accuracy: 5, altitudeAccuracy: 10, heading: 90, speed: 8, ...overrides }) as GeolocationCoordinates;

describe('toFix', () => {
  it('converts ellipsoid altitude to mean sea level', () => {
    expect(toFix(coords({}), 1000, () => 50).altitude).toBe(1500);
  });

  it('keeps missing values as null', () => {
    const fix = toFix(coords({ altitude: null, heading: Number.NaN, speed: null }), 1000, () => 50);
    expect(fix).toMatchObject({ altitude: null, track: null, groundSpeed: null });
  });
});
