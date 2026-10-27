import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { parseOpenAir, type Airspace } from './airspace';
import { decodeText, formatAltitude, formatSpeed } from './app/format';
import { $, download, renderAirspaceClasses, renderAirspaceFiles, renderFlights } from './app/menu';
import { addOverlays, markRelevantAirspaces, showAirspaces, showPilot, showTrackLog } from './app/overlays';
import { FlightRecorder, parseIgc, writeIgc, type RecordedFlight } from './flight';
import { registerTileProtocol } from './map/protocol';
import { terrainMapStyle } from './map/style';
import { mapterhorn, openFreeMap } from './map/tileSources';
import type { Fix, PositionSource } from './position/fix';
import { bearing, distance } from './position/geodesy';
import { createGeolocationSource } from './position/geolocationSource';
import { createGeoid, GEOID_FILE } from './position/geoid';
import { createReplaySource, type ReplaySource, type ReplaySpeed } from './position/replaySource';
import { openStorage } from './storage/storage';
import { createGroundElevation, type DecodedImage } from './terrain/groundElevation';
import { createPrefetcher, runPrefetcher } from './tiles/prefetcher';
import { createTileLoader } from './tiles/tileLoader';
import { cacheTileStore } from './tiles/tileStore';

const FOLLOW_PAUSE = 15_000;
const NO_GPS_AFTER = 5_000;
const SAVE_IN_PROGRESS_EVERY = 10_000;

