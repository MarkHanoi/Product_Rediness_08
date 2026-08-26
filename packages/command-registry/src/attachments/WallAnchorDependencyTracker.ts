// WallAnchorDependencyTracker — the typed READER of `wallAnchor` (ADR-0374 §2.4, §GRAPH115).
//
// When a host (wall / curtain wall) transforms, every element anchored to it is
// carried through ONE `ReseatWallAnchoredElementsCommand`, dispatched with
// `{ source: 'STRUCTURAL_CASCADE' }` synchronously inside the host command's
// execution frame — so the reseat lands in the gesture's `structuralChildren`
// and one wall move stays ONE Ctrl+Z (§L-874-ONE-UNDO, C16 §8.6).
//
// This is a BESPOKE tracker, deliberately — C72 §0.3 names the bespoke per-pair
// trackers as the only propagation that works, and C72 §2.2 forbids building on
// the generic cascade. It is `FinishHostDependencyTracker`'s shape: the same
// `wallStore.subscribe` channel with §STEP7 `prevState`, the same `isReverting()`
// latch (§L-943 — undo RESTORES, it never recomputes), and the same rule that
// EVERY exit prints or writes (C89 §F-LA.1). It is NOT the same in one respect:
// it never falls back to a direct store write — P6 says commands are the only
// mutation path, and a cascade that cannot reach a command manager REFUSES by
// name rather than writing un-undoably.
//
// WHY A SCAN, NOT A REVERSE INDEX. The relationship is a RECORDED field on the
// element (C78 §5.1's "from a recorded relationship, never a re-scan that could
// return fewer than exist"): filtering `getAll()` on `wallAnchor.hostId` reads
// exactly the recorded set and can never be stale, which a second index could
// be. A wall move is a user gesture over a few hundred point elements; the
// index would be an optimisation with a staleness class of its own.

import type { AnchorHostBaselineLike, WallAnchor } from './WallAnchor';
import {
    anchorHostBaselineChanged,
    reseatFromWallAnchor,
    wallAnchorAgreement,
} from './WallAnchor';
import {
    ReseatWallAnchoredElementsCommand,
    readAnchoredElementYaw,
    type WallAnchorFamily,
    type WallAnchorReseatItem,
} from './ReseatWallAnchoredElementsCommand';

export type WallAnchorHostEvent = 'add' | 'update' | 'remove';

/** The one surface of a host store this tracker uses — WallStore and CurtainWallStore both satisfy it. */
export interface WallAnchorHostStoreLike {
    subscribe(
        cb: (event: WallAnchorHostEvent, host: AnchorHostBaselineLike, prevState?: AnchorHostBaselineLike) => void,
    ): () => void;
}

export interface WallAnchoredElementLike {
    readonly id: string;
    readonly levelId?: string;
    readonly position?: { readonly x: number; readonly y?: number; readonly z: number };
    readonly rotation?: { readonly y?: number; readonly _y?: number };
    readonly wallAnchor?: WallAnchor;
}

export interface WallAnchoredFamilyStoreLike {
    getAll(): ReadonlyArray<WallAnchoredElementLike>;
}

export interface WallAnchoredFamily {
    readonly family: WallAnchorFamily;
    readonly store: WallAnchoredFamilyStoreLike;
}

export interface WallAnchorCommandManagerLike {
    getContext(): unknown;
    execute(command: ReseatWallAnchoredElementsCommand, metadata?: { source: 'STRUCTURAL_CASCADE' }): unknown;
    /** §L-874 / §L-943 — true while undo()/redo() is replaying. */
    isReverting?(): boolean;
}

/** Late-binding ref — constructed before the command manager exists, resolved at event time. */
export interface WallAnchorCommandManagerRef {
    current: WallAnchorCommandManagerLike | undefined;
}

export interface WallAnchorHostSource {
    readonly kind: WallAnchor['hostKind'];
    readonly store: WallAnchorHostStoreLike;
}

const TAG = '[WallAnchorDependencyTracker]';

export class WallAnchorDependencyTracker {
    private readonly unsubscribes: Array<() => void> = [];
    /** §WALL30-DRAG-COALESCE — the FIRST pre-drag state per host, held until release. */
    private readonly dragMemo = new Map<string, AnchorHostBaselineLike>();
    private reentrant = false;

