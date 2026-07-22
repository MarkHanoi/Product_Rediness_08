// §FEAT-SHARED-CAMERA-POSE (L-600, C59 §2.7 / Phase 3) — ONE camera ANGLE shared across the
// linked 3D surfaces (globe · 3D Site · 3D PRYZM/BIM), as a PURE reducer whose projections
// the renderers consume. No DOM, no Cesium, no THREE, no I/O.
//
// ── THE FOUNDER'S ASK ────────────────────────────────────────────────────────────────
// "I want to keep the view always the same camera angle in all the 3 main 3D views — 3D
// globe, 3D Site, and 3D PRYZM (BIM) — but it doesn't work."
//
// It "doesn't work" because it has NEVER EXISTED. Two mechanisms, both correct for what
// they were built for, both wrong for this:
//   1. `ViewController._cameraStateStore` (ViewCameraStateStore) saves on deactivate and
//      restores on activate, KEYED BY VIEW-DEFINITION ID. Each view is DESIGNED to return
//      exactly where you left it. That is right for plans/sections/elevations and wrong
//      for "one camera looking at one thing".
//   2. The globe and the 3D Site are CESIUM (`CesiumViewport`) — a different renderer, a
//      different camera type, a different coordinate frame (ECEF vs site-local metres).
//      The BIM camera store cannot reach them, and nothing has ever synchronised across
//      that boundary.
// ⇒ L-600 is a GAP, not a regression. Nothing broke.
//
// ── WHY A PURE REDUCER AND NOT LISTENERS ────────────────────────────────────────────
// The obvious implementation is: listen to each renderer's camera-change event and write
// the others. That oscillates. Cesium moves → we write BIM → BIM's controls emit a change
// → we write Cesium → … The failure is structural, not a tuning problem, so the remedy is
// structural: ONE pose in view state, mutated ONLY by an intent, PROJECTED into each
// renderer. A renderer never writes another renderer.
//
// Echo suppression is modelled on the discipline that already exists for exactly this
// problem in `CesiumViewport`: `beginProgrammaticFly()`/`endProgrammaticFly(token)`
// (§GLOBE-FRAME-NO-JUMP-2), where a monotonic TOKEN stops a superseded flight's `cancel`
// clearing the flag out from under a newer one. Here that token is `epoch`, and it is
// PURE — so "an apply cannot re-emit" is a unit test rather than a code-reading promise
// (see `isEchoObservation` and the ping-pong property test).
//
// ── WHAT IS SHARED IS THE ANGLE. THE TARGET IS NOT. (normative) ─────────────────────
// The pose carries heading + pitch + distance and NO TARGET. That is deliberate and it is
// what makes the model frame-independent:
//   • Pre-site (C60's `world`/`country` stages) there IS no site-local target — the LTP-ENU
//     frame is established only when a site is chosen (C12, C19 §1.3). A shared pose that
//     carried a site-local target would be undefined for half the flow.
//   • Each surface already knows what it is looking at: the globe looks at C60's entry-stage
//     `focus`, the 3D Site at the site, the BIM view at the model. Those targets are owned
//     where they already live and are NOT relocated here.
// ⇒ **C60 relationship, decided and recorded:** the entry-stage camera is a PRODUCER of
// heading/pitch into this pose and a CONSUMER of heading/pitch out of it; its TARGET
// (`cameraForState`'s lat/lon) and its ALTITUDE band stay owned by C60 and are deliberately
// OUTSIDE the shared pose. The two models compose; neither duplicates the other.
//
// ── WHICH NORTH (ADR-0115 / ADR-0070) — READ THIS BEFORE TOUCHING `headingDeg` ───────
// `headingDeg` is measured CLOCKWISE FROM **TRUE** NORTH. True north is the only frame both
// renderers can honour: Cesium has no notion of project north, and at globe scale no site
// exists so θ is not even defined yet.
//
// The BIM authoring frame is de-rotated from true north by θ (`SiteLocation.trueNorth`,
// radians, project→true, clockwise — ADR-0070/ADR-0115). In Barcelona θ ≈ −45°. So θ MUST
// be applied EXACTLY ONCE, on the BIM side only:
//     project-frame bearing = true bearing − θ          (`bimHeadingFromTrueHeading`)
// This is the identical scalar form `packages/solar-analysis` already uses for the sun
// (`sunDirectionFromAltAz`: `az = azimuthRad − projectNorthRad`), and `sharedCameraPose`'s
// spec pins it against the canonical L5 vector transform `trueVectorToProjectNorth`
// (ADR-0115) so the convention cannot drift — the same equivalence-pinning discipline as
// `projectNorthSolarEquivalence.test.ts`.
// Applying θ on the Cesium side too would double-rotate; applying it nowhere makes the two
// views disagree by 45° in Barcelona and by 0° everywhere else — a bug that hides in
// testing. Hence: ONCE, HERE, in `projectPoseToBim` only.
//
// ── PURE ⇒ P8 SPAN-EXEMPT ───────────────────────────────────────────────────────────
// Same rationale as `paneViewModel.ts` (C59 §1.2) and `siteEntryModel.ts` (C60 §1.1): the
// live surfaces are two GPU renderers that cannot run headless, so the DECISION layer is
// pinned here and unit-tested without either of them.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────────────
// It is NOT wired to any renderer. Live wiring needs C59 Phase 3 (per-pane view + camera
// state) — `bim-3d.paneHostable` is still `false` because the WebGPU renderer owns
// `#container`. C60 Phase 2 is sequenced behind the same gate for the same reason. Wiring
// this onto the Phase-2 switcher would build against a surface about to change. See
// C59 §2.7 for the two renderer additions Phase 3 must make.

