#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-contract-cited-paths.ts
 *
 * **L-960 — every repo path cited in `docs/02-decisions/contracts/` must resolve
 * on disk, or carry an explicit `PLANNED` / struck-through marker.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * `CONTRACT-AMENDMENT-REGISTER.md` §0 names this as the suite's cheapest durable
 * fix, and sizes it: *"would have caught 119+ of the defects below."* Its §12
 * measured the two axes by hand — cited gate paths (**99 distinct -> 2 exist**)
 * and cited `packages/*` paths (**43 distinct -> 21 exist**) — across ONE range
 * of the suite, by four read-only lanes, in one day. That is not repeatable by
 * hand and it rotted within 24 hours of being written.
 *
 * The defect shape it catches is register §0 shape **A** ("NOT BUILT" outliving
 * the code) and its inverse — a contract naming `scripts/ci-check-spans.ts` as
 * live enforcement when no such file has ever existed (L-812), or naming
 * `check-schema-purity.ts` when the real gate is `check-domain-purity.ts`. Both
 * are one `ls` away and neither is visible from inside the contract.
 *
 * ─── What is a CITATION (deliberately narrow) ────────────────────────────────
 * A backtick-quoted span whose text begins with a known repo root
 * (`tools/ packages/ apps/ plugins/ scripts/ server/ src/`) and which survives
 * the SYMBOL filter below. Prose paths outside backticks are NOT scanned: the
 * suite's convention is backticks, and widening the net would trade a real
 * finding for ten false ones.
 *
 * REJECTED as not-a-path (these are not findings, they are non-subjects):
 *   • globs / placeholders — anything containing `*` `<` `>` `{` `}` `?` `|`
 *     `[` `]` `…`, e.g. `packages/geometry-*`, `plugins/<name>/`
 *   • symbol expressions — anything containing `(` `)` or a space, e.g.
 *     `apps/.../BottomActionMenu._toggleDayNight()`
 *   • URL/anchor fragments — anything containing `#`
 * A trailing `:123`, `:123-456` or `:123,456` line reference is STRIPPED before
 * resolution and is NOT itself checked. **Stated as a known blind spot: this
 * gate does not verify that line 1025 still holds what the contract says it
 * holds.** Register §2 and §11C both record rotted `file:line` anchors — that is
 * a DIFFERENT gate and this one does not claim it.
 *
 * ─── Resolution ──────────────────────────────────────────────────────────────
 * RESOLVES if the exact path exists as a file or directory. A citation with no
 * file extension additionally resolves if `<path>.ts|.tsx|.js|.mjs|.json|.md`
 * exists — contracts routinely name a module without its extension, and calling
 * that a defect would bury the real ones.
 *
 * ─── EXEMPTIONS — narrow on purpose, because this is where laundering happens ─
 * A citation is EXEMPT only if, on its own line, either:
 *   (P) the literal token `PLANNED` appears, or
 *   (S) the citation is inside a `~~strikethrough~~` span — the suite's own
 *       retraction idiom (C84 §6: retractions are struck and annotated, never
 *       deleted).
 * ⛔ `NOT BUILT`, `does not exist`, `ABSENT`, `UNBUILT` are **NOT** exemptions.
 * That is the whole point: register §11C measured eleven gates described as
 * unbuilt that all exist, and §13 measured 97 of 99 cited gates that do not.
 * The prose claim is exactly what cannot be trusted, so it cannot be the escape
 * hatch. Exempt counts are printed separately so laundering is visible as a
 * number that moves.
 *
 * ─── Arms ────────────────────────────────────────────────────────────────────
 *  F0 *(floors, exit 2)*  >= MIN_CONTRACT_FILES contract files read ·
 *      >= MIN_CANDIDATES distinct citations extracted · both planted controls
 *      fired. A scan that finds nothing must not report a pass — the register's
 *      §5 records the inverse mistake (treating a gate that established nothing
 *      as if it had established something) and L-827 records this one.
 *  A  *(ratchet, shrink-only)*  distinct UNRESOLVED citations <= BASELINE.
 *  B  *(disclosure, never fails)*  the EXEMPT census. Printed, not gated, so a
 *      rising exempt count is legible without being punishable-by-silence.
 *
 * Exit 0 clean or within baseline · 2 MISCONFIGURED / floors unmet / control
 * failed to fire · 3 baseline EXCEEDED. Per §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)
 * exit 3 is never absorbable: fix the citation or mark it PLANNED with intent.
 *
 * Usage:
 *   npx tsx tools/ga-gate/check-contract-cited-paths.ts
 *   npx tsx tools/ga-gate/check-contract-cited-paths.ts --list   # full finding list
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'contract-cited-paths';
const CONTRACT_DIR = path.join(REPO_ROOT, 'docs', '02-decisions', 'contracts');

