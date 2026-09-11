// §ENVELOPE-DRAW-ON-THE-SITE-VIEWS (lane ENVELOPE-DRAW, 2026-09-07) — the session slot holding the
// perimeter the user DREW on a site view, and the push channel that gets it into the create panel.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §2 "The drawn-ring hand-off store" · L-13050 · C58 §1.19.
//
// Modelled line-for-line on `targetFootprintAreaState.ts` next door, and for the same reason: a
// gesture WRITES, surfaces SUBSCRIBE and repaint themselves. That is what makes *"the user drew a
// ring but the panel never heard"* structurally impossible rather than a branch someone remembered.
//
// ⛔ RING AND AREA TRAVEL TOGETHER, FROM ONE PRODUCER. `buildEnvelopeAuthoringPlan` refuses to
// recompute an area (*"a second area routine is how a card comes to state a figure the scene
// disagrees with"*, C84 EI-9), so the slot carries the figure the gesture computed — through the
// kernel's ONE shoelace, `polygonSignedAreaOrdinates` (C73) — beside the ring it was computed from.
//
// ⛔ SESSION-ONLY, NOT PERSISTED, AND THAT IS A DECISION — the same argument
// `targetFootprintAreaState.ts:11-17` makes. A drawn perimeter is an EXPLORATION the user is about to
// commit as an element; the element is what persists (through `spaceEnvelope.batch.create`). A ring
// restored silently on the next load would sit on the ground as a proposal nobody in that session
// drew, about a site frame that may since have been re-seated.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ ADR-0383 S5 (lane MP-UI, 2026-09-09) — THE SLOT IS NOW A **ROSTER**, AND THAT IS A
//    GENERALISATION OF THIS MODULE, NOT A SECOND MODULE BESIDE IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder, on master planning: *"define multiple profiles first — I NEED TO DECIDE HOW MANY — then
// define the levels and create bulk all the envelopes for all the profiles"*.
//
// ADR-0383 D2 rules that "N profiles" is a TRANSIENT AUTHORING STATE, not a persisted record, and
// names this module as the thing that already holds exactly that for one ring:
//
//   > *"That module is GENERALISED from a slot to a roster — not rivalled by a second module. The
//   >  existing `getDrawnEnvelopeFootprint()` keeps its exact meaning ('the most recent profile'),
//   >  so every current caller is untouched, and a new `getDrawnEnvelopeProfiles()` returns the
//   >  whole list."*
//
// ⛔ SO THE THREE HISTORIC ENTRY POINTS ARE UNCHANGED IN MEANING, AND THAT IS CHECKED BY THE
// EXISTING SPECS RATHER THAN ASSERTED HERE:
//   · `getDrawnEnvelopeFootprint()`   → the LAST profile's footprint, or `null` when the roster is
//                                       empty. With ≤ 1 profile — which is every session that
//                                       predates this change — that is byte-identical to the old
//                                       single slot.
//   · `setDrawnEnvelopeFootprint(x)`  → REPLACES the most recent profile in place (keeping its id
//                                       and its label), or seeds the first one when the roster is
//                                       empty. Drawing again still replaces; the panel's own
//                                       sentence *"Draw again to replace this perimeter"* stays true.
//   · `setDrawnEnvelopeFootprint(null)` / `clearDrawnEnvelopeFootprint()`
//                                     → clears the WHOLE roster. That is the historic meaning of
//                                       *"nothing has been drawn this session"* and it is kept: the
//                                       callers are the panel's discard button and the arming
//                                       module's settled-ring reset, and both mean "forget the
//                                       exploration", not "pop one entry". Removing ONE profile has
//                                       its own verb (`removeDrawnEnvelopeProfile`).
//
// ⭐ HOW A SECOND PROFILE IS CREATED, AND WHY THERE IS **NO MODE FLAG**. `addDrawnEnvelopeProfile`
// APPENDS a new entry seeded with the ring passed to it — in practice the ring the user is looking
// at — and the very next draw replaces that new last entry, because "the draw writes the most
// recent profile" never changed. So the whole multi-profile flow is two existing rules composed:
//
//     draw A            → [P1(A)]
//     "add another"     → [P1(A), P2(A)]      ← P2 starts as a copy, and the panel SAYS so
//     draw B            → [P1(A), P2(B)]
//
// ⛔ A CAPTURE-MODE FLAG ("the next draw appends instead of replacing") WAS REJECTED. It is hidden
// state that decides what a gesture means, read by one surface and written by another — the exact
// shape of [[view-region-one-owner]] (six writers of one property, oscillating). The seeded copy is
// visible, is stated on the control that makes it, and is undone by drawing.
//
// ⛔ AN EMPTY PROFILE IS NOT REPRESENTABLE, deliberately (ADR-0383 D2's stated consequence, applied
// one level earlier): a profile IS a ring, and a placeholder with no ring would invite the planner
// to ask *"what does a profile with no perimeter extrude to?"* — the same question the degenerate-
// ring refusal below exists to withhold an invented answer to.

