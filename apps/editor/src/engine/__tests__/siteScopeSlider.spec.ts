/**
 * §SITE-SCOPE (L-645; C12 §13.4 / §13.5; ADR-0382 D8) — the scope slider's BEHAVIOUR.
 *
 * The four rules the control exists to keep, each asserted against a RECORDING port rather than a
 * viewport (there is no WebGL2 in happy-dom, and a fake Cesium built from this file's own header
 * could not falsify the header — memory `fake-more-capable-than-real`):
 *
 *   1. a pointer MOVE previews and NEVER commits (C12 §13.4) — a load per pointer move would
 *      re-read tiles at 60 Hz, and `site.setScope` is what triggers the reload;
 *   2. the RELEASE commits exactly ONCE even though three listeners are wired to it;
 *   3. the track value is the CIRCUMSCRIBING radius in BOTH shapes (C12 §13.2), so the shape
 *      toggle does not move the knob and the measured range keeps its meaning;
 *   4. a cap that bites inside the scope is STATED WITH ITS NUMBERS (C12 §13.5 / C57 §1.5).
 *
 * ⚠ WHAT THIS CANNOT TELL YOU: whether the preview ring, the globe clip or the slab side actually
 * render. Those are browser facts (AUDIT §7) and are named as unverified in the lane report.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    mountSiteScopeSlider,
    scopeAtRadius,
    describeScope,
    completenessCaption,
    resolveFloorRadiusM,
    type SiteScopeSliderPorts,
} from '../views/SiteScopeSlider';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { LEFT_PANE, RIGHT_PANE } from '../views/paneViewModel';
import { scopeOuterRadiusM } from '../../ui/geospatial/siteScope';
import type { SiteScope } from '@pryzm/schemas';

// ── the recorder ────────────────────────────────────────────────────────────────
interface Recorder extends SiteScopeSliderPorts {
    readonly previews: Array<SiteScope | null>;
    readonly commits: SiteScope[];
    scope: SiteScope | null;
    commitOk: boolean;
    mark: { radiusM: number; boundBy: string; kind: 'cap' | 'read' | 'none' } | null;
    verdicts: Array<{ layer: string; complete: boolean; line: string }>;
    floor: number | null;
}

function recorder(initial: SiteScope | null = { shape: 'circle', radiusM: 900 }): Recorder {
    const r: Recorder = {
        previews: [],
        commits: [],
        scope: initial,
        commitOk: true,
        mark: null,
        verdicts: [],
        floor: null,
        getScope: () => r.scope,
        getRange: () => ({ minRadiusM: 150, maxRadiusM: 1781 }),
        getFloorRadiusM: () => r.floor,
        preview: (s) => { r.previews.push(s); },
        commit: (s) => {
            r.commits.push(s);
            if (r.commitOk) r.scope = s;   // the store would notify; the slider re-reads on paint.
            return r.commitOk;
        },
        getCompleteMark: () => r.mark,
        getCapVerdicts: () => r.verdicts,
    };
    return r;
}

function mountInto(ports: SiteScopeSliderPorts, view: 'site-3d' | 'site-map-2d' = 'site-3d') {
    const paneEl = document.createElement('div');
    document.body.appendChild(paneEl);
    const store = new PaneLayoutStore({ [LEFT_PANE]: view, [RIGHT_PANE]: null });
    const handle = mountSiteScopeSlider({ paneId: LEFT_PANE, paneEl, store, ports });
    const input = paneEl.querySelector<HTMLInputElement>(`[data-testid="site-scope-range-${LEFT_PANE}"]`)!;
    const readout = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-readout-${LEFT_PANE}"]`)!;
    const caption = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-${LEFT_PANE}"]`)!;
    const markEl = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-complete-mark-${LEFT_PANE}"]`)!;
    return { paneEl, store, handle, input, readout, caption, markEl };
}

/** Drag the range to `v` — an `input` event per step, exactly as a pointer drag emits. */
function drag(input: HTMLInputElement, ...values: number[]): void {
    for (const v of values) {
        input.value = String(v);
        input.dispatchEvent(new Event('input'));
    }
}

beforeEach(() => { document.body.innerHTML = ''; });

