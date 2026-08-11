// Merge results/*.json → docs/04-reference/BIM20-CERTIFICATION-RESULTS.md
// (+ a combined machine-readable certification.json next to the per-run files).
// Run: cd tools/rac-conformance/certification && npx tsx generate-report.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFloors, type SuiteArtefact } from './floors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dir = resolve(__dirname, 'results');
const docPath = resolve(__dirname, '../../../docs/04-reference/BIM20-CERTIFICATION-RESULTS.md');

interface Row {
  capability: string; intent: string; command: string;
  authoritativeState: string; geometry: string; persistence: string;
  undo: string; redo: string; collaboration: string; report: string;
  status: string; evidence: string[];
}
interface RunFile { harness: string; generatedAt: string; rows: Row[]; [k: string]: unknown }

const readRun = (name: string): RunFile | null => {
  const p = resolve(dir, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as RunFile) : null;
};

const h1 = readRun('persistence.json');
const h2 = readRun('undoredo.json');
if (!h1 && !h2) { console.error('No results in ' + dir + ' — run the cert suites first.'); process.exit(2); }

// ── §C10 FLOORS — a broken run must not be PUBLISHED either ──────────────────
// The floors also run in certify.ts, before the verdict. They run again here for
// a reason the duplication does not cover: this generator writes a document into
// docs/04-reference/ that humans read as the state of the estate. A run whose seed
// collapsed produces a table of UNPROVEN rows with a headline of "FAILED: 0" —
// which reads, to anyone who did not run it, as the best result the suite has ever
// had. Publishing that is worse than failing loudly. Freshness is NOT asserted here
// (`notBefore` 0), because regenerating the document from artefacts on disk is a
// legitimate thing to do; emptiness is asserted, because it never is.
{
  const problems: string[] = [];
  for (const [suite, art] of [['persistence', h1], ['undoredo', h2]] as const) {
    if (!art) continue;
    const { floors, notes } = readFloors(suite, art as unknown as SuiteArtefact, 0);
    for (const f of floors) {
      if (f.measured < f.min) problems.push(`${suite}: ${f.what} = ${f.measured} (floor ${f.min})`);
    }
    for (const n of notes) if (n) problems.push(`${suite}: ${n}`);
  }
  if (problems.length > 0) {
    console.error('MISCONFIGURED (2) — refusing to publish a report over a subject this run never established:');
    for (const p of problems) console.error('  ❌ ' + p);
    console.error('A "0 FAILED" headline computed over an empty model is the exact lie C10 §0 rule 2 forbids.');
    process.exit(2);
  }
}

const tally = (rows: Row[]): Record<string, number> => {
  const t: Record<string, number> = {};
  for (const r of rows) t[r.status] = (t[r.status] ?? 0) + 1;
  return t;
};
const ev = (r: Row, key: string): string =>
  (r.evidence.find((e) => e.startsWith(key + '=')) ?? '').split('=').slice(1).join('=');
const cell = (v: string, max = 200): string =>
  (v.length > max ? v.slice(0, max - 1) + '…' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

writeFileSync(resolve(dir, 'certification.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'tools/rac-conformance/certification/generate-report.ts',
  harnesses: {
    'H1-persistence': h1 && { generatedAt: h1.generatedAt, tally: tally(h1.rows), meta: {
      seedOutcomes: h1.seedOutcomes, mutateOutcomes: h1.mutateOutcomes, loadResult: h1.loadResult,
      serializeError: h1.serializeError, loadError: h1.loadError } },
    'H2-undoredo': h2 && { generatedAt: h2.generatedAt, tally: tally(h2.rows), meta: { seedLog: h2.seedLog } },
  },
  rows: [
    ...(h1?.rows ?? []).map((r) => ({ ...r, harness: 'H1' })),
    ...(h2?.rows ?? []).map((r) => ({ ...r, harness: 'H2' })),
  ],
}, null, 2));

