/**
 * finishRegionAttribution.ts — §REGION-HOST-ATTRIBUTION for the FINISH PLAN TOOLS.
 *
 * C79 §6.3 **rows 9 and 10** — `CeilingPlanToolHandler` and `FloorPlanToolHandler`,
 * the last two non-conforming rows in the conformance table. Both were
 * **CAPABILITY ABSENT**: zero occurrences of `region`, and C79 §0.1(3)(4) states
 * plainly that *"neither can INHERIT a fix: the capability does not exist."* This
 * module is that capability, and it is deliberately the ONLY new logic the two
 * handlers gain — everything below it already existed.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * §10.3 IS ALREADY DECIDED — THIS MODULE OBEYS IT, IT DOES NOT RE-OPEN IT.
 *
 * Commit `9fd9c5b6` closed rows 6/7/8 by deciding that floors and ceilings
 * **DERIVE FROM THE ROOM** rather than growing a tracer of their own. The full
 * argument (three reasons, in order of weight, plus the price stated rather than
 * hidden) lives at the head of
 * `packages/command-registry/src/rooms/roomBoundarySketch.ts`, and C79 §10.3
 * records it as ANSWERED. The two load-bearing consequences for this file:
 *
 *   1. **NO NEW TRACER.** This module calls `buildRoomFinishBoundarySketch` — the
 *      SAME function `CreateFloorCommand` and `CreateCeilingCommand` call. It does
 *      not walk the wall store, does not close a ring, and has no hit-point
 *      geometry of its own. A second attributor for one relationship is C79 §6.5's
 *      named disease: roof's rival `WallRegionDetector` is precisely why the slab
 *      fix of `e6c8cb58` never reached roof.
 *   2. **REACH THE ROOM'S BOUNDARY, DO NOT RE-DERIVE IT.** The user's click
 *      resolves a ROOM (the handlers' existing `_pointInPolygon` pick, unchanged);
 *      the room's own by-construction `boundingWallIds` is the candidate set. A
 *      finish is not independently bounded — it IS the room's surface.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * §6.6 — WHY THIS SHIPS WITH REFERENCES RATHER THAN COORDINATES.
 *
 * C79 §6.6 is a MUST NOT aimed by name at these two rows: *"Adding a region mode
 * to ceilings or floor finishes (§6.3, rows 9–10) that emits coordinates would
 * create the §0 defect NEW, in 2026, in a family that has never had it."* The cheap
 * version of this feature — click a room, send the polygon, done — is the forbidden
 * one. Every region commit from these handlers therefore carries
 * `HostReferenceEdge`s with `fallback` populated at authoring time (§4.3), the
 * §3.1 `centerLine` @ offset 0 frame, the §2.4 named failure reasons, and the §2.5
 * counts surfaced at commit (§2.6: zero-host and all-host are not the same value).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * §2.3 / §5.2.0 — THE REFUSAL, AND WHY IT IS THE ANSWER RATHER THAN A COST.
 *
 * If the clicked room's OWN boundary relationship is undetermined — `boundingWallIds`
 * absent, i.e. no producer ever wrote the field — this module REFUSES with a typed
 * reason instead of inventing a boundary. C79 §9.7 warns that the transitive design
 * is `undetermined` whenever the room's detection is; §10.3 reason 3 answers that
 * this is *"correct and desirable"*, because a finish whose room could not be
 * detected genuinely HAS no known boundary relationship, and §2.3 is explicit that
 * **a wrong host is strictly worse than no host**.
 *
 * The reason is NOT minted here. C79 §5.2.0 maps an empty/absent `boundingWallIds`
 * to **`RELATIONSHIP_NOT_RECORDED`**, a member of C78 §8.1's closed eleven-member
 * union at `packages/command-bus/src/consequence.ts`. The classifier that produces
 * it is `determineBoundingWalls` in `@pryzm/core-app-model` — layer (c) of that
 * same defect, already in the tree, already the discriminator both handlers use at
 * their `_innerFacePolygon` sites. This module mints nothing; it classifies.
 *
 * ⚠ NOTE THE ASYMMETRY, STATED SO IT IS NOT READ AS INCONSISTENCY. A room that was
 * examined and DETERMINED to bound zero walls is *not* the refusal case — that is a
 * real answer (`determined`, `elements: []`), and it flows through to the sketch
 * builder which reports `roomUndetectedFallbacks` per edge. Only an UNDETERMINED
 * room refuses. `[]` may only ever mean zero results (C71 §4.4).
 */

// §6.5 / §10.3 — the ONE shared attributor, imported, never re-implemented. It is
// pure (no store access, no I/O, no throw); the lookup is injected below.
import {
    buildRoomFinishBoundarySketch,
    formatFinishBoundaryAttributionReport,
    type FinishBoundarySketch,
    type IdentifiedFinishWall,
} from '@pryzm/command-registry';
// §5.2.0 — the C78 §8.1 classifier. `RELATIONSHIP_NOT_RECORDED` is produced here,
// not spelled here: a literal typed at a call site is a fork waiting to happen.
import {
    determineBoundingWalls,
    type BoundingWallDetermination,
} from '@pryzm/core-app-model';

/** Planar point in the world X-Z frame every room / finish boundary is authored in. */
export interface XZ { x: number; z: number }

