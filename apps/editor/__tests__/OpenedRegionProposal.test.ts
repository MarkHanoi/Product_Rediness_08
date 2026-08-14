/**
 * §OPENED-REGION (L-880) — the OFFER half, executed, on the CANONICAL surface.
 *
 * The founder's instruction was "ask the user — do you want me to create an interior
 * wall in the expected space?". C83 §4.1.3 fixes which prompt does the asking: the
 * already-shipped `ZeroTokenUiHooks.confirm(summary)` chat bubble, reached through
 * `chatPromptHost`. These arms assert the three things that must hold of it:
 *
 *   · it ASKS — a Confirm/Cancel question, and NOTHING is dispatched until Confirm;
 *   · Confirm dispatches the ORDINARY canonical verb `wall.create` on the ordinary
 *     bus, one command and therefore one Ctrl+Z (P6 / C83 §4.1.1);
 *   · when the detector refuses to name a position, NO card is shown at all — the
 *     user is told what is unknown rather than handed a button that plants a wrong
 *     wall (C83 §4.2 MUST NOT).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OpenedRegionFinding } from '@pryzm/room-topology';
import {
    buildOpenedRegionOffer,
    presentOpenedRegion,
    __resetOpenedRegionProposalState,
} from '../src/ui/ai/OpenedRegionProposal';
import {
    registerChatPromptHost, __resetChatPromptHost, chatSay, getSurfaceDiagnostics,
} from '../src/ui/ai/chatPromptHost';

const OPENED: Extract<OpenedRegionFinding, { kind: 'region-opened' }> = {
    kind: 'region-opened',
    levelId: 'L0',
    cause: 'merged-into-neighbour',
    roomId: 'room_A',
    roomName: 'Living',
    roomAreaM2: 36,
    gap: {
        start: { x: 0.2, z: 0 },
        end: { x: 5.8, z: 0 },
        lengthM: 5.6,
        unwalledFractionOfPerimeter: 0.23,
        anchoredEndpoints: 2,
        matchedWallId: 'wall_partition_0001',
        thicknessM: 0.12,
        heightM: 2.5,
    },
    detail: 'Living (36.0 m²) is no longer its own room — it has merged into the space next to it.',
};

const UNKNOWN: Extract<OpenedRegionFinding, { kind: 'position-unknown' }> = {
    kind: 'position-unknown',
    levelId: 'L0',
    cause: 'no-longer-detected',
    roomId: 'room_B',
    roomName: 'Bedroom',
    roomAreaM2: 24,
    reason: 'multiple-disjoint-gaps',
    detail: 'Bedroom (24.0 m²) … Which one you meant to keep is genuinely unknown.',
};

/** A stand-in chat surface plus a stand-in bus, so the whole ask→dispatch path runs. */
function harness(answer: boolean | undefined) {
    const said: string[] = [];
    const asked: string[] = [];
    const executeCommand = vi.fn(async () => ({ success: true }));
    (globalThis as { window?: unknown }).window = {
        runtime: { bus: { executeCommand } },
        bimManager: { getLevelById: () => ({ height: 3.0 }) },
    };
    if (answer !== undefined) {
        registerChatPromptHost({
            say: t => { said.push(t); },
            confirm: async s => { asked.push(s); return answer; },
        });
    }
    return { said, asked, executeCommand };
}

beforeEach(() => {
    __resetOpenedRegionProposalState();
    __resetChatPromptHost();
    delete (globalThis as { window?: unknown }).window;
});

describe('§OPENED-REGION — the offer is a question carrying the canonical bus command', () => {
    it('composes a wall.create on the gap the detector computed, to the millimetre', () => {
        const offer = buildOpenedRegionOffer(OPENED);
        expect(offer).toBeDefined();
        expect(offer!.commandType).toBe('wall.create');
        expect(offer!.payload.baseLine[0]).toEqual({ x: 0.2, y: 0, z: 0 });
        expect(offer!.payload.baseLine[1]).toEqual({ x: 5.8, y: 0, z: 0 });
        expect(offer!.payload.levelId).toBe('L0');
    });

    it('carries thickness and height from the donor wall rather than inventing them', () => {
        const offer = buildOpenedRegionOffer(OPENED)!;
        expect(offer.payload.thickness).toBe(0.12);
        expect(offer.payload.height).toBe(2.5);
        expect(offer.summary).toContain('wall_partition_0001');
    });

    it('discloses in the summary when it had no donor to copy', () => {
        const offer = buildOpenedRegionOffer({
            ...OPENED,
            gap: { ...OPENED.gap, matchedWallId: undefined, thicknessM: undefined, heightM: undefined },
        })!;
        expect(offer.summary).toContain('no surviving wall was close enough to copy');
    });

    it('states the anchoring honestly, including when the segment floats', () => {
        expect(buildOpenedRegionOffer(OPENED)!.summary)
            .toContain('Both ends meet walls that are still standing');
        expect(buildOpenedRegionOffer({ ...OPENED, gap: { ...OPENED.gap, anchoredEndpoints: 0 } })!.summary)
            .toContain('NEITHER end meets a surviving wall');
    });

    it('leaves the "can be undone with Ctrl+Z" tail to the card — this really is ONE command', () => {
        // The card appends the tail itself unless the summary already claims an undo
        // cost (AIPanel.showZeroTokenConfirm, §PLAN RAC U6). One command, one entry.
        expect(buildOpenedRegionOffer(OPENED)!.summary).not.toMatch(/ctrl\s*\+\s*z/i);
    });

    it('builds no offer for a degenerate gap', () => {
        expect(buildOpenedRegionOffer({
            ...OPENED,
            gap: { ...OPENED.gap, lengthM: 0.01, end: { x: 0.21, z: 0 } },
        })).toBeUndefined();
    });
});