import { trace } from '@opentelemetry/api';
import type { EnvelopeDrawSurfaceId, EnvelopeRosterRing, SceneXZPoint } from './envelopeDrawSurface';

const _tracer = trace.getTracer('pryzm.site.drawnEnvelopeFootprintState');

/** The six gestures the envelope draw offers — the slab family's two existing unions, unmerged. */
export type EnvelopeDrawMode = 'linear' | 'ortho' | 'curved' | 'rectangular' | 'circular' | 'elliptical';

/** What the user drew. Ring in project-frame scene-XZ metres (see `envelopeDrawSurface.ts`). */
export interface DrawnEnvelopeFootprint {
    readonly ring: readonly SceneXZPoint[];
    /** |shoelace| of `ring`, m² — computed ONCE by the gesture, never re-derived downstream. */
    readonly areaM2: number;
    /** Which site view it was drawn on. Printed, so the panel can name its own provenance. */
    readonly surfaceId: EnvelopeDrawSurfaceId;
    readonly mode: EnvelopeDrawMode;
}

/**
 * ADR-0383 S5 — ONE entry in the transient roster: a perimeter the user drew, plus the identity a
 * panel needs to talk about it before any element exists.
 *
 * ⛔ `profileId` IS NOT AN ELEMENT ID AND NEVER BECOMES ONE. It names a row in a session-only
 * exploration. The ids the batch create mints are minted by the CALLER at dispatch time
 * (C16 CA-2) and have no relationship to this string — reusing this one would put a
 * session-scoped identifier on a persisted record.
 */
export interface DrawnEnvelopeProfile {
    readonly profileId: string;
    /**
     * What the user calls this profile. Defaulted to `Profile N` at mint time and renameable.
     *
     * ⚠ THE NUMBER IS THE MINT INDEX, NOT THE POSITION. Delete Profile 1 and the roster reads
     * `[Profile 2]` rather than silently renumbering — a label that moves under the user is how a
     * roster and a scene come to disagree about which block is which.
     */
    readonly label: string;
    readonly footprint: DrawnEnvelopeFootprint;
}

/**
 * The most profiles one session may hold. A guard against a pasted loop, NOT a design limit on how
 * many buildings a master plan may have — the same posture as `AUTHORING_MAX_STOREYS`.
 */
export const DRAWN_ENVELOPE_MAX_PROFILES = 24;

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * THE ONE STATE. Empty ⇒ nothing has been drawn this session (or the roster was cleared).
 *
 * ⛔ ONE ARRAY, NOT "a slot plus a list". Two containers for one exploration would need a rule
 * about which wins, and that rule is exactly the drift this module was written to make impossible.
 */
let profiles: readonly DrawnEnvelopeProfile[] = Object.freeze([]);

/** Monotonic within a session; reset with the roster. Feeds both the id and the default label. */
let mintCount = 0;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][envelope-draw] §ENVELOPE-DRAW listener threw (non-fatal):', e);
        }
    }
}

