import { describe, expect, it } from 'vitest';
import { bearing, continueAngle, distance } from './geodesy';

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

describe('continueAngle', () => {
  it('turns the short way across north', () => {
    expect(continueAngle(350, 10)).toBe(370);
    expect(continueAngle(10, 350)).toBe(-10);
  });

  it('keeps counting from an unwrapped angle', () => {
    expect(continueAngle(730, 20)).toBe(740);
    expect(continueAngle(-370, 340)).toBe(-380);
  });

  it('turns clockwise for exactly half a turn', () => {
    expect(continueAngle(0, 180)).toBe(180);
  });
});
