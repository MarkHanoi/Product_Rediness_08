// BathroomPodAssembly — the PURE parametric layout solver.
//
// §FEAT-BATHROOM-POD-COMPOUND (L-11400..L-11404) · C109 §5 · C74 · C16 CA-18.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS FILE IS THE WHOLE OF "PARAMETRIC", AND IT CONTAINS NO SCALING.
// ═══════════════════════════════════════════════════════════════════════════════
// Every footprint below is READ from the plumbing family's own tables through
// `resolveFixtureFootprint` (C109 R-6). Nothing is multiplied by a room ratio. What the
// room's dimensions decide is WHICH WALL each fixture takes, the ORDER along it, the
// GAP between neighbours, and whether the module fits AT ALL.
//
// ⛔ AND WHEN IT DOES NOT FIT, THIS FILE REFUSES WITH BOTH NUMBERS (C74 / C16 CA-18 /
// C109 §5.4). It never overlaps two fixtures, never shrinks one below its footprint,
// and never silently drops a declared member to make the rest fit. Each of those three
// produces a module that looks placed and is unbuildable, which is strictly worse than
// not placing it — the pool's "worse than no feature" property, one family over.
//
// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISM IS LOAD-BEARING, NOT INCIDENTAL
// ═══════════════════════════════════════════════════════════════════════════════
// C109 §4 rules `arrangement` DERIVED — re-derivable by re-running this solver — which
// is only sound because the solver is deterministic. There is no randomness, no `Date`,
// no iteration over an unordered map, and no floating-point accumulation across
// members: every member's offset is computed from a running cursor in a fixed order.
// `bathroomPodAssemblyIsDeterministic` is pinned by a test rather than asserted here.

import {
    BATHROOM_POD_CLEARANCES,
    DEFAULT_POD_TOILET_VARIANT,
    podGapBetween,
    podMemberConsumesRun,
    podShowerVariantFor,
} from './BathroomPodRules';
import {
    BATHROOM_POD_MEMBER_ORDER,
    type BathroomPod,
    type BathroomPodArrangement,
    type BathroomPodHandedness,
    type BathroomPodMember,
    type BathroomPodMemberKind,
    type BathroomPodRoom,
} from './BathroomPodTypes';
import { resolveFixtureFootprint, type FixtureFootprint } from './PlumbingSymbolGeometry';
import type { PlumbingFixtureType } from './PlumbingTypes';

/** Every member kind's `PlumbingFixtureType`. C109 R-2: a member is a real plumbing record. */
const FIXTURE_TYPE_OF: Readonly<Record<BathroomPodMemberKind, PlumbingFixtureType>> = Object.freeze({
    shower: 'shower',
    bath: 'bath',
    wc: 'toilet',
    basin: 'sink',
    accessory: 'accessory',
});

/** Human labels for the refusal sentence. One table, so every message agrees. */
const MEMBER_LABEL: Readonly<Record<BathroomPodMemberKind, string>> = Object.freeze({
    shower: 'shower',
    bath: 'bath',
    wc: 'WC',
    basin: 'basin',
    accessory: 'accessory',
});

/** What the caller asks the solver. */
export interface BathroomPodLayoutInput {
    readonly room: BathroomPodRoom;
    readonly handedness: BathroomPodHandedness;
    /** The members to place. Order is normalised to `BATHROOM_POD_MEMBER_ORDER`. */
    readonly members: readonly BathroomPodMemberKind[];
    /**
     * Pre-minted ids, one per member, in the SAME normalised order (CA-2 — `execute()`
     * runs again on REDO, so minting inside would give a different pod the second time).
     */
    readonly memberIds: readonly string[];
    /** Optional per-kind variant overrides. Unset resolves to the pod's documented default. */
    readonly variantOverrides?: Readonly<Partial<Record<BathroomPodMemberKind, string>>>;
}

/** The solver's answer. A refusal is a first-class result, never an exception. */
export type BathroomPodLayoutResult =
    | {
          readonly ok: true;
          readonly arrangement: BathroomPodArrangement;
          readonly members: readonly BathroomPodMember[];
      }
    | {
          readonly ok: false;
          /** The C16 CA-18 sentence — names the reason AND the route back to success. */
          readonly reason: string;
          /** Machine-readable, so a caller can branch without parsing prose. */
          readonly shortfall: {
              readonly axis: 'width' | 'depth';
              readonly requiredM: number;
              readonly availableM: number;
          };
      };

