/**
 * projectHubModalGlass.spec.ts
 * §HUB-MODAL-GLASS (L-13239) · §HUB-MODAL-DANGER (L-13240)
 *
 * WHAT THE FOUNDER ASKED FOR
 * --------------------------
 *   "make 'delete project' tag - same style than the new 'modern' 'react'
 *    semi transparent modal like: 'Where is your project'"
 *
 * The card he pointed at is the onboarding LOCATION step, and that card's own
 * code forbids copying its presentation: it is the one DARK translucent surface
 * in the product and it is dark ONLY because it floats over the globe's black
 * starfield (onboardingStyles.ts:853-889, §WHERE-IS-YOUR-PROJECT / L-13057).
 * What is shared and reusable is the GLASS SYSTEM behind it — the token pair
 * --app-panel-glass / --app-panel-glass-blur, whose DEFAULT is white.
 *
 * So this suite pins the two halves that a future restyle is most likely to get
 * wrong, in opposite directions:
 *
 *   ARM A — THE SURFACE IS GLASS, AND IT IS WHITE.
 *     The panel must resolve its surface through the shared tokens (not a rival
 *     literal), and no dark surface may be introduced over the hub, whose own
 *     stylesheet header states CONTRACT §06 §5 "White/violet backgrounds only;
 *     no dark backgrounds". A test that only checked "is it glass" would pass on
 *     the location card's rgba(10,11,16,0.58), which is precisely the wrong
 *     answer here.
 *
 *   ARM B — THE DESTRUCTIVE SIGNAL SURVIVED THE RESTYLE.
 *     The delete dialog permanently destroys a project and "This action cannot
 *     be undone" is literally true. Before this change the whole red signal was
 *     carried by THREE inline style="" attributes on the template; a restyle
 *     that dropped them would have produced a prettier dialog that no longer
 *     reads as dangerous, with nothing failing. The signal is now three declared
 *     classes, and this arm is what makes deleting them cost a red test.
 *
 *   ARM C — THE WAYS OUT.
 *     Cancel is addressable (so it can be focused on open) and both dismissal
 *     controls are wired to close, never to confirm.
 *
 * WHAT THIS SUITE DOES **NOT** ESTABLISH
 * -------------------------------------
 *   * That the glass RENDERS. backdrop-filter is a compositor effect; happy-dom
 *     parses the declaration and nothing more. In particular the open question
 *     recorded on L-13239 — whether the overlay's former backdrop-filter made it
 *     a Backdrop Root that reduced the panel's blur to a no-op — is a BROWSER
 *     fact and is verified nowhere in this file.
 *   * The measured contrast ratios. The derivations are written beside their
 *     values in projectHub.ts; they are arithmetic over the tokens, not
 *     assertions here.
 *   * The Escape / focus-on-open BEHAVIOUR. Those live on ProjectHub, whose
 *     constructor mounts the hub, injects the theme and starts a server sync, so
 *     driving it from a unit spec would test the harness. This suite pins the
 *     STRUCTURE those handlers address (#ph-delete-cancel exists, both controls
 *     carry data-modal) — not the handlers themselves.
 */

import { describe, it, expect } from 'vitest';
import { PROJECT_HUB_STYLES } from '../../styles/panels/projectHub';
import { renderShell } from '../ProjectHubTemplates';

/** The modal block only, so an assertion cannot be satisfied by an unrelated rule. */
function modalBlock(): string {
    const start = PROJECT_HUB_STYLES.indexOf('.ph-modal-overlay {');
    const end = PROJECT_HUB_STYLES.indexOf('/* ─── Context menu');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return PROJECT_HUB_STYLES.slice(start, end);
}

