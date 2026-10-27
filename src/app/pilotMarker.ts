import * as maplibregl from 'maplibre-gl';
import type { Fix } from '../position/fix';
import { continueAngle } from '../position/geodesy';

const ARROW = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
  <path d="M24 3 L40 43 L24 33 L8 43 Z" fill="#f5b700" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

/**
 * The pilot's arrow. It turns smoothly to each new track over roughly the time until the
 * next Fix, always the short way round.
 */
export function createPilotMarker(map: maplibregl.Map) {
  const element = document.createElement('div');
  element.className = 'pilot-marker';
  const arrow = document.createElement('div');
  arrow.className = 'pilot-arrow';
  arrow.innerHTML = ARROW;
  element.append(arrow);

  const marker = new maplibregl.Marker({ element, anchor: 'center' });
  let added = false;
  let angle = 0;
  let lastUpdate = 0;

  return {
    update(fix: Fix, track: number | null) {
      marker.setLngLat([fix.lon, fix.lat]);
      if (!added) {
        marker.addTo(map);
        added = true;
      }
      const now = performance.now();
      const interval = Math.min(1000, Math.max(100, now - lastUpdate));
      lastUpdate = now;
      if (track === null) return;
      angle = continueAngle(angle, (track - map.getBearing() + 360) % 360);
      arrow.style.transitionDuration = `${interval}ms`;
      arrow.style.transform = `rotate(${angle}deg)`;
    },
  };
}
