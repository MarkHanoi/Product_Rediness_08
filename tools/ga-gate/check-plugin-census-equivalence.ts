#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-plugin-census-equivalence.ts
 *
 * **`ls plugins/` == `ALL_PLUGINS` == `PLUGIN_CATALOG`, AS SETS, IN BOTH
 * DIRECTIONS, FOR EVERY PAIR.**
 *
 * ─── The finding this gate exists for (lane PLUGIN2, L-9920) ─────────────────
 * PRYZM carries **three rival plugin censuses and nothing compares them**:
 *
 *   | source of truth                       | locator                                                          |
 *   |---------------------------------------|------------------------------------------------------------------|
 *   | directories on disk                   | `plugins/*`                                                      |
 *   | what actually gets a store + handlers | `ALL_PLUGINS` — `apps/editor/src/PluginRegistry.ts`               |
 *   | what `runtime.plugins.list()` reports | `PLUGIN_CATALOG` — `packages/runtime-composer/src/PluginHost.ts` |
 *
 * A fourth, `ELEMENT_PLUGIN_IDS`, is the list the bootstrap suite's storeKey
 * assertion iterates — so a descriptor missing from it is registered and
 * unasserted.
 *
 * ⭐ **A COUNT WOULD NOT HAVE CAUGHT ANY OF THIS, AND DEMONSTRABLY DID NOT.**
 * `docs/04-reference/AUDIT/A-architecture.md` §2.6 derived `ALL_PLUGINS` with
 * `grep -oE "id: '[a-z-]+'" | sort -u | wc -l` → **27**. The real membership is
 * **28**: the character class `[a-z-]` cannot match the capital `P` in
 * **`liftPart`**, so the audit's *count* was one short while its *set* was
 * silently missing a real registration. That is this gate's thesis reproduced
 * inside the very document that reported the defect — the same shape as
 * `check-contract-index-equivalence.ts` (a count can be right while the
 * membership is wrong), and the reason **this file compares SETS and never a
 * number.**
 *
 * `PluginHost.ts:33` states *"Order matches `ls plugins/`"*. It has not matched
 * for 13 entries. `PluginHost.ts:6` states its own count as 38 in prose.
 * Everything below is DERIVED; nothing is transcribed.
 *
 * ─── Why the reference-resolving arm exists (do not simplify it away) ────────
 * `PluginRegistry.ts:13-17` records that per-plugin `descriptor.ts` files
 * *"were considered and rejected"* because the descriptor TYPE was declared at
 * L7. §PLUGIN-DESCRIPTOR-AT-L5 (L-9921) moves that type to `@pryzm/plugin-sdk`
 * (L5), so an `ALL_PLUGINS` element may now be a bare identifier imported from
 * the plugin's own package instead of an inline object literal.
 *
 * ⛔ A parser that only understood object literals would report each migrated
 * descriptor as a DELETED registration — a false RATCHET DOWN, i.e. the gate
 * congratulating itself for going blind. Descriptor references are therefore
 * resolved through the import statement into the plugin package's own source,
 * and an unresolvable reference is a **hard-0 arm (H)**, never a silent skip.
 *
 * ─── Arms ────────────────────────────────────────────────────────────────────
 *  F0 *(floors, exit 2)* all four sources parse · each above its MIN · planted
 *     controls fired. A parser that found nothing would report a clean sweep of
 *     nothing (L-827).
 *  A  *(ratchet)* DISK \ REGISTRY — a directory that contributes nothing at boot.
 *  B  *(ratchet)* DISK \ CATALOG  — a directory `runtime.plugins.list()` omits.
 *  C  *(hard 0)*  CATALOG \ DISK  — the runtime advertises a plugin with no code.
 *  D  *(hard 0)*  REGISTRY \ DISK, minus the exemptions the registry itself
 *     declares in `STORE_ONLY_PLUGIN_IDS` (derived, not transcribed).
 *  E  *(ratchet)* (REGISTRY ∩ DISK) \ CATALOG — **wired at boot and invisible to
 *     `runtime.plugins`**. The sharpest of the seven: the runtime tells a caller
 *     it has N plugins while booting families that are not among them.
 *  F  *(ratchet)* REGISTRY \ ELEMENT_PLUGIN_IDS — registered, but outside the id
 *     list `bootstrap.everything.test.ts`'s storeKey assertion iterates.
 *  G  *(hard 0)*  ELEMENT_PLUGIN_IDS \ REGISTRY — named as an element plugin and
 *     never registered.
 *  H  *(hard 0)*  UNRESOLVED DESCRIPTOR REFERENCE — see above.
 *
 * ⭐ **EVERY BASELINE IS A NAMED SET, NEVER A BARE INTEGER.** The named members
 * are printed on every run and checked for membership drift, so swapping one
 * missing plugin for another cannot pass just because the total held.
 *
 * Exit 0 clean/within baseline · 2 MISCONFIGURED / floor unmet / control did not
 * fire · 3 any arm breached. Per §RATCHET-EXCEEDED-IS-NEVER-DEBT, exit 3 is
 * never absorbable.
 *
 * Usage: npx tsx tools/ga-gate/check-plugin-census-equivalence.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'plugin-census-equivalence';

