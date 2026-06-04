// O.12.c — Structured typology brief → apartment layout-request mapping.
//
// THE SINGLE SOURCE OF TRUTH for turning the RAC onboarding brief (and the
// "Choose a layout" picker — O.10) into the generator's request. Both surfaces
// capture values keyed by the SAME brief field ids the apartment manifest
// declares (`packages/typology-pack-apartment/src/manifest.ts` briefSchema), so
// the picker and the conversation can never drift. There is NO NLP/free-text
// parse here: the brief is already structured (the RAC's BriefSchemaForm + the
// picker form both emit field-id-keyed primitives), so this is a pure, total
// field-id → request-param map.
//
// WHY THIS LIVES IN THE APARTMENT-LAYOUT DIR (not shared pipeline code)
// --------------------------------------------------------------------
// Keeping the pipeline TYPOLOGY-AGNOSTIC (task §4): the shared onboarding chain
// (briefBootstrap → OnboardingStepController) only carries the RAW brief
// metadata (`Record<string, unknown>`) + the typologyId; it never introspects
// the field ids. The apartment-SPECIFIC knowledge — "field `bedrooms` maps to
// program.bedrooms", "field `openPlanKitchenDining` toggles the merged
// kitchen+dining program", etc. — is confined to THIS module, alongside the
// rest of the apartment generator glue. A house/office Pack ships its own
// equivalent mapper next to its own generator.
//
// FIELD-ID → REQUEST-PARAM MAP (apartment)
// ----------------------------------------
//   bedrooms              → program.bedrooms           (count)
//   bathrooms             → program.bathrooms          (count)
//   openPlanKitchenDining → program.openPlanKitchenDining (merge kitchen+dining)
//   masterEnSuite         → program.masterEnSuite      (ensuite flag)
//   targetAreaM2          → meta.targetAreaM2          (area HINT — the drawn
//                           shell defines the true envelope; this is recorded
//                           for the picker seed + future area-aware passes)
//   style                 → meta.styleHint             (passthrough)
//   notes                 → meta.notes                 (passthrough)
//
// FALLBACK: any field absent from the captured brief leaves the corresponding
// DEFAULT_PROGRAM value untouched (the mapper returns a PARTIAL override; the
// caller spreads it over DEFAULT_PROGRAM). An empty/undefined brief therefore
// reproduces today's behaviour exactly.

import type { ApartmentProgram } from '@pryzm/ai-host';

/** Apartment brief field ids — these MUST stay in lock-step with the manifest's
 *  `briefSchema.fields[].id` AND the ApartmentProgram keys (the picker form's
 *  input `name`s). The comment in manifest.ts cross-references this set. */
export const APARTMENT_BRIEF_FIELD_IDS = {
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    style: 'style',
    openPlanKitchenDining: 'openPlanKitchenDining',
    masterEnSuite: 'masterEnSuite',
    targetAreaM2: 'targetAreaM2',
    notes: 'notes',
} as const;

/** Hard clamps mirroring the manifest's briefSchema bounds + the modal form's
 *  own clamps (ApartmentLayoutModal._readProgramFromForm), so the picker and the
 *  brief resolve identically. */
const BEDROOMS_MIN = 1;
const BEDROOMS_MAX = 5;
const BATHROOMS_MIN = 1;
const BATHROOMS_MAX = 3;

/** Extras the brief carries that are NOT part of ApartmentProgram (the program
 *  shape is shell-driven; these are hints + passthrough). Kept on the resolved
 *  brief so the modal seed + any future area-aware pass can read them. */
export interface ApartmentBriefExtras {
    /** Target apartment area in m² (a HINT — the drawn shell defines the true
     *  envelope). Recorded for the picker seed + future area-aware passes. */
    readonly targetAreaM2?: number;
    /** Free-text style chip (`modern` | `classic` | `minimal` | `warm` | …). */
    readonly styleHint?: string;
    /** The "anything else" free-text note — passed through verbatim. */
    readonly notes?: string;
}

export interface ResolvedApartmentBrief {
    /** PARTIAL program override — only fields the brief actually set. Spread
     *  over DEFAULT_PROGRAM by the caller so absent fields keep their default. */
    readonly programOverride: Partial<ApartmentProgram>;
    /** Non-program hints + passthrough (see ApartmentBriefExtras). */
    readonly extras: ApartmentBriefExtras;
}

// ── small total coercers (never throw; absent/ill-typed ⇒ undefined) ─────────

function asFiniteNumber(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

function asBoolean(v: unknown): boolean | undefined {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === 'yes' || s === '1' || s === 'on') return true;
        if (s === 'false' || s === 'no' || s === '0' || s === 'off') return false;
    }
    return undefined;
}

function asNonEmptyString(v: unknown): string | undefined {
    if (typeof v === 'string') {
        const s = v.trim();
        if (s !== '') return s;
    }
    return undefined;
}

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Map a STRUCTURED brief (field-id-keyed primitives — the RAC's
 * `state.captured.brief` / `PipelineBrief.metadata`, OR the picker form's
 * field-id reads) into an apartment program override + extras. Pure + total:
 * any absent / ill-typed field is simply skipped (graceful fallback to the
 * caller's DEFAULT_PROGRAM). Never throws.
 *
 * @param brief field-id-keyed metadata; `undefined`/empty ⇒ no override (today's defaults).
 */
export function resolveApartmentBrief(
    brief: Record<string, unknown> | null | undefined,
): ResolvedApartmentBrief {
    const md = brief ?? {};
    const F = APARTMENT_BRIEF_FIELD_IDS;
    const programOverride: Partial<ApartmentProgram> = {};
    const extras: { -readonly [K in keyof ApartmentBriefExtras]?: ApartmentBriefExtras[K] } = {};

    const bedrooms = asFiniteNumber(md[F.bedrooms]);
    if (bedrooms !== undefined) {
        programOverride.bedrooms = clampInt(bedrooms, BEDROOMS_MIN, BEDROOMS_MAX);
    }

    const bathrooms = asFiniteNumber(md[F.bathrooms]);
    if (bathrooms !== undefined) {
        programOverride.bathrooms = clampInt(bathrooms, BATHROOMS_MIN, BATHROOMS_MAX);
    }

    const openPlan = asBoolean(md[F.openPlanKitchenDining]);
    if (openPlan !== undefined) {
        programOverride.openPlanKitchenDining = openPlan;
    }

    const ensuite = asBoolean(md[F.masterEnSuite]);
    if (ensuite !== undefined) {
        programOverride.masterEnSuite = ensuite;
    }

    const targetAreaM2 = asFiniteNumber(md[F.targetAreaM2]);
    if (targetAreaM2 !== undefined && targetAreaM2 > 0) {
        extras.targetAreaM2 = targetAreaM2;
    }

    const styleHint = asNonEmptyString(md[F.style]);
    if (styleHint !== undefined) {
        extras.styleHint = styleHint;
    }

    const notes = asNonEmptyString(md[F.notes]);
    if (notes !== undefined) {
        extras.notes = notes;
    }

    return { programOverride, extras };
}
