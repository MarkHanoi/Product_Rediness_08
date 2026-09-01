// E1d — ESTONIA (EE) · the PURE rule mapper: PLANK dp_hoonestus/dp_krunt ehitusõigus
// attributes → E1a `SiteIntelRule` objects with DIRECT provenance, PLUS the minted planning
// entities those rules cite (the R1 referent contract, gate decision §B.2 / verdict §E R1:
// "every `basis` reference MUST resolve to a MINTED entity — an adapter that cites a
// hoonestusala mints the Prescription it cites"). This file is where the E1d rework's five
// items 1–3 land (E1-GATE-DECISION §F item 2 / verdict §G item 2).
//
// §J: `vocabulary: RuleVocabularyMapping — national params → canonical`. This module is the
// EE half of that mapping plus the schema mapping into the BRIEF §11 provenance JSON. It is
// TOTAL, PURE and DETERMINISTIC: same feature in → byte-identical rules out. No fetch, no
// clock (the caller passes `fetchedAtIso`), no business logic — it does NOT decide what may
// be built; it records what the state serves, with its legal address. The ONE refusal it can
// make is structural: a feature with NO served geometry AND NO resolvable plan identity has
// nothing a rule could apply to, and the mapper throws BY NAME rather than emit a rule that
// applies "nowhere" (the R1 at-least-one-leg refine would reject it anyway — the throw just
// names the cause instead of surfacing a Zod path).
//
// THE VOCABULARY (measured attribute names — DescribeFeatureType + GetFeature 2026-09-01;
// semantic glosses from lane 4 EE-1, which cites the mandatory layer standard and the PLANK
// statute https://www.riigiteataja.ee/akt/115072023039):
//
//   EE attribute   canonical parameter        unit    note
//   ───────────    ─────────────────────────  ─────   ────────────────────────────────────
//   tihedus     →  floorAreaRatio             null    density/FAR — dimensionless ratio
//   protsent    →  coveragePercent            %       building coverage of plot
//   korgus      →  maxHeight                  m       relative max height
//   korgusabs   →  maxHeightAbsolute          m       absolute (EH2000 datum where tingimus
//                                                     says so — NORMATIVE, not SURVEYED)
//   sygavus     →  maxDepth                   m       below-ground depth
//   sbp         →  maxGrossFloorArea          m2      closed gross floor area (GFA) — the
//                                                     number NO other probed country serves
//   sbppealne   →  maxGrossFloorAreaAbove     m2      above-ground GFA
//   sbpalune    →  maxGrossFloorAreaBelow     m2      below-ground GFA
//   pind        →  maxUnderBuildingArea       m2      under-building area (total)
//   pindpealne  →  maxUnderBuildingAreaAbove  m2
//   pindalune   →  maxUnderBuildingAreaBelow  m2
//   arv         →  maxBuildingCount           null    max number of buildings
//   maxsoosak   →  maxRoofPitch               deg     (dp_krunt + dp_hoonestus)
//   minsoosak   →  minRoofPitch               deg
//   tingimus    →  tingimus (kept national)   null    free-text conditions — value location
//                                                     `in-document-text`, NEVER parsed here
//
// THE UNKNOWN RULE (lane 4 EE-1, verbatim: "treat empty/0 as UNKNOWN, never as 'no limit'"):
// PLANK serves numerics as STRINGS and unfilled slots as "" or "0" (both observed live in
// one pull — a filled feature korgus "17.4" beside its sibling korgus "0"). An unfilled
// ehitusõigus slot is NOT zero and NOT unlimited — it maps to value=null at confidence
// tier 6 (uncertain-missing), which is the ONLY tier the E1a schema permits null at
// (UNKNOWN ≠ 0 ≠ no-limit is structural, not a convention). Filled numerics map to tier 1
// (authoritative-machine-readable) with derivation DIRECT.
//
// VALIDITY (R3, gate decision §B.3): `validityBasis: 'legal'` with the plan's adoption date
// (`kehtestkp`) when the register row resolved with a well-formed date; else
// `validityBasis: 'ingestion'` with the fetch date. The old prose note apology ("valid_from
// is the FETCH date — never read this as the legal adoption date") is GONE — that exact
// machine-indistinguishability is what the typed field kills, and a point-in-time evaluator
// must treat `'ingestion'` windows as NOT answering "was this in force on date D".

