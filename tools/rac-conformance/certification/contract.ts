// ─── The four-exit-code gate contract, in one place ──────────────────────────
//
// BIM20-ACCEPTANCE-10-OF-10 §Wave-3 and tools/ga-gate's §GA-GATE-RATCHET agree
// on four codes, and this module is the only implementation of them inside
// tools/rac-conformance/certification/:
//
//   0  CLEAN              — the gate measured its subject and found nothing wrong
//   1  DECLARED-LEVEL     — the gate found exactly the failures its ledger declares
//   2  MISCONFIGURED      — the gate could not ESTABLISH its subject. NEVER absorbable.
//   3  RATCHET EXCEEDED   — worse than the ledger declares.        NEVER absorbable.
//
// The whole point of separating 1 from 2 is the C10 rule: **emptiness is never a
// pass**. A gate that scanned no files, read no records, or read a STALE artefact
// has not measured anything, and "0 problems found" over nothing is the exact lie
// this suite exists to make impossible. So every gate here declares a FLOOR
// (`minFiles` / `minRecords` / freshness) and exits 2 when the floor is unmet —
// it does not exit 0, and it is not allowed onto any debt ledger.
//
// 3 is separated from 1 for the same reason in the other direction: a ratchet that
// can be absorbed by editing a baseline in the same commit is not a ratchet. The
// ledger files here are shrink-only; `certify.ts` refuses a run whose numbers
// exceed them and prints the exact command to re-baseline DOWNWARD only.

export const EXIT_CLEAN = 0;
export const EXIT_DECLARED = 1;
export const EXIT_MISCONFIGURED = 2;
export const EXIT_RATCHET_EXCEEDED = 3;

export type ExitCode = 0 | 1 | 2 | 3;

/** A floor that must be met before any verdict other than MISCONFIGURED is legal. */
export interface Floor {
  /** what is being counted, in the gate's own words */
  what: string;
  /** the measured count */
  measured: number;
  /** the minimum that makes a verdict meaningful */
  min: number;
}

export interface GateResult {
  gate: string;
  /** Floors are evaluated FIRST and short-circuit to MISCONFIGURED. */
  floors: Floor[];
  /** Human lines printed verbatim. */
  lines: string[];
  /** Count of real findings. Compared against `declared` for the 1-vs-3 split. */
  findings: number;
  /** The ledger's declared level for this gate. `0` means hard-0, no baseline. */
  declared: number;
  /** Optional: names of the findings, so a ledger can be audited by a human. */
  findingNames?: string[];
  /**
   * Ledger entries that are DECLARED but no longer measured — i.e. debt that has
   * been paid and not struck off. Reported separately from `findings` on purpose:
   * folding a stale entry into the finding count would let one fix and one
   * un-struck entry cancel out and read as "no change", which is the precise way a
   * ratchet stops ratcheting. Any stale entry forces exit 3.
   */
  stale?: string[];
}

export function verdictOf(r: GateResult): { code: ExitCode; headline: string } {
  const unmet = r.floors.filter((f) => f.measured < f.min);
  if (unmet.length > 0) {
    return {
      code: EXIT_MISCONFIGURED,
      headline:
        `MISCONFIGURED — ${r.gate} could not establish its subject: ` +
        unmet.map((f) => `${f.what}=${f.measured} < floor ${f.min}`).join(' · ') +
        ' — a verdict over an empty subject is not a verdict, so this exits 2 and is NEVER absorbable as debt.',
    };
  }
  if ((r.stale?.length ?? 0) > 0) {
    return {
      code: EXIT_RATCHET_EXCEEDED,
      headline:
        `STALE LEDGER — ${r.gate}: ${r.stale!.length} declared entr(ies) are no longer measured: ` +
        r.stale!.slice(0, 4).join(' · ') +
        '. Debt that has been paid must LEAVE the ledger in the commit that pays it, or the next regression hides inside it.',
    };
  }
  if (r.findings > r.declared) {
    return {
      code: EXIT_RATCHET_EXCEEDED,
      headline:
        `RATCHET EXCEEDED — ${r.gate}: ${r.findings} finding(s) against a declared level of ${r.declared}. ` +
        'The ledger is SHRINK-ONLY: fix the finding, or prove it was already there and lower the ledger — never raise it.',
    };
  }
  if (r.findings > 0) {
    return {
      code: EXIT_DECLARED,
      headline: `DECLARED-LEVEL — ${r.gate}: ${r.findings} finding(s), at or below the declared level of ${r.declared}.`,
    };
  }
  if (r.declared > 0) {
    return {
      code: EXIT_RATCHET_EXCEEDED,
      headline:
        `STALE LEDGER — ${r.gate}: 0 findings but the ledger still declares ${r.declared}. ` +
        'Debt that has been paid must LEAVE the ledger in the same commit that pays it, or the next regression hides inside it.',
    };
  }
  return { code: EXIT_CLEAN, headline: `CLEAN — ${r.gate}: 0 findings, hard-0, no baseline.` };
}

/** Print a gate result in the house format and return its exit code. */
export function reportGate(r: GateResult): ExitCode {
  const v = verdictOf(r);
  console.log(`\n── ${r.gate} ${'─'.repeat(Math.max(0, 60 - r.gate.length))}`);
  for (const f of r.floors) {
    console.log(`   floor  ${f.what}: measured ${f.measured}, min ${f.min} ${f.measured < f.min ? '❌' : '✓'}`);
  }
  for (const l of r.lines) console.log('   ' + l);
  console.log(`   → [${v.code}] ${v.headline}`);
  return v.code;
}