import { trueVectorToProjectNorth } from '@app/ui/site/overlay/projectTrueNorth';

// ── Vocabulary ──────────────────────────────────────────────────────────────────────

/**
 * The three surfaces the founder names — but note there are only **two renderers**.
 *
 * `globe` and `site-3d` are THE SAME CESIUM VIEWER at different camera altitudes (C59 §2
 * invariant 1, C60 §6.5). They are listed separately here because they have different
 * distance bands and different producers, NOT because a second viewer exists. Nothing in
 * this module may be read as licence to construct one.
 */
export type LinkedCameraSurface = 'globe' | 'site-3d' | 'bim-3d';

export const LINKED_CAMERA_SURFACES: readonly LinkedCameraSurface[] = ['globe', 'site-3d', 'bim-3d'];

/** True for the two surfaces that project onto the ONE Cesium camera. */
export function isCesiumSurface(surface: LinkedCameraSurface): boolean {
    return surface === 'globe' || surface === 'site-3d';
}

/**
 * How strongly the linked 3D views are tied together. A CONFIGURATION VALUE, not a fork —
 * the same discipline as C60 §5's (A)/(B) mode.
 *
 * - `'angle-only'` — **the shipped default.** Heading + pitch are shared; each surface keeps
 *   its own distance, clamped into its declared band. This is the literal reading of the
 *   founder's words ("same camera **angle**").
 * - `'angle-and-distance'` — heading + pitch + distance are shared. ⚠ Even here the globe is
 *   still clamped to its own band: a globe camera 30 m above the pavement and a BIM camera
 *   20 000 km out are both unusable, so a literally-identical distance across a five-order-
 *   of-magnitude span is not a product. The clamp is DECLARED, never silent — `clamped` is
 *   returned on every projection so a caller can surface it.
 * - `'off'` — no linkage at all. Each view keeps its own camera memory (today's behaviour,
 *   which is CORRECT for plans/sections/elevations and stays untouched by this model).
 *
 * ⚠ WHICH OF THE FIRST TWO THE FOUNDER WANTS IS AN OPEN DECISION (L-600). They are
 * materially different products for the `site-3d` ↔ `bim-3d` pair and this module does not
 * choose for him: it implements both and defaults to the only one that is safe at globe
 * scale. See the L-600 audit row.
 */
export type SharedPoseMode = 'off' | 'angle-only' | 'angle-and-distance';

/**
 * The shared pose. **No target** — see the file header.
 *
 * @property headingDeg  Clockwise from **TRUE** north, normalised to [0, 360).
 * @property pitchDeg    Negative = looking down. Clamped to [-89, -1] — a camera at exactly
 *                       -90° has an undefined heading (gimbal), which would make the shared
 *                       angle meaningless precisely at the world stage.
 * @property distanceM   Distance from the surface's own target. Consumed only in
 *                       `'angle-and-distance'`; always carried so a mode switch has a value.
 */
