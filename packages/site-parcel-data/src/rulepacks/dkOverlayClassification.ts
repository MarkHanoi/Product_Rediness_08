// §DK-OVERLAY-CLASS (lane ENVELOPE-NLDK, 2026-09-04) — EXCLUSION / CONDITIONAL / SCREENING /
// INFORMATIONAL, never a blanket NO_BUILD. DK doctrine Part 6–8, RULE 8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `DK-ENVELOPE-COMPLETION.md` §3.2 item 7: overlay classification was NOT BUILT, and "until it is,
// no overlay may be treated as NO_BUILD". `DK-DATA-GAP-AUDIT.md` §… : "does not exist as a type".
// This module is the type, and the closed registry behind it.
//
// The doctrine's own words (master prompt Part 6): *per layer: geometry / legal source / legal
// effect / exceptions / prohibition-vs-permission / affects footprint-height-use / assessment-only.
// Classify EXCLUSION vs CONDITIONAL vs SCREENING vs INFORMATIONAL — never a blanket NO_BUILD.* And
// R8: *Dispensation / landzone / road / environmental / aviation / heritage approvals → CONDITIONAL
// volume, never added to the deterministic volume.*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE STRUCTURAL DECISION — EXCLUSION IS NEVER A DEFAULT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Danish protection instruments are, almost without exception, PROHIBITIONS WITH A DISPENSATION
// ROUTE: the naturbeskyttelseslov building lines (§§15–19) are dispensable by the kommune or the
// Kyst­direktorat; a fredning by the fredningsnævn; a landzone parcel by landzonetilladelse
// (Planloven §35); a vejbyggelinje by the vejmyndighed. So the DEFAULT legal effect of every kind in
// the registry is CONDITIONAL, SCREENING or INFORMATIONAL — and `EXCLUSION` is reachable ONLY when
// the caller supplies an EXPLICIT, CITED prohibition from the governing instrument itself (a
// lokalplan "§X må ikke bebygges", a friareal). An overlay kind alone never yields EXCLUSION, and an
// UNKNOWN kind yields UNCLASSIFIED — surfaced, never dropped, never NO_BUILD.
//
// ⚠ CITATIONS: `legalBasis` strings are this lane's, from the statutes as known — NOT re-verified
// against Retsinformation this lane (no fetch was made; the doctrine's Part 5 versioned legal corpus
// is `not-built`). Every row says `basisVerification: 'lane-cited-not-re-verified'`. They are
// carried so a reviewer can check them, never as verified law. The classification does not DEPEND
// on the section numbers — it depends on the prohibition-with-dispensation shape, which R8 asserts.
//
// ⚠ NO ENDPOINTS. Round one marked Miljøportal / Arealdata / SLKS-FBB / LER as UNVERIFIED-ENDPOINT
// (RULE 2: never invent an endpoint). This module classifies a KIND the caller has already fetched;
// it names no URL.
//
// PURE (C58 §1.9). Deterministic. Emits the shared `RuleState` vocabulary against **B4** by default.

import type { RuleState } from '@pryzm/schemas';

export type DkOverlayLegalEffect = 'EXCLUSION' | 'CONDITIONAL' | 'SCREENING' | 'INFORMATIONAL' | 'UNCLASSIFIED';

/** The overlay kinds the doctrine's Parts 6–8 name. Closed; extend by adding a row, never a string. */
export type DkOverlayKind =
    | 'strandbeskyttelseslinje'
    | 'soe-og-aabeskyttelseslinje'
    | 'skovbyggelinje'
    | 'fortidsmindebeskyttelseslinje'
    | 'kirkebyggelinje'
    | 'paragraf3-beskyttet-natur'
    | 'fredning'
    | 'natura2000'
    | 'fredet-fortidsminde'
    | 'fredet-bygning'
    | 'bevaringsvaerdig-bygning'
    | 'kulturmiljoe'
    | 'landzone'
    | 'kystnaerhedszone'
    | 'vejbyggelinje'
    | 'jernbane-naerhed'
    | 'aviation-obstacle-surface'
    | 'stoejkonsekvenszone'
    | 'drikkevandsinteresser'
    | 'jordforurening'
    | 'raastofomraade'
    | 'oversvoemmelse-erosion'
    | 'ler-utility-corridor';

export type DkOverlayAffects = 'footprint' | 'height' | 'use' | 'assessment';

export interface DkOverlayRule {
    readonly kind: DkOverlayKind;
    /** The DEFAULT effect. Never EXCLUSION — see the header. */
    readonly defaultEffect: Exclude<DkOverlayLegalEffect, 'EXCLUSION' | 'UNCLASSIFIED'>;
    readonly legalBasis: string | null;
    readonly basisVerification: 'lane-cited-not-re-verified';
    readonly affects: readonly DkOverlayAffects[];
    /** Why this effect — the prohibition/permission shape, in one line. */
    readonly shape: string;
}

const R = (
    kind: DkOverlayKind,
    defaultEffect: DkOverlayRule['defaultEffect'],
    legalBasis: string | null,
    affects: readonly DkOverlayAffects[],
    shape: string,
): DkOverlayRule => ({ kind, defaultEffect, legalBasis, basisVerification: 'lane-cited-not-re-verified', affects, shape });

