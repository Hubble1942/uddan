// Creates the binary assets the app needs but the repo doesn't keep: the geoid grid
// (generated from egm96-universal) and the label glyphs (downloaded from OpenFreeMap).
// Runs before `dev` and `build`; existing files are kept.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEOID_FILE, GEOID_STEP } from '../src/position/geoid';
import { sampleGeoidGrid } from './geoidGrid';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
// Basic Latin and Latin-1, Latin Extended-A/B, General Punctuation.
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

function write(path: string, data: Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

const geoidPath = `${publicDir}${GEOID_FILE}`;
if (!existsSync(geoidPath)) {
  const grid = sampleGeoidGrid(GEOID_STEP);
  write(geoidPath, new Uint8Array(grid.buffer));
  console.log(`generated ${GEOID_FILE}`);
}

for (const font of FONTS) {
  for (const range of GLYPH_RANGES) {
    const path = `${publicDir}fonts/${font}/${range}.pbf`;
    if (existsSync(path)) continue;
    const url = `https://tiles.openfreemap.org/fonts/${encodeURIComponent(font)}/${range}.pbf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    write(path, new Uint8Array(await response.arrayBuffer()));
    console.log(`downloaded ${font} ${range}`);
  }
}