export interface SharedCameraPose {
    readonly headingDeg: number;
    readonly pitchDeg: number;
    readonly distanceM: number;
}

/**
 * DECLARED distance bands, metres.
 *
 * ⚠ OUTPUTS, never INPUTS — exactly the discipline C60 §1.1 states for
 * `SITE_ENTRY_ALTITUDE_M`. They are what a projected distance is clamped INTO; they are
 * never compared against a live camera distance to infer which surface you are on. The
 * surface is told to us by the caller, because the surface is a fact about the pane, not
 * about the camera.
 *
 * `globe`'s span covers C60's `city` altitude (18 km) up through `world` (20 000 km);
 * `site-3d` covers a plot-to-neighbourhood framing; `bim-3d` covers a detail-to-masterplan
 * framing.
 */
export const SURFACE_DISTANCE_BAND: Readonly<
    Record<LinkedCameraSurface, { readonly minM: number; readonly maxM: number }>
> = {
    globe: { minM: 10_000, maxM: 25_000_000 },
    'site-3d': { minM: 50, maxM: 10_000 },
    'bim-3d': { minM: 2, maxM: 5_000 },
};

/** Below this the two poses are the SAME pose — an apply's echo, not a user's move. */
export const POSE_ECHO_ANGLE_TOLERANCE_DEG = 0.5;
/** Relative distance change below which a distance report is an echo. */
export const POSE_ECHO_DISTANCE_TOLERANCE_FRACTION = 0.02;

// ── State ───────────────────────────────────────────────────────────────────────────

/**
 * @property originSurface Which surface last moved the pose. Diagnostic + inspectable; the
 *                         linkage must be visible to the user, not a hidden coupling.
 * @property epoch         Monotonic. Increments on EVERY accepted pose change. This is the
 *                         `formaFlyToken` discipline, made pure — see the file header.
 */
export interface SharedCameraPoseState {
    readonly pose: SharedCameraPose;
    readonly mode: SharedPoseMode;
    readonly originSurface: LinkedCameraSurface | null;
    readonly epoch: number;
}

/**
 * The default pose: an oblique aerial from the south-east looking north-west and down.
 * Chosen to match the existing `FORMA_FLY_HEADING_DEG`/`FORMA_FLY_PITCH_DEG` family of
 * framings rather than inventing a new house style; it is a starting value, not a policy.
 */
export const INITIAL_SHARED_CAMERA_POSE: SharedCameraPose = {
    headingDeg: 315,
    pitchDeg: -35,
    distanceM: 400,
};

export const INITIAL_SHARED_CAMERA_POSE_STATE: SharedCameraPoseState = {
    pose: INITIAL_SHARED_CAMERA_POSE,
    mode: 'angle-only',
    originSurface: null,
    epoch: 0,
};

// ── Normalisation ───────────────────────────────────────────────────────────────────

/** Normalise a heading into [0, 360). Non-finite ⇒ 0. */
export function normalizeHeadingDeg(deg: number): number {
    if (!Number.isFinite(deg)) return 0;
    const r = deg % 360;
    return r < 0 ? r + 360 : r;
}

/** Clamp a pitch into [-89, -1]. Non-finite ⇒ the initial pitch. See `SharedCameraPose`. */
export function clampPitchDeg(deg: number): number {
    if (!Number.isFinite(deg)) return INITIAL_SHARED_CAMERA_POSE.pitchDeg;
    return Math.max(-89, Math.min(-1, deg));
}

/** Smallest absolute angular separation between two headings, degrees, in [0, 180]. */
export function headingSeparationDeg(a: number, b: number): number {
    const d = Math.abs(normalizeHeadingDeg(a) - normalizeHeadingDeg(b)) % 360;
    return d > 180 ? 360 - d : d;
}

