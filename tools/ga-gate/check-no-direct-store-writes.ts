#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-no-direct-store-writes.ts
 *
 * §P6-UNENFORCED (L-812) — "Commands are the only mutation path", actually checked.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 * C01 §1 and §5 both list P6 as a HARD-FAIL gate implemented by
 * `scripts/ci-check-no-direct-store-writes.ts`. **That file has never existed.**
 * Nothing in this repository checked P6 — not eslint, not a GA gate, not a test.
 *
 * P6 is not a style preference. Undo/redo, the CRDT merge model and the AI
 * batch-apply path all assume every mutation passed through the command bus and
 * therefore produced patches. A UI component that writes a store directly is
 * invisible to all three: it cannot be undone, it does not replicate to
 * collaborators, and it does not appear in the event log. The principle the
 * entire collaboration model rests on was the one with no enforcement at all.
 *
 * ─── What this gate checks ───────────────────────────────────────────────────
 * A call, from UI source, to a MUTATING method on a `*Store` receiver.
 *
 *     this.elementStore.update(id, patch)      ← flagged
 *     window.levelStore.add(level)             ← flagged
 *     roomStore.getAll()                       ← not flagged (read)
 *     commandBus.dispatch('element.update', …) ← not flagged (the correct path)
 *
 * ─── Polarity: READS are allowlisted, everything else is a write ─────────────
 * The verb test is an allowlist of READ prefixes, not a denylist of write verbs.
 * A denylist silently stops covering the moment somebody adds `Store.stamp()` or
 * `Store.bump()`; an allowlist fails closed and forces the new method to be
 * classified. Fail-closed is the only defensible polarity for a gate — the
 * failure mode of the other choice is invisible.
 *
 * ─── Bounds of this gate — stated, not hidden ────────────────────────────────
 * It is a SYNTACTIC check and it cannot see:
 *   1. A store reached through a variable not named `*Store`
 *      (`const s = getStore(); s.update(…)`). Type-aware analysis would be
 *      needed; the naming convention holds nearly everywhere here, and a
 *      convention-based check that says so is worth more than no check.
 *   2. Mutation via a returned object (`store.getState().set(…)`). The L1 `Store`
 *      base freezes entries, so this throws at runtime rather than corrupting
 *      state silently — a runtime guard already covers it.
 *   3. Whether a flagged call is INSIDE a command handler that legitimately owns
 *      the write. Handlers do not live in UI scope, so UI scoping is what
 *      excludes them; a handler placed in `src/ui/` would be a false positive
 *      AND a filing error.
 * COVERAGE IS PRINTED EVERY RUN (files scanned / excluded). A gate that does not
 * say how much it looked at cannot be audited.
 *
 * ─── Ratchet ─────────────────────────────────────────────────────────────────
 * SHRINK-ONLY, house pattern (check-layer-boundaries.ts, check-command-naming.ts).
 * Every violation below is pre-existing debt; the gate blocks GROWTH from today.
 *
 * Usage:  tsx tools/ga-gate/check-no-direct-store-writes.ts
 * Exit:   0 = at or below baseline · 1 = grew · 2 = scan misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, tallyBy, type Match } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'no-direct-store-writes';

