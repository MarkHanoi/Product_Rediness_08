/**
 * §PRESENCE-IS-A-SAMPLE-STREAM + §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET
 * (L-13207 / L-13208 · C08 §3.3.1, §3.4.1)
 *
 * ⭐ THE TWO DEFECTS, AND WHY ONLY ONE OF THEM IS COSMETIC.
 *
 * The founder's console printed `WebSocket is already in CLOSING or CLOSED state.` about forty
 * times inside one divider drag. The EMITTER was `cursor-move`, once per raw `mousemove`,
 * unthrottled, on a container the multi-pane divider lives inside. Those writes were discarded
 * by the browser and then FAKE-DRAINED by engine.io (`try { doWrite(…) } catch (e) {}` followed
 * by an unconditional `emitReserved("drain")` that splices the packet out of the write buffer as
 * if it had been sent). Nothing was lost that mattered — a cursor position is worthless stale.
 * **That half is cosmetic, and it is fixed at the source: coalesce, and mark it volatile.**
 *
 * **The SHAPE was not cosmetic, because the durable path shares it.** `command-executed` carried
 * a byte-identical guard, and server-side that one event is BOTH the peer broadcast AND the only
 * writer of `project_command_log` — the table catch-up replays from. A real BIM edit dropped in
 * that window is absent from every peer AND from the log, so no catch-up by anyone can recover
 * it; and `_triggerCatchUp` is inbound-only with `excludeSelf=1`, so it is structurally incapable
 * of noticing. `Catch-up: no missed commands` and "eleven of your edits never left the browser"
 * printed the same value. **These cases pin that they no longer do.**
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    classifyOutbound,
    createCursorEmitter,
    isDeliverable,
    UndeliveredCommandLedger,
    volatileEmit,
} from '../collabOutbound';

// ── A frame pump a test can drive by hand ───────────────────────────────────
function fakeFrames() {
    let queued: Array<() => void> = [];
    return {
        schedule: (fn: () => void) => { queued.push(fn); },
        tick: () => { const q = queued; queued = []; for (const fn of q) fn(); },
        get depth(): number { return queued.length; },
    };
}

describe('§PRESENCE-IS-A-SAMPLE-STREAM — cursor samples coalesce to one emit per frame', () => {
    it('folds N mousemoves in one frame into ONE emit carrying the LATEST sample', () => {
        const frames = fakeFrames();
        const emit = vi.fn();
        const em = createCursorEmitter({ schedule: frames.schedule, emit });

        // ~40 raw mousemoves is roughly 0.7s of divider drag — the founder's warning count.
        for (let i = 0; i < 40; i++) em.sample({ clientX: 100 + i, clientY: 200 + i });

        expect(emit).not.toHaveBeenCalled();   // nothing goes out mid-frame
        expect(frames.depth).toBe(1);          // and exactly ONE flush is queued, not 40

        frames.tick();
        expect(emit).toHaveBeenCalledTimes(1);
        // The newest sample supersedes every earlier one — folding is lossless for presence.
        expect(emit).toHaveBeenCalledWith({ clientX: 139, clientY: 239 });
    });

    it('emits again on the NEXT frame — it is a fold, not a debounce', () => {
        // ⛔ THE DISTINCTION THAT DECIDES THE FIX. A debounce RESTARTS its timer on every new
        // sample, so during continuous motion it never fires and the remote cursor freezes. This
        // fires every frame motion continues, so latency is bounded by one frame, always.
        const frames = fakeFrames();
        const emit = vi.fn();
        const em = createCursorEmitter({ schedule: frames.schedule, emit });

        for (let frame = 0; frame < 5; frame++) {
            em.sample({ clientX: frame, clientY: frame });
            em.sample({ clientX: frame, clientY: frame + 1 });
            frames.tick();
        }
        expect(emit).toHaveBeenCalledTimes(5);
        expect(emit).toHaveBeenLastCalledWith({ clientX: 4, clientY: 5 });
    });

    it('emits nothing at all on a frame with no samples', () => {
        const frames = fakeFrames();
        const emit = vi.fn();
        const em = createCursorEmitter({ schedule: frames.schedule, emit });
        frames.tick();
        expect(emit).not.toHaveBeenCalled();
        expect(em.isPending()).toBe(false);
    });
});

describe('§PRESENCE-IS-A-SAMPLE-STREAM — the cursor packet is VOLATILE', () => {
    it('prefers socket.volatile, which discards rather than writing into a closing transport', () => {
        const volEmit = vi.fn();
        const plainEmit = vi.fn();
        const socket = { volatile: { emit: volEmit }, emit: plainEmit };
        expect(volatileEmit(socket, 'cursor-move', { x: 1 })).toBe(true);
        expect(volEmit).toHaveBeenCalledWith('cursor-move', { x: 1 });
        // ⭐ This is what removes the console warning AT THE SOURCE: socket.io checks
        // `io.engine.transport.writable` and DISCARDS a volatile packet instead of calling
        // `ws.send()` on a CLOSING socket. Suppressing the console would have hidden the same
        // write; this stops making it.
        expect(plainEmit).not.toHaveBeenCalled();
    });

    it('falls back to a plain emit on a client with no volatile flag', () => {
        const plainEmit = vi.fn();
        expect(volatileEmit({ emit: plainEmit }, 'cursor-move', { x: 1 })).toBe(false);
        expect(plainEmit).toHaveBeenCalledTimes(1);
    });

    it('never throws when there is no socket at all', () => {
        expect(() => volatileEmit(null, 'cursor-move', {})).not.toThrow();
        expect(volatileEmit(null, 'cursor-move', {})).toBe(false);
    });
});

describe('§OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET — classifying an emit before making it', () => {
    const writable = (w: boolean | undefined) => ({
        connected: true,
        io: { engine: { transport: { writable: w } } },
    });

    it('sees the CLOSING window the old guard could not: connected===true, transport dead', () => {
        // ⭐ THE WHOLE POINT. `if (!socket?.connected) return;` PASSES here — socket.io has not
        // been told the transport died yet — so the write went into a dead socket and vanished.
        expect(classifyOutbound(writable(false), 'p1')).toBe('transport-not-writable');
        expect(isDeliverable(classifyOutbound(writable(false), 'p1'))).toBe(false);
    });

    it('treats an UNREADABLE transport as deliverable — an unknown must never be a fabricated loss', () => {
        // Reporting loss that did not happen is the mirror image of hiding loss that did, and
        // just as dishonest. Only a POSITIVE `writable === false` counts.
        expect(classifyOutbound(writable(undefined), 'p1')).toBe('deliverable');
        expect(classifyOutbound({ connected: true }, 'p1')).toBe('deliverable');
    });

    it('separates the three ways an emit can be impossible', () => {
        expect(classifyOutbound(writable(true), null)).toBe('no-project');
        expect(classifyOutbound(null, 'p1')).toBe('socket-missing');
        expect(classifyOutbound({ connected: false }, 'p1')).toBe('not-connected');
        expect(classifyOutbound(writable(true), 'p1')).toBe('deliverable');
    });
});

describe('§OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET — the undelivered ledger', () => {
    it('returns null when nothing was lost, so a clean session cannot print a false measurement', () => {
        // ⚠ Deliberately null, not "0 undelivered": DELIVERY IS NOT MEASURED here (there is no
        // server ack — L-13211). Only refusal is. A "0" would read like a delivery guarantee.
        expect(new UndeliveredCommandLedger().summary()).toBeNull();
    });

    it('names the count, the verdicts and the command types once something IS lost', () => {
        const led = new UndeliveredCommandLedger();
        led.record('CreateWallCommand', 'transport-not-writable', 1);
        led.record('UpdateWallCommand', 'not-connected', 2);
        led.record('CreateWallCommand', 'transport-not-writable', 3);
        expect(led.size).toBe(3);
        const s = led.summary();
        expect(s).toContain('3 local command(s) were NEVER SENT');
        expect(s).toContain('2× transport-not-writable');
        expect(s).toContain('1× not-connected');
        expect(s).toContain('CreateWallCommand');
        // The consequence, stated where it will be read — this is the fact that makes the
        // defect permanent rather than transient.
        expect(s).toContain('project_command_log');
    });

    it('keeps counting past its cap instead of quietly under-reporting', () => {
        const led = new UndeliveredCommandLedger(2);
        led.record('A', 'not-connected');
        led.record('B', 'not-connected');
        led.record('C', 'not-connected');
        expect(led.size).toBe(3);            // ⭐ not 2
        expect(led.list()).toHaveLength(2);  // retained entries are bounded
        expect(led.summary()).toContain('evicted past the 2-entry cap');
    });
});

describe('§OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET — the production wiring', () => {
    const src = readFileSync(
        join(process.cwd(), 'apps/editor/src/engine/initCollaboration.ts'),
        'utf8',
    );

    it('no longer emits cursor-move once per raw mousemove', () => {
        // The defect in one line. If this shape returns, the forty warnings return with it.
        expect(src).not.toMatch(/socket\.emit\('cursor-move'/);
        expect(src).toMatch(/volatileEmit\(socket, 'cursor-move'/);
        expect(src).toMatch(/createCursorEmitter\(\{/);
        expect(src).toMatch(/cursorEmitter\.sample\(\{ clientX: e\.clientX, clientY: e\.clientY \}\)/);
    });

    it('coalesces on the frame bus, not a timer (P3 / ADR-003)', () => {
        expect(src).toMatch(/scheduler\.scheduleOnce\('collab-cursor-emit', flush, 'overlay'\)/);
        expect(src).not.toMatch(/setTimeout\([^)]*cursor/i);
    });

    it('classifies command-executed deliverability instead of returning in silence', () => {
        // §AUTHORED-BUT-UNWIRED — the ledger only matters if the command path consults it.
        expect(src).toMatch(/const verdict = classifyOutbound\(socket, currentProjectId\)/);
        expect(src).toMatch(/undeliveredCommands\.record\(cmd\.type, verdict\)/);
        expect(src).toMatch(/§OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET/);
        // The old silent guard, immediately after the echo-loop check, must be gone.
        expect(src).not.toMatch(
            /if \(suppressBroadcast\.value\) return;\s*\r?\n\s*if \(!socket\?\.connected \|\| !currentProjectId\) return;/,
        );
    });

    it('classifies AFTER the broadcast filter, so a filtered command is not recorded as lost', () => {
        // A command on COLLAB_BROADCAST_SKIP is not lost — it is deliberately not sent. Ordering
        // these the other way would fill the ledger with false losses and make it worthless.
        const filterAt = src.indexOf('COLLAB_BROADCAST_SKIP.has(cmd.type)');
        const classifyAt = src.indexOf('const verdict = classifyOutbound(socket, currentProjectId)');
        expect(filterAt).toBeGreaterThan(-1);
        expect(classifyAt).toBeGreaterThan(filterAt);
    });

    it('stops the catch-up line from claiming a clean slate over a local loss', () => {
        // Catch-up is INBOUND-ONLY (`excludeSelf=1`). Saying "no missed commands" unqualified,
        // while this client's own edits were dropped, is a lie by omission.
        expect(src).not.toMatch(/Catch-up: no missed commands'\)/);
        expect(src).toMatch(/no missed commands FROM PEERS/);
        expect(src).toMatch(/const localGap = undeliveredCommands\.summary\(\)/);
        expect(src).toMatch(/gapSuffix/);
    });
});