/** Strips CSS comments so prose about a value cannot satisfy an assertion. */
function declarationsOnly(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function shellDom(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = renderShell({
        currentSection: 'all',
        currentSort: 'date',
        searchQuery: '',
        user: { id: 'u1', email: 'a@b.c', name: 'A' },
    });
    return host;
}

describe('§HUB-MODAL-GLASS — ARM A: the hub modal surface is the shared WHITE glass', () => {
    it('resolves its surface through the shared token pair, not a rival literal', () => {
        const css = declarationsOnly(modalBlock());
        expect(css).toContain('background: var(--app-panel-glass);');
        expect(css).toContain('backdrop-filter: var(--app-panel-glass-blur);');
        expect(css).toContain('-webkit-backdrop-filter: var(--app-panel-glass-blur);');
    });

    it('re-points the surface ALPHA scoped to the overlay, and leaves the shared BLUR alone', () => {
        const css = declarationsOnly(modalBlock());
        // The scoped re-point is legitimate and is how --location does it. What
        // must never happen is a second blur value competing with the token.
        expect(css).toMatch(/--app-panel-glass:\s*rgba\(255,255,255,0\.72\)/);
        expect(css).not.toMatch(/--app-panel-glass-blur\s*:/);
    });

    it('introduces NO dark surface — the location card\'s dark glass must not propagate', () => {
        const css = declarationsOnly(modalBlock());
        // The exact values the onboarding location card scopes to itself.
        expect(css).not.toContain('rgba(10, 11, 16');
        expect(css).not.toContain('rgba(10,11,16');
        // And no dark literal of any shape on a `background`/`--app-panel-glass`
        // declaration. Every surface colour in the block must be white,
        // transparent, the near-white input ground, or a token.
        const surfaces = [...css.matchAll(/(?:^|\s)(?:background|--app-panel-glass)\s*:\s*([^;]+);/g)]
            .map(m => m[1].trim());
        expect(surfaces.length).toBeGreaterThan(4);
        for (const value of surfaces) {
            const rgb = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (rgb) {
                const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
                // Perceived brightness floor: nothing dark may become a surface.
                expect(
                    (r + g + b) / 3,
                    `dark surface introduced over light hub chrome: ${value}`,
                ).toBeGreaterThan(200);
            }
            const hex = value.match(/^#([0-9a-fA-F]{6})$/);
            if (hex) {
                const n = parseInt(hex[1], 16);
                const avg = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
                expect(avg, `dark surface introduced over light hub chrome: ${value}`)
                    .toBeGreaterThan(200);
            }
        }
    });

    it('makes header and footer the SAME surface — the saturated bar is gone', () => {
        const css = declarationsOnly(modalBlock());
        const header = css.slice(css.indexOf('.ph-modal-header {'));
        const headerRule = header.slice(0, header.indexOf('}'));
        expect(headerRule).toContain('background: transparent;');
        expect(headerRule).not.toContain('var(--app-gradient)');

        const footer = css.slice(css.indexOf('.ph-modal-footer {'));
        const footerRule = footer.slice(0, footer.indexOf('}'));
        expect(footerRule).toContain('background: transparent;');
        expect(footerRule).not.toContain('#fafbff');
    });

    it('recolours title and close glyph off #fff — the white-on-white trap the bar was hiding', () => {
        const css = declarationsOnly(modalBlock());
        const title = css.slice(css.indexOf('.ph-modal-title {'));
        expect(title.slice(0, title.indexOf('}'))).toContain('color: var(--app-text);');
        const close = css.slice(css.indexOf('.ph-modal-close {'));
        const closeRule = close.slice(0, close.indexOf('}'));
        expect(closeRule).toContain('color: var(--app-text);');
        expect(closeRule).not.toContain('#fff');
    });

    it('ships both opaque escapes, which this sheet previously had for no glass at all', () => {
        const css = modalBlock();
        expect(css).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))');
        expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
        // Both must restore an OPAQUE ground, or the escape escapes nothing.
        const supports = css.slice(css.indexOf('@supports not'));
        expect(supports.slice(0, 240)).toContain('var(--app-panel-bg)');
        const reduced = css.slice(css.indexOf('@media (prefers-reduced-transparency'));
        expect(reduced.slice(0, 300)).toContain('var(--app-panel-bg)');
    });
});

