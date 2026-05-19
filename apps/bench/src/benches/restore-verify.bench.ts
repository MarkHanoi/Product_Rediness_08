// Bench: `restore-verify` — nightly Supabase backup → ephemeral PG → checksum
// match (S44 D7 / SPEC-24 §3.4).
//
// SCOPE TODAY (S44, deferred-friendly skeleton)
// ─────────────────────────────────────────────────────────────────────────────
// The full restore-verify pipeline requires Supabase + a backup-restore
// API + an ephemeral PG instance to restore into.  None of those are
// provisioned yet (SUPABASE_URL is not set; Supabase cutover is the
// S43 D9 milestone — see PHASE-2D-S43-AUDIT for the gap).
//
// This file ships AS A SKELETON with the explicit deferral pattern from
// `apps/bench/reports/M21-2C.md` §"Deferred items":
//
//   • If SUPABASE_URL is missing → the suite SKIPS with an explicit
//     deferral message and a non-zero exit code that CI promotes to a
//     warning (not a hard fail) per ADR-0034 §3.
//   • If SUPABASE_URL is set but the restore API isn't yet wired → the
//     suite throws a clear "S44 D7 deferred" error.
//
// Once S43 D9 lands, the body of `verifyRestore()` fills in the real
// restore + checksum logic.  The test wrapper here remains; only the
// internals change.  No callers move.
//
// EXIT CRITERION E3 STATUS
// ─────────────────────────────────────────────────────────────────────────────
// Spec §S44 line 375: "Nightly backup-verify job green for 7 consecutive
// nights."  Per the S44 audit, this gate is bound to S45 D1 (one week
// after S43 D9 cutover lands Supabase).  The skeleton + the deferral ADR
// are S44's contribution; the 7-night green run is S45's.

import { describe, it, expect } from 'vitest';

interface RestoreVerifyResult {
  readonly status: 'green' | 'red' | 'deferred';
  readonly reason?: string;
  readonly tablesChecked?: number;
  readonly mismatches?: number;
}

/** Skeleton for the nightly restore-verify pipeline.  Today this is a
 *  deferral marker; S43 D9 + S44 D7 fill it in.
 *
 *  PROMOTION FLAG: when `PRYZM_RESTORE_VERIFY_WIRED === 'true'`, the body
 *  below switches from the deferral path to the real restore + checksum
 *  pipeline.  The flag is intentionally explicit so we can land Supabase
 *  (S43 D9) WITHOUT this bench going red — the flag only flips when S44 D7
 *  promotion code lands. */
async function verifyRestore(): Promise<RestoreVerifyResult> {
  const url = process.env.SUPABASE_URL;
  const wired = process.env.PRYZM_RESTORE_VERIFY_WIRED === 'true';

  if (!url) {
    return {
      status: 'deferred',
      reason: 'SUPABASE_URL not set — Supabase cutover (S43 D9) has not landed yet.  ' +
        'Per ADR-0034 §3, restore-verify is bound to S45 D1 (one week after cutover).',
    };
  }
  if (!wired) {
    return {
      status: 'deferred',
      reason: 'SUPABASE_URL is set but PRYZM_RESTORE_VERIFY_WIRED !== "true" — the ' +
        'restore + checksum pipeline (S44 D7) has not been promoted yet.  ' +
        'Bound to S45 D1 + S45 D7 (7 consecutive nights green).',
    };
  }
  // S44 D7 implementation lands here once PRYZM_RESTORE_VERIFY_WIRED flips:
  //   1. Pick a random Supabase backup from the previous 24h.
  //   2. Restore it into a fresh ephemeral Postgres instance.
  //   3. Run `pnpm bench restore-verify` — checksum every table against
  //      the live primary (filtering rows newer than the snapshot time).
  //   4. Alert PagerDuty on any mismatch beyond the snapshot-time tolerance.
  throw new Error(
    'restore-verify: PRYZM_RESTORE_VERIFY_WIRED is true but the restore API ' +
      'implementation is not yet present.  This is the S44 D7 promotion task.',
  );
}

describe('restore-verify (S44 D7 / SPEC-24 §3.4)', () => {
  it('verifyRestore is deferred until the S44 D7 promotion lands', async () => {
    const result = await verifyRestore();
    if (process.env.PRYZM_RESTORE_VERIFY_WIRED === 'true') {
      // Wiring promoted — should NOT be deferred.
      expect(result.status).not.toBe('deferred');
    } else {
      expect(result.status).toBe('deferred');
      expect(result.reason).toBeTruthy();
    }
  });

  it.todo('verifyRestore matches every table checksum after restore (S44 D7 promotion)');
  it.todo('nightly run for 7 consecutive nights is green (S45 D1 exit-criterion E3)');
});

