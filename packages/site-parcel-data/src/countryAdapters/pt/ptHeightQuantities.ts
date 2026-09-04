// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-HEIGHT-QUANTITIES (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §2.4 + §3 art. 65 + §4:
// the FIVE height quantities kept distinct, `Alt` as an ABSOLUTE cap never collapsed into `H`,
// metres and storeys JOINTLY binding, and a datum that holds MORE THAN ONE value.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Doctrine §2.4 (DR 5/2019 concepts): S (cota de soleira) · Es (elevação da soleira, may be
// negative) · H (altura da edificação, S → highest point incl. roof, PLUS Es) · Hf (altura da
// fachada, S → cornija/platibanda, PLUS Es) · Alt (altitude máxima de edificação — ABSOLUTE cap
// in the national datum against which ALL constructed elements count; "stricter than H; NEVER
// collapse into H") · h (altura entre pisos = pé-direito + upper slab).
//
// ⛔ THE TWO DEFECTS THIS FILE MAKES IMPOSSIBLE:
//   1. Reading `Alt` as if it were `H`. `Alt` is an ALTITUDE (metres above the national datum);
//      `H` is a HEIGHT (metres above S). They are only comparable once S — the soleira's altitude
//      in that datum — is known. With S unknown, an `Alt` cap is UNRESOLVED and BLOCKS (doctrine
//      §0.2); it is never substituted by H, and H is never "assumed to be the binding one".
//   2. Reading "N pisos" as N × some metres. RGEU art. 65 fixes a MINIMUM pé-direito (2,40 m
//      residential / 3,00 m commercial), not a floor height, and `h` adds an upper-slab thickness
//      no national text fixes. So the storey count and the metre cap are JOINTLY binding: the
//      reachable storeys are min(maxFloors, ⌊cap / h⌋) with h ≥ pé-direito. Omitting the slab
//      OVERSTATES the reachable count (⌊cap/2,40⌋ ≥ ⌊cap/(2,40 + slab)⌋), so the omission is
//      FLAGGED with its direction — never silent (L-616).
//
// ⚠ WATCH FLAG (doctrine §3/§13): RGEU revocation is DECREED WITH EFFECTS DEFERRED (DL 108/2026
// art. 8 amending DL 10/2024 art. 25 — effects follow a technical building regulation not yet
// published). `PT_RGEU_STATUS_WATCH` travels on every art. 65 output. Verify before relying.
//
// PURITY: L2-pure. Data + pure functions. No I/O.

import { ptAssumed, ptResolved, ptUnresolved, type PtInstrumentRef, type PtProvenancedValue } from './ptProvenance.js';

/** DR 5/2019 — the national dictionary that defines the five quantities (doctrine §2, §2.4). */
export const PT_DR5_2019_HEIGHT_CONCEPTS: PtInstrumentRef = {
    instrument: 'Decreto Regulamentar n.º 5/2019 (conceitos técnicos do ordenamento do território e urbanismo)',
    version: 'DR 5/2019',
    dateInForce: '2019-09-27',
    article: 'Anexo — conceitos: cota de soleira (S), elevação da soleira (Es), altura da edificação (H), altura da fachada (Hf), altitude máxima de edificação (Alt), altura entre pisos (h)',
};

/** RGEU art. 65 — the minimum pé-direito (doctrine §3). */
export const PT_RGEU_ART65: PtInstrumentRef = {
    instrument: 'Regulamento Geral das Edificações Urbanas (RGEU, DL 38 382/1951, as amended)',
    version: 'RGEU — in force, revocation decreed with effects DEFERRED',
    dateInForce: null,
    article: 'art. 65.º — pé-direito mínimo 2,40 m (habitação) / 3,00 m (comércio)',
};

/** Doctrine §13 watch flag, carried on every RGEU-derived value. */
export const PT_RGEU_STATUS_WATCH =
    'RGEU status: revocation decreed, effects DEFERRED (DL 108/2026 art. 8 → DL 10/2024 art. 25) ' +
    'until the technical building regulation is published — no date announced. Verify before relying.';

/** RGEU art. 65 minima, in metres. NOT tunables — the article\'s own numbers. */
export const PT_RGEU_ART65_MIN_PE_DIREITO_M = Object.freeze({ residential: 2.4, commercial: 3.0 });

