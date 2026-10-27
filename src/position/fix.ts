/**
 * One position report. Units are SI throughout the domain: metres, m/s, degrees.
 * Unit conversion for display happens only in the UI.
 */
export interface Fix {
  /** Milliseconds since the Unix epoch, UTC. */
  time: number;
  lat: number;
  lon: number;
  /** Altitude in metres above mean sea level, or null if the source has none. */
  altitude: number | null;
  /** Ground speed in m/s as reported by the source, if any. */
  groundSpeed: number | null;
  /** Track over ground in degrees clockwise from true north, if any. */
  track: number | null;
}

/** Where Fixes come from. */
export interface PositionSource {
  start(onFix: (fix: Fix) => void, onError?: (message: string) => void): void;
  stop(): void;
}
