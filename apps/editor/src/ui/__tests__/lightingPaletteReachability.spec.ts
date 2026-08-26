/**
 * §LIGHT102 (L-11424) — the lighting CREATE PALETTE offers what the catalogue holds.
 *
 * ── The defect ─────────────────────────────────────────────────────────────
 *
 * `CreateRailPanelLighting.ts` carried a HAND-WRITTEN array of ten fixture
 * definitions. The catalogue held far more, and every family missing from that
 * array was AUTHORED, PLACEABLE, PARSEABLE AND UNREACHABLE — the builder drew it,
 * the schema accepted it, the properties panel would offer it as a type change,
 * and nothing in the create rail could start one. Lane LIGHT99 measured the gap at
 * 22 of 32 families.
 *
 * It is this repository's most-repeated defect shape (the fixture matrix exists to
 * kill it one layer down): AN ENUMERATED LIST THAT MUST BE REMEMBERED RATHER THAN
 * DERIVED. Adding a matrix row correctly — photometry, vocabulary, registry, 3-D
 * mass, all derived — still left it invisible, because a human had to remember to
 * type it here too.
 *
 * ── What this suite asserts ────────────────────────────────────────────────
 *
 * The relation directly, in the direction C84 EI-3 states it: **the registry is
 * what the pipeline supports, so the palette must OFFER all of it.** Not "the
 * palette has N cards" — a count would be satisfied by ten cards for the wrong ten
 * families, and would rot on the next row.
 *
 * ⚠ This is a REACHABILITY test, not a click-through test. It asserts the card for
 * every family EXISTS and carries its id; it does not drive `window.lightingTool`.
 * Placement behaviour is `geometry-lighting`'s to prove, and does.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BUILT_IN_LIGHTING_TYPES } from '@pryzm/geometry-lighting';
import { buildLightingPanel } from '../tools-panel/panels/CreateRailPanelLighting';

/** The card ids the panel actually renders. */
function offeredTypes(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-fixture-type]')]
        .map((el) => el.dataset.fixtureType!)
        .filter(Boolean);
}

describe('§LIGHT102 / L-11424 — every catalogue family is REACHABLE from the create palette', () => {
    let panel: HTMLElement;
    beforeEach(() => { panel = buildLightingPanel(); });

    it('⭐ ZERO authored-but-unreachable families — the registry set equals the offered set', () => {
        const registry = BUILT_IN_LIGHTING_TYPES.map((t) => t.id as string);
        const offered = offeredTypes(panel);

        const unreachable = registry.filter((id) => !offered.includes(id));
        expect(unreachable, `placeable but unreachable from the palette: ${unreachable.join(', ')}`)
            .toEqual([]);

        // And the other direction: the palette must not offer a family the registry
        // does not hold, which would be a card that dispatches an id nothing builds.
        const phantom = offered.filter((id) => !registry.includes(id));
        expect(phantom, `offered by the palette but absent from the registry: ${phantom.join(', ')}`)
            .toEqual([]);
    });

    it('offers each family exactly ONCE — no family appears in two mount groups', () => {
        const offered = offeredTypes(panel);
        expect(new Set(offered).size, 'a family is duplicated across groups').toBe(offered.length);
    });

    /**
     * The regression guard with teeth: the old panel was a FIXED TEN, and it would
     * still be a fixed ten today if the derivation were reverted. Anchoring on the
     * registry's own length means this arm keeps working as the catalogue grows,
     * without a number in it that has to be remembered.
     */
    it('is DERIVED, not a fixed list — the card count tracks the registry', () => {
        expect(offeredTypes(panel)).toHaveLength(BUILT_IN_LIGHTING_TYPES.length);
        expect(BUILT_IN_LIGHTING_TYPES.length,
            'the registry shrank below the ten the old hand-list carried — check the catalogue')
            .toBeGreaterThan(10);
    });

    it('the founder\'s five new §LIGHT102 pendants are all offered', () => {
        const offered = offeredTypes(panel);
        for (const id of [
            'pendant_dome_globe', 'pendant_capsule', 'pendant_glass_cylinder',
            'pendant_cylinder_spot', 'pendant_disc',
        ]) {
            expect(offered, `${id} is not in the create palette`).toContain(id);
        }
        // #2 is the REUSED row and must be offered by the same mechanism.
        expect(offered).toContain('linear_pendant');
    });

    /**
     * ⛔ THE ICON TABLE IS DECORATION, NOT MEMBERSHIP.
     *
     * The one way a derived palette can silently regain the old defect is an icon
     * lookup that drops a family it cannot match. Every card must therefore render
     * an icon and a label whatever its name — an unmatched family is allowed to
     * look duller, never to disappear.
     */
    it('no family is dropped, dimmed to blank, or left unlabelled for want of an icon', () => {
        const cards = [...panel.querySelectorAll<HTMLElement>('[data-fixture-type]')];
        expect(cards.length).toBe(BUILT_IN_LIGHTING_TYPES.length);
        for (const card of cards) {
            const id = card.dataset.fixtureType!;
            expect(card.innerHTML.length, `${id} card is empty`).toBeGreaterThan(0);
            expect(card.textContent?.trim().length, `${id} card has no visible text`).toBeGreaterThan(0);
        }
    });

    it('groups by the registry\'s OWN mount value, so a card cannot promise a placement the tool refuses', () => {
        // Each rendered group heading is followed by its cards; rather than parse the
        // DOM order, assert the invariant that makes the grouping safe: every offered
        // id has a registry row, and that row's mount is one the tool understands.
        const byId = new Map(BUILT_IN_LIGHTING_TYPES.map((t) => [t.id as string, t]));
        for (const id of offeredTypes(panel)) {
            const row = byId.get(id);
            expect(row, `${id} offered with no registry row`).toBeDefined();
            expect(['ceiling', 'wall', 'floor', 'table']).toContain(row!.mount);
        }
    });

    it('renders no fixture id as a literal in the module — the set cannot drift', async () => {
        // ⭐ The structural half of the claim. A file with no fixture-id literal in it
        // cannot offer a stale subset: there is nothing to go stale. Read as source so
        // this survives a future refactor that keeps the behaviour but moves the code.
        // ⚠ Resolved from the REPO ROOT, not `import.meta.url`: under Vitest's
        // transform `import.meta.url` is not a `file:` URL and `fs.readFile` refuses
        // it outright ("The URL must be of scheme file"). The root config runs from
        // the repo root, so a repo-relative path is the stable address.
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const src = await fs.readFile(
            path.resolve(process.cwd(), 'apps/editor/src/ui/tools-panel/panels/CreateRailPanelLighting.ts'),
            'utf8',
        );
        // Guard against reading the wrong file and passing vacuously.
        expect(src, 'the palette source was not found').toContain('buildLightingPanel');
        // Strip comments — the header legitimately NAMES families while explaining the
        // defect, and a doc comment is not a membership list.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const leaked = BUILT_IN_LIGHTING_TYPES
            .map((t) => t.id as string)
            .filter((id) => code.includes(`'${id}'`) || code.includes(`"${id}"`));
        expect(leaked, `fixture ids hard-coded in the palette: ${leaked.join(', ')}`).toEqual([]);
    });
});
