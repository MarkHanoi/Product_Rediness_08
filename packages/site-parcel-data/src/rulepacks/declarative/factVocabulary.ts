// LANE E1bc (E1 gate decision §F item 3 · challenge verdict §G item 3 ·
// e1a-gate-supplement §3.4) — THE FACT VOCABULARY for declarative-rule
// predicates and constructions, declared AS DATA.
//
// ⚠ WHY THIS FILE EXISTS, IN THE SUPPLEMENT'S OWN WORDS (§3.4, on the brief's
// "max height depends on distance from the street" example): *"the FACT
// VOCABULARY (`{"var":"distanceToStreet"}` — who computes it, in what CRS) is
// undeclared; that is explicitly E1b's evaluator contract and must be in the
// E1b freeze list, or two packs will spell the same fact two ways."*
//
// This module is that contract's seat. Every fact a declarative rule's
// `applicability.condition` (R1) or a pack document's `constructions[]` may
// reference is named HERE, once, with its unit, its computing authority and
// its space. The evaluator REFUSES a condition that references a token absent
// from this table (`assertKnownFacts`) — so a pack spelling `parcel_area`
// where the vocabulary says `parcelAreaM2` is a load-time/eval-time error,
// never a silently-false predicate.
//
// ⭐ FROZEN (2026-09-01, Wave E4 close — verdict §G item 3): the condition
// ("joins the freeze at Barcelona es-08019 golden parity") was MET —
// declarativeGoldenParity 11/11 at FULL byte parity, independently
// re-verified by the E4 verifier. From here: adding a fact is append-only;
// renaming/removing one is an ADR-level change. Name every fact
// deliberately; a fact nothing consumes is NOT declared (the same restraint
// as the imported national vocabularies' refusal discipline, verdict §F.10).
//
// ⚠ NON-RIVALRY (C84 EI-9): this is NOT a parameter vocabulary rival to the
// attribution layer's caller-owned `parameter` strings ("the attribution
// layer takes the caller's parameter vocabulary and never rewrites it",
// ordinance-extraction attribution/types.ts). FACTS are evaluator INPUTS
// (what a predicate reads); PARAMETERS are rule OUTPUTS (what a rule states).
// The parameter side of the vocabulary lives below in
// `DECLARATIVE_PARAMETERS` — the owner seat the challenge verdict's
// EXPERIMENTAL list says the `parameter` strings need before country #3.
//
// PURE (C58 §1.1 / P5-consistent L2 leaf): data + tree walks. No I/O.

import type { JsonValue } from '@pryzm/schemas';

/* ───────────────────────────── FACTS (inputs) ───────────────────────────── */

/** One declared fact: a named, typed input a rule predicate may read. */
export interface DeclarativeFact {
    /** The ONLY legal spelling of this fact in any pack (`{"var": name}`). */
    readonly name: string;
    /** Unit string, or null for dimensionless/categorical facts. */
    readonly unit: string | null;
    /** What the fact IS — precise enough that two packs cannot disagree. */
    readonly meaning: string;
    /**
     * WHO computes it (the existing machinery, by module path) — a fact with
     * no computing authority is not declared (authored-but-unwired lesson).
     */
    readonly computedBy: string;
    /**
     * The space/CRS the fact is measured in. Scene-space facts say so;
     * geographic ones name the CRS discipline (NativeCrsGeometry: the CRS
     * travels with the coordinates, never assumed).
     */
    readonly space: string;
}

/**
 * The declared facts — TWO, both consumed by ordinance constructions the
 * Barcelona `20a` family already resolves in TypeScript today (the resolver
 * modules named in each row). The pilot's migrated scalar rules carry NO
 * conditions, so nothing reads these yet at runtime — they are declared
 * because the two constructions that WILL migrate (with the body dialect tag,
 * verdict §E LATER) consume exactly these inputs, and naming them now is what
 * prevents the second pack from spelling them differently.
 */
export const DECLARATIVE_FACTS: readonly DeclarativeFact[] = Object.freeze([
    {
        name: 'parcelAreaM2',
        unit: 'm²',
        meaning:
            'Area of the subject parcel (the cadastral parcel the rule set is being resolved ' +
            'for), as committed by the parcel provider. Consumed by PGM Art. 340.2 / Barcelona ' +
            'Art. 343.1 (subzona VI reduced-index construction) and Art. 343.1/.2 small-parcel ' +
            'regimes — today resolved in TS by resolve20aEdificabilitat / ' +
            'resolve20aParcelOverrides (rulepacks/esBarcelona20aAillada.ts).',
        computedBy:
            'the parcel provider chain (parcelProviders/*) — the committed parcel geometry\'s ' +
            'area; never re-measured inside a rule pack',
        space: 'planar metres² in the parcel\'s native CRS (NativeCrsGeometry discipline)',
    },
    {
        name: 'ampladaDeVialM',
        unit: 'm',
        meaning:
            'Width of the vial (street) the parcel fronts, in metres — the PGM\'s amplada de ' +
            'vial. Consumed by Barcelona Art. 342.5 (subzona V / 20a/8 height + storeys + ' +
            'realisable-edificabilitat ladder) — today resolved in TS by ' +
            'resolveAlcada20aSubzonaV (rulepacks/bcnAlcada20aAillada.ts) over the ' +
            'ampladaDeVial machinery (rulepacks/ampladaDeVial.ts, bcnOfficialStreetWidths.ts).',
        computedBy:
            'rulepacks/ampladaDeVial.ts + bcnOfficialStreetWidths.ts (official width table ' +
            'first, constructed width second — street width has no national source and is a ' +
            'CONSTRUCTION, entities.ts Road doctrine)',
        space: 'metres, measured perpendicular between opposing alignments (Art. 25 NNUU)',
    },
] as const);