/** Round to millimetres for a message. Never for geometry. */
function m2(v: number): string {
    return v.toFixed(2);
}

/** The footprint of a member kind, from the family's tables. NEVER computed here. */
function footprintOf(
    kind: BathroomPodMemberKind,
    handedness: BathroomPodHandedness,
    overrides: Readonly<Partial<Record<BathroomPodMemberKind, string>>> | undefined,
): { footprint: FixtureFootprint; variant: string | undefined } {
    const variant = resolveVariant(kind, handedness, overrides);
    const fixtureType = FIXTURE_TYPE_OF[kind];
    // ⛔ ONE RESOLVER. `resolveFixtureFootprint` is what the plan symbol builder and the
    // elevation symbol builder both call, so the preview, the symbol and the mesh cannot
    // diverge (C109 R-6).
    const footprint = resolveFixtureFootprint({
        fixtureType,
        ...(kind === 'wc' ? { toiletVariant: variant as never } : {}),
        ...(kind === 'shower' ? { showerVariant: variant as never } : {}),
        ...(kind === 'accessory' ? { accessoryVariant: variant as never } : {}),
    } as never);
    return { footprint, variant };
}

/** The variant slug for a member kind: override -> pod default -> family default. */
function resolveVariant(
    kind: BathroomPodMemberKind,
    handedness: BathroomPodHandedness,
    overrides: Readonly<Partial<Record<BathroomPodMemberKind, string>>> | undefined,
): string | undefined {
    const override = overrides?.[kind];
    if (override !== undefined && override.length > 0) return override;
    if (kind === 'wc') return DEFAULT_POD_TOILET_VARIANT;
    // ⭐ The shower's hand is a FUNCTION of the pod's handedness, not a fixed slug —
    // see `podShowerVariantFor`'s docstring for the failure a fixed slug produces.
    if (kind === 'shower') return podShowerVariantFor(handedness);
    // `basin`, `bath` and `accessory` fall through to the family's own default, which
    // `resolveFixtureFootprint` applies. Returning a slug here would be this file
    // restating a default the family already owns.
    return undefined;
}

/** Normalise a requested member set into `BATHROOM_POD_MEMBER_ORDER`, de-duplicated. */
function normaliseMembers(requested: readonly BathroomPodMemberKind[]): BathroomPodMemberKind[] {
    const out: BathroomPodMemberKind[] = [];
    for (const kind of BATHROOM_POD_MEMBER_ORDER) {
        // `accessory` may repeat; every other kind may not (see `validateBathroomPod`).
        const n = requested.filter((k) => k === kind).length;
        if (kind === 'accessory') {
            for (let i = 0; i < n; i++) out.push(kind);
        } else if (n > 0) {
            out.push(kind);
        }
    }
    return out;
}

/**
 * Local (room) coordinates -> world, through the room's origin and plan rotation.
 *
 * ⭐ ONE TRANSFORM, ONE CALLER-VISIBLE PLACE. `BathroomPodMember.position` is WORLD
 * because a `PlumbingFixtureData` is world — but the SOLVER works entirely in local
 * space and applies this once at the end. Baking world coordinates into the solver
 * would mean rotating the room left every fixture behind, with nothing complaining
 * because both values would be individually valid (C104 R-16, one family over).
 */
function toWorld(
    room: BathroomPodRoom,
    localX: number,
    localZ: number,
): { x: number; y: number; z: number } {
    const cos = Math.cos(room.rotation);
    const sin = Math.sin(room.rotation);
    return {
        x: room.origin.x + localX * cos - localZ * sin,
        y: room.origin.y,
        z: room.origin.z + localX * sin + localZ * cos,
    };
}

/** The run (along-wall extent) a member set needs, including inter-member gaps. */
function requiredRun(
    kinds: readonly BathroomPodMemberKind[],
    fps: ReadonlyMap<number, FixtureFootprint>,
): number {
    let run = 0;
    let previous: BathroomPodMemberKind | null = null;
    for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i]!;
        if (!podMemberConsumesRun(kind)) continue;
        if (previous !== null) run += podGapBetween(previous, kind);
        run += fps.get(i)!.width;
        previous = kind;
    }
    return run;
}

