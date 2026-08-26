/**
 * §LIGHT121 (L-11904) — founder: "floor lighting" (uplighters, floor-recessed
 * spots, plinth/cove LED).
 *
 * `CreateRailPanelLighting.ts`'s "Floor Standing" mount group
 * (`mount: 'floor', where: 'interior'`) already held the three legacy hand-
 * authored floor LAMPS (`floor_wood_post`, `floor_arc_brass`,
 * `floor_tripod_black` — none of the twelve pre-existing families author a
 * `location`, which the panel's own rule counts as interior). What it held
 * NONE of was a floor-mount ARCHITECTURAL luminaire — every LOD-200 `mount:
 * 'floor'` row (the five §OUTDOOR112 site fixtures + the legacy
 * `bollard_light`) is `location: 'exterior'`, so this section was lamps only.
 * This suite is the "remove-a-row-removes-a-card" derivation proof, run in
 * both directions:
 *
 *   1. the four new rows (`floor_uplighter_recessed`, `floor_uplighter_surface`,
 *      `floor_recessed_spot`, `plinth_cove_led`) join the three floor lamps in
 *      that EXACT pre-existing section — CreateRailPanelLighting.ts itself was
 *      NOT edited to add them, which is the whole point of the registry-derived
 *      design (§LIGHT102, L-11503);
 *   2. the "Outdoor & Site" group (the exterior slice of the SAME mount class)
 *      still shows only exterior rows — the split by `location` still holds.
 */
import { describe, it, expect } from 'vitest';
import { buildLightingPanel } from '../tools-panel/panels/CreateRailPanelLighting';
import { BUILT_IN_LIGHTING_TYPES } from '@pryzm/geometry-lighting';

const NEW_FLOOR_IDS = [
    'floor_uplighter_recessed', 'floor_uplighter_surface',
    'floor_recessed_spot', 'plinth_cove_led',
];

function cardIds(panel: HTMLElement): string[] {
    return Array.from(panel.querySelectorAll<HTMLElement>('[data-fixture-type]'))
        .map((c) => c.dataset.fixtureType!);
}

function headings(panel: HTMLElement): string[] {
    // Group headings are the only bare, un-carded text nodes the panel writes at
    // 9px/700 — selected here by the fact that they precede a run of cards, not
    // by a class name (the panel styles inline, per its own header).
    const out: string[] = [];
    for (const child of Array.from(panel.children)) {
        if (child.tagName === 'DIV' && !child.hasAttribute('data-fixture-type') && !(child as HTMLElement).querySelector('[data-fixture-type]')) {
            const text = child.textContent?.trim();
            if (text && !text.includes('Activate')) out.push(text);
        }
    }
    return out;
}

describe('§LIGHT121 / L-11904 — the "Floor Standing" (interior) group gains its first ARCHITECTURAL luminaires', () => {
    it('the registry itself carries the four new rows as floor / interior — the fact the panel derives from', () => {
        for (const id of NEW_FLOOR_IDS) {
            const row = BUILT_IN_LIGHTING_TYPES.find((t) => t.id === id);
            expect(row, `${id} missing from the registry`).toBeDefined();
            expect(row!.mount, id).toBe('floor');
            expect(row!.location, id).toBe('interior');
        }
    });

    it('"Floor Standing" renders (it already did, for the three legacy floor lamps)', () => {
        const panel = buildLightingPanel();
        expect(headings(panel)).toContain('Floor Standing');
    });

    it('all four new fixtures are placeable cards in the panel, un-edited', () => {
        const panel = buildLightingPanel();
        const ids = cardIds(panel);
        for (const id of NEW_FLOOR_IDS) {
            expect(ids, `${id} is not a reachable card`).toContain(id);
        }
    });

    it('every "Floor Standing" card names an interior floor row (three legacy lamps + the four new luminaires), and no exterior row leaks in', () => {
        const panel = buildLightingPanel();
        const groups = Array.from(panel.children);
        const idx = groups.findIndex((c) => c.textContent?.trim() === 'Floor Standing');
        expect(idx, 'heading not found').toBeGreaterThanOrEqual(0);
        // Cards belonging to this heading run until the next heading (or the
        // trailing night-mode hint) — collect them the same way a human reads them.
        const cardsInGroup: string[] = [];
        for (let i = idx + 1; i < groups.length; i++) {
            const el = groups[i] as HTMLElement;
            const fixtureType = el.dataset.fixtureType;
            if (!fixtureType) break; // next heading or the trailing hint
            cardsInGroup.push(fixtureType);
        }
        const LEGACY_FLOOR_LAMPS = ['floor_wood_post', 'floor_arc_brass', 'floor_tripod_black'];
        expect(cardsInGroup.sort()).toEqual([...LEGACY_FLOOR_LAMPS, ...NEW_FLOOR_IDS].sort());
        for (const id of cardsInGroup) {
            const row = BUILT_IN_LIGHTING_TYPES.find((t) => t.id === id)!;
            // The legacy lamps author no `location` at all — absent counts as
            // interior (the panel's own rule); the four new rows author it explicitly.
            expect(row.location ?? 'interior', id).toBe('interior');
        }
    });

    it('"Outdoor & Site" (the exterior slice of the SAME mount class) is untouched — still exterior-only', () => {
        const panel = buildLightingPanel();
        const groups = Array.from(panel.children);
        const idx = groups.findIndex((c) => c.textContent?.trim() === 'Outdoor & Site');
        expect(idx, 'Outdoor & Site heading not found').toBeGreaterThanOrEqual(0);
        for (let i = idx + 1; i < groups.length; i++) {
            const el = groups[i] as HTMLElement;
            const fixtureType = el.dataset.fixtureType;
            if (!fixtureType) break;
            expect(NEW_FLOOR_IDS, `${fixtureType} is interior and must not appear in Outdoor & Site`).not.toContain(fixtureType);
            expect(BUILT_IN_LIGHTING_TYPES.find((t) => t.id === fixtureType)!.location).toBe('exterior');
        }
    });
});
