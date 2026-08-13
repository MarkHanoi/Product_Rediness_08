#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-secrets-register.ts
 *
 * C77 §6 — **the secrets & configuration register is GENERATED from the
 * read-sites and DIFFED against the committed artefact. Presence, never value.**
 *
 * ─── Why this is a generator and not a list ──────────────────────────────────
 * The C69 pattern, third instance (C77 §0). ~40 environment names are read
 * across four surfaces — the BFF runtime, the editor client (build-time-inlined,
 * served publicly), the sync-server, and the deploy build-args — and until C77
 * every one resolved to NO OWNER. The realised cost is §5 of the contract: a
 * `SESSION_SECRET` misreading survived because a wrong claim had no artefact to
 * check itself against. Prose is what failed, so the register is produced by
 * this file from the read-sites, and CI fails when the committed artefact and
 * the regenerated one differ — in either direction.
 *
 * ─── THE ABSOLUTE RULE (C77 §2.4 / §6.1) ─────────────────────────────────────
 * **No code path in this file reads, prints, logs, or writes a secret VALUE.**
 * The scan records NAME + file:line + surface. The gate asserts DECLARATION.
 * There is no `process.env[...]` VALUE read anywhere below — the only
 * `process.env` occurrences in this file are inside REGEX SOURCE TEXT that
 * matches other files' read-sites. The negative-control fixtures use FAKE names
 * (`FAKE_TEST_SECRET_X`), never real ones, and every run ends with a value-leak
 * self-check over the gate's own outputs (register text + report lines): if any
 * output could be a value (`eyJ…` JWT shapes, `AIza…` key shapes, long
 * `=`-adjacent tokens), the gate FAILS CLOSED at exit 2 before writing anything
 * (§6.2). A secrets gate that could leak is worse than none.
 *
 * ─── The arms (C77 §6) ───────────────────────────────────────────────────────
 *  S0  *(floors, exit 2)*  ≥ MIN_FILES_SCANNED files read · ≥ MIN_READ_SITES
 *      env-read sites found · ≥ MIN_NAMES distinct names discovered (the audit
 *      found ~40; a scan finding 3 is a broken scan, not a clean tree) · the
 *      declarations file loads and validates · the in-run planted controls
 *      fired · the value-leak self-check ran clean.
 *  a   *(ratchet, NAMED)*  every discovered name has a row in
 *      `tools/ga-gate/secrets-declarations.json`. An unregistered name is a
 *      finding naming its read-sites (C77 §2.1). The declarations were seeded
 *      from BIM30-SECRETS-MAPPING-AUDIT.md's EXECUTED inventory — deliberately
 *      NOT from this scan's own output, because declaring everything the scan
 *      finds would make arm a a tautology. What the audit did not establish is
 *      named below as the honest first reading.
 *  b   *(hard)*  no `build-time-inlined` name (a `VITE_` name, or any name read
 *      via `import.meta.env`) is classified SECRET (C77 §1.2). Vite bakes it
 *      into the public bundle; a genuine secret there is irreversibly published.
 *  c   *(hard)*  every declaration with a non-empty `sharedWith` is carried by
 *      NAME in the deploy runbook (`DEPLOY-CONTRACT-MANUAL-FLY.md`) or a
 *      fly.toml (C77 §2.2 — the SESSION_SECRET byte-identical BFF↔sync
 *      invariant must be legible where a deploy is performed).
 *  V2  *(drift, hard)*  the committed `docs/04-reference/SECRETS-REGISTER.md`
 *      equals the regenerated one (CRLF-normalised), names diffed in BOTH
 *      directions. A PR that adds an env read and does not regenerate cannot
 *      merge. Regenerate with `--write`.
 *
 * ─── What this gate CANNOT see, stated so nobody reads it as full coverage ───
 *   1. DYNAMIC reads — `process.env[someVar]` with a computed name. None are
 *      declarable by a static scan; none would be found.
 *   2. Read-sites OUTSIDE the scanned roots (the brief's set: server.js,
 *      server/, apps/&#42;/src, packages/&#42;/src, tools/deploy/, Dockerfiles,
 *      fly.toml files, .github/workflows/). The transitional `src/` client root
 *      is NOT scanned; a declaration whose only read lives there reports
 *      `NONE-FOUND-IN-SCANNED-ROOTS` — disclosed, never failed, because absence
 *      from a subset is not absence.
 *   3. PROD PRESENCE. §6 arm d (deploy-time set/unset + length probe, digest
 *      comparison across sharedWith services) is OPTIONAL and OUT OF SCOPE in
 *      this pass. Every prod-presence question remains NOT-ESTABLISHED-FROM-CODE
 *      (C77 §0.2) — this gate asserts declaration and static registration only.
 *   4. Whether a declared classification is TRUE. The declared columns are
 *      normative because they cannot be derived from code that may be wrong
 *      (C77 §1.1); the gate checks their internal consistency (arm b/c), not
 *      their truth.
 *
 * Usage:
 *   npx tsx tools/ga-gate/check-secrets-register.ts            # check (CI)
 *   npx tsx tools/ga-gate/check-secrets-register.ts --write    # regenerate artefact
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind
 * comparator / value-leak fail-closed · 3 ledger exceeded, stale, or drift.
 * 2 and 3 are never absorbable.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-secrets-register';