/**
 * The ONE degeneracy rule, shared by every write.
 *
 * ⛔ ONLY A RING OF THREE OR MORE VERTICES WITH A FINITE POSITIVE AREA MAY BE STORED. A degenerate
 * drawing is a REFUSAL for the user to read (the gesture prints it), never a thing to hand to the
 * planner — storing one would invite the panel to ask "what does a two-point envelope extrude to?",
 * and the answer it would invent is exactly the shape the refusal exists to withhold.
 */
function isStorable(f: DrawnEnvelopeFootprint): boolean {
    return f.ring.length >= 3 && Number.isFinite(f.areaM2) && f.areaM2 > 0;
}

function refuseDegenerate(f: DrawnEnvelopeFootprint, what: string): void {
    console.warn(
        `[site][envelope-draw] §ENVELOPE-DRAW refused to store a degenerate ring (${what}: `
        + `${f.ring.length} vertices, ${f.areaM2} m²). The roster is unchanged.`,
    );
}

// ── THE HISTORIC THREE — meaning unchanged, see the header ───────────────────────────────────

/**
 * THE ONE READ. The MOST RECENT profile's footprint, or `null` when nothing has been drawn.
 *
 * ⭐ ADR-0383 S5 keeps this signature and this meaning EXACTLY, so every caller written against
 * the single slot — `resolveFootprintSource`'s top rung, the site tool's draw-status line, the
 * arming module's settled-ring reset — is untouched by the roster.
 */
export function getDrawnEnvelopeFootprint(): DrawnEnvelopeFootprint | null {
    const last = profiles[profiles.length - 1];
    return last === undefined ? null : last.footprint;
}

/**
 * THE ONE WRITE OF THE MOST RECENT PROFILE. Pass `null` to clear the WHOLE roster.
 *
 * Non-null REPLACES the last profile's footprint in place — its `profileId` and `label` survive,
 * because redrawing Block B's perimeter does not make it a different block. With an empty roster
 * it seeds the first profile, which is the pre-ADR-0383 behaviour exactly.
 *
 * See the header for why `null` clears everything rather than popping one entry.
 */
export function setDrawnEnvelopeFootprint(next: DrawnEnvelopeFootprint | null): void {
    const span = _tracer.startSpan('pryzm.site.setDrawnEnvelopeFootprint');
    try {
        if (next === null) {
            if (profiles.length === 0) return;
            profiles = Object.freeze([]);
            span.setAttribute('pryzm.envelopeDraw.present', false);
            span.setAttribute('pryzm.envelopeDraw.profiles', 0);
            notify();
            return;
        }
        if (!isStorable(next)) {
            span.setAttribute('pryzm.envelopeDraw.refused', 'degenerate');
            refuseDegenerate(next, 'replace');
            return;
        }
        const last = profiles[profiles.length - 1];
        if (last !== undefined && last.footprint === next) return;
        if (last === undefined) {
            mintCount += 1;
            profiles = Object.freeze([
                Object.freeze({
                    profileId: `dp_${mintCount}`,
                    label: `Profile ${mintCount}`,
                    footprint: next,
                }),
            ]);
        } else {
            profiles = Object.freeze([
                ...profiles.slice(0, -1),
                Object.freeze({ profileId: last.profileId, label: last.label, footprint: next }),
            ]);
        }
        span.setAttribute('pryzm.envelopeDraw.present', true);
        span.setAttribute('pryzm.envelopeDraw.profiles', profiles.length);
        span.setAttribute('pryzm.envelopeDraw.vertices', next.ring.length);
        span.setAttribute('pryzm.envelopeDraw.areaM2', next.areaM2);
        span.setAttribute('pryzm.envelopeDraw.surface', next.surfaceId);
        notify();
    } finally {
        span.end();
    }
}

