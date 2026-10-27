import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOpenAir } from './openair';
import type { Airspace, LonLat } from './types';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8');
}

const NM = 1852;

function distance([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(a));
}

function byName(airspaces: Airspace[], name: string): Airspace {
  const found = airspaces.find((a) => a.name === name);
  if (!found) throw new Error(`no airspace named ${name}`);
  return found;
}

function at<T>(items: T[], index: number): T {
  const item = items.at(index);
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

describe('parseOpenAir with the shapes fixture', () => {
  const { airspaces, warnings } = parseOpenAir(fixture('shapes.txt'));

  it('reads every airspace without warnings', () => {
    expect(warnings).toEqual([]);
    expect(airspaces.map((a) => a.name)).toEqual([
      'Testdorf CTR',
      'Musterberg Circle',
      'Quarter Clockwise',
      'Quarter Anticlockwise',
      'Quarter After Reset',
      'Short Way Between Points',
      'Long Way Between Points',
    ]);
  });

  it('gives each airspace a distinct id', () => {
    expect(new Set(airspaces.map((a) => a.id)).size).toBe(airspaces.length);
  });

  it('reads class and limits', () => {
    const ctr = byName(airspaces, 'Testdorf CTR');
    expect(ctr.airspaceClass).toBe('CTR');
    expect(ctr.floor).toEqual({ kind: 'gnd' });
    expect(ctr.ceiling.kind).toBe('msl');

    const circle = byName(airspaces, 'Musterberg Circle');
    expect(circle.airspaceClass).toBe('D');
    expect(circle.floor.kind).toBe('agl');
    expect(circle.ceiling).toEqual({ kind: 'fl', level: 95 });
  });

  it('reads DP points as a closed [lon, lat] ring', () => {
    const ctr = byName(airspaces, 'Testdorf CTR');
    expect(ctr.polygon).toHaveLength(5);
    const [lon, lat] = at(ctr.polygon, 0);
    expect(lon).toBeCloseTo(7 + 26 / 60 + 10 / 3600, 9);
    expect(lat).toBeCloseTo(46 + 57 / 60 + 30 / 3600, 9);
    expect(at(ctr.polygon, -1)).toEqual(at(ctr.polygon, 0));
  });

  it('turns DC into a closed circle with the radius in NM', () => {
    const circle = byName(airspaces, 'Musterberg Circle');
    const centre: LonLat = [7.5, 46.75];
    expect(circle.polygon.length).toBeGreaterThanOrEqual(72);
    expect(at(circle.polygon, -1)).toEqual(at(circle.polygon, 0));
    for (const point of circle.polygon) {
      expect(distance(centre, point)).toBeCloseTo(2 * NM, -1);
    }
  });

  it('turns DA into arc points at about 5 degree steps, clockwise by default', () => {
    const arc = byName(airspaces, 'Quarter Clockwise');
    const centre: LonLat = [7, 46 + 40 / 60];
    // centre, 19 arc points from north to east, closing point
    expect(arc.polygon).toHaveLength(21);
    const north = at(arc.polygon, 1);
    const east = at(arc.polygon, 19);
    expect(north[0]).toBeCloseTo(centre[0], 9);
    expect(north[1]).toBeGreaterThan(centre[1]);
    expect(east[1]).toBeCloseTo(centre[1], 3);
    expect(east[0]).toBeGreaterThan(centre[0]);
    const middle = at(arc.polygon, 10);
    expect(middle[0]).toBeGreaterThan(centre[0]);
    expect(middle[1]).toBeGreaterThan(centre[1]);
    for (const point of arc.polygon.slice(1, -1)) {
      expect(distance(centre, point)).toBeCloseTo(5 * NM, -1);
    }
  });

  it('follows V D=- anticlockwise', () => {
    const arc = byName(airspaces, 'Quarter Anticlockwise');
    const centre: LonLat = [8, 46 + 40 / 60];
    const middle = at(arc.polygon, 10);
    expect(middle[0]).toBeGreaterThan(centre[0]);
    expect(middle[1]).toBeGreaterThan(centre[1]);
    const first = at(arc.polygon, 1);
    expect(first[0]).toBeGreaterThan(centre[0]);
  });

  it('resets the arc direction to clockwise at each new AC', () => {
    const arc = byName(airspaces, 'Quarter After Reset');
    const centre: LonLat = [9, 46 + 40 / 60];
    expect(arc.polygon).toHaveLength(21);
    const middle = at(arc.polygon, 10);
    expect(middle[0]).toBeGreaterThan(centre[0]);
    expect(middle[1]).toBeGreaterThan(centre[1]);
  });

  it('turns DB into an arc that starts and ends on the given points', () => {
    const arc = byName(airspaces, 'Short Way Between Points');
    const centre: LonLat = [7.5, 46.5];
    const start: LonLat = [7.5, 46 + 35 / 60];
    const end: LonLat = [7 + 37 / 60 + 17 / 3600, 46.5];
    expect(at(arc.polygon, 1)[0]).toBeCloseTo(start[0], 9);
    expect(at(arc.polygon, 1)[1]).toBeCloseTo(start[1], 9);
    expect(at(arc.polygon, -2)[0]).toBeCloseTo(end[0], 9);
    expect(at(arc.polygon, -2)[1]).toBeCloseTo(end[1], 9);
    for (const point of arc.polygon.slice(1, -1)) {
      expect(distance(centre, point)).toBeCloseTo(5 * NM, -2);
      expect(point[0]).toBeGreaterThanOrEqual(centre[0] - 1e-9);
      expect(point[1]).toBeGreaterThanOrEqual(centre[1] - 1e-9);
    }
  });

  it('takes the long way round for DB with V D=-', () => {
    const arc = byName(airspaces, 'Long Way Between Points');
    const centre: LonLat = [8.5, 46.5];
    expect(arc.polygon.length).toBeGreaterThanOrEqual(55);
    expect(arc.polygon.some(([lon, lat]) => lon < centre[0] && lat < centre[1])).toBe(true);
  });
});

describe('parseOpenAir with the broken fixture', () => {
  const { airspaces, warnings } = parseOpenAir(fixture('broken.txt'));

  it('drops airspaces with fewer than 3 points and warns', () => {
    expect(airspaces.map((a) => a.name)).toEqual(['Odd Limits', 'No Limits At All']);
    expect(warnings.some((w) => w.includes('Two Points Only'))).toBe(true);
    expect(warnings.some((w) => w.includes('Circle Without Centre'))).toBe(true);
  });

  it('falls back to GND and UNL for unreadable limits and warns', () => {
    const odd = byName(airspaces, 'Odd Limits');
    expect(odd.floor).toEqual({ kind: 'gnd' });
    expect(odd.ceiling).toEqual({ kind: 'unlimited' });
    expect(warnings.some((w) => w.includes('somewhere low'))).toBe(true);
    expect(warnings.some((w) => w.includes('NOTAM'))).toBe(true);
  });

  it('falls back for missing limits and warns', () => {
    const none = byName(airspaces, 'No Limits At All');
    expect(none.floor).toEqual({ kind: 'gnd' });
    expect(none.ceiling).toEqual({ kind: 'unlimited' });
    expect(warnings.filter((w) => w.includes('No Limits At All'))).toHaveLength(2);
  });

  it('warns about unreadable coordinates and keeps the good points', () => {
    expect(warnings.some((w) => w.includes('not a coordinate'))).toBe(true);
    expect(byName(airspaces, 'Odd Limits').polygon).toHaveLength(4);
  });
});

describe('parseOpenAir text handling', () => {
  const lines = [
    'AC c  ',
    'AN Crlf Space  ',
    'AL GND',
    'AH 2000 m',
    'DP 46:00:00.5N 007:00:00.25E',
    'DP 46:10:00 N 7:00:00 E   ',
    '',
    '   ',
    'DP 46:10.5 N 007:10.25 E',
  ];

  it('tolerates a BOM, CRLF and trailing spaces', () => {
    const { airspaces, warnings } = parseOpenAir(`﻿${lines.join('\r\n')}\r\n`);
    expect(warnings).toEqual([]);
    expect(airspaces).toHaveLength(1);
    const airspace = at(airspaces, 0);
    expect(airspace.airspaceClass).toBe('C');
    expect(airspace.name).toBe('Crlf Space');
    expect(airspace.polygon).toHaveLength(4);
  });

  it('reads decimal seconds and decimal minutes', () => {
    const airspace = at(parseOpenAir(lines.join('\n')).airspaces, 0);
    const [lon0, lat0] = at(airspace.polygon, 0);
    expect(lat0).toBeCloseTo(46 + 0.5 / 3600, 9);
    expect(lon0).toBeCloseTo(7 + 0.25 / 3600, 9);
    const [lon2, lat2] = at(airspace.polygon, 2);
    expect(lat2).toBeCloseTo(46 + 10.5 / 60, 9);
    expect(lon2).toBeCloseTo(7 + 10.25 / 60, 9);
  });

  it('reads southern and western coordinates as negative', () => {
    const text = ['AC D', 'AN South West', 'DP 10:00:00 S 020:00:00 W', 'DP 10:00:00 S 021:00:00 W', 'DP 11:00:00 S 021:00:00 W'].join('\n');
    const airspace = at(parseOpenAir(text).airspaces, 0);
    expect(at(airspace.polygon, 0)).toEqual([-20, -10]);
  });

  it('does not repeat the first point when the source already closes the ring', () => {
    const text = ['AC D', 'AN Closed', 'AL GND', 'AH UNL', 'DP 46:00:00 N 7:00:00 E', 'DP 46:10:00 N 7:00:00 E', 'DP 46:10:00 N 7:10:00 E', 'DP 46:00:00 N 7:00:00 E'].join('\n');
    expect(at(parseOpenAir(text).airspaces, 0).polygon).toHaveLength(4);
  });

  it('prefixes ids when asked, so several files can be combined', () => {
    const text = ['AC D', 'AN A', 'AL GND', 'AH UNL', 'DP 46:00:00 N 7:00:00 E', 'DP 46:10:00 N 7:00:00 E', 'DP 46:10:00 N 7:10:00 E'].join('\n');
    expect(at(parseOpenAir(text, { idPrefix: 'dhv' }).airspaces, 0).id).toBe('dhv-0');
  });

  it('returns nothing for empty text', () => {
    expect(parseOpenAir('')).toEqual({ airspaces: [], warnings: [] });
  });
});
