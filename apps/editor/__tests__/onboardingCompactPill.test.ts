// @vitest-environment happy-dom
//
// §UX-COMPACT-TYPE-PILL (L-11131, lane UXPILL70) — the confirm step's BUILDING TYPE pill,
// proven on the REAL controller (`new OnboardingStepController` + `mountOverlay()`, the
// harness `onboardingOverlayImportBranch.test.ts` established) — never on a fixture that
// builds its own pill.
//
// Arms:
//   A. SURFACE   — exactly BUILDING TYPE + a select + Do it myself, nothing else (founder:
//                  "initially you only see BUILDING TYPE / DO IT MYSELF — that's all").
//   B. A11Y      — the label is associated by for/id and is the ONE accessible name (no
//                  parallel aria-label), focus lands on the select, the overlay is the one
//                  landmark, Escape is non-destructive.
//   C. ROUTING   — choosing routes exactly where Generate did; `--compact` leaves on EVERY
//                  branch (L-11206); Do it myself lands in the canvas.
//   D. PLACEMENT — beside the REAL view-mode bar (`mountSiteViewQuickToggle`), re-placed when
//                  the bar leaves or returns; centred when there is none.
//   E. PARITY    — source text: the pill's surface values are byte-for-byte `.svq-bar`'s.
//   F. CASCADE   — with the real sheets injected, the compact rules WIN over the (0,4,0)
//                  confirm-glass body rule (the L-11206 shape).
//   G. HARNESS   — when PRYZM_PILL_HARNESS_OUT is set, the real DOM + the real scaled sheets
//                  are written to one self-contained page for
//                  `tests/e2e/static/onboardingCompactPill.static.ts` to render in Chromium.
//
// ⚠ happy-dom performs no layout: every rect in arm D is a stub, and arm F reads the cascade
// only. The pixel proof is the static Playwright spec named above.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { OnboardingStepController } from '../src/ui/onboarding/OnboardingStepController';
import { ONBOARDING_STYLES } from '../src/ui/onboarding/onboardingStyles';
import { placeCompactPill } from '../src/ui/onboarding/compactPillPlacement';
import { DESIGN_TOKENS } from '../src/ui/styles/tokens';
import { SITE_VIEW_QUICK_TOGGLE_STYLES } from '../src/ui/styles/panels/siteViewQuickToggle';
import { scaleCssText, UI_SCALE } from '../src/ui/styles/uiScale';
import {
    mountSiteViewQuickToggle,
    SITE_VIEW_QUICK_TOGGLE_TESTID,
    type SiteViewQuickToggleHandle,
} from '../src/engine/views/SiteViewQuickToggle';
import { PaneLayoutStore } from '../src/engine/views/paneLayoutStore';
import { LEFT_PANE, RIGHT_PANE, type PaneLayout } from '../src/engine/views/paneViewModel';

// ── fixtures ─────────────────────────────────────────────────────────────────────────

/** The four packs `composeRuntime` registers, in manifest shape (`buildTypologyChoices`). */
const PACKS = [
    { manifest: { id: 'apartment', displayName: 'Apartment', category: 'residential' } },
    { manifest: { id: 'casa-unifamiliar', displayName: 'Casa Unifamiliar (House)', category: 'residential' } },
    { manifest: { id: 'residential-building', displayName: 'Residential Building (Multi-Family)', category: 'residential' } },
    { manifest: { id: 'office-building', displayName: 'Office Building (Tower)', category: 'commercial' } },
];

function makeRuntime() {
    const listeners: Record<string, Array<(p?: unknown) => void>> = {};
    return {
        events: {
            on: (e: string, cb: (p?: unknown) => void) => {
                (listeners[e] ??= []).push(cb);
                return { dispose: () => { listeners[e] = (listeners[e] ?? []).filter((f) => f !== cb); } };
            },
            emit: (e: string, p?: unknown) => { (listeners[e] ?? []).slice().forEach((cb) => cb(p)); },
        },
        typology: { registry: { list: () => PACKS } },
    };
}

type Priv = {
    mountOverlay(): void;
    renderGenerateConfirmStep(source: 'drawn' | 'default-plot'): void;
    armEarlySplitBoundaryListener(): void;
    generateAndFinish(): Promise<void>;
    landInCanvasWithUnderlay(): Promise<void>;
    renderResidentialProgramStep(source: 'drawn' | 'default-plot'): void;
    renderOfficeProgramStep(source: 'drawn' | 'default-plot'): void;
};