/** The deepest (depth + activity space) requirement across a member set. */
function requiredDepth(
    kinds: readonly BathroomPodMemberKind[],
    fps: ReadonlyMap<number, FixtureFootprint>,
): { depth: number; kind: BathroomPodMemberKind } {
    let worst = 0;
    let worstKind: BathroomPodMemberKind = kinds[0] ?? 'wc';
    for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i]!;
        if (!podMemberConsumesRun(kind)) continue;
        const need = fps.get(i)!.length + BATHROOM_POD_CLEARANCES[kind].clearFront;
        if (need > worst) {
            worst = need;
            worstKind = kind;
        }
    }
    return { depth: worst, kind: worstKind };
}

/** The itemised arithmetic behind a width refusal, e.g. "shower 1.00 + 0.05 + WC 0.42". */
function runBreakdown(
    kinds: readonly BathroomPodMemberKind[],
    fps: ReadonlyMap<number, FixtureFootprint>,
): string {
    const parts: string[] = [];
    let previous: BathroomPodMemberKind | null = null;
    for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i]!;
        if (!podMemberConsumesRun(kind)) continue;
        if (previous !== null) {
            const gap = podGapBetween(previous, kind);
            if (gap > 0) parts.push(m2(gap));
        }
        parts.push(`${MEMBER_LABEL[kind]} ${m2(fps.get(i)!.width)}`);
        previous = kind;
    }
    return parts.join(' + ');
}

/**
 * SOLVE THE POD.
 *
 * Rule A — SINGLE-WALL: every member on the primary wall, in
 * `BATHROOM_POD_MEMBER_ORDER` (reversed for `handedness: 'right'`).
 * Rule B — L-SHAPED: the shower (or bath) moves to a return wall; the rest stay.
 * Rule C — REFUSE, naming both numbers.
 *
 * ⭐ RULE A IS TRIED FIRST AND RULE B IS THE FALLBACK, NEVER THE REVERSE (C109 §5.3).
 * A single-wall pod puts every drain on ONE wall, which is what makes a bathroom cheap
 * to build; an L-shaped pod needs drainage on two. Preferring the L-shape "because it
 * fits more" would silently choose the more expensive building every time both fit.
 */
