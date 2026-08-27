// @pryzm/ai-host — QualifierAxes (§CHAT-AXIS-AWARE-REFUSAL, L-10942)
// =============================================================================
//
// ⭐⭐ THIS MODULE IS THE ACTUAL FIX. The two founder refusals this lane was
// opened for are ONE defect with two faces:
//
//   "change all windows to segmental type"
//     → "There is no window type called 'segmental type' in this project.
//        The window types here are: Single Pane (Default), Timber Casement, …"
//
//   "Make all windows in the south facade 0.1m sill, 3m high, 1.5m wide"
//     → "I can't find a room 'south'. The rooms here are: 00-001 (Room 00-001)."
//
// Both are CONFIDENT, both are FALSE, and both fail the same way: **the
// resolver picks ONE axis, fails to find the token on it, and then reports that
// axis's inventory as if it were the entire vocabulary.** "Segmental" was
// matched against window TYPES; it is a SHAPE. "South" was matched against ROOM
// NAMES; it is an ORIENTATION. Neither refusal was wrong about what it looked
// at. Both were wrong about what looking there PROVED.
//
// ── WHY THAT IS WORSE THAN SAYING NOTHING ───────────────────────────────────
//
// C74 requires a refusal to name what it MEASURED and what it NEEDED. These
// name what they measured and then imply it was exhaustive. A user who reads
// "there is no segmental" concludes the product cannot make a segmental arch —
// and it has been able to since L-1200. The founder's own words about that
// capability were *"via UI is possible"*. A refusal that talks a user out of a
// shipped feature costs more than a miss, and this is the same class the
// register calls out in `[[bulk-vs-query-endpoint-false-refusals]]`: nine of
// fourteen "blockers" were refusals about the WRONG PRODUCT.
//
// ── WHAT SHIPS: THE AXIS SET AS DATA ────────────────────────────────────────
//
// An unmatched qualifier is tried against EVERY MODELLED AXIS before anything
// refuses, and the refusal then states WHICH AXES WERE SEARCHED. ⛔ The axis
// set is a TABLE, not a chain of `if`s, and that is the load-bearing decision:
// this defect is the fourth of its shape in this package (a hand-maintained
// list that must be REMEMBERED rather than DERIVED — see `SpatialScopeTail`'s
// header for the previous three), and the only thing that stops a fifth is that
// adding an axis costs one row here and zero lines at every refusal site.
//
// ── ⛔ THIS MODULE NEVER RESOLVES A SENTENCE ────────────────────────────────
//
// It answers exactly one question — *"which modelled axis, if any, claims this
// token?"* — and it answers it for REFUSAL COPY and for redirect suggestions.
// It does not parse, does not scope and does not dispatch. The grammars still
// own claiming; making this module a second claiming path would be the rival
// primitive C16 forbids, and would put two answers behind one sentence.
//
// PURE — tables and the injected `ResolverContext`. No DOM, no stores, no I/O.

import { resolveColorRef } from './colorRef.js';
import { resolveOpeningShapeRef, openingShapeNames, joinNames } from './OpeningShapeVocabulary.js';
import { resolveCompassRef } from './SpatialScopeTail.js';
import { resolveFinishRef } from './finishRef.js';
import type { ResolverContext } from './ZeroTokenResolver.js';

/** The modelled axes, as identifiers. A refusal cites these by `noun`. */
export type QualifierAxisId =
  | 'type'
  | 'shape'
  | 'orientation'
  | 'level'
  | 'room'
  | 'colour'
  | 'finish';

/** What an axis found, and — the part that makes a refusal useful — HOW THE
 *  USER SHOULD HAVE SAID IT. A refusal that names the right axis but not the
 *  right sentence leaves the user exactly as stuck. */
export interface AxisHit {
  readonly axis: QualifierAxisId;
  /** The axis as a noun phrase: "opening shapes", "compass orientations". */
  readonly axisNoun: string;
  /** The canonical value the token resolved to, in the axis's own words. */
  readonly value: string;
  /** A sentence that WOULD work, built for this element kind. */
  readonly sayIt: (elementKind: string) => string;
}

