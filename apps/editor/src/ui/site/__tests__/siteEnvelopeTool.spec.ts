// @vitest-environment happy-dom
//
// §ENVELOPE-TOOL-ON-THE-SITE-VIEWS (L-13017 · C58 §1.19) — the ENTRY POINT, proven reachable.
//
// ⭐ WHAT THIS SUITE IS FOR, AND WHY IT IS NOT A DOM SMOKE TEST. The founder's complaint was
// *"I am not able yet to create the envelope on the 2D site view / 3D site"* about a command that
// was never view-gated — a REACHABILITY defect, which is exactly the class this repo has learned
// unit tests do not catch ([[committed-is-not-reachable]]: four fixes in one session ran nowhere).
// So the two things pinned here are the two that could regress silently:
//
//   1. **THE TOOL CARRIES NO CREATION LOGIC.** P6 / C58 §1.19 clause 1: it opens the ONE panel,
//      which dispatches the ONE command. A source assertion, because the failure mode is somebody
//      "helpfully" inlining a second `executeCommand('spaceEnvelope…')` here — which would work
//      perfectly in a test and drift from the panel within a commit.
//   2. **THE PANEL IS A SINGLETON THAT RE-TARGETS.** Two panels over one runtime would each hold
//      their own "what the user last typed", and the second create would silently discard the
//      first's entry. Same §MAP-IS-A-SINGLETON-TOO (L-12992) rule the map itself follows.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
    SITE_ENVELOPE_PANEL_TESTID,
    SITE_ENVELOPE_TOOL_BTN_TESTID,
    SITE_ENVELOPE_CLOSE_TESTID,
    SITE_ENVELOPE_DRAW_BTN_TESTID,
    SITE_ENVELOPE_DRAW_STATUS_TESTID,
    buildSiteEnvelopeToolButton,
    closeSiteEnvelopeTool,
    isSiteEnvelopeToolOpen,
    openSiteEnvelopeTool,
    toggleSiteEnvelopeTool,
} from '../siteEnvelopeTool';
// §ENVELOPE-DRAW C4 — the registry the button arms, the slot the gesture writes, and the panel
// attributes that say which rung of the footprint ladder answered.
import {
    ENVELOPE_DRAW_NO_SURFACE_REASON,
    __resetEnvelopeDrawArmingForTests,
    getEnvelopeDrawStatus,
    registerEnvelopeDrawSurface,
    registeredEnvelopeDrawSurfaces,
} from '../siteEnvelopeDrawArming';
import {
    __resetDrawnEnvelopeFootprintForTests,
    getDrawnEnvelopeFootprint,
    setDrawnEnvelopeFootprint,
} from '../drawnEnvelopeFootprintState';
import {
    AUTHORING_CREATE_BTN_TESTID,
    AUTHORING_DISCARD_DRAWN_TESTID,
    AUTHORING_DRAWN_SUBSCRIBED_ATTR,
    AUTHORING_SLOT_TESTID,
    AUTHORING_SOURCE_TESTID,
} from '../../analysis/parcelLawEnvelopeAuthoring';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/**
 * Source with comment lines removed.
 *
 * ⛔ NOT OPTIONAL, AND THIS ARM PROVED IT ON ITS FIRST RUN. Every source-text assertion below
 * asserts the ABSENCE of a pattern — and the module's header EXPLAINS that absence by naming the
 * very pattern it forbids (*"it dispatches the SAME `bus.executeCommand(plan.command,
 * plan.payload)`"*, *"no `(window as any)`"*). So the better the comment, the more certainly a raw
 * text arm fails. That is §RAF-GATE-COMMENT-BLIND (P3, 2026-08-10), where a gate counted three doc
 * comments asserting compliance as three violations. Copied from `siteViewQuickToggle.spec.ts`,
 * whose own docstring records the same lesson learned four times in one session.
 */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

const SOURCE = codeOnly(
    readFileSync(join(repoRoot, 'apps/editor/src/ui/site/siteEnvelopeTool.ts'), 'utf8'),
);

it('actually read the module — an unrunnable guard must fail, never skip (§L-851)', () => {
    expect(SOURCE.length).toBeGreaterThan(1_000);
    expect(SOURCE).toContain('export function openSiteEnvelopeTool');
});

