/**
 * §BUILDINGS-ARE-NOT-SLICED (founder 2026-09-08 · L-13264 · C12 §13.5)
 *
 * THE ASK, VERBATIM:
 *   *"THIS HAPPENS OFTEN - SOMETIMES THE BUILDINGS ARE 'CUT' BY DIAGONAL LINES - AND THIS
 *    IMPACT THE GEOMETRY."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐ THE DIAGONAL IS THE SCOPE RIM, AND THE CUT WAS DELIBERATE — FOR THE WRONG LAYER
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The site scope is a rectangle rotated by θ (Córdoba −44°, Barcelona −45°), so on screen its
 * edge runs diagonally. A footprint straddling it was CUT there, leaving a half-building with
 * a straight false wall. The founder's own log counts them:
 * `§SITE-SCOPE clip — buildings-far: 4041 inside · 289 cut · 1450 outside`.
 *
 * ⛔ CLIPPING IS RIGHT FOR A SURFACE AND WRONG FOR AN OBJECT. Landuse, roads, water and parks
 * are CONTINUOUS GROUND — the plate has to end somewhere, and cutting them at the rim is what
 * makes the plate read as a plate. A BUILDING is an ATOMIC PHYSICAL OBJECT: half of one is not
 * a smaller building, it is a building that does not exist, drawn at full confidence beside
 * real ones. That is [[context-data-honesty-family]] — a fabrication presented as measured
 * data — not a cosmetic edge.
 *
 * ⭐ AND "KEEP WHOLE" IS ALREADY THIS CODEBASE'S ANSWER FOR A RING IT WILL NOT CUT:
 * `ScopeClipVerdict`'s own doc calls `'refused'` *"Kept WHOLE, flagged"*, and the drape budget
 * reports *"0 feature(s) beyond it kept WHOLE on their own seat"*. This lane applies the
 * existing rule to the layer that always needed it.
 *
 *   ARM A — the clipper still reports `cut` honestly. The fix is in what the CALLER does with
 *     that verdict, not in hiding it — a clipper that stopped saying `cut` would take the
 *     measurement away with the defect.
 *   ARM B — ⭐ the three BUILDING tiers pass `keepWhole`, and the GROUND layers do not.
 *   ARM C — the decision is written where the code is, not only in a report.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../../..');
const VP = readFileSync(
    resolve(ROOT, 'apps/editor/src/ui/geospatial/CesiumViewport.ts'), 'utf8',
);

describe('§BUILDINGS-ARE-NOT-SLICED — ARM A · the clipper still tells the truth', () => {
    it('⭐ the TALLY still counts the cut BEFORE the divert — the evidence survives the fix', () => {
        // ⛔ SUPPRESSING THE VERDICT WOULD REMOVE THE FOUNDER'S OWN EVIDENCE ("289 cut") ALONG
        // WITH THE DEFECT. `tally.add(layer, res.verdict)` must run for every ring, and the
        // keep-whole divert must come AFTER it — otherwise the log stops being able to say how
        // many footprints straddle the rim, which is the number that made this lane possible.
        const at = VP.indexOf('private scopeClipRings');
        const body = VP.slice(at, at + 5000);
        const tallyAt = body.indexOf('tally.add(layer, res.verdict)');
        const divertAt = body.indexOf("opts.keepWhole && res.verdict === 'cut'");
        expect(tallyAt).toBeGreaterThan(-1);
        expect(divertAt).toBeGreaterThan(tallyAt);
    });

    it('the clipper itself is UNTOUCHED — `cut` is still a verdict it can return', () => {
        // The fix is in what the CALLER does with the verdict, never in the geometry engine.
        const SC = readFileSync(
            resolve(ROOT, 'apps/editor/src/ui/geospatial/scopeClip.ts'), 'utf8',
        );
        expect(SC).toMatch(/\| 'cut'/);
    });

    it('`refused` was ALREADY "kept whole" — this lane extends an existing rule', () => {
        const SC = readFileSync(
            resolve(ROOT, 'apps/editor/src/ui/geospatial/scopeClip.ts'), 'utf8',
        );
        expect(SC).toMatch(/Kept WHOLE, flagged/);
    });
});

describe('§BUILDINGS-ARE-NOT-SLICED — ARM B · objects keep whole, surfaces still cut', () => {
    const callFor = (layer: string): string => {
        const at = VP.indexOf(`'${layer}',`);
        expect(at, `${layer} must be clipped somewhere`).toBeGreaterThan(-1);
        return VP.slice(at, at + 260);
    };

    it('⭐ every BUILDING tier keeps a straddling footprint WHOLE', () => {
        for (const layer of ['buildings-shadowed', 'buildings-demoted', 'buildings-far']) {
            expect(callFor(layer), `${layer} must keep whole`).toContain('keepWhole: true');
        }
    });

    it('⛔ GROUND layers are NOT keep-whole — the plate must still end at its rim', () => {
        // A landuse polygon kept whole would spill the plate's edge across the whole city and
        // the scope would stop reading as a scope. The distinction is the point of the lane.
        for (const layer of ['landuse', 'parks', 'water-areas']) {
            const at = VP.indexOf(`'${layer}',`);
            if (at < 0) continue;                       // not every layer clips by ring here.
            expect(VP.slice(at, at + 260), `${layer} must still be cut`)
                .not.toContain('keepWhole: true');
        }
    });

    it('the option is OPT-IN — the default stays the pre-change behaviour', () => {
        const at = VP.indexOf('private scopeClipRings');
        const body = VP.slice(at, at + 5000);
        expect(body).toContain('opts: { readonly keepWhole?: boolean } = {}');
        // Only a `cut` verdict is diverted; `inside` / `outside` / `refused` are untouched.
        expect(body).toContain("opts.keepWhole && res.verdict === 'cut'");
    });
});

describe('§BUILDINGS-ARE-NOT-SLICED — ARM C · the decision is written at the code', () => {
    it('the reasoning, and the count that motivated it, live beside the change', () => {
        expect(VP).toContain('§BUILDINGS-ARE-NOT-SLICED');
        expect(VP).toMatch(/ATOMIC PHYSICAL OBJECT/);
        // ⭐ WHY THE GROUND LAYERS ARE DIFFERENT must be recorded, or the next lane
        // "consistently" applies keep-whole to landuse and the plate loses its edge.
        expect(VP).toMatch(/CLIPPING IS RIGHT FOR A SURFACE AND WRONG FOR AN OBJECT/);
    });

    it('and the run SAYS when it kept buildings whole — never a silent change of geometry', () => {
        expect(VP).toMatch(/kept WHOLE instead of cut/);
    });
});
