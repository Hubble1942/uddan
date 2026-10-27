import { distance } from '../position/geodesy';

export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** Fractional Web Mercator tile coordinates. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const φ = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n,
  };
}

export function tileToLonLat(x: number, y: number, z: number): { lon: number; lat: number } {
  const n = 2 ** z;
  return {
    lon: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

/** Tiles at zoom z that intersect a circle around centre, nearest first. */
export function tilesAround(centre: { lat: number; lon: number }, radius: number, z: number): TileId[] {
  const c = lonLatToTile(centre.lon, centre.lat, z);
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  const n = 2 ** z;
  const tileWidth = distance(tileToLonLat(cx, cy, z), tileToLonLat(cx + 1, cy, z));
  const reach = Math.ceil(radius / tileWidth) + 1;

  const found: { tile: TileId; d: number }[] = [];
  for (let y = Math.max(0, cy - reach); y <= Math.min(n - 1, cy + reach); y++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = (((cx + dx) % n) + n) % n;
      // Distance from the centre to the nearest point of the tile.
      const nearest = tileToLonLat(Math.min(Math.max(c.x, cx + dx), cx + dx + 1), Math.min(Math.max(c.y, y), y + 1), z);
      const d = distance(centre, nearest);
      if (d <= radius) found.push({ tile: { z, x, y }, d });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.tile);
}
