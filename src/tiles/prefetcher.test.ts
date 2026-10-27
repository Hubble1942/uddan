import { describe, expect, it } from 'vitest';
import { createPrefetcher } from './prefetcher';
import { createTileLoader, type TileSource } from './tileLoader';
import { memoryTileStore } from './tileStore';

const source = (id: string): TileSource => ({ id, resolveUrl: async ({ z, x, y }) => `https://${id}.example/${z}/${x}/${y}` });
const terrain = source('terrain');
const vector = source('vector');
const interlaken = { lat: 46.69, lon: 7.86 };

function setup(fetchImpl: typeof fetch = async () => new Response(new Uint8Array([1]))) {
  const requested: string[] = [];
  const store = memoryTileStore();
  const loader = createTileLoader({
    store,
    fetch: async (url, init) => {
      requested.push(String(url));
      return fetchImpl(url, init);
    },
  });
  const prefetcher = createPrefetcher({
    loader,
    targets: [
      { source: terrain, zooms: [12] },
      { source: vector, zooms: [12, 13] },
    ],
    radius: 5_000,
  });
  return { prefetcher, requested, loader };
}

describe('prefetcher', () => {
  it('is idle before it knows a position', async () => {
    const { prefetcher } = setup();
    expect(await prefetcher.next()).toBe('idle');
  });

  it('fetches one tile per call, lower zooms first, and goes idle when the ring is done', async () => {
    const { prefetcher, requested } = setup();
    prefetcher.update(interlaken);
    let result;
    while ((result = await prefetcher.next()) === 'fetched');
    expect(result).toBe('idle');
    expect(requested[0]).toMatch(/^https:\/\/terrain\.example\/12\//);
    expect(requested.findIndex((u) => u.includes('/13/'))).toBeGreaterThan(requested.findLastIndex((u) => u.includes('/12/')));
    expect(new Set(requested).size).toBe(requested.length);
  });

  it('skips tiles that are already fresh', async () => {
    const { prefetcher, requested, loader } = setup();
    await loader.load(terrain, { z: 12, x: 2137, y: 1445 });
    requested.length = 0;
    prefetcher.update(interlaken);
    while ((await prefetcher.next()) === 'fetched');
    expect(requested).not.toContain('https://terrain.example/12/2137/1445');
  });

  it('keeps a tile queued when the network fails', async () => {
    let online = false;
    const { prefetcher, requested } = setup(async () => {
      if (!online) throw new TypeError('offline');
      return new Response(new Uint8Array([1]));
    });
    prefetcher.update(interlaken);
    expect(await prefetcher.next()).toBe('failed');
    online = true;
    expect(await prefetcher.next()).toBe('fetched');
    expect(requested[1]).toBe(requested[0]);
  });

  it('replans only after moving more than a kilometre', async () => {
    const { prefetcher, requested } = setup();
    prefetcher.update(interlaken);
    while ((await prefetcher.next()) === 'fetched');
    const before = requested.length;
    prefetcher.update({ lat: interlaken.lat + 0.005, lon: interlaken.lon });
    expect(await prefetcher.next()).toBe('idle');
    prefetcher.update({ lat: interlaken.lat + 0.1, lon: interlaken.lon });
    expect(await prefetcher.next()).toBe('fetched');
    expect(requested.length).toBe(before + 1);
  });
});
