import { describe, expect, it } from 'vitest';
import type { Fix } from '../position/fix';
import { FlightRecorder, flightRecorderDefaults, type RecordedFlight } from './recorder';

const T0 = Date.parse('2025-07-01T10:00:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const METRES_PER_DEGREE_LAT = 111_195;

/** Feeds a recorder with 1 Hz Fixes, moving north at the given speed. */
class Pilot {
  time = T0;
  lat = 46.5;
  readonly flights: RecordedFlight[] = [];
  readonly recorder: FlightRecorder;

  constructor(thresholds: Partial<typeof flightRecorderDefaults> = {}) {
    this.recorder = new FlightRecorder({ thresholds, onFlight: (f) => this.flights.push(f) });
  }

  /** Moves for the given seconds; reportSpeed false leaves groundSpeed null so the recorder must derive it. */
  move(seconds: number, kmh: number, heightAboveGround: number | null, reportSpeed = true): void {
    for (let i = 0; i < seconds; i++) {
      this.time += SECOND;
      this.lat += kmh / 3.6 / METRES_PER_DEGREE_LAT;
      const fix: Fix = {
        time: this.time,
        lat: this.lat,
        lon: 7.9,
        altitude: 1000 + (heightAboveGround ?? 0),
        groundSpeed: reportSpeed ? kmh / 3.6 : null,
        track: null,
      };
      this.recorder.push(fix, heightAboveGround);
    }
  }

  stand(seconds: number, heightAboveGround: number | null = 0): void {
    this.move(seconds, 0, heightAboveGround);
  }

  gap(seconds: number): void {
    this.time += seconds * SECOND;
  }

  /** Stands at launch, then runs off and climbs. */
  launch(): void {
    this.stand(10 * 60);
    this.move(5, 20, 0);
    this.move(40, 30, 100);
  }

  land(): void {
    this.move(20, 30, 20);
    this.stand(60);
  }
}

describe('FlightRecorder launch', () => {
  it('starts waiting with an empty Track Log', () => {
    const p = new Pilot();
    expect(p.recorder.status).toBe('waiting');
    expect(p.recorder.trackLog).toEqual([]);
  });

  it('launches after 30 s above 10 km/h with Height Above Ground above 50 m', () => {
    const p = new Pilot();
    p.stand(10 * 60);
    p.move(30, 30, 100);
    expect(p.recorder.status).toBe('waiting');
    p.move(1, 30, 100);
    expect(p.recorder.status).toBe('recording');
  });

  it('starts the Track Log with the last 5 minutes before Launch', () => {
    const p = new Pilot();
    p.launch();
    const log = p.recorder.trackLog;
    expect(log[0]?.time).toBe(T0 + (10 * 60 + 31) * SECOND - 5 * MINUTE);
    expect(log.at(-1)?.time).toBe(p.time);
    expect(log.length).toBe(5 * 60 + 15);
  });

  it('waits for Height Above Ground to pass 50 m while the movement continues', () => {
    const p = new Pilot();
    p.move(60, 30, 30);
    expect(p.recorder.status).toBe('waiting');
    p.move(1, 30, 60);
    expect(p.recorder.status).toBe('recording');
  });

  it('does not launch on a car drive at ground level', () => {
    const p = new Pilot();
    p.move(30 * 60, 80, 0);
    expect(p.recorder.status).toBe('waiting');
  });

  it('does not launch on a speed burst shorter than 30 s', () => {
    const p = new Pilot();
    for (let i = 0; i < 10; i++) {
      p.move(25, 30, 100);
      p.stand(2, 100);
    }
    expect(p.recorder.status).toBe('waiting');
  });

  it('launches on speed alone when Height Above Ground is unknown', () => {
    const p = new Pilot();
    p.move(31, 30, null);
    expect(p.recorder.status).toBe('recording');
  });

  it('derives ground speed from distance and time when the Fix has none', () => {
    const p = new Pilot();
    p.stand(5);
    p.move(31, 30, 100, false);
    expect(p.recorder.status).toBe('recording');
  });

  it('does not count movement across a gap in Fixes as continuous', () => {
    const p = new Pilot();
    p.move(20, 30, 100);
    p.gap(60);
    p.move(20, 30, 100);
    expect(p.recorder.status).toBe('waiting');
  });

  it('reports the start of the sustained movement as the launch time', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.recorder.stop();
    expect(p.flights[0]?.launchTime).toBe(T0 + (10 * 60 + 1) * SECOND);
  });
});

