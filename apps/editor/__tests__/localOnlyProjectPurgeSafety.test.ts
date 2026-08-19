/**
 * @vitest-environment happy-dom
 */
// localOnlyProjectPurgeSafety — §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289 / closes L-1288)
//
// ─── THE DEFECT ─────────────────────────────────────────────────────────────
//
// The founder's boot log carried ~50 × "Keeping local-only project … has
// unsaved local versions". Those projects are one sign-out from deletion:
//
//   • version history lives in IndexedDB `pryzm-project-versions`;
//   • `purgeUserScopedClientState` deletes EVERY `pryzm`-named database on
//     sign-out and on account switch (correctly — §AUTH-SESSION-LEAK);
//   • the metadata index `bim-projects-index` is NOT prefixed and SURVIVES;
//   • the next sync read `countVersions() === 0` and PURGED the rows.
//
// The index said "these exist", the data was gone, and the reconciler resolved
// the disagreement by deleting the survivors.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────
//
// §1 is the real `decideLocalOnlyProjectFate`, nothing substituted.
//
// §2 drives the REAL `purgeUserScopedClientState()` from `AuthModal.ts` — the
// actual sign-out purge, not a stand-in — over REAL `localStorage`, and asks the
// REAL `versionRepository.probeVersions()` and the REAL ruling what to do.
//
// ⚠ ONE ENVIRONMENT LIMIT, DECLARED, because ignoring it would have made this
// suite the very defect it closes. happy-dom ships NO IndexedDB, so
// `VersionCacheStore` disables itself and `saveVersions` takes its documented
// localStorage fallback — writing `bim-project-<id>-versions`, a NON-prefixed key
// the purge does not touch. Seeding history through `saveVersions` here would
// therefore produce a state in which THE DEFECT CANNOT OCCUR, and the suite would
// go green over a hazard it never reproduced — shape D again.
//
// So §2 does not seed through a write path that behaves differently here. It
// constructs the POST-SIGN-OUT STATE directly, exactly as production leaves it
// (index row surviving with `versionCount: 2`, no version payload anywhere), and
// pins WHY that state is reachable in production: `saveVersionsWithQuota` removes
// the legacy localStorage copy at write time when IDB is primary
// (ProjectRepository.ts:1266), which is precisely why the IDB copy is the ONLY
// one and why the purge destroys it. The purge's own name-selection rule is
// measured separately and for real in the first arm.
//
// The falsification is built in: §2 asserts the OLD predicate
// (`countVersions(PID) > 0 === false`) on the same state that the NEW ruling
// refuses — so the test carries both the bug and the fix in one place.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    decideLocalOnlyProjectFate,
    type VersionProbe,
} from '../src/ui/platform/localOnlyProjectFate.js';
import { purgeUserScopedClientState } from '../src/ui/platform/AuthModal.js';
import { versionRepository } from '../src/ui/platform/ProjectRepository.js';
import { getVersionCacheStore } from '../src/ui/platform/VersionCacheStore.js';

const counted = (count: number): VersionProbe => ({ kind: 'counted', count });

// ─── 1 · The ruling, exhaustively ───────────────────────────────────────────

describe('L-1289 §1 — a reconciler never treats "cannot find" as "user deleted"', () => {
    it('KEEPS a project whose store genuinely holds versions', () => {
        const f = decideLocalOnlyProjectFate({
            projectId: 'p1', indexVersionCount: 3, probe: counted(3),
        });
        expect(f.action).toBe('keep');
    });

    it('⭐ REFUSES when the index claims versions and the store has none — THE SIGN-OUT SIGNATURE', () => {
        // This is the exact state `purgeUserScopedClientState` leaves behind, and
        // the exact input on which the old code called `deleteIds.push`.
        const f = decideLocalOnlyProjectFate({
            projectId: 'p2', indexVersionCount: 12, probe: counted(0),
        });
        expect(f.action).toBe('refuse');
        expect(f).toMatchObject({ reason: 'index-claims-versions-store-has-none' });
    });

    it('REFUSES on every unreadable reason, without consulting any count', () => {
        // Order is load-bearing: a failed instrument must not reach a branch that
        // reasons about numbers it did not produce. Note indexVersionCount is 0
        // here — the "agree empty" branch would otherwise PURGE.
        for (const reason of ['cache-not-warmed', 'store-threw', 'payload-undecodable'] as const) {
            const f = decideLocalOnlyProjectFate({
                projectId: 'p3', indexVersionCount: 0, probe: { kind: 'unreadable', reason },
            });
            expect(f.action, reason).toBe('refuse');
            expect(f, reason).toMatchObject({ reason: 'store-unreadable' });
        }
    });

    it('REFUSES when the index row predates versionCount stamping — unknown is not zero', () => {
        // The residual gap of this module's OWN defect shape, closed deliberately:
        // a legacy row carries no `versionCount`, and `?? 0` would have collapsed
        // that missing reading into a meaningful one and purged the project.
        const f = decideLocalOnlyProjectFate({
            projectId: 'p6', indexVersionCount: undefined, probe: counted(0),
        });
        expect(f.action).toBe('refuse');
        expect(f).toMatchObject({ reason: 'index-version-count-unknown' });
    });

    it('PURGES only when BOTH authorities agree there is nothing', () => {
        const f = decideLocalOnlyProjectFate({
            projectId: 'p4', indexVersionCount: 0, probe: counted(0),
        });
        expect(f.action).toBe('purge');
    });

    it('a count of 0 is NEVER on its own sufficient to purge', () => {
        // The property the whole module exists to guarantee, stated as a property
        // rather than as a case: for every index count > 0, a zero read refuses.
        for (const n of [1, 2, 5, 20]) {
            expect(decideLocalOnlyProjectFate({
                projectId: 'p5', indexVersionCount: n, probe: counted(0),
            }).action).toBe('refuse');
        }
    });
});

