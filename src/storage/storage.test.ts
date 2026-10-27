import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Fix } from '../position/fix';
import { DEFAULT_SETTINGS, openStorage } from './storage';

let dbCount = 0;
const fresh = () => openStorage(`test-${dbCount++}`);
const fix = (t: number): Fix => ({ time: t, lat: 46.69, lon: 7.86, altitude: 1000, groundSpeed: null, track: null });

describe('storage', () => {
  it('returns default settings until saved, then the saved ones', async () => {
    const storage = await fresh();
    expect(await storage.getSettings()).toEqual(DEFAULT_SETTINGS);
    await storage.saveSettings({ ...DEFAULT_SETTINGS, pilot: 'Chris', verticalMargin: 150 });
    expect(await storage.getSettings()).toMatchObject({ pilot: 'Chris', verticalMargin: 150 });
  });

  it('keeps Airspace files until removed', async () => {
    const storage = await fresh();
    const id = await storage.addAirspaceFile('CH.txt', 'AC C\n');
    await storage.addAirspaceFile('IT.txt', 'AC D\n');
    expect((await storage.listAirspaceFiles()).map((f) => f.name)).toEqual(['CH.txt', 'IT.txt']);
    await storage.removeAirspaceFile(id);
    expect((await storage.listAirspaceFiles()).map((f) => f.name)).toEqual(['IT.txt']);
  });

  it('keeps the Flight List newest first', async () => {
    const storage = await fresh();
    await storage.addFlight({ launchTime: 1000, landingTime: 2000, igc: 'A', recovered: false });
    const id = await storage.addFlight({ launchTime: 5000, landingTime: 9000, igc: 'B', recovered: false });
    expect((await storage.listFlights()).map((f) => f.igc)).toEqual(['B', 'A']);
    await storage.deleteFlight(id);
    expect((await storage.listFlights()).map((f) => f.igc)).toEqual(['A']);
  });

  it('hands back the in-progress Track Log once', async () => {
    const storage = await fresh();
    expect(await storage.takeInProgress()).toBeUndefined();
    await storage.saveInProgress([fix(1), fix(2)]);
    expect((await storage.takeInProgress())?.map((f) => f.time)).toEqual([1, 2]);
    expect(await storage.takeInProgress()).toBeUndefined();
  });
});
