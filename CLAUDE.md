# Uddan

Moving map for paraglider and hang glider pilots: a browser PWA (TypeScript, Vite, MapLibre), later on a color eInk reader.

## Where knowledge lives

- **Domain language:** [GLOSSARY.md](GLOSSARY.md). Name code, tests and docs with its terms (Fix, Flight, Launch, Altitude, …).
- **Decisions:** [docs/adr/](docs/adr/). Read the relevant ADR before changing map data, map library or device targeting.
- **Learnings:** record conventions, gotchas and user preferences in this file, terms in the glossary, and decisions as ADRs. The project is the memory, so keep them all in the repo.

## Conventions

- **YAGNI:** build for what exists now. Device-specific eInk tuning waits for real hardware (ADR 0001).
- **Small commits:** one logical step per commit, made as the work progresses.
- **Text-only repo:** binary assets (glyphs, the geoid grid) are produced by `scripts/prepare-assets.ts`, which runs before `dev` and `build`, and their outputs are gitignored. Add new binaries there.
- **Units:** SI internally (m, m/s, degrees, ms timestamps). Conversion for display lives only in `src/app/format.ts`.
- **Altitude** is always above mean sea level. Each Position Source converts at its boundary (geoid for ellipsoid heights).
- **Test-first** for pure logic, with Vitest. Verify UI and map behaviour in a real browser by replaying a flight. `scripts/make-demo-flight.ts` writes a synthetic one into the gitignored `tracks/`.
- **Preview servers on Windows:** stopping a background `npx vite preview` task leaves its `node … vite.js preview` process running and the port taken. Look it up by its command line and end it after each check.
- **Test data:** synthetic or the user's own flights only. Third-party OpenAIR files and other pilots' IGC files stay out of this public repo.
- **External services:** keep tile requests within ADR 0002's prefetch limits. Contact with outside projects (forums, issues, emails) happens only when the user asks for it.
