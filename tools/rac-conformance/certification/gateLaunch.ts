// ─── gateLaunch.ts — a LAUNCH FAILURE is not a VERDICT ───────────────────────
//
// §CONTEXT-DATA-HONESTY (L-581 / L-616): a failure and an emptiness must never
// share a value. This module exists because certify.ts violated that rule for
// three weeks without anyone being able to see it.
//
// WHAT HAPPENED. certify.ts spawns every Wave-3 gate and recorded `r.status ?? 2`
// straight into `results/certify.json`'s `gates` map — the field every reader
// treats as "the check's verdict under contract.ts (0 clean · 1 declared · 2
// misconfigured · 3 ratchet exceeded)". The baseline committed 2026-08-17 holds
// **3221225794** for EIGHT gates. That number is 0xC0000142 =
// STATUS_DLL_INIT_FAILED: Windows could not START the child process. None of the
// eight checks ran. For three weeks the committed baseline read as though they had,
// because a crash and a verdict shared one field and the only way to tell them
// apart was to decode a Windows NTSTATUS by hand. (Measured 2026-09-10 on the
// founder's box: a child doing `process.exit(0xC0000142)` reaches `spawnSync` as
// `status=3221225794 signal=null error=null` — exactly the recorded value.)
//
// Worse, `certify.ts`'s `worst()` ranked codes through a lookup table; an unknown
// code had no rank, the comparison read `undefined >= n` → false, and the
// crash value simply REPLACED the running exit code. The run's own `exitCode`
// became 3221225794 too.
//
// THE RULE, in one place so nothing re-derives it:
//   • a spawn error, a signal death, or an exit code outside the four-code
//     contract is LAUNCH_FAILED — recorded WITH the raw status and a decoded
//     hint, in its own field, never as a number in the verdict field;
//   • ONLY 0, 1, 2, 3 are verdicts.
// A launch failure folds into the run as MISCONFIGURED (exit 2) — the harness,
// not the subject, is broken — and MISCONFIGURED is never absorbable as debt
// (§MISCONFIG-IS-NEVER-DEBT, L-811).
//
// KNOWN BLIND SPOT, stated rather than padded away: on win32 a child killed by
// TerminateProcess (process.kill SIGKILL, Task Manager, the OS under memory
// pressure) reports exit code 1 with no signal — measured 2026-09-10:
// `process.kill(pid,'SIGKILL')` → `status=1 signal=null`. From the parent that is
// indistinguishable from DECLARED-LEVEL. The gate's own stdout (no `→ [n]`
// headline) is the only evidence, and this module does not read stdout.

import { EXIT_CLEAN, EXIT_DECLARED, EXIT_MISCONFIGURED, EXIT_RATCHET_EXCEEDED, type ExitCode } from './contract.js';

/** The subset of `SpawnSyncReturns` this classifier reads. */
export interface LaunchStatus {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | string | null;
  readonly error?: unknown;
}

export interface LaunchFailure {
  readonly outcome: 'LAUNCH_FAILED';
  /** The raw exit status, verbatim — never coerced into a contract code. */
  readonly status: number | null;
  readonly signal: string | null;
  readonly error: string | null;
  /** A decoded reading of `status`, for the human who has to act on it. */
  readonly hint: string;
}

export interface LaunchVerdict {
  readonly outcome: 'VERDICT';
  readonly code: ExitCode;
}

export type LaunchClassification = LaunchVerdict | LaunchFailure;

/** The verdict field's legal values in `certify.json`: a contract code, or a NAMED non-verdict. */
export type RecordedGateOutcome = ExitCode | 'LAUNCH_FAILED' | 'SCRIPT_MISSING';

const CONTRACT_CODES: ReadonlySet<number> = new Set([EXIT_CLEAN, EXIT_DECLARED, EXIT_MISCONFIGURED, EXIT_RATCHET_EXCEEDED]);

export function isContractCode(n: unknown): n is ExitCode {
  return typeof n === 'number' && CONTRACT_CODES.has(n);
}

/** Windows NTSTATUS values a crashed Node child commonly surfaces as its exit code. */
const NTSTATUS_HINTS: Readonly<Record<number, string>> = {
  0xC0000142: 'STATUS_DLL_INIT_FAILED — a DLL the process needed refused to initialise (desktop-heap / session exhaustion, a broken native module, or a locked-down runner). The process never reached JavaScript.',
  0xC0000135: 'STATUS_DLL_NOT_FOUND — a DLL the process needed is missing. The process never reached JavaScript.',
  0xC0000005: 'STATUS_ACCESS_VIOLATION — the process crashed on a bad memory access.',
  0xC0000409: 'STATUS_STACK_BUFFER_OVERRUN — abort() / fail-fast inside the process (V8 heap exhaustion surfaces this way on win32).',
  0xC00000FD: 'STATUS_STACK_OVERFLOW.',
  0xC0000017: 'STATUS_NO_MEMORY — the process ran out of memory.',
  0xC000013A: 'STATUS_CONTROL_C_EXIT — the process was interrupted (Ctrl+C / console closed).',
};

