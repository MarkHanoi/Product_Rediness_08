// LANE E7-SE — SWEDEN (SE) · the PURE rule mapper: one imported Boverket provision definition →
// an E1a `SiteIntelRule` + the `SiteIntelRegulation` it cites. E7-family conventions §6.A
// (`<cc>RuleMapper.ts`: PURE, TOTAL, DETERMINISTIC — no fetch, no clock; the caller passes
// `fetchedAtIso`).
//
// ⭐ WHAT THIS MAPPER EMITS, AND WHY EVERY ROW IS UNKNOWN ─────────────────────────────────────
// Sweden splits cleanly in two, and the split is not a PRYZM design choice — it is how the
// Swedish state publishes:
//     Boverket  serves WHICH PARAMETERS EXIST  (the Planbestämmelsekatalog — keyless, imported)
//     Lantmäteriet serves WHAT THE NUMBERS ARE (NGP detaljplaner — credential-gated, deferred)
// So every rule below is a **tier-6 `uncertain-missing` row with `value: null`** — 83 of 83. That
// is not a degraded output; it is the honest one, and it is exactly the E7-family conventions
// §6.E UNKNOWN doctrine executed at its strongest: *"Key the emission off the DECLARED layer
// vocabulary, not the served bag, so a server that omits null keys cannot silently delete a
// parameter."* In Sweden the DECLARED vocabulary is not a hand-written list in an adapter — it is
// a versioned national API, so the emission cannot be quietly wrong about what exists.
// UNKNOWN ≠ 0 ≠ unlimited ≠ no-restriction (control 9); the schema enforces it structurally
// (`value: null` parses only at tier 6).
//
// ── THE SEATS, AND HOW SWEDEN FILLS THEM (E7-family conventions §6.E) ─────────────────────────
//
// R1 `basis` — EVERY ref resolves to an entity RETURNED IN THE SAME RESULT. The referent is a
//   `SiteIntelRegulation` (the R1 `basis` kind `'regulation'`, and `SiteIntelRegulationSchema`'s
//   own doc sanctions it: "`planId` → null for plan-independent instruments (national law)").
//   That is exactly what a catalogue provision is: a national drafting instrument that exists
//   before, and independently of, any plan. The referent ladder's rungs 1–3 (plan+geometry, plan
//   only, bare geometry) are ALL unreachable here — there is no plan and no geometry until NGP
//   opens — and rung 4 is "throw by name". Minting the Regulation is what keeps this off rung 4
//   honestly rather than by inventing a plan.
//
// R1 `rank` — **null, and the reason is the third of §6.E's three**: the Swedish instrument ladder
//   (detaljplan > områdesbestämmelser > översiktsplan(guiding) > PBL/BBR) EXISTS, but it is
//   adapter DATA (`SE_APPLICABILITY_LADDER`, index.ts), not a per-rule fact the catalogue serves.
//   Boverket serves no rank column. Not "no ladder exists" (EE/PL's reason is the same one; DK is
//   the only sibling with a real per-feature rank), and not "the state already applied it" (LT).
//
// R1 `useScope` — the verbatim national token `anvandningsform` (`Kvartersmark` / `Allmän plats` /
//   `Planområdet`), NEVER translated. It is genuinely use-conditioning: an `Allmän plats`
//   provision cannot apply to quarter land, and vice versa. It is also a CLOSED Boverket
//   värdedomän, so an unrecognised value THROWS (§6.E R2's closed-codelist rule).
//
// R2 `valueBasis` — `{scheme:'se-boverket-bestammelsekod', code:<the code>}`, on EVERY row
//   including the tier-6 ones (§6.E: "Emit the qualifier even on a tier-6 UNKNOWN row — it is a
//   served fact about the rule"). ⭐ THE CODE IS THE DENOMINATOR AND THE MEASUREMENT BASIS, and
//   this is the single most valuable thing Sweden serves:
//     `…AreaProc_BruttoEgen`  → % of fastighetsarean inom EGENSKAPSOMRÅDET
//     `…AreaProc_BruttoAnv`   → % of fastighetsarean inom ANVÄNDNINGSOMRÅDET
//     `…AreaKvm_BruttoFastigh`→ m² PER FASTIGHET
//     `…AreaKvm_Brutto`       → absolute m², no denominator
//     `…_Nockhojd`            → ridge height from the ground
//     `…_NockhojdNollplan`    → ridge height ABOVE A STATED DATUM  (the L-584 rasant distinction,
//                                served by the state as a code BEFORE any terrain is sampled)
//   ⛔ NOTHING IS INFERRED: the code is carried through untouched, and the *meaning* of each
//   suffix lives in the verbatim `formulering` that travels in the note. A consumer that
//   multiplies a percentage by "the parcel area" without reading the code reproduces the C63
//   Aarhus trap with a clean parse.
//
// R3 `validityBasis` — **`'legal'`, with `valid_from` = Boverket's own `borjargalla`.** This is
//   the one seat where the reasoning must be written down rather than asserted, because the
//   value is null and §6.E says `'legal'` needs an in-force date "the register serves for that
//   value". Read strictly, a null value has no date and the row would fall to
//   `'ingestion' + fetch date`. That reading is WRONG HERE, and demonstrably worse:
//     • What the row asserts is *"this parameter exists, with these semantics, and PRYZM does not
//       know its value"*. Boverket serves an in-force date for exactly that object — release typ
//       `Juridisk`, `borjargalla`/`slutargalla` per provision — so there IS positive evidence of
//       legal force for the thing the row is about.
//     • `'legal'` cannot produce a wrong NUMBER: the value is null at tier 6, and any evaluator
//       must refuse to compute with it regardless of the window.
//     • `'ingestion' + today` WOULD produce a wrong ANSWER: an evaluator asking "what applied on
//       2021-01-01" would exclude the row and thereby claim Sweden had no such provision in 2021.
//       That confident false negative is the exact failure R3's own schema doc says the field
//       exists to kill (gate decision §B.3).
//   The note states, in words, precisely what the window IS about — the provision's legal
//   availability as a drafting/interpretation instrument — and what it is NOT: a value in force
//   on any parcel. `valid_to` is null, mirroring Boverket's own `slutargalla === null` encoding.
//
// R5 `normativeForce` — **`'Juridisk'`, Boverket's own word, VERBATIM, never translated.** It is a
//   whole-dataset qualifier and therefore a constant (the LT pattern §6.E blesses): the release
//   type is a CLOSED two-value värdedomän `{Juridisk | Teknisk}` and all seven published releases
//   are `Juridisk`. A `Teknisk` release would be a non-legal one, so the field is a real force
//   axis and not a label. The per-provision `tolkningsbestammelse` flag (drafting vs
//   interpretation-of-old-plans) is a DIFFERENT axis and is carried in the note, not collapsed
//   into this string.
//
// ── THE TWO-SLOT REFUSAL, MEASURED ────────────────────────────────────────────────────────────
// Two of the 83 provisions express a slope as `[lutning1]:[lutning2]` — TWO numbers in one
// provision. `RuleProvenance.value` is a scalar seat. Those rows carry `numericSlots: 2` and say
// in their note that they will STAY unknown even after NGP opens, because a scalar cannot hold
// them. Naming that now is cheaper than discovering it as a silently-halved ratio later.

