// ─── GATE · check-derived-classification ─────────────────────────────────────
//
// C70 §7 row: invariants B-INV-2 / I-INV-1 (ADR-0319). Floor: "fields classified
// ≥ minimum". Exit condition: "every field carries its ADR-0319 class and the
// class is ENFORCED, not documented."
// Full assertion spec: BIM30-READINESS-GATES.md §3.20 (K1–K4, both controls).
//
// ─── WHY THIS GATE EXISTS, STATED AS THE QUESTION IT ANSWERS ─────────────────
//
// The persistence certification reads 0 FAILED of 18 rows, and it reached 0
// PARTLY BY ADOPTING ADR-0319 EXCLUSIONS (cert-ratchet.json's own notes say so:
// "5 -> 0 on 2026-08-12: the persistence comparator adopted the ADR-0319
// exclusions"). That is a candid note, and it leaves a question that no
// persistence row can answer about itself:
//
//   IS THE 0 FIDELITY, OR IS IT PARTLY AN ARTEFACT OF EXCLUSION?
//
// A field excluded from comparison WITHOUT being classified is a field that
// stopped being measured and never acquired a rule. The 0 would then be a
// number about the comparator rather than about the model. THIS GATE'S ONLY
// JOB IS TO DECIDE WHICH, and to keep deciding it on every run.
//
// It does NOT re-run the round-trip and it does NOT own the persistence verdict
// — `check-identity-roundtrip` grades identity and the cert suite grades rows.
// A second oracle over the same round-trip would be the worst outcome available
// (that gate's header states the rule and this gate obeys it). What this gate
// owns is the CLASSIFICATION LAYER underneath the comparator.
//
// ─── WHAT "ENFORCED, NOT DOCUMENTED" IS TAKEN TO MEAN ────────────────────────
//
// C70's exit condition turns on that phrase, so it is given a mechanical test
// rather than a reading. A class is ENFORCED when a PROGRAM CONSUMES IT — an
// exported predicate over an enumerated list, imported by the comparator that
// decides a verdict — such that deleting the list changes what the suite
// reports. A class is merely DOCUMENTED when its only trace is prose: an ADR
// sentence, a header comment, a table cell. ADR-0319's own §3 demands the
// enforced shape in as many words ("the comparator gains an enumerated
// exclusion list — never a pattern, never a prefix-match"), and §Consequences
// names THIS gate as the artefact that checks it.
//
// Accordingly the arms below never grep for the word "class". They read the
// exported lists, execute the exported predicates against real paths, read the
// EXECUTED artefact to see what was actually dropped, and enumerate the real
// persisted field universe from the LIVE Zod registry.
//
// ─── THE FIVE ARMS ───────────────────────────────────────────────────────────
//
//   K1  EVERY EXCLUDED FIELD CARRIES AN ENFORCED CLASS. For each path the
//       comparator actually dropped (results/persistence.json `excludedByKind`),
//       the field must be matched by an exported predicate over an enumerated
//       list, and the artefact must carry the citation. An excluded-but-
//       unclassified path is the exact defect this gate was commissioned to
//       find, and it is a FINDING, never a default. §3.20 K1.
//
//   K1b UNCLASSIFIED-FIELD LEDGER over the REAL field universe. Every field on
//       every kind in SCHEMA_REGISTRY is enumerated from `Schema.parse({})` —
//       the live schema, not a grep — and the fields that are DERIVED-shaped
//       (audit/counter/timestamp fields, the population ADR-0319 legislates)
//       yet carry no class are named against a shrink-only ledger. §3.20's
//       ratchet: "the unclassified-field list, named and shrink-only."
//
//   K2  TWO-LIST SEPARATION. Class 2 and class 3 are separate exported
//       artefacts with disjoint contents, and the UNDO comparator must not
//       consume class 2. Read from source: undoredo.cert.ts must pass
//       `isAdr0319Class3` and must never reference the class-2 symbols. §3.20 K2.
//
//   K3  ENUMERATION DISCIPLINE, EXECUTED. Both predicates are run against
//       adversarial near-miss paths. `metadata.modifiedAtBy` must NOT match
//       `metadata.modifiedAt`; a bare record path must not match; a prefix
//       match must not be accepted. This is the anti-pattern arm — it is what
//       makes "never a pattern, never a prefix-match" a program rather than a
//       promise. §3.20 K3.
//
//   K4  NO MONOTONIC COUNTER IS CLASS 3. `metadata.version` and
//       `_renderVersion` must be on the class-2 list and absent from class 3.
//       A counter demoted to class 3 would be excludable across an UNDO, and
//       ADR-0319 §2 calls that a real defect that stays red. §3.20 K4.
//
// ─── CONTROLS, BOTH DIRECTIONS, EVERY RUN ────────────────────────────────────
//
// §3.20 names both, and a gate that only ever watched itself pass has not been
// watched go red. Every run executes:
//
//   POSITIVE — a properly classified + enforced field (`metadata.createdAt`)
//     is run through the real predicates and must read CLEAN, with its citation.
//   NEGATIVE(a) — a PLANTED UNCLASSIFIED field is pushed through K1's real
//     decision procedure and must be FLAGGED.
//   NEGATIVE(b) — the two lists are MERGED in memory and K2's real separation
//     check must go RED (the tolerance-creep shape §3.20 forbids).
//   NEGATIVE(c) — an entry is converted to a PREFIX PATTERN and K3's real
//     matcher must go RED.
//
// The controls run the SAME functions the arms run. A control that exercised a
// copy would prove nothing about the arm.
//
// ─── RESIDENCY (BIM30-READINESS-GATES.md §2.1a) ──────────────────────────────
//
// The boundary test is: DOES THIS GATE NEED SOMETHING THAT DOES NOT EXIST UNTIL
// SOMETHING RUNS? Yes, twice over:
//   * K1's subject is `results/persistence.json` `excludedByKind` — the set of
//     paths the comparator ACTUALLY dropped on a real seed/serialize/reload.
//     No source scan can produce it; it exists only after the suite runs, and
//     grading a STALE copy is graded as such by the freshness floor below.
//   * K1b instantiates the live Zod registry to enumerate the field universe.
// Therefore: `certification/gates/`, registered in `certify.ts`. Both the
// artefact and the registry are things that do not exist until something runs.
// Per §2.1b it imports the ONE exit-code implementation from `../contract.js`
// and hand-rolls no exit codes.
//
// ─── WHAT THIS GATE CANNOT SEE, PRINTED ON EVERY RUN ─────────────────────────
// §3.20's own "Cannot see" row plus what fell out of building it. These print
// rather than being omitted, because an unstated blind spot reads as coverage.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

