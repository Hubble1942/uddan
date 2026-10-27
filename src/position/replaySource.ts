import type { Fix, PositionSource } from './fix';

export type ReplaySpeed = 1 | 4 | 16;

/**
 * Plays back recorded Fixes with their original spacing, divided by the speed.
 * Fixes keep their recorded times.
 */
export function createReplaySource(
  recorded: Fix[],
  options: { altitudeToMsl?: (fix: Fix) => number | null; onEnd?: () => void } = {},
) {
  const toMsl = options.altitudeToMsl ?? ((f: Fix) => f.altitude);
  let speed: ReplaySpeed = 1;
  /** The next Fix to deliver. */
  let index = 0;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let emit: ((fix: Fix) => void) | undefined;

  const deliver = (i: number) => {
    const fix = recorded[i]!;
    index = i + 1;
    emit?.({ ...fix, altitude: toMsl(fix) });
  };

  const schedule = () => {
    clearTimeout(timer);
    if (paused || !emit) return;
    const current = recorded[index];
    if (!current) {
      options.onEnd?.();
      return;
    }
    const previous = recorded[index - 1];
    const delay = previous ? Math.max(0, (current.time - previous.time) / speed) : 0;
    const next = () => {
      deliver(index);
      schedule();
    };
    if (delay === 0) next();
    else timer = setTimeout(next, delay);
  };

  const source: PositionSource & {
    readonly startTime: number;
    readonly endTime: number;
    readonly paused: boolean;
    readonly ended: boolean;
    setSpeed(s: ReplaySpeed): void;
    pause(): void;
    /** Plays on; starts over from the beginning if the recording has ended. */
    resume(): void;
    /** Shows the first Fix at or after the time and plays on from there unless paused. */
    seek(time: number): void;
  } = {
    startTime: recorded[0]?.time ?? 0,
    endTime: recorded.at(-1)?.time ?? 0,
    start(onFix) {
      emit = onFix;
      index = 0;
      schedule();
    },
    stop() {
      clearTimeout(timer);
      emit = undefined;
    },
    setSpeed(s) {
      speed = s;
    },
    pause() {
      paused = true;
      clearTimeout(timer);
    },
    resume() {
      paused = false;
      if (index >= recorded.length) index = 0;
      schedule();
    },
    seek(time) {
      if (recorded.length === 0) return;
      clearTimeout(timer);
      const found = recorded.findIndex((f) => f.time >= time);
      deliver(found === -1 ? recorded.length - 1 : found);
      schedule();
    },
    get paused() {
      return paused;
    },
    get ended() {
      return index >= recorded.length;
    },
  };
  return source;
}

export type ReplaySource = ReturnType<typeof createReplaySource>;
