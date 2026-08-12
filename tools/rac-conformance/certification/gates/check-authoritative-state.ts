// ─── GATE · check-authoritative-state ────────────────────────────────────────
//
// BIM30-READINESS-GATES §3.2 — "the mutation moved the store nobody can fake".
// Owning invariants: C70 A-INV-1, A-INV-2, A-INV-3, L-INV-4.
//
// THE INVARIANT, in one sentence: for any piece of state, exactly ONE store owns
// it, and a verb that reports success moved THAT store — not a detached record
// view, not a cache, not nothing at all.
//
// ─── RESIDENCY (§2.1a), and why this is the certification tree ───────────────
// The boundary test is one question: *does this gate need something that does not
// exist until something runs?* Yes, unavoidably. §3.2's subject is "every bus verb
// under certification, EXECUTED against the composed headless world
// (`certification/world.ts`), with the oracle being an independent read-back via
// `capture.ts`'s `kindReaders`". There is no static form of that: whether a
// dispatch moved a store is not a property of the source text. So the gate lives
// in `certification/gates/` and is registered in `certify.ts`'s `gates` array,
// per §2.1e. It imports the ONE exit-code implementation (`../contract.js`) —
// §2.1b: two homes sharing one contract is a split, two contracts is a fork.
//
// ─── WHY THE MEASUREMENT IS A SEPARATE *.cert.ts FILE ────────────────────────
// `../world.ts` imports `apps/editor/src/engine/initBusHandlers` (it must — the
// LIVE bridge verbs do not exist until it runs), which transitively reaches
// `@pryzm/file-format`'s barrel → `PdfExportService` → `import { svg2pdf } from
// 'svg2pdf.js'`. That package ships no `exports` map and no named ESM export, so
// bare Node — which is what `certify.ts`'s `npx tsx <gate>` gives us — throws
// before a single store is constructed. Vite's interop resolves it; Node's does
// not. The gate therefore SPAWNS VITEST on `__tests__/authoritative-state.cert.ts`
// inside its own invocation and grades what that run wrote.
//
// This is NOT the `check-identity-roundtrip` artefact-scavenging pattern. That
// gate reads an artefact ANOTHER suite happened to write, and owes floors proving
// it is real. This gate OWNS its measurement, RUNS it, and refuses any artefact
// not written by the run it just started — the pre-run freshness stamp below is
// the same mechanism `certify.ts` uses, and it is what makes a crashed suite fail
// instead of silently re-grading yesterday's file (§1.2, the empty-seed incident).
//
// ─── THE FOUR ARMS (§3.2 "Assertions", verbatim subjects) ────────────────────
//
//   S1 · every mutating verb changes the AUTHORITATIVE store on exactly the
//        intended properties, proven by before→after capture diff. A verb whose
//        diff is EMPTY is a finding; a verb whose diff carries paths its
//        declaration does not name is a finding. §3.2 is explicit that the gate
//        "checks that the diff matches the declaration, not that the declaration
//        is correct".
//
//   S2 · no verb's only observable effect is on a detached plugin-DTO record.
//        "A mutation that changes a DTO nobody reads is a lie, not a capability"
//        (A-INV-3). The harness hands the bus exactly production's detached record
//        view and NOTHING reads a verdict from it; a verb whose only diff is in
//        `dtoStores` is a finding.
//
//   S3 · each element kind names ONE authoritative store, and the composition
//        root can name it (A-INV-1). Two stores answering for one kind is a
//        finding. Measured by INSTANCE IDENTITY plus a record-count disagreement,
//        never by a name match: a class exported twice is a grep finding, and
//        §1.1 rule 3 forbids a gate passing OR failing on one.
//
//   S4 · a refused verb leaves the store UNCHANGED and the refusal names the rule
//        (L-INV-3). "A refusal that mutated anything is worse than a failure."
//        Split into two independently-reported halves, because they fail for
//        different reasons: S4-STATE (did anything move?) and S4-VOICE (could the
//        caller tell?).
//
// ─── WHAT THIS GATE DELIBERATELY DOES NOT DUPLICATE ──────────────────────────
// `tools/ga-gate/check-no-direct-store-writes.ts` is P6's gate and shares this
// gate's *topic* while sharing none of its *subject*. That gate is a STATIC,
// SYNTACTIC scan of UI source for a mutating method on a `*Store`-named receiver;
// it answers "did somebody write a store from a place that should have dispatched
// instead?" and its own header lists its blind spots (a store reached through a
// differently-named variable; mutation via a returned object; whether a flagged
// call sits inside a handler that legitimately owns the write).
//
// This gate stands at the OPPOSITE END of the same pipe and asks the mirror
// question: given a mutation that DID go through the bus, did the authoritative
// store actually move? Neither gate can see the other's defect. A UI component
// writing `wallStore.update()` directly is invisible here (no dispatch happens, so
// there is nothing to bracket); a bus verb that dispatches, reports success and
// moves nothing is invisible there (the source contains no direct store write —
// that is precisely the problem). They are complementary, and the overlap is zero:
// P6's gate has no runtime, and this gate never reads a source file.
//
// ─── CONTROLS, RUN EVERY TIME (§2.2) ─────────────────────────────────────────
// All three are executed inside the measurement run and FLOORED here, so a
// blinded comparator exits 2 MISCONFIGURED rather than reporting a clean estate:
//
//   POSITIVE (§3.2 verbatim) — `wall.updateDimensions` with `height: 4.2` on a
//     seeded wall must diff EXACTLY one authoritative path, `wall.*.height`.
//     Proves the comparator is not stuck red and can call a real mutation clean.
//     Measured 2026-08-12: `wall.*.height 3→4.2`, pathCount 1. ✓
//
//   NEGATIVE (§3.2 verbatim) — a throwaway verb `__gate.dtoOnlyWrite` is
//     registered whose handler writes ONLY the detached DTO record view. S2 must
//     name it: "authoritative store unchanged; DTO-only write". If the comparator
//     calls a DTO-only write clean it is BLIND and this gate exits 2.
//     Measured 2026-08-12: dtoChanged=true, authoritativePathCount=0 → FLAGGED. ✓
//
//   WIDENING (§3.2's second negative control) — "widen the expected-path set by
//     one field and confirm the comparator reports the extra path rather than
//     absorbing it." A dispatch is run that moves height AND thickness against a
//     declaration naming only height; `thickness` must surface as UNDECLARED.
//     Measured 2026-08-12: undeclared=['wall.*.thickness']. ✓
//
// ─── WHAT THIS GATE CANNOT SEE (§3.2 "Cannot see", restated every run) ───────
//   • verbs the world cannot register — recorded in `registrationFailures` and
//     floored, so an unregistered verb can never read as a clean one.
//   • GEOMETRY. No fragment builders are registered in the harness, so meshes are
//     never built and the Geometry chain link stays UNPROVEN by construction.
//   • whether the INTENDED property set is the right one. The declaration is
//     authored by a human in the measurement file; this gate asserts the diff
//     matches it, never that it is architecturally correct.
//   • any verb outside the certified families the world registers. The register
//     lists 110 LIVE verbs; this gate measures the subset the harness composes,
//     and the floor names that subset rather than the register's whole count.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERT_DIR = resolve(__dirname, '..');
const ARTEFACT = resolve(CERT_DIR, 'results/authoritative-state.json');
const LEDGER_FILE = resolve(__dirname, 'authoritative-state-ledger.json');

