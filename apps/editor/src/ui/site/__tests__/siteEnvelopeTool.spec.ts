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
    buildSiteEnvelopeToolButton,
    closeSiteEnvelopeTool,
    isSiteEnvelopeToolOpen,
    openSiteEnvelopeTool,
    toggleSiteEnvelopeTool,
} from '../siteEnvelopeTool';

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
        expect(SOURCE).not.toMatch(/bus/);
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
