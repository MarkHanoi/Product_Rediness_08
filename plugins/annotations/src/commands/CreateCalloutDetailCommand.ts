/**
 * F-P5-04 inversion (LANE B, 2026-08-31) — SAME-PATH SHIM.
 *
 * The class body moved DOWN to `packages/command-registry/src/annotations/`
 * (protocol: command-registry's canonical `types.ts`). This shim re-exports it
 * through `@pryzm/plugin-sdk` — the one sanctioned plugin edge — so every
 * in-plugin relative import, the plugin barrel, and all external consumers
 * keep working untouched. Do NOT re-add a class body here: two copies of the
 * class is the rival-singleton hazard (scout §7.6).
 */

export { CreateCalloutDetailCommand, type CreateCalloutDetailParams } from '@pryzm/plugin-sdk';
