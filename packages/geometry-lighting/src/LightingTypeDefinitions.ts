/**
 * LightingTypeDefinitions — §FEAT-ELEMENT-TYPE-PICKER-REGISTRY
 * =============================================================
 *
 * The NAMED, ENUMERABLE catalogue of lighting fixture types.
 *
 * ── WHY THIS DID NOT EXIST ───────────────────────────────────────────────────
 *
 * `LightingFixtureType` (LightingTypes.ts) is a 12-member string-literal union, and
 * a union is not enumerable at runtime. Every other family that offers a type picker
 * backs it with a LIST of definitions carrying an id + a human name
 * (`BUILT_IN_STAIR_TYPES`, `handrailTypeStore`, `wallSystemTypeStore`, …). Lighting
 * had only the union, twelve `*_DEFAULTS` constants addressable by nothing, and a
 * photometric lookup table — so there was no list the properties panel could render,
 * which is why the lighting element has never had a type dropdown.
 *
 * ── SCOPE: WHAT THIS CATALOGUE IS AND IS NOT ─────────────────────────────────
 *
 * This is the IDENTITY layer only: id, display name, description, mount class. It
 * deliberately restates NO photometric value.
 *
 *   - WHAT A FIXTURE EMITS — lumens, kelvin, beam angle, reach, day/night response
 *     — lives in `@pryzm/core-app-model` `LIGHTING_FIXTURE_PHOTOMETRY`, keyed by the
 *     SAME `LightingFixtureType` id used here. That table is the photometry owner and
 *     this file must never duplicate it: two tables of lumens would drift, and the
 *     one the renderer reads would win silently.
 *   - WHAT A FIXTURE LOOKS LIKE — the per-type `*Params` interfaces and `*_DEFAULTS`
 *     in LightingTypes.ts, read by `LightingFragmentBuilder`.
 *
 * `id` is therefore also the join key into both. Adding a fixture type means adding a
 * union member, a defaults const, a photometry row, and a row here — the row here is
 * what makes it SELECTABLE.
 */

import type { LightingFixtureType } from './LightingTypes';
// §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — the twenty LOD-200 families are
// DERIVED from the matrix rather than restated here. See the block at the end of
// BUILT_IN_LIGHTING_TYPES for why that is the whole point of this file's existence.
//
// ⛔ Same module-load hazard as LightingTypes.ts, and WORSE here: this function is
// CALLED at module scope inside the frozen array below, so a barrel import that has
// not finished initialising is not a late value, it is `undefined is not a function`.
// ⛔ §SCC-NO-BARREL-AT-MODULE-LOAD — imported from the DEFINING MODULE by its own
// subpath, NEVER from the `@pryzm/core-app-model` root barrel. The barrel is
// mutually reachable with this package's module graph, so during module
// initialisation its bindings are still `undefined` — and this value is spread at
// MODULE SCOPE, where `undefined` throws `is not iterable` and takes down test
// collection (and, previously in this codebase, the whole screen). Re-ordering the
// spread cannot fix that: the cycle is the defect, not the line number.
// `Lod200FixtureCatalogue` imports only the pure L0 material catalogue, so it can
// ALWAYS be fully initialised — which is the question to ask, not "why is it late?".
import { lod200TypeDefinitionRows } from '@pryzm/core-app-model/lod200-fixtures';

/**
 * Where a fixture is mounted. Presentation-level classification: it groups the
 * dropdown and tells the user why a floor lamp and a downlight are not
 * interchangeable. `FLOOR_MOUNTED_FIXTURES` (LightingTypes.ts) remains the
 * authority the placement tool uses; this field must agree with it.
 */
export type LightingMountClass = 'ceiling' | 'floor' | 'table' | 'wall';

export interface LightingTypeDefinition {
    /** The `LightingFixtureType` this definition names — the join key. */
    readonly id: LightingFixtureType;
    readonly name: string;
    readonly description: string;
    readonly mount: LightingMountClass;
    readonly isBuiltIn: boolean;
}

export const BUILT_IN_LIGHTING_TYPES: readonly LightingTypeDefinition[] = Object.freeze([
    {
        id: 'downlight',
        name: 'Downlight',
        description: 'Surface-mounted cylindrical canister downlight.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'pendant',
        name: 'Pendant',
        description: 'Hanging pendant cylinder on a drop cord.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'linear_led',
        name: 'Linear LED Bar',
        description: 'Suspended linear LED bar for worktops and corridors.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'pendant_pebble',
        name: 'Pebble Pendant',
        description: 'Flat pebble/disc pendant shade.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'pendant_ceramic_bell',
        name: 'Ceramic Bell Pendant',
        description: 'Glazed ceramic bell pendant.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'pendant_conical',
        name: 'Conical Pendant',
        description: 'Conical / UFO pendant shade.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'pendant_cluster',
        name: 'Pendant Cluster',
        description: 'Multi-pendant ceiling cluster for a kitchen island or dining table.',
        mount: 'ceiling',
        isBuiltIn: true,
    },
    {
        id: 'mirror_light',
        name: 'Mirror / Vanity Light',
        description: 'Wall-mounted vanity light strip above a bathroom mirror.',
        mount: 'wall',
        isBuiltIn: true,
    },
    {
        id: 'floor_wood_post',
        name: 'Wood Post Floor Lamp',
        description: 'Floor lamp — wood post with a drum shade.',
        mount: 'floor',
        isBuiltIn: true,
    },
    {
        id: 'floor_arc_brass',
        name: 'Brass Arc Floor Lamp',
        description: 'Floor lamp — brass arc with a marble base.',
        mount: 'floor',
        isBuiltIn: true,
    },
    {
        id: 'floor_tripod_black',
        name: 'Black Tripod Floor Lamp',
        description: 'Floor lamp — black tripod with a drum shade.',
        mount: 'floor',
        isBuiltIn: true,
    },
    {
        id: 'table_terracotta',
        name: 'Terracotta Table Lamp',
        description: 'Table lamp — terracotta column with a cone shade.',
        mount: 'table',
        isBuiltIn: true,
    },

    // ── §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) ────────────────────────
    //
    // The twenty LOD-200 architectural, exterior and life-safety families — as a
    // SPREAD, not twenty more literals.
    //
    // This file's own header explains why the lighting element never had a type
    // dropdown: the union was not enumerable, so there was no list to render. The
    // fix was a list — but a HAND-WRITTEN list re-creates the original problem one
    // level up, because it must be remembered alongside the union, the defaults and
    // the photometry row. Every LOD-200 row therefore reaches this catalogue by
    // construction, and its `mount` is the SAME value the photometry table and
    // `FLOOR_MOUNTED_FIXTURES` read — they cannot disagree, which is the silent
    // placement bug this shape removes.
    ...lod200TypeDefinitionRows().map((r) => ({
        id: r.id as LightingFixtureType,
        name: r.name,
        description: r.description,
        mount: r.mount as LightingMountClass,
        isBuiltIn: r.isBuiltIn,
    })),
]);

/** Look one up by its `LightingFixtureType` id. */
export function getLightingTypeDefinition(id: string): LightingTypeDefinition | undefined {
    return BUILT_IN_LIGHTING_TYPES.find(t => t.id === id);
}