const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const REGISTRY_FILE = path.join(REPO_ROOT, 'apps', 'editor', 'src', 'PluginRegistry.ts');
const HOST_FILE = path.join(REPO_ROOT, 'packages', 'runtime-composer', 'src', 'PluginHost.ts');

// ── Honesty floors — a parser that walks nothing must exit 2, never 0 ────────
const MIN_DISK = 40;
const MIN_REGISTRY = 20;
const MIN_CATALOG = 30;
const MIN_ELEMENT = 20;

/**
 * ⭐ AT LEAST ONE `ALL_PLUGINS` ELEMENT MUST BE A DESCRIPTOR REFERENCE RESOLVED
 * INTO A PLUGIN PACKAGE (L-9922, 2026-08-23).
 *
 * The reference-resolving path and arm H exist for descriptors authored in the
 * plugin itself (§PLUGIN-DESCRIPTOR-AT-L5). If every element reverted to an
 * inline object literal, `resolveDescriptorRef` would never run, arm H would
 * report a clean hard-0 having examined NOTHING, and the whole apparatus would
 * be dead code reporting success — the exact failure this gate was built to
 * catch, one level up. `section-view` is the first and currently only member;
 * this floor rises as descriptors migrate and must never fall.
 *
 * ⛔ If this fires, do not lower it. Either a migrated descriptor was reverted
 * (fix the revert) or the parser stopped recognising the reference shape (fix
 * the parser).
 */
const MIN_AUTHORED_REFS = 1;

/**
 * §PLUGIN-CENSUS-BASELINE — pinned at the FIRST HONEST READING, 2026-08-23
 * (lane PLUGIN2, L-9920). Every entry is the MEMBERSHIP, not a count.
 *
 * SHRINK-ONLY. Adding a plugin directory without a descriptor raises arm A;
 * adding a descriptor without a catalog row raises arm E. Raising either is
 * choosing to ship a plugin the application cannot dispatch or cannot report.
 *
 * ⛔ Do not "fix" a red arm by adding its member here.
 */
