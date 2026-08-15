/**
 * §REFUSAL-IDENTITY (GE-09, C58 §1.13 / §1.13.8) — the ORCHESTRATOR seams, EXECUTED.
 *
 * Companion to batchChildRefusalIdentity.test.ts (the five BATCH families: doors,
 * windows, ceilings, slabs, walls). Those pin `child → batch → reason/info`. This
 * file pins the orchestrating seams that are NOT batch commands, and which that
 * file's own header named as still baseline-listed.
 *
 * ⚠ HONEST SCOPE OF *THIS* FILE, stated because the draft this was banked from
 * over-claimed it (it listed three seams and executed one): the arms below execute
 * ONLY `ImportProjectCommand` and the shared renderer. `UpdateElementParameterCommand`
 * and `CommandManagerImpl` were paid at source by the same work, but their arms are
 * NOT here — do not read this header as evidence for them.
 *
 * The arms are the same five the walls family established (499549a8):
 *
 *   · VERBATIM at execute        — a child that STATES its reason has that sentence
 *                                  reach the user-facing channel untouched;
 *   · VERBATIM at canExecute     — the same, at the validation seam;
 *   · SILENT at canExecute       — a reason-less refusal arrives as
 *                                  [REFUSED_WITHOUT_REASON] + the validator's name +
 *                                  the subject, NEVER as the manufactured verdict
 *                                  ('Sub-command validation failed', 'Parameter
 *                                  validation failed', 'Validation failed');
 *   · SILENT at the EXECUTE seam — a child whose execute() returns success:false
 *                                  carrying NO error and NO info is named, not 'failed';
 *   · SILENCE CONTROL            — a fully-LEGAL gesture produces NO refusal line and
 *                                  NO absence marker. A validator that cries wolf on a
 *                                  correct gesture gets muted, and a muted validator is
 *                                  worse than none.
 *
 * Honest scope, stated rather than implied:
 *   · ImportProjectCommand is driven through `_makeHelpers(ctx)` — the PRODUCTION
 *     factory, not a re-implementation of it. Its own doc-block records that the
 *     synchronous `execute()` and the chunked `executeChunked()` drivers share it so
 *     the two run BYTE-IDENTICAL per-element semantics, so pinning the factory pins
 *     both drivers. What is NOT claimed here is the full project-load integration
 *     (that needs a BimManager + every element store) — only the refusal rendering.
 *   · The VERBATIM arms use a REAL sub-command (AddLevelCommand, one of the ~20
 *     ImportProjectCommand actually runs) refusing with its own real sentence. The
 *     SILENT arms necessarily use controlled stubs: no shipped child is silent today,
 *     and the marker exists to make the FIRST one that goes quiet visible instead of
 *     invisible.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ImportProjectCommand } from '../src/project/ImportProjectCommand';
import { AddLevelCommand } from '../src/levels/AddLevelCommand';
import { childRefusalText, REFUSED_WITHOUT_REASON_CODE } from '../src/refusal/childRefusalText';
import { CommandType } from '../src/types';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

const MARKER = `[${REFUSED_WITHOUT_REASON_CODE}]`;

/**
 * The manufactured verdicts this lane retires. No refusal line may equal one of
 * these, because each reads as information about the ELEMENT while carrying only
 * the fact that some validator said nothing.
 */
const MANUFACTURED = [
    'Sub-command validation failed',
    'Parameter validation failed',
    'Validation failed',
    'failed',
    'refused',
];

const expectNotManufactured = (line: string): void => {
    for (const verdict of MANUFACTURED) expect(line).not.toBe(verdict);
};

// ─── the shared renderer, at THIS lane's call shape ──────────────────────────

