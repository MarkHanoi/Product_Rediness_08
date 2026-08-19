// §ENVELOPE-ONE-VISIBILITY (L-1170) — the buildable envelope has ONE visibility authority.
//
// THE FOUNDER'S REPORT (2026-08-19, production): "I just selected the Level 15 top level for
// roof creation and an ENVELOPE showed up — I tried to hide it but it did not work." A large
// grey box over his building, on the surface he was working in, with no way to dismiss it.
//
// HIS OWN LOG CARRIED THE MECHANISM — two consecutive massing renders, opposite outcomes:
//   render N   → `§ENVELOPE-RESOLVE-DIAG — envelope OFF (user toggle); not rendered.`
//                `render diag: envelope present=n, entities added=0, total massing entities=3338`
//   render N+1 → `§ENVELOPE-REINSET … re-inset from the PERSISTED setbacks 0/0/0 m`
//                `§ENVELOPE-VIA-MASSING drew 1/1 solid(s): [footprint-slab@0.5m] · provisional grey`
//                `render diag: envelope present=y, entities added=1, total massing entities=3339`
//
// FOUR things answered "should the envelope be visible?" and they disagreed (C84 EI-1):
//   1. `formaEnvelopeVisible` — a `let` inside `mountGISArea`'s closure, read by ONE function.
//   2. `CesiumViewport.formaLastMassingInput.envelope` — a SNAPSHOT of (1) at an earlier render,
//      replayed by `setVisibleFormaLevels` (⭐ the floor selector — "selected Level 15"),
//      `setGlobeBuildingFidelity`, `clampTerrainThenReplace`, `rerenderFormaMassing`.
//   3. `formaSiteOverlayEntities` — the L-464/L-468 survival set that exempts envelope entities
//      from `setGlobeBuildingShown`, i.e. makes an already-added solid unhideable.
//   4. `ParcelBoundarySceneRenderer.buildEnvelopeVolume()` — the BIM/plan three.js volume, which
//      consulted no toggle whatsoever.
//
// ⚠ THE TESTS BELOW ARE DELIBERATELY PART BEHAVIOURAL AND PART STRUCTURAL, and the structural
// half is the important one. A behavioural test of a flag is exactly the defect this repo repeats:
// the flag reads correctly and the box is still on screen. What the founder needs guaranteed is
// not "the boolean flips" — it is "NO CODE PATH CAN ADD AN ENVELOPE SOLID WITHOUT ASKING". That
// is a claim about the shape of the source, so it is asserted against the source.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    isBuildableEnvelopeVisible,
    setBuildableEnvelopeVisible,
    subscribeBuildableEnvelopeVisibility,
    __resetBuildableEnvelopeVisibilityForTests,
} from '../src/ui/site/envelopeVisibility';

const src = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('§ENVELOPE-ONE-VISIBILITY — the authority itself', () => {
    beforeEach(() => { __resetBuildableEnvelopeVisibilityForTests(); });

    // C58 §1.4 — an envelope that silently fails to arrive reads as "there is no constraint
    // here", the false negative the contract forbids. Only an explicit user "off" may hide it.
    it('defaults to VISIBLE', () => {
        expect(isBuildableEnvelopeVisible()).toBe(true);
    });

    it('a write is the ONLY thing that changes the answer, and it round-trips', () => {
        setBuildableEnvelopeVisible(false);
        expect(isBuildableEnvelopeVisible()).toBe(false);
        setBuildableEnvelopeVisible(true);
        expect(isBuildableEnvelopeVisible()).toBe(true);
    });

    it('notifies EVERY subscribed surface — that is what makes the surfaces agree', () => {
        const seen: string[] = [];
        subscribeBuildableEnvelopeVisibility((v) => seen.push(`globe:${v}`));
        subscribeBuildableEnvelopeVisibility((v) => seen.push(`bim:${v}`));
        setBuildableEnvelopeVisible(false);
        expect(seen).toEqual(['globe:false', 'bim:false']);
    });

    // One dead surface must not cost the user the others. Same rule §L-676-B learned when a
    // throwing dispose listener aborted the rest of a renderer's teardown.
    it('a THROWING subscriber does not stop the other surfaces honouring the choice', () => {
        const seen: string[] = [];
        subscribeBuildableEnvelopeVisibility(() => { throw new Error('dead viewport'); });
        subscribeBuildableEnvelopeVisibility((v) => seen.push(`bim:${v}`));
        expect(() => setBuildableEnvelopeVisible(false)).not.toThrow();
        expect(seen).toEqual(['bim:false']);
    });

    // An idempotent re-assert must not cost a Cesium re-render — the globe subscriber
    // re-rasterises ~3,300 massing entities on every notification.
    it('re-asserting the SAME value notifies nobody', () => {
        let calls = 0;
        subscribeBuildableEnvelopeVisibility(() => { calls++; });
        setBuildableEnvelopeVisible(true);   // already true
        expect(calls).toBe(0);
        setBuildableEnvelopeVisible(false);
        expect(calls).toBe(1);
    });

    it('unsubscribing actually detaches (a disposed viewport must not be repainted)', () => {
        let calls = 0;
        const off = subscribeBuildableEnvelopeVisibility(() => { calls++; });
        off();
        setBuildableEnvelopeVisible(false);
        expect(calls).toBe(0);
    });
});

