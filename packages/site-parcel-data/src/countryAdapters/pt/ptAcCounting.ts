// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-AC-COUNTING (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §2.1–§2.3 + §12 steps 11–12: the
// national indices as FORMULAS, `Ac` counted by the national rules, trimmed to `Iu`, and emitted
// DISAGGREGATED (hab/com/serv/est/arr/ext/ind/log × above/below the cota de soleira).
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// DR 5/2019 (doctrine §2.1):
//   Iu = Ac / As · Io = (Ai / As) × 100 · Iimp = (Aimp / As) × 100 · Iv = V / As · Pm = Ac / Ai
//   (AVERAGE storeys — NOT an integer count) · Dhab = F / As (fogos/ha).
// `Ac` (§2.2): every floor ABOVE AND BELOW the cota de soleira, EXCLUDING sótão and cave without
// regulation pé-direito; measured at the EXTERIOR perimeter of exterior walls; INCLUDES covered
// circulation and covered exterior spaces. Disaggregated hab/com/serv/est/arr/ext/ind/log and
// above vs below S.
//
// ⛔ WHAT THIS MODULE DECIDES AND WHAT IT LEAVES: it COUNTS and it CHECKS the Iu ceiling; it does
// not choose WHICH floor to remove when Ac exceeds Iu × As — that is a design decision the caller
// makes; the module reports the excess (m²) and the ceiling. A sótão/cave whose regulation
// pé-direito status is UNKNOWN is `unresolved` (blocks): counting it overstates, excluding it
// understates, and the doctrine forbids the silent choice either way (§0.3).
//
// PURITY: L2-pure. Pure arithmetic. No I/O.

import { ptResolved, ptUnresolved, type PtInstrumentRef, type PtProvenancedValue } from './ptProvenance.js';

/** DR 5/2019 — the indices and the Ac counting rule. */
export const PT_DR5_2019_INDICES: PtInstrumentRef = {
    instrument: 'Decreto Regulamentar n.º 5/2019 (conceitos técnicos)',
    version: 'DR 5/2019',
    dateInForce: '2019-09-27',
    article: 'Anexo — área de construção (Ac), área de implantação (Ai), índice de utilização (Iu), índice de ocupação (Io), índice de impermeabilização (Iimp), índice volumétrico (Iv), número médio de pisos (Pm), densidade habitacional (Dhab)',
};

/** The national Ac use categories (doctrine §2.2). */
export type PtAcUse = 'hab' | 'com' | 'serv' | 'est' | 'arr' | 'ext' | 'ind' | 'log';
export const PT_AC_USES: readonly PtAcUse[] = ['hab', 'com', 'serv', 'est', 'arr', 'ext', 'ind', 'log'] as const;

export interface PtFloorInput {
    /** Piso number: 1 = the floor at S, upward; −1 = first below S (doctrine §2.4). Never 0. */
    readonly piso: number;
    readonly use: PtAcUse;
    /** Gross area at the EXTERIOR perimeter of exterior walls, m² (incl. covered circulation/exterior). */
    readonly areaExteriorPerimeterM2: number;
    readonly kind: 'regular' | 'sotao' | 'cave';
    /** For sótão/cave: does it have the regulation pé-direito? null = unknown (blocks). */
    readonly hasRegulationPeDireito?: boolean | null;
}

export interface PtAcCount {
    readonly total: PtProvenancedValue<number>;
    readonly byUse: Readonly<Record<PtAcUse, number>>;
    readonly aboveSoleira: number;
    readonly belowSoleira: number;
    readonly excluded: ReadonlyArray<{ readonly piso: number; readonly kind: 'sotao' | 'cave'; readonly areaM2: number; readonly why: string }>;
}

export type PtAcCountOutcome =
    | { readonly kind: 'counted'; readonly ac: PtAcCount }
    | { readonly kind: 'unresolved'; readonly refusalReason: string; readonly unresolvedValue: PtProvenancedValue<null> };

/** PURE: count Ac by the national rule. TOTAL. */
export function ptCountAc(floors: ReadonlyArray<PtFloorInput>): PtAcCountOutcome {
    const byUse: Record<PtAcUse, number> = { hab: 0, com: 0, serv: 0, est: 0, arr: 0, ext: 0, ind: 0, log: 0 };
    const excluded: Array<{ piso: number; kind: 'sotao' | 'cave'; areaM2: number; why: string }> = [];
    const problems: string[] = [];
    let above = 0;
    let below = 0;
    for (const f of floors) {
        if (!Number.isFinite(f.areaExteriorPerimeterM2) || f.areaExteriorPerimeterM2 < 0) {
            problems.push(`piso ${f.piso}: non-finite or negative area`);
            continue;
        }
        if (f.piso === 0 || !Number.isInteger(f.piso)) {
            problems.push(`piso ${f.piso}: pisos are numbered 1 upward from S and −1 downward — there is no piso 0 (doctrine §2.4)`);
            continue;
        }
        if (f.kind !== 'regular') {
            if (f.hasRegulationPeDireito === null || f.hasRegulationPeDireito === undefined) {
                problems.push(`piso ${f.piso} (${f.kind}): regulation pé-direito status UNKNOWN — Ac cannot be counted (counting overstates, excluding understates; no silent choice, doctrine §0.3)`);
                continue;
            }
            if (f.hasRegulationPeDireito === false) {
                excluded.push({ piso: f.piso, kind: f.kind, areaM2: f.areaExteriorPerimeterM2, why: `${f.kind} without regulation pé-direito — EXCLUDED from Ac (DR 5/2019, doctrine §2.2)` });
                continue;
            }
        }
        byUse[f.use] += f.areaExteriorPerimeterM2;
        if (f.piso > 0) above += f.areaExteriorPerimeterM2;
        else below += f.areaExteriorPerimeterM2;
    }
    if (problems.length > 0) {
        const reason = problems.join('; ');
        return { kind: 'unresolved', refusalReason: reason, unresolvedValue: ptUnresolved('m²', PT_DR5_2019_INDICES, ['floors'], reason) };
    }
    const total = above + below;
    return {
        kind: 'counted',
        ac: {
            total: ptResolved(total, 'm²', PT_DR5_2019_INDICES, 'computed', ['floors[].areaExteriorPerimeterM2', 'floors[].kind', 'floors[].hasRegulationPeDireito'], 'ordinance-pdf'),
            byUse,
            aboveSoleira: above,
            belowSoleira: below,
            excluded,
        },
    };
}

