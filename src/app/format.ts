export const formatAltitude = (metres: number | null) => (metres === null ? '–' : `${Math.round(metres)} m`);

export const formatSpeed = (metresPerSecond: number | null) => (metresPerSecond === null ? '–' : `${Math.round(metresPerSecond * 3.6)} km/h`);

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** IGC long file name: date, manufacturer, recorder and the Flight number of that day. */
export function igcFileName(launchTime: number, flightOfDay: number): string {
  return `${new Date(launchTime).toISOString().slice(0, 10)}-XXX-UDDAN-${String(flightOfDay).padStart(2, '0')}.igc`;
}

/** UTF-8 if the bytes are valid UTF-8, otherwise Windows-1252, as many OpenAIR files are. */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Rounds readings to steps for display, holding the shown value until the reading is clearly
 * past the next step boundary, so a value hovering at a boundary doesn't flicker.
 */
export function steppedReadout(step = 5, hysteresis = 1) {
  let shown: number | null = null;
  return (value: number | null): number | null => {
    if (value === null) return (shown = null);
    if (shown === null || Math.abs(value - shown) > step / 2 + hysteresis) shown = Math.round(value / step) * step;
    return shown;
  };
}
