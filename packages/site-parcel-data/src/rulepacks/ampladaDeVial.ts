// L-537 — TIERED resolution of the *amplada de vial*: declared > snapped > measured > none.
//
// WHY A TIER LADDER AND NOT A SINGLE NUMBER
// -----------------------------------------
// Art. 327.2 keys the height on the DECLARED street width. We have four possible sources for that
// width and they are not equally trustworthy, so flattening them into one `width_m` would erase the
// only thing that lets the panel stay honest about what it is showing (C58 §1.3/§1.4, C23). L-459
// is what that erasure looks like in production: a fabricated context height rendering exactly like
// a measured one. So the resolver returns the width AND the tier that produced it, always.
//
// THE TIERS, STRONGEST FIRST
//   1. `declared-municipal-gis`      — a real planning street database. Reserved: **no Spanish
//                                      municipality we have probed publishes one machine-readably**
//                                      (Barcelona's only `vial` layer is a WMS raster with no width
//                                      attribute). The tier exists so the day one appears it slots
//                                      in above everything else without a redesign.
//   2. `curated-cerda-nominal`       — the hand-verified Cerdà allow-list. DEMOTED, not deleted:
//                                      it is still the best figure we have for the ~26 streets on
//                                      it, and it beats a measurement on those streets because it
//                                      is the nominal declared value rather than an inference from
//                                      geometry. Superseded entry-for-entry by L-528 certification.
//   3. `snapped-to-declared-quantum` — a measurement close enough to a value the street grid
//                                      demonstrably quantises on. See the whole next section.
//   4. `measured-cadastral`          — the raw frontage-to-frontage distance, subject to the
//                                      existing band-edge refusal.
//   (none)                           — no width. The caller shows no height. Not a failure mode to
//                                      be engineered away: it is the correct answer when we do not
//                                      know, and it costs a flat study volume instead of a wrong
//                                      building.
//
// ⚠⚠ WHERE THE QUANTA AND THE TOLERANCE COME FROM — THIS IS THE LOAD-BEARING PART
// -------------------------------------------------------------------------------
// Snapping a measurement to a "declared" value is only legitimate if declared widths ACTUALLY
// cluster. Asserting that from intuition is how a tuned constant ends up standing between cadastral
// data and a compliance number, which is the L-529 failure this project spent a session unwinding.
// So it was MEASURED first, at scale, before a line of this file was written:
// `docs/04-reference/spain/SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md` — 6,819 frontages across 697
// blocks in 5 cities, using this repo's own production measurement code.
//
// The result changed the design twice, and both corrections would have been missed by shipping the
// intuitive snap set:
//
//   • **Barcelona has NO 10 / 15 / 25 m quantum** (×0.63, ×0.24, ×0.00 against local density —
//     ×1.0 means no clustering at all). The obvious set {10,15,20,25,30…} is simply FALSE here.
//     Only 20 m (×7.55) and 30 m (×7.51) are real Cerdà quanta, so only those two are listed.
//   • **The nominal 50 m arteries measure 48 m** (×6.23 at 47.75–48.25; 50 m itself is ×0.90). The
//     offset is ~2 m — THREE TIMES the measurement's own p90 error of 0.63 m. Snapping 48 → 50
//     would be silently CORRECTING the data, not resolving its noise, and that is refused. It costs
//     nothing, because 48 m and 50 m sit in the same Art. 327.2 band.
//   • **6 m and 8 m are excluded despite spikes** (×4.10 / ×2.31). The Barcelona 5.5–8.5 m mass is a
//     CONTINUOUS ridge of narrow pre-Cerdà streets, not a spike on a declared value; snapping inside
//     a continuous distribution manufactures precision the data does not contain. The 8 m band edge
//     separates 8.55 m from 11.60 m — a whole storey — so a wrong snap there is expensive.
//
// The tolerance is likewise measured, not chosen: 0.60 m is the p90 of the measurement's OWN error
// bar (0.63 m, rounded down), it is one fifth of the narrowest Art. 327.2 band (3 m) so a snap can
// never cross a band by itself, and the observed 20 m cluster's own p10–p90 half-width (0.45 m)
// sits inside it. A measurement whose own `spread_m` exceeds it is refused rather than snapped —
// the error bar gates its own use.
//
// REGIONAL SCOPE — WHAT A NEW REGION MUST SUPPLY
// ----------------------------------------------
// Nothing here is Barcelona-specific except the exported `BCN_*` constants. The probe is the proof
// that this separation is real rather than tidy-minded: the quantum set is genuinely different per
// city (Barcelona {20,30}, Madrid {15,30}, Valencia {25,50}) and **Córdoba and Sevilla have no
// quantisation at all above ×2.8, so for them the honest configuration is `quanta: []`.** A region
// therefore supplies:
//   (a) its own height table keyed on street width (Barcelona: `bcnAlcadaReguladora.ts`);
//   (b) its own `StreetWidthQuantisation`, DERIVED FROM ITS OWN PROBE — never copied from here;
//   (c) optionally a declared-width override list (Barcelona: `bcnOfficialStreetWidths.ts`).
// It supplies NO geometry: `geometry/streetWidth.ts` is region-agnostic and stays that way.
//
// ⚠ AND IT INHERITS A BLOCKER. The measurement needs a dissolved block ring, and
// `dissolveParcelsToBlockRing` succeeds on only ~64 % of candidate manzanas nationally (0 % on the
// Córdoba sample). No ring ⇒ no measurement ⇒ tier 4 unavailable ⇒ no height. Honest, and NOT
// fixed here on purpose.
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O, no THREE, no DOM, no clock.