    constructor(
        hosts: ReadonlyArray<WallAnchorHostSource>,
        private readonly commandManagerRef: WallAnchorCommandManagerRef,
        private readonly families: ReadonlyArray<WallAnchoredFamily>,
    ) {
        for (const h of hosts) {
            this.unsubscribes.push(
                h.store.subscribe((event, host, prevState) => {
                    if (event === 'update') this.onHostUpdated(h.kind, host, prevState);
                    else if (event === 'remove') this.onHostRemoved(h.kind, host);
                }),
            );
        }
    }

    // ── §L-943 — the revert latch ────────────────────────────────────────────
    private isRevertReplay(): boolean {
        return this.commandManagerRef.current?.isReverting?.() === true;
    }

    private dragInProgress(): boolean {
        return typeof window !== 'undefined'
            && (window as { __wallDragInProgress?: boolean }).__wallDragInProgress === true;
    }

    /** Typed read of the recorded relationship: every element anchored to `hostId` of `kind`. */
    private dependentsOf(kind: WallAnchor['hostKind'], hostId: string): Array<{ family: WallAnchorFamily; rec: WallAnchoredElementLike }> {
        const out: Array<{ family: WallAnchorFamily; rec: WallAnchoredElementLike }> = [];
        for (const f of this.families) {
            for (const rec of f.store.getAll()) {
                const a = rec.wallAnchor;
                if (a && a.hostId === hostId && a.hostKind === kind) out.push({ family: f.family, rec });
            }
        }
        return out;
    }

    /** How many elements carry ANY anchor — "nothing can follow" is a fact about the model, not a shortfall. */
    private anchoredPopulation(): number {
        let n = 0;
        for (const f of this.families) for (const rec of f.store.getAll()) if (rec.wallAnchor) n++;
        return n;
    }

    /** Public, read-only — for gates and diagnostics (C78 §1.4: a number nobody can read cannot be ratcheted). */
    anchoredCount(): number { return this.anchoredPopulation(); }

    // ── Host moved → reseat / detach / refuse, never silent ─────────────────
    private onHostUpdated(kind: WallAnchor['hostKind'], host: AnchorHostBaselineLike, prevState?: AnchorHostBaselineLike): void {
        if (this.isRevertReplay()) return; // the history restores; a re-derivation here would double-write (§L-943)
        if (this.reentrant) return;

        // Live 3-D drag: hold the FIRST pre-drag state and act once on release.
        if (this.dragInProgress()) {
            if (prevState && !this.dragMemo.has(host.id)) this.dragMemo.set(host.id, prevState);
            return;
        }
        const memo = this.dragMemo.get(host.id);
        if (memo) { prevState = memo; this.dragMemo.delete(host.id); }

        if (!anchorHostBaselineChanged(prevState, host)) return; // a non-baseline update moves nothing anchored

        const dependents = this.dependentsOf(kind, host.id);
        if (dependents.length === 0) {
            const population = this.anchoredPopulation();
            if (population > 0) {
                console.log(`${TAG} ${kind} "${host.id}" moved; checked ${population} anchored element(s) — none is anchored to it.`);
            }
            return; // population 0: nothing in the model can follow — not a shortfall
        }

        // C72 §3.5 — prevState is never reconstructed from the store.
        if (!prevState) {
            console.warn(
                `${TAG} undetermined (STALE_DERIVED_STATE): ${kind} "${host.id}" moved without a pre-mutation ` +
                `snapshot — ${dependents.length} anchored element(s) could not be verified against it and were NOT moved.`,
            );
            return;
        }

        const items: WallAnchorReseatItem[] = [];
        for (const { family, rec } of dependents) {
            const anchor = rec.wallAnchor!;
            const pose = { x: rec.position?.x ?? 0, z: rec.position?.z ?? 0, yaw: readAnchoredElementYaw(rec as never) };
            const agreement = wallAnchorAgreement(anchor, prevState, pose);
            if (!agreement.agrees) {
                if (agreement.why === 'DIVERGED') {
                    const reason = `STALE_ANCHOR — moved ${agreement.distanceM.toFixed(3)} m / rotated ` +
                        `${(agreement.yawDeltaRad * 180 / Math.PI).toFixed(1)}° since anchoring`;
                    console.warn(`${TAG} ${family} "${rec.id}": ${reason}; DETACHED from ${kind} "${host.id}", NOT moved (ADR-0374 §2.4).`);
                    items.push({ family, id: rec.id, op: 'detach', reason });
                } else {
                    console.warn(
                        `${TAG} undetermined (${agreement.reason}): ${family} "${rec.id}" could not be checked against ` +
                        `${kind} "${host.id}"'s pre-move baseline — NOT moved, anchor kept.`,
                    );
                }
                continue;
            }
            const next = reseatFromWallAnchor(anchor, host);
            if (next.state === 'refused') {
                if (next.reason === 'OFF_HOST') {
                    // C74 — both numbers.
                    console.warn(
                        `${TAG} refused: ${family} "${rec.id}" anchored at t=${next.t.toFixed(3)} m but ${kind} "${host.id}" ` +
                        `is now ${next.hostLength.toFixed(3)} m long — off the host; NOT moved, anchor kept.`,
                    );
                } else {
                    console.warn(`${TAG} refused: ${kind} "${host.id}" baseline is degenerate — ${family} "${rec.id}" NOT moved.`);
                }
                continue;
            }
            items.push({ family, id: rec.id, op: 'reseat', x: next.x, z: next.z, yaw: next.yaw });
        }

        if (items.length === 0) {
            console.log(`${TAG} ${kind} "${host.id}" moved; ${dependents.length} anchored element(s) checked — nothing to write.`);
            return;
        }
        this.dispatch({ hostId: host.id, cause: 'host-moved', items }, kind);
    }