import {
    SiteIntelRegulationSchema,
    SiteIntelRuleSchema,
    type RuleBasisRef,
    type SiteIntelRegulation,
    type SiteIntelRule,
} from '@pryzm/schemas';
import {
    SE_PBK_PINNED_RELEASE_ID,
    SE_PBK_PINNED_RELEASE_NAME,
    buildSePbkProvisionInReleaseUrl,
} from './seBoverketClient.js';
import {
    SE_NUMERIC_PROVISIONS,
    assertSeClosedDomainValue,
    type SePlanProvision,
} from './sePlanProvisionCatalogue.js';
import { SE_PBK_SOURCE_ID } from './seSources.js';

/** The publishing authority carried in every SE rule's source ref. */
export const SE_RULE_AUTHORITY = 'Boverket (Planbestämmelsekatalogen)';

/** The dataset string every SE rule's source ref names — release-pinned, so a republish shows. */
export const SE_RULE_DATASET = `Planbestämmelsekatalogen v2 · release ${SE_PBK_PINNED_RELEASE_ID} (${SE_PBK_PINNED_RELEASE_NAME})`;

/**
 * The R2 scheme name. ONE constant so the mapper, the tests and any future consumer cannot spell
 * the scheme two ways.
 */
export const SE_VALUE_BASIS_SCHEME = 'se-boverket-bestammelsekod';

/** R5, whole-dataset: Boverket's own release-type word. Closed värdedomän {Juridisk | Teknisk}. */
export const SE_NORMATIVE_FORCE = 'Juridisk';