/** The parcel datum — doctrine §4: "your datum field must hold MORE THAN ONE VALUE". */
export interface PtDatum {
    /** Cota de soleira S — the main entrance threshold's ALTITUDE in the national datum (m), or null. */
    readonly S_m: number | null;
    /** Elevação da soleira Es (m; may be NEGATIVE) — must be fixed when the entrance is raised > 0,20 m. */
    readonly Es_m: number | null;
    /**
     * Auxiliary cota de soleira S2 for a second façade at a very different level (§4) — the level of
     * the floor nearest that façade's pavement. Null when the building has one frontage datum.
     */
    readonly S2_m?: number | null;
}

/** The height limits the plan states, each in its OWN quantity. Null = the plan states none. */
export interface PtHeightLimits {
    /** H cap — altura da edificação (m above S, inclusive of Es). */
    readonly H_m: number | null;
    /** Hf cap — altura da fachada (m above S, inclusive of Es). */
    readonly Hf_m: number | null;
    /** ⛔ Alt cap — altitude máxima de edificação: ABSOLUTE metres in the national datum. */
    readonly Alt_m: number | null;
    /** Número máximo de pisos, or null. */
    readonly maxFloors: number | null;
}

/** Which quantity ended up governing the top of the volume. */
export type PtGoverningHeightQuantity = 'H' | 'Alt' | 'H=Alt' | 'none';

export type PtTopCapOutcome =
    | {
          readonly kind: 'cap';
          /** The permitted height of the highest constructed element ABOVE S, in metres. */
          readonly topAboveS: PtProvenancedValue<number>;
          readonly governing: PtGoverningHeightQuantity;
          /** Hf, converted the same way, when the plan states it (a SECOND, lower plane on the façade). */
          readonly facadeAboveS: PtProvenancedValue<number> | null;
      }
    | {
          readonly kind: 'unresolved';
          readonly refusalReason: string;
          readonly instrument: PtInstrumentRef;
      }
    | {
          /** The plan states neither H nor Alt: no vertical limit from THIS module (a plane may still bound it). */
          readonly kind: 'no-metric-cap';
          readonly why: string;
      };

/**
 * PURE: the permitted top ABOVE S from H / Alt / Es — the five quantities composed without
 * collapsing any two of them.
 *
 *   top − S ≤ H − Es        (H is measured from S and INCLUDES Es)
 *   top     ≤ Alt           (absolute) ⇔ top − S ≤ Alt − S
 *
 * ⛔ `Alt` with S unknown ⇒ UNRESOLVED (blocks). Never "use H instead" — Alt is stricter by
 * definition, so dropping it can only OVERSTATE.
 * ⚠ Es unknown ⇒ treated as 0 and FLAGGED `assumed`: a positive Es would make the true cap LOWER,
 * so the assumption's direction (may overstate by Es) is stated on the value.
 */