/** One modelled axis, as data. */
export interface QualifierAxis {
  readonly id: QualifierAxisId;
  readonly noun: string;
  /** Which element kinds carry this axis at all. Absent ⇒ every kind. The
   *  SHAPE axis is hosted-openings-only; declaring that here is what keeps the
   *  refusal for a WALL from offering a shape a wall cannot have. */
  readonly appliesTo?: readonly string[];
  /** Resolve the token on this axis, or null. Never throws; an axis whose
   *  data source is absent returns null and is reported as NOT SEARCHED. */
  readonly probe: (token: string, ctx: ResolverContext | undefined) => Omit<AxisHit, 'axis' | 'axisNoun'> | null;
  /** False when the axis's data source is missing from this context, so the
   *  refusal can say "I could not search the levels here" instead of implying
   *  it did. §CONTEXT-DATA-HONESTY: failure and empty are different values. */
  readonly searchable: (ctx: ResolverContext | undefined) => boolean;
}

/** Element kinds that carry an opening profile — geometry-wall's own split. */
const OPENING_KINDS = ['window', 'door'] as const;

/** Strip the determiners and the axis nouns a user hangs on any qualifier, so
 *  every axis probe sees the same token. ⛔ Shared, never per-axis: two
 *  normalisers is how "segmental type" reaches one axis and "segmental" the
 *  other. */
function bareToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:a|an|the|all|every|each|selected|these|those|this)\s+/g, '')
    .trim();
}

/**
 * ⭐ THE AXIS TABLE. Adding an axis is one row. Every refusal site that calls
 * `probeQualifierAxes` gains it with no edit — which is the whole reason this
 * is a table.
 */
