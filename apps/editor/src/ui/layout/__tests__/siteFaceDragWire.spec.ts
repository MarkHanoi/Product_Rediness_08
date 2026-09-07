// THE WIRE — the static links that make the 3-D Site's FACE DRAG reachable, and per-storey.
// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS · §ENVELOPE-FACE-DRAG-PER-LEVEL (L-13236) · C114 §10 / §11
// item 7 / §14 · C115-56 · C115-27 · C84 EI-9 · [[committed-is-not-reachable]].
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS FILE EXISTS: THE ENTIRE 3-D SITE INSTALL COULD BE DELETED AND EVERY SUITE STAYED GREEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `siteEnvelopeFaceDragCesium.spec.ts` (305 lines, 15 arms) covers the ADAPTER — its three refusal
// states, the frame-gate short circuit, the preview and camera delegation, and the ray maths as
// source text. It asserts NOTHING about `GISAreaLayout` actually CALLING
// `installSpaceEnvelopeFaceDragOnSurface`. So the one line that turns the 3-D Site into a face-drag
// surface was, until this file, the single least-protected link in the whole chain: removing it
// would have broken the founder's gesture and broken no test.
//
// `spaceEnvelopeProfileEditWire.spec.ts` established this pattern for the BIM side and states the
// reason in its own words: *"a missing static link still breaks the chain, and a chain is only as
// good as the link nobody tested."* `GISAreaLayout` cannot be imported in a unit test — it builds a
// Cesium viewer, a MapLibre map and a dozen panels — so the alternative to reading its source is
// not a better test, it is NO test.
//
// ✅ ESTABLISHES: the gesture is installed on the 3-D Site canvas · the adapter is registered so the
//    panel can ask it whether a drag is possible · the double-click seam reaches the SHIPPED outline
//    tool on this surface too · the live metre readout is written to a REAL element rather than an
//    event with no listener · the per-storey focus is passed on BOTH 3-D surfaces from ONE slot ·
//    and the whole thing is disposed and unregistered on teardown.
// ⛔ DOES NOT ESTABLISH: that anything is drawn, or that any of it works in a browser. Source is not
//    behaviour, and nothing in this family is browser-verified (C114 §14d).

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(EDITOR_SRC, rel), 'utf8');

const gis = read('ui/layout/GISAreaLayout.ts');
const initTools = read('engine/initTools.ts');
const attach = read('engine/attachSpaceEnvelopeRender.ts');
const controller = read('engine/spaceEnvelopeFaceDragController.ts');
const core = read('engine/spaceEnvelopeDragSurface.ts');
const adapter = read('ui/site/siteEnvelopeDrawCesium.ts');
const panel = read('ui/analysis/parcelLawEnvelopeAuthoring.ts');