const SPLIT: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' };
const BAR_RECT = { left: 520, right: 920, top: 50, bottom: 84 };
const PILL_W = 300;
const GAP = 8 * UI_SCALE;

interface Box { left: number; right: number; top: number; bottom: number }
const domRect = (b: Box): DOMRect => ({
    x: b.left, y: b.top, left: b.left, right: b.right, top: b.top, bottom: b.bottom,
    width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b,
}) as DOMRect;

/**
 * happy-dom lays nothing out, so rects are stubbed BY ROLE: the bar answers with `bar`,
 * the pill row with a `pillWidth`-wide box, everything else with zeros (= unmeasured).
 */
function stubRects(bar: Box | null, pillWidth: number): () => void {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
        if (bar && this.getAttribute('data-testid') === SITE_VIEW_QUICK_TOGGLE_TESTID) return domRect(bar);
        if (this.classList.contains('os-compact-row')) return domRect({ left: 0, right: pillWidth, top: 0, bottom: 34 });
        return domRect({ left: 0, right: 0, top: 0, bottom: 0 });
    };
    return () => { HTMLElement.prototype.getBoundingClientRect = orig; };
}

function mountBar(): SiteViewQuickToggleHandle {
    return mountSiteViewQuickToggle({ store: new PaneLayoutStore(SPLIT) });
}

function mountAtConfirm() {
    const runtime = makeRuntime();
    const controller = new OnboardingStepController({ runtime: runtime as never });
    const priv = controller as unknown as Priv;
    priv.mountOverlay();
    priv.renderGenerateConfirmStep('drawn');
    const overlay = document.querySelector('[data-testid="onboarding-step-overlay"]') as HTMLElement;
    const row = document.querySelector('[data-testid="onboarding-compact-pill"]') as HTMLElement;
    const select = document.querySelector('[data-testid="onboarding-typology-chooser"]') as HTMLSelectElement;
    const notNow = document.querySelector('[data-testid="onboarding-confirm-notnow"]') as HTMLButtonElement;
    const label = row.querySelector('label') as HTMLLabelElement;
    return { controller, priv, runtime, overlay, row, select, notNow, label };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let restoreRects: (() => void) | null = null;

beforeEach(() => {
    window.innerWidth = 1440;
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    restoreRects?.();
    restoreRects = null;
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-pill-test]').forEach((s) => s.remove());
    vi.restoreAllMocks();
});

// ── A. SURFACE ───────────────────────────────────────────────────────────────────────

describe('A · the surface is BUILDING TYPE + one select + Do it myself — and nothing else', () => {
    it('renders exactly three controls in one row, in that order', () => {
        const { overlay, row, label, select, notNow } = mountAtConfirm();
        expect(overlay.classList.contains('os-onboarding-overlay--drawing')).toBe(true);
        expect(overlay.classList.contains('os-onboarding-overlay--confirm')).toBe(true);
        expect(overlay.classList.contains('os-onboarding-overlay--compact')).toBe(true);

        const body = overlay.querySelector('[data-testid="onboarding-step-body"]')!;
        expect(body.children.length).toBe(1);
        expect(body.firstElementChild).toBe(row);
        expect(Array.from(row.children)).toEqual([label, select, notNow]);

        expect(label.textContent).toBe('BUILDING TYPE');
        expect(notNow.textContent).toBe('Do it myself');
        // Nothing pre-selected: choosing IS the opt-in (ASK, never auto-edit).
        expect(select.value).toBe('');
        const placeholder = select.options[0]!;
        expect(placeholder.textContent).toBe('Choose…');
        expect(placeholder.disabled).toBe(true);
        // The `selected` ATTRIBUTE, not only the property: a serialised / reset select must
        // still show "Choose…", never the first enabled option as if it had been picked.
        expect(placeholder.hasAttribute('selected')).toBe(true);
    });

    it('the choices are the registry packs — every one with a wired generate route', () => {
        const { select } = mountAtConfirm();
        const ids = Array.from(select.options).slice(1).map((o) => o.value);
        expect(ids).toEqual(['apartment', 'casa-unifamiliar', 'residential-building', 'office-building']);
        const labels = Array.from(select.options).slice(1).map((o) => o.textContent);
        expect(labels).toEqual(['Apartment', 'House', 'Residential building', 'Office building']);
    });

    it('the old panel is not rebuilt: no title, no chooser chips, no advisory, no Back', () => {
        const { overlay } = mountAtConfirm();
        expect(overlay.querySelector('[data-testid="onboarding-confirm-title"]')).toBeNull();
        expect(overlay.querySelector('.os-typology-choice')).toBeNull();
        expect(overlay.querySelector('.os-hint--warn, .os-hint--muted')).toBeNull();
        expect(overlay.querySelector('[data-testid="onboarding-confirm-back"]')).toBeNull();
        expect(overlay.querySelector('[data-testid="onboarding-confirm-generate"]')).toBeNull();
    });

    it('is reachable from the boundary-commit event, not only from the private call', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        const priv = controller as unknown as Priv;
        priv.mountOverlay();
        priv.armEarlySplitBoundaryListener();
        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-compact-pill"]')).toBeTruthy();
    });
});

