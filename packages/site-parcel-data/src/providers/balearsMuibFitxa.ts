// ILLES BALEARS — THE MUIB *FITXA* PARSER, and the validity rules that turn a printed row into a
// number an envelope may actually be built from.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVENANCE: THIS IS A LIFT, NOT A REWRITE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The algorithm below is a faithful TypeScript port of `tools/balears-envelope-max/fitxa-parse.mjs`,
// which was measured CLEAN over 418/418 fitxa pages (E5 parser control + E6 census, 2026-08-02,
// `parseHealth.clean === true`, zero unparsed code cells). Every structural decision in it was PAID
// FOR by a measurement, and each is restated here so a future editor cannot "simplify" one away
// without meeting the evidence that produced it. Re-deriving a parser that already has a 418-page
// clean bill would be a strictly worse artefact.
//
// ⛔ POPULATED IS NOT PRESENT, AND PRESENT IS NOT VALID. Three states are kept distinct at every
// step and are never collapsed:
//      ABSENT          no such row in the fitxa
//      PRESENT_EMPTY   the row exists, the number is deferred elsewhere
//      PRESENT         a number is printed  →  then, separately, VALID / SUSPECT / ZERO_AMBIGUOUS /
//                      UNUSABLE
//
// ── WHY A PIPE PARSER AND NOT A REGEX OVER THE PAGE ───────────────────────────────────────────
// The fitxa is a TABLE. Flattened on tag boundaries it is:
//
//   |PARAMETRE D'EDIFICACIÓ|NP: Nombre de plantes |--> |3 |plantes |Un règim…|
//
// ⭐ TWO STRUCTURAL FACTS MAKE THIS SAFE:
//  1. PARAMETER codes are BARE (`NP:`, `O:`, `E:`). USE-CLASS codes are always GROUP-PREFIXED WITH
//     A HYPHEN (`TU-AT:`, `EQ-RL:`, `TE-CO:`). ⛔ AN EARLIER PAGE-WIDE REGEX MATCHED A USE ROW AND
//     REPORTED IT AS GEOMETRY: **`AT` is *Allotjament turístic*, a USE CLASS — not *altura*. `RL`
//     is *Religiós* — not a *retranqueig*.** Requiring a cell to BEGIN with an unhyphenated code
//     removes that collision by construction rather than by an end-of-parameters heuristic.
//     ⇒ HEIGHT IS `HR` (*Altura reguladora*) / `HT` (*Altura total*). SETBACKS ARE ***Reculada***
//       — `RA` (a alineació oficial) / `RF` (a interior d'illa) / `RM` (a mitgera) — NOT
//       *Retranqueig*. A guessed dictionary reported metric height as 0/80 ABSENT when it is 49/80.
//  2. ⭐ UNITS ARE THEIR OWN CELL. `O: Ocupació màxima |--> |80 |% ` versus `O: … |--> |200 |m2 `.
//     Occupation is published BOTH as a percentage AND as an absolute m² footprint, and those are
//     different quantities. A parser that reads only the number silently mixes them.
//
// PURITY (C58 §1.9): given the same HTML this module returns byte-identical output. No I/O, no
// clock, no RNG, no THREE, no DOM — it never touches `DOMParser`, precisely so it runs identically
// in the browser, in Node and in a test.
//
// Strategic context — C58 §1.4/§1.6/§1.9, §CONTEXT-DATA-HONESTY (L-422/457/467/469), L-616.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning.balears');

/** Cell delimiter: U+0001, a control char that cannot occur in fitxa text. */
const CELL = String.fromCharCode(1);

/**
 * Flatten a fitxa HTML page to the table's cell sequence.
 *
 * ⚠ A TAG BOUNDARY *IS* A CELL BOUNDARY. That is the whole trick, and it is why the parser needs no
 * DOM: the fitxa's meaning lives entirely in cell ORDER, so replacing every tag with the separator
 * and dropping empties reconstructs the reading order exactly.
 */
export function balearsFitxaCells(html: string): string[] {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, CELL)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .split(CELL)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter((s) => s.length > 0);
}

const SECTION_RE = /^(PARAMETRE|PARÀMETRE|ALTRES PAR|ÚS |US |DADES DE|Observacions|Denominació)/i;
/** A BARE code — no hyphen group. `TU-AT:` deliberately does not match; see the header. */
const CODE_RE = /^([A-ZÀÈÉÍÒÓÚÇ]{1,4}):\s*(.*)$/;
const REGIM_RE = /^(Sense r[eè]gims|Un r[eè]gim|Dos r[eè]gims|Tres r[eè]gims|\d+\s+r[eè]gims)/i;
const ARTICLE_RE = /[Aa]rticles?\s+\d+(?:\.\d+)*(?:\.[a-z])?/g;