const BASELINE = {
  /**
   * A — on disk, contributes NO store and NO handlers at boot.
   *
   * ⭐ RATCHETED DOWN 25 → 24 on 2026-08-23 (L-9922): `section-view` left this
   * arm when `plugins/section-view/src/registration.ts` was authored against the
   * L5 `PluginRegistration` contract and referenced from `ALL_PLUGINS`. It is
   * removed from the baseline in the SAME commit as the wiring, per this file's
   * own shrink-only rule — a ratchet that is not re-pinned is a ratchet that
   * lets the next regression back in for free.
   */
  diskWithoutRegistry: [
    'ai-floorplan', 'ai-generative', 'ai-query', 'ai-rules', 'ai-voice',
    'bcf', 'cross', 'dxf', 'export-pdf', 'family-editor', 'geospatial',
    'ifc-export', 'ifc-import', 'ifc-inspector', 'levels', 'multiplayer',
    'navigate', 'plan-view', 'render', 'rhino-import', 'schedules',
    'sheets', 'toy-cube', 'visibility-intent',
  ],
  /** B — on disk, absent from what `runtime.plugins.list()` reports. */
  diskWithoutCatalog: [
    'balcony', 'boundary-line', 'dxf', 'export-pdf', 'family-editor', 'floor',
    'geospatial', 'levels', 'lift', 'navigate', 'pool', 'render',
    'visibility-intent',
  ],
  /**
   * E — WIRED AT BOOT AND INVISIBLE TO `runtime.plugins`. Five real element
   * families the editor boots and the runtime does not admit to having.
   */
  registeredButUncatalogued: ['balcony', 'boundary-line', 'floor', 'lift', 'pool'],
  /**
   * F — registered, but outside `ELEMENT_PLUGIN_IDS`, so the bootstrap suite's
   * per-plugin storeKey assertion never iterates them.
   */
  registryWithoutElementList: ['floor', 'lighting', 'view'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Source scanning — comments stripped FIRST, always.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip `//` and block comments while respecting string and template literals.
 *
 * ⚠ NOT optional and NOT a tidiness measure. `PluginRegistry.ts` quotes runtime
 * error strings inside comments —
 *   `//     "pool.create: required store 'pool' is missing from ..."`
 * — so a scanner that tracked quotes without first removing comments would enter
 * a phantom string literal and mis-balance every brace after it. This is the
 * §FIX-GATE-NEEDS-RIPGREP failure mode (L-811) in a different costume: a scanner
 * that silently reads the wrong thing reports a clean sweep of nothing.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Body of the first `[...]` that follows `marker`, brackets balanced. */
function arrayBodyAfter(src: string, marker: string): string | null {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  // ⛔ THE ARRAY OPENER IS THE FIRST `[` AFTER THE ASSIGNMENT, NOT AFTER THE NAME.
  // `export const ALL_PLUGINS: readonly PluginDescriptor[] = [` carries a `[` inside
  // its TYPE ANNOTATION. Scanning from the marker latched onto that one, saw its `]`
  // one character later, and returned an EMPTY body — so the gate parsed zero
  // literals and zero refs and its own planted control fired MISCONFIGURED. A gate
  // whose parser silently returns nothing is the failure mode this gate exists to
  // catch, in the gate itself.
  //
  // The `=` is found by skipping the operators that CONTAIN one (`=>` in a function
  // type, `==`/`!=`/`>=`/`<=` in a conditional type), so a future annotation like
  // `const X: (a: A) => B[] = [` cannot re-open this.
  let eq = -1;
  for (let i = at + marker.length; i < src.length; i++) {
    if (src[i] !== '=') continue;
    const next = src[i + 1];
    const prev = src[i - 1];
    if (next === '=' || next === '>') continue;
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>') continue;
    eq = i;
    break;
  }
  if (eq < 0) return null;
  const open = src.indexOf('[', eq);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/** Split an array body into its TOP-LEVEL elements (depth-0 commas). */
function topLevelElements(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      const piece = body.slice(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

interface RegistryParse {
  /** ids read straight off an inline object literal. */
  readonly literals: string[];
  /** bare identifiers referencing a descriptor authored in a plugin package. */
  readonly refs: string[];
}

/**
 * Read `ALL_PLUGINS` as a SET of ids, accepting BOTH element shapes:
 * an inline `{ id: 'x', … }` object literal, and a bare `xDescriptor`
 * identifier imported from the plugin's own package (§PLUGIN-DESCRIPTOR-AT-L5).
 *
 * The `id:` regex is applied only to the element's OWN top level — a nested
 * `{ id: … }` inside `contributions` or `buildAuxiliaries` must not be mistaken
 * for a registration.
 */
function parseAllPlugins(strippedSrc: string): RegistryParse | null {
  const body = arrayBodyAfter(strippedSrc, 'export const ALL_PLUGINS');
  if (body === null) return null;
  const literals: string[] = [];
  const refs: string[] = [];
  for (const el of topLevelElements(body)) {
    const cleaned = el.replace(/\bas\s+const\s*$/, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(cleaned)) {
      refs.push(cleaned);
      continue;
    }
    if (!cleaned.startsWith('{')) continue;
    const inner = cleaned.slice(1, cleaned.lastIndexOf('}'));
    // Keep only this object's own top level, so nested ids cannot leak in.
    let depth = 0;
    let own = '';
    for (const c of inner) {
      if (c === '[' || c === '{' || c === '(') {
        depth++;
        continue;
      }
      if (c === ']' || c === '}' || c === ')') {
        depth--;
        continue;
      }
      if (depth === 0) own += c;
    }
    const m = /\bid\s*:\s*'([^']+)'/.exec(own);
    if (m) literals.push(m[1]);
  }
  return { literals, refs };
}

/** `desc('<id>', …)` rows of `PLUGIN_CATALOG`. */
function parseCatalog(strippedSrc: string): string[] | null {
  const body = arrayBodyAfter(strippedSrc, 'const PLUGIN_CATALOG');
  if (body === null) return null;
  return [...body.matchAll(/\bdesc\(\s*'([^']+)'/g)].map((m) => m[1]);
}

/** String-literal rows of `ELEMENT_PLUGIN_IDS`. */
function parseElementIds(strippedSrc: string): string[] | null {
  const body = arrayBodyAfter(strippedSrc, 'export const ELEMENT_PLUGIN_IDS');
  if (body === null) return null;
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Keys of `STORE_ONLY_PLUGIN_IDS` — the registry's OWN written-down statement
 * of which ids legitimately contribute a store while backing no directory.
 * DERIVED, never transcribed: an exemption list copied into a gate is a second
 * rival census, which is the defect this file exists to prevent.
 */
function parseStoreOnlyIds(strippedSrc: string): string[] {
  const at = strippedSrc.indexOf('export const STORE_ONLY_PLUGIN_IDS');
  if (at < 0) return [];
  const open = strippedSrc.indexOf('{', at);
  if (open < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = open; i < strippedSrc.length; i++) {
    if (strippedSrc[i] === '{') depth++;
    else if (strippedSrc[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  const body = strippedSrc.slice(open + 1, end);
  return [...body.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Descriptor-reference resolution (arm H)
// ─────────────────────────────────────────────────────────────────────────────

/** workspace package name → absolute directory, read from every manifest. */
function workspaceDirs(): Map<string, string> {
  const map = new Map<string, string>();
  for (const root of [PLUGINS_DIR, PACKAGES_DIR]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      const manifest = path.join(root, d, 'package.json');
      if (!fs.existsSync(manifest)) continue;
      try {
        const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
        if (typeof name === 'string') map.set(name, path.join(root, d));
      } catch {
        /* an unparseable manifest is not this gate's subject */
      }
    }
  }
  return map;
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p);
  }
  return out;
}

/** The module specifier `ident` is imported from, in `strippedSrc`. */
function importSpecifierOf(strippedSrc: string, ident: string): string | null {
  const re = new RegExp(
    `import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${ident}\\b[^}]*\\}|${ident})\\s+from\\s+'([^']+)'`,
    's',
  );
  const m = re.exec(strippedSrc);
  return m ? m[1] : null;
}

/** Resolve `ident` → the `id` string of the descriptor it names. */
function resolveDescriptorRef(
  strippedSrc: string,
  ident: string,
  dirs: Map<string, string>,
): { id: string } | { error: string } {
  const spec = importSpecifierOf(strippedSrc, ident);
  if (!spec) return { error: `${ident}: no import statement found for it` };
  const parts = spec.split('/');
  const pkgName = spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  const dir = dirs.get(pkgName);
  if (!dir) return { error: `${ident}: '${pkgName}' resolves to no workspace directory` };
  for (const f of walkTs(path.join(dir, 'src'))) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const decl = new RegExp(`export\\s+const\\s+${ident}\\b`).exec(src);
    if (!decl) continue;
    const m = /\bid\s*:\s*'([^']+)'/.exec(src.slice(decl.index));
    if (!m) {
      return { error: `${ident}: declared in ${path.relative(REPO_ROOT, f)} with no \`id:\` literal` };
    }
    return { id: m[1] };
  }
  return { error: `${ident}: no \`export const ${ident}\` under ${path.relative(REPO_ROOT, dir)}/src` };
}

// ─────────────────────────────────────────────────────────────────────────────

function die(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

const minus = (a: Iterable<string>, b: Set<string>): string[] =>
  [...new Set(a)].filter((x) => !b.has(x)).sort();

/** F0 planted controls — run against the REAL parsers on every invocation. */
function controlsFired(): { ok: boolean; detail: string } {
  const problems: string[] = [];

  // (1) The comment stripper must survive an apostrophe INSIDE a comment.
  const tricky = [
    'export const ALL_PLUGINS: readonly PluginDescriptor[] = [',
    '  // "pool.create: required store \'pool\' is missing from stores[key]"',
    "  { id: 'alpha', buildAuxiliaries: () => ({ nested: { id: 'NOT-THIS' } }) },",
    '  betaDescriptor,',
    "  { id: 'gamma' },",
    '] as const;',
  ].join('\n');
  const parsed = parseAllPlugins(stripComments(tricky));
  if (!parsed) problems.push('ALL_PLUGINS fixture did not parse at all');
  else {
    if (parsed.literals.join(',') !== 'alpha,gamma') {
      problems.push(`literals expected alpha,gamma — got ${parsed.literals.join(',') || '(none)'}`);
    }
    if (parsed.refs.join(',') !== 'betaDescriptor') {
      problems.push(`refs expected betaDescriptor — got ${parsed.refs.join(',') || '(none)'}`);
    }
    // (2) A nested id must NOT be counted — asserted explicitly, because the
    //     whole gate reads as clean if the parser over-collects.
    if (parsed.literals.includes('NOT-THIS')) problems.push('nested id leaked into the registry set');
  }

  // (3) The catalog parser must ignore the `function desc(` definition line —
  //     the exact off-by-one a `grep -c "desc("` makes (39 raw hits vs 38 rows).
  const cat = parseCatalog(
    stripComments(
      "const PLUGIN_CATALOG = Object.freeze([\n desc('a','A','ai'),\n desc('b','B','misc'),\n]);\nfunction desc(id, t, k) {}",
    ),
  );
  if (!cat || cat.join(',') !== 'a,b') {
    problems.push(`catalog control expected a,b — got ${cat?.join(',') ?? '(null)'}`);
  }

  // (4) The exemption parser must read KEYS, not values.
  const so = parseStoreOnlyIds(
    "export const STORE_ONLY_PLUGIN_IDS = Object.freeze({ water: 'reason: nope', liftPart: 'x' });",
  );
  if (so.join(',') !== 'water,liftPart') {
    problems.push(`store-only control expected water,liftPart — got ${so.join(',')}`);
  }

  return { ok: problems.length === 0, detail: problems.join('; ') };
}

interface Arm {
  readonly key: string;
  readonly title: string;
  readonly members: string[];
  /** `null` means HARD 0; otherwise the NAMED baseline membership. */
  readonly baseline: readonly string[] | null;
}

function main(): number {
  for (const [what, p] of [
    ['plugins dir', PLUGINS_DIR],
    ['PluginRegistry.ts', REGISTRY_FILE],
    ['PluginHost.ts', HOST_FILE],
  ] as const) {
    if (!fs.existsSync(p)) die(2, `[${LABEL}] MISCONFIGURED: ${what} not found at ${p}`);
  }
  const ctl = controlsFired();
  if (!ctl.ok) die(2, `[${LABEL}] MISCONFIGURED: planted control failed to fire — ${ctl.detail}`);

  // ── DISK ──────────────────────────────────────────────────────────────────
  const disk = fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // ── REGISTRY ──────────────────────────────────────────────────────────────
  const regSrc = stripComments(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  const parsed = parseAllPlugins(regSrc);
  if (!parsed) die(2, `[${LABEL}] MISCONFIGURED: could not locate/parse ALL_PLUGINS in ${REGISTRY_FILE}`);
  const dirs = workspaceDirs();
  const unresolved: string[] = [];
  const resolvedRefs: string[] = [];
  for (const ref of parsed.refs) {
    const r = resolveDescriptorRef(regSrc, ref, dirs);
    if ('error' in r) unresolved.push(r.error);
    else resolvedRefs.push(r.id);
  }
  const registry = [...parsed.literals, ...resolvedRefs].sort();

  const elementIds = parseElementIds(regSrc);
  if (!elementIds) die(2, `[${LABEL}] MISCONFIGURED: could not parse ELEMENT_PLUGIN_IDS`);
  const storeOnly = parseStoreOnlyIds(regSrc);

  // ── CATALOG ───────────────────────────────────────────────────────────────
  const catalog = parseCatalog(stripComments(fs.readFileSync(HOST_FILE, 'utf8')));
  if (!catalog) die(2, `[${LABEL}] MISCONFIGURED: could not locate/parse PLUGIN_CATALOG in ${HOST_FILE}`);

  // ── Honesty floors ────────────────────────────────────────────────────────
  for (const [what, size, floor] of [
    ['plugin directories', disk.length, MIN_DISK],
    ['ALL_PLUGINS ids', registry.length, MIN_REGISTRY],
    ['PLUGIN_CATALOG rows', catalog.length, MIN_CATALOG],
    ['ELEMENT_PLUGIN_IDS rows', elementIds.length, MIN_ELEMENT],
  ] as const) {
    if (size < floor) {
      die(
        2,
        `[${LABEL}] MISCONFIGURED: ${size} ${what} < floor ${floor}\n` +
          '  A parser walking nothing would report a clean sweep of nothing.',
      );
    }
  }

  if (resolvedRefs.length < MIN_AUTHORED_REFS) {
    die(
      2,
      `[${LABEL}] MISCONFIGURED: ${resolvedRefs.length} descriptor reference(s) resolved into a plugin ` +
        `package < floor ${MIN_AUTHORED_REFS}\n` +
        '  Arm H and resolveDescriptorRef() would report a clean hard-0 having examined nothing.\n' +
        '  Either a self-authored descriptor was reverted to an inline literal, or the parser\n' +
        '  stopped recognising the bare-identifier shape. Do NOT lower the floor.',
    );
  }

  const D = new Set(disk);
  const R = new Set(registry);
  const C = new Set(catalog);
  const E = new Set(elementIds);
  const SO = new Set(storeOnly);

  const arms: Arm[] = [
    {
      key: 'A',
      title: 'DISK \\ REGISTRY — on disk, contributes NOTHING at boot',
      members: minus(D, R),
      baseline: BASELINE.diskWithoutRegistry,
    },
    {
      key: 'B',
      title: 'DISK \\ CATALOG — on disk, NOT reported by runtime.plugins.list()',
      members: minus(D, C),
      baseline: BASELINE.diskWithoutCatalog,
    },
    {
      key: 'C',
      title: 'CATALOG \\ DISK — advertised by the runtime, no directory',
      members: minus(C, D),
      baseline: null,
    },
    {
      key: 'D',
      title: 'REGISTRY \\ DISK — booted with no directory (minus declared STORE_ONLY ids)',
      members: minus(
        registry.filter((x) => !SO.has(x)),
        D,
      ),
      baseline: null,
    },
    {
      key: 'E',
      title: '(REGISTRY ∩ DISK) \\ CATALOG — WIRED AT BOOT AND INVISIBLE TO runtime.plugins',
      members: minus(
        registry.filter((x) => D.has(x)),
        C,
      ),
      baseline: BASELINE.registeredButUncatalogued,
    },
    {
      key: 'F',
      title: 'REGISTRY \\ ELEMENT_PLUGIN_IDS — registered, storeKey assertion never iterates it',
      members: minus(R, E),
      baseline: BASELINE.registryWithoutElementList,
    },
    {
      key: 'G',
      title: 'ELEMENT_PLUGIN_IDS \\ REGISTRY — named an element plugin, never registered',
      members: minus(E, R),
      baseline: null,
    },
    {
      key: 'H',
      title: 'UNRESOLVED DESCRIPTOR REFERENCE — the gate could not see a registration',
      members: unresolved,
      baseline: null,
    },
  ];

  console.log(`[${LABEL}] directories on disk (plugins/*)     : ${disk.length}`);
  console.log(
    `[${LABEL}] ALL_PLUGINS ids (store + handlers)  : ${registry.length}` +
      `  (${parsed.literals.length} inline · ${resolvedRefs.length} authored in plugin packages)`,
  );
  console.log(`[${LABEL}] PLUGIN_CATALOG rows (plugins.list()): ${catalog.length}`);
  console.log(`[${LABEL}] ELEMENT_PLUGIN_IDS rows            : ${elementIds.length}`);
  console.log(`[${LABEL}] STORE_ONLY exemptions (derived)    : ${storeOnly.join(', ') || '(none)'}`);
  console.log('');

  let rc = 0;
  for (const arm of arms) {
    const isHard = arm.baseline === null;
    const base = arm.baseline ?? [];
    const baseSet = new Set(base);
    const added = arm.members.filter((m) => !baseSet.has(m));
    const removed = base.filter((m) => !arm.members.includes(m));
    const label = isHard ? 'hard 0' : `baseline ${base.length}`;
    console.log(`[${LABEL}]   ${arm.key} ${arm.title}`);
    console.log(
      `[${LABEL}]     ${arm.members.length}  (${label})` +
        (arm.members.length ? `  →  ${arm.members.join(', ')}` : ''),
    );
    if (isHard && arm.members.length) {
      console.error(`[${LABEL}] [3] ARM ${arm.key} BREACHED — hard 0, found ${arm.members.length}.`);
      rc = 3;
    }
    if (!isHard && added.length) {
      console.error(
        `[${LABEL}] [3] ARM ${arm.key} RATCHET EXCEEDED — NEW member(s) not in the named baseline: ${added.join(', ')}`,
      );
      console.error('      Fix the wiring in the SAME commit. Do NOT add the name to the baseline.');
      rc = 3;
    }
    if (!isHard && removed.length) {
      console.log(
        `[${LABEL}]     ⭐ RATCHET DOWN in this commit: ${removed.join(', ')} — remove from the baseline.`,
      );
    }
  }

  if (rc === 0) {
    console.log(`\n[${LABEL}] OK: all eight set comparisons within their NAMED baselines; hard arms clean.`);
  }
  return rc;
}

process.exit(main());