/**
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 on the FIRST run of this gate: **41**.
 *
 * The first number a new gate prints is a measurement of the GATE, not of the
 * code (the lesson recorded in check-layer-boundaries.ts). The first run here
 * printed 42; one was `plugins/curtain-wall/src/handlers/ReplacePanel.ts`, a
 * command HANDLER caught by the name-based UI arm. Handlers are the prescribed
 * write path, so `COMMAND_SIDE_RE` now excludes them and the true figure is 41.
 *
 * Where the 41 live (2026-08-09):
 *     13  apps/editor/src/ui/import/DxfImportPanel.ts     (dxfLayer / dxfOverlay stores)
 *      6  apps/editor/src/ui/ai/ValidatePanel.ts          (commandProposal / aiApproval)
 *      6  apps/editor/src/ui/dataworkbench/buckets/MaterialsBucket.ts
 *      4  apps/editor/src/ui/ai/AIPanel.ts
 *      4  apps/editor/src/ui/SheetEditor/SheetEditorSidebar.ts
 *      2  apps/editor/src/ui/ai/floorplan-import/Step6CommitView.ts
 *      2  apps/editor/src/ui/views/ViewHeaderButtons.ts   (ifcProjectionStore.setForView)
 *      4  one apiece across AICreatePanel, IntentPrompt, AuditBucket,
 *         FormaSiteAnalysisControls, OverridePanel
 *
 * Two clusters, and they are not equally urgent. The AI-proposal and DXF-overlay
 * stores hold PRE-COMMIT staging state, which is the least damaging kind of
 * unbacked write. `wallSystemTypeStore.update` and `panelStore.update` mutate
 * committed model data from a panel — those are the ones that silently break undo.
 *
 * See the report printed by a failing run for the per-file breakdown. Raising
 * this number to make CI green is the precise failure P6 exists to prevent: it
 * converts an unbacked mutation into a permanently blessed one.
 *
 * The path from here is mechanical, not heroic: each site becomes a
 * `commandBus.dispatch(...)` against an existing or new command, which is what
 * makes it undoable and replicable. Pay it down in the plugin/domain sprint that
 * owns the store in question.
 */
const MAX_VIOLATIONS = Number(process.env.PRYZM_P6_MAX_WRITES ?? 41);

/**
 * Minimum files the walk must reach. The UI tree is ~730 files today; a floor of
 * 400 catches a broken root or a bad glob without being tripped by ordinary
 * file movement. Below it the gate exits 2, never 0.
 */
const MIN_FILES = 400;

// ── UI scope ─────────────────────────────────────────────────────────────────
// P6 constrains "UI code". Two definitions, unioned, because this repo uses both:
//   (a) anything under a `ui/` directory inside a source root, and
//   (b) files named for a UI component, wherever they sit.
// The (b) arm matters: plugins keep panels next to their handlers rather than in
// a `ui/` folder, so a directory-only rule would exempt every plugin panel.
const UI_DIR_RE = /(^|\/)ui\//;
const UI_FILE_RE = /(Panel|Modal|Dialog|Toolbar|Menu|Overlay|Widget|Popover|Drawer|Rail|Inspector|Sidebar|Tooltip|Banner|Flyout|Palette|HUD)\.tsx?$/;

const SCAN_DIRS = ['src', 'apps', 'plugins'].filter((d) => existsSync(join(REPO_ROOT, d)));

function isUi(rel: string): boolean {
  return UI_DIR_RE.test(rel) || UI_FILE_RE.test(rel);
}

// The command SIDE of the bus. A handler/committer writing a store IS P6's
// prescribed path, so flagging it would invert the principle. Needed because the
// UI_FILE_RE arm above is name-based and `plugins/curtain-wall/src/handlers/
// ReplacePanel.ts` is a handler that merely happens to end in `Panel.ts`.
const COMMAND_SIDE_RE = /(^|\/)(handlers|handler|committer|committers|commands|command)\//;