interface PathRec { path: string; generalised: string; expected: unknown; actual: unknown; derived: boolean }
interface CaseRec {
  label: string; verb: string; refusal: boolean; registered: boolean;
  declaredPaths: string[]; dispatchOk: boolean; dispatchError: string;
  authoritativePaths: PathRec[]; derivedPaths: string[]; misconfiguredKinds: string[];
  dtoChanged: boolean; ringDelta: number;
  reportEvents: Array<{ type: string; success?: boolean; info: string[] }>;
}
interface RivalRec {
  kind: string; authoritative: string; rival: string; sameInstance: boolean;
  authoritativeCount: number; rivalCount: number; ids: { authoritative: string[]; rival: string[] };
}
interface Artefact {
  measuredAt?: string;
  seedOutcomes?: Record<string, string>;
  registrationFailures?: Array<{ verb: string; reason: string }>;
  dtoReached?: boolean; dtoHow?: string;
  kindsReached?: number; baselineRecords?: number;
  baselineByKind?: Record<string, { reached: boolean; n: number }>;
  rivalOwners?: RivalRec[];
  cases?: CaseRec[];
  positiveControl?: { ran?: boolean; pathCount?: number; paths?: string[]; error?: string };
  negativeControl?: { ran?: boolean; authoritativePathCount?: number; dtoChanged?: boolean; error?: string };
  wideningControl?: { ran?: boolean; undeclared?: string[]; observedPaths?: string[]; error?: string };
}