/**
 * §CITED-PATH-BASELINE — pinned at the FIRST HONEST READING, 2026-08-19 (lane REG1):
 *
 *   contract files read       101
 *   citations                 2960 occurrences -> 1527 distinct
 *   RESOLVE on disk           1028
 *   UNRESOLVED                 491   <- this baseline
 *   UNRESOLVED but EXEMPT        8
 *
 * ⭐ **The register sized this gate at "119+ defects". The measured figure is 491** —
 * roughly four times the hand-audited estimate, because §12's by-hand sweep covered
 * two axes across one range (C21–C50) and this covers seven roots across all 100
 * contracts. The estimate was not wrong so much as scoped; recording the gap because
 * "the confident number was low" is the register's own recurring finding (§9:
 * 15 -> 22 -> 24).
 *
 * SHRINK-ONLY. Raising this number is choosing to ship a known-false citation.
 * ⛔ Do NOT discharge findings by bulk-adding `PLANNED`; that is laundering and
 * arm B prints the evidence of it as a number that moves.
 */
const BASELINE_UNRESOLVED = 490;

// F0 floors. A run below any of these has not asked the question.
const MIN_CONTRACT_FILES = 90;
const MIN_CANDIDATES = 600;

const REPO_ROOTS = ['tools/', 'packages/', 'apps/', 'plugins/', 'scripts/', 'server/', 'src/'];
const NOT_A_PATH = /[*<>{}?|[\]()…\s#]/;
const TRY_EXT = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md'];

/**
 * Misconfiguration exit — code 2, NEVER absorbable (C76 §6.1: could-not-measure,
 * measured-a-failure and ratchet-exceeded must not alias).
 *
 * Spelled as a `die(2, …)` helper rather than `return 2` from `main()` because
 * the R5 meta-gate (`check-gate-subject-floors.ts`) reads exit-2 REACHABILITY
 * from source text, and a code that only reaches `process.exit` through a
 * returned variable is invisible to it. It flagged this file on its first run;
 * the honest fix is to make the exit literal, not to argue with the detector.
 */
function die(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

interface Cite {
  raw: string;
  cleaned: string;
  sites: string[];
  exempt: 'PLANNED' | 'STRUCK' | null;
}

/** Strip a trailing `:123`, `:123-456`, `:123,456`, and trailing punctuation. */
function cleanPath(s: string): string {
  let out = s.trim();
  out = out.replace(/:\d+(?:[-–,]\d+)*$/, '');
  out = out.replace(/[.,;:]+$/, '');
  return out;
}

function resolvesOnDisk(rel: string): boolean {
  const abs = path.join(REPO_ROOT, rel);
  if (fs.existsSync(abs)) return true;
  if (!path.extname(rel)) {
    for (const e of TRY_EXT) if (fs.existsSync(abs + e)) return true;
  }
  return false;
}

/** Extract citations from one markdown text. Pure — the planted controls reuse it. */
function extract(text: string, file: string, into: Map<string, Cite>): number {
  let seen = 0;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // Strikethrough spans on this line, for exemption (S).
    const struck: string[] = [];
    for (const sm of line.matchAll(/~~([\s\S]*?)~~/g)) struck.push(sm[1]);
    const hasPlanned = /\bPLANNED\b/.test(line);

    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const raw = m[1].trim();
      if (!REPO_ROOTS.some((r) => raw.startsWith(r))) continue;
      if (NOT_A_PATH.test(raw)) continue;
      const cleaned = cleanPath(raw);
      if (!cleaned || !REPO_ROOTS.some((r) => cleaned.startsWith(r))) continue;
      seen++;
      const exempt: Cite['exempt'] = hasPlanned
        ? 'PLANNED'
        : struck.some((s) => s.includes(raw))
          ? 'STRUCK'
          : null;
      const prev = into.get(cleaned);
      if (prev) {
        prev.sites.push(`${file}:${i + 1}`);
        // A citation is exempt only if EVERY site is exempt — one bare live
        // citation of a phantom path is still a live citation of a phantom path.
        if (!exempt) prev.exempt = null;
      } else {
        into.set(cleaned, { raw, cleaned, sites: [`${file}:${i + 1}`], exempt });
      }
    }
  });
  return seen;
}

/** F0 planted controls — run INSIDE every invocation, against the real resolver. */
function controlsFired(): { ok: boolean; detail: string } {
  const probe = new Map<string, Cite>();
  const fixture = [
    'A real path: `tools/ga-gate/run-all.ts` must resolve.',
    'A phantom: `tools/ga-gate/check-DEFINITELY-NOT-A-REAL-GATE-xyz.ts` must NOT resolve.',
    'An exempt phantom: `packages/not-real-planned-xyz/src/Nope.ts` — PLANNED.',
    'A glob must be ignored: `packages/geometry-*/src`.',
  ].join('\n');
  extract(fixture, '__control__', probe);
  const real = probe.get('tools/ga-gate/run-all.ts');
  const phantom = probe.get('tools/ga-gate/check-DEFINITELY-NOT-A-REAL-GATE-xyz.ts');
  const planned = probe.get('packages/not-real-planned-xyz/src/Nope.ts');
  const glob = probe.get('packages/geometry-*/src');
  const problems: string[] = [];
  if (!real || !resolvesOnDisk(real.cleaned)) problems.push('positive control did not resolve');
  if (!phantom || resolvesOnDisk(phantom.cleaned)) problems.push('negative control resolved');
  if (!planned || planned.exempt !== 'PLANNED') problems.push('PLANNED exemption did not fire');
  if (glob) problems.push('glob was not rejected');
  return { ok: problems.length === 0, detail: problems.join('; ') };
}

