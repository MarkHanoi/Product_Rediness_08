// LANE E6-PL — POLAND (PL) · the chain: APP GML 2.0 document → canonical rule set, and
// parcel → (POG zone) → rules. PURE ORCHESTRATION of typed outcomes + the pure mapper — no
// business logic, no envelope math, no geometry math, no typology decisions.
//
// ⚠ THE LIVE-DATA CALENDAR, ENCODED RATHER THAN IMPLIED (the brief's binding instruction).
// The Rejestr Urbanistyczny transition completes 2026-11-30 and this lane's one live discovery
// attempt found NO servable POG endpoint (`PL_RU_ENDPOINT_DISCOVERY`, verbatim transcript).
// So `fetchPlPogDocument` REFUSES BY NAME by default and the chain runs on a SUPPLIED document
// (today: the official ministry sample). The refusal is `transient`, never `absent`: "the
// national service is not published yet" is not "there is no plan at this parcel", and
// collapsing them would be exactly the failure≠absence conflation §CONTEXT-DATA-HONESTY
// forbids. It carries an ESCAPE HATCH (`deps.fetchPogGml`) so the refusing half is not a dead
// end — the day RU publishes, ONE function changes and the grade improves visibly
// (`PL_CHAIN_GRADES`), rather than the adapter being silently rewritten.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type FetchOutcome,
    type SiteIntelDocument,
    type SiteIntelPlan,
    type SiteIntelRule,
    type SiteIntelVersion,
    type SiteIntelZone,
} from '@pryzm/schemas';
import { parseAppGml, type AppGmlDocument, type AppStrefaPlanistyczna } from '../../parsers/appGml/index.js';
import {
    mapPlAktToPlanContext,
    mapPlStrefaToRules,
    plHrefMatchesIip,
    type PlPlanContext,
} from './plRuleMapper.js';
import { PL_RU_ENDPOINT_DISCOVERY, PL_RU_TRANSITION_ENDS } from './plSources.js';
import { resolvePlParcelById, type PlCadastralParcel, type PlUldkDeps } from './plUldkClient.js';

const tracer = trace.getTracer('pryzm.siteintel.pl');

/**
 * §J `precedence: ApplicabilityLadder` — Poland's, as DATA (analogous to DK's byggefelt →
 * delområde → lokalplan → ramme → BR18). Recorded with its honest caveat; NO resolution
 * algorithm lives here (verdict §F.7: rank is a fact, precedence is the engine's job).
 */
export const PL_APPLICABILITY_LADDER = [
    {
        step: 'MPZP (miejscowy plan zagospodarowania przestrzennego) — parcel-precise ustalenia',
        mode:
            'DOCUMENT today: the mandatory APP minimum for an MPZP is plan BOUNDARY + ' +
            'georeferenced raster + link to the legal text, not vectorised zoning with ' +
            'attributes (lane 4 §PL-3). Numeric rules are tier 4→5 extraction; some gminy ' +
            'vectorise voluntarily.',
    },
    {
        step: 'POG (plan ogólny gminy) strefa planistyczna — gmina-wide zone ceilings',
        mode:
            'STRUCTURED: this adapter. FAR / coverage / height / green share as APP 2.0 ' +
            'attributes. Upper-bound ceilings for the whole strefa, NOT parcel-level building ' +
            'lines (lane 4 §PL-2 honesty limit).',
    },
    {
        step: 'WZ (decyzja o warunkach zabudowy) where no MPZP exists',
        mode:
            'PER-CASE administrative decision; the 2023 reform time-limits it (5 y) and ties ' +
            'it to the POG. Not a published layer — absent from this adapter by design.',
    },
    {
        step: 'not-in-RU disambiguation',
        mode:
            'absent from the register is NOT "no plan": RU data may be INCOMPLETE until ' +
            `${PL_RU_TRANSITION_ENDS}, and POG adoption itself ran to the 2026-08-31 deadline. ` +
            'A municipal confirmation step, never an assumption.',
    },
] as const;

/** The named refusal token the not-yet-live POG channel returns. ONE spelling, exported. */
export const PL_POG_NOT_YET_LIVE_REASON =
    'endpoint-unreachable: no Rejestr Urbanistyczny POG service endpoint is published yet ' +
    `(transition completes ${PL_RU_TRANSITION_ENDS}; discovery attempted ` +
    `${PL_RU_ENDPOINT_DISCOVERY.date}, see PL_RU_ENDPOINT_DISCOVERY). Supply the APP GML ` +
    'document via deps.fetchPogGml, or call mapPlAppGmlDocument on a downloaded export.';

