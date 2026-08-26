/**
 * §PIN146 — founder, verbatim: "Provide the PIN — to keep it on — on the
 * PRYZM AI chat." He showed two panel headers side by side: PROJECT BROWSER
 * has ⌄ (collapse) · ⇧ (PIN) · ✕ (close); AI DESIGN ASSISTANT has only
 * ⚙ (settings) · ⠿ (drag) — no pin, so the chat panel does not stay open.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHERE THE EXISTING PIN LIVES, AND WHAT IT MEANS
 * ═════════════════════════════════════════════════════════════════════════════
 * `RailPanelController.ts` owns the Project Browser's ONE floating rp-panel
 * (shared across every left-rail section). Its pin toggles a local `_pinned`
 * boolean, persisted to `localStorage['rp-panel-pinned']`, and its own
 * `panelManager.register('rail:left', () => { if (!this._pinned) this.close(); })`
 * closeFn is what "pinned" actually defeats: `PanelManager`'s single-panel-at-
 * a-time exclusivity rule (`_closeOthers`), which otherwise force-closes the
 * rail panel the instant ANY other registered panel opens (the AI chat panel
 * included, PropertyPanel included, etc.) It does NOT defeat the panel's own
 * explicit × button (`UnifiedBrowserPanel.ts` calls `this._rail.close()`
 * unconditionally) — pinning only survives OTHER panels opening, not your own
 * deliberate close.
 *
 * `PanelManager` is now upgraded (this lane) to be the ONE shared authority for
 * that "pinned survives exclusivity" concept (`setPinned` / `isPinned`,
 * consulted inside `_closeOthers`) — see its header comment. `RailPanelController`
 * keeps its own local gate (harmless, redundant) AND now also reports into this
 * registry. The AI chat panel's new pin is wired PURELY through the shared
 * registry — no second local gate — because its own exclusivity closeFn already
 * lives in `AIAreaLayout.ts` (`panelManager.register(AI_PANEL_ID, …)`), a file
 * this suite cannot fully mount (it needs a live THREE/OBC world). So ARM E below
 * reproduces that registration VERBATIM IN SHAPE — same pattern
 * `propertiesPanelModeGate.spec.ts` uses for engineLauncher wiring it cannot
 * mount either — to prove the REAL mechanism, not a stand-in that could not fail
 * the way the real one did.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THE AI PANEL'S PIN DOES **NOT** DEFEAT — stated, not assumed
 * ═════════════════════════════════════════════════════════════════════════════
 * `AIAreaLayout.ts` closes `#ai-panel-container` in exactly THREE places: the
 * `panel:ai` PanelManager closeFn (exclusivity — THIS is what pin defeats,
 * matching the Project Browser exactly), the Escape-key handler, and the
 * explicit re-click of the first-line toggle. ARM F pins, at the source level,
 * that neither of the latter two consults `isPinned` — exactly like the
 * Project Browser's own × button ignores its pin state. A pin that also
 * swallowed Escape or the toggle would not be "the same control", it would be
 * a MORE powerful one nobody asked for.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { panelManager, PANEL_PIN_ICON_SVG } from '../../PanelManager';
import { createAIPanel, AI_PANEL_ID, AI_CHAT_PIN_STORAGE_KEY } from '../AIPanel';

const AI_AREA_LAYOUT = resolve('apps/editor/src/ui/layout/AIAreaLayout.ts');
const RAIL_PANEL_CONTROLLER = resolve('apps/editor/src/ui/ViewBrowser/RailPanelController.ts');
const UNIFIED_BROWSER_PANEL = resolve('apps/editor/src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts');
const AI_PANEL = resolve('apps/editor/src/ui/ai/AIPanel.ts');

function pinButtonOf(panel: HTMLElement): HTMLButtonElement {
    const btn = panel.querySelector('.ai-chat-header-pin');
    if (!btn) throw new Error('no .ai-chat-header-pin rendered in the AI chat header');
    return btn as HTMLButtonElement;
}

/**
 * ⭐ VERBATIM IN SHAPE from `AIAreaLayout.ts`'s `panelManager.register(AI_PANEL_ID, …)`
 * closeFn (mountAIArea cannot be mounted here — it needs a live THREE scene/camera/OBC
 * world). Reproduced rather than mocked, so a fake registration could not pass where the
 * real wiring would fail (MEMORY §fake-more-capable-than-real).
 */
function registerRealAiCloseCallback(containerId: string): void {
    panelManager.register(AI_PANEL_ID, () => {
        const el = document.getElementById(containerId);
        if (el) el.style.display = 'none';
    });
}

