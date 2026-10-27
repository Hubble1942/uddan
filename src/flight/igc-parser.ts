import type { Fix } from '../position/fix';

export type AltitudeReference = 'ellipsoid' | 'geoid' | 'unknown';

export interface ParsedIgc {
  fixes: Fix[];
  pilot: string | null;
  glider: string | null;
  /** What the GNSS altitudes are measured from. Converting them to Altitude is up to the caller. */
  altitudeReference: AltitudeReference;
}

const DAY = 86_400_000;
const B_RECORD = /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])([-\d]\d{4})([-\d]\d{4})/;
const DATE = /^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/;
const PILOT = /^H[FOP]PLT[^:]*:(.*)$/;
const GLIDER = /^H[FOP]GTY[^:]*:(.*)$/;
const ALTITUDE_REFERENCE = /^H[FOP]ALG[^:]*:(.*)$/;

function headerValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseIgc(text: string): ParsedIgc {
  const fixes: Fix[] = [];
  let pilot: string | null = null;
  let glider: string | null = null;
  let altitudeReference: AltitudeReference = 'unknown';
  let date = 0;
  let dayOffset = 0;
  let previousTimeOfDay = -1;

  for (const line of text.split(/\r?\n/)) {
    let m: RegExpExecArray | null;
    if ((m = B_RECORD.exec(line))) {
      const n = (i: number) => Number(m?.[i]);
      const timeOfDay = (n(1) * 3600 + n(2) * 60 + n(3)) * 1000;
      if (timeOfDay < previousTimeOfDay) dayOffset += DAY;
      previousTimeOfDay = timeOfDay;
      fixes.push({
        time: date + dayOffset + timeOfDay,
        lat: (n(4) + n(5) / 60_000) * (m[6] === 'S' ? -1 : 1),
        lon: (n(7) + n(8) / 60_000) * (m[9] === 'W' ? -1 : 1),
        altitude: altitude(m[10] === 'A', n(11), n(12)),
        groundSpeed: null,
        track: null,
      });
    } else if ((m = DATE.exec(line))) {
      const year = Number(m[3]);
      date = Date.UTC(year < 80 ? 2000 + year : 1900 + year, Number(m[2]) - 1, Number(m[1]));
    } else if ((m = PILOT.exec(line))) {
      pilot = headerValue(m[1] ?? '');
    } else if ((m = GLIDER.exec(line))) {
      glider = headerValue(m[1] ?? '');
    } else if ((m = ALTITUDE_REFERENCE.exec(line))) {
      const value = (m[1] ?? '').trim().toUpperCase();
      altitudeReference = value === 'ELL' ? 'ellipsoid' : value === 'GEO' ? 'geoid' : 'unknown';
    }
  }

  return { fixes, pilot, glider, altitudeReference };
}

function altitude(valid: boolean, pressure: number, gnss: number): number | null {
  if (gnss !== 0) return gnss;
  if (pressure !== 0) return pressure;
  return valid ? 0 : null;
}
