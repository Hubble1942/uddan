import { describe, expect, it } from 'vitest';
import { bearing, distance } from './geodesy';

describe('distance', () => {
  it('measures one degree of latitude as about 111 km', () => {
    expect(distance({ lat: 46, lon: 8 }, { lat: 47, lon: 8 })).toBeCloseTo(111_195, -1);
  });

  it('is zero for the same point', () => {
    expect(distance({ lat: 46.5, lon: 7.9 }, { lat: 46.5, lon: 7.9 })).toBe(0);
  });
});

describe('bearing', () => {
  it('points east along the equator', () => {
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90);
  });

  it('points north-west', () => {
    expect(bearing({ lat: 46, lon: 8 }, { lat: 46.01, lon: 7.99 })).toBeCloseTo(325.2, 0);
  });
});
