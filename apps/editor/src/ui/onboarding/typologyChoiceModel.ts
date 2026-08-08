// §TYPOLOGY-CHOICE-AT-CONFIRM (founder 2026-08-07) — the pure model behind the
// onboarding CONFIRM step's typology chooser.
//
// WHY THIS EXISTS
// ---------------
// The confirm step used to read "Generate your apartment with AI?" because the
// typology was decided upstream and SILENTLY: `resolveSeededTypologyId()` returns
// a hard-coded `'apartment'` for the no-modal "+ New Project" gesture (documented
// there as INTERIM, with "offer a typology choice" as the stated future). Every
// other typology's generator was already wired into the SAME spine — the user just
// had no way to ask for one. This module closes that: it turns the registry's packs
// into the chooser's options and resolves each to its generate route.
//
// THE INVARIANT THIS MODULE EXISTS TO HOLD
// ----------------------------------------
// A chooser entry MUST NOT exist without a wired generate route. This codebase's
// recurring failure is capability that was authored, tested and never connected —
// and a menu entry that silently no-ops is the worst shape of it, because a failed
// generation and an empty one look identical to the user. `buildTypologyChoices`
// therefore FILTERS on `resolveGenerateRoute` rather than trusting registration,
// and `resolveGenerateRoute` returns `null` — never a fallback — for an unwired id.
//
// TYPOLOGY-AGNOSTIC (the platform spine stays generic)
// ----------------------------------------------------
// The spine does not branch per typology. It maps two CLOSED vocabularies:
// the pack-declared `TypologyCategory` (C50 manifest) onto the C58 `PermittedUse`
// vocabulary, and the pack id onto a route tag. Specialisation lives in the Pack
// and in the per-route generator the controller already calls; adding a fifth
// typology is a row in `ROUTE_BY_TYPOLOGY_ID`, not a new branch in the flow.
//
// DOM-FREE ON PURPOSE — mirrors `resolveSeededTypologyId.ts`'s rationale: this must
// be unit-testable under `apps/editor/vitest.config.ts`'s deliberate `environment:
// 'node'`, so it imports nothing that touches `document` at module scope.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.onboarding.typology-choice');

/**
 * The generate routes the onboarding controller actually dispatches on
 * (`OnboardingStepController.generateAndFinish`). One tag per wired generator.
 * This is the closed set — a typology with no tag here has no way to be built.
 */
export const GENERATE_ROUTES = [
    'apartment',
    'house',
    'residential-building',
    'office',
] as const;
export type GenerateRoute = (typeof GENERATE_ROUTES)[number];

/**
 * Registered/legacy typology id → generate route.
 *
 * The ALIASES are not cosmetic. `§RESI-MULTIFAMILY` shipped its routing under
 * `'residential-multifamily'` while the pack that composeRuntime registers declares
 * `id: 'residential-building'`; `§OFFICE-ONBOARDING-WIRE` likewise accepted both
 * `'office'` and `'office-building'`. A brief captured under the registered id and
 * dispatched against the routing id would have generated NOTHING, silently. Both
 * spellings route here so that class of mismatch cannot reappear.
 */
const ROUTE_BY_TYPOLOGY_ID: Readonly<Record<string, GenerateRoute>> = {
    apartment: 'apartment',
    'casa-unifamiliar': 'house',
    'residential-building': 'residential-building',
    'residential-multifamily': 'residential-building',
    office: 'office',
    'office-building': 'office',
};

/** Display order in the chooser — most common first. Unlisted ids sort last. */
const CHOICE_ORDER: readonly string[] = [
    'apartment',
    'casa-unifamiliar',
    'residential-building',
    'office-building',
];

/** Short nouns for the confirm copy ("Generate your {noun} with AI?"). Falls back
 *  to the pack's own `displayName` when a pack ships no entry here. */
const NOUN_BY_ROUTE: Readonly<Record<GenerateRoute, string>> = {
    apartment: 'apartment',
    house: 'house',
    'residential-building': 'residential building',
    office: 'office building',
};

