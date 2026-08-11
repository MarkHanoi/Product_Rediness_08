// §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — THE REPORTING LAYER MUST NOT THROW THE
// ENGINE'S PAYLOAD AWAY.
//
// The engines are honest. `DeleteElementsBatchCommand` refuses a batch where
// NOTHING is deletable; `UpdateWallsSystemTypeBatchCommand` reports
// "Changed N of M — K skipped: <reason>"; the room-finish seam reads its counts
// off the engines' own `*.layout-executed` payloads. Fifty executed tests pin
// that behaviour.
//
// THE LAST LAYER IS WHERE THE TRUTH DIES. Three shapes of loss:
//
//   1. `dispatchBatchEntry` (ui/create/batchCatalogue.ts) collapses a
//      CommandResult to `{ ok: true }` — `res.info` is DISCARDED, so the two
//      panels that render it (AIPanel, CreatePanelLayout) print "Done" over a
//      12-of-40 partial.
//   2. `DispatchOutcome` (ZeroTokenChatBridge) is a boolean plus strings. It has
//      NO WAY TO SAY "the engine was asked and sent no report" — that state is
//      encoded as `{ ok: true, lines: [] }`, i.e. as SUCCESS. Failure and
//      emptiness are the same value.
//   3. The room-finish seam emits `success: true` after a TOTAL TIMEOUT.
//
// C68 §5.g is the governing clause: «Success is reported as what happened:
// "Changed N of M — K skipped: <reason>", with the reason read off the command's
// or engine's own report payload, never re-narrated. "Done" ONLY after a command
// reports success.» C68 §6.3 (G4/G6) records that whether the payload is
// populated truthfully is review-only — this spec makes the DISCARD half
// machine-checked, and `tools/ga-gate/check-report-payload-discard.ts` (R4)
// makes it repo-wide.
//
// SIX ENGINE STATES. Each MUST produce a DISTINCT user-facing transcript that
// preserves the engine's own terminology:
//   1  all succeed
//   2  some succeed (partial)
//   3  some skipped
//   4  all fail
//   5  none eligible (refusal — nothing was applicable)
//   6  the engine cannot determine (indeterminate / timeout / no report)
//
// Environment: happy-dom (root vitest.config.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiService } from '@pryzm/ai-host';
import { tryHandleZeroToken, resetZeroTokenConversation, classifyDispatch } from '../ZeroTokenChatBridge';
import {
    BATCH_CATALOGUE,
    dispatchBatchEntry,
    renderBatchDispatchMessage,
    type BatchDeps,
} from '../../create/batchCatalogue';

// ─── shared window facets ────────────────────────────────────────────────────

interface TestWindowFacets {
    selectionManager?: { selectedObject?: unknown };
    bimManager?: { getLevels?: () => ReadonlyArray<{ id: string; name?: string; elevation?: number }> };
    projectContext?: { activeLevelId?: string | null };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        events?: { emit(name: string, payload: unknown): void };
    };
}
const testWindow = (): TestWindowFacets => window as unknown as TestWindowFacets;

/** The report shape every batch bridge broadcasts (`{success, info}`), plus the
 *  W2-B `outcome` discriminator. `null` = NO report event at all (case 6). */
type EngineReport = { success: boolean; info: string[]; outcome?: string } | null;

