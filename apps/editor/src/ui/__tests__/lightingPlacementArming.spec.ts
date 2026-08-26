/**
 * §LIGHT121 (L-11901) — founder: "Lighting creation in plan view has no preview
 * available, neither preview in 3D."
 *
 * ── The two halves had two different causes ─────────────────────────────────
 *
 * PLAN: `LightingPlanToolHandler` (ghost symbol + crosshair + label on
 * mousemove) was fully coded and registered in the shared plan registry — and
 * UNREACHABLE. `PlanViewToolOverlay` / `SvpPlanToolOverlay` arm a handler by
 * subscribing to `ToolManager.getActiveTool()`, and that string could never
 * become 'lighting': `TOOL_MANAGER_TOOL_KEYS` had no such key, no
 * `activateLighting` existed, and the create-rail card drove
 * `window.lightingTool.activate()` DIRECTLY — arming the 3-D tool while the
 * ToolManager (and therefore both plan surfaces) never learned a tool was
 * active. The preview machinery sat authored-but-unwired, this repo's
 * most-repeated defect shape.
 *
 * 3D: the preview EXISTED but was a hand-rolled pale-cyan material
 * (0x00ccff @ 0.45) instead of the shared PRYZM-purple OBJECT ghost that
 * PreviewStyle.ts §41 mandates for every carousel/placement tool — and whose
 * own header names Lighting in its list. Near-invisible against a lit scene.
 *
 * ── What this suite asserts ─────────────────────────────────────────────────
 *
 *  1. BEHAVIOURAL (DOM): a palette card click routes through
 *     `toolManager.activateLighting(type)` — the ONE call that arms both
 *     surfaces — and does NOT bypass it to `window.lightingTool` when the
 *     ToolManager is present.
 *  2. BEHAVIOURAL (DOM): with no ToolManager, the pre-existing degraded 3-D
 *     path still works (no regression for a partially-booted runtime).
 *  3. STRUCTURAL: `ToolManager` publishes the 'lighting' key and its activator
 *     mirrors `activateFurniture` (stamps the shared fixture-type flag the plan
 *     handler reads). Read as source — importing the ToolManager barrel drags
 *     THREE + OBC into a happy-dom run (the planMoveParity escape-hatch
 *     precedent, inverted: here the source IS the subject).
 *  4. STRUCTURAL: the 3-D ghost uses the shared `createObjectPreviewMaterial`
 *     (Contract §41 / C18) and the hand-rolled cyan is GONE.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLightingPanel } from '../tools-panel/panels/CreateRailPanelLighting';

const ROOT = process.cwd();

function firstCard(panel: HTMLElement): HTMLElement {
    const card = panel.querySelector<HTMLElement>('[data-fixture-type]');
    expect(card, 'the palette rendered no cards at all').toBeTruthy();
    return card!;
}

describe('§LIGHT121 / L-11901 — a palette click arms BOTH surfaces through ToolManager', () => {
    const w = window as unknown as Record<string, unknown>;

    beforeEach(() => {
        delete w.toolManager;
        delete w.lightingTool;
        delete w._pryzmActiveLightingType;
    });
    afterEach(() => {
        delete w.toolManager;
        delete w.lightingTool;
        delete w._pryzmActiveLightingType;
    });

    it('⭐ routes through toolManager.activateLighting(type) — the plan surfaces hear about it', () => {
        const calls: string[] = [];
        w.toolManager = { activateLighting: (t: string) => { calls.push(t); } };
        // A lightingTool is ALSO present — the old code path's target. If the click
        // still drives it directly, the bypass is back and the plan overlay is deaf.
        const direct: string[] = [];
        w.lightingTool = {
            setFixtureType: (t: string) => { direct.push(`set:${t}`); },
            activate: () => { direct.push('activate'); },
        };

        const panel = buildLightingPanel();
        const card = firstCard(panel);
        const type = card.dataset.fixtureType!;
        card.click();

        expect(calls, 'activateLighting was not called — the plan surfaces never arm').toEqual([type]);
        // ⛔ The direct drive must NOT happen here: ToolManager owns arming the 3-D
        // tool inside activateLighting. A second direct call would double-activate.
        expect(direct, 'the card bypassed ToolManager and drove the 3-D tool directly').toEqual([]);
    });

    it('every card routes its OWN registry id — spot-checked across all cards', () => {
        const calls: string[] = [];
        w.toolManager = { activateLighting: (t: string) => { calls.push(t); } };
        const panel = buildLightingPanel();
        const cards = [...panel.querySelectorAll<HTMLElement>('[data-fixture-type]')];
        for (const card of cards) card.click();
        expect(calls).toEqual(cards.map((c) => c.dataset.fixtureType!));
    });

    it('degraded runtime (no ToolManager): the pre-existing 3-D-only path still works', () => {
        const direct: string[] = [];
        w.lightingTool = {
            setFixtureType: (t: string) => { direct.push(`set:${t}`); },
            activate: () => { direct.push('activate'); },
        };
        const panel = buildLightingPanel();
        const card = firstCard(panel);
        const type = card.dataset.fixtureType!;
        card.click();
        expect(direct).toEqual([`set:${type}`, 'activate']);
        // The plan handler reads this flag; the fallback must still stamp it.
        expect(w._pryzmActiveLightingType).toBe(type);
    });

    it('no tool at all: the click is a warn, never a throw', () => {
        const panel = buildLightingPanel();
        expect(() => firstCard(panel).click()).not.toThrow();
    });
});

describe('§LIGHT121 / L-11901 — the ToolManager activator is real (structural)', () => {
    const tmSrc = readFileSync(
        resolve(ROOT, 'packages/input-host/src/ToolManager.ts'), 'utf8');
    const typesSrc = readFileSync(
        resolve(ROOT, 'packages/input-host/src/types.ts'), 'utf8');

    it('publishes the lighting key and the activator, mirroring activateFurniture', () => {
        expect(tmSrc, 'the ToolManager source was not read').toContain('TOOL_MANAGER_TOOL_KEYS');
        expect(tmSrc).toContain("'lighting',");
        expect(tmSrc).toContain('async activateLighting(');
        // The activator must go through activateTool — that is what notifies the
        // subscription both plan overlays hold. A bare window.lightingTool.activate()
        // here would re-create the original defect inside the fix.
        expect(tmSrc).toContain("await this.activateTool('lighting'");
        // …and stamp the shared fixture-type flag LightingPlanToolHandler reads.
        expect(tmSrc).toContain('window._pryzmActiveLightingType = type');
    });

    it("'lighting' is a ToolName member, so the key is typed rather than cast", () => {
        expect(typesSrc).toContain("| 'lighting'");
    });
});

describe('§LIGHT121 / L-11901 — the 3-D ghost wears the shared PRYZM-purple (structural)', () => {
    const toolSrc = readFileSync(
        resolve(ROOT, 'packages/geometry-lighting/src/LightingTool.ts'), 'utf8');

    it('uses createObjectPreviewMaterial + tagPreview — the §41 OBJECT ghost every sister tool uses', () => {
        expect(toolSrc, 'the LightingTool source was not read').toContain('_createPreview');
        expect(toolSrc).toContain('createObjectPreviewMaterial()');
        expect(toolSrc).toContain('tagPreview(');
    });

    it('the hand-rolled pale cyan is GONE — 0x00ccff must not return', () => {
        // Comments legitimately NAME the old colour while explaining the defect
        // (the lightingPaletteReachability precedent) — strip them, then assert
        // no CODE carries it.
        const code = toolSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code).not.toMatch(/0x00ccff/i);
    });
});