/** The manifest fields this module reads. Structurally typed so the chooser can be
 *  fed `registry.list()` packs, raw manifests, or test fixtures alike. */
export interface TypologyManifestLike {
    readonly id: string;
    readonly displayName: string;
    readonly category: string;
    readonly description?: string;
}

/** One offerable typology, already proven to have a wired generator. */
export interface TypologyChoice {
    readonly id: string;
    /** Pack-declared display name, for the card heading. */
    readonly label: string;
    /** Short noun for the confirm sentence + CTA. */
    readonly noun: string;
    /** Pack-declared one-liner for the card body (may be empty). */
    readonly blurb: string;
    /** Pack-declared C50 category — the input to the zoning advisory. */
    readonly category: string;
    /** The generator this choice dispatches to. Never null by construction. */
    readonly route: GenerateRoute;
}

/**
 * Resolve the generate route for a typology id, or `null` when nothing is wired.
 *
 * Returning `null` rather than defaulting to the apartment generator is deliberate:
 * a silent substitution would hand the user a different building than the one they
 * asked for, with nothing said. Callers MUST treat `null` as "do not offer this".
 *
 * Exported (not inline) per P8 — every exported function carries ≥1 OTel span.
 */
export function resolveGenerateRoute(
    typologyId: string | null | undefined,
): GenerateRoute | null {
    const span = _tracer.startSpan('pryzm.onboarding.resolveGenerateRoute');
    try {
        const key = (typologyId ?? '').trim();
        if (!key) return null;
        return ROUTE_BY_TYPOLOGY_ID[key] ?? null;
    } finally {
        span.end();
    }
}

/**
 * Turn the registry's manifests into the chooser's options, dropping any pack whose
 * generator is not wired (see the module header's invariant) and ordering them for
 * display.
 *
 * Per C50 §5.3 this does NOT filter by plan tier — hiding a pack would hide the
 * upgrade path. It filters ONLY on "can this actually be built right now".
 */
export function buildTypologyChoices(
    manifests: readonly TypologyManifestLike[] | null | undefined,
): readonly TypologyChoice[] {
    const span = _tracer.startSpan('pryzm.onboarding.buildTypologyChoices');
    try {
        const choices: TypologyChoice[] = [];
        for (const m of manifests ?? []) {
            const route = resolveGenerateRoute(m?.id);
            if (!route) continue;
            if (choices.some((c) => c.id === m.id)) continue;
            choices.push({
                id: m.id,
                label: m.displayName || m.id,
                noun: NOUN_BY_ROUTE[route] || m.displayName || m.id,
                blurb: m.description ?? '',
                category: m.category,
                route,
            });
        }
        const rank = (id: string): number => {
            const i = CHOICE_ORDER.indexOf(id);
            return i === -1 ? CHOICE_ORDER.length : i;
        };
        choices.sort((a, b) => rank(a.id) - rank(b.id));
        span.setAttribute('pryzm.typology.choiceCount', choices.length);
        return choices;
    } finally {
        span.end();
    }
}

// ── Zoning advisory ──────────────────────────────────────────────────────────
//
// DESIGN DECISION (option (a): offer all four always, advise on conflict).
//
// C58 §10.2 records the permitted-use → typology-brief hand-off as PENDING and
// explicitly undesigned: "the exact mapping (zone use-class → typology + program
// weights) is a new seam... Pending C50 / L-401." Implementing option (b) — offering
// only what the zoning permits — would mean authoring that normative mapping HERE,
// in UI code, which is precisely the C50 §14 KV-1 / L-669 defect: the UI stating a
// constraint no engine computed. §1.8 is equally careful: permitted use "SHOULD seed
// the typology brief", it does not authorise a gate.
//
// So the chooser never removes an option. It ADVISES, in three visibly different
// registers, because "we don't know" and "it isn't allowed" are different answers:
//
//   permitted   — resolved zoning includes this use class → say nothing.
//   conflict    — resolved zoning is non-empty and EXCLUDES this use class →
//                 name what was recorded, and note it may need a use change.
//   unresolved  — no envelope, empty `permittedUse`, or a category we cannot
//                 classify → say we haven't resolved it. NEVER phrased as a refusal.
//
// `permittedUse: []` is the shape the rule packs write when a zone is not determined
// (see `zoneRefusal.ts`, `confidence: 'not-determined'`), so empty MUST read as
// unknown. Collapsing it into "forbidden" is the §CONTEXT-DATA-HONESTY family bug —
// failure and empty being the same value, hence needing different words.