export const QUALIFIER_AXES: readonly QualifierAxis[] = [
  {
    id: 'shape',
    noun: 'opening shapes',
    appliesTo: OPENING_KINDS,
    searchable: () => true, // a closed enum from geometry-wall; always readable.
    probe: (token) => {
      const hit = resolveOpeningShapeRef(token);
      return hit === null ? null : {
        value: hit.label,
        sayIt: (kind) => `change all ${kind}s to ${hit.label.toLowerCase()}`,
      };
    },
  },
  {
    id: 'orientation',
    noun: 'compass orientations',
    searchable: () => true, // a closed four-point vocabulary; always readable.
    probe: (token) => {
      const c = resolveCompassRef(token);
      if (c === null) return null;
      const word = ({ N: 'north', E: 'east', S: 'south', W: 'west' } as const)[c];
      return {
        value: `${word}-facing`,
        sayIt: (kind) => `change all ${kind}s in the ${word} facade …`,
      };
    },
  },
  {
    id: 'colour',
    noun: 'colours',
    searchable: () => true, // the bounded name table plus hex passthrough.
    probe: (token) => {
      const hit = resolveColorRef(token);
      return hit === null ? null : {
        value: hit.label,
        sayIt: (kind) => `paint all ${kind}s ${hit.label}`,
      };
    },
  },
  // §RACSIDE144 (L-12364) — the MATERIAL axis, added because its absence was a
  // second, independent instance of THIS MODULE'S OWN founding defect.
  //
  // Founder-reported: "make all walls white paint" answered *"There is no wall
  // type called 'white paint' in this project… I searched compass
  // orientations, colours, levels, rooms or wall types."* That sentence is
  // built from `axesSearched()` below — and it is TRUE about what ran, and
  // FALSE about what it implies: "white paint" resolves cleanly to `Paint ·
  // Matte White` in `finishRef.ts`'s own catalogue, which this table never
  // tried. `set-wall-type`'s refusal named five axes and the one that would
  // have answered was not among them — the exact "picked ONE axis, reported
  // its inventory as the whole vocabulary" shape this module's header opens
  // with, just one capability over.
  //
  // `appliesTo` is `['wall', 'floor']` — the two element kinds with a live
  // finish capability (`set-wall-side-finish`, `set-floor-finish`); a finish
  // axis on a door refusal would offer a redirect no door capability honours.
  {
    id: 'finish',
    noun: 'finishes',
    appliesTo: ['wall', 'floor'],
    searchable: () => true, // the alias table + full C100 catalogue, always readable.
    probe: (token) => {
      const hit = resolveFinishRef(token);
      // `resolveFinishRef` returns null for BOTH "no match" and "ambiguous,
      // several rows" (§CONTEXT-DATA-HONESTY: neither is guessed past here).
      // The ambiguous case is not lost — it still reaches the finish
      // CAPABILITY'S OWN refusal (`finishRefusalCopy`, which lists the real
      // candidates) whenever the sentence carries the word "finish" or a side
      // word; this axis only needs to redirect the CLEAN, unambiguous case.
      return hit === null ? null : {
        value: hit.name,
        sayIt: (kind) => `change all ${kind}s finish to ${hit.name.toLowerCase()}`,
      };
    },
  },
  {
    id: 'level',
    noun: 'levels',
    searchable: (ctx) => (ctx?.levels?.length ?? 0) > 0,
    probe: (token, ctx) => {
      const want = bareToken(token);
      const hit = (ctx?.levels ?? []).find((l) => l.name.trim().toLowerCase() === want);
      return hit === undefined ? null : {
        value: hit.name,
        sayIt: (kind) => `change all ${kind}s on ${hit.name} …`,
      };
    },
  },
  {
    id: 'room',
    noun: 'rooms',
    // ⚠ ABSENT rooms means UNREADABLE, not "no rooms". The flag says so and
    // the refusal copy then declines to claim it searched them.
    searchable: (ctx) => ctx?.rooms !== undefined,
    probe: (token, ctx) => {
      const want = bareToken(token);
      const hit = (ctx?.rooms ?? []).find((r) =>
        (r.name ?? '').trim().toLowerCase() === want
        || (r.roomNumber ?? '').trim().toLowerCase() === want);
      if (hit === undefined) return null;
      const label = (hit.roomNumber ?? '').trim().length > 0 ? hit.roomNumber!.trim() : (hit.name ?? hit.id);
      return {
        value: label,
        sayIt: (kind) => `change all ${kind}s in ${label} …`,
      };
    },
  },
  {
    id: 'type',
    noun: 'types',
    // The catalogue channel is INJECTED. Absent ⇒ this axis was not searched,
    // and the copy must not pretend otherwise.
    searchable: (ctx) => ctx !== undefined && (
      ctx.catalogues !== undefined
      || ctx.resolveWallSystemType !== undefined
      || ctx.resolveWindowSystemType !== undefined
      || ctx.resolveDoorSystemType !== undefined),
    probe: (token, ctx) => {
      if (ctx === undefined) return null;
      const ref = bareToken(token);
      const tryLookup = (fn: ((r: string) => { id: string; name: string } | null) | undefined):
        { id: string; name: string } | null => (fn === undefined ? null : fn(ref));
      const catalogueHit = ctx.catalogues === undefined
        ? null
        : Object.values(ctx.catalogues)
            .map((c) => c.resolve(ref))
            .find((h): h is { id: string; name: string } => h !== null) ?? null;
      const hit = catalogueHit
        ?? tryLookup(ctx.resolveWindowSystemType)
        ?? tryLookup(ctx.resolveDoorSystemType)
        ?? tryLookup(ctx.resolveWallSystemType);
      return hit === null ? null : {
        value: hit.name,
        sayIt: (kind) => `change all ${kind}s to ${hit.name.toLowerCase()}`,
      };
    },
  },
];

/** The axes that apply to a given element kind. */
export function axesFor(elementKind: string): readonly QualifierAxis[] {
  return QUALIFIER_AXES.filter(
    (a) => a.appliesTo === undefined || a.appliesTo.includes(elementKind),
  );
}

/**
 * ⭐ Try the token against EVERY modelled axis. Returns every axis that claims
 * it, in table order — plural on purpose: a token two axes both claim is a
 * genuine ambiguity the copy should show, not one the resolver should silently
 * pick a winner for.
 *
 * `exclude` drops the axis the caller has ALREADY searched and failed on, so
 * the redirect never says "did you mean a window type?" to someone who just
 * failed to name a window type.
 */
