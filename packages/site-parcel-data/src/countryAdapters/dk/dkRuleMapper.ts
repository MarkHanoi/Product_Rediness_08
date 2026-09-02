// LANE DK (E1 verdict §G DK-parallel · gate decision §C) · the PURE rule mapper:
// one Plandata plan feature's attributes → E1a `SiteIntelRule` objects + the minted
// `SiteIntelPlan` those rules cite (the R1 referent contract), against the FROZEN R-batch
// shapes. This is where deliverables 2–4 land:
//
//   • R2 valueBasis (deliverable 2): the `bebygpct` rule carries the SERVED denominator
//     code VERBATIM — `{scheme: 'dk-bygberegnaf', code: '1'|'2'|'3'|'4'}` — read from the
//     feature's `bebygpctaf` attribute (codelist `pdk:theme_pdk_codelist_bygberegnaf_v`,
//     imported at L0 in `@pryzm/schemas` vocabularies/dk.ts). A code OUTSIDE the state
//     codelist is a NATIONAL SCHEMA CHANGE and FAILS the mapping by name — never absorbed
//     (vocabularies/dk.ts doctrine). When `bebygpctaf` is not served, NO valueBasis is
//     emitted and the rule's note names the gap — the consumer (`dkGfa.ts`) then REFUSES a
//     per-parcel multiply (C63 / L-449; UNKNOWN stays distinct, E4 control 9).
//   • R1 rank (deliverable 3): every rule carries `{scheme: 'dk-plan-ladder', level}` —
//     byggefelt 1 · lokalplandelomraade 2 · lokalplan 3 · kommuneplanramme 4 (lane 2
//     §DK-1's measured precedence). RESOLUTION stays ENGINE-side (verdict §F.7):
//     `evaluateZoneParameter` picks min level on one scheme and refuses ties.
//   • lifecycle + kompleks (deliverable 4): `Plan.status` mirrors the served
//     `status`/`planstatus` attribute VERBATIM ('V' as probed live 2026-09-01), falling
//     back to the queried lifecycle variant token ('vedtaget'); `datovedt`/`datoikraft`
//     mirror into `adoptedDate`/`inForceFrom`; a SERVED `kompleks` flag becomes a boolean
//     rule verbatim (true = "rules too complex to structure — PDF-only", the register's own
//     honesty flag; only 40 plans nationally, lane 2 §DK-1). A byggefelt's served
//     `bygvejledende` mirrors into R5 `normativeForce` (the DK form provenance.ts names).
//
// THE UNKNOWN RULE (lane brief: "tier-6 UNKNOWN rows are EXPECTED and must be visible,
// never dropped" — DK numeric fill is 30–61% by layer, NOT ~96%): an attribute the layer's
// DECLARED schema carries (DescribeFeatureType, lane 2 §DK-1) but the feature does not
// fill maps to value=null at confidence tier 6 — UNKNOWN ≠ 0 ≠ no-limit. Keyed off the
// DECLARED layer vocabulary, not the served bag, so a GeoServer that omits null keys
// cannot silently drop the row. `byggefelt` declares NO bebygpct field — that is field
// absence, not value unknownness: no bebygpct rule is emitted there.
//
// PURE, TOTAL, DETERMINISTIC: no fetch, no clock (the caller passes `fetchedAtIso`), no
// business logic. The refusals it can make are structural and THROW BY NAME: a feature
// with no mintable plan identity (nothing a rule could apply to — this hand-off carries
// no geometry), and a bebygpctaf outside the closed state codelist.

import {
    DkBygberegnafCodeSchema,
    SiteIntelPlanSchema,
    SiteIntelRuleSchema,
    dkBygberegnafRow,
    type SiteIntelPlan,
    type SiteIntelRule,
} from '@pryzm/schemas';
import type { PlandataLayer } from '../../providers/mapPlandataToZoningRecord.js';
import { DK_PLANDATA_LAYERS } from './dkPlandataClient.js';
import { DK_PLANDATA_SOURCE_ID } from './dkSources.js';

/** The one DK instrument-ladder scheme id (R1 rank.scheme) — deliverable 3's spelling. */
export const DK_PLAN_LADDER_SCHEME = 'dk-plan-ladder';

/** The R2 valueBasis scheme id for the bebyggelsesprocent denominator codelist. */
export const DK_BYGBEREGNAF_SCHEME = 'dk-bygberegnaf';

/** The publishing authority string carried in every DK rule's source ref. */
export const DK_RULE_AUTHORITY = 'Plandata.dk (Plan- og Landdistriktsstyrelsen)';