/** Index by name — the lookup `assertKnownFacts` runs against. */
export const DECLARATIVE_FACT_BY_NAME: ReadonlyMap<string, DeclarativeFact> = (() => {
    const m = new Map<string, DeclarativeFact>();
    for (const f of DECLARATIVE_FACTS) {
        if (m.has(f.name)) {
            throw new Error(`[declarative] duplicate fact name "${f.name}" — one fact, one spelling.`);
        }
        m.set(f.name, f);
    }
    return m;
})();

/**
 * Collect every `{"var": <string>}` reference in a JSON-Logic carrier body.
 * Walks the tree structurally; a non-string `var` operand (JSON-Logic allows
 * `{"var": ["name", default]}`) contributes its first string member.
 */
export function collectConditionVars(body: JsonValue): readonly string[] {
    const found: string[] = [];
    const walk = (node: JsonValue): void => {
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'var') {
                if (typeof value === 'string') found.push(value);
                else if (Array.isArray(value) && typeof value[0] === 'string') found.push(value[0]);
                else walk(value as JsonValue);
            } else {
                walk(value as JsonValue);
            }
        }
    };
    walk(body);
    return found;
}

/** The two-packs-one-fact enforcement: refuse any undeclared fact spelling. */
export type KnownFactsVerdict =
    | { readonly ok: true; readonly vars: readonly string[] }
    | { readonly ok: false; readonly unknown: readonly string[]; readonly detail: string };

export function assertKnownFacts(body: JsonValue): KnownFactsVerdict {
    const vars = collectConditionVars(body);
    const unknown = vars.filter((v) => !DECLARATIVE_FACT_BY_NAME.has(v));
    if (unknown.length === 0) return { ok: true, vars };
    return {
        ok: false,
        unknown,
        detail:
            `condition references undeclared fact(s) ${unknown.map((u) => `"${u}"`).join(', ')} — ` +
            'every fact must be declared once in DECLARATIVE_FACTS (e1a-gate-supplement §3.4: ' +
            'two packs must never spell one fact two ways). Declared: ' +
            DECLARATIVE_FACTS.map((f) => f.name).join(', ') + '.',
    };
}

/* ─────────────────────── PARAMETERS (rule outputs) ──────────────────────── */

/** One canonical parameter a migrated scalar rule may state. */
export interface DeclarativeParameterSpec {
    /** The ONLY legal `provenance.parameter` spelling for this concept. */
    readonly name: string;
    /** Unit the canonical value carries, or null (dimensionless / count). */
    readonly unit: string | null;
    /** The C58 `ZoningRule` seat the derived contract loads it into. */
    readonly c58Field: string;
    /**
     * The deterministic CALCULATION the C58 deriver applies, or null when the
     * value loads verbatim. Named here so the evidence chain's `calculation`
     * hop is data, not code archaeology.
     */
    readonly c58Calculation: string | null;
}

/**
 * The canonical parameter vocabulary of the declarative pack family — the
 * OWNER SEAT for the `parameter` strings (challenge verdict §H EXPERIMENTAL
 * list: "The `parameter` vocabulary — ungoverned open string; needs an owner
 * before country #3"). Scope: the C58 scalar seats the Barcelona pilot
 * migrates. Grows append-only; joins the freeze at golden parity.
 */
export const DECLARATIVE_PARAMETERS: readonly DeclarativeParameterSpec[] = Object.freeze([
    {
        name: 'maxHeight_m',
        unit: 'm',
        c58Field: 'maxHeight_m',
        c58Calculation: null,
    },
    {
        name: 'maxFloors',
        unit: null,
        c58Field: 'maxFloors',
        c58Calculation: null,
    },
    {
        name: 'plotRatioFAR',
        unit: 'm²st/m²s',
        c58Field: 'plotRatioFAR',
        c58Calculation: null,
    },
    {
        name: 'maxCoveragePercent',
        unit: '%',
        c58Field: 'maxCoverage',
        c58Calculation:
            'percent → fraction (÷ 100): the ordinance prints ocupació màxima as a percentage; ' +
            'C58 maxCoverage is a 0..1 fraction',
    },
    {
        name: 'setback.front_m',
        unit: 'm',
        c58Field: 'setbacks.front_m',
        c58Calculation: null,
    },
    {
        name: 'setback.side_m',
        unit: 'm',
        c58Field: 'setbacks.side_m',
        c58Calculation: null,
    },
    {
        name: 'setback.rear_m',
        unit: 'm',
        c58Field: 'setbacks.rear_m',
        c58Calculation: null,
    },
] as const);

/** Index by name. */
export const DECLARATIVE_PARAMETER_BY_NAME: ReadonlyMap<string, DeclarativeParameterSpec> = (() => {
    const m = new Map<string, DeclarativeParameterSpec>();
    for (const p of DECLARATIVE_PARAMETERS) {
        if (m.has(p.name)) {
            throw new Error(`[declarative] duplicate parameter name "${p.name}".`);
        }
        m.set(p.name, p);
    }
    return m;
})();
