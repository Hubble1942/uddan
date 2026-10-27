import { lonLatToTile } from '../tiles/tileMath';

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA bytes, row by row. */
  data: Uint8ClampedArray;
}

/** Terrarium encoding as used by Mapterhorn: metres = R * 256 + G + B / 256 - 32768. */
export function terrariumToMetres(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Ground Elevation from Terrarium-encoded elevation tiles. Lookups are synchronous and
 * return null until the tile under the position has been loaded with ensure().
 */
export function createGroundElevation(deps: {
  zoom: number;
  loadTile: (z: number, x: number, y: number) => Promise<ArrayBuffer | null>;
  decode: (data: ArrayBuffer) => Promise<DecodedImage>;
  maxTiles?: number;
}) {
  const { zoom } = deps;
  const maxTiles = deps.maxTiles ?? 64;
  const tiles = new Map<string, DecodedImage>();
  const pending = new Map<string, Promise<void>>();

  const locate = (lat: number, lon: number) => {
    const t = lonLatToTile(lon, lat, zoom);
    const x = Math.floor(t.x);
    const y = Math.floor(t.y);
    return { key: `${x}/${y}`, x, y, fx: t.x - x, fy: t.y - y };
  };

  return {
    elevationAt(lat: number, lon: number): number | null {
      const { key, fx, fy } = locate(lat, lon);
      const image = tiles.get(key);
      if (!image) return null;
      const { width, height, data } = image;
      // Pixel centres sit at half-pixel offsets; clamp at the tile edge.
      const px = Math.min(width - 1, Math.max(0, fx * width - 0.5));
      const py = Math.min(height - 1, Math.max(0, fy * height - 0.5));
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const sample = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return terrariumToMetres(data[i]!, data[i + 1]!, data[i + 2]!);
      };
      const ax = px - x0;
      const ay = py - y0;
      const top = sample(x0, y0) * (1 - ax) + sample(x1, y0) * ax;
      const bottom = sample(x0, y1) * (1 - ax) + sample(x1, y1) * ax;
      return top * (1 - ay) + bottom * ay;
    },

    async ensure(lat: number, lon: number): Promise<void> {
      const { key, x, y } = locate(lat, lon);
      if (tiles.has(key)) return;
      let loading = pending.get(key);
      if (!loading) {
        loading = (async () => {
          try {
            const bytes = await deps.loadTile(zoom, x, y);
            if (!bytes) return;
            tiles.set(key, await deps.decode(bytes));
            if (tiles.size > maxTiles) tiles.delete(tiles.keys().next().value!);
          } catch {
            // Unknown for now; the next ensure() tries again.
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, loading);
      }
      await loading;
    },
  };
}

export type GroundElevation = ReturnType<typeof createGroundElevation>;