export function solveBathroomPodLayout(input: BathroomPodLayoutInput): BathroomPodLayoutResult {
    const { room, handedness } = input;
    const kinds = normaliseMembers(input.members);

    if (kinds.length === 0) {
        return {
            ok: false,
            reason:
                'A bathroom pod must contain at least one fixture. Choose a WC, a basin ' +
                'or a shower and place it again.',
            shortfall: { axis: 'width', requiredM: 0, availableM: room.clearWidth },
        };
    }
    if (input.memberIds.length !== kinds.length) {
        return {
            ok: false,
            reason:
                `This pod resolves to ${kinds.length} member(s) but was given ` +
                `${input.memberIds.length} pre-minted id(s). Every member must have an id ` +
                'minted once by the tool, so a redo re-creates the same pod.',
            shortfall: { axis: 'width', requiredM: 0, availableM: room.clearWidth },
        };
    }

    // Footprints, resolved ONCE per member index and reused by every calculation below,
    // so the refusal message and the placement can never quote different numbers.
    const fps = new Map<number, FixtureFootprint>();
    const variants = new Map<number, string | undefined>();
    for (let i = 0; i < kinds.length; i++) {
        const { footprint, variant } = footprintOf(kinds[i]!, handedness, input.variantOverrides);
        fps.set(i, footprint);
        variants.set(i, variant);
    }

    // ── Rule A — SINGLE-WALL ──────────────────────────────────────────────────
    const runA = requiredRun(kinds, fps);
    const depthA = requiredDepth(kinds, fps);
    if (runA <= room.clearWidth && depthA.depth <= room.clearDepth) {
        return {
            ok: true,
            arrangement: 'single-wall',
            members: _place(kinds, fps, variants, input.memberIds, room, handedness, null),
        };
    }

    // ── Rule B — L-SHAPED ─────────────────────────────────────────────────────
    //
    // ⭐⭐ A FINDING FROM BUILDING THIS, AND IT REFUTES THE OBVIOUS READING OF
    // "L-SHAPED IS THE FALLBACK FOR A NARROW ROOM". Turning the wet member onto a
    // return wall frees primary-wall run ONLY when its DEPTH is smaller than its WIDTH
    // plus its gap — i.e. only when it is wider than it is deep. For the pod's default
    // walk-in shower (1.00 wide x 1.20 deep) it is not:
    //
    //     single-wall bite  =  1.00 (width) + 0.10 (gap)  =  1.10
    //     return-wall bite  =  1.20 (depth)               =  1.20   <- WORSE
    //
    // so the `runB <= usableWidth` test below correctly DECLINES Rule B for the default
    // member set and the pod refuses instead. ⛔ THAT IS NOT A HOLE IN RULE B. A
    // "fallback" that made this case fit would have to overlap the shower with the WC,
    // which C109 R-3 forbids outright. Rule B earns its place on the BATH (1.70 wide x
    // 0.75 deep), where the same arithmetic frees a full metre — which is what an
    // L-shaped bathroom actually is.
    //
    // ⚠ The temptation, recorded so it is not "fixed" later: re-orienting the wet member
    // on the return wall so its SMALLER dimension runs along X. Do not. Its back must be
    // against the wall it is hosted on; rotating it to save run would put a shower's
    // open side against the return wall and its glass screen against nothing.
    const wetIndex = kinds.findIndex((k) => k === 'shower' || k === 'bath');
    if (wetIndex >= 0) {
        const rest = kinds.filter((_, i) => i !== wetIndex);
        const restFps = new Map<number, FixtureFootprint>();
        const restVariants = new Map<number, string | undefined>();
        const restIds: string[] = [];
        let j = 0;
        for (let i = 0; i < kinds.length; i++) {
            if (i === wetIndex) continue;
            restFps.set(j, fps.get(i)!);
            restVariants.set(j, variants.get(i));
            restIds.push(input.memberIds[i]!);
            j++;
        }
        const wetFp = fps.get(wetIndex)!;
        // The return wall eats `wetFp.length` of the primary wall's usable run — the
        // shower's DEPTH becomes a width the rest of the pod no longer has.
        const usableWidth = room.clearWidth - wetFp.length;
        const runB = requiredRun(rest, restFps);
        const depthB = requiredDepth(rest, restFps);
        const wetDepthOnReturn = wetFp.width + BATHROOM_POD_CLEARANCES[kinds[wetIndex]!].clearFront;
        if (
            usableWidth > 0 &&
            runB <= usableWidth &&
            depthB.depth <= room.clearDepth &&
            wetDepthOnReturn <= room.clearDepth
        ) {
            return {
                ok: true,
                arrangement: 'l-shaped',
                members: _place(kinds, fps, variants, input.memberIds, room, handedness, wetIndex),
            };
        }
    }

    // ── Rule C — REFUSE, WITH BOTH NUMBERS ────────────────────────────────────
    // ⭐ THE WIDTH ARM IS REPORTED FIRST WHEN BOTH FAIL, because widening a wall is the
    // change an architect can most often make. Reporting only "it does not fit" is the
    // refusal C74 exists to forbid: it is unarguable, so it cannot be acted on.
    if (runA > room.clearWidth) {
        const hint =
            kinds.includes('shower') || kinds.includes('bath')
                ? ` Widen the room to ${m2(runA)} m, or remove the ${
                      kinds.includes('shower') ? 'shower' : 'bath'
                  } from the module.`
                : ` Widen the room to ${m2(runA)} m.`;
        return {
            ok: false,
            reason:
                `This bathroom pod needs ${m2(runA)} m of clear wall ` +
                `(${runBreakdown(kinds, fps)}, including clearances); ` +
                `this room offers ${m2(room.clearWidth)} m.${hint}`,
            shortfall: { axis: 'width', requiredM: runA, availableM: room.clearWidth },
        };
    }
    const deepest = depthA;
    const clearFront = BATHROOM_POD_CLEARANCES[deepest.kind].clearFront;
    const body = fps.get(kinds.indexOf(deepest.kind))?.length ?? deepest.depth - clearFront;
    return {
        ok: false,
        reason:
            `This bathroom pod needs ${m2(deepest.depth)} m of clear depth ` +
            `(${MEMBER_LABEL[deepest.kind]} ${m2(body)} + ${m2(clearFront)} activity space); ` +
            `this room offers ${m2(room.clearDepth)} m. ` +
            `Deepen the room to ${m2(deepest.depth)} m` +
            (deepest.kind === 'wc' ? ', or choose a wall-hung WC (0.58 m deep).' : '.'),
        shortfall: { axis: 'depth', requiredM: deepest.depth, availableM: room.clearDepth },
    };
}