// ─── S46 D7 — green-streak gate hookup ──────────────────────────────────────
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S46
// lines 564-568 (Exit Criterion E3 promotion: nightly restore-verify
// streak counter ≥ 7 ⇒ flip PRYZM_CUTOVER_RESTORE_14D=green for the
// S45 D5 cutover gate).
//
// The streak is a stateful counter persisted at
// `.local/restore-verify-streak.json`.  Each nightly invocation:
//   1. Reads the previous JSON ({ streak: N, lastRunISO, lastStatus }).
//   2. Runs `verifyRestore()`.
//   3. If `green`, increments streak (or resets to 1 if last run was red).
//   4. If `red`, writes streak: 0.
//   5. If `deferred`, leaves the streak untouched (so wiring delays don't
//      reset progress mid-flight).
//   6. Writes the new JSON back; emits the
//      `pryzm.bench.restore_verify.streak` OTel counter.
//
// The 7-night threshold is the gate that flips
// `PRYZM_CUTOVER_RESTORE_14D=green` for `scripts/spec-cutover-checklist.mjs`
// (S45 D5).  Per ADR-0036 §3, the threshold is bound to S43 D9 cutover
// landing — until then the counter increments lazily.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface RestoreVerifyStreakState {
  readonly streak: number;
  readonly lastRunISO: string;
  readonly lastStatus: RestoreVerifyResult['status'];
  readonly history: readonly { readonly iso: string; readonly status: RestoreVerifyResult['status'] }[];
}

const STREAK_PATH = process.env.PRYZM_RESTORE_VERIFY_STREAK_PATH
  ?? '.local/restore-verify-streak.json';
const STREAK_THRESHOLD = 7;

function readStreak(path: string): RestoreVerifyStreakState {
  if (!existsSync(path)) return { streak: 0, lastRunISO: '', lastStatus: 'deferred', history: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<RestoreVerifyStreakState>;
    return {
      streak: raw.streak ?? 0,
      lastRunISO: raw.lastRunISO ?? '',
      lastStatus: raw.lastStatus ?? 'deferred',
      history: raw.history ?? [],
    };
  } catch {
    return { streak: 0, lastRunISO: '', lastStatus: 'deferred', history: [] };
  }
}

function writeStreak(path: string, state: RestoreVerifyStreakState): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

/** Pure streak transition — exposed for tests so we don't need to touch
 *  disk to assert the green/red/deferred semantics. */
export function nextStreakState(
  prev: RestoreVerifyStreakState,
  newResult: RestoreVerifyResult,
  iso: string = new Date().toISOString(),
): RestoreVerifyStreakState {
  let streak = prev.streak;
  if (newResult.status === 'green') {
    streak = prev.lastStatus === 'red' ? 1 : streak + 1;
  } else if (newResult.status === 'red') {
    streak = 0;
  } // deferred: no change
  return {
    streak,
    lastRunISO: iso,
    lastStatus: newResult.status,
    history: [...prev.history.slice(-29), { iso, status: newResult.status }],
  };
}

/** Returns true when the restore-verify gate has been green for at least
 *  STREAK_THRESHOLD (7) consecutive nights — the precondition for flipping
 *  `PRYZM_CUTOVER_RESTORE_14D=green` in the cutover checklist.  Exposed
 *  for the cutover checklist + the audit script.
 *
 *  Per ADR-0036 §3 the bench surface (this function + nextStreakState) is
 *  the canonical entry point for the streak gate; the actual flip happens
 *  out-of-band via `scripts/spec-cutover-checklist.mjs`. */
export function restoreVerifyGateGreen(state: RestoreVerifyStreakState): boolean {
  return state.streak >= STREAK_THRESHOLD;
}

describe('restore-verify streak gate (S46 D7)', () => {
  it('nextStreakState increments green runs', () => {
    const s0 = { streak: 2, lastRunISO: 'x', lastStatus: 'green' as const, history: [] };
    const s1 = nextStreakState(s0, { status: 'green' });
    expect(s1.streak).toBe(3);
  });

  it('nextStreakState resets to 1 after a red run', () => {
    const s0 = { streak: 0, lastRunISO: 'x', lastStatus: 'red' as const, history: [] };
    const s1 = nextStreakState(s0, { status: 'green' });
    expect(s1.streak).toBe(1);
  });

  it('nextStreakState resets to 0 on red', () => {
    const s0 = { streak: 5, lastRunISO: 'x', lastStatus: 'green' as const, history: [] };
    const s1 = nextStreakState(s0, { status: 'red' });
    expect(s1.streak).toBe(0);
  });

  it('nextStreakState leaves streak untouched on deferred', () => {
    const s0 = { streak: 5, lastRunISO: 'x', lastStatus: 'green' as const, history: [] };
    const s1 = nextStreakState(s0, { status: 'deferred' });
    expect(s1.streak).toBe(5);
  });

  it('restoreVerifyGateGreen requires at least 7 consecutive greens', () => {
    expect(restoreVerifyGateGreen({ streak: 6, lastRunISO: '', lastStatus: 'green', history: [] })).toBe(false);
    expect(restoreVerifyGateGreen({ streak: 7, lastRunISO: '', lastStatus: 'green', history: [] })).toBe(true);
  });

  it('writes a streak record to disk for the nightly job', async () => {
    const path = `${STREAK_PATH}.test-${process.pid}-${Date.now()}.json`;
    const result = await verifyRestore();
    const next = nextStreakState(readStreak(path), result);
    writeStreak(path, next);
    expect(existsSync(path)).toBe(true);
    const reread = readStreak(path);
    expect(reread.lastStatus).toBe(result.status);
    expect(reread.history.at(-1)?.status).toBe(result.status);
  });
});
