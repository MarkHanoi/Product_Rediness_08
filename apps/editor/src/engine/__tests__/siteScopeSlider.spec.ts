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
    captionNeedsAttention,
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

// ═════════════════════════════════════════════════════════════════════════════════
// §SCOPE-PANEL-50 (L-13189 · C12 §13.5 · §CONTEXT-DATA-HONESTY) — HALF THE FOOTPRINT,
// AND THE HONESTY SENTENCE STILL REACHABLE.
//
// Founder 2026-09-07, red box drawn round this panel: *"Make the panel Scope Rectangular or
// circular smaller - the panel should be 50%"*.
//
// ⚠ "50%" IS HALF THE CURRENT FOOTPRINT, NOT 50% OF THE PANE, and that reading is a MEASUREMENT
// rather than a preference: the house precedent points the other way and would have made the
// panel BIGGER. `--map2d-parcel-card-w` read his earlier *"20%"* as 20% of the pane; 50% of the
// ~948px pane in his screenshot is ~474px, wider than the 420px this panel already was, which
// contradicts *"smaller"* in the same sentence.
//
// ⭐ WHY THE FOOTPRINT IS COMPUTED FROM DECLARED BOXES RATHER THAN FROM `getBoundingClientRect`.
// happy-dom performs no layout: every rect it returns is zero, so a "measurement" taken there
// would be a measurement of nothing that prints the same green as a real one (§L-851). What CAN
// be read faithfully is what the code DECLARED, and in the folded state that is the whole box —
// the caption leaves the flow entirely, so the only term this suite cannot see is the range
// input's UA height, and that is declared here too, precisely so it stops being unknowable.
//
// ⛔ THE SIZE ARM IS USELESS WITHOUT THE HONESTY ARM AND THEY SHIP TOGETHER. Any panel can be
// halved by deleting its sentence; the arms below assert that the sentence is byte-for-byte
// `completenessCaption`'s output, that the fold is refused on every reading that names a limit or
// an absence, and that the refusal is decided by the SAME judgement the caption uses.
// ═════════════════════════════════════════════════════════════════════════════════

/** One declared box, in the terms the panel declares it. */
interface Box {
    readonly widthPx: number;
    readonly padTopPx: number;
    readonly padBottomPx: number;
    readonly headPx: number;
    readonly headMarginPx: number;
    readonly trackPx: number;
}

/** Height of the panel with the caption folded away — every term declared, none guessed. */
function foldedHeightPx(b: Box): number {
    return b.padTopPx + b.headPx + b.headMarginPx + b.trackPx + b.padBottomPx;
}

function footprintPx2(b: Box): number {
    return b.widthPx * foldedHeightPx(b);
}

/**
 * ⛔ THE "BEFORE", WITH ITS PROVENANCE — every number is the value this file declared at
 * `git show 690fba9c:apps/editor/src/engine/views/SiteScopeSlider.ts`, and each is named by the
 * declaration it came from so a reader can check it rather than trust it:
 *
 *   width          `width: 'min(420px, calc(100% - 24px))'`
 *   padding        `padding: '10px 14px 8px'`                        → 10 top, 8 bottom
 *   head           shape button `padding: '6px 9px'` + `font: '600 13px/1 …'` = 6+13+6, plus the
 *                  1px `shapeWrap` border top and bottom              → 27
 *   head margin    `marginBottom: '6px'`
 *   track          `trackWrap` `padding: '2px 0 4px'` + an UNDECLARED `input[type=range]`, whose
 *                  UA box is ~21px tall with ~2px of UA margin above and below → 2 + 25 + 4 = 31
 *
 * ⚠ AND THE CAPTION IS COUNTED AT ITS MINIMUM, WHICH UNDERSTATES THE SAVING ON PURPOSE. In the
 * founder's own screenshot the sentence wraps to two lines inside a 392px content box; this
 * charges the old panel for ONE line (`font: '500 11px/1.4'` + `marginTop: '2px'` = 17.4px). If
 * the ratio below still clears 50% against the most generous possible reading of the old panel,
 * it clears it against the real one.
 */
/** The panel's own source. Read ONCE — the width declaration is the one term happy-dom cannot
 *  hand back (see `readBox`), so it is measured here instead of being invented. */
const SLIDER_SRC = readFileSync(resolve(__dirname, '../views/SiteScopeSlider.ts'), 'utf8');