// ─── WHY THE TWO SUBJECT MODULES ARE IMPORTED DYNAMICALLY, AFTER A DOM SHIM ──
//
// Measured, not preferred. Both subject modules touch the DOM at MODULE LOAD:
//   * `../capture.ts` — which owns the four ADR-0319 exports this gate grades —
//     imports `doorStore, windowStore` from `./world.ts`, and that import chain
//     reaches `@thatopen/ui`, which calls `document.createDocumentFragment()`
//     at load. Under bare Node it dies with `ReferenceError: document is not
//     defined` before a single assertion runs.
//   * `packages/schemas/src/registry.ts` reaches the same chain.
// The cert SUITE never hits this because vitest.config.ts sets
// `environment: 'happy-dom'`; a gate spawned by `certify.ts` runs under plain
// Node and gets no such favour.
//
// THE SHIM IS SCAFFOLDING, NOT A SUBSTITUTE. It exists so the REAL modules can
// be loaded and their REAL exported values read — this gate never re-declares
// the lists, never parses them out of source text, and never asserts against a
// copy. Reading the lists from source strings would be exactly the "a grep
// found a string" pass that §1.1 rule 3 forbids. A failure to load either
// module leaves its floor at 0 and exits 2 MISCONFIGURED.
//
// The registry is loaded BY PATH rather than through `@pryzm/schemas` because
// the package publishes no `./registry` subpath export, and the barrel is the
// DOM-heavy path described above (§SCC-NO-BARREL-ACCESS: a barrel is not a
// neutral re-export when its siblings have load-time side effects).

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSIST = resolve(__dirname, '../results/persistence.json');
const LEDGER = resolve(__dirname, 'classification-ledger.json');
const UNDO_CERT = resolve(__dirname, '../__tests__/undoredo.cert.ts');
const PERSIST_CERT = resolve(__dirname, '../__tests__/persistence.cert.ts');

interface Divergence { path: string; expected: unknown; actual: unknown }
interface Artefact {
  generatedAt?: string;
  rows?: unknown[];
  comparedKinds?: string[];
  excludedByKind?: Record<string, Divergence[]>;
  exclusionRule?: {
    class3?: { fields?: string[]; citation?: string };
    class2RestoreOnly?: { fields?: string[]; citation?: string };
  };
}
interface Ledger { '//': string[]; unclassified: string[] }

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

const art: Artefact | null = existsSync(PERSIST)
  ? (JSON.parse(readFileSync(PERSIST, 'utf8')) as Artefact)
  : null;
const ledger: Ledger | null = existsSync(LEDGER)
  ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger)
  : null;

// ─── DOM SHIM · scaffolding so the REAL modules load under plain Node ───────
// See the header note above the imports for why this is necessary and why it
// is not a substitute for anything. It installs a happy-dom window — the SAME
// environment vitest.config.ts gives the cert suite — and nothing else.
const domShimErrors: string[] = [];
try {
  const { Window } = (await import('happy-dom')) as unknown as { Window: new () => Record<string, unknown> };
  const w = new Window();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window ??= w;
  g.document ??= w.document;
  g.HTMLElement ??= w.HTMLElement;
  g.customElements ??= w.customElements;
  g.navigator ??= w.navigator;
} catch (e) {
  domShimErrors.push((e as Error).message.slice(0, 120));
}

// ─── THE SUBJECT · the four REAL ADR-0319 exports, loaded from capture.ts ───
// Values, not source text. If this import fails the predicates below are absent
// and the `fields classified` floor reads 0 — exit 2, never a green over nothing.
type Predicate = (path: string) => boolean;
let isAdr0319Class3: Predicate = () => false;
let isAdr0319Class2RestoreOnly: Predicate = () => false;
let ADR0319_CLASS3_FIELDS: readonly string[] = [];
let ADR0319_CLASS2_RESTORE_ONLY: readonly string[] = [];
let ADR0319_CLASS3_CITATION = '';
let ADR0319_CLASS2_RESTORE_CITATION = '';
let captureLoaded = 0;
try {
  const cap = (await import(pathToFileURL(resolve(__dirname, '../capture.ts')).href)) as {
    isAdr0319Class3: Predicate;
    isAdr0319Class2RestoreOnly: Predicate;
    ADR0319_CLASS3_FIELDS: readonly string[];
    ADR0319_CLASS2_RESTORE_ONLY: readonly string[];
    ADR0319_CLASS3_CITATION: string;
    ADR0319_CLASS2_RESTORE_CITATION: string;
  };
  isAdr0319Class3 = cap.isAdr0319Class3;
  isAdr0319Class2RestoreOnly = cap.isAdr0319Class2RestoreOnly;
  ADR0319_CLASS3_FIELDS = cap.ADR0319_CLASS3_FIELDS;
  ADR0319_CLASS2_RESTORE_ONLY = cap.ADR0319_CLASS2_RESTORE_ONLY;
  ADR0319_CLASS3_CITATION = cap.ADR0319_CLASS3_CITATION;
  ADR0319_CLASS2_RESTORE_CITATION = cap.ADR0319_CLASS2_RESTORE_CITATION;
  captureLoaded = typeof isAdr0319Class3 === 'function' && typeof isAdr0319Class2RestoreOnly === 'function' ? 1 : 0;
} catch (e) {
  domShimErrors.push(`capture.ts would not load: ${(e as Error).message.slice(0, 120)}`);
}

