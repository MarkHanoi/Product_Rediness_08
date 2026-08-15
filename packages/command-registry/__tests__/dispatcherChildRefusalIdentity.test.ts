/**
 * §REFUSAL-IDENTITY (GE-09, C58 §1.13 / §1.13.8) — the DISPATCHER and the GENERIC
 * PARAMETER WRITE, EXECUTED.
 *
 * WHY THIS FILE EXISTS SEPARATELY. `orchestratorChildRefusalIdentity.test.ts` was
 * banked with a header naming three seams and arms for one. Two baseline rows were
 * struck for source fixes that no test executed — which is the shape of a paid
 * finding nobody can prove stayed paid. These are those arms:
 *
 *   · CommandManagerImpl            — the WIDEST refusal seam in the product. Every
 *                                     command in the app passes through this
 *                                     dispatcher, so the manufactured
 *                                     'Validation failed' it emitted was the single
 *                                     most-rendered laundered refusal in PRYZM.
 *   · UpdateElementParameterCommand — the generic parameter write, which is how
 *                                     the property panel and collaboration replay
 *                                     actually reach a store.
 *
 * The arms are the five the walls family established (499549a8):
 *
 *   · VERBATIM at canExecute     — a child that STATES its reason has that sentence
 *                                  reach the user-facing channel untouched;
 *   · VERBATIM through a REAL validator — not only through a stub;
 *   · SILENT                     — a reason-less refusal arrives as
 *                                  [REFUSED_WITHOUT_REASON] + the validator's name +
 *                                  the subject, NEVER as 'Validation failed' /
 *                                  'Parameter validation failed';
 *   · DRIVER PARITY              — `execute` and `executeChunked` must not disagree
 *                                  about what the SAME refusal says. They silently
 *                                  did: the chunked driver read `reason` only, so a
 *                                  command whose human sentence lived in
 *                                  `blockingIssues` rendered its machine TOKEN on the
 *                                  load path and its SENTENCE on the interactive one;
 *   · SILENCE CONTROL            — a fully-LEGAL gesture produces NO refusal line and
 *                                  NO absence marker. A validator that cries wolf on a
 *                                  correct gesture gets muted, and a muted validator is
 *                                  worse than none.
 *
 * Honest scope: these arms pin the REFUSAL RENDERING at these seams. They do not
 * claim anything about snapshot, undo, or the post-command fan-out — a refusal
 * returns before any of that runs, which is precisely why a minimal context suffices.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { UpdateElementParameterCommand } from '../src/generic/UpdateElementParameterCommand';
import { REFUSED_WITHOUT_REASON_CODE } from '../src/refusal/childRefusalText';
import { CommandType } from '../src/types';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

const MARKER = `[${REFUSED_WITHOUT_REASON_CODE}]`;

/**
 * The manufactured verdicts this lane retires. Each reads as information about the
 * ELEMENT while carrying only the fact that some validator said nothing.
 */
const MANUFACTURED = ['Validation failed', 'Parameter validation failed', 'failed', 'refused'];
const expectNotManufactured = (line: string): void => {
    for (const verdict of MANUFACTURED) expect(line).not.toBe(verdict);
};

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER — CommandManagerImpl
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A refusal returns before any store is touched, so the refusal arms need no world
 * at all. The SILENCE CONTROL arm does: passing validation is exactly what lets the
 * dispatcher reach its scoped snapshot (Contract 01 §2.2), and `affectedStores:
 * ['wall']` makes it clone `wallStore.getAll()`. An empty wall store is the smallest
 * honest world in which a legal command actually completes.
 */
const dispatcherCtx = (): CommandContext => ({
    stores: { wallStore: { getAll: () => [], getById: () => undefined, restoreSnapshot: () => {} } },
} as unknown as CommandContext);

/**
 * A command under our control, so a SILENCE can actually be produced. Declared as a
 * real CLASS, not an object literal — `commandIdentity()` prefers the constructor
 * name over `type` precisely because the class name is what a reader greps for, and
 * an object literal would report 'Object', which names nothing.
 */
