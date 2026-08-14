/**
 * §REFUSAL-IDENTITY (GE-09v2, C58 §1.13 / §1.13.8) — the BATCH aggregation seam,
 * EXECUTED. Companion to canPlaceRefusalIdentity.test.ts (the OCC_* family).
 *
 * What this proves, per batch family: the batch commands no longer manufacture a
 * refusal sentence (`v.reason ?? 'refused'`) out of a child validator's silence.
 * Three arms each, all driven through the REAL command against the REAL module
 * stores, asserting on the strings that reach the user-facing channel
 * (CommandValidationResult.reason / warnings, and CommandResult.info — the lines
 * the RAC chat and toast surfaces render):
 *
 *   · VERBATIM   — a child that STATES its reason has it arrive untouched;
 *   · SILENT     — a child that refuses WITHOUT a reason arrives as
 *                  [REFUSED_WITHOUT_REASON] + the validator's name + the subject,
 *                  never as an invented verdict ('refused');
 *   · SILENCE CONTROL (80e72a75 discipline) — a fully-legal batch produces NO
 *                  refusal line at all: no roster lines, no absence marker. A
 *                  validator that cries wolf on a correct gesture gets muted,
 *                  and a muted validator is worse than none.
 *
 * Honest scope: this pins the aggregation seam (child → batch → reason/info).
 * The hop from CommandResult.info to the DOM is CommandManagerImpl's generic
 * surface, still baseline-listed in check-refusal-identity — not claimed here.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { UpdateDoorsSystemTypeBatchCommand } from '../src/doors/UpdateDoorsSystemTypeBatchCommand';
import { UpdateDoorSystemTypeCommand } from '../src/doors/UpdateDoorSystemTypeCommand';
import { UpdateWindowsSystemTypeBatchCommand } from '../src/windows/UpdateWindowsSystemTypeBatchCommand';
import { UpdateWindowSystemTypeCommand } from '../src/windows/UpdateWindowSystemTypeCommand';
import { UpdateCeilingsSystemTypeBatchCommand } from '../src/ceilings/UpdateCeilingsSystemTypeBatchCommand';
import { UpdateCeilingLayersCommand } from '../src/ceilings/UpdateCeilingLayersCommand';
import { UpdateSlabsSystemTypeBatchCommand } from '../src/slabs/UpdateSlabsSystemTypeBatchCommand';
import { UpdateSlabLayersCommand } from '../src/slabs/UpdateSlabLayersCommand';
import { childRefusalText, REFUSED_WITHOUT_REASON_CODE } from '../src/refusal/childRefusalText';
import type { CommandContext } from '../src/types';

const ctx = {} as unknown as CommandContext; // these commands own their store access

const MARKER = `[${REFUSED_WITHOUT_REASON_CODE}]`;

// ─── the shared renderer itself ──────────────────────────────────────────────

describe('childRefusalText — the ONE renderer for a child refusal (GE-09)', () => {
    it('a STATED reason passes through VERBATIM — the seam adds and drops nothing', () => {
        const stated = '[OCC_OVERLAPS_SIBLING] overlaps opening op-b (3.400–3.600)';
        expect(childRefusalText(stated, 'Whatever.canExecute', 'door d1')).toBe(stated);
    });

    it('an ABSENT reason is NAMED as an absence, carrying code + validator + subject', () => {
        for (const silent of [undefined, '', '   ']) {
            const text = childRefusalText(silent, 'UpdateDoorSystemTypeCommand.canExecute', 'door d1');
            expect(text).toContain(MARKER);
            expect(text).toContain('UpdateDoorSystemTypeCommand.canExecute');
            expect(text).toContain('door d1');
            // The manufactured verdicts this replaces must be gone: the string
            // attributes a SILENCE, it does not impersonate an explanation.
            expect(text).not.toBe('refused');
        }
    });
});

// ─── doors: UpdateDoorsSystemTypeBatchCommand ────────────────────────────────

describe('UpdateDoorsSystemTypeBatchCommand — child refusals keep their identity (GE-09)', () => {
    const D1 = 'ge09-door-1';
    const GHOST = 'ge09-door-ghost';

    const typeId = (): string => doorSystemTypeStore.getAll()[0]!.id;

    beforeEach(() => {
        if (doorStore.has(D1)) doorStore.remove(D1);
        doorStore.add({
            id: D1, openingId: 'ge09-op-1', wallId: 'ge09-wall-1',
            offset: 1, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single',
        } as never);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (doorStore.has(D1)) doorStore.remove(D1);
    });

    it('VERBATIM: a child that states its reason has it reach CommandResult.info untouched', () => {
        const cmd = new UpdateDoorsSystemTypeBatchCommand({ doorIds: [D1, GHOST], systemType: typeId() });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        const info = (r.info ?? []).join('\n');
        // The child's OWN sentence, verbatim inside the grouped roster line.
        expect(info).toContain(`Door ${GHOST} not found`);
        // Nothing manufactured alongside it.
        expect(info).not.toContain(MARKER);
        expect(cmd.skipped.map(s => s.reason).join('\n')).toContain(`Door ${GHOST} not found`);
    });

    it('VERBATIM at canExecute: an all-refused batch surfaces the child sentence in .reason', () => {
        const cmd = new UpdateDoorsSystemTypeBatchCommand({ doorIds: [GHOST], systemType: typeId() });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(`Door ${GHOST} not found`);
    });

    it('SILENT child: a reason-less refusal arrives NAMED, not paraphrased as "refused"', () => {
        vi.spyOn(UpdateDoorSystemTypeCommand.prototype, 'canExecute')
            .mockReturnValue({ ok: false }); // the silence this seam used to paper over
        const cmd = new UpdateDoorsSystemTypeBatchCommand({ doorIds: [D1], systemType: typeId() });

        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(MARKER);
        expect(v.reason).toContain('UpdateDoorSystemTypeCommand.canExecute');
        expect(v.reason).toContain(`door ${D1}`);

        const r = cmd.execute(ctx);
        expect(r.success).toBe(false);
        const info = (r.info ?? []).join('\n');
        expect(info).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).not.toBe('refused');
    });

    it('SILENCE CONTROL: a fully-legal batch renders NO refusal line and NO absence marker', () => {
        const cmd = new UpdateDoorsSystemTypeBatchCommand({ doorIds: [D1], systemType: typeId() });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings).toBeUndefined();

        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(cmd.skipped).toHaveLength(0);
        const info = (r.info ?? []).join('\n');
        expect(info).not.toContain(MARKER);
        expect(info).not.toContain('skipped');
    });
});

// ─── windows: UpdateWindowsSystemTypeBatchCommand ────────────────────────────
// The doors twin, seam for seam (canExecute roster · execute skip roster · the
// `r.info?.[0]` execute-failure twin). Paid GE-09v3.

describe('UpdateWindowsSystemTypeBatchCommand — child refusals keep their identity (GE-09)', () => {
    const W1 = 'ge09-window-1';
    const GHOST = 'ge09-window-ghost';

    const typeId = (): string => windowSystemTypeStore.getAll()[0]!.id;

    beforeEach(() => {
        if (windowStore.getById(W1)) windowStore.remove(W1);
        windowStore.add({
            id: W1, openingId: 'ge09-wop-1', wallId: 'ge09-wall-1',
            offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single',
        } as never);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (windowStore.getById(W1)) windowStore.remove(W1);
    });

    it('VERBATIM: a child that states its reason has it reach CommandResult.info untouched', () => {
        const cmd = new UpdateWindowsSystemTypeBatchCommand({ windowIds: [W1, GHOST], systemType: typeId() });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        const info = (r.info ?? []).join('\n');
        expect(info).toContain(`Window ${GHOST} not found`);
        expect(info).not.toContain(MARKER);
        expect(cmd.skipped.map(s => s.reason).join('\n')).toContain(`Window ${GHOST} not found`);
    });

    it('VERBATIM at canExecute: an all-refused batch surfaces the child sentence in .reason', () => {
        const cmd = new UpdateWindowsSystemTypeBatchCommand({ windowIds: [GHOST], systemType: typeId() });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(`Window ${GHOST} not found`);
    });

    it('SILENT child: a reason-less refusal arrives NAMED, not paraphrased as "refused"', () => {
        vi.spyOn(UpdateWindowSystemTypeCommand.prototype, 'canExecute')
            .mockReturnValue({ ok: false });
        const cmd = new UpdateWindowsSystemTypeBatchCommand({ windowIds: [W1], systemType: typeId() });

        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(MARKER);
        expect(v.reason).toContain('UpdateWindowSystemTypeCommand.canExecute');
        expect(v.reason).toContain(`window ${W1}`);

        const r = cmd.execute(ctx);
        expect(r.success).toBe(false);
        expect((r.info ?? []).join('\n')).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).not.toBe('refused');
    });

    it('SILENCE CONTROL: a fully-legal batch renders NO refusal line and NO absence marker', () => {
        const cmd = new UpdateWindowsSystemTypeBatchCommand({ windowIds: [W1], systemType: typeId() });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings).toBeUndefined();

        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(cmd.skipped).toHaveLength(0);
        const info = (r.info ?? []).join('\n');
        expect(info).not.toContain(MARKER);
        expect(info).not.toContain('skipped');
    });
});

// ─── ceilings: UpdateCeilingsSystemTypeBatchCommand ──────────────────────────
// Same three seams; this family reaches its stores through `ctx.stores` rather
// than a module singleton, so the context is built here. The fakes are the
// SMALLEST surface the real child command touches — nothing about the refusal
// path is stubbed. Paid GE-09v3.

interface FakeCeiling { id: string; systemTypeId?: string; layers?: unknown[]; boundary: { thickness: number } }

function fakeCeilingCtx(ceilings: FakeCeiling[]): CommandContext {
    const byId = new Map(ceilings.map(c => [c.id, c]));
    const type = {
        id: 'ge09-ceil-type', name: 'GE09 Ceiling', totalThickness: 0.12,
        layers: [{ material: 'gypsum', thickness: 0.12 }],
    };
    return {
        stores: {
            ceilingStore: {
                getAll: () => [...byId.values()],
                getById: (id: string) => byId.get(id),
                has: (id: string) => byId.has(id),
                update: (id: string, patch: Record<string, unknown>) => {
                    const c = byId.get(id);
                    if (!c) return undefined;
                    Object.assign(c, patch);
                    return c;
                },
                remove: (id: string) => byId.delete(id),
                restoreSnapshot: (c: FakeCeiling) => byId.set(c.id, c),
            },
            ceilingSystemTypeStore: {
                getAll: () => [type],
                getById: (id: string) => (id === type.id ? type : undefined),
            },
        },
    } as unknown as CommandContext;
}

describe('UpdateCeilingsSystemTypeBatchCommand — child refusals keep their identity (GE-09)', () => {
    const C1 = 'ge09-ceiling-1';
    const GHOST = 'ge09-ceiling-ghost';
    const TYPE = 'ge09-ceil-type';

    afterEach(() => { vi.restoreAllMocks(); });

    const live = (): FakeCeiling[] => [{ id: C1, boundary: { thickness: 0.1 } }];

    it('VERBATIM: a child that states its reason has it reach CommandResult.info untouched', () => {
        const cctx = fakeCeilingCtx(live());
        const cmd = new UpdateCeilingsSystemTypeBatchCommand({ ceilingIds: [C1, GHOST], systemType: TYPE });
        const r = cmd.execute(cctx);
        expect(r.success).toBe(true);
        const info = (r.info ?? []).join('\n');
        expect(info).toContain(`Ceiling "${GHOST}" not found.`);
        expect(info).not.toContain(MARKER);
        expect(cmd.skipped.map(s => s.reason).join('\n')).toContain(`Ceiling "${GHOST}" not found.`);
    });

    it('VERBATIM at canExecute: an all-refused batch surfaces the child sentence in .reason', () => {
        const cctx = fakeCeilingCtx(live());
        const cmd = new UpdateCeilingsSystemTypeBatchCommand({ ceilingIds: [GHOST], systemType: TYPE });
        const v = cmd.canExecute(cctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(`Ceiling "${GHOST}" not found.`);
    });

    it('SILENT child: a reason-less refusal arrives NAMED, not paraphrased as "refused"', () => {
        vi.spyOn(UpdateCeilingLayersCommand.prototype, 'canExecute').mockReturnValue({ ok: false });
        const cctx = fakeCeilingCtx(live());
        const cmd = new UpdateCeilingsSystemTypeBatchCommand({ ceilingIds: [C1], systemType: TYPE });

        const v = cmd.canExecute(cctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(MARKER);
        expect(v.reason).toContain('UpdateCeilingLayersCommand.canExecute');
        expect(v.reason).toContain(`ceiling ${C1}`);

        const r = cmd.execute(cctx);
        expect(r.success).toBe(false);
        expect((r.info ?? []).join('\n')).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).not.toBe('refused');
    });

    it('SILENCE CONTROL: a fully-legal batch renders NO refusal line and NO absence marker', () => {
        const cctx = fakeCeilingCtx(live());
        const cmd = new UpdateCeilingsSystemTypeBatchCommand({ ceilingIds: [C1], systemType: TYPE });
        const v = cmd.canExecute(cctx);
        expect(v.ok).toBe(true);
        expect(v.warnings).toBeUndefined();

        const r = cmd.execute(cctx);
        expect(r.success).toBe(true);
        expect(cmd.skipped).toHaveLength(0);
        const info = (r.info ?? []).join('\n');
        expect(info).not.toContain(MARKER);
        expect(info).not.toContain('skipped');
    });
});

// ─── slabs: UpdateSlabsSystemTypeBatchCommand ────────────────────────────────
// The ceilings twin (ctx.stores-backed), same three seams. Paid GE-09v3.

interface FakeSlab { id: string; systemTypeId?: string | null; layers?: unknown[]; thickness: number }

function fakeSlabCtx(slabs: FakeSlab[]): CommandContext {
    const byId = new Map(slabs.map(s => [s.id, s]));
    const type = {
        id: 'ge09-slab-type', name: 'GE09 Slab', totalThickness: 0.2,
        layers: [{ material: 'concrete', thickness: 0.2 }],
    };
    return {
        stores: {
            slabStore: {
                getAll: () => [...byId.values()],
                getById: (id: string) => byId.get(id),
                has: (id: string) => byId.has(id),
                update: (id: string, next: Record<string, unknown>) => {
                    const s = byId.get(id);
                    if (!s) return undefined;
                    Object.assign(s, next);
                    return s;
                },
                remove: (id: string) => byId.delete(id),
            },
            slabSystemTypeStore: {
                getAll: () => [type],
                getById: (id: string) => (id === type.id ? type : undefined),
            },
        },
    } as unknown as CommandContext;
}

describe('UpdateSlabsSystemTypeBatchCommand — child refusals keep their identity (GE-09)', () => {
    const S1 = 'ge09-slab-1';
    const GHOST = 'ge09-slab-ghost';
    const TYPE = 'ge09-slab-type';

    afterEach(() => { vi.restoreAllMocks(); });

    const live = (): FakeSlab[] => [{ id: S1, thickness: 0.15 }];

    it('VERBATIM: a child that states its reason has it reach CommandResult.info untouched', () => {
        const sctx = fakeSlabCtx(live());
        const cmd = new UpdateSlabsSystemTypeBatchCommand({ slabIds: [S1, GHOST], systemType: TYPE });
        const r = cmd.execute(sctx);
        expect(r.success).toBe(true);
        const info = (r.info ?? []).join('\n');
        expect(info).toContain(`Slab "${GHOST}" not found`);
        expect(info).not.toContain(MARKER);
        expect(cmd.skipped.map(s => s.reason).join('\n')).toContain(`Slab "${GHOST}" not found`);
    });

    it('VERBATIM at canExecute: an all-refused batch surfaces the child sentence in .reason', () => {
        const sctx = fakeSlabCtx(live());
        const cmd = new UpdateSlabsSystemTypeBatchCommand({ slabIds: [GHOST], systemType: TYPE });
        const v = cmd.canExecute(sctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(`Slab "${GHOST}" not found`);
    });

    it('SILENT child: a reason-less refusal arrives NAMED, not paraphrased as "refused"', () => {
        vi.spyOn(UpdateSlabLayersCommand.prototype, 'canExecute').mockReturnValue({ ok: false });
        const sctx = fakeSlabCtx(live());
        const cmd = new UpdateSlabsSystemTypeBatchCommand({ slabIds: [S1], systemType: TYPE });

        const v = cmd.canExecute(sctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(MARKER);
        expect(v.reason).toContain('UpdateSlabLayersCommand.canExecute');
        expect(v.reason).toContain(`slab ${S1}`);

        const r = cmd.execute(sctx);
        expect(r.success).toBe(false);
        expect((r.info ?? []).join('\n')).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).toContain(MARKER);
        expect(cmd.skipped[0]!.reason).not.toBe('refused');
    });

    it('SILENCE CONTROL: a fully-legal batch renders NO refusal line and NO absence marker', () => {
        const sctx = fakeSlabCtx(live());
        const cmd = new UpdateSlabsSystemTypeBatchCommand({ slabIds: [S1], systemType: TYPE });
        const v = cmd.canExecute(sctx);
        expect(v.ok).toBe(true);
        expect(v.warnings).toBeUndefined();

        const r = cmd.execute(sctx);
        expect(r.success).toBe(true);
        expect(cmd.skipped).toHaveLength(0);
        const info = (r.info ?? []).join('\n');
        expect(info).not.toContain(MARKER);
        expect(info).not.toContain('skipped');
    });
});
