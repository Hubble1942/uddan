import { distance } from '../position/geodesy';
import { tilesAround, type TileId } from './tileMath';
import type { TileLoader, TileSource } from './tileLoader';

export interface PrefetchTarget {
  source: TileSource;
  zooms: number[];
}

export type PrefetchStep = 'fetched' | 'idle' | 'failed';

type Position = { lat: number; lon: number };

/**
 * Keeps the tiles in a ring around the pilot cached. Each call to next() makes at most
 * one network request, so the caller decides the pace (see runPrefetcher).
 */
export function createPrefetcher(options: { loader: TileLoader; targets: PrefetchTarget[]; radius?: number; replanDistance?: number }) {
  const { loader, targets } = options;
  const radius = options.radius ?? 15_000;
  const replanDistance = options.replanDistance ?? 1_000;
  let plannedAt: Position | undefined;
  let queue: { source: TileSource; tile: TileId }[] = [];

  return {
    update(position: Position) {
      if (plannedAt && distance(plannedAt, position) < replanDistance) return;
      plannedAt = position;
      const zooms = [...new Set(targets.flatMap((t) => t.zooms))].sort((a, b) => a - b);
      queue = zooms.flatMap((z) =>
        targets.filter((t) => t.zooms.includes(z)).flatMap((t) => tilesAround(position, radius, z).map((tile) => ({ source: t.source, tile }))),
      );
    },

    async next(): Promise<PrefetchStep> {
      while (queue.length > 0) {
        const item = queue[0]!;
        if (await loader.isFresh(item.source, item.tile)) {
          queue.shift();
          continue;
        }
        try {
          await loader.load(item.source, item.tile);
          queue.shift();
          return 'fetched';
        } catch {
          return 'failed';
        }
      }
      return 'idle';
    },
  };
}

export type Prefetcher = ReturnType<typeof createPrefetcher>;

/** Drives a prefetcher: one request at a time, at most one per interval, backing off while offline. */
export function runPrefetcher(prefetcher: Prefetcher, options: { interval?: number; idleDelay?: number; failureDelay?: number } = {}) {
  const interval = options.interval ?? 1_000;
  const idleDelay = options.idleDelay ?? 5_000;
  const failureDelay = options.failureDelay ?? 30_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    const step = await prefetcher.next();
    if (stopped) return;
    timer = setTimeout(tick, step === 'fetched' ? interval : step === 'idle' ? idleDelay : failureDelay);
  };
  void tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
