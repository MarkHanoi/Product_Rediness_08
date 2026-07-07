// @vitest-environment happy-dom
//
// §FIX-PROJECT-2ND-OPEN-ISOLATION (L-181) — regression guard.
//
// The founder-reported CRITICAL: opening/creating a SECOND project in one session
// left the project corrupted — most tellingly, the always-on §FEAT-PROJECT-ORIGIN
// blue datum sphere was ABSENT. Root cause: `ProjectOriginStore.reset()` (documented
// as "the canonical project-switch hook") was never called and the store was absent
// from the `projectScopeRegistry` that ClearProjectCommand iterates, so Project A's
// origin state (hidden / moved) bled into Project B and the marker never re-established.
//
// These tests assert the two defence-in-depth guarantees the fix wires in
// `initProjectOrigin`:
//   1. `projectOrigin` is a registered project scope, so ClearProjectCommand's
//      clearAll()/reseedAll() re-seed the datum on every open (1st and 2nd+).
//   2. `pryzm-project-switch` re-establishes a pristine, VISIBLE datum + re-paints
//      the always-on marker BEFORE Project B hydrates.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { projectOriginStore } from '@pryzm/stores';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { initProjectOrigin } from '../src/engine/initProjectOrigin';

// Minimal THREE-free scene stub — ProjectOriginMarker.attach() only calls add()/remove().
function makeFakeScene(): any {
    return { add: () => { /* noop */ }, remove: () => { /* noop */ } };
}

// Minimal runtime event bus so `window.runtime?.events?.on/emit` is live at the
// moment initProjectOrigin performs its one-time isolation wiring.
const _listeners: Record<string, Array<(p: unknown) => void>> = {};
function emit(name: string, payload?: unknown): void {
    (_listeners[name] ?? []).forEach((cb) => cb(payload));
}

beforeAll(() => {
    (window as unknown as { runtime: unknown }).runtime = {
        events: {
            on: (name: string, cb: (p: unknown) => void) => {
                (_listeners[name] ??= []).push(cb);
                return () => { /* unsubscribe noop */ };
            },
            emit,
        },
    };
    // First (and only, module-singleton) wiring pass — attaches the marker, registers
    // the scope, and subscribes the pryzm-project-switch re-establishment.
    initProjectOrigin(makeFakeScene());
});

beforeEach(() => {
    // Start each case from a pristine datum (as a brand-new project would).
    projectOriginStore.reset();
});

describe('§FIX-PROJECT-2ND-OPEN-ISOLATION — project-origin datum isolation (L-181)', () => {
    it('registers the projectOrigin scope with ProjectScopeRegistry', () => {
        expect(projectScopeRegistry.has('projectOrigin')).toBe(true);
    });

    it('re-seeds a Project-A-dirtied origin to pristine on the clear that opens Project B', () => {
        // Project A: the user hides + repositions the origin datum (P6 commands).
        projectOriginStore.setVisible(false);
        projectOriginStore.setPosition({ x: 7, y: 0, z: -3 });
        expect(projectOriginStore.getOrigin().visible).toBe(false);
        expect(projectOriginStore.getOrigin().position).toEqual({ x: 7, y: 0, z: -3 });

        // Opening Project B runs ClearProjectCommand → registry clearAll() + reseedAll().
        projectScopeRegistry.clearAll();
        projectScopeRegistry.reseedAll();

        const o = projectOriginStore.getOrigin();
        expect(o.visible).toBe(true);                     // sphere present again for B
        expect(o.position).toEqual({ x: 0, y: 0, z: 0 }); // datum back at world origin
    });

    it('re-establishes a pristine, visible datum on pryzm-project-switch (before B hydrates)', () => {
        // Project A dirties the datum, then the user switches to Project B.
        projectOriginStore.setVisible(false);
        projectOriginStore.setPosition({ x: 5, y: 0, z: 5 });

        emit('pryzm-project-switch', { projectId: 'project-b' });

        const o = projectOriginStore.getOrigin();
        expect(o.visible).toBe(true);
        expect(o.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('is idempotent across N sequential switches (every 2nd+ open stays pristine)', () => {
        for (let i = 0; i < 4; i++) {
            projectOriginStore.setVisible(false);
            projectOriginStore.setPosition({ x: i + 1, y: 0, z: i + 1 });
            emit('pryzm-project-switch', { projectId: `project-${i}` });
            const o = projectOriginStore.getOrigin();
            expect(o.visible, `switch #${i} must re-show the datum`).toBe(true);
            expect(o.position).toEqual({ x: 0, y: 0, z: 0 });
        }
    });
});
