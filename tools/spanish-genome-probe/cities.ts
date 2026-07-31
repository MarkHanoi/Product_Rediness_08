/**
 * DECLARATIVE CITY CONFIG — this file is the CH5 "<200 lines of city-specific
 * config" budget. It may contain ONLY: a root URL, an optional folder filter,
 * a CRS note, and doc URLs. No algorithms, no per-city scoring, no per-city
 * field mappings.
 *
 * If a city ever needs anything else, that is a CH5 FAILURE and must be
 * reported as one, not smuggled in here.
 */

export interface CityConfig {
  readonly code: string;
  readonly name: string;
  /** ArcGIS REST root(s). Ordered; the probe tries each and records the result of every one. */
  readonly arcgisRoots: readonly string[];
  /** Optional folder narrowing. Using this counts against the config budget. */
  readonly folderFilter?: (folder: string) => boolean;
  readonly notes?: string;
}

export const MADRID: CityConfig = {
  code: '28079',
  name: 'Madrid',
  arcgisRoots: ['https://sigma.madrid.es/hosted/rest/services'],
  // Madrid's catalogue has 40 folders and thousands of layers. The calibration
  // run descends only into folders that are themselves planning-named — this is
  // an efficiency filter, and the filter predicate below is generic Spanish
  // vocabulary, not a Madrid layer list.
  folderFilter: (f) => /URBAN|PGOU|ORDENA|PLANEA|SUELO|EDIFICA|CATALOGO|CALLEJERO|MOVILIDAD/i.test(f),
  notes: 'EPSG:25830 native. Ground truth: DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer.',
};

// ─────────────────────────────────────────────────────────────────────────────
// CH5 MEASUREMENT — València's complete city-specific configuration.
// Found by `discoverRoots.ts valencia.es` at ladder rung R0 (generic patterns,
// zero city knowledge). No folder filter was needed; the blind run crawled all
// 33 folders. No new heuristic, regex or algorithm was added for València.
// ─────────────────────────────────────────────────────────────────────────────
export const VALENCIA: CityConfig = {
  code: '46250',
  name: 'València',
  arcgisRoots: ['https://geoportal.valencia.es/server/rest/services'],
  notes: 'EPSG:25830. Zoning: OPENDATA/UrbanismoEInfraestructuras/MapServer/231, zoneCode=califi, grade=tipoca, derivedPlan=origen. 17/33 folders are auth-gated (ArcGIS 499).',
};