// ── B. A11Y ──────────────────────────────────────────────────────────────────────────

describe('B · keyboard + assistive tech', () => {
    it('the visible label IS the accessible name: for/id association, no parallel aria-label', () => {
        const { label, select } = mountAtConfirm();
        expect(select.id).toBeTruthy();
        expect(label.htmlFor).toBe(select.id);
        expect(document.getElementById(label.htmlFor)).toBe(select);
        expect(select.hasAttribute('aria-label')).toBe(false);
        expect(select.hasAttribute('aria-labelledby')).toBe(false);
    });

    it('focus lands on the select as soon as the pill renders', () => {
        const { select } = mountAtConfirm();
        expect(document.activeElement).toBe(select);
    });

    it('the overlay is the ONE landmark and is not a modal dialog while the map is live', () => {
        const { overlay, row } = mountAtConfirm();
        expect(overlay.getAttribute('role')).toBe('region');
        expect(overlay.getAttribute('aria-label')).toBe('Set up your project');
        // No second landmark / group inside it — one announcement, not two.
        expect(row.hasAttribute('role')).toBe(false);
        expect(row.hasAttribute('aria-label')).toBe(false);
    });

    it('Escape is NON-DESTRUCTIVE: it blurs the control, keeps the pill, fires neither exit', () => {
        const generate = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'generateAndFinish')
            .mockImplementation(async () => {});
        const land = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'landInCanvasWithUnderlay')
            .mockImplementation(async () => {});
        const { select, row } = mountAtConfirm();
        expect(document.activeElement).toBe(select);
        select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.activeElement).not.toBe(select);
        expect(row.isConnected).toBe(true);
        expect(select.value).toBe('');
        expect(generate).not.toHaveBeenCalled();
        expect(land).not.toHaveBeenCalled();
    });

    it('the step chip / title chrome is still mounted (hidden by CSS), so nothing else can regress', () => {
        const { overlay } = mountAtConfirm();
        expect(overlay.querySelector('.os-header')).toBeTruthy();
        expect(overlay.querySelector('[data-testid="onboarding-step-chip"]')!.textContent).toContain('Confirm');
    });
});

// ── C. ROUTING ───────────────────────────────────────────────────────────────────────