/**
 * The outcome of asking "can this finish be bounded BY REFERENCE to its room?".
 *
 * Two arms, never collapsible into one (C79 §5.2.1 — `undetermined` MUST NOT be
 * collapsed into a success; they are the same pixels and opposite facts). A caller
 * cannot read `edges.length === 0` and conclude "no walls", because the refusal arm
 * is not an empty success — it is a different shape carrying a typed reason.
 */
export type FinishRegionAttribution =
    | {
          readonly kind: 'attributed';
          /** The reference-carrying sketch, index-aligned with the stored ring. */
          readonly sketch: FinishBoundarySketch;
      }
    | {
          readonly kind: 'refused';
          /**
           * The C78 §8.1 member, produced by `determineBoundingWalls`. Carries the
           * scope (WHAT question went unanswered) and a human-readable detail.
           */
          readonly determination: Extract<BoundingWallDetermination, { kind: 'undetermined' }>;
      };

/** The wall-store surface this module needs. Injected, so the module stays testable. */
export interface FinishRegionWallLookup {
    readonly getById?: (id: string) => IdentifiedFinishWall | undefined | null;
}

/**
 * §REGION-HOST-ATTRIBUTION — attribute a finish's FINAL stored ring to the walls of
 * its host room, or refuse with a typed reason.
 *
 * @param ring    The finish's boundary as it will be STORED (already inset to the
 *                inner faces by the handler's existing `_innerFacePolygon`). Passing
 *                the stored ring — not the room's centreline — is what makes the
 *                emitted edges index-aligned with `boundary.polygon`, which is what
 *                lets a later re-derivation know which edge to move.
 * @param room    The room record the click resolved. Its `boundingWallIds` is the
 *                by-construction candidate set (§2.1); its ABSENCE is the refusal.
 * @param walls   Wall lookup by id.
 *
 * Never throws: an unavailable wall store yields an all-free sketch whose counts say
 * so, which is a MEASUREMENT (§2.6), not a silent gap.
 */
export function attributeFinishRegion(
    ring: ReadonlyArray<XZ>,
    room: { id?: string; boundingWallIds?: readonly string[] | null } | null | undefined,
    walls: FinishRegionWallLookup | undefined,
): FinishRegionAttribution {
    // §2.3 / §5.2.0 — THE HONEST REFUSAL, taken BEFORE any geometry is touched.
    //
    // This is deliberately the first thing that happens. Deriving a boundary and
    // only then noticing the relationship was undetermined would mean the invented
    // answer already existed in a local — and the §0 lesson is that an answer which
    // exists is an answer that eventually gets written down.
    const determination = determineBoundingWalls(
        room,
        `bounding walls of ${room?.id ?? 'the clicked room'} (finish region)`,
    );
    if (determination.kind === 'undetermined') {
        return { kind: 'refused', determination };
    }

    const declared = determination.elements;

    const sketch = buildRoomFinishBoundarySketch(
        ring.map(v => ({ x: v.x, z: v.z })),
        room?.id,
        {
            // The determination above already read the field; hand the builder the
            // DETERMINED value rather than letting it re-read a raw record. One read,
            // one answer — the same discipline §7.4 asks for across write paths.
            getRoomById: () => ({ boundingWallIds: [...declared] }),
            getWallById: (id) => {
                const w = walls?.getById?.(id);
                // The wall store keys by id, so a record fetched BY id IS that wall —
                // carry the id through even when the record does not repeat it. That
                // is by construction (§2.1), not a lookup.
                return w ? ({ ...w, id: w.id ?? id } as IdentifiedFinishWall) : undefined;
            },
        },
    );

    return { kind: 'attributed', sketch };
}

/**
 * §2.6 — the commit-time report, for the ATTRIBUTED arm.
 *
 * Delegates the count sentence to the ONE shared formatter both create-commands
 * use, so the plan tool and the command cannot describe the same five counts in two
 * different phrasings (§7.4 applied to prose). The prefix names the surface, because
 * C79 §0's whole mechanism was that *"the user cannot see which surface they used"*.
 */
export function formatFinishRegionReport(
    surface: string,
    kind: 'floor' | 'ceiling',
    sketch: FinishBoundarySketch,
): string {
    return `[${surface}] ${formatFinishBoundaryAttributionReport(kind, sketch.attribution)}`;
}

/**
 * §2.3 / §5.2.0 — the refusal sentence.
 *
 * Names the typed reason AND says what was not done, because a refusal the user
 * reads as "nothing happened" is indistinguishable from a success that changed
 * nothing (§5.2.1). It states the remedy too: the room's boundary relationship is
 * what is missing, so detecting rooms is the action that makes this click work.
 */
export function formatFinishRegionRefusal(
    surface: string,
    kind: 'floor' | 'ceiling',
    determination: Extract<BoundingWallDetermination, { kind: 'undetermined' }>,
): string {
    return (
        `[${surface}] §REGION-HOST-ATTRIBUTION REFUSED to create a ${kind} by region: `
        + `${determination.reason} — ${determination.scope}. `
        + `${determination.detail ?? ''} `
        + `No ${kind} was created. C79 §2.3: a wrong host is strictly worse than no host, so a `
        + `boundary was NOT invented for a room whose own wall relationship is undetermined. `
        + `Detect rooms on this level, then click again.`
    ).replace(/\s+/g, ' ').trim();
}
