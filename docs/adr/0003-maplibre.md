# MapLibre GL JS as map library

We use MapLibre GL JS to draw the Moving Map. Our map data (OpenFreeMap vector tiles, Mapterhorn hillshade) and our style are MapLibre-native, and MapLibre rotates the map while keeping labels upright, which track-up needs. MapLibre requires WebGL. That could be a problem on an eReader, but per ADR 0001 we don't design around guesses about devices we can't test yet.

## Considered Options

- **OpenLayers**: first choice while the Terrain Map was going to be raster tiles, because it draws with Canvas 2D and doesn't need WebGL. Once we moved to vector tiles, it lost out because it supports only part of the MapLibre style language (via ol-mapbox-style).
- **Leaflet**: rotation is only available through a third-party plugin, and vector tiles only through plugins.