export interface PtIuTrim {
    /** Iu × As — the Ac ceiling, m². */
    readonly ceilingM2: PtProvenancedValue<number>;
    readonly acM2: number;
    readonly withinIu: boolean;
    /** How much Ac must be removed to satisfy Iu (0 when within). */
    readonly excessM2: number;
    /** The Ac the caller may keep — the ceiling when exceeding, else Ac. The CHOICE of what to cut is the caller's. */
    readonly trimmedAcM2: number;
}

/** PURE: doctrine step 11 — "trim to Iu using the national Ac counting rules". */
export function ptTrimToIu(acM2: number, Iu: number, As_m2: number): PtIuTrim | { readonly kind: 'unresolved'; readonly refusalReason: string } {
    if (!Number.isFinite(Iu) || Iu <= 0) return { kind: 'unresolved', refusalReason: `Iu is ${Iu} — not a usable índice de utilização (a value without its article is a bug; check the regulamento token via ptConceptLexicon)` };
    if (!Number.isFinite(As_m2) || As_m2 <= 0) return { kind: 'unresolved', refusalReason: `As (área do solo) is ${As_m2} — the parcel area is unresolved (A1)` };
    if (!Number.isFinite(acM2) || acM2 < 0) return { kind: 'unresolved', refusalReason: `Ac is ${acM2}` };
    const ceiling = Iu * As_m2;
    const excess = Math.max(0, acM2 - ceiling);
    return {
        ceilingM2: ptResolved(ceiling, 'm²', PT_DR5_2019_INDICES, 'computed', ['Iu', 'As'], 'ordinance-pdf'),
        acM2,
        withinIu: excess <= 1e-9,
        excessM2: excess,
        trimmedAcM2: Math.min(acM2, ceiling),
    };
}

/** The disaggregated emission — doctrine step 12 / §13 `yield`. */
export interface PtAcYield {
    readonly acTotalM2: number;
    readonly byUse: Readonly<Record<PtAcUse, number>>;
    readonly aboveSoleiraM2: number;
    readonly belowSoleiraM2: number;
    readonly excludedM2: number;
    readonly instrument: PtInstrumentRef;
}

/** PURE: emit the counted Ac in the national categories. */
export function ptEmitAcYield(ac: PtAcCount): PtAcYield {
    return {
        acTotalM2: ac.total.value,
        byUse: { ...ac.byUse },
        aboveSoleiraM2: ac.aboveSoleira,
        belowSoleiraM2: ac.belowSoleira,
        excludedM2: ac.excluded.reduce((s, e) => s + e.areaM2, 0),
        instrument: PT_DR5_2019_INDICES,
    };
}

export interface PtIndicesInput {
    readonly Ac_m2: number | null;
    readonly As_m2: number | null;
    readonly Ai_m2: number | null;
    /** Aimp = Σ Cimp × area; supply the already-weighted impermeable area, m². */
    readonly Aimp_m2: number | null;
    readonly V_m3: number | null;
    /** Number of fogos (dwellings). */
    readonly F: number | null;
}

export interface PtIndices {
    readonly Iu: number | null;
    /** Percent. */
    readonly Io_pct: number | null;
    /** Percent. */
    readonly Iimp_pct: number | null;
    readonly Iv: number | null;
    /** AVERAGE storeys — not an integer count (doctrine §2.1). */
    readonly Pm: number | null;
    /** fogos per HECTARE. */
    readonly Dhab_per_ha: number | null;
    readonly instrument: PtInstrumentRef;
}

/** PURE: the DR 5/2019 indices from their operands; null wherever an operand is null or As/Ai is 0. */
export function ptIndices(i: PtIndicesInput): PtIndices {
    const div = (a: number | null, b: number | null): number | null =>
        a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || b <= 0 ? null : a / b;
    const Io = div(i.Ai_m2, i.As_m2);
    const Iimp = div(i.Aimp_m2, i.As_m2);
    const Dhab = div(i.F, i.As_m2);
    return {
        Iu: div(i.Ac_m2, i.As_m2),
        Io_pct: Io === null ? null : Io * 100,
        Iimp_pct: Iimp === null ? null : Iimp * 100,
        Iv: div(i.V_m3, i.As_m2),
        Pm: div(i.Ac_m2, i.Ai_m2),
        Dhab_per_ha: Dhab === null ? null : Dhab * 10_000,
        instrument: PT_DR5_2019_INDICES,
    };
}