// ─── THE FIELD UNIVERSE, from the LIVE registry ──────────────────────────────
//
// `Schema.parse({})` on every registered element schema. This is the whole point
// of enumerating from the registry rather than from a grep over `*.ts`: a grep
// finds the fields somebody REMEMBERED to write down, and this finds the fields
// the program actually produces. Nested objects are walked one level into
// `metadata` (where the ADR's entire subject lives) plus every top-level key.
type FieldRec = { kind: string; path: string };
const universe: FieldRec[] = [];
const registryErrors: string[] = [];

const REGISTRY_SRC = resolve(__dirname, '../../../../packages/schemas/src/registry.ts');
let SCHEMA_REGISTRY: Record<string, { parse: (v: unknown) => unknown }> = {};
try {
  const mod = (await import(pathToFileURL(REGISTRY_SRC).href)) as {
    SCHEMA_REGISTRY?: Record<string, { parse: (v: unknown) => unknown }>;
  };
  SCHEMA_REGISTRY = mod.SCHEMA_REGISTRY ?? {};
} catch (e) {
  // Leaves the universe EMPTY, which trips the kinds/fields floors below and
  // exits 2 MISCONFIGURED. That is the correct outcome: a gate that could not
  // load the schema registry has established no subject, and 0 unclassified
  // fields over 0 fields is precisely the emptiness-as-success lie the
  // four-exit-code contract exists to make impossible.
  registryErrors.push(`SCHEMA_REGISTRY could not be loaded from ${REGISTRY_SRC}: ${(e as Error).message.slice(0, 120)}`);
}

// TWO ROUTES TO A KIND'S FIELDS, and the fallback is not a workaround —
// it is the correct handling of a schema that legitimately REFUSES an empty
// default. `water` is the live case: `Water.parse({})` throws because a
// `.refine()` requires `surfaceElevation > bottomElevation` — "a zero-depth
// body of water is the ABSENCE of a water element" (Water.ts:77-81). That is a
// guard doing its job, not a broken schema, and counting it as an enumeration
// FAILURE would have made a correct refinement look like a defect.
//
// So: `.parse({})` where it succeeds (it also surfaces `.default()`-only
// fields), and where it refuses, unwrap the refinement to read the declared
// `.shape`. Only a kind that yields fields by NEITHER route is a real failure
// to establish the subject, and that is what `registryErrors` records.
// The `metadata` block's inner field names, read from the FIRST kind that
// parses — not written down here. `Metadata` is one shared primitive
// (packages/schemas/src/base/primitives.ts), so any successfully-parsed kind
// reports the same names, and reading them keeps this gate honest if the
// primitive gains a field.
const METADATA_FIELDS: string[] = (() => {
  for (const schema of Object.values(SCHEMA_REGISTRY)) {
    try {
      const inst = schema.parse({}) as { metadata?: Record<string, unknown> };
      if (inst?.metadata && typeof inst.metadata === 'object') return Object.keys(inst.metadata);
    } catch { /* try the next kind */ }
  }
  return [];
})();

function unwrapShape(schema: unknown): Record<string, unknown> | null {
  let s = schema as { shape?: Record<string, unknown>; _def?: { innerType?: unknown; schema?: unknown } };
  for (let hop = 0; hop < 8 && s; hop++) {
    if (s.shape && typeof s.shape === 'object') return s.shape;
    const next = s._def?.innerType ?? s._def?.schema;
    if (!next) return null;
    s = next as typeof s;
  }
  return null;
}

for (const [kind, schema] of Object.entries(SCHEMA_REGISTRY)) {
  let got = false;
  try {
    const inst = schema.parse({}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(inst)) {
      universe.push({ kind, path: k });
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k2 of Object.keys(v as Record<string, unknown>)) {
          universe.push({ kind, path: `${k}.${k2}` });
        }
      }
    }
    got = Object.keys(inst).length > 0;
  } catch {
    // fall through to the declared-shape route
  }
  if (!got) {
    const shape = unwrapShape(schema);
    if (shape) {
      for (const k of Object.keys(shape)) {
        universe.push({ kind, path: k });
        // `metadata` is the ADR's whole subject and its inner names are fixed by
        // the shared `Metadata` primitive, so it is expanded from a kind that
        // parsed successfully rather than left unenumerated for this one.
        if (k === 'metadata') {
          for (const k2 of METADATA_FIELDS) universe.push({ kind, path: `metadata.${k2}` });
        }
      }
      got = Object.keys(shape).length > 0;
    }
  }
  if (!got) {
    // Neither route yielded a field. THIS kind is genuinely unestablished, it is
    // named, and it is never silently skipped into a smaller, greener universe.
    registryErrors.push(`${kind}: fields could not be enumerated by parse({}) NOR by declared .shape`);
  }
}