function installFacets(report: EngineReport): { executeCommand: ReturnType<typeof vi.fn> } {
    const executeCommand = vi.fn().mockImplementation(async () => {
        // The bridge arms its listeners BEFORE dispatching, exactly as the real
        // handlers broadcast synchronously from inside `commandManager.execute`.
        if (report !== null) {
            window.dispatchEvent(new CustomEvent('pryzm-generation-report', { detail: report }));
        }
        return undefined;
    });
    const w = testWindow();
    w.selectionManager = { selectedObject: null };
    w.bimManager = {
        getLevels: () => [
            { id: 'L0', name: 'Level 0', elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ],
    };
    w.projectContext = { activeLevelId: 'L0' };
    w.runtime = { bus: { executeCommand }, events: { emit: vi.fn() } };
    return { executeCommand };
}

/** Drive ONE chat sentence to completion and return the FULL transcript. */
async function transcriptFor(report: EngineReport): Promise<string> {
    resetZeroTokenConversation();
    installFacets(report);
    const said: string[] = [];
    const handled = await tryHandleZeroToken('furnish all rooms', {
        say: (t: string) => { said.push(t); },
        confirm: () => Promise.resolve(true),
    });
    expect(handled).toBe(true);
    return said.join('\n');
}

// The six engine payloads, in the engines' OWN words. Cases 1–3 are what the
// room-scale engines emit on a `pryzm-generation-report`; 4–5 are the two
// distinct not-applied states (ran-and-changed-nothing vs refused-outright);
// 6 is the absence of any report.
const CASE_1_ALL_SUCCEED: EngineReport = {
    success: true,
    info: ['Ceilings 24/24', 'Furniture 24/24 (96 items) (furnishing also auto-lights the rooms)', 'Lighting 24/24'],
};
const CASE_2_PARTIAL: EngineReport = {
    success: true,
    info: ['Ceilings 24/24', 'Furniture 18/24 (61 items) — 6 rooms skipped: no wall long enough for the bed', 'Lighting 18/24'],
};
const CASE_3_SOME_SKIPPED: EngineReport = {
    success: true,
    info: ['Furniture 24/24 (96 items) — 3 rooms skipped: room is a corridor'],
};
const CASE_4_ALL_FAIL: EngineReport = {
    success: false,
    info: ['Furniture 0/24 — 24 rooms skipped: the room polygon is not closed'],
};
const CASE_5_NONE_ELIGIBLE: EngineReport = {
    success: false,
    info: ['No rooms on Level 0 — detect rooms first; nothing was changed.'],
};
const CASE_6_INDETERMINATE: EngineReport = null;

describe('W2-B — the reporting layer preserves the engine payload (C68 §5.g)', () => {
    beforeEach(() => {
        resetZeroTokenConversation();
        vi.restoreAllMocks();
        vi.spyOn(aiService, 'query').mockRejectedValue(
            new Error('aiService.query must NOT be called — this is the zero-token path'),
        );
    });

    it('the SIX engine states produce SIX DISTINCT transcripts', async () => {
        const t1 = await transcriptFor(CASE_1_ALL_SUCCEED);
        const t2 = await transcriptFor(CASE_2_PARTIAL);
        const t3 = await transcriptFor(CASE_3_SOME_SKIPPED);
        const t4 = await transcriptFor(CASE_4_ALL_FAIL);
        const t5 = await transcriptFor(CASE_5_NONE_ELIGIBLE);
        const t6 = await transcriptFor(CASE_6_INDETERMINATE);

        const all = { t1, t2, t3, t4, t5, t6 };
        // eslint-disable-next-line no-console
        console.log('\n──── SIX TRANSCRIPTS ────\n' +
            Object.entries(all).map(([k, v]) => `${k}: ${v}`).join('\n\n') + '\n');

        expect(new Set(Object.values(all)).size).toBe(6);
    });

    it('case 1 — all succeed: the engine\'s counts, and "Done" is earned', async () => {
        const t = await transcriptFor(CASE_1_ALL_SUCCEED);
        expect(t).toContain('Ceilings 24/24');
        expect(t).toContain('Furniture 24/24');
        expect(t).toContain('Lighting 24/24');
        expect(t).not.toMatch(/skipped/i);
    });

    it('case 2 — partial: the SKIPPED count and the engine\'s reason survive to the user', async () => {
        const t = await transcriptFor(CASE_2_PARTIAL);
        expect(t).toContain('18/24');
        expect(t).toContain('6 rooms skipped');
        expect(t).toContain('no wall long enough for the bed');
    });

    it('case 3 — some skipped: distinct from a clean run, reason preserved verbatim', async () => {
        const t = await transcriptFor(CASE_3_SOME_SKIPPED);
        expect(t).toContain('3 rooms skipped');
        expect(t).toContain('room is a corridor');
        expect(t).not.toBe(await transcriptFor(CASE_1_ALL_SUCCEED));
    });

    it('case 4 — all fail: never reads as success, and quotes the engine', async () => {
        const t = await transcriptFor(CASE_4_ALL_FAIL);
        expect(t).toContain('Furniture 0/24');
        expect(t).toContain('the room polygon is not closed');
        expect(t).not.toMatch(/\bDone\b/);
    });

    it('case 5 — none eligible: the REFUSAL reason is the transcript, not a generic default', async () => {
        const t = await transcriptFor(CASE_5_NONE_ELIGIBLE);
        expect(t).toContain('No rooms on Level 0 — detect rooms first');
        expect(t).not.toMatch(/\bDone\b/);
        // A refusal is not the same sentence as "it ran and failed" (case 4).
        expect(t).not.toBe(await transcriptFor(CASE_4_ALL_FAIL));
    });

    it('case 6 — INDETERMINATE: no report arrived, so nothing may be claimed', async () => {
        const t = await transcriptFor(CASE_6_INDETERMINATE);
        // THE BUG. Today this reads "…Done — undo with Ctrl+Z." over a command
        // that promised a report and sent none. Failure and emptiness are the
        // same value, and the layer picks the flattering one.
        expect(t).not.toMatch(/\bDone\b/);
        expect(t.toLowerCase()).toMatch(/no report|could not|can't tell|cannot tell/);
    });
});

// ─── site 3 — a PARTIAL across commands is not a TOTAL failure ───────────────
//
// `executeSlice` reported ANY rejected command as total failure and read only
// `batchReports[0]`, discarding every later report. Pinned on the exported pure
// classifier, because the multi-command branch is the only place both can occur.

describe('W2-B — classifyDispatch: the mixed states have their own kinds', () => {
    it('every command reported success → applied', () => {
        const o = classifyDispatch({
            reports: [{ success: true, info: ['Changed 40 of 40 walls'] }],
            failures: [],
            expectsReport: true,
            commandCount: 1,
        });
        expect(o.kind).toBe('applied');
    });

    it('SOME commands rejected and some ran → partial, NOT total failure', () => {
        const o = classifyDispatch({
            reports: [{ success: true, info: ['Changed 40 of 40 walls'] }],
            failures: ['window.updateSystemTypeBatch: no such type'],
            expectsReport: true,
            commandCount: 2,
        });
        expect(o.kind).toBe('partial');
        if (o.kind !== 'partial') return;
        expect(o.lines.join(' ')).toContain('Changed 40 of 40 walls');
        expect(o.failedLines.join(' ')).toContain('no such type');
    });

    it('a LATER report is never discarded by an earlier one', () => {
        const o = classifyDispatch({
            reports: [
                { success: true, info: ['Changed 40 of 40 walls'] },
                { success: false, info: ['No window carries a type — nothing was changed.'] },
            ],
            failures: [],
            expectsReport: true,
            commandCount: 2,
        });
        expect(o.kind).toBe('partial');
        if (o.kind !== 'partial') return;
        const text = [...o.lines, ...o.failedLines].join(' ');
        expect(text).toContain('Changed 40 of 40 walls');
        expect(text).toContain('No window carries a type');
    });

    it('a command that PROMISED a report and sent none → indeterminate, never applied', () => {
        const o = classifyDispatch({ reports: [], failures: [], expectsReport: true, commandCount: 1 });
        expect(o.kind).toBe('indeterminate');
    });

    it('a command that promises NO report is applied on a clean dispatch — emptiness here is not failure', () => {
        const o = classifyDispatch({ reports: [], failures: [], expectsReport: false, commandCount: 1 });
        expect(o.kind).toBe('applied');
    });

    it('EVERY command rejected → dispatch-failed', () => {
        const o = classifyDispatch({
            reports: [],
            failures: ['wall.updateSystemTypeBatch: bus down'],
            expectsReport: true,
            commandCount: 1,
        });
        expect(o.kind).toBe('dispatch-failed');
    });
});

// ─── site 1 — dispatchBatchEntry discards res.info ───────────────────────────

describe('W2-B — dispatchBatchEntry carries the engine report to the panels', () => {
    const entry = BATCH_CATALOGUE.find((e) => e.catalogId === 'grid.create-system')!;

    function depsReturning(result: { success: boolean; info?: string[] }): BatchDeps {
        return {
            commandManager: { execute: () => result },
            getActiveLevelId: () => 'L0',
            getLevels: () => [{ id: 'L0', elevation: 0 }],
            getSelectedElementId: () => null,
            slabStore: null,
        };
    }

    it('a PARTIAL success reaches the user with the engine\'s numbers, not "Done"', () => {
        const r = dispatchBatchEntry(entry, depsReturning({
            success: true,
            info: ['Created 12 of 25 grid lines — 13 skipped: outside the site boundary'],
        }));
        // THE PAYLOAD MUST SURVIVE THE CALL.
        expect(JSON.stringify(r)).toContain('12 of 25');

        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toContain('Created 12 of 25 grid lines');
        expect(msg).toContain('13 skipped: outside the site boundary');
    });

    it('a clean success still reads cleanly', () => {
        const r = dispatchBatchEntry(entry, depsReturning({
            success: true,
            info: ['Created 25 of 25 grid lines'],
        }));
        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toContain('Created 25 of 25 grid lines');
        expect(msg).not.toMatch(/skipped/i);
    });

    it('a command that reports NOTHING is not dressed up as a report', () => {
        const r = dispatchBatchEntry(entry, depsReturning({ success: true }));
        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toContain(entry.label);
    });

    // ─── case 6 at the CATALOGUE seam ───────────────────────────────────────
    // The chat seam got its indeterminate arm above; this seam has three ways to
    // reach the same state, and all three used to render as a REFUSAL — a
    // stated no from an engine that was never asked.

    function depsWithExecute(execute: () => unknown): BatchDeps {
        return {
            commandManager: { execute } as unknown as BatchDeps['commandManager'],
            getActiveLevelId: () => 'L0',
            getLevels: () => [{ id: 'L0', elevation: 0 }],
            getSelectedElementId: () => null,
            slabStore: null,
        };
    }

    it('case 6a — NO command sink: never dispatched, so nothing may be claimed either way', () => {
        const r = dispatchBatchEntry(entry, { ...depsWithExecute(() => undefined), commandManager: null });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.indeterminate).toBe(true);
        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toMatch(/can't tell you whether/i);
        expect(msg).toContain('Nothing about the model is confirmed');
        expect(msg).not.toMatch(/^Couldn't run/);
    });

    it('case 6b — execute() returns NOTHING: a silence is not a refusal', () => {
        const r = dispatchBatchEntry(entry, depsWithExecute(() => undefined));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.indeterminate).toBe(true);
        expect(renderBatchDispatchMessage(entry, r)).toMatch(/reported neither success nor a reason/);
    });

    it('case 6c — the dispatch THREW: distinct from every stated refusal', () => {
        const r = dispatchBatchEntry(entry, depsWithExecute(() => { throw new Error('bus down'); }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.indeterminate).toBe(true);
        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toContain('bus down');
        expect(msg).toMatch(/can't tell you whether/i);
    });

    it('an INDETERMINATE dispatch and a REFUSAL are not the same sentence', () => {
        const indet = renderBatchDispatchMessage(entry, dispatchBatchEntry(entry, depsWithExecute(() => undefined)));
        const refused = renderBatchDispatchMessage(entry, dispatchBatchEntry(entry, depsReturning({
            success: false,
            info: ['No level carries a slab — a grid needs a plate to sit on.'],
        })));
        expect(indet).not.toBe(refused);
        expect(refused).toMatch(/^Couldn't run/);
    });

    it('a refusal keeps the engine\'s reason and never becomes a generic default', () => {
        const r = dispatchBatchEntry(entry, depsReturning({
            success: false,
            info: ['No level carries a slab — a grid needs a plate to sit on.'],
        }));
        expect(r.ok).toBe(false);
        const msg = renderBatchDispatchMessage(entry, r);
        expect(msg).toContain('No level carries a slab');
        expect(msg).not.toMatch(/Batch command failed/);
    });
});
