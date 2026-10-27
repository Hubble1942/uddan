import { openDB, type DBSchema } from 'idb';
import type { Fix } from '../position/fix';

export interface Settings {
  pilot: string;
  glider: string;
  /** Metres added above and below the pilot's Altitude for the Airspace check. */
  verticalMargin: number;
  hiddenAirspaceClasses: string[];
}

export const DEFAULT_SETTINGS: Settings = { pilot: '', glider: '', verticalMargin: 100, hiddenAirspaceClasses: [] };

export interface AirspaceFile {
  id: number;
  name: string;
  text: string;
  addedAt: number;
}

export interface StoredFlight {
  id: number;
  launchTime: number;
  landingTime: number;
  igc: string;
  /** True if the Flight was rebuilt after the app was closed mid-flight. */
  recovered: boolean;
}

interface UddanDb extends DBSchema {
  settings: { key: string; value: Settings };
  airspaceFiles: { key: number; value: AirspaceFile };
  flights: { key: number; value: StoredFlight; indexes: { launchTime: number } };
  inProgress: { key: string; value: Fix[] };
}

export async function openStorage(name = 'uddan') {
  const db = await openDB<UddanDb>(name, 1, {
    upgrade(db) {
      db.createObjectStore('settings');
      db.createObjectStore('airspaceFiles', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('flights', { keyPath: 'id', autoIncrement: true }).createIndex('launchTime', 'launchTime');
      db.createObjectStore('inProgress');
    },
  });

  return {
    async getSettings(): Promise<Settings> {
      return { ...DEFAULT_SETTINGS, ...(await db.get('settings', 'settings')) };
    },
    async saveSettings(settings: Settings) {
      await db.put('settings', settings, 'settings');
    },

    listAirspaceFiles: () => db.getAll('airspaceFiles'),
    addAirspaceFile: (fileName: string, text: string) =>
      db.add('airspaceFiles', { name: fileName, text, addedAt: Date.now() } as AirspaceFile),
    removeAirspaceFile: (id: number) => db.delete('airspaceFiles', id),

    async listFlights(): Promise<StoredFlight[]> {
      return (await db.getAllFromIndex('flights', 'launchTime')).reverse();
    },
    addFlight: (flight: Omit<StoredFlight, 'id'>) => db.add('flights', flight as StoredFlight),
    deleteFlight: (id: number) => db.delete('flights', id),

    async saveInProgress(fixes: Fix[]) {
      await db.put('inProgress', fixes, 'current');
    },
    async clearInProgress() {
      await db.delete('inProgress', 'current');
    },
    /** The Track Log left behind by a crash or reload, removed from storage as it is returned. */
    async takeInProgress(): Promise<Fix[] | undefined> {
      const fixes = await db.get('inProgress', 'current');
      await db.delete('inProgress', 'current');
      return fixes;
    },
  };
}

export type Storage = Awaited<ReturnType<typeof openStorage>>;