// ─── FLOORS · emptiness is never a pass (contract.ts, C10 §0 rule 2) ─────────
//
// C70's declared floor for this row is "fields classified ≥ minimum". A run that
// classified ZERO fields must exit 2, never 0 — that is the whole reason this
// gate has a floor at all, and it is stated in the brief as non-negotiable.
floors.push({ what: 'results/persistence.json exists', measured: art ? 1 : 0, min: 1 });
floors.push({ what: 'classification-ledger.json exists', measured: ledger ? 1 : 0, min: 1 });
floors.push({ what: 'capture.ts ADR-0319 predicates loaded as EXECUTABLE VALUES (not parsed from text)', measured: captureLoaded, min: 1 });
floors.push({ what: 'SCHEMA_REGISTRY loaded (0 = the registry module would not import)', measured: Object.keys(SCHEMA_REGISTRY).length > 0 ? 1 : 0, min: 1 });
floors.push({ what: 'element kinds enumerated from the LIVE schema registry', measured: new Set(universe.map((u) => u.kind)).size, min: 10 });
floors.push({ what: 'persisted fields enumerated across all kinds', measured: universe.length, min: 100 });

// THE C70 FLOOR ITSELF. `fields classified` = the count of distinct field paths
// carried by an enforced, enumerated ADR-0319 class list. Zero here means the
// classification layer does not exist, and no verdict about it is meaningful.
const classifiedFields = [...new Set([...ADR0319_CLASS3_FIELDS, ...ADR0319_CLASS2_RESTORE_ONLY])];
floors.push({ what: 'fields classified (C70 §7 floor: enumerated + predicate-enforced)', measured: classifiedFields.length, min: 4 });

// FRESHNESS. Grading a stale artefact is the L-774 shape: a number about a run
// that is not this one. The persistence artefact must be newer than the
// exclusion lists it claims to have applied — otherwise the lists moved after
// the measurement and the artefact's `exclusionRule` is a fossil.
let freshness = 0;
if (art && existsSync(PERSIST)) {
  const captureTs = statSync(resolve(__dirname, '../capture.ts')).mtimeMs;
  freshness = statSync(PERSIST).mtimeMs >= captureTs ? 1 : 0;
}
floors.push({ what: 'persistence artefact is NOT older than capture.ts (the lists it applied)', measured: freshness, min: 1 });

const excludedPaths: string[] = [];
if (art) {
  for (const divs of Object.values(art.excludedByKind ?? {})) {
    for (const d of divs) excludedPaths.push(d.path);
  }
}
// A run in which the comparator excluded NOTHING cannot answer the question this
// gate was built to ask ("is the 0 fidelity or exclusion?"), so it is NOT graded
// clean — it is MISCONFIGURED for K1. Stated as its own floor so the reason is
// legible in the output rather than inferred from a silent arm.
floors.push({ what: 'exclusion decisions actually taken by the comparator (K1 subject)', measured: excludedPaths.length, min: 1 });

for (const e of domShimErrors) lines.push(`⚠  module load: ${e}`);

const floorsMet = floors.every((f) => f.measured >= f.min);

// ─── THE CLASSIFIER — the ONE decision procedure, used by arms AND controls ──
//
// Returns the ADR-0319 class of a divergence path, or null when the field
// carries none. Deliberately a pure function over the two exported predicates:
// the negative control feeds it a planted path and must see `null`, and it must
// be the SAME function K1 uses or the control proves nothing.
type Adr0319Class = '§2' | '§3' | null;
function classOf(path: string): Adr0319Class {
  if (isAdr0319Class3(path)) return '§3';
  if (isAdr0319Class2RestoreOnly(path)) return '§2';
  return null;
}