const WRITE = process.argv.includes('--write');

/** The generated artefact. C77 §6.2 — this path is the register. */
const REGISTER_PATH = 'docs/04-reference/SECRETS-REGISTER.md';
/** The declared columns (C77 §1.1) — normative, beside the gate, cited never copied. */
const DECLARATIONS_PATH = 'tools/ga-gate/secrets-declarations.json';
/** Arm c's carriers: where a sharedWith invariant must be legible by NAME. */
const RUNBOOK_PATHS = [
  'docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md',
  'fly.toml',
  'apps/sync-server/fly.toml',
];

/**
 * ⚠ HONESTY FLOORS (lib/sourceScan.ts idiom). Below these the scan has not
 * established its subject — MISCONFIGURATION detectors, never targets. The
 * audit's EXECUTED inventory found ~40 distinct names before apps/&#42;/src and
 * packages/&#42;/src were even swept; a run seeing fewer than 25 names or 40
 * read-sites is a broken walk or a broken regex, and reporting it as "few
 * secrets" would be the exact SESSION_SECRET failure shape (empty read trusted
 * over the tool). Measured 2026-08-12 at first honest run: 3688 files · ~200
 * read-sites · ~86 names. Floors sit far below on purpose; the register PRINTS
 * the measured numbers on every run — read the run output, never this comment.
 */
const MIN_FILES_SCANNED = 400;
const MIN_READ_SITES = 40;
const MIN_NAMES = 25;

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * Arm-a findings frozen at the first honest reading, 2026-08-12 at HEAD
 * (3ccc2262): names the scan finds READ in production sources with NO row in
 * secrets-declarations.json. They are NOT silently declared, because the
 * declarations record what BIM30-SECRETS-MAPPING-AUDIT.md ESTABLISHED
 * (classification · required · sharedWith · failureMode are judgements, not
 * grep output) — and a judgement nobody made must read as UNDECLARED, never as
 * a favourable default (C77 §0.2).
 *
 * A name leaves this list ONLY by gaining a declaration row (with the four
 * declared columns argued, not defaulted) or by its read-site being deleted —
 * in the SAME commit, or the ledger rots into a record of things that are
 * secretly fine. A NEW undeclared name is exit 3, which is the founder's ask
 * made mechanical: a PR that reads a new env name without declaring it cannot
 * merge.
 */
const LEDGER: readonly string[] = [
  'A::API_GATEWAY_PORT',            // apps/api-gateway/src/index.ts:67 + its Dockerfile
  'A::BAKE_PORT',                   // apps/bake-worker/src/index.ts:183 + its Dockerfile
  'A::MARKETPLACE_PORT',            // apps/marketplace-api/src/index.ts:38
  'A::NSHARDS',                     // .github/workflows/terrain-bake-all.yml:91
  'A::OTEL_RESOURCE_ATTRIBUTES',    // fly.toml:80 [env]
  'A::PNPM_HOME',                   // Dockerfile:53
  'A::PRYZM_DEV_PRINT_SRCDOC',      // packages/plugin-sdk/src/dev/cli.ts:177
  'A::PRYZM_MARKETPLACE_URL',       // packages/plugin-sdk/src/dev/publish-command.ts:55
  'A::PRYZM_PUBLISHER_KEY_PATH',    // packages/plugin-sdk/src/dev/publish-command.ts:198
  'A::PRYZM_PUBLISHER_TOKEN',       // publish-command.ts:56 — READS LIKE A CREDENTIAL; the
                                    //   highest-value strike on this list: classify it FIRST.
  'A::SHARD',                       // .github/workflows/terrain-bake-all.yml:91
  'A::WORKER_CONCURRENCY',          // apps/bake-worker/Dockerfile:32
];

// ─── Read-site discovery ──────────────────────────────────────────────────────

type Via =
  | 'process.env' | 'import.meta.env'
  | 'dockerfile-arg' | 'dockerfile-env' | 'fly-toml-env'
  | 'workflow' | 'deploy-script';

interface ReadSite { readonly file: string; readonly line: number; readonly via: Via }

interface NameRecord {
  sites: ReadSite[];
  surfaces: Set<'runtime-env' | 'build-time-inlined'>;
  services: Set<string>;
}

/**
 * The TS/JS read pattern. NAME must be SCREAMING_SNAKE (≥2 chars) — lowercase
 * npm_* / vitest internals are not configuration surface. This regex is the
 * only place the string `process.env` appears in an executable position in this
 * file, and it matches OTHER files' text; it never dereferences anything.
 */
const ENV_READ_RE =
  /process\.env(?:\.([A-Z][A-Z0-9_]+)\b|\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\])|import\.meta\.env\.([A-Z][A-Z0-9_]+)\b/g;