/** Canonicalise any candidate pose. Every write path goes through this. */
export function normalizePose(pose: SharedCameraPose): SharedCameraPose {
    const distanceM =
        Number.isFinite(pose.distanceM) && pose.distanceM > 0
            ? pose.distanceM
            : INITIAL_SHARED_CAMERA_POSE.distanceM;
    return {
        headingDeg: normalizeHeadingDeg(pose.headingDeg),
        pitchDeg: clampPitchDeg(pose.pitchDeg),
        distanceM,
    };
}

// ── Intents (command-named, C59 §2 invariant 3 / P6) ────────────────────────────────

export type SharedPoseIntent =
    /**
     * A renderer reporting that ITS camera now sits at `pose`. `appliedEpoch` is the epoch
     * that surface was last PROJECTED at — the echo/staleness token. A UI click handler
     * never dispatches this; the surface's own camera-settled hook does.
     */
    | {
          readonly type: 'view.camera.pose-observed';
          readonly surface: LinkedCameraSurface;
          readonly pose: SharedCameraPose;
          readonly appliedEpoch: number;
      }
    /** Turn the linkage on/off, or change how tightly it binds. */
    | { readonly type: 'view.camera.set-link-mode'; readonly mode: SharedPoseMode }
    /** Back to the declared default pose. */
    | { readonly type: 'view.camera.reset' };

/**
 * The reducer DESCRIBES what must be re-projected; ports perform it. `epoch` is stamped so
 * the port can hand it back as the next `appliedEpoch`, closing the echo loop.
 */
export interface SharedPoseProjectEffect {
    readonly kind: 'project';
    readonly surfaces: readonly LinkedCameraSurface[];
    readonly epoch: number;
}

export type SharedPoseEffect = SharedPoseProjectEffect;

export type SharedPoseReduction =
    | {
          readonly ok: true;
          readonly next: SharedCameraPoseState;
          readonly effects: readonly SharedPoseEffect[];
      }
    /** Nothing changed — not the state, not any camera. `rejected` is a human reason. */
    | { readonly ok: false; readonly rejected: string };

// ── Echo / staleness adjudication (THE anti-oscillation guard) ──────────────────────

export type ObservationVerdict = 'accept' | 'echo' | 'stale' | 'future' | 'link-off';

/**
 * Decide whether an observation is a genuine user camera move or the renderer reporting
 * back the pose we just gave it.
 *
 * This is the whole anti-feedback design, and it is pure so it can be PROVEN rather than
 * hoped for (see the ping-pong property test):
 *
 *   • `appliedEpoch < state.epoch` → **stale**. The surface is reporting a pose from before
 *     a newer pose superseded it. This is exactly why `endProgrammaticFly` ignores a stale
 *     token: a superseded flight must not clobber a newer one.
 *   • `appliedEpoch > state.epoch` → **future**. Impossible unless a caller invented a
 *     token; refused loudly rather than trusted.
 *   • equal epoch, pose within tolerance of the current pose → **echo**. The surface is
 *     telling us what we told it. Accepting it is how the oscillation starts.
 *   • equal epoch, pose outside tolerance → **accept**. The user moved the camera.
 *
 * Because acceptance strictly increments the epoch, and a projection at epoch E can only
 * produce observations at `appliedEpoch === E` that are within tolerance, an apply can
 * never re-emit. That is a property of the shape, not of a tuned constant.
 */
export function classifyObservation(
    state: SharedCameraPoseState,
    surface: LinkedCameraSurface,
    pose: SharedCameraPose,
    appliedEpoch: number,
): ObservationVerdict {
    if (state.mode === 'off') return 'link-off';
    if (!Number.isFinite(appliedEpoch)) return 'future';
    if (appliedEpoch > state.epoch) return 'future';
    if (appliedEpoch < state.epoch) return 'stale';

    const next = normalizePose(pose);
    const cur = state.pose;
    const angleSame =
        headingSeparationDeg(next.headingDeg, cur.headingDeg) <= POSE_ECHO_ANGLE_TOLERANCE_DEG &&
        Math.abs(next.pitchDeg - cur.pitchDeg) <= POSE_ECHO_ANGLE_TOLERANCE_DEG;

    if (!angleSame) return 'accept';
    if (state.mode !== 'angle-and-distance') return 'echo';

    // Distance participates only when the mode says it does. Compare against the value the
    // surface was actually GIVEN (its clamped band value), not the raw shared distance —
    // otherwise a clamp would read as a user move on every single frame.
    const given = clampDistanceForSurface(cur.distanceM, surface).distanceM;
    const rel = Math.abs(next.distanceM - given) / Math.max(given, 1e-6);
    return rel > POSE_ECHO_DISTANCE_TOLERANCE_FRACTION ? 'accept' : 'echo';
}