/** One parsed parameter row, verbatim as printed. */
export interface BalearsFitxaRow {
    /** The MUIB label plus the municipality's own denomination, joined with ` | `. */
    readonly label: string;
    /** The printed value cell, verbatim. May be empty (`PRESENT_EMPTY`). */
    readonly value: string;
    /** ⭐ THE UNIT CELL — its own cell, and it decides what the number IS. Null when none. */
    readonly units: string | null;
    /**
     * The *règim* / observation text that follows the value.
     *
     * ⚠ A NON-EMPTY OBSERVATION MAKES THE PARAMETER **CONDITIONAL**, and a conditional parameter is
     * PARTIAL, never complete — the ordinance has attached a condition this parser cannot evaluate.
     */
    readonly regim: string;
    /** Articles cited on THIS row (value + règim). Empty when the row cites none. */
    readonly articleRefs: readonly string[];
    /** Later duplicate occurrences of the same code. Recorded, never used — first occurrence wins. */
    readonly duplicates?: ReadonlyArray<{ readonly value: string; readonly units: string | null }>;
}

/** The whole fitxa, parsed. */
export interface BalearsParsedFitxa {
    readonly rows: Readonly<Record<string, BalearsFitxaRow>>;
    /** Every article citation anywhere on the page — the weakest form of citation. */
    readonly articleRefsAll: readonly string[];
    /** `id entitat` as printed — must equal the `identitat` in the URL that fetched this page. */
    readonly identitat: string | null;
    /** The MUIB zone code as printed on the fitxa (e.g. `RE_NA`). */
    readonly codiMuib: string | null;
    /** The municipality name as printed. */
    readonly municipi: string | null;
    /**
     * ⛔ SELF-DIAGNOSIS. A PARSER FAILURE AND A DATA ABSENCE LOOK IDENTICAL IN THE OUTPUT, so the
     * parser counts the code cells it SAW but could NOT read. A non-zero `codeCellsUnparsed`
     * invalidates the read rather than quietly deflating it, and the resolver above refuses on it.
     */
    readonly codeCellsSeen: number;
    readonly codeCellsUnparsed: readonly string[];
    /** The fitxa defers a determination to the graphic sheets (*segons els plànols*). */
    readonly deferredToPlanols: boolean;
}

/**
 * Does a parameter ROW start at cell `j`?
 *
 * ⭐ THE VALUE MARKER IS NOT ALWAYS THE NEXT CELL. The fitxa has a "Denominació municipal" column
 * between the MUIB label and the value, populated for some municipalities and empty for others — an
 * empty cell disappears in the flatten, a populated one does not. A parser that demanded `-->`
 * IMMEDIATELY after the code silently reported EVERY fitxa from a municipality that fills that
 * column as having NO PARAMETERS. Measured on identitat=280990 (Alcúdia `RE_NA_VE`):
 *   |T: Tipus d’ordenació |Tipologia |--> |VE: Volumetria específica |
 */
function rowStartsAt(cs: readonly string[], j: number): boolean {
    const cell = cs[j];
    if (cell === undefined || !CODE_RE.test(cell)) return false;
    for (let k = j + 1; k <= j + 3 && k < cs.length; k++) {
        const c = cs[k];
        if (c === undefined) break;
        if (c === '-->') return true;
        if (CODE_RE.test(c) || SECTION_RE.test(c)) return false;
    }
    return false;
}

const uniqueArticles = (text: string): string[] => [
    ...new Set((text.match(ARTICLE_RE) ?? []).map((s) => s.trim())),
];

/**
 * Parse a MUIB fitxa page. PURE and TOTAL — never throws, on any input.
 *
 * P8 — emits `pryzm.zoning.balears.parseFitxa`.
 */
