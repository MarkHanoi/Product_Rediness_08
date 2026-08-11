#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-report-payload-discard.ts
 *
 * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — R4: **dispatch sites that discard an
 * engine report payload.** Target exit: ZERO.
 *
 * ─── The defect class ───────────────────────────────────────────────────────
 * The engines in this repository are honest. `DeleteElementsBatchCommand`
 * refuses a batch where nothing is deletable; `UpdateWallsSystemTypeBatchCommand`
 * reports "Changed N of M — K skipped: <reason>"; the room-finish seam reads its
 * counts off the engines' own `*.layout-executed` payloads. Fifty executed tests
 * pin that.
 *
 * **The last layer threw the truth away and printed "Done".** Three mechanical
 * shapes did it, and all three are counted here:
 *
 *   D1  A `.success` test whose TRUE branch returns a bare boolean-shaped
 *       object. Verbatim, from `apps/editor/src/ui/create/batchCatalogue.ts`:
 *
 *           if (res?.success) return { ok: true };
 *
 *       `res.info` — the whole engine payload — is dropped, and both panels that
 *       render the result printed "Done — <label>" over a 12-of-25 partial.
 *
 *   D2  A collection of reports read at index zero (`batchReports[0]`), which
 *       discards every report after the first. In a multi-command slice, one
 *       engine's success silently swallowed the next engine's refusal.
 *
 *   D3  A report-broadcasting bridge whose command-sink test has **no else**:
 *
 *           if (cm) { … dispatchEvent(report) … }      // and nothing otherwise
 *
 *       When `window.commandManager` is absent, or the try/catch only reaches
 *       `console.error`, NO EVENT IS EMITTED — and the chat layer read "no
 *       report" as success. Failure and emptiness were the same value, which is
 *       the entire bug class.
 *
 * ─── Governance ─────────────────────────────────────────────────────────────
 * C68 §5.g: «Success is reported as what happened: "Changed N of M — K skipped:
 * <reason>", with the reason read off the command's or engine's own report
 * payload, never re-narrated. **"Done" only after a command reports success.**»
 * C68 §6.3 (G4/G6) records that whether the report payload is *populated*
 * truthfully is runtime-only and review-enforced. This gate closes the half that
 * IS statically visible: whether the layer above **kept** it.
 * C03 §4 governs `CommandResult` as the payload being carried.
 *
 * ─── Honesty floor ──────────────────────────────────────────────────────────
 * `scanFiles`' `minFiles` floor (exit 2, never 0) is what stops this gate from
 * ever passing by scanning nothing — the failure mode that once let a walk
 * resolve to a bad root and print "✅ 0 violations". D3's brace analysis reuses
 * the SAME walk, and runs only after that floor has been cleared.
 *
 * Exit codes:  0 = zero discard sites · 1 = at least one · 2 = the scan was
 * misconfigured and did not look at enough source to have an opinion.
 */

import { readFileSync } from 'node:fs';
import { scanFiles, walk, relPath } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'report-payload-discard';

/** The reporting layer lives here: the editor's UI seams and the plugin bridges
 *  that re-broadcast a CommandResult. Packages are the ENGINES — deliberately
 *  out of scope, because the engines are not what was lying. */
const DIRS = ['apps/editor/src', 'plugins'] as const;

/**
 * The floor. `apps/editor/src` + `plugins` is a four-figure file count; 800 is
 * a deliberately conservative fraction of it, low enough that a legitimate
 * refactor does not trip it and high enough that a broken root or a bad
 * exclusion cannot slip past as a pass.
 */
const MIN_FILES = 800;

const isExcluded = (rel: string): boolean =>
  rel.includes('/__tests__/') ||
  rel.endsWith('.spec.ts') ||
  rel.endsWith('.test.ts') ||
  rel.includes('/__fixtures__/');