/** One resolved strefa: its minted Zone and the rules that cite it. */
export interface PlResolvedZone {
    readonly strefa: AppStrefaPlanistyczna;
    /** The minted `SiteIntelZone`, or null (see the R1 referent ladder in the mapper). */
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
    readonly caveats: readonly string[];
}

/** A census row for a feature class this adapter deliberately does NOT map. */
export interface PlUnmappedFeatureClass {
    readonly featureType: string;
    readonly count: number;
    readonly reason: string;
}

/** The canonical rule set one APP GML planning-act document yields. */
export interface PlPogRuleSet {
    /** The minted Plan + Version + Documents for the act this document carries. */
    readonly planContext: PlPlanContext;
    readonly plan: SiteIntelPlan | null;
    readonly planVersion: SiteIntelVersion | null;
    readonly documents: readonly SiteIntelDocument[];
    readonly zones: readonly PlResolvedZone[];
    /** Every rule of every zone, flattened — the §J `rules` answer. */
    readonly rules: readonly SiteIntelRule[];
    /**
     * COMPLETENESS, STATED: feature classes present in the document that this lane does not
     * map. Never a silent drop — a consumer can see exactly what it is not being told
     * (E4 control 2: mapping them is outside this lane's approved scope; control 10: recorded).
     */
    readonly unmapped: readonly PlUnmappedFeatureClass[];
    readonly caveats: readonly string[];
}

/* ─────────────────────── document → canonical rule set ────────────────── */

/**
 * PURE: one parsed APP GML document → the canonical rule set. Deterministic; no clock (the
 * caller passes `fetchedAtIso`), no I/O.
 *
 * MULTI-ACT DOCUMENTS: a file carrying more than one act is refused rather than guessed —
 * every strefa references its act by xlink, and picking "the first act" for a strefa whose
 * `plan` href points at a different one would attach rules to the wrong instrument. The
 * official sample carries exactly one act.
 */
