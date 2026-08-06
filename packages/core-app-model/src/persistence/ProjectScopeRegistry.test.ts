/**
 * ProjectScopeRegistry — L-224 §AUDIT-PROJECT-ISOLATION-E2E (B3 owner-registry).
 *
 * C13 §3.10 invariant: every switch-reset surface has a NAMED OWNER. For
 * module-singleton stores that owner is a ProjectScopeRegistry entry. This suite
 * proves the registry's contract AND demonstrates WHY the static gate
 * (scripts/check/check-project-isolation.mjs) is required: a store that never
 * registers a clear() is simply not wiped — its data would survive a project
 * switch. The runtime registry cannot detect the absentee (it holds no
 * reference to unregistered stores), which is exactly why the build-time gate
 * exists to fail on any serialized-but-unregistered store.
 */

import { describe, it, expect, vi } from 'vitest';
import { projectScopeRegistry } from './ProjectScopeRegistry';

describe('ProjectScopeRegistry — clearAll / reseedAll', () => {
    it('clears every registered scope and reports it', () => {
        const clearA = vi.fn();
        const clearB = vi.fn();
        projectScopeRegistry.register({ scopeName: 'l224_test_A', clear: clearA });
        projectScopeRegistry.register({ scopeName: 'l224_test_B', clear: clearB });

        const report = projectScopeRegistry.clearAll();

        expect(clearA).toHaveBeenCalledTimes(1);
        expect(clearB).toHaveBeenCalledTimes(1);
        expect(report.cleared).toEqual(expect.arrayContaining(['l224_test_A', 'l224_test_B']));
        expect(report.failures).toHaveLength(0);
    });

    it('runs reseed() only for scopes that declare it', () => {
        const reseed = vi.fn();
        projectScopeRegistry.register({ scopeName: 'l224_test_reseed', clear: () => {}, reseed });
        projectScopeRegistry.reseedAll();
        expect(reseed).toHaveBeenCalledTimes(1);
    });

    it('captures (does not throw) when a scope clear() throws', () => {
        projectScopeRegistry.register({
            scopeName: 'l224_test_throws',
            clear: () => { throw new Error('boom'); },
        });
        const report = projectScopeRegistry.clearAll();
        expect(report.failures.some(f => f.scope === 'l224_test_throws')).toBe(true);
    });
});

describe('§L-676-B — clearScopes (C13 §3.7 named-subset teardown)', () => {
    it('clears only the named scopes, leaving the rest for ClearProjectCommand', () => {
        const a = vi.fn(); const b = vi.fn();
        projectScopeRegistry.register({ scopeName: 'l676b_A', clear: a });
        projectScopeRegistry.register({ scopeName: 'l676b_B', clear: b });

        const report = projectScopeRegistry.clearScopes(['l676b_A']);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).not.toHaveBeenCalled();
        expect(report.cleared).toEqual(['l676b_A']);
        expect(report.failures).toHaveLength(0);
        expect(report.missing).toHaveLength(0);
    });

    it('a throwing scope is isolated — the later named scopes still clear', () => {
        const later = vi.fn();
        projectScopeRegistry.register({ scopeName: 'l676b_throws', clear: () => { throw new Error('boom'); } });
        projectScopeRegistry.register({ scopeName: 'l676b_later', clear: later });

        const report = projectScopeRegistry.clearScopes(['l676b_throws', 'l676b_later']);
        expect(later).toHaveBeenCalledTimes(1);
        expect(report.failures.map(f => f.scope)).toEqual(['l676b_throws']);
        expect(report.cleared).toEqual(['l676b_later']);
    });

    it('a name with NO registered owner is REPORTED, never silently treated as clean', () => {
        // §CONTEXT-DATA-HONESTY — "nothing to clear" and "the owner was never
        // registered" are the same value; L-676 is the second bug in this subsystem
        // caused by not distinguishing them.
        const report = projectScopeRegistry.clearScopes(['l676b_no_such_owner']);
        expect(report.missing).toEqual(['l676b_no_such_owner']);
        expect(report.cleared).toHaveLength(0);
    });
});

describe('ProjectScopeRegistry — B3 owner invariant', () => {
    it('refuses a scope with no scopeName (cannot be an owner)', () => {
        // @ts-expect-error — deliberately invalid registration
        projectScopeRegistry.register({ clear: () => {} });
        expect(projectScopeRegistry.has('')).toBe(false);
        expect(projectScopeRegistry.has(undefined as unknown as string)).toBe(false);
    });

    it('an UNREGISTERED store is never cleared — the gap the static gate guards', () => {
        const unregisteredClear = vi.fn();
        // NOTE: intentionally NOT registered. clearAll cannot know about it.
        projectScopeRegistry.clearAll();
        expect(unregisteredClear).not.toHaveBeenCalled();
        expect(projectScopeRegistry.has('l224_never_registered')).toBe(false);
    });
});
