// ── CANARIAS SIPU PROVIDER — parcel → instrument → EDIF zone → validated parameters. ────────
//
// The resolver half of the Canarias adapter. `esCanariasSipu.ts` holds the machinery and the
// gate; `esTeldePgo2003.ts` holds the curated pack; THIS file turns a raw SIPU `EDIF` record into
// something the engine may consume — or into an honest refusal.
//
// ⚠⚠ **VALIDATE BEFORE COUNTING, AND BEFORE DRAWING.** Everything here exists because
// `non-null` is not `valid`:
//   • `0` in `SepMinFr` is LEGITIMATE (build to the boundary) — `0` in `AltMaxPl` is NOT
//     (a zero-storey building is a null wearing a number);
//   • `PMaxOcup` outside 0–100 is a null substitute, and `PMaxOcup = 100` ALONGSIDE a published
//     setback is SUSPECT-NEVER-VALID: the two contradict, so at most one of them is a rule;
//   • `EdifMax` above ~20 is not a FAR — it is m² of floor area, or an m³/m² VOLUME ratio, in a
//     column labelled for a ratio;
//   • `AltMaxPl = 7,5` is METRES SITTING IN A STOREYS COLUMN;
//   • the sentinel vocabulary (`I` / `COM` / `NP` / `GRF` / …) is UNKNOWN, never zero.
//
// ⚠ AND `ObsXXXX` NON-EMPTY ⇒ THE PARAMETER MAY BE CONDITIONAL ⇒ the zone is PARTIAL, not
// complete. Telde's rows carry a bare article reference in `Obs*` most of the time, which is a
// CITATION rather than a condition, so the two are distinguished rather than conflated — see
// `classifyObservation`.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no THREE, no DOM, no clock, no RNG. The caller
// supplies the already-read `EDIF` row; reading `.mdb` bytes is not this layer's job.
//
// Strategic context — ADR-0283, C58 §1.4/§1.6/§1.11, L-449, L-584 (§terrain-rasant), L-616.

import { trace } from '@opentelemetry/api';
import {
    type SipuGrammar,
    type SipuHeightDatum,
    detectSipuGrammar,
} from '../rulepacks/esCanariasSipu.js';

const tracer = trace.getTracer('pryzm.zoning.canarias.provider');

/** A raw SIPU `EDIF` row, as the publisher stores it: every cell is text or absent. */
export interface SipuEdifRecord {
    readonly Etiqueta?: string | null;
    readonly Nombre?: string | null;
    readonly SupMin?: string | null;
    readonly SepMinFr?: string | null;
    readonly SepMinPs?: string | null;
    readonly SepMinLt?: string | null;
    readonly DispObl?: string | null;
    readonly DispOblm?: string | null;
    readonly FonMaxEd?: string | null;
    readonly FonMaxEdm?: string | null;
    readonly PMaxOcup?: string | null;
    readonly EdifMax?: string | null;
    readonly AltMaxPl?: string | null;
    readonly AltMaxMV?: string | null;
    readonly AltMaxMP?: string | null;
    /** Per-parameter observation columns. Keys are the publisher's own (`ObsPMO`, `ObsAMPl`, …). */
    readonly [obs: string]: string | null | undefined;
}

/**
 * Why a cell yielded no value. ⛔ `absent` and `sentinel` are DIFFERENT and are kept apart:
 * `sentinel` means the publisher wrote something PRYZM cannot interpret, which is a stronger
 * statement than silence and is the thing a codebook would resolve.
 */
export type SipuRejectReason =
    | 'absent'
    | 'sentinel'
    | 'not-numeric'
    | 'zero-invalid'
    | 'out-of-range'
    | 'non-integer-floors';

export interface SipuValue {
    readonly value: number | null;
    readonly reason: SipuRejectReason | null;
}

const ok = (value: number): SipuValue => ({ value, reason: null });
const no = (reason: SipuRejectReason): SipuValue => ({ value: null, reason });

/**
 * The measured sentinel set. ⚠ MEASURED, not assumed — the Balears `AT` lesson (an assumed code
 * dictionary reported metric height as 0/80 where the truth was 49/80).
 */
const SENTINELS = new Set([
    'I',
    'COM',
    'NP',
    'T',
    'GRF',
    'AV',
    'AV+GRF',
    'S',
    'N',
    'SI',
    'NO',
    '-',
    '--',
    '*',
    'ND',
    'NC',
    'X',
    'F',
]);

/** Per-parameter plausibility. `zeroOk` marks the fields where 0 is a RULE, not a null. */
const RANGES: Readonly<
    Record<string, { readonly lo: number; readonly hi: number; readonly zeroOk: boolean }>