export function parseBalearsFitxa(html: string | null | undefined): BalearsParsedFitxa {
    const span = tracer.startSpan('pryzm.zoning.balears.parseFitxa');
    try {
        const rows: Record<string, BalearsFitxaRow> = {};
        if (typeof html !== 'string' || html.length === 0) {
            span.setAttribute('empty', true);
            return {
                rows, articleRefsAll: [], identitat: null, codiMuib: null, municipi: null,
                codeCellsSeen: 0, codeCellsUnparsed: [], deferredToPlanols: false,
            };
        }
        const cs = balearsFitxaCells(html);

        const idIdx = cs.findIndex((c) => /^id entitat:/i.test(c));
        const identitat = idIdx >= 0 ? (cs[idIdx] ?? '').replace(/^id entitat:\s*/i, '').trim() : null;
        const muniIdx = cs.findIndex((c) => /^Municipi de:/i.test(c));
        const municipi = muniIdx >= 0 ? (cs[muniIdx + 1] ?? '').trim() || null : null;
        const cmIdx = cs.findIndex((c) => /^Codi MUIB:/i.test(c));
        const codiMuib = cmIdx >= 0 ? (cs[cmIdx + 1] ?? '').trim() || null : null;

        // ⛔ BOUND THE SCAN TO THE PARAMETER REGION AT BOTH ENDS.
        //
        // ABOVE it sits the DADES DE L'ENTITAT block, which opens with the zone header
        // `<CODIMUIB>: <name>` — and for a TOP-LEVEL zone that header is a BARE TWO-LETTER CODE:
        // `TU: Turístic`, `IN: Industrial`, `TE: Terciari`. Those look EXACTLY like parameter rows.
        // (Manacor hid this: its header is `RE_NA: Nucli antic`, and the underscore made it not
        // match — i.e. the control fixture would NOT have caught the bug.) Starting the scan at the
        // first `PARAMETRE …` section header removes them.
        //
        // BELOW it sits the USE MATRIX, from the first `ÚS <SECTION>` header, plus the
        // municipality's free-form `ALTRES PARÀMETRES NO NORMALITZATS` block — which is not the
        // normalised dictionary and is deliberately not read as one.
        let start = cs.findIndex((c) => /^PAR[AÀ]METRES?\b/i.test(c) && !/^ALTRES/i.test(c));
        if (start < 0) {
            const hdr = cs.findIndex((c) => /^R[eè]gim espec[íi]fic$/i.test(c));
            start = hdr >= 0 ? hdr + 1 : 0;
        }
        let end = cs.findIndex(
            (c, i) => i > start && (/^(ÚS|US)\s+[A-ZÀ-Ú]/.test(c) || /^ALTRES PAR[AÀ]METRES/i.test(c)),
        );
        if (end < 0) end = cs.length;
        const region = cs.slice(start, end);
        const fullText = cs.join(' ');

        let codeCellsSeen = 0;
        const codeCellsUnparsed: string[] = [];

        for (let i = 0; i < region.length; i++) {
            const cell = region[i];
            if (cell === undefined) continue;
            const m = cell.match(CODE_RE);
            if (!m) continue;
            codeCellsSeen++;
            let arrow = -1;
            for (let k = i + 1; k <= i + 3 && k < region.length; k++) {
                const c = region[k];
                if (c === undefined) break;
                if (c === '-->') { arrow = k; break; }
                if (CODE_RE.test(c) || SECTION_RE.test(c)) break;
            }
            if (arrow < 0) { codeCellsUnparsed.push(cell.slice(0, 60)); continue; }
            const code = m[1] as string;
            const label = [m[2] ?? '', ...region.slice(i + 1, arrow)].filter(Boolean).join(' | ');

            // Collect cells until the next ROW START or a section header. The row-start test uses
            // the SAME arrow lookahead, otherwise a following row whose municipal-denomination cell
            // is populated is not recognised as a boundary and its cells are swallowed into this
            // row's units/règim.
            const payload: string[] = [];
            let j = arrow + 1;
            for (; j < region.length; j++) {
                const c = region[j];
                if (c === undefined) break;
                if (SECTION_RE.test(c)) break;
                if (rowStartsAt(region, j)) break;
                payload.push(c);
            }
            // ⛔ Skip the consumed cells. A VALUE can itself look like a code
            // (`T: … --> VE: Volumetria específica`), and re-scanning it would BOTH inflate
            // `codeCellsSeen` AND raise a false parse-miss — i.e. it would poison the one number
            // that tells us whether to trust the read at all.
            i = j - 1;

            const value = payload[0] ?? '';
            let units: string | null = null;
            let regimFrom = 1;
            const p1 = payload[1];
            if (p1 !== undefined && !REGIM_RE.test(p1)) {
                units = p1;
                regimFrom = 2;
            }
            const regim = payload.slice(regimFrom).join(' ');
            const articleRefs = uniqueArticles(`${value} ${regim}`);

            // First occurrence wins; later duplicate codes are recorded but never used.
            const existing = rows[code];
            if (existing) {
                rows[code] = {
                    ...existing,
                    duplicates: [...(existing.duplicates ?? []), { value, units }],
                };
                continue;
            }
            rows[code] = { label, value, units, regim: regim.slice(0, 400), articleRefs };
        }

        span.setAttribute('codeCellsSeen', codeCellsSeen);
        span.setAttribute('codeCellsUnparsed', codeCellsUnparsed.length);
        return {
            rows,
            articleRefsAll: uniqueArticles(fullText),
            identitat: identitat && identitat.length > 0 ? identitat : null,
            codiMuib,
            municipi,
            codeCellsSeen,
            codeCellsUnparsed,
            deferredToPlanols: /segons\s+(els\s+)?pl[àa]nols/i.test(fullText),
        };
    } finally {
        span.end();
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VALIDITY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ `0` AND `100` HAVE BOTH BEEN USED AS NULL SUBSTITUTES IN THIS DATASET (`DFIVIGEN` is 100 %
// non-null with the single value 99999999). A number is therefore NOT accepted merely because it
// parses. This is the L-616 rule — *unknown ≠ 0, and unknown ≠ a permissive default* — applied at
// the point of transcription rather than at the point of drawing, which is the only place it can be
// applied without already having drawn the wrong thing.

function toNumber(s: string | null | undefined): number | null {
    if (s == null) return null;
    const m = String(s).trim().match(/^(-?\d+(?:[.,]\d+)?)/);
    return m && m[1] !== undefined ? Number.parseFloat(m[1].replace(',', '.')) : null;
}

const PCT_UNIT = /^(%|percentatge)/i;
const M2_UNIT = /(m2|m²)/i;

/** Whether a printed row exists at all, and whether it carries a number. */
export type BalearsParameterStatus = 'ABSENT' | 'PRESENT_EMPTY' | 'PRESENT';

/**
 * The judgement on a PRESENT number.
 *
 *  • `VALID`           — usable.
 *  • `SUSPECT`         — printed, but the dataset itself contradicts it. NEVER enters a numerator.
 *  • `ZERO_AMBIGUOUS`  — a 0 m setback: legally *build to the boundary*, or a null substitute, and
 *                        the two are INDISTINGUISHABLE. Its own class precisely so it is neither
 *                        discarded nor trusted.
 *  • `UNUSABLE`        — out of range or a known sentinel.
 */
export type BalearsParameterVerdict = 'VALID' | 'SUSPECT' | 'ZERO_AMBIGUOUS' | 'UNUSABLE';

/** What KIND of quantity the unit cell says this number is. */
export type BalearsParameterKind =
    | 'STOREYS' | 'METRES' | 'PERCENT' | 'RATIO' | 'ABSOLUTE_M2' | 'TEXT' | 'UNKNOWN_UNIT';

export interface BalearsParameter {
    readonly status: BalearsParameterStatus;
    readonly verdict?: BalearsParameterVerdict;
    readonly kind?: BalearsParameterKind;
    readonly value?: number | string;
    readonly units?: string;
    readonly raw?: string;
    readonly why?: string;
    readonly articleRefs?: readonly string[];
    /**
     * ⚠ TRUE when the row carries a non-empty *règim* (observation). A CONDITIONAL parameter can only
     * ever support a PARTIAL answer — the ordinance attached a condition, and this parser is not
     * entitled to decide it holds.
     */
    readonly conditional?: boolean;
}

/**
 * Classify ONE parameter row into `{ status, verdict, kind, value }`. PURE and total.
 *
 * The per-code branches are not stylistic: each encodes a way this dataset has ALREADY published a
 * number that parses and is not true.
 */
export function classifyBalearsParameter(
    code: string,
    row: BalearsFitxaRow | null | undefined,
): BalearsParameter {
    if (!row) return { status: 'ABSENT' };
    const v = toNumber(row.value);
    const u = row.units ?? '';
    const conditional = row.regim.trim().length > 0;
    const base = {
        units: u,
        raw: String(row.value).slice(0, 60),
        articleRefs: row.articleRefs,
        conditional,
    } as const;

    if (v === null) {
        // *Tipus d'ordenació* is CATEGORICAL — the text IS the value, not a failed number.
        if (code === 'T') {
            return row.value
                ? { status: 'PRESENT', verdict: 'VALID', kind: 'TEXT', value: row.value.slice(0, 60), ...base }
                : { status: 'PRESENT_EMPTY', ...base };
        }
        return { status: 'PRESENT_EMPTY', ...base };
    }
    if (v === 99999999 || v === 9999999 || v === 999999) {
        return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'sentinel null-substitute', value: v, ...base };
    }

    switch (code) {
        case 'NP': {
            if (v < 1 || v > 60) {
                return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'storeys out of range', value: v, ...base };
            }
            return { status: 'PRESENT', verdict: 'VALID', kind: 'STOREYS', value: v, ...base };
        }
        case 'HR':
        case 'HT': {
            if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'zero/negative height', value: v, ...base };
            if (v < 2.5) return { status: 'PRESENT', verdict: 'SUSPECT', why: 'height < 2.5 m', value: v, ...base };
            if (v > 200) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'height > 200 m', value: v, ...base };
            return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
        }
        case 'O': {
            // ⭐ THE UNIT DECIDES WHAT THIS NUMBER IS. Occupation is published BOTH as a percentage
            // and as an absolute m² footprint; reading the number alone mixes two quantities.
            if (PCT_UNIT.test(u)) {
                if (v <= 0) {
                    return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation 0 % — null substitute or unbuildable', value: v, ...base };
                }
                if (v > 100) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation > 100 %', value: v, ...base };
                if (v === 100) {
                    // ⛔ MEASURED: 11 of 220 published occupations are exactly 100 %, and FOUR of
                    // those ALSO publish a setback — a flat contradiction (you cannot occupy the
                    // whole plot AND stand back from its boundary). 100 is a null substitute in
                    // this dataset. NEVER VALID.
                    return {
                        status: 'PRESENT', verdict: 'SUSPECT', kind: 'PERCENT', value: v, ...base,
                        why: 'occupation exactly 100 % — a null substitute in this dataset, and a contradiction wherever a setback is also published',
                    };
                }
                return { status: 'PRESENT', verdict: 'VALID', kind: 'PERCENT', value: v, ...base };
            }
            if (M2_UNIT.test(u)) {
                if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation area 0', value: v, ...base };
                return { status: 'PRESENT', verdict: 'VALID', kind: 'ABSOLUTE_M2', value: v, ...base };
            }
            return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'UNKNOWN_UNIT', why: `occupation with unrecognised unit "${u}"`, value: v, ...base };
        }
        case 'E': {
            if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'FAR 0', value: v, ...base };
            // Two unit families: a RATIO (m²/m²) and an ABSOLUTE ceiling (m²). Conflating them
            // would turn a 2.4 ratio into a 2.4 m² building, or a 300 m² ceiling into a FAR of 300.
            if (/superf|m2\s*\/\s*m2|m²\s*\/\s*m²|m2 edific/i.test(u) && !/^m2$|^m²$/i.test(u.trim())) {
                if (v > 20) return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'RATIO', why: 'FAR > 20', value: v, ...base };
                return { status: 'PRESENT', verdict: 'VALID', kind: 'RATIO', value: v, ...base };
            }
            if (/^m2$|^m²$/i.test(u.trim())) {
                return { status: 'PRESENT', verdict: 'VALID', kind: 'ABSOLUTE_M2', value: v, ...base };
            }
            if (v > 0 && v <= 20) return { status: 'PRESENT', verdict: 'VALID', kind: 'RATIO', value: v, ...base };
            return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'UNKNOWN_UNIT', why: `FAR with unrecognised unit "${u}"`, value: v, ...base };
        }
        case 'RA':
        case 'RF':
        case 'RM': {
            if (v < 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'negative setback', value: v, ...base };
            if (v === 0) {
                return {
                    status: 'PRESENT', verdict: 'ZERO_AMBIGUOUS', kind: 'METRES', value: v, ...base,
                    why: '0 m — build-to-boundary or null substitute; indistinguishable',
                };
            }
            if (v > 100) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'setback > 100 m', value: v, ...base };
            return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
        }
        case 'PE': {
            if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'buildable depth 0', value: v, ...base };
            if (v > 100) return { status: 'PRESENT', verdict: 'SUSPECT', why: 'depth > 100 m', value: v, ...base };
            return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
        }
        default: {
            if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'non-positive', value: v, ...base };
            return { status: 'PRESENT', verdict: 'VALID', value: v, ...base };
        }
    }
}