export function ptTopCapAboveSoleira(datum: PtDatum, limits: PtHeightLimits): PtTopCapOutcome {
    const inputs = ['H_m', 'Alt_m', 'S_m', 'Es_m'];
    if (limits.H_m === null && limits.Alt_m === null) {
        return {
            kind: 'no-metric-cap',
            why: 'the plan states neither an altura da edificação (H) nor an altitude máxima (Alt); any vertical limit must come from a plane rule (RGEU art. 59) or a storey count',
        };
    }
    if (limits.Alt_m !== null && datum.S_m === null) {
        return {
            kind: 'unresolved',
            instrument: PT_DR5_2019_HEIGHT_CONCEPTS,
            refusalReason:
                `The plan fixes an ALTITUDE máxima de edificação (Alt = ${limits.Alt_m} m, national ` +
                'datum) but the cota de soleira S is not in hand, so Alt cannot be converted to a ' +
                'height above the parcel. Alt is stricter than H by definition (doctrine §2.4) — ' +
                'substituting H would overstate. Resolve S (DGT MDT at the entrance threshold, or the ' +
                'PP/loteamento altimetric fix) or refuse.',
        };
    }
    const assumptions: string[] = [];
    let Es = datum.Es_m;
    if (Es === null) {
        Es = 0;
        assumptions.push(
            'Es (elevação da soleira) not in hand — taken as 0. If the entrance is raised above the ' +
            'pavement, the true H-derived cap is LOWER by Es: this value may OVERSTATE by that amount.',
        );
    }
    const fromH = limits.H_m === null ? null : limits.H_m - Es;
    const fromAlt = limits.Alt_m === null || datum.S_m === null ? null : limits.Alt_m - datum.S_m;
    let top: number;
    let governing: PtGoverningHeightQuantity;
    if (fromH !== null && fromAlt !== null) {
        if (Math.abs(fromH - fromAlt) < 1e-9) { top = fromH; governing = 'H=Alt'; }
        else if (fromAlt < fromH) { top = fromAlt; governing = 'Alt'; }
        else { top = fromH; governing = 'H'; }
    } else if (fromAlt !== null) { top = fromAlt; governing = 'Alt'; }
    else { top = fromH as number; governing = 'H'; }

    if (top < 0) {
        return {
            kind: 'unresolved',
            instrument: PT_DR5_2019_HEIGHT_CONCEPTS,
            refusalReason:
                `The governing cap (${governing}) resolves to ${top.toFixed(2)} m above S — below ground. ` +
                'Either Alt lies below the soleira altitude or Es exceeds H: a data defect to report, not a zero-height envelope.',
        };
    }
    const mk = (v: number): PtProvenancedValue<number> =>
        assumptions.length === 0
            ? ptResolved(v, 'm above S', PT_DR5_2019_HEIGHT_CONCEPTS, 'computed', inputs, 'ordinance-pdf')
            : ptAssumed(v, 'm above S', PT_DR5_2019_HEIGHT_CONCEPTS, 'computed', inputs, 'ordinance-pdf', assumptions);
    const facade = limits.Hf_m === null ? null : mk(Math.max(0, Math.min(limits.Hf_m - Es, top)));
    return { kind: 'cap', topAboveS: mk(top), governing, facadeAboveS: facade };
}

export type PtBindingSide = 'metres' | 'storeys' | 'both' | 'storeys-only' | 'metres-only';

export interface PtJointHeightStoreys {
    /** The storeys actually reachable under the metre cap: min(maxFloors, ⌊cap / h⌋). */
    readonly effectiveMaxFloors: PtProvenancedValue<number> | null;
    /** The floor-to-floor height used (pé-direito mínimo + slab), or null when no metre cap exists. */
    readonly floorToFloor_m: PtProvenancedValue<number> | null;
    readonly binding: PtBindingSide;
    /**
     * ⛔ A storey count NEVER yields a metre cap: art. 65 is a MINIMUM, so "N pisos" bounds nothing
     * from above in metres. Always null, and the reason is stated — a consumer looking for a
     * derived H here is making the conversion no plan guarantees.
     */
    readonly metreCapFromStoreys: null;
    readonly metreCapFromStoreysWhy: string;
    readonly watch: string;
}

/**
 * PURE: art. 65 — make the metre cap and the storey count JOINTLY binding.
 *
 * `use` null ⇒ the COMMERCIAL minimum (3,00 m) is used — the tighter one, so the storey count is
 * UNDER-stated for a residential building (the safe direction) — and flagged `assumed`.
 * `slabThickness_m` null ⇒ h = pé-direito alone, which OVER-states ⌊cap/h⌋; flagged `assumed`
 * with the direction. Both flags travel on the value (doctrine §0.4).
 */
