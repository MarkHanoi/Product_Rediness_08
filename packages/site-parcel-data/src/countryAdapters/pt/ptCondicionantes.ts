// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-CONDICIONANTES (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §11 B4 + §12 step 10: the
// condicionantes are VETOES, not trims; RAN/REN are read WITH their EXCLUSION layers; and the
// REN source is LICENCE-GATED for commercial use.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE FALSE-REFUSAL DEFECT THIS FILE EXISTS TO PREVENT (doctrine §11 B4, verbatim): "ALWAYS query
// RAN/REN EXCLUSION layers (codes 69, 82). Querying REN alone produces FALSE REFUSALS." A parcel
// inside the REN polygon but inside an EXCLUSION (an area the RJREN régime released) is
// BUILDABLE; a resolver that saw only the REN hit would refuse it — a refusal is the safe DIRECTION
// (L-616) but it is still a WRONG ANSWER, and the doctrine names it as such. So a REN/RAN hit with
// the exclusion layer NOT QUERIED is UNRESOLVED (blocks), never a veto.
//
// ⭐ VETO, NOT TRIM. A condicionante does not shrink a setback or lower a height: over the area it
// covers, nothing may be built under that régime. The output therefore names each applied
// condicionante with `effect: 'veto'` and leaves geometry to the caller (the veto area is the
// condicionante polygon ∩ parcel — a subtraction the caller performs on the polígono de
// implantação; this module does not hold polygons).
//
// ⚖ LICENCE GATE (doctrine §11): APA/SNIAmb terms PROHIBIT commercialisation and cap use at
// 1:25 000. If the output is commercial and no APA authorisation is on file, REN evidence sourced
// from APA/SNIAmb is NOT USABLE — source REN via the municipal planta de condicionantes and RECORD
// which source was used. This module records `sourceUsed` on every outcome and refuses APA-sourced
// REN for commercial use without authorisation.
//
// ⚠ CITATIONS. The constituting act of each servidão arrives FLATTENED on the SRUP features
// (`ptPdmObjectGates.ts` → `PtSrupServCitation`, measured live 2026-09-02); pass it in and it is
// cited verbatim. The framing régimes are named here by instrument (RJREN — DL 166/2008; RJRAN —
// DL 73/2009) WITHOUT an article number, because no lane has read the prohibited-uses article of
// either and this file will not pin one it has not read. That gap is stated on the output.
//
// PURITY: L2-pure. Data + pure functions. No I/O.

import type { PtSrupServCitation } from './ptPdmObjectGates.js';
import type { PtTristate } from './ptRusticoFuelStrip.js';

/** Anexo I-PC codes for the RAN/REN pair AND their exclusion layers (doctrine §11 B4). */
export const PT_CONDICIONANTE_REN = 148;
export const PT_CONDICIONANTE_REN_EXCLUSAO = 82;
export const PT_CONDICIONANTE_RAN = 68;
export const PT_CONDICIONANTE_RAN_EXCLUSAO = 69;

/** The framing régimes, named by instrument. ⚠ Article NOT pinned — see the header. */
export const PT_RJREN_INSTRUMENT = 'Regime Jurídico da Reserva Ecológica Nacional (RJREN) — DL 166/2008, as amended; prohibited-uses article NOT pinned by this lane';
export const PT_RJRAN_INSTRUMENT = 'Regime Jurídico da Reserva Agrícola Nacional (RJRAN) — DL 73/2009, as amended; prohibited-uses article NOT pinned by this lane';

/** Doctrine §11 licence gate, quotable. */
export const PT_APA_LICENCE_GATE =
    'APA/SNIAmb terms PROHIBIT commercialisation, require express authorisation and cap use at 1:25 000. ' +
    'For a commercial output without APA authorisation on file, source REN via the municipal planta de condicionantes and record the source used.';

/** A layer answer at the point: hit / clear / not queried (tristate — the third never collapses). */
export type PtLayerHit = 'hit' | 'clear' | null;

export type PtRenSource = 'municipal-planta-condicionantes' | 'apa-sniamb';

export interface PtCondicionantesInput {
    readonly ren: PtLayerHit;
    /** Code 82 — REN exclusion at the point. ⛔ Must be queried whenever `ren === 'hit'`. */
    readonly renExclusao: PtLayerHit;
    readonly ran: PtLayerHit;
    /** Code 69 — RAN exclusion at the point. ⛔ Must be queried whenever `ran === 'hit'`. */
    readonly ranExclusao: PtLayerHit;
    /** Which source the REN answer came from. Required when `ren !== null`. */
    readonly renSource: PtRenSource | null;
    /** Is this output commercial? Drives the APA licence gate. */
    readonly commercialUse: boolean;
    /** Is an express APA authorisation on file? */
    readonly apaAuthorisationOnFile: boolean;
    /** The constituting acts, when the SRUP features carried them (cited verbatim). */
    readonly renAct?: PtSrupServCitation | null;
    readonly ranAct?: PtSrupServCitation | null;
    /** Other condicionantes hit at the point (heritage 91–97, DPH, …) — carried as vetoes-by-code. */
    readonly others?: ReadonlyArray<{ readonly codigo: number; readonly designacao: string; readonly act?: PtSrupServCitation | null }>;
    /** Is the parcel inside the REN/RAN hit polygon ENTIRELY (true), partly (false) or unknown (null)? */
    readonly coversWholeParcel?: PtTristate;
}

export type PtCondicionanteEffect = 'veto' | 'cleared-by-exclusion' | 'unresolved' | 'not-applicable';

