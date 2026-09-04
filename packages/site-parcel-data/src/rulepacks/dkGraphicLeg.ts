// §DK-GRAPHIC-LEG (lane ENVELOPE-NLDK, 2026-09-04) — the leg for the 61.2 % of lokalplan features
// where `iomfangreg = true`: the volume is regulated by DRAWING, not by number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT PHASE 0 ESTABLISHED, AND WHAT THIS LEG ADDS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `iomfangreg = true` co-occurs with a published number 0/183 times (D4c) and covers 61.2 % of
// lokalplan features. `dkOmfangRegulation.ts` already turns that flag into the honest verdict
// `regulated-outside-structured-fields` → `unrecovered` / `pdf` / mechanism PRESENT, with the
// doklink. That is a refusal-quality upgrade. It is not yet a footprint.
//
// This leg asks the next question: WHERE is the drawn regulation, and is any of it digitised?
//   · Plandata's `theme_pdk_byggefelt_vedtaget` IS the digitised drawing — a byggefelt is the
//     kortbilag's buildable field as a polygon, with `bygkunifelt` / `bygvejledende` telling us
//     whether it binds (`dkByggefeltBinding.ts`, single classifier, inherited not re-decided). Where
//     a byggefelt exists for the parcel, the FOOTPRINT half of the drawn regulation is machine-
//     readable: a `geometric` constraint (ConstraintForm), consumed as authoritative geometry.
//   · Where none exists, a `lokalplandelomraade` polygon may still bound the AREA the drawn rule
//     applies to — an upper-bound extent, not a footprint.
//   · Where neither exists, the regulation is in the plan document's kortbilag: `graphic`, with
//     the doklink — the founder's "biggest technical grey area", reachable, not structured.
//
// The HEIGHT half stays where `dkOmfangRegulation` left it (`pdf`, mechanism present) unless the
// byggefelt itself publishes `maxbygnhjd` — 1/15 in Phase 0 D2, so rarely, but then it is a fact.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NOT a placement resolver — `dkEnvelopePlacement.ts` (G6 tiers) hands the engine its
// `GeometricRule`; this module decides, per RULE, what the drawn regulation lets us SAY, in the
// shared `RuleState` vocabulary, and which ROUTE the footprint took. NOT a PDF reader. NOT a
// re-classifier of bindingness.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ROUND THREE (2026-09-04) — the route SPLIT was measured, and the doklink was checked
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Over the banked Phase 0 rows (seed 20260903; `findings/dk-phase0/dk-phase0-graphic-route.json`):
//   land   iomfangreg=true 30 → byggefelt-geometry 4 · delomraade-extent 22 · document-kortbilag 4
//   urban  iomfangreg=true 47 → byggefelt-geometry 8 · delomraade-extent 33 · document-kortbilag 6
// So the digitised drawing (a byggefelt at the point) exists on 12 of 77 = 15.6 % of drawn-not-numbered
// parcels; the delområde extent is the commonest route (55 of 77); and of the 12 byggefelter, 8 are
// `bygvejledende` (indicative), 2 `bygkunifelt` (binding), 2 carry neither flag, and ONE publishes a
// height. The kortbilag PDF is therefore the operative source for ~84 % of this population — which is
// why this round checked whether the pointer ANSWERS: all 76 distinct doklinks → HTTP 206
// application/pdf (dokument.plandata.dk, HEAD/Range probe). A doklink that did NOT answer would make the
// route `inaccessible` (retryable), not `graphic`; `doklinkStatus` below carries that distinction so the
// leg cannot report a dead pointer as a reachable drawing. Datafordeler credentials were absent at run
// time (`DATAFORDELER_USERNAME`/`_PASSWORD` unset) — the MAT/BBR legs stay `undeterminable (from this
// egress)`, unchanged from round one.
//
// PURE (C58 §1.9). Deterministic. No I/O.

import type { FetchOutcome, RuleState } from '@pryzm/schemas';
import type { DkByggefeltEnvelopeContribution } from './dkByggefeltBinding.js';
import { readDkPlandataFlag, type DkOmfangVerdict } from './dkOmfangRegulation.js';

/** Whether the lokalplan document pointer was checked, and whether it answered. */
export type DkDoklinkStatus = 'answers' | 'dead' | 'unchecked';

/** Which route the drawn regulation's FOOTPRINT half took. Closed. */
export type DkGraphicRoute =
    /** a placeable byggefelt polygon exists — the drawing is digitised; footprint is `geometric`. */
    | 'byggefelt-geometry'
    /** no byggefelt; a delområde polygon bounds the AREA the drawn rule applies to (upper-bound extent). */
    | 'delomraade-extent'
    /** neither digitised — the regulation is in the kortbilag of the plan document. */
    | 'document-kortbilag'
    /** the byggefelt request did not answer — the route is UNKNOWN, retryable. */
    | 'byggefelt-unresolved'
    /** the leg does not apply: the plan does not flag `iomfangreg=true` (or is kompleks). */
    | 'not-applicable';

