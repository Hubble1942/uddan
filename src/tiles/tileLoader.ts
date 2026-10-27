import type { TileId } from './tileMath';
import type { TileStore } from './tileStore';

/** Tiles younger than this are used without asking the server again. */
export const TILE_MAX_AGE = 7 * 24 * 3600 * 1000;

export interface TileSource {
  id: string;
  resolveUrl(tile: TileId): Promise<string>;
}

export interface TileLoader {
  /** The tile's bytes, or null if the server has no such tile. Throws if neither network nor store can help. */
  load(source: TileSource, tile: TileId): Promise<ArrayBuffer | null>;
  isFresh(source: TileSource, tile: TileId): Promise<boolean>;
}

export function createTileLoader(deps: { store: TileStore; fetch: typeof fetch; now?: () => number }): TileLoader {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const isFreshTile = (fetchedAt: number) => now() - fetchedAt < TILE_MAX_AGE;

  return {
    async load(source, tile) {
      const stored = await store.get(source.id, tile);
      if (stored && isFreshTile(stored.fetchedAt)) return stored.data;
      try {
        const response = await deps.fetch(await source.resolveUrl(tile));
        if (response.status === 404 || response.status === 204) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        await store.put(source.id, tile, { data, fetchedAt: now() });
        return data;
      } catch (error) {
        if (stored) return stored.data;
        throw error;
      }
    },
    async isFresh(source, tile) {
      const stored = await store.get(source.id, tile);
      return stored !== undefined && isFreshTile(stored.fetchedAt);
    },
  };
}