/** POSIX "128 + signal" exit codes a shell reports for a signalled child. */
const POSIX_SIGNAL_HINTS: Readonly<Record<number, string>> = {
  134: 'SIGABRT (128+6) — abort(); on Node typically V8 heap exhaustion or a fatal assertion.',
  137: 'SIGKILL (128+9) — killed; typically the OOM killer.',
  139: 'SIGSEGV (128+11) — segmentation fault.',
  143: 'SIGTERM (128+15) — terminated.',
};

function hintFor(status: number): string {
  if (status >= 0x80000000) {
    const known = NTSTATUS_HINTS[status >>> 0];
    return `Windows NTSTATUS 0x${(status >>> 0).toString(16).toUpperCase()} (${status}) — ` +
      (known ?? 'not a code this table knows; look it up. It is a process-level failure, not a check result.');
  }
  if (status >= 128) {
    const known = POSIX_SIGNAL_HINTS[status];
    return `exit ${status} — ` + (known ?? `128+${status - 128}: the process died on a signal.`);
  }
  return `exit ${status} — outside the four-code gate contract (0 clean · 1 declared · 2 misconfigured · 3 ratchet). ` +
    'The process ended without producing a verdict (an uncaught throw before the gate reported, or a non-gate script).';
}

/**
 * Classify a gate spawn. ONLY the four contract codes are verdicts; everything
 * else is a launch failure carrying its raw evidence.
 */
export function classifyGateLaunch(r: LaunchStatus): LaunchClassification {
  if (r.error !== undefined && r.error !== null) {
    return {
      outcome: 'LAUNCH_FAILED', status: r.status, signal: r.signal ?? null,
      error: String((r.error as { message?: string })?.message ?? r.error),
      hint: 'spawn error — the child could not be started at all (ENOENT / EACCES / EINVAL). Nothing ran.',
    };
  }
  if (r.status === null) {
    return {
      outcome: 'LAUNCH_FAILED', status: null, signal: r.signal ?? null, error: null,
      hint: `killed by signal ${r.signal ?? '(unknown)'} — the process did not exit on its own; no verdict was produced.`,
    };
  }
  if (isContractCode(r.status)) return { outcome: 'VERDICT', code: r.status };
  return {
    outcome: 'LAUNCH_FAILED', status: r.status, signal: r.signal ?? null, error: null,
    hint: hintFor(r.status),
  };
}

/**
 * Classify a NON-gate child (the vitest run). Its exit code is informational,
 * not a contract verdict, so any ordinary code (0..127) is a normal exit; only a
 * spawn error, a signal, a POSIX signal code or an NTSTATUS is a launch failure.
 */
export function classifyProcessLaunch(r: LaunchStatus): { outcome: 'EXITED'; status: number } | LaunchFailure {
  const asGate = classifyGateLaunch(r);
  if (asGate.outcome === 'VERDICT') return { outcome: 'EXITED', status: asGate.code };
  if (r.status !== null && r.error == null && r.status >= 0 && r.status < 128) {
    return { outcome: 'EXITED', status: r.status };
  }
  return asGate;
}

export function describeLaunchFailure(f: LaunchFailure): string {
  const parts = [
    `status=${f.status === null ? 'null' : String(f.status)}`,
    `signal=${f.signal ?? 'null'}`,
  ];
  if (f.error) parts.push(`error=${f.error}`);
  return `${parts.join(' ')} · ${f.hint}`;
}

/**
 * The human reading of a recorded gate outcome, for generate-report.ts. A raw
 * number outside the contract — which is what a PRE-FIX certify.json holds for a
 * launch failure — is rendered as NOT A VERDICT rather than as a code, so an old
 * artefact cannot be re-published as a reading.
 */
export function renderGateOutcome(v: unknown, failure?: LaunchFailure | null): string {
  if (v === 'LAUNCH_FAILED') {
    return '**LAUNCH FAILED — not a verdict; the check did not run**' +
      (failure ? ` (${describeLaunchFailure(failure)})` : '');
  }
  if (v === 'SCRIPT_MISSING') return '**SCRIPT MISSING — MISCONFIGURED, never absorbable (L-812)**';
  if (v === null || v === undefined) return '**NOT RECORDED — no outcome was written for this gate**';
  if (isContractCode(v)) {
    return ({ 0: 'CLEAN (0)', 1: 'DECLARED-LEVEL (1)', 2: 'MISCONFIGURED (2) — never absorbable', 3: 'RATCHET EXCEEDED (3) — never absorbable' } as Record<number, string>)[v]!;
  }
  if (typeof v === 'number') {
    const decoded = hintFor(v);
    return `**NOT A VERDICT — raw value ${v} recorded in the verdict field by a pre-2026-09-10 runner; ${decoded}**`;
  }
  return `**NOT A VERDICT — unrecognised value ${JSON.stringify(v)}**`;
}
