import { describe, expect, it } from 'vitest';
import { decodeText, formatAltitude, formatDuration, formatSpeed, igcFileName } from './format';

describe('display formatting', () => {
  it('shows Altitude in whole metres', () => {
    expect(formatAltitude(1234.6)).toBe('1235 m');
    expect(formatAltitude(null)).toBe('–');
  });

  it('shows ground speed in km/h', () => {
    expect(formatSpeed(10)).toBe('36 km/h');
    expect(formatSpeed(null)).toBe('–');
  });

  it('shows durations as hours and minutes', () => {
    expect(formatDuration(3 * 3600_000 + 7 * 60_000 + 59_000)).toBe('3:07');
  });
});

describe('igcFileName', () => {
  it('follows the IGC short date naming with the Flight number of the day', () => {
    expect(igcFileName(Date.UTC(2026, 6, 4, 11, 30), 2)).toBe('2026-07-04-XXX-UDDAN-02.igc');
  });
});

describe('decodeText', () => {
  it('reads UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('AN Zürich').buffer)).toBe('AN Zürich');
  });

  it('falls back to Windows-1252 for old OpenAIR files', () => {
    expect(decodeText(new Uint8Array([0x41, 0x4e, 0x20, 0x5a, 0xfc, 0x72, 0x69, 0x63, 0x68]).buffer)).toBe('AN Zürich');
  });
});