> = Object.freeze({
    SupMin: { lo: 1, hi: 100_000, zeroOk: false },
    SepMinFr: { lo: 0, hi: 200, zeroOk: true }, // ⭐ 0 = build to the boundary. LEGITIMATE.
    SepMinPs: { lo: 0, hi: 200, zeroOk: true },
    SepMinLt: { lo: 0, hi: 200, zeroOk: true },
    DispOblm: { lo: 0, hi: 200, zeroOk: true },
    FonMaxEd: { lo: 1, hi: 500, zeroOk: false },
    FonMaxEdm: { lo: 1, hi: 500, zeroOk: false },
    PMaxOcup: { lo: 0, hi: 100, zeroOk: true },
    EdifMax: { lo: 0.01, hi: 20, zeroOk: false }, // ⛔ >20 is m² or m³/m², not a FAR.
    AltMaxPl: { lo: 1, hi: 60, zeroOk: false }, // ⛔ 0 storeys is NOT a rule.
    AltMaxMV: { lo: 1, hi: 300, zeroOk: false },
    AltMaxMP: { lo: 1, hi: 300, zeroOk: false },
});

/**
 * Parse one SIPU cell into a VALID number or a NAMED rejection.
 *
 * ⚠ Decimal COMMA is the publisher's convention ("7,5"), and a dot before exactly three digits
 * is a THOUSANDS separator ("1.000" = 1000, not 1.0). Getting that backwards turns a 1 000 m²
 * minimum plot into a 1 m² one.
 */
export function readSipuValue(field: string, raw: string | null | undefined): SipuValue {
    return tracer.startActiveSpan('canarias.readSipuValue', (span) => {
        try {
            span.setAttribute('pryzm.canarias.field', field);
            if (raw === null || raw === undefined) return no('absent');
            const s = String(raw).trim();
            if (s === '') return no('absent');
            if (SENTINELS.has(s.toUpperCase())) return no('sentinel');

            const t = s.replace(/\s+/g, '').replace(/(?<=\d)\.(?=\d{3}\b)/g, '').replace(',', '.');
            if (!/^[-+]?\d*\.?\d+$/.test(t)) return no('not-numeric');
            const n = Number(t);
            if (!Number.isFinite(n)) return no('not-numeric');

            const r = RANGES[field];
            if (!r) return ok(n);
            if (n === 0 && !r.zeroOk) return no('zero-invalid');
            if (n < r.lo || n > r.hi) return no('out-of-range');
            if (field === 'AltMaxPl' && Math.abs(n - Math.round(n)) > 1e-9) {
                // ⛔ "7,5" in a STOREYS column is metres. Accepting it would publish a 7-storey
                // building where the plan allows 7,5 metres — a ~2.5x overstatement.
                return no('non-integer-floors');
            }
            return ok(n);
        } finally {
            span.end();
        }
    });
}

/** How a non-empty `Obs*` cell should be read. */
export type ObservationKind = 'none' | 'citation-only' | 'conditional';

/**
 * ⚠ `Obs*` non-empty ⇒ the parameter MAY BE CONDITIONAL ⇒ PARTIAL, not complete. But Telde's
 * `Obs*` columns are usually a bare ARTICLE CITATION ("Art.229. Ordenanzas Municipales.") — a
 * provenance gift, not a qualification. Conflating the two would either discard every Telde zone
 * as conditional, or accept a real condition as decoration. So they are separated, and anything
 * that is not recognisably a bare citation is treated as CONDITIONAL (fail safe).
 */
export function classifyObservation(obs: string | null | undefined): ObservationKind {
    const s = (obs ?? '').trim();
    if (s === '') return 'none';
    // A bare citation: "Art.229. Ordenanzas Municipales." / "Anexo Ordenación de Suelos
    // Urbanizables" / "Art.93. Plan Estructural." and nothing further.
    const citation =
        /^(art\.?\s*\d+[.º]?\s*\.?\s*)?(ordenanzas?\s+municipales?|plan\s+estructural|anexo[^.]*)\.?$/i;
    return citation.test(s) ? 'citation-only' : 'conditional';
}

export interface SipuZoneReading {
    readonly zoneCode: string | null;
    readonly zoneLabel: string | null;
    readonly grammar: SipuGrammar;
    /** Metric height plus the DATUM it is measured from. ⚠ never a bare number. */
    readonly height: { readonly value: number | null; readonly datum: SipuHeightDatum };
    readonly floors: number | null;
    readonly far: number | null;
    readonly coverage: number | null;
    readonly setbacks: {
        readonly front_m: number | null;
        readonly side_m: number | null;
        readonly rear_m: number | null;
    };
    readonly buildableDepth_m: number | null;
    readonly alignmentOffset_m: number | null;
    /** `true` when ANY consumed parameter carries a real (non-citation) observation. */
    readonly conditional: boolean;
    /** Every rejection, so a caller can see WHY a field is missing rather than just that it is. */
    readonly rejections: Readonly<Record<string, SipuRejectReason>>;
    /** `true` only when a footprint rule AND a height are both present — i.e. it DRAWS. */
    readonly drawable: boolean;
}