/** One row of the DK→rule vocabulary (attribute names verbatim from DescribeFeatureType). */
export interface DkRuleVocabularyEntry {
    readonly dkAttribute: 'bebygpct' | 'maxbygnhjd' | 'maxetager';
    readonly unit: string | null;
    /** Which ladder layers DECLARE the field (lane 2 §DK-1: byggefelt has no bebygpct). */
    readonly layers: readonly PlandataLayer[];
}

/**
 * The DK numeric-rule vocabulary this lane maps (the three L-449-signed envelope
 * attributes). Parameter names stay the VERBATIM national attribute names — the frozen
 * R-batch DK fixture spells the parameter `'bebygpct'` (siteintel.test.ts), and
 * provenance.ts lists `"bebygpct"` among valid canonical parameter spellings; mapping onto
 * C58 seats is the declarative-parameter vocabulary's job (E1bc), not the adapter's.
 */
export const DK_RULE_VOCABULARY: readonly DkRuleVocabularyEntry[] = [
    {
        dkAttribute: 'bebygpct',
        unit: '%',
        layers: ['lokalplandelomraade', 'lokalplan', 'kommuneplanramme'],
    },
    {
        dkAttribute: 'maxbygnhjd',
        unit: 'm',
        layers: ['byggefelt', 'lokalplandelomraade', 'lokalplan', 'kommuneplanramme'],
    },
    {
        dkAttribute: 'maxetager',
        unit: null,
        layers: ['byggefelt', 'lokalplandelomraade', 'lokalplan', 'kommuneplanramme'],
    },
];

/** The rank rung for a ladder layer (single source: the client's ladder table). */
export function dkPlanLadderLevel(layer: PlandataLayer): 1 | 2 | 3 | 4 {
    const row = DK_PLANDATA_LAYERS.find((l) => l.layer === layer);
    // The ladder table is total over PlandataLayer; the throw is unreachable by type.
    if (!row) throw new Error(`dk-rule-mapper: no ladder rung for layer "${layer}"`);
    return row.rankLevel;
}

/** First non-empty string among the candidates, else null (mirrors the C58 mapper's). */
function firstString(...vals: unknown[]): string | null {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
}

/** Plandata WFS boolean (true/false or GeoServer string forms), else null. */
function wfsBool(v: unknown): boolean | null {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === 't' || s === '1') return true;
        if (s === 'false' || s === 'f' || s === '0') return false;
    }
    return null;
}

/**
 * Plandata serves its date set as YYYYMMDD integers (`datovedt: 20241212`, measured live
 * 2026-09-01). Deterministic format conversion to the ISO calendar-date string the L0
 * schema requires; null for absent/malformed — never a guessed date.
 */
export function dkYyyymmddToIso(v: unknown): string | null {
    const s =
        typeof v === 'number' && Number.isInteger(v)
            ? String(v)
            : typeof v === 'string'
              ? v.trim()
              : '';
    if (!/^\d{8}$/.test(s)) return null;
    const mm = Number(s.slice(4, 6));
    const dd = Number(s.slice(6, 8));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * PURE: parse one Plandata numeric attribute under the UNKNOWN rule.
 * A finite positive number (decimals kept VERBATIM — maxetager "5.5" stays 5.5; flooring
 * is C58-consumer semantics, not register mirroring) → value; everything else — absent
 * key, null, "", 0, negative, non-numeric — → UNKNOWN (value null, tier 6). A served 0 is
 * fill-quality, not a legal zero (the EE lesson; a real prohibition arrives as a drawn
 * instrument, not a zero in this column).
 */
export function parseDkPlanNumber(raw: unknown): {
    readonly value: number | null;
    readonly unknown: boolean;
    readonly raw: string;
} {
    if (raw === null || raw === undefined) return { value: null, unknown: true, raw: 'null' };
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(n) || n <= 0) return { value: null, unknown: true, raw: String(raw) };
    return { value: n, unknown: false, raw: String(raw) };
}

/** What one mapped feature yields: the minted referent + the rules that cite it. */
export interface DkMappedRuleSet {
    /** The minted Plan entity every rule's `basis` cites. */
    readonly plan: SiteIntelPlan;
    readonly rules: readonly SiteIntelRule[];
}

/**
 * PURE: one Plandata feature (a ladder layer + its raw WFS `properties`) → the minted
 * `SiteIntelPlan` + `SiteIntelRule[]`. Every rule validates against `SiteIntelRuleSchema`
 * and cites the plan minted RIGHT HERE (R1 referent contract — no dangling strings).
 */