/** Convenience predicate for call sites that only need the boolean. */
export function isEchoObservation(
    state: SharedCameraPoseState,
    surface: LinkedCameraSurface,
    pose: SharedCameraPose,
    appliedEpoch: number,
): boolean {
    return classifyObservation(state, surface, pose, appliedEpoch) === 'echo';
}

// ── The reducer ─────────────────────────────────────────────────────────────────────

/** Every linked surface EXCEPT the one that produced the change. */
export function surfacesToProject(
    origin: LinkedCameraSurface | null,
): readonly LinkedCameraSurface[] {
    return LINKED_CAMERA_SURFACES.filter((s) => s !== origin);
}

/**
 * Reduce one intent. PURE: no camera is touched, no store is written, nothing is scheduled.
 * A rejection mutates NOTHING — including the cameras — which is what makes "the linkage is
 * off" and "the linkage refused" indistinguishable from the user's point of view in the
 * only way that matters: their view does not jump.
 */
export function reduceSharedCameraPose(
    state: SharedCameraPoseState,
    intent: SharedPoseIntent,
): SharedPoseReduction {
    switch (intent.type) {
        case 'view.camera.set-link-mode': {
            if (intent.mode === state.mode) {
                return { ok: false, rejected: `Camera linking is already "${intent.mode}".` };
            }
            const next: SharedCameraPoseState = { ...state, mode: intent.mode, epoch: state.epoch + 1 };
            // Turning the link OFF must not move anything — every view keeps what it shows.
            const effects: readonly SharedPoseEffect[] =
                intent.mode === 'off'
                    ? []
                    : [{ kind: 'project', surfaces: surfacesToProject(state.originSurface), epoch: next.epoch }];
            return { ok: true, next, effects };
        }

        case 'view.camera.reset': {
            const next: SharedCameraPoseState = {
                ...state,
                pose: INITIAL_SHARED_CAMERA_POSE,
                originSurface: null,
                epoch: state.epoch + 1,
            };
            if (state.mode === 'off') {
                return { ok: true, next, effects: [] };
            }
            return {
                ok: true,
                next,
                effects: [{ kind: 'project', surfaces: LINKED_CAMERA_SURFACES, epoch: next.epoch }],
            };
        }

        case 'view.camera.pose-observed': {
            const verdict = classifyObservation(state, intent.surface, intent.pose, intent.appliedEpoch);
            switch (verdict) {
                case 'link-off':
                    return { ok: false, rejected: 'Camera linking is off — this view keeps its own camera.' };
                case 'echo':
                    return {
                        ok: false,
                        rejected:
                            'That camera pose is the one this view was just given — ignored so an ' +
                            'applied pose can never re-emit itself.',
                    };
                case 'stale':
                    return {
                        ok: false,
                        rejected:
                            'That camera report is from before a newer shared pose superseded it ' +
                            `(reported epoch ${intent.appliedEpoch}, current ${state.epoch}).`,
                    };
                case 'future':
                    return {
                        ok: false,
                        rejected:
                            `Camera report carries an epoch (${intent.appliedEpoch}) newer than the ` +
                            `shared pose (${state.epoch}) — refused rather than trusted.`,
                    };
                case 'accept': {
                    const pose = normalizePose(intent.pose);
                    const next: SharedCameraPoseState = {
                        ...state,
                        pose:
                            state.mode === 'angle-and-distance'
                                ? pose
                                : { ...pose, distanceM: state.pose.distanceM },
                        originSurface: intent.surface,
                        epoch: state.epoch + 1,
                    };
                    return {
                        ok: true,
                        next,
                        effects: [
                            {
                                kind: 'project',
                                surfaces: surfacesToProject(intent.surface),
                                epoch: next.epoch,
                            },
                        ],
                    };
                }
            }
        }
    }
}

