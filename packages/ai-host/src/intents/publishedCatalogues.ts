// @pryzm/ai-host — publishedCatalogues (§FEAT-CHAT-STAIR-TYPES, L-1441)
// =============================================================================
//
// ⭐ THE CATALOGUE CHANNEL HAS TWO ROWS AND THE PRODUCT HAS SIXTEEN FAMILIES.
//
// Every catalogue family resolves its type reference through
// `ResolverContext.catalogues[kind]`, injected by the editor bridge. Measured
// 2026-08-20, `buildCatalogueChannel` (apps/editor ZeroTokenChatBridge.ts:923)
// injects exactly TWO rows — `slab` and `ceiling` — while `element.changeType`
// routes SIXTEEN families. A family whose row is missing gets
// `lookup === null`, and the generated spec then forwards the RAW user string
// to the command.
//
// For slab and ceiling that degradation is safe, because their batch commands
// run `resolveCatalogueRef` themselves and refuse by listing real names. **For
// STAIR it is not.** `UpdateStairParametersCommand` writes `updates.typeId`
// straight onto the record (line 135) and then asks
// `stairTypeStore.resolveDefaults(typeId)` for defaults — an unrecognised id
// simply yields no defaults. So forwarding "steel open riser" as if it were an
// id would stamp a garbage type on every stair in the project and report
// success. That is the §CONTEXT-DATA-HONESTY failure in its worst form: a
// confident summary over a write nobody validated.
//
// ── THE ANSWER, AND WHY IT IS NOT A HARD-CODED LIST ─────────────────────────
//
// This module reads the PUBLISHED L2 type tables that `@pryzm/ai-host` already
// depends on, and derives the `{id, name}` lookup from them:
//
//   • `BUILT_IN_STAIR_TYPES` (@pryzm/geometry-stair) — the same array
//     `StairTypeStore` is constructed from, and the same one
//     `resolveDefaults()` reads.
//   • `handrailTypeStore`    (@pryzm/core-app-model/stores) — the same LIVE
//     singleton `initBusHandlers`' `stair-railing` branch calls
//     `getById()` on before it will accept a type at all
//     (initBusHandlers.ts:1922). If this module resolves a name to an id, that
//     branch is guaranteed to accept it, because it is the same object.
//
// ⛔ NOTHING IS TRANSCRIBED. No type name and no id is typed out in this file.
// This is the `BEAM_CONSTRAINTS` precedent from `PropertyVocabulary` —
// *"the published bound set, never re-typed: one policy, one place"* — applied
// to a type table instead of a bound table.
//
// ── THE HONEST LIMIT, STATED IN USER-VISIBLE COPY ───────────────────────────
//
// `BUILT_IN_STAIR_TYPES` is exactly what its name says: the BUILT-INS. A stair
// type a user authored in this project lives on the project's own
// `StairTypeStore` INSTANCE, which is an editor-side object this pure module
// cannot reach. So a custom stair type will not resolve from chat until the
// bridge grows its row.
//
// ⭐ That limit does not hide. `CatalogueLookup.note` carries it and the
// generated refusal prints it, so a user whose custom type misses is TOLD why
// rather than being told their type does not exist. **An honest limit the user
// can see beats a silent miss** — and it is also the reason this is a stopgap
// with a named exit (the apps/editor catalogue-channel row), not a design.
//
// Handrails have no such limit: `handrailTypeStore` IS the live singleton, so
// user-authored railing types are visible here (`getAll()` returns built-ins
// and customs alike).
//
// ── PURITY ──────────────────────────────────────────────────────────────────
//
// No DOM, no I/O, no commands. Two READ-ONLY imports of published L2 type
// tables — the same discipline `PropertyVocabulary` already established when it
// imported `BEAM_CONSTRAINTS` rather than re-typing the numbers.

import { BUILT_IN_STAIR_TYPES } from '@pryzm/geometry-stair';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import type { CatalogueLookup } from './CatalogueFamilies.js';

/** Normalize a reference for comparison: case, punctuation and the hyphen/space
 *  difference all collapse, so "Steel Open Riser", "steel-open" and
 *  "steel open riser" reach the same entry.
 *
 *  ⭐ This is deliberately the FORGIVING half of `resolveCatalogueRef`'s ladder
 *  and NOT a rival to it: exact id → exact name → normalized name, in that
 *  order, and it never guesses beyond that. The real ladder is editor-side and
 *  takes over the moment the bridge injects a row for these kinds. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Build a `{id, name}` lookup from a published table. */
function lookupOver(
  entries: readonly { readonly id: string; readonly name: string }[],
  note?: string,
): CatalogueLookup | null {
  if (entries.length === 0) return null;
  const byId = new Map(entries.map((e) => [e.id.toLowerCase(), e]));
  const byName = new Map(entries.map((e) => [norm(e.name), e]));
  const byNormId = new Map(entries.map((e) => [norm(e.id), e]));
  return {
    resolve: (ref: string) => {
      const raw = ref.trim();
      if (raw.length === 0) return null;
      const hit =
        byId.get(raw.toLowerCase())
        ?? byName.get(norm(raw))
        ?? byNormId.get(norm(raw));
      return hit === undefined ? null : { id: hit.id, name: hit.name };
    },
    names: entries.map((e) => e.name),
    ...(note !== undefined ? { note } : {}),
  };
}

/**
 * The stair type catalogue, from the published built-in table.
 *
 * The `note` is not decoration — it is the whole reason this fallback is
 * acceptable rather than a lie by omission. See the header.
 */
export function publishedStairTypeCatalogue(): CatalogueLookup | null {
  return lookupOver(
    BUILT_IN_STAIR_TYPES.map((t) => ({ id: t.id, name: t.name })),
    'These are the built-in stair types. A stair type authored in this project '
      + 'is not readable from chat yet — pick it in the Properties panel, or use a built-in here.',
  );
}

/**
 * The railing type catalogue, from the LIVE `handrailTypeStore` singleton — the
 * same object `element.changeType`'s stair-railing branch resolves against, so
 * a name this resolves is a name that branch accepts. Built-ins AND
 * user-authored types, hence no limiting note.
 */
export function publishedRailingTypeCatalogue(): CatalogueLookup | null {
  let all: readonly { readonly id: string; readonly name: string }[];
  try {
    all = handrailTypeStore.getAll().map((t) => ({ id: t.id, name: t.name }));
  } catch {
    // A catalogue that cannot be READ is reported ABSENT, never EMPTY — the two
    // are different values and collapsing them is the defect this whole package
    // keeps correcting (§CONTEXT-DATA-HONESTY).
    return null;
  }
  return lookupOver(all);
}
