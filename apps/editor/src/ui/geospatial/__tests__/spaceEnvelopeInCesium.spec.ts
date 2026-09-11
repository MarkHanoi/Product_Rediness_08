// §SPACE-ENVELOPE-IN-CESIUM (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4, founder 2026-09-06) —
// the AUTHORED design-intent envelope now draws on the 3D Site, and the two site-overlay defects
// that made "it drew" and "I can see it" different claims are pinned shut.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE RECONCILIATION THESE GUARD, BECAUSE THE CONSOLE CONTRADICTED THE FOUNDER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// He said: *"the envelope renders great on pryzm view — but on 3d site vie not on 2d map view."*
// `CesiumViewport.ts` said, in the same trace: `§ENVELOPE-VIA-MASSING drew 2/2 solid(s)` and
// `envelope entities added=2`. Both were true, because THEY ARE DIFFERENT OBJECTS — and the L0
// schema is the one that says so, not an opinion formed here:
//
//   packages/schemas/src/elements/SpaceEnvelope.ts, its own header:
//     "⛔ IT IS NOT `BuildableEnvelope` … That is the SOLVED legal ceiling — a study with a
//      mandatory `EnvelopeConfidence`, a derivation trace and a refusal vocabulary, produced by
//      the zoning engine and never authored."
//
// So `§ENVELOPE-VIA-MASSING` renders the PERMITTED study, and what the founder AUTHORS ("as we
// can do on pryzm view") is the SPACE ENVELOPE — `role: 'level'` prisms from
// `spaceEnvelope.batch.create`, dragged by `spaceEnvelopeFaceDragController` and re-profiled by
// `spaceEnvelopeProfileEditTool`. Before this lane it had exactly ONE renderer in the entire app,
// in the THREE/WebGPU BIM scene. The defect was an ABSENT rasteriser, not an invisible entity.
//
// ⚠ THESE ARE SOURCE-TEXT ARMS, and that is deliberate rather than lazy. Constructing a real
// `CesiumViewport` needs a WebGL context; what is actually at risk here is the WIRING (does the
// arm exist, does it read the ONE store, does it reuse the ONE palette), which is precisely what
// source text can establish and a mocked viewer cannot. `siteViewQuickToggle.spec.ts` uses the
// same idiom for the same reason. ⛔ They do NOT establish that anything appears on a screen —
// [[committed-is-not-reachable]] — and no comment here should be read as claiming they do.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
/**
 * ⚠ CRLF IS NORMALISED, AND THAT IS A BUG THIS FILE ALREADY HIT. The repo checks out with CRLF on
 * Windows (`git add` warns "CRLF will be replaced by LF"), so a body extraction terminated on
 * `'
  }
'` silently found nothing and every slice collapsed to four characters — the arms
 * PASSED for absence and FAILED for presence, which is the worst possible failure direction for a
 * source-text guard. Normalise once, here, so no arm below can depend on the checkout's line ending.
 */