export const DK_OVERLAY_REGISTRY: readonly DkOverlayRule[] = Object.freeze([
    R('strandbeskyttelseslinje', 'CONDITIONAL', 'Naturbeskyttelsesloven §15 (dispensation §65b, Kystdirektoratet)', ['footprint', 'use'], 'prohibition on changes of state within the line, with a dispensation route'),
    R('soe-og-aabeskyttelseslinje', 'CONDITIONAL', 'Naturbeskyttelsesloven §16 (dispensation §65)', ['footprint'], 'prohibition on building within the line, dispensable by the kommune'),
    R('skovbyggelinje', 'CONDITIONAL', 'Naturbeskyttelsesloven §17 (dispensation §65)', ['footprint'], 'prohibition on building within the line, dispensable by the kommune'),
    R('fortidsmindebeskyttelseslinje', 'CONDITIONAL', 'Naturbeskyttelsesloven §18 (dispensation §65)', ['footprint'], 'prohibition on changes of state within the line, dispensable'),
    R('kirkebyggelinje', 'CONDITIONAL', 'Naturbeskyttelsesloven §19 (dispensation §65)', ['height'], 'height cap near a church, dispensable'),
    R('paragraf3-beskyttet-natur', 'CONDITIONAL', 'Naturbeskyttelsesloven §3 (dispensation §65)', ['footprint', 'use'], 'prohibition on changes of state of protected nature types, dispensable'),
    R('fredning', 'CONDITIONAL', 'Naturbeskyttelsesloven kap. 6 (fredningsnævn dispensation §50)', ['footprint', 'height', 'use'], 'per-fredning provisions; dispensation by the fredningsnævn'),
    R('natura2000', 'SCREENING', 'Habitatbekendtgørelsen (habitat/bird directive assessment)', ['assessment'], 'an assessment duty on plans and permits, not a prohibition on the parcel as such'),
    R('fredet-fortidsminde', 'CONDITIONAL', 'Museumsloven §29e (dispensation §29j, Slots- og Kulturstyrelsen)', ['footprint'], 'prohibition on changes to the monument, with a narrow dispensation route'),
    R('fredet-bygning', 'CONDITIONAL', 'Bygningsfredningsloven (tilladelse from Slots- og Kulturstyrelsen)', ['footprint', 'height', 'use'], 'works on a listed building require permission — building-protected, not parcel-excluded'),
    R('bevaringsvaerdig-bygning', 'CONDITIONAL', 'Planloven §14 / lokalplan bevaringsbestemmelser; SAVE registration', ['footprint', 'height'], 'demolition/alteration subject to kommune permission where a lokalplan so provides'),
    R('kulturmiljoe', 'SCREENING', 'kommuneplan retningslinje (Planloven §11a)', ['assessment'], 'a planning consideration, not a parcel prohibition'),
    R('landzone', 'CONDITIONAL', 'Planloven §35 (landzonetilladelse)', ['footprint', 'height', 'use'], 'building generally requires a landzonetilladelse — conditional, NOT automatic no-build (doctrine 4.8)'),
    R('kystnaerhedszone', 'SCREENING', 'Planloven §5a–§5b', ['assessment'], 'a plan-making consideration binding on the kommune’s planning, not a parcel prohibition'),
    R('vejbyggelinje', 'CONDITIONAL', 'Vejloven §40 (dispensation §40 stk. 2, vejmyndighed)', ['footprint'], 'prohibition on building between the line and the road, dispensable by the road authority — never a generic setback (doctrine 8.1)'),
    R('jernbane-naerhed', 'CONDITIONAL', null, ['footprint', 'height'], 'spatial relationship + Banedanmark approval; NEVER a generic national railway setback (doctrine 8.3)'),
    R('aviation-obstacle-surface', 'CONDITIONAL', 'Luftfartsloven (højdebegrænsning, Trafikstyrelsen)', ['height'], 'a height surface whose LEGAL elevation Plandata may not carry — AVIATION_HEIGHT = UNKNOWN/CONDITIONAL (doctrine 8.4)'),
    R('stoejkonsekvenszone', 'CONDITIONAL', 'Planloven §15a / kommuneplan retningslinje', ['use'], 'noise-sensitive use restricted unless mitigated — conditional on use and mitigation'),
    R('drikkevandsinteresser', 'INFORMATIONAL', 'kommuneplan retningslinje (OSD / indvindingsopland)', ['assessment'], 'informs use and infrastructure decisions; not an envelope prohibition'),
    R('jordforurening', 'INFORMATIONAL', 'Jordforureningsloven (V1/V2 kortlægning)', ['use'], 'registered contamination — informs permits (§8 tilladelse for sensitive use); not an envelope rule'),
    R('raastofomraade', 'SCREENING', 'Råstofloven / regional råstofplan', ['assessment'], 'planning designation that constrains conflicting planning; screening for the parcel'),
    R('oversvoemmelse-erosion', 'SCREENING', 'Planloven §11a stk. 1 nr. 18 (klimatilpasning)', ['assessment'], 'a designation that requires the plan to address the risk — screening, not prohibition'),
    R('ler-utility-corridor', 'INFORMATIONAL', 'LER-loven (ledningsoplysninger)', ['footprint'], 'UTILITY_CONSTRAINT for feasibility/corridors — not automatic NO_BUILD (doctrine Part 9)'),
] as const);