export function mapPlAppGmlDocument(doc: AppGmlDocument, fetchedAtIso: string): PlPogRuleSet {
    const caveats: string[] = [];
    if (doc.akty.length > 1) {
        throw new Error(
            `pl-pog-chain: ${doc.akty.length} akty planowania in one document — this lane maps ` +
                'single-act exports only; attaching a strefa to the wrong act is a silent ' +
                'mis-citation, so it refuses by name instead (E4 control 2)',
        );
    }
    const akt = doc.akty[0] ?? null;
    const ctx = mapPlAktToPlanContext(akt, doc.dokumentyFormalne);

    const zones: PlResolvedZone[] = [];
    const rules: SiteIntelRule[] = [];
    for (const strefa of doc.strefyPlanistyczne) {
        // The strefa→act join, measured on the official sample: `app:plan` is a VERSION-LESS
        // xlink (`…/AktPlanowaniaPrzestrzennego/PL.ZIPPZP.11111/321202-POG/1POG`) while the
        // act's own identifier carries the version segment. A strefa whose href does not match
        // the document's act keeps the plan-less (inline-geometry) leg rather than borrowing it.
        const belongs = akt !== null && plHrefMatchesIip(strefa.plan.href, akt.idIIP);
        const zoneCtx: PlPlanContext = belongs
            ? ctx
            : {
                  akt: null,
                  adoptingDocument: null,
                  plan: null,
                  planVersion: null,
                  documents: [],
                  caveats: [
                      `strefa ${strefa.oznaczenie}: app:plan href ${strefa.plan.href} does not ` +
                          'resolve to an act in this document',
                  ],
              };
        const mapped = mapPlStrefaToRules(strefa, zoneCtx, fetchedAtIso);
        zones.push({
            strefa,
            zone: mapped.zone,
            rules: mapped.rules,
            caveats: mapped.caveats,
        });
        rules.push(...mapped.rules);
    }

    const unmapped: PlUnmappedFeatureClass[] = [];
    const record = (featureType: string, count: number, reason: string): void => {
        if (count > 0) unmapped.push({ featureType, count, reason });
    };
    record(
        'app:ObszarUzupelnieniaZabudowy',
        doc.obszaryUzupelnieniaZabudowy.length,
        'infill-permitted overlay — carries no numeric ceiling; whether it is a Zone or a ' +
            'boolean Rule with a geometry leg is a modelling decision outside this lane scope',
    );
    record(
        'app:ObszarZabudowySrodmiejskiej',
        doc.obszaryZabudowySrodmiejskiej.length,
        'downtown-regime overlay — RELAXES statutory minimums (notably the green share); ' +
            'unmapped here, so a rule set over a parcel inside one is INCOMPLETE, not wrong',
    );
    record(
        'app:ObszarStandardowDostepnosciInfrastrukturySpolecznej',
        doc.obszaryStandardowDostepnosci.length,
        'social-infrastructure access standards (18 measured distances) — a service-standard ' +
            'family, not a building envelope; outside this lane scope',
    );
    record(
        'app:RysunekAktuPlanowaniaPrzestrzennego',
        doc.rysunki.length,
        'the act drawing (georeferenced raster link) — a document artefact, not a rule source',
    );
    if (doc.unrecognizedMembers.length > 0) {
        caveats.push(
            `${doc.unrecognizedMembers.length} member(s) of this document are not APP 2.0 ` +
                'features and were not mapped',
        );
    }
    if (doc.collection.numberReturned !== null) {
        const claimed = Number(doc.collection.numberReturned);
        const actual =
            doc.akty.length +
            doc.strefyPlanistyczne.length +
            doc.obszaryUzupelnieniaZabudowy.length +
            doc.obszaryZabudowySrodmiejskiej.length +
            doc.obszaryStandardowDostepnosci.length +
            doc.dokumentyFormalne.length +
            doc.rysunki.length +
            doc.unrecognizedMembers.length;
        if (Number.isFinite(claimed) && claimed !== actual) {
            // The official sample declares numberReturned="6" while carrying 37 members (the
            // E2b parser lane recorded it and left reconciliation to the adapter — this is that
            // reconciliation: RECORD the disagreement, trust the members, invent nothing).
            caveats.push(
                `collection header claims numberReturned=${doc.collection.numberReturned} but ` +
                    `${actual} members are present — the members are authoritative here; the ` +
                    'header is transcribed, not obeyed',
            );
        }
    }

    return {
        planContext: ctx,
        plan: ctx.plan,
        planVersion: ctx.planVersion,
        documents: ctx.documents,
        zones,
        rules,
        unmapped,
        caveats,
    };
}

/**
 * Parse an APP GML 2.0 document string and map it. The parser's three-way outcome is bridged
 * onto `FetchOutcome` WITHOUT collapsing any arm: `parsed` → found, `empty` (a well-formed
 * collection with zero members) → ABSENT (the register answered and there is nothing here),
 * `refused` (malformed / not APP 2.0) → TRANSIENT naming the reason and the element path.
 */