describe('§OPENED-REGION — nothing is created until the user confirms', () => {
    it('asks, then dispatches exactly one wall.create on Confirm', async () => {
        const h = harness(true);
        await presentOpenedRegion(OPENED);
        expect(h.asked).toHaveLength(1);
        expect(h.asked[0]).toContain('Create an interior wall');
        expect(h.executeCommand).toHaveBeenCalledTimes(1);
        expect(h.executeCommand.mock.calls[0]![0]).toBe('wall.create');
        expect(h.said.join(' ')).toContain('Ctrl+Z undoes it in one step');
    });

    it('dispatches NOTHING on Cancel, and says so', async () => {
        const h = harness(false);
        await presentOpenedRegion(OPENED);
        expect(h.asked).toHaveLength(1);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toContain('nothing was changed');
    });

    it('treats "nobody could be asked" as NOT a decline — it dispatches nothing and re-arms', async () => {
        const h = harness(undefined); // no chat host, no DOM
        await presentOpenedRegion(OPENED);
        expect(h.executeCommand).not.toHaveBeenCalled();
        // The key stood down, so the question can be asked once a panel exists.
        const h2 = harness(true);
        registerChatPromptHost({
            say: t => { h2.said.push(t); },
            confirm: async s => { h2.asked.push(s); return true; },
        });
        await presentOpenedRegion(OPENED);
        expect(h2.asked).toHaveLength(1);
    });
});

/**
 * §PROMPT-REACHES-A-HUMAN (L-881) — the founder's EXACT starting state, reproduced.
 *
 * Build `a75e8e1e` shipped with the detector firing correctly in production (console:
 * `gap 2.81 m, anchored 2/2, rooms 2 → 1`) and the founder seeing NOTHING: the question
 * went to `console.warn` and stopped. These arms fail on that code.
 *
 * The state under test is "the AI chat has never been opened and no host is
 * registered". The obligation is that the offer still reaches a VISIBLE surface — by
 * opening the panel if it can, and by rendering a visible fallback prompt if it
 * cannot. What is NOT acceptable is the run ending with only a console line.
 */
