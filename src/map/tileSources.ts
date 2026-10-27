import type { TileSource } from '../tiles/tileLoader';

const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';
const OPENFREEMAP_TEMPLATE_KEY = 'uddan.openfreemap.template';

/** Ground Elevation and hillshade. Terrarium-encoded WebP, 512 px tiles, global up to zoom 12. */
export const mapterhorn: TileSource = {
  id: 'mapterhorn',
  resolveUrl: async ({ z, x, y }) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,
};

let template: Promise<string> | undefined;

/**
 * OpenFreeMap puts its weekly data version into the tile URLs, so the current URL template
 * is looked up once per session. The last known template is kept for starts without network.
 */
function openFreeMapTemplate(): Promise<string> {
  template ??= (async () => {
    try {
      const response = await fetch(OPENFREEMAP_TILEJSON);
      const tileJson = (await response.json()) as { tiles: string[] };
      const current = tileJson.tiles[0]!;
      try {
        localStorage.setItem(OPENFREEMAP_TEMPLATE_KEY, current);
      } catch {
        // Not remembered; the next start without network has to rely on cached tiles alone.
      }
      return current;
    } catch (error) {
      template = undefined;
      let remembered: string | null = null;
      try {
        remembered = localStorage.getItem(OPENFREEMAP_TEMPLATE_KEY);
      } catch {
        // Storage unavailable.
      }
      if (remembered) return remembered;
      throw error;
    }
  })();
  return template;
}

export const openFreeMap: TileSource = {
  id: 'openfreemap',
  resolveUrl: async ({ z, x, y }) =>
    (await openFreeMapTemplate()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
};

export const TILE_SOURCES = { mapterhorn, openfreemap: openFreeMap } as const;