function main(): number {
  const wantList = process.argv.includes('--list');

  if (!fs.existsSync(CONTRACT_DIR)) {
    die(2, `[${LABEL}] MISCONFIGURED: contract dir not found: ${CONTRACT_DIR}`);
  }

  const ctl = controlsFired();
  if (!ctl.ok) {
    die(2, `[${LABEL}] MISCONFIGURED: planted control failed to fire — ${ctl.detail}
  A blind comparator must never report a pass (L-827).`);
  }

  const files = fs
    .readdirSync(CONTRACT_DIR)
    .filter((f) => f.endsWith('.md'))
    // The register itself QUOTES phantom paths as evidence that they are phantom.
    // Gating it would make recording a defect into a defect.
    .filter((f) => f !== 'CONTRACT-AMENDMENT-REGISTER.md');

  const cites = new Map<string, Cite>();
  let occurrences = 0;
  for (const f of files) {
    occurrences += extract(fs.readFileSync(path.join(CONTRACT_DIR, f), 'utf8'), f, cites);
  }

  if (files.length < MIN_CONTRACT_FILES) {
    die(2, `[${LABEL}] MISCONFIGURED: ${files.length} contract files < floor ${MIN_CONTRACT_FILES}`);
  }
  if (cites.size < MIN_CANDIDATES) {
    die(2, `[${LABEL}] MISCONFIGURED: ${cites.size} distinct citations < floor ${MIN_CANDIDATES}
  A scan finding almost nothing is a broken scan, not a clean suite.`);
  }

  const unresolved: Cite[] = [];
  const exemptUnresolved: Cite[] = [];
  let resolved = 0;
  for (const c of cites.values()) {
    if (resolvesOnDisk(c.cleaned)) {
      resolved++;
      continue;
    }
    if (c.exempt) exemptUnresolved.push(c);
    else unresolved.push(c);
  }
  unresolved.sort((a, b) => b.sites.length - a.sites.length || a.cleaned.localeCompare(b.cleaned));

  console.log(`[${LABEL}] contract files read: ${files.length}`);
  console.log(`[${LABEL}] citations: ${occurrences} occurrences -> ${cites.size} distinct`);
  console.log(`[${LABEL}]   RESOLVE on disk        : ${resolved}`);
  console.log(`[${LABEL}]   UNRESOLVED (arm A)     : ${unresolved.length}  (baseline ${BASELINE_UNRESOLVED})`);
  console.log(`[${LABEL}]   UNRESOLVED but EXEMPT  : ${exemptUnresolved.length}  (arm B — disclosure only)`);

  const show = wantList ? unresolved : unresolved.slice(0, 25);
  if (show.length) {
    console.log(`\n  Top unresolved citations${wantList ? '' : ' (first 25 — rerun with --list for all)'}:`);
    for (const c of show) {
      const where = c.sites.slice(0, 4).join(', ') + (c.sites.length > 4 ? `, +${c.sites.length - 4}` : '');
      console.log(`    ${String(c.sites.length).padStart(3)}x  ${c.cleaned}`);
      console.log(`           ${where}`);
    }
  }
  if (exemptUnresolved.length && wantList) {
    console.log('\n  EXEMPT (PLANNED / struck) unresolved citations:');
    for (const c of exemptUnresolved) console.log(`    [${c.exempt}] ${c.cleaned}  <- ${c.sites[0]}`);
  }

  if (unresolved.length > BASELINE_UNRESOLVED) {
    console.error(
      `\n[${LABEL}] [3] RATCHET EXCEEDED — ${unresolved.length} unresolved cited paths against a declared level of ${BASELINE_UNRESOLVED}.`,
    );
    console.error('  Fix the citation, or mark it PLANNED with intent. Do NOT raise the baseline.');
    return 3;
  }
  if (unresolved.length < BASELINE_UNRESOLVED) {
    console.log(
      `\n[${LABEL}] OK: ${unresolved.length} < baseline ${BASELINE_UNRESOLVED}. ` +
        'RATCHET DOWN — lower BASELINE_UNRESOLVED in this file, in this commit.',
    );
    return 0;
  }
  console.log(`\n[${LABEL}] OK: ${unresolved.length} = baseline ${BASELINE_UNRESOLVED}.`);
  return 0;
}

process.exit(main());