export interface PtAppliedCondicionante {
    readonly codigo: number;
    readonly designacao: string;
    readonly effect: PtCondicionanteEffect;
    readonly instrument: string;
    /** The constituting act, verbatim from the SRUP feature, or null. */
    readonly act: string | null;
    readonly why: string;
}

export type PtCondicionantesVerdict =
    | {
          readonly kind: 'clear';
          readonly applied: readonly PtAppliedCondicionante[];
          readonly sourceUsed: PtRenSource | null;
      }
    | {
          /** At least one VETO applies. `wholeParcel` true ⇒ nothing may be built; false/null ⇒ a partial veto the caller subtracts. */
          readonly kind: 'veto';
          readonly applied: readonly PtAppliedCondicionante[];
          readonly wholeParcel: PtTristate;
          readonly sourceUsed: PtRenSource | null;
          readonly legallyGrounded: true;
      }
    | {
          /** Doctrine §0.2 — an unresolved condicionante BLOCKS the envelope. */
          readonly kind: 'unresolved';
          readonly applied: readonly PtAppliedCondicionante[];
          readonly refusalReason: string;
          readonly sourceUsed: PtRenSource | null;
      };

function actLine(a: PtSrupServCitation | null | undefined): string | null {
    if (!a) return null;
    const parts = [a.servLei];
    if (a.servData) parts.push(`de ${a.servData.slice(0, 10)}`);
    if (a.servDr) parts.push(`D.R. ${a.servDr}`);
    if (a.leiTipo) parts.push(`ao abrigo de ${a.leiTipo}`);
    return parts.join(', ');
}

/**
 * PURE: evaluate the B4 constraint stack at a point. TOTAL. Every RAN/REN reading is checked
 * against its EXCLUSION layer first; a hit with the exclusion not queried is `unresolved`; a hit
 * inside an exclusion is `cleared-by-exclusion`; a hit with the exclusion clear is a `veto`.
 */
export function evaluatePtCondicionantes(input: PtCondicionantesInput): PtCondicionantesVerdict {
    const applied: PtAppliedCondicionante[] = [];
    const unresolved: string[] = [];
    const sourceUsed = input.ren === null ? null : input.renSource;

    // ⚖ Licence gate — before any REN reading is used.
    if (input.ren !== null && input.renSource === null) {
        unresolved.push('REN was read but its SOURCE is not recorded — the licence gate cannot be applied (doctrine §11: record which source was used).');
    } else if (
        input.ren !== null &&
        input.renSource === 'apa-sniamb' &&
        input.commercialUse &&
        !input.apaAuthorisationOnFile
    ) {
        unresolved.push(
            'REN evidence is sourced from APA/SNIAmb for a COMMERCIAL output with no APA authorisation on file — not usable. ' +
            PT_APA_LICENCE_GATE,
        );
    }

    const pair = (
        name: 'REN' | 'RAN',
        codigo: number,
        excl: number,
        hit: PtLayerHit,
        exclHit: PtLayerHit,
        instrument: string,
        act: PtSrupServCitation | null | undefined,
    ): void => {
        const designacao = name === 'REN' ? 'REN — Reserva Ecológica Nacional' : 'RAN — Reserva Agrícola Nacional';
        if (hit === null) return; // not queried: nothing to say about it (the caller may still be incomplete — B4 is the caller's checklist)
        if (hit === 'clear') {
            applied.push({ codigo, designacao, effect: 'not-applicable', instrument, act: actLine(act), why: `${name} layer answered CLEAR at the point` });
            return;
        }
        if (exclHit === null) {
            unresolved.push(`${name} HIT at the point but the ${name} EXCLUSION layer (código ${excl}) was NOT QUERIED — querying ${name} alone produces FALSE REFUSALS (doctrine §11 B4 ⛔). Query código ${excl} or refuse.`);
            applied.push({ codigo, designacao, effect: 'unresolved', instrument, act: actLine(act), why: `exclusion layer ${excl} not queried` });
            return;
        }
        if (exclHit === 'hit') {
            applied.push({ codigo, designacao, effect: 'cleared-by-exclusion', instrument, act: actLine(act), why: `${name} hit lies inside a ${name} EXCLUSION (código ${excl}) — the régime does not bind here` });
            return;
        }
        applied.push({ codigo, designacao, effect: 'veto', instrument, act: actLine(act), why: `${name} hit, exclusion layer (código ${excl}) CLEAR — the régime binds: a VETO over the covered area, not a trim` });
    };
    pair('REN', PT_CONDICIONANTE_REN, PT_CONDICIONANTE_REN_EXCLUSAO, input.ren, input.renExclusao, PT_RJREN_INSTRUMENT, input.renAct);
    pair('RAN', PT_CONDICIONANTE_RAN, PT_CONDICIONANTE_RAN_EXCLUSAO, input.ran, input.ranExclusao, PT_RJRAN_INSTRUMENT, input.ranAct);

    for (const o of input.others ?? []) {
        applied.push({
            codigo: o.codigo,
            designacao: o.designacao,
            effect: 'veto',
            instrument: `Planta de condicionantes — Anexo I-PC código ${o.codigo}`,
            act: actLine(o.act),
            why: 'served as a condicionante at the point — applied as a VETO over its area pending the act\'s own terms (never a trim)',
        });
    }

    if (unresolved.length > 0) {
        return { kind: 'unresolved', applied, refusalReason: unresolved.join(' '), sourceUsed };
    }
    if (applied.some((a) => a.effect === 'veto')) {
        return { kind: 'veto', applied, wholeParcel: input.coversWholeParcel ?? null, sourceUsed, legallyGrounded: true };
    }
    return { kind: 'clear', applied, sourceUsed };
}