/**
 * The envelope-bearing codes, and ONLY those. Everything else on a fitxa is a use class or an
 * administrative field.
 *
 * ⛔ `AT` AND `RL` ARE DELIBERATELY ABSENT. They are *Allotjament turístic* and *Religiós* — USES.
 */
export const BALEARS_ENVELOPE_CODES = [
    'NP', 'HR', 'HT', 'O', 'E', 'RA', 'RF', 'RM', 'PE', 'PM', 'AM', 'IRP', 'T',
] as const;

export type BalearsParameters = Readonly<Record<string, BalearsParameter>>;

/** Classify every envelope-bearing code on a parsed fitxa. */
export function classifyBalearsFitxa(fitxa: BalearsParsedFitxa): BalearsParameters {
    const out: Record<string, BalearsParameter> = {};
    for (const code of BALEARS_ENVELOPE_CODES) {
        out[code] = classifyBalearsParameter(code, fitxa.rows[code] ?? null);
    }
    return out;
}

/** How much of an envelope this fitxa can honestly support. */
export type BalearsDrawabilityTier = 'COMPLETE' | 'PARTIAL_DRAWABLE' | 'NOT_DRAWABLE';

export interface BalearsDrawability {
    readonly tier: BalearsDrawabilityTier;
    readonly reasons: readonly string[];
    readonly heightStoreys: boolean;
    readonly heightMetres: boolean;
    readonly occupation: boolean;
    readonly far: boolean;
    readonly setbacks: readonly string[];
    readonly depth: boolean;
    /** ⚠ TRUE when ANY contributing parameter carries an observation ⇒ the answer is CONDITIONAL. */
    readonly conditional: boolean;
}