/** The C58 permitted-use vocabulary this module can speak about. */
export type PermittedUseClass =
    | 'residential' | 'commercial' | 'industrial'
    | 'mixed' | 'civic' | 'green' | 'other';

/** Pack category (C50) → C58 permitted-use class, or `null` when no honest mapping
 *  exists. `null` means "make no zoning claim", never "forbidden". */
export function permittedUseForCategory(
    category: string | null | undefined,
): PermittedUseClass | null {
    const span = _tracer.startSpan('pryzm.onboarding.permittedUseForCategory');
    try {
        switch ((category ?? '').trim()) {
            case 'residential': return 'residential';
            case 'workplace':
            case 'retail-hospitality': return 'commercial';
            case 'industrial-logistics': return 'industrial';
            case 'healthcare':
            case 'education':
            case 'civic-cultural': return 'civic';
            // 'sports-leisure', 'transport', 'specialist' — genuinely jurisdiction-
            // dependent. No mapping is better than a guessed one.
            default: return null;
        }
    } finally {
        span.end();
    }
}

export type ZoningAdvisoryKind = 'permitted' | 'conflict' | 'unresolved';

export interface ZoningAdvisory {
    readonly kind: ZoningAdvisoryKind;
    /** User-facing sentence. Empty string for `'permitted'` (nothing to say). */
    readonly message: string;
    /** Always `false` — this advisory NEVER blocks generation (C58 §10.2 pending;
     *  refusals belong to the engines per C50 §1.7, not to this chooser). */
    readonly blocksGeneration: false;
}

/** The slice of a `BuildableEnvelope` this advisory reads. */
export interface EnvelopeUseFacts {
    readonly permittedUse: readonly string[];
}

const USE_LABEL: Readonly<Record<string, string>> = {
    residential: 'residential',
    commercial: 'commercial',
    industrial: 'industrial',
    mixed: 'mixed-use',
    civic: 'civic',
    green: 'open space',
    other: 'other',
};

/**
 * Advise (never gate) on whether the chosen typology's use class sits inside the
 * parcel's resolved permitted use. See the block comment above for the decision and
 * its C58 justification.
 */
export function zoningAdvisoryFor(
    category: string | null | undefined,
    envelope: EnvelopeUseFacts | null | undefined,
): ZoningAdvisory {
    const span = _tracer.startSpan('pryzm.onboarding.zoningAdvisoryFor');
    try {
        const want = permittedUseForCategory(category);
        const permitted = (envelope?.permittedUse ?? []).filter((u) => typeof u === 'string');

        if (!want || permitted.length === 0) {
            span.setAttribute('pryzm.zoning.advisory', 'unresolved');
            return {
                kind: 'unresolved',
                message:
                    "We haven't resolved the permitted use for this parcel, so this is unchecked "
                    + 'against zoning — you can still generate and review it.',
                blocksGeneration: false,
            };
        }

        // 'mixed' zoning admits any use class; an exact match admits its own.
        if (permitted.includes(want) || permitted.includes('mixed')) {
            span.setAttribute('pryzm.zoning.advisory', 'permitted');
            return { kind: 'permitted', message: '', blocksGeneration: false };
        }

        const recorded = permitted.map((u) => USE_LABEL[u] ?? u).join(', ');
        span.setAttribute('pryzm.zoning.advisory', 'conflict');
        return {
            kind: 'conflict',
            message:
                `Zoning here is recorded as ${recorded}, not ${USE_LABEL[want] ?? want} — `
                + 'this may need a use change. You can still generate it.',
            blocksGeneration: false,
        };
    } finally {
        span.end();
    }
}
