import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { parseOpenAir, type Airspace } from './airspace';
import { decodeText, formatAltitude, formatSpeed, steppedReadout } from './app/format';
import { $, download, renderAirspaceClasses, renderAirspaceFiles, renderFlights } from './app/menu';
import { addOverlays, markRelevantAirspaces, showAirspaces, showTrackLog } from './app/overlays';
import { createPilotMarker } from './app/pilotMarker';
import { createReplayPanel } from './app/replayPanel';
import { FlightRecorder, parseIgc, writeIgc, type RecordedFlight, type RecorderSnapshot } from './flight';
import { registerTileProtocol } from './map/protocol';
import { terrainMapStyle } from './map/style';
import { mapterhorn, openFreeMap } from './map/tileSources';
import type { Fix, PositionSource } from './position/fix';
import { bearing, distance } from './position/geodesy';
import { createGeolocationSource } from './position/geolocationSource';
import { createGeoid, GEOID_FILE } from './position/geoid';
import { createReplaySource, type ReplaySource } from './position/replaySource';
import { createSessionStore, type SessionState } from './storage/session';
import { openStorage } from './storage/storage';
import { createGroundElevation, type DecodedImage } from './terrain/groundElevation';
import { createPrefetcher, runPrefetcher } from './tiles/prefetcher';
import { createTileLoader } from './tiles/tileLoader';
import { cacheTileStore } from './tiles/tileStore';