interface Ledger {
  '//': string[];
  measuredAt: string;
  /** NAMED entries — never a bare count (C70 §5.5). Checked in BOTH directions. */
  declared: string[];
}

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];

/** `--no-run` grades the artefact already on disk (mirrors certify.ts's flag). */
const noRun = process.argv.slice(2).includes('--no-run');

function run(): GateResult {
  // ── 1 · run the measurement, and refuse anything it did not write ──────────
  // The stamp is taken BEFORE the run; the artefact must be newer. This is the
  // §1.2 mechanism: a crashed suite must FAIL, never silently re-grade the last
  // good file. `-1000` is filesystem clock-skew slack, same as certify.ts.
  const notBefore = Date.now() - 1000;
  let vitestStatus: number | null = null;
  if (!noRun) {
    // `shell: true` is REQUIRED on win32 (certify.ts's note): Node refuses to
    // spawnSync a .cmd shim directly since the CVE-2024-27980 hardening, and this
    // repo's founder runs Windows. A gate that only spawns on the CI runner is the
    // L-774 shape. Arguments are fixed literals — no injection surface.
    const r = spawnSync(
      'npx',
      ['vitest', 'run', '__tests__/authoritative-state.cert.ts'],
      { cwd: CERT_DIR, stdio: 'inherit', env: process.env, shell: true },
    );
    vitestStatus = r.status;
    if (r.error) lines.push('vitest spawn error: ' + String(r.error).slice(0, 300));
  }

  const exists = existsSync(ARTEFACT);
  const fresh = exists && (noRun || statSync(ARTEFACT).mtimeMs >= notBefore);
  const art: Artefact = exists ? (JSON.parse(readFileSync(ARTEFACT, 'utf8')) as Artefact) : {};

  lines.push(
    `measurement: vitest exited ${vitestStatus === null ? '(not run — --no-run)' : vitestStatus} ` +
    `— INFORMATIONAL. The verdict is the artefact, never the runner's exit code.`,
  );
  lines.push(`artefact: ${exists ? 'present' : 'ABSENT'} · ${fresh ? 'FRESH (written by this run)' : 'STALE — not written by this run'} · measuredAt=${art.measuredAt ?? '—'}`);

  const cases = art.cases ?? [];
  const mutating = cases.filter((c) => !c.refusal);
  const refusals = cases.filter((c) => c.refusal);

  // ── 2 · FLOORS — emptiness is never a pass (§1.2, C70 §5.2) ───────────────
  floors.push({ what: 'results/authoritative-state.json exists AND was written by THIS run', measured: fresh ? 1 : 0, min: 1 });
  // §3.2's floor is "verbs dispatched ≥ the register's LIVE row count for the
  // CERTIFIED FAMILIES" — not the register's whole 110. The certified families are
  // those world.ts composes (wall · door · window · slab · roof · room · element),
  // and 18 mutating cases is the measured subset. The floor is set at 15 so losing
  // a fifth of the subject is MISCONFIGURED rather than a quietly smaller pass.
  floors.push({ what: 'mutating verbs dispatched (certified families)', measured: mutating.length, min: 15 });
  floors.push({ what: 'refusal cases dispatched (S4 subject)', measured: refusals.length, min: 3 });
  floors.push({ what: 'kinds whose authoritative reader was REACHED', measured: art.kindsReached ?? 0, min: 10 });
  floors.push({ what: 'records in the pre-mutation capture', measured: art.baselineRecords ?? 0, min: 12 });
  // §3.2: "dispatch outcomes recorded for 100 % of attempted verbs (a verb that
  // threw is `THREW: …`, never absent)". An absent outcome is the empty-seed lie.
  const outcomesRecorded = cases.filter((c) => typeof c.dispatchOk === 'boolean').length;
  floors.push({ what: 'dispatch outcomes recorded (must equal cases attempted)', measured: outcomesRecorded, min: cases.length });
  // S2 cannot be asserted at all if the DTO view was never reached — reporting
  // "no DTO-only writes" over an unreachable DTO is the exact shape of §1.2's lie.
  floors.push({ what: 'the detached plugin-DTO record view was REACHED (S2 is unassertable otherwise)', measured: art.dtoReached ? 1 : 0, min: 1 });

  // ── 3 · CONTROLS as floors (§2.2 — an unproven arm is not coverage) ───────
  const pc = art.positiveControl ?? {};
  const positiveOk = pc.ran === true && pc.pathCount === 1 ? 1 : 0;
  floors.push({ what: 'POSITIVE control — wall.updateDimensions height:4.2 diffs EXACTLY 1 authoritative path', measured: positiveOk, min: 1 });
  lines.push(`control POSITIVE: ${pc.ran ? `paths=[${(pc.paths ?? []).join(' · ')}] count=${pc.pathCount}` : `DID NOT RUN — ${pc.error ?? 'no reason recorded'}`}` +
    (positiveOk ? ' ✓ the comparator can call a real mutation clean' : ' ❌ the comparator is stuck or the fixture moved'));

  const nc = art.negativeControl ?? {};
  const negativeOk = nc.ran === true && nc.dtoChanged === true && nc.authoritativePathCount === 0 ? 1 : 0;
  floors.push({ what: 'NEGATIVE control — a planted DTO-only write is FLAGGED by S2', measured: negativeOk, min: 1 });
  lines.push(`control NEGATIVE: ${nc.ran ? `dtoChanged=${nc.dtoChanged} authoritativePaths=${nc.authoritativePathCount}` : `DID NOT RUN — ${nc.error ?? 'no reason recorded'}`}` +
    (negativeOk ? ' ✓ S2 has teeth: a DTO-only write is visible as one' : ' ❌ BLIND COMPARATOR — a DTO-only write reads clean'));

  const wc = art.wideningControl ?? {};
  const wideningOk = wc.ran === true && (wc.undeclared ?? []).includes('wall.*.thickness') ? 1 : 0;
  floors.push({ what: 'WIDENING control — an undeclared path is REPORTED, never absorbed', measured: wideningOk, min: 1 });
  lines.push(`control WIDENING: ${wc.ran ? `observed=[${(wc.observedPaths ?? []).join(' · ')}] undeclared=[${(wc.undeclared ?? []).join(' · ')}]` : `DID NOT RUN — ${wc.error ?? 'no reason recorded'}`}` +
    (wideningOk ? ' ✓ an extra path surfaces rather than being absorbed' : ' ❌ the comparator absorbs extra paths'));

  // Registration failures are reported and floored: §3.2 "verbs the world cannot
  // register (recorded in registrationFailures, and the floor guards the count)".
  const regFails = art.registrationFailures ?? [];
  floors.push({ what: 'verb registration failures (must be 0 — an unregistered verb cannot read as clean)', measured: regFails.length === 0 ? 1 : 0, min: 1 });
  if (regFails.length > 0) {
    for (const f of regFails) lines.push(`registration FAILED · ${f.verb}: ${f.reason.slice(0, 160)}`);
  }

  // ── 4 · ARM S1 · the mutation moved the authoritative store ───────────────
  lines.push('');
  lines.push(`── S1 · every mutating verb moves the AUTHORITATIVE store on exactly its declared paths (${mutating.length} verbs) ──`);
  for (const c of mutating) {
    const observed = [...new Set(c.authoritativePaths.map((p) => p.generalised))];
    const missing = c.declaredPaths.filter((d) => !observed.includes(d));
    const extra = observed.filter((o) => !c.declaredPaths.includes(o));

    if (!c.registered) {
      // Not a silent skip: an unregistered verb is a NAMED finding, never "clean".
      findingNames.push(`S1 ${c.label}: verb is NOT REGISTERED on the bus — nothing was measured, and that is a finding, not a pass`);
      lines.push(`  ❌ ${c.label}: NOT REGISTERED`);
      continue;
    }
    if (observed.length === 0) {
      const voice = c.reportEvents.length > 0
        ? ` The handler DID emit a report event (${c.reportEvents.map((e) => `${e.type} success=${e.success}: ${(e.info[0] ?? '').slice(0, 120)}`).join(' | ')}), so the refusal exists but never reaches the bus caller.`
        : ' No report event was emitted either — the dispatch is silent in every channel.';
      findingNames.push(
        `S1 ${c.label}: dispatch reported ok=${c.dispatchOk} and moved ZERO authoritative paths ` +
        `(declared: ${c.declaredPaths.join(', ') || '(none)'}).${voice}`,
      );
      lines.push(`  ❌ ${c.label}: ok=${c.dispatchOk} · authoritative paths = 0 · declared ${c.declaredPaths.length}`);
      for (const e of c.reportEvents) lines.push(`       report event ${e.type} success=${e.success}: ${(e.info[0] ?? '').slice(0, 150)}`);
      continue;
    }
    if (missing.length > 0) {
      findingNames.push(`S1 ${c.label}: declared path(s) NOT moved: ${missing.join(', ')} (observed: ${observed.join(', ')})`);
      lines.push(`  ❌ ${c.label}: MISSING ${missing.join(', ')}`);
      continue;
    }
    if (extra.length > 0) {
      findingNames.push(`S1 ${c.label}: moved UNDECLARED path(s): ${extra.join(', ')} — either the verb does more than it says, or the declaration is stale`);
      lines.push(`  ❌ ${c.label}: UNDECLARED ${extra.join(', ')}`);
      continue;
    }
    lines.push(`  ✓  ${c.label}: ${observed.length} authoritative path(s), exactly as declared — ${observed.join(', ')}` +
      (c.derivedPaths.length > 0 ? `  [+${c.derivedPaths.length} ADR-0319 derived, excluded by name: ${[...new Set(c.derivedPaths)].join(', ')}]` : ''));
  }

  // ── 5 · ARM S2 · DTO-only writes ──────────────────────────────────────────
  lines.push('');
  lines.push('── S2 · no verb\'s only observable effect is on the detached plugin-DTO record (A-INV-3) ──');
  lines.push(`  DTO record view reached via ${art.dtoHow ?? '(not reached)'} — nothing in this gate reads a VERDICT from it; it is inspected only to prove a write did NOT land there alone.`);
  let dtoOnly = 0;
  for (const c of mutating) {
    const moved = c.authoritativePaths.length > 0;
    if (c.dtoChanged && !moved) {
      dtoOnly++;
      findingNames.push(`S2 ${c.label}: authoritative store unchanged; DTO-only write — a mutation that changes a DTO nobody reads is a lie, not a capability (A-INV-3)`);
      lines.push(`  ❌ ${c.label}: DTO changed, authoritative store did NOT`);
    }
  }
  lines.push(`  ${dtoOnly === 0 ? '✓ ' : '❌'} DTO-only writes among ${mutating.length} measured verbs: ${dtoOnly}`);

  // ── 6 · ARM S3 · one kind, one authoritative store (A-INV-1) ──────────────
  lines.push('');
  lines.push('── S3 · each element kind names ONE authoritative store; two stores answering for one kind is a finding (A-INV-1) ──');
  const rivals = art.rivalOwners ?? [];
  // A rival must be a SECOND LIVE INSTANCE, not a second exported class name.
  // §1.1 rule 3: a gate that passed or failed on a grep has measured nothing.
  floors.push({ what: 'candidate kind-ownership pairs actually probed (a run that probed none proves nothing)', measured: rivals.length, min: 2 });
  for (const r of rivals) {
    if (r.sameInstance) {
      lines.push(`  ✓  ${r.kind}: ${r.authoritative} and ${r.rival} are the SAME INSTANCE — one owner.`);
      continue;
    }
    const disagree = r.authoritativeCount !== r.rivalCount;
    findingNames.push(
      `S3 ${r.kind}: TWO live stores answer for this kind — ${r.authoritative} (${r.authoritativeCount} record(s)) and ${r.rival} (${r.rivalCount} record(s)); ` +
      `distinct instances` + (disagree
        ? `, and they DISAGREE after real command seeding. Any reader holding the second one sees a different model.`
        : `. They agree today, which is luck rather than structure — nothing keeps them in step.`),
    );
    lines.push(`  ❌ ${r.kind}: ${r.authoritative}=${r.authoritativeCount} vs ${r.rival}=${r.rivalCount} · sameInstance=false${disagree ? ' · DISAGREE' : ''}`);
  }

  // ── 7 · ARM S4 · a refused verb mutates nothing, and says why ─────────────
  lines.push('');
  lines.push('── S4 · a refused verb leaves the store UNCHANGED and the refusal NAMES THE RULE (L-INV-3) ──');
  for (const c of refusals) {
    // S4-STATE — the half that matters most. A refusal that mutated anything is
    // worse than a failure, so it is reported separately and first.
    if (c.authoritativePaths.length > 0) {
      findingNames.push(`S4-STATE ${c.label}: a refused verb MUTATED authoritative state: ${c.authoritativePaths.map((p) => p.generalised).join(', ')} — worse than a failure`);
      lines.push(`  ❌ ${c.label}: MUTATED on refusal — ${c.authoritativePaths.map((p) => p.generalised).join(', ')}`);
    } else {
      lines.push(`  ✓  ${c.label}: state unchanged (0 authoritative paths).`);
    }
    // S4-VOICE — could the caller tell? A dispatch that resolves ok=true for a
    // target that does not exist is indistinguishable, at the call site, from one
    // that worked. That is the §CONTEXT-DATA-HONESTY shape: two very different
    // facts printing the same value.
    const named = c.reportEvents.some((e) => e.success === false && (e.info?.length ?? 0) > 0);
    if (c.dispatchOk && !named) {
      findingNames.push(
        `S4-VOICE ${c.label}: the verb was aimed at a target that does not exist, changed nothing, and STILL resolved ok=true with no refusal reaching the caller ` +
        `— success and refusal are the same observable at the dispatch site (L-INV-3)`,
      );
      lines.push(`  ❌ ${c.label}: resolved ok=true, no refusal reached the caller`);
    } else if (named) {
      lines.push(`  ✓  ${c.label}: refusal named the rule — ${c.reportEvents.map((e) => (e.info[0] ?? '').slice(0, 120)).join(' | ')}`);
    } else {
      lines.push(`  ✓  ${c.label}: dispatch rejected — ${c.dispatchError.slice(0, 150)}`);
    }
  }

  // ── 8 · what this gate cannot see, restated EVERY run ─────────────────────
  lines.push('');
  lines.push('NOT CHECKED by this gate, restated every run so a green reading is never over-read:');
  lines.push('  · GEOMETRY — no fragment builders are registered in the harness; meshes are never built, so the Geometry chain link is UNPROVEN by construction.');
  lines.push('  · whether the DECLARED property set is the ARCHITECTURALLY RIGHT one — the arms assert the diff matches the declaration, never that the declaration is correct.');
  lines.push('  · verbs outside the families world.ts composes. The register lists 110 LIVE verbs; ' + String(mutating.length) + ' mutating verbs are measured here, and the floor guards that subset — it is NOT repo-wide coverage.');
  lines.push('  · collaboration/merge behaviour, and persistence (that is §3.1 check-identity-roundtrip\'s subject).');

  // ── 9 · the ledger — NAMED entries, both directions (C70 §5.5) ────────────
  const ledger: Ledger = existsSync(LEDGER_FILE)
    ? (JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) as Ledger)
    : { '//': [], measuredAt: '', declared: [] };

  // Both directions: a declared entry no longer measured forces exit 3 via
  // contract.ts's `stale` channel, so paid debt must LEAVE the ledger in the
  // commit that pays it. Matching is by the finding's stable prefix (arm + label),
  // never by the full sentence — the sentence carries counts that legitimately move.
  const keyOf = (s: string): string => s.split(':')[0]!.trim();
  const measuredKeys = new Set(findingNames.map(keyOf));
  const stale = ledger.declared.filter((d) => !measuredKeys.has(keyOf(d)));

  return {
    gate: 'check-authoritative-state',
    floors,
    lines,
    findings: findingNames.length,
    declared: ledger.declared.length,
    findingNames,
    stale,
  };
}

try {
  process.exit(reportGate(run()));
} catch (e) {
  // A gate that threw has ESTABLISHED NOTHING. Exit 2, never 0, never 1.
  console.error('check-authoritative-state: harness threw — MISCONFIGURED\n', e);
  process.exit(2);
}
