// §FURNISH-ALL-FLOORS-HONESTY — the fourth canned-success site the sweep found.
//
// `runGenerationRooms`'s every-floor arm read:
//
//     await triggerFurnishAllFloors(rt);
//     emitReport(true, ['Furnished every floor — the per-floor coverage report
//                        is in the console (§COVERAGE-ALL-FLOORS).']);
//
// The sentence was written before the driver ran, and `triggerFurnishAllFloors`
// returned `void`, so it was emitted for EVERY outcome the driver could reach:
// no runtime, no levels, a driver that threw, and a run where every floor timed
// out. Meanwhile the driver had computed a full `FurnishCoverageSummary` —
// floors, rooms furnished, items placed, rooms skipped, floors timed out — and
// dropped it into a toast and the console.
//
// Same shape as the founder's floor-finish report, one arm over: the evidence
// existed and the reporter did not read it. These assert on the chat sentence.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryHandleZeroToken, resetZeroTokenConversation } from '../ZeroTokenChatBridge';
import { runGenerationRooms } from '@app/ui/generation/roomFinishChatSeam';

const allFloors = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@app/ui/furnish-layout/furnishLayoutTrigger.js', () => ({
    triggerFurnishLayout: () => { /* not exercised */ },
    triggerFurnishAllFloors: () => Promise.resolve(allFloors.value),
    triggerFurnishWithPrompt: () => { /* not exercised */ },
}));
vi.mock('@app/ui/ceiling-layout/ceilingLayoutTrigger.js', () => ({
    triggerCeilingLayout: () => { /* not exercised */ },
    installCeilingLayoutTrigger: () => { /* not exercised */ },
}));
vi.mock('@app/ui/lighting-layout/lightingLayoutTrigger.js', () => ({
    triggerLightingLayout: () => { /* not exercised */ },
    installLightingLayoutTrigger: () => { /* not exercised */ },
}));

interface TestWindow {
    selectionManager?: unknown;
    bimManager?: unknown;
    projectContext?: { activeLevelId?: string | null };
    runtime?: unknown;
}
const testWindow = (): TestWindow => window as unknown as TestWindow;

function installFacets(): void {
    const w = testWindow();
    w.selectionManager = { selectedObject: null };
    w.bimManager = {
        getLevels: () => [
            { id: 'L0', name: 'Level 0', elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ],
    };
    w.projectContext = { activeLevelId: 'L0' };
    w.runtime = {
        bus: {
            executeCommand: vi.fn().mockImplementation(async (type: string, payload: unknown) => {
                if (type === 'generation.rooms') await runGenerationRooms(payload as never);
                return undefined;
            }),
        },
        events: { emit: vi.fn(), on: vi.fn() },
    };
}

function makeHooks() {
    const said: string[] = [];
    return {
        said,
        hooks: {
            say: (text: string) => { said.push(text); },
            confirm: () => Promise.resolve(true),   // the ask is destructive
        },
    };
}

const ASK = 'furnish every floor';

beforeEach(() => {
    resetZeroTokenConversation();
    installFacets();
});

afterEach(() => {
    const w = testWindow();
    delete w.runtime;
    delete w.projectContext;
    delete w.bimManager;
    delete w.selectionManager;
});

describe('§FURNISH-ALL-FLOORS-HONESTY — the report carries the driver\'s own numbers', () => {
    it('a REFUSAL is not reported as "furnished every floor"', async () => {
        allFloors.value = { status: 'refused', reason: 'No levels found — open a project first.' };
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken(ASK, hooks);
        const reply = said.join('\n');

        expect(reply).not.toMatch(/Furnished \d+ floor/i);
        expect(reply).not.toMatch(/ctrl\s*\+\s*z/i);
        expect(reply).toContain('No levels found');
    });

    it('a real run reports the ENGINE\'s counts, not a sentence written in advance', async () => {
        allFloors.value = {
            status: 'covered',
            summary: {
                floors: 3, totalPlaced: 84, totalFurnished: 21, totalSkipped: 2,
                timedOutFloors: 0, lines: [],
            },
        };
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken(ASK, hooks);
        const reply = said.join('\n');

        expect(reply).toContain('3 floors');
        expect(reply).toContain('21 rooms');
        expect(reply).toContain('84 items');
        expect(reply).toContain('2 rooms skipped');
        // It happened, so the undo hint belongs.
        expect(reply).toMatch(/ctrl\s*\+\s*z/i);
        // The old line pointed at the console instead of answering.
        expect(reply).not.toContain('the per-floor coverage report is in the console');
    });

    it('a TIMED-OUT floor is named, and downgrades the verdict — never dropped', async () => {
        allFloors.value = {
            status: 'covered',
            summary: {
                floors: 3, totalPlaced: 40, totalFurnished: 10, totalSkipped: 0,
                timedOutFloors: 1, lines: [],
            },
        };
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken(ASK, hooks);
        const reply = said.join('\n');

        expect(reply).toMatch(/1 floor sent no report/i);
        expect(reply).toMatch(/nothing about it is confirmed/i);
        // The bridge's `partial` sentence — what ran is real, the rest is named.
        expect(reply).toMatch(/partly done/i);
    });
});
