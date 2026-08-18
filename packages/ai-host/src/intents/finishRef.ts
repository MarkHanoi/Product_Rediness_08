// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315) — the ONE finish-name table.
//
// The exact colorRef.ts pattern one file over: the chat resolver owns the
// LANGUAGE ("plaster", "paint") and hands the command RESOLVED values
// ({name, materialColor, materialId}); `AddWallLayerBatchCommand` deliberately
// owns no name table, so there is exactly one name-to-finish site.
//
// --- C85 section 4.4 / ADR-0333: the hexes are DERIVED now, not transcribed ---
// This file used to carry `materialColor` and `name` for all 15 finishes,
// transcribed by hand from the master library, under a header that instructed
// future authors: "If the library recolours a finish, update the hex here in the
// same commit." A maintenance obligation written in a comment is the weakest
// possible gate - it is drift with a due date.
//
// The reason it was transcribed was real, and it is now GONE: the master used to
// build `THREE.Color` at module load, so a pure resolver could not import it. The
// data has moved to `@pryzm/schemas/materials` (L0, plain scalars), so this file
// reads the master directly and stays exactly as pure as before - no THREE, no
// DOM, no stores. What remains local is the ALIASES, which is correct: the
// language belongs to the resolver, the values belong to the master (C68 5.d).
//
// PURE - no I/O, no stores; safe for tier-0 and the NL layer.

import { findMaterialRecord } from '@pryzm/schemas/materials';

export interface ResolvedFinish {
  /** Display name for the layer row (the library's label). */
  readonly name: string;
  /** '#rrggbb' - what WallFragmentBuilder actually renders. */
  readonly materialColor: string;
  /** The material library id, kept on the layer for the inspector. */
  readonly materialId: string;
}

/**
 * Alias -> master material id. THE ONLY hand-maintained column left.
 *
 * An id here that names nothing in the master is a BUG, not a fallback: the entry
 * is dropped and {@link finishRefIntegrityErrors} reports it by name. Silently
 * resolving it to a plausible colour is the NO-EMPTY-MEANS-UNKNOWN failure this
 * contract exists to remove (C85 section 5).
 */
const FINISH_ALIASES: ReadonlyArray<{ readonly id: string; readonly aliases: readonly string[] }> = [
  { id: 'gypsum-skim', aliases: ['plaster', 'skim', 'skim coat', 'plaster skim'] },
  { id: 'gypsum-plasterboard', aliases: ['plasterboard', 'drywall', 'gypsum', 'gypsum board', 'sheetrock'] },
  { id: 'gypsum-acoustic', aliases: ['acoustic plasterboard', 'acoustic board'] },
  { id: 'gypsum-venetian', aliases: ['venetian plaster', 'polished plaster'] },
  { id: 'plaster-clay-natural', aliases: ['clay plaster', 'clay', 'natural clay'] },
  { id: 'plaster-tadelakt', aliases: ['tadelakt'] },
  { id: 'gypsum-fire-rated-pink', aliases: ['fire rated plasterboard', 'fire board', 'fire rated'] },
  { id: 'gypsum-moisture-green', aliases: ['moisture resistant plasterboard', 'moisture board', 'green board'] },
  { id: 'paint-matte-white', aliases: ['paint', 'matte white paint', 'white paint'] },
  { id: 'paint-eggshell-warm', aliases: ['eggshell paint', 'warm eggshell'] },
  { id: 'paint-satin-charcoal', aliases: ['charcoal paint', 'satin charcoal', 'dark paint'] },
  { id: 'paint-limewash-cream', aliases: ['limewash', 'limewash cream', 'lime wash'] },
  { id: 'paint-microcement-warm-grey', aliases: ['microcement', 'micro cement'] },
  { id: 'insulation-cellulose', aliases: ['cellulose insulation', 'blown cellulose'] },
  { id: 'insulation-wood-fibre', aliases: ['wood fibre insulation', 'wood fiber insulation', 'wood fibre'] },

  // ─── §L960-WOOD-IS-A-SURFACE (founder, 2026-08-18) ─────────────────────────
  // He typed *"make all inner finishes walls on the ground floor to wood"* and was
  // told the walls were now `Insulation · Wood Fibre Board`. The mechanism, exactly:
  // 'wood' matched no alias, fell to the substring arm, and the ONLY aliases
  // containing it were the three on `insulation-wood-fibre` — one group, so
  // `partial.length === 1` and the resolver returned it as an unambiguous hit.
  //
  // It was not an ambiguity bug. It was an ABSENCE: the master carries 21 visible
  // WOOD and TIMBER ENGINEERED surfaces and this table listed none of them, so the
  // buried insulation product was the only thing in the room that could answer. The
  // fix is therefore to ADD the surfaces (plus the category guard below for when a
  // future word straddles both), not to narrow the matcher.
  { id: 'wood-oak', aliases: ['wood', 'oak', 'timber', 'wood oak', 'oak wood', 'light oak'] },
  { id: 'wood-walnut', aliases: ['walnut', 'dark wood', 'walnut wood'] },
  { id: 'wood-pine', aliases: ['pine', 'pine wood'] },
  { id: 'wood-birch', aliases: ['birch', 'birch wood'] },
  { id: 'wood-teak', aliases: ['teak'] },
  { id: 'wood-ash', aliases: ['ash', 'ash wood'] },
  { id: 'wood-maple', aliases: ['maple'] },
  { id: 'wood-cherry', aliases: ['cherry'] },
  { id: 'wood-mahogany', aliases: ['mahogany'] },
  { id: 'wood-ebony', aliases: ['ebony'] },
  { id: 'wood-cedar-red', aliases: ['cedar', 'red cedar'] },
  { id: 'wood-oak-smoked', aliases: ['smoked oak'] },
  // 'white oak' is deliberately NOT an alias here: it is a different species from
  // whitewashed oak, and it would widen the 'white' collision below for no gain.
  { id: 'wood-oak-whitewashed', aliases: ['whitewashed oak'] },
  { id: 'wood-reclaimed', aliases: ['reclaimed wood', 'weathered wood'] },
  { id: 'wood-painted-white', aliases: ['painted wood', 'white painted wood'] },
  { id: 'wood-charred-shou-sugi-ban', aliases: ['charred wood', 'shou sugi ban', 'charred timber'] },
  { id: 'wood-thermowood', aliases: ['thermowood', 'thermally modified wood'] },
  { id: 'timber-veneer-oak', aliases: ['oak veneer', 'veneer', 'timber veneer', 'veneer panel'] },
  { id: 'timber-plywood', aliases: ['plywood', 'birch ply', 'ply'] },
  { id: 'timber-clt', aliases: ['clt', 'cross laminated timber'] },
  { id: 'timber-glulam', aliases: ['glulam', 'glued laminated timber'] },
  { id: 'timber-bamboo', aliases: ['bamboo'] },
  { id: 'timber-osb', aliases: ['osb', 'oriented strand board'] },
  { id: 'timber-mdf', aliases: ['mdf'] },
];

