/**
 * @file Lod200FixtureCatalogue.ts — RE-EXPORT ONLY.
 *
 * §FIX-LIGHTING-VOCABULARY (L-1331, 2026-08-19) — the matrix MOVED to
 * `packages/schemas/src/lighting/Lod200FixtureCatalogue.ts` (L0) so that
 * `schemas/elements/Lighting.ts` can derive its accepted fixture vocabulary from
 * the same array rather than transcribing a five-value enum that refused thirty
 * of the thirty-two families the UI offers.
 *
 * This file remains as the SINGLE re-export so every existing importer — the
 * `@pryzm/core-app-model/lod200-fixtures` subpath that `geometry-lighting` reads,
 * both barrels, and `FixturePhotometry.ts` — is unchanged. It holds NO data of
 * its own: a projection maps the master, it never extends it (C84 §1.3).
 *
 * ⛔ Do not add a declaration here. Add the row to the matrix.
 */
export * from '@pryzm/schemas/lighting';
