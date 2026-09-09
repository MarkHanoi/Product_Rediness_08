/**
 * §EXPECTATION-IS-DERIVED-FROM-THE-LEDGER (founder 2026-09-09 · L-13275 · C13 §3.10)
 *
 * THE FOUNDER'S LOG, ON A CLEAN OPEN OF HIS OWN PROJECT:
 *   `[C13 VIOLATION] scene.foreignElement ×7 (spaceEnvelope_…)`
 *   `PERSIST103 restored 7 compound record(s): spaceEnvelope=7`
 *
 * Seven restored, seven accused. The audit was reporting this project's own envelopes as
 * survivors of a prior project — a **false positive on a P0 channel**, on the same day a
 * REAL leak of that same family was found and closed. Nothing was corrupted.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THE SIXTH RECURRENCE OF ONE SHAPE, AND THE FIRST ONE FIXED AT THE CAUSE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `ProjectLoader` built the audit's expected-id set from a HAND-WRITTEN list of
 * `__pushIds(s.<key>)` calls that had to stay in step with what the serializer actually
 * emits. It kept falling out of step, and the repo's own comments record every previous
 * time: §L-711 `lighting` · L-9948 `boundaryLines` · §PERSIST103 the five compounds ·
 * §COMPONENT-PLACE `components` · §C13-SCENE-ID-KEY `levels`. Each was fixed by adding a
 * line, which is why there was a sixth.
 *
 * ⛔ THE MISSING LINE WAS NEVER THE DEFECT. Two lists that must agree, with nothing checking
 * that they do, is the defect ([[same-rule-two-implementations]]) — and the guarding channel
 * stayed green throughout because it only ever measured one of them
 * ([[gate-blind-on-the-wrong-axis]]).
 *
 * The expectation is now DERIVED from `SNAPSHOT_FAMILY_COVERAGE`, so the default is inverted:
 * a family in the ledger is expected unless explicitly named as derived. This suite pins that
 * inversion, so the seventh recurrence — `bathroomPods` is already queued to be it — fails
 * here instead of in the founder's console.
 *
 * ✅ ESTABLISHES: every persisted family in the ledger is audited, or is named in the C13
 *    §3.10 derived-exclusion set; the exclusion set names only genuinely derived families.
 * ⛔ DOES NOT ESTABLISH: that the audit's scene-side reader finds those ids. That is the
 *    other half of the join, and it has its own arms.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SNAPSHOT_FAMILY_COVERAGE } from '../persistence/snapshotFamilyCoverage';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOADER = fs.readFileSync(
    path.resolve(HERE, '../persistence/ProjectLoader.ts'), 'utf8',
);

/** The loader with every comment stripped — so an arm cannot match its own rationale. */
const LOADER_CODE = LOADER
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

/** Families whose records are REBUILT at load, not restored one-for-one (C13 §3.10). */
const DERIVED_NOT_AUDITED = ['rooms', 'annotations'] as const;

describe('§EXPECTATION-IS-DERIVED-FROM-THE-LEDGER — the two lists cannot drift again', () => {
    it('⭐ the expectation is built by ITERATING the ledger, not by hand-listing keys', () => {
        // ⛔ Asserted against comment-stripped source. This repo has shipped source-text arms
        // that matched their own explanatory comment three times in one day; the construct is
        // the claim, never the prose describing it.
        expect(LOADER_CODE).toMatch(/for\s*\(\s*const\s+\w+\s+of\s+SNAPSHOT_FAMILY_COVERAGE\s*\)/);
        expect(LOADER_CODE).toContain('__pushIds(s[row.snapshotKey]);');
    });

    it('⭐ EVERY persisted family in the ledger is audited, or is named as derived', () => {
        // THE ARM THAT WOULD HAVE CAUGHT `spaceEnvelopes` — and that catches the seventh.
        // ⚠ A family counts as audited if the LEDGER LOOP covers it, OR if it is still
        // hand-listed. Both, deliberately — so deleting the loop does not silently pass this
        // arm on the strength of the loop's own existence. An earlier draft of this arm did
        // exactly that: its last predicate ignored the row entirely and was vacuously true
        // for every family, which is a green that measures nothing.
        const ledgerLoopPresent =
            /for\s*\(\s*const\s+\w+\s+of\s+SNAPSHOT_FAMILY_COVERAGE\s*\)/.test(LOADER_CODE)
            && LOADER_CODE.includes('__pushIds(s[row.snapshotKey]);');
        const missed = SNAPSHOT_FAMILY_COVERAGE
            .filter((r) => r.snapshotKey !== null)
            .filter((r) => !(DERIVED_NOT_AUDITED as readonly string[]).includes(r.snapshotKey!))
            .filter((r) => !(ledgerLoopPresent || LOADER_CODE.includes(`__pushIds(s.${r.snapshotKey})`)))
            .map((r) => r.snapshotKey);
        expect(missed, 'these persisted families would be reported as FOREIGN').toEqual([]);
    });

    it('⛔ `spaceEnvelopes` specifically — the family that cried wolf — is in the audited set', () => {
        const row = SNAPSHOT_FAMILY_COVERAGE.find((r) => r.storeKey === 'spaceEnvelope');
        expect(row, 'the ledger must still declare spaceEnvelope').toBeDefined();
        expect(row!.snapshotKey).toBe('spaceEnvelopes');
        expect(row!.status).toBe('persisted');
        expect((DERIVED_NOT_AUDITED as readonly string[]).includes('spaceEnvelopes')).toBe(false);
    });

    it('⛔ `bathroomPods` — the queued SEVENTH — is covered by the loop with no code change', () => {
        // It is in the ledger as `persisted`, it is not derived, and nothing hand-lists it.
        // Under the old scheme that combination WAS the bug. Under the loop it is just covered.
        const row = SNAPSHOT_FAMILY_COVERAGE.find((r) => r.storeKey === 'bathroomPod');
        if (!row) return;   // the row may be retired; its absence is not this suite's concern
        expect(row.snapshotKey).toBe('bathroomPods');
        expect((DERIVED_NOT_AUDITED as readonly string[]).includes('bathroomPods')).toBe(false);
        expect(LOADER_CODE).not.toContain('__pushIds(s.bathroomPods)');
    });

    it('the derived-exclusion set names ONLY genuinely derived families', () => {
        // ⚠ THE COUNTERWEIGHT. A too-WIDE exclusion set turns this defect inside out: the
        // audit stops watching a family that really is restored one-for-one, and a real leak
        // goes unreported. Every name here must be rebuilt at load, not restored.
        expect([...DERIVED_NOT_AUDITED].sort()).toEqual(['annotations', 'rooms']);
    });

    it('⛔ the previously hand-listed families are STILL expected — this must not narrow anything', () => {
        // The explicit `__pushIds` calls were kept alongside the loop deliberately: a
        // too-wide expectation misses a leak in one family, a too-narrow one accuses every
        // load. Keeping both fails in the safe direction. This arm pins that they stayed.
        for (const key of ['lighting', 'boundaryLines', 'lifts', 'components', 'levels']) {
            expect(LOADER_CODE, key).toContain(`__pushIds(s.${key})`);
        }
    });
});
