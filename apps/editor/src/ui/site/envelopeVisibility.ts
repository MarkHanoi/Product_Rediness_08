// ════════════════════════════════════════════════════════════════════════════
// §ENVELOPE-ONE-VISIBILITY (L-1170) — THE SINGLE AUTHORITY FOR
// "should the C58 buildable envelope be on screen?"
// ════════════════════════════════════════════════════════════════════════════
//
// THE DEFECT THIS CLOSES (founder, 2026-08-19, production):
//   "I just selected the Level 15 top level for roof creation and an ENVELOPE
//    showed up — I tried to hide it but it did not work."
//
// FOUR separate things answered that one question, and they disagreed:
//
//   1. `formaEnvelopeVisible` — a `let` inside `mountGISArea`'s ~4800-line
//      closure, written by the card's `Envelope: ON/OFF` button and read by
//      EXACTLY ONE function (`resolveFormaEnvelope`). Nothing else in the
//      program could see it, and it was reachable only while that card existed.
//   2. `CesiumViewport.formaLastMassingInput.envelope` — a SNAPSHOT of whatever
//      (1) answered at the last full render, REPLAYED without re-asking by
//      `setVisibleFormaLevels` (⭐ the floor selector — the founder's "selected
//      Level 15"), `setGlobeBuildingFidelity`, `clampTerrainThenReplace` and
//      `rerenderFormaMassing`. A snapshot of an answer is a second answer the
//      moment the first one changes.
//   3. `CesiumViewport.formaSiteOverlayEntities` — the §SITE-OVERLAY-NOT-BUILDING
//      (L-464/L-468) SURVIVAL set, which deliberately exempts envelope entities
//      from `setGlobeBuildingShown`. Correct for its own purpose (a constraint
//      does not stop applying because the proposal is being re-drawn) and a
//      third answer all the same: it makes an already-added solid unhideable.
//   4. `ParcelBoundarySceneRenderer.buildEnvelopeVolume()` — draws the envelope
//      into the BIM/plan three.js scene straight off `getLastBuildableEnvelope()`
//      and consulted NO toggle at all, ever.
//
// That is C84 EI-1 (one authority per question) breached four ways. The founder's
// symptom is the inevitable consequence: hiding writes (1); the floor selector
// re-renders from (2); (3) protects what is already there; and (4) never even
// looked. He is not wrong that "hide" does not work — it has never been one thing.
//
// ⚠ WHICH ONE WAS HIS, from the log rather than from plausibility: `§ENVELOPE-REINSET`
// fires only when `getLastBuildableEnvelope()` returned null-or-not-`ok`, and (4)
// reads THAT SAME function — so (4) drew nothing in his session. His box was the
// CESIUM one, from (2)'s replay and/or the old toggle's dead third branch. (4) is a
// real member of this family — unhideable the moment an envelope DID solve — and it
// is fixed here, but it was not the instance he hit. Do not re-attribute it.
//
// ⛔ THE FIX IS NOT A FIFTH CHECK. It is this module plus ONE CHOKEPOINT: the
// §1.14 rasteriser in `CesiumViewport.renderFormaMassing` gates `input.envelope`
// on `isBuildableEnvelopeVisible()` BEFORE the entity-add loop. Every replay path
// above funnels through `renderFormaMassing`, so a stale snapshot can no longer
// smuggle a solid onto the globe: the payload may be stale, the ANSWER never is.
// `ParcelBoundarySceneRenderer` gates the same way, and both re-paint from the
// subscription below rather than from their own idea of when to look.
//
// WHY A MODULE GLOBAL AND NOT A STORE. This is view chrome, not project data —
// it must NOT round-trip through the document, must not be undoable, and must not
// be part of a CRDT merge. It is the same shape as `panelDefaults`, and it is
// deliberately NOT registered with `projectScopeRegistry`: "I don't want to look
// at the grey box" is a statement about the user, not about the project, so it
// survives a project switch exactly as a panel-open preference does.
//
// PERSISTENCE. The founder's ask includes "prove it survives … a project reload",
// which is a PAGE LOAD — a module `let` cannot. One namespaced localStorage key,
// fully guarded: a storage failure degrades to the in-memory default (visible),
// never to a throw on a render path.

