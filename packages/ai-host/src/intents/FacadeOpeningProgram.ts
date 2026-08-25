// §GEN-FACADE-OPENINGS (L-11080 · C108 §10 L-11006 — MILESTONE 2) — the façade IR's
// OPENING LATTICE becomes real windows.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT THIS FILE EXISTS TO CARRY
// ═══════════════════════════════════════════════════════════════════════════════
//
// The founder attached a photograph of a Barcelona apartment block — ~7 storeys,
// ~5 bays, a five-arch ground arcade — and asked for "the facade as per the
// attached photo". He got a plain white box with balconies.
//
// The parse was CORRECT. The FAÇADE half failed for one structural reason: the
// entire channel from a photograph to the generator was THREE BOOLEANS AND A
// COLOUR (`generationChatSeam.ts`, `FacadeIntent.ts`). The IR measures zones,
// bays and openings with a continuous `archness` — and none of it had anywhere
// to go. `balconies` survived only because it happened to be one of the four.
//
// THIS FILE IS THE MISSING SLOT. It is the SECOND half of the §GEN-PHOTO-BRIEF
// bridge (`FacadePhotoBrief.ts`, L-11020): that file maps the IR onto the four
// pre-existing boolean fields; this one carries the LATTICE ITSELF — how many
// bays, how many bands, how big each opening is relative to its cell, and how
// arched its head is.
//
// ── ⛔ WHAT THE PHOTOGRAPH MAY NOT SUPPLY. Every refusal here is structural. ──
//
//  1. ⛔ METRES. NOTHING IN THE PROGRAM IS A LENGTH. `scale.status` is `unknown`
//     unless the user sets a reference dimension, and C108 §2.2 admits no third
//     source (L-11009). Every number in `FacadeOpeningProgram` is a FRACTION.
//     Metres appear for the first time in `planFacadeOpenings`, and they come
//     from the WALL RUN and the STOREY HEIGHT the generator already resolved
//     from the footprint — never from the image. Grep this file for `M` suffixes:
//     they exist only in the planner's inputs, which the caller supplies.
//  2. ⛔ THE OPENING'S POSITION INSIDE ITS CELL IS NOT MEASURED. C108 §1.1's
//     `opening` node is `{ a, b, n, archness }` — semi-axes and a head shape. It
//     carries NO x/y. So the IR supports exactly one reading: the opening is
//     CENTRED in its cell. The SILL therefore does not come from the photograph
//     and this file never emits one — the planner takes the generator's own sill
//     convention as an input. Inventing a sill fraction would be a measurement
//     the IR does not contain.
//  3. ⛔ NO `circular` PROFILE IS EVER EMITTED, and the reason is a measurement.
//     `openingProfileShapeRefusal` requires `width === height` to 1e-6 for a
//     circle — the width IS the diameter. The IR's measured width and height are
//     independent fits and are essentially never equal. Equalising them to pass
//     that gate would OVERWRITE A MEASUREMENT to satisfy a shape the user did not
//     ask for. So the mapping's codomain is {rectangular, segmental-arch,
//     round-arch} and `circular` stays reachable only by hand.
//  4. ⛔ SYMMETRY IS NOT READ (L-10978). `measureSymmetry` reports axis 0.299 on
//     NINE of fourteen corpus cases that are all drawn symmetric about 0.500, at
//     scores of 0.94–0.98 — confidently wrong. A periodic façade has an exact
//     mirror at every bay centre and boundary, so the argmax has no right to be
//     believed. Nothing structural may key on it.
//  5. ⛔ SURFACE / TILE PITCH IS NOT READ (L-11012). Falsified, not merely
//     unproven: the stage returns the opening lattice rather than the tile pitch.
//
// ── ⭐ THE ARCHNESS MAPPING IS NOT A TUNED THRESHOLD ─────────────────────────
//
// C108 §9.1 forbids "no arch threshold" in the ENGINE, and §3.6 says in as many
// words that "a consumer that wants a boolean computes one itself, downstream,
// and owns the threshold". This file is that consumer — and it still does not
// introduce a tuned number, because it does not threshold at all. It matches
// each measured `archness` to the NEAREST profile, where every candidate's
// canonical archness is derived from PRYZM'S OWN GEOMETRY:
//
//     archness ≡ rise / (width / 2)            (C108 §3.6, verbatim)
//
//     rectangular     rise = 0                       ⇒ archness 0
//     segmental-arch  rise = width·SEGMENTAL_RISE_RATIO ⇒ archness 2·(1/6) = 1/3
//     round-arch      rise = width / 2               ⇒ archness 1
//
// `SEGMENTAL_RISE_RATIO` is imported from `@pryzm/geometry-wall`, not copied — so
// if the segmental arch is ever re-proportioned, this mapping follows it and
// cannot drift. There is no constant here that encodes a property of one
// building, which is what C108 §9 / brief §22 actually forbid.
//
// LAYERING — L2 (ai-host) importing L1 (facade-reconstruction) for the IR types
// and `@pryzm/geometry-wall` for the profile axis. Both edges already exist in
// this package's manifest. PURE: no DOM, no THREE, no I/O, no randomness (C108
// §5.2 — same input, same output, on every run).

