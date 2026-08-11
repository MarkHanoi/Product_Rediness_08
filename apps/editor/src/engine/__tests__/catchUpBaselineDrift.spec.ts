// §FIX-REPLAY-AT-MOST-ONCE (L-814) — the reconnect baseline must be SERVER time.
//
// The `lastSync` baseline is sent as `?since=` and compared server-side against
// `project_command_log.created_at`. The old code stamped it from the CLIENT clock
// on every live command and in `_triggerCatchUp`'s `finally`. That is not a
// rounding error — it does not self-correct:
//
//   • client BEHIND server → the baseline never passes rows already held, so every
//     reconnect re-requests the SAME window. With the missing own-origin filter,
//     that is the founder's model mutating itself while the tab sleeps and wakes.
//   • client AHEAD of server → a peer's real edits are silently skipped.
//
// These specs pin the baseline to server-supplied values only.

import { describe, it, expect } from 'vitest';
import { nextCatchUpBaseline } from '../initCollaboration';

const T1 = '2026-08-10T10:00:00.000Z';
const T2 = '2026-08-10T10:05:00.000Z';
const T3 = '2026-08-10T10:09:00.000Z';

describe('§FIX-REPLAY-AT-MOST-ONCE — catch-up baseline advancement', () => {
    it('advances to the NEWEST created_at actually received — so that window is never re-requested', () => {
        const next = nextCatchUpBaseline(T1, {
            commands: [{ created_at: T2 }, { created_at: T3 }, { created_at: T2 }],
            serverNow: '2026-08-10T10:10:00.000Z',
        });
        // The newest ROW wins over serverNow: a row could land between the query
        // and the response, and advancing past it would lose a peer's edit.
        expect(next).toBe(T3);
    });

    it('advances to the server clock when the window is EMPTY — an idle reconnect still makes progress', () => {
        expect(nextCatchUpBaseline(T1, { commands: [], serverNow: T2 })).toBe(T2);
    });

    it('KEEPS the previous baseline when the server offers nothing — never guesses, never uses the client clock', () => {
        expect(nextCatchUpBaseline(T1, {})).toBe(T1);
        expect(nextCatchUpBaseline(T1, { commands: [] })).toBe(T1);
        expect(nextCatchUpBaseline(T1, { commands: [{}], serverNow: '' })).toBe(T1);
        expect(nextCatchUpBaseline(null, {})).toBeNull();
    });

    it('is MONOTONIC across a BFCache sleep/wake cycle — the already-applied window is not re-requested', () => {
        // Wake 1: two peer commands arrive.
        let baseline: string | null = T1;
        baseline = nextCatchUpBaseline(baseline, { commands: [{ created_at: T2 }], serverNow: T2 });
        expect(baseline).toBe(T2);

        // Tab sleeps → `transport close` → wakes → reconnect → catch-up again.
        // The server, asked `since=T2`, now returns nothing: the client already
        // has everything. The baseline must move FORWARD, never back to T1.
        baseline = nextCatchUpBaseline(baseline, { commands: [], serverNow: T3 });
        expect(baseline).toBe(T3);

        // A third bounce with a degraded/partial response must not rewind either.
        baseline = nextCatchUpBaseline(baseline, {});
        expect(baseline).toBe(T3);
    });

    it('never returns a CLIENT-clock value — the output is always a value the server supplied (or the previous one)', () => {
        const serverValues = new Set([T2, T3]);
        const out = nextCatchUpBaseline(T1, { commands: [{ created_at: T2 }], serverNow: T3 });
        expect(serverValues.has(out as string) || out === T1).toBe(true);
    });

    it('tolerates malformed rows without throwing — a corrupt row must not stall the reconnect loop', () => {
        expect(nextCatchUpBaseline(T1, {
            commands: [{}, { created_at: undefined }, { created_at: T2 }] as any,
        })).toBe(T2);
        expect(nextCatchUpBaseline(T1, { commands: undefined, serverNow: undefined })).toBe(T1);
    });
});
