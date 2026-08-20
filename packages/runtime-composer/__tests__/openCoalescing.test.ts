/**
 * openCoalescing — §FIX-OPEN-COALESCE-KEYED-ON-NOTHING
 *
 * The de-duplication policy `buildPersistence.openProject` uses, asserted
 * directly. See `openCoalescing.ts` for the defect: the old guard was
 * `if (openProjectInflight !== null) return openProjectInflight;`, which
 * ignores `projectId` and therefore hands a caller who asked for B the promise
 * — and the outcome — of an open for A, then resolves as if it had succeeded.
 *
 * ─── STUB LEDGER ────────────────────────────────────────────────────────────
 *
 * Nothing is stubbed. `decideOpenDisposition` is a pure function over a
 * two-field state and imports nothing; this file exercises the real one.
 *
 * The end-to-end companion — `openProjectCoalescingKey.test.ts`, which drives
 * the REAL `buildPersistenceSlot` — is the stronger proof and it is deliberately
 * kept. It cannot run at the time of writing: another lane's uncommitted
 * `packages/geometry-lighting/src/LightingTypes.ts` throws
 * `LOD200_FLOOR_MOUNTED_IDS is not iterable` at module init, which breaks
 * collection for EVERY suite that imports the runtime barrels. That is reported,
 * not worked around.
 */

import { describe, expect, it } from 'vitest';
import { decideOpenDisposition } from '../src/openCoalescing.js';

const idle = { hasInflight: false, inflightProjectId: null };
const opening = (id: string) => ({ hasInflight: true, inflightProjectId: id });

describe('§FIX-OPEN-COALESCE-KEYED-ON-NOTHING — identity is compared BEFORE the promise is reused', () => {
    it('starts when nothing is in flight', () => {
        expect(decideOpenDisposition(idle, 'A')).toEqual({ kind: 'start' });
    });

    it('coalesces a genuine duplicate — the SAME project', () => {
        // The property L-1282 depends on: the four `launchWorkspace` call sites
        // must still collapse to one open, or every duplicate becomes a second
        // full engine load.
        expect(decideOpenDisposition(opening('A'), 'A')).toEqual({ kind: 'coalesce' });
    });

    it('⭐ SUPERSEDES a different project — it does NOT hand back the other open', () => {
        // THE ROW. The old code returned A's promise here, so the caller that
        // asked for B was told B had opened when A had.
        expect(decideOpenDisposition(opening('A'), 'B')).toEqual({
            kind: 'supersede',
            supersededProjectId: 'A',
        });
    });

    it('never coalesces when the in-flight identity is unknown', () => {
        // The incoherent state — an open running whose identity was never
        // recorded, which is exactly the pre-fix world. Coalescing is the branch
        // that returns the WRONG PROJECT, so it must not be the fallback.
        const d = decideOpenDisposition({ hasInflight: true, inflightProjectId: null }, 'B');
        expect(d.kind).toBe('supersede');
    });

    it('coalesce is reachable ONLY on an exact id match', () => {
        // Stated as a property rather than a case: for any in-flight id that is
        // not the requested one, the answer is never 'coalesce'. This is the
        // assertion that fails the moment someone reintroduces a key-less guard.
        for (const inflight of ['A', 'proj-1', 'proj-2', '', 'b']) {
            const d = decideOpenDisposition(opening(inflight), 'B');
            expect(d.kind, `inflight=${inflight}`).toBe(inflight === 'B' ? 'coalesce' : 'supersede');
        }
    });
});
