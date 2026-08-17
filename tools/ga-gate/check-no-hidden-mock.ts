#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-no-hidden-mock.ts
 *
 * C74 §3.2/§3.4/§3.5 · §6 · BIM30-READINESS-GATES §3.14 — **generalised beyond
 * solvers: every stand-in is detectable from OUTSIDE its module.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * The "FreeCAD-grade constraint solver" was a `MockSolver` behind a
 * `kind = 'planegcs'` label for months, with 31 of 33 tests passing — against
 * the mock, injected through a field whose own docstring says production must
 * never pass it (C74 §0). Nothing about that defect is solver-specific: a
 * stand-in wearing a production identity, a scaffold whose retirement nobody
 * tracks, and a test suite bound to the injected double are one mechanism in
 * three costumes, and each is invisible unless it is detectable from outside
 * the module that defines it.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  M-A *(the PlanegcsAdapter shape — positive control, red until CO-01)*
 *      a class whose `kind` names an engine (non-neutral identity) while a
 *      member is assigned `new *Mock*|*Stub*|*Fake*(…)` — the class's declared
 *      identity and its performed work disagree, and no caller inspecting
 *      `kind` can tell (C74 §3.1/§3.2). A class declaring an HONESTLY neutral
 *      kind ('mock', 'stub', …) is the CORRECT behaviour this gate protects
 *      and is reported present-and-declared, never as a finding.
 *  M-B *(the dated-scaffold rule, C74 §3.4)*  a scaffold marker in a file's
 *      HEADER comment block (`SCAFFOLD` / `TODO(TASK-` / `lands at S<n>`) with
 *      no owner, no date, and no retiring assertion. Tolerance, restated
 *      (§CO-06-GRACE-FIX 2026-08-14): a fresh date buys NOTHING by itself.
 *      The pre-fix rule tolerated a bare YYYY-MM-DD younger than GRACE_DAYS
 *      with none of the rest — so a bulk re-stamp of every header would have
 *      walked the whole M-B ledger to zero having declared nothing, and one
 *      header in the estate had already reached compliance on a FUTURE stamp
 *      alone (plugins/ai-generative/src/descriptor.ts, reviewBy 2026-09-12,
 *      matched by DATE_RE and inside "grace" for as long as the deadline lay
 *      ahead). Now: inside grace a header must still name its OWNER and put
 *      in writing WHAT IS FAKE (FAKE_DECL_RE) — only the executable retiring
 *      assertion may lag, and only until the stamp is GRACE_DAYS old. A
 *      future-dated stamp opens no grace: it is a deadline, not a decision
 *      record. Outside grace, always: date + owner + retirement reference.
 *      An UNDATED marker, or a dated one past grace with no retirement
 *      reference, is a finding — *a scaffold whose retirement date is
 *      untracked is permanent architecture that nobody chose*. Scope, stated: the HEADER
 *      block only. The estate carries 800+ inline `TODO(TASK-…)` lines; an
 *      inline task note on line 412 is a work marker, not a module standing in
 *      for production, and sweeping them in would bury the 59 real scaffold
 *      headers under noise (§FIX-ZONING-GATE-MISSLICE: an over-eager matcher
 *      gets a suffix list bolted on later to silence it).
 *  M-C *(the `opts.underlying` shape, C74 §3.5)*  a test that injects a field
 *      whose own docstring forbids production use ("Production callers MUST
 *      NOT pass/set/supply…"). Such a test covers the one configuration
 *      production never uses, and the configuration production DOES use (the
 *      `??` fallback) is the untested one. Counted AND named, per injection
 *      site. Exclusions are named in the output, never silent — the
 *      false-positive surface here is fields whose docstring forbids CALLING
 *      rather than PASSING (e.g. FrameCoordinator's "Production code MUST NOT
 *      call this"), which are excluded by requiring an injection verb.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * `selfTest()` materialises two synthetic workspaces:
 *   • PLANTED — a `FakeXStore` wired behind a production class whose kind
 *     names an engine, with no external signal (M-A must name it); an undated
 *     scaffold header (M-B); a field docstring-forbidden to production,
 *     injected by a test (M-C must name the test site).
 *   • CLEAN — a stand-in that ANNOUNCES itself (kind = 'mock' — must be
 *     reported present-and-declared, NOT a finding); a dated scaffold header
 *     inside grace with owner and retiring assertion; a test that does not
 *     inject the forbidden field. Must read 0.
 * Any silent planted arm, or any clean-tree finding, exits 2 as a BLIND
 * COMPARATOR.
 *
 * ─── Ledger, not count ───────────────────────────────────────────────────────
 * A named, shrink-only list checked in BOTH directions — a bare count would
 * let one hidden mock be fixed while another was introduced and read as "no
 * change" (C69 §7.c). Exit condition: the ledger reaches 0 and the gate flips
 * hard-0 (C74 §6, exit condition 4).
 *
 * ─── What this gate CANNOT see (C74 §6.3, restated for these arms) ───────────
 *   • runtime DI substitution — a double injected at runtime is invisible to a
 *     source scan;
 *   • a stand-in named nothing like a stand-in — M-A keys on the *Mock*|*Stub*|
 *     *Fake* naming convention because that is what a scan CAN find; the
 *     outward signal C74 §3.2 requires is what makes the scan unnecessary, and
 *     no static scan can verify a first-call runtime signal;
 *   • scaffolds marked with vocabulary outside the three header patterns;
 *   • semantic correctness — an honest stand-in computing wrong answers passes
 *     every arm here.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind
 * comparator · 3 ledger exceeded or stale. 2 and 3 are never absorbable.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-no-hidden-mock';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

const MIN_FILES = 500;
/**
 * M-B grace (§CO-06-GRACE-FIX): a dated scaffold younger than this may still owe
 * its executable retiring assertion — but NEVER its owner or its written
 * declaration of what is fake. A date alone opens nothing.
 */
const GRACE_DAYS = 90;

/** Kinds that describe a stand-in honestly — outside M-A by construction. */
const NEUTRAL_KINDS = new Set([
  'mock', 'stub', 'fake', 'dummy', 'noop', 'none', 'null', 'test',
  'builtin', 'internal', 'native', 'local', 'memory', 'in-memory',
  'default', 'sim', 'simulated', 'scaffold',
]);

const STAND_IN_CTOR = /\bnew\s+([A-Za-z_$]*(?:Mock|Stub|Fake)[\w$]*)\s*\(/;
const SCAFFOLD_MARK = /\bSCAFFOLD\b|TODO\(TASK-|lands at S\d+/;
const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g;
const RETIREMENT_RE = /retir\w+|remove(?:d)? when|delete(?:d)? when|fails? when|assert/i;
const OWNER_RE = /@owner|owner\s*:/i;
/**
 * §CO-06-GRACE-FIX — inside grace the retiring assertion may still be being
 * built, but the header must already DECLARE what is fake (the WallRegionExtractor
 * house style: "WHAT IS FAKE", "stands in for", "stand-in", "placeholder",
 * "NOT WIRED"). Matched loosely on the words an honest declaration uses; a match
 * can only ever NARROW a finding (it sits on the compliance side), never mint one.
 */
const FAKE_DECL_RE = /WHAT IS FAKE|\bFAKE\b|\bstand[\s-]?ins?\b|\bstands? in for\b|\bplaceholder\b|\bNOT WIRED\b/i;
/** M-C: a docstring that forbids PRODUCTION from INJECTING the field. */
const FORBIDDEN_DOC = /production(?:\s+\w+){0,3}\s+MUST\s+NOT(?:\s+\w+)?\s+(pass|set|supply|provide|inject)|MUST\s+NOT\s+(?:pass|set|supply|provide|inject)(?:\s+\w+){0,4}\s+production/i;

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * Measured 2026-08-12 at HEAD (56a838bc). Entries are `arm::file[:detail]`.
 * Fix a finding → strike its line in the SAME commit. A new finding is exit 3.
 *
 * M-A: PlanegcsAdapter — THE positive-control defect (C74 §0). Red here until
 *      CO-01 resolves: either the adapter performs a real solve, or its `kind`
 *      stops naming an engine it does not run — and per C74 §4.3 the
 *      truthfulness change lands in ITS OWN COMMIT, before any binding work.
 * M-B: every scaffold HEADER in the estate lacking owner+date+retirement.
 * M-C: was PlanegcsAdapter.test.ts injecting `underlying:` at :67 and :94 —
 *      the field whose docstring said "Production callers MUST NOT pass
 *      this". PAID 2026-08-14 (CO-03), see the struck block below. The arm
 *      stays armed with an empty ledger: any new injection of any
 *      docstring-forbidden field fires as NOT ON THE LEDGER → exit 3.
 */
const LEDGER: readonly string[] = [
  // M-A::PlanegcsAdapter STRUCK 2026-08-12 — the adapter's `kind` now reports
  // the actual underlying ('mock'), intent moved to a separate `intendedEngine`
  // field, and a one-time first-call warning is the §3.2 boundary signal
  // (CO-01, the C74 §4.3 truthfulness commit).
  // M-C line numbers re-pinned 2026-08-12: the test file gained PRODUCTION-path
  // coverage (the un-injected `?? new MockSolver()` construction, C74 §3.5's
  // demand) and a §3.5 coverage statement in its header; the two remaining
  // seam-test injection sites moved accordingly. Same two sites, new lines.
  // M-C::PlanegcsAdapter.test.ts:121/:150 STRUCK 2026-08-14 (CO-03) — paid by
  // DELETING THE SEAM, not by disclosure alone. The `underlying?:` option
  // (docstring-forbidden to production) is gone from PlanegcsAdapterOptions;
  // the constructor builds its MockSolver unconditionally (the `??` fallback
  // no longer exists as a branch to leave untested); and the suite proves
  // delegation by spying on the REAL MockSolver behind the production
  // construction (`vi.spyOn(MockSolver.prototype, …)`), so every test
  // exercises exactly the configuration production runs (C74 §3.5). The 2026-
  // 08-12 pass had already added production-path tests and the §3.5 header
  // statement — the arm kept firing because the injection SITES remained;
  // removing the sites' reason to exist is the honest payment, and weakening
  // the arm to read the disclosure would not have been (a boilerplate
  // disclosure line must never buy a pass).
  // M-B — 60 scaffold headers (of 62 found) carrying no owner+date+retiring-
  // assertion. Note the PAIR src/familyCreatorPlaceholder.ts and
  // apps/editor/src/familyCreatorPlaceholder.ts — the same scaffold twice, in
  // the transitional client root and the L7 app, which is itself the two-copies
  // anti-pattern (C74 §5.e) wearing a scaffold header.
  // ─── CO-06 lane C4, 2026-08-15 — the familyCreatorPlaceholder PAIR, paid two
  // DIFFERENT ways because they are two DIFFERENT files that merely share a name.
  // The note above called them "the same scaffold twice"; that was true of the
  // BYTES and false of the WIRING, and the difference is the whole disposition.
  //
  // M-B::src/familyCreatorPlaceholder.ts STRUCK — paid by DELETION (C74 §3.8).
  //   DEAD-PROOF, not "looks unused": (a) repo-wide search for the module name
  //   and for `openFamilyCreatorPlaceholder` returns exactly two importers, and
  //   BOTH relative specifiers resolve elsewhere — CreateRailPanel.ts:1105's
  //   `../../../familyCreatorPlaceholder` from apps/editor/src/ui/tools-panel/
  //   panels/ lands on apps/editor/src/, and CreatePanelLayout.ts:350's
  //   `../familyCreatorPlaceholder` from apps/editor/src/ui/layout/ lands on
  //   apps/editor/src/ui/. Neither can reach src/. (b) `src/main.ts` is the ONLY
  //   HTML entry (index.html:429) and never imports it, statically or
  //   dynamically. (c) EXECUTION: the committed build output
  //   (reports/.build-clean.txt:47,58) emits exactly TWO familyCreatorPlaceholder
  //   chunks — 0.13 kB (the ui/ console.log stub) and 2.35 kB (the apps/editor
  //   modal). Three copies existed; two shipped. The third was never in the
  //   bundle. Its non-return is now asserted, not merely asserted-about:
  //   apps/editor/__tests__/FamilyCreatorPlaceholderScaffold.test.ts.
  //
  // M-B::apps/editor/src/familyCreatorPlaceholder.ts STRUCK — paid by the §3.2/
  //   §3.4 header, NOT by deletion: it is LIVE from CreateRailPanel.ts:1105.
  //   Header now carries owner + date 2026-08-15 + WHAT IS FAKE / WHAT IS REAL +
  //   an executable retiring assertion, and names the S58 milestone as the PLAN's
  //   number restated rather than a fresh promise (C74 §4.2(c)) — the prototype
  //   was removed 2026-04-28 and nothing has shipped since.
  //
  // ⚠ NAMED, not silently left: a THIRD file, apps/editor/src/ui/
  //   familyCreatorPlaceholder.ts, is also a placeholder (a console.log no-op
  //   reached from ui/layout/CreatePanelLayout.ts:350) and is NOT on this ledger
  //   and NOT a finding — its header carries no SCAFFOLD_MARK, so M-B never saw
  //   it. That is a gap in the ARM's reach, not an estate that is clean. Recorded
  //   here so the omission is deliberate; it is the next honest edit in that file.
  // ─── CO-06 lane E (half1-honesty), 2026-08-17 — THE LAST SIX M-B ROWS,
  // PAID SIX AT A TIME BUT NOT SIX THE SAME WAY. Three were never scaffolds and
  // are RECLASSIFIED; three are real scaffolds and got the full §3.4
  // declaration with an executable retiring assertion WATCHED FLIPPING. The
  // split is stated per file so this block cannot read as a bulk re-stamp.
  //
  // ⚠ THE ARM'S REACH DID NOT SHRINK BY THE SAME AMOUNT AS THE LEDGER. Scaffold
  // headers found went 13 → 10 because the three RECLASSIFIED files stopped
  // making a module-scaffold claim; the three DECLARED files keep their
  // SCAFFOLD_MARK and are STILL WATCHED by this arm. Recorded because a header
  // count falling is otherwise indistinguishable from an estate getting clean.
  //
  // M-B::apps/ai-worker/src/pdf-to-bim/stage2-openings.ts STRUCK — RECLASSIFIED.
  //   Not a scaffold: a complete, pure-geometry symbol matcher. The marker was
  //   "lands at S55" inside a sentence about an AI-FALLBACK PATH THAT IS NOT IN
  //   THIS FILE — the header walk cannot tell "a future sibling capability"
  //   from "this module stands in for production". NO NOTE WAS LOST: the fact
  //   moved to the TWO sites that mint `confidence` (the door candidate and the
  //   window candidate), where it is load-bearing on a reader, and it is stated
  //   in this lane's own terms — a low confidence is UNDETERMINED at the caller,
  //   never an accepted opening, because nothing re-examines a weak match.
  // M-B::apps/editor/src/ui/dataworkbench/DataVisualizerService.ts STRUCK and
  // M-B::apps/editor/src/ui/dataworkbench/ProgrammePanel.ts STRUCK —
  //   RECLASSIFIED, the FIFTH round of the ratified `TODO(TASK-08)`-in-a-header
  //   treatment (see the core-app-model and command-registry blocks below).
  //   Both are live production UI modules whose header carried TASK-08 appended
  //   to prose lines DESCRIBING window.*-store access. Paid by moving the marker
  //   to the code, not by deleting it: `TODO(TASK-08)` now sits inline on
  //   DataVisualizerService's `window.roomStore` read (:228) and its
  //   `window.programmeStore` read (:278), and on ProgrammePanel's
  //   `window.programmeStore = {` exposure site (:64), beside the pre-existing
  //   TODO(E.18-R.S)/TODO(F.6.x) notes. The TASK-08/ADR-0318 work inventory is
  //   unchanged and still greppable.
  //
  // M-B::apps/bench/src/benches/constraint-solver.bench.ts STRUCK — DECLARED.
  //   A REAL scaffold, and the declaration says the thing that matters: every
  //   number it prints is MockSolver timing, so its p95 IS NOT the S52 line-1488
  //   criterion ("50-constraint sketch p95 < 16 ms"). That criterion is
  //   UNMEASURED, not met, and a green bench must not be quoted against it.
  //   Retiring assertion IN THE BENCH FILE: `new PlanegcsAdapter(...).kind ===
  //   'mock'`, which is derived from whatever actually executes, so an
  //   authorised WASM binding turns it RED. Deliberately NOT
  //   `new MockSolver().kind === 'mock'` — that stays green forever after
  //   planegcs lands, which is the F9 trap this block must not repeat.
  // M-B::apps/component-editor/src/sketch/SketchCanvas.ts STRUCK 2026-08-16
  //   (CO-06 lane F9) — PAID ON THE MERITS, not by hiding the subject. The
  //   header keeps its SCAFFOLD_MARK, so the file is STILL WATCHED by this arm;
  //   it now carries owner + date + an executable retiring assertion. The old
  //   text ("until the global frame-scheduler lands at S55") was STALE-FALSE:
  //   `@pryzm/frame-scheduler` had already landed and a sibling file in the same
  //   app said so in the present tense. What remains is the narrower, TRUE gap —
  //   the app has not taken the dependency. Retiring assertion:
  //   `__tests__/sketch/SketchCanvas.test.ts` "SCAFFOLD: this app has NOT
  //   adopted the frame bus" — both halves (no dep in package.json; still calls
  //   `queueMicrotask`) verified 2026-08-16 to FLIP on adoption.
  //
  // ⚠ THE OTHER TWO component-editor ROWS BELOW ARE DELIBERATELY NOT STRUCK.
  //   Lane F9 inherited proposed declarations for both and REVERTED them:
  //   TrimTool's cited retiring assertion ("SCAFFOLD: a circle is not
  //   trimmable…") DID NOT EXIST in TrimTool.test.ts, and FilletTool cited
  //   "rejects parallel lines" (:106), which is real but STAYS GREEN after the
  //   trim/extend variant lands (its fixture is genuinely parallel, cross-
  //   product determinant 0, so extension never yields an intersection) — an
  //   assertion that cannot fail cannot retire anything. RETIREMENT_RE is a
  //   prose regex and is structurally blind to both defects; these rows stay
  //   until the assertions exist and are proven to flip.
  //
  // ─── BOTH STRUCK 2026-08-17 (CO-06 lane E, half1-honesty) — THE ASSERTIONS
  //   F9 REQUIRED NOW EXIST AND WERE WATCHED FLIPPING. F9's condition is met
  //   literally: each assertion was planted against, seen RED, and the source
  //   reverted byte-identical (`git diff` empty) with the rest of the suite
  //   green throughout, so neither is a prose claim RETIREMENT_RE merely
  //   matched.
  //
  // M-B::…/TrimTool.ts — "circles are NOT trimmable (S55)", 2 assertions. The
  //   circumference click is refused with the exact message, `trimLine` is
  //   never called, AND that refusal is asserted BYTE-IDENTICAL to the
  //   empty-sketch one — which is the honest reading of today's behaviour and
  //   this repo's own subject: `hitTest` enumerates only point and line, so
  //   "there is a circle here I cannot trim" and "there is nothing here" ARE
  //   THE SAME VALUE (C70 L-INV-1). Circle trimming cannot land without the
  //   click resolving to the circle, so both go RED. WATCHED: a circle arm
  //   planted in `hitTest` plus a circle branch in the tool → 2 failed /
  //   7 passed.
  //
  // M-B::…/FilletTool.ts — "lines that do not meet (S55)", and paying this row
  //   SURFACED A DEFECT THAT WAS PREVIOUSLY INVISIBLE, which is the finding
  //   that matters more than the strike. The old LIMITATIONS list claimed the
  //   tool "requires the lines to actually intersect (parallel lines are
  //   rejected)". It does not. `findCommonOrIntersection` solves the INFINITE-
  //   line intersection with NO segment-bounds check, so two non-parallel
  //   segments that do not touch produce SUCCESS: an arc tangent to a point
  //   past the end of a segment, neither line extended, and the ordinary
  //   "Click first line" ready-hint. Measured with A = (0,0)→(4,0),
  //   B = (10,2)→(10,12): centre (8,2) r=2, tangent to A's line at x=8 when A
  //   ends at x=4; commitLine and trimLine both ZERO. The new assertion pins
  //   exactly that, and NOT the 'rejects parallel lines' case F9 correctly
  //   rejected as unfailable. WATCHED: an extend-to-corner step planted before
  //   the fillet → 1 failed / 8 passed. The defect is PINNED, NOT ENDORSED —
  //   it is named in the file's §3.4 declaration and closing it is the S55
  //   extend variant's job, not this row's.
  // 'M-B::apps/editor/src/familyCreatorPlaceholder.ts' — STRUCK 2026-08-15, see
  // the CO-06 lane C4 block above.
  // ─── CO-06v2 — 6 ROWS STRUCK 2026-08-14: the FOURTH round of the same
  // ratified reclassification (lanes E, F, core-app-model above). All six are
  // live production modules whose HEADER carried inline `// TODO(TASK-08)`
  // work notes appended to prose lines DESCRIBING window.*-store reads — the
  // header walk cannot tell those from a module-scaffold claim. Verified per
  // file before striking: the ONLY marker removed is `TODO(TASK-08)`; no
  // `SCAFFOLD` word, no `lands at S##`, so no file lost a scaffold
  // declaration, and NO note was lost:
  //   BrowserDataHelpers.ts — 18 header notes → 18 inline copies at the exact
  //     code sites (the 16-store getAllStores array, ifcModelStore :111,
  //     projectStore :432). The header's window-globals TABLE stays (it is
  //     documentation), only the work markers moved to the reads they mark.
  //   RoomPathfinderPanel.ts / EvacuationSimulatorPanel.ts / RoomGraphPanel.ts
  //     — one header note each, relocated onto the primary
  //     `window.roomStore?.getAll?.()` read the header line described (each
  //     already carried a TODO(E.*) phase note; TASK-08 now sits beside it).
  //   RoomAutoOrganiser.ts — the header's `window.roomStore.getAll()` DATA
  //     FLOW line was STALE twice over: the code reads rooms via
  //     `storeRegistry.getStoreForType("room")` (:117), not window.roomStore.
  //     Header corrected to the real flow; the TASK-08 note relocated to the
  //     one legacy window-global the file still reads,
  //     `window.roomTypeInferenceEngine` (:118).
  //   CurtainWallBuilder.ts — the inline copy ALREADY existed at the accessor
  //     (:791, the `window.curtainPanelStore` fallback); the header copy was a
  //     duplicate and is stripped, same as lane F's three pre-annotated files.
  //     (Its "date 2026-04-08" was an unrelated fix-stamp in the MODIFICATION
  //     DECLARATION, not a scaffold decision — the same DATE_RE ambiguity the
  //     core-app-model block records.)
  // The two dataworkbench rows that stood here — DataVisualizerService.ts and
  // ProgrammePanel.ts — were STRUCK 2026-08-17 as the FIFTH round of this same
  // treatment. See the CO-06 lane E (half1-honesty) block at the top.
  // M-B::packages/ai-host/src/AmbientIntelligence.ts STRUCK 2026-08-14 (CO-06,
  // lane F) — RECLASSIFIED, not deleted. Full reasoning in the lane-F block below,
  // where the other 13 rows of the same payment are recorded together.
  // M-B::packages/ai-host/src/WallRegionExtractor.ts STRUCK 2026-08-14 (CO-06) —
  // the header now carries owner + date + an EXECUTABLE retiring assertion:
  // `__tests__/WallRegionExtractor.hullRefusal.test.ts` asserts an L-shaped plan is
  // REFUSED, which a real planar topology layer would not do, so the assertion fails
  // the moment the Phase E replacement lands and forces the header retired with it.
  // The declaration states what is FAKE (a Jarvis-march convex hull standing in for a
  // planar graph) — it does not claim the scaffold is real.
  // M-B::packages/command-registry/* — ALL 11 ROWS STRUCK 2026-08-14 (CO-06,
  // lane E), two treatments, stated so the strike cannot read as a bulk stamp:
  //
  // TEN were NOT scaffolds — real, wired production commands whose header
  // carried an inline `// TODO(TASK-08)` work note appended to a StoreEventBus /
  // window.*-store flow line: the exact "inline task note is a work marker, not
  // a module standing in for production" shape this gate's own header zones OUT
  // of M-B. Paid by RECLASSIFICATION, not deletion: each TASK-08 note moved
  // beside the import/code it annotates (still greppable inline, still owned by
  // TASK-08/ADR-0318), and the header stopped making a module-scaffold claim
  // the module never made. No note lost, none re-stamped bare:
  //   catalog/AddAssetCatalogEntryCommand.ts
  //   catalog/DeleteAssetCatalogEntryCommand.ts
  //   catalog/UpdateAssetCatalogEntryCommand.ts
  //   columns/UpdateColumnCommand.ts
  //   curtainwall/UpdateCurtainWallCommand.ts
  //   generic/UpdateElementParameterCommand.ts
  //   grids/RemoveGridCommand.ts
  //   grids/UpdateGridCommand.ts
  //   requirements/SetRoomRequirementCommand.ts
  //   views/SetViewDesignOptionCommand.ts
  //
  // The ELEVENTH, curtainwall/AddCurtainGridLineCommand.ts, IS a disposition
  // case — an ORPHANED legacy command whose live path moved to the
  // produceCommand handler (TASK-07 Phase B) — and received the full C74 §3.4
  // declaration: owner (curtain-wall verb family / E.5.x cleanup), date,
  // WHAT-THIS-IS, and a REMOVED-when-zero-callers retiring condition. The
  // pre-existing "TODO(E.5.x): ORPHANED" note is preserved inside it verbatim
  // in substance; nothing was softened.
  // M-B::packages/constraint-solver/src/PlanegcsAdapter.ts STRUCK 2026-08-12 —
  // header now carries owner, date, a retiring assertion (the "scaffold
  // retirement guard" test), and the S52-D2/S53-D1 disagreement resolved to
  // ONE milestone: C74 §4.2(c) authorisation.
  // M-B::packages/core-app-model/* — ALL 16 ROWS STRUCK 2026-08-14 (CO-06,
  // lane E). NONE was a scaffold: every file is live production (the batch
  // coordinator, the store event bus itself, the semantic index, the element
  // stores, the barrel). Each header carried `// TODO(TASK-08)` appended to
  // prose lines MENTIONING StoreEventBus — and in ALL 16 files the SAME
  // annotation already sits inline on the actual `import { storeEventBus }` /
  // code lines outside the header (verified per file before striking;
  // StoreEventBus.ts alone carries 19 inline copies, TemporalGraph 7,
  // BatchCoordinator 6, index.ts has them on both export lines). The header
  // copies were DUPLICATES whose only effect was to make production modules
  // read as scaffolds to this gate. Paid by stripping the header duplicates
  // only — every inline TASK-08 annotation at a code site remains, so the
  // TASK-08/ADR-0318 work inventory is unchanged:
  //   ElementCodeStore.ts · IFCPsetAdapter.ts · SemanticIndex.ts ·
  //   StoreEventBus.ts · TemporalGraph.ts · batch/BatchCoordinator.ts ·
  //   catalog/AssetCatalogStore.ts · comparison/ComparisonEngine.ts ·
  //   hierarchy/HierarchyStore.ts · index.ts ·
  //   requirements/RequirementStore.ts · stores/GridStore.ts ·
  //   stores/RoomBoundingLineStore.ts · sync/SyncStateEngine.ts ·
  //   views/ViewDependencyTracker.ts · views/ViewTemplateStore.ts
  // (The three dated ones — BatchCoordinator 2026-05-04, RequirementStore
  // 2026-05-10, ViewTemplateStore 2026-04-26 — were dated by unrelated fix
  // stamps in their headers, not by scaffold decisions; DATE_RE cannot tell
  // those apart, which is one more reason a date alone must buy nothing.)
  // ─── CO-06 lane F — 14 ROWS STRUCK 2026-08-14. Two treatments, stated
  // separately so the strike cannot read as a bulk stamp. ────────────────────
  //
  // ⚠ HOW THIS WAS FOUND, because the finding matters more than the strike: the
  // gate was reading exit 3 STALE LEDGER, and the fix commits it was attributed
  // to (eb966187, fb7d56ca) turn out NOT to be the cause — those two DID strike
  // their own rows, correctly, in the commits that paid them (the command-registry
  // and core-app-model blocks above). The real cause was that lane F's payment
  // existed ONLY as UNCOMMITTED edits in the shared worktree. Striking these rows
  // alone would have made the gate read green against a dirty tree and exit 3 in
  // the OPPOSITE direction at HEAD (14 findings NOT ON THE LEDGER), which is the
  // worse failure. So the 14 payments and these 14 strikes land in ONE commit —
  // which is exactly what C70 §5.4 asks for and why it asks for it.
  //
  // THIRTEEN were NOT scaffolds — the same shape already ratified twice above: an
  // inline `// TODO(TASK-08)` (once `TODO(TASK-15)`) work note appended to the END
  // of a prose line inside the file's leading comment, which this gate's header
  // walk cannot distinguish from a module-scaffold claim. Verified before striking:
  // the ONLY markers removed across all 13 files are 15 × `TODO(TASK-08)` and
  // 1 × `TODO(TASK-15)` — no `SCAFFOLD` word, no `lands at S##`, so no file lost a
  // scaffold DECLARATION; and no note was lost. Ten were relocated beside the
  // import/code they annotate; three already carried inline copies at the code site
  // and needed no new one (ColumnPlanSymbolBuilder.ts:125 `window.columnStore`
  // fallback · PhysicsEngine.ts:223/:232/:342/:351 `window.roomStore`/`windowStore`
  // reads · TopologyLayer.ts:193, the class docstring over the `storeEventBus
  // .subscribe(…)` at :219). The TASK-08/ADR-0318 work inventory is unchanged:
  //   packages/ai-host/src/AmbientIntelligence.ts
  //   packages/event-bus/src/catalog.ts                      (TASK-15)
  //   packages/file-format/src/import/dxf/DxfLayerStore.ts
  //   packages/file-format/src/import/dxf/DxfOverlayStore.ts
  //   packages/geometry-column/src/ColumnPlanSymbolBuilder.ts
  //   packages/geometry-door/src/DoorSystemTypeStore.ts
  //   packages/geometry-window/src/WindowSystemTypeStore.ts
  //   packages/persistence-client/src/loader/ProjectLoader.ts
  //   packages/physics-host/src/PhysicsEngine.ts
  //   packages/room-topology/src/RoomStore.ts
  //   packages/room-topology/src/TopologyLayer.ts
  //   packages/spatial-index/src/RoomTypeInferenceEngine.ts
  //   packages/spatial-index/src/index.ts
  //
  // The FOURTEENTH, providers/resolveChFarFromCantonCatalogue.ts, IS a real
  // scaffold and KEEPS its `SCAFFOLD` marker — it was paid by DECLARATION, and it
  // is the interesting one. Its header had rotted in the direction nobody watches:
  // it claimed "default OFF … NO canton catalogue harvested and NO L-449 sign-off …
  // returns `null` for every input" while `CH_FAR_CERTIFIED` has been `true` since
  // the 2026-07-26 owner sign-off (declared at :104) and `ZURICH_ZH_FAR_CATALOGUE`
  // has been wired into `CH_CANTON_FAR_CATALOGUES` (:145) — i.e. a live,
  // envelope-binding number was documented as a stub. It now carries owner, date,
  // what is REAL (the signed ZH BZO transcription, GFA-capping the massing) vs what
  // is STILL scaffold (every other canton, which refuses `no-canton-catalogue`
  // rather than returning a number), and two EXECUTABLE retiring assertions
  // verified to exist and to assert what the header says they assert:
  // `__tests__/chZurichBzoCatalogue.test.ts:297` (`CH_FAR_CERTIFIED === true`) and
  // `:300` (a real ZH zone `W2bIII` RESOLVES a signed AZ), plus
  // `__tests__/chGrundnutzungProvider.test.ts` on the unharvested-canton refusal.
  // ⚠ NAMED, not silently left: two prose blocks DEEPER in that same file (:138,
  // :154) still say the flag is OFF. They are outside the header block this arm
  // reads, so they cannot hold the row open — but they are stale and are the next
  // honest edit in that file, recorded here so the omission is deliberate.
  // M-B::packages/geometry-curtain-wall/src/CurtainWallBuilder.ts STRUCK
  // 2026-08-14 (CO-06v2) — part of the six-row reclassification block above.
];

// ─── Subject discovery ───────────────────────────────────────────────────────

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.tsx?$/.test(rel);
}

interface Finding { readonly arm: 'M-A' | 'M-B' | 'M-C'; readonly key: string; readonly detail: string }

interface DeclaredStandIn { readonly file: string; readonly line: number; readonly className: string; readonly kind: string }

interface Analysis {
  readonly findings: Finding[];
  readonly filesScanned: number;
  readonly declaredStandIns: DeclaredStandIn[];   // honest ones, reported present-and-declared
  readonly scaffoldHeaders: number;               // headers carrying a marker (compliant + not)
  readonly forbiddenFields: Array<{ file: string; field: string }>;
  readonly exclusionsPrinted: string[];           // M-C names every exclusion
}

/** Leading comment/blank block of a file, as raw lines. */
function headerBlock(raw: readonly string[]): string {
  let end = 0, inBlock = false;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!.trim();
    if (inBlock) { end = i + 1; if (t.includes('*/')) inBlock = false; continue; }
    if (t === '' || t.startsWith('//')) { end = i + 1; continue; }
    if (t.startsWith('/*')) { inBlock = !t.includes('*/'); end = i + 1; continue; }
    break;
  }
  return raw.slice(0, end).join('\n');
}

function analyse(root: string, dirs: readonly string[], today: Date): Analysis {
  const findings: Finding[] = [];
  const declaredStandIns: DeclaredStandIn[] = [];
  const forbiddenFields: Array<{ file: string; field: string }> = [];
  const exclusionsPrinted: string[] = [];
  let filesScanned = 0;
  let scaffoldHeaders = 0;

  const CLASS = /\bclass\s+([A-Za-z_$][\w$]*)/;
  const KIND = /^\s*(?:public\s+|private\s+|protected\s+|declare\s+)?(?:readonly\s+)?kind\s*(?::\s*[\w'"|. <>\[\]]+\s*)?=\s*['"]([\w.-]+)['"]/;
  const FIELD_AFTER_DOC = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/;

  // pass 1 — production sources: M-A, M-B, and the M-C field inventory.
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel) || rel.endsWith('.d.ts')) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const raw = src.split('\n');
      const lines = stripCommentsToLines(src);

      // ── M-B — scaffold header discipline (reads the RAW header: the marker IS a comment)
      const hdr = headerBlock(raw);
      if (SCAFFOLD_MARK.test(hdr)) {
        scaffoldHeaders++;
        const dates = [...hdr.matchAll(DATE_RE)].map((m) => m[1]!);
        const newest = dates.map((d) => new Date(d)).sort((a, b) => b.getTime() - a.getTime())[0];
        // §CO-06-GRACE-FIX (2026-08-14) — the old rule here was
        //   `compliant = (date && owner && retirement) || withinGrace`
        // and the `|| withinGrace` term let a header pass on a fresh DATE ALONE:
        // a bulk re-stamp would have paid the ledger down having bought nothing,
        // and a FUTURE stamp (age negative, so trivially ≤ GRACE_DAYS) passed
        // indefinitely. Grace now relaxes only the DEADLINE, never the
        // declaration: inside grace the header must still carry an owner and a
        // written statement of what is fake; a future stamp opens no grace at
        // all (−1 day of slack tolerates same-day timezone skew, nothing more).
        const ageDays = newest === undefined
          ? Number.POSITIVE_INFINITY
          : (today.getTime() - newest.getTime()) / 86_400_000;
        const withinGrace = ageDays >= -1 && ageDays <= GRACE_DAYS;
        const hasOwner = OWNER_RE.test(hdr);
        const hasRetirement = RETIREMENT_RE.test(hdr);
        const compliant =
          (newest !== undefined && hasOwner && hasRetirement) ||       // the full declaration
          (withinGrace && hasOwner && FAKE_DECL_RE.test(hdr));         // fresh: assertion may lag; the declaration may not
        if (!compliant) {
          const missing: string[] = [];
          if (newest === undefined) missing.push('NO date');
          else if (ageDays > GRACE_DAYS) missing.push(`date ${newest.toISOString().slice(0, 10)} past the ${GRACE_DAYS}-day grace`);
          else if (ageDays < -1) missing.push(`date ${newest.toISOString().slice(0, 10)} in the FUTURE — a forward stamp is a deadline, not a decision record, and opens no grace (§CO-06-GRACE-FIX)`);
          else missing.push(`date ${newest.toISOString().slice(0, 10)} inside grace — but a date alone buys nothing (§CO-06-GRACE-FIX)`);
          if (!hasOwner) missing.push('no owner');
          if (!hasRetirement) {
            missing.push(withinGrace
              ? 'no retiring assertion and no written declaration of what is fake'
              : 'no retiring assertion');
          }
          findings.push({
            arm: 'M-B',
            key: `M-B::${rel}`,
            detail: `${rel} — scaffold header (${SCAFFOLD_MARK.exec(hdr)![0]}) with ${missing.join(', ')}. ` +
              'A scaffold whose retirement date is untracked is permanent architecture that nobody chose (C74 §3.4).',
          });
        }
      }

      // ── M-A — kind-declaring classes delegating to a *Mock*|*Stub*|*Fake* member
      let currentClass = '';
      let classStart = -1;
      const classes: Array<{ name: string; start: number; end: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const c = CLASS.exec(lines[i]!);
        if (c) {
          if (currentClass) classes.push({ name: currentClass, start: classStart, end: i });
          currentClass = c[1]!; classStart = i;
        }
      }
      if (currentClass) classes.push({ name: currentClass, start: classStart, end: lines.length });
      for (const cls of classes) {
        let kind: { value: string; line: number } | undefined;
        let standIn: { ctor: string; line: number } | undefined;
        for (let i = cls.start; i < cls.end; i++) {
          const k = KIND.exec(lines[i]!);
          if (k && !kind) kind = { value: k[1]!, line: i + 1 };
          const s = STAND_IN_CTOR.exec(lines[i]!);
          if (s && !standIn) standIn = { ctor: s[1]!, line: i + 1 };
        }
        if (!kind) continue;
        if (NEUTRAL_KINDS.has(kind.value.toLowerCase())) {
          declaredStandIns.push({ file: rel, line: kind.line, className: cls.name, kind: kind.value });
          continue; // honest — the correct behaviour this gate protects
        }
        if (standIn) {
          findings.push({
            arm: 'M-A',
            key: `M-A::${rel}:${cls.name} kind='${kind.value}' delegates to ${standIn.ctor}`,
            detail: `${rel}:${kind.line} — class ${cls.name} declares kind='${kind.value}' (an engine identity) ` +
              `while constructing \`new ${standIn.ctor}(…)\` at :${standIn.line}. The declared identity and the ` +
              `performed work disagree, and no caller inspecting \`kind\` can tell (C74 §3.1/§3.2). Either the ` +
              `identity becomes honest or the delegation becomes real — truthfulness FIRST, in its own commit (C74 §4.3).`,
          });
        }
      }

      // ── M-C inventory — fields whose docstring forbids production injection
      for (let i = 0; i < raw.length; i++) {
        if (!/MUST\s+NOT/i.test(raw[i]!)) continue;
        const docWindow = raw.slice(Math.max(0, i - 3), i + 3).join('\n');
        if (!FORBIDDEN_DOC.test(docWindow)) {
          if (/MUST\s+NOT/i.test(raw[i]!) && /production/i.test(docWindow) && !exclusionsPrinted.some((e) => e.startsWith(rel))) {
            exclusionsPrinted.push(`${rel}:${i + 1} — "MUST NOT" near "production" but no injection verb (pass/set/supply/provide/inject); ` +
              'forbids CALLING, not INJECTING — outside M-C, named rather than silently dropped.');
          }
          continue;
        }
        // the field the doc block documents: first field-shaped line after the doc
        for (let j = i + 1; j < Math.min(raw.length, i + 8); j++) {
          const t = raw[j]!.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t === '' || t === '*/') continue;
          const f = FIELD_AFTER_DOC.exec(raw[j]!);
          if (f) forbiddenFields.push({ file: rel, field: f[1]! });
          break;
        }
      }
    }
  }

  // pass 2 — tests: M-C injection sites.
  for (const { file, field } of forbiddenFields) {
    const pkg = (() => {
      // nearest workspace dir above the defining file, by path segments
      const parts = file.split('/');
      return parts.length >= 2 ? parts.slice(0, 2).join('/') : file;
    })();
    const owner = basename(file).replace(/\.tsx?$/, '');
    const INJECT = new RegExp(`\\b${field.replace(/\$/g, '\\$')}\\s*:`);
    for (const abs of walk(join(root, pkg))) {
      const rel = relPath(root, abs);
      if (!isTestPath(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      if (!src.includes(owner)) continue;    // test must bind the owning module
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        if (INJECT.test(lines[i]!)) {
          findings.push({
            arm: 'M-C',
            key: `M-C::${rel}:${i + 1}:${field}`,
            detail: `${rel}:${i + 1} injects \`${field}:\` — the field ${file} documents as forbidden to ` +
              `production. The suite exercises the one configuration production never uses; the configuration ` +
              `production DOES use (the fallback) is the untested one (C74 §3.5). State what is NOT covered, ` +
              `or test the production construction.`,
          });
        }
      }
    }
  }

  return { findings, filesScanned, declaredStandIns, scaffoldHeaders, forbiddenFields, exclusionsPrinted };
}

