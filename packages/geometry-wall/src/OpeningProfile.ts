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

/**
 * The void-shape axis. **ORTHOGONAL to the leaf-count axis** (`'single' | 'double'`), and C86 §9
 * WO-Voc-4 forbids flattening the two into one list: doing so makes `double × round-arch` — an
 * ordinary door — unexpressible.
 */
export type OpeningProfileKind =
    | 'rectangular'
    | 'round-arch'
    | 'segmental-arch'
    | 'circular';

export const OPENING_PROFILE_KINDS: readonly OpeningProfileKind[] = [
    'rectangular',
    'round-arch',
    'segmental-arch',
    'circular',
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
});

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
export function nextOpeningProfile(current: unknown): OpeningProfileKind {
    const i = OPENING_PROFILE_KINDS.indexOf(resolveOpeningProfile(current));
    return OPENING_PROFILE_KINDS[(i + 1) % OPENING_PROFILE_KINDS.length]!;
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
}

function bboxOf(p: OpeningProfileInput): OutlineBBox {
    const y0 = p.sillHeight ?? 0;
    return { x0: p.offset, x1: p.offset + p.width, y0, y1: y0 + p.height };
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

    // 'segmental-arch'
    {
        // Rise, from the declared ratio, clamped so the arch can never eat the whole opening.
        const rise = Math.min(p.width * SEGMENTAL_RISE_RATIO, p.height / 2);
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
    if (kind === 'round-arch' && height < width / 2 - 1e-9) {
        return (
            `A round-arched opening needs at least half its width in height — the semicircular ` +
            `head alone is ${(width / 2).toFixed(3)} m tall, and this opening is only ` +
            `${height.toFixed(3)} m. Raise it to at least ${(width / 2).toFixed(3)} m, or choose ` +
            `a segmental arch, which is shallower.`
        );
    }
    if (kind === 'segmental-arch') {
        const rise = Math.min(width * SEGMENTAL_RISE_RATIO, height / 2);
        if (height <= rise + 1e-9) {
            return (
                `A segmental-arched opening needs more height than its rise. At ${width.toFixed(3)} m ` +
                `wide the rise is ${rise.toFixed(3)} m and this opening is only ${height.toFixed(3)} m tall.`
            );
        }
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
    host?: OpeningProfileHost | null;
}): string | null {
    return (
        openingProfileShapeRefusal(input.profile, input.width, input.height) ??
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
 */
export function openingProfileTag(profile: unknown): string {
    const kind = resolveOpeningProfile(profile);
    return kind === 'rectangular' ? '' : `:${kind}`;
}
