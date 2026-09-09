// ADR-0383 D6 — ONE SELECTION, THREE SURFACES. The cross-surface proof.
//
// ADR-0383 D6 · C59 §2.10 (one owner per view region) · C84 EI-9 · [[view-region-one-owner]].
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS SEPARATELY FROM THE THREE SURFACES' OWN SPECS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Each surface's spec proves that SURFACE behaves. None of them can prove the property that
// actually matters, which is a statement about the THREE TOGETHER: that a selection made anywhere
// is the same selection everywhere, because there is exactly one place it lives.
//
// ⛔ THIS IS NOT A HYPOTHETICAL RISK IN THIS REPOSITORY. [[view-region-one-owner]]: the founder's
// split-view "the views get mixed up" report was **six writers of `#container.style.width`**
// oscillating against each other, and C59 §2.10 was written to close it. ADR-0383 D6 adopts the
// same rule for the group selection *"BEFORE the second writer exists rather than after"*. A rule
// adopted early is only worth anything if something fails when it is broken — that is this file.
//
// ⚠ WHAT IT CAN AND CANNOT EXECUTE. The site panel is real DOM and is DRIVEN here. The 2D map and
// the 3D scene need MapLibre and a WebGL Cesium viewer, so their half is asserted against SOURCE —
// specifically the two things that would make them a second writer: declaring a selection slot of
// their own, or resolving membership through their own `group` parser. Those are the exact two
// mistakes D6 forbids, so the weaker instrument is aimed at the right target.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    mountMassingGroupSection,
    MASSING_GROUP_ID_ATTR,
    type MassingGroupSectionDeps,
} from '../massingGroupSection';
import {
    getMassingGroupSelection,
    getSelectedMassingGroupId,
    setMassingGroupSelection,
    isMassingGroupSelected,
    __resetMassingGroupSelectionForTests,
} from '../massingGroupSelectionState';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';

const MAP2D = readFileSync(
    resolve(__dirname, '../../geospatial/SiteBoundaryMap2D.ts'), 'utf8');
const CESIUM = readFileSync(
    resolve(__dirname, '../../geospatial/CesiumViewport.ts'), 'utf8');
const PANEL = readFileSync(resolve(__dirname, '../massingGroupSection.ts'), 'utf8');

const codeOnly = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const SURFACES: readonly (readonly [string, string])[] = [
    ['the 2D site map', codeOnly(MAP2D)],
    ['the 3D Site scene', codeOnly(CESIUM)],
    ['the site panel', codeOnly(PANEL)],
];

const LEVELS: readonly AdoptLevelCandidate[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
    { id: 'L1', name: 'Level 1', elevation: 3, height: 3 },
];
const A = { id: 'g-a', label: 'Block A' };
const B = { id: 'g-b', label: 'Block B' };

function envRec(id: string, levelId: string, group: { id: string; label: string }): Record<string, unknown> {
    return {
        id, role: 'level', levelId, footprintAreaM2: 100, height: 3,
        provenance: { origin: 'authored' },
        footprint: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }],
    ...(group ? { group } : {}) };
}

let host: HTMLElement;
let panel: { refresh(): void; dispose(): void } | null = null;

const deps = (): MassingGroupSectionDeps => ({
    readStore: () => {
        const m = new Map<string, unknown>();
        for (const r of [envRec('a0', 'L0', A), envRec('a1', 'L1', A), envRec('b0', 'L0', B)]) {
            m.set(r.id as string, r);
        }
        return { getState: () => m as ReadonlyMap<string, unknown> };
    },
    readLevels: () => LEVELS,
    readRegisteredCommandTypes: () => [],
});

beforeEach(() => {
    __resetMassingGroupSelectionForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    panel = mountMassingGroupSection(host, deps());
});
afterEach(() => {
    try { panel?.dispose(); } catch { /* teardown */ }
    panel = null;
    host.remove();
});

const rowFor = (id: string): HTMLElement =>
    host.querySelector(`[${MASSING_GROUP_ID_ATTR}="${id}"]`) as HTMLElement;
