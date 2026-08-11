// §FIX-REPLAY-AT-MOST-ONCE (L-814) — the founder's model must not mutate itself.
//
// REPORTED (production, deploy 10): "I created some walls — then changed them,
// changed all type and some properties — after a while WITHOUT TOUCHING THE
// PROJECT some elements changed: some walls go RAKED, some change TYPE."
//
// ROOT CAUSE these specs pin closed:
//   `RemoteCommandDispatcher.replayCatchUp` has documented "Invariant E-2
//   (local-user filter)" since Phase E.2, but the filter was an OPTIONAL argument
//   and the only production caller (`initCollaboration._triggerCatchUp`) never
//   passed it — while `GET /api/projects/:id/commands` returned every row in the
//   window INCLUDING the caller's own. So every reconnect (and the tab-sleep /
//   BFCache `transport close` cycle produces one unattended) re-executed the
//   user's OWN command history over his live model. Families with an accidental
//   duplicate guard refused loudly (ADD_OPENING → byte-identical span CONFLICT,
//   CREATE_ANNOTATION → "already exists"); families with none silently
//   RE-APPLIED — UPDATE_ELEMENT_PARAMETER (rakeAngleDeg 70/120/140),
//   UPDATE_WALL_SYSTEM_TYPE, UPDATE_DOOR_SYSTEM_TYPE. Those re-applications ARE
//   the founder's spontaneously-raked, spontaneously-retyped walls.
//
// The fix is provenance, not heuristics: every delivery declares WHO produced it
// and WHICH log row it is, and the dispatcher applies it AT MOST ONCE.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The dispatcher's real collaborators pull the whole editor graph; the behaviour
// under test is the GATE in front of them, so they are stubbed at module level.
const created: Array<{ type: string }> = [];
vi.mock('../CommandRegistry', () => ({
    CommandRegistry: {
        create: (s: { type: string }) => {
            created.push(s);
            return { type: s.type, payload: (s as { payload?: unknown }).payload };
        },
    },
}));
vi.mock('@pryzm/core-app-model/element-registry', () => ({
    elementRegistry: { getStoreType: () => undefined },
}));

const { RemoteCommandDispatcher, AppliedCommandLedger } = await import('../RemoteCommandDispatcher');
type Dispatcher = InstanceType<typeof RemoteCommandDispatcher>;

const LOCAL_USER = 'user-founder';
const PEER_USER  = 'user-peer';
const PROJECT    = 'proj-1';

/** A command family with NO duplicate guard — the one that silently re-applies. */
function rakeCommand(logId: string, userId: string, deg: number) {
    return {
        type: 'UPDATE_ELEMENT_PARAMETER',
        payload: { elementId: 'wall_01KZQNF0SV', elementType: 'wall', parameters: { rakeAngleDeg: deg } },
        targetIds: ['wall_01KZQNF0SV'],
        timestamp: 0,
        version: 1,
        userId,
        commandLogId: logId,
    } as any;
}

let executed: Array<{ type: string }>;
let dispatcher: Dispatcher;

function makeDispatcher(localUserId: string | null = LOCAL_USER): Dispatcher {
    executed = [];
    const commandManager = { execute: (c: { type: string }) => { executed.push(c); } } as any;
    const d = new RemoteCommandDispatcher(commandManager, { value: false });
    d.bindProject(PROJECT, localUserId);
    return d;
}

beforeEach(() => {
    created.length = 0;
    globalThis.sessionStorage?.clear?.();
    // No runtime bus in this harness → `dispatch` takes the CommandRegistry path
    // and never reaches the (async) bus branch, so the assertions are synchronous.
    (globalThis as any).window = globalThis;
    delete (globalThis as any).runtime;
    dispatcher = makeDispatcher();
});

describe('§FIX-REPLAY-AT-MOST-ONCE — own-origin echo (Invariant E-2)', () => {
    it('REFUSES the local user\'s own command on catch-up, even when the caller forgets filterOutUserId', () => {
        // This is the exact production call shape: no filterOutUserId argument.
        const { applied, skipped } = dispatcher.replayCatchUp([
            rakeCommand('log-1', LOCAL_USER, 120),
            rakeCommand('log-2', LOCAL_USER, 140),
            rakeCommand('log-3', LOCAL_USER, 70),
        ]);

        expect(applied).toBe(0);
        expect(skipped).toBe(3);
        // Nothing was even RECONSTRUCTED — the gate sits before command creation,
        // so no store can be touched and no invariant can throw.
        expect(created).toHaveLength(0);
        expect(executed).toHaveLength(0);
    });

    it('REFUSES an own-origin command delivered live over the socket too', () => {
        expect(dispatcher.dispatch(rakeCommand('log-9', LOCAL_USER, 120)))
            .toBe('skipped-own-origin');
        expect(created).toHaveLength(0);
    });

    it('STILL APPLIES a genuine peer command — the fix must not disable collaboration', () => {
        const outcome = dispatcher.dispatch(rakeCommand('log-peer', PEER_USER, 70));
        expect(outcome).toBe('applied');
        expect(created).toHaveLength(1);
    });

    it('falls back to the explicit filterOutUserId when no local identity is bound', () => {
        const d = makeDispatcher(null);
        const r = d.replayCatchUp([rakeCommand('log-1', LOCAL_USER, 120)], LOCAL_USER);
        expect(r.applied).toBe(0);
        expect(created).toHaveLength(0);
    });
});