/**
 * Vite's COMPILE-TIME BUILT-INS, excluded only when read via `import.meta.env`:
 * they are constants vite itself defines, not configuration anyone provisions,
 * so they have no classification, no failure mode, and nothing to leak. A
 * `process.env.DEV` read (if one existed) would NOT be excluded — that would be
 * real, unowned config.
 */
const VITE_BUILTINS = new Set(['BASE_URL', 'DEV', 'PROD', 'MODE', 'SSR']);

const DOCKER_ARG_RE = /^\s*ARG\s+([A-Z][A-Z0-9_]+)/;
const DOCKER_ENV_RE = /^\s*ENV\s+([A-Z][A-Z0-9_]+)[=\s]/;
const TOML_KEY_RE = /^\s*([A-Z][A-Z0-9_]{2,})\s*=/;
const BUILD_ARG_RE = /--build-arg[=\s]+['"]?([A-Z][A-Z0-9_]+)=/g;

function isTestPath(rel: string): boolean {
  return /(^|\/)(__tests__|__mocks__|__fixtures__|e2e)\//.test(rel)
    || /\.(test|spec|bench)\.[tj]sx?$/.test(rel);
}

function serviceOf(rel: string): string {
  if (rel === 'server.js' || rel.startsWith('server/')) return 'BFF';
  if (rel.startsWith('apps/sync-server/')) return 'sync-server';
  if (rel.startsWith('apps/editor/')) return 'editor-client';
  if (rel.startsWith('apps/')) return rel.split('/')[1]!;
  if (rel.startsWith('packages/')) return `pkg:${rel.split('/')[1]!}`;
  if (rel.startsWith('.github/workflows/')) return 'CI';
  return 'deploy'; // Dockerfiles, fly.toml, tools/deploy/
}

/** Strip full-line and trailing `#` comments for Dockerfile/toml/yml/sh lines. */
function stripHashComment(line: string): string {
  if (line.trimStart().startsWith('#')) return '';
  return line.replace(/\s#\s.*$/, '');
}

interface ScanOutcome {
  readonly names: Map<string, NameRecord>;
  readonly filesScanned: number;
  readonly readSites: number;
}

function record(names: Map<string, NameRecord>, name: string, site: ReadSite, inlined: boolean): void {
  const rec = names.get(name) ?? { sites: [], surfaces: new Set(), services: new Set() };
  rec.sites.push(site);
  rec.surfaces.add(inlined || name.startsWith('VITE_') ? 'build-time-inlined' : 'runtime-env');
  rec.services.add(serviceOf(site.file));
  names.set(name, rec);
}

/**
 * The scan. Roots are exactly the C77 brief's set. Comment-stripped for TS/JS
 * (lib/sourceScan.ts's line-preserving lexer, so a name in a JSDoc migration
 * plan is not a read-site); `#`-stripped for the config formats.
 */
function collectReads(root: string): ScanOutcome {
  const names = new Map<string, NameRecord>();
  let filesScanned = 0;
  let readSites = 0;

  const scanCode = (abs: string, rel: string): void => {
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { return; }
    filesScanned++;
    const lines = stripCommentsToLines(src);
    for (let i = 0; i < lines.length; i++) {
      ENV_READ_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ENV_READ_RE.exec(lines[i]!)) !== null) {
        const name = (m[1] ?? m[2] ?? m[3])!;
        const viaMeta = m[3] !== undefined;
        if (viaMeta && VITE_BUILTINS.has(name)) continue;
        record(names, name, { file: rel, line: i + 1, via: viaMeta ? 'import.meta.env' : 'process.env' }, viaMeta);
        readSites++;
      }
    }
  };

  const scanConfig = (abs: string, rel: string, kind: 'dockerfile' | 'toml' | 'workflow' | 'sh'): void => {
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { return; }
    filesScanned++;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = stripHashComment(lines[i]!);
      if (line === '') continue;
      const push = (name: string, via: Via): void => {
        record(names, name, { file: rel, line: i + 1, via }, name.startsWith('VITE_'));
        readSites++;
      };
      if (kind === 'dockerfile') {
        const a = DOCKER_ARG_RE.exec(line); if (a) push(a[1]!, 'dockerfile-arg');
        const e = DOCKER_ENV_RE.exec(line); if (e) push(e[1]!, 'dockerfile-env');
      } else if (kind === 'toml') {
        const t = TOML_KEY_RE.exec(line); if (t) push(t[1]!, 'fly-toml-env');
      } else {
        BUILD_ARG_RE.lastIndex = 0;
        let b: RegExpExecArray | null;
        while ((b = BUILD_ARG_RE.exec(line)) !== null) push(b[1]!, kind === 'sh' ? 'deploy-script' : 'workflow');
        ENV_READ_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = ENV_READ_RE.exec(line)) !== null) {
          push((m[1] ?? m[2] ?? m[3])!, kind === 'sh' ? 'deploy-script' : 'workflow');
        }
      }
    }
  };

  // server.js (the BFF monolith) + server/ (its modules, .js and .ts).
  const serverJs = join(root, 'server.js');
  if (existsSync(serverJs)) scanCode(serverJs, 'server.js');
  for (const abs of walk(join(root, 'server'), { exts: ['.ts', '.js'] })) {
    const rel = relPath(root, abs);
    if (isTestPath(rel)) continue;
    scanCode(abs, rel);
  }
  // apps/*/src and packages/*/src — production TS only.
  for (const top of ['apps', 'packages'] as const) {
    for (const abs of walk(join(root, top), { exts: ['.ts', '.tsx'] })) {
      const rel = relPath(root, abs);
      if (!new RegExp(`^${top}/[^/]+/src/`).test(rel)) continue;
      if (isTestPath(rel)) continue;
      scanCode(abs, rel);
    }
  }
  // Dockerfiles: root + apps/*/Dockerfile.
  const dockerfiles = [join(root, 'Dockerfile')];
  const appsDir = join(root, 'apps');
  if (existsSync(appsDir)) {
    for (const app of readdirSync(appsDir)) {
      const p = join(appsDir, app, 'Dockerfile');
      if (existsSync(p)) dockerfiles.push(p);
    }
  }
  for (const p of dockerfiles) {
    if (existsSync(p) && statSync(p).isFile()) scanConfig(p, relPath(root, p), 'dockerfile');
  }
  // fly.toml files: root + apps/*/fly.toml.
  const flyTomls = [join(root, 'fly.toml')];
  if (existsSync(appsDir)) {
    for (const app of readdirSync(appsDir)) {
      const p = join(appsDir, app, 'fly.toml');
      if (existsSync(p)) flyTomls.push(p);
    }
  }
  for (const p of flyTomls) {
    if (existsSync(p) && statSync(p).isFile()) scanConfig(p, relPath(root, p), 'toml');
  }
  // CI workflows.
  const wfDir = join(root, '.github', 'workflows');
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) {
      if (!/\.ya?ml$/.test(f)) continue;
      scanConfig(join(wfDir, f), `.github/workflows/${f}`, 'workflow');
    }
  }
  // Deploy scripts.
  const depDir = join(root, 'tools', 'deploy');
  if (existsSync(depDir)) {
    for (const f of readdirSync(depDir)) {
      if (!/\.(sh|ps1|ts|js)$/.test(f)) continue;
      scanConfig(join(depDir, f), `tools/deploy/${f}`, 'sh');
    }
  }

  return { names, filesScanned, readSites };
}

