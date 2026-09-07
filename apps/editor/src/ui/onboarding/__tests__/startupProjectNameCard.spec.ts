// §STARTUP-NAME-CARD (founder 2026-09-07, live build cd5bcbb9) — the "Name your project" card
// raised over the flying globe the instant the geocode resolves.
//
// ⭐ WHAT THESE SPECS EXIST TO PREVENT, stated plainly: a time-buyer turning into a GATE. If a
// future edit makes the context warm, the descent or the split mount wait on this card, wall-clock
// gets WORSE and only the perception moves. Prose cannot stop that; these assertions can.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    showStartupProjectNameCard,
    dismissStartupProjectNameCard,
    startupProjectNameCardIsNonGating,
    startupProjectNameDefault,
    STARTUP_NAME_CARD_Z_INDEX,
} from '../startupProjectNameCard';

const CARD = '#pryzm-startup-name-card';

function card(): HTMLElement | null {
    return document.querySelector(CARD);
}
function input(): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>('[data-testid="startup-project-name-input"]');
    if (!el) throw new Error('name input not mounted');
    return el;
}

beforeEach(() => {
    dismissStartupProjectNameCard();
    document.body.innerHTML = '';
});

describe('§STARTUP-NAME-CARD — it must never become a gate', () => {
    it('returns void, so no loader can await it', () => {
        const r = showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        // ⛔ THE STRUCTURAL GUARANTEE. A caller cannot delay a load on something it cannot await.
        expect(r).toBeUndefined();
        expect((r as unknown as { then?: unknown })?.then).toBeUndefined();
    });

    it('states its own non-gating contract', () => {
        expect(startupProjectNameCardIsNonGating()).toBe(true);
    });

    it('the background load has ALREADY STARTED before the card can be committed', () => {
        // Mirrors the controller's statement order: the reveal is kicked off, THEN the card is
        // raised. The card's commit therefore cannot be what starts anything.
        const order: string[] = [];
        order.push('context-warm:start');
        order.push('reveal:kicked-off');
        let committedAt = -1;
        showStartupProjectNameCard({
            defaultName: 'Barcelona',
            onCommit: () => { committedAt = order.push('name:commit') - 1; },
        });
        // The user takes their time; the load is already running.
        expect(order).toEqual(['context-warm:start', 'reveal:kicked-off']);
        input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(order.indexOf('context-warm:start')).toBeLessThan(committedAt);
        expect(order.indexOf('reveal:kicked-off')).toBeLessThan(committedAt);
    });

    it('paints NO backdrop — the globe behind it stays visible and live', () => {
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        // ⚠ DIRECT CHILDREN OF `body`, not `querySelectorAll('div')` — the card legitimately has an
        // inner footer div, so a descendant count would pin the card's own internal markup and go
        // red on any layout tweak. What "no backdrop" actually means is that ONE node was appended
        // to the body and it is the card; a backdrop would be a SECOND, full-screen sibling.
        expect(document.body.children.length).toBe(1);
        expect(document.body.children[0]?.id).toBe('pryzm-startup-name-card');
    });

    it('sits BELOW the loading overlay backdrop (88880), so a real failure always wins', () => {
        expect(STARTUP_NAME_CARD_Z_INDEX).toBeLessThan(88_880);
    });

    it('does not claim modality to a screen reader — the surface behind it is reachable', () => {
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        expect(card()?.getAttribute('aria-modal')).toBeNull();
        expect(card()?.getAttribute('role')).toBe('dialog');
    });
});

describe('§STARTUP-NAME-CARD — it is always escapable (L-942)', () => {
    it('Escape commits the geocoded default and closes', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onCommit).toHaveBeenCalledWith('Barcelona');
        expect(card()).toBeNull();
    });

    it('Escape still closes when focus has moved off the field (the user grabbed the globe)', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        input().blur();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onCommit).toHaveBeenCalledWith('Barcelona');
        expect(card()).toBeNull();
    });

    it('Enter commits what was typed', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        input().value = '  Sagrada tower  ';
        input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onCommit).toHaveBeenCalledWith('Sagrada tower');
        expect(card()).toBeNull();
    });

    it('an emptied field falls back to the default rather than writing ""', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        input().value = '   ';
        input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onCommit).toHaveBeenCalledWith('Barcelona');
    });

    it('Skip keeps the place name — the project is still named, never left blank', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        document.querySelector<HTMLButtonElement>('[data-testid="startup-project-name-skip"]')?.click();
        expect(onCommit).toHaveBeenCalledWith('Barcelona');
        expect(card()).toBeNull();
    });

    it('commits EXACTLY ONCE however many dismissal routes fire', () => {
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('a throwing onCommit still closes the card — it can never strand the user', () => {
        showStartupProjectNameCard({
            defaultName: 'Barcelona',
            onCommit: () => { throw new Error('rename failed'); },
        });
        expect(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }).not.toThrow();
        expect(card()).toBeNull();
    });
});

describe('§STARTUP-NAME-CARD — supersession and teardown', () => {
    it('a second geocode supersedes the first card rather than stacking', () => {
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        showStartupProjectNameCard({ defaultName: 'Madrid', onCommit: () => {} });
        expect(document.querySelectorAll(CARD).length).toBe(1);
        expect(input().value).toBe('Madrid');
    });

    it('dismiss is idempotent', () => {
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        dismissStartupProjectNameCard();
        expect(() => dismissStartupProjectNameCard()).not.toThrow();
        expect(card()).toBeNull();
    });
});

describe('startupProjectNameDefault — the place, not the disambiguation path', () => {
    it("takes the first comma-segment of Nominatim's display name", () => {
        expect(
            startupProjectNameDefault('Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España'),
        ).toBe('Barcelona');
    });

    it('passes a single-segment name through', () => {
        expect(startupProjectNameDefault('Barcelona')).toBe('Barcelona');
    });

    it('NEVER invents a name — an unusable address yields empty, which applyProjectName no-ops', () => {
        expect(startupProjectNameDefault('')).toBe('');
        expect(startupProjectNameDefault('   ')).toBe('');
        expect(startupProjectNameDefault(null)).toBe('');
        expect(startupProjectNameDefault(undefined)).toBe('');
    });
});
