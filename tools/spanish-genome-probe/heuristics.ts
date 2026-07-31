/**
 * Spanish Planning Genome — heuristic tables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE RULE (do not violate — it is the whole experiment)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every token in this file MUST be traceable to a source that predates any
 * València observation. Each entry carries a `src` tag:
 *
 *   MAD   — observed in Madrid's own ArcGIS catalogue / fields
 *           (sigma.madrid.es, DESARROLLO_URBANO_ACTUALIZADO + PGOUM97)
 *   B11   — founder batch 11 generic Spanish signals, restated in València's
 *           RATE plan P4.5: CALIFICACION / ZONIFICACION / ORDENANZA / NORMA / AMBITO
 *   SEV   — founder Sevilla batch 18a layer-scoring table (+20 each):
 *           Zona / Ordenación / Urbanística / Planeamiento / Edificación
 *   P41   — founder phase 41 per-layer feature list: altura, planta, ocupación,
 *           coef, edificabilidad, alineación, retranqueo, uso, ordenanza, norma,
 *           zona, grado, nivel
 *   P42   — founder phase 42 field-semantics table:
 *           AMB_TX_ETIQ→zoneCode, AMB_TX_DENOM→officialDesignation,
 *           COEF_Z→coefficient, TIPOAMB→planningAreaType
 *
 * NO token may be added after València data has been seen without being logged
 * in the experiment report as a post-hoc tune, reported separately from the
 * blind score. See docs/.../findings/GENOME-TEST-01-MADRID-TO-VALENCIA.md.
 */

export type HeuristicSource = 'MAD' | 'B11' | 'SEV' | 'P41' | 'P42';

export interface Token {
  /** Accent-folded, lower-cased substring to look for. */
  readonly t: string;
  readonly w: number;
  readonly src: HeuristicSource;
}

