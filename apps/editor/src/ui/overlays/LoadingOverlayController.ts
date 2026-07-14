/**
 * LoadingOverlayController.ts — ONE overlay, N producers.
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270, 2026-07-13).
 *
 * THE DEFECT THIS CLOSES: the frosted loading overlay existed, was good, and was wired
 * to EXACTLY ONE lifecycle — the batch coordinator. Entering the "3D globe" / "3D Site"
 * views (seconds of Cesium mount + tile streaming + GLB export + ground clamp) showed
 * NOTHING, and the user could fly the camera through a scene that was still assembling
 * itself. That is the same disease as L-262/263/264/265/268: a capability built for one
 * case and never carried across. The cure is NOT a second overlay — it is a REGISTRY.
 *
 * MODEL:
 *   • Producers open a SESSION (`begin`) and close it (`end`). The overlay is visible
 *     while ≥ 1 session is open — ref-counted, so a batch that fires DURING a view
 *     activation cannot dismiss the overlay out from under the activation.
 *   • The most recently begun session is the FOREGROUND one: it owns the title, label,
 *     progress and error state. When it ends, the previous session repaints its own
 *     last state (no flicker, no lost context).
 *   • `end()` on the LAST session hides the overlay. That is the ONLY way it hides:
 *     there is no timer anywhere in this file. Producers dismiss on a REAL signal.
 *   • `fail()` puts the overlay in the ERROR state with escape actions. The session
 *     stays open (the gate holds) until an action calls `end()` — so a never-arriving
 *     readiness signal surfaces as a visible, escapable error, NEVER an eternal spinner.
 *
 * C01 §2 — pure UI. The surface is injected, so the controller is unit-testable with a
 * fake surface in a DOM-free environment (the real DOM view is constructed lazily, on
 * the first `begin`).
 */

import { LoadingOverlayView } from './LoadingOverlayView';
import type { LoadingOverlayAction, LoadingOverlaySurface } from './LoadingOverlayView';

export interface LoadingSessionOptions {
    /** The bold headline — "Generating your model", "Opening the 3D globe". */
    readonly title: string;
    /** The phase line under it. */
    readonly label?: string;
}

export interface LoadingSession {
    readonly id: string;
    /** False once end() has run (idempotent). */
    readonly active: boolean;
    setTitle(title: string): void;
    setLabel(label: string): void;
    /** ABSOLUTE progress from this producer's own real signal. */
    setProgress(completed: number, total: number, note?: string): void;
    setIndeterminate(note?: string): void;
    /** Surface a failure with escape actions. The session stays open until end(). */
    fail(e: { title?: string; message: string; actions: readonly LoadingOverlayAction[] }): void;
    end(): void;
}

type PaintState =
    | { kind: 'progress'; completed: number; total: number; note?: string }
    | { kind: 'indeterminate'; note?: string }
    | { kind: 'error'; title: string; message: string; actions: readonly LoadingOverlayAction[] };

interface SessionRecord {
    id: string;
    title: string;
    label: string;
    paint: PaintState;
    active: boolean;
}

export class LoadingOverlayController {
    private surface: LoadingOverlaySurface | null = null;
    private readonly stack: SessionRecord[] = [];

    constructor(private readonly surfaceFactory: () => LoadingOverlaySurface) {}

    /** True while the overlay is up — i.e. while scene input is gated. */
    isBlocking(): boolean {
        return this.stack.length > 0;
    }

    /** Number of open sessions (producers currently working). */
    get activeCount(): number {
        return this.stack.length;
    }

    /** True when a session with this id is open (producers use it for idempotency). */
    has(id: string): boolean {
        return this.stack.some((s) => s.id === id);
    }

    begin(id: string, opts: LoadingSessionOptions): LoadingSession {
        const record: SessionRecord = {
            id,
            title: opts.title,
            label: opts.label ?? 'Preparing…',
            paint: { kind: 'indeterminate' },
            active: true,
        };
        const first = this.stack.length === 0;
        this.stack.push(record);

        const surface = this.ensureSurface();
        if (first) surface.show({ title: record.title, label: record.label });
        this.repaint();

        const controller = this;
        return {
            id,
            get active() {
                return record.active;
            },
            setTitle(title: string): void {
                record.title = title;
                if (controller.isForeground(record)) controller.repaint();
            },
            setLabel(label: string): void {
                record.label = label;
                if (controller.isForeground(record)) controller.repaint();
            },
            setProgress(completed: number, total: number, note?: string): void {
                if (record.paint.kind === 'error') return; // an error is terminal until end()
                record.paint = { kind: 'progress', completed, total, note };
                if (controller.isForeground(record)) controller.repaint();
            },
            setIndeterminate(note?: string): void {
                if (record.paint.kind === 'error') return;
                record.paint = { kind: 'indeterminate', note };
                if (controller.isForeground(record)) controller.repaint();
            },
            fail(e): void {
                record.paint = {
                    kind: 'error',
                    title: e.title ?? record.title,
                    message: e.message,
                    actions: e.actions,
                };
                // A failure always takes the foreground — it needs the user's decision.
                controller.bringToFront(record);
                controller.repaint();
            },
            end(): void {
                if (!record.active) return;
                record.active = false;
                controller.remove(record);
            },
        };
    }

    // ── internals ───────────────────────────────────────────────────────────

    private ensureSurface(): LoadingOverlaySurface {
        if (!this.surface) this.surface = this.surfaceFactory();
        return this.surface;
    }

    private isForeground(record: SessionRecord): boolean {
        return this.stack[this.stack.length - 1] === record;
    }

    private bringToFront(record: SessionRecord): void {
        const i = this.stack.indexOf(record);
        if (i < 0 || i === this.stack.length - 1) return;
        this.stack.splice(i, 1);
        this.stack.push(record);
    }

    private remove(record: SessionRecord): void {
        const i = this.stack.indexOf(record);
        if (i >= 0) this.stack.splice(i, 1);
        if (this.stack.length === 0) {
            // The LAST producer finished — and only then does the overlay come down.
            this.surface?.hide();
            return;
        }
        this.repaint();
    }

    private repaint(): void {
        const top = this.stack[this.stack.length - 1];
        if (!top || !this.surface) return;
        const surface = this.surface;
        if (top.paint.kind === 'error') {
            surface.showError({
                title: top.paint.title,
                message: top.paint.message,
                actions: top.paint.actions,
            });
            return;
        }
        surface.setTitle(top.title);
        surface.setLabel(top.label);
        if (top.paint.kind === 'progress') {
            surface.setProgress({
                completed: top.paint.completed,
                total: top.paint.total,
                note: top.paint.note,
            });
        } else {
            surface.setIndeterminate(top.paint.note);
        }
    }
}

/** Lazily-constructed process singleton — the ONE overlay every producer shares. */
let _singleton: LoadingOverlayController | null = null;

export function getLoadingOverlay(): LoadingOverlayController {
    if (!_singleton) {
        // The DOM view is constructed LAZILY (inside the factory, on the first begin()),
        // so importing this module in a DOM-free context is safe.
        _singleton = new LoadingOverlayController(() => new LoadingOverlayView());
    }
    return _singleton;
}

/** Test seam: install a controller backed by a fake surface. */
export function __setLoadingOverlayForTests(controller: LoadingOverlayController | null): void {
    _singleton = controller;
}
