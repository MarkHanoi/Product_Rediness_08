/**
 * OpeningProfile — §OPENING-PROFILE (L-1200) — **THE ONE PRODUCER OF AN OPENING'S OUTLINE.**
 *
 * The founder asked for **round windows** and, in the same breath, for **doors with a curved
 * top**, chosen *"from the same place"*. Those are ONE problem: **a non-rectangular void in a
 * wall**. This module is that problem's single answer.
 *
 * ── WHAT THIS MODULE IS, AND WHY IT IS THE ONLY ONE ─────────────────────────────────────────
 * An opening's profile is a **2-D outline in wall-local `(x, y)`** — `x` along the wall from
 * `baseLine[0]`, `y` measured UP FROM THE WALL BASE (the same frame `normaliseOpeningRects` and
 * `WallHoleBodyBuilder` already use, where an opening spans `[sillHeight, sillHeight + height]`).
 *
 * **C86 §10.1 PR-1 is binding: every wall-body arm consumes the outline THIS function returns.
 * ⛔ No arm may re-derive an arc.** That rule is written before the second derivation exists
 * rather than after, because C86 §9 records this family already making the opposite mistake, and
 * because `CurvedLeafGeometry` exists precisely to stop a door and a window disagreeing about one
 * curve. Two arms that each sampled their own circle would disagree in the 4th decimal and the
 * frame would not fit the hole it was cut from.
 *
 * ── THIS FILE IS DELIBERATELY THREE-FREE ────────────────────────────────────────────────────
 * It takes plain numbers and returns plain numbers. That is what lets the outline be unit-tested
 * without a renderer, hashed for cache invalidation, and consumed identically by the
 * `THREE.Shape` arm, the gasket arm and (one day) the kernel producer. The THREE-side helper
 * lives in `OpeningProfileGasket.ts`.
 *
 * ── THE FIVE-ARM RULING THIS SERVES (C86 §10.1, measured 2026-08-19) ────────────────────────
 *   A  plain straight, no mitre + no rake cap-drift → `THREE.Shape` + `Path` holes  ✅ exact
 *   B  plain straight, mitred / lofted end          → abutting `BoxGeometry`        ✅ via gasket
 *   C  layered straight                             → break-grid rasteriser         ✅ via gasket
 *   D  curved wall                                  → radial bands in ARC-LENGTH    ⛔ REFUSES
 *   E  instanced                                    → unit box × T·R·S              ⛔ excluded
 *   F  single-volume CSG                            → PARKED, default OFF           — unavailable
 *
 * ⛔ **`rectangular` MUST stay byte-identical on every arm** (PR-2). `openingOutline` reports
 * `isRectangular`, and every consumer MUST take its pre-existing path when that is true. The
 * gasket for a rectangle is empty and must never be emitted.
 */

// §OUTLINE80 — the `'custom'` kind's companion carrier, validator and presets. A sibling module,
// not inlined here: `CustomOutline.ts` needs `@pryzm/geometry-kernel` (the fold detector) and
// `@pryzm/geometry-slab` (the arc tessellator) for the preset rings, and this file states its own
// header promise to stay "deliberately THREE-free" — importing them HERE would not break that,
// but keeping the ring/validator/presets together in one file is what lets a reader find "the
// custom kind's whole story" in one place rather than three.
import {
    validateCustomOutline,
    normaliseCustomOutlineWinding,
    type CustomOutline,
    type CustomOutlineVertex,
} from './CustomOutline';
export type {
    CustomOutline,
    CustomOutlineVertex,
    CustomOutlineRefusal,
    CustomOutlineRefusalCode,
    OpeningOutlinePresetId,
} from './CustomOutline';
export {
    validateCustomOutline,
    normaliseCustomOutlineWinding,
    openingOutlinePreset,
    OPENING_OUTLINE_PRESET_IDS,
    OPENING_OUTLINE_PRESET_LABELS,
    CUSTOM_OUTLINE_BBOX_TOL,
    CUSTOM_OUTLINE_MIN_AREA_FRACTION,
} from './CustomOutline';

/**
 * The void-shape axis. **ORTHOGONAL to the leaf-count axis** (`'single' | 'double'`), and C86 §9
 * WO-Voc-4 forbids flattening the two into one list: doing so makes `double × round-arch` — an
 * ordinary door — unexpressible.
 *
 * §OUTLINE80 (SPEC-WINDOW-CUSTOM-OUTLINE D1) — `'custom'` is the fifth kind: a free-form ring
 * authored in elevation, carried on the companion field {@link CustomOutline} rather than derived
 * from `width`/`height` like the other four. This amends C86 §10.1 PR-7 from "one field" to "one
 * AXIS: the kind, plus its carrier, which no other kind may populate."
 */
export type OpeningProfileKind =
    | 'rectangular'
    | 'round-arch'
    | 'segmental-arch'
    | 'circular'
    | 'custom';

export const OPENING_PROFILE_KINDS: readonly OpeningProfileKind[] = [
    'rectangular',
    'round-arch',
    'segmental-arch',
    'circular',
    'custom',
] as const;

/**
 * ⭐ ABSENT MEANS RECTANGULAR, AND THAT IS LOAD-BEARING. Every opening persisted before L-1200
 * carries no profile at all, and every one of them is a rectangle. Defaulting here — rather than
 * requiring a migration — is what makes this field additive: an old project loads byte-identical.
 */
export const DEFAULT_OPENING_PROFILE: OpeningProfileKind = 'rectangular';

export function isOpeningProfileKind(v: unknown): v is OpeningProfileKind {
    return typeof v === 'string' && (OPENING_PROFILE_KINDS as readonly string[]).includes(v);
}

/**
 * Absent / unknown ⇒ `'rectangular'`.
 *
 * ⚠ An UNKNOWN string resolves to rectangular rather than throwing, because this runs on the LOAD
 * path where a value written by a newer build must not brick the project. That is a deliberate
 * asymmetry with `openingProfileRefusal`, which is the AUTHORING gate and does reject.
 */
export function resolveOpeningProfile(v: unknown): OpeningProfileKind {
    return isOpeningProfileKind(v) ? v : DEFAULT_OPENING_PROFILE;
}

/** True for the profile every pre-L-1200 opening has. Consumers MUST short-circuit on this. */
export function isRectangularProfile(v: unknown): boolean {
    return resolveOpeningProfile(v) === 'rectangular';
}

