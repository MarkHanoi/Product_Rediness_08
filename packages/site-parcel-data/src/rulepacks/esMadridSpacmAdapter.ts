// THE RULE ADAPTER — `spacm_*` attributes → the COMMON ENVELOPE SCHEMA.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS AND IS NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// IS:  a total, pure function from one published `VPLA_V_ORDENANZA` row to one
//      `CommonEnvelopeRecord` — a rule the SHIPPED engine can solve, or a named refusal.
// NOT: a solver, a fetcher, or a second rule model. It emits `@pryzm/schemas`' own `GeometricRule`
//      so an unsolvable shape is a COMPILE error rather than a runtime `undefined` on a
//      compliance number.
//
// ⛔ **NOTHING HERE PUBLISHES.** `MADRID_ENVELOPE_VERIFIED` stays `false`; the L-449 legal gate is
// unsigned and its flip is the founder's act, never an implementer's. Every record therefore
// carries a `verification-gate-closed` refusal in addition to whatever else is true — and the
// OTHER refusals are still computed and reported, because *"the gate is shut"* and *"a Plan
// Parcial governs this parcel"* are different facts and a user needs both.
//
// PURE. No I/O, no clock, no randomness. Same row in ⇒ byte-identical record out.

// §MADRID-SPACM-PORT (L-681) — ported VERBATIM from `tools/madrid-envelope-engine/adapter.ts`.
//
// ⚠ THE PORT IS THE WHOLE DELIVERABLE, SO IT IS ALSO THE WHOLE RISK. The adapter was proven on one
// real parcel — `4228504VK2742N`, CL Juan de Villanueva 10, BOADILLA DEL MONTE — and the move must
// not change that record by one byte. `tools/madrid-envelope-engine/proveParcel.ts` imports THIS
// file and re-prints the record on demand; `madridSpacmAdapterPort.test.ts` pins every field of it
// so a future refactor cannot quietly move a number.
//
// The only additions are OTel spans (P8) and `.js`-suffixed relative imports (this package's ESM
// convention). See `esMadridSpacmSchema.ts` §MADRID-SPACM-P8 for which exports carry a span.

import { trace } from '@opentelemetry/api';
import type { GeometricRule } from '@pryzm/schemas';
import type {
    CommonEnvelopeRecord, Contradiction, EnvelopeRules, Refusal,
} from './esMadridSpacmSchema.js';
import { unknown } from './esMadridSpacmSchema.js';
import { readNumeric, readOccupationPct, checkHeightAgainstStoreys, applyBand, BANDS } from './esMadridSpacmValidate.js';
import {
    classifyGrammar, isPublicSystemOrdinance, requiredParameters, hasVerticalLimit,
} from './esMadridSpacmGrammar.js';
import { routingRefusals, MADRID_MISSING_CONSTRAINTS } from './esMadridSpacmRoutingGuard.js';
import { isKnown } from './esMadridSpacmSchema.js';

const _tracer = trace.getTracer('pryzm.zoning');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE INPUT — exactly the published row, no more
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * One `sitcm:VPLA_V_ORDENANZA` row as the WFS returns it.
 *
 * ⚠ Every field is `unknown`-typed on purpose. The service publishes numbers as numbers, as
 * strings, and as nulls in the same column, and a type that promised `number | null` would be a
 * lie the compiler enforces on the reader instead of on the data.
 */
export interface SpacmOrdenanzaRow {
    readonly CDID?: unknown;
    /** ⚠ THE 3-DIGIT KEY. INE-5 with `28` STRIPPED — `'079'` is Madrid, `'28079'` returns ZERO. */
    readonly CD_MUNICIPIO?: unknown;
    readonly DS_MUNICIPIO?: unknown;
    readonly DS_NOMB_ORD?: unknown;
    readonly DS_NOM_AMB?: unknown;
    readonly DS_CLAS_SUE?: unknown;
    readonly NM_ALTURA?: unknown;
    readonly NM_N_PLTA?: unknown;
    readonly NM_OCP_MX?: unknown;
    readonly NM_FDO_MX_ED?: unknown;
    readonly NM_RTR_FRNT?: unknown;
    readonly NM_RTR_LATL?: unknown;
    readonly NM_RTR_POST?: unknown;
    readonly NM_C_ED_ORD?: unknown;
    readonly NM_C_ED_MAZ?: unknown;
    readonly NM_FRTE_MIN?: unknown;
    readonly DS_LEY?: unknown;
    readonly DS_DOCU?: unknown;
    readonly DS_PLANEAM_GRAL?: unknown;
    readonly FC_BOCM?: unknown;
}

