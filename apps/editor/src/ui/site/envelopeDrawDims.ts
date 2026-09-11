// §ENVELOPE-DRAW-LIVE-DIMS (L-13308, 2026-09-11) — THE LIVE DIMENSIONS OF THE ENVELOPE PERIMETER
// DRAW, decided ONCE, above both site adapters.
//
// The founder: *"while defining the points that define the profile of the massing envelope - i want
// to see the preview dims - as we have while creating slabs + walls on pryzm views"*.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FORMATTER IS REUSED, NOT RE-TYPED — AND WHICH ONE WAS A MEASUREMENT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The slab tool and the wall tool on the PRYZM views share ONE live-dimension widget:
// `@pryzm/geometry-wall` `DimensionPreview` (`SlabTool.ts` imports it from there), whose label is
// `` `${distance.toFixed(3)} m` ``. That is byte-for-byte `formatDimension(d, 'm')` — the canonical
// `@pryzm/core-app-model` annotation formatter the linear-dimension tool already calls. So the chip
// text here is `formatDimension(lengthM, 'm')` and nothing else; `envelopeDrawDims.spec.ts` pins the
// parity against the DimensionPreview source so a change to either end goes red.
//
// ⚠ 'm', NOT 'mm', AND THAT IS A CHOICE, STATED. The wall's PLAN handler alone prints whole
// millimetres (`WallPlanToolHandler`, `${lenMm} mm` — which is `formatDimension(d, 'mm')`). The unit
// the slab AND wall tools share is metres to the millimetre, which also reads at parcel scale
// ("23.450 m", not "23450 mm"), and one unit on BOTH site views of one gesture. Switching is one
// constant, `ENVELOPE_DRAW_DIM_UNIT`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS LIVES ABOVE THE PORT AND NOT IN EACH ADAPTER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Which segments carry a chip depends on the MODE: a curved run is 16 tessellated chords
// (`BoundaryPathAuthor`), and 16 chips on one arc is noise, not a dimension — the wall tool labels
// an arc ONCE (`~… (arc)`). A circle is a many-gon, and its dimension is the RADIUS. Only the
// gesture driver knows the mode and which committed vertices came from one arc click; an adapter
// handed `committed`/`tail` cannot tell. So the chips are computed here, once, and both site
// adapters paint the same list — the plan §7 rule 4 split this port was built on.
//
// PURE. No DOM, no THREE, no Cesium, no MapLibre, no store. Called on every pointer move, so it
// carries no span of its own (the hot-path posture `drawPreview` already has); the gesture driver
// that calls it is spanned.

import { formatDimension } from '@pryzm/core-app-model';
import type { BoundaryLoopMode } from '@pryzm/geometry-slab/boundary-loops';
import type { EnvelopeDrawDimLabel, SceneXZPoint } from './envelopeDrawSurface';

/** The ONE unit every envelope-draw chip is printed in. See the header for why it is metres. */
export const ENVELOPE_DRAW_DIM_UNIT = 'm' as const;

/**
 * Below this a chip is hidden — `DimensionPreview.update`'s own `distance < 0.01` threshold, so a
 * cursor parked on the last corner shows no "0.000 m" chip on either family.
 */
export const ENVELOPE_DRAW_DIM_MIN_M = 0.01;

/** THE formatter. `formatDimension(lengthM, 'm')`, optionally with the arc / radius affixes. */
export function formatEnvelopeDrawLength(lengthM: number, prefix?: string, suffix?: string): string {
    return formatDimension(lengthM, ENVELOPE_DRAW_DIM_UNIT, prefix, suffix);
}

/**
 * One CURVED run inside the committed vertices: `start` is the vertex the arc left from, `end` the
 * last tessellated vertex it appended. Recorded by the gesture driver when `BoundaryPathAuthor.click`
 * answers `'arc-segment'`, and trimmed by it on Backspace (which pops one chord at a time).
 */
export interface EnvelopeArcRun {
    readonly start: number;
    readonly end: number;
}

export interface PathPreviewDimsInput {
    /** The placed vertices, oldest first — `BoundaryPathAuthor.points`. */
    readonly committed: readonly SceneXZPoint[];
    /** The rubber-band tail — `BoundaryPathAuthor.previewTail(mode, cursor)`. */
    readonly tail: readonly SceneXZPoint[];
    /** The SAME flag the preview line is drawn with, so the closing chip and the closing edge agree. */
    readonly closeRing: boolean;
    /** Arc runs inside `committed`. Omitted ⇒ every committed edge is straight. */
    readonly arcRuns?: readonly EnvelopeArcRun[];
    /** True while a curved midpoint is pending, i.e. the tail is a tessellated arc to the cursor. */
    readonly tailIsArc?: boolean;
}

const mid = (a: SceneXZPoint, b: SceneXZPoint): SceneXZPoint => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
const dist = (a: SceneXZPoint, b: SceneXZPoint): number => Math.hypot(b.x - a.x, b.z - a.z);

function pushStraight(
    out: EnvelopeDrawDimLabel[],
    a: SceneXZPoint,
    b: SceneXZPoint,
    kind: EnvelopeDrawDimLabel['kind'],
): void {
    const lengthM = dist(a, b);
    if (!Number.isFinite(lengthM) || lengthM < ENVELOPE_DRAW_DIM_MIN_M) return;
    out.push({ at: mid(a, b), text: formatEnvelopeDrawLength(lengthM), lengthM, kind });
}