/**
 * §OPENING-PROFILE-LABELS (L-1250) — the ONE set of user-facing names for the profile axis.
 *
 * ⛔ Declared here, beside the union, so the mode bar, the tool HUD, the properties panel and the
 * confirm card cannot disagree about what a profile is CALLED. A vocabulary spelled in four UI
 * files is four vocabularies — the C84 EI-9 defect, and C86 §9 already records this family
 * making it once (`doorType`/`windowType`).
 */
export const OPENING_PROFILE_LABELS: Readonly<Record<OpeningProfileKind, string>> = Object.freeze({
    'rectangular':     'Rectangular',
    'round-arch':      'Arched',
    'segmental-arch':  'Segmental',
    'circular':        'Circular',
    'custom':          'Custom',
});

/**
 * §OPENING-PROFILE-BY-FAMILY (L-1251) — which profiles a given opening family may offer.
 *
 * ⛔ **A DOOR MAY NOT BE CIRCULAR, AND THIS IS GEOMETRY, NOT TASTE.** A door is a FLOOR-REACHING
 * opening: `sillHeight` is 0 and `WallHoleBodyBuilder.normaliseWallHoles` classifies it as a
 * NOTCH in the wall's outer profile rather than a closed hole. A circle has no feet on the floor
 * to notch between — its outline starts at the springing, not at a jamb foot — so the notch walk
 * has nothing coherent to traverse. Offering `Circular` on the door bar would be C84 **EI-3** in
 * its purest form: a control offering something the pipeline cannot make good.
 *
 * ⭐ DECLARED HERE, BESIDE THE UNION, so the door mode bar, the window mode bar, the properties
 * panel and any future validator cannot disagree about what each family may hold. A per-surface
 * list would be four lists.
 *
 * §OUTLINE80 (D12) — `'custom'` is likewise NOT offered for a door: a door is a floor-reaching
 * NOTCH (`WallHoleBodyBuilder.normaliseWallHoles` classifies it by `sillHeight`, not by profile),
 * and `notchWalk` assumes two feet at the floor a free-form ring is not guaranteed to have. A
 * WINDOW may be `'custom'` — it reaches this function through `OPENING_PROFILE_KINDS`, which now
 * carries the fifth kind, so no second list needed to change for it to appear here.
 */
export function openingProfilesFor(family: 'door' | 'window'): readonly OpeningProfileKind[] {
    return family === 'door'
        ? (['rectangular', 'round-arch', 'segmental-arch'] as const)
        : OPENING_PROFILE_KINDS;
}

/**
 * The next profile in the cycle for a given family — what the `A` key advances to.
 *
 * Family-aware so the door bar cycles through THREE and the window bar through four; a shared
 * cycler that stepped onto a value the family cannot hold would hand the user an unbuildable
 * state by keyboard while the pills refused it by mouse.
 */
export function nextOpeningProfileFor(
    family: 'door' | 'window',
    current: unknown,
): OpeningProfileKind {
    // §OUTLINE80 (D7) — `'custom'` needs an AUTHORED RING; a keyboard cycle must always land on a
    // value it can build with no further input, so `'custom'` is excluded from the cycle even on
    // a window, where it is otherwise a legal value. Reaching `'custom'` is a TYPE-EDITOR /
    // preset act, never a keypress.
    // ⚠ Widened explicitly: TS infers an exclude-type predicate from `k !== 'custom'`, which
    // would otherwise narrow `list` to the 4-member union and make `cur` (still 5-member) fail
    // `indexOf`'s type check below.
    const list: readonly OpeningProfileKind[] = openingProfilesFor(family).filter((k) => k !== 'custom');
    const cur = resolveOpeningProfile(current);
    const i = list.indexOf(cur);
    // An out-of-family value (a door somehow holding `circular`) restarts the cycle rather than
    // throwing: the user pressing a key must always end somewhere buildable.
    return i < 0 ? list[0]! : list[(i + 1) % list.length]!;
}

/**
 * The next profile in the cycle — what the `A` key advances to.
 *
 * ⭐ ONE CYCLING KEY, NOT FOUR NEW LETTERS, and that is a measurement not a preference: `S`
 * already means six different things across the shipped mode bars (By Slab / Single / Mono-pitch /
 * Scale), and `R`, `O`, `P`, `C` are taken. Minting four more contested letters would rebuild the
 * collision the founder already hit once when he pressed `S` expecting By-Slab and got Single.
 * `A` (for *Arch*) was measured free and cycles the whole axis; the pills stay individually
 * clickable for anyone who would rather point at the one they want.
 */
// §OUTLINE80 (D7) — the family-agnostic cycle excludes `'custom'` for the identical reason
// `nextOpeningProfileFor` does: a keyboard cycle must always land on something buildable with no
// further input.
const CYCLABLE_OPENING_PROFILE_KINDS: readonly OpeningProfileKind[] =
    OPENING_PROFILE_KINDS.filter((k) => k !== 'custom');

export function nextOpeningProfile(current: unknown): OpeningProfileKind {
    const i = CYCLABLE_OPENING_PROFILE_KINDS.indexOf(resolveOpeningProfile(current));
    return CYCLABLE_OPENING_PROFILE_KINDS[(i + 1) % CYCLABLE_OPENING_PROFILE_KINDS.length]!;
}

// ── Tessellation ────────────────────────────────────────────────────────────────────────────

/**
 * §OPENING-PROFILE-SAG — the chord-height tolerance an arc is sampled to, in METRES.
 *
 * ⚠ **DELIBERATELY NOT one of `@pryzm/geometry-kernel`'s tolerances, and the reason is the point.**
 * `COINCIDENT_M` (1 mm) and `RECOMPUTE_IDENTITY_M` are **IDENTITY** tolerances — they answer *"are
 * these the same point?"*. This is a **VISUAL FIDELITY** tolerance answering *"is this polyline
 * indistinguishable from the arc it approximates?"*. Borrowing an identity tolerance for a fidelity
 * question is the same wrong-reuse this lane already avoided once, when `CurvedLeafGeometry` turned
 * out to solve a CURVED WALL's arc and not an arched head.
 *
 * 2 mm is below the width of a drawn line at any plan scale an architect uses, and at a 0.6 m
 * oculus radius it yields 48 segments — smooth in 3-D, and cheap.
 */
export const ARC_SAG_TOLERANCE_M = 0.002;

/** Floor / ceiling on the sample count, so a degenerate radius cannot explode or collapse it. */
export const ARC_MIN_SEGMENTS = 8;
export const ARC_MAX_SEGMENTS = 128;