// ─── D1 — a success test whose true branch carries no payload ───────────────
// `if (x?.success) return { ok: true }` and its brace-wrapped twin. The object
// literal is matched exactly: one key, `ok`, and nothing else. A result object
// that ALSO carries info/lines/reason/report is not a discard and does not match.
const D1 = /\.success\b[^;{]*?\)\s*\{?\s*return\s*\{\s*ok:\s*(?:true|false)\s*\}\s*;?/;

// ─── D2 — a report collection read at index zero ────────────────────────────
// Names the shape rather than one variable, so a rename does not blind the gate.
const D2 = /\b(?:\w*[rR]eports|\w*[oO]utcomes)\s*\[\s*0\s*\]/;

/** Byte offset of the `}` closing the `{` that starts at `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * §RAF-GATE-COMMENT-BLIND (L-811 follow-up) applies here too: the first run of
 * this gate reported three "violations" that were all PROSE — comments in this
 * very changeset describing the bug being fixed. A comment cannot discard a
 * payload. Filtering them is a precision fix, not a weakening.
 */
const isCommentLine = (text: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(text);

interface Finding { readonly file: string; readonly line: number; readonly why: string; readonly text: string }

/**
 * D3 — a bridge that broadcasts a report but goes SILENT when its command sink
 * is missing. Requires brace matching, so it runs over the same walk rather
 * than through the per-line scanner.
 */
function findSilentSinks(files: readonly string[]): Finding[] {
  const out: Finding[] = [];
  for (const abs of files) {
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    // Only bridges that PROMISE a report can break the promise by silence.
    if (!src.includes('_REPORT_EVENT') && !src.includes('dispatchEvent')) continue;

    const re = /\bif\s*\(\s*(cm|commandManager)\s*\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const open = src.indexOf('{', m.index);
      const close = matchBrace(src, open);
      if (close < 0) continue;
      const body = src.slice(open, close);
      // The subject is a REPORT-BROADCASTING bridge. A sink test that guards a
      // plain `cm.execute(...)` (e.g. `_cmExec` in initBusHandlers.ts) drops a
      // COMMAND, not a report payload — a real and adjacent defect, but a
      // different one, and folding them together would make both unreadable.
      if (!body.includes('dispatchEvent')) continue;
      const tail = src.slice(close + 1, close + 40);
      if (/^\s*else\b/.test(tail)) continue;               // the honest shape
      out.push({
        file: relPath(REPO_ROOT, abs),
        line: src.slice(0, m.index).split('\n').length,
        why: 'D3 silent sink — the command-manager test has no `else`, so an absent sink emits NO report at all',
        text: m[0],
      });
    }
  }
  return out;
}

function main(): number {
  // The floor lives here: if this walk does not reach MIN_FILES, scanFiles
  // exits 2 before anything below can report a pass.
  const scan = scanFiles({
    root: REPO_ROOT,
    dirs: [...DIRS],
    pattern: new RegExp(`(${D1.source})|(${D2.source})`),
    minFiles: MIN_FILES,
    exclude: isExcluded,
    label: LABEL,
  });

  const findings: Finding[] = scan.matches.filter((m) => !isCommentLine(m.text)).map((m) => ({
    file: m.file,
    line: m.line,
    why: D1.test(m.text)
      ? 'D1 payload dropped — a `.success` test returns a boolean-shaped result; the engine\'s `info` never reaches the user'
      : 'D2 later reports discarded — a report collection is read at index 0',
    text: m.text,
  }));

  // Same walk, same exclusions — reached only after the floor has been cleared.
  const files = DIRS
    .flatMap((d) => walk(`${REPO_ROOT}/${d}`))
    .filter((abs) => !isExcluded(relPath(REPO_ROOT, abs)))
    .filter((abs) => !abs.endsWith('check-report-payload-discard.ts'));
  findings.push(...findSilentSinks(files));

  console.log(`[${LABEL}] files scanned: ${scan.filesScanned} (excluded ${scan.filesExcluded}), floor ${MIN_FILES}`);

  if (findings.length === 0) {
    console.log(`[${LABEL}] OK: 0 dispatch sites discard an engine report payload.`);
    return 0;
  }

  console.error(`\n[${LABEL}] FAIL: ${findings.length} site(s) discard an engine report payload (target 0).\n`);
  for (const f of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`      ${f.text}`);
    console.error(`      ${f.why}`);
  }
  console.error(
    '\n  C68 §5.g — "Done" only after a command reports success, and the report is the\n' +
    '  engine\'s own payload, never re-narrated. A refusal, a partial, an all-skipped\n' +
    '  batch and "no report arrived" are FOUR DIFFERENT FACTS. Carry the payload:\n' +
    '    • D1 — put the engine\'s `info` on BOTH arms of the result type.\n' +
    '    • D2 — classify ALL the reports, not the first one.\n' +
    '    • D3 — give the sink test an `else` that broadcasts an INDETERMINATE report.\n' +
    '  Reference implementation: apps/editor/src/ui/create/batchCatalogue.ts\n' +
    '  (`renderBatchDispatchMessage`) and apps/editor/src/ui/ai/ZeroTokenChatBridge.ts\n' +
    '  (`classifyDispatch`, the five-arm `DispatchOutcome` union).\n',
  );
  return 1;
}

process.exit(main());