export function probeQualifierAxes(
  token: string,
  elementKind: string,
  ctx: ResolverContext | undefined,
  exclude: readonly QualifierAxisId[] = [],
): readonly AxisHit[] {
  const bare = bareToken(token);
  if (bare.length === 0) return [];
  const out: AxisHit[] = [];
  for (const axis of axesFor(elementKind)) {
    if (exclude.includes(axis.id)) continue;
    if (!axis.searchable(ctx)) continue;
    let hit: Omit<AxisHit, 'axis' | 'axisNoun'> | null = null;
    try {
      hit = axis.probe(bare, ctx);
    } catch {
      // An axis whose probe throws is an axis that was NOT searched. Swallowing
      // the throw and reporting "not found" would be the same lie one layer
      // down; it is simply omitted from `out` AND from `axesSearched`.
      continue;
    }
    if (hit !== null) out.push({ axis: axis.id, axisNoun: axis.noun, ...hit });
  }
  return out;
}

/**
 * The axis nouns a refusal may HONESTLY claim to have searched — the ones whose
 * data source is present in this context. An axis with no source is omitted,
 * because "I searched the rooms and found nothing" over an absent room list is
 * the §CONTEXT-DATA-HONESTY failure (failure and empty are the same value only
 * to a caller that never distinguishes them).
 */
export function axesSearched(
  elementKind: string,
  ctx: ResolverContext | undefined,
  exclude: readonly QualifierAxisId[] = [],
  /** The noun the TYPE axis speaks for this capability ("window types"). */
  typeNoun?: string,
): readonly string[] {
  return axesFor(elementKind)
    .filter((a) => !exclude.includes(a.id) && a.searchable(ctx))
    .map((a) => (a.id === 'type' && typeNoun !== undefined ? typeNoun : a.noun));
}

/**
 * ⭐ THE REFUSAL TAIL — the sentence that turns "there is no X" from a false
 * claim about the language into a true claim about a search.
 *
 * Two shapes, and the difference is the whole point:
 *
 *   • ANOTHER AXIS CLAIMS IT ⇒ say which axis, and give the sentence that
 *     works. This is the founder's "segmental" case, and the answer is a
 *     REDIRECT, not a refusal.
 *   • NOTHING CLAIMS IT ⇒ the refusal stands, but it now states which axes were
 *     searched, so the user learns the shape of the vocabulary instead of being
 *     told one list is all of it.
 */
export function unmatchedQualifierTail(
  token: string,
  elementKind: string,
  ctx: ResolverContext | undefined,
  opts: {
    /** The axis the caller already searched — never re-offered. */
    readonly searchedAxis: QualifierAxisId;
    /** How the caller names its own axis ("window type"). */
    readonly searchedNoun: string;
  },
): { readonly tail: string; readonly redirects: readonly AxisHit[] } {
  const exclude = [opts.searchedAxis];
  const hits = probeQualifierAxes(token, elementKind, ctx, exclude);
  if (hits.length > 0) {
    const first = hits[0]!;
    const alsoTail = hits.length === 1
      ? ''
      : ` (It also reads as ${joinNames(hits.slice(1).map((h) => `${h.value} on the ${h.axisNoun} axis`))}.)`;
    return {
      tail:
        ` — but "${token}" IS a ${singularAxisNoun(first.axisNoun)}: ${first.value}. ` +
        `That is a different property from the ${opts.searchedNoun}, and I can set it. ` +
        `Say "${first.sayIt(elementKind)}".${alsoTail}`,
      redirects: hits,
    };
  }
  const searched = axesSearched(elementKind, ctx, [], opts.searchedNoun ? `${opts.searchedNoun}s` : undefined);
  return {
    tail: searched.length === 0
      ? ''
      : ` I searched ${joinNames([...searched])} — "${token}" is on none of them.`,
    redirects: [],
  };
}

/** "opening shapes" → "opening shape". Refusal copy speaks one value. */
function singularAxisNoun(noun: string): string {
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}

/**
 * The SHAPE axis's own inventory, for a refusal that has to list it. Kept here
 * rather than re-derived at each site so the copy cannot drift.
 */
export function shapeAxisInventory(elementKind: string): string | null {
  if (!(OPENING_KINDS as readonly string[]).includes(elementKind)) return null;
  return joinNames(openingShapeNames(elementKind as 'door' | 'window'));
}