/**
 * Read one SIPU `EDIF` row into a validated, grammar-classified zone reading.
 *
 * ⭐ THIS IS THE WHOLE ADAPTER IN ONE FUNCTION, and its contract is that it NEVER invents:
 * a rejected cell becomes `null` plus a named reason, and a `null` here must reach the engine as
 * UNRESOLVED — never as 0. `esTeldePgo2003.ts` documents what happens when that is forgotten.
 */
export function readSipuZone(rec: SipuEdifRecord): SipuZoneReading {
    return tracer.startActiveSpan('canarias.readSipuZone', (span) => {
        try {
            const rejections: Record<string, SipuRejectReason> = {};
            const get = (f: string): number | null => {
                const r = readSipuValue(f, rec[f] as string | null | undefined);
                if (r.reason) rejections[f] = r.reason;
                return r.value;
            };

            const front = get('SepMinFr');
            const rear = get('SepMinPs');
            const side = get('SepMinLt');
            const coveragePct = get('PMaxOcup');
            const far = get('EdifMax');
            const floors = get('AltMaxPl');
            const hStreet = get('AltMaxMV');
            const hParcel = get('AltMaxMP');
            const depth = get('FonMaxEdm') ?? get('FonMaxEd');
            const offset = get('DispOblm');

            // ⚠ SUSPECT-NEVER-VALID: 100 % coverage ALONGSIDE a published setback. The two are
            // contradictory statements about the same footprint, so PRYZM refuses the coverage
            // rather than choosing which one the publisher meant.
            const hasSetback = front !== null || rear !== null || side !== null;
            let coverage = coveragePct;
            if (coverage === 100 && hasSetback) {
                rejections.PMaxOcup = 'out-of-range';
                coverage = null;
            }

            // ⚠ THE DATUM IS PART OF THE HEIGHT. Never collapse the two columns into "height".
            let height: number | null = null;
            let datum: SipuHeightDatum = 'unknown';
            if (hParcel !== null && hStreet !== null) {
                // Both published: take the LOWER. An envelope may not exceed either datum, and
                // choosing the higher would over-grant on whichever face is binding.
                height = Math.min(hParcel, hStreet);
                datum = hParcel <= hStreet ? 'parcel' : 'street';
            } else if (hStreet !== null) {
                height = hStreet;
                datum = 'street';
            } else if (hParcel !== null) {
                height = hParcel;
                datum = 'parcel';
            } else if (floors !== null) {
                datum = 'floors-only'; // ⚠ a storey count is NOT a metric height.
            }

            const grammar = detectSipuGrammar({
                dispObl: (rec.DispObl ?? null) as string | null,
                hasNumericDepth: depth !== null,
                hasSetback,
                hasCoverage: coverage !== null,
            });

            // conditionality: only observations attached to a CONSUMED parameter matter.
            const OBS_OF: Readonly<Record<string, string>> = {
                SepMinFr: 'ObsSMFr',
                SepMinPs: 'ObsSMPs',
                SepMinLt: 'ObsSMLt',
                PMaxOcup: 'ObsPMO',
                EdifMax: 'ObsEdfMx',
                AltMaxPl: 'ObsAMPl',
                AltMaxMV: 'ObsAMV',
                AltMaxMP: 'ObsAMP',
                FonMaxEdm: 'ObsFonMxm',
            };
            const consumed: readonly (readonly [string, number | null])[] = [
                ['SepMinFr', front],
                ['SepMinPs', rear],
                ['SepMinLt', side],
                ['PMaxOcup', coverage],
                ['EdifMax', far],
                ['AltMaxPl', floors],
                ['AltMaxMV', hStreet],
                ['AltMaxMP', hParcel],
                ['FonMaxEdm', depth],
            ];
            const conditional = consumed.some(([f, v]) => {
                if (v === null) return false;
                const obsCol = OBS_OF[f];
                if (obsCol === undefined) return false;
                return (
                    classifyObservation(rec[obsCol] as string | null | undefined) === 'conditional'
                );
            });

            // ⭐ LEVER 3, ENCODED: a FOOTPRINT RULE PLUS A HEIGHT DRAWS. FAR ALONE DOES NOT.
            // Requiring completeness (setbacks AND coverage AND height AND FAR) would discard
            // most of what is genuinely drawable here.
            const hasFootprintRule = hasSetback || coverage !== null || depth !== null;
            const hasHeight = height !== null || floors !== null;
            const drawable =
                hasFootprintRule && hasHeight && grammar !== 'graphed-refusal' &&
                grammar !== 'depth-without-datum';

            span.setAttribute('pryzm.canarias.drawable', drawable);
            span.setAttribute('pryzm.canarias.grammar', grammar);

            return {
                zoneCode: (rec.Etiqueta ?? null) as string | null,
                zoneLabel: (rec.Nombre ?? null) as string | null,
                grammar,
                height: { value: height, datum },
                floors,
                far,
                coverage: coverage === null ? null : coverage / 100,
                setbacks: { front_m: front, side_m: side, rear_m: rear },
                buildableDepth_m: depth,
                alignmentOffset_m: offset,
                conditional,
                rejections,
                drawable,
            };
        } finally {
            span.end();
        }
    });
}