// ─── Negative + positive control, EXECUTED ───────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const CLEAN_DATE = () => new Date().toISOString().slice(0, 10);

const PLANTED = {
  // M-A — a FakeXStore wired into a production class with no external signal.
  'packages/x/src/EngineStore.ts': [
    "import { FakeXStore } from './FakeXStore.js';",
    'export class EngineXAdapter {',
    "  readonly kind = 'enginex' as const;",
    '  private store = new FakeXStore();',
    '  read() { return this.store.read(); }',
    '}',
  ].join('\n'),
  'packages/x/src/FakeXStore.ts': [
    'export class FakeXStore { read() { return null; } }',
  ].join('\n'),
  // M-B — an undated scaffold header.
  'packages/x/src/scaffolded.ts': [
    '// SCAFFOLD — real implementation later.',
    'export const x = 1;',
  ].join('\n'),
  // M-B grace loophole (§CO-06-GRACE-FIX) — a DATE-ONLY header, stamped fresh.
  // Under the pre-fix rule (`|| withinGrace`) this was COMPLIANT: a bulk
  // re-stamp could walk the whole ledger down having declared nothing. It must
  // now fire, and selfTest() asserts THIS KEY specifically — the loophole
  // cannot quietly reopen.
  'packages/x/src/dateOnlyScaffold.ts': [
    `// SCAFFOLD ${CLEAN_DATE()} — real implementation later.`,
    'export const z = 1;',
  ].join('\n'),
  // M-C — a docstring-forbidden field, injected by a test.
  'packages/x/src/Widget.ts': [
    'export interface WidgetOpts {',
    '  /**',
    '   * Test-only override. Production callers MUST NOT pass this.',
    '   */',
    '  inner?: unknown;',
    '}',
    'export class Widget { constructor(readonly opts: WidgetOpts = {}) {} }',
  ].join('\n'),
  'packages/x/__tests__/Widget.test.ts': [
    "import { Widget } from '../src/Widget';",
    'const w = new Widget({ inner: {} });',
  ].join('\n'),
};