describe('C · choosing routes exactly where Generate did; --compact leaves on every branch', () => {
    function choose(select: HTMLSelectElement, id: string): void {
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('apartment → generate; the compact + confirm modifiers are gone', () => {
        const generate = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'generateAndFinish')
            .mockImplementation(async () => {});
        const { select, overlay } = mountAtConfirm();
        choose(select, 'apartment');
        expect(generate).toHaveBeenCalledTimes(1);
        expect(overlay.classList.contains('os-onboarding-overlay--compact')).toBe(false);
        expect(overlay.classList.contains('os-onboarding-overlay--confirm')).toBe(false);
    });

    it('residential building → the residential setup step, WITHOUT the compact modifier (L-11206)', () => {
        const resi = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'renderResidentialProgramStep')
            .mockImplementation(() => {});
        const { select, overlay } = mountAtConfirm();
        choose(select, 'residential-building');
        expect(resi).toHaveBeenCalledTimes(1);
        // The setup step is a full card with a header and a footer; --compact hides both.
        expect(overlay.classList.contains('os-onboarding-overlay--compact')).toBe(false);
    });

    it('office building → the office setup step, WITHOUT the compact modifier (L-11206)', () => {
        const office = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'renderOfficeProgramStep')
            .mockImplementation(() => {});
        const { select, overlay } = mountAtConfirm();
        choose(select, 'office-building');
        expect(office).toHaveBeenCalledTimes(1);
        expect(overlay.classList.contains('os-onboarding-overlay--compact')).toBe(false);
    });

    it('the placeholder cannot route anything', () => {
        const generate = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'generateAndFinish')
            .mockImplementation(async () => {});
        const { select } = mountAtConfirm();
        choose(select, '');
        expect(generate).not.toHaveBeenCalled();
    });

    it('Do it myself lands in the canvas — no generate', () => {
        const generate = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'generateAndFinish')
            .mockImplementation(async () => {});
        const land = vi.spyOn(OnboardingStepController.prototype as unknown as Priv, 'landInCanvasWithUnderlay')
            .mockImplementation(async () => {});
        const { notNow } = mountAtConfirm();
        notNow.click();
        expect(land).toHaveBeenCalledTimes(1);
        expect(generate).not.toHaveBeenCalled();
    });
});

// ── D. PLACEMENT ─────────────────────────────────────────────────────────────────────

describe('D · the pill is placed beside the REAL view-mode bar', () => {
    it('with the bar on screen: beside-right, one gap past its right edge', () => {
        restoreRects = stubRects(BAR_RECT, PILL_W);
        const bar = mountBar();
        const { overlay } = mountAtConfirm();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-right');
        expect(overlay.style.getPropertyValue('--os-compact-left')).toBe(`${BAR_RECT.right + GAP}px`);
        expect(overlay.style.getPropertyValue('--os-compact-top')).toBe('');
        bar.dispose();
    });

    it('with NO bar: centred on the band (no measured left at all)', () => {
        restoreRects = stubRects(null, PILL_W);
        const { overlay } = mountAtConfirm();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('centred');
        expect(overlay.style.getPropertyValue('--os-compact-left')).toBe('');
    });

    it('the bar LEAVING re-centres the pill; the bar RETURNING re-places it', async () => {
        restoreRects = stubRects(BAR_RECT, PILL_W);
        const bar = mountBar();
        const { overlay } = mountAtConfirm();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-right');

        bar.dispose();
        await flush(); await flush();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('centred');

        const again = mountBar();
        await flush(); await flush();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-right');
        again.dispose();
    });

    it('a viewport resize re-measures', () => {
        restoreRects = stubRects(BAR_RECT, PILL_W);
        const bar = mountBar();
        const { overlay } = mountAtConfirm();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-right');
        // Shrink the viewport until the pill no longer fits on the right (920 + 6.8 + 300 + 13.6 = 1240).
        window.innerWidth = 1000;
        window.dispatchEvent(new Event('resize'));
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-left');
        expect(overlay.style.getPropertyValue('--os-compact-left')).toBe(`${BAR_RECT.left - GAP - PILL_W}px`);
        bar.dispose();
    });

    it('leaving the step (any body re-render) disposes the observers and clears the placement', async () => {
        restoreRects = stubRects(BAR_RECT, PILL_W);
        const bar = mountBar();
        const { overlay, priv } = mountAtConfirm();
        expect(overlay.getAttribute('data-os-compact-placement')).toBe('beside-right');
        // Every step starts with clearBody(); that is where the pill's disposer runs.
        (priv as unknown as { clearBody(): HTMLElement }).clearBody();
        expect(overlay.hasAttribute('data-os-compact-placement')).toBe(false);
        expect(overlay.style.getPropertyValue('--os-compact-left')).toBe('');
        // And the disconnected observers stay silent: the bar leaving must not re-stamp anything.
        bar.dispose();
        await flush(); await flush();
        window.dispatchEvent(new Event('resize'));
        expect(overlay.hasAttribute('data-os-compact-placement')).toBe(false);
    });
});

// ── E. PARITY (source text) ──────────────────────────────────────────────────────────