/**
 * §OPENING-PROFILE-SEGMENTAL-RISE — a segmental arch's rise, as a fraction of the opening width.
 *
 * ⭐ **THIS IS THE ONE NUMBER THE RECORD CANNOT CARRY, AND IT IS DECLARED RATHER THAN HIDDEN.**
 * C86 §10.1 PR-8 forbids adding dimension fields beside `width`/`height`, so a segmental arch's
 * rise has no authored source. 1/6 of the span is the standard bricklayer's segmental proportion,
 * not an invention — but it IS an assumption, and a future `archRise` field (which would need its
 * own C86 amendment) makes this its default rather than its only value.
 *
 * ⛔ NOT MEASURED: whether 1/6 matches what an architect expects from the pill labelled
 * *"Segmental"*. Nobody has been asked. Recorded so the blank is visible.
 */
export const SEGMENTAL_RISE_RATIO = 1 / 6;

/**
 * THE segmental rise, in metres — the ONE evaluation of {@link SEGMENTAL_RISE_RATIO}.
 *
 * ⛔ Extracted 2026-08-20 (§OPENING-PROFILE-FRAME, L-1520) because the identical expression
 * `Math.min(width * SEGMENTAL_RISE_RATIO, height / 2)` was already written TWICE — in
 * `openingOutline` and in `openingProfileShapeRefusal` — and the frame arm needed a third. Three
 * copies of one clamp is how the refusal comes to reject a shape the outline happily draws. The
 * arithmetic is unchanged; only its number of homes is.
 *
 * The `height / 2` term is a CLAMP, not a proportion: it stops the arch eating the whole opening
 * on a short one, which is the case the refusal below then names.
 */
export function segmentalRise(width: number, height: number): number {
    return Math.min(width * SEGMENTAL_RISE_RATIO, height / 2);
}

/**
 * Segments needed to hold `ARC_SAG_TOLERANCE_M` across `sweepRad` at `radius`.
 *
 * DETERMINISTIC BY CONSTRUCTION — a pure function of the geometry, with no counter, clock or
 * config in it. That is required, not merely tidy: the outline feeds `composeWallGeometryHash`,
 * and a hash whose input wobbles is a cache that never hits.
 */
export function arcSegments(radius: number, sweepRad: number): number {
    if (!(radius > 0) || !(sweepRad > 0)) return ARC_MIN_SEGMENTS;
    // sag = r(1 − cos(θ/2)) ≤ tol  ⇒  θ ≤ 2·acos(1 − tol/r)
    const ratio = 1 - ARC_SAG_TOLERANCE_M / radius;
    const maxStep = ratio <= -1 ? Math.PI : 2 * Math.acos(Math.max(-1, Math.min(1, ratio)));
    const n = maxStep > 0 ? Math.ceil(sweepRad / maxStep) : ARC_MAX_SEGMENTS;
    return Math.max(ARC_MIN_SEGMENTS, Math.min(ARC_MAX_SEGMENTS, n));
}

// ── The outline ─────────────────────────────────────────────────────────────────────────────

/** A point in wall-local `(x, y)`: x along the wall, y UP FROM THE WALL BASE. */
export interface OutlinePoint { readonly x: number; readonly y: number }

/** The rectangle every arm already cuts — wall-local, same frame as {@link OutlinePoint}. */
export interface OutlineBBox {
    readonly x0: number; readonly x1: number;
    readonly y0: number; readonly y1: number;
}

export interface OpeningOutline {
    readonly kind: OpeningProfileKind;
    /**
     * CLOSED, COUNTER-CLOCKWISE polyline. The closing edge is IMPLICIT — `points[n-1]` joins
     * `points[0]`, and the first point is NOT repeated at the end. Every consumer relies on both
     * halves of that sentence, so it is stated here once rather than rediscovered per arm.
     */
    readonly points: readonly OutlinePoint[];
    readonly bbox: OutlineBBox;
    /**
     * ⭐ `true` ⇔ the outline IS the bounding box. **The gasket MUST NOT be emitted when this is
     * true** (PR-2) — that is what keeps every existing wall byte-identical.
     */
    readonly isRectangular: boolean;
}

export interface OpeningProfileInput {
    /** Absent ⇒ `'rectangular'`. */
    readonly profile?: unknown;
    /** LEFT-EDGE offset along the wall (§OPENING-OFFSET-LEFTEDGE-UNIFY). */
    readonly offset: number;
    readonly width: number;
    readonly height: number;
    readonly sillHeight: number;
    /**
     * §OUTLINE80 — the `'custom'` kind's companion ring (D1). Consumed ONLY when
     * `resolveOpeningProfile(profile) === 'custom'`; every other kind ignores this key entirely,
     * which is what lets a caller pass it unconditionally (as `OpeningElevationSymbol.ts` and
     * `WindowPlanSymbolBuilder.ts` already do, reading `Opening.customOutline` by string ahead of
     * this lane landing) without special-casing the four pre-existing kinds.
     *
     * Typed `unknown` at this boundary, matching `profile` — the LOAD path must not throw on a
     * malformed value from a newer build; `resolveCustomOutlineInput` is the tolerant reader.
     */
    readonly customOutline?: unknown;
}

function bboxOf(p: OpeningProfileInput): OutlineBBox {
    const y0 = p.sillHeight ?? 0;
    return { x0: p.offset, x1: p.offset + p.width, y0, y1: y0 + p.height };
}

/**
 * §OUTLINE80 — the tolerant reader for {@link OpeningProfileInput.customOutline}. Structural
 * checking only (array of `{u, v}` finite-number pairs) — SEMANTIC validity (simple polygon, tight
 * bbox, area floor) is `validateCustomOutline`'s job, called separately by whichever surface needs
 * a reason. This function exists so `openingOutline()` — the LOAD-adjacent producer, same rule as
 * `resolveOpeningProfile` — degrades a malformed value to `null` (⇒ the caller's null-handling,
 * never a thrown exception) rather than duplicating the shape check inline.
 */
export function resolveCustomOutlineInput(v: unknown): CustomOutline | null {
    if (!v || typeof v !== 'object') return null;
    const vertices = (v as { vertices?: unknown }).vertices;
    if (!Array.isArray(vertices) || vertices.length === 0) return null;
    const out: CustomOutlineVertex[] = [];
    for (const p of vertices) {
        if (!p || typeof p !== 'object') return null;
        const u = (p as { u?: unknown }).u;
        const vv = (p as { v?: unknown }).v;
        if (typeof u !== 'number' || typeof vv !== 'number') return null;
        out.push({ u, v: vv });
    }
    return { vertices: out };
}

