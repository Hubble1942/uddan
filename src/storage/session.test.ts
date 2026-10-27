import { describe, expect, it } from 'vitest';
import { createSessionStore, type SessionState } from './session';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const state: SessionState = {
  mode: 'replay',
  recorder: null,
  lastFix: { time: 1000, lat: 46.7, lon: 7.8, altitude: 1940, groundSpeed: null, track: null },
  lastTrack: 120,
  replay: { name: 'demo.igc', igc: 'AXXXUddan\r\n', time: 1000, speed: 16, paused: true },
};

describe('session store', () => {
  it('has nothing in a fresh session', () => {
    expect(createSessionStore(memoryStorage()).load()).toBeUndefined();
  });

  it('gives back what was saved', () => {
    const storage = memoryStorage();
    expect(createSessionStore(storage).save(state)).toBe(true);
    expect(createSessionStore(storage).load()).toEqual(state);
  });

  it('ignores unreadable or outdated content', () => {
    const storage = memoryStorage();
    storage.setItem('uddan.session', '{not json');
    expect(createSessionStore(storage).load()).toBeUndefined();
    storage.setItem('uddan.session', JSON.stringify({ version: 0, mode: 'live' }));
    expect(createSessionStore(storage).load()).toBeUndefined();
  });

  it('reports a full storage instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(createSessionStore(storage).save(state)).toBe(false);
  });

  it('works without any storage', () => {
    const store = createSessionStore(undefined);
    expect(store.save(state)).toBe(false);
    expect(store.load()).toBeUndefined();
  });
});