describe('(1) the 3-D Site IS a face-drag surface — the link nothing pinned', () => {
    it('⭐ GISAreaLayout installs the gesture on the adapter\'s own canvas', () => {
        expect(gis).toMatch(/installSpaceEnvelopeFaceDragOnSurface\(\{/);
        expect(gis).toMatch(/const dragCanvas = envelopeDraw3d\.dragDomElement\(\);/);
        expect(gis).toMatch(/domElement: dragCanvas,/);
        expect(gis).toMatch(/surface: envelopeDraw3d,/);
    });

    it('⛔ ONE spelling of the verb — the dispatch travels on the shared dispatcher', () => {
        // Two literals for one command is two chances to spell it differently, and a mis-spelled
        // verb reaches the bus as an UNKNOWN command: a silent no-op wearing a working gesture.
        expect(gis).toMatch(/dispatchSpaceEnvelopeFaceMove\(bus, payload\)/);
        expect(gis).not.toMatch(/'spaceEnvelope\.moveFace'/);
    });

    it('and the install is DISPOSED and UNREGISTERED on teardown', () => {
        // A listener set that outlives its scene gives the next project two of them; a register row
        // that outlives its viewer keeps answering "yes, you can drag" for a canvas that is gone.
        expect(gis).toMatch(/envelopeFaceDrag3dDispose\?\.\(\); envelopeFaceDrag3dDispose = null;/);
        expect(gis).toMatch(/envelopeFaceDrag3dUnregister\?\.\(\); envelopeFaceDrag3dUnregister = null;/);
        expect(gis).toMatch(/envelopeDraw3d\?\.disposeFaceDragAffordance\(\)/);
    });
});

describe('(2) the panel can ASK — the register that closes the D7 shape', () => {
    it('⭐ the 3-D Site registers itself as a face-drag surface', () => {
        // `cannotDragReason()` has existed since lane FACE-DRAG-2 and, until L-13236, its only
        // production caller wrote it to `console.log` — so the panel could not ask the question it
        // had to answer, and its only options were a dead click or an invented sentence.
        expect(gis).toMatch(/registerSpaceEnvelopeFaceDragSurface\(envelopeDraw3d\)/);
        expect(adapter).toMatch(/cannotDragReason\(\): string \| null \{/);
    });

    it('⛔ the panel prints the SURFACES\' reason and never writes one of its own', () => {
        // C16 CA-18 / C83 §1.2 — the refusal is the product, forwarded verbatim. A panel that
        // composed its own sentence about a surface is how a card comes to state a condition the
        // scene disagrees with.
        expect(panel).toMatch(/readFaceDragAvailability \?\? spaceEnvelopeFaceDragAvailability/);
        expect(panel).toMatch(/dragBtn\.title = drag\.reason/);
    });

    it('⛔ the button dispatches NOTHING — it selects a subject (P6)', () => {
        // The one mutation of this feature is the single `spaceEnvelope.moveFace` the gesture sends
        // on pointer-up (C114 §6a). A panel that dispatched here would be a second mutation path.
        const handler = panel.slice(panel.indexOf('dragBtn.onclick'), panel.indexOf('row.appendChild(dragBtn)'));
        expect(handler).toMatch(/takeFaceDragFocus/);
        expect(handler).toMatch(/releaseFaceDragFocus/);
        expect(handler).not.toMatch(/executeCommand|dispatch\(/);
    });
});

describe('(3) the per-storey FOCUS is ONE slot, honoured on BOTH 3-D surfaces', () => {
    it('⭐ the restriction lives ONCE, in the renderer-free gesture', () => {
        // ⛔ Three surfaces would be three copies of one restriction, and a copy that drifted would
        // let the arrows stand on a storey the pick refuses — an affordance that lies (C84 EI-9).
        expect(core).toMatch(/const pick = \(ev: DragPointerLike\): FacePick \| null =>/);
        expect((core.match(/surface\.pickFace\(/g) ?? [])).toHaveLength(1);
        // ⛔ AND THE ADAPTERS DO NOT RE-IMPLEMENT IT. A second guard inside a `pickFace` would be
        // the exact duplication the core wrapper exists to prevent.
        expect(adapter).not.toMatch(/pickFace[\s\S]{0,600}?getSpaceEnvelopeFaceDragFocus/);
    });

    it('the 3-D Site passes the focus reader', () => {
        expect(gis).toMatch(/readFocus: \(\) => getSpaceEnvelopeFaceDragFocus\(\)/);
    });

    it('⭐ and so does BIM 3-D — the same slot, through initTools and attachSpaceEnvelopeRender', () => {
        // ⛔ THE ARM THAT MATTERS. A focus honoured on one 3-D surface and ignored on the other
        // would make *Drag face* mean two different things depending on which pane the founder was
        // looking at — and the pane where it meant nothing would look like a broken button.
        expect(initTools).toMatch(/readFaceDragFocus: \(\) => getSpaceEnvelopeFaceDragFocus\(\)/);
        expect(initTools).toMatch(/from '\.\.\/ui\/site\/spaceEnvelopeFaceDragFocusState'/);
        expect(attach).toMatch(/readonly readFaceDragFocus\?:/);
        expect(attach).toMatch(/deps\.readFaceDragFocus \? \{ readFocus: deps\.readFaceDragFocus \}/);
        expect(controller).toMatch(/deps\.readFocus \? \{ readFocus: deps\.readFocus \}/);
    });

    it('⛔ a focus RESTRICTS and never ENABLES — it is not an arming control', () => {
        // The gesture is installed unconditionally and is live whether or not the button was ever
        // pressed. Gating the INSTALL on a focus would turn a working gesture into a mode nobody
        // finds — a reachability regression wearing a feature's clothes.
        const install = gis.slice(gis.indexOf('const dragCanvas'), gis.indexOf('installSpaceEnvelopeFaceDragOnSurface'));
        expect(install).not.toMatch(/getSpaceEnvelopeFaceDragFocus|isEnvelopeDrawArmed/);
    });
});

describe('(4) the two seams that existed and reached nothing', () => {
    it('⭐ double-click on the 3-D Site now opens the SHIPPED outline editor', () => {
        // The core supported it, `window.spaceEnvelopeTool` was registered globally, and this
        // wiring passed every other dep and not this one — so the gesture worked on BIM 3-D and
        // silently did nothing here.
        expect(gis).toMatch(/onProfileEdit: \(spaceEnvelopeId: string\) => \{/);
        expect(gis).toMatch(/tool\.enterProfileEditMode\(spaceEnvelopeId\)/);
    });

    it('⭐ the live metre readout writes to a REAL element, not to an event with no listener', () => {
        // ⛔ `onPreview` has existed since lane FACE-DRAG-2 and was passed by NEITHER wiring, so the
        // figure was computed on every frame of every drag and dropped. Emitting it onto a bus with
        // no subscriber would have looked like a fix and changed nothing on screen — the
        // [[authored-but-unwired-is-the-bottleneck]] shape.
        expect(gis).toMatch(/onPreview: \(deltaM: number, faceLabel: string\) => \{/);
        expect(gis).toMatch(/showFaceDragReadout\(/);
        expect(gis).toMatch(/data-testid', 'site-face-drag-readout'/);
        // C08 §3.1 — createElement + textContent, no new `innerHTML` sink.
        const readout = gis.slice(gis.indexOf('const showFaceDragReadout'), gis.indexOf('envelopeFaceDrag3dDispose = installSpaceEnvelopeFaceDragOnSurface'));
        expect(readout).not.toMatch(/innerHTML/);
    });
});