// ════════════════════════════════════════════════════════════════════════════
// §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — ONE AUTHORITY, TWO AXES.
// ════════════════════════════════════════════════════════════════════════════
//
// THE FOUNDER'S REPORT (2026-08-19, production, Barcelona 424 m² parcel):
//   "When the envelope is OFF we should see this shade on the GROUND."
//
// L-1170's gate suppressed the WHOLE envelope solid, so hiding the VOLUME also
// hid the only ground-plane answer. The two representations answer DIFFERENT
// questions and one is useful precisely when the other is off:
//   • VOLUME    — "what mass may I build?"  Obstructive; turned off to see the design.
//   • FOOTPRINT — "what area may I build on?"  Flat; occludes nothing.
//
// ⛔ THE FIX IS NOT A SECOND AUTHORITY — that is the exact shape L-1170 removed.
// It is THIS module carrying TWO booleans, one subscription, and one pure
// projection rule in L2 (`applyEnvelopeVisibilityAxes`) that BOTH rasterisers
// read. The `Envelope: ON/OFF` control writes the VOLUME axis only; the FOOTPRINT
// axis exists so "hide everything" is expressible without a fifth authority, and
// so a future control has exactly one place to write.

// ⚠ TYPE-ONLY, deliberately. This module is a ZERO-RUNTIME-DEPENDENCY leaf (that is what lets the
// Cesium viewport and the BIM renderer both import it by file with no cycle risk), and a
// `import type` is erased at compile — it adds no runtime edge. The SHAPE of the axes belongs with
// the pure L2 rule that consumes them (`applyEnvelopeVisibilityAxes`), not re-declared here, or the
// authority and the rule could disagree about what a pair of booleans means.
import type { EnvelopeVisibilityAxes } from '@pryzm/site-parcel-data';

/** The persisted key for the VOLUME axis. Namespaced so it can never collide with project data.
 *  ⚠ NAME UNCHANGED — an existing user's "off" must survive this change; it was, and remains,
 *  the answer to "is the extruded envelope volume on screen?". */
const STORAGE_KEY = 'pryzm.site.buildableEnvelopeVisible';

/** §ENVELOPE-TWO-AXES — the persisted key for the GROUND FOOTPRINT axis. */
const FOOTPRINT_STORAGE_KEY = 'pryzm.site.buildableEnvelopeFootprintVisible';

/** Default ON — C58 §1.4: an envelope that silently fails to arrive reads as
 *  "there is no constraint here", which is the false negative the contract
 *  forbids. Only an explicit user "off" may hide it. */
const DEFAULT_VISIBLE = true;

/**
 * §ENVELOPE-TWO-AXES — the FOOTPRINT default. ON, and for a stronger reason than §1.4's general
 * false-negative rule: the whole point of L-1188 is that hiding the volume must not delete the
 * ground answer. A user who has never expressed an opinion about the footprint has certainly not
 * asked for it to vanish when they dismiss the box.
 */
const DEFAULT_FOOTPRINT_VISIBLE = true;

/** ⚠ The listener signature takes NO argument. It used to take the volume boolean, which quietly
 *  invited a subscriber to render from THAT rather than re-asking — a snapshot, i.e. the L-1170
 *  defect one level down. With two axes a single boolean cannot describe the answer at all, so the
 *  notification says only "it changed; re-ask". */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Read the persisted preference. Never throws (private mode / disabled storage). */
function readPersisted(key: string, fallback: boolean): boolean {
    try {
        if (typeof localStorage === 'undefined') return fallback;
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return raw !== '0';
    } catch {
        return fallback;
    }
}

/** Write one axis's preference. Best-effort — a storage failure never reaches a render path. */
function writePersisted(key: string, value: boolean): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value ? '1' : '0');
    } catch { /* preference persistence is best-effort; the live flag still holds */ }
}

/** Notify every subscribed surface that the answer changed. A listener that throws is logged and
 *  skipped — one broken surface must never stop the others honouring the user's choice. */
function notify(): void {
    for (const fn of [...listeners]) {
        try { fn(); }
        catch (e) { console.warn('[gis][c58] §ENVELOPE-ONE-VISIBILITY listener threw (non-fatal):', e); }
    }
}

let visible: boolean = readPersisted(STORAGE_KEY, DEFAULT_VISIBLE);
let footprintVisible: boolean = readPersisted(FOOTPRINT_STORAGE_KEY, DEFAULT_FOOTPRINT_VISIBLE);

