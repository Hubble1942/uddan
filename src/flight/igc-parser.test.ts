import { describe, expect, it } from 'vitest';
import type { Fix } from '../position/fix';
import { parseIgc } from './igc-parser';
import { writeIgc } from './igc-writer';
import midnight from './fixtures/midnight.igc?raw';

describe('parseIgc', () => {
  it('reads the fixture with CRLF line endings', () => {
    const result = parseIgc(midnight);
    expect(result.pilot).toBe('Test Pilot');
    expect(result.glider).toBe('Test Wing 2');
    expect(result.altitudeReference).toBe('ellipsoid');
    expect(result.fixes).toHaveLength(4);
    expect(result.fixes[0]).toEqual({
      time: Date.parse('2025-06-30T23:59:58Z'),
      lat: 46.5,
      lon: 7.9,
      altitude: 1250,
      groundSpeed: null,
      track: null,
    });
  });

  it('adds a day when the time of day goes backwards', () => {
    const times = parseIgc(midnight).fixes.map((f) => new Date(f.time).toISOString());
    expect(times).toEqual([
      '2025-06-30T23:59:58.000Z',
      '2025-06-30T23:59:59.000Z',
      '2025-07-01T00:00:00.000Z',
      '2025-07-01T00:00:01.000Z',
    ]);
  });

  it('handles southern and western coordinates', () => {
    const last = parseIgc(midnight).fixes[3];
    expect(last?.lat).toBeCloseTo(-46.503, 6);
    expect(last?.lon).toBeCloseTo(-7.903, 6);
  });

  it('uses the pressure altitude when the GNSS altitude is 0', () => {
    expect(parseIgc(midnight).fixes[3]?.altitude).toBe(1237);
  });

  it('accepts LF line endings and the HFDTEDATE form', () => {
    const text = ['HFDTEDATE:010725,01', 'HFALGALTGPS:GEO', 'B1200004630000N00754000EA0000001000'].join('\n');
    const result = parseIgc(text);
    expect(result.fixes[0]?.time).toBe(Date.parse('2025-07-01T12:00:00Z'));
    expect(result.altitudeReference).toBe('geoid');
    expect(result.pilot).toBeNull();
    expect(result.glider).toBeNull();
  });

  it('reports an unknown altitude reference when HFALG is missing or odd', () => {
    expect(parseIgc('HFDTE010725\n').altitudeReference).toBe('unknown');
    expect(parseIgc('HFDTE010725\nHFALGALTGPS:NKN\n').altitudeReference).toBe('unknown');
  });

  it('reads negative altitudes', () => {
    const result = parseIgc('HFDTE010725\nB1200004630000N00754000EA00000-0012\n');
    expect(result.fixes[0]?.altitude).toBe(-12);
  });

  it('round-trips what writeIgc writes', () => {
    const fixes: Fix[] = [
      { time: Date.parse('2025-07-01T09:05:07Z'), lat: 46.512, lon: 7.934, altitude: 2100, groundSpeed: 9, track: 90 },
      { time: Date.parse('2025-07-01T09:05:08Z'), lat: 46.513, lon: 7.935, altitude: null, groundSpeed: 9, track: 90 },
    ];
    const result = parseIgc(writeIgc({ pilot: 'P', glider: 'G', appVersion: '1' }, fixes));
    expect(result.pilot).toBe('P');
    expect(result.glider).toBe('G');
    expect(result.altitudeReference).toBe('geoid');
    expect(result.fixes.map((f) => f.time)).toEqual(fixes.map((f) => f.time));
    expect(result.fixes[0]?.lat).toBeCloseTo(46.512, 4);
    expect(result.fixes[0]?.lon).toBeCloseTo(7.934, 4);
    expect(result.fixes[0]?.altitude).toBe(2100);
    expect(result.fixes[1]?.altitude).toBeNull();
  });
});