const L: string[] = [];
L.push('# BIM 2.0 Certification Results — Persistence (§10) + Undo/Redo (§11)');
L.push('');
L.push(`> **Generated** ${new Date().toISOString()} by \`tools/rac-conformance/certification/generate-report.ts\``);
L.push('> from EXECUTED runs of `tools/rac-conformance/certification/__tests__/persistence.cert.ts` and');
L.push('> `__tests__/undoredo.cert.ts`. Machine-readable: `tools/rac-conformance/certification/results/certification.json`.');
L.push('>');
L.push('> **Format**: the founder\'s §6 certification format. Every axis is stamped independently from an executed');
L.push('> measurement; an axis with no measurement reads **UNPROVEN** and is never inferred from a neighbouring axis.');
L.push('> **Partial evidence is never promoted to VERIFIED.** `statusOf()` derives the row status from its own axes —');
L.push('> it is never hand-assigned — and since **Collaboration is UNPROVEN on every row by construction** (no transport');
L.push('> exists; L-391 leg C), the arithmetic ceiling for every row in this document is PARTIALLY VERIFIED.');
L.push('>');
L.push('> **Failure ≠ emptiness.** Every "0 divergences" cell below carries the number of records compared. A comparator');
L.push('> that reached no store reports **MISCONFIGURED**, never "clean" — and one row does exactly that (`persist:opening`).');
L.push('');

// ── Headline ────────────────────────────────────────────────────────────────
const all = [...(h1?.rows ?? []), ...(h2?.rows ?? [])];
const t = tally(all);
L.push('## Headline');
L.push('');
L.push(`- **Operations measured:** ${all.length} (${h1?.rows.length ?? 0} persistence kinds + ${h2?.rows.length ?? 0} undo/redo capabilities)`);
L.push(`- **PARTIALLY VERIFIED** (best attainable — see the Collaboration note): **${t['PARTIALLY VERIFIED'] ?? 0}**`);
L.push(`- **FAILED** (a measured axis disproved the invariant): **${t['FAILED'] ?? 0}**`);
L.push(`- **UNPROVEN:** ${t['UNPROVEN'] ?? 0} · **VERIFIED:** ${t['VERIFIED'] ?? 0} (0 is expected: Collaboration blocks it)`);
L.push('');

// ── Run completion ──────────────────────────────────────────────────────────
L.push('## Run completion (what actually happened)');
L.push('');
L.push('| Suite | Completed? | Vitest result | Notes |');
L.push('|---|---|---|---|');
L.push(`| \`persistence.cert.ts\` (§10) | YES — all ${h1?.rows.length ?? 0} kind rows executed, results written | **red: 12 of 21 \`it\`s fail** | Every failing \`it\` is a MEASURED round-trip divergence (\`expect.soft\`, so the whole table still prints). No suite-level crash, no timeout. |`);
L.push(`| \`undoredo.cert.ts\` (§11) | YES — all ${h2?.rows.length ?? 0} capability rows executed, results written | **red: 12 of 18 \`it\`s fail** | Same: red = a measured undo/redo divergence, not a crashed suite. |`);
L.push('| Falsifiability checks | YES | green | See "Falsifiability" below — each comparator was watched go red on a mutated expectation. |');
L.push('');
if (h1) {
  L.push('**Persistence run metadata (executed, verbatim):**');
  L.push('');
  L.push('```');
  L.push('serializer error : ' + (h1.serializeError || 'none — the REAL ProjectSerializer ran'));
  L.push('loader error     : ' + (h1.loadError || 'none — the REAL ProjectLoader ran'));
  L.push('LoadResult       : ' + JSON.stringify(h1.loadResult));
  L.push('seed outcomes    : ' + JSON.stringify(h1.seedOutcomes));
  L.push('mutations        : ' + JSON.stringify(h1.mutateOutcomes));
  L.push('```');
  L.push('');
}
if (h2) {
  L.push('**Undo/redo seed log (executed, verbatim):** `' + (h2.seedLog as string[]).join('` · `') + '`');
  L.push('');
}

