import * as maplibregl from 'maplibre-gl';
import type { TileLoader } from '../tiles/tileLoader';
import { TILE_SOURCES } from './tileSources';

export const PROTOCOL = 'uddan';

/** Routes MapLibre's tile requests (uddan://<source>/{z}/{x}/{y}) through our cache-backed loader. */
export function registerTileProtocol(loader: TileLoader) {
  maplibregl.addProtocol(PROTOCOL, async (params) => {
    const match = /^uddan:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    const source = match && TILE_SOURCES[match[1] as keyof typeof TILE_SOURCES];
    if (!match || !source) throw new Error(`Unknown tile URL ${params.url}`);
    const data = await loader.load(source, { z: Number(match[2]), x: Number(match[3]), y: Number(match[4]) });
    if (data === null && source.id === 'openfreemap') return { data: new ArrayBuffer(0) };
    if (data === null) throw new Error('No tile');
    return { data };
  });
}
