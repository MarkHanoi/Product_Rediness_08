/**
 * saveWipeGuard.spec.ts — §GUARD-EMPTY-SNAPSHOT (L-10041)
 *
 * ⚠ THE RATIO IS DELIBERATE. One case proves the refusal fires; the rest prove
 * it does NOT fire on anything a correct session actually does. A refusal that
 * lands on a legitimate save is worse than the hole it closes, so the
 * false-positive surface is what gets the coverage.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    BARE_SNAPSHOT_CEILING,
    decideVersionWrite,
    describeWipeRefusal,
    type WipeGuardVerdict,
} from '../saveWipeGuard';

const refuse = (v: WipeGuardVerdict) => {
    if (v.action !== 'refuse') throw new Error(`expected refuse, got ${v.action}/${v.code}`);
    return v;
};

describe('§GUARD-EMPTY-SNAPSHOT — the one shape that is refused', () => {
    it('⛔ refuses an AUTOSAVE of an empty model over a populated stored version', () => {
        const v = decideVersionWrite({ incomingElementCount: 0, storedElementCount: 793, isAutoSave: true });
        expect(v.action).toBe('refuse');
        expect(v.code).toBe('autosave-would-empty-project');
    });

    it('the refusal message names BOTH counts, says nothing was deleted, and names the escape', () => {
        const v = refuse(decideVersionWrite({ incomingElementCount: 0, storedElementCount: 793, isAutoSave: true }));
        expect(v.reason).toContain('0 elements');
        expect(v.reason).toContain('793');
        expect(v.reason).toMatch(/Nothing was deleted/i);
        expect(v.reason).toMatch(/use Save/i);
        expect(v.incomingElementCount).toBe(0);
        expect(v.storedElementCount).toBe(793);
    });

    it('the toast copy is reassuring and actionable, not an error the user must decode', () => {
        const copy = describeWipeRefusal(refuse(
            decideVersionWrite({ incomingElementCount: 0, storedElementCount: 42, isAutoSave: true }),
        ));
        expect(copy).toContain('42');
        expect(copy).toMatch(/Nothing was lost/i);
        expect(copy).toMatch(/Press Save/i);
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — ⭐ the escape hatch already exists: the Save button', () => {
    it('a MANUAL save of an empty model is never refused', () => {
        const v = decideVersionWrite({ incomingElementCount: 0, storedElementCount: 5000, isAutoSave: false });
        expect(v.action).toBe('write');
        expect(v.code).toBe('manual-save-is-intent');
    });

    it('manual intent outranks every other consideration', () => {
        for (const stored of [1, 42, 100_000]) {
            expect(decideVersionWrite({ incomingElementCount: 0, storedElementCount: stored, isAutoSave: false }).action)
                .toBe('write');
        }
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — the false-positive surface', () => {
    it('writes the FIRST save of a project — there is no stored baseline to lose', () => {
        const v = decideVersionWrite({ incomingElementCount: 0, storedElementCount: null, isAutoSave: true });
        expect(v.action).toBe('write');
        expect(v.code).toBe('no-stored-baseline');
    });

    it('writes empty over empty — a new project autosaving its scaffold', () => {
        const v = decideVersionWrite({ incomingElementCount: 0, storedElementCount: 0, isAutoSave: true });
        expect(v.action).toBe('write');
        expect(v.code).toBe('stored-also-bare');
    });

    it('writes any autosave that carries even one element', () => {
        const v = decideVersionWrite({ incomingElementCount: 1, storedElementCount: 5000, isAutoSave: true });
        expect(v.action).toBe('write');
        expect(v.code).toBe('not-bare');
    });

    it('⚠ a 5000 → 1 deletion is NOT refused — this guard is about ZERO, not about shrinking', () => {
        // Deliberately narrow. A "suspicious drop" heuristic keyed on a ratio would
        // start refusing legitimate demolition work, which is real BIM.
        expect(decideVersionWrite({ incomingElementCount: 1, storedElementCount: 5000, isAutoSave: true }).action)
            .toBe('write');
        expect(BARE_SNAPSHOT_CEILING).toBe(0);
    });

    it('writes when the incoming count is not a number — never refuse on a guess', () => {
        expect(decideVersionWrite({ incomingElementCount: NaN, storedElementCount: 900, isAutoSave: true }).action)
            .toBe('write');
        expect(decideVersionWrite({ incomingElementCount: undefined as never, storedElementCount: 900, isAutoSave: true }).action)
            .toBe('write');
    });

    it('writes when the stored count could not be read (unknown accepts)', () => {
        expect(decideVersionWrite({ incomingElementCount: 0, storedElementCount: NaN, isAutoSave: true }).action)
            .toBe('write');
        expect(decideVersionWrite({ incomingElementCount: 0, storedElementCount: undefined as never, isAutoSave: true }).action)
            .toBe('write');
    });

    it('is pure and total — same input, same verdict, never throws', () => {
        const args = { incomingElementCount: 0, storedElementCount: 10, isAutoSave: true } as const;
        expect(decideVersionWrite(args)).toEqual(decideVersionWrite(args));
        expect(() => decideVersionWrite({} as never)).not.toThrow();
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — the window it exists for, restated as a test', () => {
    it('⭐ models PlatformShell.setProjectContext: fence down, scene empty, data still in flight', () => {
        // setLoading(false) + resetDirtyAfterLoad() run in the `.then` of the
        // empty clear-load, BEFORE `_loadLatestVersionFromServer()` is awaited. A
        // mutation in that window autosaves the empty scene over a project the
        // server holds 793 elements of.
        const duringTheWindow = decideVersionWrite({
            incomingElementCount: 0,        // the cleared scene
            storedElementCount: 793,        // what the last local version holds
            isAutoSave: true,               // fence is down, debounce fired
        });
        expect(duringTheWindow.action).toBe('refuse');
    });

    it('⭐ models the offline open: server fetch failed, local restore missed, project sits empty', () => {
        // `_loadLatestVersionFromServer` swallows the failure and fires
        // pryzm-project-loaded(empty:true). The real model is still on the server;
        // the next autosave would bury it under an empty latest version.
        expect(decideVersionWrite({ incomingElementCount: 0, storedElementCount: 1, isAutoSave: true }).action)
            .toBe('refuse');
    });

    it('and stops refusing by itself the moment the real data lands', () => {
        expect(decideVersionWrite({ incomingElementCount: 793, storedElementCount: 793, isAutoSave: true }).action)
            .toBe('write');
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — ⭐ THE ESCAPE HATCH REACHES THE SERVER, not just localStorage', () => {
    // These read the source rather than driving a DOM + network + IndexedDB stack,
    // for the same reason `serverSaveRejectionFate` is a pure module: the policy
    // that decides whether the user's work survives must be assertable without a
    // browser. What they pin is a WIRING fact, and a wiring fact is exactly what
    // rots silently.
    const here = dirname(fileURLToPath(import.meta.url));
    const read = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

    it('the manual-save path asks the queue to send force, keyed on !isAutoSave', () => {
        const ctrl = read('../PlatformSaveController.ts');
        expect(ctrl).toMatch(/emptyOverwriteIntent:\s*!isAutoSave && snapshot\.elementCount === 0/);
    });

    it('⛔ an AUTOSAVE can never set it — otherwise the client disarms the server guard', () => {
        const ctrl = read('../PlatformSaveController.ts');
        // The ONLY producer of the flag must be gated on `!isAutoSave`. If a later
        // edit sets it unconditionally, the server-side refusal becomes decorative
        // for this client and for every stale tab replaying against it.
        const producers = ctrl.match(/emptyOverwriteIntent:[^,\r\n]*/g) ?? [];
        expect(producers).toHaveLength(1);
        expect(producers[0]).toContain('!isAutoSave');
    });

    it('the queue turns that intent into "force": true on the wire, and omits it otherwise', () => {
        const queue = read('../ServerSyncQueue.ts');
        expect(queue).toMatch(/\.\.\.\(item\.emptyOverwriteIntent === true \? \{ force: true \} : \{\}\)/);
    });

    it('the intent survives a reload — it is written into the persisted queue item', () => {
        // A manual "yes, empty it" that has not uploaded before a reload would
        // otherwise come back without force and collect a 409 for a refusal the
        // user already overrode.
        const queue = read('../ServerSyncQueue.ts');
        expect(queue).toMatch(/emptyOverwriteIntent \?\? |emptyOverwriteIntent === true \? \{ emptyOverwriteIntent: true \}/);
    });
});