describe('FlightRecorder landing', () => {
  it('lands after 60 s below 3 km/h near the ground and keeps the standstill Fixes', () => {
    const p = new Pilot();
    p.launch();
    p.move(20, 30, 20);
    p.stand(60);
    expect(p.recorder.status).toBe('recording');
    p.stand(1);
    expect(p.recorder.status).toBe('landed');
    expect(p.recorder.trackLog.at(-1)?.time).toBe(p.time);
  });

  it('does not land while ridge soaring at ground speed 0 high above ground', () => {
    const p = new Pilot();
    p.launch();
    p.stand(10 * 60, 200);
    expect(p.recorder.status).toBe('recording');
  });

  it('lands on speed alone when Height Above Ground is unknown', () => {
    const p = new Pilot();
    p.launch();
    p.stand(61, null);
    expect(p.recorder.status).toBe('landed');
  });

  it('does not count standstill across a gap in Fixes as continuous', () => {
    const p = new Pilot();
    p.launch();
    p.stand(40);
    p.gap(60);
    p.stand(40);
    expect(p.recorder.status).toBe('recording');
  });

  it('finalises the Flight 5 minutes after the Landing time', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.stand(1);
    const landingTime = p.time - 60 * SECOND;
    const lastStandstillFix = p.time;
    p.stand(4 * 60 - 1);
    expect(p.recorder.status).toBe('landed');
    expect(p.flights).toHaveLength(0);
    p.stand(1);
    expect(p.recorder.status).toBe('waiting');
    expect(p.flights).toHaveLength(1);
    const flight = p.flights[0];
    expect(flight?.landingTime).toBe(landingTime);
    expect(flight?.fixes.at(-1)?.time).toBe(lastStandstillFix);
    expect(p.recorder.trackLog).toEqual([]);
  });

  it('finalises when Fixes resume after a long gap', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.stand(1);
    p.gap(30 * 60);
    p.stand(1);
    expect(p.flights).toHaveLength(1);
    expect(p.recorder.status).toBe('waiting');
  });
});

describe('FlightRecorder continuation', () => {
  it('continues the Flight when relaunching 3 minutes after Landing', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.stand(1);
    const landedAt = p.time;
    p.stand(2 * 60);
    p.move(31, 30, 100);
    expect(p.recorder.status).toBe('recording');
    expect(p.recorder.trackLog.some((f) => f.time === landedAt + 60 * SECOND)).toBe(true);

    p.land();
    p.stand(10 * 60);
    expect(p.flights).toHaveLength(1);
    const times = p.flights[0]?.fixes.map((f) => f.time) ?? [];
    for (let i = 1; i < times.length; i++) expect(times[i]).toBe((times[i - 1] ?? 0) + SECOND);
  });

  it('starts a new Flight when relaunching 10 minutes after Landing', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.stand(10 * 60);
    p.move(31, 30, 100);
    expect(p.flights).toHaveLength(1);
    expect(p.recorder.status).toBe('recording');
    const firstLanding = p.flights[0]?.landingTime ?? 0;
    expect(p.recorder.trackLog[0]?.time).toBeGreaterThan(firstLanding);

    p.land();
    p.recorder.stop();
    expect(p.flights).toHaveLength(2);
  });
});

describe('FlightRecorder manual stop', () => {
  it('finalises a Flight in progress immediately', () => {
    const p = new Pilot();
    p.launch();
    p.move(60, 30, 300);
    p.recorder.stop();
    expect(p.recorder.status).toBe('waiting');
    expect(p.flights).toHaveLength(1);
    expect(p.flights[0]?.landingTime).toBe(p.time);
    expect(p.flights[0]?.fixes.at(-1)?.time).toBe(p.time);
  });

  it('finalises a landed Flight without waiting for the grace period', () => {
    const p = new Pilot();
    p.launch();
    p.land();
    p.stand(30);
    p.recorder.stop();
    expect(p.flights).toHaveLength(1);
    expect(p.flights[0]?.fixes.at(-1)?.time).toBe(p.time - 29 * SECOND);
  });

  it('does nothing while waiting', () => {
    const p = new Pilot();
    p.stand(60);
    p.recorder.stop();
    expect(p.flights).toHaveLength(0);
  });

  it('needs fresh sustained movement to launch again after a stop', () => {
    const p = new Pilot();
    p.launch();
    p.recorder.stop();
    p.move(29, 30, 100);
    expect(p.recorder.status).toBe('waiting');
    p.move(2, 30, 100);
    expect(p.recorder.status).toBe('recording');
    expect(p.recorder.trackLog[0]?.time).toBeGreaterThan(p.flights[0]?.landingTime ?? 0);
  });
});

describe('FlightRecorder thresholds', () => {
  it('can be overridden', () => {
    const p = new Pilot({ launchDuration: 10 * SECOND });
    p.move(11, 30, 100);
    expect(p.recorder.status).toBe('recording');
  });

  it('ignores Fixes that are not newer than the previous one', () => {
    const p = new Pilot();
    p.move(10, 30, 100);
    p.time -= 5 * SECOND;
    p.stand(1, 100);
    p.time += 5 * SECOND;
    p.move(25, 30, 100);
    expect(p.recorder.status).toBe('recording');
  });
});
