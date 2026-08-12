#!/usr/bin/env tsx
/**
 * GATE: check-two-client-convergence — the first gate that composes TWO clients.
 *
 * Contract: C08 (collaboration) · C66 §1 (a CLAIMED tier and a HELD tier must
 * not be written the same way) · C03 §4.5-4.8 (undo is per-gesture) · P8 ·
 * docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md §1 C8 + §0 rules 1-2.
 *
 * ─── THE ROW THIS EXISTS FOR ────────────────────────────────────────────────
 *
 * Every row of `persistence.cert.ts` and `undoredo.cert.ts` reads
 * `Collaboration UNPROVEN by construction`. That is literal: both suites call
 * `buildWorld()` ONCE, so nothing they report can say anything about two clients
 * editing at once. This gate does not try to make that row green. It tries to
 * make it a NUMBER.
 *
 * ─── WHY THIS DOES NOT DUPLICATE check-collab-graph-integrity ───────────────
 *
 * Worth stating precisely, because two gates that both say "collaboration" and
 * measure different things is how a suite starts lying.
 *
 *   tools/ga-gate/check-collab-graph-integrity.ts — owns the TRANSPORT and the
 *     DOCUMENT. Two real y-websocket clients, a real in-process sync server, a
 *     real socket, a real partition. It asks whether the hosting edge survives
 *     IN THE Y.DOC. Everything it touches is `YjsDocAdapter`; it composes no
 *     store, no CommandManager and no undo stack, so it cannot see anything
 *     downstream of the document. Measured today: exit 0, 4 hosting edges,
 *     10 element records, negative control firing.
 *
 *   THIS GATE — owns the leg that one does not: CRDT document → AUTHORITATIVE
 *     STORE, and the UNDO STACKS. Two full `buildWorld()` topologies, each with
 *     its own WallStore and CommandManager, joined by the production replication
 *     wiring. It asks whether a peer's edit reaches the store the serializer
 *     reads, whether the element keeps its identity, and whether one client's
 *     Ctrl+Z reverts the other client's work.
 *
 * Neither subsumes the other, and BOTH facts are printed: this gate's wire is
 * SIMULATED; that gate's stores do not exist.
 *
 * ─── THE FOUR ARMS ──────────────────────────────────────────────────────────
 *
 *   1  CONVERGENCE  — after both clients edit and sync, do both STORES hold the
 *                     same value? Compared PROPERTY BY PROPERTY with both values
 *                     printed. Never a hash: a hash says THAT they differ, and
 *                     the whole point is WHAT.
 *   2  IDENTITY     — two clients edit the same wall. Re-minted, duplicated or
 *                     lost on either side? Counted by id, not by "did something
 *                     change".
 *   3  UNDO         — A undoes its own gesture while B's edit is merged in. C03
 *                     makes undo per-gesture: A's undo MUST revert A's property
 *                     and MUST NOT revert B's, on either document.
 *   4  NOT MEASURED — printed in full, every run, with the reason. An arm that
 *                     passes because its subject does not exist is not coverage.
 *
 * ─── WHY A SUITE + A GATE ───────────────────────────────────────────────────
 *
 * `buildWorld()` transitively imports `@pryzm/file-format`, whose barrel reaches
 * `PdfExportService` → `svg2pdf.js`, which does not resolve under bare `tsx`.
 * Vitest's resolver handles it, which is why both existing cert harnesses are
 * vitest suites. So `__tests__/twoclient.cert.ts` MEASURES and writes
 * `results/two-client-convergence.json`; this file GRADES it — the same split
 * `certify.ts` already uses, and the split that makes a crashed suite exit 2 on
 * a stale artefact instead of re-publishing a green file.
 *
 * ─── EXIT CODES (the four-code contract; ../contract.ts) ────────────────────
 *
 *   0  CLEAN            — floors met, both controls fired, no findings.
 *   1  DECLARED-LEVEL   — findings at or under the declared ledger.
 *   2  MISCONFIGURED    — never absorbable. A client did not compose, the two
 *                         "clients" shared a subject, nothing crossed the wire,
 *                         the comparator proved blind, or the artefact is stale.
 *   3  RATCHET EXCEEDED — never absorbable. More findings than declared.
 *
 * Every number printed is measured on the run that prints it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERT_DIR = resolve(__dirname, '..');
const ARTEFACT = resolve(CERT_DIR, 'results', 'two-client-convergence.json');
const LEDGER = resolve(CERT_DIR, 'two-client-ledger.json');

const EXIT_CLEAN = 0, EXIT_DECLARED = 1, EXIT_MISCONFIGURED = 2, EXIT_RATCHET = 3;

interface Finding { arm: string; kind: string; detail: string; }
interface FloorReading { what: string; measured: number; min: number; }
interface Artefact {
  harness?: string;
  generatedAt?: string;
  provenance?: { composed: string[]; simulated: string[]; notMeasured: string[] };
  misconfigured?: string;
  floors?: FloorReading[];
  findings?: Finding[];
  crossings?: number;
  comparedCount?: number;
  negativeControl?: { ran: boolean; detected: boolean };
  lines?: string[];
}

const line = (s = ''): void => { console.log(s); };
const noRun = process.argv.includes('--no-run');

line('─'.repeat(78));
line('check-two-client-convergence — the collaboration row, MEASURED');
line('─'.repeat(78));

// ── 1. Run the measurement suite ────────────────────────────────────────────
// The stamp is taken BEFORE the run; an artefact older than it is STALE, which
// is treated exactly like a missing one. A suite that dies before writing leaves
// the previous run's file on disk, green as ever — grading it would be grading
// the past.
const notBefore = Date.now() - 1000;
if (!noRun) {
  line();
  line('── running __tests__/twoclient.cert.ts ──');
  // `shell: true` is REQUIRED on win32 (Node refuses to spawnSync a .cmd shim
  // since the CVE-2024-27980 hardening) and this repo's founder runs Windows.
  // Arguments are fixed literals, so there is no injection surface.
  const r = spawnSync('npx', ['vitest', 'run', '__tests__/twoclient.cert.ts'], {
    cwd: CERT_DIR, stdio: 'inherit', env: process.env, shell: true,
  });
  line(`── vitest exited ${r.status} (informational — the verdict is the ARTEFACT below) ──`);
}

// ── 2. Load + freshness ─────────────────────────────────────────────────────
if (!existsSync(ARTEFACT)) {
  line();
  line(`✗ MISCONFIGURED [artefact-absent] — the suite wrote no artefact at ${ARTEFACT}.`);
  line('  It crashed before writing. A gate with no measurement is not a pass.');
  process.exit(EXIT_MISCONFIGURED);
}
let art: Artefact;
try {
  art = JSON.parse(readFileSync(ARTEFACT, 'utf8')) as Artefact;
} catch (e) {
  line(`✗ MISCONFIGURED [artefact-unreadable] — ${String(e).slice(0, 200)}`);
  process.exit(EXIT_MISCONFIGURED);
}
const gen = Date.parse(art.generatedAt ?? '');
const fresh = noRun || (Number.isFinite(gen) && gen >= notBefore);

// ── 3. PROVENANCE — printed BEFORE any verdict, so nobody mistakes the scope ─
const prov = art.provenance;
line();
line('PROVENANCE — what this harness genuinely composes vs what it simulates');
if (!prov) {
  line('   ✗ the artefact carries no provenance block — refusing to grade an unlabelled subject.');
} else {
  for (const c of prov.composed) line(`   COMPOSED   ✓ ${c}`);
  for (const s of prov.simulated) line(`   SIMULATED  ~ ${s}`);
  line();
  line('ARM 4 · NOT MEASURED — printed every run, because an arm that passes for');
  line('        want of a subject is not coverage:');
  for (const n of prov.notMeasured) line(`   NOT MEASURED  ✗ ${n}`);
}

// ── 4. The suite's own narrative ────────────────────────────────────────────
line();
for (const l of art.lines ?? []) line('   ' + l);

// ── 5. Floors — §C10, emptiness is never a pass ─────────────────────────────
line();
line("FLOORS — per client and separate, so A's work can never cover B's silence");
const floors = art.floors ?? [];
let unmet = 0;
for (const f of floors) {
  const ok = f.measured >= f.min;
  if (!ok) unmet++;
  line(`   ${ok ? '✓ ' : '❌'} ${f.what}: measured ${f.measured}, min ${f.min}`);
}
if (floors.length === 0) {
  line('   ❌ the artefact declared NO floors — an ungrounded verdict is refused.');
  unmet++;
}
line(`   ${fresh ? '✓ ' : '❌'} artefact written by THIS run (freshness): generatedAt=${art.generatedAt ?? '(none)'}`);
if (!fresh) unmet++;

const nc = art.negativeControl;
line(`   negative control: ran=${nc?.ran ?? false} detected=${nc?.detected ?? false}  ← the checker proving it can fail`);

// ── 6. MISCONFIGURED outranks everything ────────────────────────────────────
if (art.misconfigured) {
  line();
  line(`✗ MISCONFIGURED — ${art.misconfigured}`);
  line('  The harness could not establish its subject. This is NOT a pass and NOT a finding,');
  line('  and it is NEVER absorbable as debt.');
  process.exit(EXIT_MISCONFIGURED);
}
if (unmet > 0) {
  line();
  line(`✗ MISCONFIGURED [subject-floor-unmet] — ${unmet} floor(s) unmet.`);
  line('  A client that never composed, never mutated, or never transported anything reports');
  line('  "no divergence" and looks perfect. That reading is refused, and is never absorbable.');
  process.exit(EXIT_MISCONFIGURED);
}
if (!nc?.ran || !nc.detected) {
  line();
  line('✗ MISCONFIGURED [blind-comparator] — the comparator did not demonstrate it can fail.');
  line('  A checker that calls a deliberately diverged pair clean invalidates every verdict');
  line('  it produced, so the run is misconfigured rather than green.');
  process.exit(EXIT_MISCONFIGURED);
}

// ── 7. The shrink-only ledger ───────────────────────────────────────────────
// Read from a sibling file rather than hard-coded, so the first honest reading
// can be PINNED without editing this script — and so lowering it is a visible,
// reviewable act.
let declared = 0;
let ledgerNote = 'no ledger file — hard-0';
if (existsSync(LEDGER)) {
  try {
    const l = JSON.parse(readFileSync(LEDGER, 'utf8')) as { maxFindings?: number; note?: string };
    if (typeof l.maxFindings === 'number') {
      declared = l.maxFindings;
      ledgerNote = l.note ?? 'declared in two-client-ledger.json';
    }
  } catch { /* an unreadable ledger is treated as hard-0 — never as permission */ }
}

