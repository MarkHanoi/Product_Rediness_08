/**
 * Role-aware layer scoring.
 *
 * ⚠ POST-HOC — see the honesty header in `roles.ts`. This was added after the
 * blind València run. It never replaces the blind single-score result.
 *
 * Instead of one "planning-ness" ranking, produce **one ranking per role**, so
 * `NORMAS_ZONALES` can be #1 for `zone-routing` and `PG_ORDENACION/3` #1 for
 * `derived-plan` simultaneously — which is how the engine actually consumes them.
 */

import { LAYER_NAME_NEGATIVE_TOKENS, fold, type HeuristicSource, type Token } from './heuristics.js';
import { classifyFields, type ScorableLayer } from './scoring.js';
import { PLANNING_CONTEXT_TOKENS, ROLE_PROFILES, type LayerRole, type RoleProfile } from './roles.js';

const MIN_CONFIDENCE = 0.7;
/** Applied once when a role requires a planning context and none is present. */
const NO_CONTEXT_PENALTY = -30;

export interface RoleHit {
  readonly token: string;
  readonly weight: number;
  readonly src: HeuristicSource;
  readonly where: 'layer' | 'service' | 'field' | 'context' | 'geometry';
}

export interface RoleScore {
  readonly role: LayerRole;
  readonly score: number;
  readonly hits: RoleHit[];
  readonly hasPlanningContext: boolean;
}

function tokenHits(haystack: string, tokens: readonly Token[], where: 'layer' | 'service', halve: boolean): RoleHit[] {
  const h = fold(haystack);
  const out: RoleHit[] = [];
  for (const tk of tokens) {
    if (h.includes(tk.t)) {
      out.push({ token: tk.t, weight: halve ? Math.round(tk.w / 2) : tk.w, src: tk.src, where });
    }
  }
  return out;
}

export function scoreLayerForRole(layer: ScorableLayer, profile: RoleProfile): RoleScore {
  const hits: RoleHit[] = [];

  hits.push(...tokenHits(layer.layerName, profile.nameTokens, 'layer', false));
  hits.push(...tokenHits(layer.serviceName, profile.nameTokens, 'service', true));
  hits.push(...tokenHits(layer.layerName, profile.negativeTokens, 'layer', false));
  hits.push(...tokenHits(layer.serviceName, profile.negativeTokens, 'service', true));
  // Global non-planning demotions (Madrid-derived) apply to every role.
  hits.push(...tokenHits(layer.layerName, LAYER_NAME_NEGATIVE_TOKENS, 'layer', false));
  hits.push(...tokenHits(layer.serviceName, LAYER_NAME_NEGATIVE_TOKENS, 'service', true));

  const classified = classifyFields(layer.fields).filter((c) => c.key && c.confidence >= MIN_CONFIDENCE);
  const seenKeys = new Set<string>();
  for (const c of classified) {
    const w = profile.ontology[c.key!];
    if (!w || seenKeys.has(c.key!)) continue;
    seenKeys.add(c.key!);
    hits.push({ token: `${c.key}<-${c.field}`, weight: w, src: c.src!, where: 'field' });
  }

  if (profile.wantsGeometry !== 'any') {
    const want = profile.wantsGeometry === 'polygon' ? 'esriGeometryPolygon' : 'esriGeometryPolyline';
    if (layer.geometryType === want) hits.push({ token: `geom:${profile.wantsGeometry}`, weight: 10, src: 'P41', where: 'geometry' });
  }

  const contextBlob = fold(`${layer.serviceName} ${layer.layerName}`);
  const hasPlanningContext = PLANNING_CONTEXT_TOKENS.some((t) => contextBlob.includes(t));
  if (profile.requiresPlanningContext && !hasPlanningContext) {
    hits.push({ token: 'no-planning-context', weight: NO_CONTEXT_PENALTY, src: 'MAD', where: 'context' });
  }

  return {
    role: profile.role,
    score: hits.reduce((a, h) => a + h.weight, 0),
    hits,
    hasPlanningContext,
  };
}

export interface RoleRanked<T extends ScorableLayer> {
  readonly rank: number;
  readonly layer: T;
  readonly score: RoleScore;
}

export function rankLayersByRole<T extends ScorableLayer>(
  layers: readonly T[],
): Record<LayerRole, RoleRanked<T>[]> {
  const out = {} as Record<LayerRole, RoleRanked<T>[]>;
  for (const profile of ROLE_PROFILES) {
    out[profile.role] = layers
      .map((layer) => ({ layer, score: scoreLayerForRole(layer, profile) }))
      .sort((a, b) => b.score.score - a.score.score || a.layer.layerName.localeCompare(b.layer.layerName))
      .map((e, i) => ({ rank: i + 1, ...e }));
  }
  return out;
}

/** The single best-scoring layer per role, or null when nothing scores positively. */
export function bestPerRole<T extends ScorableLayer>(
  layers: readonly T[],
): Record<LayerRole, RoleRanked<T> | null> {
  const ranked = rankLayersByRole(layers);
  const out = {} as Record<LayerRole, RoleRanked<T> | null>;
  for (const profile of ROLE_PROFILES) {
    const top = ranked[profile.role][0] ?? null;
    // Refuse rather than guess: a non-positive top score means "not found here".
    out[profile.role] = top && top.score.score > 0 ? top : null;
  }
  return out;
}
