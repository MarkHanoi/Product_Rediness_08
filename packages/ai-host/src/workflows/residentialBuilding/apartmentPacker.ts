// Residential building (multi-family) — Slice A / Tracker P6.1 — the APARTMENT PACKER.
//
// A PURE deterministic L2 function: zero THREE, zero DOM, zero I/O, zero RNG. Given a
// per-level NET buildable area (after the central core + the public corridor have been
// removed — see audit §6.1) plus the apartment-mix input
//   { minApartmentAreaM2, maxApartmentAreaM2, typologies:{T1,T2,T3,T4} },
// it returns the LIST of apartments to PLACE on this level. Each apartment is
//   { typology, targetAreaM2, program }
// where the typology is one of the ENABLED T1–T4 and `targetAreaM2` lands inside the
// EFFECTIVE band (the intersection of the user [min,max] band with the typology's own
// engine band, audit §6). Map T1→1-bed … T4→4-bed `ApartmentProgram`.
//
// This is the COUNT+MIX planner that PAIRS WITH the plate-partition (P6.2,
// `platePartition.ts`): the packer picks WHICH apartments go on the level, the
// plate-partition PLACES them as rects. The D-TGL engine (`generateDeterministicLayouts`)
// then subdivides each placed cell into rooms in a LATER slice (P7).
//
// Diagnostic: emits `§DIAG-APARTMENT-PACK level=k N=… mix=[…] areas=[…]`.
// Soft-fail (audit §6.1 / C50 §1.7): when the net area cannot host even ONE min-area
// apartment of any enabled typology — OR no typology is enabled / net area non-positive
// / the user band excludes every enabled typology's engine band — return a structured
// `{ status:'rejected', reason }`. The function NEVER throws on a feasibility miss.
//
// Contracts: audit §6 (T1–T4 mapping) + §6.1 (packing); C50 §1.7 (soft-fail not throw);
// C53 (generative engine); P8 (≥1 OTel span per exported fn — `packApartments` opens one).
// The T1–T4 → bedroom mapping is verified against `programRules` / `scaleProgramToShell`
// (`bubbleGraph.ts:231` — bathrooms = max(1, floor(bedrooms/2)); masterEnSuite when
// bedrooms ≥ 3): the program built here is consistent with what the engine would scale to,
// but PINS the count (typology is authoritative — the engine path uses `lockBedroomCount`).

import { trace } from '@opentelemetry/api';
import type { ApartmentProgram } from '../apartmentLayout/types.js';
// The `Typology` union has ONE canonical source — the plate-partition (P6.2) — so the
// barrel doesn't double-export it. Imported (not re-exported) here for internal use.
import type { Typology } from './platePartition.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

/** The four typologies in placement/enumeration order (smallest → largest). */
export const TYPOLOGY_ORDER: readonly Typology[] = ['T1', 'T2', 'T3', 'T4'];

/** The typology → bedroom-count map (audit §6). T1→1, T2→2, T3→3, T4→4. */
export function typologyBedrooms(t: Typology): number {
    switch (t) {
        case 'T1': return 1;
        case 'T2': return 2;
        case 'T3': return 3;
        case 'T4': return 4;
    }
}

/**
 * The per-typology TARGET net-area band (m²) from audit §6. This is the typology's
 * own envelope band; the EFFECTIVE band the packer uses is the intersection of this
 * with the user's [min,max] input. Kept conservative + matching the audit table.
 */
const TYPOLOGY_BAND: Record<Typology, { min: number; max: number }> = {
    T1: { min: 35, max: 55 },
    T2: { min: 55, max: 80 },
    T3: { min: 80, max: 110 },
    T4: { min: 110, max: 150 },
};