/**
 * The SE→canonical vocabulary, as §J's `vocabulary: RuleVocabularyMapping`. It is not a second
 * table: it IS `SE_NUMERIC_PROVISIONS`, whose `parameter`/`unit` columns are the mapping. Exposed
 * under the conventional name so the four sibling adapters read alike.
 */
export const SE_RULE_VOCABULARY: readonly SePlanProvision[] = SE_NUMERIC_PROVISIONS;

/* ─────────────────── id minting — ONE seat per entity kind (§6.F) ─────────────────── */

/** Deterministic id of the minted Regulation for a Boverket provision code. */
export function seRegulationEntityId(kod: string): string {
    return `se-regulation-${kod}`;
}

/** Deterministic id of the Rule minted for a Boverket provision code. */
export function seRuleEntityId(kod: string): string {
    return `se-rule-${kod}`;
}

/* ────────────────────────────── the mapper ────────────────────────────── */

/** What one mapped provision yields: the minted referent + the rule that cites it. */
export interface SeMappedRuleSet {
    /** The minted national-instrument referent every rule's `basis` cites (R1). */
    readonly regulation: SiteIntelRegulation;
    /** Exactly one rule — the declared parameter, value UNKNOWN. */
    readonly rules: readonly SiteIntelRule[];
}

/**
 * Boverket's own stated rule, quoted from `GET /faltbeskrivning` (2026-09-01):
 * *"Alla bestämmelser som har en bestämmelsekod som slutar på 'Aldre' är Tolkningsbestämmelser."*
 * Applying it is reading the state's declaration, not inferring from a string.
 */
export function isSeTolkningsbestammelse(kod: string): boolean {
    return kod.endsWith('_Aldre');
}

function seNoteFor(p: SePlanProvision): string {
    const parts: string[] = [];
    parts.push(
        `UNKNOWN — Boverket's Planbestämmelsekatalog DECLARES this parameter; the VALUE lives in ` +
            `the detaljplan instance, which Lantmäteriet's NGP serves behind a client-registration ` +
            `gate (HTTP 401 code 900902, measured 2026-09-01). UNKNOWN is not 0, not unlimited and ` +
            `not "no restriction".`,
    );
    parts.push(`Formulering (verbatim): "${p.formulering}"`);
    parts.push(
        `uttrycktvarde "${p.sense ?? '—'}" — Boverket's own sense token, carried verbatim; it is ` +
            `NOT a closed värdedomän (no /vd/uttrycktvarde endpoint; 46 of 271 non-null values ` +
            `across all releases are dirt, incl. the casing typo "MIn"), so nothing keys off it.`,
    );
    parts.push(
        `validityBasis 'legal' with valid_from ${p.borjargalla} is a claim about the PROVISION's ` +
            `legal availability (Boverket release typ "Juridisk", slutargalla null = still in ` +
            `force) — NOT a claim that any value is in force on any parcel.`,
    );
    if (isSeTolkningsbestammelse(p.kod)) {
        parts.push(
            'Tolkningsbestämmelse (Boverket /faltbeskrivning: every code ending "Aldre" is one) — ' +
                'it exists to INTERPRET pre-BFS-2020:5 plans, not to draft new ones.',
        );
    }
    if (p.numericSlots !== 1) {
        parts.push(
            `⛔ numericSlots=${p.numericSlots}: the formulering carries ${p.numericSlots} numeric ` +
                'slots, and RuleProvenance.value is a SCALAR seat. This row will stay UNKNOWN even ' +
                'once NGP is reachable — a two-number ratio cannot be halved into it.',
        );
    }
    if (p.beteckning !== null) {
        parts.push(`Map symbol pattern (beteckning): "${p.beteckning}".`);
    }
    parts.push(
        'Boverket serves NO lagstöd/kapitel/paragraf for any of the 908 in-force provisions (it ' +
            'serves PBL (2010:900) for 750 RETIRED ones), so source.article is null, not omitted.',
    );
    return parts.join(' · ');
}

/**
 * PURE · TOTAL · DETERMINISTIC: one imported provision → the minted Regulation + one tier-6
 * `SiteIntelRule`. Same provision in → byte-identical output out (the only input that varies is
 * `fetchedAtIso`, and it deliberately does NOT reach `valid_from` — see the R3 note in the
 * header; it reaches only the Regulation's version stamp).
 *
 * THROWS BY NAME on a `anvandningsform` outside Boverket's closed värdedomän — a national schema
 * change must surface, never be absorbed (§6.E R2).
 */