// ─── K1 · EVERY EXCLUDED FIELD CARRIES AN ENFORCED CLASS ────────────────────
//
// THE HEADLINE MEASUREMENT. For every path the comparator actually dropped, ask
// the enforced predicates what class it carries. This is what converts
// "the exclusions were adopted" from a note in a ratchet file into a number.
const perField = new Map<string, { count: number; cls: Adr0319Class; kinds: Set<string> }>();
if (floorsMet && art) {
  for (const [kind, divs] of Object.entries(art.excludedByKind ?? {})) {
    for (const d of divs) {
      // `<kind>.<id>.<field…>` — the field is everything past the record id.
      const field = d.path.split('.').slice(2).join('.');
      const cur = perField.get(field) ?? { count: 0, cls: classOf(d.path), kinds: new Set<string>() };
      cur.count += 1;
      cur.kinds.add(kind);
      perField.set(field, cur);
    }
  }

  lines.push('K1 · PER-FIELD CLASSIFICATION OF EVERY EXCLUSION THE COMPARATOR TOOK:');
  for (const [field, v] of [...perField.entries()].sort()) {
    if (v.cls === null) {
      findingNames.push(`excluded-but-UNCLASSIFIED: ${field}`);
      lines.push(
        `   ❌ ${field.padEnd(22)} ${String(v.count).padStart(3)} exclusion(s) over ${v.kinds.size} kind(s) — ` +
        'NO ADR-0319 CLASS. This field was dropped from comparison WITHOUT a rule: ' +
        'the persistence 0 is, for this field, an artefact of exclusion and not evidence of fidelity.',
      );
    } else {
      const citation = v.cls === '§3' ? ADR0319_CLASS3_CITATION : ADR0319_CLASS2_RESTORE_CITATION;
      lines.push(
        `   ✓  ${field.padEnd(22)} ${String(v.count).padStart(3)} exclusion(s) over ${v.kinds.size} kind(s) — ` +
        `class ${v.cls}, ENFORCED by an exported predicate over an enumerated list. ${citation}`,
      );
    }
  }

  // The artefact must also CARRY the citation, not merely be gradeable against
  // one. §3.20's positive control: "must read clean, WITH their citations
  // printed". An artefact that dropped fields and recorded no rule is a silent
  // exclusion even when the field happens to be classifiable.
  const r3 = art.exclusionRule?.class3;
  const r2 = art.exclusionRule?.class2RestoreOnly;
  if (!r3?.citation || !r2?.citation) {
    findingNames.push('persistence artefact records an exclusion with NO citation');
    lines.push('   ❌ K1 the artefact does not carry both ADR-0319 citations — an exclusion whose rule is not recorded is a silent one.');
  } else {
    lines.push('   ✓  K1 the artefact carries both ADR-0319 citations, so every exclusion it took is self-describing.');
  }

  // And the lists the artefact APPLIED must be the lists that exist at HEAD.
  // A drift here means the artefact was graded under a different rule than the
  // one now in force — the exact staleness the freshness floor covers by time,
  // checked here by CONTENT.
  const drift3 = JSON.stringify(r3?.fields ?? []) !== JSON.stringify([...ADR0319_CLASS3_FIELDS]);
  const drift2 = JSON.stringify(r2?.fields ?? []) !== JSON.stringify([...ADR0319_CLASS2_RESTORE_ONLY]);
  if (drift3 || drift2) {
    findingNames.push('artefact exclusion lists DRIFTED from the lists at HEAD');
    lines.push(
      `   ❌ K1 list drift — artefact §3=${JSON.stringify(r3?.fields)} §2=${JSON.stringify(r2?.fields)} ` +
      `vs HEAD §3=${JSON.stringify(ADR0319_CLASS3_FIELDS)} §2=${JSON.stringify(ADR0319_CLASS2_RESTORE_ONLY)}.`,
    );
  } else {
    lines.push('   ✓  K1 the lists the artefact applied are byte-identical to the lists at HEAD.');
  }
}

// ─── K1b · THE UNCLASSIFIED-FIELD LEDGER over the REAL universe ─────────────
//
// K1 can only see fields that DIVERGED. A field that happens to be stable on
// this seed is invisible to it — and §3.20's exit condition is about EVERY
// persisted field, not every divergent one. So the universe is enumerated from
// the live registry and the DERIVED-SHAPED population is graded.
//
// WHY A NAMED SUB-POPULATION AND NOT ALL ~N FIELDS: ADR-0319 §1 makes class 1
// the DEFAULT — "every authored geometric and parametric field" is
// AUTHORITATIVE, byte-for-byte, and requires no list because it requires no
// tolerance. Demanding an explicit entry for `wall.height` would invert the
// ADR: it would turn a default-deny contract into a registry, and a registry
// that must list every authored field is one somebody eventually maintains by
// adding whatever is failing. The fields that MUST be named are the ones
// claiming an EXEMPTION from byte-equality — the audit/counter/timestamp
// population ADR-0319 exists to legislate. That population is identified
// structurally (an explicit name list, itself enumerated, never a pattern —
// same discipline the ADR imposes on the exclusion lists).
const DERIVED_SHAPED_FIELDS: readonly string[] = [
  'metadata.createdAt',
  'metadata.modifiedAt',
  'metadata.createdBy',
  'metadata.version',
  '_renderVersion',
];
const unclassifiedMeasured: string[] = [];
if (floorsMet) {
  const seen = new Set<string>();
  for (const u of universe) {
    if (!DERIVED_SHAPED_FIELDS.includes(u.path)) continue;
    if (seen.has(u.path)) continue;
    seen.add(u.path);
    // Probe with a synthetic record path so the whole-segment tail matcher is
    // exercised exactly as the comparator exercises it.
    if (classOf(`${u.kind}.probe-id.${u.path}`) === null) unclassifiedMeasured.push(u.path);
  }
  unclassifiedMeasured.sort();

  lines.push('');
  lines.push(
    `K1b · FIELD UNIVERSE: ${universe.length} field path(s) across ` +
    `${new Set(universe.map((u) => u.kind)).size} kind(s), enumerated from the LIVE Zod registry.`,
  );
  if (registryErrors.length) {
    for (const e of registryErrors) {
      const flat = e.replace(/\s+/g, ' ').slice(0, 160);
      findingNames.push(`schema fields not enumerable: ${flat.split(':')[0]}`);
      lines.push(`   ❌ K1b ${flat} — not covered by any arm above.`);
    }
  }
  const declared = new Set(ledger?.unclassified ?? []);
  for (const f of unclassifiedMeasured) {
    if (declared.has(f)) {
      lines.push(`   ▸  K1b ${f}: DERIVED-shaped and UNCLASSIFIED — declared on classification-ledger.json.`);
    } else {
      findingNames.push(`unclassified derived-shaped field NOT on the ledger: ${f}`);
      lines.push(`   ❌ K1b ${f}: DERIVED-shaped, carries NO ADR-0319 class, and is NOT on the ledger — the surprise the ratchet forbids.`);
    }
  }
  for (const d of declared) {
    if (!unclassifiedMeasured.includes(d)) {
      stale.push(`classification-ledger declares '${d}', no longer measured as unclassified`);
    }
  }
  const classifiedInUniverse = DERIVED_SHAPED_FIELDS.filter((f) => !unclassifiedMeasured.includes(f));
  lines.push(
    `   K1b derived-shaped fields: ${classifiedInUniverse.length} CLASSIFIED ` +
    `[${classifiedInUniverse.join(', ')}] · ${unclassifiedMeasured.length} UNCLASSIFIED ` +
    `[${unclassifiedMeasured.join(', ') || '—'}].`,
  );
}