function rectPoints(b: OutlineBBox): OutlinePoint[] {
    return [
        { x: b.x0, y: b.y0 },
        { x: b.x1, y: b.y0 },
        { x: b.x1, y: b.y1 },
        { x: b.x0, y: b.y1 },
    ];
}

/**
 * Sample an arc CCW about `(cx, cy)` from `a0` to `a1` (radians, `a1 > a0`).
 * Both endpoints are emitted; the caller drops duplicates where it joins straight runs.
 */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): OutlinePoint[] {
    const n = arcSegments(r, a1 - a0);
    const out: OutlinePoint[] = [];
    for (let i = 0; i <= n; i++) {
        const t = a0 + ((a1 - a0) * i) / n;
        out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
    return out;
}

/**
 * THE outline for an opening. Returns `null` only for geometry that is degenerate or that the
 * profile cannot hold — and a `null` here is a BUG at the call site, not a user-facing refusal:
 * {@link openingProfileRefusal} is the authoring gate and refuses the same cases WITH A REASON,
 * before anything reaches geometry. This returning `null` means that gate was skipped.
 */
export function openingOutline(p: OpeningProfileInput): OpeningOutline | null {
    const kind = resolveOpeningProfile(p.profile);
    if (!(p.width > 0) || !(p.height > 0)) return null;
    if (!Number.isFinite(p.offset) || !Number.isFinite(p.sillHeight)) return null;

    const bbox = bboxOf(p);
    const cx = (bbox.x0 + bbox.x1) / 2;

    if (kind === 'rectangular') {
        return { kind, points: rectPoints(bbox), bbox, isRectangular: true };
    }

    if (kind === 'circular') {
        // PR-8 — the bounding box of a circle is SQUARE. `width` IS the diameter; there is no
        // `radius` field, which is what keeps the four width-based clamp sites and the `WxH` size
        // grammar working unchanged. A non-square box is refused by the authoring gate.
        if (Math.abs(p.width - p.height) > 1e-6) return null;
        const r = p.width / 2;
        const cy = (bbox.y0 + bbox.y1) / 2;
        // Full circle: drop the duplicated closing sample, the outline closes implicitly.
        const pts = arcPoints(cx, cy, r, 0, Math.PI * 2);
        pts.pop();
        return { kind, points: pts, bbox, isRectangular: false };
    }

    if (kind === 'round-arch') {
        const r = p.width / 2;
        // The semicircle needs the top half-width of the opening. `height === r` is a legal pure
        // fanlight with zero jamb; anything shorter cannot hold the arch at all.
        if (p.height < r - 1e-9) return null;
        const ys = bbox.y1 - r;                       // springing line
        const pts: OutlinePoint[] = [{ x: bbox.x0, y: bbox.y0 }, { x: bbox.x1, y: bbox.y0 }];
        // Up the right jamb, then CCW over the head from 0 → π, then down the left jamb.
        // arcPoints emits both ends, and (x1, ys) / (x0, ys) ARE those ends — so the jamb
        // corners come from the arc itself and are never duplicated.
        pts.push(...arcPoints(cx, ys, r, 0, Math.PI));
        return { kind, points: pts, bbox, isRectangular: false };
    }

    if (kind === 'segmental-arch') {
        // Rise, from the declared ratio, clamped so the arch can never eat the whole opening.
        const rise = segmentalRise(p.width, p.height);
        if (!(rise > 1e-6)) return null;
        if (p.height <= rise + 1e-9) return null;
        const a = p.width / 2;                        // half-chord
        const R = (rise * rise + a * a) / (2 * rise); // circumscribing radius
        const cy = bbox.y1 - R;                       // centre sits below the crown by R
        const ys = bbox.y1 - rise;                    // springing line
        const aRight = Math.atan2(ys - cy, a);        // angle of the right springing
        const aLeft = Math.PI - aRight;
        const pts: OutlinePoint[] = [{ x: bbox.x0, y: bbox.y0 }, { x: bbox.x1, y: bbox.y0 }];
        pts.push(...arcPoints(cx, cy, R, aRight, aLeft));
        return { kind, points: pts, bbox, isRectangular: false };
    }

    // 'custom' — §OUTLINE80 (D1, D2). The ring is the AUTHOR'S OWN points, scaled from the unit
    // bbox to this opening's actual `width × height` and translated to `bbox`'s origin. No arc
    // maths, no re-derivation — this is the single place PR-1 permits a shape to enter the wall's
    // one outline producer, and it is a linear map of exactly the ring the type editor drew.
    //
    // ⛔ INVALID INPUT RETURNS `null` HERE, THE SAME AS EVERY OTHER REFUSED KIND. This function is
    // not the authoring gate (see its own header) — `openingProfileShapeRefusal` is, and it calls
    // `validateCustomOutline` itself so the REASON reaches the user before geometry is asked to
    // build anything.
    {
        const ring = resolveCustomOutlineInput(p.customOutline);
        if (!ring || validateCustomOutline(ring) !== null) return null;
        const normalised = normaliseCustomOutlineWinding(ring);
        const pts: OutlinePoint[] = normalised.vertices.map((vtx) => ({
            x: bbox.x0 + vtx.u * p.width,
            y: bbox.y0 + vtx.v * p.height,
        }));
        return { kind, points: pts, bbox, isRectangular: false };
    }
}

// ── The refusals — ONE predicate, so no surface can disagree with the builder ────────────────

/**
 * The host facts a profile decision needs. Structural on purpose: the panel, the command and the
 * builder all hold a wall-shaped object, and none of them should have to know which field the
 * others read.
 */
export interface OpeningProfileHost {
    readonly curve?: unknown;
    readonly layers?: unknown;
}

/**
 * §OPENING-PROFILE-REFUSE-CURVED (C86 §10.1 PR-5, §12 R-11) — **A CURVED WALL CANNOT CARRY A
 * NON-RECTANGULAR VOID, PERMANENTLY.**
 *
 * ⭐ THE REASON IS STRUCTURAL AND WILL NOT CHANGE. `_buildCurvedWallWithOpenings` slices the wall
 * into radial bands at stations along the **arc**, so an opening is expressed as a span in
 * ARC-LENGTH space. **A circle in arc-length space is not a circle in world space**, and no choice
 * of stations makes it one. This is the same KIND of statement as
 * §L955-INSTANCED-ARM-DROPS-RAKE's *"a T·R·S matrix cannot express what its property needs"*, and
 * it is settled the same way the house already settled that one: **exclude, do not teach the
 * builder to fake it.**
 *
 * ⛔ Falling back to `rectangular` here would be the *"silently-wrong wall"* `WallRake.ts:102`
 * forbids by name — the user asks for a circle, gets a rectangle, and nothing says so.
 */
export function openingProfileHostRefusal(
    profile: unknown,
    host: OpeningProfileHost | null | undefined,
): string | null {
    if (isRectangularProfile(profile)) return null;
    if (host && host.curve) {
        return (
            `A ${resolveOpeningProfile(profile)} opening cannot be cut in a CURVED wall: the void ` +
            `is set out along the arc, not in a flat face, so its edges would not be circular in ` +
            `the finished wall. Use a rectangular opening here, or host it on a straight wall.`
        );
    }
    return null;
}

/**
 * §OPENING-PROFILE-REFUSE-SHAPE (C86 §10.1 PR-8, §12 R-12) — the dimensions a profile requires.
 *
 * ⭐ **THIS IS WHAT MAKES "NO `radius` FIELD" SAFE RATHER THAN LOSSY.** Without it,
 * `width` × `height` × `profile` mint a state nothing refuses — a "circle" 2 m wide and 1 m tall —
 * and the founder's brief named that exact trap: *"do not add a field whose invalid combinations
 * nothing refuses."* The message quotes BOTH numbers, per the standing hard-stopper doctrine, so
 * the user is never told only that they are wrong.
 */
export function openingProfileShapeRefusal(
    profile: unknown,
    width: number,
    height: number,
    /**
     * §OPENING-PROFILE-BY-FAMILY — optional; when supplied, a sill AT the floor rules out a
     * circular profile (see {@link openingProfilesFor}). Optional so every existing caller keeps
     * its exact previous verdict.
     */
    sillHeight?: number,
    /**
     * §OUTLINE80 — the `'custom'` kind's companion ring (D1, D3). Optional and additive, exactly
     * like `sillHeight` above: every pre-existing caller that never passes a `'custom'` profile
     * keeps its exact previous verdict, and a caller that DOES pass `'custom'` without supplying a
     * ring is refused by `validateCustomOutline`'s own "none were supplied" message rather than
     * silently accepted.
     */
    customOutline?: unknown,
): string | null {
    const kind = resolveOpeningProfile(profile);
    if (kind === 'rectangular') return null;
    if (!(width > 0) || !(height > 0)) {
        return `An opening needs a positive width and height; got ${width} × ${height} m.`;
    }
    if (kind === 'circular' && Math.abs(width - height) > 1e-6) {
        return (
            `A circular opening's width and height must be equal — the width IS the diameter. ` +
            `This one is ${width.toFixed(3)} m wide and ${height.toFixed(3)} m tall. ` +
            `Set both to ${width.toFixed(3)} m for a round opening, or choose a rectangular profile.`
        );
    }
    if (kind === 'circular' && sillHeight !== undefined && sillHeight <= 1e-4) {
        return (
            `A circular opening cannot reach the floor — a door-height opening at sill 0 has no ` +
            `jambs for a circle to spring from. Raise the sill above the floor for a round window, ` +
            `or choose an arched profile for a doorway.`
        );
    }
    if (kind === 'round-arch' && height < width / 2 - 1e-9) {
        return (
            `A round-arched opening needs at least half its width in height — the semicircular ` +
            `head alone is ${(width / 2).toFixed(3)} m tall, and this opening is only ` +
            `${height.toFixed(3)} m. Raise it to at least ${(width / 2).toFixed(3)} m, or choose ` +
            `a segmental arch, which is shallower.`
        );
    }
    if (kind === 'segmental-arch') {
        const rise = segmentalRise(width, height);
        if (height <= rise + 1e-9) {
            return (
                `A segmental-arched opening needs more height than its rise. At ${width.toFixed(3)} m ` +
                `wide the rise is ${rise.toFixed(3)} m and this opening is only ${height.toFixed(3)} m tall.`
            );
        }
    }
    // §OUTLINE80 (D5) — a custom-outline WINDOW cannot reach the floor. A free-form ring is built
    // by arm A as a CLOSED HOLE (`THREE.Path` inside the wall's `Shape`), never as a notch carved
    // out of the outer boundary; a notch needs two feet at `v = 0` walking the ring the way
    // `notchWalk` does for the four built-in kinds, and a free-form ring is not guaranteed to have
    // any horizontal run there at all — D3 requires only that SOME vertex touch each bbox edge, a
    // vertex, not a run. `openingProfilesFor('door')` already never offers `'custom'` (D12), so
    // this check only ever fires for a WINDOW whose sill was set to (or edited down to) the floor —
    // exactly the same shape of check `circular` already has above, and for the same structural
    // reason (a circle has no jamb feet either).
    if (kind === 'custom' && sillHeight !== undefined && sillHeight <= 1e-4) {
        return (
            `A custom-outline opening cannot reach the floor — a free-form window ring is built as ` +
            `an interior HOLE in the wall face, not a notch carved from the wall's outer boundary, ` +
            `and a hole cannot touch the wall's own base. Raise the sill above the floor, or use a ` +
            `door instead, which is carved as a notch by design.`
        );
    }
    if (kind === 'custom') {
        const refusal = validateCustomOutline(resolveCustomOutlineInput(customOutline));
        if (refusal) return `A custom outline is not valid: ${refusal.reason}`;
    }
    return null;
}

/**
 * THE single authoring gate — host **and** shape. Every surface that can author a profile (tool,
 * property panel, command, chat) MUST call this and surface the string verbatim. C16 CA-18: a
 * refusal names the reason AND the live alternative, and every message above does both.
 *
 * ⛔ Returning `null` is the ONLY licence to proceed. A caller that ignores this and builds anyway
 * reintroduces exactly the defect C86 §10.1 was written to prevent.
 */
export function openingProfileRefusal(input: {
    profile?: unknown;
    width: number;
    height: number;
    /** Absent ⇒ the floor-reaching check is skipped (see {@link openingProfileShapeRefusal}). */
    sillHeight?: number;
    host?: OpeningProfileHost | null;
    /** §OUTLINE80 — the `'custom'` kind's companion ring (D1, D3). */
    customOutline?: unknown;
}): string | null {
    return (
        openingProfileShapeRefusal(
            input.profile, input.width, input.height, input.sillHeight, input.customOutline,
        ) ??
        openingProfileHostRefusal(input.profile, input.host)
    );
}

/**
 * §OPENING-PROFILE-HASH — the profile as a cache-key fragment.
 *
 * ⭐ **EMPTY FOR A RECTANGLE, AND THAT IS THE WHOLE DESIGN.** Every wall in every existing project
 * hashes byte-identically after this lands, so nothing is re-versioned and no persisted geometry
 * cache is invalidated. Contrast `_rakeTag`, which deliberately lengthened the key for EVERY wall
 * and cost a one-time full rebuild — a profile can do better because absence and default coincide.
 *
 * ⛔ This exists because a profile change that is not folded into the invalidation keys **renders
 * nothing at all** — the user flips Rectangular → Circular and the wall keeps its old mesh. That
 * is the three-invalidation-gates-in-series class (L-813), and it is why this ships in the SAME
 * slice as the geometry rather than a later one.
 *
 * §OUTLINE80 — for `'custom'` the KIND alone is not enough: two custom openings both carry
 * `kind === 'custom'` but different rings, and a ring EDIT on an otherwise-unchanged opening must
 * also invalidate — the same L-813 failure one level down (edit the ring, the wall keeps its old
 * mesh). `customOutline` therefore folds its vertices into the tag, deterministically (no `Map`
 * iteration order, no object identity) so the hash is stable across reloads.
 */
export function openingProfileTag(profile: unknown, customOutline?: unknown): string {
    const kind = resolveOpeningProfile(profile);
    if (kind === 'rectangular') return '';
    if (kind !== 'custom') return `:${kind}`;
    const ring = resolveCustomOutlineInput(customOutline);
    if (!ring) return ':custom';
    const digits = ring.vertices.map((p) => `${p.u.toFixed(4)},${p.v.toFixed(4)}`).join('|');
    return `:custom:${digits}`;
}

// ── §OPENING-PROFILE-FRAME (L-1520) — THE FRAME IS THE OUTLINE, INSET ───────────────────────
//
// ⭐ **THE DEFECT THIS SECTION EXISTS FOR.** L-1200 taught the WALL to cut a circular / arched
// void and L-1250–L-1252 gave the architect the control to ask for one. Neither touched the 3-D
// FRAME: `WindowBuilder` and `DoorBuilder` each built head / cill / jambs as four unconditional
// boxes, so the founder got *"the opening circular but not the frame — the frame is square"*.
// That is C86 §11 #1 exactly — **the frame and the void diverging** — and the fix is not to teach
// the builders to draw a circle. It is to give them the ONE outline the hole was cut from, and an
// INSET of it.
//
// ⛔ **NO ARC MATHS MAY BE WRITTEN IN A BUILDER.** PR-1 says every wall-body arm consumes the
// outline `openingOutline` returns; the frame is now bound by the same rule. Everything below is
// a pure function OF that outline — an offset, a clip, a re-centring — so a frame member cannot
// disagree with the reveal it sits in by so much as a sampling step. Two producers of one curve
// is how a hole and a frame come to differ by a millimetre and then by a metre.

/**
 * Shoelace signed area. **Positive ⇔ counter-clockwise**, which is the winding
 * {@link OpeningOutline} guarantees — so this doubles as the validity test every helper below
 * uses to decide whether an operation collapsed or inverted the shape.
 */
export function outlineSignedArea(points: readonly OutlinePoint[]): number {
    const n = points.length;
    if (n < 3) return 0;
    let a = 0;
    for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const q = points[(i + 1) % n]!;
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/**
 * A mitre limit, expressed as a multiple of the inset. A vertex whose offset point runs further
 * than this has met a corner too sharp to carry a constant-width member, and the whole inset is
 * REFUSED rather than emitted with a spike. Every outline this producer makes has interior angles
 * of 90° or more (√2 ≈ 1.41 at the jamb feet), so a limit of 8 is loose for the real cases and
 * still catches a genuinely degenerate one.
 */
const INSET_MITRE_LIMIT = 8;

/**
 * §OPENING-PROFILE-INSET — the outline, offset INWARD by a constant `inset`.
 *
 * ⭐ **THIS IS THE HELPER THE FRAME ARM IS BUILT ON, AND ITS SHAPE IS THE ARGUMENT.** It takes the
 * producer's OWN sampled points and offsets them; it does not re-derive a circle of radius
 * `r − inset`, does not re-derive a springing line, and does not know which profile it is looking
 * at. That is what makes a frame member's inner face **provably parallel** to the reveal it was
 * cut with: both are the same polyline, one moved.
 *
 * ⚠ **A REJECTED ALTERNATIVE, RECORDED SO IT IS NOT RE-TRIED.** The obvious inset is to call
 * `openingOutline` again with `width − 2t`, `height − 2t`. It is EXACT for `rectangular`,
 * `circular` and `round-arch` — and WRONG for `segmental-arch`, because that profile's rise is a
 * fraction OF THE WIDTH, so a narrower opening springs from a different centre with a different
 * radius. The member's width would then vary along the head (measured ≈ 50 → 57 mm on a
 * 1.0 × 1.5 m opening at t = 50 mm). A frame member has a constant section; this offset gives it
 * one for every profile.
 *
 * @returns `null` when the inset collapses, inverts or spikes the shape — the caller must then
 *          treat the opening as SOLID (frame thicker than the void can hold), never draw a
 *          fallback rectangle in a curved hole.
 */
export function insetOutlinePoints(
    points: readonly OutlinePoint[],
    inset: number,
): OutlinePoint[] | null {
    const n = points.length;
    if (n < 3) return null;
    if (!Number.isFinite(inset)) return null;
    if (inset <= 1e-9) return points.map(p => ({ x: p.x, y: p.y }));

    const area0 = outlineSignedArea(points);
    // CCW is the producer's stated contract; a CW input is a caller bug, not a shape to guess at.
    if (!(area0 > 0)) return null;

    // Unit direction per edge. A ZERO-LENGTH edge is real: `round-arch` at `height === width / 2`
    // is the legal "pure fanlight with zero jamb", where the jamb foot and the springing coincide.
    // Such an edge has no direction, so the vertex inherits its neighbours' — which is exactly
    // what a constant-width member does there.
    const dir: ({ x: number; y: number } | null)[] = [];
    for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const q = points[(i + 1) % n]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const L = Math.hypot(dx, dy);
        dir.push(L > 1e-12 ? { x: dx / L, y: dy / L } : null);
    }
    const seek = (from: number, step: number): { x: number; y: number } | null => {
        for (let k = 0; k < n; k++) {
            const d = dir[(((from + step * k) % n) + n) % n];
            if (d) return d;
        }
        return null;
    };

    const out: OutlinePoint[] = [];
    for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const d0 = seek(i - 1, -1);   // the edge ARRIVING at this vertex
        const d1 = seek(i, +1);       // the edge LEAVING it
        if (!d0 || !d1) return null;
        // Inward normal = LEFT of travel, because the ring is CCW.
        const n0 = { x: -d0.y, y: d0.x };
        const n1 = { x: -d1.y, y: d1.x };
        const cross = d0.x * d1.y - d0.y * d1.x;
        let px: number;
        let py: number;
        if (Math.abs(cross) < 1e-9) {
            // Collinear, or the SMOOTH TANGENT JOIN where a jamb meets its arc: the two offset
            // lines coincide, so there is nothing to intersect and the normal offset IS the answer.
            px = p.x + n1.x * inset;
            py = p.y + n1.y * inset;
        } else {
            const ax = p.x + n0.x * inset;
            const ay = p.y + n0.y * inset;
            const bx = p.x + n1.x * inset;
            const by = p.y + n1.y * inset;
            const s = ((bx - ax) * d1.y - (by - ay) * d1.x) / cross;
            px = ax + d0.x * s;
            py = ay + d0.y * s;
        }
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        if (Math.hypot(px - p.x, py - p.y) > inset * INSET_MITRE_LIMIT) return null;
        out.push({ x: px, y: py });
    }

    // ⭐ **THE VALIDITY TEST IS EDGE DIRECTION, NOT AREA — AND THAT WAS MEASURED, NOT GUESSED.**
    // The first draft of this function tested only `0 < area1 < area0`, and a test asked it for a
    // 0.6 m inset on a 0.6 m-radius oculus: the offset ran PAST the centre, every vertex landed on
    // the far side, and the result was a tiny polygon REFLECTED THROUGH THE ORIGIN — which in 2-D
    // is a rotation, so it is still counter-clockwise and still smaller. Both area tests passed on
    // a shape turned inside out.
    //
    // An offset is valid exactly while no edge has crossed the medial axis, and an edge announces
    // that by REVERSING. So each offset edge must still point the way its original did.
    for (let i = 0; i < n; i++) {
        const d = dir[i];
        if (!d) continue;                       // a degenerate original edge has nothing to reverse
        const a = out[i]!;
        const b = out[(i + 1) % n]!;
        if ((b.x - a.x) * d.x + (b.y - a.y) * d.y <= 0) return null;
    }

    const area1 = outlineSignedArea(out);
    // Collapsed or somehow larger. Kept alongside the edge test because they catch different
    // failures — this one catches a shape that stayed convex and vanished.
    if (!(area1 > 1e-9) || !(area1 < area0)) return null;
    return out;
}