export interface ApartmentPackInput {
    /** Diagnostic level index (0 = ground; the packer runs on upper levels only). */
    readonly levelIndex: number;
    /** NET buildable area on this level after core + public corridor are removed (m²). */
    readonly netAreaM2: number;
    /** Lower bound of the per-apartment net-area band (m²) — the user input. */
    readonly minApartmentAreaM2: number;
    /** Upper bound of the per-apartment net-area band (m²) — the user input. */
    readonly maxApartmentAreaM2: number;
    /** Which typologies are enabled. One or several may be on. */
    readonly typologies: { readonly T1: boolean; readonly T2: boolean; readonly T3: boolean; readonly T4: boolean };
}

/** One planned apartment to place on the level. */
export interface PlannedApartment {
    readonly typology: Typology;
    /** The target net area (m²) — within the effective band for its typology. */
    readonly targetAreaM2: number;
    /** The mapped ApartmentProgram (bedrooms pinned by the typology). */
    readonly program: ApartmentProgram;
}

export interface ApartmentPackOk {
    readonly status: 'ok';
    readonly apartments: readonly PlannedApartment[];
    readonly diagnostic: string;
}

export interface ApartmentPackRejected {
    readonly status: 'rejected';
    readonly reason: string;
    readonly diagnostic: string;
}

export type ApartmentPackResult = ApartmentPackOk | ApartmentPackRejected;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Build the T1–T4 `ApartmentProgram`. Bedroom count is PINNED by the typology (not
 * grown to the shell), per audit §6: a T2 stays a 2-bed regardless of cell area. The
 * bathroom count + en-suite flag follow the same rule the engine's
 * `scaleProgramToShell` applies (bathrooms = clamp(1..3, floor(beds/2)); masterEnSuite
 * when beds ≥ 3), so a packed program is consistent with the engine's own scaling.
 */
function programFor(t: Typology): ApartmentProgram {
    const bedrooms = typologyBedrooms(t);
    const bathrooms = Math.min(3, Math.max(1, Math.floor(bedrooms / 2)));
    return {
        bedrooms,
        bathrooms,
        masterEnSuite: bedrooms >= 3,
        openPlanKitchenDining: true,
        livingRoom: true,
        entranceHall: true,
    };
}

/** The enabled typologies, smallest→largest, with their EFFECTIVE band (intersection
 *  of the typology band and the user [min,max] band). Excludes typologies whose
 *  effective band is empty (user band cannot host that typology at all). */
interface EnabledBand { typology: Typology; min: number; max: number }
function enabledBands(input: ApartmentPackInput): EnabledBand[] {
    const out: EnabledBand[] = [];
    for (const t of TYPOLOGY_ORDER) {
        if (!input.typologies[t]) continue;
        const band = TYPOLOGY_BAND[t];
        const min = Math.max(band.min, input.minApartmentAreaM2);
        const max = Math.min(band.max, input.maxApartmentAreaM2);
        if (min <= max + 1e-9) out.push({ typology: t, min, max });
    }
    return out;
}

function reject(levelIndex: number, reason: string): ApartmentPackRejected {
    const diagnostic = `§DIAG-APARTMENT-PACK level=${levelIndex} status=rejected reason="${reason}"`;
    return { status: 'rejected', reason, diagnostic };
}

/**
 * Pack the level's net buildable area into a deterministic list of apartments.
 *
 * Strategy (deterministic finite enumeration — NOT an optimiser, audit §6.1):
 *  1. Compute the EFFECTIVE band per enabled typology (intersection with user [min,max]).
 *  2. The SMALLEST effective `min` gives the cap on N (Nmax = floor(net / smallestMin)).
 *  3. For each candidate N from Nmax down to 1, try to assign a typology to each of the
 *     N slots such that (a) every slot's target area ∈ its effective band and (b) the
 *     summed target areas ≤ net. We give every slot an EQUAL share (net/N) and snap it
 *     into the chosen typology's band; the chosen typology per slot is the LARGEST
 *     enabled typology whose band contains the equal share (so a generous level fills
 *     with bigger apartments first), falling back to the largest typology whose min ≤
 *     share. The first N that yields a feasible all-in-band assignment wins (largest N
 *     → most apartments per level, the audit's "minimise wasted area" intent).
 *  4. No feasible N → soft-fail.
 */
