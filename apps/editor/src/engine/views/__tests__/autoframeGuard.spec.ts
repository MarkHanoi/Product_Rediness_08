import { describe, it, expect, afterEach } from 'vitest';
import {
    isDrawToolActive,
    shouldSuppressAutoFrameWhileDrawing,
} from '../autoframeGuard';

describe('autoframeGuard — §AUTOFRAME-NO-HIJACK-WHILE-DRAWING', () => {
    describe('isDrawToolActive (pure)', () => {
        it('returns false for a null/undefined probe (fail-open — do not suppress)', () => {
            expect(isDrawToolActive(null)).toBe(false);
            expect(isDrawToolActive(undefined)).toBe(false);
        });

        it('prefers isAnyToolActive() when present', () => {
            expect(isDrawToolActive({ isAnyToolActive: () => true })).toBe(true);
            expect(isDrawToolActive({ isAnyToolActive: () => false })).toBe(false);
        });

        it('falls back to getActiveTool() when isAnyToolActive is absent', () => {
            expect(isDrawToolActive({ getActiveTool: () => 'wall' })).toBe(true);
            expect(isDrawToolActive({ getActiveTool: () => 'none' })).toBe(false);
            expect(isDrawToolActive({ getActiveTool: () => '' })).toBe(false);
        });

        it('treats any non-"none" tool id as drawing (wall/slab/door/etc.)', () => {
            for (const tool of ['wall', 'slab', 'door', 'window', 'column', 'beam', 'stair']) {
                expect(isDrawToolActive({ getActiveTool: () => tool })).toBe(true);
            }
        });

        it('returns false when the probe exposes neither method', () => {
            expect(isDrawToolActive({})).toBe(false);
        });
    });

    describe('shouldSuppressAutoFrameWhileDrawing (reads window.toolManager)', () => {
        afterEach(() => {
            delete (globalThis as { toolManager?: unknown }).toolManager;
        });

        it('returns false when no toolManager global is present', () => {
            expect(shouldSuppressAutoFrameWhileDrawing()).toBe(false);
        });

        it('suppresses when a draw tool is active', () => {
            (globalThis as { toolManager?: unknown }).toolManager = { isAnyToolActive: () => true };
            expect(shouldSuppressAutoFrameWhileDrawing()).toBe(true);
        });

        it('does NOT suppress when no tool is active (allows explicit zoom paths)', () => {
            (globalThis as { toolManager?: unknown }).toolManager = { isAnyToolActive: () => false };
            expect(shouldSuppressAutoFrameWhileDrawing()).toBe(false);
        });
    });
});