// ── Projections ─────────────────────────────────────────────────────────────────────

export interface ClampedDistance {
    readonly distanceM: number;
    /** TRUE when the band moved the value. Declared, never silent (see `SharedPoseMode`). */
    readonly clamped: boolean;
}

export function clampDistanceForSurface(
    distanceM: number,
    surface: LinkedCameraSurface,
): ClampedDistance {
    const band = SURFACE_DISTANCE_BAND[surface];
    const d = Number.isFinite(distanceM) && distanceM > 0 ? distanceM : band.minM;
    const clampedValue = Math.max(band.minM, Math.min(band.maxM, d));
    return { distanceM: clampedValue, clamped: clampedValue !== d };
}

/**
 * What the ONE Cesium camera should be set to for `surface`.
 *
 * `headingDeg` passes through UNCHANGED: Cesium's `heading` is already measured clockwise
 * from TRUE north, which is the frame this pose is declared in. **θ is NOT applied here** —
 * see the file header. `rangeM` is the distance about the surface's OWN target, which this
 * module does not own (globe: C60's entry focus; 3D Site: the site).
 *
 * Returns `null` when the linkage is off — the caller must then leave the camera alone.
 */
export function projectPoseToCesium(
    state: SharedCameraPoseState,
    surface: 'globe' | 'site-3d',
): { readonly headingDeg: number; readonly pitchDeg: number; readonly rangeM: number; readonly clamped: boolean; readonly epoch: number } | null {
    if (state.mode === 'off') return null;
    const { distanceM, clamped } = clampDistanceForSurface(state.pose.distanceM, surface);
    return {
        headingDeg: state.pose.headingDeg,
        pitchDeg: state.pose.pitchDeg,
        rangeM: distanceM,
        clamped,
        epoch: state.epoch,
    };
}

/**
 * ADR-0115 / ADR-0070 — convert a TRUE-north bearing into the PROJECT-north authoring frame
 * by subtracting θ. **This is the only place θ is applied in the shared-pose model.**
 *
 * Algebraically identical to the canonical free-vector transform `trueVectorToProjectNorth`
 * (ADR-0115) and to the scalar form `packages/solar-analysis` uses for the sun azimuth
 * (`az − θ`). `SharedCameraPose.test.ts` pins this scalar form against the real vector
 * transform, so the three can never drift apart silently.
 *
 * @param projectNorthRad θ = `SiteLocation.trueNorth`, radians, project→true, clockwise.
 *                        Non-finite / absent ⇒ 0 ⇒ identity (ADR-0070 byte-identity).
 */
export function bimHeadingFromTrueHeading(trueHeadingDeg: number, projectNorthRad: number): number {
    const theta = Number.isFinite(projectNorthRad) ? projectNorthRad : 0;
    return normalizeHeadingDeg(trueHeadingDeg - (theta * 180) / Math.PI);
}

/** Inverse of {@link bimHeadingFromTrueHeading} — a BIM camera reporting its own bearing. */
export function trueHeadingFromBimHeading(bimHeadingDeg: number, projectNorthRad: number): number {
    const theta = Number.isFinite(projectNorthRad) ? projectNorthRad : 0;
    return normalizeHeadingDeg(bimHeadingDeg + (theta * 180) / Math.PI);
}

/** Plain {x,y,z} so this module stays THREE-free (P2). Scene metres. */
export interface ScenePoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface BimOrbitTarget {
    /** Where to put the BIM camera, scene metres. */
    readonly position: ScenePoint;
    /** Echoed back so the caller can `setLookAt(position, target)` in one call. */
    readonly target: ScenePoint;
    /** Bearing in the PROJECT frame, degrees clockwise from project north. Diagnostic. */
    readonly projectHeadingDeg: number;
    readonly clamped: boolean;
    readonly epoch: number;
}

