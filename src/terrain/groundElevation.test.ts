import { describe, expect, it } from 'vitest';
import { lonLatToTile } from '../tiles/tileMath';
import { createGroundElevation, terrariumToMetres, type DecodedImage } from './groundElevation';

describe('terrariumToMetres', () => {
  it('decodes sea level', () => {
    expect(terrariumToMetres(128, 0, 0)).toBe(0);
  });

  it('decodes a peak with sub-metre precision', () => {
    // 4158 m + 32768 = 36926 = 144 * 256 + 62
    expect(terrariumToMetres(144, 62, 128)).toBe(4158.5);
  });
});

/** A tile whose elevation rises 1 m per pixel to the east and 1000 m per pixel to the south. */
function rampTile(size: number): DecodedImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const v = px + py * 1000 + 32768;
      const i = (py * size + px) * 4;
      data[i] = Math.floor(v / 256);
      data[i + 1] = v % 256;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe('ground elevation', () => {
  const z = 12;
  const size = 4;
  const at = (lon: number, lat: number) => lonLatToTile(lon, lat, z);

  function setup(loadTile = async () => new ArrayBuffer(1) as ArrayBuffer | null) {
    let loads = 0;
    const model = createGroundElevation({
      zoom: z,
      loadTile: async () => {
        loads++;
        return loadTile();
      },
      decode: async () => rampTile(size),
    });
    return { model, loads: () => loads };
  }

  it('knows nothing before the tile is loaded', () => {
    const { model } = setup();
    expect(model.elevationAt(46.69, 7.86)).toBeNull();
  });

  it('interpolates between pixel centres once loaded', async () => {
    const { model } = setup();
    const t = at(7.86, 46.69);
    // Pick the position at pixel coordinate (1.5, 2.5) inside the tile, i.e. halfway between pixel centres 1 and 2 in x, centre 2 in y.
    const x = Math.floor(t.x) + 2 / size;
    const y = Math.floor(t.y) + 3 / size;
    const n = 2 ** z;
    const lon = (x / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
    await model.ensure(lat, lon);
    expect(model.elevationAt(lat, lon)).toBeCloseTo(1.5 + 2.5 * 1000, 3);
  });

  it('loads each tile only once', async () => {
    const { model, loads } = setup();
    await Promise.all([model.ensure(46.69, 7.86), model.ensure(46.6901, 7.8601)]);
    await model.ensure(46.69, 7.86);
    expect(loads()).toBe(1);
  });

  it('stays unknown where no tile exists, and retries after a failure', async () => {
    let fail = true;
    const { model, loads } = setup(async () => {
      if (fail) throw new Error('offline');
      return new ArrayBuffer(1);
    });
    await model.ensure(46.69, 7.86);
    expect(model.elevationAt(46.69, 7.86)).toBeNull();
    fail = false;
    await model.ensure(46.69, 7.86);
    expect(model.elevationAt(46.69, 7.86)).not.toBeNull();
    expect(loads()).toBe(2);
  });
});