class SilentRefusingCommand implements Partial<Command> {
    readonly id = 'ge09-cm-silent';
    readonly type = CommandType.UPDATE_WALL;
    readonly timestamp = 0;
    readonly targetIds = ['w-silent-1'];
    readonly affectedStores = ['wall'];
    constructor(private readonly validation: CommandValidationResult) {}
    canExecute(): CommandValidationResult { return this.validation; }
    execute(): CommandResult { return { success: true, affectedElementIds: this.targetIds }; }
    undo(): CommandResult { return { success: true, affectedElementIds: [] }; }
    serialize() { return { type: this.type, payload: {}, targetIds: this.targetIds, timestamp: 0, version: 1 }; }
}

/** The same shape, but with an `executeChunked` — the PROJECT_LOAD driver. */
class SilentRefusingChunkedCommand extends SilentRefusingCommand {
    async executeChunked(): Promise<CommandResult> {
        return { success: true, affectedElementIds: ['w-silent-1'] };
    }
}

const makeCommand = (v: CommandValidationResult): Command =>
    new SilentRefusingCommand(v) as unknown as Command;

describe('CommandManagerImpl — the widest refusal seam keeps its identity (GE-09)', () => {
    afterEach(() => vi.restoreAllMocks());

    const mgr = () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        return new CommandManager(dispatcherCtx());
    };

    it('VERBATIM: the L-813 blockingIssues sentence reaches info[0] untouched', () => {
        const stated = 'Walls are parallel — no intersection exists';
        const r = mgr().execute(makeCommand({ ok: false, reason: 'WALLS_PARALLEL', blockingIssues: [stated] } as CommandValidationResult));

        expect(r.success).toBe(false);
        expect(r.info?.[0]).toBe(stated);
        expect(r.info?.[0]).not.toContain(MARKER);
    });

    it('VERBATIM: a command stating only `reason` still passes through unchanged', () => {
        const r = mgr().execute(makeCommand({ ok: false, reason: 'Wall w-silent-1 is locked by another collaborator.' }));

        expect(r.info?.[0]).toBe('Wall w-silent-1 is locked by another collaborator.');
        expect(r.info?.[0]).not.toContain(MARKER);
    });

    it('SILENT: a reason-less refusal is NAMED, never "Validation failed"', () => {
        const r = mgr().execute(makeCommand({ ok: false }));

        const line = r.info?.[0] ?? '';
        expect(line).toContain(MARKER);
        // the CLASS name, not the type token — the string a reader can grep for
        expect(line).toContain('SilentRefusingCommand.canExecute');
        expect(line).toContain('w-silent-1'); // the SUBJECT stays attributable
        expectNotManufactured(line);
        expect(line).not.toContain('Validation failed');
    });

    it('SILENT: a blank-string reason counts as silence, not as a stated blank reason', () => {
        // `|| ` would pass '' through as a "reason"; the shared renderer trims and
        // treats it as the absence it is. A blank line on a user's screen is the
        // worst of both — it neither explains nor announces that nothing explained.
        const r = mgr().execute(makeCommand({ ok: false, reason: '   ' }));

        expect(r.info?.[0]).toContain(MARKER);
        expect(r.info?.[0]?.trim()).not.toBe('');
    });

    it('DRIVER PARITY: executeChunked renders the SAME refusal as execute — including blockingIssues', async () => {
        const stated = 'Walls are parallel — no intersection exists';
        const v = { ok: false, reason: 'WALLS_PARALLEL', blockingIssues: [stated] } as CommandValidationResult;

        const sync = mgr().execute(new SilentRefusingCommand(v) as unknown as Command);
        const chunked = await mgr().executeChunked(
            new SilentRefusingChunkedCommand(v) as unknown as Parameters<CommandManager['executeChunked']>[0],
            async () => {},
        );

        // The bug this pins: the chunked driver read `reason` only, so it shipped
        // the machine token 'WALLS_PARALLEL' while execute() shipped the sentence.
        expect(chunked.info?.[0]).toBe(stated);
        expect(chunked.info?.[0]).toBe(sync.info?.[0]);
    });

    it('DRIVER PARITY: executeChunked names a SILENT refusal too', async () => {
        const r = await mgr().executeChunked(
            new SilentRefusingChunkedCommand({ ok: false }) as unknown as Parameters<CommandManager['executeChunked']>[0],
            async () => {},
        );

        expect(r.info?.[0]).toContain(MARKER);
        expect(r.info?.[0]).toContain('.canExecute');
        expectNotManufactured(r.info?.[0] ?? '');
    });

    it('SILENCE CONTROL: a fully-legal command produces NO refusal line and NO absence marker', () => {
        const r = mgr().execute(makeCommand({ ok: true }));

        expect(r.success).toBe(true);
        expect(JSON.stringify(r)).not.toContain(REFUSED_WITHOUT_REASON_CODE);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC PARAMETER WRITE — UpdateElementParameterCommand
// ─────────────────────────────────────────────────────────────────────────────

const paramCtx = (wall: Record<string, unknown> | null): CommandContext => ({
    stores: {
        wallStore: {
            getById: (id: string) => (wall && wall['id'] === id ? wall : undefined),
            update: () => {},
        },
    },
} as unknown as CommandContext);

const plainWall = () => ({ id: 'w-param-1', height: 2.7, thickness: 0.2, openings: [], layers: undefined, curve: undefined });

describe('UpdateElementParameterCommand — validator refusals keep their identity (GE-09)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('VERBATIM through the REAL validateParameters: its own sentence reaches info[0]', () => {
        const cmd = new UpdateElementParameterCommand({ elementId: 'w-param-1', elementType: 'wall', parameters: { height: -1 } });
        const r = cmd.execute(paramCtx(plainWall()));

        expect(r.success).toBe(false);
        expect(r.info?.[0]).toBe('Height must be ≥ 0');
        expect(r.info?.[0]).not.toContain(MARKER);
    });

    it('SILENT: an under-reporting validateParameters is NAMED, never "Parameter validation failed"', () => {
        // No shipped branch of validateParameters is silent today. The marker exists
        // to make the FIRST one that goes quiet visible instead of invisible, so the
        // silence has to be induced.
        const cmd = new UpdateElementParameterCommand({ elementId: 'w-param-1', elementType: 'wall', parameters: { height: 3 } });
        vi.spyOn(cmd as unknown as { validateParameters(p: unknown, t: string): CommandValidationResult }, 'validateParameters')
            .mockReturnValue({ ok: false });

        const r = cmd.execute(paramCtx(plainWall()));

        const line = r.info?.[0] ?? '';
        expect(line).toContain(MARKER);
        expect(line).toContain('UpdateElementParameterCommand.validateParameters');
        expect(line).toContain('w-param-1'); // subject: elementType/elementId
        expectNotManufactured(line);
        expect(line).not.toContain('Parameter validation failed');
    });

    it('VERBATIM at canExecute: the rake gate\'s own sentence survives, prefixed but not replaced', () => {
        // rakeAuthorability is @pryzm/geometry-wall's — a validator this command
        // orchestrates but does not own. A LAYERED wall makes it refuse for real.
        const layered = { ...plainWall(), layers: [{ thickness: 0.1 }, { thickness: 0.1 }] };
        const cmd = new UpdateElementParameterCommand({ elementId: 'w-param-1', elementType: 'wall', parameters: { rakeAngleDeg: 12 } });
        const v = cmd.canExecute(paramCtx(layered));

        expect(v.ok).toBe(false);
        expect(v.reason).toContain('This wall can\'t be angled (raked)');
        // the OWNING validator's sentence, not a restatement of the refusal's premise
        expect(v.reason).not.toContain('the rake is not authorable on this wall.');
        expect(v.reason).not.toContain(MARKER);
    });

    it('SILENCE CONTROL: a legal parameter write produces NO refusal line and NO absence marker', () => {
        const cmd = new UpdateElementParameterCommand({ elementId: 'w-param-1', elementType: 'wall', parameters: { height: 3 } });
        const v = cmd.canExecute(paramCtx(plainWall()));
        const r = cmd.execute(paramCtx(plainWall()));

        expect(v.ok).toBe(true);
        expect(JSON.stringify(v)).not.toContain(REFUSED_WITHOUT_REASON_CODE);
        expect(JSON.stringify(r)).not.toContain(REFUSED_WITHOUT_REASON_CODE);
    });
});
