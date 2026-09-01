// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I) — DENMARK: the `bebygpctaf`
// denominator codelist, IMPORTED from the state register, never invented.
//
// SOURCE (cited, not paraphrased): Plandata.dk keyless WFS codelist layer
// `pdk:theme_pdk_codelist_bygberegnaf_v`, live-probed 2026-08-31 — recorded in
// audit/europe-site-intel/2026-08-31/lanes/germany-denmark-switzerland.md §DK-2.
// Danish labels below are carried VERBATIM from that probe transcript (which
// transliterates å as "aa"); they are the register's meanings, not ours.
//
// WHY THIS IS LOAD-BEARING: `bebygpct` (building %, the Danish FAR analogue) is
// meaningless without `bebygpctaf` — WHAT the percentage is computed OF. The
// probe's live consequence: Noerrebro ramme `bebygpct=150, af=4` → per cadastral
// parcel, safe to multiply; Aarhus ramme `bebygpct=180, af=1` → of the plan area
// as a WHOLE — a naive per-parcel 180% GFA would be WRONG. This is PRYZM's C63
// "denominator = buildable land" lesson appearing as a coded field in national
// data; a DK adapter MUST branch on all four values (REPORT §I invariant:
// "denominator is data, never assumed").
//
// ── NON-RIVALRY (C84 EI-9) ────────────────────────────────────────────────────
// `LandBasis` (site/zoning/LandBasis.ts, C63 §3.2/L-656) remains THE canonical
// denominator vocabulary (gross / net-of-cesion / parcel / buildable / unknown).
// This codelist is the DANISH WIRE ENCODING an adapter receives; mapping a DK
// code onto a `LandBasis` is adapter semantics (and codes 1–3 do not all have
// clean equivalents — the plan-area-as-a-whole basis is BROADER than `gross`
// for one parcel). No mapping is minted here: publishing an unverified mapping
// table would be exactly the "invent a mapping to paper over the mismatch"
// move L-664 forbids.
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';

/** One row of the state codelist, as served. */
export interface DkBygberegnafCodelistRow {
    /** The wire code carried in `bebygpctaf`. */
    readonly code: 1 | 2 | 3 | 4;
    /** Danish label, verbatim from the probed codelist (aa = å transliteration). */
    readonly da: string;
    /** English gloss recorded in the lane evidence alongside the probe. */
    readonly en: string;
}

/**
 * The four denominator codes of `pdk:theme_pdk_codelist_bygberegnaf_v`
 * (probed 2026-08-31; lane 2 §DK-2). Closed set — a fifth value in live data is
 * a NATIONAL SCHEMA CHANGE and must fail the parse, not be absorbed.
 */
export const DK_BYGBEREGNAF_CODELIST: readonly DkBygberegnafCodelistRow[] = Object.freeze([
    Object.freeze({ code: 1, da: 'Omraadet som helhed', en: 'the plan area as a whole' } as const),
    Object.freeze({ code: 2, da: 'Den enkelte ejendom', en: 'the property/estate (BFE unit)' } as const),
    Object.freeze({ code: 3, da: 'Den enkelte grund', en: 'the individual plot' } as const),
    Object.freeze({ code: 4, da: 'Det enkelte jordstykke', en: 'the individual cadastral parcel' } as const),
]);

/** Zod schema for a `bebygpctaf` wire value. */
export const DkBygberegnafCodeSchema = z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
]);
export type DkBygberegnafCode = z.infer<typeof DkBygberegnafCodeSchema>;

/** Pure lookup: wire code → codelist row (total over the closed set). */
export function dkBygberegnafRow(code: DkBygberegnafCode): DkBygberegnafCodelistRow {
    return DK_BYGBEREGNAF_CODELIST[code - 1]!;
}