/** Facts the row itself cannot carry — supplied by the caller from the ámbito layers / Catastro. */
export interface AdapterContext {
    /**
     * How many instruments the row's `(municipality, DS_NOM_AMB)` key resolves to.
     * ⛔ Default `0` means NO JOIN WAS ATTEMPTED, which is not the same as "one match" — the guard
     * only fires the ambiguity refusal on `> 1`, so an un-joined caller gets NO false clearance
     * and NO false alarm. The honest reading of `0` is recorded in `provenance.fields`.
     */
    readonly instrumentKeyMatches?: number;
    /** `DS_FIG_DES` from the joined ámbito row, when a join ran. */
    readonly instrumentFigure?: string | null;
    /**
     * ⭐ Did `DS_NOM_AMB` resolve in `VPLA_V_AMBITO` ∪ `VPLA_V_AMBITO_MODIF`? The REGISTER, not the
     * code's prefix, is the authority on whether a development instrument exists — see
     * `ambitoJoin.ts`, which measured 100 % resolution on every named row in four municipalities.
     */
    readonly ambitoResolvesInRegister?: boolean;
    /** The clicked parcel, once a Catastro join exists. The corpus itself contains NO PARCELS. */
    readonly parcel?: { readonly id?: string | null; readonly cadastralRef?: string | null; readonly area_m2?: number | null };
    /**
     * ⛔ THE L-449 LEGAL GATE. `false` until the founder signs. An implementer may not flip it,
     * and passing `true` from a test does not make a publication lawful — it only proves the
     * adapter's non-gate logic in isolation.
     */
    readonly verificationGateOpen?: boolean;
}

const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
};

/**
 * Compose the INE-5 code from the 3-digit key.
 *
 * ⚠ The `28` is the Comunidad de Madrid province prefix, and it is composed here rather than
 * stored so that no caller is tempted to query the WFS with it. `'079'` returns 22,181 rows;
 * `'28079'` returns **ZERO ON A CLEAN HTTP 200** — a wrong key and an empty municipality are the
 * same bytes.
 */