/**
 * ⭐ THE ONE READ — the VOLUME axis. "Is the extruded buildable-envelope solid on screen?"
 *
 * ⚠ §ENVELOPE-TWO-AXES (L-1188) — this is NOT "is the envelope on screen?" any more. Hiding the
 * volume leaves the GROUND FOOTPRINT shade, which is the whole point of L-1188. A rasteriser must
 * therefore read `getBuildableEnvelopeAxes()` and hand it to the L2 `applyEnvelopeVisibilityAxes`,
 * NOT branch on this boolean — a renderer that branches here re-decides the projection rule locally,
 * which is how the globe and the BIM scene drift apart. Kept as the named read for the CONTROL
 * (which owns exactly this axis) and for the §1.15 structural pin.
 */
export function isBuildableEnvelopeVisible(): boolean {
    return visible;
}

/**
 * §ENVELOPE-TWO-AXES — the FOOTPRINT axis. "Should the flat ground shade be drawn when the volume
 * is not?" Default ON; no control writes it today (see the header) — it exists so that "hide
 * everything" is expressible without minting a second authority.
 */
export function isBuildableEnvelopeFootprintVisible(): boolean {
    return footprintVisible;
}

/**
 * ⭐ THE ONE READ A RASTERISER USES. Both axes, together, as the L2
 * `applyEnvelopeVisibilityAxes(solids, axes)` consumes them.
 */
export function getBuildableEnvelopeAxes(): EnvelopeVisibilityAxes {
    return { volume: visible, footprint: footprintVisible };
}

/**
 * ⭐ THE ONE WRITE. The `Envelope: ON/OFF` control calls this and does nothing
 * else — it does not re-render, does not reach into a viewport, and does not
 * decide which renderer to poke. Subscribers repaint themselves, which is what
 * makes "the toggle changed the flag but the scene never heard" structurally
 * impossible rather than a branch someone remembered to write.
 *
 * No-ops (and notifies nobody) when the value is unchanged, so an idempotent
 * re-assert cannot cost a Cesium re-render.
 *
 * §ENVELOPE-TWO-AXES — writes the VOLUME axis ONLY. It does not touch the footprint: "I do not want
 * the box over my design" is not a statement about the buildable AREA.
 */
export function setBuildableEnvelopeVisible(next: boolean): void {
    if (visible === next) return;
    visible = next;
    writePersisted(STORAGE_KEY, next);
    console.log(
        `[gis][c58] §ENVELOPE-ONE-VISIBILITY — buildable envelope VOLUME set ${next ? 'VISIBLE' : 'HIDDEN'} ` +
            `by the user (ground footprint shade ${footprintVisible ? 'STAYS — §ENVELOPE-TWO-AXES' : 'also hidden'}); ` +
            `${listeners.size} surface(s) notified.`,
    );
    notify();
}

/**
 * §ENVELOPE-TWO-AXES — write the FOOTPRINT axis. Same contract as the volume write: it only writes,
 * and the surfaces repaint from the subscription.
 */
export function setBuildableEnvelopeFootprintVisible(next: boolean): void {
    if (footprintVisible === next) return;
    footprintVisible = next;
    writePersisted(FOOTPRINT_STORAGE_KEY, next);
    console.log(
        `[gis][c58] §ENVELOPE-TWO-AXES — buildable envelope GROUND FOOTPRINT set ` +
            `${next ? 'VISIBLE' : 'HIDDEN'} by the user; ${listeners.size} surface(s) notified.`,
    );
    notify();
}

/**
 * Subscribe a rendering surface to the authority. Returns its own unsubscribe.
 *
 * A listener that throws is logged and skipped — one broken surface must never
 * stop the others from honouring the user's choice (the same rule
 * `ParcelBoundarySceneRenderer.disposeGroup` learned the hard way in §L-676-B).
 */
export function subscribeBuildableEnvelopeVisibility(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Test-only reset — restores BOTH defaults and drops every subscriber. */
export function __resetBuildableEnvelopeVisibilityForTests(): void {
    visible = DEFAULT_VISIBLE;
    footprintVisible = DEFAULT_FOOTPRINT_VISIBLE;
    listeners.clear();
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(FOOTPRINT_STORAGE_KEY);
        }
    } catch { /* nothing to clean up */ }
}
