import type { TileId } from './tileMath';

export interface StoredTile {
  data: ArrayBuffer;
  /** When the tile was fetched, ms since epoch. */
  fetchedAt: number;
}

/** Tiles keyed by tile set and z/x/y, independent of the data version in the source URL. */
export interface TileStore {
  get(set: string, tile: TileId): Promise<StoredTile | undefined>;
  put(set: string, tile: TileId, stored: StoredTile): Promise<void>;
}

const FETCHED_AT = 'x-uddan-fetched-at';
const keyOf = (set: string, { z, x, y }: TileId) => `https://tiles.uddan.invalid/${set}/${z}/${x}/${y}`;

export function cacheTileStore(cache: Cache): TileStore {
  return {
    async get(set, tile) {
      const response = await cache.match(keyOf(set, tile));
      if (!response) return undefined;
      return { data: await response.arrayBuffer(), fetchedAt: Number(response.headers.get(FETCHED_AT) ?? 0) };
    },
    async put(set, tile, { data, fetchedAt }) {
      await cache.put(keyOf(set, tile), new Response(data, { headers: { [FETCHED_AT]: String(fetchedAt) } }));
    },
  };
}

export function memoryTileStore(): TileStore {
  const tiles = new Map<string, StoredTile>();
  return {
    async get(set, tile) {
      return tiles.get(keyOf(set, tile));
    },
    async put(set, tile, stored) {
      tiles.set(keyOf(set, tile), stored);
    },
  };
}
