/**
 * collabOutbound — the OUTBOUND half of the collaboration socket, made decidable.
 *
 * §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET (L-13207/L-13208 · C08 §3.3, §3.4)
 *
 * ⭐ WHY THIS MODULE EXISTS, stated as the defect it removes.
 *
 * The founder's console showed `WebSocket is already in CLOSING or CLOSED state.` about forty
 * times in one divider drag, followed by `transport close`, a reconnect, and
 * `Catch-up: no missed commands`. Two independent things were wrong with that picture, and
 * only one of them is cosmetic:
 *
 *  1. **The volume was cosmetic, and it had a real cause.** `cursor-move` was emitted once per
 *     raw `mousemove` — unthrottled, uncoalesced — into a socket whose transport was already
 *     closing. Every one of those writes is DISCARDED by the browser and then FAKE-DRAINED by
 *     engine.io (`try { doWrite(…) } catch (e) {}`, then an unconditional `emitReserved("drain")`
 *     whose handler splices the packet out of the write buffer as if it had been sent). Nothing
 *     was lost that mattered — a cursor position is worthless the moment it is stale — but the
 *     right fix is to stop generating a hundred writes a second for a sample stream, not to
 *     suppress the console. Hence {@link createCursorEmitter} (coalesce to ≤1 per frame) and
 *     {@link volatileEmit} (socket.io's own "this is a lossy sample" primitive, which DISCARDS
 *     rather than writing into a non-writable transport — so the warning stops at the source).
 *
 *  2. **The SHAPE was not cosmetic, because the durable path shares it.** `command-executed`
 *     carries a byte-identical `if (!socket?.connected || !currentProjectId) return;` guard, and
 *     server-side that single event is BOTH the peer broadcast AND the only writer of
 *     `project_command_log` — the table catch-up replays from. A real BIM edit emitted in that
 *     window is lost to peers AND never logged, so no future catch-up by anyone can recover it.
 *     And `_triggerCatchUp` is inbound-only with `excludeSelf=1`: it asks what OTHERS did and is
 *     structurally incapable of noticing that this client's own emit vanished.
 *     **Failure and empty printed the same value.** {@link UndeliveredCommandLedger} is what
 *     makes them different.
 *
 * ⛔ WHAT THIS MODULE DELIBERATELY DOES NOT DO: it does not queue and replay an undelivered
 * command. Blind client-side buffering would re-emit on reconnect and mint a SECOND
 * `commandLogId` for the same edit — and the at-most-once ledger (§FIX-REPLAY-AT-MOST-ONCE,
 * L-814) keys on exactly that id, so it could not dedupe the replay. Reliable outbound delivery
 * needs a server-side ack (`server.js`'s `command-executed` handler registers no ack callback
 * today) plus id-stable dedup. That is L-13211, its own lane. Until then this module makes the
 * loss LOUD, which is the half that can be done correctly from the client alone.
 *
 * Pure and DOM-free apart from an optional `dispatchEvent` hook, so every arm is testable
 * without a socket, a server, or a frame pump.
 */

// ── Outbound deliverability ─────────────────────────────────────────────────

/**
 * Why an outbound emit can (or cannot) be delivered.
 *
 * ⚠ `'unknown-transport'` is NOT a failure verdict and never appears: a transport that cannot
 * be inspected is treated as DELIVERABLE. Inventing a failure from an unreadable field would
 * commit the mirror image of the defect this module removes — reporting loss that did not
 * happen is as dishonest as hiding loss that did.
 */
export type OutboundVerdict =
    | 'deliverable'
    | 'no-project'
    | 'socket-missing'
    | 'not-connected'
    | 'transport-not-writable';

/** True only for the one verdict that means the packet can actually leave. */
export function isDeliverable(v: OutboundVerdict): boolean {
    return v === 'deliverable';
}

/**
 * Is this verdict a LOSS, or merely "collaboration is not running"?
 *
 * ⛔ THE DISTINCTION MATTERS MORE THAN THE DETECTION, and getting it wrong would have shipped a
 * worse defect than the one this module fixes. `socket-missing` and `no-project` mean there is no
 * collaboration session at all — the founder working solo, offline, or before a project is open.
 * Those commands were never meant to go over a wire, nothing is waiting for them, and
 * `project_command_log` is explicitly NOT the persistence path (C08 §3.3: *"The log MUST NOT be
 * the sole persistence mechanism; it supplements snapshots"*). Reporting them as losses would
 * print a red console error on EVERY EDIT of a single-user session — an alarm that is wrong every
 * time it fires, which is how a real alarm gets ignored.
 *
 * A GAP is the narrow case where collaboration WAS established and the edit still did not leave:
 * the socket exists but is down (`not-connected`), or its transport has gone non-writable while
 * socket.io still believes it is connected (`transport-not-writable` — the CLOSING window from
 * the founder's trace). Those are the two that cost a peer an edit and the log a row.
 */