describe('§FIX-REPLAY-AT-MOST-ONCE — at-most-once delivery (Invariant E-4)', () => {
    it('the SAME command delivered twice is applied ONCE; the second is refused idempotently', () => {
        const cmd = rakeCommand('log-42', PEER_USER, 70);

        expect(dispatcher.dispatch(cmd)).toBe('applied');
        expect(dispatcher.dispatch(cmd)).toBe('skipped-already-delivered');

        expect(created).toHaveLength(1);
    });

    it('a command received LIVE and then again in a catch-up window is not re-applied', () => {
        const cmd = rakeCommand('log-77', PEER_USER, 140);

        // Live over the socket…
        expect(dispatcher.dispatch(cmd, { commandLogId: 'log-77', originUserId: PEER_USER })).toBe('applied');
        // …then the reconnect's window overlaps it (baseline predates the row).
        const { applied, skipped } = dispatcher.replayCatchUp([cmd]);

        expect(applied).toBe(0);
        expect(skipped).toBe(1);
        expect(created).toHaveLength(1);
    });

    it('refuses duplicates QUIETLY — counted, not shouted (§CONTEXT-DATA-HONESTY)', () => {
        const errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const cmd = rakeCommand('log-quiet', PEER_USER, 70);
        dispatcher.dispatch(cmd);
        dispatcher.dispatch(cmd);
        dispatcher.dispatch(rakeCommand('log-own', LOCAL_USER, 70));

        // A duplicate is an expected outcome of at-least-once delivery, not an incident.
        expect(errSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(dispatcher.quietlySkipped).toBe(2);

        errSpy.mockRestore();
        warnSpy.mockRestore();
    });
});

describe('§FIX-REPLAY-AT-MOST-ONCE — reconnect baseline (BFCache / transport error)', () => {
    it('a reconnect does NOT forget what it already applied — the ledger survives re-binding', () => {
        const cmd = rakeCommand('log-100', PEER_USER, 70);
        expect(dispatcher.dispatch(cmd)).toBe('applied');

        // Tab sleeps → `transport close` → wakes → socket reconnects → the
        // project is re-bound and catch-up runs again. Re-binding the SAME project
        // must KEEP the ledger; forgetting it is the bug.
        dispatcher.bindProject(PROJECT, LOCAL_USER);
        expect(dispatcher.replayCatchUp([cmd])).toEqual({ applied: 0, skipped: 1 });
        expect(created).toHaveLength(1);
    });

    it('a BFCache restore rebuilds the ledger from sessionStorage — a fresh dispatcher still refuses', () => {
        expect(dispatcher.dispatch(rakeCommand('log-200', PEER_USER, 70))).toBe('applied');

        // BFCache freezes the page rather than tearing it down, but even a full
        // re-bootstrap within the same tab must not replay the window: the ledger
        // is persisted in sessionStorage, which outlives the socket.
        const revived = makeDispatcher();
        expect(revived.dispatch(rakeCommand('log-200', PEER_USER, 70)))
            .toBe('skipped-already-delivered');
    });

    it('switching PROJECTS installs a fresh ledger — one project cannot mask another', () => {
        expect(dispatcher.dispatch(rakeCommand('log-300', PEER_USER, 70))).toBe('applied');
        dispatcher.bindProject('proj-2', LOCAL_USER);
        expect(dispatcher.dispatch(rakeCommand('log-300', PEER_USER, 70))).toBe('applied');
    });
});

describe('§FIX-REPLAY-AT-MOST-ONCE — AppliedCommandLedger', () => {
    it('records once, recognises thereafter, and survives a reload from storage', () => {
        const a = new AppliedCommandLedger('p-ledger');
        expect(a.record('x')).toBe(true);
        expect(a.record('x')).toBe(false);
        expect(a.has('x')).toBe(true);

        expect(new AppliedCommandLedger('p-ledger').has('x')).toBe(true);
        expect(new AppliedCommandLedger('p-other').has('x')).toBe(false);
    });

    it('is BOUNDED — a long session cannot grow it without limit', () => {
        const l = new AppliedCommandLedger('p-bounded');
        for (let i = 0; i < 2_500; i++) l.record(`id-${i}`);
        expect(l.size).toBe(2_000);
        expect(l.has('id-2499')).toBe(true);   // newest kept
        expect(l.has('id-0')).toBe(false);     // oldest evicted
    });
});
