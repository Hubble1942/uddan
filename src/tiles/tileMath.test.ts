import { describe, expect, it } from 'vitest';
import { lonLatToTile, tilesAround } from './tileMath';

describe('lonLatToTile', () => {
  it('puts lon 0 / lat 0 in the middle of the world', () => {
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('finds the zoom 12 tile over Interlaken', () => {
    const t = lonLatToTile(7.86, 46.69, 12);
    expect(Math.floor(t.x)).toBe(2137);
    expect(Math.floor(t.y)).toBe(1445);
  });
});

describe('tilesAround', () => {
  const interlaken = { lat: 46.69, lon: 7.86 };

  it('covers a 15 km ring at zoom 14 with roughly 250 tiles', () => {
    const tiles = tilesAround(interlaken, 15_000, 14);
    expect(tiles.length).toBeGreaterThan(200);
    expect(tiles.length).toBeLessThan(330);
  });

  it('starts with the tile under the centre', () => {
    const centre = lonLatToTile(interlaken.lon, interlaken.lat, 13);
    expect(tilesAround(interlaken, 15_000, 13)[0]).toEqual({ z: 13, x: Math.floor(centre.x), y: Math.floor(centre.y) });
  });

  it('returns only the centre tile for a tiny radius', () => {
    expect(tilesAround(interlaken, 10, 12)).toHaveLength(1);
  });
});
