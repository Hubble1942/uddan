import { describe, expect, it, vi } from 'vitest';
import { createTileLoader, TILE_MAX_AGE, type TileSource } from './tileLoader';
import { memoryTileStore } from './tileStore';

const DAY = 24 * 3600 * 1000;
const tile = { z: 12, x: 2137, y: 1445 };
const source: TileSource = { id: 'test', resolveUrl: async ({ z, x, y }) => `https://example.org/v2/${z}/${x}/${y}.pbf` };
const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const ok = (data: ArrayBuffer) => new Response(data, { status: 200 });

function setup(fetchImpl: typeof fetch, now = 100 * DAY) {
  const store = memoryTileStore();
  const fetchSpy = vi.fn(fetchImpl);
  const loader = createTileLoader({ store, fetch: fetchSpy, now: () => now });
  return { store, fetchSpy, loader };
}

describe('tile loader', () => {
  it('fetches a missing tile and stores it', async () => {
    const { store, fetchSpy, loader } = setup(async () => ok(bytes(1, 2, 3)));
    expect(new Uint8Array((await loader.load(source, tile))!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchSpy).toHaveBeenCalledWith('https://example.org/v2/12/2137/1445.pbf');
    expect((await store.get('test', tile))?.fetchedAt).toBe(100 * DAY);
  });

  it('serves a fresh tile from the store without fetching', async () => {
    const { store, fetchSpy, loader } = setup(async () => ok(bytes(9)));
    await store.put('test', tile, { data: bytes(1), fetchedAt: 100 * DAY - TILE_MAX_AGE + 1 });
    expect(new Uint8Array((await loader.load(source, tile))!)).toEqual(new Uint8Array([1]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes a stale tile when the network answers', async () => {
    const { store, loader } = setup(async () => ok(bytes(2)));
    await store.put('test', tile, { data: bytes(1), fetchedAt: 0 });
    expect(new Uint8Array((await loader.load(source, tile))!)).toEqual(new Uint8Array([2]));
  });

  it('falls back to a stale tile when offline', async () => {
    const { store, loader } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await store.put('test', tile, { data: bytes(1), fetchedAt: 0 });
    expect(new Uint8Array((await loader.load(source, tile))!)).toEqual(new Uint8Array([1]));
  });

  it('throws when offline and nothing is stored', async () => {
    const { loader } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(loader.load(source, tile)).rejects.toThrow();
  });

  it('returns null for a tile the server does not have', async () => {
    const { loader } = setup(async () => new Response(null, { status: 404 }));
    expect(await loader.load(source, tile)).toBeNull();
  });

  it('reports freshness', async () => {
    const { store, loader } = setup(async () => ok(bytes(1)));
    expect(await loader.isFresh(source, tile)).toBe(false);
    await store.put('test', tile, { data: bytes(1), fetchedAt: 100 * DAY });
    expect(await loader.isFresh(source, tile)).toBe(true);
  });
});
