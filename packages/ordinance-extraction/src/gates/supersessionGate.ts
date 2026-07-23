// GATE — Stage 0: supersession (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 0).
//
// ⚠ RUNS BEFORE EXTRACTION, NEVER AFTER. Extracting from a superseded instrument
// yields a DOUBLY-wrong citation (wrong value AND dead instrument). A document
// that fails this gate is never fetched for extraction — the gate is structurally
// upstream so it cannot be forgotten.
//
// Pure: no I/O. The per-city ENUMERATOR supplies the raw register flags (Barcelona
// `detall.vigencia` + AMB `EXP_DEROG`/`RECURS_O_SENTENCIA`/`TANCAMENT_OUT`; Córdoba
// SIU `Planeamiento_Vigente` + any later *modificación*); this gate maps them to a
// single verdict + a go/no-go on extraction.

import { type SupersessionStatus } from '@pryzm/schemas';
import { type SupersessionResult } from '../types.js';

/**
 * The raw in-force signals a city enumerator resolves. All optional — a city that
 * cannot answer a given axis leaves it undefined, and the gate treats missing
 * evidence conservatively (never as "in force").
 */
export interface SupersessionInput {
    /**
     * The register's own vigencia string where it publishes one
     * (Barcelona `detall.vigencia`: `'VIGENT'` / `'DEROGAT'`; Córdoba
     * `'Planeamiento_Vigente'`). Case-insensitive; matched on a stem so
     * `VIGENT`/`VIGENTE`/`Vigent` all read as in-force.
     */
    readonly vigencia?: string;
    /** AMB `EXP_DEROG` — the expedient is repealed. */
    readonly expDerogated?: boolean;
    /** AMB `TANCAMENT_OUT` — the instrument was closed out. */
    readonly closedOut?: boolean;
    /** AMB `RECURS_O_SENTENCIA` — under judicial appeal / sentence. */
    readonly underAppeal?: boolean;
    /** A later *modificación* supersedes this document (Córdoba). */
    readonly supersededByLater?: boolean;
}

function readsAsVigent(vigencia: string | undefined): boolean | undefined {
    if (vigencia === undefined) return undefined;
    const s = vigencia.trim().toLowerCase();
    if (s === '') return undefined;
    // 'derogat' / 'derogado' must NOT match the 'vigent' stem.
    if (s.startsWith('derog')) return false;
    if (s.startsWith('vigent') || s.startsWith('vigente')) return true;
    return undefined;
}

/**
 * Stage-0 supersession gate. Returns the verdict AND whether the document may be
 * extracted at all.
 *
 * Precedence (strongest evidence of death first):
 *   1. explicit repeal (`expDerogated` / `closedOut`) or `vigencia: derogat`,
 *      or a later modificación ⇒ `derogated`, **shouldExtract = false**.
 *   2. `underAppeal` ⇒ `under-appeal`, shouldExtract = true WITH a caveat (in
 *      force but litigated — extractable, must carry the caveat).
 *   3. positive `vigencia: vigent` ⇒ `vigent`, shouldExtract = true.
 *   4. no positive evidence of being in force ⇒ `unknown`, **shouldExtract =
 *      false** — an unverified in-force status is treated as coarser-than-vigent;
 *      the pipeline does not extract from a document it cannot confirm is live.
 */
export function supersessionGate(input: SupersessionInput): SupersessionResult {
    const vigent = readsAsVigent(input.vigencia);

    if (input.expDerogated || input.closedOut || input.supersededByLater || vigent === false) {
        const reasons: string[] = [];
        if (input.expDerogated) reasons.push('EXP_DEROG (repealed)');
        if (input.closedOut) reasons.push('TANCAMENT_OUT (closed out)');
        if (input.supersededByLater) reasons.push('superseded by a later modificación');
        if (vigent === false) reasons.push('vigencia = derogat');
        return {
            status: 'derogated' satisfies SupersessionStatus,
            shouldExtract: false,
            detail: `Superseded — ${reasons.join('; ')}. Not fetched for extraction (Stage 0).`,
            caveat: null,
        };
    }

    if (input.underAppeal) {
        return {
            status: 'under-appeal',
            shouldExtract: true,
            detail: 'In force but under judicial appeal (RECURS_O_SENTENCIA).',
            caveat: 'Instrument is under judicial appeal — value may change on the ruling.',
        };
    }

    if (vigent === true) {
        return {
            status: 'vigent',
            shouldExtract: true,
            detail: 'In force (vigencia = vigent).',
            caveat: null,
        };
    }

    return {
        status: 'unknown',
        shouldExtract: false,
        detail:
            'In-force status could not be confirmed by any register — treated as ' +
            'coarser-than-vigent; not extracted until confirmed (Stage 0, §CONTEXT-DATA-HONESTY).',
        caveat: null,
    };
}
