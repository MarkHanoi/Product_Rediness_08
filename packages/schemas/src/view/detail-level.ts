// @pryzm/schemas/view/detail-level — §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P1.
//
// THE SINGLE SOURCE OF TYPE TRUTH for the view Detail Level enum (P5 / C03 §1).
//
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// The enum was FORKED across a layer boundary:
//   • `packages/schemas/src/view/view-template.ts`   → 'Coarse' | 'Medium' | 'Fine'
//   • `packages/core-app-model/.../ViewDefinitionTypes.ts` → 'coarse' | 'medium' | 'fine'
//   • `packages/command-registry/.../SetViewOutputCommand.ts` → lower-case literals
// Two spellings of one domain enum = a consumer that silently never matches.
// P5 ("schemas are the single source of type truth") makes `schemas` the owner:
// every other layer now imports `DetailLevel` / `DETAIL_LEVELS` from here.
//
// CANONICAL SPELLING = lower-case.
// The runtime store, the SetViewOutput command, DefaultViewsManager and the LIVE
// properties-panel dropdown (`ViewPropertiesPanelBuilders.ts`) all already speak
// lower-case; only the ViewTemplate Zod schema spoke Title-Case. Choosing
// lower-case therefore keeps every *runtime* value unchanged.
//
// BACKWARD COMPATIBILITY (C47 — file-format versioning):
// `DetailLevelSchema` is a TOLERANT READER: it accepts the legacy Title-Case
// spelling ('Medium') found in already-persisted ViewTemplate JSON and NORMALISES
// it to the canonical lower-case form on parse. It is a CANONICAL WRITER: parse
// output is always lower-case, so re-serialising a legacy document upgrades it in
// place with no migration script.
//
// Layer purity: L0 — pure Zod, no I/O, no THREE, no DOM (P5).

import { z } from 'zod';

/** Canonical, ordered list of detail levels (coarse → fine). */
export const DETAIL_LEVELS = ['coarse', 'medium', 'fine'] as const;

/**
 * View Detail Level — Revit's Coarse / Medium / Fine.
 *
 * Semantics (C09 — this is visibility INTENT, not UI state):
 *   'coarse' — LOD 100: simplified symbol (single-line leaf, no hardware).
 *   'medium' — LOD 200: standard symbol (framed opening, true double-line leaf).
 *   'fine'   — LOD 300: full symbol (frame reveal/rebate, threshold, hardware).
 */
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

/** The project-wide default detail level (matches `DefaultViewsManager`). */
export const DEFAULT_DETAIL_LEVEL: DetailLevel = 'medium';

/**
 * Normalise an arbitrary value to a canonical `DetailLevel`.
 *
 * Accepts the canonical lower-case spelling AND the legacy Title-Case spelling
 * persisted by pre-L-241 ViewTemplate documents. Returns `undefined` for
 * anything else — callers decide whether that means "inherit" or "default".
 *
 * Pure: no side effects.
 */
export function normalizeDetailLevel(value: unknown): DetailLevel | undefined {
    if (typeof value !== 'string') return undefined;
    const lower = value.toLowerCase() as DetailLevel;
    return (DETAIL_LEVELS as readonly string[]).includes(lower) ? lower : undefined;
}

/**
 * Zod schema for `DetailLevel` — tolerant reader, canonical writer.
 *
 * `z.preprocess` lower-cases string input BEFORE the enum check, so legacy
 * 'Coarse' | 'Medium' | 'Fine' documents parse successfully and come out as
 * 'coarse' | 'medium' | 'fine'.
 */
export const DetailLevelSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    z.enum(DETAIL_LEVELS),
);