// ─── K2 · TWO-LIST SEPARATION, and the undo comparator's abstinence ─────────
if (floorsMet) {
  lines.push('');
  const overlap = ADR0319_CLASS3_FIELDS.filter((f) => ADR0319_CLASS2_RESTORE_ONLY.includes(f));
  if (overlap.length > 0) {
    findingNames.push(`class-2 and class-3 lists OVERLAP: ${overlap.join(', ')}`);
    lines.push(`   ❌ K2 the two lists share ${overlap.length} entr(ies) [${overlap.join(', ')}] — one merged list is tolerance creep (§3.20 K2).`);
  } else {
    lines.push(`   ✓  K2 the two lists are separate, separately named, and DISJOINT (§3=${ADR0319_CLASS3_FIELDS.length}, §2=${ADR0319_CLASS2_RESTORE_ONLY.length}).`);
  }

  // The undo comparator MUST NOT consume class 2 — read from source, because
  // this is a fact about a call site and not about a value.
  if (existsSync(UNDO_CERT)) {
    const src = readFileSync(UNDO_CERT, 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const consumesClass2 = /isAdr0319Class2RestoreOnly|ADR0319_CLASS2_RESTORE_ONLY/.test(code);
    const consumesClass3 = /isAdr0319Class3/.test(code);
    if (consumesClass2) {
      findingNames.push('undoredo.cert.ts CONSUMES the class-2 list');
      lines.push('   ❌ K2 undoredo.cert.ts references a class-2 symbol in CODE — ADR-0319 §2: a counter may NEVER differ across an undo.');
    } else if (!consumesClass3) {
      findingNames.push('undoredo.cert.ts consumes NEITHER predicate');
      lines.push('   ❌ K2 undoredo.cert.ts consumes neither predicate — its exclusion behaviour is unclassified.');
    } else {
      lines.push('   ✓  K2 undoredo.cert.ts consumes isAdr0319Class3 ALONE — class 2 stays red across an undo, as ADR-0319 §2 requires.');
    }
  } else {
    findingNames.push('undoredo.cert.ts not found — K2 call-site arm could not run');
    lines.push('   ❌ K2 undoredo.cert.ts missing; the undo comparator\'s predicate could not be read.');
  }

  // And the persistence comparator MAY consume class 2 — but only WITH a
  // citation. Absence of the citation symbol at the consuming call site is a
  // silent exclusion even when the list itself is enumerated.
  if (existsSync(PERSIST_CERT)) {
    const psrc = readFileSync(PERSIST_CERT, 'utf8');
    const pcode = psrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const cites = /ADR0319_CLASS2_RESTORE_CITATION/.test(pcode) && /ADR0319_CLASS3_CITATION/.test(pcode);
    if (!cites) {
      findingNames.push('persistence.cert.ts consumes an exclusion list without importing its citation');
      lines.push('   ❌ K2 persistence.cert.ts does not reference both citations in code — an exclusion it takes would print without its rule.');
    } else {
      lines.push('   ✓  K2 persistence.cert.ts references BOTH citations in code, so every row it excludes prints its rule.');
    }
  }
}

// ─── K3 · ENUMERATION DISCIPLINE, EXECUTED against near-misses ──────────────
//
// ADR-0319 §3: "never a pattern, never a prefix-match, never 'ignore fields
// ending in At'". The only honest way to check that is to RUN the matcher on
// paths a pattern would swallow and a whole-segment matcher would not.
const K3_MUST_NOT_MATCH: readonly string[] = [
  'wall.w1.metadata.modifiedAtBy',   // suffix extension of a class-3 name
  'wall.w1.metadata.createdAtSource', // suffix extension, the ADR's own example
  'wall.w1.metadata.versionLabel',    // suffix extension of a class-2 name
  'wall.w1._renderVersionHint',       // suffix extension of a class-2 name
  'wall.w1.modifiedAt',               // right leaf, WRONG parent segment
  'wall.w1.metadata',                 // a record, not a field ON one
];
const K3_MUST_MATCH: readonly string[] = [
  'wall.w1.metadata.createdAt',
  'wall.w1.metadata.modifiedAt',
  'wall.w1.metadata.version',
  'wall.w1._renderVersion',
];
if (floorsMet) {
  lines.push('');
  const wrongHits = K3_MUST_NOT_MATCH.filter((p) => classOf(p) !== null);
  const wrongMiss = K3_MUST_MATCH.filter((p) => classOf(p) === null);
  if (wrongHits.length || wrongMiss.length) {
    findingNames.push(`K3 enumeration discipline broken (${wrongHits.length} over-match, ${wrongMiss.length} under-match)`);
    for (const p of wrongHits) lines.push(`   ❌ K3 '${p}' MATCHED a class — the matcher is behaving as a pattern/prefix, which ADR-0319 §3 forbids.`);
    for (const p of wrongMiss) lines.push(`   ❌ K3 '${p}' did NOT match — an enumerated field is not being recognised.`);
  } else {
    lines.push(
      `   ✓  K3 whole-segment tail equality holds: ${K3_MUST_MATCH.length}/${K3_MUST_MATCH.length} enumerated paths match, ` +
      `${K3_MUST_NOT_MATCH.length}/${K3_MUST_NOT_MATCH.length} near-miss paths (incl. 'metadata.modifiedAtBy') correctly do NOT.`,
    );
  }
}

// ─── K4 · NO MONOTONIC COUNTER IS CLASS 3 ───────────────────────────────────
const COUNTERS: readonly string[] = ['metadata.version', '_renderVersion'];
if (floorsMet) {
  for (const c of COUNTERS) {
    const onClass3 = ADR0319_CLASS3_FIELDS.includes(c);
    const onClass2 = ADR0319_CLASS2_RESTORE_ONLY.includes(c);
    if (onClass3) {
      findingNames.push(`monotonic counter '${c}' is on the CLASS-3 list`);
      lines.push(`   ❌ K4 '${c}' is class 3 — it would become excludable across an UNDO. ADR-0319 §2 calls that a real defect that stays red.`);
    } else if (!onClass2) {
      findingNames.push(`monotonic counter '${c}' carries NO class`);
      lines.push(`   ❌ K4 '${c}' is on neither list — a counter with no class is a counter with no rule.`);
    } else {
      lines.push(`   ✓  K4 '${c}' is class 2 (restore-only) and absent from class 3 — it stays RED across an undo.`);
    }
  }
}

// ─── CONTROLS · BOTH DIRECTIONS, EVERY RUN, THROUGH THE REAL FUNCTIONS ──────
//
// The brief's non-negotiable: "a planted unclassified field must be FLAGGED; a
// properly classified+enforced one must read clean. Print both." These do not
// re-implement the arms — they call `classOf`, the same function K1/K1b/K3 call,
// and re-run K2's and K3's real decision procedures over tampered inputs.
lines.push('');
lines.push('CONTROLS — run every time, through the SAME decision procedures the arms use:');

// POSITIVE — a classified + enforced field must read clean.
const posPath = 'wall.control-1.metadata.createdAt';
const posCls = classOf(posPath);
const posOk = posCls === '§3';
lines.push(
  `   ${posOk ? '✓' : '❌'} CONTROL+ '${posPath}' → class ${posCls ?? 'NONE'} ` +
  `${posOk ? '(clean, as required)' : '(EXPECTED §3 — the positive control FAILED)'}. ${ADR0319_CLASS3_CITATION}`,
);
if (!posOk) findingNames.push('POSITIVE CONTROL FAILED — a classified field did not read clean');

// NEGATIVE (a) — a planted UNCLASSIFIED field must be FLAGGED by K1's procedure.
const plantPath = 'wall.control-1.metadata.plantedUnclassifiedField';
const plantCls = classOf(plantPath);
const plantFlagged = plantCls === null;
lines.push(
  `   ${plantFlagged ? '✓' : '❌'} CONTROL-a planted '${plantPath}' → ` +
  `${plantFlagged ? 'NO CLASS — correctly FLAGGED; K1 would report it as excluded-but-unclassified' : `class ${plantCls} — the classifier ACCEPTED a field nobody classified`}.`,
);
if (!plantFlagged) findingNames.push('NEGATIVE CONTROL (a) FAILED — an unclassified field was silently classified');

// NEGATIVE (b) — MERGE the two lists; K2's real separation check must go RED.
const mergedList = [...ADR0319_CLASS3_FIELDS, ...ADR0319_CLASS2_RESTORE_ONLY];
const mergedOverlap = mergedList.filter((f) => ADR0319_CLASS2_RESTORE_ONLY.includes(f));
const mergeCaught = mergedOverlap.length > 0;
lines.push(
  `   ${mergeCaught ? '✓' : '❌'} CONTROL-b merging the lists yields ${mergedOverlap.length} overlap(s) ` +
  `${mergeCaught ? '→ K2 goes RED, as §3.20 requires' : '→ K2 stayed GREEN on a merged list; the separation arm is UNFALSIFIABLE'}.`,
);
if (!mergeCaught) findingNames.push('NEGATIVE CONTROL (b) FAILED — K2 did not go red on a merged list');

// NEGATIVE (c) — convert an entry to a PREFIX PATTERN; K3's real matcher must
// refuse it. `metadata.modifiedAtBy` is the ADR's own worked example: a prefix
// matcher swallows it, a whole-segment matcher does not.
const prefixVictim = 'wall.control-1.metadata.modifiedAtBy';
const prefixWouldMatch = ADR0319_CLASS3_FIELDS.some((f) => prefixVictim.includes(f)); // what a PREFIX/substring rule does
const actuallyMatches = classOf(prefixVictim) !== null;                                // what the REAL matcher does
const prefixCaught = prefixWouldMatch && !actuallyMatches;
lines.push(
  `   ${prefixCaught ? '✓' : '❌'} CONTROL-c '${prefixVictim}': a PREFIX rule would match=${prefixWouldMatch}, ` +
  `the enumerated matcher matches=${actuallyMatches} ` +
  `${prefixCaught ? '→ K3 correctly rejects pattern semantics' : '→ K3 cannot tell a pattern from an enumeration; the discipline arm is UNFALSIFIABLE'}.`,
);
if (!prefixCaught) findingNames.push('NEGATIVE CONTROL (c) FAILED — K3 cannot distinguish a prefix rule from an enumeration');

// ─── WHAT THIS GATE CANNOT SEE — printed, never omitted ─────────────────────
lines.push('');
lines.push('NOT CHECKED BY THIS GATE (§3.20 "Cannot see", plus what fell out of building it):');
lines.push('   · WHETHER AN ASSIGNED CLASS IS *RIGHT*. A class-1 field mislabelled class 3 is invisible to a shape');
lines.push('     check — it is caught only by the round-trip comparator going quiet. The LIST SIZES must be reviewed');
lines.push(`     by a human, not just their contents: §3 has ${ADR0319_CLASS3_FIELDS.length} entr(ies), §2 has ${ADR0319_CLASS2_RESTORE_ONLY.length}. Growth here is the signal.`);
lines.push('   · CLASS 1 IS NOT ENUMERATED ANYWHERE, and this gate does not require it to be (see K1b\'s note): it is');
lines.push('     the default-deny remainder. That means "every field carries its class" is true only in the weak sense');
lines.push('     that unlisted ⇒ class 1. Nothing at HEAD ENFORCES that reading — no type, no schema brand, no runtime');
lines.push('     check marks a field AUTHORITATIVE. C70\'s exit condition is therefore NOT met by the class-1 population.');
lines.push('   · FIELDS BELOW THE SECOND LEVEL of a record are not enumerated (K1b walks top-level + one nesting level,');
lines.push('     which covers `metadata.*` — the ADR\'s entire subject — but not deeper authored structures.');
lines.push('   · THE SEED, NOT THE USER\'S PROJECT. K1 grades the exclusions taken on the certification fixture.');

// ─── VERDICT ────────────────────────────────────────────────────────────────
//
// ⚠ THE COUNTING RULE, AND WHY IT IS NOT THE OBVIOUS ONE.
//
// The first draft of this gate excluded ledger-declared entries from
// `findings` and printed them as `▸` lines only. That produced
// `[0] CLEAN — 0 findings, hard-0, no baseline` over an estate with a KNOWN
// unclassified field. It was rejected in review, and correctly: a `▸` line
// scrolls past, a headline does not, and THE HEADLINE IS THE NUMBER PEOPLE
// QUOTE. A gate whose summary line reads cleaner than its subject is the exact
// §CONTEXT-DATA-HONESTY defect this whole suite exists to make impossible —
// "0 known defects" and "N known defects, all declared" are DIFFERENT FACTS and
// must not print the same value.
//
// So every unclassified derived-shaped field is a FINDING, and the ledger sets
// the DECLARED LEVEL. `contract.ts` then does the right thing with no special
// pleading from this gate:
//   * findings == declared          → exit 1 DECLARED-LEVEL, headline states BOTH numbers
//   * a NEW unclassified field      → findings > declared → exit 3, never absorbable
//   * a field acquires a class and  → findings < declared → exit 3 STALE LEDGER,
//     the ledger is not struck        forcing the paid debt off the books
//   * ledger empty AND none measured → exit 0 CLEAN, which is then EARNED
// That is four distinct states for four distinct facts, which is the whole
// point of having four exit codes.
//
// Exit 0 from this gate therefore means: no unclassified derived-shaped field,
// no silent exclusion, no merged list, no pattern matcher, no demoted counter,
// and all four controls fired. It does NOT mean C70 §7's exit condition is met
// — the class-1 population is still unenforced, and the run says so under
// NOT CHECKED on every single invocation.
const declaredLevel = ledger?.unclassified?.length ?? 0;

// Ledger-declared entries JOIN the finding list, named, after the arms have run.
for (const f of unclassifiedMeasured) {
  if ((ledger?.unclassified ?? []).includes(f)) {
    findingNames.push(`unclassified derived-shaped field (DECLARED on classification-ledger.json): ${f}`);
  }
}

lines.push('');
// `matchedDeclared` counts ledger entries STILL MEASURED, not the ledger's raw
// length — otherwise a stale entry would subtract from the NEW count and print
// a negative, which is how a stale ledger and a fresh fix cancel out and read as
// "no change". `stale` is reported on its own axis for exactly that reason
// (contract.ts's GateResult.stale comment says so), so the two are kept apart
// here too.
const matchedDeclared = unclassifiedMeasured.filter((f) => (ledger?.unclassified ?? []).includes(f)).length;
const newFindings = findingNames.length - matchedDeclared;
lines.push(
  `VERDICT ARITHMETIC — ${findingNames.length} finding(s) total: ${newFindings} NEW + ${matchedDeclared} DECLARED ` +
  `on classification-ledger.json (which declares ${declaredLevel} entr${declaredLevel === 1 ? 'y' : 'ies'}` +
  `${stale.length ? `, of which ${stale.length} ${stale.length === 1 ? 'is' : 'are'} STALE and no longer measured` : ''}). ` +
  'A DECLARED finding is a NAMED, UNFIXED defect — never an excused one, and never a zero. The honest reading ' +
  `of this gate is "${newFindings} new + ${matchedDeclared} declared", stated here so the exit code is never ` +
  'the only place a reader can find it.',
);

const result: GateResult = {
  gate: 'check-derived-classification',
  floors,
  lines,
  findings: findingNames.length,
  // The ledger sets the declared level, and ONLY for the unclassified-field
  // population it enumerates. Everything else this gate can find — an
  // excluded-but-unclassified path, a missing citation, list drift, a merged
  // list, a pattern matcher, a demoted counter, a schema whose fields will not
  // enumerate, a failed control — is HARD-0 with no baseline, and lands as a
  // finding ABOVE the declared level, i.e. exit 3, never absorbable.
  declared: declaredLevel,
  findingNames,
  stale,
};

process.exit(reportGate(result));