// ─── Declarations (C77 §1.1 declared columns) ────────────────────────────────

interface Declaration {
  readonly name: string;
  readonly classification: 'SECRET' | 'PUBLIC-TOKEN' | 'CONFIG';
  readonly required: 'required' | 'optional' | 'required-in-prod-only';
  readonly sharedWith: readonly string[];
  readonly failureMode: string;
  readonly note?: string;
}

function loadDeclarations(): Map<string, Declaration> {
  const p = join(ROOT, DECLARATIONS_PATH);
  let parsed: { declarations?: Declaration[] };
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8')) as { declarations?: Declaration[] };
  } catch (e) {
    console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — ${DECLARATIONS_PATH} failed to load: ${String(e)}\n` +
      `  A register whose declared columns cannot be read has no declarations to check against.\n` +
      `  This is NOT a pass.`);
    process.exit(2);
  }
  const decls = parsed.declarations ?? [];
  const bad = decls.filter((d) =>
    !d.name || !/^[A-Z][A-Z0-9_]+$/.test(d.name)
    || !['SECRET', 'PUBLIC-TOKEN', 'CONFIG'].includes(d.classification)
    || !['required', 'optional', 'required-in-prod-only'].includes(d.required)
    || !Array.isArray(d.sharedWith)
    || typeof d.failureMode !== 'string' || d.failureMode.trim() === '');
  if (decls.length === 0 || bad.length > 0) {
    console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — ${DECLARATIONS_PATH} is invalid: ` +
      (decls.length === 0 ? 'zero declarations.' : `${bad.length} row(s) missing/invalid columns: ${bad.map((d) => d.name || '<unnamed>').join(', ')}`) +
      `\n  Every row needs name · classification (SECRET/PUBLIC-TOKEN/CONFIG) · required ` +
      `(required/optional/required-in-prod-only) · sharedWith[] · failureMode (C77 §1.1). This is NOT a pass.`);
    process.exit(2);
  }
  const dupes = decls.map((d) => d.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupes.length > 0) {
    console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — duplicate declaration row(s): ${[...new Set(dupes)].join(', ')}`);
    process.exit(2);
  }
  return new Map(decls.map((d) => [d.name, d]));
}

// ─── Analysis (pure — reused verbatim by the planted controls) ───────────────

interface Finding { readonly arm: 'A' | 'B' | 'C'; readonly key: string; readonly detail: string }

function analyse(
  scan: ScanOutcome,
  declarations: ReadonlyMap<string, Declaration>,
  runbookText: string,
): Finding[] {
  const findings: Finding[] = [];

  // arm a — every read maps to a declaration row (C77 §2.1).
  for (const [name, rec] of [...scan.names.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (declarations.has(name)) continue;
    const sample = rec.sites.slice(0, 3).map((s) => `${s.file}:${s.line}`).join(', ');
    findings.push({
      arm: 'A',
      key: `A::${name}`,
      detail: `${name} is READ (${rec.sites.length} site(s): ${sample}${rec.sites.length > 3 ? ', …' : ''}; ` +
        `service(s): ${[...rec.services].sort().join(' + ')}) but has NO declaration row in ` +
        `${DECLARATIONS_PATH}. Nobody has declared whether it is a SECRET, whether it is required, ` +
        `or what fails without it — the exact unowned-config state C77 §0 exists to end.`,
    });
  }

  // arm b — no build-time-inlined name is classified SECRET (C77 §1.2).
  for (const [name, d] of [...declarations.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (d.classification !== 'SECRET') continue;
    const scanned = scan.names.get(name);
    const inlined = name.startsWith('VITE_') || (scanned?.surfaces.has('build-time-inlined') ?? false);
    if (inlined) {
      findings.push({
        arm: 'B',
        key: `B::${name}`,
        detail: `${name} is classified SECRET but is build-time-inlined ` +
          `(${name.startsWith('VITE_') ? 'VITE_ prefix' : 'read via import.meta.env'}) — vite bakes it ` +
          `into the public bundle and serves it to every browser. A genuine secret here is irreversibly ` +
          `published (C77 §1.2 / §4.b). Reclassify as PUBLIC-TOKEN (and scope it at the provider) or ` +
          `move the read to the runtime surface.`,
      });
    }
  }

  // arm c — every sharedWith declaration is carried by NAME in the deploy guidance (C77 §2.2).
  for (const [name, d] of [...declarations.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (d.sharedWith.length === 0) continue;
    if (!new RegExp(`\\b${name}\\b`).test(runbookText)) {
      findings.push({
        arm: 'C',
        key: `C::${name}`,
        detail: `${name} declares sharedWith=[${d.sharedWith.join(', ')}] — services that must hold a ` +
          `byte-identical value — but the NAME appears in none of ${RUNBOOK_PATHS.join(', ')}. ` +
          `A shared-secret invariant nobody can see at deploy time is the SESSION_SECRET drift ` +
          `waiting to recur (C77 §2.2 / §4.d).`,
      });
    }
  }

  return findings;
}

// ─── Value-leak self-check (C77 §2.4 / §6.2) — runs on EVERY output ──────────

/**
 * Patterns that look like VALUES, not names: JWT prefixes, Google-key prefixes,
 * and long token-shaped strings adjacent to `=` or `:`. The check runs over the
 * gate's own outputs (the rendered register + every report line). On a hit the
 * gate reports the LOCATION ONLY — never the matched text, which would itself
 * be the leak — and fails closed at exit 2 before anything is written.
 */
const LEAK_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'JWT-shaped token (eyJ…)', re: /eyJ[A-Za-z0-9_-]{16,}/ },
  { label: 'Google-key-shaped token (AIza…)', re: /AIza[0-9A-Za-z_-]{20,}/ },
  // No `/` in the token class: repo paths (`sites: server/jurisdiction/…`) are
  // 40+ chars of slash-joined segments and are exactly what this gate MUST
  // print. A credential shaped purely like a path is indistinguishable from a
  // path by any static shape test — that residual is stated, not hidden.
  { label: 'long =/:-adjacent token (≥40 chars)', re: /[=:]\s*['"]?[A-Za-z0-9+_-]{40,}/ },
];

function leakCheck(label: string, text: string): string[] {
  const hits: string[] = [];
  const lines = text.split('\n');
  for (const p of LEAK_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (p.re.test(lines[i]!)) hits.push(`${label} line ${i + 1}: matches ${p.label}`);
    }
  }
  return hits;
}

// ─── Register rendering (deterministic — sorted, no timestamps) ──────────────

const esc = (s: string): string => s.replace(/\|/g, '\\|');

function renderRegister(
  scan: ScanOutcome,
  declarations: ReadonlyMap<string, Declaration>,
  findings: readonly Finding[],
): string {
  const allNames = [...new Set([...scan.names.keys(), ...declarations.keys()])].sort();
  const undeclared = allNames.filter((n) => scan.names.has(n) && !declarations.has(n));
  const unfound = allNames.filter((n) => !scan.names.has(n) && declarations.has(n));

  const L: string[] = [];
  L.push('# PRYZM — Secrets & Configuration Register (C77)');
  L.push('');
  L.push('> ⚠ **GENERATED FILE — DO NOT EDIT BY HAND.**');
  L.push('> Produced by `tools/ga-gate/check-secrets-register.ts`. Regenerate with');
  L.push('> `npx tsx tools/ga-gate/check-secrets-register.ts --write`.');
  L.push('> CI fails when this file and the code disagree, in either direction.');
  L.push('> Governed by [C77](../02-decisions/contracts/C77-SECRETS-AND-CONFIGURATION-REGISTER.md);');
  L.push('> declared columns live in [`tools/ga-gate/secrets-declarations.json`](../../tools/ga-gate/secrets-declarations.json);');
  L.push('> the measured inventory it was seeded from is [BIM30-SECRETS-MAPPING-AUDIT.md](BIM30-SECRETS-MAPPING-AUDIT.md).');
  L.push('>');
  L.push('> **PRESENCE, NEVER VALUE (C77 §2.4).** This register records names, read-sites,');
  L.push('> surfaces and declared columns. **No secret value appears anywhere in it**, and the');
  L.push('> generator fails closed (exit 2) if a regeneration would emit anything value-shaped.');
  L.push('> Prod-configuration status is deliberately absent: it is **NOT-ESTABLISHED-FROM-CODE**');
  L.push('> for every row (C77 §0.2) — a static read may not guess set-or-unset.');
  L.push('');
  L.push('## Measured at generation');
  L.push('');
  L.push('Row-derived numbers only. The walk-size floors (files scanned, read-sites) are');
  L.push("printed by every gate run and enforced there — they are deliberately NOT embedded");
  L.push('here, because the walk size moves whenever ANY file is added to a scanned root,');
  L.push('and a register that drifts on unrelated PRs teaches people to ignore its drift.');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| **Distinct names** | **${allNames.length}** (${scan.names.size} read in scanned roots; floor ${MIN_NAMES}) |`);
  L.push(`| Declared (have a row in secrets-declarations.json) | ${allNames.length - undeclared.length} |`);
  L.push(`| UNDECLARED (arm-a findings) | ${undeclared.length} |`);
  L.push(`| Declared but not found in scanned roots (disclosed, not failed) | ${unfound.length} |`);
  L.push(`| build-time-inlined SECRET violations (arm b) | ${findings.filter((f) => f.arm === 'B').length} |`);
  L.push(`| sharedWith rows missing from deploy guidance (arm c) | ${findings.filter((f) => f.arm === 'C').length} |`);
  L.push('');
  L.push('These numbers are re-derived on every run. Do not transcribe them anywhere else — cite this file (C77 §0.1).');
  L.push('');
  L.push('## Column meanings');
  L.push('');
  L.push('| Column | Kind | Derivation |');
  L.push('|---|---|---|');
  L.push('| **name** | measured | the env identifier. |');
  L.push('| **classification / required / sharedWith / failureMode** | **declared** | cited from `secrets-declarations.json` — normative judgements (C77 §1.1), never derived from code that may be wrong. `UNDECLARED` = the scan found a read nobody has declared: an arm-a finding, never a favourable default. |');
  L.push('| **surface** | measured | `build-time-inlined` when the name is `VITE_`-prefixed or read via `import.meta.env` (vite bakes it into the public bundle — C77 §1.2); `runtime-env` otherwise. |');
  L.push('| **service(s)** | measured | inferred from read-site paths: BFF (`server.js` + `server/`), editor-client, sync-server, per-app, `pkg:*` (a library whose consumer decides the surface), CI, deploy. |');
  L.push('| **read-sites** | measured | `file:line` of every read in the scanned roots (capped at 8 per row for legibility; the count is exact). `NONE-FOUND-IN-SCANNED-ROOTS` = declared, but every read lives outside the scanned set (e.g. the transitional `src/` root) or is dynamic — disclosed, never failed. |');
  L.push('');
  L.push('## Register');
  L.push('');
  L.push('| name | classification | surface | required | service(s) | sharedWith | failureMode | read-sites |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const name of allNames) {
    const rec = scan.names.get(name);
    const d = declarations.get(name);
    const surface = rec
      ? [...rec.surfaces].sort().join(' + ')
      : (name.startsWith('VITE_') ? 'build-time-inlined' : 'runtime-env');
    const services = rec ? [...rec.services].sort().join(' + ') : 'UNKNOWN';
    const sites = rec
      ? (() => {
        const sorted = [...rec.sites].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
        const shown = sorted.slice(0, 8).map((s) => `${s.file}:${s.line}`).join(' · ');
        return sorted.length > 8 ? `${shown} (+${sorted.length - 8} more)` : shown;
      })()
      : 'NONE-FOUND-IN-SCANNED-ROOTS';
    L.push(`| \`${name}\` | ${d ? d.classification : '**UNDECLARED**'} | ${surface} | ${d ? d.required : 'UNDECLARED'} | ${esc(services)} | ${d && d.sharedWith.length > 0 ? d.sharedWith.join(' + ') : d ? '—' : 'UNDECLARED'} | ${d ? esc(d.failureMode) : 'UNDECLARED — arm-a finding'} | ${esc(sites)} |`);
  }
  L.push('');
  L.push('## UNDECLARED names (arm-a findings — the honest first reading)');
  L.push('');
  if (undeclared.length === 0) {
    L.push('None — every read in the scanned roots maps to a declaration row.');
  } else {
    L.push('Each of these is read in production sources with no declared classification,');
    L.push('requiredness, sharing, or failure mode. They are NOT silently declared (C77 §0.2 —');
    L.push('a judgement nobody made must not print as one somebody did). A name leaves this');
    L.push('list by gaining an argued declaration row, or by its read being deleted.');
    L.push('');
    for (const n of undeclared) L.push(`- \`${n}\``);
  }
  L.push('');
  L.push('## Declared but not found in scanned roots (disclosed)');
  L.push('');
  if (unfound.length === 0) {
    L.push('None.');
  } else {
    L.push('Declared in the audit-seeded columns, but no read-site inside the scanned roots');
    L.push('(server.js · server/ · apps/\\*/src · packages/\\*/src · tools/deploy/ · Dockerfiles ·');
    L.push('fly.toml · .github/workflows/). Absence from a subset is not absence: known homes');
    L.push('include the transitional `src/` client root and dynamic `env[...]` reads.');
    L.push('');
    for (const n of unfound) L.push(`- \`${n}\``);
  }
  L.push('');
  return L.join('\n');
}