import {
    SiteIntelPlanSchema,
    SiteIntelPrescriptionSchema,
    SiteIntelRuleSchema,
    type NativeCrsGeometry,
    type RuleBasisRef,
    type RuleDerivation,
    type RuleValueLocation,
    type SiteIntelPlan,
    type SiteIntelPrescription,
    type SiteIntelRule,
} from '@pryzm/schemas';
import type { EeHoonestusFeature, EeKruntFeature, EePlanRegisterRow } from './eePlanProvider.js';
import { EE_PLANK_SOURCE_ID } from './eeSources.js';

/** One row of the EE→canonical rule vocabulary. */
export interface EeRuleVocabularyEntry {
    /** The PLANK attribute name, verbatim (DescribeFeatureType 2026-09-01). */
    readonly eeAttribute: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for dimensionless. */
    readonly unit: string | null;
    /** Which layers carry it. */
    readonly layers: readonly ('dp_hoonestus' | 'dp_krunt')[];
}

/** The measured, closed EE numeric-rule vocabulary (see the table in the header comment). */
export const EE_RULE_VOCABULARY: readonly EeRuleVocabularyEntry[] = [
    { eeAttribute: 'tihedus', parameter: 'floorAreaRatio', unit: null, layers: ['dp_hoonestus'] },
    { eeAttribute: 'protsent', parameter: 'coveragePercent', unit: '%', layers: ['dp_hoonestus'] },
    { eeAttribute: 'korgus', parameter: 'maxHeight', unit: 'm', layers: ['dp_hoonestus'] },
    { eeAttribute: 'korgusabs', parameter: 'maxHeightAbsolute', unit: 'm', layers: ['dp_hoonestus'] },
    { eeAttribute: 'sygavus', parameter: 'maxDepth', unit: 'm', layers: ['dp_hoonestus'] },
    { eeAttribute: 'sbp', parameter: 'maxGrossFloorArea', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'sbppealne', parameter: 'maxGrossFloorAreaAbove', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'sbpalune', parameter: 'maxGrossFloorAreaBelow', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'pind', parameter: 'maxUnderBuildingArea', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'pindpealne', parameter: 'maxUnderBuildingAreaAbove', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'pindalune', parameter: 'maxUnderBuildingAreaBelow', unit: 'm2', layers: ['dp_hoonestus'] },
    { eeAttribute: 'arv', parameter: 'maxBuildingCount', unit: null, layers: ['dp_hoonestus'] },
    { eeAttribute: 'maxsoosak', parameter: 'maxRoofPitch', unit: 'deg', layers: ['dp_hoonestus', 'dp_krunt'] },
    { eeAttribute: 'minsoosak', parameter: 'minRoofPitch', unit: 'deg', layers: ['dp_hoonestus', 'dp_krunt'] },
];

/** The publishing authority string carried in every EE rule's source ref. */
export const EE_RULE_AUTHORITY = 'PLANK/PLANIS (Maa- ja Ruumiamet)';

/**
 * PURE: parse one PLANK numeric attribute string under the UNKNOWN rule.
 *   "17.4" → { value: 17.4, unknown: false }
 *   "" / "0" / missing / non-numeric → { value: null, unknown: true, raw }
 * "0" is fill-quality, not a legal zero (lane 4 EE-1, observed live) — an actual prohibition
 * arrives as a drawn geometry or a tingimus condition, not a zero in this column.
 */
export function parseEeEhitusoigusNumber(raw: string | undefined): {
    readonly value: number | null;
    readonly unknown: boolean;
    readonly raw: string;
} {
    const s = (raw ?? '').trim();
    if (s === '' || s === '0') return { value: null, unknown: true, raw: s };
    const n = Number(s);
    if (!Number.isFinite(n)) return { value: null, unknown: true, raw: s };
    return { value: n, unknown: false, raw: s };
}

/* ───────────────── minted planning entities (R1 referent contract) ─────────────── */

/**
 * Deterministic id of the minted `SiteIntelPlan` for a PLANK register `sysid` — ONE naming
 * seat so the Prescription's `zoneOrPlanRef`, the rules' plan-`basis` fallback and the chain's
 * carried entity can never spell the same plan two ways.
 */
