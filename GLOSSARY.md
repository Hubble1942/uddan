# Uddan

A moving map for paraglider and hang glider pilots, showing the pilot's live position over a terrain map together with airspace.

## Language

### Flying

**Glider**:
A paraglider or hang glider. Uddan does not distinguish between the two.
_Avoid_: Wing, aircraft

**Airspace**:
A volume of controlled or restricted air with a horizontal boundary and a floor and ceiling.
_Avoid_: Zone, area

**Altitude**:
Height above mean sea level. Heights measured from the GPS ellipsoid or from the ground are always named explicitly and never called just "altitude".
_Avoid_: Height, elevation (for the pilot's altitude)

**Ground Elevation**:
The height of the terrain above mean sea level at a given position.
_Avoid_: Terrain height, DEM

**Height Above Ground**:
The pilot's Altitude minus the Ground Elevation beneath them. It is approximate, because Ground Elevation is.
_Avoid_: AGL (in prose), clearance

**Airspace Class**:
The category of an Airspace as given in its source data (e.g. C, D, CTR, restricted), which decides whether the pilot wants to see it.
_Avoid_: Type, category

**Vertical Margin**:
The safety allowance added above and below the pilot's Altitude when checking whether it falls within an Airspace's floor and ceiling.
_Avoid_: Buffer, tolerance

**Flight**:
The time between a Launch and the following Landing.
_Avoid_: Trip, session

**Launch**:
The moment a Flight begins, detected from sustained movement rather than declared by the pilot.
_Avoid_: Takeoff, start

**Landing**:
The moment a Flight ends, detected from sustained standstill or declared by the pilot.
_Avoid_: Touchdown, stop

### Positioning

**Fix**:
One position report: time, latitude, longitude and altitude.
_Avoid_: Location, point, sample, GPS reading

**Position Source**:
Where Fixes come from: the device's own GPS, an external GPS instrument, or a Replay.
_Avoid_: GPS (when the source is meant), provider

**Replay**:
A Position Source that plays back a previously recorded flight from an IGC file instead of using live GPS.
_Avoid_: Simulation, simulator, demo mode

**Track Log**:
The recorded sequence of Fixes of one Flight, including the minutes just before Launch.
_Avoid_: Trace, trail, breadcrumbs

**Flight List**:
The Track Logs kept on the device until the pilot deletes them.
_Avoid_: Logbook, history

**Flight Book**:
An external service where pilots publish and score their flights, such as XContest or karnee.net.
_Avoid_: Logbook, server

### Display

**Terrain Map**:
The topographic map drawn underneath everything else, showing relief, peaks with heights, water, towns and major roads.
_Avoid_: Base map, background map, tiles

**Moving Map**:
The view that shows the pilot's current Fix on the Terrain Map and keeps following it.
_Avoid_: Map view, navigation view