/**
 * Envelope-drawability verdict for one fitxa.
 *
 * ⛔ REQUIRING THREE-OF-THREE DISCARDS REAL ENVELOPES — and the cost was MEASURED. Demanding
 * COMPLETENESS throws away **12.7 points** of private developable land (74.1 % → 61.4 %). So there
 * are three tiers:
 *
 *   COMPLETE          height + occupation + FAR, all VALID → the full solid
 *   PARTIAL_DRAWABLE  enough to draw a CONSERVATIVE solid:
 *                       height + occupation, or
 *                       height + ≥1 VALID setback, or
 *                       height + buildable depth
 *   NOT_DRAWABLE      anything less
 *
 * ⭐ AND THE CONVERSE IS EQUALLY DELIBERATE: **FAR ALONE DOES NOT DRAW.** It fixes floor AREA and
 * fixes neither a footprint nor a height, so it is a volume with no shape. Discarding it costs
 * almost nothing — FAR-alone-without-height is 1.6 % — while accepting it would mean inventing
 * either the footprint or the height, which is the L-616 defect exactly.
 *
 * ⛔ ONLY `VALID` COUNTS. A `SUSPECT` occupation (the 100 % contradiction) and a `ZERO_AMBIGUOUS`
 * setback enter NO numerator here.
 */