/** A named reason `insetOutlinePoints` refused, for a caller that must SAY why (C16 CA-18). */
export interface InsetFailureDiagnosis {
    /** The vertex index (into the ORIGINAL `points`) whose offset spiked, collapsed or reversed. */
    readonly vertexIndex: number;
    readonly reason: 'non-finite' | 'mitre-limit-exceeded' | 'edge-reversed';
}

/**
 * §OUTLINE80-INSET-DIAGNOSIS — WHY `insetOutlinePoints` returned `null`, naming the vertex.
 *
 * ⚠ **A DIAGNOSTIC TWIN, NOT A SECOND ANSWER.** It does not decide whether the inset is valid —
 * `insetOutlinePoints` remains the ONE authority on that, and this function is only ever called
 * AFTER it has already returned `null`, to explain the verdict rather than to reach one. It walks
 * the identical per-vertex construction so the vertex it blames is the one the real algorithm
 * actually tripped on, not a plausible-looking guess.
 *
 * @returns `null` when the ring itself is degenerate (< 3 vertices, non-CCW, non-finite inset) —
 *          those cases have no single vertex to blame — else the first offending vertex.
 */
export function diagnoseInsetFailure(
    points: readonly OutlinePoint[],
    inset: number,
): InsetFailureDiagnosis | null {
    const n = points.length;
    if (n < 3 || !Number.isFinite(inset) || inset <= 1e-9) return null;
    const area0 = outlineSignedArea(points);
    if (!(area0 > 0)) return null;

    const dir: ({ x: number; y: number } | null)[] = [];
    for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const q = points[(i + 1) % n]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const L = Math.hypot(dx, dy);
        dir.push(L > 1e-12 ? { x: dx / L, y: dy / L } : null);
    }
    const seek = (from: number, step: number): { x: number; y: number } | null => {
        for (let k = 0; k < n; k++) {
            const d = dir[(((from + step * k) % n) + n) % n];
            if (d) return d;
        }
        return null;
    };

    const out: OutlinePoint[] = [];
    for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const d0 = seek(i - 1, -1);
        const d1 = seek(i, +1);
        if (!d0 || !d1) return { vertexIndex: i, reason: 'non-finite' };
        const n0 = { x: -d0.y, y: d0.x };
        const n1 = { x: -d1.y, y: d1.x };
        const cross = d0.x * d1.y - d0.y * d1.x;
        let px: number;
        let py: number;
        if (Math.abs(cross) < 1e-9) {
            px = p.x + n1.x * inset;
            py = p.y + n1.y * inset;
        } else {
            const ax = p.x + n0.x * inset;
            const ay = p.y + n0.y * inset;
            const bx = p.x + n1.x * inset;
            const by = p.y + n1.y * inset;
            const s = ((bx - ax) * d1.y - (by - ay) * d1.x) / cross;
            px = ax + d0.x * s;
            py = ay + d0.y * s;
        }
        if (!Number.isFinite(px) || !Number.isFinite(py)) return { vertexIndex: i, reason: 'non-finite' };
        if (Math.hypot(px - p.x, py - p.y) > inset * INSET_MITRE_LIMIT) {
            return { vertexIndex: i, reason: 'mitre-limit-exceeded' };
        }
        out.push({ x: px, y: py });
    }
    for (let i = 0; i < n; i++) {
        const d = dir[i];
        if (!d) continue;
        const a = out[i]!;
        const b = out[(i + 1) % n]!;
        if ((b.x - a.x) * d.x + (b.y - a.y) * d.y <= 0) return { vertexIndex: i, reason: 'edge-reversed' };
    }
    // The per-vertex walk survived; a residual failure is the whole-ring area check, which has
    // no single vertex to blame — treated the same as the degenerate-ring cases above.
    return null;
}