/**
 * §L960-WOOD-IS-A-SURFACE — categories that are BURIED inside the construction and
 * are never the visible face of a wall.
 *
 * A wall FINISH is by definition a visible surface, so when a bare word matches both
 * a visible-surface row and a concealed one, the concealed one is not a candidate —
 * it is the wrong KIND of answer, regardless of how well the letters line up. This
 * is the "category + visible-surface suitability" the substring arm was missing.
 *
 * ⚠ It filters CANDIDATES, it does not delete vocabulary: `'wood fibre insulation'`
 * still resolves, because an EXACT alias is a request for that product BY NAME and
 * is never overruled here. A user who asks for insulation gets insulation; a user who
 * asks for "wood" gets wood.
 */
const CONCEALED_CATEGORIES: ReadonlySet<string> = new Set([
  'Insulation',
  'Membrane & Waterproofing',
]);

/** Entries whose material id is absent from the master. Empty in a healthy build. */
export function finishRefIntegrityErrors(): string[] {
  return FINISH_ALIASES.filter((e) => !findMaterialRecord(e.id)).map((e) => e.id);
}

/** Alias -> finish, DERIVED from the master. First alias in each group is the canonical suggestion. */
const FINISHES: ReadonlyArray<{ aliases: readonly string[]; category: string; finish: ResolvedFinish }> =
  FINISH_ALIASES.flatMap((entry) => {
    const record = findMaterialRecord(entry.id);
    if (!record) return [];
    return [{
      aliases: entry.aliases,
      // Carried from the master, never restated here — it is what makes the
      // visible-surface guard a property of the CATALOGUE and not of this table.
      category: record.category,
      finish: { name: record.label, materialColor: record.color, materialId: record.id },
    }];
  });

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Resolve a finish reference ("plaster", "limewash") to the library values.
 * Exact alias first, then unique-substring (ambiguity ⇒ null, never a
 * coin-flip — same ruling as resolveCatalogueRef). Returns null on a miss;
 * callers refuse by LISTING real options via {@link exampleFinishNames}.
 */
export function resolveFinishRef(ref: string): ResolvedFinish | null {
  const n = normalize(ref);
  if (n.length === 0) return null;
  for (const entry of FINISHES) {
    if (entry.aliases.some((a) => a === n)) return entry.finish;
  }
  // Substring matching needs ≥4 chars — short scope/stop words otherwise hit
  // inside longer aliases ("all" inside "drywall" was the live false positive).
  if (n.length < 4) return null;
  const partial = FINISHES.filter((e) => e.aliases.some((a) => a.includes(n) || n.includes(a)));
  // §L960-WOOD-IS-A-SURFACE — a finish is a VISIBLE face, so a buried product is
  // not a candidate for a loose match while a real surface also matches. When only
  // concealed rows match, they stay the answer (nothing else was asked for), so this
  // narrows the coin-flip rather than removing vocabulary.
  const visible = partial.filter((e) => !CONCEALED_CATEGORIES.has(e.category));
  const pool = visible.length > 0 ? visible : partial;
  return pool.length === 1 ? pool[0]!.finish : null;
}

/** Canonical names for refusal copy (first alias of each group). */
export function exampleFinishNames(): string[] {
  return FINISHES.map((e) => e.aliases[0]!);
}