const read = (p: string): string =>
    readFileSync(join(REPO, p), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

/**
 * Source with comment lines removed.
 *
 * ⚠ NOT optional. Every ABSENCE arm below would be defeated by a good header, because a header
 * that forbids a pattern must NAME the pattern it forbids — this file's own does. The lesson is
 * `siteViewQuickToggle.spec.ts`'s, learned there four times in one session.
 */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

const VIEWPORT = 'apps/editor/src/ui/geospatial/CesiumViewport.ts';

describe('§SPACE-ENVELOPE-IN-CESIUM — the authored envelope has a Cesium rasteriser at all', () => {
    it('the Cesium arm exists and is driven from the massing tail AND the runtime injection', () => {
        const code = codeOnly(read(VIEWPORT));
        expect(code).toContain('private renderSpaceEnvelopes()');
        expect(code).toContain('private ensureSpaceEnvelopeSubscription()');
        // §L-446 — the runtime is late-injected, so subscribing ONLY at the massing tail would
        // leave an envelope authored before any massing pass waiting for an unrelated re-render.
        expect(code).toMatch(/setRuntime\([\s\S]{0,2000}ensureSpaceEnvelopeSubscription\(\)/);
    });

    // ⭐ ONE ROAD: `Store.subscribeDirty()`. `attachSpaceEnvelopeRender.ts`'s header makes the
    // argument in full — `applyPatch()` notifies it on EXECUTE, UNDO and REDO alike, which is why
    // this family owes no bus subscriber and no undo render-sink, and why `performUndoRedo.ts`'s
    // `spaceEnvelope` row can stay the GENERIC adapter. That row carries the warning explicitly:
    // if the prism comes to be drawn off `spaceEnvelope.*` bus EVENTS, an undo is not a command,
    // `CommandEventBridge` never sees it, and the seam needs the bespoke shape.
    // ⛔ So a bus subscriber here would silently break UNDO in the Cesium view.
    it('reads the ONE store via subscribeDirty — never off spaceEnvelope.* bus events', () => {
        const code = codeOnly(read(VIEWPORT));
        expect(code).toContain('stores?.spaceEnvelope');
        expect(code).toContain('subscribeDirty');
        expect(code).not.toMatch(/on\(['"]spaceEnvelope\./);
    });

    // ⛔ NO SECOND PALETTE. §TOBE-ENVELOPE moved the LEVEL envelope OFF `#6600FF` precisely
    // because the confident permitted envelope draws at `CONFIDENT_VIOLET_HEX = 0x6600ff`, so an
    // intent volume was wearing the CONFIDENCE BADGE C58 §1.2 reserves for a determination. A hue
    // re-derived in this file would be one commit away from re-creating that collision.
    it('takes colour, opacity, ink and label from the ONE pure resolver, minting no hex', () => {
        const src = read(VIEWPORT);
        const arm = src.slice(src.indexOf('private renderSpaceEnvelopes()'));
        const body = codeOnly(arm.slice(0, arm.indexOf('\n  }\n') + 5));
        // §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — the rasteriser reads the ONE site model, and
        // the model is built on the ONE resolver. Both links are asserted in CODE: this arm used to
        // be satisfiable by the word appearing in a comment.
        expect(body).toContain('buildSpaceEnvelopeSitePrisms(records, this.spaceEnvelopePreviews)');
        expect(codeOnly(read('apps/editor/src/ui/geospatial/spaceEnvelopeSiteModel.ts')))
            .toContain('resolveSpaceEnvelopeAppearance(');
        expect(body).not.toMatch(/#[0-9a-fA-F]{6}/);
        expect(body).not.toMatch(/0x[0-9a-fA-F]{6}/);
    });

    // C57 §1.5 — a failure must never be dressed as an empty. The prisms are authored in scene-XZ
    // metres ABOUT the site frame origin; with no origin there is no way to place them on the
    // Earth. Drawing at the address, the map centre or 0,0 would be a confidently wrong answer
    // about where someone intends to build.
    it('refuses to place design intent at a guessed origin, and says so out loud', () => {
        const src = read(VIEWPORT);
        const arm = src.slice(src.indexOf('private renderSpaceEnvelopes()'));
        const body = arm.slice(0, arm.indexOf('\n  }\n') + 5);
        expect(body).toContain('this.formaMassingOrigin');
        expect(body).toMatch(/console\.warn\([\s\S]{0,600}NO site frame origin/);
    });

    // The authored prism must land in the SAME frame as everything else on the globe, or it will
    // sit rotated off the plot on any project with a non-zero project north (§L-430 slice 2b —
    // and §L-446 is the record of what happens when θ is silently 0).
    it('places prisms through the SHARED θ-aware ENU boundary, not an inline east/north', () => {
        const src = read(VIEWPORT);
        const arm = src.slice(src.indexOf('private renderSpaceEnvelopes()'));
        const body = codeOnly(arm.slice(0, arm.indexOf('\n  }\n') + 5));
        expect(body).toContain('sceneXZToEnu');
        expect(body).toContain('readProjectNorthRad()');
        expect(body).toContain('eastNorthUpToFixedFrame');
    });

    // A live listener on a store that outlives the viewport would hold a strong reference to a
    // disposed viewer and redraw into it on the next face drag — the exact rule
    // §ENVELOPE-ONE-VISIBILITY (L-1170) states for its own subscription two blocks below.
    it('unsubscribes and clears its entities on dispose', () => {
        const code = codeOnly(read(VIEWPORT));
        expect(code).toMatch(/this\.spaceEnvelopeSub\(\);/);
        expect(code).toMatch(/this\.spaceEnvelopeSub = null;/);
        expect(code).toContain('this.clearSpaceEnvelopes()');
    });

    // The store's lifetime is not the massing pass's lifetime. `formaMassingEntities` is cleared
    // at the head of every `renderFormaMassing`; an authored volume changes on a face drag, a
    // profile Apply or a Ctrl+Z with no massing pass in sight.
    it('keeps its own entity list rather than riding the massing clear lifecycle', () => {
        const code = codeOnly(read(VIEWPORT));
        expect(code).toContain('private spaceEnvelopeEntities: Cesium.Entity[] = []');
        const arm = code.slice(code.indexOf('private renderSpaceEnvelopes()'));
        const body = arm.slice(0, arm.indexOf('\n  }\n') + 5);
        expect(body).not.toContain('formaMassingEntities');
    });
});

describe('§SITE-OVERLAY-NOT-BUILDING (L-464 / L-468) — ALL THREE writers honour the survival set', () => {
    // ⭐ THE THIRD SITE, AND IT WAS THE ONE STILL MISSING THE SKIP. The buildable envelope and the
    // parcel boundary ride in `formaMassingEntities` for their CLEAR lifecycle but are SITE
    // CONTEXT, not the proposed building. `setGlobeBuildingShown` (L-464) and
    // `clearFormaMassingEntitiesOnly` (L-468) were fixed in turn;
    // `setBuildingMaterialsVisibleForFacade` was not, so turning the façade sun-hours study ON hid
    // the planning constraint along with the design.
    //
    // ⚠ WHY IT IS A CORRECTNESS BUG: an envelope that vanishes reads as "there is no constraint
    // here" — the silent false negative C58 §1.4 forbids. And it self-healed on the next full
    // `renderFormaMassing` (fresh entities default `show: true`), which is exactly why it
    // presented as an intermittent "the log says it drew and I cannot see it".
    const WRITERS = [
        'private setGlobeBuildingShown(',
        'public clearFormaMassingEntitiesOnly(',
        'private setBuildingMaterialsVisibleForFacade(',
    ] as const;

    it('every method that hides or removes massing entities skips formaSiteOverlayEntities', () => {
        const src = read(VIEWPORT);
        for (const writer of WRITERS) {
            const at = src.indexOf(writer);
            expect(at, `${writer} not found — did it move or get renamed?`).toBeGreaterThan(-1);
            const body = src.slice(at, at + 3000);
            const loop = body.indexOf('of this.formaMassingEntities');
            expect(loop, `${writer} no longer loops the massing entities`).toBeGreaterThan(-1);
            // The guard must be INSIDE the loop, before the write.
            const afterLoop = body.slice(loop, loop + 1800);
            expect(
                afterLoop.includes('this.formaSiteOverlayEntities.has(ent)'),
                `${writer} writes over formaMassingEntities WITHOUT honouring the `
                + '§SITE-OVERLAY-NOT-BUILDING survival set — the buildable envelope and the parcel '
                + 'boundary would vanish with the building (C58 §1.4, the silent false negative).',
            ).toBe(true);
        }
    });
});
