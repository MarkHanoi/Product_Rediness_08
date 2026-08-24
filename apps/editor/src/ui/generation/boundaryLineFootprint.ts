// §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) — the PURE boundary-line → generator
// footprint resolver.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S SENTENCE, AND WHY IT NEEDED THIS FILE
// ═══════════════════════════════════════════════════════════════════════════════
//
//   "how could a user possibly define a boundary with the boundary line WITHIN the
//    site boundary — and ask the AI chat: create the building … 5 story buildings"
//
// The chat could already generate a building: `generation.building` has been live
// since RAC U5b.2 and drives the SAME controllers the onboarding modal drives. What
// it could NOT do is build on anything other than the SITE PARCEL —
// `generationChatSeam.readSiteFootprint()` reads `siteModelStore.getParcelBoundary()`
// and nothing else. A setting-out line the architect drew INSIDE that parcel was
// addressable (C106 §7.1: `boundaryLine_<ulid>`, one store, every verb takes it by
// id) but no generator would consume it.
//
// That gap was already NAMED and OPEN, not discovered here — **C106 §7.2 / L-7961**,
// which says in as many words: *"GENERATOR CONSUMPTION. ⛔ NOT DONE, AND NOT
// STUBBED… stubbing it would produce exactly the silent success this lane refused
// elsewhere."* This module is that work, and it is deliberately the SMALLEST thing
// that closes it: a footprint resolver. No new generator, no new verb, no second
// pipeline — `generation.building` keeps its single execution path and simply gains
// a second, honest SOURCE for the polygon it already knew how to consume.
//
// ─── ⛔ WHAT THIS MODULE REFUSES TO DECIDE, AND WHY THAT IS THE POINT ──────────
//
// It owns EXACTLY the three questions the generator cannot answer for itself:
//   1. is the line a CLOSED ring?      (a building footprint is a loop)
//   2. is the ring DEGENERATE?         (collapsed / fewer than 3 distinct corners)
//   3. does it lie INSIDE the site?    (the founder's "within the site boundary")
//
// ⛔ IT DOES NOT DECIDE FEASIBILITY, AND MUST NEVER LEARN TO. "Is this plate big
// enough for N storeys?" belongs to `orchestrateResidentialBuilding`, which already
// refuses with BOTH the measured plate width AND its own derived `MIN_PLATE_WIDTH_M`,
// and whose reason `generationChatSeam` already relays to the transcript verbatim.
//
// ⭐ THE REASON THIS BOUNDARY IS DRAWN HERE IS A DEFECT THAT ALREADY HAPPENED.
// `residentialError.ts`'s §RESI-REFUSAL-TRUE header records it: that module once held
// `RESIDENTIAL_MIN_PLATE_M2 = 400` — a number INVENTED there, matching NO constant in
// the generator — and told the founder his 674 m² plot was too small against it. He
// asked, correctly, *"why is a plot of 674 m² too small? What is the ceiling?"* The
// measured truth is that **the binding quantity is the plate's SHORT SIDE, not its
// area**: a 16 × 45 m (720 m²) plate REFUSES while a 16.5 × 16.5 m (272 m²) plate
// BUILDS. A larger plot refusing while a smaller one builds is exactly why no area
// may ever be quoted as a feasibility threshold.
//
// So: this module quotes areas only as FACTS ABOUT WHAT IT MEASURED (this ring is
// 0.0 m²; the parcel is 812 m²), never as a threshold anything must clear. One fact,
// one authority — C74 honesty applied to the refusal itself.
//
// ─── ⭐ AN OPEN LINE IS REFUSED BY NAME, NEVER CLOSED BY GUESS ────────────────
// `closed` is AUTHORED on the record, never derived — `packages/schemas/src/elements/
// BoundaryLine.ts` states it outright, defaults it to `false`, and refuses a closed
// line with fewer than 3 vertices. The user closes a line deliberately (Enter while
// drawing, per §FIX-BOUNDARY-LINE-ENTER-CLOSES, or the rectangular/circular modes).
// Silently joining last→first would invent a wall the architect did not draw and then
// build five storeys on it. The refusal names the vertex count and the route back.
//
// PURE: no store reads, no DOM, no THREE, no `window`. Everything it needs is passed
// in, so it is unit-testable in plain Node at the same fidelity production runs it.
// The ONE import is the canonical kernel ray cast (C73 §PIP-CANONICAL) — writing a
// second point-in-polygon here is precisely the two-vocabularies defect C84 EI-8 names.

import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

/** A plan point in WORLD metres. Both the boundary line's vertices and the parcel
 *  polygon are already in this frame, which is what makes containment meaningful. */
export interface PlanPointXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * One boundary line, flattened to exactly what this decision needs. Deliberately
 * NOT `BoundaryLineData`: the resolver must not depend on the schema's optional
 * dimensional fields, and a structural shape is what lets a test drive it without
 * standing up a store.
 */
