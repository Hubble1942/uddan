import type { Fix } from '../position/fix';

export interface IgcHeader {
  pilot?: string;
  glider?: string;
  appVersion: string;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function headerText(value: string | undefined): string {
  return (value ?? '').replace(/[\x00-\x1f\x7f]/g, '');
}

function coordinate(value: number, degreeWidth: number, positive: string, negative: string): string {
  const thousandthsOfMinutes = Math.round(Math.abs(value) * 60_000);
  const degrees = Math.floor(thousandthsOfMinutes / 60_000);
  const minutes = thousandthsOfMinutes % 60_000;
  return pad(degrees, degreeWidth) + pad(minutes, 5) + (value < 0 ? negative : positive);
}

function gnssAltitude(altitude: number | null): string {
  const metres = Math.round(altitude ?? 0);
  return metres < 0 ? '-' + pad(-metres, 4) : pad(metres, 5);
}

function bRecord(fix: Fix): string {
  const t = new Date(fix.time);
  return (
    'B' +
    pad(t.getUTCHours(), 2) +
    pad(t.getUTCMinutes(), 2) +
    pad(t.getUTCSeconds(), 2) +
    coordinate(fix.lat, 2, 'N', 'S') +
    coordinate(fix.lon, 3, 'E', 'W') +
    (fix.altitude === null ? 'V' : 'A') +
    '00000' +
    gnssAltitude(fix.altitude)
  );
}

/** Writes an unsigned IGC file. Altitudes are written as GNSS altitude above the geoid. */
export function writeIgc(header: IgcHeader, fixes: Fix[]): string {
  const lines = ['AXXXUddan'];
  const first = fixes[0];
  if (first) {
    const d = new Date(first.time);
    lines.push(`HFDTEDATE:${pad(d.getUTCDate(), 2)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCFullYear() % 100, 2)},01`);
  }
  lines.push(
    `HFPLTPILOTINCHARGE:${headerText(header.pilot)}`,
    `HFGTYGLIDERTYPE:${headerText(header.glider)}`,
    'HFDTMGPSDATUM:WGS-1984',
    'HFFTYFRTYPE:Uddan',
    `HFRFWFIRMWAREVERSION:${headerText(header.appVersion)}`,
    'HFALGALTGPS:GEO',
  );
  for (const fix of fixes) lines.push(bRecord(fix));
  return lines.join('\r\n') + '\r\n';
}