async function decodeImage(data: ArrayBuffer): Promise<DecodedImage> {
  // Elevation is encoded in the colour values, so the browser must not alter them.
  const bitmap = await createImageBitmap(new Blob([data], { type: 'image/webp' }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

async function main() {
  // MapLibre finds its worker next to its own module, which bundling breaks.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  registerSW({ immediate: true });
  void navigator.storage?.persist?.();

  const storage = await openStorage();
  let settings = await storage.getSettings();
  const geoid = createGeoid(await (await fetch(new URL(GEOID_FILE, document.baseURI))).arrayBuffer());

  const loader = createTileLoader({
    store: cacheTileStore(await caches.open('uddan-tiles-v1')),
    fetch: (input, init) => fetch(input, init),
  });
  registerTileProtocol(loader);
  const ground = createGroundElevation({ zoom: 12, loadTile: (z, x, y) => loader.load(mapterhorn, { z, x, y }), decode: decodeImage });
  const prefetcher = createPrefetcher({
    loader,
    targets: [
      { source: mapterhorn, zooms: [12] },
      { source: openFreeMap, zooms: [12, 13, 14] },
    ],
  });
  runPrefetcher(prefetcher);

  const map = new maplibregl.Map({
    container: 'map',
    style: terrainMapStyle(document.baseURI),
    center: [7.86, 46.69],
    zoom: 11,
    maxZoom: 16,
    attributionControl: { compact: true },
    // North-up for now: no rotation or tilt by gesture.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  await map.once('load');
  addOverlays(map);

  // --- Airspace ---------------------------------------------------------------

  let allAirspaces: Airspace[] = [];
  let visibleAirspaces: Airspace[] = [];

  const applyAirspaceClasses = () => {
    visibleAirspaces = allAirspaces.filter((a) => !settings.hiddenAirspaceClasses.includes(a.airspaceClass));
    showAirspaces(map, visibleAirspaces);
    const classes = [...new Set(allAirspaces.map((a) => a.airspaceClass))].sort();
    renderAirspaceClasses(classes, settings.hiddenAirspaceClasses, async (hidden) => {
      settings = { ...settings, hiddenAirspaceClasses: hidden };
      await storage.saveSettings(settings);
      applyAirspaceClasses();
      refreshRelevance();
    });
  };

  const loadAirspaces = async () => {
    const files = await storage.listAirspaceFiles();
    const counts = new Map<number, number>();
    const warnings: string[] = [];
    allAirspaces = files.flatMap((file) => {
      const parsed = parseOpenAir(file.text, { idPrefix: `f${file.id}` });
      counts.set(file.id, parsed.airspaces.length);
      if (parsed.warnings.length > 0) warnings.push(`${file.name}: ${parsed.warnings.length} warnings, e.g. ${parsed.warnings[0]}`);
      return parsed.airspaces;
    });
    renderAirspaceFiles(files, counts, async (id) => {
      await storage.removeAirspaceFile(id);
      await loadAirspaces();
    });
    $('airspace-warnings').textContent = warnings.join(' · ');
    applyAirspaceClasses();
    refreshRelevance();
  };

  $<HTMLInputElement>('airspace-file').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    for (const file of input.files ?? []) await storage.addAirspaceFile(file.name, decodeText(await file.arrayBuffer()));
    input.value = '';
    await loadAirspaces();
  });

  const marginInput = $<HTMLInputElement>('vertical-margin');
  marginInput.value = String(settings.verticalMargin);
  marginInput.addEventListener('change', async () => {
    const margin = Number(marginInput.value);
    if (!Number.isFinite(margin) || margin < 0) return;
    settings = { ...settings, verticalMargin: margin };
    await storage.saveSettings(settings);
    refreshRelevance();
  });

  // --- Pilot ------------------------------------------------------------------

  const bindSetting = (id: string, key: 'pilot' | 'glider') => {
    const input = $<HTMLInputElement>(id);
    input.value = settings[key];
    input.addEventListener('change', async () => {
      settings = { ...settings, [key]: input.value.trim() };
      await storage.saveSettings(settings);
    });
  };
  bindSetting('pilot-name', 'pilot');
  bindSetting('glider', 'glider');

  // --- Flights ----------------------------------------------------------------

  const refreshFlights = async () =>
    renderFlights(
      await storage.listFlights(),
      (flight, fileName) => download(fileName, flight.igc),
      async (id) => {
        await storage.deleteFlight(id);
        await refreshFlights();
      },
    );

  const saveFlight = async (fixes: readonly Fix[], launchTime: number, landingTime: number, recovered: boolean) => {
    const igc = writeIgc({ pilot: settings.pilot, glider: settings.glider, appVersion: __APP_VERSION__ }, [...fixes]);
    await storage.addFlight({ launchTime, landingTime, igc, recovered });
    await storage.clearInProgress();
    await refreshFlights();
  };

  const leftOver = await storage.takeInProgress();
  if (leftOver && leftOver.length >= 2) await saveFlight(leftOver, leftOver[0]!.time, leftOver.at(-1)!.time, true);
  await refreshFlights();

  // --- Position ---------------------------------------------------------------

  let source: PositionSource | undefined;
  let replay: ReplaySource | undefined;
  let recorder = new FlightRecorder();
  let lastFix: Fix | undefined;
  let lastTrack: number | null = null;
  let lastFixArrival = 0;
  let lastUserMove = 0;

  const newRecorder = (keepFlights: boolean) =>
    new FlightRecorder({
      onFlight: keepFlights ? (f: RecordedFlight) => void saveFlight(f.fixes, f.launchTime, f.landingTime, false) : undefined,
    });

  function refreshRelevance() {
    const elevation = lastFix ? ground.elevationAt(lastFix.lat, lastFix.lon) : null;
    markRelevantAirspaces(map, visibleAirspaces, lastFix?.altitude ?? null, settings.verticalMargin, elevation);
  }

  const onFix = (fix: Fix) => {
    const previous = lastFix;
    lastFix = fix;
    lastFixArrival = performance.now();

    const moved = previous ? distance(previous, fix) : 0;
    const seconds = previous ? (fix.time - previous.time) / 1000 : 0;
    const groundSpeed = fix.groundSpeed ?? (previous && seconds > 0 ? moved / seconds : null);
    lastTrack = fix.track ?? (previous && moved > 3 ? bearing(previous, fix) : lastTrack);

    void ground.ensure(fix.lat, fix.lon);
    const elevation = ground.elevationAt(fix.lat, fix.lon);
    const heightAboveGround = fix.altitude !== null && elevation !== null ? fix.altitude - elevation : null;
    recorder.push(fix, heightAboveGround);
    prefetcher.update(fix);

    $('altitude').textContent = formatAltitude(fix.altitude);
    $('height-above-ground').textContent = heightAboveGround === null ? '–' : `≈${formatAltitude(heightAboveGround)}`;
    $('ground-speed').textContent = formatSpeed(groundSpeed);
    $('recorder-status').textContent = recorder.status;
    $<HTMLButtonElement>('stop-flight').hidden = recorder.status === 'waiting';

    showPilot(map, fix, lastTrack);
    showTrackLog(map, recorder.status === 'waiting' ? [] : recorder.trackLog);
    refreshRelevance();
    if (Date.now() - lastUserMove > FOLLOW_PAUSE) map.jumpTo({ center: [fix.lon, fix.lat] });
  };

  const useSource = (next: PositionSource, label: string, keepFlights: boolean) => {
    source?.stop();
    recorder.stop();
    recorder = newRecorder(keepFlights);
    lastFix = undefined;
    lastTrack = null;
    lastFixArrival = performance.now();
    source = next;
    $('source-label').textContent = label;
    $('position-status').textContent = label;
    next.start(onFix, (message) => ($('position-status').textContent = `${label}: ${message}`));
  };

  const useGps = () => {
    replay = undefined;
    $('replay-controls').hidden = true;
    useSource(createGeolocationSource(geoid), 'GPS', true);
  };
  $('use-gps').addEventListener('click', useGps);

  $<HTMLInputElement>('replay-file').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseIgc(await file.text());
    if (parsed.fixes.length === 0) {
      $('position-status').textContent = `${file.name} contains no Fixes.`;
      return;
    }
    replay = createReplaySource(parsed.fixes, {
      altitudeToMsl: (f) => (f.altitude !== null && parsed.altitudeReference === 'ellipsoid' ? f.altitude - geoid(f.lat, f.lon) : f.altitude),
      onEnd: () => ($('source-label').textContent = `Replay of ${file.name} finished`),
    });
    replay.setSpeed(Number($<HTMLSelectElement>('replay-speed').value) as ReplaySpeed);
    $('replay-pause').textContent = 'Pause';
    $('replay-controls').hidden = false;
    // A Replay drives Launch and Landing detection but never adds to the Flight List.
    useSource(replay, `Replay: ${file.name}`, false);
    lastUserMove = 0;
  });

  $('replay-pause').addEventListener('click', () => {
    if (!replay) return;
    if (replay.paused) replay.resume();
    else replay.pause();
    $('replay-pause').textContent = replay.paused ? 'Resume' : 'Pause';
  });
  $<HTMLSelectElement>('replay-speed').addEventListener('change', (event) => {
    replay?.setSpeed(Number((event.target as HTMLSelectElement).value) as ReplaySpeed);
  });

  $('stop-flight').addEventListener('click', () => {
    recorder.stop();
    $('recorder-status').textContent = recorder.status;
    showTrackLog(map, []);
  });

  // Keep the in-progress Track Log safe against crashes and reloads.
  setInterval(() => {
    if (replay || recorder.status === 'waiting') return;
    void storage.saveInProgress([...recorder.trackLog]);
  }, SAVE_IN_PROGRESS_EVERY);

  setInterval(() => {
    const paused = replay?.paused ?? false;
    $('no-gps').hidden = !source || paused || performance.now() - lastFixArrival < NO_GPS_AFTER;
  }, 1000);

  // --- Following the pilot ----------------------------------------------------

  map.on('movestart', (event) => {
    if (!event.originalEvent) return;
    lastUserMove = Date.now();
    $('recenter').hidden = false;
  });
  setInterval(() => {
    if (Date.now() - lastUserMove > FOLLOW_PAUSE) $('recenter').hidden = true;
  }, 1000);
  $('recenter').addEventListener('click', () => {
    lastUserMove = 0;
    $('recenter').hidden = true;
    if (lastFix) map.jumpTo({ center: [lastFix.lon, lastFix.lat] });
  });

  // --- Screen and menu --------------------------------------------------------

  const keepScreenOn = async () => {
    try {
      await navigator.wakeLock?.request('screen');
    } catch {
      // Not granted, e.g. in a background tab; tried again on the next visibility change.
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void keepScreenOn();
  });
  void keepScreenOn();

  const menu = $<HTMLDialogElement>('menu');
  $('open-menu').addEventListener('click', () => menu.showModal());

  await loadAirspaces();
  useGps();
}

void main();
