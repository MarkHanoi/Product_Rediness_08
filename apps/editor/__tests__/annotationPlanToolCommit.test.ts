/**
 * §FIX-PLANANN-SUBSYSTEM-STORE-SINK (L-702) — the plan annotation commit chokepoint.
 *
 * WHAT THIS PINS, AND WHY IT FAILED BEFORE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AnnotationPlanToolHandlers._commit()` is the single seam through which sixteen plan
 * annotation tools create their element. It used to mint `crypto.randomUUID()` and dispatch
 * the full subsystem `AnnotationElement` at the bus verb `annotation.create`. Both halves
 * were fatal and both failed SILENTLY:
 *
 *   • the canonical `Annotation` schema brands its id `^annotation_<ULID>$`
 *     (`defineElement`, packages/schemas/src/base/BaseNode.ts), so `Annotation.parse` threw
 *     on every commit and the annotation was created NOWHERE;
 *   • and even with a valid id, `CreateAnnotationHandler` writes `AnnotationsState` — a
 *     store nothing renders, nothing persists and nothing exports.
 *
 * `LinearDimPlanToolHandler` already carried the correct path (§FIX-AUTODIM-SUBSYSTEM-
 * STORE-SINK, L-145 / ADR-0119) — which is exactly why the founder found linear dimension
 * "well behaved" and every other annotation tool broken. The fix was applied at one call
 * site and never travelled.
 *
 * These assertions are written against the OBSERVABLE COMMAND, not against the tool's
 * internals, so they stay true if the handler is refactored.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The two handlers below commit on a single click with NO modal in the way, so the whole
// create path is exercised synchronously without stubbing the input dialog.
import {
    LevelTagPlanToolHandler,
    NorthArrowPlanToolHandler,
} from '@app/engine/views/plantools/AnnotationPlanToolHandlers';

// ── Minimal PlanToolDrawContext double ───────────────────────────────────────────
function makeCtx(viewId = 'view_plan_L0') {
    const calls: string[] = [];
    const ctx2d = {
        setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
        beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
        moveTo: () => {}, lineTo: () => {}, strokeRect: () => {}, setLineDash: () => {},
        fillText: (t: string) => { calls.push(t); },
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
    };
    return {
        hintText: calls,
        ctx: ctx2d as unknown as CanvasRenderingContext2D,
        overlayCanvas: { width: 800, height: 600 } as HTMLCanvasElement,
        dpr: 1,
        planCanvas: { worldToScreen: (x: number, z: number) => ({ sx: x, sy: z }) },
        viewDef: { id: viewId },
    } as never;
}

/** Captures every command handed to `window.commandManager.execute`. */
function installCommandManager(result: { success?: boolean; error?: string } = { success: true }) {
    const executed: any[] = [];
    (globalThis as any).window = (globalThis as any).window ?? {};
    (window as any).commandManager = {
        execute: vi.fn((cmd: unknown) => { executed.push(cmd); return result; }),
    };
    return executed;
}

const ULID_ID = /^annotation_[0-9A-HJKMNP-TV-Z]{26}$/;

describe('§FIX-PLANANN-SUBSYSTEM-STORE-SINK — plan annotation commit', () => {
    beforeEach(() => {
        (globalThis as any).window = (globalThis as any).window ?? {};
        delete (window as any).commandManager;
        delete (window as any).runtime;
        delete (window as any).levelStore;
    });

    it('mints a schema-valid annotation_<ULID> id — NOT crypto.randomUUID()', () => {
        const executed = installCommandManager();
        const h = new NorthArrowPlanToolHandler();
        const c = makeCtx();
        h.activate(c);
        h.onClick({ worldX: 3, worldZ: 4 } as never);

        expect(executed, 'exactly one create command dispatched').toHaveLength(1);
        const el = (executed[0] as any)._element;
        expect(el, 'command carries the full AnnotationElement').toBeTruthy();
        expect(el.id).toMatch(ULID_ID);
        // The precise shape the OLD code produced, asserted as the thing that must not recur.
        expect(el.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    });

    it('routes through CommandManager (subsystem store + undo), not the bus verb', () => {
        const executed = installCommandManager();
        const busExecute = vi.fn(() => Promise.resolve({ success: true }));
        (window as any).runtime = { bus: { executeCommand: busExecute } };

        const h = new NorthArrowPlanToolHandler();
        const c = makeCtx();
        h.activate(c);
        h.onClick({ worldX: 0, worldZ: 0 } as never);

        expect((window as any).commandManager.execute).toHaveBeenCalledTimes(1);
        expect(executed[0].type, 'wire type is CREATE_ANNOTATION').toBe('CREATE_ANNOTATION');
        expect(executed[0].affectedStores, 'undo scope declared').toEqual(['annotation']);
        // The bus verb models a flat text-note; a plan annotation must never be sent there.
        expect(busExecute, 'no annotation.create bus dispatch').not.toHaveBeenCalled();
    });

    it('preserves the tool-specific type, owner view, parameters and model points', () => {
        const executed = installCommandManager();
        (window as any).levelStore = { getAll: () => [{ id: 'lvl0', name: 'Ground', elevation: 0 }] };

        const h = new LevelTagPlanToolHandler();
        const c = makeCtx('view_plan_GF');
        h.activate(c);
        h.onClick({ worldX: 12.5, worldZ: -3.25 } as never);

        const el = (executed[0] as any)._element;
        // The OLD path collapsed EVERY type to 'text-note' and EVERY view to '' — this is
        // the assertion that would have caught it.
        expect(el.type).toBe('level-tag');
        expect(el.ownerViewId).toBe('view_plan_GF');
        expect(el.parameters.levelName).toBe('Ground');
        expect(el.geometry2D.modelPoints[0]).toEqual({ x: 12.5, y: 0, z: -3.25 });
        expect(el.references).toHaveLength(1);
    });

    it('a REFUSAL reaches the user on the overlay instead of only the console', () => {
        installCommandManager({ success: false, error: 'annotation store not initialised' });
        const h = new NorthArrowPlanToolHandler();
        const c = makeCtx();
        h.activate(c);
        h.onClick({ worldX: 1, worldZ: 1 } as never);

        const painted = (c as any).hintText.join(' | ');
        expect(painted, 'the failure is painted, not swallowed').toContain('not created');
        expect(painted).toContain('annotation store not initialised');
    });

    it('refuses rather than half-creating when the command system is absent', () => {
        // No window.commandManager at all — early boot.
        const h = new NorthArrowPlanToolHandler();
        const c = makeCtx();
        h.activate(c);
        expect(() => h.onClick({ worldX: 1, worldZ: 1 } as never)).not.toThrow();
        expect((c as any).hintText.join(' | ')).toContain('command system not ready');
    });
});