export function dkOverlayRule(kind: string): DkOverlayRule | null {
    return DK_OVERLAY_REGISTRY.find((r) => r.kind === kind) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface DkExplicitProhibition {
    /** The governing instrument's own words, verbatim ("§5.2 Området må ikke bebygges"). */
    readonly verbatim: string;
    /** The clause reference. NEVER fabricated. */
    readonly citation: string;
}

export interface DkOverlayClassification {
    readonly kind: DkOverlayKind | null;
    readonly rawKind: string;
    readonly effect: DkOverlayLegalEffect;
    readonly legalBasis: string | null;
    readonly basisVerification: 'lane-cited-not-re-verified' | 'instrument-verbatim' | 'none';
    readonly affects: readonly DkOverlayAffects[];
    readonly statement: string;
}

/**
 * Classify one overlay. Pure and total.
 *
 *   explicit cited prohibition supplied → EXCLUSION (the ONLY route to it)
 *   known kind                          → its default effect (CONDITIONAL / SCREENING / INFORMATIONAL)
 *   unknown kind                        → UNCLASSIFIED — surfaced, treated as at least SCREENING by
 *                                         consumers, never dropped and never NO_BUILD
 */
export function classifyDkOverlay(
    rawKind: string,
    opts: { readonly explicitProhibition?: DkExplicitProhibition | null } = {},
): DkOverlayClassification {
    const rule = dkOverlayRule(rawKind);
    const p = opts.explicitProhibition ?? null;
    if (p !== null && p.verbatim.trim() !== '' && p.citation.trim() !== '') {
        return {
            kind: rule?.kind ?? null,
            rawKind,
            effect: 'EXCLUSION',
            legalBasis: p.citation,
            basisVerification: 'instrument-verbatim',
            affects: rule?.affects ?? ['footprint'],
            statement: `EXCLUSION by the instrument's own words — ${p.citation}: "${p.verbatim.trim()}".`,
        };
    }
    if (rule === null) {
        return {
            kind: null,
            rawKind,
            effect: 'UNCLASSIFIED',
            legalBasis: null,
            basisVerification: 'none',
            affects: ['assessment'],
            statement:
                `overlay kind "${rawKind}" is not in the DK overlay registry — UNCLASSIFIED. It must be ` +
                'surfaced to the user and treated as at least SCREENING; it is never NO_BUILD and never ignored.',
        };
    }
    return {
        kind: rule.kind,
        rawKind,
        effect: rule.defaultEffect,
        legalBasis: rule.legalBasis,
        basisVerification: 'lane-cited-not-re-verified',
        affects: rule.affects,
        statement: `${rule.defaultEffect}: ${rule.shape}${rule.legalBasis ? ` (${rule.legalBasis}; citation not re-verified)` : ''}.`,
    };
}

/** May any of these overlays be rendered as NO_BUILD? Only an EXCLUSION may. */
export function dkOverlaysPermitNoBuild(cs: readonly DkOverlayClassification[]): boolean {
    return cs.some((c) => c.effect === 'EXCLUSION');
}

/**
 * Project onto `RuleState` — against **B4** (ordered overlay stack) by default.
 *
 *   EXCLUSION     → `resolved`, value = the instrument's prohibition (a string), `source-complete`
 *   CONDITIONAL   → `refused` / `requires-determination` — a dispensation or permit DECISION,
 *                   not a number; R8: never added to the deterministic volume
 *   SCREENING     → `qualitative` — an assessment duty, verbatim shape
 *   INFORMATIONAL → `refused` / `rule-not-applicable` — the overlay poses no envelope question (F2)
 *   UNCLASSIFIED  → `unrecovered` / `semantic` / mechanism `unknown`
 */
export function dkOverlayToRuleState(
    c: DkOverlayClassification,
    ref: RuleState['ref'],
    rule: RuleState['rule'] = 'B4',
): RuleState {
    switch (c.effect) {
        case 'EXCLUSION':
            return {
                rule,
                status: 'resolved',
                reachability: 'source-complete',
                value: c.statement,
                unit: null,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'CONDITIONAL':
            return { rule, status: 'refused', reachability: 'interpretive', basis: 'requires-determination', reason: c.statement, ref };
        case 'SCREENING':
            return { rule, status: 'qualitative', reachability: 'interpretive', text: c.statement, ref };
        case 'INFORMATIONAL':
            return { rule, status: 'refused', reachability: 'source-complete', basis: 'rule-not-applicable', reason: c.statement, ref };
        case 'UNCLASSIFIED':
            return {
                rule,
                status: 'unrecovered',
                partial: null,
                reachability: 'interpretive',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: c.statement,
                ref,
            };
    }
}