const FOLLOW_PAUSE = 15_000;
const NO_GPS_AFTER = 5_000;
const SAVE_IN_PROGRESS_EVERY = 10_000;
const SAVE_SESSION_EVERY = 3_000;

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
  const pilot = createPilotMarker(map);

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

  let browserSession: Storage | undefined;
  try {
    browserSession = window.sessionStorage;
  } catch {
    // Storage blocked; nothing survives a reload.
  }
  const session = createSessionStore(browserSession);
  const restored = session.load();

  // After a reload the session resumes the Flight in progress. Only without one (tab closed,
  // browser crashed) does the left-over Track Log become a recovered Flight.
  const leftOver = await storage.takeInProgress();
  const resumesFlight = restored?.mode === 'live' && restored.recorder !== null && restored.recorder.status !== 'waiting';
  if (!resumesFlight && leftOver && leftOver.length >= 2) await saveFlight(leftOver, leftOver[0]!.time, leftOver.at(-1)!.time, true);
  await refreshFlights();

  // --- Position ---------------------------------------------------------------

  let source: PositionSource | undefined;
  let replay: ReplaySource | undefined;
  let recorder = new FlightRecorder();
  let lastFix: Fix | undefined;
  let lastTrack: number | null = null;
  let lastFixArrival = 0;
  let lastUserMove = 0;
  const shownAltitude = steppedReadout();
  const shownHeightAboveGround = steppedReadout();

  let sessionChanged = false;

  const newRecorder = (keepFlights: boolean, restore?: RecorderSnapshot) =>
    new FlightRecorder({
      restore,
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
    sessionChanged = true;

    const moved = previous ? distance(previous, fix) : 0;
    const seconds = previous ? (fix.time - previous.time) / 1000 : 0;
    const groundSpeed = fix.groundSpeed ?? (previous && seconds > 0 ? moved / seconds : null);
    lastTrack = fix.track ?? (previous && moved > 3 ? bearing(previous, fix) : lastTrack);

    void ground.ensure(fix.lat, fix.lon);
    const elevation = ground.elevationAt(fix.lat, fix.lon);
    const heightAboveGround = fix.altitude !== null && elevation !== null ? fix.altitude - elevation : null;
    recorder.push(fix, heightAboveGround);
    prefetcher.update(fix);

    $('altitude').textContent = formatAltitude(shownAltitude(fix.altitude));
    $('height-above-ground').textContent = formatAltitude(shownHeightAboveGround(heightAboveGround));
    $('ground-speed').textContent = formatSpeed(groundSpeed);
    $<HTMLButtonElement>('stop-flight').hidden = recorder.status === 'waiting';

    pilot.update(fix, lastTrack, recorder.status === 'recording');
    showTrackLog(map, recorder.status === 'waiting' ? [] : recorder.trackLog);
    if (replay) replayPanel.setTime(fix.time);
    refreshRelevance();
    if (Date.now() - lastUserMove > FOLLOW_PAUSE) map.jumpTo({ center: [fix.lon, fix.lat] });
  };

  /** Forgets the path so far, e.g. when the Position Source changes or a Replay jumps in time. */
  const restartTracking = (keepFlights: boolean) => {
    recorder.stop();
    recorder = newRecorder(keepFlights);
    lastFix = undefined;
    lastTrack = null;
    lastFixArrival = performance.now();
    showTrackLog(map, []);
    pilot.setFlying(false);
    $<HTMLButtonElement>('stop-flight').hidden = true;
    $('altitude').textContent = formatAltitude(shownAltitude(null));
    $('height-above-ground').textContent = formatAltitude(shownHeightAboveGround(null));
    $('ground-speed').textContent = formatSpeed(null);
    sessionChanged = true;
  };

  /** Picks up the Track Log, Flight state and position from before a reload. */
  const resumeTracking = (state: SessionState, keepFlights: boolean) => {
    recorder = newRecorder(keepFlights, state.recorder ?? undefined);
    lastFix = state.lastFix ?? undefined;
    lastTrack = state.lastTrack;
    showTrackLog(map, recorder.status === 'waiting' ? [] : recorder.trackLog);
    $<HTMLButtonElement>('stop-flight').hidden = recorder.status === 'waiting';
    if (lastFix) {
      pilot.update(lastFix, lastTrack, recorder.status === 'recording');
      map.jumpTo({ center: [lastFix.lon, lastFix.lat] });
    }
  };

  const useSource = (next: PositionSource | undefined, label: string, keepFlights: boolean) => {
    source?.stop();
    restartTracking(keepFlights);
    source = next;
    $('position-status').textContent = label;
    next?.start(onFix, (message) => ($('position-status').textContent = `${label}: ${message}`));
  };

  let mode: 'live' | 'replay' = 'live';
  let replayFile: { name: string; igc: string; fixes: Fix[]; altitudeReference: string } | undefined;

  const readReplayFile = (name: string, igc: string) => {
    const parsed = parseIgc(igc);
    if (parsed.fixes.length === 0) return undefined;
    return { name, igc, fixes: parsed.fixes, altitudeReference: parsed.altitudeReference };
  };

  // A Replay drives Launch and Landing detection but never adds to the Flight List.
  const startReplay = (autoplay: boolean, resume?: SessionState) => {
    if (!replayFile) {
      useSource(undefined, 'Replay: no IGC file', false);
      return;
    }
    const { name, fixes, altitudeReference } = replayFile;
    replay = createReplaySource(fixes, {
      altitudeToMsl: (f) => (f.altitude !== null && altitudeReference === 'ellipsoid' ? f.altitude - geoid(f.lat, f.lon) : f.altitude),
      onEnd: () => {
        replayPanel.setPlaying(false);
        sessionChanged = true;
      },
    });
    if (resume?.replay) replayPanel.setSpeed(resume.replay.speed);
    replay.setSpeed(replayPanel.speed);
    replayPanel.load(name, replay.startTime, replay.endTime);
    replay.pause();
    useSource(replay, `Replay: ${name}`, false);
    if (resume?.replay) {
      // Continue right after the last Fix shown before the reload.
      resumeTracking(resume, false);
      replay.seek(resume.replay.time + 1);
      autoplay = !resume.replay.paused;
    } else {
      replay.seek(replay.startTime);
      lastUserMove = 0;
    }
    if (autoplay && !replay.ended) replay.resume();
    replayPanel.setPlaying(!replay.paused && !replay.ended);
  };

  const replayPanel = createReplayPanel({
    onFile: async (file) => {
      const read = readReplayFile(file.name, await file.text());
      if (!read) {
        $('replay-file-name').textContent = `${file.name} contains no Fixes`;
        return;
      }
      replayFile = read;
      startReplay(true);
    },
    onPlayPause: () => {
      if (!replay) return;
      if (replay.ended) restartTracking(false);
      if (replay.paused || replay.ended) replay.resume();
      else replay.pause();
      replayPanel.setPlaying(!replay.paused);
      sessionChanged = true;
    },
    onSpeed: (speed) => {
      replay?.setSpeed(speed);
      sessionChanged = true;
    },
    onSeek: (time) => {
      if (!replay) return;
      restartTracking(false);
      replay.seek(time);
      if (replay.ended) replayPanel.setPlaying(false);
    },
  });

  const setMode = (next: 'live' | 'replay', resume?: SessionState) => {
    mode = next;
    $('mode-live').setAttribute('aria-pressed', String(mode === 'live'));
    $('mode-replay').setAttribute('aria-pressed', String(mode === 'replay'));
    replayPanel.show(mode === 'replay');
    replay = undefined;
    if (mode === 'live') {
      useSource(createGeolocationSource(geoid), 'GPS', true);
      if (resume) resumeTracking(resume, true);
    } else {
      startReplay(false, resume);
    }
  };
  $('mode-live').addEventListener('click', () => mode !== 'live' && setMode('live'));
  $('mode-replay').addEventListener('click', () => {
    if (mode !== 'replay') setMode('replay');
    $<HTMLDialogElement>('menu').close();
  });

  $('stop-flight').addEventListener('click', () => {
    recorder.stop();
    showTrackLog(map, []);
    pilot.setFlying(false);
    $<HTMLButtonElement>('stop-flight').hidden = true;
  });

  const saveSession = () => {
    if (!sessionChanged) return;
    sessionChanged = false;
    const saved = session.save({
      mode,
      recorder: recorder.snapshot(),
      lastFix: lastFix ?? null,
      lastTrack,
      replay:
        mode === 'replay' && replayFile && replay
          ? {
              name: replayFile.name,
              igc: replayFile.igc,
              time: lastFix?.time ?? replay.startTime,
              speed: replayPanel.speed,
              paused: replay.paused || replay.ended,
            }
          : null,
    });
    if (!saved) console.warn('Session state could not be stored; a reload starts afresh.');
  };
  setInterval(saveSession, SAVE_SESSION_EVERY);
  window.addEventListener('pagehide', () => {
    sessionChanged = true;
    saveSession();
  });

  // Keep the in-progress Track Log safe against crashes.
  setInterval(() => {
    if (replay || recorder.status === 'waiting') return;
    void storage.saveInProgress([...recorder.trackLog]);
  }, SAVE_IN_PROGRESS_EVERY);

  setInterval(() => {
    $('no-gps').hidden = mode === 'replay' || performance.now() - lastFixArrival < NO_GPS_AFTER;
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
  if (restored?.replay) replayFile = readReplayFile(restored.replay.name, restored.replay.igc);
  setMode(restored?.mode ?? 'live', restored);
}

void main();