import type { StreetWidthMeasurement } from '../geometry/streetWidth.js';
import type { OfficialStreetWidth, StreetWidthProvenance } from './bcnOfficialStreetWidths.js';

/** A region's declared-width quantisation, derived from that region's OWN distribution probe. */
export interface StreetWidthQuantisation {
    /**
     * Values the region's street grid demonstrably quantises on, metres. **Empty is a legitimate
     * and expected configuration** — it is the correct setting for a city whose widths do not
     * cluster, and it disables snapping entirely rather than degrading it.
     */
    readonly quanta: ReadonlyArray<number>;
    /**
     * How far a measurement may be from a quantum and still be attributed to it, metres. Must be
     * justified as the MEASUREMENT'S error, not as whatever makes the most streets resolve.
     */
    readonly tolerance_m: number;
    /** Where the two numbers above came from — carried into the derivation row, so the panel can
     *  cite the probe rather than assert a constant. */
    readonly source: string;
}

/**
 * Barcelona. Derived in `SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`; see the header for why 48 m,
 * 8 m and 6 m are absent despite showing spikes, and why 10/15/25 m are absent because they do not.
 */
export const BCN_STREET_WIDTH_QUANTISATION: StreetWidthQuantisation = Object.freeze({
    quanta: Object.freeze([20, 30]) as ReadonlyArray<number>,
    tolerance_m: 0.6,
    source:
        'measured distribution of 6,819 cadastral frontages across 697 blocks in 5 Spanish cities ' +
        '(L-537 probe, 2026-07-21): 20 m ×7.55 and 30 m ×7.51 local-density spikes; tolerance = the ' +
        "measurement's own p90 error (0.63 m)",
});

export interface ResolveAmpladaInput {
    /** Tier 2 — the curated allow-list hit for this address, if any. */
    readonly declared?: OfficialStreetWidth | null;
    /** Tiers 3/4 — the governing measured frontage for this parcel, if any. */
    readonly measurement?: StreetWidthMeasurement | null;
    /** The region's quantisation. Omit (or pass empty `quanta`) to disable snapping. */
    readonly quantisation?: StreetWidthQuantisation | null;
}

export interface ResolvedAmplada {
    readonly width_m: number;
    readonly provenance: StreetWidthProvenance;
    /**
     * Whether the downstream band-edge guard may be SKIPPED. True only for a width that is exact by
     * definition (declared or snapped-to-declared); false for a raw measurement, which must still
     * refuse near a band edge because there the noise, not the measurement, chooses the storey.
     *
     * This flag is the whole point of the snap tier: a Cerdà street measures 19.75 m, the guard
     * refuses it, and the building loses a storey it is legally entitled to. Snapping to the 20 m
     * quantum the grid demonstrably uses converts that refusal into an answer — and the flag is
     * what makes the conversion explicit rather than a quietly relaxed threshold.
     */
    readonly trustedOfficialWidth: boolean;
    /** Human-readable derivation, for the panel's "Why these numbers?" row. Never omitted. */
    readonly why: string;
}

