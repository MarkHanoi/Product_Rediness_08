// §NSW-ATTRS — reading NSW ePlanning Portal feature attributes without inventing values.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS: two measured defects that both produce SILENT FALSE ZEROS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Phase 0 (`docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/PHASE0-REPORT.md`) caught
// two ways to read this service and get `undefined`/`0` back with no error anywhere:
//
//  1. **`identify` keys attributes by field ALIAS, not field name.** `MAX_B_H` arrives as
//     `"Maximum Building Height"`. A name-keyed reader returns `undefined` for every value on
//     every parcel, and the caller sees "no controls here" — indistinguishable from a genuine
//     coverage gap. This lane produced exactly that false reading before a self-validating probe
//     caught it (M3 pilot: "0 controls" on 60/60 parcels, all of them wrong).
//     `/query` keys by NAME, `identify` keys by ALIAS. Both are used. Read both.
//
//  2. **The service uses STRING SENTINELS for null.** At least three: `"Null"`, `"<Null>"` and
//     the empty string, alongside real SQL `NULL`. A `!= null` test scores all of them as
//     populated. Measured cost of getting this wrong: `LEGIS_REF_VALUE` reads as "present on
//     198/199 layers" (the prior lane's finding) when it is POPULATED on 2.0%.
//
// ⭐ THE STANDING LESSON (§CONTEXT-DATA-HONESTY, L-422/457/467/469): *failure and empty are the
// same value*. Both defects above are that lesson in a new costume. Every reader here returns
// `null` for "the source said nothing" and `undefined` for "I could not find the field at all",
// and those are DIFFERENT — a missing field is a schema surprise worth surfacing; an empty field
// is the government declining to answer.
//
// P5-adjacent purity: pure total functions, no I/O, no clock, no RNG.
//
// Contracts: C58 §1.2 (never overstate), C62/C75 (provenance), C74 §0 (reported identity equals
// performed work). Measurements: PHASE0-REPORT §M1.4 and §"Blockers" items 6–7.

/**
 * Every string the NSW ePlanning services use to mean "no value". Measured, not guessed —
 * `"Null"` and `"<Null>"` were both observed in live responses (PHASE0-REPORT §M1.4, and the
 * BLACKTOWN row of layer 485 for `"<Null>"`).
 *
 * ⚠ APPEND-ONLY, and only ever from an OBSERVED response. Adding a speculative sentinel here
 * silently deletes real data: any genuine value equal to the new string stops being read.
 */
export const NSW_NULL_SENTINELS: readonly string[] = Object.freeze([
    '',
    'Null',
    '<Null>',
    'NULL',
    'null',
    '<null>',
]);

/** A raw ArcGIS attribute bag. Values arrive as string | number | null depending on operation. */
export type NswAttributeBag = Readonly<Record<string, unknown>>;

/**
 * Field name → the aliases the same field arrives under from `identify`. Measured from live
 * responses; the alias is the layer's `fields[].alias`, which ArcGIS uses as the `identify` key.
 *
 * ⚠ The alias is per-layer metadata and CAN differ between layers carrying the same field name.
 * That is why `nswField` takes the name and tries the aliases, rather than the reverse.
 */
export const NSW_FIELD_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
    MAX_B_H: ['Maximum Building Height'],
    MAX_B_H_M: ['MAX_B_H_M'],
    MAX_B_H_RL: ['MAX_B_H_RL'],
    UNITS: ['Units'],
    FSR: ['Floor Space Ratio'],
    LAY_CLASS: ['Class', 'LAY Class'],
    CLASS_DESCRIPTION: ['Class Description'],
    LEGIS_REF_CLAUSE: ['Legislative Clause'],
    LEGIS_REF_VALUE: ['Legislative Value'],
    LEGIS_REF_AREA: ['Legislative Area'],
    EPI_NAME: ['EPI Name'],
    EPI_TYPE: ['EPI Type'],
    LGA_NAME: ['LGA Name'],
    LAY_NAME: ['Layer Name'],
    LABEL: ['Label'],
    CADID: ['CADID'],
    PCO_REF_KEY: ['PCO Ref Key'],
    COMMENCED_DATE: ['Commenced Date'],
    CURRENCY_DATE: ['Currency Date'],
});