export function balearsDrawability(P: BalearsParameters): BalearsDrawability {
    const isValid = (c: string): boolean => {
        const p = P[c];
        return p !== undefined && p.status === 'PRESENT' && p.verdict === 'VALID';
    };
    const heightStoreys = isValid('NP');
    const heightMetres = isValid('HR') || isValid('HT');
    const height = heightStoreys || heightMetres;
    const occ = isValid('O');
    const far = isValid('E');
    const setbacks = ['RA', 'RF', 'RM'].filter(isValid);
    const depth = isValid('PE');

    let tier: BalearsDrawabilityTier = 'NOT_DRAWABLE';
    const reasons: string[] = [];
    if (height && occ && far) { tier = 'COMPLETE'; reasons.push('height+occupation+FAR'); }
    else if (height && occ) { tier = 'PARTIAL_DRAWABLE'; reasons.push('height+occupation'); }
    else if (height && setbacks.length > 0) { tier = 'PARTIAL_DRAWABLE'; reasons.push(`height+${setbacks.length} setback(s)`); }
    else if (height && depth) { tier = 'PARTIAL_DRAWABLE'; reasons.push('height+buildable depth'); }
    else if (far && !height) { reasons.push('FAR alone — fixes floor area, fixes neither footprint nor height'); }
    else if (height) { reasons.push('height alone — no footprint constraint'); }
    else reasons.push('no height signal');

    const contributing = ['NP', 'HR', 'HT', 'O', 'E', 'RA', 'RF', 'RM', 'PE'];
    const conditional = contributing.some((c) => {
        const p = P[c];
        return p !== undefined && p.status === 'PRESENT' && p.verdict === 'VALID' && p.conditional === true;
    });

    return { tier, reasons, heightStoreys, heightMetres, occupation: occ, far, setbacks, depth, conditional };
}