let rivalSeq = 0;
/** A never-before-used rival id per call, so `notifyOpened` never short-circuits
 *  on `_active === id` from a previous test in this same PanelManager singleton. */
function freshRivalId(): string {
    rivalSeq += 1;
    return `panel:pin146-rival-${rivalSeq}`;
}

beforeEach(() => {
    localStorage.clear();
    panelManager.unregister(AI_PANEL_ID);
    panelManager.setPinned(AI_PANEL_ID, false);
});

afterEach(() => {
    document.body.replaceChildren();
    panelManager.unregister(AI_PANEL_ID);
});

// ── Identity — the SAME control as the Project Browser's, not a lookalike ────

describe('§PIN146 — the AI chat pin is the SAME control as the Project Browser pin', () => {
    it('renders a pin button using the ONE shared icon glyph', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        expect(btn.tagName.toLowerCase()).toBe('button');
        // Compared via a DOM round-trip, not raw string equality: happy-dom
        // re-serialises `<path .../>` as `<path ...></path>` on read-back, which
        // is a normalisation artefact, not a real divergence. Setting the SAME
        // constant on a detached element and comparing `.innerHTML` on both
        // sides puts them through the identical serialiser.
        const reference = document.createElement('div');
        reference.innerHTML = PANEL_PIN_ICON_SVG;
        expect(btn.innerHTML).toBe(reference.innerHTML);
    });

    it('all three pin buttons (Project Browser rp-header, UnifiedBrowserPanel header, AI chat header) import the SAME exported constant — not three hand-copied strings', () => {
        const railSrc = readFileSync(RAIL_PANEL_CONTROLLER, 'utf8');
        const ubpSrc = readFileSync(UNIFIED_BROWSER_PANEL, 'utf8');
        const aiSrc = readFileSync(AI_PANEL, 'utf8');

        for (const src of [railSrc, ubpSrc, aiSrc]) {
            expect(src).toContain('PANEL_PIN_ICON_SVG');
        }
        // And they import it — none of the three re-declares its own copy of the constant.
        expect(railSrc).toContain("from '../PanelManager'");
        expect(ubpSrc).toContain("from '../../PanelManager'");
        expect(aiSrc).toContain("from '../PanelManager'");
        expect(railSrc).not.toMatch(/PANEL_PIN_ICON_SVG\s*=/);
        expect(ubpSrc).not.toMatch(/PANEL_PIN_ICON_SVG\s*=/);
        expect(aiSrc).not.toMatch(/PANEL_PIN_ICON_SVG\s*=/);
    });

    it('the AI panel pin is wired to the SAME PanelManager state-key both controls now report to (no second local pinned flag)', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(false);
        btn.click();
        // The one authority — not a private field only this button reads.
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(true);
    });
});

// ── Default state ────────────────────────────────────────────────────────────

describe('§PIN146 — default is UNPINNED, matching the Project Browser default', () => {
    it('a freshly-mounted panel starts unpinned: aria-pressed=false, not registered as pinned', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.title).toBe('Pin panel (keep open)');
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(false);
    });
});

// ── Toggling: aria-pressed, persistence, the shared registry ────────────────

describe('§PIN146 — toggling the pin', () => {
    it('flips aria-pressed, the title, and persists to localStorage', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);

        btn.click();
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.title).toBe('Unpin panel');
        expect(localStorage.getItem(AI_CHAT_PIN_STORAGE_KEY)).toBe('true');

        btn.click();
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.title).toBe('Pin panel (keep open)');
        expect(localStorage.getItem(AI_CHAT_PIN_STORAGE_KEY)).toBe('false');
    });

    it('a remount restores the persisted pinned state — the flag survives, not just the click', () => {
        const panel1 = createAIPanel(null);
        pinButtonOf(panel1).click();
        expect(pinButtonOf(panel1).getAttribute('aria-pressed')).toBe('true');

        // A brand-new panel instance, same process, same storage — the founder
        // closing and reopening the chat (or a page reload) must not un-pin it.
        const panel2 = createAIPanel(null);
        expect(pinButtonOf(panel2).getAttribute('aria-pressed')).toBe('true');
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(true);
    });

    it('aria-pressed reflects state through repeated toggles (not merely on the first click)', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        const seen: string[] = [];
        for (let i = 0; i < 4; i++) {
            btn.click();
            seen.push(btn.getAttribute('aria-pressed')!);
        }
        expect(seen).toEqual(['true', 'false', 'true', 'false']);
    });
});

// ── ARM E — ⭐⭐ THE BEHAVIOURAL ARM: pin actually defeats PanelManager exclusivity ──