/**
 * §OPENING-PROFILE-CLIP — the part of an outline at or ABOVE `yCut`, closed by the chord.
 *
 * The one consumer is the ARCHED DOOR's fanlight: a doorway's leaf stops at the springing and the
 * head above it is a fixed light. Sutherland–Hodgman against one half-plane — generic, so it
 * carries whatever curve the producer emitted without knowing which curve that is.
 *
 * @returns `null` when nothing survives the cut, or when what survives has no area.
 */
export function clipOutlinePointsAbove(
    points: readonly OutlinePoint[],
    yCut: number,
): OutlinePoint[] | null {
    const n = points.length;
    if (n < 3 || !Number.isFinite(yCut)) return null;
    const inside = (p: OutlinePoint): boolean => p.y >= yCut - 1e-9;
    const out: OutlinePoint[] = [];
    for (let i = 0; i < n; i++) {
        const cur = points[i]!;
        const prev = points[(i - 1 + n) % n]!;
        if (inside(cur) !== inside(prev)) {
            const dy = cur.y - prev.y;
            if (Math.abs(dy) > 1e-12) {
                const t = (yCut - prev.y) / dy;
                out.push({ x: prev.x + (cur.x - prev.x) * t, y: yCut });
            }
        }
        if (inside(cur)) out.push({ x: cur.x, y: cur.y });
    }
    if (out.length < 3) return null;
    if (!(outlineSignedArea(out) > 1e-9)) return null;
    return out;
}