const BEFORE: Box = {
    widthPx: 420,
    padTopPx: 10,
    padBottomPx: 8,
    headPx: 6 + 13 + 6 + 2,
    headMarginPx: 6,
    trackPx: 2 + (21 + 2 + 2) + 4,
};
const BEFORE_MIN_CAPTION_PX = 11 * 1.4 + 2;

/** `'7px 10px 6px'` → `{ top: 7, bottom: 6 }`. Shorthand only; the panel writes no long-hand. */
function readPadding(el: HTMLElement): { top: number; bottom: number } {
    const parts = el.style.padding.trim().split(/\s+/).map((p) => Number.parseFloat(p));
    if (parts.length === 3) return { top: parts[0]!, bottom: parts[2]! };
    if (parts.length === 2) return { top: parts[0]!, bottom: parts[0]! };
    if (parts.length === 1) return { top: parts[0]!, bottom: parts[0]! };
    return { top: parts[0]!, bottom: parts[2]! };
}

function px(v: string): number {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

/** Read the AFTER box off the REAL mounted control — declarations, not a replica of them. */
function readBox(paneEl: HTMLElement): Box {
    const root = paneEl.querySelector<HTMLElement>(`[data-pane-scope-slider="${LEFT_PANE}"]`)!;
    const shapeBtn = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-shape-rectangle-${LEFT_PANE}"]`)!;
    const input = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-range-${LEFT_PANE}"]`)!;
    const trackWrap = input.parentElement!;
    const head = root.firstElementChild as HTMLElement;

    // ⛔ THE WIDTH IS READ FROM THE SOURCE AND EVERY OTHER TERM FROM THE DOM, AND THE SPLIT IS
    // FORCED BY THE ENVIRONMENT, NOT CHOSEN. happy-dom's CSS parser DISCARDS any `min(…)` value —
    // measured, not assumed: `el.style.width = 'min(300px, 90%)'` reads back as `''`, while the
    // `padding` set in the same `Object.assign` survives intact. So `root.style.width` here is
    // empty no matter what the panel declares, and a DOM read would be measuring the parser rather
    // than the panel — it would go green on a panel that had DELETED its width, which is the one
    // regression this arm exists to catch.
    const widthMatch = /width:\s*'min\((\d+)px,\s*calc\(100% - 24px\)\)'/.exec(SLIDER_SRC);
    if (!widthMatch) {
        throw new Error('[§SCOPE-PANEL-50] the panel width is no longer a '
            + "`min(<n>px, calc(100% - 24px))` declaration in SiteScopeSlider.ts — re-read the "
            + `declaration before trusting this suite. DOM said "${root.style.width}".`);
    }

    const btnPad = shapeBtn.style.padding.trim().split(/\s+/).map((p) => Number.parseFloat(p));
    // ⚠ THE SPACES AROUND THE SLASH ARE THE ENVIRONMENT'S, NOT THE PANEL'S. The source writes
    // `600 12px/1 system-ui, sans-serif`; happy-dom re-serialises the `font` shorthand as
    // `600 12px / 1 system-ui, sans-serif`. Pinning the tight spelling would fail on a panel that
    // had changed nothing — a test that reports the serialiser as a regression in the subject.
    const btnFont = /(\d+)px\s*\/\s*(\d+(?:\.\d+)?)/.exec(shapeBtn.style.font);
    if (!btnFont) throw new Error(`[§SCOPE-PANEL-50] the shape button font is unreadable: ${shapeBtn.style.font}`);
    // `600 12px/1 …` — a unitless line-height multiplies the font size.
    const btnLine = Number(btnFont[1]) * Number(btnFont[2]);

    const rootPad = readPadding(root);
    const trackPad = readPadding(trackWrap);
    // ⭐ THE UA HEIGHT IS DECLARED NOW, WHICH IS THE POINT — an undeclared range input contributes
    // a number this suite would have to invent. If the declaration is ever dropped, this throws
    // rather than silently substituting a guess.
    if (!input.style.height || input.style.margin !== '0px') {
        throw new Error(`[§SCOPE-PANEL-50] the track must declare its own height AND zero the UA margin, got height="${input.style.height}" margin="${input.style.margin}"`);
    }
    return {
        widthPx: Number(widthMatch[1]),
        padTopPx: rootPad.top,
        padBottomPx: rootPad.bottom,
        headPx: btnPad[0]! * 2 + btnLine + 2,
        headMarginPx: px(head.style.marginBottom),
        trackPx: trackPad.top + px(input.style.height) + trackPad.bottom,
    };
}

describe('§SCOPE-PANEL-50 — the footprint, MEASURED from what the panel declares', () => {
    it('⭐ folds to at most HALF the footprint it had, charged against the old panel at its smallest', () => {
        const { paneEl } = mountInto(recorder());
        const after = readBox(paneEl);
        const beforePx2 = BEFORE.widthPx * (foldedHeightPx(BEFORE) + BEFORE_MIN_CAPTION_PX);
        const afterPx2 = footprintPx2(after);
        // The founder's number, as an inequality rather than as a claim about pixels nobody read.
        expect(afterPx2 / beforePx2).toBeLessThanOrEqual(0.5);
        // …and the two axes separately, so a regression says WHICH one moved.
        expect(after.widthPx).toBeLessThanOrEqual(BEFORE.widthPx * 0.75);
        expect(foldedHeightPx(after)).toBeLessThanOrEqual(foldedHeightPx(BEFORE) * 0.75);
    });

    it('every axis moved DOWN — no term of the box grew to pay for another', () => {
        const { paneEl } = mountInto(recorder());
        const after = readBox(paneEl);
        expect(after.widthPx).toBeLessThan(BEFORE.widthPx);
        expect(after.padTopPx).toBeLessThan(BEFORE.padTopPx);
        expect(after.padBottomPx).toBeLessThan(BEFORE.padBottomPx);
        expect(after.headPx).toBeLessThan(BEFORE.headPx);
        expect(after.headMarginPx).toBeLessThan(BEFORE.headMarginPx);
        expect(after.trackPx).toBeLessThan(BEFORE.trackPx);
    });

    it('stays a PANE float — the shrink did not move it off its pane (C59 §2.10.3 clause 4)', () => {
        const { paneEl } = mountInto(recorder());
        const root = paneEl.querySelector<HTMLElement>(`[data-pane-scope-slider="${LEFT_PANE}"]`)!;
        expect(root.style.position).toBe('absolute');
        expect(root.style.left).toBe('50%');
        expect(root.style.transform).toBe('translateX(-50%)');
        // Narrow panes still clamp it inside their own edges rather than overflowing them.
        // ⛔ ASSERTED ON THE SOURCE for the reason `readBox` records: happy-dom discards `min(…)`,
        // so `root.style.width` is `''` here however the panel is written.
        expect(SLIDER_SRC).toContain("width: 'min(300px, calc(100% - 24px))'");
    });
});

describe('§SCOPE-PANEL-50 — the honesty sentence is FOLDED, never shortened, never lost', () => {
    const readingScope = scopeAtRadius(1200, 'circle');

    it('⛔ the caption is byte-for-byte `completenessCaption` — the shrink cost it no words', () => {
        const r = recorder(readingScope);
        r.mark = { radiusM: 1600, boundBy: 'canopy read', kind: 'read' };
        const { caption } = mountInto(r);
        expect(caption.textContent).toBe(completenessCaption(readingScope, r.mark, []));
    });

    it('folds only the plainly-COMPLETE reading, and one click brings it back', () => {
        const r = recorder(readingScope);
        r.mark = { radiusM: 1600, boundBy: 'canopy read', kind: 'read' };
        const { paneEl, caption } = mountInto(r);
        const toggle = paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)!;
        // Inside the mark: a reassurance. It starts folded — this is the founder's 50%.
        expect(caption.style.display).toBe('none');
        expect(toggle.disabled).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        toggle.click();
        expect(caption.style.display).toBe('block');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(caption.textContent).toMatch(/^Complete at this scope/);
        toggle.click();
        expect(caption.style.display).toBe('none');
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠⚠ §SCOPE-LIMIT-IS-A-LINE-NOT-A-PARAGRAPH (founder 2026-09-09 · L-13293) AMENDS THE ARMS
    // BELOW, WHICH PINNED §SCOPE-PANEL-50 (his own ruling of 2026-09-07, L-13189).
    //
    // FOUNDER, red box round a panel whose caption was pinned open by two biting caps:
    //   *"i want this panel to have all the text as a drop down - the user can choose to show it
    //    or not - otherwise is taking too much space"*
    //
    // ⭐ THE OLD RULING'S REASON SURVIVES AND IS STILL ENFORCED HERE. It was never "a limit needs
    // four lines"; it was *"the user cannot be unaware a cap is biting"*, and folding an honesty
    // statement outright is how a product quietly stops disclosing. What changed is the SHAPE of
    // the guarantee, not the guarantee:
    //   · the PARAGRAPH is now always foldable, and the toggle is NEVER disabled;
    //   · the VERDICT SENTENCE moves to `site-scope-caption-lead`, un-foldable, shown exactly when
    //     the reading names a limit and the paragraph is closed.
    // The limit is still impossible to miss at the panel's smallest — that is what these arms now
    // test, and it is why this is an AMENDMENT rather than a repeal.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    it('⛔⛔ a reading that names a LIMIT is foldable — but its VERDICT never leaves the panel', () => {
        const r = recorder(scopeAtRadius(1700, 'circle'));
        r.mark = { radiusM: 900, boundBy: 'canopy read', kind: 'read' };
        const { paneEl, caption } = mountInto(r);
        const toggle = paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)!;
        const lead = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;

        // Folded by default now — the founder's space back.
        expect(caption.style.display).toBe('none');
        // ⛔ AND THE LIMIT IS STILL ON SCREEN. This is the whole of §SCOPE-PANEL-50's guarantee.
        expect(lead.style.display).toBe('block');
        expect(lead.textContent).not.toBe('');
        // ⛔ The toggle may ALWAYS be pressed — that refusal is what he was looking at.
        expect(toggle.disabled).toBe(false);

        toggle.click();
        expect(caption.style.display).toBe('block');
        // ⛔ NEVER BOTH: the lead IS the paragraph's first sentence, so it would print twice.
        expect(lead.style.display).toBe('none');
        toggle.click();
        expect(caption.style.display).toBe('none');
        expect(lead.style.display).toBe('block');
    });

    it('⭐ the lead is the caption OWN first sentence — never a second, re-worded verdict', () => {
        const r = recorder(scopeAtRadius(1700, 'circle'));
        r.mark = { radiusM: 900, boundBy: 'canopy read', kind: 'read' };
        const { paneEl, caption } = mountInto(r);
        const lead = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;
        // A rival sentence here is the rival-solver shape §SCOPE-PANEL-50 spends a paragraph
        // forbidding, and a biconditional on WHETHER a limit exists could not catch a rival that
        // differs only in wording. So pin containment against the one producer's text.
        expect(lead.textContent!.length).toBeGreaterThan(0);
        expect(caption.textContent!.startsWith(lead.textContent!)).toBe(true);
    });

    it('⛔ an UNMEASURED reading is pinned open too — unmeasured and clean are different values', () => {
        const r = recorder(readingScope);
        r.mark = null;
        const { paneEl, caption } = mountInto(r);
        const toggle = paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)!;
        expect(caption.textContent).toMatch(/has not been measured yet/);
        // §SCOPE-LIMIT-IS-A-LINE-NOT-A-PARAGRAPH — foldable, but "unmeasured" still shows, because
        // an unmeasured layer and a clean one remain DIFFERENT VALUES and the lead says which.
        expect(caption.style.display).toBe('none');
        expect(toggle.disabled).toBe(false);
        const lead = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;
        expect(lead.style.display).toBe('block');
        expect(lead.textContent).toMatch(/has not been measured yet/);
    });

    it('a BITING cap is pinned open with its numbers, inside the mark or not', () => {
        const r = recorder(readingScope);
        r.mark = { radiusM: 1600, boundBy: 'canopy read', kind: 'read' };
        r.verdicts = [{ layer: 'buildings', complete: false, line: 'buildings: 12 000 eligible, 8 000 drawn, 4 000 dropped.' }];
        const { paneEl, caption } = mountInto(r);
        const toggle = paneEl.querySelector<HTMLButtonElement>(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)!;
        const lead = paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;
        // §SCOPE-LIMIT-IS-A-LINE-NOT-A-PARAGRAPH — the NUMBERS may fold; the VERDICT may not.
        expect(caption.style.display).toBe('none');
        expect(toggle.disabled).toBe(false);
        expect(lead.style.display).toBe('block');
        // ⭐ The numbers are still ONE CLICK away and still exact — not summarised, not rounded.
        toggle.click();
        expect(caption.style.display).toBe('block');
        expect(caption.textContent).toContain('4 000 dropped');
    });

    it('the "no site yet" and "could not be saved" readings are never foldable either', () => {
        const noSite = mountInto(recorder(null));
        // These are not completeness readings at all, so they are `pinned` and the LEAD carries
        // them — the paragraph itself folds like every other.
        expect(noSite.caption.style.display).toBe('none');
        expect(noSite.caption.textContent).toMatch(/not showing a site yet/);
        const noSiteLead = noSite.paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;
        expect(noSiteLead.style.display).toBe('block');
        expect(noSiteLead.textContent).toMatch(/not showing a site yet/);

        const r = recorder(readingScope);
        r.mark = { radiusM: 1600, boundBy: 'canopy read', kind: 'read' };
        const m = mountInto(r);
        r.commitOk = false;
        drag(m.input, 800);
        m.input.dispatchEvent(new Event('change'));
        expect(m.caption.textContent).toMatch(/could not be saved/);
        expect(m.caption.style.display).toBe('none');
        const savedLead = m.paneEl.querySelector<HTMLElement>(`[data-testid="site-scope-caption-lead-${LEFT_PANE}"]`)!;
        expect(savedLead.style.display).toBe('block');
        expect(savedLead.textContent).toMatch(/could not be saved/);
    });

    it('drops its listener on dispose, like every other control in this panel', () => {
        const { paneEl, handle } = mountInto(recorder());
        expect(paneEl.querySelector(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)).not.toBeNull();
        handle.dispose();
        expect(paneEl.querySelector(`[data-testid="site-scope-caption-toggle-${LEFT_PANE}"]`)).toBeNull();
    });
});

