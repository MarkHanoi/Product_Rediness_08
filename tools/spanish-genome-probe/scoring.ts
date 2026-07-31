/**
 * Spanish Planning Genome — layer & field scorer.
 *
 * Pure. No I/O. Everything it knows comes from `heuristics.ts`, whose tokens are
 * all provenance-tagged to sources that predate any València observation.
 *
 * The scorer answers two questions:
 *   1. Which layer in this catalogue is the ZONING layer?      → `scoreLayer`
 *   2. Which field on it carries the zone code?                → `classifyField`
 *
 * Both record WHICH heuristics fired, because "which heuristics transferred" is
 * the actual experimental result — the rank alone is not enough.
 */

import {
  FIELD_RULES,
  FIELD_SIGNAL_TOKENS,
  LAYER_NAME_NEGATIVE_TOKENS,
  LAYER_NAME_TOKENS,
  fold,
  type FieldRule,
  type HeuristicSource,
  type OntologyKey,
  type Token,
} from './heuristics.js';

export interface HeuristicHit {
  readonly token: string;
  readonly weight: number;
  readonly src: HeuristicSource;
  readonly where: 'service' | 'layer' | 'field';
  readonly matchedIn: string;
}

export interface LayerScore {
  readonly score: number;
  readonly hits: HeuristicHit[];
  readonly breakdown: {
    readonly serviceName: number;
    readonly layerName: number;
    readonly fieldSignals: number;
    readonly ontology: number;
    readonly geometry: number;
    readonly negatives: number;
  };
}

/**
 * CALIBRATION NOTE — §ONTOLOGY-BONUS, added during the Madrid calibration pass
 * on 2026-07-31, BEFORE any València request was issued (see the pre-registration
 * document, which was committed after this change and before the blind run).
 *
 * The first Madrid run ranked the true zoning layer
 * `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/0` at **#6 of 701** — a fail on
 * its own calibration city. Diagnosis: the scorer computed a field→ontology
 * classification and then *threw it away*, scoring layers on name tokens alone.
 * Madrid's zoning layer is defined by carrying `AMB_TX_ETIQ` + `AMB_TX_DENOM`;
 * the crude field-signal tokens (`zona`, `norma`, …) do not match those
 * abbreviations, so it scored 0 on field evidence while per-zone cartographic
 * slices named "Norma Zonal 1.5" scored 40 on name tokens alone.
 *
 * The fix is what founder module 3 / phase 42 actually specifies: a scored
 * field→ontology mapping feeding the layer decision. It is generic Spanish
 * morphology, contains no València token, and is fully described here so the
 * blind run cannot be accused of having been tuned to its target.
 */
const ONTOLOGY_WEIGHTS = {
  zoneCode: 25,
  officialDesignation: 15,
  /** Any distinct numeric planning parameter, +5, capped at PARAM_CAP. */
  param: 5,
  PARAM_CAP: 15,
  /** A field must classify at least this confidently to count. */
  MIN_CONFIDENCE: 0.7,
} as const;

const PARAM_KEYS: readonly OntologyKey[] = [
  'maxHeight',
  'maxFloors',
  'far',
  'coverage',
  'buildableDepth',
  'setback',
  'alignment',
  'coefficient',
  'planningAreaType',
];

export interface ScorableLayer {
  readonly serviceName: string;
  readonly layerName: string;
  readonly geometryType: string | null;
  readonly fields: { name: string; alias?: string }[];
}

function matchTokens(haystack: string, tokens: readonly Token[], where: HeuristicHit['where'], label: string): HeuristicHit[] {
  const h = fold(haystack);
  const out: HeuristicHit[] = [];
  for (const tk of tokens) {
    if (h.includes(tk.t)) out.push({ token: tk.t, weight: tk.w, src: tk.src, where, matchedIn: label });
  }
  return out;
}

/**
 * Score a layer's likelihood of being the zoning layer.
 *
 * Composition (all weights from `heuristics.ts`):
 *   + layer-name tokens                 (SEV/B11/P41/MAD)
 *   + service-name tokens, at half weight — a service name is weaker evidence
 *     than a layer name, because a whole planning service contains non-zoning
 *     layers (Madrid: PGOUM97 holds alignment, uses AND conditions layers).
 *   + distinct field-signal tokens, capped
 *   + polygon geometry bonus            (zoning is areal, per P41 "contains polygons")
 *   - negative tokens
 */