import {
    SEGMENTAL_RISE_RATIO,
    openingProfileRefusal,
    openingProfilesFor,
    type OpeningProfileKind,
} from '@pryzm/geometry-wall';

import type { FacadeIR, Zone } from '@pryzm/facade-reconstruction';

// ─── The normalized program: the photograph's lattice, with no lengths in it ──

/**
 * One MEASURED opening, keyed to its lattice cell.
 *
 * ⛔ Every field is a RATIO. There is no length here and there must never be one
 * (C108 §2.2, L-11009).
 */
export interface FacadeOpeningCell {
    /** 0-based bay index, left → right across the photographed elevation. */
    readonly bayIndex: number;
    /** 0-based band index counting UP from the ground — C108 §2.1 has facade `Y`
     *  bottom→top, so band 0 is the LOWEST zone and not `zones[0]`. */
    readonly bandIndex: number;
    /** Opening width ÷ its CELL's width. (0, 1]. */
    readonly widthFraction: number;
    /** Opening height ÷ its CELL's height. (0, 1]. */
    readonly heightFraction: number;
    /** ⛔ CONTINUOUS, never bucketed here (C108 §3.6). The consumer that wants a
     *  shape calls {@link resolveOpeningProfileFromArchness}, which owns that. */
    readonly archness: number;
    /** `null` = UNKNOWN (C108 §2.3), never "zero confidence". */
    readonly confidence: number | null;
}

/**
 * The photograph's opening lattice, normalized.
 *
 * ⭐ `bands` is what the PHOTOGRAPH showed and is deliberately NOT the storey
 * count that gets built. The founder's sentence said FIVE and his photograph
 * shows ~SEVEN; the sentence wins, and that precedence already exists upstream
 * in `ZeroTokenResolver` (`effectiveFloors` / `floorsFromPhoto`) and is NOT
 * re-decided here. This field lets the planner map the built storeys onto the
 * measured bands — the photo informs the RHYTHM, the sentence sets the COUNT.
 */
export interface FacadeOpeningProgram {
    /** Measured bays across the photographed elevation. ≥ 1. */
    readonly bays: number;
    /** Measured horizontal bands. ≥ 1. NOT the storey count to build. */
    readonly bands: number;
    /** Band heights as fractions of the façade height, LOWEST band first. */
    readonly bandHeightFractions: readonly number[];
    /** Every cell that carries an opening. Sorted (bandIndex, bayIndex) ascending
     *  so the program is byte-stable across runs (C108 §5.2). */
    readonly cells: readonly FacadeOpeningCell[];
    /** Minimum confidence over the readings that produced this program. `null` =
     *  UNKNOWN, which C108 §4.3 propagates as unknown — never as "fine". */
    readonly confidence: number | null;
}

// ─── IR → program ────────────────────────────────────────────────────────────

/** Zones LOWEST-first. C108 §2.1: facade `Y` counts UP, so array order is not
 *  ground-first and assuming it is silently inverts a building. */
function zonesLowestFirst(ir: FacadeIR): readonly Zone[] {
    return [...ir.facade.zones].sort((a, b) => a.y - b.y);
}

function minConfidence(values: readonly (number | null)[]): number | null {
    let out: number | null = 1;
    for (const v of values) {
        if (v === null) return null;
        if (out === null || v < out) out = v;
    }
    return out;
}

/**
 * §CONF72 (L-11220) — the program's confidence over its CELLS is a MEDIAN, then
 * capped by the structure (C108 §4.3: cap by INPUTS with `min`; peers are
 * summarised by a support term). The previous MIN over every cell made one ragged
 * window head among 24 read the whole lattice as "0.00" — measured on the
 * founder's photograph AND, unasserted until now, on clean corpus cases E / I / J.
 * Each cell still carries its own confidence for the consumer; a cell at 0 stays 0
 * on that cell. UNKNOWN (null) anywhere still propagates as UNKNOWN.
 */
