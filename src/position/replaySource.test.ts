import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fix } from './fix';
import { createReplaySource } from './replaySource';

const fix = (seconds: number, altitude = 1000): Fix => ({
  time: Date.UTC(2026, 6, 1, 10, 0, seconds),
  lat: 46.69 + seconds * 1e-4,
  lon: 7.86,
  altitude,
  groundSpeed: null,
  track: null,
});

describe('replay source', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers Fixes with their original spacing at 1×', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(1), fix(3)]);
    replay.start((f) => received.push(f));
    expect(received).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(2);
    vi.advanceTimersByTime(1999);
    expect(received).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(received).toHaveLength(3);
  });

  it('plays faster at higher speed', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(4), fix(8)]);
    replay.setSpeed(4);
    replay.start((f) => received.push(f));
    vi.advanceTimersByTime(2000);
    expect(received).toHaveLength(3);
  });

  it('pauses and resumes', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(1), fix(2)]);
    replay.start((f) => received.push(f));
    replay.pause();
    vi.advanceTimersByTime(5000);
    expect(received).toHaveLength(1);
    replay.resume();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(2);
  });

  it('reports the end of the recording', () => {
    const onEnd = vi.fn();
    const replay = createReplaySource([fix(0), fix(1)], { onEnd });
    replay.start(() => {});
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('converts ellipsoid altitudes to mean sea level', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0, 1050)], { altitudeToMsl: (f) => (f.altitude ?? 0) - 50 });
    replay.start((f) => received.push(f));
    expect(received[0]?.altitude).toBe(1000);
  });

  it('keeps the recorded times so Launch detection works at any speed', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(8)]);
    replay.setSpeed(16);
    replay.start((f) => received.push(f));
    vi.advanceTimersByTime(500);
    expect(received.map((f) => f.time)).toEqual([fix(0).time, fix(8).time]);
  });

  it('knows the time span of the recording', () => {
    const replay = createReplaySource([fix(0), fix(5), fix(9)]);
    expect(replay.startTime).toBe(fix(0).time);
    expect(replay.endTime).toBe(fix(9).time);
  });

  it('jumps to the first Fix at or after a time and plays on from there', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(1), fix(2), fix(3), fix(4)]);
    replay.start((f) => received.push(f));
    replay.seek(fix(2).time + 500);
    expect(received.at(-1)?.time).toBe(fix(3).time);
    vi.advanceTimersByTime(1000);
    expect(received.at(-1)?.time).toBe(fix(4).time);
  });

  it('shows the Fix at the new time while paused, then stays paused', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(1), fix(2), fix(3)]);
    replay.start((f) => received.push(f));
    replay.pause();
    replay.seek(fix(2).time);
    expect(received.at(-1)?.time).toBe(fix(2).time);
    vi.advanceTimersByTime(5000);
    expect(received.at(-1)?.time).toBe(fix(2).time);
    replay.resume();
    vi.advanceTimersByTime(1000);
    expect(received.at(-1)?.time).toBe(fix(3).time);
  });

  it('jumps back in time', () => {
    const received: Fix[] = [];
    const replay = createReplaySource([fix(0), fix(1), fix(2)]);
    replay.start((f) => received.push(f));
    vi.advanceTimersByTime(2000);
    replay.seek(fix(0).time);
    expect(received.at(-1)?.time).toBe(fix(0).time);
  });

  it('starts over when resumed after the end', () => {
    const received: Fix[] = [];
    const onEnd = vi.fn();
    const replay = createReplaySource([fix(0), fix(1)], { onEnd });
    replay.start((f) => received.push(f));
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(replay.ended).toBe(true);
    replay.resume();
    expect(received.at(-1)?.time).toBe(fix(0).time);
    expect(replay.ended).toBe(false);
  });
});
