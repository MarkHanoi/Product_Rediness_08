/**
 * §ENVELOPE-AXES-CONTROL (L-6910..L-6916) — the founder's *"bug on 'envelope off' — the
 * shade goes back"*.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. The defect was never in the rendering logic: the model has
 * had two axes since §ENVELOPE-TWO-AXES (L-1188) and the UI had one button, so the state
 * "hide everything" was representable and unreachable. A suite that only proved "two
 * buttons render" would pass just as happily over a control that writes the same axis
 * twice, or over one that writes BOTH from one click — which is the fix explicitly ruled
 * out, because it would delete the distinction L-1188 exists to introduce and re-open the
 * founder's opposite report from 2026-08-19.
 *
 * So the arms assert: four combinations render distinctly · each switch writes ONE axis ·
 * neither writes the other · the caption tells the truth in every arm · and the state the
 * founder asked for is reachable.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    buildEnvelopeAxesControlHtml,
    wireEnvelopeAxesControl,
    envelopeAxesCaption,
    ENVELOPE_VOLUME_TOGGLE_TESTID,
    ENVELOPE_FOOTPRINT_TOGGLE_TESTID,
    ENVELOPE_AXES_CAPTION_TESTID,
    ENVELOPE_AXES_DRAG_EXCLUDE,
} from '../envelopeVisibilityControl.js';

const REPO = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

const ALL_FOUR = [
    { volume: true, footprint: true },
    { volume: true, footprint: false },
    { volume: false, footprint: true },
    { volume: false, footprint: false },
] as const;

describe('§ENVELOPE-AXES-CONTROL — both axes have a control', () => {
    it('renders TWO switches, one per axis', () => {
        const el = mount(buildEnvelopeAxesControlHtml({ volume: true, footprint: true }));
        expect(el.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`)).not.toBeNull();
        expect(el.querySelector(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`)).not.toBeNull();
    });

    it('each switch REPORTS its own axis, in all four combinations', () => {
        for (const axes of ALL_FOUR) {
            const el = mount(buildEnvelopeAxesControlHtml(axes));
            const vol = el.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`)!;
            const fp = el.querySelector(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`)!;
            expect(vol.getAttribute('aria-checked')).toBe(String(axes.volume));
            expect(fp.getAttribute('aria-checked')).toBe(String(axes.footprint));
            expect(vol.textContent).toContain(axes.volume ? 'ON' : 'OFF');
            expect(fp.textContent).toContain(axes.footprint ? 'ON' : 'OFF');
        }
    });

    it('the VOLUME switch keeps its historic testid — a rename would silently re-enable drag', () => {
        // `makeDraggable(envelopePanel, '[data-envelope-drag]', […])` excludes it by this exact
        // selector (GISAreaLayout.ts) and `makeDraggableOffsetParent.test.ts` pins it. Renaming
        // it would break a passing test and make every click on the control start a drag.
        expect(ENVELOPE_VOLUME_TOGGLE_TESTID).toBe('envelope-toggle');
    });

    it('the drag-exclusion list names BOTH switches', () => {
        // ⛔ The list used to be a literal repeated at the makeDraggable call site. A
        // hand-copied list is exactly how the SECOND switch would keep starting a drag on
        // every click while the first did not.
        expect(ENVELOPE_AXES_DRAG_EXCLUDE).toContain(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`);
        expect(ENVELOPE_AXES_DRAG_EXCLUDE).toContain(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`);
    });
});

describe('§ENVELOPE-AXES-CONTROL — one click writes ONE axis', () => {
    it('the volume switch calls only the volume handler', () => {
        const onToggleVolume = vi.fn();
        const onToggleFootprint = vi.fn();
        const el = mount(buildEnvelopeAxesControlHtml({ volume: true, footprint: true }));
        wireEnvelopeAxesControl(el, { onToggleVolume, onToggleFootprint });
        (el.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`) as HTMLElement).click();
        expect(onToggleVolume).toHaveBeenCalledTimes(1);
        expect(onToggleFootprint).not.toHaveBeenCalled();
    });

    it('the footprint switch calls only the footprint handler', () => {
        const onToggleVolume = vi.fn();
        const onToggleFootprint = vi.fn();
        const el = mount(buildEnvelopeAxesControlHtml({ volume: false, footprint: true }));
        wireEnvelopeAxesControl(el, { onToggleVolume, onToggleFootprint });
        (el.querySelector(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`) as HTMLElement).click();
        expect(onToggleFootprint).toHaveBeenCalledTimes(1);
        expect(onToggleVolume).not.toHaveBeenCalled();
    });

    it('⛔ NEITHER switch writes both axes — the rejected fix', () => {
        // Making the one button write both would delete the L-1188 distinction and re-open
        // the founder's 2026-08-19 report ("When the envelope is OFF we should see this shade
        // on the GROUND"). Two asks, opposite directions.
        for (const testId of [ENVELOPE_VOLUME_TOGGLE_TESTID, ENVELOPE_FOOTPRINT_TOGGLE_TESTID]) {
            const onToggleVolume = vi.fn();
            const onToggleFootprint = vi.fn();
            const el = mount(buildEnvelopeAxesControlHtml({ volume: true, footprint: true }));
            wireEnvelopeAxesControl(el, { onToggleVolume, onToggleFootprint });
            (el.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
            expect(onToggleVolume.mock.calls.length + onToggleFootprint.mock.calls.length).toBe(1);
        }
    });

    it('re-wiring the same nodes does not stack handlers', () => {
        // It assigns `onclick` rather than adding a listener, so a card re-render that
        // re-wires cannot toggle twice per click — which would make the control appear inert.
        const onToggleVolume = vi.fn();
        const onToggleFootprint = vi.fn();
        const el = mount(buildEnvelopeAxesControlHtml({ volume: true, footprint: true }));
        wireEnvelopeAxesControl(el, { onToggleVolume, onToggleFootprint });
        wireEnvelopeAxesControl(el, { onToggleVolume, onToggleFootprint });
        (el.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`) as HTMLElement).click();
        expect(onToggleVolume).toHaveBeenCalledTimes(1);
    });

    it('wiring a root with no control present does not throw', () => {
        expect(() => wireEnvelopeAxesControl(
            mount('<div></div>'), { onToggleVolume: vi.fn(), onToggleFootprint: vi.fn() },
        )).not.toThrow();
    });
});

describe('§ENVELOPE-AXES-CONTROL — the caption tells the truth in every arm', () => {
    it('gives THREE distinct sentences for the three distinguishable draw modes', () => {
        const seen = new Set(ALL_FOUR.map((a) => envelopeAxesCaption(a)));
        // {volume:true,footprint:*} share a sentence on purpose: `envelopeDrawMode` returns
        // 'volume' for both, because the volume's own base IS the footprint and a coplanar
        // shade would z-fight. Claiming otherwise would describe a state the user cannot see.
        expect(seen.size).toBe(3);
    });

    it('the volume-off arm says the shade is STILL THERE and how to clear it', () => {
        // ⭐ THE HALF THAT FIXES THE REPORT. The old caption described the surviving shade as
        // a feature and never said it could be turned off, so a user who pressed OFF had no
        // way to learn the state they wanted existed.
        const txt = envelopeAxesCaption({ volume: false, footprint: true });
        expect(txt).toMatch(/still shaded on the ground/i);
        expect(txt).toMatch(/turn Footprint off/i);
    });

    it('the both-off arm says NOTHING is drawn — and does not imply the determination changed', () => {
        const txt = envelopeAxesCaption({ volume: false, footprint: false });
        expect(txt).toMatch(/nothing is drawn/i);
        // Hiding a constraint is not the same as there being no constraint (C58 §1.4 — a
        // silently-absent envelope reads as "there is no constraint here").
        expect(txt).toMatch(/determination above is\s+unchanged|determination above is unchanged/i);
    });

    it('preserves the estimated-confidence qualifier from the original caption', () => {
        // §L-616 / C58 §1.16 — the shade is drawn from the same provisional determination the
        // card describes, so its honesty caveat has to travel with it. Dropping it while
        // rewriting the control would be a quiet honesty regression.
        expect(envelopeAxesCaption({ volume: false, footprint: true }))
            .toMatch(/same\s+confidence as the figures above/i);
    });

    it('renders the caption into the markup', () => {
        for (const axes of ALL_FOUR) {
            const el = mount(buildEnvelopeAxesControlHtml(axes));
            const cap = el.querySelector(`[data-testid="${ENVELOPE_AXES_CAPTION_TESTID}"]`);
            expect(cap?.textContent?.trim()).toBe(envelopeAxesCaption(axes));
        }
    });
});

describe('§ENVELOPE-AXES-CONTROL — brand + purity', () => {
    it('is white + PRYZM purple, with no black', () => {
        const html = ALL_FOUR.map((a) => buildEnvelopeAxesControlHtml(a)).join('');
        expect(html).toContain('#6600FF');
        expect(html).not.toMatch(/#000\b|#000000|\bblack\b/i);
    });

    it('the producer reads NO global — it renders the axes it is handed', () => {
        // A control that reads the authority itself cannot be driven through its states by a
        // test, and it can display a state the host disagrees with. The host reads once, at
        // render, and passes it in.
        const src = read('apps/editor/src/ui/site/envelopeVisibilityControl.ts');
        expect(src).not.toContain('isBuildableEnvelopeVisible');
        expect(src).not.toContain('setBuildableEnvelopeVisible');
        expect(src).not.toContain('getBuildableEnvelopeAxes');
    });

    it('GISAreaLayout wires the FOOTPRINT setter — the write that never existed', () => {
        // ⭐ THE REACHABILITY ARM. `setBuildableEnvelopeFootprintVisible` shipped with L-1188
        // and had ZERO callers — [[authored-but-unwired-is-the-bottleneck]] in one line. An
        // arm that only checked the export exists would have passed for three days.
        const src = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
        expect(src).toContain('setBuildableEnvelopeFootprintVisible(!isBuildableEnvelopeFootprintVisible())');
    });

    it('GISAreaLayout renders the control from the ONE producer, not from local markup', () => {
        const src = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
        expect(src).toContain('buildEnvelopeAxesControlHtml(getBuildableEnvelopeAxes())');
        // The old single-button literal is gone; a survivor would be a second producer.
        expect(src).not.toContain('Envelope: ${on ? \'ON\' : \'OFF\'}');
    });
});