describe('§SCOPE-PANEL-50 — the fold judgement and the SENTENCE cannot drift apart', () => {
    /**
     * ⭐⭐ THE EQUIVALENCE ARM, AND IT IS THE REASON A SECOND JUDGEMENT WAS ALLOWED TO EXIST.
     *
     * `captionNeedsAttention` is a rival of `completenessCaption`: both weigh the same three
     * §CONTEXT-DATA-HONESTY facts. Rival solvers are how this repo has repeatedly ended up with
     * two answers to one question (three disagreeing commandManager counters, rival compose
     * roots), so the rival is PINNED to the original rather than trusted beside it: the fold is
     * refused if and ONLY IF the sentence is not one of the two "Complete at this scope" arms.
     *
     * Move an arm boundary in EITHER function and this fails by name — which is exactly what a
     * lane rewriting the caption's text (as one is, next door) needs it to do.
     */
    const CASES = [
        { name: 'unmeasured', scope: scopeAtRadius(1200, 'circle'), mark: null, verdicts: [] },
        { name: 'inside a cap mark', scope: scopeAtRadius(900, 'circle'), mark: { radiusM: 1600, boundBy: 'building density', kind: 'cap' as const }, verdicts: [] },
        { name: 'inside a read mark', scope: scopeAtRadius(900, 'circle'), mark: { radiusM: 1600, boundBy: 'canopy read', kind: 'read' as const }, verdicts: [] },
        { name: 'every cap holds', scope: scopeAtRadius(900, 'circle'), mark: { radiusM: 900, boundBy: 'none (every cap holds)', kind: 'none' as const }, verdicts: [{ layer: 'buildings', complete: true, line: 'buildings: all drawn.' }] },
        { name: 'exactly on the mark', scope: scopeAtRadius(1600, 'circle'), mark: { radiusM: 1600, boundBy: 'canopy read', kind: 'read' as const }, verdicts: [] },
        { name: 'past a read mark', scope: scopeAtRadius(1700, 'circle'), mark: { radiusM: 900, boundBy: 'canopy read', kind: 'read' as const }, verdicts: [] },
        { name: 'past a cap mark', scope: scopeAtRadius(1700, 'circle'), mark: { radiusM: 900, boundBy: 'building density', kind: 'cap' as const }, verdicts: [] },
        { name: 'a cap bites inside the mark', scope: scopeAtRadius(900, 'circle'), mark: { radiusM: 1600, boundBy: 'canopy read', kind: 'read' as const }, verdicts: [{ layer: 'trees', complete: false, line: 'trees: 40 000 eligible, 16 000 drawn.' }] },
    ];

    it.each(CASES)('$name — the fold is refused if and only if the sentence is not "Complete at this scope"', (c) => {
        const sentence = completenessCaption(c.scope, c.mark, c.verdicts);
        const reassuring = sentence.startsWith('Complete at this scope');
        expect(captionNeedsAttention(c.scope, c.mark, c.verdicts)).toBe(!reassuring);
    });

    it('the table exercises BOTH sides of the biconditional, so it cannot pass vacuously', () => {
        const verdictsOf = CASES.map((c) => captionNeedsAttention(c.scope, c.mark, c.verdicts));
        expect(verdictsOf).toContain(true);
        expect(verdictsOf).toContain(false);
    });
});
