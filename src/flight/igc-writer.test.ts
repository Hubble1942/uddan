import { describe, expect, it } from 'vitest';
import type { Fix } from '../position/fix';
import { writeIgc } from './igc-writer';

function fix(time: string, lat: number, lon: number, altitude: number | null): Fix {
  return { time: Date.parse(time), lat, lon, altitude, groundSpeed: null, track: null };
}

const fixes: Fix[] = [
  fix('2025-07-01T09:05:07Z', 46.5, 7.9, 1234.4),
  fix('2025-07-01T09:05:08Z', -33.12345, -70.654321, -12.4),
  fix('2025-07-01T09:05:09Z', 46.5, 7.9, null),
];

describe('writeIgc', () => {
  const text = writeIgc({ pilot: 'Jane Doe', glider: 'Ozone Rush 6', appVersion: '0.1.0' }, fixes);
  const lines = text.split('\r\n');

  it('uses CRLF line endings and ends with CRLF', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
  });

  it('starts with an A record for an unapproved recorder', () => {
    expect(lines[0]).toBe('AXXXUddan');
  });

  it('writes the H records', () => {
    expect(lines).toContain('HFDTEDATE:010725,01');
    expect(lines).toContain('HFPLTPILOTINCHARGE:Jane Doe');
    expect(lines).toContain('HFGTYGLIDERTYPE:Ozone Rush 6');
    expect(lines).toContain('HFDTMGPSDATUM:WGS-1984');
    expect(lines).toContain('HFFTYFRTYPE:Uddan');
    expect(lines).toContain('HFRFWFIRMWAREVERSION:0.1.0');
    expect(lines).toContain('HFALGALTGPS:GEO');
  });

  it('writes one B record per Fix', () => {
    const b = lines.filter((l) => l.startsWith('B'));
    expect(b).toEqual([
      'B0905074630000N00754000EA0000001234',
      'B0905083307407S07039259WA00000-0012',
      'B0905094630000N00754000EV0000000000',
    ]);
  });

  it('writes empty pilot and glider when not given', () => {
    const t = writeIgc({ appVersion: '1' }, fixes).split('\r\n');
    expect(t).toContain('HFPLTPILOTINCHARGE:');
    expect(t).toContain('HFGTYGLIDERTYPE:');
  });

  it('keeps header text on one line', () => {
    const t = writeIgc({ pilot: 'A\r\nB', appVersion: '1' }, fixes).split('\r\n');
    expect(t).toContain('HFPLTPILOTINCHARGE:AB');
  });

  it('carries minute rounding into the degrees', () => {
    const b = writeIgc({ appVersion: '1' }, [fix('2025-07-01T00:00:00Z', 46.9999999, 7.9999999, 0)])
      .split('\r\n')
      .find((l) => l.startsWith('B'));
    expect(b).toBe('B0000004700000N00800000EA0000000000');
  });
});