export interface DkGraphicLegInputs {
    readonly omfang: DkOmfangVerdict;
    /** The byggefelt contribution for this parcel, as a `FetchOutcome`; `null` = not consulted. */
    readonly byggefelt?: FetchOutcome<DkByggefeltEnvelopeContribution> | null;
    /** Is a `lokalplandelomraade` polygon present at the point? `null` = not consulted. */
    readonly delomraadePresent?: boolean | null;
    readonly doklink?: string | null;
    /** Did the doklink answer when probed? `dead` turns the document routes `inaccessible` (retryable). */
    readonly doklinkStatus?: DkDoklinkStatus | null;
    readonly planLabel?: string | null;
}

export interface DkGraphicLegResolution {
    readonly route: DkGraphicRoute;
    /** `true` when a HIGHER-authority source was transient — do not cache (§FAILURE-IS-NOT-EMPTY). */
    readonly higherAuthorityUnresolved: boolean;
    /** The footprint (C4) statement, in the shared vocabulary. Null when the leg does not apply. */
    readonly footprintState: ((ref: RuleState['ref']) => RuleState) | null;
    /** The height (C2) statement. Null when the leg does not apply. */
    readonly heightState: ((ref: RuleState['ref']) => RuleState) | null;
    readonly statement: string;
    readonly caveats: readonly string[];
}

/**
 * Resolve the graphic leg for one parcel. Pure and total.
 *
 * ROUTE ORDER IS AUTHORITY ORDER: byggefelt (the digitised drawing) > delområde (its extent) >
 * the document. A transient byggefelt fetch does not fall through silently to the document — it
 * marks the route unresolved and the answer uncacheable, because a retry could replace a PDF
 * pointer with plan geometry.
 */