export function mapSeProvisionToRules(
    provision: SePlanProvision,
    fetchedAtIso: string,
): SeMappedRuleSet {
    const useToken = assertSeClosedDomainValue('anvandningsform', provision.anvandningsform);

    const regulation = SiteIntelRegulationSchema.parse({
        id: seRegulationEntityId(provision.kod),
        // Plan-independent national instrument — the schema's own sanctioned null case.
        planId: null,
        title: `${provision.kod} — ${provision.formulering}`,
        // The instrument kind, verbatim in Swedish plus the föreskrift that mandates it.
        kind: 'planbestämmelse (Boverkets föreskrifter om detaljplan, BFS 2020:5)',
        documents: [],
        source: SE_PBK_SOURCE_ID,
        version: `${SE_PBK_PINNED_RELEASE_ID}`,
    });

    const basis: readonly RuleBasisRef[] = [{ kind: 'regulation', ref: regulation.id }];

    const rule = SiteIntelRuleSchema.parse({
        id: seRuleEntityId(provision.kod),
        body: null,
        applicability: {
            basis,
            geometry: null,
            // Verbatim national use token — the R1 useScope seat (§6.E: never a positional id,
            // never prose-only).
            useScope: [useToken],
            // See the R1 `rank` paragraph in the header: the ladder exists but is adapter DATA.
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: provision.parameter,
            // Control 9: UNKNOWN, structurally. The schema permits null ONLY at tier 6.
            value: null,
            unit: provision.unit,
            source: {
                country: 'SE',
                authority: SE_RULE_AUTHORITY,
                dataset: SE_RULE_DATASET,
                // The catalogue is plan-independent: there is no plan to name, and naming one
                // would be the dangling-ref defect R1 replaced.
                plan_id: null,
                object_id: provision.kod,
                // The addressable, release-pinned catalogue entry for this provision.
                document: buildSePbkProvisionInReleaseUrl(SE_PBK_PINNED_RELEASE_ID, provision.uuid),
                // Measured: 0 of the 908 in-force provisions carry lagstöd/kapitel/paragraf.
                article: null,
                page: null,
            },
            // The parameter's existence, unit, sense and window were read DIRECTLY from an
            // authoritative machine attribute (the EE precedent for a tier-6 row).
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            // R2 — the code IS the denominator + the measurement basis. Carried verbatim.
            valueBasis: { scheme: SE_VALUE_BASIS_SCHEME, code: provision.kod },
            confidence: { tier: 6, note: seNoteFor(provision) },
            // R3 — see the header. 'legal', because a confident false negative is the worse error.
            validityBasis: 'legal',
            valid_from: provision.borjargalla,
            valid_to: null,
            // R5 — Boverket's own release-type word, verbatim.
            normativeForce: SE_NORMATIVE_FORCE,
        },
    });

    // `fetchedAtIso` is accepted (and required) so this mapper has the same signature as its four
    // siblings and so a caller cannot pass a clock. It is deliberately NOT written into
    // `valid_from`: doing so is the exact confident-false-negative the R3 note above rejects.
    void fetchedAtIso;

    return { regulation, rules: [rule] };
}

/** The whole imported catalogue mapped: 83 referents + 83 tier-6 rules. */
export interface SeCatalogueRuleSet {
    readonly regulations: readonly SiteIntelRegulation[];
    readonly rules: readonly SiteIntelRule[];
    /** How many of `rules` carry `value === null` — 83 of 83 while NGP is gated. */
    readonly unknownCount: number;
}

/**
 * PURE: map every imported provision. This is the adapter's answer to "what does PRYZM know about
 * Swedish detaljplan parameters today", and its shape is the honest one: a complete declared
 * vocabulary with a complete absence of values.
 */
export function mapSeNumericProvisionCatalogue(fetchedAtIso: string): SeCatalogueRuleSet {
    const regulations: SiteIntelRegulation[] = [];
    const rules: SiteIntelRule[] = [];
    for (const p of SE_RULE_VOCABULARY) {
        const mapped = mapSeProvisionToRules(p, fetchedAtIso);
        regulations.push(mapped.regulation);
        for (const r of mapped.rules) rules.push(r);
    }
    return {
        regulations,
        rules,
        unknownCount: rules.filter((r) => r.provenance.value === null).length,
    };
}
