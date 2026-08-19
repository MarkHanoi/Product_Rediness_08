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
    isBuildableEnvelopeFootprintVisible,
    getBuildableEnvelopeAxes,
    setBuildableEnvelopeVisible,
    setBuildableEnvelopeFootprintVisible,
    subscribeBuildableEnvelopeVisibility,
    __resetBuildableEnvelopeVisibilityForTests,
} from '../src/ui/site/envelopeVisibility';
import {
    envelopeToMassing,
    applyEnvelopeVisibilityAxes,
    envelopeDrawMode,
    GROUND_SHADE_HEIGHT_M,
    type BuildableEnvelopeMassingInput,
} from '@pryzm/site-parcel-data';

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
        // ⚠ §ENVELOPE-TWO-AXES — the listener takes NO argument on purpose: with two axes a single
        // boolean cannot describe the answer, so a subscriber MUST re-ask rather than render from
        // what it was handed. (A handed-in snapshot is the L-1170 defect one level down.)
        const seen: string[] = [];
        subscribeBuildableEnvelopeVisibility(() => seen.push(`globe:${isBuildableEnvelopeVisible()}`));
        subscribeBuildableEnvelopeVisibility(() => seen.push(`bim:${isBuildableEnvelopeVisible()}`));
        setBuildableEnvelopeVisible(false);
        expect(seen).toEqual(['globe:false', 'bim:false']);
    });

    // One dead surface must not cost the user the others. Same rule §L-676-B learned when a
    // throwing dispose listener aborted the rest of a renderer's teardown.
    it('a THROWING subscriber does not stop the other surfaces honouring the choice', () => {
        const seen: string[] = [];
        subscribeBuildableEnvelopeVisibility(() => { throw new Error('dead viewport'); });
        subscribeBuildableEnvelopeVisibility(() => seen.push(`bim:${isBuildableEnvelopeVisible()}`));
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
        // …and it is derived from the authority's AXES through the pure L2 rule (§ENVELOPE-TWO-AXES,
        // L-1188) — never from a local branch on one boolean, which is how two rasterisers come to
        // mean two different things by "off".
        expect(s).toMatch(/const envAxes = getBuildableEnvelopeAxes\(\);/);
        expect(s).toMatch(/const envSolids = applyEnvelopeVisibilityAxes\(envPayloadSolids, envAxes\);/);
        // ⛔ THE ONE-AXIS GATE MUST NOT COME BACK — it is exactly what deleted the founder's ground
        // shade. This is the regression pin, not decoration.
        expect(s).not.toMatch(/const envHidden = !isBuildableEnvelopeVisible\(\);/);
        // The authority is imported here, not re-implemented.
        expect(s).toMatch(/getBuildableEnvelopeAxes,?\s*\n?\s*subscribeBuildableEnvelopeVisibility,?\s*\n?\}\s*from\s*"\.\.\/site\/envelopeVisibility";/);
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
        // §ENVELOPE-TWO-AXES — it now asks for the DRAW MODE (the same pure L2 decision the globe
        // makes), not for one boolean; the ordering requirement is unchanged.
        const gate = s.indexOf('const drawMode = envelopeDrawMode(getBuildableEnvelopeAxes());');
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — HIDING THE VOLUME MUST NOT DELETE THE GROUND FOOTPRINT
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// THE FOUNDER'S REPORT (2026-08-19, production, Barcelona 424 m² parcel, 272 m² buildable):
//   "When the envelope is OFF we should see this shade on the GROUND."
//
// HIS OWN LOG CARRIED THE MECHANISM, and it is a REGRESSION FROM L-1170 — correct in kind,
// over-suppressing in degree:
//   OFF → `§ENVELOPE-ONE-VISIBILITY — 1 envelope solid(s) in this payload SUPPRESSED`
//         `render diag: envelope present=n, entities added=0, total massing entities=2`
//   ON  → `§ENVELOPE-VIA-MASSING drew 1/1 solid(s): [massing@19.1m] · provisional grey`
// `entities added=0` is the whole finding: with the volume off the envelope contributes NOTHING to
// the ground. The two entities left are the PARCEL fill + the parcel dashed ring — the 424 m² lot,
// not the 272 m² buildable area — so what remains on screen answers a different question.
//
// ⚠ THESE CASES DRIVE THE REAL TOGGLE PATH. They call `setBuildableEnvelopeVisible` — the exact
// function the card's `Envelope: ON/OFF` button calls — and push the result through the SAME pure
// `applyEnvelopeVisibilityAxes` both rasterisers call. Nothing about visibility is stubbed: a test
// that stubs the thing under test proves nothing (§L-1170's own lesson, applied to its successor).

/** The founder's parcel, as `envelopeToMassing` receives it: a solved 272 m² inset ring at 19.1 m,
 *  provisional (Default rule pack ⇒ `confidence: 'estimated-ruleset'`). */
const FOUNDER_ENVELOPE: BuildableEnvelopeMassingInput = {
    insetPolygon: [
        { x: 0, z: 0 },
        { x: 17, z: 0 },
        { x: 17, z: 16 },
        { x: 0, z: 16 },
    ],
    insetAreaM2: 272,
    maxHeight_m: 19.1,
    confidence: 'estimated-ruleset',
    status: 'ok',
    tiers: [],
};

describe('§ENVELOPE-TWO-AXES — the ground footprint survives hiding the volume (L-1188)', () => {
    beforeEach(() => { __resetBuildableEnvelopeVisibilityForTests(); });

    /** What a rasteriser would draw RIGHT NOW, through the real authority + the real pure rule. */
    const drawn = (env: BuildableEnvelopeMassingInput = FOUNDER_ENVELOPE) =>
        applyEnvelopeVisibilityAxes(envelopeToMassing(env), getBuildableEnvelopeAxes());

    it('ON draws the 19.1 m VOLUME — unchanged from before L-1188', () => {
        const solids = drawn();
        expect(solids).toHaveLength(1);
        expect(solids[0]!.role).toBe('massing');
        expect(solids[0]!.topHeightM).toBeCloseTo(19.1, 6);
        expect(solids[0]!.claimsVolume).toBe(true);
    });

    // ⭐ THE FOUNDER'S DEFECT. Before L-1188 this returned `[]` — `entities added=0`, no shade.
    it('OFF still draws a FLAT GROUND SHADE at the buildable ring (the founder ask)', () => {
        setBuildableEnvelopeVisible(false);                       // ← the real toggle's one write
        const solids = drawn();
        expect(solids).toHaveLength(1);                           // ← was 0: the regression
        const shade = solids[0]!;
        expect(shade.role).toBe('footprint-slab');
        expect(shade.topHeightM).toBeCloseTo(GROUND_SHADE_HEIGHT_M, 6);
        expect(shade.baseHeightM).toBe(0);
        // It is the BUILDABLE 272 m², not the 424 m² parcel — that distinction is the whole point.
        expect(shade.areaM2).toBeCloseTo(272, 6);
        expect(shade.ring).toEqual(FOUNDER_ENVELOPE.insetPolygon);
    });

    // §L-616 / §1.16 — the shade must never READ as a stronger claim than the volume it replaces.
    it('the shade carries the SAME honesty signals as the volume it projects', () => {
        const volume = drawn()[0]!;
        setBuildableEnvelopeVisible(false);
        const shade = drawn()[0]!;
        expect(shade.style.hue).toBe(volume.style.hue);                 // provisional grey, not violet
        expect(shade.style.hue).toBe('provisional');
        expect(shade.style.complete).toBe(false);
        expect(shade.style.footprintUpperBound).toBe(volume.style.footprintUpperBound);
        expect(shade.style.openTop).toBe(volume.style.openTop);
        // ⭐ AND IT CLAIMS NO VOLUME — a shade says "this is the AREA", never "this is the MASS", so
        // it contributes 0 to the §1.14.4 never-overstate sum however tall its source solid was.
        expect(shade.claimsVolume).toBe(false);
    });

    // ⛔ §L-616 / §1.16 (L-1171) — THE CONSTRAINT THAT MUST SURVIVE. A refused envelope draws
    // nothing; hiding the volume must not become a back door that mints a ground claim from data
    // that was not good enough to draw a volume from. The shade is a PROJECTION OF EXISTING SOLIDS,
    // so "no solids" is "no shade" by construction, in every axis combination.
    it('a REFUSED envelope shades NOTHING — hiding the volume mints no new claim', () => {
        const refused: BuildableEnvelopeMassingInput = { ...FOUNDER_ENVELOPE, status: 'refused' };
        expect(envelopeToMassing(refused)).toEqual([]);
        expect(drawn(refused)).toEqual([]);
        setBuildableEnvelopeVisible(false);
        expect(drawn(refused)).toEqual([]);
        setBuildableEnvelopeFootprintVisible(false);
        expect(drawn(refused)).toEqual([]);
    });

    // §L-619 — an UPPER-BOUND footprint is the case where the AREA is precisely what is in doubt.
    // Its shade must stay near-wireframe: the doubt does not become less doubtful because the
    // volume was hidden, and a confident-looking shade on an unknown footprint is the overstatement
    // defect wearing a new shape.
    it('an UPPER-BOUND envelope shades at the near-wireframe weight, not the solid one', () => {
        const upper: BuildableEnvelopeMassingInput = { ...FOUNDER_ENVELOPE, footprintIsUpperBound: true };
        setBuildableEnvelopeVisible(false);
        const upperShade = drawn(upper)[0]!;
        const normalShade = drawn(FOUNDER_ENVELOPE)[0]!;
        expect(upperShade.style.footprintUpperBound).toBe(true);
        expect(upperShade.style.hue).toBe('provisional');
        expect(upperShade.style.fillAlpha).toBeLessThan(normalShade.style.fillAlpha);
    });

    it('BOTH axes off draws nothing at all — "hide everything" stays expressible', () => {
        setBuildableEnvelopeVisible(false);
        setBuildableEnvelopeFootprintVisible(false);
        expect(getBuildableEnvelopeAxes()).toEqual({ volume: false, footprint: false });
        expect(envelopeDrawMode(getBuildableEnvelopeAxes())).toBe('none');
        expect(drawn()).toEqual([]);
    });

    it('the footprint axis defaults ON and is NOT written by the volume control', () => {
        expect(isBuildableEnvelopeFootprintVisible()).toBe(true);
        setBuildableEnvelopeVisible(false);
        expect(isBuildableEnvelopeFootprintVisible()).toBe(true);
        setBuildableEnvelopeVisible(true);
        expect(isBuildableEnvelopeFootprintVisible()).toBe(true);
    });

    // The volume wins when both are on: its own base IS the footprint, so a second coplanar shade
    // buys nothing and z-fights.
    it('VOLUME wins over the shade when both axes are on', () => {
        expect(envelopeDrawMode({ volume: true, footprint: true })).toBe('volume');
        expect(envelopeDrawMode({ volume: true, footprint: false })).toBe('volume');
        expect(envelopeDrawMode({ volume: false, footprint: true })).toBe('ground-shade');
        expect(envelopeDrawMode({ volume: false, footprint: false })).toBe('none');
    });

    // A TIERED envelope (§1.7b.4): only the GROUND-touching extent is ground you may build on.
    it('a TIERED envelope shades its ground tier, never a tier that starts in the air', () => {
        const tiered: BuildableEnvelopeMassingInput = {
            ...FOUNDER_ENVELOPE,
            tiers: [
                {
                    id: 'ground',
                    polygon: FOUNDER_ENVELOPE.insetPolygon,
                    areaM2: 272,
                    baseHeight_m: 0,
                    maxHeight_m: 12,
                },
                {
                    id: 'upper',
                    polygon: [{ x: 2, z: 2 }, { x: 10, z: 2 }, { x: 10, z: 9 }, { x: 2, z: 9 }],
                    areaM2: 56,
                    baseHeight_m: 12,
                    maxHeight_m: 7,
                },
            ] as unknown as BuildableEnvelopeMassingInput['tiers'],
        };
        expect(envelopeToMassing(tiered)).toHaveLength(2);
        setBuildableEnvelopeVisible(false);
        const shades = drawn(tiered);
        expect(shades).toHaveLength(1);
        expect(shades[0]!.areaM2).toBeCloseTo(272, 6);
        expect(shades[0]!.baseHeightM).toBe(0);
    });
});

describe('§ENVELOPE-TWO-AXES — the CHOKEPOINT still has exactly one gate (structural)', () => {
    // ⛔ THE CALLER-SIDE GATE THAT WOULD MAKE THE FIX UNSATISFIABLE. `resolveFormaEnvelope` used to
    // return null when the toggle was off, which starves the rasteriser of solids to project — the
    // ground shade could then never appear however correct the chokepoint was. §1.15.2 already
    // forbade a caller-side gate; this pins that it stays gone.
    it('GISAreaLayout does NOT withhold the envelope from the payload when the volume is off', () => {
        const s = src('src/ui/layout/GISAreaLayout.ts');
        const start = s.indexOf('const resolveFormaEnvelope');
        expect(start).toBeGreaterThan(-1);
        const body = s.slice(start, start + 4000);
        expect(body).not.toMatch(/if \(!isBuildableEnvelopeVisible\(\)\) \{[\s\S]{0,600}?return null;/);
    });

    // Both rasterisers must read the SAME pure L2 rule. A surface that re-implements "what does off
    // mean" is a second authority in the only sense that matters.
    it('both rasterisers read the ONE pure projection rule, not a local branch', () => {
        const cesium = src('src/ui/geospatial/CesiumViewport.ts');
        const bim = src('src/ui/site/ParcelBoundarySceneRenderer.ts');
        expect(cesium).toMatch(/applyEnvelopeVisibilityAxes[\s\S]{0,80}from "@pryzm\/site-parcel-data"/);
        expect(bim).toMatch(/envelopeDrawMode[\s\S]{0,120}from '@pryzm\/site-parcel-data'/);
        // Neither may branch on the single volume boolean to decide what to draw.
        expect(cesium).not.toMatch(/isBuildableEnvelopeVisible\(\)/);
        expect(bim).not.toMatch(/isBuildableEnvelopeVisible\(\)/);
    });

    // §ENVELOPE-TWO-AXES — the control must say what "OFF" actually does, or the surviving shade
    // reads as terrain / the parcel fill (the exact ambiguity the founder's report had to be
    // disambiguated out of).
    it('the card tells the user the footprint survives, at the same confidence', () => {
        const s = src('src/ui/layout/GISAreaLayout.ts');
        expect(s).toMatch(/buildable <b>footprint<\/b> still shaded on the ground/);
        expect(s).toMatch(/at the same[\s\S]{0,40}confidence as the figures above/);
    });
});
