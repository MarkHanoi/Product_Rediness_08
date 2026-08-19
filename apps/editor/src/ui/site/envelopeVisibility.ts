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

/** The persisted key. Namespaced so it can never collide with project data. */
const STORAGE_KEY = 'pryzm.site.buildableEnvelopeVisible';

/** Default ON — C58 §1.4: an envelope that silently fails to arrive reads as
 *  "there is no constraint here", which is the false negative the contract
 *  forbids. Only an explicit user "off" may hide it. */
const DEFAULT_VISIBLE = true;

type Listener = (visible: boolean) => void;

const listeners = new Set<Listener>();

/** Read the persisted preference. Never throws (private mode / disabled storage). */
function readPersisted(): boolean {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_VISIBLE;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_VISIBLE;
        return raw !== '0';
    } catch {
        return DEFAULT_VISIBLE;
    }
}

let visible: boolean = readPersisted();

/**
 * ⭐ THE ONE READ. Every surface that can put a buildable-envelope solid on screen
 * — the Cesium §1.14 rasteriser, the BIM/plan three.js volume, and the resolver
 * that feeds them — asks THIS and nothing else.
 */
export function isBuildableEnvelopeVisible(): boolean {
    return visible;
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
 */
export function setBuildableEnvelopeVisible(next: boolean): void {
    if (visible === next) return;
    visible = next;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        }
    } catch { /* preference persistence is best-effort; the live flag still holds */ }
    console.log(
        `[gis][c58] §ENVELOPE-ONE-VISIBILITY — buildable envelope set ${next ? 'VISIBLE' : 'HIDDEN'} ` +
            `by the user; ${listeners.size} surface(s) notified.`,
    );
    for (const fn of [...listeners]) {
        try { fn(next); }
        catch (e) { console.warn('[gis][c58] §ENVELOPE-ONE-VISIBILITY listener threw (non-fatal):', e); }
    }
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

/** Test-only reset — restores the default and drops every subscriber. */
export function __resetBuildableEnvelopeVisibilityForTests(): void {
    visible = DEFAULT_VISIBLE;
    listeners.clear();
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    } catch { /* nothing to clean up */ }
}
