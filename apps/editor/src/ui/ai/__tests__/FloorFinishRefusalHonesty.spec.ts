// §FLOOR-FINISH-REFUSAL-HONESTY — the founder's report, pinned at the layer
// that composes THE USER'S SENTENCE.
//
// ── WHAT WENT WRONG IN PRODUCTION ────────────────────────────────────────────
// The founder asked the chat to create a floor finish. The chat replied:
//
//   "Floor finishes applied per room type (timber in living/bedroom, tile in
//    kitchen/bathroom). Undo with Ctrl+Z. (resolved without AI tokens)"
//
// …while the console, from the SAME gesture, read:
//
//   [CommandManager] REFUSED CREATE_FLOORS_BY_ROOM_TYPE: No rooms with a
//   floor-mappable type — run Auto-Organise (tag rooms) first.
//   [floor-layout] CreateFloorsByRoomType returned non-success: Object
//
// No floor was created. The user was told one was, and was offered Ctrl+Z for a
// mutation that never happened.
//
// The command was HONEST: it refused, with a reason AND a remedy. The chain
// above it threw that away — `roomFinishChatSeam`'s `floors` stage called
// `triggerFloorLayout` (which returned `void`) and then pushed a CANNED success
// line marked `confirmed: true`, so `reportStages` emitted `success: true` and
// `ZeroTokenChatBridge` rendered the "applied" sentence.
//
// ── WHY THE TEST LIVES HERE AND DRIVES `tryHandleZeroToken` ──────────────────
// ⭐ COMMITTED ≠ REACHABLE. Asserting `CreateFloorsByRoomTypeCommand.canExecute`
// returns `{ ok: false }` proves nothing — it ALREADY did that in production,
// and the user was still told "applied". The only assertion that can fail for
// the reason the founder reported is one made on the STRING the chat says. So
// this suite drives the real bridge entry point with the real seam and the real
// trigger, stubbing only `window.commandManager.execute` — the one seam where
// the refusal is born.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryHandleZeroToken, resetZeroTokenConversation } from '../ZeroTokenChatBridge';
import { runGenerationRooms } from '@app/ui/generation/roomFinishChatSeam';

// The sibling engines are event-driven and pull heavy executors; this suite is
// about the FLOOR stage, and the seam's other arms are unchanged by it. The
// floor trigger and the seam itself are the REAL modules.
vi.mock('@app/ui/ceiling-layout/ceilingLayoutTrigger.js', () => ({
    triggerCeilingLayout: () => { /* not exercised */ },
    installCeilingLayoutTrigger: () => { /* not exercised */ },
}));
vi.mock('@app/ui/furnish-layout/furnishLayoutTrigger.js', () => ({
    triggerFurnishLayout: () => { /* not exercised */ },
    triggerFurnishAllFloors: () => Promise.resolve(),
    triggerFurnishWithPrompt: () => { /* not exercised */ },
}));
vi.mock('@app/ui/lighting-layout/lightingLayoutTrigger.js', () => ({
    triggerLightingLayout: () => { /* not exercised */ },
    installLightingLayoutTrigger: () => { /* not exercised */ },
}));

/** The EXACT sentence `CommandManagerImpl.execute()` puts in `info[0]` when
 *  `CreateFloorsByRoomTypeCommand.canExecute` refuses — reason AND remedy. */
const REFUSAL =
    'No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first.';

interface TestWindow {
    selectionManager?: unknown;
    bimManager?: unknown;
    projectContext?: { activeLevelId?: string | null };
    commandManager?: { execute: (cmd: unknown, opts?: unknown) => unknown };
    runtime?: unknown;
}
const testWindow = (): TestWindow => window as unknown as TestWindow;

/**
 * Wire the window facets the way the editor shell does, and route
 * `generation.rooms` into the REAL seam — which is what `initBusHandlers`
 * does in production. `commandManager.execute` returns whatever the test says
 * the legacy layer decided.
 */