export function mapDkFeatureToRules(
    layer: PlandataLayer,
    properties: Readonly<Record<string, unknown>>,
    fetchedAtIso: string,
): DkMappedRuleSet {
    const p = properties;
    const level = dkPlanLadderLevel(layer);
    const typeName = DK_PLANDATA_LAYERS.find((l) => l.layer === layer)!.typeName;

    // ── Plan identity (the R1 referent; throw BY NAME when nothing is mintable). ──
    const planId = firstString(p['planid'], p['lokplan_id'], p['komplan_id'], p['plannr'], p['lp_plannr']);
    if (planId === null) {
        throw new Error(
            `dk-rule-mapper: ${layer} feature served NO plan identity (planid/lokplan_id/` +
                'komplan_id/plannr all absent) — this hand-off carries no geometry, so there is ' +
                'nothing a rule could apply to (R1 at-least-one-leg); refusing by name.',
        );
    }
    const planNr = firstString(p['plannr'], p['lp_plannr']);
    // (plannavn/lp_plannavn are read but not yet consumed downstream; the binding was removed
    // 2026-09-02 when the package barrel exposed this file to the stricter ROOT tsc, which
    // errors on unused locals — re-derive with firstString(p['plannavn'], p['lp_plannavn'])
    // when a consumer lands.)
    const doklink = firstString(p['doklink']);
    // Lifecycle, MIRRORED VERBATIM where served: lokalplan-family features serve `status`,
    // rammer serve `planstatus` (both 'V' live 2026-09-01). Fallback = the queried layer
    // lifecycle variant itself (`_vedtaget` — adopted), which is served semantics too: the
    // adapter queries only adopted variants (dkPlandataClient measured fact 3).
    const status = firstString(p['status'], p['planstatus']) ?? 'vedtaget';
    const adoptedDate = dkYyyymmddToIso(p['datovedt']);
    const inForceFrom = dkYyyymmddToIso(p['datoikraft']);

    const plan = SiteIntelPlanSchema.parse({
        id: `dk-plan-${planId}`,
        // The Danish instrument, verbatim: byggefelt/delområde features are PARTS of a
        // lokalplan (same instrument); rammer are kommuneplan frames.
        kind: layer === 'kommuneplanramme' ? 'kommuneplanramme' : 'lokalplan',
        status,
        adoptedDate,
        inForceFrom,
        inForceTo: null,
        // No SiteIntelDocument entities are minted — doklink travels VERBATIM on every
        // rule's `source.document` (the EE pattern; the structured path needs no retriever).
        documents: [],
        geometryRef: null,
        source: DK_PLANDATA_SOURCE_ID,
        version: null,
    });

    // ── R3 validity: legal when the register serves a machine date axis. ─────────
    const validity =
        inForceFrom !== null
            ? { validityBasis: 'legal' as const, valid_from: inForceFrom }
            : adoptedDate !== null
              ? { validityBasis: 'legal' as const, valid_from: adoptedDate }
              : { validityBasis: 'ingestion' as const, valid_from: fetchedAtIso };

    // ── R5 normativeForce: a byggefelt's served `bygvejledende` (indicative), verbatim. ──
    const normativeForce =
        layer === 'byggefelt' && wfsBool(p['bygvejledende']) === true ? 'bygvejledende' : null;

    const delnr = firstString(p['delnr']);
    const objectLabel =
        layer === 'lokalplandelomraade' && delnr !== null
            ? `delområde ${delnr}`
            : layer === 'byggefelt'
              ? 'byggefelt'
              : null;

    const sourceRef = {
        country: 'DK',
        authority: DK_RULE_AUTHORITY,
        dataset: typeName,
        plan_id: planNr ?? planId,
        object_id: objectLabel,
        document: doklink,
        article: null,
        page: null,
    };

    const idBase = `dk-${planId}-${layer}${delnr !== null ? `-del${delnr}` : ''}`;

    const buildRule = (args: {
        readonly parameter: string;
        readonly value: number | string | boolean | null;
        readonly unit: string | null;
        readonly tier: 1 | 6;
        readonly note: string | null;
        readonly valueBasis?: { readonly scheme: string; readonly code: string };
    }): SiteIntelRule =>
        SiteIntelRuleSchema.parse({
            id: `${idBase}-${args.parameter}`,
            body: null,
            applicability: {
                basis: [{ kind: 'plan', ref: plan.id }],
                geometry: null,
                useScope: [],
                // Deliverable 3: the instrument-ladder rung as R1 rank — a FACT about the
                // rule; precedence RESOLUTION stays engine-side (verdict §F.7).
                rank: { scheme: DK_PLAN_LADDER_SCHEME, level },
                condition: null,
            },
            provenance: {
                parameter: args.parameter,
                value: args.value,
                unit: args.unit,
                source: sourceRef,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                ...(args.valueBasis !== undefined ? { valueBasis: args.valueBasis } : {}),
                confidence:
                    args.note !== null ? { tier: args.tier, note: args.note } : { tier: args.tier },
                normativeForce,
                validityBasis: validity.validityBasis,
                valid_from: validity.valid_from,
                valid_to: null,
            },
        });

    const rules: SiteIntelRule[] = [];

    for (const entry of DK_RULE_VOCABULARY) {
        if (!entry.layers.includes(layer)) continue; // field not DECLARED on this layer
        const parsed = parseDkPlanNumber(p[entry.dkAttribute]);

        // ── Deliverable 2: the SERVED denominator code on the bebygpct rule. ─────
        // Emitted whenever the register SERVES `bebygpctaf`, INCLUDING on a tier-6 row whose
        // `bebygpct` is unknown (measured 2026-09-01: 261 features nationally serve the code
        // with a null percentage — 21 lokalplan · 234 delområde · 6 ramme). The qualifier is
        // a served FACT about the rule; dropping it because the value is UNKNOWN would be
        // exactly the normalization loss E4 control 8 forbids.
        let valueBasis: { scheme: string; code: string } | undefined;
        let basisNote: string | null = null;
        if (entry.dkAttribute === 'bebygpct') {
            const afRaw = p['bebygpctaf'];
            const afServed = afRaw !== null && afRaw !== undefined && afRaw !== '';
            if (afServed) {
                const afNum =
                    typeof afRaw === 'number' ? afRaw : Number.parseInt(String(afRaw), 10);
                const af = DkBygberegnafCodeSchema.safeParse(afNum);
                if (!af.success) {
                    // Closed state codelist: a fifth value is a national schema change and
                    // must FAIL the parse, never be absorbed (vocabularies/dk.ts doctrine).
                    throw new Error(
                        `dk-rule-mapper: bebygpctaf=${String(afRaw)} is outside the state ` +
                            'bygberegnaf codelist {1,2,3,4} — a national schema change must fail ' +
                            'the mapping by name, never be absorbed (vocabularies/dk.ts).',
                    );
                }
                valueBasis = { scheme: DK_BYGBEREGNAF_SCHEME, code: String(af.data) };
                basisNote =
                    `beregnes af: ${dkBygberegnafRow(af.data).da} ` +
                    `(${dkBygberegnafRow(af.data).en})`;
            } else {
                basisNote =
                    'bebygpctaf NOT served — the denominator of this percentage is UNKNOWN; ' +
                    'a consumer must refuse a per-parcel multiply, never assume the parcel ' +
                    '(C63 / L-449 §DK-DENOMINATOR-BRANCH; UNKNOWN ≠ parcel-scoped)';
            }
        }

        if (parsed.unknown) {
            // Tier-6 UNKNOWN rows are EXPECTED (fill 30–61% by layer) and must be VISIBLE.
            rules.push(
                buildRule({
                    parameter: entry.dkAttribute,
                    value: null,
                    unit: entry.unit,
                    tier: 6,
                    note:
                        `Plandata declares ${entry.dkAttribute} on ${layer} but this feature ` +
                        `serves ${JSON.stringify(parsed.raw)} — UNKNOWN, never 0 and never ` +
                        'no-limit (lane 2 §DK-1 fill rates; REPORT §I)' +
                        (basisNote !== null ? ` · ${basisNote}` : ''),
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        } else {
            rules.push(
                buildRule({
                    parameter: entry.dkAttribute,
                    value: parsed.value,
                    unit: entry.unit,
                    tier: 1,
                    note: basisNote,
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        }
    }

    // ── Deliverable 4: the register's own `kompleks` honesty flag, VERBATIM where served.
    // true = "the plan's rules are too complex to structure — PDF-only" (lane 2 §DK-1:
    // only 40 plans nationally); false is served too (measured live: Aarhus lokalplan 591
    // serves kompleks=false) and is mirrored — served false ≠ absent.
    if ('kompleks' in p) {
        const kompleks = wfsBool(p['kompleks']);
        if (kompleks !== null) {
            rules.push(
                buildRule({
                    parameter: 'kompleks',
                    value: kompleks,
                    unit: null,
                    tier: 1,
                    note:
                        'register honesty flag, mirrored verbatim: true = rules too complex to ' +
                        'structure (PDF-only — read doklink); false = the plan claims its ' +
                        'structured fields are the rules',
                }),
            );
        }
    }

    return { plan, rules };
}