export function resolveDkGraphicLeg(input: DkGraphicLegInputs): DkGraphicLegResolution {
    const plan = input.planLabel && input.planLabel.trim() !== '' ? input.planLabel : 'the governing lokalplan';
    const doklink = input.doklink && input.doklink.trim() !== '' ? input.doklink : null;
    const stoppedAtDoc = doklink ?? 'the lokalplan document (doklink not served)';

    if (input.omfang.kind !== 'regulated-outside-structured-fields') {
        return {
            route: 'not-applicable',
            higherAuthorityUnresolved: false,
            footprintState: null,
            heightState: null,
            statement:
                `${plan}: the graphic leg does not apply — iomfangreg is not true here (${input.omfang.kind}); ` +
                'the structured-field path or the kompleks route governs.',
            caveats: [],
        };
    }

    const bf = input.byggefelt ?? null;
    // A dead doklink is a TRANSPORT fact, not a drawing: the regulation is still in the kortbilag, but the
    // pointer did not answer, so the honest label is `inaccessible` (the one retryable label), never
    // `graphic`/`pdf` — those would report a dead link as a reachable document.
    const doklinkDead = input.doklinkStatus === 'dead';
    const deadNote = doklinkDead ? ' — ⚠ the doklink did NOT answer when probed; retry before reading' : '';
    const heightUnrecovered = (ref: RuleState['ref']): RuleState => ({
        rule: 'C2',
        status: 'unrecovered',
        partial: null,
        reachability: 'extractable',
        failure: doklinkDead ? 'inaccessible' : 'pdf',
        mechanism: 'present',
        stoppedAt: stoppedAtDoc + deadNote,
        ref,
    });

    // ── byggefelt found and placeable → the drawing is digitised ──────────────────────────────
    if (bf !== null && bf.status === 'found' && bf.value.semantics !== 'not-placeable') {
        const c = bf.value;
        const caveats: string[] = [...c.caveats];
        if (c.semantics === 'binding-obligation') {
            caveats.push('the byggefelt is a MANDATORY placement (bygkunifelt=true) — a MIN obligation, not an upper bound');
        }
        return {
            route: 'byggefelt-geometry',
            higherAuthorityUnresolved: false,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'resolved',
                reachability: 'source-complete',
                value: `byggefelt polygon (${c.semantics}; ${c.citation.document})`,
                unit: null,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            }),
            heightState:
                c.maxHeightM !== null
                    ? (ref) => ({
                          rule: 'C2',
                          status: 'resolved',
                          reachability: 'source-complete',
                          value: c.maxHeightM as number,
                          unit: 'm',
                          datum: null,
                          provenance: 'pipeline-extracted',
                          ref,
                      })
                    : heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true) and the drawing is DIGITISED: a ` +
                `${c.semantics} byggefelt polygon bounds the footprint. ` +
                (c.maxHeightM !== null
                    ? `The byggefelt publishes maks. bygningshøjde ${c.maxHeightM} m.`
                    : 'Height stays in the plan document.'),
            caveats: Object.freeze(caveats),
        };
    }

    // ── byggefelt transient → unresolved, uncacheable ─────────────────────────────────────────
    if (bf !== null && (bf.status === 'transient' || bf.status === 'aborted')) {
        return {
            route: 'byggefelt-unresolved',
            higherAuthorityUnresolved: true,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'inaccessible',
                mechanism: 'present',
                stoppedAt: `theme_pdk_byggefelt_vedtaget did not answer (${bf.status}${'reason' in bf && bf.reason ? ': ' + bf.reason : ''})`,
                ref,
            }),
            heightState: heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true); whether the drawing is digitised as a ` +
                'byggefelt is UNKNOWN because the byggefelt request did not answer. Retry before reading the document.',
            caveats: ['do not cache — a retry may replace the document pointer with plan geometry'],
        };
    }

    // ── no placeable byggefelt: delområde extent, else the document ───────────────────────────
    const bfNote =
        bf === null
            ? 'byggefelt not consulted'
            : bf.status === 'absent'
              ? 'no byggefelt published here'
              : 'the byggefelt is not placeable (metadata conflict or unpublished flags)';
    if (input.delomraadePresent === true) {
        return {
            route: 'delomraade-extent',
            higherAuthorityUnresolved: false,
            footprintState: (ref) => ({
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: doklinkDead ? 'inaccessible' : 'graphic',
                mechanism: 'present',
                stoppedAt: `${stoppedAtDoc} — a lokalplandelomraade polygon bounds the AREA the drawn rule applies to (upper-bound extent, not a footprint)${deadNote}`,
                ref,
            }),
            heightState: heightUnrecovered,
            statement:
                `${plan} regulates extent by drawing (iomfangreg=true); ${bfNote}. A delområde polygon bounds ` +
                'the area the drawn rule applies to — an UPPER-BOUND extent, never drawn as the footprint. The ' +
                'footprint itself is in the kortbilag.' +
                (doklinkDead ? ' ⚠ The doklink did not answer when probed (inaccessible, retryable).' : ''),
            caveats: doklinkDead
                ? ['the delområde is an extent, not a buildable field', 'the doklink did not answer — do not cache; retry']
                : ['the delområde is an extent, not a buildable field'],
        };
    }
    return {
        route: 'document-kortbilag',
        higherAuthorityUnresolved: false,
        footprintState: (ref) => ({
            rule: 'C4',
            status: 'unrecovered',
            partial: null,
            reachability: 'extractable',
            failure: doklinkDead ? 'inaccessible' : 'graphic',
            mechanism: 'present',
            stoppedAt: stoppedAtDoc + deadNote,
            ref,
        }),
        heightState: heightUnrecovered,
        statement:
            `${plan} regulates extent by drawing (iomfangreg=true); ${bfNote}` +
            (input.delomraadePresent === false ? ', no delområde polygon' : '') +
            `. The regulation is in the plan document's kortbilag${doklink ? `: ${doklink}` : ''}. ` +
            'This is a statement about the INSTRUMENT (mechanism present), not a gap — the footprint is drawn, not numbered.' +
            (doklinkDead ? ' ⚠ The doklink did not answer when probed (inaccessible, retryable).' : ''),
        caveats: doklinkDead ? ['the doklink did not answer — do not cache; retry'] : [],
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The route census — the measurement, as a pure reducer over Plandata rows
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One parcel's Plandata reading at its representative point, as the census needs it. */
export interface DkGraphicCensusRow {
    /** The governing lokalplan's `iomfangreg`, raw (Plandata serialises booleans as strings). */
    readonly iomfangreg: unknown;
    readonly kompleks?: unknown;
    /** byggefelt features at the point; `null` = the layer was not consulted / did not answer. */
    readonly byggefeltAtPoint: ReadonlyArray<{ readonly bygkunifelt?: unknown; readonly bygvejledende?: unknown; readonly maxbygnhjd?: unknown }> | null;
    /** is a `lokalplandelomraade` polygon present at the point; `null` = not consulted. */
    readonly delomraadeAtPoint: boolean | null;
    readonly doklink?: unknown;
}

export interface DkGraphicRouteCensus {
    readonly rows: number;
    readonly iomfangregTrue: number;
    readonly iomfangregFalse: number;
    /** flag absent — NEVER counted as false (three-valued read). */
    readonly iomfangregAbsent: number;
    readonly kompleksTrue: number;
    readonly route: Readonly<Record<Exclude<DkGraphicRoute, 'not-applicable'>, number>>;
    readonly byggefeltSemantics: Readonly<Record<'binding-obligation' | 'indicative' | 'neither-flag' | 'both-flags-conflict', number>>;
    readonly byggefeltPublishesHeight: number;
    readonly withDoklink: number;
}

/**
 * Count, over `iomfangreg = true` rows, which route the drawn regulation takes. Pure and total.
 * Route order is the leg's authority order: byggefelt present > delområde present > document; a
 * byggefelt layer that was not consulted (`null`) is `byggefelt-unresolved`, never "none".
 */
export function censusDkGraphicRoutes(rows: ReadonlyArray<DkGraphicCensusRow>): DkGraphicRouteCensus {
    const route = { 'byggefelt-geometry': 0, 'delomraade-extent': 0, 'document-kortbilag': 0, 'byggefelt-unresolved': 0 };
    const sem = { 'binding-obligation': 0, indicative: 0, 'neither-flag': 0, 'both-flags-conflict': 0 };
    let t = 0;
    let f = 0;
    let absent = 0;
    let kompleks = 0;
    let height = 0;
    let doklink = 0;
    for (const r of rows) {
        const flag = readDkPlandataFlag(r.iomfangreg);
        if (flag === null) absent++;
        else if (flag === false) f++;
        else {
            t++;
            if (readDkPlandataFlag(r.kompleks) === true) kompleks++;
            if (typeof r.doklink === 'string' && r.doklink.trim() !== '') doklink++;
            if (r.byggefeltAtPoint === null) route['byggefelt-unresolved']++;
            else if (r.byggefeltAtPoint.length > 0) {
                route['byggefelt-geometry']++;
                const b = r.byggefeltAtPoint[0]!;
                const k = readDkPlandataFlag(b.bygkunifelt) === true;
                const v = readDkPlandataFlag(b.bygvejledende) === true;
                sem[k && v ? 'both-flags-conflict' : k ? 'binding-obligation' : v ? 'indicative' : 'neither-flag']++;
                const h = typeof b.maxbygnhjd === 'number' ? b.maxbygnhjd : Number.parseFloat(String(b.maxbygnhjd ?? ''));
                if (Number.isFinite(h) && h > 0) height++;
            } else if (r.delomraadeAtPoint === true) route['delomraade-extent']++;
            else route['document-kortbilag']++;
        }
    }
    return {
        rows: rows.length,
        iomfangregTrue: t,
        iomfangregFalse: f,
        iomfangregAbsent: absent,
        kompleksTrue: kompleks,
        route: Object.freeze(route),
        byggefeltSemantics: Object.freeze(sem),
        byggefeltPublishesHeight: height,
        withDoklink: doklink,
    };
}

/**
 * The 2026-09-04 census, banked. Strata are NEVER pooled (the urban stratum is deliberately
 * oversampled). Method and raw rows: `findings/dk-phase0/dk-phase0-graphic-route.{mjs,json}`.
 */
export const DK_GRAPHIC_ROUTE_CENSUS_2026_09_04 = Object.freeze({
    seed: 20260903,
    method:
        'banked Phase 0 rows; iomfangreg read from the governing lokalplan feature at the representative point; ' +
        'route = byggefelt feature present at point > lokalplandelomraade present > neither; one HEAD (Range GET on ' +
        '405/403) per distinct doklink',
    land: { rowsWithLokalplan: 54, iomfangregTrue: 30, iomfangregFalse: 24, route: { 'byggefelt-geometry': 4, 'delomraade-extent': 22, 'document-kortbilag': 4 }, byggefeltSemantics: { 'binding-obligation': 1, indicative: 2, 'neither-flag': 1 }, byggefeltPublishesHeight: 1, withDoklink: 30 },
    urban: { rowsWithLokalplan: 67, iomfangregTrue: 47, iomfangregFalse: 18, iomfangregAbsent: 2, route: { 'byggefelt-geometry': 8, 'delomraade-extent': 33, 'document-kortbilag': 6 }, byggefeltSemantics: { 'binding-obligation': 1, indicative: 6, 'neither-flag': 1 }, byggefeltPublishesHeight: 0, withDoklink: 47 },
    doklinkReachability: { distinct: 76, status: { '206': 76 }, contentType: { 'application/pdf': 76 }, host: 'dokument.plandata.dk' },
    datafordelerCredentialPresent: false,
} as const);
