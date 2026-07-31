// @pryzm/ordinance-extraction — the INSTRUMENT PRIORITY TABLE.
//
// Per-jurisdiction precedence expressed as DATA, not as code. A table is a value a
// country adapter supplies; the resolver (`resolve.ts`) is the same everywhere.
//
// TWO DESIGN RULES THAT ARE LOAD-BEARING
// --------------------------------------
// 1. AN ABSENT KIND IS UNRANKABLE, NOT WEAKEST. If any surviving candidate's
//    `InstrumentKind` has no entry, the resolver returns `conflicted`, never "the
//    ranked one wins". Ranking an unlisted kind as weakest would be a guess, and a
//    guess is what this whole layer exists to prevent. It is what keeps Madrid's
//    Art. 8.0.6 narrow instead of letting a catalogue listing quietly beat a Norma
//    Zonal on FAR.
//
// 2. PER-PARAMETER OVERRIDES ARE FIRST-CLASS. A special plan may override height but
//    not coverage; Madrid's catalogue overrides `worksRegime` but explicitly NOT
//    FAR/height/coverage. A rule stored atomically with ONE priority cannot express
//    that. `parameterOverrides` is the mechanism, and it exists because of Spain, not
//    Germany.
//
// Pure data + types: no I/O (P5-consistent; L2 leaf).
// Full design: `standards/LEGAL-ATTRIBUTION-MODEL.md` §3.

import { type InstrumentKind } from './types.js';

/** Lower number = stronger. A kind ABSENT from the map is UNRANKABLE (see rule 1). */
export type InstrumentRankMap = Partial<Record<InstrumentKind, number>>;

/**
 * A precedence rule that applies to a NAMED SET of parameters only.
 *
 * The Madrid case in one object: Art. 8.0.6 gives the Catálogos de Protección
 * preference over the Norma Zonal for the *régimen de obras* and the *hospedaje* use
 * conditions — and says NOTHING about FAR, height or coverage. So `catalogue-overlay`
 * is ranked here and unranked in the base map.
 */
export interface ParameterPriorityOverride {
    /** The exact parameter names this override governs. */
    readonly parameters: readonly string[];
    /** The rank map that REPLACES the base map for those parameters. */
    readonly rank: InstrumentRankMap;
    /** WHERE the precedence rule comes from — a citation, not a rationale. */
    readonly citation: string;
}

/** One jurisdiction's instrument precedence, as data. */
export interface InstrumentPriorityTable {
    /** `'de'` | `'es-md'` | `'dk'` — the caller's own jurisdiction key. */
    readonly jurisdiction: string;
    readonly displayName: string;
    /** WHERE the base ordering comes from. */
    readonly citation: string;
    /** Base ranks. An absent kind is UNRANKABLE, not weakest. */
    readonly rank: InstrumentRankMap;
    /** Parameter-scoped overrides that replace the base map wholesale. */
    readonly parameterOverrides?: readonly ParameterPriorityOverride[];
    /**
     * Honest limits, carried IN-BAND so a reader of the DATA — not only a reader of
     * the standard doc — meets them. Madrid's says there is no global precedence
     * clause in the PGOUM.
     */
    readonly note?: string;
}

/**
 * The rank map that governs ONE parameter under this table: a matching
 * `parameterOverrides` entry if there is one, else the base map.
 *
 * First match wins, so an adapter can order its overrides from most to least
 * specific. Overlapping overrides are a table-authoring bug this does not police.
 */
export function rankMapFor(
    table: InstrumentPriorityTable,
    parameter: string,
): InstrumentRankMap {
    const override = table.parameterOverrides?.find((o) => o.parameters.includes(parameter));
    return override ? override.rank : table.rank;
}

/**
 * The rank of one kind under one parameter, or `null` if the table cannot rank it.
 *
 * ⚠ `null` means UNRANKABLE and the caller must refuse. It does NOT mean "weakest".
 */
export function instrumentRank(
    table: InstrumentPriorityTable,
    parameter: string,
    kind: InstrumentKind,
): number | null {
    const rank = rankMapFor(table, parameter)[kind];
    return rank === undefined ? null : rank;
}