export function isCollaborationGap(v: OutboundVerdict): boolean {
    return v === 'not-connected' || v === 'transport-not-writable';
}

/**
 * Classify an outbound emit BEFORE attempting it.
 *
 * `transport-not-writable` is the CLOSING-socket window the founder's trace was full of:
 * `socket.connected` is still `true` (the socket.io layer has not been told yet) while the
 * underlying engine.io transport has already gone non-writable. socket.io itself reads exactly
 * this field to decide whether to discard a volatile packet
 * (`socket.io/client-dist/socket.io.js`: `isTransportWritable = this.io.engine?.transport?.writable`).
 */
export function classifyOutbound(socket: unknown, projectId: string | null | undefined): OutboundVerdict {
    if (!projectId) return 'no-project';
    if (!socket || typeof socket !== 'object') return 'socket-missing';
    const s = socket as {
        connected?: unknown;
        io?: { engine?: { transport?: { writable?: unknown } } };
    };
    if (s.connected !== true) return 'not-connected';
    const writable = s.io?.engine?.transport?.writable;
    // Only a POSITIVE report of non-writability counts. `undefined` = cannot tell = deliverable.
    if (writable === false) return 'transport-not-writable';
    return 'deliverable';
}

/**
 * Emit through socket.io's `volatile` flag when the client exposes it, else plainly.
 *
 * A cursor position is a lossy SAMPLE — the next one supersedes it entirely — and `volatile` is
 * the socket.io primitive that says so: it DISCARDS the packet when the transport is not
 * writable instead of handing it to `ws.send()` on a CLOSING socket, which is what printed the
 * founder's forty warnings. Returns `true` when the volatile path was taken.
 *
 * ⭐ THE FALLBACK PATH IS GATED, ADDED 2026-09-10 — the one hole the L-13207 fix left open.
 * `volatile` exists only on a real socket.io client; where it does not (an older client bundle,
 * a transport shim, a hand-built double), this function fell straight through to a PLAIN `emit`
 * — which is precisely the un-discardable `ws.send()` into a CLOSING socket that the whole lane
 * exists to stop, reintroduced on the one path nobody was looking at.
 *
 * ⛔ THE VOLATILE PATH IS UNTOUCHED, DELIBERATELY. socket.io applies its OWN
 * `isTransportWritable` rule there, and re-deciding it here would be a second copy of one rule
 * ([[same-rule-two-implementations]]) that could disagree with the client's after any upgrade.
 * Only the fallback — the path with no owner — acquires a guard.
 *
 * ⚠ AND THE GUARD IS THIS MODULE'S OWN "POSITIVE REPORT ONLY" RULE, NOT `classifyOutbound`.
 * A bare `{ emit }` double has no `connected` field, and `classifyOutbound` reads that ABSENCE
 * as `not-connected` — correct for its own purpose (deciding whether a durable command was
 * lost) and wrong here, where it would silently drop every packet a caller deliberately sent
 * through a shim. `transport.writable === false` is the only POSITIVE report of a dead wire,
 * which is the same standard `classifyOutbound`'s own comment sets: *"`undefined` = cannot tell
 * = deliverable."*
 */
export function volatileEmit(socket: unknown, event: string, payload: unknown): boolean {
    const s = socket as {
        volatile?: { emit?: (e: string, p: unknown) => unknown };
        emit?: (e: string, p: unknown) => unknown;
        io?: { engine?: { transport?: { writable?: unknown } } };
    };
    const vol = s?.volatile;
    if (vol && typeof vol.emit === 'function') {
        vol.emit(event, payload);
        return true;
    }
    if (typeof s?.emit === 'function') {
        if (s.io?.engine?.transport?.writable === false) return false;
        s.emit(event, payload);
        return false;
    }
    return false;
}

// ── The undelivered-command ledger ──────────────────────────────────────────

export interface UndeliveredCommand {
    readonly commandType: string;
    readonly verdict: OutboundVerdict;
    /** `Date.now()` at the moment the emit was refused. */
    readonly at: number;
}

