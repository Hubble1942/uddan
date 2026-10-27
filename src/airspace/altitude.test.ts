import { describe, expect, it } from 'vitest';
import { formatLimit, limitAltitude, overlapsVertically, parseAltitudeLimit } from './altitude';
import type { Airspace, AltitudeLimit } from './types';

const FT = 0.3048;

describe('parseAltitudeLimit', () => {
  it.each(['GND', 'SFC', '0', 'gnd', ' Sfc '])('reads %s as ground', (text) => {
    expect(parseAltitudeLimit(text)).toEqual({ kind: 'gnd' });
  });

  it.each(['UNL', 'UNLTD', 'UNLIMITED', 'unl'])('reads %s as unlimited', (text) => {
    expect(parseAltitudeLimit(text)).toEqual({ kind: 'unlimited' });
  });

  it.each(['FL95', 'FL 95', 'fl95', 'FL095'])('reads %s as flight level 95', (text) => {
    expect(parseAltitudeLimit(text)).toEqual({ kind: 'fl', level: 95 });
  });

  it.each(['2900ft', '2900 ft', '2900F', '2900FT MSL', '2900 ft AMSL', '2900 ALT', '2900', '2900 FT msl'])(
    'reads %s as 2900 ft above mean sea level',
    (text) => {
      const limit = parseAltitudeLimit(text);
      expect(limit?.kind).toBe('msl');
      expect(limit?.kind === 'msl' && limit.metres).toBeCloseTo(2900 * FT, 6);
    },
  );

  it.each(['1000ft AGL', '1000 ft GND', '1000ft SFC', '1000 FT agl', '1000 ASFC'])(
    'reads %s as 1000 ft above ground',
    (text) => {
      const limit = parseAltitudeLimit(text);
      expect(limit?.kind).toBe('agl');
      expect(limit?.kind === 'agl' && limit.metres).toBeCloseTo(1000 * FT, 6);
    },
  );

  it.each(['3000m', '3000 m MSL', '3000 M AMSL'])('reads %s as 3000 m above mean sea level', (text) => {
    expect(parseAltitudeLimit(text)).toEqual({ kind: 'msl', metres: 3000 });
  });

  it('reads metres above ground', () => {
    expect(parseAltitudeLimit('300M AGL')).toEqual({ kind: 'agl', metres: 300 });
  });

  it.each(['', 'NOTAM', 'FL', '12 parsecs', 'ft 2900'])('returns null for %j', (text) => {
    expect(parseAltitudeLimit(text)).toBeNull();
  });
});

describe('limitAltitude', () => {
  it('passes msl metres through', () => {
    expect(limitAltitude({ kind: 'msl', metres: 1234 }, null)).toBe(1234);
  });

  it('converts flight levels with the standard atmosphere', () => {
    expect(limitAltitude({ kind: 'fl', level: 95 }, 500)).toBeCloseTo(9500 * FT, 6);
  });

  it('puts ground at zero', () => {
    expect(limitAltitude({ kind: 'gnd' }, 800)).toBe(0);
  });

  it('adds ground elevation to agl limits', () => {
    expect(limitAltitude({ kind: 'agl', metres: 300 }, 800)).toBe(1100);
  });

  it('gives null for agl limits without ground elevation', () => {
    expect(limitAltitude({ kind: 'agl', metres: 300 }, null)).toBeNull();
  });

  it('gives infinity for unlimited', () => {
    expect(limitAltitude({ kind: 'unlimited' }, null)).toBe(Number.POSITIVE_INFINITY);
  });
});

function airspace(floor: AltitudeLimit, ceiling: AltitudeLimit): Airspace {
  return {
    id: 'test-0',
    name: 'Test',
    airspaceClass: 'D',
    floor,
    ceiling,
    polygon: [
      [7, 46],
      [7.1, 46],
      [7.1, 46.1],
      [7, 46],
    ],
  };
}

describe('overlapsVertically', () => {
  const box = airspace({ kind: 'msl', metres: 1000 }, { kind: 'msl', metres: 2000 });

  it('is true inside the band', () => {
    expect(overlapsVertically(box, 1500, 0, null)).toBe(true);
  });

  it('is false well below the floor', () => {
    expect(overlapsVertically(box, 800, 100, null)).toBe(false);
  });

  it('is true when the Vertical Margin reaches the floor', () => {
    expect(overlapsVertically(box, 900, 100, null)).toBe(true);
  });

  it('is true when the Vertical Margin reaches the ceiling', () => {
    expect(overlapsVertically(box, 2150, 200, null)).toBe(true);
  });

  it('is false well above the ceiling', () => {
    expect(overlapsVertically(box, 2300, 200, null)).toBe(false);
  });

  it('is true when the Altitude is unknown', () => {
    expect(overlapsVertically(box, null, 0, null)).toBe(true);
  });

  it('uses Ground Elevation for agl limits', () => {
    const agl = airspace({ kind: 'agl', metres: 300 }, { kind: 'fl', level: 95 });
    expect(overlapsVertically(agl, 1000, 50, 800)).toBe(false);
    expect(overlapsVertically(agl, 1100, 50, 800)).toBe(true);
  });

  it('is true for agl limits without Ground Elevation', () => {
    const agl = airspace({ kind: 'agl', metres: 300 }, { kind: 'msl', metres: 2000 });
    expect(overlapsVertically(agl, 500, 0, null)).toBe(true);
  });

  it('is true for an agl ceiling without Ground Elevation even far above', () => {
    const agl = airspace({ kind: 'gnd' }, { kind: 'agl', metres: 300 });
    expect(overlapsVertically(agl, 5000, 0, null)).toBe(true);
  });

  it('never tops out an unlimited ceiling', () => {
    const unl = airspace({ kind: 'fl', level: 195 }, { kind: 'unlimited' });
    expect(overlapsVertically(unl, 20_000, 0, null)).toBe(true);
    expect(overlapsVertically(unl, 3000, 100, null)).toBe(false);
  });
});

describe('formatLimit', () => {
  it('shows msl in metres rounded to 10 m', () => {
    expect(formatLimit({ kind: 'msl', metres: 2900 * FT })).toBe('880 m');
    expect(formatLimit({ kind: 'msl', metres: 2900 })).toBe('2900 m');
  });

  it('marks agl limits', () => {
    expect(formatLimit({ kind: 'agl', metres: 300 })).toBe('300 m AGL');
    expect(formatLimit({ kind: 'agl', metres: 1000 * FT })).toBe('300 m AGL');
  });

  it('shows ground and unlimited as words', () => {
    expect(formatLimit({ kind: 'gnd' })).toBe('GND');
    expect(formatLimit({ kind: 'unlimited' })).toBe('UNL');
  });

  it('shows flight levels as approximate metres with the level', () => {
    expect(formatLimit({ kind: 'fl', level: 95 })).toBe('≈2900 m (FL95)');
    expect(formatLimit({ kind: 'fl', level: 125 })).toBe('≈3810 m (FL125)');
  });
});