export function parsePlPogDocument(gml: string, fetchedAtIso: string): FetchOutcome<PlPogRuleSet> {
    const outcome = parseAppGml(gml);
    if (outcome.status === 'empty') {
        return fetchAbsent(`no-plan: APP GML collection carries no members (${outcome.reason})`);
    }
    if (outcome.status === 'refused') {
        return fetchTransient(
            `upstream-failed: APP GML refused — ${outcome.reason} at ${outcome.path}: ${outcome.detail}`,
        );
    }
    try {
        return fetchFound(mapPlAppGmlDocument(outcome.document, fetchedAtIso));
    } catch (e) {
        return fetchTransient(`mapper-refused: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/* ────────────────────────── the not-yet-live seam ─────────────────────── */

/** Dependencies of the POG document leg. */
export interface PlPogDeps {
    /**
     * THE ESCAPE HATCH / THE FLIP POINT. Supply a fetcher (a downloaded export today, the RU
     * service after the transition) and the whole chain runs live. Absent, the leg refuses BY
     * NAME rather than pretending — and the refusal is retryable-transient, not absence.
     */
    readonly fetchPogGml?: (gminaRef: string) => Promise<FetchOutcome<string>>;
}

/**
 * The POG document leg. TODAY: refuses by name unless a fetcher is injected — there is no
 * published national endpoint (see `PL_RU_ENDPOINT_DISCOVERY`). This is the ONE function that
 * changes when Rejestr Urbanistyczny publishes its WFS/CSW services.
 */
export async function fetchPlPogDocument(
    gminaRef: string,
    deps: PlPogDeps = {},
): Promise<FetchOutcome<string>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.pl.fetchPogDocument',
        async (span): Promise<FetchOutcome<string>> => {
            try {
                span.setAttribute('pl.gminaRef', gminaRef);
                if (deps.fetchPogGml === undefined) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'not-yet-live' });
                    return fetchTransient(PL_POG_NOT_YET_LIVE_REASON);
                }
                const outcome = await deps.fetchPogGml(gminaRef);
                span.setStatus(
                    outcome.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                        : { code: SpanStatusCode.OK },
                );
                return outcome;
            } finally {
                span.end();
            }
        },
    );
}

/* ─────────────────────── parcel → zone (the join seam) ────────────────── */

/**
 * The parcel→strefa spatial join, as an INJECTED dependency. It is not implemented here on
 * purpose, and the default REFUSES BY NAME with the measured reason:
 *
 *   • the ULDK parcel arrives in EPSG:2180 (PUWG 1992) and the official POG sample draws its
 *     zones in EPSG:2176 (PUWG 2000 strefa 5) — a cross-CRS point-in-polygon needs a
 *     reprojection this lane does not own, and "never measure after a lossy reprojection" is a
 *     standing rule here;
 *   • a repo grep on 2026-09-01 finds no point-in-polygon solver at this layer to adopt, and
 *     writing one would be a rival (the EE adapter deliberately intersects SERVER-SIDE instead);
 *   • and the official sample is a SYNTHETIC gmina (PL.ZIPPZP.11111 "gmina ABC") whose zones do
 *     not cover Warszawa or Kraków anyway, so a join over it would be theatre.
 *
 * Injecting a locator (a served spatial query once RU is live, or a caller that already knows
 * its strefa) makes the whole chain run end-to-end — the refusing half has its escape hatch.
 */
export type PlStrefaLocator = (
    parcel: PlCadastralParcel,
    ruleSet: PlPogRuleSet,
) => FetchOutcome<PlResolvedZone>;

/** The default locator: a NAMED, self-evidencing refusal. Never a silent absence. */
export function defaultPlStrefaLocator(
    parcel: PlCadastralParcel,
    ruleSet: PlPogRuleSet,
): FetchOutcome<PlResolvedZone> {
    const zoneCrs = ruleSet.zones.find((z) => z.zone !== null)?.zone?.geometry.crs ?? 'unknown';
    return fetchTransient(
        `no-spatial-join: parcel ${parcel.id} is served in ${parcel.crs} and the POG zones in ` +
            `${zoneCrs}; this adapter performs no reprojection and no point-in-polygon (no ` +
            'solver at this layer to adopt, and measuring after a lossy reprojection is ' +
            'forbidden here). Inject a PlStrefaLocator — a served spatial query once Rejestr ' +
            `Urbanistyczny publishes (${PL_RU_TRANSITION_ENDS}) — to complete this leg. This is ` +
            'NOT "no zone at this parcel".',
    );
}

/**
 * Resolve which strefa applies at a parcel. Pure orchestration over the injected locator; the
 * default refuses by name (see above), so a caller can never mistake "not joined" for "no zone".
 */
export function resolvePlZoneAtParcel(
    parcel: PlCadastralParcel,
    ruleSet: PlPogRuleSet,
    locator: PlStrefaLocator = defaultPlStrefaLocator,
): FetchOutcome<PlResolvedZone> {
    return locator(parcel, ruleSet);
}

/* ──────────────────────────────── the chain ───────────────────────────── */

/** The §E1d-shaped acceptance chain for one Polish parcel. */
export interface PlParcelChain {
    readonly parcel: PlCadastralParcel;
    /** The POG rule set for the parcel's gmina — today only from a SUPPLIED document. */
    readonly pog: FetchOutcome<PlPogRuleSet>;
    /** Which strefa applies here — the join leg (see `defaultPlStrefaLocator`). */
    readonly zoneAtParcel: FetchOutcome<PlResolvedZone>;
}

/** Everything the chain needs injected — every leg unit-testable without the network. */
export interface PlChainDeps extends PlUldkDeps, PlPogDeps {
    /** A POG document already in hand (a downloaded gmina export, or the official sample). */
    readonly pogGml?: string;
    /** The parcel→strefa join (see `PlStrefaLocator`). */
    readonly strefaLocator?: PlStrefaLocator;
}

/**
 * Resolve the chain for a Polish parcel id: parcel (ULDK, live + keyless) → POG document
 * (supplied, or refused by name) → rules (pure mapper) → the zone-at-parcel join (injected).
 *
 * The parcel leg failing fails the chain (there is nothing to hang the rest on); every other
 * leg is carried as its OWN `FetchOutcome`, so a caller sees exactly which step is which grade.
 */
export async function resolvePlParcelChain(
    parcelId: string,
    deps: PlChainDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<PlParcelChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.pl.resolveParcelChain',
        async (span): Promise<FetchOutcome<PlParcelChain>> => {
            try {
                span.setAttribute('pl.parcelId', parcelId);
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const parcelOutcome = await resolvePlParcelById(parcelId, deps);
                if (parcelOutcome.status !== 'found') {
                    span.setStatus(
                        parcelOutcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: parcelOutcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return parcelOutcome;
                }
                const parcel = parcelOutcome.value;

                const gmlOutcome: FetchOutcome<string> =
                    deps.pogGml !== undefined
                        ? fetchFound(deps.pogGml)
                        : await fetchPlPogDocument(parcel.commune ?? parcelId, deps);

                const pog: FetchOutcome<PlPogRuleSet> =
                    gmlOutcome.status === 'found'
                        ? parsePlPogDocument(gmlOutcome.value, fetchedAtIso)
                        : gmlOutcome;

                const zoneAtParcel: FetchOutcome<PlResolvedZone> =
                    pog.status === 'found'
                        ? resolvePlZoneAtParcel(parcel, pog.value, deps.strefaLocator)
                        : pog;

                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound({ parcel, pog, zoneAtParcel });
            } finally {
                span.end();
            }
        },
    );
}

/* ───────────────────────── the regime-flip baseline ───────────────────── */

/**
 * THE PRE-FLIP GRADE BASELINE (20-parcel table rows 19–20: "the adapter's RuleSource kind must
 * flip document→structured WITHOUT a core change when RU fills; the test pins the pre-flip
 * grades so the flip is visible as a grade IMPROVEMENT, not a silent rewrite").
 *
 * Pinned by `__tests__/plAdapter.test.ts`. Changing a value here without a dated cause is the
 * silent rewrite this object exists to prevent; the table's rule 4 makes it shrink-only in the
 * MISSING/AI direction.
 */
export const PL_CHAIN_GRADES = Object.freeze({
    measuredOn: '2026-09-01',
    /** parcel — ULDK, live + keyless, both baseline parcels resolved this session. */
    P: 'DIRECT',
    /** contextual buildings/terrain — BDOT10k GeoParquet probed by the audit, NOT wired here. */
    C: 'MISSING',
    /** planning source answers — the APP GML channel answers as a DOCUMENT, not a service. */
    S: 'DIRECT-document / MISSING-service',
    /** applicable plan — DIRECT from the document's own act; no service to ask per parcel. */
    PL: 'DIRECT-in-document / MISSING-per-parcel',
    /** applicable numeric rule — structured and proven on the sample; not servable per parcel. */
    R: 'DIRECT-in-document / MISSING-per-parcel',
    /** evidence — machine-anchorable: gml:id + IIP identity on every rule; no doc URL in the sample. */
    E: 'DIRECT-identity / MISSING-document-url',
    /** deterministic constraint set — typed SiteIntelRule[] with minted referents. */
    D: 'DIRECT',
    /** envelope — not computed by this lane. */
    V: 'MISSING',
    /** development potential — REFUSED, not missing: see the R2 denominator note. */
    DP: 'REFUSED (statutory denominator działka budowlana is unresolved — computing GFA from ' +
        'FAR × cadastral parcel area would be the C63 denominator trap)',
    flipsWhen: `Rejestr Urbanistyczny publishes POG WFS/CSW (transition ends ${PL_RU_TRANSITION_ENDS})`,
    flipPoint: 'fetchPlPogDocument (one function) + a served PlStrefaLocator — no core change',
});