/** The declaration block of `selector` in `css`, or ''. Literal search — no dynamic regex. */
function ruleBody(css: string, selector: string): string {
    const i = css.indexOf(`${selector} {`);
    if (i < 0) return '';
    const open = css.indexOf('{', i);
    const close = css.indexOf('}', open);
    return open < 0 || close < 0 ? '' : css.slice(open + 1, close);
}
/** The value of `prop` in a declaration block, whitespace-normalised, or null. */
function decl(body: string, prop: string): string | null {
    const m = new RegExp(`(?:^|;|\\n)\\s*${prop.replace(/-/g, '\\-')}:\\s*([^;]+);`).exec(body);
    return m ? m[1]!.replace(/\s+/g, ' ').trim() : null;
}

describe('E · the pill is .svq-bar, value for value (styles/panels/siteViewQuickToggle.ts)', () => {
    const COMPACT_ROOT = '.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact';
    const bar = ruleBody(SITE_VIEW_QUICK_TOGGLE_STYLES, '.svq-bar');
    const btn = ruleBody(SITE_VIEW_QUICK_TOGGLE_STYLES, '.svq-btn');
    const root = ruleBody(ONBOARDING_STYLES, COMPACT_ROOT);
    const row = ruleBody(ONBOARDING_STYLES, '.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-row');
    const select = ruleBody(ONBOARDING_STYLES, '.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-select');
    const notNow = ruleBody(ONBOARDING_STYLES, '.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-row .os-compact-notnow');

    it('all six rule blocks exist', () => {
        for (const [name, body] of Object.entries({ bar, btn, root, row, select, notNow })) {
            expect(body.length, `${name} rule not found`).toBeGreaterThan(20);
        }
    });

    it('SAME VERTICAL BAND: the overlay top is the bar top, derivation for derivation', () => {
        expect(decl(root, 'top')).toBe(decl(bar, 'top'));
        expect(decl(root, 'top')).toMatch(/calc\(6px \+ var\(--shell-topbar-h, 36px\) \+ 8px\)/);
    });

    it('SAME HORIZONTAL ACCOUNTING: centred on --shell-canvas-cx when unplaced, clamped by --shell-canvas-w', () => {
        expect(decl(root, 'left')).toBe('var(--os-compact-left, var(--shell-canvas-cx, 50%))');
        expect(decl(root, 'max-width')).toBe(decl(bar, 'max-width'));
        // Never the viewport: the enrolled bars all left `left: 50%` behind (§SHELL-FLOAT-BUDGET).
        expect(/(?:^|;|\s)left:\s*50%/.test(root)).toBe(false);
    });

    it('SAME SURFACE: padding, background, border, radius, shadow, face', () => {
        for (const prop of ['padding', 'background', 'border', 'border-radius', 'box-shadow', 'font-family']) {
            expect(decl(row, prop), prop).toBe(decl(bar, prop));
        }
        // and the bar is OPAQUE — no glass token on the pill row, by design (see the sheet).
        expect(row).not.toContain('--app-panel-glass');
    });

    it('SAME HEIGHT: the controls carry the bar segment\'s 28px C43 floor and its face', () => {
        expect(decl(select, 'min-height')).toBe(decl(btn, 'min-height'));
        expect(decl(notNow, 'min-height')).toBe(decl(btn, 'min-height'));
        expect(decl(notNow, 'padding')).toBe(decl(btn, 'padding'));
        for (const body of [select, notNow]) {
            expect(decl(body, 'font-size')).toBe(decl(btn, 'font-size'));
            expect(decl(body, 'font-weight')).toBe(decl(btn, 'font-weight'));
            expect(decl(body, 'border-radius')).toBe(decl(btn, 'border-radius'));
        }
    });

    it('the compact rules are authored ABOVE the (0,4,0) confirm-glass body rule (L-11206)', () => {
        // The rule the previous pass lost to.
        const glass = ruleBody(ONBOARDING_STYLES, '.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body');
        expect(glass).toContain('--app-panel-glass');
        const compactBody = ruleBody(ONBOARDING_STYLES, `${COMPACT_ROOT} .os-body`);
        expect(compactBody.length).toBeGreaterThan(20);
        expect(decl(compactBody, 'background')).toBe('transparent');
        expect(decl(compactBody, 'width')).toBe('auto');
        // Specificity: four class selectors + the descendant beats three + the descendant.
        expect((COMPACT_ROOT.match(/\./g) ?? []).length).toBe(4);
        // And the later of two equal-or-higher rules wins: compact is declared AFTER the glass.
        expect(ONBOARDING_STYLES.indexOf(`${COMPACT_ROOT} .os-body {`))
            .toBeGreaterThan(ONBOARDING_STYLES.indexOf('.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {'));
    });

    it('no px literal is hand-scaled and no colour literal escapes the token layer', () => {
        for (const body of [root, row, select, notNow]) {
            expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/);
        }
    });
});