describe('§PIN146 · ARM E — the pin is CONSUMED, not decorative', () => {
    it('UNPINNED (control): opening another panel closes the AI chat panel — reproduces the founder-reported bug', () => {
        const containerId = 'ai-panel-container-e1';
        const container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        document.body.appendChild(container);
        registerRealAiCloseCallback(containerId);

        createAIPanel(null); // unpinned by default (localStorage cleared in beforeEach)
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(false);
        expect(container.style.display).toBe('flex');

        const rival = freshRivalId();
        panelManager.register(rival, () => {});
        panelManager.notifyOpened(rival); // e.g. opening the Project Browser, Property Panel, …

        expect(container.style.display, 'today\'s bug: the chat panel vanishes').toBe('none');
    });

    it('PINNED: opening another panel no longer closes the AI chat panel', () => {
        const containerId = 'ai-panel-container-e2';
        const container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        document.body.appendChild(container);
        registerRealAiCloseCallback(containerId);

        const panel = createAIPanel(null);
        pinButtonOf(panel).click(); // pin it
        expect(panelManager.isPinned(AI_PANEL_ID)).toBe(true);

        const rival = freshRivalId();
        panelManager.register(rival, () => {});
        panelManager.notifyOpened(rival);

        expect(container.style.display, 'pinned must survive another panel opening').toBe('flex');
    });

    it('unpinning RE-ARMS the close — this is not a one-way escape hatch', () => {
        const containerId = 'ai-panel-container-e3';
        const container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        document.body.appendChild(container);
        registerRealAiCloseCallback(containerId);

        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        btn.click(); // pin

        const rivalA = freshRivalId();
        panelManager.register(rivalA, () => {});
        panelManager.notifyOpened(rivalA);
        expect(container.style.display).toBe('flex'); // survives while pinned

        btn.click(); // unpin
        const rivalB = freshRivalId();
        panelManager.register(rivalB, () => {});
        panelManager.notifyOpened(rivalB);
        expect(container.style.display).toBe('none'); // closes again once unpinned
    });

    it('a rival panel that opens is itself unaffected by another panel\'s pin (exclusivity still applies to non-pinned ids)', () => {
        const containerId = 'ai-panel-container-e4';
        const container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        document.body.appendChild(container);
        registerRealAiCloseCallback(containerId);

        const panel = createAIPanel(null);
        pinButtonOf(panel).click(); // pin the AI chat

        const rivalClosed: string[] = [];
        const rival = freshRivalId();
        panelManager.register(rival, () => { rivalClosed.push(rival); });

        // Opening a THIRD panel must still close the (non-pinned) rival, proving
        // the pin only exempts the id it was set on, not exclusivity itself.
        panelManager.notifyOpened(rival);
        const third = freshRivalId();
        panelManager.register(third, () => {});
        panelManager.notifyOpened(third);

        expect(rivalClosed).toEqual([rival]);
        expect(container.style.display, 'the pinned AI chat is still untouched').toBe('flex');
    });
});

// ── ARM F — explicit closes are NOT defeated by the pin, matching the × button ─

describe('§PIN146 · ARM F — Escape and the explicit toggle stay unconditional', () => {
    const layoutSrc = readFileSync(AI_AREA_LAYOUT, 'utf8');

    it('the Escape-key handler does not consult isPinned — it closes regardless, like the Project Browser\'s own × button', () => {
        const idx = layoutSrc.indexOf("e.key !== 'Escape'");
        expect(idx).toBeGreaterThan(-1);
        const block = layoutSrc.slice(idx, idx + 400);
        expect(block).toContain("panelManager.notifyClosed(AI_PANEL_ID)");
        expect(block).not.toContain('isPinned');
    });

    it('the explicit toggle\'s close branch does not consult isPinned either', () => {
        const idx = layoutSrc.indexOf('const toggleAIPanel');
        expect(idx).toBeGreaterThan(-1);
        const block = layoutSrc.slice(idx, idx + 600);
        expect(block).toContain("panelManager.notifyOpened(AI_PANEL_ID)");
        expect(block).not.toContain('isPinned');
    });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('§PIN146 — accessibility', () => {
    it('the pin toggle carries aria-pressed, matching the sibling ⚙ control\'s aria-label pattern', () => {
        const panel = createAIPanel(null);
        const btn = pinButtonOf(panel);
        expect(btn.hasAttribute('aria-pressed')).toBe(true);
        expect(btn.getAttribute('aria-label')).toBeTruthy();
        expect(btn.type).toBe('button');
    });
});
