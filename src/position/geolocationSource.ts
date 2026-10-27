import type { Fix, PositionSource } from './fix';
import type { Geoid } from './geoid';

/** The device's own GPS via the browser. Browsers report altitude above the WGS84 ellipsoid. */
export function createGeolocationSource(geoid: Geoid): PositionSource {
  let watchId: number | undefined;
  return {
    start(onFix, onError) {
      if (!('geolocation' in navigator)) {
        onError?.('This browser has no geolocation.');
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        ({ coords, timestamp }) => onFix(toFix(coords, timestamp, geoid)),
        (error) => onError?.(error.message || 'Position unavailable'),
        { enableHighAccuracy: true, maximumAge: 0 },
      );
    },
    stop() {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = undefined;
    },
  };
}

const finite = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

export function toFix(coords: GeolocationCoordinates, timestamp: number, geoid: Geoid): Fix {
  const ellipsoidal = finite(coords.altitude);
  return {
    time: timestamp,
    lat: coords.latitude,
    lon: coords.longitude,
    altitude: ellipsoidal === null ? null : ellipsoidal - geoid(coords.latitude, coords.longitude),
    groundSpeed: finite(coords.speed),
    track: finite(coords.heading),
  };
}