const selectedIds = (): string[] =>
    [...host.querySelectorAll('[aria-selected="true"]')]
        .map((e) => e.getAttribute(MASSING_GROUP_ID_ATTR) ?? '');

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ a selection driven from ANY surface is the SAME selection everywhere', () => {
    // Each arm drives the channel with a different `source` — the value each surface stamps — and
    // asserts the ONE owner and the ONE rendered surface agree. If any surface kept its own slot,
    // the panel would keep lighting whatever IT last clicked.

    it('driven from the SITE PANEL', () => {
        (rowFor('g-a').firstElementChild as HTMLElement).click();
        expect(getSelectedMassingGroupId()).toBe('g-a');
        expect(getMassingGroupSelection()!.source).toBe('site-panel');
        expect(selectedIds()).toEqual(['g-a']);
    });

    it('driven from the 2D MAP — the panel follows, having never been clicked', () => {
        setMassingGroupSelection({ groupId: 'g-b', label: 'Block B', source: 'site-map-2d' });
        expect(getSelectedMassingGroupId()).toBe('g-b');
        expect(selectedIds()).toEqual(['g-b']);
        expect(isMassingGroupSelected('g-b')).toBe(true);
        expect(isMassingGroupSelected('g-a')).toBe(false);
    });

    it('driven from the 3D SCENE — same result, and the source does not change the answer', () => {
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(getSelectedMassingGroupId()).toBe('g-a');
        expect(selectedIds()).toEqual(['g-a']);
    });

    it('⭐ HANDED OFF SURFACE TO SURFACE, the previous selection is REPLACED, never accumulated', () => {
        // Three writers in sequence. If any of them held its own slot, two rows would read as
        // selected at once — which is exactly what the six-writer defect looked like on screen.
        (rowFor('g-a').firstElementChild as HTMLElement).click();      // panel
        expect(selectedIds()).toEqual(['g-a']);
        setMassingGroupSelection({ groupId: 'g-b', label: 'Block B', source: 'site-map-2d' });
        expect(selectedIds()).toEqual(['g-b']);
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(selectedIds()).toEqual(['g-a']);
        // ⛔ EXACTLY ONE selected row at every step, never two.
        expect(selectedIds()).toHaveLength(1);
    });

    it('deselecting anywhere deselects everywhere', () => {
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(selectedIds()).toEqual(['g-a']);
        setMassingGroupSelection(null);
        expect(selectedIds()).toEqual([]);
        expect(getMassingGroupSelection()).toBeNull();
    });

    it('the LABEL never decides anything — a stale spelling still selects the right block', () => {
        // ADR-0383 D1 names `label` as the denormalised field that can drift, and the channel's
        // header rules it is for a SENTENCE, never a lookup. A surface holding a stale copy must
        // still be able to select correctly.
        setMassingGroupSelection({ groupId: 'g-a', label: 'STALE NAME', source: 'site-map-2d' });
        expect(selectedIds()).toEqual(['g-a']);
        // and the panel prints the ROSTER's spelling, not the channel's
        expect(rowFor('g-a').textContent).toContain('Block A');
        expect(rowFor('g-a').textContent).not.toContain('STALE NAME');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ NO SURFACE OWNS A SECOND SELECTION (C59 §2.10) — the six-writer defect, pre-empted', () => {
    for (const [name, src] of SURFACES) {
        it(`${name} declares no rival selection slot`, () => {
            expect(src).not.toMatch(/\b(let|private|var)\s+selectedMassingGroup\b/);
            expect(src).not.toMatch(/\b(let|private|var)\s+selectedGroupId\s*[:=]/);
            expect(src).not.toMatch(/\b(let|private|var)\s+currentMassingGroup\b/);
        });

        it(`${name} reads the channel rather than comparing ids itself`, () => {
            const readsChannel = /getSelectedMassingGroupId|isMassingGroupSelected/.test(src);
            expect(readsChannel, `${name} must read the ONE channel`).toBe(true);
        });

        it(`${name} resolves membership through the ONE reader, never its own group parser`, () => {
            // C84 EI-9. A second `raw.group` / `rec.group` projection would let the surfaces
            // disagree about which block a prism is in, on exactly the records they validate
            // differently — the [[same-rule-two-implementations]] shape, invisible until it bites.
            expect(src).not.toMatch(/\brec\?\.group\b/);
            expect(src).not.toMatch(/\braw\.group\b/);
        });
    }

    it('⭐ AND EXACTLY ONE MODULE OWNS THE SLOT — the writers are the setter, nothing else', () => {
        // The slot itself (`let selection`) lives in `massingGroupSelectionState.ts` and nowhere
        // else. Every surface goes through `setMassingGroupSelection`.
        const owner = codeOnly(readFileSync(
            resolve(__dirname, '../massingGroupSelectionState.ts'), 'utf8'));
        expect(owner).toMatch(/let selection: MassingGroupSelection \| null = null;/);
        // and the assignment happens in exactly one function
        expect((owner.match(/selection = next;/g) ?? [])).toHaveLength(1);
        expect((owner.match(/selection = null;/g) ?? [])).toHaveLength(1);   // the test-only reset
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ NO SURFACE CACHES A MEMBER LIST (ADR-0383 D6 / C84 EI-9)', () => {
    it('the channel carries an id, and no surface stores memberIds', () => {
        // A member list captured at selection time is a cache of a store query. It goes stale the
        // instant `setStoreys` adds a storey, and the surface holding it would emphasise four
        // prisms of a five-prism building while the panel beside it counted five.
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-panel' });
        expect(Object.keys(getMassingGroupSelection()!).sort())
            .toEqual(['groupId', 'label', 'source']);
        for (const [name, src] of SURFACES) {
            expect(src, `${name} must not cache membership`).not.toMatch(/memberIds/);
        }
    });

    it('⭐ and the panel re-reads membership from the store on every repaint', () => {
        // Proven by construction: adding a storey to the selected block and repainting must show
        // the new count without the selection being touched.
        let recs = [envRec('a0', 'L0', A)];
        panel?.dispose();
        panel = mountMassingGroupSection(host, {
            ...deps(),
            readStore: () => {
                const m = new Map<string, unknown>();
                for (const r of recs) m.set(r.id as string, r);
                return { getState: () => m as ReadonlyMap<string, unknown> };
            },
        });
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(rowFor('g-a').textContent).toContain('1 storey');
        recs = [envRec('a0', 'L0', A), envRec('a1', 'L1', A)];
        panel.refresh();
        expect(rowFor('g-a').textContent).toContain('2 storeys');
        expect(getSelectedMassingGroupId()).toBe('g-a');       // selection survived, unchanged
    });
});