// ═════════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE — the PURE half: one value, two shapes, one meaning', () => {
    it('the track value IS the circumscribing radius in both shapes (C12 §13.2)', () => {
        for (const r of [150, 500, 900, 1781]) {
            expect(scopeOuterRadiusM(scopeAtRadius(r, 'circle'))).toBeCloseTo(r, 6);
            // ⭐ This is the arm that makes the shape toggle safe: a rectangle at track value r is
            // the square INSCRIBED in that disc, so its half-diagonal is r again. If this drifts,
            // the knob jumps on every toggle and the measured range means two different things.
            expect(scopeOuterRadiusM(scopeAtRadius(r, 'rectangle'))).toBeCloseTo(r, 6);
        }
    });

    it('the readout says what the SLAB is, not just the track number', () => {
        expect(describeScope(scopeAtRadius(900, 'circle'))).toBe('◯ 900 m radius');
        // 900 / √2 = 636.4 half-extent → a 1 273 m square. Reporting "900 m" for that rectangle
        // would understate it by 40 %.
        expect(describeScope(scopeAtRadius(900, 'rectangle'))).toBe('▭ 1 273 × 1 273 m');
    });

    it('the parcel floor raises the measured minimum and never lowers it', () => {
        expect(resolveFloorRadiusM(150, null)).toBe(150);
        expect(resolveFloorRadiusM(150, 40)).toBe(150);      // a tiny plot does not lower the floor
        expect(resolveFloorRadiusM(150, 320)).toBe(320);     // a big plot raises it (D8)
        expect(resolveFloorRadiusM(150, Number.NaN)).toBe(150);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE §13.5 — completeness is one of THREE facts, never two', () => {
    const scope = scopeAtRadius(1200, 'circle');

    it('un-measured says so — it does NOT say complete', () => {
        expect(completenessCaption(scope, null, [])).toMatch(/has not been measured yet/);
    });

    it('measured and holding says complete, with the number it was measured to', () => {
        const c = completenessCaption(scope, { radiusM: 1400, boundBy: 'buildings', kind: 'cap' }, []);
        expect(c).toMatch(/^Complete at this scope/);
        expect(c).toContain('1 400 m');
    });

    it('⛔ a biting cap prints the LAYER LINE with its numbers, never a bare "some were dropped"', () => {
        const c = completenessCaption(scope, { radiusM: 960, boundBy: 'trees', kind: 'cap' }, [
            { layer: 'trees', complete: false, line: 'trees: 3000 of 10300 inside the scope drawn — 7300 dropped by the cap; complete at a scope of ~960 m' },
            { layer: 'buildings', complete: true, line: 'buildings: 900 of 900 inside the scope drawn (cap 14000 not reached)' },
        ]);
        expect(c).toContain('7300 dropped by the cap');
        expect(c).toContain('~960 m');
        // the layer that is COMPLETE is not reported as a loss
        expect(c).not.toContain('cap 14000 not reached');
    });

    it('past the mark with no per-layer verdict still names the mark and what binds it', () => {
        const c = completenessCaption(scope, { radiusM: 900, boundBy: 'trees', kind: 'cap' }, []);
        expect(c).toContain('900 m');
        expect(c).toContain('trees');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE §13.4 — preview on move, commit on release', () => {
    it('⛔ a pointer MOVE previews and does NOT commit', () => {
        const ports = recorder();
        const { input } = mountInto(ports);
        drag(input, 600, 700, 800);
        expect(ports.commits).toHaveLength(0);
        expect(ports.previews).toHaveLength(3);
        expect(scopeOuterRadiusM(ports.previews[2]!)).toBeCloseTo(800, 6);
    });

    it('the RELEASE commits exactly once, and clears the preview ring', () => {
        const ports = recorder();
        const { input } = mountInto(ports);
        drag(input, 600, 700);
        input.dispatchEvent(new Event('change'));
        expect(ports.commits).toHaveLength(1);
        expect(scopeOuterRadiusM(ports.commits[0]!)).toBeCloseTo(700, 6);
        expect(ports.previews.at(-1)).toBeNull();
    });

    it('⛔ three release listeners commit ONCE, not three times', () => {
        // `change`, `pointerup` and `keyup` are all wired (a drag can end outside the element).
        // `onRelease` early-outs once the drag is over, so the belt and braces cost nothing.
        const ports = recorder();
        const { input } = mountInto(ports);
        drag(input, 1000);
        input.dispatchEvent(new Event('change'));
        input.dispatchEvent(new Event('pointerup'));
        input.dispatchEvent(new Event('keyup'));
        expect(ports.commits).toHaveLength(1);
    });

    it('a release with no drag commits nothing', () => {
        const ports = recorder();
        const { input } = mountInto(ports);
        input.dispatchEvent(new Event('change'));
        expect(ports.commits).toHaveLength(0);
    });

    it('a refused commit SAYS SO and does not pretend the slab moved', () => {
        const ports = recorder();
        ports.commitOk = false;
        const { input, caption } = mountInto(ports);
        drag(input, 1200);
        input.dispatchEvent(new Event('change'));
        expect(ports.commits).toHaveLength(1);
        expect(caption.textContent).toMatch(/could not be saved/);
        expect(caption.textContent).toMatch(/view is unchanged/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE — the shape toggle', () => {
    it('keeps the reach and commits the new shape', () => {
        const ports = recorder({ shape: 'circle', radiusM: 900 });
        const { paneEl } = mountInto(ports);
        const rect = paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-shape-rectangle-${LEFT_PANE}"]`)!;
        rect.click();
        expect(ports.commits).toHaveLength(1);
        expect(ports.commits[0]!.shape).toBe('rectangle');
        expect(scopeOuterRadiusM(ports.commits[0]!)).toBeCloseTo(900, 6);
    });

    it('clicking the shape already in force is a no-op (no redundant reload)', () => {
        const ports = recorder({ shape: 'circle', radiusM: 900 });
        const { paneEl } = mountInto(ports);
        paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-shape-circle-${LEFT_PANE}"]`)!.click();
        expect(ports.commits).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE — the control states its own availability', () => {
    it('it is hidden on a pane that is not showing the 3D Site', () => {
        const ports = recorder();
        const { paneEl } = mountInto(ports, 'site-map-2d');
        const root = paneEl.querySelector<HTMLElement>(`[data-pane-scope-slider="${LEFT_PANE}"]`)!;
        expect(root.style.display).toBe('none');
    });

    it('⛔ with no site it is DISABLED and says why — never a fabricated 0', () => {
        const ports = recorder(null);
        const { input, readout, caption } = mountInto(ports);
        expect(input.disabled).toBe(true);
        expect(readout.textContent).toBe('not available');
        expect(caption.textContent).toMatch(/not showing a site yet/);
    });

    it('the complete MARK is drawn on the track when it has been measured, and hidden when not', () => {
        const ports = recorder();
        const { markEl, handle } = mountInto(ports);
        expect(markEl.style.display).toBe('none');
        ports.mark = { radiusM: 966, boundBy: 'trees', kind: 'cap' };   // (966-150)/(1781-150) = 50.03 %
        handle.refresh();
        expect(markEl.style.display).toBe('block');
        expect(markEl.style.left).toContain('50.0');
        expect(markEl.title).toContain('trees');
    });

    it('the range spans the MEASURED range, raised by the parcel floor', () => {
        const ports = recorder();
        ports.floor = 400;
        const { input } = mountInto(ports);
        expect(input.min).toBe('400');
        expect(input.max).toBe('1781');
    });

    it('dispose removes the control and drops the preview ring', () => {
        const ports = recorder();
        const { paneEl, handle } = mountInto(ports);
        handle.dispose();
        expect(paneEl.querySelector(`[data-pane-scope-slider="${LEFT_PANE}"]`)).toBeNull();
        expect(ports.previews.at(-1)).toBeNull();
    });

    it('mounting twice into one pane leaves ONE control', () => {
        const ports = recorder();
        const { paneEl, store } = mountInto(ports);
        mountSiteScopeSlider({ paneId: LEFT_PANE, paneEl, store, ports });
        expect(paneEl.querySelectorAll(`[data-pane-scope-slider="${LEFT_PANE}"]`)).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('§SITE-SCOPE — the SHELL wires one per pane and tears both down', () => {
    /**
     * ⚠ SOURCE-TEXT ARM. `mountSiteAuthoringPaneShell` builds a `MultiPaneController` and mounts
     * real renderers; standing that up in happy-dom would assert the mock, not the wiring. What is
     * checkable here is that the composition file mounts the control into EACH PANE ELEMENT (never
     * `document.body` — the `shellFloatBudget.spec.ts` rule and C59 §2.10.3 clause 4), hands both
     * panes the SAME ports object (one value, two handles — C12 §13.6 forbids a per-pane scope),
     * and disposes them with the rest of the pane chrome.
     */
    const SHELL = readFileSync(resolve(__dirname, '../views/SiteAuthoringPaneShell.ts'), 'utf8');

    it('mounts one slider per pane, into the PANE element', () => {
        expect(SHELL).toContain("mountSiteScopeSlider({ paneId: LEFT_PANE, paneEl: leftPaneEl, store, ports })");
        expect(SHELL).toContain("mountSiteScopeSlider({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store, ports })");
    });

    it('⛔ both panes are handed the SAME ports object — one value, two handles', () => {
        // `const ports = ...` resolved ONCE, above both mounts. Two `defaultSiteScopePorts()` calls
        // would be two objects reading one viewport — harmless today and exactly the shape that
        // drifts once either side caches (the `gisActionRegistry` defect).
        const block = SHELL.slice(SHELL.indexOf('const scopeSliders'), SHELL.indexOf('SWAP-NOT-VACATE'));
        expect((block.match(/defaultSiteScopePorts\(\)/g) ?? []).length).toBe(1);
    });

    it('disposes them with the rest of the pane chrome', () => {
        expect(SHELL).toMatch(/for \(const sl of scopeSliders\)[\s\S]{0,120}sl\.dispose\(\)/);
    });

    it('⛔ nothing is appended to document.body', () => {
        const slider = readFileSync(resolve(__dirname, '../views/SiteScopeSlider.ts'), 'utf8');
        expect(slider).not.toContain('document.body.appendChild');
        expect(slider).not.toMatch(/position:\s*'fixed'/);
        expect(slider).toContain('paneEl.appendChild(root)');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════
/**
 * ⭐ §SITE-SCOPE D2 (lane SCOPE-CUT, 2026-09-07) — WHAT THE SLIDER SAYS AT THE EDGE OF THE
 * FOUNDER'S OWN ASK. He asked for 4x the area (2x the length): a 2 519 m square becomes a 5 038 m
 * square, i.e. a circumscribing radius of 3 562 m, and `CTX_SCOPE_MAX_RADIUS_M` now reaches it.
 * That raise is DELIBERATELY past the measured z16 read ceiling of 1 781 m, and the only thing
 * that makes it honest rather than a silent regression is this caption.
 *
 * ⛔ THE TWO CEILINGS ARE NOT THE SAME FACT AND THE ORDER MATTERS. A render cap THINS the rim; a
 * read ceiling is about what the archive can hand back at all. The read sentence therefore leads,
 * and a biting cap is appended to it rather than replacing it — a plain "if (biting) return" would
 * have hidden the worse fact behind the lesser one at exactly the scope he asked for.
 *
 * ⛔⛔ CORRECTED 2026-09-07 (lane SCOPE-FILL, L-13098) — THIS BLOCK ASSERTED A FOLKLORE THAT WAS
 * MEASURED AND FOUND FALSE, AND THESE TWO TESTS FAILED BECAUSE THE CAPTION WAS FIXED AND THEY WERE
 * NOT. It used to read: *"past the read ceiling the bake's `--drop-densest-as-needed` has already
 * DELETED footprints, so a wider slab draws FEWER buildings"*, and the caption said so to the
 * founder in the product's own voice. Measured against the actual archive, **features are INTACT
 * from z16 to z13** — the step down is a SIMPLIFICATION OF VERTICES, not a loss of features. So the
 * limit being apologised for did not exist for buildings, roads, rail, water or parks, and the
 * caption now says the true thing: those layers FILL THE WHOLE SLAB.
 *
 * ⭐ WHAT SURVIVED THE CORRECTION IS THE PART THAT WAS ALWAYS REAL: **TREES**. The canopy tiles do
 * genuinely coarsen and drop ~60 % of their points across the WHOLE box — including beside the
 * user's own site, which is why the tree ring is held at the last radius that reads complete
 * instead of being allowed to grow thin. That is a real deletion and it is still described as one.
 *
 * ⚠ SO THE ASSERTIONS BELOW CHANGED SUBJECT, NOT STANDARD. They no longer pin "FEWER buildings",
 * because saying that to the founder would now be a lie; they pin that the corrected sentence is
 * present, that the tree deletion is still called a deletion rather than a thinning, and — new —
 * that the disproved claim can never come back silently.
 *
 * ⚠ `boundBy` IS DELIBERATELY NOT ECHOED ON THE `read` PATH ANY MORE. A read ceiling now names the
 * layers it actually binds (`SiteScopeSlider.ts:212`), which a generic label cannot do; the label
 * is still consumed by the `cap` path (`:234`) and by the complete-mark sentences (`:421`/`:423`).
 * A test asserting the label appears in a read caption is asserting the old generic sentence.
 */
describe('§SITE-SCOPE §13.5 — the READ ceiling is a different sentence from a cap', () => {
    const wide = scopeAtRadius(3562, 'rectangle');

    it('past the read ceiling TREES are named as the deletion, and the solid layers as complete', () => {
        const c = completenessCaption(wide, { radiusM: 1781, boundBy: 'the zoom-16 building + canopy read', kind: 'read' }, []);
        expect(c).toContain('1 781 m');
        // The corrected fact: the solid layers are NOT limited by the read ceiling.
        expect(c).toContain('fill the whole slab');
        // …and the one that always was: the canopy tiles really do drop points, everywhere in the
        // box, which is why the ring is HELD rather than allowed to grow thin.
        expect(c).toMatch(/Trees stop at/);
        expect(c, 'a deletion must never be described as a thinning').not.toMatch(/thins the rim/);
        expect(c, 'a deletion must be given its measured size, not left vague').toMatch(/drop ~?60 ?%/);
        // ⛔ THE REGRESSION GUARD FOR THE CORRECTION ITSELF. "a wider slab draws FEWER buildings" was
        // measured FALSE (features are intact z16→z13). If it ever returns to this caption the
        // founder is being told something untrue about his own data, so it fails here rather than
        // in his console.
        expect(c, 'the disproved folklore must never come back').not.toMatch(/FEWER buildings/);
    });

    it('⛔ a biting cap is APPENDED to the read sentence, never substituted for it', () => {
        const c = completenessCaption(wide, { radiusM: 1781, boundBy: 'the zoom-16 building + canopy read', kind: 'read' }, [
            { layer: 'trees', complete: false, line: 'trees: 10000 of 11391 inside the scope drawn — 1391 dropped by the cap; complete at a scope of ~1669 m' },
        ]);
        // The read sentence SURVIVES the cap rather than being replaced by it — that is the whole
        // point of this test, and it is asserted on the corrected sentence rather than the old one.
        expect(c).toContain('fill the whole slab');
        expect(c).toMatch(/Trees stop at/);
        expect(c).toContain('1391 dropped by the cap');
        // …and in that order: read first, cap appended.
        expect(c.indexOf('Trees stop at')).toBeLessThan(c.indexOf('1391 dropped by the cap'));
    });

    it('INSIDE the read ceiling the read sentence does not appear at all', () => {
        const tight = scopeAtRadius(900, 'rectangle');
        const c = completenessCaption(tight, { radiusM: 1781, boundBy: 'the zoom-16 building + canopy read', kind: 'read' }, []);
        expect(c).toMatch(/^Complete at this scope/);
        // ⛔ THIS LINE USED TO READ `expect(c).not.toMatch(/FEWER buildings/)` AND IT HAD BECOME
        // VACUOUS — the caption stopped containing that phrase anywhere, for any scope, when the
        // folklore was corrected, so the assertion passed no matter what this function returned.
        // A check that runs, passes, and could never have failed is the shape this repo keeps
        // finding (a rAF gate that counted comment lines; a setStyle guard counting a comment; the
        // vacuous backdrop guard L-13100 found this morning). Re-pointed at the sentence that
        // ACTUALLY must be absent inside the ceiling.
        expect(c, 'the read sentence must not appear inside the read ceiling').not.toContain('fill the whole slab');
        expect(c).not.toMatch(/Trees stop at/);
    });

    it('the tick tooltip distinguishes the two ceilings', () => {
        const ports = recorder();
        const { markEl, handle } = mountInto(ports);
        ports.mark = { radiusM: 1781, boundBy: 'the zoom-16 building + canopy read', kind: 'read' };
        handle.refresh();
        expect(markEl.title).toContain('already deleted footprints');
        ports.mark = { radiusM: 966, boundBy: 'trees', kind: 'cap' };
        handle.refresh();
        expect(markEl.title).not.toContain('already deleted footprints');
        handle.dispose();
    });
});
