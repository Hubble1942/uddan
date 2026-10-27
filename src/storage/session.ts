import type { RecorderSnapshot } from '../flight';
import type { Fix } from '../position/fix';
import type { ReplaySpeed } from '../position/replaySource';

/** What survives a reload of the page: the mode, a Replay's position and the Flight in progress. */
export interface SessionState {
  mode: 'live' | 'replay';
  recorder: RecorderSnapshot | null;
  lastFix: Fix | null;
  lastTrack: number | null;
  replay: { name: string; igc: string; time: number; speed: ReplaySpeed; paused: boolean } | null;
}

const KEY = 'uddan.session';
const VERSION = 1;

export function createSessionStore(storage: Storage | undefined) {
  return {
    load(): SessionState | undefined {
      try {
        const stored = JSON.parse(storage?.getItem(KEY) ?? 'null') as ({ version: number } & SessionState) | null;
        if (stored?.version !== VERSION) return undefined;
        const { version: _, ...state } = stored;
        return state;
      } catch {
        return undefined;
      }
    },
    /** False if the state could not be stored, e.g. because the storage is full. */
    save(state: SessionState): boolean {
      try {
        if (!storage) return false;
        storage.setItem(KEY, JSON.stringify({ version: VERSION, ...state }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