export interface BoundaryLineCandidate {
    readonly id: string;
    readonly levelId: string;
    /** AUTHORED closure (schema `closed`), never inferred from the vertices. */
    readonly closed: boolean;
    /** WORLD vertices. A closed line is an OPEN LOOP — the closing vertex is NOT
     *  repeated (the Slab / Pool / Balcony convention the schema enforces). */
    readonly vertices: readonly PlanPointXZ[];
    /** Free-text name, used only to make a multi-candidate refusal nameable. */
    readonly name?: string | undefined;
}

export interface BoundaryFootprintInput {
    /** Every boundary line the project holds. */
    readonly lines: readonly BoundaryLineCandidate[];
    /** The line the user POINTED AT — a selection, or an id in the payload. When
     *  present it wins outright: an explicit choice is never second-guessed, and a
     *  problem with it is reported ABOUT IT rather than silently routed elsewhere. */
    readonly explicitId?: string | undefined;
    /** Narrows the implicit search. Absent ⇒ search every level. */
    readonly activeLevelId?: string | undefined;
    /**
     * The site parcel ring, for the founder's "within the site boundary" test.
     *
     * ⚠ `null`/absent means UNKNOWN, and is NOT treated as "outside" or as an empty
     * site (§CONTEXT-DATA-HONESTY: a failure and an empty value are different
     * values). With no parcel the containment arm does not run and claims nothing —
     * plenty of real projects have a drawn line and no cadastral parcel at all.
     */
    readonly parcel?: readonly PlanPointXZ[] | null | undefined;
}

export type BoundaryFootprintResolution =
    | {
          readonly ok: true;
          readonly lineId: string;
          /** The de-duplicated closed ring, ready for an orchestrator `footprint`. */
          readonly footprint: readonly PlanPointXZ[];
          readonly areaM2: number;
          /** How the line was chosen — for the honest transcript line, so the user
           *  always learns WHICH line was built on and why that one. */
          readonly how: 'explicit' | 'only-closed-line';
          readonly lineLabel: string;
      }
    | { readonly ok: false; readonly reason: string };