function medianConfidence(values: readonly (number | null)[]): number | null {
    const measured: number[] = [];
    for (const v of values) {
        if (v === null) return null;
        measured.push(v);
    }
    if (measured.length === 0) return 1;
    const sorted = [...measured].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Façade IR → the normalized opening lattice, or `null` when the image supports
 * no lattice at all.
 *
 * ⚠ RETURNS `null` FREELY AND THAT IS CORRECT. A façade with fewer than two
 * bands, or with no opening in any cell, is a wall / a sky / a texture — the same
 * refusal `mapFacadeIRToPhotoBrief` already makes, kept consistent on purpose so
 * the two halves of the bridge cannot disagree about whether an image is a façade.
 */
export function extractFacadeOpeningProgram(ir: FacadeIR): FacadeOpeningProgram | null {
    const zones = zonesLowestFirst(ir);
    if (zones.length < 2) return null;

    // Bays come from the LATTICE ITSELF (the widest band), not from
    // `periodicity.repeatX`. The lattice is what the cells are actually indexed
    // against, so reading the count from anywhere else can only introduce a
    // disagreement between the count and the cells that carry it.
    let bays = 0;
    for (const z of zones) if (z.cells.length > bays) bays = z.cells.length;
    if (bays < 1) return null;

    const facadeHeight = ir.facade.height > 0 ? ir.facade.height : 1;
    const bandHeightFractions = zones.map((z) => z.height / facadeHeight);

    const cells: FacadeOpeningCell[] = [];
    const confidences: (number | null)[] = [];
    for (let bandIndex = 0; bandIndex < zones.length; bandIndex++) {
        const zone = zones[bandIndex]!;
        // Cells left → right. The IR does not guarantee array order is spatial
        // order, and a bay index derived from a wrong order mirrors the façade.
        const row = [...zone.cells].sort((a, b) => a.x - b.x);
        for (let bayIndex = 0; bayIndex < row.length; bayIndex++) {
            const cell = row[bayIndex]!;
            const opening = cell.opening;
            if (opening === null) continue;              // an ABSENCE, not a zero-size opening
            if (!(cell.width > 0) || !(cell.height > 0)) continue;
            const widthFraction = opening.width / cell.width;
            const heightFraction = opening.height / cell.height;
            // A fit that lands outside its own cell is not a measurement of that
            // cell. Drop it rather than clamp it into a plausible-looking number.
            if (!(widthFraction > 0) || widthFraction > 1) continue;
            if (!(heightFraction > 0) || heightFraction > 1) continue;
            cells.push({
                bayIndex,
                bandIndex,
                widthFraction,
                heightFraction,
                archness: opening.archness,
                confidence: opening.confidence,
            });
            confidences.push(opening.confidence);
        }
    }
    if (cells.length === 0) return null;

    // Already emitted in (band, bay) order by construction; the explicit sort is
    // the guarantee, not the mechanism (C108 §5.2 — ties break on a stated order).
    cells.sort((a, b) => (a.bandIndex - b.bandIndex) || (a.bayIndex - b.bayIndex));

    return {
        bays,
        bands: zones.length,
        bandHeightFractions,
        cells,
        confidence: minConfidence([medianConfidence(confidences), ir.facade.confidence]),
    };
}

// ─── archness → the EXISTING opening-profile axis ────────────────────────────

/**
 * The canonical `archness` of each profile PRYZM can build, derived from the
 * same definition C108 §3.6 gives — `archness ≡ rise / (width/2)`.
 *
 * ⛔ `circular` IS ABSENT ON PURPOSE. See this file's header, refusal 3: a circle
 * requires `width === height`, and forcing that would overwrite a measurement.
 */
export const PROFILE_CANONICAL_ARCHNESS: Readonly<Record<'rectangular' | 'segmental-arch' | 'round-arch', number>> =
    Object.freeze({
        'rectangular': 0,
        // rise = width · SEGMENTAL_RISE_RATIO ⇒ archness = 2 · SEGMENTAL_RISE_RATIO.
        // IMPORTED, never copied: re-proportion the segmental arch and this follows.
        'segmental-arch': 2 * SEGMENTAL_RISE_RATIO,
        'round-arch': 1,
    });

/** What the archness mapping decided, and why — so a caller can put it on the
 *  transcript instead of silently producing a shape the user did not see coming. */
export interface ResolvedOpeningProfile {
    readonly kind: OpeningProfileKind;
    /** The measured archness this came from, unrounded. */
    readonly archness: number;
    /** Set when the NEAREST profile was refused by `openingProfileRefusal` and a
     *  flatter one was used instead — the refusal string, verbatim. */
    readonly downgradedFrom?: OpeningProfileKind;
    readonly downgradeReason?: string;
}

/**
 * Map a CONTINUOUS `archness` onto the nearest profile the wall pipeline can
 * actually cut, then VERIFY that choice against the one authoring gate.
 *
 * ⭐ `openingProfileRefusal` is THE gate (C86 §10.1 PR-8) and returning `null` is
 * "the ONLY licence to proceed" in its own words. A round arch needs at least
 * half its width in height; a segmental arch needs more height than its rise. An
 * opening measured as arched but too squat to carry the head it was fitted with
 * therefore steps DOWN to the next flatter profile, carrying the refusal so the
 * caller can say what happened. It never proceeds on a refused combination, and
 * it never silently draws a rectangle where an arch was asked for.
 */
/** Flattest → most arched. The step-down walk in
 *  {@link resolveOpeningProfileFromArchness} relies on this order. */
function profileLadder(): OpeningProfileKind[] {
    const legal = openingProfilesFor('window');
    return (['rectangular', 'segmental-arch', 'round-arch'] as const)
        .filter((k) => (legal as readonly string[]).includes(k));
}

/**
 * The nearest buildable profile to a CONTINUOUS archness, on shape alone.
 *
 * ⚠ Dimension-free, so it answers "what did the photograph see" and NOT "what can
 * this opening carry" — the second question needs `width`/`height` and is
 * {@link resolveOpeningProfileFromArchness}'s job. Split because a caller
 * deciding HOW TO BUILD A WHOLE STOREY (curtain wall or arcade) has no single
 * opening to hand yet.
 */
export function nearestProfileByArchness(archness: number): OpeningProfileKind {
    const a = Number.isFinite(archness) ? Math.min(1, Math.max(0, archness)) : 0;
    let best: OpeningProfileKind = 'rectangular';
    let bestD = Infinity;
    for (const kind of profileLadder()) {
        const canonical = PROFILE_CANONICAL_ARCHNESS[kind as keyof typeof PROFILE_CANONICAL_ARCHNESS];
        const d = Math.abs(a - canonical);
        // Strict `<` keeps the FLATTEST candidate on an exact tie — a stated total
        // order, never whichever the loop happened to reach last (C108 §5.2).
        if (d < bestD) { bestD = d; best = kind; }
    }
    return best;
}

/**
 * ⭐ DOES THIS BAND READ AS AN ARCADE?
 *
 * The founder's ground floor is a five-arch colonnade, and the generator has two
 * incompatible ways to build a commercial ground floor: a frameless CURTAIN WALL,
 * or a SOLID shell carrying openings. ⛔ **A curtain wall cannot carry an arch** —
 * it has no wall to cut one in — so a façade measured as arched must take the
 * second path, and the caller needs to know that BEFORE it builds the walls.
 *
 * The verdict is the mean archness's nearest profile. No new threshold: the
 * ladder is the same one every opening is matched against.
 */
export function bandIsArched(program: FacadeOpeningProgram, bandIndex: number): boolean {
    const row = program.cells.filter((c) => c.bandIndex === bandIndex);
    if (row.length === 0) return false;
    const mean = row.reduce((a, c) => a + c.archness, 0) / row.length;
    return nearestProfileByArchness(mean) !== 'rectangular';
}

export function resolveOpeningProfileFromArchness(
    archness: number,
    widthM: number,
    heightM: number,
    sillHeightM: number,
): ResolvedOpeningProfile {
    const ladder = profileLadder();
    const a = Number.isFinite(archness) ? Math.min(1, Math.max(0, archness)) : 0;
    const best = nearestProfileByArchness(a);

    // Verify, and step down while refused. `rectangular` is refused by nothing,
    // so this walk always terminates.
    let idx = ladder.indexOf(best);
    const wanted = best;
    let reason: string | null = null;
    while (idx > 0) {
        const r = openingProfileRefusal({
            profile: ladder[idx]!, width: widthM, height: heightM, sillHeight: sillHeightM,
        });
        if (r === null) break;
        reason = r;
        idx--;
    }
    const kind = ladder[idx]!;
    return kind === wanted
        ? { kind, archness: a }
        : { kind, archness: a, downgradedFrom: wanted, downgradeReason: reason ?? 'refused by the opening-profile gate' };
}

// ─── program → METRES, and this is the ONLY place a length appears ───────────

/** One straight façade run the openings will be hosted on. `lengthM` is the
 *  generator's own wall length — read from the footprint, never from the image. */
export interface FacadeWallRun {
    readonly wallId: string;
    readonly lengthM: number;
}

export interface PlanFacadeOpeningsInput {
    readonly program: FacadeOpeningProgram;
    /** Every windowed run on this storey. */
    readonly runs: readonly FacadeWallRun[];
    /** Which MEASURED band supplies this storey's rhythm — see
     *  {@link mapStoreyToBand}. */
    readonly bandIndex: number;
    /** ⛔ FROM THE GENERATOR. The clear storey height in metres. */
    readonly storeyHeightM: number;
    /** ⛔ FROM THE GENERATOR. The sill the photograph could not supply (header
     *  refusal 2). */
    readonly sillM: number;
    /** Solid pier reserved at BOTH ends of every run, so an opening never runs
     *  into a corner. The generator's own §RESI-GROUND-WINDOW-CORNER-MARGIN value. */
    readonly cornerMarginM: number;
    /** An opening narrower than this is not built at all — a squeezed pane is
     *  worse than a solid bay. */
    readonly minWidthM?: number;
    /** Head clearance kept under the wall head so an opening never breaches it. */
    readonly headClearanceM?: number;
}

/** A real, buildable opening. Every number is metres, and every metre came from
 *  `lengthM` / `storeyHeightM` / `sillM` — never from the photograph. */
export interface PlannedFacadeOpening {
    readonly wallId: string;
    readonly offset: number;
    readonly width: number;
    readonly height: number;
    readonly sillHeight: number;
    readonly openingProfile: OpeningProfileKind;
    readonly archness: number;
    readonly bayIndex: number;
}

export interface FacadeOpeningPlan {
    readonly openings: readonly PlannedFacadeOpening[];
    /** Bays actually laid out, per run — the honest count for the transcript. */
    readonly baysPerRun: readonly { readonly wallId: string; readonly bays: number }[];
    /** Openings the photograph showed that this plan could NOT build, each with
     *  its reason. ⛔ NEVER silently dropped — this is what reaches the user. */
    readonly notBuilt: readonly string[];
    /** Profile downgrades, so the transcript can say an arch came out shallower. */
    readonly downgrades: readonly string[];
}

/**
 * Map a BUILT storey index onto a MEASURED band index.
 *
 * ⭐ THE SENTENCE WINS ON COUNT — that precedence lives upstream and is not
 * re-decided here. What this does is spread the photograph's bands across
 * however many storeys were actually asked for: band 0 (the ground) always
 * anchors storey 0, because the ground band is the one that differs, and the
 * remaining bands are sampled proportionally over the remaining storeys.
 *
 * So his 5-storey ask against a 7-band photograph takes the ground band for the
 * ground floor and reads the upper four from the photograph's four evenly-spaced
 * upper bands. The photo informs the RHYTHM; the sentence sets the COUNT.
 */
export function mapStoreyToBand(storeyIndex: number, builtStoreys: number, bands: number): number {
    if (bands <= 1 || builtStoreys <= 1) return 0;
    if (storeyIndex <= 0) return 0;
    const upperBuilt = builtStoreys - 1;
    const upperBands = bands - 1;
    const t = Math.min(upperBuilt, storeyIndex) / upperBuilt;   // (0, 1]
    return Math.min(bands - 1, 1 + Math.round(t * (upperBands - 1)));
}

/**
 * Lay the measured lattice out on real walls.
 *
 * ── THE BAY-PITCH RULE, stated because it is the one inference here ──────────
 * The photograph is ONE elevation. Its `bays` count spans that elevation's whole
 * width, so the measured quantity is a PITCH — bays per unit of façade — not a
 * count that means anything on a wall of a different length. The longest run is
 * taken as the photographed elevation; its pitch is `usable / bays`; and every
 * other run gets however many whole bays of that SAME pitch fit inside it.
 *
 * ⭐ That is why a short return wall gets two bays and the front gets five,
 * instead of five bays squeezed onto both. A constant bay pitch around a building
 * is what the structure actually does, and it needs no metre from the image.
 */
export function planFacadeOpenings(input: PlanFacadeOpeningsInput): FacadeOpeningPlan {
    const {
        program, runs, bandIndex, storeyHeightM, sillM, cornerMarginM,
        minWidthM = 0.5, headClearanceM = 0.1,
    } = input;

    const openings: PlannedFacadeOpening[] = [];
    const baysPerRun: { wallId: string; bays: number }[] = [];
    const notBuilt: string[] = [];
    const downgrades: string[] = [];

    const band = Math.min(Math.max(0, bandIndex), program.bands - 1);
    const rowAll = program.cells.filter((c) => c.bandIndex === band);
    if (rowAll.length === 0) {
        return { openings: [], baysPerRun: [], notBuilt: [`no opening was measured in band ${band}`], downgrades: [] };
    }

    // Usable run = the run minus a solid pier at each end. A run that cannot hold
    // one full bay is left SOLID, never given a squeezed pane.
    const usableOf = (r: FacadeWallRun): number => r.lengthM - 2 * cornerMarginM;
    const viable = runs.filter((r) => usableOf(r) > 0);
    if (viable.length === 0) {
        return { openings: [], baysPerRun: [], notBuilt: ['no façade run is long enough to hold an opening clear of its corners'], downgrades: [] };
    }

    // The photographed elevation = the longest run. Ties break on wallId so the
    // plan is byte-stable (C108 §5.2), never on array order.
    let principal = viable[0]!;
    for (const r of viable) {
        const d = usableOf(r) - usableOf(principal);
        if (d > 0 || (d === 0 && r.wallId < principal.wallId)) principal = r;
    }
    const pitchM = usableOf(principal) / program.bays;
    if (!(pitchM > 0)) {
        return { openings: [], baysPerRun: [], notBuilt: ['the measured bay pitch is not positive on this footprint'], downgrades: [] };
    }

    // Height comes from the storey the GENERATOR resolved, scaled by the fraction
    // the photograph measured. The ONLY multiplication of a measured ratio by a
    // real length in this file, and the length is the caller's.
    const maxHeightM = Math.max(0.3, storeyHeightM - sillM - headClearanceM);

    for (const run of viable) {
        const usable = usableOf(run);
        const bays = Math.max(0, Math.floor(usable / pitchM + 1e-9));
        baysPerRun.push({ wallId: run.wallId, bays });
        if (bays < 1) {
            notBuilt.push(
                `a ${run.lengthM.toFixed(2)} m façade run — one measured bay is ${pitchM.toFixed(2)} m ` +
                `and would not fit clear of the corners, so that run is left solid`,
            );
            continue;
        }
        // Distribute the run's OWN usable length over its whole bays, so the last
        // bay ends exactly at `length − cornerMargin` and nothing overruns a corner.
        const bayW = usable / bays;
        for (let k = 0; k < bays; k++) {
            // The measured row is a repeating rhythm: wrap it across however many
            // bays this run has. A 5-bay measurement on a 7-bay run repeats; on a
            // 2-bay run it takes the first two. It is never stretched.
            const cell = rowAll[k % rowAll.length]!;
            const width = Math.min(bayW, bayW * cell.widthFraction);
            if (!(width >= minWidthM)) {
                notBuilt.push(
                    `one opening in a ${bayW.toFixed(2)} m bay — the photograph measured it at ` +
                    `${(cell.widthFraction * 100).toFixed(0)}% of its cell, i.e. ${width.toFixed(2)} m, ` +
                    `below the ${minWidthM.toFixed(2)} m minimum this generator will cut`,
                );
                continue;
            }
            const height = Math.min(maxHeightM, storeyHeightM * cell.heightFraction);
            if (!(height > 0)) continue;
            const profile = resolveOpeningProfileFromArchness(cell.archness, width, height, sillM);
            if (profile.downgradedFrom !== undefined) {
                downgrades.push(
                    `an opening measured at archness ${cell.archness.toFixed(2)} came out ` +
                    `${profile.kind} instead of ${profile.downgradedFrom}: ${profile.downgradeReason}`,
                );
            }
            // Centre the opening in its bay — the IR carries the opening's SIZE and
            // not its POSITION inside the cell (header refusal 2), so centred is the
            // only reading the measurement supports.
            const bayStart = cornerMarginM + k * bayW;
            openings.push({
                wallId: run.wallId,
                offset: bayStart + (bayW - width) / 2,
                width,
                height,
                sillHeight: sillM,
                openingProfile: profile.kind,
                archness: profile.archness,
                bayIndex: k,
            });
        }
    }

    // Dedupe the reason strings — one run failing the same way five times is one
    // sentence to the user, not five.
    return {
        openings,
        baysPerRun,
        notBuilt: [...new Set(notBuilt)],
        downgrades: [...new Set(downgrades)],
    };
}