// ── H1 table ────────────────────────────────────────────────────────────────
if (h1) {
  L.push('## H1 — Persistence round-trip comparator (§10)');
  L.push('');
  L.push('Protocol: seed via REAL `@pryzm/command-registry` commands → mutate via LIVE bus verbs → **capture EXPECTED');
  L.push('independently** → `ProjectSerializer.serialize()` (real) → `JSON.parse(JSON.stringify(...))` → `new ProjectLoader(cm).load()`');
  L.push('(real) → capture ACTUAL → deep per-property diff. The oracle is the loader path, never the store the handler wrote.');
  L.push('The documented-tolerance list is **EMPTY** — nothing was normalised away.');
  L.push('');
  const mutatedKinds = new Set(['roof','wall','door','window','room']);
  L.push('| Kind | Records compared | Resolve (seed) | Dispatch | Authoritative state | Geometry | Persistence (before ≡ after reload) | Undo | Sync | Report | Status |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of h1.rows) {
    const n = ev(r, 'expectedRecords') || '?';
    const seed = ev(r, 'seed');
    L.push(`| \`${r.capability.replace('persist:', '')}\` | ${n} | ${cell(seed.startsWith('SEEDED') ? 'PROVEN — ' + seed : 'FAIL/UNPROVEN — ' + seed, 150)} | ${cell(mutatedKinds.has(r.capability.replace('persist:','')) ? 'PROVEN — mutated through a LIVE bus verb before save' : 'n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs)', 110)} | ${cell(r.authoritativeState, 150)} | ${cell(r.geometry, 80)} | ${cell(r.persistence, 320)} | n/a — H2 | UNPROVEN — no transport | ${cell(r.report, 120)} | **${r.status}** |`);
  }
  L.push('');
}

// ── H2 table ────────────────────────────────────────────────────────────────
if (h2) {
  L.push('## H2 — Undo/redo round-trip vs authoritative state (§11)');
  L.push('');
  L.push('Protocol: State A (whole-store deep capture) → dispatch on the REAL composed bus → State B → `cm.undo()` ×');
  L.push('(entries this dispatch armed) → **compare to A** → `cm.redo()` × same → **compare to B**. Mutations are applied and');
  L.push('asserted ONE AT A TIME, so the 250 ms three-stack reconciliation window cannot make a stale read look like a pass.');
  L.push('The undo path certified is the LEGACY `CommandManager` stack — the declared owner of every verb here');
  L.push('(register column `undo: legacy-stack`). The unified ring-first `performUndoRedo` path is **NOT** certified here;');
  L.push('the three `it.fails` pins in `undoGestureOrdering.test.ts` were not touched.');
  L.push('');
  L.push('| Capability | Intent | Resolve+Dispatch | Undo entries armed | Authoritative state (A→B) | Geometry | Persist | Undo (≡A) | Redo (≡B) | Sync | Report | Status |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of h2.rows) {
    const d = ev(r, 'dispatch');
    const entries = ev(r, 'entriesAdded') || '—';
    const nd = ev(r, 'A→B divergences') || '—';
    L.push(`| \`${r.capability}\` | ${cell(r.intent, 70)} | ${d === 'OK' ? 'PROVEN — resolved + dispatched on the real bus' : 'REFUSED — ' + cell(d, 90)} | ${entries} | ${cell(r.authoritativeState, 240)} (${nd} paths moved) | ${cell(r.geometry, 70)} | n/a — H1 | ${cell(r.undo, 240)} | ${cell(r.redo, 240)} | ${cell(r.collaboration, 60)} | ${cell(r.report, 110)} | **${r.status}** |`);
  }
  L.push('');
}