/**
 * What the BIM (THREE) orbit camera should be set to, given the target IT already owns.
 *
 * SCENE AXIS CONVENTION — `{ x = East, y = Up, z = South }`, the convention
 * `packages/solar-analysis/src/solarPosition.ts` states explicitly and
 * `deriveProjectNorthAngleFromParcel` uses (`north = −z`). A project-frame bearing `b`
 * therefore has horizontal direction `(sin b, −cos b)` in (x, z): b=0 (north) → (0,−1);
 * b=90 (east) → (1, 0).
 *
 * `headingDeg` is the direction the camera LOOKS (Cesium's convention, kept identical here
 * so the two projections cannot disagree about what "heading" means), so the camera sits
 * OPPOSITE the look vector: `position = target − distance · look`, and with a negative
 * pitch that puts it above the target.
 *
 * Returns `null` when the linkage is off.
 */
export function projectPoseToBim(
    state: SharedCameraPoseState,
    target: ScenePoint,
    projectNorthRad: number,
): BimOrbitTarget | null {
    if (state.mode === 'off') return null;
    const { distanceM, clamped } = clampDistanceForSurface(state.pose.distanceM, 'bim-3d');
    const projectHeadingDeg = bimHeadingFromTrueHeading(state.pose.headingDeg, projectNorthRad);

    const b = (projectHeadingDeg * Math.PI) / 180;
    const p = (state.pose.pitchDeg * Math.PI) / 180;
    const cosP = Math.cos(p);
    const look: ScenePoint = { x: cosP * Math.sin(b), y: Math.sin(p), z: -cosP * Math.cos(b) };

    return {
        position: {
            x: target.x - distanceM * look.x,
            y: target.y - distanceM * look.y,
            z: target.z - distanceM * look.z,
        },
        target,
        projectHeadingDeg,
        clamped,
        epoch: state.epoch,
    };
}

/**
 * The canonical vector form of {@link bimHeadingFromTrueHeading}, expressed with ADR-0115's
 * own primitive. EXPORTED SOLELY so the spec can pin the scalar against it — production code
 * should call `bimHeadingFromTrueHeading`. Kept here (rather than only in the test) so the
 * equivalence is part of the module's contract, exactly as
 * `projectNorthSolarEquivalence.test.ts` does for the sun.
 */
export function bimHeadingViaCanonicalTransform(
    trueHeadingDeg: number,
    projectNorthRad: number,
): number {
    const b = (normalizeHeadingDeg(trueHeadingDeg) * Math.PI) / 180;
    // A bearing as an (east, north) unit vector in the TRUE frame.
    const v = trueVectorToProjectNorth(
        { east: Math.sin(b), north: Math.cos(b) },
        Number.isFinite(projectNorthRad) ? projectNorthRad : 0,
    );
    return normalizeHeadingDeg((Math.atan2(v.east, v.north) * 180) / Math.PI);
}

// ── Inspectability (the linkage must be visible, never a hidden coupling) ───────────

export interface SharedPoseDescription {
    readonly enabled: boolean;
    readonly mode: SharedPoseMode;
    readonly headline: string;
    readonly lines: readonly string[];
}

/**
 * Pure projection of the state into human copy, so "what does the user see" is a unit test
 * rather than a screenshot review (the C60 §3 discipline). A silent camera coupling is a
 * mystery; a stated one is a feature.
 */
export function describeSharedPose(state: SharedCameraPoseState): SharedPoseDescription {
    const bearing = Math.round(state.pose.headingDeg);
    const tilt = Math.round(state.pose.pitchDeg);
    if (state.mode === 'off') {
        return {
            enabled: false,
            mode: 'off',
            headline: 'Camera linking is off',
            lines: [
                'The globe, the 3D Site and the 3D model each keep their own camera and return ' +
                    'to where you left them.',
            ],
        };
    }
    return {
        enabled: true,
        mode: state.mode,
        headline: `Linked camera — ${bearing}° from true north, ${Math.abs(tilt)}° down`,
        lines: [
            'The globe, the 3D Site and the 3D model share one viewing angle. Moving any of ' +
                'them turns the others to match.',
            state.mode === 'angle-and-distance'
                ? 'Distance is shared too, clamped into each view’s usable range.'
                : 'Each view keeps its own distance — only the angle is shared.',
            'Plans, sections and elevations are not linked; they keep their own camera.',
            'The angle is measured from TRUE north, so it reads the same on the globe as in ' +
                'the model even where the drawing frame is rotated.',
        ],
    };
}