function excluded(rel: string): boolean {
  if (!isUi(rel)) return true;
  if (COMMAND_SIDE_RE.test(rel)) return true;
  if (rel.endsWith('.d.ts')) return true;
  if (/(^|\/)__tests__\//.test(rel)) return true;
  if (/\.(spec|test)\.tsx?$/.test(rel)) return true;
  if (/(^|\/)__fixtures__\//.test(rel)) return true;
  if (/(^|\/)__mocks__\//.test(rel)) return true;
  return false;
}

// ── Read allowlist ───────────────────────────────────────────────────────────
// A method whose name begins with one of these (followed by an uppercase letter
// or end-of-name) is a READ. Everything else on a `*Store` receiver is treated as
// a write. Fail-closed: an unrecognised verb is a violation, not an exemption.
const READ_PREFIXES = [
  'get', 'has', 'is', 'list', 'find', 'query', 'count', 'size', 'read', 'peek',
  'all', 'entries', 'keys', 'values', 'contains', 'lookup', 'resolve', 'can',
  'should', 'to', 'as', 'serialize', 'snapshot', 'subscribe', 'on', 'off',
  'observe', 'watch', 'each', 'for', 'filter', 'map', 'some', 'every',
  'compute', 'derive', 'format', 'describe', 'inspect', 'diff', 'match',
  'exists', 'first', 'last', 'next', 'prev', 'at', 'of', 'with', 'where',
];

const READ_RE = new RegExp(`^(?:${READ_PREFIXES.join('|')})(?:$|[A-Z0-9_])`);

function isRead(method: string): boolean {
  return READ_RE.test(method);
}

/**
 * Receiver must be an identifier ending in `Store` (any case of the S is not
 * accepted — `store`/`Store` suffix exactly, so `restore` does not match because
 * the `\b` + suffix test requires `Store` or a lowercase-start `…store` token).
 *
 * Handles `foo.barStore.update(`, `this.barStore.update(`, `window.barStore.add(`
 * and bare `barStore.remove(`.
 */
const CALL_RE = /\b([A-Za-z_$][\w$]*(?:Store|STORE))\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/;

// ── Run ──────────────────────────────────────────────────────────────────────
const result = scanFiles({
  root: REPO_ROOT,
  dirs: SCAN_DIRS,
  pattern: CALL_RE,
  minFiles: MIN_FILES,
  exclude: excluded,
  label: LABEL,
});

const writes: Match[] = result.matches.filter((m) => {
  const method = m.groups[1];
  if (!method) return false;
  // A commented-out line is not a mutation. Cheap, deliberate, and stated.
  if (/^\s*(\/\/|\*|\/\*)/.test(m.text)) return false;
  return !isRead(method);
});

console.log(`[${LABEL}] §P6-UNENFORCED (L-812) — commands are the only mutation path (C01 §1 P6)`);
console.log(`[${LABEL}] scope: ${SCAN_DIRS.join(', ')} · UI files scanned: ${result.filesScanned} · non-UI/test files skipped: ${result.filesExcluded}`);
console.log(`[${LABEL}] *Store method calls in UI: ${result.matches.length} · classified as WRITES: ${writes.length}`);

if (writes.length) {
  console.log('\n  Writes by method:');
  for (const [k, n] of tallyBy(writes, (m) => `${m.groups[1]}()`).slice(0, 25)) {
    console.log(`      ${String(n).padStart(4)}  ${k}`);
  }
  console.log('\n  Writes by file:');
  for (const [k, n] of tallyBy(writes, (m) => m.file).slice(0, 25)) {
    console.log(`      ${String(n).padStart(4)}  ${k}`);
  }
}

if (!Number.isFinite(MAX_VIOLATIONS)) {
  console.log(
    `\n[${LABEL}] BASELINE RUN — no threshold set.\n` +
    `Freeze today's number in this file:  MAX_VIOLATIONS = ${writes.length}\n` +
    `SHRINK-ONLY thereafter.`,
  );
  process.exit(0);
}

if (writes.length > MAX_VIOLATIONS) {
  // On a FAILING run print EVERY site. A ratchet that reports only that the count
  // grew, without naming what grew it, is a puzzle rather than a gate — the exact
  // lesson recorded in check-layer-boundaries.ts.
  console.error(`\n  ALL ${writes.length} write site(s) (baseline exceeded):`);
  for (const m of writes) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  console.error(
    `\n[${LABEL}] FAIL — ${writes.length} direct store write(s) from UI, baseline ${MAX_VIOLATIONS}.\n` +
    `P6: UI dispatches a command; the command handler produces patches; the patches\n` +
    `mutate the store. A direct write is not undoable, does not replicate to\n` +
    `collaborators, and never reaches the event log.\n` +
    `Replace the call with commandBus.dispatch(...). Do NOT raise this threshold.`,
  );
  process.exit(1);
}

console.log(`\n[${LABEL}] ✓ within baseline (${writes.length}/${MAX_VIOLATIONS}).`);
