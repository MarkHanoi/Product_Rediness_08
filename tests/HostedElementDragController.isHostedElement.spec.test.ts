/**
 * Phase 5 / T4 — HostedElementDragController.isHostedElement() unit test
 *
 * Contracts tested:
 *   C15 §12 — PascalCase + toLowerCase rule for hosted-element detection
 *
 * `isHostedElement()` must:
 *   1. Accept `userData.elementType = 'Window'` (PascalCase — what scene builders emit)
 *   2. Accept `userData.elementType = 'Door'`   (PascalCase)
 *   3. Accept `userData.elementType = 'window'` (lowercase — defensive)
 *   4. Accept `userData.elementType = 'door'`   (lowercase — defensive)
 *   5. Reject  `userData.elementType = 'Wall'`
 *   6. Reject  `userData.elementType = undefined`
 *
 * Enforcement levels:
 *   1. Static (this file) — source-grep checks for `.toLowerCase()` and the two
 *      accepted types in the private `isHostedElement` method.
 *   2. TypeScript — build gate
 *   3. Runtime (future) — vitest unit test (template below); requires
 *      three.js to be available in the test environment.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const CTRL_PATH = resolve(
    __dirname,
    '../packages/input-host/src/HostedElementDragController.ts',
);

export const HostedElementIsHostedSpec = {
    contract: 'C15 §12 / T4 — isHostedElement PascalCase + toLowerCase rule',
    enforcedBy: [
        'packages/input-host/src/HostedElementDragController.ts (private isHostedElement)',
        'tests/HostedElementDragController.isHostedElement.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        'isHostedElement() calls .toLowerCase() on userData.elementType (case-insensitive).',
        'isHostedElement() accepts the string literal "door" after normalisation.',
        'isHostedElement() accepts the string literal "window" after normalisation.',
        'isHostedElement() is a private method on HostedElementDragController.',
        'The method uses optional chaining (userData?.elementType) to guard undefined.',
    ],
} as const;

export function runHostedElementIsHostedChecks(): void {
    const src = readFileSync(CTRL_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[HostedElementIsHostedSpec] Missing "${needle}" in HostedElementDragController.ts — ${why}`,
            );
        }
    };

    must(
        /private\s+isHostedElement/,
        'isHostedElement must be a private method on the class',
    );

    must(
        /userData\?\.elementType.*toLowerCase\(\)|\.toLowerCase\(\).*userData/,
        'isHostedElement must use .toLowerCase() for PascalCase → lowercase normalisation',
    );

    must(
        "'door'",
        'isHostedElement must explicitly match "door" type after toLowerCase()',
    );

    must(
        "'window'",
        'isHostedElement must explicitly match "window" type after toLowerCase()',
    );

    must(
        /userData\?\.elementType/,
        'isHostedElement must use optional chaining (userData?.elementType) to guard undefined',
    );
}

/* ─── Vitest unit template (uncomment when three.js is available in test env) ──

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

// HostedElementDragController.isHostedElement is private, so we test it through
// the public interface: if obj is NOT hosted, handleDragStart returns immediately.
// We use a subclass to expose the private method for direct testing.

class TestableController extends (
    await import('../packages/input-host/src/HostedElementDragController')
).HostedElementDragController {
    testIsHosted(obj: THREE.Object3D): boolean {
        return (this as any).isHostedElement(obj);
    }
}

describe('C15 §12 / T4 — isHostedElement PascalCase + toLowerCase rule', () => {
    it('passes all static source invariants', () => {
        expect(() => runHostedElementIsHostedChecks()).not.toThrow();
    });

    let ctrl: TestableController;
    beforeEach(() => { ctrl = new TestableController(() => undefined, () => undefined); });

    const makeGroup = (elementType: unknown) => {
        const g = new THREE.Group();
        g.userData.elementType = elementType;
        return g;
    };

    it('returns true for PascalCase Window', () => {
        expect(ctrl.testIsHosted(makeGroup('Window'))).toBe(true);
    });

    it('returns true for PascalCase Door', () => {
        expect(ctrl.testIsHosted(makeGroup('Door'))).toBe(true);
    });

    it('returns true for lowercase window', () => {
        expect(ctrl.testIsHosted(makeGroup('window'))).toBe(true);
    });

    it('returns true for lowercase door', () => {
        expect(ctrl.testIsHosted(makeGroup('door'))).toBe(true);
    });

    it('returns false for Wall', () => {
        expect(ctrl.testIsHosted(makeGroup('Wall'))).toBe(false);
    });

    it('returns false for undefined elementType', () => {
        expect(ctrl.testIsHosted(makeGroup(undefined))).toBe(false);
    });
});

──────────────────────────────────────────────────────────────────────────── */