// ─── Negative + positive control, EXECUTED ON EVERY RUN (C77 §6.1) ───────────
//
// FAKE names only — a negative control that leaks is the §4.a failure wearing a
// test's clothes. The planted tree exercises the REAL scan pipeline end to end
// (walk → comment strip → regex → analyse), not a parallel reimplementation.

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  'apps/fixture/src/reads.ts': [
    '// A read with NO declaration row — arm a must fire, naming this file.',
    'export const a = process.env.FAKE_TEST_SECRET_X;',
    '// A build-time-inlined read whose declaration says SECRET — arm b must fire.',
    'export const b = import.meta.env.VITE_FAKE_SECRET;',
    '// A declared shared secret whose NAME no runbook carries — arm c must fire.',
    'export const c = process.env.FAKE_SHARED_TOKEN;',
    '// A comment-only mention must NOT be a read-site: process.env.FAKE_COMMENT_ONLY',
  ].join('\n'),
};

const PLANTED_DECLS = new Map<string, Declaration>([
  ['VITE_FAKE_SECRET', { name: 'VITE_FAKE_SECRET', classification: 'SECRET', required: 'optional', sharedWith: [], failureMode: 'broken-bundle' }],
  ['FAKE_SHARED_TOKEN', { name: 'FAKE_SHARED_TOKEN', classification: 'CONFIG', required: 'optional', sharedWith: ['fake-other-service'], failureMode: 'degraded-feature' }],
]);

