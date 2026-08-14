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
import { UpdateDoorsSystemTypeBatchCommand } from '../src/doors/UpdateDoorsSystemTypeBatchCommand';
import { UpdateDoorSystemTypeCommand } from '../src/doors/UpdateDoorSystemTypeCommand';
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
