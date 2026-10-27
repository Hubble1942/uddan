# Uddan

A moving map for paraglider and hang glider pilots. It shows your position on a terrain map together with Airspace, and records your flights as IGC files. It runs in the browser as an installable web app (PWA) and is meant to end up on a color eInk reader.

## Features

- Terrain map with hillshade, peaks with heights, water, towns and major roads; north-up, follows the pilot.
- Position from the device's GPS, or a **Replay** of an IGC file (1×, 4×, 16×) for testing at the desk.
- Airspace from OpenAIR files you load yourself. Airspaces whose floor-to-ceiling band contains your Altitude (± an adjustable margin) are highlighted.
- Altitude, approximate height above ground and ground speed.
- Automatic Launch and Landing detection, with the 5 minutes before Launch included. Flights are kept on the device and exported as IGC.
- Map tiles around the pilot are prefetched gently, so short gaps in mobile coverage don't blank the map.

**Not a certified instrument. Airspace highlighting is approximate (GPS altitude, standard atmosphere for flight levels). Always fly with official airspace data and your own judgement.**

## Development

Requires Node 24.

```sh
npm install
npm run dev     # generates assets, then starts the dev server
npm test        # unit tests
npm run build   # production build into dist/
```

`scripts/prepare-assets.ts` runs before `dev` and `build`. It generates the geoid grid and downloads the label fonts, which are not kept in the repo. `npx tsx scripts/make-demo-flight.ts` writes a synthetic flight to replay into `tracks/demo-flight.igc`. `tracks/` is gitignored, so it is also the place for your own IGC files.

Geolocation needs HTTPS (or `localhost`). Pushes to `master` deploy to GitHub Pages.

Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr/](docs/adr/).

## Data and licences

Uddan's code is under the [MIT licence](LICENSE). At runtime it uses:

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), served by [OpenFreeMap](https://openfreemap.org) in the [OpenMapTiles](https://www.openmaptiles.org/) schema.
- Elevation and hillshade from [Mapterhorn](https://mapterhorn.com/attribution).
- Label fonts: Noto Sans (SIL Open Font License), downloaded from OpenFreeMap at build time.
- Geoid: EGM96 (NGA, public domain), via [egm96-universal](https://github.com/nicolas-van/egm96-universal).
