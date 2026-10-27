export { writeIgc, type IgcHeader } from './igc-writer';
export { parseIgc, type AltitudeReference, type ParsedIgc } from './igc-parser';
export {
  FlightRecorder,
  flightRecorderDefaults,
  type FlightRecorderOptions,
  type FlightRecorderThresholds,
  type RecordedFlight,
  type RecorderSnapshot,
  type RecorderStatus,
} from './recorder';
