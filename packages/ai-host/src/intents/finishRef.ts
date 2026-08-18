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
];

/** Entries whose material id is absent from the master. Empty in a healthy build. */
export function finishRefIntegrityErrors(): string[] {
  return FINISH_ALIASES.filter((e) => !findMaterialRecord(e.id)).map((e) => e.id);
}

/** Alias -> finish, DERIVED from the master. First alias in each group is the canonical suggestion. */
const FINISHES: ReadonlyArray<{ aliases: readonly string[]; finish: ResolvedFinish }> =
  FINISH_ALIASES.flatMap((entry) => {
    const record = findMaterialRecord(entry.id);
    if (!record) return [];
    return [{
      aliases: entry.aliases,
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
  return partial.length === 1 ? partial[0]!.finish : null;
}

/** Canonical names for refusal copy (first alias of each group). */
export function exampleFinishNames(): string[] {
  return FINISHES.map((e) => e.aliases[0]!);
}
