// Writes a synthetic IGC flight for desk testing with Replay: one minute standing at the
// Niederhorn launch, a run and takeoff, three thermal circles, a glide to Interlaken,
// landing and two minutes standing. Writes to the gitignored tracks/ directory.
// Usage: npx tsx scripts/make-demo-flight.ts [file name, default demo-flight.igc]
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeIgc } from '../src/flight';
import type { Fix } from '../src/position/fix';

const start = Date.UTC(2026, 6, 4, 11, 0, 0);
const metresPerDegLat = 111_195;
const metresPerDegLon = metresPerDegLat * Math.cos((46.7 * Math.PI) / 180);
const fixes: Fix[] = [];
let lat = 46.7106;
let lon = 7.7744;
let altitude = 1940;
let t = 0;

const step = (heading: number, speed: number, climb: number) => {
  const h = (heading * Math.PI) / 180;
  lat += (Math.cos(h) * speed) / metresPerDegLat;
  lon += (Math.sin(h) * speed) / metresPerDegLon;
  altitude += climb;
  t++;
  fixes.push({ time: start + t * 1000, lat, lon, altitude, groundSpeed: null, track: null });
};

for (let i = 0; i < 60; i++) step(0, 0, 0);
for (let i = 0; i < 8; i++) step(150, 3, 0);
for (let i = 0; i < 90; i++) step(150, 9, -1);
for (let i = 0; i < 3 * 30; i++) step(150 + i * 12, 8, 2.5);
const target = { lat: 46.6845, lon: 7.8575 };
while (altitude > 600) {
  const dy = (target.lat - lat) * metresPerDegLat;
  const dx = (target.lon - lon) * metresPerDegLon;
  const remaining = Math.hypot(dx, dy);
  const heading = (Math.atan2(dx, dy) * 180) / Math.PI;
  step(heading, Math.min(10, remaining / 20 + 2), -Math.max(1, (altitude - 580) / Math.max(30, remaining / 10)));
}
for (let i = 0; i < 6; i++) step(90, 2, -(altitude - 570) / 6);
for (let i = 0; i < 120; i++) step(0, 0, 0);

const tracksDir = fileURLToPath(new URL('../tracks/', import.meta.url));
mkdirSync(tracksDir, { recursive: true });
const out = tracksDir + (process.argv[2] ?? 'demo-flight.igc');
writeFileSync(out, writeIgc({ pilot: 'Demo Pilot', glider: 'Demo Glider', appVersion: 'demo' }, fixes));
console.log(`wrote ${fixes.length} Fixes to ${out}`);
