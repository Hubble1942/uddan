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
  let index = 0;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let emit: ((fix: Fix) => void) | undefined;

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
    const deliver = () => {
      emit?.({ ...current, altitude: toMsl(current) });
      index++;
      schedule();
    };
    if (delay === 0) deliver();
    else timer = setTimeout(deliver, delay);
  };

  const source: PositionSource & {
    setSpeed(s: ReplaySpeed): void;
    pause(): void;
    resume(): void;
    readonly paused: boolean;
  } = {
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
      schedule();
    },
    get paused() {
      return paused;
    },
  };
  return source;
}

export type ReplaySource = ReturnType<typeof createReplaySource>;