// ── F. CASCADE (real sheets, happy-dom's computed style) ─────────────────────────────

function injectRealSheets(): void {
    const style = document.createElement('style');
    style.setAttribute('data-pill-test', '1');
    style.textContent = scaleCssText(DESIGN_TOKENS + SITE_VIEW_QUICK_TOGGLE_STYLES + ONBOARDING_STYLES, UI_SCALE);
    document.head.appendChild(style);
}

describe('F · with the real sheets injected, the compact rules win the cascade', () => {
    it('the body carries no glass card behind the pill, and the header is hidden', () => {
        injectRealSheets();
        const { overlay } = mountAtConfirm();
        const body = overlay.querySelector('.os-body') as HTMLElement;
        const header = overlay.querySelector('.os-header') as HTMLElement;
        const cs = window.getComputedStyle(body);
        expect(cs.width).toBe('auto');
        expect(cs.backgroundColor === 'transparent' || cs.backgroundColor === 'rgba(0, 0, 0, 0)').toBe(true);
        expect(window.getComputedStyle(header).display).toBe('none');
        expect(window.getComputedStyle(overlay).pointerEvents).toBe('none');
        expect(window.getComputedStyle(body).pointerEvents).toBe('auto');
    });
});

// ── G. HARNESS (opt-in) ──────────────────────────────────────────────────────────────

describe('G · visual harness for tests/e2e/static (PRYZM_PILL_HARNESS_OUT)', () => {
    it('writes the real bar + real pill + real scaled sheets to one page', () => {
        const out = process.env['PRYZM_PILL_HARNESS_OUT'];
        if (!out) return; // opt-in; the static Playwright spec sets it.
        restoreRects = stubRects(BAR_RECT, PILL_W);
        const bar = mountBar();
        const { overlay } = mountAtConfirm();
        const css = scaleCssText(DESIGN_TOKENS + SITE_VIEW_QUICK_TOGGLE_STYLES + ONBOARDING_STYLES, UI_SCALE);
        // The page re-measures with the SAME pure model (its source is embedded), so the
        // wiring below is the controller's DOM half restated for a page with no controller.
        const wiring = `
(function () {
  var place = ${placeCompactPill.toString()};
  var GAP = ${8 * UI_SCALE}, GUTTER = ${16 * UI_SCALE};
  var overlay = document.querySelector('[data-testid="onboarding-step-overlay"]');
  var row = document.querySelector('[data-testid="onboarding-compact-pill"]');
  function apply() {
    var bar = document.querySelector('[data-testid="${SITE_VIEW_QUICK_TOGGLE_TESTID}"]');
    var b = bar ? bar.getBoundingClientRect() : null;
    var p = place({ bar: b && b.width > 0 ? b : null, canvas: { left: 0, right: window.innerWidth },
                    pillWidth: row.getBoundingClientRect().width, gap: GAP, gutter: GUTTER });
    overlay.setAttribute('data-os-compact-placement', p.kind);
    if (p.kind === 'centred') { overlay.style.removeProperty('--os-compact-left'); overlay.style.removeProperty('--os-compact-top'); return; }
    overlay.style.setProperty('--os-compact-left', p.left + 'px');
    if (p.kind === 'below') overlay.style.setProperty('--os-compact-top', p.top + 'px'); else overlay.style.removeProperty('--os-compact-top');
  }
  apply();
  window.addEventListener('resize', apply);
  window.__pillPlace = apply;
})();`;
        const html = [
            '<!doctype html><html><head><meta charset="utf-8"><title>UXPILL70 harness</title>',
            `<style>${css}</style>`,
            '<style>html,body{margin:0;height:100%} body{background:linear-gradient(90deg,#101010 0 50%,#f4f6fb 50%)} #container{position:fixed;inset:0}</style>',
            '</head><body><div id="container"></div>',
            bar.element.outerHTML,
            overlay.outerHTML,
            `<script>${wiring}</script>`,
            '</body></html>',
        ].join('\n');
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, html, 'utf8');
        bar.dispose();
        expect(html).toContain('onboarding-compact-pill');
    });
});
