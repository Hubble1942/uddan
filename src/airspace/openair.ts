import { parseAltitudeLimit } from './altitude';
import type { Airspace, AltitudeLimit, LonLat } from './types';

const NAUTICAL_MILE = 1852;
const EARTH_RADIUS = 6_371_008.8;
const DEGREES_PER_ARC_POINT = 5;

const COORDINATE =
  /(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\s*([NS])\s*,?\s*(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\s*([EW])/gi;

interface Draft {
  index: number;
  airspaceClass: string;
  name: string;
  floorText: string | null;
  ceilingText: string | null;
  points: LonLat[];
  centre: LonLat | null;
  clockwise: boolean;
}

export interface ParseOpenAirOptions {
  /** Prefix for Airspace ids, so Airspaces from several files can be combined. Defaults to "openair". */
  idPrefix?: string;
}

export function parseOpenAir(
  text: string,
  options: ParseOpenAirOptions = {},
): { airspaces: Airspace[]; warnings: string[] } {
  const idPrefix = options.idPrefix ?? 'openair';
  const airspaces: Airspace[] = [];
  const warnings: string[] = [];
  let draft: Draft | null = null;
  let count = 0;

  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const [lineIndex, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('*')) continue;
    const [, key = '', rest = ''] = /^(\S+)\s*(.*)$/.exec(line) ?? [];
    const record = key.toUpperCase();

    if (record === 'AC') {
      if (draft) finish(draft);
      draft = {
        index: count++,
        airspaceClass: rest.toUpperCase(),
        name: '',
        floorText: null,
        ceilingText: null,
        points: [],
        centre: null,
        clockwise: true,
      };
      continue;
    }
    if (!draft) continue;

    const current: Draft = draft;
    const warn = (message: string) => warnings.push(`${label(current)}, line ${lineIndex + 1}: ${message}`);

    switch (record) {
      case 'AN':
        current.name = rest;
        break;
      case 'AL':
        current.floorText = rest;
        break;
      case 'AH':
        current.ceilingText = rest;
        break;
      case 'DP': {
        const point = parseCoordinates(rest)[0];
        if (point) current.points.push(point);
        else warn(`unreadable coordinate "${rest}"`);
        break;
      }
      case 'V': {
        const variable = /^([A-Z])\s*=\s*(.*)$/i.exec(rest);
        const name = variable?.[1]?.toUpperCase();
        const value = variable?.[2]?.trim() ?? '';
        if (name === 'X') {
          const centre = parseCoordinates(value)[0];
          if (centre) current.centre = centre;
          else warn(`unreadable centre "${value}"`);
        } else if (name === 'D') {
          if (value === '+' || value === '-') current.clockwise = value === '+';
          else warn(`unreadable arc direction "${value}"`);
        }
        break;
      }
      case 'DA': {
        const [radius, start, end, extra] = rest.split(',').map((part) => Number(part.trim()));
        if (!current.centre) warn('arc without centre (V X=)');
        else if (radius === undefined || start === undefined || end === undefined || extra !== undefined || [radius, start, end].some(Number.isNaN))
          warn(`unreadable arc "${rest}"`);
        else {
          const r = radius * NAUTICAL_MILE;
          current.points.push(...arc(current.centre, start, sweep(start, end, current.clockwise), r, r));
        }
        break;
      }
      case 'DB': {
        const [from, to] = parseCoordinates(rest);
        if (!current.centre) warn('arc without centre (V X=)');
        else if (!from || !to) warn(`unreadable arc "${rest}"`);
        else current.points.push(...arcBetween(current.centre, from, to, current.clockwise));
        break;
      }
      case 'DC': {
        const radius = Number(rest);
        if (!current.centre) warn('circle without centre (V X=)');
        else if (rest === '' || Number.isNaN(radius) || radius <= 0) warn(`unreadable circle radius "${rest}"`);
        else {
          const r = radius * NAUTICAL_MILE;
          current.points.push(...arc(current.centre, 0, 360, r, r).slice(0, -1));
        }
        break;
      }
    }
  }
  if (draft) finish(draft);

  return { airspaces, warnings };

  function finish(d: Draft): void {
    const points = [...d.points];
    const first = points[0];
    const last = points.at(-1);
    if (first && last && points.length > 1 && samePoint(first, last)) points.pop();
    if (points.length < 3 || !first) {
      warnings.push(`${label(d)}: dropped, it has only ${points.length} point(s)`);
      return;
    }
    airspaces.push({
      id: `${idPrefix}-${d.index}`,
      name: d.name,
      airspaceClass: d.airspaceClass,
      floor: limitOrFallback(d, d.floorText, 'floor (AL)', { kind: 'gnd' }),
      ceiling: limitOrFallback(d, d.ceilingText, 'ceiling (AH)', { kind: 'unlimited' }),
      polygon: [...points, first],
    });
  }

  function limitOrFallback(d: Draft, text: string | null, what: string, fallback: AltitudeLimit): AltitudeLimit {
    const fallbackLabel = fallback.kind === 'gnd' ? 'GND' : 'UNL';
    if (text === null) {
      warnings.push(`${label(d)}: no ${what}, using ${fallbackLabel}`);
      return fallback;
    }
    const limit = parseAltitudeLimit(text);
    if (limit) return limit;
    warnings.push(`${label(d)}: unreadable ${what} "${text}", using ${fallbackLabel}`);
    return fallback;
  }
}

function label(draft: Draft): string {
  return draft.name ? `Airspace "${draft.name}"` : `Airspace #${draft.index + 1}`;
}

function samePoint(a: LonLat, b: LonLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function parseCoordinates(text: string): LonLat[] {
  const result: LonLat[] = [];
  for (const m of text.matchAll(COORDINATE)) {
    const lat = sexagesimal(m[1], m[2], m[3]);
    const lon = sexagesimal(m[5], m[6], m[7]);
    if (lat === null || lon === null || lat > 90 || lon > 180) return [];
    const south = m[4]?.toUpperCase() === 'S';
    const west = m[8]?.toUpperCase() === 'W';
    result.push([west ? -lon : lon, south ? -lat : lat]);
  }
  return result;
}

function sexagesimal(degrees?: string, minutes?: string, seconds?: string): number | null {
  const d = Number(degrees);
  const m = Number(minutes);
  const s = seconds === undefined ? 0 : Number(seconds);
  if (m >= 60 || s >= 60) return null;
  return d + m / 60 + s / 3600;
}

/** Signed sweep from start to end bearing, positive clockwise, in (0, 360]. */
function sweep(start: number, end: number, clockwise: boolean): number {
  const raw = clockwise ? end - start : start - end;
  const positive = ((raw % 360) + 360) % 360 || 360;
  return clockwise ? positive : -positive;
}

/** Points along an arc, both ends included, with the radius going linearly from startRadius to endRadius. */
function arc(centre: LonLat, startBearing: number, sweepDegrees: number, startRadius: number, endRadius: number): LonLat[] {
  const steps = Math.max(1, Math.ceil(Math.abs(sweepDegrees) / DEGREES_PER_ARC_POINT));
  const points: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(destination(centre, startBearing + sweepDegrees * t, startRadius + (endRadius - startRadius) * t));
  }
  return points;
}

function arcBetween(centre: LonLat, from: LonLat, to: LonLat, clockwise: boolean): LonLat[] {
  const start = bearing(centre, from);
  const end = bearing(centre, to);
  const points = arc(centre, start, sweep(start, end, clockwise), distance(centre, from), distance(centre, to));
  points[0] = from;
  points[points.length - 1] = to;
  return points;
}

const RAD = Math.PI / 180;

function destination([lon, lat]: LonLat, bearingDegrees: number, metres: number): LonLat {
  const delta = metres / EARTH_RADIUS;
  const theta = bearingDegrees * RAD;
  const phi1 = lat * RAD;
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda =
    lon * RAD +
    Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return [lambda / RAD, phi2 / RAD];
}

function bearing([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const dLambda = (lon2 - lon1) * RAD;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return Math.atan2(y, x) / RAD;
}

function distance([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const a =
    Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}