/** `true` when `v` is SQL null, undefined, or one of the service's string sentinels. */
export function isNswNull(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return NSW_NULL_SENTINELS.includes(v.trim());
    return false;
}

/**
 * Read one logical field, tolerating both `/query` (name-keyed) and `identify` (alias-keyed) bags.
 *
 * Returns:
 *   - `undefined` — **the field is not present under any known key.** A schema surprise.
 *   - `null`      — the field is present and the source declined to answer (real null or sentinel).
 *   - the value   — otherwise, trimmed if a string.
 *
 * ⛔ Do not collapse `undefined` and `null` at the call site. "This layer has no such column" and
 * "this feature has no value" are different facts and only one of them is a coverage gap.
 */
export function nswField(attrs: NswAttributeBag | null | undefined, name: string): string | number | null | undefined {
    if (!attrs) return undefined;
    const keys = [name, ...(NSW_FIELD_ALIASES[name] ?? [])];
    let sawKey = false;
    for (const k of keys) {
        if (!(k in attrs)) continue;
        sawKey = true;
        const v = attrs[k];
        if (isNswNull(v)) continue;
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return sawKey ? null : undefined;
}

/** `nswField` narrowed to text. `null` for absent-or-empty; never returns a sentinel string. */
export function nswText(attrs: NswAttributeBag | null | undefined, name: string): string | null {
    const v = nswField(attrs, name);
    if (v === undefined || v === null) return null;
    return typeof v === 'string' ? v : String(v);
}

/**
 * `nswField` narrowed to a finite number, parsing numeric strings.
 *
 * ⚠ This is the reader for `LAY_CLASS`, which is where NSW actually keeps its numeric controls
 * (PHASE0-REPORT §M1.4: 130,649 / 130,660 = 100.0% populated on DIRECT layers) — **not**
 * `LEGIS_REF_VALUE`, which holds the LEP map-symbol code (`"N1"`, `"B"`) and is populated on 2.0%.
 * Layer 422 is the decisive row: `LAY_CLASS="13"` (13 metres) with `LEGIS_REF_VALUE="N1"`.
 * A reader that trusts the field NAME gets `"N1"` and no height.
 *
 * Returns `null` when the field is absent, empty, or not a finite number — never `0`, and never
 * `NaN`. A non-numeric `LAY_CLASS` is a real and common case (it may be a class letter `"E"` or a
 * phrase like `"Sites affected by sun plane controls"`); that is a `null` here and a job for
 * `nswText`, not a zero.
 */
export function nswNumber(attrs: NswAttributeBag | null | undefined, name: string): number | null {
    const v = nswField(attrs, name);
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const t = v.trim();
    if (t === '') return null;
    // Reject anything that is not a plain decimal number: "10m", "1:2", "A" must all be null.
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/**
 * The NSW `PCO_REF_KEY` (`"2012-550"`) → the legislation.nsw.gov.au instrument id
 * (`"epi-2012-0550"`), which addresses the LEP's authoritative full text.
 *
 * ⚠ PROVEN ONCE, NOT PROVEN AT SCALE. The XML export was fetched successfully exactly once during
 * Phase 0 (`epi-2012-0550`, 1,032,891 bytes of real content); every subsequent request in the same
 * session returned a 403 WAF challenge. **This function is a pure id mapping and performs no I/O.**
 * Treat the channel as rate-limited and unproven for bulk use until the data-broker route
 * (`data.broker@environment.nsw.gov.au`, build prompt §3) is open. Do not build a crawler on it.
 *
 * Returns `null` for anything not of the form `YYYY-N`.
 */
export function nswPcoRefToInstrumentId(pcoRefKey: string | null | undefined): string | null {
    if (!pcoRefKey) return null;
    const m = /^(\d{4})-(\d{1,4})$/.exec(pcoRefKey.trim());
    const year = m?.[1];
    const num = m?.[2];
    if (!year || !num) return null;
    return `epi-${year}-${num.padStart(4, '0')}`;
}