const CLEAN = {
  'apps/fixture/src/reads.ts': 'export const a = process.env.FAKE_CLEAN_CONFIG;\n',
};

const CLEAN_DECLS = new Map<string, Declaration>([
  ['FAKE_CLEAN_CONFIG', { name: 'FAKE_CLEAN_CONFIG', classification: 'CONFIG', required: 'optional', sharedWith: [], failureMode: 'degraded-feature' }],
]);

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);

    const plantedScan = collectReads(join(base, 'planted'));
    const bad = analyse(plantedScan, PLANTED_DECLS, '' /* no runbook carries the fake name */);
    const cleanScan = collectReads(join(base, 'clean'));
    const good = analyse(cleanScan, CLEAN_DECLS, '');

    const fired = new Set(bad.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.length} finding(s), arms fired = [${[...fired].sort().join(', ')}]`);
    for (const want of ['A::FAKE_TEST_SECRET_X', 'B::VITE_FAKE_SECRET', 'C::FAKE_SHARED_TOKEN']) {
      if (bad.some((f) => f.key === want)) lines.push(`    ✓ fired — ${want}`);
      else { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${want} did not fire on a deliberately planted violation.`); }
    }
    if (plantedScan.names.has('FAKE_COMMENT_ONLY')) {
      ok = false;
      lines.push('    ✗ FALSE POSITIVE — a comment-only mention was counted as a read-site (comment strip broken).');
    } else {
      lines.push('    ✓ comment-only mention NOT counted as a read (strip works).');
    }
    lines.push(`positive control (clean tree):   ${good.length} finding(s) — must be 0`);
    for (const f of good) { ok = false; lines.push(`    ✗ FALSE POSITIVE — ${f.key}`); }
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
console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN; fixtures use FAKE names only):`);
for (const l of control.lines) console.log('   ' + l);

const declarations = loadDeclarations();
const scan = collectReads(ROOT);

let runbookText = '';
const runbooksRead: string[] = [];
for (const rb of RUNBOOK_PATHS) {
  const p = join(ROOT, rb);
  if (!existsSync(p)) continue;
  try { runbookText += '\n' + readFileSync(p, 'utf8'); runbooksRead.push(rb); } catch { /* reported below */ }
}
if (runbooksRead.length === 0) {
  console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — none of the arm-c carriers could be read: ${RUNBOOK_PATHS.join(', ')}.\n` +
    `  Arm c compared against nothing would report every sharedWith row as uncarried — or none.\n` +
    `  This is NOT a pass.`);
  process.exit(2);
}