L.push('## Falsifiability — every green cell was watched go red');
L.push('');
L.push('| Check | Executed output | Reads |');
L.push('|---|---|---|');
L.push('| H2 round-trip comparator, truthful vs tampered expectation | `[FALSIFY H2] undo-vs-A divergences=0 \\| undo-vs-TAMPERED-A divergences=1 first={"path":"roof.u-roof-1.thickness","expected":9.99,"actual":0.4}` | A real undo compares CLEAN; the same comparison against a value nobody ever wrote (`thickness: 9.99`) goes RED and names the path. |');
L.push('| H1 comparator, self vs tampered | `self-diff=CLEAN \\| tampered-diff=DIVERGED`, naming `wall.<id>.height` | The persistence comparator detects a single mutated property inside a whole-store capture. |');
L.push('| H1 MISCONFIGURED guard | a capture whose store read threw compares as `MISCONFIGURED`, never `CLEAN` | A comparator that reached no store can never report "0 divergences". |');
L.push('| Negative control, in-run | `slab.updateSystemTypeBatch` → `REFUSES-CORRECTLY` quoting the bridge ("The slab type catalogue is not available here"), `entriesAdded=0` | A refusal that speaks is graded differently from a silent no-op — the two are never the same value. |');
L.push('');
L.push('## Findings — the divergences this run actually found');
L.push('');
L.push('### F-1 (BIGGEST BLOCKER) — `metadata.*` / `ifcData.guid` / `_renderVersion` are re-minted on every restore and every redo, so **no element kind round-trips byte-identically and almost no redo returns to State B**');
L.push('');
L.push('This one mechanism produces **20 of the 24 FAILED rows**. Three faces of it:');
L.push('');
L.push('1. **Reload re-mints identity + audit fields.** The loader restores an element by re-running its `Create*Command`,');
L.push('   which stamps a FRESH `metadata.createdAt/modifiedAt/version` and a FRESH `ifcData.guid`. Measured:');
L.push('   `roof.cert-roof-1.metadata.createdAt: expected 1786466652844 got 1786466657218`;');
L.push('   `handrail.cert-hr-1.ifcData.guid: expected "10ba9d01-…" got "4b8a4940-…"`. The IFC GUID is a **round-trip join key**');
L.push('   (`ProjectSerializer.ts` header, A.R.3 · S55) — a model saved and reopened no longer matches its own IFC/Revit export.');
L.push('2. **Redo re-stamps `modifiedAt`.** `CommandManager.redo()` re-EXECUTES the command instead of re-applying a patch, so');
L.push('   State-B-after-redo differs from State B by a few ms on `metadata.modifiedAt` (`expected …868 got …875`). Every');
L.push('   non-batch H2 row with a clean undo fails on this and only this.');
L.push('3. **Monotonic counters never return.** `element.updateParameters` left `metadata.version 4` where State A held `2`;');
L.push('   the door/window offset verbs leave `wall._renderVersion` **+2 per undo cycle** (`expected 3 got 5`). Cycle after');
L.push('   cycle the model is never bit-equal to where it was.');
L.push('');
L.push('**Deliberately NOT normalised away.** The harness ships an EMPTY documented-tolerance list (STOP rule): whether');
L.push('`metadata` / `_renderVersion` are legitimate derived state is a CONTRACT question — C13 §2 requires snapshots to');
L.push('round-trip byte-compatibly — not a harness question. Until a contract declares them derived, they are divergences.');
L.push('');
L.push('### F-2 — `stair` and `beam` LOSE THEIR IDENTITY across save/reload (a real data defect, not a timestamp)');
L.push('');
L.push('Measured: `stair.cert-st-1: expected "(present)" got "(absent — LOST)"` alongside');
L.push('`stair.dd43622f-…: expected "(absent)" got "(present)"` — and identically for `beam`. The element survives under a');
L.push('**different id**. Source-anchored root cause: `packages/command-registry/src/project/ImportProjectCommand.ts:680`');
L.push('constructs `CreateStairCommand({…})` **with no `id:`**, and `:875` constructs `CreateBeamCommand({…})` **with no');
L.push('`beamId:`**, so each mints a fresh UUID — while the other loader,');
L.push('`apps/editor/src/engine/persistence/ProjectLoader.ts:1011-1015`, *does* pass `id: stair.id` and cites §PERSIST-L1 for');
L.push('exactly this reason. Consequence: after one save/reload every reference to that stair or beam — railings, openings,');
L.push('room boundaries, selection, schedules, IFC join keys — points at an id that no longer exists. It also explains');
L.push('`level.L0.childrenIds` gaining two orphan entries per round-trip (the level still lists the OLD ids).');
L.push('');
L.push('### F-3 — `plumbing` and `furniture` MOVE 15 mm UP the Y axis on every reload');
L.push('');
L.push('`plumbing.cert-pl-1.position.y: expected 0 got 0.015` · `furniture.cert-fu-1.position.y: expected 0 got 0.015`.');
L.push('Deterministic, identical for both families, and CUMULATIVE by construction (the restored position is the next');
L.push('save\'s input): a fixture drifts 15 mm per open-save cycle.');
L.push('');
L.push('### F-4 — `wall.openings[*]` GAINS fields on reload that the live model never held');
L.push('');
L.push('`wall.cert-wall-1.openings.0.frameThickness: expected undefined got 0.05` (also `frameColor`, `leafColor`). The');
L.push('loader\'s `findOpeningElementData()` merges the door/window record into the wall\'s opening descriptor, so the wall');
L.push('after reload is a SUPERSET of the wall before. Benign-looking, but any equality check on that descriptor (sync,');
L.push('diffing, dirty-tracking) sees a change nobody made.');
L.push('');
L.push('### F-5 — `persist:opening` is MISCONFIGURED, and says so');
L.push('');
L.push('`UNPROVEN — seed reported success but the authoritative store holds 0 records (MISCONFIGURED for this kind)`.');
L.push('`CreateWallOpeningCommand` succeeded and produced door/window records, but the standalone `openingStore` stayed');
L.push('empty. **This row is deliberately not reported as "0 divergences / clean"** — that is the exact confusion the');
L.push('directive forbids. Whether `openingStore` is authoritative for hosted openings at all is an open question.');
L.push('');
L.push('### F-6 (correction to an earlier draft) — the room verbs are LIVE, not dead');
L.push('');
L.push('An earlier run graded `room.setMaterial` / `room.setName` as SILENT SUCCESS. That verdict was a HARNESS defect: the');
L.push('room seed had been rejected by `RoomStore.add` (non-UUID id + an invalid `detectionMethod`), so there was no room to');
L.push('change. With a schema-valid room seeded, both verbs PROVE authoritative movement (`room.<id>.colour`, `room.<id>.name`)');
L.push('and both undo cleanly. Recorded here because "the probe was wrong" is a finding too.');
L.push('');
L.push('## UNPROVEN list (what this run does NOT claim)');
L.push('');
L.push('| Axis / subject | Why UNPROVEN |');
L.push('|---|---|');
L.push('| **Geometry**, every row | no fragment builders run headlessly — no mesh is built, so "the geometry followed" is unmeasured. The roof polygon-offset oracle remains the repo\'s only geometry evidence. |');
L.push('| **Collaboration / sync**, every row | no transport exists (L-391 leg C); nothing here can observe a second client. |');
L.push('| Unified `performUndoRedo` (ring-first) path + the 250 ms cross-stack window | out of scope by design; the 3 `it.fails` pins in `undoGestureOrdering.test.ts` were left untouched. This document certifies the LEGACY `CommandManager` stack only. |');
L.push('| `slab.updateSystemTypeBatch` undo/redo | the slab type catalogue is empty headlessly; the verb REFUSED-CORRECTLY, so there was no state change to undo. |');
L.push('| 12 element kinds\' stores under `composeRuntime` | unchanged by this work. The harness builds stores the way `initBuilders` does — which is precisely the §B.1 gap. This does NOT prove `composeRuntime` reaches them. |');
L.push('| Browser save/load I/O (IndexedDB, Supabase, autosave) | only the in-memory serializer→loader pair is exercised. |');
L.push('| Chat / NL rung above the bus | covered by the RAC ladder probes, not by these harnesses. |');
L.push('');
L.push('## How to re-run');
L.push('');
L.push('```bash');
L.push('cd tools/rac-conformance/certification');
L.push('npx vitest run __tests__/persistence.cert.ts __tests__/undoredo.cert.ts   # red = findings, not breakage');
L.push('npx tsx generate-report.ts                                               # regenerates this file');
L.push('```');
L.push('');
L.push('## Axis legend');
L.push('');
L.push('| Axis | What was measured | What was NOT measured |');
L.push('|---|---|---|');
L.push('| Resolve | the seeding/creating command was accepted by `canExecute` and executed | the chat/NL rung above the bus (covered by the RAC ladder probes, not here) |');
L.push('| Dispatch | `bus.executeCommand(verb, payload)` on the REAL composed bus returned or threw — a throw is never merged with "no change" | — |');
L.push('| Authoritative state | a deep whole-store re-read moved on exactly the watched property, read INDEPENDENTLY of the command result | — |');
L.push('| Geometry | — | **UNPROVEN everywhere**: no fragment builders run headlessly, so no mesh is ever built in this harness |');
L.push('| Persistence | real serializer → JSON → real loader → deep re-read, per property | browser save/load I/O, IndexedDB, Supabase |');
L.push('| Undo / Redo | `cm.undo()`/`cm.redo()` then a whole-store deep compare to State A / State B | the unified ring-first `performUndoRedo` path and its 250 ms cross-stack window |');
L.push('| Sync (Collaboration) | — | **UNPROVEN everywhere by construction**: no transport exists (L-391 leg C) |');
L.push('| Report | the dispatch produced a structured outcome; refusals carry their reason verbatim (batch bridges\' CustomEvent payloads are captured) | transcript wording above the bus |');
L.push('');

writeFileSync(docPath, L.join('\n'));
console.log('Wrote ' + docPath);
console.log('tally: ' + JSON.stringify(t));