const CLEAN = {
  // an honest stand-in — must be reported present-and-declared, NOT a finding.
  'packages/y/src/HonestMock.ts': [
    'export class HonestMockSolver {',
    "  readonly kind = 'mock' as const;",
    '  solve() { return null; }',
    '}',
  ].join('\n'),
  // a dated scaffold inside grace, with owner and retiring assertion.
  'packages/y/src/freshScaffold.ts': [
    `// SCAFFOLD ${CLEAN_DATE()} — owner: platform team. Retired when S99 lands;`,
    '// __tests__/retirement.test.ts asserts this file is deleted at S99.',
    'export const y = 1;',
  ].join('\n'),
  // §CO-06-GRACE-FIX — the accepted GRACE shape: fresh date + owner + a written
  // declaration of what is fake, executable retiring assertion still being
  // built. Deliberately carries NO retirement vocabulary, so compliance can
  // come only from the grace branch — if this fires, grace has been narrowed
  // to nothing, which is as wrong as the loophole (the CLEAN tree is the
  // false-positive control).
  'packages/y/src/declaredFreshScaffold.ts': [
    `// SCAFFOLD ${CLEAN_DATE()} — owner: platform team.`,
    '// WHAT IS FAKE: returns a hard-coded plan; a stand-in for the layout engine.',
    'export const y2 = 1;',
  ].join('\n'),
  'packages/y/src/Widget.ts': [
    'export interface WidgetOpts {',
    '  /**',
    '   * Test-only override. Production callers MUST NOT pass this.',
    '   */',
    '  inner?: unknown;',
    '}',
    'export class Widget { constructor(readonly opts: WidgetOpts = {}) {} }',
  ].join('\n'),
  'packages/y/__tests__/Widget.test.ts': [
    "import { Widget } from '../src/Widget';",
    'const w = new Widget({});',       // does NOT inject the forbidden field
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const today = new Date();
    const bad = analyse(join(base, 'planted'), ['packages'], today);
    const good = analyse(join(base, 'clean'), ['packages'], today);
    const armsFired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...armsFired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree):   ${good.findings.length} finding(s) — must be 0; honest stand-ins declared: ${good.declaredStandIns.length} (must be ≥1)`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['M-A', 'M-B', 'M-C'] as const) {
      if (!armsFired.has(arm)) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    // §CO-06-GRACE-FIX — the date-only plant must fire ON ITS OWN KEY. The
    // arms-fired set above cannot see this: M-B fires for the undated plant
    // anyway, so a reopened grace loophole would leave the set intact while a
    // fresh date once again bought a silent pass.
    if (!bad.findings.some((f) => f.key === 'M-B::packages/x/src/dateOnlyScaffold.ts')) {
      ok = false;
      lines.push('    ✗ GRACE LOOPHOLE REOPENED — a DATE-ONLY scaffold header inside grace did not fire M-B (§CO-06-GRACE-FIX).');
    }
    if (good.findings.length > 0) ok = false;
    if (good.declaredStandIns.length < 1) {
      ok = false;
      lines.push("    ✗ BLIND COMPARATOR — the clean tree's self-announcing stand-in was not reported present-and-declared.");
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS, new Date());

const lines: string[] = [];
lines.push(
  `source files scanned: ${a.filesScanned} · scaffold headers found: ${a.scaffoldHeaders} · ` +
  `honest self-declaring stand-ins: ${a.declaredStandIns.length} · docstring-forbidden fields: ${a.forbiddenFields.length}`,
);
for (const s of a.declaredStandIns) {
  lines.push(`  present-and-declared (NOT a finding): ${s.className} kind='${s.kind}' — ${s.file}:${s.line}`);
}
for (const f of a.forbiddenFields) lines.push(`  forbidden-to-production field: \`${f.field}\` — ${f.file}`);
for (const e of a.exclusionsPrinted) lines.push(`  M-C exclusion (named, not silent): ${e}`);
lines.push('');
for (const f of a.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const measured = new Set(a.findings.map((f) => f.key));
const declared = new Set(LEDGER);
const stale = [...declared].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declared.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'source files scanned', measured: a.filesScanned, min: MIN_FILES },
  { what: 'scaffold headers discovered (0 would mean the header walk is broken, not the estate clean)', measured: a.scaffoldHeaders, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings: a.findings.length + (unexpected.length > 0 ? LEDGER.length + 1 : 0),
  declared: LEDGER.length,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
