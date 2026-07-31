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

export const VALENCIA: CityConfig = {
  code: '46250',
  name: 'València',
  arcgisRoots: [
    // Filled at run time by the root-discovery step; see PRE-REGISTRATION.md.
    // Any root listed here was found by generic host probing, NOT by reading a
    // València-specific document.
  ],
  notes: 'EPSG:25830 expected (UTM 30N). Roots to be discovered.',
};