/** Snap outcome, kept separate from the tier ladder so the reason for NOT snapping is inspectable. */
export type SnapResult =
    | { readonly ok: true; readonly quantum_m: number; readonly delta_m: number }
    | {
          readonly ok: false;
          /**
           * `no-quanta`   — the region declares none (a legitimate configuration, see the header).
           * `too-far`     — nearest quantum is outside the tolerance: an ordinary street, not a
           *                 noisy grid street. It goes forward as a MEASURED width.
           * `imprecise`   — the measurement's own spread exceeds the tolerance, so it cannot claim
           *                 to have landed on a declared value.
           * `ambiguous`   — two quanta are within tolerance. Currently unreachable for Barcelona
           *                 (0 of 2,855 cases) and kept anyway: a denser future set must not have
           *                 this refusal added retroactively, after answers have already shipped.
           */
          readonly reason: 'no-quanta' | 'too-far' | 'imprecise' | 'ambiguous';
      };

/**
 * Attempt to attribute a measurement to a declared quantum. PURE; never throws.
 *
 * Exported separately from `resolveAmpladaDeVial` because the *reason* a snap was declined is
 * diagnostic information a caller may want to log — and because a decision this consequential
 * should be testable on its own, not only through the ladder above it.
 */
export function snapToDeclaredQuantum(
    measurement: StreetWidthMeasurement,
    quantisation: StreetWidthQuantisation | null | undefined,
): SnapResult {
    const quanta = quantisation?.quanta ?? [];
    if (quanta.length === 0) return { ok: false, reason: 'no-quanta' };
    const tol = quantisation!.tolerance_m;

    // The measurement must be tight enough to claim a specific declared value. Checked BEFORE
    // proximity: a wide-spread measurement that happens to land near a quantum is the most
    // seductive wrong answer available here.
    if (!Number.isFinite(measurement.spread_m) || measurement.spread_m > tol) {
        return { ok: false, reason: 'imprecise' };
    }

    const within = quanta
        .map((q) => ({ q, d: Math.abs(measurement.width_m - q) }))
        .filter((c) => c.d <= tol)
        .sort((a, b) => a.d - b.d || a.q - b.q);

    if (within.length === 0) return { ok: false, reason: 'too-far' };
    if (within.length > 1) return { ok: false, reason: 'ambiguous' };
    return { ok: true, quantum_m: within[0]!.q, delta_m: within[0]!.d };
}

/**
 * Resolve the *amplada de vial* through the tier ladder. PURE, deterministic, never throws.
 *
 * Returns `null` when no tier can supply a width — the caller must then show NO constructed height.
 * Falling back to a regional average or a "typical" street would re-create, in a new costume, the
 * fabrication this whole work item exists to remove.
 */
export function resolveAmpladaDeVial(input: ResolveAmpladaInput): ResolvedAmplada | null {
    // ── Tier 1–2: a declared figure always wins. ─────────────────────────────────────────────
    // Even a better-measured street does not displace it: the allow-list carries the NOMINAL
    // DECLARED value, which is the legal quantity, while the measurement is an inference about it.
    if (input.declared) {
        const d = input.declared;
        return {
            width_m: d.width_m,
            provenance: d.provenance,
            trustedOfficialWidth: true,
            why: `${d.street} ample oficial ${d.width_m.toFixed(2)} m (${d.provenance}) — ${d.note}`,
        };
    }

    const m = input.measurement;
    if (!m || !Number.isFinite(m.width_m) || m.width_m <= 0) return null;

    // ── Tier 3: snapped to a declared quantum. ───────────────────────────────────────────────
    const snap = snapToDeclaredQuantum(m, input.quantisation ?? null);
    if (snap.ok) {
        return {
            width_m: snap.quantum_m,
            provenance: 'snapped-to-declared-quantum',
            trustedOfficialWidth: true,
            why:
                `measured ${m.width_m.toFixed(2)} m (±${m.spread_m.toFixed(2)} m over ${m.sampleCount} ` +
                `rays) → attributed to the ${snap.quantum_m} m declared quantum, ${snap.delta_m.toFixed(2)} m ` +
                `away, inside the ${input.quantisation!.tolerance_m.toFixed(2)} m tolerance. Basis: ` +
                `${input.quantisation!.source}`,
        };
    }

    // ── Tier 4: the raw measurement, with the band-edge guard left ARMED. ────────────────────
    return {
        width_m: m.width_m,
        provenance: 'measured-cadastral',
        trustedOfficialWidth: false,
        why:
            `measured frontage-to-frontage ${m.width_m.toFixed(2)} m (±${m.spread_m.toFixed(2)} m over ` +
            `${m.sampleCount} rays across block edge #${m.edgeIndex}); not attributed to a declared ` +
            `quantum (${snap.reason}), so the band-edge guard still applies`,
    };
}