export function packApartments(input: ApartmentPackInput): ApartmentPackResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.apartmentPacker',
        (span) => {
            try {
                const out = _pack(input);
                span.setAttribute('pryzm.resi.pack.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.resi.pack.count', out.apartments.length);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as ApartmentPackResult;
}

function _pack(input: ApartmentPackInput): ApartmentPackResult {
    const { levelIndex, netAreaM2 } = input;

    if (!(netAreaM2 > 0)) {
        return reject(levelIndex, 'net area must be positive');
    }
    if (input.minApartmentAreaM2 > input.maxApartmentAreaM2) {
        return reject(levelIndex, 'minApartmentAreaM2 must be ≤ maxApartmentAreaM2');
    }

    const bands = enabledBands(input);
    if (bands.length === 0) {
        return reject(
            levelIndex,
            'no enabled typology fits the user [min,max] band (or none enabled)',
        );
    }

    const smallestMin = Math.min(...bands.map((b) => b.min));
    if (netAreaM2 < smallestMin - 1e-6) {
        return reject(
            levelIndex,
            `net area ${round2(netAreaM2)} m² cannot host even one min-area apartment (smallest min ${smallestMin} m²)`,
        );
    }

    const Nmax = Math.max(1, Math.floor(netAreaM2 / smallestMin));

    // Try the largest N first (most apartments / least waste, audit §6.1).
    for (let N = Nmax; N >= 1; N--) {
        const share = netAreaM2 / N;
        const slots = assignSlots(bands, share, N);
        if (slots) {
            // Verify the total does not exceed net (each slot is ≤ share by construction,
            // but the band clamp may push a tiny slot up to its min — re-check the sum).
            const total = slots.reduce((a, s) => a + s.area, 0);
            if (total > netAreaM2 + 1e-6) continue;

            const apartments: PlannedApartment[] = slots.map((s) => ({
                typology: s.typology,
                targetAreaM2: round2(s.area),
                program: programFor(s.typology),
            }));
            const mix = apartments.map((a) => a.typology).join(',');
            const areas = apartments.map((a) => a.targetAreaM2.toFixed(1)).join(',');
            const diagnostic =
                `§DIAG-APARTMENT-PACK level=${levelIndex} N=${apartments.length} ` +
                `mix=[${mix}] areas=[${areas}]`;
            return { status: 'ok', apartments, diagnostic };
        }
    }

    return reject(
        levelIndex,
        `no feasible apartment count/mix fits net area ${round2(netAreaM2)} m² within the typology bands`,
    );
}

interface Slot { typology: Typology; area: number }

/**
 * Try to assign each of `N` equal-share slots a typology + an in-band target area.
 * For one slot getting `share` m², pick the LARGEST enabled typology whose effective
 * band can accept the share — i.e. clamp `share` into [min,max] and prefer the typology
 * that keeps the clamped area closest to (and not above) `share`, so we fill with the
 * biggest apartments the area can afford. Returns null if NO typology can take a slot
 * (share below every typology's min). Deterministic: typologies are tried largest→
 * smallest in a fixed order.
 */
function assignSlots(bands: EnabledBand[], share: number, N: number): Slot[] | null {
    // For an equal-share level, all slots are identical → pick once, replicate.
    const slot = pickSlot(bands, share);
    if (!slot) return null;
    const slots: Slot[] = [];
    for (let i = 0; i < N; i++) slots.push(slot);
    return slots;
}

/** Pick the best typology for a single slot of `share` m² (largest-first). */
function pickSlot(bands: EnabledBand[], share: number): Slot | null {
    // Sort largest band-min first (so a big share fills a big typology); deterministic.
    const ordered = [...bands].sort((a, b) => b.min - a.min);
    for (const b of ordered) {
        if (share + 1e-9 >= b.min) {
            // The share can host this (or a larger) typology — clamp into the band.
            const area = Math.min(b.max, Math.max(b.min, share));
            return { typology: b.typology, area };
        }
    }
    return null; // share below every enabled typology's min
}