// ─── 2 · Through the REAL sign-out purge ───────────────────────────

describe('L-1289 §2 — the REAL purge, and the state it leaves behind', () => {
    beforeEach(() => { localStorage.clear(); });

    it('⭐ the purge rule that SPARES the index is the same rule that DOOMS the version store', async () => {

        // Two keys, one purge. This asymmetry IS the defect — not a side effect of
        // it. `purgeUserScopedClientState` selects by NAME, and the two stores were
        // named on different sides of the line it draws.
        localStorage.setItem('pryzm-something-user-scoped', 'x');
        localStorage.setItem('bim-projects-index', JSON.stringify([
            { id: 'proj-1', name: 'Offline work', updatedAt: 1, versionCount: 2 },
        ]));

        purgeUserScopedClientState('test-signout');

        expect(localStorage.getItem('pryzm-something-user-scoped')).toBeNull();
        // The index SURVIVES — correctly: it is deliberately multi-user and
        // owner-filtered at read (`listProjects`, Contract 45 §7.2), so purging it
        // would delete OTHER signed-in users' rows on this browser. The asymmetry
        // is right; resolving it by DELETION was the bug.
        expect(localStorage.getItem('bim-projects-index')).not.toBeNull();
    });

    it('⭐ on the exact post-sign-out state, the OLD predicate purges and the NEW ruling refuses', async () => {

        const PID = 'proj-1755000000000-SURVIVE';

        // THE POST-SIGN-OUT STATE, constructed as production leaves it: the index
        // row survives claiming 2 versions, and NO version payload exists anywhere
        // — `pryzm-project-versions` was deleted by the purge, and the legacy
        // localStorage copy was already removed at write time by
        // `saveVersionsWithQuota` ("drop any stale legacy localStorage copy",
        // ProjectRepository.ts:1266) precisely because IDB is the primary store.
        // That removeItem is why sign-out destroys the ONLY copy in production.
        localStorage.setItem('bim-projects-index', JSON.stringify([
            { id: PID, name: 'Offline work', updatedAt: Date.now(), versionCount: 2 },
        ]));

        // The store must be WARMED, or the probe would refuse for the other
        // reason and this test would pass without exercising the contradiction.
        await getVersionCacheStore().warm();
        expect(getVersionCacheStore().isWarmed()).toBe(true);

        // ── THE FALSIFICATION, BUILT IN ──
        // The predicate the old code used, on this exact state:
        expect(versionRepository.countVersions(PID) > 0).toBe(false);
        //   ⇒ `hasLocalVersions` false ⇒ `deleteIds.push(lp.id)` ⇒ THE PROJECT WAS
        //   DELETED. That is the founder's ~50 projects, gone on the sync after a
        //   sign-out. The assertion above is the bug, pinned.

        // The new read reports the same number but is now ANSWERABLE against a
        // second authority rather than acted on alone.
        const probe = versionRepository.probeVersions(PID);
        expect(probe).toEqual({ kind: 'counted', count: 0 });

        const index = JSON.parse(localStorage.getItem('bim-projects-index')!);
        const fate = decideLocalOnlyProjectFate({
            projectId: PID,
            indexVersionCount: index[0].versionCount,
            probe,
        });
        expect(fate.action).toBe('refuse');
        expect(fate).toMatchObject({ reason: 'index-claims-versions-store-has-none' });
    });

    it('an UNWARMED store refuses too — the purge is not the only way to read zero', async () => {
        // Measured while writing this row: `warmVersionCache()` is awaited inside
        // `try {} catch {}` in `ProjectHub._warmThenSync`. If it THREW — IndexedDB
        // blocked, private browsing, quota — the sync ran anyway and every
        // local-only project read 0 and was purged, with NO sign-out involved.
        const store = getVersionCacheStore();
        const original = store.isWarmed.bind(store);
        try {
            (store as unknown as { isWarmed: () => boolean }).isWarmed = () => false;
            const probe = versionRepository.probeVersions('proj-unwarmed');
            expect(probe).toEqual({ kind: 'unreadable', reason: 'cache-not-warmed' });
            expect(decideLocalOnlyProjectFate({
                projectId: 'proj-unwarmed', indexVersionCount: 0, probe,
            }).action).toBe('refuse');
        } finally {
            (store as unknown as { isWarmed: () => boolean }).isWarmed = original;
        }
    });
});