const findings = art.findings ?? [];
line();
line('─'.repeat(78));
for (const f of findings) line(`   ✗ [${f.arm}/${f.kind}] ${f.detail}`);
if (findings.length === 0) line('   no findings across arms 1-3');
line();
line(`ledger  declared=${declared}  (${ledgerNote})`);

let code: number;
if (findings.length > declared) {
  line();
  line(`✗ RATCHET EXCEEDED — ${findings.length} finding(s) against a declared level of ${declared}.`);
  line('  Two clients editing concurrently do not agree, or undo crossed the user boundary.');
  line('  The ledger is SHRINK-ONLY: fix the finding, or prove it predates this gate and pin');
  line('  it in gate-newly-measured.json with an exitCondition — never raise it to pass.');
  code = EXIT_RATCHET;
} else if (findings.length > 0) {
  line(`DECLARED-LEVEL — ${findings.length} finding(s), at or below the declared level of ${declared}.`);
  code = EXIT_DECLARED;
} else if (declared > 0) {
  line(`✗ STALE LEDGER — 0 findings but the ledger still declares ${declared}.`);
  line('  Debt that has been paid must LEAVE the ledger in the commit that pays it,');
  line('  or the next regression hides inside it.');
  code = EXIT_RATCHET;
} else {
  line(`✓ arms 1-3 clean: ${art.comparedCount ?? 0} properties compared across 2 independently`);
  line(`  composed clients, ${art.crossings ?? 0} crossings transported, both controls fired.`);
  code = EXIT_CLEAN;
}

// ── 8. Scope — C66 §1 ───────────────────────────────────────────────────────
line();
line("SCOPE — C66 §1. This run measures the CODE path from a peer's command to this");
line("  client's authoritative store. It does NOT measure a deployed transport: the wire");
line('  here is SIMULATED (see PROVENANCE), production still runs socket.io');
line('  last-writer-wins, and NO capacity tier moves from CLAIMED to HELD on this evidence.');
line('  C8 remains FAIL — BLOCKED on the founder decision in');
line('  docs/03-execution/plans/L-391-COLLAB-DEPLOY-DECISION.md.');

process.exit(code);