/** Subscribe a surface or panel. Returns its own unsubscribe. Fires on ANY roster change. */
export function subscribeDrawnEnvelopeFootprint(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/**
 * Drop the exploration. The user redrew, cleared it, or the site frame it was drawn about moved.
 *
 * ⛔ CLEARS EVERY PROFILE, not just the newest — see the header. A site frame that moved
 * invalidates every ring drawn about it, and the panel's discard control means "go back to the
 * footprint PRYZM solved", which is a statement about the whole exploration.
 */
export function clearDrawnEnvelopeFootprint(): void {
    setDrawnEnvelopeFootprint(null);
}

// ── ADR-0383 S5 — THE ROSTER ─────────────────────────────────────────────────────────────────

/**
 * THE ONE READ OF THE WHOLE ROSTER, oldest first. Empty ⇒ nothing drawn this session.
 *
 * ⚠ EMPTY IS AN EMPTINESS, AND THERE IS NO FAILURE ARM HERE — deliberately. §CONTEXT-DATA-HONESTY
 * demands the two never share a value, and this module cannot fail to read: the roster is a
 * module-local array, not an I/O. A caller that needs "could not read" is asking the STORE
 * (`readLevelEnvelopes`), which has its own two-armed result for exactly that reason.
 */
export function getDrawnEnvelopeProfiles(): readonly DrawnEnvelopeProfile[] {
    return profiles;
}

/** One profile by id, or `null`. Never throws. */
export function getDrawnEnvelopeProfile(profileId: string): DrawnEnvelopeProfile | null {
    return profiles.find((p) => p.profileId === profileId) ?? null;
}

/**
 * APPEND a new profile, seeded with `footprint`. Returns the profile, or `null` when it was
 * refused (degenerate ring, or the roster is at `DRAWN_ENVELOPE_MAX_PROFILES`).
 *
 * ⭐ THE NEXT DRAW REPLACES THIS ONE. That is not a special case — it is
 * `setDrawnEnvelopeFootprint`'s unchanged rule ("write the most recent profile") meeting a roster
 * whose most recent profile is the one just appended. The control that calls this must say so on
 * its own face; the panel does.
 */
export function addDrawnEnvelopeProfile(
    footprint: DrawnEnvelopeFootprint,
    label?: string,
): DrawnEnvelopeProfile | null {
    const span = _tracer.startSpan('pryzm.site.addDrawnEnvelopeProfile');
    try {
        if (!isStorable(footprint)) {
            span.setAttribute('pryzm.envelopeDraw.refused', 'degenerate');
            refuseDegenerate(footprint, 'append');
            return null;
        }
        if (profiles.length >= DRAWN_ENVELOPE_MAX_PROFILES) {
            span.setAttribute('pryzm.envelopeDraw.refused', 'roster-full');
            console.warn(
                `[site][envelope-draw] ADR-0383 S5 refused a ${profiles.length + 1}th profile — the `
                + `session roster holds at most ${DRAWN_ENVELOPE_MAX_PROFILES}. This is a guard `
                + 'against a runaway caller, not a limit on how many buildings a master plan may '
                + 'have; remove a profile you no longer want and add again.',
            );
            return null;
        }
        mintCount += 1;
        const trimmed = typeof label === 'string' ? label.trim() : '';
        const profile: DrawnEnvelopeProfile = Object.freeze({
            profileId: `dp_${mintCount}`,
            label: trimmed.length > 0 ? trimmed : `Profile ${mintCount}`,
            footprint,
        });
        profiles = Object.freeze([...profiles, profile]);
        span.setAttribute('pryzm.envelopeDraw.profiles', profiles.length);
        notify();
        return profile;
    } finally {
        span.end();
    }
}

/**
 * Rename one profile. Session-only, like everything here.
 *
 * ⛔ THIS IS NOT `spaceEnvelope.group.rename` AND MUST NOT BE CONFUSED WITH IT. That verb renames a
 * GROUP — a persisted value denormalised across N envelope records, rewritten in one
 * `produceCommand` (ADR-0383 D1). This renames a row in an exploration that no element exists for
 * yet. An empty or blank name is refused rather than stored; a profile with no name is a row the
 * roster cannot talk about.
 */
export function renameDrawnEnvelopeProfile(profileId: string, label: string): void {
    const span = _tracer.startSpan('pryzm.site.renameDrawnEnvelopeProfile');
    try {
        const trimmed = typeof label === 'string' ? label.trim() : '';
        if (trimmed.length === 0) {
            span.setAttribute('pryzm.envelopeDraw.refused', 'blank-label');
            return;
        }
        const idx = profiles.findIndex((p) => p.profileId === profileId);
        if (idx < 0) return;
        const current = profiles[idx]!;
        if (current.label === trimmed) return;
        const next = [...profiles];
        next[idx] = Object.freeze({ ...current, label: trimmed });
        profiles = Object.freeze(next);
        span.setAttribute('pryzm.envelopeDraw.profiles', profiles.length);
        notify();
    } finally {
        span.end();
    }
}

/** Drop ONE profile. A no-op when the id is unknown. */
export function removeDrawnEnvelopeProfile(profileId: string): void {
    const span = _tracer.startSpan('pryzm.site.removeDrawnEnvelopeProfile');
    try {
        const next = profiles.filter((p) => p.profileId !== profileId);
        if (next.length === profiles.length) return;
        profiles = Object.freeze(next);
        span.setAttribute('pryzm.envelopeDraw.profiles', profiles.length);
        notify();
    } finally {
        span.end();
    }
}

/** Drop every profile. The named twin of `clearDrawnEnvelopeFootprint()`, which does the same. */
export function clearDrawnEnvelopeProfiles(): void {
    setDrawnEnvelopeFootprint(null);
}

/**
 * ⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — THE RINGS A SITE SURFACE PAINTS FOR THE ROSTER.
 *
 * The founder: *"When the user adds another profile - the previous profile gets deleted from the
 * view - then it is still there - but we dont render - neither in plan view nor in 3d view"*.
 * The roster was right and the picture was not: the only paint was a single "settled ring" on the
 * ONE surface that owned the gesture, cleared by the next arm. This is the read both site surfaces
 * now paint from, so *"in the roster"* and *"on screen"* are one fact instead of two lifetimes.
 *
 * One entry per DISTINCT footprint object, oldest first — a seeded copy (`addDrawnEnvelopeProfile`
 * stores the very same frozen footprint, the reference equality `undrawnCopies` reads) shares its
 * source's entry. See `EnvelopeRosterRing` for why two coplanar paints of one ring are not wanted.
 * Pure: reads the argument only, never the slot, so a caller decides which roster it paints.
 */
export function envelopeRosterRings(
    list: readonly DrawnEnvelopeProfile[],
): EnvelopeRosterRing[] {
    const span = _tracer.startSpan('pryzm.site.envelopeRosterRings');
    try {
        const byFootprint = new Map<DrawnEnvelopeFootprint, { profileIds: string[]; label: string; ring: readonly SceneXZPoint[] }>();
        const out: Array<{ profileIds: string[]; label: string; ring: readonly SceneXZPoint[] }> = [];
        for (const p of list) {
            const seen = byFootprint.get(p.footprint);
            if (seen !== undefined) { seen.profileIds.push(p.profileId); continue; }
            const entry = { profileIds: [p.profileId], label: p.label, ring: p.footprint.ring };
            byFootprint.set(p.footprint, entry);
            out.push(entry);
        }
        span.setAttribute('pryzm.envelopeDraw.profiles', list.length);
        span.setAttribute('pryzm.envelopeDraw.rings', out.length);
        return out;
    } finally {
        span.end();
    }
}

/** Test-only reset — clears the roster, the mint counter and every subscriber. */
export function __resetDrawnEnvelopeFootprintForTests(): void {
    profiles = Object.freeze([]);
    mintCount = 0;
    listeners.clear();
}
