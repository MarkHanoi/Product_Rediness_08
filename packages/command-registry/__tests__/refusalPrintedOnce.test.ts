/**
 * §REFUSAL-PRINTED-TWICE (L-1016) — the refusal sentence was logged twice.
 *
 * FOUNDER (prod 2026-08-18), one line, one refusal:
 *
 *   [CommandManager] REFUSED CREATE_FLOORS_BY_ROOM_TYPE: Every room on this level
 *   has a type that takes no floor finish (…) — there is nothing here to floor.
 *   — Every room on this level has a type that takes no floor finish (…)
 *
 * Not a copy-paste. Two REAL fields that usually hold the same string:
 * `validation.reason`, and `childRefusalText(blockingIssues[0] || reason, …)`,
 * which returns `stated.trim()` VERBATIM when non-empty. A command that sets
 * `reason` and no `blockingIssues` therefore renders identical halves.
 *
 * The fix is a comparison, NOT a deletion, because the halves genuinely differ in
 * the two cases that matter and both must survive:
 *   • L-813 — the human sentence lives in `blockingIssues[0]` while `reason`
 *     carries the machine token an operator greps for;
 *   • GE-09 — the command refused stating NOTHING, so `_human` is the named
 *     REFUSED_WITHOUT_REASON attribution and must not be swallowed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { childRefusalText } from '../src/refusal/childRefusalText.js';

/** The exact rendering rule at the CommandManagerImpl refusal log site. */
function renderRefusalLog(validation: { reason?: string; blockingIssues?: string[] }, type: string): string {
    const stated = validation.blockingIssues?.[0] || validation.reason;
    const human = childRefusalText(stated, `${type}.canExecute`, 'the element');
    const rawReason = validation.reason?.trim();
    return `[CommandManager] REFUSED ${type}: ${validation.reason ?? 'unspecified'}`
        + (human && human !== rawReason ? ` — ${human}` : '');
}

describe('§REFUSAL-PRINTED-TWICE (L-1016)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('THE FOUNDER CASE: reason with no blockingIssues prints the sentence ONCE', () => {
        const sentence =
            'Every room on this level has a type that takes no floor finish — there is nothing here to floor.';
        const line = renderRefusalLog({ reason: sentence }, 'CREATE_FLOORS_BY_ROOM_TYPE');
        // The sentence appears exactly once.
        expect(line.split(sentence).length - 1).toBe(1);
        expect(line).not.toContain(`${sentence} — ${sentence}`);
    });

    it('L-813 SURVIVES: a machine token in reason AND a human sentence in blockingIssues both print', () => {
        const line = renderRefusalLog(
            { reason: 'WALLS_PARALLEL', blockingIssues: ['Walls are parallel — no intersection exists.'] },
            'JOIN_WALLS',
        );
        expect(line).toContain('WALLS_PARALLEL');
        expect(line).toContain('Walls are parallel — no intersection exists.');
    });

    it('GE-09 SURVIVES: a command that states nothing is still named as the defect', () => {
        const line = renderRefusalLog({}, 'SOME_QUIET_COMMAND');
        expect(line).toContain('unspecified');
        expect(line).toContain('without stating a reason');
        expect(line).toContain('SOME_QUIET_COMMAND.canExecute');
    });

    it('whitespace-only difference is not a difference', () => {
        const line = renderRefusalLog({ reason: '  Nothing to do here.  ' }, 'X');
        expect(line.split('Nothing to do here.').length - 1).toBe(1);
    });

    it('blockingIssues identical to reason also prints once', () => {
        const s = 'Same sentence in both fields.';
        const line = renderRefusalLog({ reason: s, blockingIssues: [s] }, 'X');
        expect(line.split(s).length - 1).toBe(1);
    });
});