describe('childRefusalText — orchestrator seams use the same ONE renderer (GE-09)', () => {
    it('a STATED reason passes through VERBATIM — the seam adds and drops nothing', () => {
        const stated = 'Elevation must be a valid number.';
        expect(childRefusalText(stated, 'AddLevelCommand.canExecute', 'element lvl-1')).toBe(stated);
    });

    it('an ABSENT reason is NAMED, carrying code + validator + subject', () => {
        for (const silent of [undefined, '', '   ']) {
            const text = childRefusalText(silent, 'AddLevelCommand.canExecute', 'element lvl-1');
            expect(text).toContain(MARKER);
            expect(text).toContain('AddLevelCommand.canExecute');
            expect(text).toContain('element lvl-1');
            expectNotManufactured(text);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT — ImportProjectCommand's sub-command runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The minimum a sub-command's `canExecute` reads. AddLevelCommand asks
 * `context.stores.wallStore.getLevels()` and nothing else, so an empty level list
 * is a sufficient — and honest — world for the validation seam.
 */
const importCtx = (): CommandContext => ({
    stores: { wallStore: { getLevels: () => [] } },
} as unknown as CommandContext);

/** A sub-command under our control, so a SILENCE can actually be produced. */
const stubSub = (opts: {
    id: string;
    validation: CommandValidationResult;
    result?: CommandResult;
}): Command => ({
    id: opts.id,
    type: CommandType.CREATE_WALL,
    timestamp: 0,
    targetIds: [opts.id],
    affectedStores: ['wall'],
    canExecute: () => opts.validation,
    execute: () => opts.result ?? { success: true, affectedElementIds: [opts.id] },
    undo: () => ({ success: true, affectedElementIds: [] }),
    serialize: () => ({ type: CommandType.CREATE_WALL, payload: {}, targetIds: [opts.id], timestamp: 0, version: 1 }),
} as unknown as Command);

/** Reach the PRODUCTION helper factory both import drivers share. */
const helpers = (): { runSub: (c: Command) => CommandResult; recordFail: (l: string, r: CommandResult) => void } => {
    const cmd = new ImportProjectCommand({ levels: [] } as never);
    return (cmd as unknown as {
        _makeHelpers(ctx: CommandContext): {
            runSub: (c: Command) => CommandResult;
            recordFail: (l: string, r: CommandResult) => void;
        };
    })._makeHelpers(importCtx());
};

describe('ImportProjectCommand — sub-command refusals keep their identity (GE-09)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('VERBATIM at canExecute: a REAL sub-command\'s own sentence reaches info untouched', () => {
        const { runSub } = helpers();
        // A real AddLevelCommand, refusing for a real reason it states itself.
        const real = new AddLevelCommand({ levelId: 'ge09-lvl-1', elevation: NaN, name: 'L1', height: 3 });
        const r = runSub(real);

        expect(r.success).toBe(false);
        expect(r.info?.[0]).toBe('Elevation must be a valid number.');
        expect(r.info?.[0]).not.toContain(MARKER);
    });

    it('VERBATIM at execute: a stated refusal survives the recordFail fold into stats.errors', () => {
        const cmd = new ImportProjectCommand({ levels: [] } as never);
        const { recordFail } = (cmd as unknown as {
            _makeHelpers(ctx: CommandContext): { recordFail: (l: string, r: CommandResult) => void };
        })._makeHelpers(importCtx());

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        recordFail('wall w-7', {
            success: false,
            affectedElementIds: [],
            info: ['[OCC_OVERLAPS_SIBLING] overlaps opening op-b (3.400–3.600)'],
        });

        const line = cmd.stats.errors[0]!;
        expect(line).toContain('[OCC_OVERLAPS_SIBLING] overlaps opening op-b (3.400–3.600)');
        expect(line).not.toContain(MARKER);
    });

    it('SILENT at canExecute: a reason-less refusal arrives NAMED, not "Sub-command validation failed"', () => {
        const { runSub } = helpers();
        const silent = stubSub({ id: 'ge09-sub-silent', validation: { ok: false } });
        const r = runSub(silent);

        expect(r.success).toBe(false);
        const line = r.info?.[0] ?? '';
        expect(line).toContain(MARKER);
        expect(line).toContain('.canExecute');
        expect(line).toContain('ge09-sub-silent'); // the SUBJECT stays attributable
        expectNotManufactured(line);
        expect(line).not.toContain('Sub-command validation failed');
    });

    it('SILENT at the EXECUTE seam: a child failing with NO error and NO info is named, not "failed"', () => {
        const cmd = new ImportProjectCommand({ levels: [] } as never);
        const { recordFail } = (cmd as unknown as {
            _makeHelpers(ctx: CommandContext): { recordFail: (l: string, r: CommandResult) => void };
        })._makeHelpers(importCtx());

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Both shapes of silence: no info key at all, and an EMPTY info array —
        // the second is the one `?? 'failed'` could never have caught, because ''
        // is not nullish and would have shipped a BLANK reason to the user.
        recordFail('slab s-3', { success: false, affectedElementIds: [] });
        recordFail('slab s-4', { success: false, affectedElementIds: [], info: [] });

        for (const line of cmd.stats.errors) {
            expect(line).toContain(MARKER);
            expect(line).toContain('ImportProjectCommand.runSub');
            expect(line).not.toContain(': failed');
            expect(line.trim()).not.toMatch(/:\s*$/); // never a blank verdict
        }
        expect(cmd.stats.failed).toBe(2);
    });

    it('SEAM 3: the ClearProjectCommand step no longer relabels a STATED refusal as "unknown"', () => {
        // The seam that would have DEFEATED seam 1. `_orchestrate` step 0 used to read
        // `clearResult.error` ONLY — and `runSub` reports a validation refusal in
        // `info`, never in `error` — so a stated reason arrived as the word 'unknown'
        // and the whole project load aborted naming nothing. Driven through the REAL
        // private generator with a controlled `runSub`, so step 0 is the only step reached.
        const cmd = new ImportProjectCommand({ levels: [] } as never);
        const gen = (cmd as unknown as {
            _orchestrate(
                ctx: CommandContext,
                runSub: (c: Command) => CommandResult,
                recordFail: (l: string, r: CommandResult) => void,
            ): Generator<void, CommandResult, void>;
        })._orchestrate(
            importCtx(),
            () => ({ success: false, affectedElementIds: [], info: ['project is read-only for this collaborator'] }),
            () => {},
        );

        const first = gen.next();
        expect(first.done).toBe(true);
        const out = first.value as CommandResult;
        expect(out.success).toBe(false);
        expect(out.error).toContain('project is read-only for this collaborator');
        expect(out.error).not.toContain('unknown');
        expect(cmd.stats.errors[0]).toContain('project is read-only for this collaborator');
    });

    it('SILENCE CONTROL: a fully-legal sub-command produces NO refusal line and NO absence marker', () => {
        const cmd = new ImportProjectCommand({ levels: [] } as never);
        const { runSub } = (cmd as unknown as {
            _makeHelpers(ctx: CommandContext): { runSub: (c: Command) => CommandResult };
        })._makeHelpers(importCtx());

        const legal = stubSub({ id: 'ge09-sub-ok', validation: { ok: true } });
        const r = runSub(legal);

        expect(r.success).toBe(true);
        expect(JSON.stringify(r)).not.toContain(REFUSED_WITHOUT_REASON_CODE);
        expect(cmd.stats.errors).toHaveLength(0);
        expect(cmd.stats.failed).toBe(0);
    });
});