/**
 * The outline in the FRAME BUILDER'S OWN coordinates — origin at the opening's centre.
 *
 * ⭐ **NO SECOND CONSTRUCTION, AND NO TRANSFORM EITHER.** `WindowBuilder` and `DoorBuilder` author
 * every member in a group-local frame centred on the void (`x ∈ [−w/2, w/2]`, `y ∈ [−h/2, h/2]`).
 * `openingOutline` is translation-covariant — every branch derives its centres and springing from
 * `bbox`, never from an absolute datum — so asking it for an opening at `offset = −w/2`,
 * `sillHeight = −h/2` returns THE SAME CURVE the wall was cut with, already in the builder's frame.
 * A `translate()` here would be a second place for the two frames to drift apart.
 */
export function openingOutlineLocal(
    profile: unknown,
    width: number,
    height: number,
    /** §OUTLINE80 — the `'custom'` kind's companion ring; ignored by every other kind. */
    customOutline?: unknown,
): OpeningOutline | null {
    return openingOutline({
        profile, offset: -width / 2, width, height, sillHeight: -height / 2, customOutline,
    });
}

/**
 * ⭐ THE ONE PREDICATE for *"does this opening need the profiled frame arm?"*.
 *
 * It is deliberately the same call the geometry branch makes, because a SECOND arm reads it: the
 * window's GPU-instancing gate. `_convertGroupToInstances` recovers each sub-box's size from
 * `(geometry as BoxGeometry).parameters`, which an extruded profile ring does not have — so an
 * instanced profiled window would render as 1 m cubes, the same class of defect the curved-host
 * exclusion already names. Both arms asking one predicate is what stops them disagreeing.
 *
 * `false` for an opening whose profile the outline REFUSES (a "circle" 2 m × 1 m, a round arch
 * shorter than its own head). That is not a fallback — it is the SAME `null` the wall's arms take
 * their rectangular path on, so frame and void stay identical even when the record is wrong.
 */