export function composeIne5(cd3: string): string {
    // P8 — emits `pryzm.zoning.madridSpacm.composeIne5`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.composeIne5');
    try {
        const ine5 = `28${cd3.padStart(3, '0')}`;
        span.setAttribute('cdMunicipio', cd3);
        span.setAttribute('ine5', ine5);
        return ine5;
    } finally {
        span.end();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Adapt one published ordinance row into the common envelope schema.
 *
 * DETERMINISTIC AND TOTAL: never throws, never fetches, never reads a clock. The same row adapted
 * twice yields an identical record — which is asserted by test, because a rule engine whose answer
 * depends on when you asked is not a rule engine.
 */
export function adaptSpacmRow(
    row: SpacmOrdenanzaRow,
    ctx: AdapterContext = {},
): CommonEnvelopeRecord {
    // P8 — emits `pryzm.zoning.madridSpacm.adaptSpacmRow`, the PARENT span of every per-parameter
    // decision below. Wrapping (rather than re-indenting) keeps the ported body verbatim.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.adaptSpacmRow');
    try {
        const record = adaptSpacmRowImpl(row, ctx);
        span.setAttribute('cdMunicipio', record.municipality.code);
        span.setAttribute('grammar', record.grammar);
        span.setAttribute('refusalCount', record.refusals.length);
        span.setAttribute('refusals', record.refusals.map((r) => r.reason).join(','));
        span.setAttribute('hasEnvelope', record.envelope !== null);
        return record;
    } finally {
        span.end();
    }
}

function adaptSpacmRowImpl(
    row: SpacmOrdenanzaRow,
    ctx: AdapterContext = {},
): CommonEnvelopeRecord {
    const fieldsRead: string[] = [];
    const note = (f: string) => { fieldsRead.push(f); };

    // ── 1 · IDENTITY ─────────────────────────────────────────────────────────────────────────
    const cd3 = str(row.CD_MUNICIPIO) ?? '';
    note('CD_MUNICIPIO');
    const muniName = str(row.DS_MUNICIPIO) ?? '';
    note('DS_MUNICIPIO');
    const ordinanceName = str(row.DS_NOMB_ORD);
    note('DS_NOMB_ORD');
    const ambitoToken = str(row.DS_NOM_AMB);
    note('DS_NOM_AMB');
    const soilClass = str(row.DS_CLAS_SUE);
    note('DS_CLAS_SUE');

    // ── 2 · PARAMETERS, each validated independently (ADR-0293 per-dimension tiering) ────────
    //
    // ⚠⚠ ORDER IS LOAD-BEARING: sentinel → CONTRADICTION → band. The MAJADAHONDA row is
    // `NM_ALTURA=85` / `NM_N_PLTA=2`. Band-first would reject 85 m as implausible and report
    // *"the height is out of range"* — true, and the wrong fact. The reportable root cause is that
    // TWO PUBLISHED COLUMNS CONTRADICT EACH OTHER, and a reviewer told only "out of range" hunts
    // for a typo in one field instead of distrusting both.
    const alturaRaw = readNumeric(row.NM_ALTURA, 'NM_ALTURA');
    note('NM_ALTURA');
    const plantasRaw = readNumeric(row.NM_N_PLTA, 'NM_N_PLTA');
    note('NM_N_PLTA');

    const vertical = checkHeightAgainstStoreys(alturaRaw, plantasRaw);
    const contradictions: Contradiction[] = vertical.contradiction ? [vertical.contradiction] : [];

    const rules: EnvelopeRules = {
        // The band runs LAST, on whatever survived the contradiction check.
        height_m: applyBand(vertical.height_m, BANDS.height_m),
        storeys: applyBand(vertical.storeys, BANDS.storeys),
        occupationPct: (note('NM_OCP_MX'), readOccupationPct(row.NM_OCP_MX)),
        depth_m: (note('NM_FDO_MX_ED'), readNumeric(row.NM_FDO_MX_ED, 'NM_FDO_MX_ED', BANDS.depth_m)),
        setbackFront_m: (note('NM_RTR_FRNT'), readNumeric(row.NM_RTR_FRNT, 'NM_RTR_FRNT', BANDS.setback_m)),
        setbackSide_m: (note('NM_RTR_LATL'), readNumeric(row.NM_RTR_LATL, 'NM_RTR_LATL', BANDS.setback_m)),
        setbackRear_m: (note('NM_RTR_POST'), readNumeric(row.NM_RTR_POST, 'NM_RTR_POST', BANDS.setback_m)),
        // ⚠ TWO different FAR columns exist and they are NOT interchangeable: `NM_C_ED_ORD` is per
        // ORDINANCE and `NM_C_ED_MAZ` is per MANZANA — a block-granularity figure (C58 §1.11).
        // The ordinance one is preferred; the manzana one is read only when it is absent, and the
        // `sourceField` on the Parameter records WHICH, so a consumer can tell the granularity.
        plotRatioFAR: (() => {
            note('NM_C_ED_ORD');
            const ord = readNumeric(row.NM_C_ED_ORD, 'NM_C_ED_ORD', BANDS.plotRatioFAR);
            if (isKnown(ord)) return ord;
            note('NM_C_ED_MAZ');
            return readNumeric(row.NM_C_ED_MAZ, 'NM_C_ED_MAZ', BANDS.plotRatioFAR);
        })(),
        minFrontage_m: (note('NM_FRTE_MIN'), readNumeric(row.NM_FRTE_MIN, 'NM_FRTE_MIN', BANDS.frontage_m)),
    };

    // ── 3 · GRAMMAR ──────────────────────────────────────────────────────────────────────────
    const isPublic = isPublicSystemOrdinance(ordinanceName);
    const classification = classifyGrammar(rules, ordinanceName);

    // ── 4 · ROUTING GUARD ────────────────────────────────────────────────────────────────────
    const refusals: Refusal[] = [
        ...routingRefusals({
            ambitoToken,
            instrumentFigure: ctx.instrumentFigure,
            instrumentKeyMatches: ctx.instrumentKeyMatches ?? 0,
            ambitoResolvesInRegister: ctx.ambitoResolvesInRegister,
            soilClass,
            isPublicSystem: isPublic,
        }),
    ];

    // ── 5 · PARAMETER REFUSALS ───────────────────────────────────────────────────────────────
    if (contradictions.length > 0) {
        refusals.push({
            reason: 'parameters-contradict',
            legallyGrounded: false,
            headline: 'Two published values for this zone contradict each other, so PRYZM will not '
                + 'publish either.',
            ordinanceRef: null,
            retryable: false,
        });
    }

    // ⚠ A public-system row is ALREADY refused on the law; adding "no grammar" on top would tell
    // the user we failed to compute something the ordinance never grants. Suppressed deliberately.
    if (!isPublic) {
        if (classification.grammar === 'unknown') {
            refusals.push({
                reason: 'no-grammar-determined',
                legallyGrounded: false,
                headline: 'The published record for this zone does not state enough to determine how '
                    + 'a building may be shaped on it, and PRYZM will not assume a shape.',
                ordinanceRef: null,
                retryable: false,
            });
        } else if (!hasVerticalLimit(rules.height_m, rules.storeys)) {
            // ⛔ NO HEIGHT, NO ENVELOPE. Setbacks alone give a FOOTPRINT, and a footprint published
            // as an envelope leaves the height unbounded — L-616's *"a missing constraint
            // OVERSTATES"* in its purest form.
            refusals.push({
                reason: 'required-parameter-unknown',
                legallyGrounded: false,
                headline: 'PRYZM can establish this zone\'s footprint rules but no maximum height or '
                    + 'storey count is published, so it cannot bound a building.',
                ordinanceRef: null,
                retryable: false,
            });
        } else {
            const missing = requiredParameters(classification.grammar).filter((k) => !isKnown(rules[k]));
            if (missing.length > 0) {
                refusals.push({
                    reason: 'required-parameter-unknown',
                    legallyGrounded: false,
                    headline: 'This zone\'s rule needs a value the source does not publish: '
                        + `${missing.join(', ')}.`,
                    ordinanceRef: null,
                    retryable: false,
                });
            }
        }
    }

    // ── 6 · THE LEGAL GATE ───────────────────────────────────────────────────────────────────
    // ⚠ ADDED LAST AND NEVER INSTEAD OF THE OTHERS. If the gate short-circuited, signing it would
    // instantly expose refusals nobody had ever seen, on parcels we had implied were fine.
    if (ctx.verificationGateOpen !== true) {
        refusals.push({
            reason: 'verification-gate-closed',
            legallyGrounded: false,
            headline: 'PRYZM has not yet certified Madrid envelope rules for publication.',
            ordinanceRef: null,
            retryable: false,
        });
    }

    // ── 7 · THE RULE ─────────────────────────────────────────────────────────────────────────
    const envelope = refusals.length === 0 ? buildGeometricRule(classification.grammar, rules) : null;

    return {
        parcel: {
            id: ctx.parcel?.id ?? null,
            // ⚠ Null by construction unless a caller joined Catastro: the regional corpus contains
            // NO PARCELS. Every rate measured over it is per ORDINANCE POLYGON, never per parcel.
            cadastralRef: ctx.parcel?.cadastralRef ?? null,
            area_m2: ctx.parcel?.area_m2 ?? null,
        },
        municipality: { code: cd3, name: muniName, ine5: composeIne5(cd3) },
        planningInstrument: {
            name: ambitoToken,
            documentType: (note('DS_DOCU'), str(row.DS_DOCU)),
            figure: ctx.instrumentFigure ?? null,
            isDerived: ambitoToken !== null,
        },
        zoningCode: { code: ordinanceName, label: ordinanceName, soilClass },
        rules,
        grammar: classification.grammar,
        provenance: {
            source: 'idem.comunidad.madrid/geoserver3/wfs',
            dataset: 'sitcm:VPLA_V_ORDENANZA',
            recordId: (row.CDID as string | number | undefined) ?? null,
            document: [str(row.DS_DOCU), (note('DS_PLANEAM_GRAL'), str(row.DS_PLANEAM_GRAL))]
                .filter(Boolean).join(' / ') || null,
            statute: (note('DS_LEY'), str(row.DS_LEY)),
            published: (note('FC_BOCM'), str(row.FC_BOCM)),
            fields: [...new Set(fieldsRead)],
        },
        missingConstraints: MADRID_MISSING_CONSTRAINTS,
        contradictions,
        refusals,
        envelope,
    };
}

/**
 * Map a grammar + its parameters onto a SHIPPED `GeometricRule`.
 *
 * ⭐ Every branch returns a kind that already exists in `@pryzm/schemas`. There is no Madrid kind,
 * and adding one would be a second rule model for one region.
 *
 * ⚠ Returns `null` where the grammar has no shipped representation — `occupation` is the live
 * case: a coverage cap bounds a VOLUME but does not determine a FOOTPRINT SHAPE, and no shipped
 * kind expresses "≤ X % of the plot, anywhere on it". ⛔ It is NOT coerced into a setback by
 * back-solving an inset that would produce X % — that would invent boundary distances the
 * ordinance never states and place the building somewhere the ordinance never puts it.
 */
export function buildGeometricRule(
    grammar: CommonEnvelopeRecord['grammar'],
    rules: EnvelopeRules,
): GeometricRule | null {
    // P8 — emits `pryzm.zoning.madridSpacm.buildGeometricRule`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.buildGeometricRule');
    try {
        const rule = buildGeometricRuleImpl(grammar, rules);
        span.setAttribute('grammar', grammar);
        span.setAttribute('ruleKind', rule?.kind ?? 'none');
        return rule;
    } finally {
        span.end();
    }
}

function buildGeometricRuleImpl(
    grammar: CommonEnvelopeRecord['grammar'],
    rules: EnvelopeRules,
): GeometricRule | null {
    switch (grammar) {
        case 'setback':
        case 'industrial': {
            const f = rules.setbackFront_m.value;
            const s = rules.setbackSide_m.value;
            const r = rules.setbackRear_m.value;
            if (f === null || s === null || r === null) return null;
            return { kind: 'setback', front_m: f, side_m: s, rear_m: r };
        }
        case 'alignment': {
            const d = rules.depth_m.value;
            if (d === null) return null;
            // ⚠⚠ EVERY FIELD HERE IS THE SHIPPED SCHEMA'S, AND A FIRST CUT GOT IT WRONG — it emitted
            // `{ kind: 'alignment', alignTo: 'street', depth_m }`, which is not the shape
            // `AlignmentRuleSchema` defines. **`tsc` rejected it**, which is exactly the guarantee
            // claimed for typing this return as `GeometricRule`: an unsolvable shape is a COMPILE
            // error rather than a runtime `undefined` on a compliance number.
            //
            // `sideTreatment: 'party-wall'` is the Spanish *medianería* default and it is a CHOICE,
            // recorded as one: `NM_FDO_MX_ED` states a buildable depth and says nothing about the
            // side boundaries. ⛔ The alternative — `'setback'` — would REQUIRE a `side_m` the
            // corpus does not publish for these rows (the schema refines exactly that), so it
            // cannot be chosen honestly. Party-wall is also the conservative reading for an
            // alignment zone: it is what *alineación a vial* fabric physically is.
            //
            // `alignmentOffset_m: 0` is NOT a sentinel here: an *alineación a vial* zone puts the
            // façade ON the line by definition, so zero is the measured meaning, not an absence.
            return {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 0,
                buildableDepth_m: d,
                sideTreatment: 'party-wall',
            };
        }
        case 'occupation':
        case 'unknown':
        default:
            return null;
    }
}

/** A record with no parameters at all — used when a caller has a parcel but no ordinance row. */
export function emptyRules(reason: string): EnvelopeRules {
    // P8 — emits `pryzm.zoning.madridSpacm.emptyRules`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.emptyRules');
    span.setAttribute('reason', reason);
    span.end();
    const u = () => unknown(null, reason);
    return {
        height_m: u(), storeys: u(), occupationPct: u(), depth_m: u(),
        setbackFront_m: u(), setbackSide_m: u(), setbackRear_m: u(),
        plotRatioFAR: u(), minFrontage_m: u(),
    };
}