/** Shoelace area (m²) of a plan-XZ ring. Pure; 0 for fewer than 3 points. */
export function ringAreaM2(ring: readonly PlanPointXZ[]): number {
    if (ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** Consecutive-duplicate removal (including last≡first), so a ring authored with a
 *  repeated corner cannot present as having more corners than it has. */
function distinctRing(vertices: readonly PlanPointXZ[]): PlanPointXZ[] {
    const EPS = 1e-6;
    const out: PlanPointXZ[] = [];
    for (const v of vertices) {
        const prev = out[out.length - 1];
        if (prev !== undefined && Math.abs(prev.x - v.x) < EPS && Math.abs(prev.z - v.z) < EPS) continue;
        out.push({ x: v.x, z: v.z });
    }
    while (out.length >= 2) {
        const first = out[0]!;
        const last = out[out.length - 1]!;
        if (Math.abs(first.x - last.x) < EPS && Math.abs(first.z - last.z) < EPS) out.pop();
        else break;
    }
    return out;
}

/** A human handle for a line: its authored name when it has one, else its id. */
function labelOf(line: BoundaryLineCandidate): string {
    const n = line.name?.trim();
    return n !== undefined && n.length > 0 ? `"${n}"` : line.id;
}

/**
 * ⚠ A COLLAPSED RING, NOT A "TOO SMALL" ONE. This epsilon separates a ring with real
 * extent from one that is mathematically degenerate (all corners collinear, or a
 * zero-extent loop) — a shape for which "where is the inside?" has no answer. It is
 * NOT a feasibility floor and must never be reported as one; see the §RESI-REFUSAL-TRUE
 * note in this file's header. Feasibility is the orchestrator's, quoting SHORT SIDE.
 */
const DEGENERATE_AREA_M2 = 0.01;

/** Round for human copy without pretending to precision the input lacks. */
const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Resolve which boundary line a generation should build on, and hand back its ring.
 *
 * THE LADDER (the `resolveCatalogueRef` discipline, applied to a host element):
 *   1. an EXPLICIT line (selected, or named in the payload) — always wins;
 *   2. else the ONE closed line on the active level;
 *   3. else REFUSE, NAMING THE COUNT — never a coin flip between two schemes.
 *
 * Every refusal states what was measured and the route back to success (C16 CA-18).
 */
export function resolveBoundaryLineFootprint(input: BoundaryFootprintInput): BoundaryFootprintResolution {
    const { lines, explicitId, activeLevelId, parcel } = input;

    if (lines.length === 0) {
        return {
            ok: false,
            reason:
                'there is no boundary line in this project yet. Draw one with the Boundary Line tool ' +
                '(Architecture → Boundary Line, Alt+Shift+N), close it with Enter so it forms a loop, ' +
                'and then ask again.',
        };
    }

    // ── 1 · the explicit choice ───────────────────────────────────────────────
    if (explicitId !== undefined && explicitId.length > 0) {
        const hit = lines.find((l) => l.id === explicitId);
        if (hit === undefined) {
            return {
                ok: false,
                reason:
                    `I can't find a boundary line with id ${explicitId}. This project has ` +
                    `${lines.length} boundary line${lines.length === 1 ? '' : 's'} — select the one you ` +
                    `want in plan and ask again.`,
            };
        }
        return validateChosen(hit, 'explicit', parcel);
    }

    // ── 2 · the ONE closed line in scope ──────────────────────────────────────
    const inScope = activeLevelId !== undefined && activeLevelId.length > 0
        ? lines.filter((l) => l.levelId === activeLevelId)
        : [...lines];

    if (inScope.length === 0) {
        return {
            ok: false,
            reason:
                `there is no boundary line on the level you're viewing (the project has ` +
                `${lines.length} on other levels). Switch to the level with the line, or select the ` +
                `line you mean, and ask again.`,
        };
    }

    const closed = inScope.filter((l) => l.closed);
    const open = inScope.filter((l) => !l.closed);

    if (closed.length === 0) {
        // ⭐ The whole point of refusing rather than guessing: an OPEN run is a
        // setting-out line, not an envelope, and closing it for the user would
        // invent an edge they did not draw.
        const one = open.length === 1 ? open[0]! : undefined;
        return {
            ok: false,
            reason:
                one !== undefined
                    ? `the boundary line ${labelOf(one)} on this level is OPEN — ${one.vertices.length} ` +
                      `vertices with no closing edge — so it doesn't enclose an area to build in. ` +
                      `Press Enter while drawing to close it (or draw it with the rectangular mode), ` +
                      `then ask again. I won't guess a closing edge you didn't draw.`
                    : `all ${open.length} boundary lines on this level are OPEN, so none of them ` +
                      `encloses an area to build in. Close the one you want with Enter while drawing ` +
                      `(or use the rectangular mode), then ask again.`,
        };
    }

    if (closed.length > 1) {
        // Refuse NAMING THE COUNT. Two schemes on one level is a real authoring
        // state, and picking one for the user would build the wrong building
        // silently — the failure this whole lane exists to stop.
        const names = closed.map(labelOf).join(', ');
        return {
            ok: false,
            reason:
                `there are ${closed.length} closed boundary lines on this level (${names}), so I don't ` +
                `know which one to build on. Select the one you want in plan and ask again.`,
        };
    }

    return validateChosen(closed[0]!, 'only-closed-line', parcel);
}

/** Shared validation for a chosen line — closure, degeneracy, containment. */
function validateChosen(
    line: BoundaryLineCandidate,
    how: 'explicit' | 'only-closed-line',
    parcel: readonly PlanPointXZ[] | null | undefined,
): BoundaryFootprintResolution {
    const label = labelOf(line);

    if (!line.closed) {
        return {
            ok: false,
            reason:
                `the boundary line ${label} is OPEN — ${line.vertices.length} vertices with no closing ` +
                `edge — and a building footprint has to be a closed loop. Press Enter while drawing to ` +
                `close it (or draw it with the rectangular mode), then ask again. I won't guess a ` +
                `closing edge you didn't draw.`,
        };
    }

    const ring = distinctRing(line.vertices);
    if (ring.length < 3) {
        return {
            ok: false,
            reason:
                `the boundary line ${label} has only ${ring.length} distinct corner` +
                `${ring.length === 1 ? '' : 's'}, and a footprint needs at least 3. Redraw it with more ` +
                `points, then ask again.`,
        };
    }

    const areaM2 = ringAreaM2(ring);
    if (areaM2 < DEGENERATE_AREA_M2) {
        return {
            ok: false,
            reason:
                `the boundary line ${label} encloses ${r1(areaM2)} m² — its corners are collinear, so ` +
                `it has no inside to build in. Redraw it as a real loop and ask again.`,
        };
    }

    // ── 3 · "within the site boundary" — the founder's own words ──────────────
    // Only when a parcel is actually known. Absent ⇒ this arm claims NOTHING.
    if (parcel !== null && parcel !== undefined && parcel.length >= 3) {
        const outside = ring.filter((p) => !pointInPolygonXZ(p.x, p.z, parcel));
        if (outside.length > 0) {
            const parcelAreaM2 = ringAreaM2(parcel);
            return {
                ok: false,
                reason:
                    `the boundary line ${label} isn't inside the site: ${outside.length} of its ` +
                    `${ring.length} corners fall OUTSIDE the parcel. The line encloses ` +
                    `${r1(areaM2)} m² and the parcel is ${r1(parcelAreaM2)} m². Move the line fully ` +
                    `inside the site boundary and ask again — building outside the parcel wouldn't be ` +
                    `permittable.`,
            };
        }
    }

    return { ok: true, lineId: line.id, footprint: ring, areaM2, how, lineLabel: label };
}