function installFacets(execResult: unknown): {
    execute: ReturnType<typeof vi.fn>;
    executeCommand: ReturnType<typeof vi.fn>;
} {
    const execute = vi.fn().mockReturnValue(execResult);
    const executeCommand = vi.fn().mockImplementation(async (type: string, payload: unknown) => {
        if (type === 'generation.rooms') {
            await runGenerationRooms(payload as { steps?: readonly ('ceilings' | 'floors' | 'furnish' | 'lighting')[] });
        }
        return undefined;
    });
    const w = testWindow();
    w.selectionManager = { selectedObject: null };
    w.bimManager = { getLevels: () => [{ id: 'L0', name: 'Level 0', elevation: 0 }] };
    w.projectContext = { activeLevelId: 'L0' };
    w.commandManager = { execute };
    w.runtime = { bus: { executeCommand }, events: { emit: vi.fn(), on: vi.fn() } };
    return { execute, executeCommand };
}

function makeHooks() {
    const said: string[] = [];
    return {
        said,
        hooks: {
            say: (text: string) => { said.push(text); },
            // The ask is `destructive: true` in the resolver, so the Confirm card
            // is shown first. The founder confirmed; so does this test.
            confirm: () => Promise.resolve(true),
        },
    };
}

beforeEach(() => {
    resetZeroTokenConversation();
});

afterEach(() => {
    const w = testWindow();
    delete w.commandManager;
    delete w.runtime;
    delete w.projectContext;
    delete w.bimManager;
    delete w.selectionManager;
});

describe('§FLOOR-FINISH-REFUSAL-HONESTY — a refused floor finish is REPORTED as refused', () => {
    it("the chat does NOT claim success when the command refused", async () => {
        installFacets({ success: false, affectedElementIds: [], info: [REFUSAL] });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('create a floor finish', hooks);
        const reply = said.join('\n');

        expect(handled).toBe(true);
        // THE DEFECT, stated as an assertion. In production this line was
        // "Floor finishes applied per room type (…). Undo with Ctrl+Z."
        expect(reply).not.toMatch(/Floor finishes applied/i);
    });

    it('the refusal reaches the user with its REASON and its REMEDY', async () => {
        installFacets({ success: false, affectedElementIds: [], info: [REFUSAL] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);
        const reply = said.join('\n');

        // The reason the command gave — verbatim, not paraphrased away.
        expect(reply).toContain('floor-mappable');
        // The remedy the command gave. A refusal without a next step is a
        // dead end, and this command already supplies one.
        expect(reply).toContain('Auto-Organise');
    });

    it('NO "Undo with Ctrl+Z" is offered for a mutation that never happened', async () => {
        installFacets({ success: false, affectedElementIds: [], info: [REFUSAL] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);
        const reply = said.join('\n');

        expect(reply).not.toMatch(/ctrl\s*\+\s*z/i);
    });

    it('the fix is NOT silence — the user is still told something', async () => {
        // Guard against "fixing" this by dropping the message. An honest refusal
        // is the goal; an empty transcript is a different defect.
        installFacets({ success: false, affectedElementIds: [], info: [REFUSAL] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);

        expect(said.length).toBeGreaterThan(0);
        expect(said.join('\n').trim().length).toBeGreaterThan(20);
    });

    it('the WHOLE sentence, pinned — this is what the founder now reads', async () => {
        installFacets({ success: false, affectedElementIds: [], info: [REFUSAL] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);

        expect(said).toEqual([
            'Nothing was changed — Floor finishes: ' +
            'No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first.',
        ]);
    });

    it('a SUCCESS that created nothing is not dressed up as work done', async () => {
        // `canExecute` passes (some room maps to a finish) but every one of them
        // already had a floor, so `affectedElementIds` is empty. "Applied" would
        // be the same over-claim in a quieter costume.
        installFacets({ success: true, affectedElementIds: [], info: [] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);
        const reply = said.join('\n');

        expect(reply).toMatch(/no new floor was created/i);
        expect(reply).not.toMatch(/ctrl\s*\+\s*z/i);
    });

    it('a command that SUCCEEDS still reads as applied, with the undo hint', async () => {
        // The other half of the honesty rule: the refusal path must not swallow
        // a genuine success.
        installFacets({ success: true, affectedElementIds: ['floor-1', 'floor-2'], info: [] });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('create a floor finish', hooks);
        const reply = said.join('\n');

        expect(reply).toMatch(/floor finish/i);
        expect(reply).toMatch(/ctrl\s*\+\s*z/i);
    });
});