/**
 * Lay the members out and convert to world.
 *
 * `wetIndex === null` is Rule A; otherwise that member goes on a RETURN wall and the
 * rest share the primary wall.
 */
function _place(
    kinds: readonly BathroomPodMemberKind[],
    fps: ReadonlyMap<number, FixtureFootprint>,
    variants: ReadonlyMap<number, string | undefined>,
    ids: readonly string[],
    room: BathroomPodRoom,
    handedness: BathroomPodHandedness,
    wetIndex: number | null,
): BathroomPodMember[] {
    const out: BathroomPodMember[] = [];
    // `handedness: 'right'` mirrors the run about the room's centreline, so the shower
    // takes the RIGHT end. It is a reflection of the CURSOR, not a re-ordering of the
    // list — re-ordering would also change which fixture neighbours which, and the
    // ordering argument in `BATHROOM_POD_MEMBER_ORDER` is about neighbours.
    const mirror = handedness === 'right';

    // ── The return-wall member (Rule B only) ──────────────────────────────────
    let primaryStart = 0;
    if (wetIndex !== null) {
        const fp = fps.get(wetIndex)!;
        // On a return wall the fixture's WIDTH runs along local Z and its DEPTH along
        // local X. Rotated a quarter turn; its back faces the return wall.
        // §PLUMBFRAME (L-11490) — THE ANCHOR IS THE WALL-CONTACT EDGE, NOT THE CENTRE.
        // `PlumbingFixtureFrame.ts` is the one declaration: origin = the midpoint of the
        // contact edge, local +Z into the room. On a return wall the fixture's own +Z
        // runs along room-local ±X, so its origin sits ON that wall (localX 0 or
        // clearWidth) and is centred along its own width, which runs along room-local Z
        // — hence `localZ = fp.width / 2`, which was already right.
        const localX = mirror ? room.clearWidth : 0;
        const localZ = fp.width / 2;
        out.push({
            id: ids[wetIndex]!,
            kind: kinds[wetIndex]!,
            fixtureType: FIXTURE_TYPE_OF[kinds[wetIndex]!] as BathroomPodMember['fixtureType'],
            ...(variants.get(wetIndex) !== undefined ? { variant: variants.get(wetIndex)! } : {}),
            position: toWorld(room, localX, localZ),
            rotationY: room.rotation + (mirror ? -Math.PI / 2 : Math.PI / 2),
            footprint: { width: fp.width, length: fp.length, height: fp.height },
            wall: mirror ? 'right-return' : 'left-return',
        });
        primaryStart = mirror ? 0 : fp.length;
    }

    // ── The primary-wall run ──────────────────────────────────────────────────
    let cursor = primaryStart;
    let previous: BathroomPodMemberKind | null = null;
    for (let i = 0; i < kinds.length; i++) {
        if (i === wetIndex) continue;
        const kind = kinds[i]!;
        const fp = fps.get(i)!;
        if (!podMemberConsumesRun(kind)) {
            // A wall-mounted accessory consumes no run. It is hung at the FAR end of the
            // primary wall from the shower, where a towel is reachable and stays dry.
            const localX = mirror ? fp.width / 2 : room.clearWidth - fp.width / 2;
            out.push({
                id: ids[i]!,
                kind,
                fixtureType: FIXTURE_TYPE_OF[kind] as BathroomPodMember['fixtureType'],
                ...(variants.get(i) !== undefined ? { variant: variants.get(i)! } : {}),
                // §PLUMBFRAME (L-11490) — the CONTACT EDGE, on the wall (local Z = 0).
                position: toWorld(room, localX, 0),
                rotationY: room.rotation,
                footprint: { width: fp.width, length: fp.length, height: fp.height },
                wall: 'primary',
            });
            continue;
        }
        if (previous !== null) cursor += podGapBetween(previous, kind);
        const centreLocalX = cursor + fp.width / 2;
        const localX = mirror ? room.clearWidth - centreLocalX : centreLocalX;
        out.push({
            id: ids[i]!,
            kind,
            fixtureType: FIXTURE_TYPE_OF[kind] as BathroomPodMember['fixtureType'],
            ...(variants.get(i) !== undefined ? { variant: variants.get(i)! } : {}),
            // §PLUMBFRAME (founder, 2026-08-26 · L-11490) — THE ANCHOR IS THE
            // WALL-CONTACT EDGE, AND THIS LINE USED TO EMIT THE CENTRE.
            //
            // ⛔ It read `toWorld(room, localX, fp.length / 2)` with the comment *"The
            // fixture's BACK sits on the primary wall (local Z = 0), so its centre is
            // half its depth into the room."* The PREMISE was right and the OUTPUT was
            // the wrong point: every consumer of a `PlumbingFixtureData` — the mesh, the
            // plan symbol, the elevation symbol — reads `position` as the midpoint of
            // the CONTACT EDGE and builds the body over z ∈ [0, length] from there
            // (`PlumbingFixtureFrame.ts`). Emitting the centre pushed every pod member
            // half its own depth further into the room, which is the founder's
            // straddling shower plate at pod scale.
            //
            // ⚠ THE REFUSAL ARITHMETIC IS UNCHANGED, and that is worth stating because
            // it is the obvious thing to fear: `requiredRun` and `requiredDepth` are
            // functions of WIDTHS and DEPTHS, not of where a member's origin sits. The
            // 2.27 m width refusal and the depth refusal quote exactly the same numbers
            // as before — D-3 and D-6 in `bathroomPodLayout.test.ts` pin them.
            position: toWorld(room, localX, 0),
            rotationY: room.rotation,
            footprint: { width: fp.width, length: fp.length, height: fp.height },
            wall: 'primary',
        });
        cursor += fp.width;
        previous = kind;
    }

    // Re-sort into `BATHROOM_POD_MEMBER_ORDER` so `members` and the Tab cycle agree, and
    // so a Rule-B pod's return-wall member is not always first.
    out.sort(
        (a, b) =>
            BATHROOM_POD_MEMBER_ORDER.indexOf(a.kind) - BATHROOM_POD_MEMBER_ORDER.indexOf(b.kind),
    );
    return out;
}