export function isProfiledOpening(
    profile: unknown, width: number, height: number, customOutline?: unknown,
): boolean {
    const o = openingOutlineLocal(profile, width, height, customOutline);
    return !!o && !o.isRectangular;
}

/**
 * §OPENING-PROFILE-SPRING — the y at which the outline STOPS being full-width, in the
 * {@link openingOutlineLocal} frame.
 *
 * This is where a real doorway puts its TRANSOM: the leaf runs from the floor to the springing,
 * and the arched head above it is a fanlight. Below this line the outline is exactly the
 * rectangle it always was, which is what lets the door's entire leaf / stile / rail / ironmongery
 * construction stay byte-identical and merely get shorter.
 *
 * @returns `null` for `circular` — a circle HAS no straight run, and that is the honest answer
 *          rather than `y0`. (Doors cannot be circular anyway; see {@link openingProfilesFor}.)
 *          §OUTLINE80: also `null` for `'custom'`, for the identical reason — a free-form ring is
 *          not guaranteed to have exactly one straight run (it may have several, at different
 *          heights, or none at all), so there is no single scalar this function could honestly
 *          report. Never a fake number computed from a formula (e.g. the segmental rise) that does
 *          not describe the ring actually authored.
 */
export function openingSpringLineYLocal(
    profile: unknown,
    width: number,
    height: number,
    customOutline?: unknown,
): number | null {
    const o = openingOutlineLocal(profile, width, height, customOutline);
    if (!o) return null;
    if (o.kind === 'rectangular') return o.bbox.y1;
    if (o.kind === 'circular') return null;
    if (o.kind === 'round-arch') return o.bbox.y1 - width / 2;
    if (o.kind === 'segmental-arch') return o.bbox.y1 - segmentalRise(width, height);
    return null; // 'custom'
}

/**
 * §OUTLINE80-SILL-RUN (D4) — the ring's lowest HORIZONTAL straight run, where a sill can
 * physically sit. `null` when the bottom is a vertex or an arc (an apex-down triangle, a circle):
 * such an opening has no sill, and the caller omits the board rather than drawing one under a
 * point.
 *
 * ⭐ THE ONE PREDICATE, consumed by BOTH the drawing and the 3-D build. `WindowPlanSymbolBuilder`
 * needs the identical answer for the plan symbol's sill line — two independent derivations of
 * "does this opening have a sill run" is exactly the C84 EI-9 shape this producer exists to
 * prevent, so this is declared here, beside the outline it reads, rather than inside either
 * consumer.
 */
export function outlineBaseRun(outline: OpeningOutline): { x0: number; x1: number } | null {
    const y0 = outline.bbox.y0;
    const EPS = 1e-9;
    const pts = outline.points;
    const n = pts.length;
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        if (Math.abs(a.y - y0) < EPS && Math.abs(b.y - y0) < EPS && Math.abs(b.x - a.x) > EPS) {
            x0 = Math.min(x0, a.x, b.x);
            x1 = Math.max(x1, a.x, b.x);
        }
    }
    return x1 > x0 ? { x0, x1 } : null;
}