/**
 * Fold Spanish/Catalan/Valencian diacritics and case so `Ordenación`,
 * `ORDENACIO` and `ordenacion` all compare equal. Deliberately generic —
 * it is not a València accommodation; Madrid's own `Alineación`/`Ordenación`
 * layer names require it.
 */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[·_\-.,/()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Positive layer/service-name tokens.
 *
 * SEV's five tokens are +20 by the founder's own table. B11's five generic
 * signals are given the same weight — both sets are pre-València and neither
 * source ranks one above the other.
 */
export const LAYER_NAME_TOKENS: readonly Token[] = [
  // SEV — Sevilla batch 18a scoring table, +20 each, verbatim
  { t: 'zona', w: 20, src: 'SEV' },
  { t: 'ordenacio', w: 20, src: 'SEV' }, // matches ordenacion / ordenació / ordenacions
  { t: 'urbanistic', w: 20, src: 'SEV' },
  { t: 'planeamiento', w: 20, src: 'SEV' },
  { t: 'edificacio', w: 20, src: 'SEV' },

  // B11 — generic Spanish signals named in València's own P4.5 gate text
  { t: 'calificacio', w: 20, src: 'B11' },
  { t: 'zonificacio', w: 20, src: 'B11' },
  { t: 'ordenanza', w: 20, src: 'B11' },
  { t: 'norma', w: 20, src: 'B11' },
  // §AMBITO-DEMOTION — calibration change #2, Madrid pass, pre-València.
  // B11 lists AMBITO alongside CALIFICACION/ZONIFICACION/ORDENANZA/NORMA as a
  // zoning signal. Madrid's own catalogue shows that is wrong: `ámbito` names
  // the *planning-area* instrument layer (APR/APE/API — a DIFFERENT ground
  // truth, `PG_ORDENACION/3`), while zoning is `NORMAS_ZONALES`. At +20 the
  // ámbito layers outranked the true zoning layer 3-to-1. Demoted to +8: still
  // a planning signal, no longer a zoning signal. This is a Madrid-observed
  // correction to a founder heuristic, made before any València request.
  { t: 'ambito', w: 8, src: 'B11' },

  // P41 — secondary planning vocabulary; weaker because these name *aspects*
  // of a plan rather than the zoning layer itself.
  { t: 'alineacio', w: 10, src: 'P41' },
  { t: 'retranqueo', w: 10, src: 'P41' },
  { t: 'edificabilidad', w: 10, src: 'P41' },
  { t: 'ocupacio', w: 10, src: 'P41' },
  { t: 'altura', w: 10, src: 'P41' },
  { t: 'grado', w: 10, src: 'P41' },
  { t: 'nivel', w: 10, src: 'P41' },
  { t: 'uso', w: 6, src: 'P41' },

  // MAD — observed in Madrid's own service/folder names
  { t: 'pgou', w: 15, src: 'MAD' }, // PGOUM97 folder; PGOU is the national instrument name
  { t: 'suelo', w: 8, src: 'MAD' }, // "clases de suelo"
  { t: 'urbano', w: 6, src: 'MAD' }, // DESARROLLO_URBANO_ACTUALIZADO
];

/**
 * Negative layer/service-name tokens.
 *
 * Every one of these is justified by a *Madrid* folder or layer that is not the
 * zoning layer — they exist to stop the crawler ranking Madrid's own street,
 * heritage, parcel and basemap layers above NORMAS_ZONALES. None was chosen by
 * looking at València.
 */
export const LAYER_NAME_NEGATIVE_TOKENS: readonly Token[] = [
  { t: 'callejero', w: -25, src: 'MAD' },
  { t: 'catalogo', w: -20, src: 'MAD' }, // CATALOGO2021 = protected-building catalogue
  { t: 'gestion', w: -15, src: 'MAD' }, // GESTION_URBANA = management, not zoning
  { t: 'movilidad', w: -25, src: 'MAD' },
  { t: 'residuo', w: -25, src: 'MAD' },
  { t: 'alumbrado', w: -25, src: 'MAD' },
  { t: 'transporte', w: -25, src: 'MAD' },
  { t: 'satelite', w: -25, src: 'MAD' },
  { t: 'ortofoto', w: -25, src: 'MAD' },
  { t: 'elevacion', w: -25, src: 'MAD' },
  { t: 'estadistic', w: -20, src: 'MAD' },
  { t: 'topograf', w: -20, src: 'MAD' },
  { t: 'mapa base', w: -20, src: 'MAD' },
  { t: 'basemap', w: -20, src: 'MAD' },
];

/**
 * Field-name tokens that indicate a layer carries planning *parameters*.
 * Straight from P41's per-layer feature list.
 */
export const FIELD_SIGNAL_TOKENS: readonly Token[] = [
  { t: 'altura', w: 8, src: 'P41' },
  { t: 'planta', w: 8, src: 'P41' },
  { t: 'ocupacio', w: 8, src: 'P41' },
  { t: 'coef', w: 8, src: 'P41' },
  { t: 'edificabilidad', w: 8, src: 'P41' },
  { t: 'alineacio', w: 8, src: 'P41' },
  { t: 'retranqueo', w: 8, src: 'P41' },
  { t: 'uso', w: 8, src: 'P41' },
  { t: 'ordenanza', w: 8, src: 'P41' },
  { t: 'norma', w: 8, src: 'P41' },
  { t: 'zona', w: 8, src: 'P41' },
  { t: 'grado', w: 8, src: 'P41' },
  { t: 'nivel', w: 8, src: 'P41' },
  // B11 additions — same class of signal, named in the P4.5 gate
  { t: 'calificacio', w: 8, src: 'B11' },
  { t: 'zonificacio', w: 8, src: 'B11' },
  { t: 'ambito', w: 8, src: 'B11' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Field → ontology semantics (founder phase 42 / module 3)
// ─────────────────────────────────────────────────────────────────────────────

export type OntologyKey =
  | 'zoneCode'
  | 'officialDesignation'
  | 'coefficient'
  | 'planningAreaType'
  | 'maxHeight'
  | 'maxFloors'
  | 'far'
  | 'coverage'
  | 'buildableDepth'
  | 'setback'
  | 'alignment'
  | 'permittedUse';

export interface FieldRule {
  /** Regex over the folded field NAME (not the alias). */
  readonly pattern: RegExp;
  readonly key: OntologyKey;
  /** Founder module 3 asks for a confidence, e.g. ALTURA 0.99 / H_MAX 0.95. */
  readonly confidence: number;
  readonly src: HeuristicSource;
}

/**
 * Ordered by confidence, highest first. `classifyField` returns the first match.
 *
 * The exact-name rules (`AMB_TX_ETIQ`, `AMB_TX_DENOM`, `COEF_Z`, `TIPOAMB`) are
 * Madrid's proven pairs from P42 and are scored highest — they are the literal
 * "does Madrid knowledge transfer" test. Everything below them is a *generic*
 * Spanish morpheme rule, which is what the Genome thesis actually predicts will
 * carry over.
 */
export const FIELD_RULES: readonly FieldRule[] = [
  // ── P42 exact Madrid pairs ────────────────────────────────────────────────
  { pattern: /^amb tx etiq$/, key: 'zoneCode', confidence: 0.99, src: 'P42' },
  { pattern: /^amb tx denom$/, key: 'officialDesignation', confidence: 0.99, src: 'P42' },
  { pattern: /^coef z$/, key: 'coefficient', confidence: 0.99, src: 'P42' },
  { pattern: /^tipoamb$/, key: 'planningAreaType', confidence: 0.99, src: 'P42' },

  // ── zoneCode: generic Spanish morphology ──────────────────────────────────
  { pattern: /^(cod|codigo|clave|clau)[ ]?(zona|zon|urb|urbanistic\w*|calif\w*|ordenanza|norma|amb\w*)?$/, key: 'zoneCode', confidence: 0.9, src: 'B11' },
  { pattern: /\b(cod|codigo|clave|clau)\b.*\b(zona|zon|calif\w*|ordenanza|norma|urbanistic\w*|amb\w*)\b/, key: 'zoneCode', confidence: 0.9, src: 'B11' },
  { pattern: /\b(zona|zon|calif\w*|ordenanza|norma|amb\w*)\b.*\b(cod|codigo|clave|clau)\b/, key: 'zoneCode', confidence: 0.88, src: 'B11' },
  { pattern: /^calificacio\w*$/, key: 'zoneCode', confidence: 0.85, src: 'B11' },
  { pattern: /^zonificacio\w*$/, key: 'zoneCode', confidence: 0.85, src: 'B11' },
  { pattern: /^ordenanza\w*$/, key: 'zoneCode', confidence: 0.82, src: 'B11' },
  { pattern: /^(zona|zonas|zon)$/, key: 'zoneCode', confidence: 0.78, src: 'SEV' },
  { pattern: /\betiq\w*\b/, key: 'zoneCode', confidence: 0.7, src: 'P42' }, // AMB_TX_ETIQ generalised
  { pattern: /^(sigla|siglas|abrev\w*)$/, key: 'zoneCode', confidence: 0.7, src: 'B11' },
  { pattern: /^(subzona|subclave)\w*$/, key: 'zoneCode', confidence: 0.68, src: 'B11' },

  // ── officialDesignation ───────────────────────────────────────────────────
  { pattern: /\bdenom\w*\b/, key: 'officialDesignation', confidence: 0.95, src: 'P42' },
  { pattern: /^(descripcio\w*|desc|descrip)$/, key: 'officialDesignation', confidence: 0.8, src: 'B11' },
  { pattern: /^(nombre|nom|literal|rotulo|texto|etiqueta)\w*$/, key: 'officialDesignation', confidence: 0.75, src: 'B11' },

  // ── numeric planning parameters (P41 vocabulary) ──────────────────────────
  { pattern: /\baltura\b|\balt max\w*|\bh max\b|\baltmax\b|\bcornisa\b/, key: 'maxHeight', confidence: 0.95, src: 'P41' },
  { pattern: /\bplanta\w*\b|\bn plant\w*|\bnumplant\w*/, key: 'maxFloors', confidence: 0.92, src: 'P41' },
  { pattern: /\bedificabilidad\b|\bedificab\w*|\baprovech\w*|\bcoef\w* edif\w*/, key: 'far', confidence: 0.9, src: 'P41' },
  { pattern: /\bocupacio\w*\b|\bocup\b/, key: 'coverage', confidence: 0.9, src: 'P41' },
  { pattern: /\bfondo\b|\bprofundidad\b/, key: 'buildableDepth', confidence: 0.85, src: 'P41' },
  { pattern: /\bretranqueo\w*\b|\bseparacio\w*\b|\blindero\w*\b/, key: 'setback', confidence: 0.85, src: 'P41' },
  { pattern: /\balineacio\w*\b/, key: 'alignment', confidence: 0.85, src: 'P41' },
  { pattern: /\buso\w*\b|\bactividad\w*\b/, key: 'permittedUse', confidence: 0.75, src: 'P41' },
  { pattern: /\bcoef\w*\b/, key: 'coefficient', confidence: 0.7, src: 'P42' },
];