export function eePlanEntityId(sysid: number): string {
    return `ee-plan-${sysid}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PURE: one resolved `detailplaneering` register row → the minted `SiteIntelPlan`, or null
 * when the row serves no `planseis_nimi` — `Plan.status` is REQUIRED and MIRRORED (open
 * string, never invented), so a status-less row cannot honestly become a Plan entity; its
 * rules then ride the inline-geometry applicability leg instead (see the ladder below).
 */
export function mapEePlanRegisterRowToPlan(row: EePlanRegisterRow): SiteIntelPlan | null {
    if (row.status === null) return null;
    return SiteIntelPlanSchema.parse({
        id: eePlanEntityId(row.sysid),
        // The Estonian instrument, verbatim (detail plan — PlanS): an open string per REPORT §I.
        kind: 'detailplaneering',
        status: row.status,
        adoptedDate: row.adopted !== null && ISO_DATE_RE.test(row.adopted) ? row.adopted : null,
        // kehtestkp is the ADOPTION date; PLANK serves no separate in-force axis — mirroring
        // adoption into inForceFrom would be a guess, so both stay null.
        inForceFrom: null,
        inForceTo: null,
        // No SiteIntelDocument entities are minted (the municipal doc URL travels VERBATIM on
        // every rule's `source.document` instead — the structured path needs no retriever).
        documents: [],
        geometryRef: null,
        source: EE_PLANK_SOURCE_ID,
        version: null,
    });
}

function ringPolygon(
    ring: ReadonlyArray<readonly [number, number]>,
    crs: string,
): NativeCrsGeometry {
    return {
        crs,
        kind: 'Polygon',
        // Coordinates exactly as served ([easting, northing] pairs, closing vertex kept) —
        // uninterpreted at L0 per NativeCrsGeometrySchema's own doctrine.
        coordinates: [ring.map(([x, y]) => [x, y])],
    };
}

interface MintedApplicabilityTarget {
    readonly plan: SiteIntelPlan | null;
    readonly prescription: SiteIntelPrescription | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
}

/**
 * The R1 referent ladder, ONE seat for both layers. Mints what it cites and cites only what
 * it minted (gate decision §B.2 — the dangling `dp_hoonestus:<objectid>` strings this
 * replaces resolved to no graph entity):
 *   1. plan row resolved (with status) + drawn geometry → mint Plan + Prescription; basis
 *      cites the Prescription (which cites the Plan via `zoneOrPlanRef`).
 *   2. plan resolved, NO drawn geometry → basis cites the minted Plan directly.
 *   3. plan NOT resolvable, drawn geometry served → the rules carry the geometry INLINE
 *      (R1's residual bare-geometry leg — a half-known planning object is not minted).
 *   4. neither → throw BY NAME (nothing a rule could apply to; see header).
 */
function mintApplicabilityTarget(args: {
    readonly layer: 'dp_hoonestus' | 'dp_krunt';
    readonly prescriptionKind: string;
    readonly featureLabel: string;
    readonly objectid: string | null;
    readonly sysid: number | null;
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
    readonly planRow: EePlanRegisterRow | null;
}): MintedApplicabilityTarget {
    const plan = args.planRow !== null ? mapEePlanRegisterRowToPlan(args.planRow) : null;
    const hasRing = args.ring.length > 0;
    if (plan !== null && hasRing) {
        const prescription = SiteIntelPrescriptionSchema.parse({
            id: `ee-prescription-${args.layer}-${args.objectid ?? `sysid-${args.sysid ?? 'unknown'}`}`,
            kind: args.prescriptionKind,
            geometry: ringPolygon(args.ring, args.crs),
            // EE serves no prescription typology code; the PLANK layer name IS the national
            // classification of the drawn object — mirrored as {scheme, code}, never invented.
            typology: { scheme: 'ee-plank-layer', code: args.layer },
            // Scalar payloads ride the Rules (one per vocabulary attribute), not the geometry.
            value: null,
            zoneOrPlanRef: plan.id,
            source: EE_PLANK_SOURCE_ID,
        });
        return {
            plan,
            prescription,
            basis: [{ kind: 'prescription', ref: prescription.id }],
            inlineGeometry: null,
        };
    }
    if (plan !== null) {
        return { plan, prescription: null, basis: [{ kind: 'plan', ref: plan.id }], inlineGeometry: null };
    }
    if (hasRing) {
        return { plan: null, prescription: null, basis: [], inlineGeometry: ringPolygon(args.ring, args.crs) };
    }
    throw new Error(
        `ee-rule-mapper: ${args.layer} feature ${args.featureLabel} served NO geometry and its ` +
            'plan identity did not resolve — a rule that applies nowhere is not a rule (R1 ' +
            'at-least-one-leg), and minting a referent from a half-known feature would be the ' +
            'dangling-ref defect (gate decision §B.2). Refusing by name instead of guessing.',
    );
}

/** What one mapped feature yields: the minted referents + the rules that cite them. */
export interface EeMappedRuleSet {
    /** The minted Plan entity, or null (register row unresolved/status-less). */
    readonly plan: SiteIntelPlan | null;
    /** The minted Prescription the rules' `basis` cites, or null (see the referent ladder). */
    readonly prescription: SiteIntelPrescription | null;
    readonly rules: readonly SiteIntelRule[];
}

function eeSourceRef(
    dataset: 'dp_hoonestus' | 'dp_krunt',
    objectLabel: string | null,
    plan: EePlanRegisterRow | null,
): {
    country: string;
    authority: string;
    dataset: string;
    plan_id: string | null;
    object_id: string | null;
    document: string | null;
    article: null;
    page: null;
} {
    return {
        country: 'EE',
        authority: EE_RULE_AUTHORITY,
        dataset,
        plan_id: plan?.kovid ?? null,
        object_id: objectLabel,
        document: plan?.documentUrl ?? null,
        article: null,
        page: null,
    };
}

/**
 * R3: the typed validity axis. `legal` + adoption date when the register row resolved with a
 * well-formed `kehtestkp`; `ingestion` + fetch date otherwise. NO prose apology — the typed
 * field IS the machine-visible distinction the note used to gesture at (gate decision §B.3).
 */
function eeValidity(
    plan: EePlanRegisterRow | null,
    fetchedAtIso: string,
): { readonly validityBasis: 'legal' | 'ingestion'; readonly valid_from: string } {
    if (plan?.adopted && ISO_DATE_RE.test(plan.adopted)) {
        return { validityBasis: 'legal', valid_from: plan.adopted };
    }
    return { validityBasis: 'ingestion', valid_from: fetchedAtIso };
}

interface BuildRuleArgs {
    readonly id: string;
    readonly parameter: string;
    readonly value: number | string | boolean | null;
    readonly unit: string | null;
    readonly dataset: 'dp_hoonestus' | 'dp_krunt';
    readonly objectLabel: string | null;
    readonly plan: EePlanRegisterRow | null;
    readonly fetchedAtIso: string;
    readonly tier: 1 | 2 | 6;
    readonly derivation: RuleDerivation;
    readonly valueLocation: RuleValueLocation;
    readonly note: string | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
    /** Verbatim national use tokens (R1 `useScope`) — empty = not use-conditioned. */
    readonly useScope: readonly string[];
}

function buildRule(a: BuildRuleArgs): SiteIntelRule {
    const v = eeValidity(a.plan, a.fetchedAtIso);
    return SiteIntelRuleSchema.parse({
        id: a.id,
        body: null,
        applicability: {
            basis: a.basis,
            geometry: a.inlineGeometry,
            useScope: a.useScope,
            // PLANK serves no per-rule rank axis; the EE instrument ladder stays adapter DATA
            // (EE_APPLICABILITY_LADDER) — rank:null is R1's honest "no rank axis served".
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.parameter,
            value: a.value,
            unit: a.unit,
            source: eeSourceRef(a.dataset, a.objectLabel, a.plan),
            derivation: a.derivation,
            valueLocation: a.valueLocation,
            confidence: a.note !== null ? { tier: a.tier, note: a.note } : { tier: a.tier },
            validityBasis: v.validityBasis,
            valid_from: v.valid_from,
            valid_to: null,
        },
    });
}

/**
 * PURE: one dp_hoonestus feature (+ its resolved plan-register row, when available) →
 * the minted referents + `SiteIntelRule[]`, one rule per vocabulary attribute, plus a
 * `tingimus` prose rule when the condition text is non-empty. Every rule validates against
 * `SiteIntelRuleSchema` (a value with no legal address is not a value — the parse enforces
 * it), and every `basis` ref resolves to an entity RETURNED HERE (the R1 referent contract).
 *
 * The building-rights tuple applies to the DRAWN building area — the hoonestusala — so the
 * minted Prescription has kind `buildingField` (KNOWN_PRESCRIPTION_KINDS; PlanS ehitusõigus
 * semantics, lane 4 EE-1), carrying the served ring in native CRS.
 */
export function mapEeHoonestusToRules(
    feature: EeHoonestusFeature,
    plan: EePlanRegisterRow | null,
    fetchedAtIso: string,
): EeMappedRuleSet {
    const objectLabel =
        feature.krundiNimi !== null
            ? `hoonestusala ${feature.krundiNimi}` +
              (feature.objectid !== null ? ` (objectid ${feature.objectid})` : '')
            : feature.objectid !== null
              ? `hoonestusala objectid ${feature.objectid}`
              : null;
    const idBase = `ee-${feature.sysid ?? 'nosysid'}-${feature.objectid ?? 'noobj'}`;
    const target = mintApplicabilityTarget({
        layer: 'dp_hoonestus',
        prescriptionKind: 'buildingField',
        featureLabel: objectLabel ?? idBase,
        objectid: feature.objectid,
        sysid: feature.sysid,
        ring: feature.ring,
        crs: feature.crs,
        planRow: plan,
    });

    const rules: SiteIntelRule[] = [];
    for (const entry of EE_RULE_VOCABULARY) {
        if (!entry.layers.includes('dp_hoonestus')) continue;
        const parsed = parseEeEhitusoigusNumber(feature.raw[entry.eeAttribute]);
        if (parsed.unknown) {
            rules.push(
                buildRule({
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: null,
                    unit: entry.unit,
                    dataset: 'dp_hoonestus',
                    objectLabel,
                    plan,
                    fetchedAtIso,
                    tier: 6,
                    derivation: 'DIRECT',
                    valueLocation: 'attribute',
                    note:
                        `PLANK served ${entry.eeAttribute}=${JSON.stringify(parsed.raw)} — ` +
                        'empty/0 means UNKNOWN, never 0 and never no-limit (lane 4 EE-1)',
                    basis: target.basis,
                    inlineGeometry: target.inlineGeometry,
                    useScope: [],
                }),
            );
        } else {
            rules.push(
                buildRule({
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: parsed.value,
                    unit: entry.unit,
                    dataset: 'dp_hoonestus',
                    objectLabel,
                    plan,
                    fetchedAtIso,
                    tier: 1,
                    derivation: 'DIRECT',
                    valueLocation: 'attribute',
                    note: null,
                    basis: target.basis,
                    inlineGeometry: target.inlineGeometry,
                    useScope: [],
                }),
            );
        }
    }

    // tingimus — the qualitative remainder, served verbatim as prose. Its VALUES live in the
    // text (the NL waardeInRegeltekst split, lane 4 EE-1): valueLocation `in-document-text`.
    // Tier 2 (authoritative-document-derived), NOT tier 1: the frozen tier-projection guard
    // (provenance.ts superRefine, R-batch) rejects tier 1 + in-document-text at parse — "a
    // value living only in rule prose is tier 2 territory". Extracting numbers out of it is a
    // downstream tier-4 (AI) + tier-5 (human-validated) pipeline job — NEVER done here.
    const tingimus = (feature.raw['tingimus'] ?? '').trim();
    if (tingimus !== '') {
        rules.push(
            buildRule({
                id: `${idBase}-tingimus`,
                parameter: 'tingimus',
                value: tingimus,
                unit: null,
                dataset: 'dp_hoonestus',
                objectLabel,
                plan,
                fetchedAtIso,
                tier: 2,
                derivation: 'DIRECT',
                valueLocation: 'in-document-text',
                note:
                    'free-text plan condition served verbatim — numeric limits inside it require ' +
                    'the gated extraction pipeline (tier 4→5), never inline parsing',
                basis: target.basis,
                inlineGeometry: target.inlineGeometry,
                useScope: [],
            }),
        );
    }
    return { plan: target.plan, prescription: target.prescription, rules };
}

/**
 * PURE: one dp_krunt (plot) feature → the minted referents + `SiteIntelRule[]` for the
 * plot-level attributes (use categories + roof pitch). `otstarve` is a "; "-joined category
 * list — served as a string value, kept verbatim (splitting it into a typology decision is
 * business logic and lives above the adapter).
 *
 * The minted Prescription has the OPEN kind `plannedPlot` — the krunt is the detail plan's
 * planned plot, one of the geometry-bearing cases verdict §F.2 names as covered by
 * Prescription/Zone, and "planned plot" is among the canonical kind tokens verdict §E LATER
 * queues (the kind list is open by REPORT §I's own "…").
 */
export function mapEeKruntToRules(
    feature: EeKruntFeature,
    plan: EePlanRegisterRow | null,
    fetchedAtIso: string,
): EeMappedRuleSet {
    const objectLabel =
        feature.nimetus !== null
            ? `krunt ${feature.nimetus}` +
              (feature.objectid !== null ? ` (objectid ${feature.objectid})` : '')
            : feature.objectid !== null
              ? `krunt objectid ${feature.objectid}`
              : null;
    const idBase = `ee-${feature.sysid ?? 'nosysid'}-krunt-${feature.objectid ?? 'noobj'}`;
    const target = mintApplicabilityTarget({
        layer: 'dp_krunt',
        prescriptionKind: 'plannedPlot',
        featureLabel: objectLabel ?? idBase,
        objectid: feature.objectid,
        sysid: feature.sysid,
        ring: feature.ring,
        crs: feature.crs,
        planRow: plan,
    });

    const rules: SiteIntelRule[] = [];
    if (feature.otstarve !== null) {
        rules.push(
            buildRule({
                id: `${idBase}-otstarve`,
                parameter: 'landUseCategories',
                value: feature.otstarve,
                unit: null,
                dataset: 'dp_krunt',
                objectLabel,
                plan,
                fetchedAtIso,
                tier: 1,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                note: 'EE otstarve category list, "; "-joined, verbatim',
                basis: target.basis,
                inlineGeometry: target.inlineGeometry,
                useScope: [],
            }),
        );
    }
    // Roof pitch on the plot: the served shape is per-use-slot "; "-joined, slot-aligned with
    // `otstarve` (measured live: otstarve "ärimaa; elamumaa" beside maxsoosak "; 85" and
    // minsoosak "15; " — max pitch for elamumaa, min pitch for ärimaa). The WHICH-USE answer
    // is typed R1 `useScope` (verbatim national token) — no `-slotN` id suffix, no prose-only
    // encoding (gate decision §B.4). A joined string is NOT one number — emit per-slot rules
    // only for slots that parse cleanly; unfilled non-empty slots follow the UNKNOWN rule.
    const useTokens = (feature.otstarve ?? '').split(';').map((s) => s.trim());
    for (const entry of EE_RULE_VOCABULARY) {
        if (!entry.layers.includes('dp_krunt')) continue;
        const rawJoined = feature.raw[entry.eeAttribute];
        if (rawJoined === undefined) continue;
        const slots = rawJoined.split(';').map((s) => s.trim());
        slots.forEach((slot, i) => {
            const parsed = parseEeEhitusoigusNumber(slot);
            if (parsed.unknown && slot === '') return; // an empty slot in a joined list = not stated for that use
            const useToken = useTokens[i] !== undefined && useTokens[i] !== '' ? useTokens[i]! : null;
            rules.push(
                buildRule({
                    // The use token (verbatim, ids are opaque) keeps sibling per-use rules
                    // unique; positional fallback only when the use column has no token.
                    id: `${idBase}-${entry.parameter}-${useToken ?? `pos${i + 1}`}`,
                    parameter: entry.parameter,
                    value: parsed.unknown ? null : parsed.value,
                    unit: entry.unit,
                    dataset: 'dp_krunt',
                    objectLabel,
                    plan,
                    fetchedAtIso,
                    tier: parsed.unknown ? 6 : 1,
                    derivation: 'DIRECT',
                    valueLocation: 'attribute',
                    note:
                        `slot ${i + 1} of "; "-joined ${entry.eeAttribute}=` +
                        `${JSON.stringify(rawJoined)} (slot-aligned with otstarve, measured 2026-09-01)` +
                        (parsed.unknown
                            ? ' — empty/0 means UNKNOWN, never 0 and never no-limit (lane 4 EE-1)'
                            : ''),
                    basis: target.basis,
                    inlineGeometry: target.inlineGeometry,
                    useScope: useToken !== null ? [useToken] : [],
                }),
            );
        });
    }
    return { plan: target.plan, prescription: target.prescription, rules };
}