export function ptJointHeightStoreys(input: {
    readonly capAboveS_m: number | null;
    readonly maxFloors: number | null;
    readonly use: 'residential' | 'commercial' | null;
    readonly slabThickness_m: number | null;
}): PtJointHeightStoreys {
    const why =
        'RGEU art. 65.º fixes a MINIMUM pé-direito, not a floor height: a storey count cannot be ' +
        'converted to a metre cap from national law (doctrine §3; ptConceptLexicon "N pisos" trap).';
    if (input.capAboveS_m === null) {
        return {
            effectiveMaxFloors: input.maxFloors === null ? null
                : ptResolved(input.maxFloors, 'pisos', PT_RGEU_ART65, 'direct', ['maxFloors'], 'ordinance-pdf'),
            floorToFloor_m: null,
            binding: input.maxFloors === null ? 'metres-only' : 'storeys-only',
            metreCapFromStoreys: null,
            metreCapFromStoreysWhy: why,
            watch: PT_RGEU_STATUS_WATCH,
        };
    }
    const assumptions: string[] = [];
    const pd = input.use === 'residential'
        ? PT_RGEU_ART65_MIN_PE_DIREITO_M.residential
        : PT_RGEU_ART65_MIN_PE_DIREITO_M.commercial;
    if (input.use === null) {
        assumptions.push(
            'use not stated — the COMMERCIAL minimum pé-direito (3,00 m) is applied, which UNDER-states ' +
            'the reachable storeys for a residential building (safe direction).',
        );
    }
    let slab = input.slabThickness_m;
    if (slab === null) {
        slab = 0;
        assumptions.push(
            'upper-slab thickness not in hand — h taken as the pé-direito alone, which OVER-states the ' +
            'reachable storey count (⌊cap/h⌋ is larger for a smaller h). Supply the slab to resolve.',
        );
    }
    const h = pd + slab;
    const reachable = Math.max(0, Math.floor(input.capAboveS_m / h + 1e-9));
    const effective = input.maxFloors === null ? reachable : Math.min(input.maxFloors, reachable);
    const binding: PtBindingSide =
        input.maxFloors === null ? 'metres-only'
            : reachable < input.maxFloors ? 'metres'
                : reachable > input.maxFloors ? 'storeys'
                    : 'both';
    const inputs = ['capAboveS_m', 'maxFloors', 'use', 'slabThickness_m'];
    const mk = <T>(v: T, unit: string, method: 'computed' | 'direct'): PtProvenancedValue<T> =>
        assumptions.length === 0
            ? ptResolved(v, unit, PT_RGEU_ART65, method, inputs, 'ordinance-pdf')
            : ptAssumed(v, unit, PT_RGEU_ART65, method, inputs, 'ordinance-pdf', assumptions);
    return {
        effectiveMaxFloors: mk(effective, 'pisos', 'computed'),
        floorToFloor_m: mk(h, 'm', 'computed'),
        binding,
        metreCapFromStoreys: null,
        metreCapFromStoreysWhy: why,
        watch: PT_RGEU_STATUS_WATCH,
    };
}

/** One façade datum (doctrine §4). */
export interface PtFacadeDatum {
    readonly id: 'Hf1' | 'Hf2';
    readonly S_m: number;
    readonly basis: string;
}

/**
 * PURE: the façade datums a multi-frontage building carries — ONE per fixed soleira (§4). Returns
 * `unresolved` when even S is unknown; Hf2 appears only when S2 was arbitrated.
 */
export function ptFacadeDatums(datum: PtDatum):
    | { readonly ok: true; readonly datums: readonly PtFacadeDatum[] }
    | { readonly ok: false; readonly refusalReason: string } {
    if (datum.S_m === null) {
        return { ok: false, refusalReason: 'cota de soleira S not in hand — no façade height can be fixed (doctrine §2.4/§4)' };
    }
    const out: PtFacadeDatum[] = [
        { id: 'Hf1', S_m: datum.S_m, basis: 'main entrance cota de soleira S (DR 5/2019)' },
    ];
    if (datum.S2_m !== undefined && datum.S2_m !== null) {
        out.push({
            id: 'Hf2',
            S_m: datum.S2_m,
            basis: 'auxiliary cota de soleira S2 — level of the floor nearest the second façade\'s pavement (doctrine §4)',
        });
    }
    return { ok: true, datums: out };
}

/** Convenience: an unresolved height value in the DR 5/2019 vocabulary (for callers composing blocks). */
export function ptUnresolvedHeight(quantity: 'H' | 'Hf' | 'Alt' | 'S' | 'Es', why: string): PtProvenancedValue<null> {
    return ptUnresolved(quantity === 'Alt' || quantity === 'S' ? 'm (national datum)' : 'm', PT_DR5_2019_HEIGHT_CONCEPTS, [quantity], why);
}