export function scoreLayer(layer: ScorableLayer): LayerScore {
  const hits: HeuristicHit[] = [];

  const layerHits = matchTokens(layer.layerName, LAYER_NAME_TOKENS, 'layer', layer.layerName);
  const layerName = layerHits.reduce((a, h) => a + h.weight, 0);
  hits.push(...layerHits);

  const svcRaw = matchTokens(layer.serviceName, LAYER_NAME_TOKENS, 'service', layer.serviceName);
  const svcHits = svcRaw.map((h) => ({ ...h, weight: Math.round(h.weight / 2) }));
  const serviceName = svcHits.reduce((a, h) => a + h.weight, 0);
  hits.push(...svcHits);

  // Field signals: count each DISTINCT token once, cap at 3 tokens so a
  // 60-column layer cannot swamp the name evidence.
  const fieldBlob = layer.fields.map((f) => `${f.name} ${f.alias ?? ''}`).join(' | ');
  const seen = new Set<string>();
  const fieldHits: HeuristicHit[] = [];
  for (const tk of FIELD_SIGNAL_TOKENS) {
    if (seen.has(tk.t)) continue;
    const f = fold(fieldBlob);
    if (f.includes(tk.t)) {
      seen.add(tk.t);
      fieldHits.push({ token: tk.t, weight: tk.w, src: tk.src, where: 'field', matchedIn: 'fields' });
    }
  }
  const cappedFieldHits = fieldHits.slice(0, 3);
  const fieldSignals = cappedFieldHits.reduce((a, h) => a + h.weight, 0);
  hits.push(...cappedFieldHits);

  // §ONTOLOGY-BONUS — founder module 3 / phase 42: the field→ontology mapping
  // is the primary evidence, not an afterthought.
  const classified = classifyFields(layer.fields);
  const strong = classified.filter((c) => c.key && c.confidence >= ONTOLOGY_WEIGHTS.MIN_CONFIDENCE);
  let ontology = 0;
  const zc = strong.find((c) => c.key === 'zoneCode');
  if (zc) {
    ontology += ONTOLOGY_WEIGHTS.zoneCode;
    hits.push({ token: `ontology:zoneCode<-${zc.field}`, weight: ONTOLOGY_WEIGHTS.zoneCode, src: zc.src!, where: 'field', matchedIn: zc.field });
  }
  const od = strong.find((c) => c.key === 'officialDesignation');
  if (od) {
    ontology += ONTOLOGY_WEIGHTS.officialDesignation;
    hits.push({ token: `ontology:officialDesignation<-${od.field}`, weight: ONTOLOGY_WEIGHTS.officialDesignation, src: od.src!, where: 'field', matchedIn: od.field });
  }
  const paramKeysFound = new Set(strong.map((c) => c.key!).filter((k) => PARAM_KEYS.includes(k)));
  const paramScore = Math.min(paramKeysFound.size * ONTOLOGY_WEIGHTS.param, ONTOLOGY_WEIGHTS.PARAM_CAP);
  if (paramScore > 0) {
    ontology += paramScore;
    hits.push({ token: `ontology:params[${[...paramKeysFound].join(',')}]`, weight: paramScore, src: 'P41', where: 'field', matchedIn: 'fields' });
  }

  const geometry = layer.geometryType === 'esriGeometryPolygon' ? 10 : 0;

  const negHits = [
    ...matchTokens(layer.layerName, LAYER_NAME_NEGATIVE_TOKENS, 'layer', layer.layerName),
    ...matchTokens(layer.serviceName, LAYER_NAME_NEGATIVE_TOKENS, 'service', layer.serviceName),
  ];
  const negatives = negHits.reduce((a, h) => a + h.weight, 0);
  hits.push(...negHits);

  return {
    score: layerName + serviceName + fieldSignals + ontology + geometry + negatives,
    hits,
    breakdown: { serviceName, layerName, fieldSignals, ontology, geometry, negatives },
  };
}

export interface RankedLayer<T extends ScorableLayer = ScorableLayer> {
  readonly rank: number;
  readonly layer: T;
  readonly score: LayerScore;
}

export function rankLayers<T extends ScorableLayer>(layers: readonly T[]): RankedLayer<T>[] {
  return layers
    .map((layer) => ({ layer, score: scoreLayer(layer) }))
    .sort((a, b) => b.score.score - a.score.score || a.layer.layerName.localeCompare(b.layer.layerName))
    .map((e, i) => ({ rank: i + 1, ...e }));
}

// ── Field semantics ──────────────────────────────────────────────────────────

export interface FieldClassification {
  readonly field: string;
  readonly alias: string;
  readonly key: OntologyKey | null;
  readonly confidence: number;
  readonly rule: string | null;
  readonly src: HeuristicSource | null;
}

/**
 * Classify one field name against the ontology.
 *
 * The field NAME is matched first (that is what P42's table is about). If the
 * name yields nothing, the ALIAS is tried at a 0.15 confidence penalty — ArcGIS
 * aliases are human-authored Spanish and frequently carry the semantics the
 * cryptic column name hides. This mirrors P42's own observation that
 * "AMB_TX_ETIQ means Zone Code, not Text Label".
 */
export function classifyField(name: string, alias = ''): FieldClassification {
  const n = fold(name);
  const a = fold(alias);
  const tryOne = (s: string, penalty: number): { r: FieldRule; c: number } | null => {
    if (!s) return null;
    for (const r of FIELD_RULES) {
      if (r.pattern.test(s)) return { r, c: Math.max(0, r.confidence - penalty) };
    }
    return null;
  };
  const hit = tryOne(n, 0) ?? tryOne(a, 0.15);
  if (!hit) return { field: name, alias, key: null, confidence: 0, rule: null, src: null };
  return { field: name, alias, key: hit.r.key, confidence: Number(hit.c.toFixed(2)), rule: String(hit.r.pattern), src: hit.r.src };
}

export function classifyFields(fields: readonly { name: string; alias?: string }[]): FieldClassification[] {
  return fields.map((f) => classifyField(f.name, f.alias ?? ''));
}

/** Best candidate for a given ontology key on a layer. */
export function bestFieldFor(
  fields: readonly { name: string; alias?: string }[],
  key: OntologyKey,
): FieldClassification | null {
  const cands = classifyFields(fields).filter((c) => c.key === key);
  if (cands.length === 0) return null;
  return cands.sort((x, y) => y.confidence - x.confidence)[0]!;
}