    // ── Host removed → keep in place, detach (ADR-0374 §2.5) ─────────────────
    private onHostRemoved(kind: WallAnchor['hostKind'], host: AnchorHostBaselineLike): void {
        if (this.isRevertReplay()) return; // undoing a host CREATE removes it; the history owns the consequence
        if (this.reentrant) return;
        this.dragMemo.delete(host.id);
        const dependents = this.dependentsOf(kind, host.id);
        if (dependents.length === 0) return;
        const items: WallAnchorReseatItem[] = dependents.map(({ family, rec }) => ({
            family, id: rec.id, op: 'detach',
            reason: `host ${kind} "${host.id}" removed — kept in place, detached (ADR-0374 §2.5)`,
        }));
        console.log(`${TAG} ${kind} "${host.id}" removed; ${items.length} anchored element(s) kept in place and detached.`);
        this.dispatch({ hostId: host.id, cause: 'host-removed', items }, kind);
    }

    // ── The write path — command-only (P6) ───────────────────────────────────
    private dispatch(payload: { hostId: string; cause: 'host-moved' | 'host-removed'; items: WallAnchorReseatItem[] }, kind: WallAnchor['hostKind']): void {
        const cm = this.commandManagerRef.current;
        if (!cm) {
            // Declared, audible REFUSAL — never a direct store write (P6 / check-no-direct-store-writes).
            console.warn(
                `${TAG} commandManager not available — ${payload.items.length} element(s) anchored to ${kind} ` +
                `"${payload.hostId}" NOT ${payload.cause === 'host-moved' ? 'reseated' : 'detached'}. This should never happen in normal operation.`,
            );
            return;
        }
        const cmd = new ReseatWallAnchoredElementsCommand(payload);
        const validation = cmd.canExecute(cm.getContext() as never);
        if (!validation.ok) {
            console.warn(`${TAG} reseat command refused for ${kind} "${payload.hostId}": ${validation.reason}`);
            return;
        }
        const reseats = payload.items.filter((i) => i.op === 'reseat').length;
        const detaches = payload.items.length - reseats;
        console.log(
            `${TAG} ${kind} "${payload.hostId}" ${payload.cause}: reseating ${reseats}, detaching ${detaches} — ` +
            `ONE STRUCTURAL_CASCADE child of the current gesture (one Ctrl+Z).`,
        );
        this.reentrant = true;
        try {
            cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' });
        } finally {
            this.reentrant = false;
        }
    }

    dispose(): void {
        for (const u of this.unsubscribes) u();
        this.unsubscribes.length = 0;
        this.dragMemo.clear();
    }
}