/**
 * A bounded, in-memory record of local commands that were NEVER PUT ON THE WIRE.
 *
 * This is the thing that stops `Catch-up: no missed commands` from being a lie by omission. It
 * holds no policy — it does not retry, does not replay, does not decide anything. It exists so
 * that "nothing was lost" and "eleven of your edits never left this browser" stop printing the
 * same value (§CONTEXT-DATA-HONESTY).
 */
export class UndeliveredCommandLedger {
    private readonly entries: UndeliveredCommand[] = [];
    private overflow = 0;

    constructor(private readonly cap = 200) {}

    /** @returns the total number of undelivered commands SEEN, including any past the cap. */
    record(commandType: string, verdict: OutboundVerdict, at: number = Date.now()): number {
        this.entries.push({ commandType, verdict, at });
        if (this.entries.length > this.cap) {
            this.entries.shift();
            this.overflow++;
        }
        return this.size;
    }

    /** Total seen this session — retained entries PLUS the ones the cap evicted. */
    get size(): number {
        return this.entries.length + this.overflow;
    }

    /** The retained entries, oldest first. */
    list(): readonly UndeliveredCommand[] {
        return this.entries.slice();
    }

    /**
     * A one-line, human-readable account, or `null` when nothing was lost.
     *
     * ⚠ Returning `null` for the clean case is deliberate: a caller cannot accidentally print
     * "0 commands undelivered" in a way that reads like a measurement of delivery. Delivery is
     * NOT measured here — only refusal is (there is no server ack; L-13211).
     */
    summary(): string | null {
        if (this.size === 0) return null;
        const byVerdict = new Map<OutboundVerdict, number>();
        for (const e of this.entries) byVerdict.set(e.verdict, (byVerdict.get(e.verdict) ?? 0) + 1);
        const parts = [...byVerdict.entries()].map(([v, n]) => `${n}× ${v}`).join(', ');
        const kinds = [...new Set(this.entries.map((e) => e.commandType))].slice(0, 6).join(', ');
        return (
            `${this.size} local command(s) were NEVER SENT this session ` +
            `(${parts}${this.overflow > 0 ? `, +${this.overflow} evicted past the ${this.cap}-entry cap` : ''}) — ` +
            `types: ${kinds}${this.entries.length > 6 ? ', …' : ''}. ` +
            `They are absent from every peer AND from project_command_log, so no catch-up can recover them.`
        );
    }

    clear(): void {
        this.entries.length = 0;
        this.overflow = 0;
    }
}

// ── Cursor sample coalescing ────────────────────────────────────────────────

export interface CursorSample {
    readonly clientX: number;
    readonly clientY: number;
}

export interface CursorEmitterDeps {
    /**
     * Run `flush` once, on the next frame. The production wiring is the frame scheduler; a spec
     * passes a synchronous queue it can drain by hand.
     *
     * ⛔ NOT A DEBOUNCE AND NOT A THROTTLE. A debounce RESTARTS its timer on every new sample, so
     * during continuous motion it never fires; a throttle holds a wall-clock window. This is a
     * FOLD: N samples collapse to the LATEST one, which is emitted on the very next frame
     * regardless of whether motion continued. Latency is bounded by one frame, always.
     */
    readonly schedule: (flush: () => void) => void;
    /** Emit the coalesced sample. Return value ignored. */
    readonly emit: (sample: CursorSample) => void;
}

export interface CursorEmitter {
    /** Record a sample. The first call after a flush schedules the next flush. */
    readonly sample: (s: CursorSample) => void;
    /** Flush now, synchronously (the scheduled callback; exposed for tests). */
    readonly flush: () => void;
    /** True while a flush is scheduled and unflushed. */
    readonly isPending: () => boolean;
}

/**
 * Coalesce a cursor sample stream to AT MOST ONE emit per frame.
 *
 * C08 §3.4.1: presence is a SAMPLE STREAM, not an event log. Emitting one socket packet per raw
 * `mousemove` is the defect; the newest sample supersedes every earlier one, so folding them is
 * lossless in the only sense that matters for presence.
 */
export function createCursorEmitter(deps: CursorEmitterDeps): CursorEmitter {
    let pending: CursorSample | null = null;
    let scheduled = false;

    const flush = (): void => {
        scheduled = false;
        const s = pending;
        pending = null;
        if (!s) return;
        deps.emit(s);
    };

    return {
        sample(s: CursorSample): void {
            pending = s;
            if (scheduled) return;
            scheduled = true;
            deps.schedule(flush);
        },
        flush,
        isPending: () => scheduled,
    };
}