describe('§HUB-MODAL-DANGER — ARM B: the destructive signal survived the restyle', () => {
    it('carries the red in DECLARED classes, not in droppable inline style attributes', () => {
        const html = shellDom().querySelector('#ph-delete-modal')!.innerHTML;
        // The three inline reds that used to be the entire signal.
        expect(html).not.toContain('#e53e3e');
        expect(html).not.toContain('#c53030');
        expect(html).not.toMatch(/style\s*=\s*"[^"]*linear-gradient/);

        const dom = shellDom();
        expect(dom.querySelector('#ph-delete-modal .ph-modal--danger')).not.toBeNull();
        expect(dom.querySelector('#ph-delete-modal .ph-modal-danger-note')).not.toBeNull();
        const confirm = dom.querySelector('#ph-delete-confirm')!;
        expect(confirm.classList.contains('ph-modal-confirm--danger')).toBe(true);
    });

    it('puts the irreversibility sentence INSIDE the warning treatment, where it was plain body copy before', () => {
        const dom = shellDom();
        const msg = dom.querySelector('#ph-delete-msg')!;
        expect(msg.parentElement!.classList.contains('ph-modal-danger-note')).toBe(true);
        // The glyph is a SIBLING of the message, never markup inside it — see
        // the XSS arm below for why that separation is load-bearing.
        expect(msg.parentElement!.querySelector('svg')).not.toBeNull();
    });

    it('keeps #ph-delete-msg an empty text sink, so the project name still cannot inject markup', () => {
        const dom = shellDom();
        const msg = dom.querySelector('#ph-delete-msg')! as HTMLElement;
        expect(msg.tagName).toBe('P');
        expect(msg.innerHTML).toBe('');
        // Mirrors ProjectHub.openDeleteModal, which assigns textContent.
        msg.textContent = 'Are you sure you want to permanently delete "<img src=x onerror=alert(1)>"? This action cannot be undone.';
        expect(msg.querySelector('img')).toBeNull();
        expect(msg.children.length).toBe(0);
        expect(msg.textContent).toContain('cannot be undone');
    });

    it('styles the confirm fill and the warning ink from the status tokens', () => {
        const css = declarationsOnly(modalBlock());
        const danger = css.slice(css.indexOf('.ph-modal-create.ph-modal-confirm--danger {'));
        const dangerRule = danger.slice(0, danger.indexOf('}'));
        expect(dangerRule).toContain('var(--app-status-error)');
        expect(dangerRule).toContain('var(--app-status-error-ink)');
        // The old literal #e53e3e gave a 4.13:1 white label; the tokens give 4.83:1.
        expect(dangerRule).not.toContain('#e53e3e');

        const note = css.slice(css.indexOf('.ph-modal-danger-note {'));
        const noteRule = note.slice(0, note.indexOf('}'));
        // OPAQUE by design: a safety cue must not depend on what is behind the glass.
        expect(noteRule).toContain('background: var(--app-status-error-bg);');
        expect(noteRule).toContain('var(--app-status-error-line)');
    });

    it('leaves the three NON-destructive modals without the danger classes', () => {
        const dom = shellDom();
        for (const id of ['#ph-new-modal', '#ph-rename-modal', '#ph-members-modal']) {
            const modal = dom.querySelector(id)!;
            expect(modal.querySelector('.ph-modal--danger'), id).toBeNull();
            expect(modal.querySelector('.ph-modal-confirm--danger'), id).toBeNull();
            expect(modal.querySelector('.ph-modal-danger-note'), id).toBeNull();
        }
    });
});

describe('§HUB-MODAL-DANGER — ARM C: the ways out of a destructive dialog', () => {
    it('gives Cancel an id so it can be focused on open, and both exits close rather than confirm', () => {
        const dom = shellDom();
        const cancel = dom.querySelector('#ph-delete-cancel') as HTMLElement;
        expect(cancel).not.toBeNull();
        expect(cancel.classList.contains('ph-modal-cancel')).toBe(true);
        expect(cancel.getAttribute('data-modal')).toBe('ph-delete-modal');

        const close = dom.querySelector('#ph-delete-modal .ph-modal-close') as HTMLElement;
        expect(close.getAttribute('data-modal')).toBe('ph-delete-modal');
        // Neither exit may be the confirm button.
        expect(cancel.id).not.toBe('ph-delete-confirm');
        expect(close.id).not.toBe('ph-delete-confirm');
    });

    it('announces itself as an alert dialog and names its own message', () => {
        const panel = shellDom().querySelector('#ph-delete-modal .ph-modal') as HTMLElement;
        expect(panel.getAttribute('role')).toBe('alertdialog');
        expect(panel.getAttribute('aria-describedby')).toBe('ph-delete-msg');
    });

    it('draws a visible focus ring, without which focusing Cancel is invisible', () => {
        const css = declarationsOnly(modalBlock());
        expect(css).toContain('.ph-modal-cancel:focus-visible');
        expect(css).toMatch(/outline:\s*2px solid var\(--app-accent\)/);
    });

    it('gives every modal close button an accessible name', () => {
        const dom = shellDom();
        const closers = dom.querySelectorAll('.ph-modal-close');
        expect(closers.length).toBe(4);
        for (const c of Array.from(closers)) {
            expect(c.getAttribute('aria-label'), c.outerHTML).toBeTruthy();
        }
    });
});