function host(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    closeSiteEnvelopeTool();
    document.body.replaceChildren();
});

describe('§ENVELOPE-TOOL-ON-THE-SITE-VIEWS — ONE command path, two input surfaces (P6)', () => {
    it('mints NO command of its own — no executeCommand, no command string, no id minting', () => {
        // ⛔ The whole architecture of this row is that the tool ARMS the panel's command rather
        // than carrying one. A second authoring implementation WILL drift, and the 2D plan draws
        // the AUTHORING frame de-rotated by θ from the 2D map BY DESIGN (ADR-0115), so the second
        // would carry a frame bug on top of the drift.
        // ⚠ NARROWED ON ITS FIRST RUN, AND THE NARROWING IS THE FINDING — recorded rather than
        // quietly applied. The first draft also forbade any MENTION of `spaceEnvelope.batch.create`
        // and `buildEnvelopeAuthoringPlan`, and it went red on the module's own `console.log`:
        //     `'path (spaceEnvelope.batch.create, via buildEnvelopeAuthoringPlan), two entry points.'`
        // — a DIAGNOSTIC naming the one command path, which is the opposite of the defect. That is
        // the same over-broad-matcher shape as §RAF-GATE-COMMENT-BLIND one layer down: `codeOnly`
        // strips comments, but a string literal is code. ⛔ So the arms below forbid the CALL and
        // the IMPORT — the two shapes a second authoring path must take — never the NAME. A module
        // that dispatches for itself has to either call the bus or pull in the plan builder; it
        // cannot do it with a log line.
        expect(SOURCE).not.toMatch(/executeCommand/);
        expect(SOURCE).not.toMatch(/createId\(/);
        expect(SOURCE).not.toMatch(/^import[^;]*buildEnvelopeAuthoringPlan/m);
        expect(SOURCE).not.toMatch(/^import[^;]*command-bus/m);
        // …and it holds no bus handle at all, so there is nothing here to dispatch WITH.
        // ⛔ UNTIL 2026-09-09 THE BOUNDARIES AROUND `bus` HERE WERE LITERAL 0x08 BACKSPACE
        // BYTES, not backslash-b, so this arm matched a byte no source file contains and
        // could never fire. Repaired (lane CI-RED) off ESLint `no-control-regex`, then RUN:
        // it passes, and it was scramble-controlled — `const b = bus;` matches, `busyFlag`
        // does not.
        expect(SOURCE).not.toMatch(/\bbus\b/);
    });

    it('mounts the ONE panel the Parcel Law tab mounts — by name, so a fork is visible here', () => {
        expect(SOURCE).toContain('mountParcelLawEnvelopeAuthoring');
    });

    it('holds no `(window as any)` seam (P4) — the host is passed in', () => {
        expect(SOURCE).not.toMatch(/window as any/);
        expect(SOURCE).not.toMatch(/as unknown as \{[^}]*runtime/);
    });
});

describe('§ENVELOPE-TOOL-ON-THE-SITE-VIEWS — the panel is a re-targeting SINGLETON', () => {
    it('opens over its host and reports itself open', () => {
        const h = host();
        expect(isSiteEnvelopeToolOpen()).toBe(false);
        openSiteEnvelopeTool(h);
        expect(isSiteEnvelopeToolOpen()).toBe(true);
        expect(h.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toHaveLength(1);
    });

    it('a SECOND open into a DIFFERENT host MOVES the one panel — never stacks a second', () => {
        const a = host();
        const b = host();
        openSiteEnvelopeTool(a);
        openSiteEnvelopeTool(b);
        expect(a.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toHaveLength(0);
        expect(b.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toHaveLength(1);
        // Repo-wide: exactly one, ever.
        expect(document.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toHaveLength(1);
    });

    it('closes cleanly and leaves NO residue — a stale node would be re-targeted next open', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        closeSiteEnvelopeTool();
        expect(isSiteEnvelopeToolOpen()).toBe(false);
        expect(document.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toHaveLength(0);
    });

    it('close is IDEMPOTENT — a surface disposing twice must not throw into its teardown', () => {
        openSiteEnvelopeTool(host());
        closeSiteEnvelopeTool();
        expect(() => closeSiteEnvelopeTool()).not.toThrow();
    });

    it('the panel’s × closes it', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        const close = h.querySelector<HTMLButtonElement>(`[data-testid="${SITE_ENVELOPE_CLOSE_TESTID}"]`);
        expect(close).not.toBeNull();
        close!.click();
        expect(isSiteEnvelopeToolOpen()).toBe(false);
    });

    it('toggle opens then closes, and reports the state now in force', () => {
        const h = host();
        expect(toggleSiteEnvelopeTool(h)).toBe(true);
        expect(toggleSiteEnvelopeTool(h)).toBe(false);
    });
});

describe('§ENVELOPE-TOOL-ON-THE-SITE-VIEWS — the tool BUTTON', () => {
    it('is never DISABLED (C58 §1.20 clause 1 — the envelope gates nothing)', () => {
        // ⛔ The panel is precisely where a user with NO solved envelope is told what is missing
        // and what would supply it. Disabling the way in would make the absence of an envelope
        // block the parcel-law process, which is the founder ruling §1.20 records.
        const btn = buildSiteEnvelopeToolButton(() => host());
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute('data-testid')).toBe(SITE_ENVELOPE_TOOL_BTN_TESTID);
    });

    it('opens the panel on click, and paints its own pressed state from the READING', () => {
        const h = host();
        const btn = buildSiteEnvelopeToolButton(() => h);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        btn.click();
        expect(isSiteEnvelopeToolOpen()).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        btn.click();
        expect(isSiteEnvelopeToolOpen()).toBe(false);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
    });

    it('with NO host it refuses out loud rather than no-opping silently (L-1187)', () => {
        const btn = buildSiteEnvelopeToolButton(() => null);
        expect(() => btn.click()).not.toThrow();
        expect(isSiteEnvelopeToolOpen()).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §ENVELOPE-DRAW C4 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE MILESTONE ARM: A DRAWN RING IS
// REACHABLE FROM THE PANEL THE FOUNDER ALREADY OPENS.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHAT THESE CASES PIN, AND WHY THEY ARE NOT DOM DECORATION. The founder's top-priority sentence
// is *"THE CAPACITY TO CREATE — DRAW — DESIGN BUILDABLE ENVELOPES IN THE 2D SITE VIEW AND 3D SITE
// VIEW."* Everything downstream of a ring already shipped, so the whole feature turns on ONE join:
// a ring in the session slot must become the footprint this panel names and extrudes. That join is
// exactly the [[authored-but-unwired-is-the-bottleneck]] shape — a slot written by one module and
// read by another — and the failure mode is silent: the ring lands, the panel keeps naming the
// plate, and nobody notices until the founder does.
//
// ⛔ AND THE REFUSAL IS PINNED AS HARD AS THE SUCCESS. With no adapter registered the Draw button
// must print `ENVELOPE_DRAW_NO_SURFACE_REASON` — the reason AND the route back (C16 CA-18). A
// button that silently no-ops is L-1187; a button hidden until the adapters land hides the
// milestone from the person who asked for it.

describe('§ENVELOPE-DRAW C4 — the Draw button and the drawn-perimeter route', () => {
    afterEach(() => {
        __resetEnvelopeDrawArmingForTests();
        __resetDrawnEnvelopeFootprintForTests();
    });

    const drawBtnOf = (h: HTMLElement): HTMLButtonElement =>
        h.querySelector<HTMLButtonElement>(`[data-testid="${SITE_ENVELOPE_DRAW_BTN_TESTID}"]`)!;
    const drawStatusOf = (h: HTMLElement): HTMLElement =>
        h.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_DRAW_STATUS_TESTID}"]`)!;

    it('the panel renders a Draw button — the entry point exists on the surface the founder opens', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        const btn = drawBtnOf(h);
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toContain('Draw the perimeter');
        expect(drawStatusOf(h).getAttribute('data-draw-state')).toBe('idle');
    });

    it('with NO surface attached it REFUSES OUT LOUD, naming the route back — not a stub, not a no-op', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        expect(registeredEnvelopeDrawSurfaces()).toBe(0);
        drawBtnOf(h).click();
        const status = drawStatusOf(h);
        expect(status.getAttribute('data-draw-state')).toBe('refused');
        // ⛔ The SENTENCE, verbatim from the registry — so this module and the registry cannot
        // drift into two spellings of one refusal.
        expect(status.textContent).toBe(ENVELOPE_DRAW_NO_SURFACE_REASON);
        // …and it carries the route back, not merely the complaint.
        expect(status.textContent).toContain('2D Site Map or 3D Site');
        expect(status.textContent).toContain('extrude the permitted footprint');
        // Nothing armed, so nothing is left live to consume the user's next click (L-7801).
        expect(getEnvelopeDrawStatus().armed).toBe(false);
    });

    it('with a surface attached it ARMS, and pressing again CANCELS — arm and disarm both reachable', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        let armedWith: unknown = null;
        const unregister = registerEnvelopeDrawSurface({
            surfaceId: 'site-map-2d',
            groundPointFromPointer: () => null,
            drawPreview: () => { /* headless */ },
            clearPreview: () => { /* headless */ },
            arm: (sink) => { armedWith = sink; return true; },
            disarm: () => { armedWith = null; },
        });
        try {
            drawBtnOf(h).click();
            expect(armedWith).not.toBeNull();
            expect(drawStatusOf(h).getAttribute('data-draw-state')).toBe('armed');
            expect(drawBtnOf(h).getAttribute('aria-pressed')).toBe('true');
            expect(drawBtnOf(h).textContent).toContain('Cancel');
            drawBtnOf(h).click();
            expect(armedWith).toBeNull();
            expect(getEnvelopeDrawStatus().armed).toBe(false);
        } finally {
            unregister();
        }
    });

    it('CLOSING the panel disarms the draw — the chrome and the handler come down together (L-7801)', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        let armedNow = false;
        const unregister = registerEnvelopeDrawSurface({
            surfaceId: 'site-3d',
            groundPointFromPointer: () => null,
            drawPreview: () => { /* headless */ },
            clearPreview: () => { /* headless */ },
            arm: () => { armedNow = true; return true; },
            disarm: () => { armedNow = false; },
        });
        try {
            drawBtnOf(h).click();
            expect(armedNow).toBe(true);
            closeSiteEnvelopeTool();
            expect(armedNow).toBe(false);
            expect(getEnvelopeDrawStatus().armed).toBe(false);
        } finally {
            unregister();
        }
    });

    // ⭐ THE MILESTONE CASE. A ring in the slot IS the footprint the panel names and extrudes.
    it('seeding the drawn ring makes the SOURCE LINE read "the perimeter you drew" and enables Create', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        const source = h.querySelector<HTMLElement>(`[data-testid="${AUTHORING_SOURCE_TESTID}"]`)!;
        const create = h.querySelector<HTMLButtonElement>(`[data-testid="${AUTHORING_CREATE_BTN_TESTID}"]`)!;
        // BEFORE: this happy-dom session has no runtime, no solved massing and no fitted plate, so
        // the ladder is on its last rung and the control correctly cannot create.
        expect(source.getAttribute('data-source-kind')).toBe('none');
        expect(create.disabled).toBe(true);

        // The gesture's ONE write — a 10 m x 10 m square, ring and area from one producer.
        setDrawnEnvelopeFootprint({
            ring: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
            areaM2: 100,
            surfaceId: 'site-map-2d',
            mode: 'linear',
        });

        // ⛔ NO REPAINT IS CALLED HERE ON PURPOSE. The panel must hear the write on its own
        // subscription — that channel IS the feature, and asserting after a manual repaint would
        // pass with the wire cut.
        expect(source.getAttribute('data-source-kind')).toBe('drawn');
        expect(source.textContent).toContain('perimeter you drew');
        expect(source.textContent).toContain('100 m²');
        expect(source.textContent).toContain('4 corners');
        expect(create.disabled).toBe(false);
        // The draw row says the same thing in its own voice, from the same slot.
        expect(drawStatusOf(h).getAttribute('data-draw-state')).toBe('drawn');
        expect(drawStatusOf(h).textContent).toContain('100 m²');
    });

    it('the drawn route is REVERSIBLE — Discard hands the ladder back, so it is not a one-way door', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        setDrawnEnvelopeFootprint({
            ring: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }],
            areaM2: 64,
            surfaceId: 'site-3d',
            mode: 'rectangular',
        });
        const discard = h.querySelector<HTMLButtonElement>(`[data-testid="${AUTHORING_DISCARD_DRAWN_TESTID}"]`)!;
        expect(discard).not.toBeNull();
        expect(discard.hidden).toBe(false);
        discard.click();
        const source = h.querySelector<HTMLElement>(`[data-testid="${AUTHORING_SOURCE_TESTID}"]`)!;
        expect(source.getAttribute('data-source-kind')).toBe('none');
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        // …and the control is offered only where it has a subject.
        expect(discard.hidden).toBe(true);
    });

    it('the drawn-perimeter CHANNEL is subscribed — the attribute a silent regression would flip', () => {
        const h = host();
        openSiteEnvelopeTool(h);
        const panel = h.querySelector<HTMLElement>(`[data-testid="${AUTHORING_SLOT_TESTID}"]`)!;
        expect(panel.getAttribute(AUTHORING_DRAWN_SUBSCRIBED_ATTR)).toBe('yes');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — IT MOUNTS IN THE SITE PANEL, NOT OVER THE VIEWPORT
// ═════════════════════════════════════════════════════════════════════════════════════════════
// FOUNDER, defect 2 of 5, 2026-09-10: *"Also this information should be part of the main panel —
// check image 4."* Image 4 is the right-hand SITE panel at Massing options ("Create it myself /
// Draw my own massing on the view"), whose button is one of the callers of the open route.
// Answering a click INSIDE that card with a floating window somewhere else on screen is the
// second surface he is asking us to remove.
//
// ⛔ WHAT THESE CASES PIN IS THAT IT IS STILL **ONE PANEL**, presented two ways. A lane that
// "fixed" this by rendering a copy inside the card would satisfy the founder's sentence and
// re-open the defect the suite above exists for.
describe('§THE-TOOL-LIVES-IN-THE-PANEL (L-13308) — one panel, two presentations', () => {
    it('⭐ INLINE: no absolute positioning, no shadow, no z-index — it flows inside the card', () => {
        const card = host();
        openSiteEnvelopeTool(card, { inline: true });
        const root = card.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);
        expect(root, 'the panel did not mount into the card at all').not.toBeNull();
        expect(root!.getAttribute('data-presentation')).toBe('inline');
        // ⛔ EACH OF THESE IS A SEPARATE WAY TO GET "a box inside a box". The host card already
        // supplies its own frame, scroll and elevation; repeating any one of them here is what
        // reads as a second window.
        expect(root!.style.position, 'still absolutely positioned inside a panel').not.toBe('absolute');
        expect(root!.style.boxShadow, 'a floating shadow inside a card is a box in a box').toBe('');
        expect(root!.style.zIndex).toBe('');
        // ⛔ AND NO NESTED SCROLLER. The Site panel is already the scroll container; a second one
        // traps the wheel halfway down the card.
        expect(root!.style.overflow).not.toBe('auto');
    });

    it('⭐ INLINE: the ✕ is HIDDEN but still in the DOM — one close control, no broken contract', () => {
        const card = host();
        openSiteEnvelopeTool(card, { inline: true });
        const x = card.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_CLOSE_TESTID}"]`);
        // ⛔ PRESENT: other surfaces bind to this testid, and a re-target back to the floating arm
        // needs it. HIDDEN: two ✕ on one card is the box-in-a-box tell.
        expect(x, 'removing the ✕ breaks every surface bound to SITE_ENVELOPE_CLOSE_TESTID').not.toBeNull();
        expect(x!.hidden).toBe(true);
    });

    it('⛔ SCRAMBLE: the FLOATING arm is unchanged — omitting the flag keeps the old card exactly', () => {
        // The cheapest wrong fix is to make every mount inline, which would flatten the panel on
        // the 2-D map strip and the gisActionRegistry route, where the viewport IS the only host.
        const viewport = host();
        openSiteEnvelopeTool(viewport);
        const root = viewport.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);
        expect(root!.getAttribute('data-presentation')).toBe('floating');
        expect(root!.style.position).toBe('absolute');
        expect(root!.style.boxShadow).not.toBe('');
        expect(root!.style.zIndex).toBe('40');
        const x = viewport.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_CLOSE_TESTID}"]`);
        expect(x!.hidden, 'the floating card must keep its only close affordance').toBe(false);
    });

    it('⛔ SCRAMBLE: opening into the card MOVES the one panel — it never mints a second', () => {
        // ⭐ THE ARM THAT MATTERS MOST. "Put it in the panel" is satisfied just as well, to a
        // screenshot, by rendering a COPY there — and a copy is two panels over one runtime, each
        // holding its own "what the user last typed" (§MAP-IS-A-SINGLETON-TOO, L-12992).
        const viewport = host();
        const card = host();
        openSiteEnvelopeTool(viewport);
        const first = viewport.querySelector(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);

        openSiteEnvelopeTool(card, { inline: true });
        expect(
            document.querySelectorAll(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`).length,
            'a SECOND panel was minted instead of the one being re-homed',
        ).toBe(1);
        const moved = card.querySelector(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);
        expect(moved, 'the panel did not move into the card').not.toBeNull();
        expect(moved, 'a different node — this is a copy, not the same panel').toBe(first);
        expect(viewport.querySelector(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`)).toBeNull();
    });

    it('⛔ the chrome FOLLOWS the host across a re-target, in both directions', () => {
        // A re-target that moved the node but kept the old presentation would leave the panel
        // floating inside a card, or flat over a viewport with no frame at all.
        const viewport = host();
        const card = host();
        openSiteEnvelopeTool(viewport);
        openSiteEnvelopeTool(card, { inline: true });
        let root = document.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);
        expect(root!.getAttribute('data-presentation')).toBe('inline');
        expect(root!.style.position).not.toBe('absolute');

        openSiteEnvelopeTool(viewport);
        root = document.querySelector<HTMLElement>(`[data-testid="${SITE_ENVELOPE_PANEL_TESTID}"]`);
        expect(root!.getAttribute('data-presentation'), 'the panel stayed flat over the viewport')
            .toBe('floating');
        expect(root!.style.position).toBe('absolute');
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔ THE PRODUCER AND THE CONSUMER OF THE SLOT — asserted as SOURCE, because the failure is
    //    a hook that looks for an id nothing renders. That is silent: it falls back to floating
    //    and the founder sees the defect he already reported. [[committed-is-not-reachable]].
    // ══════════════════════════════════════════════════════════════════════════════════════════
    it('⭐ the Massing options card RENDERS the slot, on every arm', () => {
        const src = readFileSync(
            join(repoRoot, 'apps/editor/src/ui/site/massingAuthoredOptionSection.ts'), 'utf8',
        );
        expect(src).toContain('MASSING_AUTHOR_SLOT_TESTID');
        // ⚠ In the SHARED tail of the builder, after the switch — so it exists on `offer`,
        // `chosen`, `blocked-unknown`, `no-ground-level` and `unreadable` alike. A slot that
        // appeared only once the tool was open would make the mount point conditional on the
        // thing being mounted.
        expect(src).toMatch(/data-testid="\$\{MASSING_AUTHOR_SLOT_TESTID\}"/);
    });

    it('⭐ the open hook PREFERS that slot, and keeps the viewport arm for surfaces without a card', () => {
        const src = readFileSync(
            join(repoRoot, 'apps/editor/src/ui/layout/GISAreaLayout.ts'), 'utf8',
        );
        const hook = src.indexOf('window.pryzmOpenSiteEnvelopeTool = () => {');
        expect(hook, 'the open hook is gone — re-check this suite').toBeGreaterThan(-1);
        const body = src.slice(hook, hook + 2600);
        const slot = body.indexOf('MASSING_AUTHOR_SLOT_TESTID');
        const container = body.indexOf("getElementById('container')");
        expect(slot, 'the hook never looks for the in-panel slot').toBeGreaterThan(-1);
        expect(container, 'the viewport arm is gone — the 2-D map strip has no card to mount in')
            .toBeGreaterThan(-1);
        // ⛔ ORDER IS THE WHOLE FIX: the card wins when it is on screen.
        expect(slot, 'the viewport is still preferred over the panel').toBeLessThan(container);
        expect(body, 'the slot mount must ask for the inline presentation').toContain('{ inline: true }');
    });
});