describe('§PROMPT-REACHES-A-HUMAN — the question reaches a visible surface with NO host pre-registered', () => {
    /** A minimal DOM double: enough for openChatSurface() and the fallback card. */
    function domHarness(opts: { withPanel: boolean; withToggle: boolean }) {
        const appended: Array<Record<string, unknown>> = [];
        const clicks: string[] = [];
        const mkEl = (): Record<string, unknown> => {
            const attrs: Record<string, string> = {};
            const children: Array<Record<string, unknown>> = [];
            const el: Record<string, unknown> = {
                style: { cssText: '', display: '' },
                children,
                textContent: '',
                type: '',
                setAttribute: (k: string, v: string) => { attrs[k] = v; },
                getAttribute: (k: string) => attrs[k],
                appendChild: (c: Record<string, unknown>) => { children.push(c); return c; },
                addEventListener: () => { /* buttons are not pressed in this arm */ },
                remove: () => { /* detach is a no-op for the double */ },
                click: () => { clicks.push('toggle'); },
            };
            return el;
        };
        const panel = mkEl();
        (panel.style as { display: string }).display = 'none';
        const toggle = mkEl();
        const body = mkEl();
        const document = {
            body,
            getElementById: (id: string) =>
                (opts.withPanel && id === 'ai-panel-container' ? panel : null),
            querySelector: (_sel: string) => (opts.withToggle ? toggle : null),
            createElement: (_tag: string) => {
                const el = mkEl();
                appended.push(el);
                return el;
            },
        };
        (globalThis as { document?: unknown }).document = document;
        (globalThis as { window?: unknown }).window = {
            runtime: { bus: { executeCommand: vi.fn(async () => ({ success: true })) } },
            bimManager: { getLevelById: () => ({ height: 3.0 }) },
        };
        return { panel, body, clicks, appended };
    }

    afterEach(() => {
        delete (globalThis as { document?: unknown }).document;
        delete (globalThis as { window?: unknown }).window;
    });

    it('OPENS the AI panel rather than giving up — the founder had never opened it', async () => {
        const d = domHarness({ withPanel: true, withToggle: true });
        // No registerChatPromptHost() — exactly the state the founder was in.
        // Not awaited: the prompt stays open until a human answers it, which is the
        // point. What is asserted is that the surface was opened, promptly.
        const run = presentOpenedRegion(OPENED);
        await vi.waitFor(
            () => { expect(d.clicks).toContain('toggle'); },
            { timeout: 10_000, interval: 50 },
        );
        expect(getSurfaceDiagnostics().surfaceOpensForced).toBeGreaterThan(0);
        void run;
        // This arm deliberately leaves a prompt un-answered; stand the module down so
        // its eventual render cannot bleed into the next arm's counters.
        __resetOpenedRegionProposalState();
    }, 30_000);

    it('renders a VISIBLE prompt when no host ever arrives — never console-only', async () => {
        const d = domHarness({ withPanel: true, withToggle: true });
        const run = presentOpenedRegion(OPENED);
        // Let ensureChatSurface exhaust its deadline; no host will ever register.
        // The assertion is on THIS arm's own document double: a real element carrying
        // the fallback marker was appended to the body. That is what fails on
        // a75e8e1e, where the run ended at console.warn with nothing rendered.
        await vi.waitFor(
            () => {
                const card = d.appended.find(
                    el => (el.getAttribute as (k: string) => string | undefined)('data-pryzm-fallback-prompt') === 'true',
                );
                expect(card).toBeDefined();
                expect((d.body.children as unknown[]).length).toBeGreaterThan(0);
            },
            { timeout: 20_000, interval: 100 },
        );
        expect(getSurfaceDiagnostics().fallbackPrompts).toBeGreaterThanOrEqual(1);
        void run;
    }, 40_000);

    it('picks up a host that registers WHILE the panel is coming up, and asks there', async () => {
        domHarness({ withPanel: true, withToggle: true });
        const asked: string[] = [];
        const run = presentOpenedRegion(OPENED);
        // The panel finishes mounting a moment later, as it does in the browser.
        setTimeout(() => {
            registerChatPromptHost({
                say: () => { /* transcript */ },
                confirm: async s => { asked.push(s); return false; },
                isReady: () => true,
            });
        }, 250);
        await run;
        expect(asked).toHaveLength(1);
        expect(asked[0]).toContain('Create an interior wall');
        // It reached the real chat prompt, so no fallback was needed.
        expect(getSurfaceDiagnostics().fallbackPrompts).toBe(0);
    }, 30_000);

    it('does NOT ask a host whose transcript is not built — that would fabricate a cancel', async () => {
        domHarness({ withPanel: true, withToggle: true });
        const asked: string[] = [];
        registerChatPromptHost({
            say: () => { /* transcript */ },
            // AIPanel.showZeroTokenConfirm resolves a fabricated `false` in this state.
            confirm: async s => { asked.push(s); return false; },
            isReady: () => false,
        });
        const run = presentOpenedRegion(OPENED);
        await vi.waitFor(
            () => { expect(getSurfaceDiagnostics().fallbackPrompts).toBe(1); },
            { timeout: 15_000, interval: 100 },
        );
        expect(asked).toHaveLength(0);
        void run;
    }, 30_000);
});

describe('§OPENED-REGION — it refuses to show a button it cannot defend', () => {
    it('builds no offer at all for a position-unknown finding', () => {
        expect(buildOpenedRegionOffer(UNKNOWN)).toBeUndefined();
    });

    it('says what is unknown and shows NO confirm card', async () => {
        const h = harness(true);
        await presentOpenedRegion(UNKNOWN);
        expect(h.asked).toHaveLength(0);
        expect(h.executeCommand).not.toHaveBeenCalled();
        expect(h.said.join(' ')).toContain('I would be guessing where it goes');
    });
});

describe('§OPENED-REGION — it asks ONCE', () => {
    it('does not re-ask the identical gap on a repeated re-detect', async () => {
        const h = harness(false);
        await presentOpenedRegion(OPENED);
        await presentOpenedRegion(OPENED);
        await presentOpenedRegion(OPENED);
        expect(h.asked).toHaveLength(1);
    });
});

describe('chatPromptHost — the accessor queues rather than dropping a line', () => {
    it('flushes lines said before the panel existed', () => {
        __resetChatPromptHost();
        expect(chatSay('noticed something')).toBe(false);
        const said: string[] = [];
        registerChatPromptHost({ say: t => { said.push(t); }, confirm: async () => false });
        expect(said).toEqual(['noticed something']);
    });
});