/**
 * ONE chip for one arc: the CHORD, marked `~… (arc)` exactly as the wall tool marks its arc label,
 * seated on the arc's middle sample so it reads as belonging to the curve rather than to its chord.
 */
function pushArc(
    out: EnvelopeDrawDimLabel[],
    from: SceneXZPoint,
    samples: readonly SceneXZPoint[],
    kind: EnvelopeDrawDimLabel['kind'],
): void {
    const to = samples[samples.length - 1];
    if (to === undefined) return;
    const lengthM = dist(from, to);
    if (!Number.isFinite(lengthM) || lengthM < ENVELOPE_DRAW_DIM_MIN_M) return;
    const at = samples[Math.floor((samples.length - 1) / 2)] ?? mid(from, to);
    out.push({ at: { x: at.x, z: at.z }, text: formatEnvelopeDrawLength(lengthM, '~', ' (arc)'), lengthM, kind });
}

/** Index the usable runs by their start; a run the committed list no longer reaches is dropped. */
function runsByStart(runs: readonly EnvelopeArcRun[], n: number): Map<number, EnvelopeArcRun> {
    const out = new Map<number, EnvelopeArcRun>();
    for (const r of runs) {
        if (!Number.isInteger(r.start) || !Number.isInteger(r.end)) continue;
        if (r.start < 0 || r.end >= n || r.end <= r.start) continue;
        if (!out.has(r.start)) out.set(r.start, r);
    }
    return out;
}

/**
 * The chips for a PATH stroke (linear / ortho / curved — perimeter or spine):
 *   · one `placed` chip per straight edge between placed corners, ONE per arc run;
 *   · one `live` chip on the rubber-band (last corner → cursor), `~… (arc)` while an arc is pending;
 *   · one `closing` chip on the implied last → first edge, iff `closeRing` — the same flag the
 *     preview line is drawn with, so a spine (never closed) never gets one.
 */
export function pathPreviewDims(input: PathPreviewDimsInput): EnvelopeDrawDimLabel[] {
    const { committed, tail, closeRing } = input;
    const out: EnvelopeDrawDimLabel[] = [];
    const n = committed.length;
    const runs = runsByStart(input.arcRuns ?? [], n);

    for (let i = 0; i < n - 1;) {
        const run = runs.get(i);
        if (run !== undefined) {
            pushArc(out, committed[run.start]!, committed.slice(run.start + 1, run.end + 1), 'placed');
            i = run.end;
            continue;
        }
        pushStraight(out, committed[i]!, committed[i + 1]!, 'placed');
        i += 1;
    }

    const end = tail.length > 0 ? tail[tail.length - 1]! : null;
    if (n >= 1 && end !== null) {
        if (input.tailIsArc === true && tail.length >= 2) pushArc(out, committed[n - 1]!, tail, 'live');
        else pushStraight(out, committed[n - 1]!, end, 'live');
    }

    if (closeRing && n >= 1) {
        const from = end ?? committed[n - 1]!;
        if (n + (end !== null ? 1 : 0) >= 3) pushStraight(out, from, committed[0]!, 'closing');
    }
    return out;
}

/**
 * The chips for a closed LOOP being dragged out (second click pending):
 *   · rectangle → its width and its depth (two chips; the opposite edges are the same numbers);
 *   · circle    → the radius, `R …`, on the centre → rim line;
 *   · ellipse   → the two semi-axes, `R …`, each on its own axis.
 * `ring` is the generator's output for the same two points — an empty ring (below the loop's
 * minimum extent, which the generator refuses) yields no chips rather than a number for a shape
 * that will not be created.
 */
export function loopPreviewDims(
    mode: BoundaryLoopMode,
    first: SceneXZPoint,
    cursor: SceneXZPoint,
    ring: readonly SceneXZPoint[],
): EnvelopeDrawDimLabel[] {
    if (ring.length < 3) return [];
    const out: EnvelopeDrawDimLabel[] = [];
    if (mode === 'rectangular') {
        // `rectangularLoopVertices` → [(x0,z0), (x1,z0), (x1,z1), (x0,z1)]: edge 0→1 is the width,
        // edge 1→2 the depth.
        pushStraight(out, ring[0]!, ring[1]!, 'live');
        pushStraight(out, ring[1]!, ring[2]!, 'live');
        return out;
    }
    const radius = (a: SceneXZPoint, b: SceneXZPoint): void => {
        const lengthM = dist(a, b);
        if (!Number.isFinite(lengthM) || lengthM < ENVELOPE_DRAW_DIM_MIN_M) return;
        out.push({ at: mid(a, b), text: formatEnvelopeDrawLength(lengthM, 'R '), lengthM, kind: 'live' });
    };
    if (mode === 'circular') {
        radius(first, cursor);
        return out;
    }
    // elliptical — `ellipticalLoopVertices`: semi-axes |dx| and |dz| about the centre.
    radius(first, { x: cursor.x, z: first.z });
    radius(first, { x: first.x, z: cursor.z });
    return out;
}
