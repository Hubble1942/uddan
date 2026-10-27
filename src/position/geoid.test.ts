import { meanSeaLevel } from 'egm96-universal';
import { describe, expect, it } from 'vitest';
import { sampleGeoidGrid } from '../../scripts/geoidGrid';
import { createGeoid, GEOID_STEP } from './geoid';

const geoid = createGeoid(sampleGeoidGrid(GEOID_STEP).buffer as ArrayBuffer);

describe('geoid', () => {
  it('puts mean sea level about 50 m above the ellipsoid in the Swiss Alps', () => {
    expect(geoid(46.6, 8.0)).toBeCloseTo(meanSeaLevel(46.6, 8.0), 0);
    expect(geoid(46.6, 8.0)).toBeGreaterThan(45);
  });

  it('stays within 3 m of the full EGM96 grid across the Alps', () => {
    let worst = 0;
    for (let lat = 43.5; lat <= 48.5; lat += 0.13) {
      for (let lon = 5; lon <= 17; lon += 0.17) {
        worst = Math.max(worst, Math.abs(geoid(lat, lon) - meanSeaLevel(lat, lon)));
      }
    }
    expect(worst).toBeLessThan(3);
  });

  it('wraps across the antimeridian and handles negative longitudes', () => {
    expect(geoid(-20, -179.5)).toBeCloseTo(meanSeaLevel(-20, 180.5), 0);
    expect(geoid(10, -70)).toBeCloseTo(geoid(10, 290), 6);
  });

  it('works at the poles', () => {
    expect(geoid(90, 0)).toBeCloseTo(meanSeaLevel(90, 0), 0);
    expect(geoid(-90, 123)).toBeCloseTo(meanSeaLevel(-90, 123), 0);
  });
});