describe('§ENVELOPE-ONE-VISIBILITY — the CHOKEPOINT (structural)', () => {
    // ⭐ THE FOUNDER'S ACTUAL MECHANISM, pinned. Every re-render route in CesiumViewport replays
    // `formaLastMassingInput` — a payload captured at an EARLIER render. If the rasteriser trusted
    // that payload, selecting a floor would resurrect a hidden envelope, which is precisely what
    // "I selected Level 15 and an ENVELOPE showed up" describes. The gate must sit at the ONE
    // place all those routes converge: the solids read inside `renderFormaMassing`.
    it('CesiumViewport reads envelope solids ONLY through the authority', () => {
        const s = src('src/ui/geospatial/CesiumViewport.ts');
        // Exactly one place derives the solids to rasterise…
        const decls = s.match(/const envSolids\s*=/g) ?? [];
        expect(decls.length).toBe(1);
        // …and it is gated on the authority.
        expect(s).toMatch(/const envHidden = !isBuildableEnvelopeVisible\(\);/);
        expect(s).toMatch(/const envSolids = envHidden \? \[\] : \(input\.envelope\?\.solids \?\? \[\]\);/);
        // The authority is imported here, not re-implemented.
        expect(s).toMatch(/isBuildableEnvelopeVisible,?\s*\n?\s*subscribeBuildableEnvelopeVisibility,?\s*\n?\}\s*from\s*"\.\.\/site\/envelopeVisibility";/);
    });

    // The ONLY reader of `input.envelope` may be the gated derivation above. A second reader is
    // a second answer — the exact shape being removed. (`input.envelope` also appears in the
    // parameter's own doc comment + type declaration, which are not reads.)
    it('no OTHER code path in CesiumViewport reads input.envelope to draw with', () => {
        const s = src('src/ui/geospatial/CesiumViewport.ts');
        const reads = (s.match(/input\.envelope[?.]/g) ?? []).length;
        // 2 = the gated derivation + the suppression diagnostic beside it.
        expect(reads).toBeLessThanOrEqual(3);
        expect(s).not.toMatch(/formaSiteOverlayEntities\.add\(\s*viewer\.entities\.add/);
    });

    // Surface (4) — the one that never asked at all, on the surface the founder was working in.
    it('ParcelBoundarySceneRenderer asks the authority BEFORE it reads any envelope', () => {
        const s = src('src/ui/site/ParcelBoundarySceneRenderer.ts');
        const gate = s.indexOf('if (!isBuildableEnvelopeVisible()) return null;');
        const read = s.indexOf('const env = getLastBuildableEnvelope();');
        expect(gate).toBeGreaterThan(-1);
        expect(read).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(read);
        // …and it repaints from the authority rather than waiting to be told by the GIS card,
        // which is not even mounted while the user is in the BIM scene.
        expect(s).toMatch(/subscribeBuildableEnvelopeVisibility\(\(\) => this\.refresh\(\)\)/);
    });

    // Surface (1) — the private `let` is gone, not merely bypassed. A surviving local mirror
    // would drift the moment anything else wrote the authority.
    it('GISAreaLayout holds NO private copy of the answer', () => {
        const s = src('src/ui/layout/GISAreaLayout.ts');
        expect(s).not.toMatch(/^\s*let formaEnvelopeVisible/m);
        expect(s).not.toMatch(/formaEnvelopeVisible\s*=\s*!/);
        expect(s).toMatch(/if \(!isBuildableEnvelopeVisible\(\)\) \{/);
        expect(s).toMatch(/setBuildableEnvelopeVisible\(!isBuildableEnvelopeVisible\(\)\)/);
    });

    // ⭐ THE DEAD BRANCH THAT WAS THE BUG IN PLAIN SIGHT. The old toggle picked a renderer from
    // two unrelated view-mode variables and its third branch (`else { refreshEnvelopePanel(); }`)
    // repainted the CARD and touched NO SCENE. On a 2D result view with the site pane in `map2d`,
    // clicking OFF changed a flag and left the box exactly where it was — literally "I tried to
    // hide it but it did not work". The control must now do ONE thing: write the answer.
    it('the toggle only WRITES — it does not pick a renderer', () => {
        const s = src('src/ui/layout/GISAreaLayout.ts');
        const start = s.indexOf('const wireEnvelopeToggle');
        expect(start).toBeGreaterThan(-1);
        const body = s.slice(start, s.indexOf('};', s.indexOf('btn.onclick')) + 2);
        expect(body).not.toMatch(/placeBuildingOnGlobe\(\)/);
        expect(body).not.toMatch(/renderFormaMassing\(/);
    });
});