const findings = analyse(scan, declarations, runbookText);
const generated = renderRegister(scan, declarations, findings);

// C77 §6.2 — a regeneration that would write a value fails closed. Checked over
// the register text AND every line this gate is about to print.
const reportSoFar = control.lines.join('\n') + '\n' + findings.map((f) => f.detail).join('\n');
const leaks = [...leakCheck(REGISTER_PATH, generated), ...leakCheck('gate-output', reportSoFar)];
if (leaks.length > 0) {
  console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — VALUE-LEAK SELF-CHECK FAILED CLOSED (C77 §2.4/§6.2).\n` +
    `  ${leaks.length} output location(s) match a value-shaped pattern. The locations (NEVER the text):\n` +
    leaks.map((l) => `    - ${l}`).join('\n') +
    `\n  Nothing was written. A secrets gate that prints a value has defeated its own purpose.`);
  process.exit(2);
}
console.log(`[${GATE}] value-leak self-check: 0 value-shaped strings across the register and this report. ✓`);

const target = join(ROOT, REGISTER_PATH);
const lines: string[] = [];
lines.push(
  `files scanned: ${scan.filesScanned} · env-read sites: ${scan.readSites} · distinct names read: ${scan.names.size} · ` +
  `declared rows: ${declarations.size} · runbook carriers read: ${runbooksRead.length}/${RUNBOOK_PATHS.length}`,
);
lines.push(
  `arm a (undeclared reads): ${findings.filter((f) => f.arm === 'A').length} · ` +
  `arm b (inlined SECRET): ${findings.filter((f) => f.arm === 'B').length} · ` +
  `arm c (sharedWith uncarried): ${findings.filter((f) => f.arm === 'C').length}`,
);
lines.push('arm d (deploy-time presence probe) is NOT RUN — optional per C77 §6, out of scope in this pass; prod presence stays NOT-ESTABLISHED-FROM-CODE.');
lines.push('');
for (const f of findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

if (WRITE) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, generated, 'utf8');
  console.log(`[${GATE}] wrote ${REGISTER_PATH} — ${scan.names.size} names read, ${declarations.size} declared rows.`);
} else {
  // V2 — drift, both directions, CRLF-normalised (the C69 §CRLF lesson: a gate
  // red for a whole platform teaches people to ignore it).
  if (!existsSync(target)) {
    lines.push('');
    lines.push(`DRIFT — ${REGISTER_PATH} does not exist. The register is GENERATED: run --write and commit it.`);
    findings.push({ arm: 'A', key: `DRIFT::${REGISTER_PATH}`, detail: 'register artefact missing' });
  } else {
    const committed = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    if (committed !== generated) {
      const rowRe = /^\| `([A-Z][A-Z0-9_]+)` \|/gm;
      const committedNames = new Set([...committed.matchAll(rowRe)].map((m) => m[1]!));
      const codeNames = new Set([...new Set([...scan.names.keys(), ...declarations.keys()])]);
      const missing = [...codeNames].filter((n) => !committedNames.has(n)).sort();
      const stale = [...committedNames].filter((n) => !codeNames.has(n)).sort();
      lines.push('');
      if (missing.length > 0) lines.push(`DRIFT — ${missing.length} name(s) in the code have NO register row: ${missing.join(', ')}. Regenerate with --write.`);
      if (stale.length > 0) lines.push(`DRIFT — ${stale.length} register row(s) map to no read or declaration: ${stale.join(', ')}. Regenerate with --write.`);
      if (missing.length === 0 && stale.length === 0) lines.push(`DRIFT — ${REGISTER_PATH} is STALE (a measured column moved: a read-site, count, service or surface). Regenerate with --write.`);
      findings.push({ arm: 'A', key: `DRIFT::${REGISTER_PATH}`, detail: 'committed register disagrees with the code' });
    }
  }
}

const measured = new Set(findings.map((f) => f.key));
const declaredLedger = new Set(LEDGER);
const staleLedger = [...declaredLedger].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declaredLedger.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'files scanned', measured: scan.filesScanned, min: MIN_FILES_SCANNED },
  { what: 'env-read sites discovered', measured: scan.readSites, min: MIN_READ_SITES },
  { what: 'distinct env names discovered', measured: scan.names.size, min: MIN_NAMES },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  // Comparison is by NAME in both directions, never by count — and the REPORTED
  // number is the real finding count, nothing else. The exit code follows from
  // the name comparison above: an unledgered key means `measured ⊋ LEDGER` when
  // nothing is stale, so findings.length > declared → exit 3 through the shared
  // comparator; and a stale ledger row forces exit 3 via `stale` even when the
  // totals coincide. (This line used to add `LEDGER.length + 1` as a shove to
  // force exit 3 — right intent, but it made the headline read "26 findings"
  // against a body of 13, and a gate whose headline disagrees with its own body
  // trains people to distrust the body. See TRIAGE-REPORT 2026-08-13 §5.)
  findings: findings.length,
  declared: LEDGER.length,
  findingNames: [...measured],
  stale: staleLedger,
};

process.exit(reportGate(result));
