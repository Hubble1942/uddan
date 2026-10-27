# Online vector tiles with gentle prefetch, no offline map packages

The Terrain Map is drawn from OpenFreeMap vector tiles (OpenMapTiles schema) with hillshade from Mapterhorn terrain tiles, using our own style cut down to relief, peaks with heights, water, towns and major roads. Mapterhorn also provides Ground Elevation. Everything is fetched online. There are no downloadable offline map packages yet, because building and hosting our own map data is more effort than we want to spend at the start. To bridge gaps in mobile coverage during a Flight, tiles are prefetched in a ring of about 15 km around the current Fix: vector zooms 12–14 and terrain zoom 12, one request at a time, at most about 1 per second, only tiles not already cached, which are kept for at least 7 days.

We chose vector tiles over finished raster maps because track-up rotation is planned, and only vector labels stay upright on a rotated map. They also let us show exactly the layers pilots need, and OpenFreeMap's terms explicitly allow apps to download areas for offline use (≤ 3,000 tiles or 50 MB per download, ≤ 4 parallel requests).

## Considered Options

- **OpenTopoMap raster**: easiest start, but its labels turn upside down on a rotated map and its content can't be reduced to our layers.
- **OpenTopoMap vector**: only a demo as of 2026; its style depends on MapLibre-specific plugins.
- **tile.openstreetmap.org**: its usage policy explicitly forbids any prefetching or offline use.
- **Region packages** (PMTiles extracts of vector and elevation data, hosted by us): the clean route to full offline use, at the cost of running a small data pipeline. The most likely next step.
- **Terrain Tiles on AWS** for elevation: Mapterhorn has about twice the resolution and also feeds the hillshade.
- **Thunderforest**: allows prefetching only on a paid plan.

## Consequences

- OpenFreeMap is run by one person, funded by donations, and "may discontinue it at any time without notice". Its weekly planet dumps make self-hosting the fallback.
- OpenFreeMap's offline terms require "a unique User-Agent identifying your app", which a browser app can't set. We stay well within every other limit and consider that within the spirit of the terms. We have deliberately not contacted the operator. If Uddan is later wrapped as an app (Electron, Capacitor or an Android WebView), the wrapper can set the User-Agent for tile requests only, and the rule is met properly.
- Cached tiles are stored by zoom/x/y regardless of OpenFreeMap's weekly data version, so a prefetched area stays usable after a data update.
- Mapterhorn publishes no usage policy at all; the prefetch limits above are our own restraint.
- We maintain our own map style.
- Areas outside the prefetch ring that the pilot hasn't viewed before show as blank when there's no coverage.
