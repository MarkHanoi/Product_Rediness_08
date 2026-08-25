// @vitest-environment happy-dom
//
// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D7, C86 §10.6) — the type editor's "Elevation
// outline" section, PROVEN AT THE LAYER THE FOUNDER EXPERIENCES: the real
// `openFinishTypeEditor` DOM. Presets write the DRAFT; the commit gate refuses BY NAME
// with THE predicate's own words; Rectangle resets to "no custom outline"; a family that
// declares no outline capability renders no section (C65 §3.5 — capability, not branch).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openingOutlinePreset, validateCustomOutline } from '@pryzm/geometry-wall/opening-profile';
import { openFinishTypeEditor, type FinishTypeDraft } from '../FinishTypeEditorModal';
import { resolveElementTypeAuthoring } from '../ElementTypeAuthoringRegistry';

const WINDOW = resolveElementTypeAuthoring('window');
const DOOR = resolveElementTypeAuthoring('door');
if (!WINDOW || !DOOR) throw new Error('window and door authoring must be declared');

const INITIAL = (extra: Record<string, unknown> = {}): FinishTypeDraft => ({
    name: 'Outline Test Type',
    frameFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    sillFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    leafFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    glazingOpacity: 0.3,
    dimensions: {},
    ...extra,
});

let saved: FinishTypeDraft[] = [];
let close: (() => void) | null = null;

function open(authoring = WINDOW!, extra: Record<string, unknown> = {}): HTMLElement {
    close = openFinishTypeEditor({
        mode: 'create',
        authoring,
        initial: INITIAL(extra),
        existingNames: [],
        onSave: (d) => { saved.push(d); },
    });
    return document.querySelector('.fte-panel') as HTMLElement;
}

function save(panel: HTMLElement): void {
    const btn = Array.from(panel.querySelectorAll('button'))
        .find((b) => b.textContent?.startsWith('Create '))!;
    btn.click();
}

beforeEach(() => { saved = []; });
afterEach(() => { close?.(); close = null; document.body.innerHTML = ''; });

describe('§OUTLINE81 D7 — the Elevation outline section in the real dialog', () => {
    it('the WINDOW dialog renders the section; the DOOR dialog renders NONE (D12)', () => {
        const winPanel = open(WINDOW!);
        expect(winPanel.querySelector('.fte-outline')).not.toBeNull();
        close!(); close = null; document.body.innerHTML = '';

        const doorPanel = open(DOOR!);
        expect(doorPanel.querySelector('.fte-outline')).toBeNull();
    });

    it('⭐ choosing a PRESET writes a valid ring into the SAVED draft', () => {
        const panel = open();
        const sel = panel.querySelector('.fte-outline-preset') as HTMLSelectElement;
        expect(sel).not.toBeNull();
        sel.value = 'triangle';
        sel.dispatchEvent(new Event('change'));

        save(panel);
        expect(saved.length).toBe(1);
        const ring = saved[0]!.customOutline as { vertices: unknown[] };
        expect(ring?.vertices?.length).toBe(3);
        expect(validateCustomOutline(ring as never)).toBeNull();
    });

    it('Rectangle RESETS: after a preset, Rectangle clears the template from the draft', () => {
        const panel = open();
        const sel = panel.querySelector('.fte-outline-preset') as HTMLSelectElement;
        sel.value = 'gable';
        sel.dispatchEvent(new Event('change'));
        const rectBtn = panel.querySelector('[data-fte-outline-mode="Rectangle"]') as HTMLButtonElement;
        rectBtn.click();

        save(panel);
        expect(saved.length).toBe(1);
        expect(saved[0]!.customOutline).toBeUndefined();
    });

    it('a draft opened WITH a stored template keeps it verbatim through an untouched save', () => {
        const gothic = openingOutlinePreset('gothic');
        const panel = open(WINDOW!, { customOutline: structuredClone(gothic) });
        save(panel);
        expect(saved.length).toBe(1);
        // Round-trip stable to float noise: opening DENORMALISES at the authoring extents
        // and an untouched save re-normalises — same vertex count, coordinates within 1e-12.
        const kept = saved[0]!.customOutline as { vertices: { u: number; v: number }[] };
        expect(kept.vertices.length).toBe(gothic.vertices.length);
        kept.vertices.forEach((p, i) => {
            expect(p.u).toBeCloseTo(gothic.vertices[i]!.u, 12);
            expect(p.v).toBeCloseTo(gothic.vertices[i]!.v, 12);
        });
    });

    it('⛔ the commit gate refuses BY NAME: an invalid ring in the draft blocks Save with the predicate\'s own reason', () => {
        // A hand-damaged duplicate source — the one way an invalid ring can reach the draft.
        const panel = open(WINDOW!, {
            customOutline: { vertices: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }, { u: 0, v: 1 }] },
        });
        save(panel);
        expect(saved.length).toBe(0);        // refused, not saved
        const err = panel.querySelector('.fte-name-error, [class*="err"]')?.textContent
            ?? panel.textContent ?? '';
        expect(err).toContain('cross');      // the crossing named — C16 CA-18
    });

    it('the status line states the template state in words (no template = rectangular)', () => {
        const panel = open();
        const status = panel.querySelector('.fte-outline-status')!;
        expect(status.textContent).toContain('rectangular');
        const sel = panel.querySelector('.fte-outline-preset') as HTMLSelectElement;
        sel.value = 'triangle';
        sel.dispatchEvent(new Event('change'));
        expect(status.textContent).toContain('3 vertices');
    });
});
