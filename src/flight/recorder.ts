import type { Fix } from '../position/fix';
import { distance } from '../position/geodesy';

export interface FlightRecorderThresholds {
  /** Ground speed in m/s that counts as moving. */
  launchSpeed: number;
  /** How long in ms the movement must last. */
  launchDuration: number;
  /** Height Above Ground in m that must be exceeded at the moment of Launch. */
  launchHeightAboveGround: number;
  /** Ground speed in m/s that counts as standing still. */
  landingSpeed: number;
  /** How long in ms the standstill must last. */
  landingDuration: number;
  /** Height Above Ground in m that must not be reached at the moment of Landing. */
  landingHeightAboveGround: number;
  /** How many ms of Fixes before Launch the Track Log starts with. */
  preLaunchBuffer: number;
  /** A Launch within this many ms of the Landing time continues the same Flight. */
  continuationWindow: number;
  /** A longer gap in ms between Fixes breaks continuous movement or standstill. */
  maxFixGap: number;
}

export const flightRecorderDefaults: FlightRecorderThresholds = {
  launchSpeed: 10 / 3.6,
  launchDuration: 30_000,
  launchHeightAboveGround: 50,
  landingSpeed: 3 / 3.6,
  landingDuration: 60_000,
  landingHeightAboveGround: 50,
  preLaunchBuffer: 5 * 60_000,
  continuationWindow: 5 * 60_000,
  maxFixGap: 10_000,
};

export type RecorderStatus = 'waiting' | 'recording' | 'landed';

export interface RecordedFlight {
  fixes: Fix[];
  launchTime: number;
  landingTime: number;
}

export interface FlightRecorderOptions {
  thresholds?: Partial<FlightRecorderThresholds>;
  onFlight?: (flight: RecordedFlight) => void;
}

/** Detects Launch and Landing from a stream of Fixes and records the Track Log of each Flight. */
export class FlightRecorder {
  private readonly thresholds: FlightRecorderThresholds;
  private readonly onFlight: (flight: RecordedFlight) => void;

  private currentStatus: RecorderStatus = 'waiting';
  private previous: Fix | null = null;
  private buffer: Fix[] = [];
  private movingSince: number | null = null;
  private stillSince: number | null = null;

  private flightFixes: Fix[] = [];
  private afterLanding: Fix[] = [];
  private launchTime = 0;
  private landingTime = 0;

  constructor(options: FlightRecorderOptions = {}) {
    this.thresholds = { ...flightRecorderDefaults, ...options.thresholds };
    this.onFlight = options.onFlight ?? (() => {});
  }

  get status(): RecorderStatus {
    return this.currentStatus;
  }

  /** The Fixes of the current Flight up to now, or up to the Landing while landed. */
  get trackLog(): readonly Fix[] {
    return this.flightFixes;
  }

  push(fix: Fix, heightAboveGround: number | null): void {
    const t = this.thresholds;
    const previous = this.previous;
    if (previous && fix.time <= previous.time) return;
    this.previous = fix;

    const gap = previous !== null && fix.time - previous.time > t.maxFixGap;
    if (gap) {
      this.movingSince = null;
      this.stillSince = null;
    }
    this.updateRuns(fix, this.groundSpeed(fix, gap ? null : previous));

    this.buffer.push(fix);
    while (this.buffer.length > 0 && (this.buffer[0]?.time ?? 0) < fix.time - t.preLaunchBuffer) this.buffer.shift();

    if (this.currentStatus === 'landed' && fix.time - this.landingTime >= t.continuationWindow) this.finalise();

    switch (this.currentStatus) {
      case 'waiting':
        if (this.launchDetected(fix, heightAboveGround)) {
          this.currentStatus = 'recording';
          this.flightFixes = [...this.buffer];
          this.launchTime = this.movingSince ?? fix.time;
        }
        break;
      case 'landed':
        this.afterLanding.push(fix);
        if (this.launchDetected(fix, heightAboveGround)) {
          this.currentStatus = 'recording';
          this.flightFixes.push(...this.afterLanding);
          this.afterLanding = [];
        }
        break;
      case 'recording':
        this.flightFixes.push(fix);
        if (this.landingDetected(fix, heightAboveGround)) {
          this.currentStatus = 'landed';
          this.landingTime = this.stillSince ?? fix.time;
        }
        break;
    }
  }

  /** Lands immediately and finalises the current Flight, if any. */
  stop(): void {
    if (this.currentStatus === 'waiting') return;
    if (this.currentStatus === 'recording') this.landingTime = this.previous?.time ?? this.landingTime;
    this.finalise();
    this.buffer = [];
    this.movingSince = null;
    this.stillSince = null;
  }

  private finalise(): void {
    const flight = { fixes: this.flightFixes, launchTime: this.launchTime, landingTime: this.landingTime };
    this.currentStatus = 'waiting';
    this.flightFixes = [];
    this.afterLanding = [];
    this.onFlight(flight);
  }

  private groundSpeed(fix: Fix, previous: Fix | null): number | null {
    if (fix.groundSpeed !== null) return fix.groundSpeed;
    if (!previous) return null;
    return distance(previous, fix) / ((fix.time - previous.time) / 1000);
  }

  private updateRuns(fix: Fix, speed: number | null): void {
    const t = this.thresholds;
    this.movingSince = speed !== null && speed > t.launchSpeed ? (this.movingSince ?? fix.time) : null;
    this.stillSince = speed !== null && speed < t.landingSpeed ? (this.stillSince ?? fix.time) : null;
  }

  private launchDetected(fix: Fix, heightAboveGround: number | null): boolean {
    const t = this.thresholds;
    return (
      this.movingSince !== null &&
      fix.time - this.movingSince >= t.launchDuration &&
      (heightAboveGround === null || heightAboveGround > t.launchHeightAboveGround)
    );
  }

  private landingDetected(fix: Fix, heightAboveGround: number | null): boolean {
    const t = this.thresholds;
    return (
      this.stillSince !== null &&
      fix.time - this.stillSince >= t.landingDuration &&
      (heightAboveGround === null || heightAboveGround < t.landingHeightAboveGround)
    );
  }
}
