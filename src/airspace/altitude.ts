import type { Airspace, AltitudeLimit } from './types';

const FOOT = 0.3048;

const NUMBER_PATTERN = /^(\d+(?:\.\d+)?)\s*(FT|F|M)?\s*(MSL|AMSL|ALT|AGL|GND|SFC|ASFC)?$/;

/** Reads an OpenAIR AL/AH value. A number without a unit is in feet. */
export function parseAltitudeLimit(text: string): AltitudeLimit | null {
  const value = text.trim().toUpperCase();
  if (value === 'GND' || value === 'SFC' || value === '0') return { kind: 'gnd' };
  if (value === 'UNL' || value === 'UNLTD' || value === 'UNLIMITED') return { kind: 'unlimited' };

  const fl = /^FL\s*(\d+)$/.exec(value);
  if (fl) return { kind: 'fl', level: Number(fl[1]) };

  const match = NUMBER_PATTERN.exec(value);
  if (!match) return null;
  const metres = Number(match[1]) * (match[2] === 'M' ? 1 : FOOT);
  const reference = match[3];
  const aboveGround = reference === 'AGL' || reference === 'GND' || reference === 'SFC' || reference === 'ASFC';
  return { kind: aboveGround ? 'agl' : 'msl', metres };
}

/** The limit as an Altitude in metres, or null if it depends on an unknown Ground Elevation. */
export function limitAltitude(limit: AltitudeLimit, groundElevation: number | null): number | null {
  switch (limit.kind) {
    case 'msl':
      return limit.metres;
    case 'fl':
      return limit.level * 100 * FOOT;
    case 'gnd':
      return 0;
    case 'agl':
      return groundElevation === null ? null : groundElevation + limit.metres;
    case 'unlimited':
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * Whether the pilot's Altitude, widened by the Vertical Margin, reaches into the Airspace.
 * Unknown values count as overlapping.
 */
export function overlapsVertically(
  airspace: Airspace,
  altitude: number | null,
  verticalMargin: number,
  groundElevation: number | null,
): boolean {
  const floor = limitAltitude(airspace.floor, groundElevation);
  const ceiling = limitAltitude(airspace.ceiling, groundElevation);
  if (altitude === null || floor === null || ceiling === null) return true;
  return altitude - verticalMargin <= ceiling && altitude + verticalMargin >= floor;
}

function roundedMetres(metres: number): number {
  return Math.round(metres / 10) * 10;
}

export function formatLimit(limit: AltitudeLimit): string {
  switch (limit.kind) {
    case 'msl':
      return `${roundedMetres(limit.metres)} m`;
    case 'agl':
      return `${roundedMetres(limit.metres)} m AGL`;
    case 'gnd':
      return 'GND';
    case 'unlimited':
      return 'UNL';
    case 'fl':
      return `≈${roundedMetres(limit.level * 100 * FOOT)} m (FL${limit.level})`;
  }
}