/**
 * Build the whole pod record from a solved layout. The ONE producer of a `BathroomPod`.
 *
 * Returns the refusal unchanged when the solver refuses, so a caller has exactly one
 * result shape to branch on and cannot accidentally build a pod from a failed solve.
 */
export function buildBathroomPod(
    id: string,
    levelId: string,
    input: BathroomPodLayoutInput,
    extras?: { readonly mark?: string; readonly materialId?: string },
): { readonly ok: true; readonly pod: BathroomPod } | (BathroomPodLayoutResult & { ok: false }) {
    const solved = solveBathroomPodLayout(input);
    if (!solved.ok) return solved;
    return {
        ok: true,
        pod: {
            id,
            type: 'bathroomPod',
            levelId,
            room: input.room,
            handedness: input.handedness,
            members: solved.members,
            arrangement: solved.arrangement,
            ...(extras?.mark !== undefined ? { mark: extras.mark } : {}),
            ...(extras?.materialId !== undefined ? { materialId: extras.materialId } : {}),
        },
    };
}

/**
 * How many members a requested set resolves to — what the TOOL needs in order to mint
 * exactly the right number of ids BEFORE it calls the solver (CA-2).
 *
 * ⭐ EXPORTED SO THE TOOL DOES NOT RE-DERIVE IT. `LiftPlanToolHandler` asks the geometry
 * package for `ENCLOSURE_SIDE_COUNT` and `LIFT_PART_CYCLE_ORDER.length` rather than
 * typing `4` and `5`, for exactly this reason: a hand-typed count is a second statement
 * of a number the solver already owns.
 */
export function bathroomPodMemberCount(members: readonly BathroomPodMemberKind[]): number {
    return normaliseMembers(members).length;
}

/** The normalised member order for a requested set — the id-minting order (CA-2). */
export function bathroomPodMemberOrder(
    members: readonly BathroomPodMemberKind[],
): readonly BathroomPodMemberKind[] {
    return normaliseMembers(members);
}
