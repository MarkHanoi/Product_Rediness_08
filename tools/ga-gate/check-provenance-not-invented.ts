#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-provenance-not-invented.ts
 *
 * C75 §2.1/§2.2/§2.3/§2.5 · BIM30-READINESS-GATES §3.18 — **no code path stamps
 * an origin it did not observe.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * `packages/room-topology/src/roomSnapshotUtils.ts:156`:
 *
 *     detectionMethod: (rawBoundary['detectionMethod'] as any) || 'auto-topology',
 *
 * A snapshot that is MISSING the field loads as if topology had detected the
 * room. `'auto-topology'` is not a neutral placeholder — it is the union member
 * meaning *flood-fill from the wall graph*, the most authoritative origin in the
 * five available. An UNKNOWN origin is silently upgraded to the strongest claim
 * the vocabulary can make, at the one boundary that knows for certain it does
 * not know: a deserialiser reading a snapshot without provenance knows exactly
 * ONE thing — that the snapshot lacks provenance — and that is what it must
 * record.
 *
 * The second known site is a REPAIR path.
 * `RoomDetectionEngine.ts:454` repairs a self-intersecting polygon into "the
 * largest simple ring", `console.debug`s what it did, and `:475` writes the
 * result as `'auto-topology'`. **The console is not the model.** The polygon
 * that ships is not the polygon the tracer found, and nothing downstream — no
 * export, no IFC join, no user — can ever discover that.
 *
 * ─── Preference order, encoded here on purpose (C75 §2.8) ────────────────────
 *     unrepresentable  >  runtime check  >  gate  >  convention
 * A convention is exactly what `roomSnapshotUtils.ts:156` had. This gate is the
 * THIRD-best instrument available and says so: where a branding idiom (the
 * `LandBasis` precedent) can make a wrong provenance impossible to construct,
 * that beats this file. Do not read a green run as the problem being solved at
 * the right level.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  V1  no member of a provenance vocabulary is supplied as a FALLBACK for an
 *      absent input — no `?? '<member>'`, `|| '<member>'`, or defaulted
 *      destructure `= '<member>'`.
 *  V3  a repair/heal/recovery path may not stamp a provenance member while
 *      recording what it did ONLY to the console. Where the substitution cannot
 *      be recorded in the model, the correct behaviour is to REFUSE.
 *  V5  `as any` / `as unknown as` on a line touching a provenance field is a
 *      finding: it defeats the union at exactly the point the union existed to
 *      help.
 *
 *  V2  a value supplied because the model needs one must be INFERRED — never
 *      AUTHORED (it claims a human decided, and a regeneration pass will treat
 *      it as one) and never COMPUTED (it merges §1.2's two halves).
 *  V4  a provenance field added to an existing schema is optional with an
 *      UNKNOWN-with-reason default, never `.default('<member>')` — otherwise the
 *      migration invents provenance for the entire back-catalogue at once.
 *
 * ─── V2/V4 status — IMPLEMENTED 2026-08-12, and NARROWER than they look ──────
 * These were NOT IMPLEMENTED and UNPROVEN until the C75 §1 five-value union
 * landed at `packages/schemas/src/provenance/ValueOrigin.ts`; they had no
 * subject to measure. They are now evaluated, and are scoped to that canonical
 * union ALONE — §2.2 and §2.5 name specific members (`authored`, `inferred`) and
 * a specific UNKNOWN-with-reason record, none of which exist in the 22 legacy
 * vocabularies, so applying them there would be incoherent rather than stricter.
 *
 * ⚠ Read the arm table this gate PRINTS, not this comment: if the union is ever
 * moved or renamed, V2/V4 report NOT EVALUATED with the reason rather than
 * passing silently, and the executed control FAILS if they are skipped inside
 * the synthetic trees. **A clean V2/V4 reading today means the new union is not
 * misused — adoption is still near zero, so it is not evidence about defaults
 * repo-wide.**
 *
 * ─── The vocabulary is DISCOVERED, not hard-coded ────────────────────────────
 * A hard-coded member list rots the day a union gains a member, and rots
 * SILENTLY — the gate keeps passing over a vocabulary it no longer knows. So the
 * members are parsed out of the union declarations themselves, and the discovery
 * carries its own floor: **zero vocabularies discovered is exit 2**, because
 * "no provenance is invented anywhere" over a vocabulary the gate failed to find
 * is not a verdict.
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (C75 §6.2, gates doc §2.2) ─────
 * `selfTest()` drives the same analyser over two synthetic trees:
 *   • PLANTED — a `|| 'observed'` deserialisation default, a repair path that
 *     console-logs and stamps, and an `as any` at a provenance field. All three
 *     arms must fire, or the gate exits 2 as a BLIND COMPARATOR.
 *   • CLEAN — a deserialiser that records UNKNOWN-with-reason, and a repair that
 *     refuses. Must read 0.
 * `SlabFragmentBuilder.ts:706` is the gates doc's real-tree positive control
 * (it refuses rather than substitutes) and is asserted below to be absent from
 * the finding list.
 *
 * ─── Honesty floors (exit 2, NEVER absorbable) ───────────────────────────────
 *   • source files scanned            ≥ 500
 *   • provenance vocabularies found   ≥ 1
 *   • provenance-typed fields found   ≥ 1
 *   • executed controls passed        = 1
 *   • distinct arms proven to fire    ≥ 5   (V1 V2 V3 V4 V5, in the planted tree)
 *
 * ─── What this gate CANNOT see ───────────────────────────────────────────────
 *   • SEMANTIC TRUTH — a path writing OBSERVED while actually computing passes
 *     every arm here. This checks SHAPE, not honesty of authorship;
 *   • runtime provenance — an origin decided by a branch;
 *   • the EXPORT boundary (C75 §5) — UNPROVEN;
 *   • cross-session regeneration — REGENERATED's prior-value chain is not
 *     statically verifiable.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED · 3 exceeded or
 * stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-provenance-not-invented';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/**
 * A type declares a PROVENANCE VOCABULARY when its name says so. Kept as a
 * named rule rather than a member list, because the members are the thing that
 * moves. `RoomDetectionMethod` is the vocabulary that exists at HEAD; the
 * five-value AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED union C75 §1
 * specifies does NOT exist in `packages/schemas` yet, and this discovery will
 * pick it up on the day it lands without an edit here.
 */
const VOCAB_TYPE_NAME = /(Provenance|Origin|DetectionMethod|Derivation|Authorship|SourceKind|DataSource)/i;

/**
 * …and a name alone is not enough. Discovery by name found 20 unions, of which
 * five name something that is NOT an origin — an export FORMAT (`pdf | json`),
 * a rejection CODE, a constraint IDENTIFIER. Excluded by name WITH the reason,
 * per C73 §3.3's exclusion discipline, rather than by silently tightening the
 * pattern until the count looked right.
 */
const NOT_AN_ORIGIN_VOCAB: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:Export)?Format(Schema)?$/i, 'a file format (pdf | json), not an origin'],
  [/Rejection|Error|Failure/i, 'a rejection/error code, not an origin'],
  [/^DerivationConstraint/i, 'a constraint IDENTIFIER (setback.front, maxFAR), not an origin'],
  [/^OverlaySourceKind$/i, 'a raster media kind (pdf | image), not an origin'],
];

/**
 * Field names too generic to carry a provenance claim on their own. `kind`,
 * `reason` and `constraint` appear on thousands of lines that have nothing to do
 * with origin, and anchoring V5 on them turns a truthfulness gate into an
 * `as any` counter — which is `check-cast-count`'s job, done worse.
 */
const TOO_GENERIC_FIELD = /^(kind|reason|type|value|constraint|weakest|weakestField|name|status|mode|format|source)$/i;

/** A repair happened here. */
const REPAIR_MARKER = /\b(repair(?:ed|To)?|sanitis|sanitiz|heal(?:ed)?|recover(?:ed)?|substitut|fell?\s?back|fallback|salvag)/i;
/** …and the ONLY place it was written down. */
const CONSOLE_ONLY = /\bconsole\.(?:debug|warn|log|info|error)\b/;
/** …unless the repair reached the MODEL: a field carrying the reason with it. */
const RECORDED_IN_MODEL = /\b(reason|note|repairNote|provenanceNote|repairedBy|correction|warnings?|diagnostics?)\s*:/;

/**
 * Members that a codebase legitimately uses as *placeholders*. A vocabulary that
 * grows an explicit "we do not know" member makes THAT the right default, and
 * defaulting to it is the fix, not a finding. Excluded by name with the reason.
 */
const UNKNOWN_MEMBERS = new Set(['unknown', 'unspecified', 'none', 'undetermined', 'not-recorded']);

// ─── The named ledger. Checked in BOTH directions. ───────────────────────────
/**
 * Seven entries, not the two the gates doc names. The two known sites were the
 * STARTING POINT, not the census — C75 §6 names `roomSnapshotUtils.ts:156` and
 * the gates doc adds `RoomDetectionEngine.ts:454/475`; generalising the SHAPE
 * (a provenance-typed field defaulted via `??`/`||` on a load or repair path)
 * found five more, in four packages nobody had looked at.
 *
 * They are not equally severe, and the ledger says so rather than flattening
 * them into a number:
 *
 *  ▸ INVENTS A STRONG ORIGIN — an absent input becomes an authoritative claim:
 *      roomSnapshotUtils.ts:156     absent → 'auto-topology'      (detected by topology)
 *      esMurciaAnchoDeCalle.ts:330  absent → 'measured-geometry'  (we MEASURED it)
 *      from-pipeline.ts:225         absent → 'user'               (a person chose it)
 *    These are the C75 §2.2 defect exactly: a default that presents as authored
 *    or observed is indistinguishable from a real decision and exports as one.
 *
 *  ▸ DEFAULTS TO THE WEAKEST MEMBER — 'estimated', 'assumed'. Lesser harm, same
 *    shape, and cheap to fix: give the vocabulary an UNKNOWN member carrying a
 *    reason, and default to that. Kept on the ledger because "the weakest member
 *    is close enough to unknown" is precisely the reasoning that put
 *    'auto-topology' at a deserialisation boundary.
 */
/**
 * ─── 2026-08-12 · C75 Task 3 disposition · 7 → 5 ────────────────────────────
 *
 * TWO ENTRIES LEFT THE LEDGER BECAUSE THE DEFECT IS GONE, not because the
 * finding moved:
 *
 *  ▸ `esMurciaAnchoDeCalle.ts:330` — `widthProvenance?:` defaulting to
 *    `?? 'measured-geometry'` is now a REQUIRED parameter. C75 §2.8's TOP
 *    instrument (unrepresentable, not checked): a caller that has not
 *    established where the street width came from cannot call the function.
 *    Zero behaviour change — all 41 call sites already passed it explicitly.
 *
 *  ▸ `contextBuildingQuery.ts:93` — `?? 'assumed'` removed. The absent case is
 *    now its own named branch AHEAD of the union dispatch, returning
 *    `isUnknown: true`. ⚠ This one was ALREADY honest in its output (the
 *    `'assumed'` branch rendered "Unknown" with a placeholder caveat); what was
 *    wrong is that it was honest only by the COINCIDENCE of `'assumed'` sorting
 *    last. It is now structural.
 *
 * THREE ENTRIES REMAIN, with line numbers re-measured. None is a silent
 * carry-over — each has a stated reason it could not close in this change:
 *
 *  ▸ `roomSnapshotUtils.ts:156` (V1 + V5) and `RoomDetectionEngine.ts:499` (V3)
 *    — C75's OWN canonical violations, and the two the contract names in §7.1
 *    and §7.2. NOT CLOSED HERE: `packages/room-topology/` was outside this
 *    change's territory and under concurrent edit by another agent. The V3 line
 *    moved 475 → 499 from that agent's work, which is exactly the drift a
 *    both-directions ledger is for. These remain the highest-value entries on
 *    the list: the five-value union they need now exists in `packages/schemas`.
 *
 *  ▸ `from-pipeline.ts:268` (was :225) — `opts.origin ?? 'user'` RETAINED, and
 *    the entry stays even though the HARM is closed, because the SHAPE the gate
 *    checks is still present and a ledger that drops an entry the scanner still
 *    finds is a ledger that has started lying. `RegisteredFamily` now carries
 *    `originProvenance`, so a family assembled with no stated origin records
 *    UNKNOWN-with-reason (`producer-not-instrumented`) beside the supplied
 *    `'user'`, and `familyOriginProvenance()` is the single reader that turns
 *    absence into that value. The supplied `'user'` is retained deliberately: it
 *    is the LEAST-privileged member (`registered-family.ts:22` — a `user` family
 *    cannot author across plugin boundaries), so a consumer ignoring the
 *    provenance errs toward refusing. Fully closing the V1 SHAPE needs
 *    `FamilyOrigin` itself to become nullable on the schema, which is a
 *    persisted-enum migration under C05/C47.
 *
 *  ▸ `ZoningRulesEngine.ts:163` (was :129) — `?? 'estimated'` DELIBERATELY
 *    RETAINED. `DerivationEntry.fieldProvenance` (`BuildableEnvelope.ts:118`) is
 *    a required enum with no "not stated" member, and C58 owns that schema —
 *    widening another contract's union was not this change's to make. What
 *    changed is that the supplied value is no longer indistinguishable from a
 *    stated one: `Resolved.provenanceStatedByPack` now records which happened.
 *    The `??` stays on the ledger because the emitted FIELD still cannot say
 *    "unstated"; closing it needs a C58 amendment, not a local edit.
 */
const LEDGER: readonly string[] = [
  "V1::packages/room-topology/src/roomSnapshotUtils.ts:156:detectionMethod defaults to 'auto-topology'",
  'V5::packages/room-topology/src/roomSnapshotUtils.ts:156:as any at `detectionMethod`',
  "V3::packages/room-topology/src/RoomDetectionEngine.ts:499:detectionMethod: 'auto-topology' on a repair path",
  "V1::packages/schemas/src/family-registry/from-pipeline.ts:268:origin defaults to 'user'",
  "V1::packages/site-parcel-data/src/ZoningRulesEngine.ts:163:provenance defaults to 'estimated'",
];

/** The gates doc's real-tree POSITIVE control: it refuses rather than substitutes. */
const POSITIVE_CONTROL_FILE = 'packages/geometry-slab/src/SlabFragmentBuilder.ts';

// ─── Discovery ───────────────────────────────────────────────────────────────

interface Vocabulary { readonly name: string; readonly file: string; readonly members: string[]; readonly excluded?: string }

function exclusionFor(name: string): string | undefined {
  for (const [re, why] of NOT_AN_ORIGIN_VOCAB) if (re.test(name)) return why;
  return undefined;
}

/**
 * Parse string-literal unions and `z.enum([...])`s whose TYPE NAME declares them
 * a provenance vocabulary. Whole-source (comments stripped) because a union
 * routinely spans a dozen lines with a comment per member — which is also why
 * the stripping is not optional: `RoomTypes.ts:101` documents every member in a
 * trailing `//`, and an unstripped parse would harvest the prose.
 */
function discoverVocabularies(root: string, dirs: readonly string[]): Vocabulary[] {
  const out: Vocabulary[] = [];
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      if (!VOCAB_TYPE_NAME.test(src)) continue;
      const clean = stripCommentsToLines(src).join('\n');

      for (const m of clean.matchAll(/\btype\s+([A-Za-z_$][\w$]*)\s*=\s*((?:\s*\|?\s*'[^']*')+)\s*;/g)) {
        if (!VOCAB_TYPE_NAME.test(m[1]!)) continue;
        const members = [...m[2]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!);
        if (members.length > 0) out.push({ name: m[1]!, file: rel, members, excluded: exclusionFor(m[1]!) });
      }
      for (const m of clean.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*z\.enum\(\s*\[([^\]]*)\]/g)) {
        if (!VOCAB_TYPE_NAME.test(m[1]!)) continue;
        const members = [...m[2]!.matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]!);
        if (members.length > 0) out.push({ name: m[1]!, file: rel, members, excluded: exclusionFor(m[1]!) });
      }
    }
  }
  return out;
}

/**
 * Field names whose DECLARED TYPE is one of the discovered vocabularies, plus
 * the property names of a matching zod schema. This is what makes V3/V5 field
 * scoped rather than "any line mentioning a string that looks like an origin".
 */
function discoverFields(root: string, dirs: readonly string[], vocabs: readonly Vocabulary[]): Set<string> {
  const typeNames = new Set(vocabs.filter((v) => !v.excluded).map((v) => v.name.replace(/Schema$/, '')));
  const fields = new Set<string>();
  if (typeNames.size === 0) return fields;
  const alt = [...typeNames].map((t) => t.replace(/[$]/g, '\\$')).join('|');
  const FIELD = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*\\??\\s*:\\s*(?:readonly\\s+)?(?:${alt})\\b`, 'g');
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      if (![...typeNames].some((t) => src.includes(t))) continue;
      for (const m of stripCommentsToLines(src).join('\n').matchAll(FIELD)) {
        const f = m[1]!;
        // ALL-CAPS is a constant, not a record field (`CONSTRAINT_ORDER`).
        if (/^[A-Z0-9_]+$/.test(f)) continue;
        if (TOO_GENERIC_FIELD.test(f)) continue;
        fields.add(f);
      }
    }
  }
  return fields;
}

// ─── The arms ────────────────────────────────────────────────────────────────

interface Finding { readonly arm: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'; readonly key: string; readonly detail: string }

/**
 * ─── The C75 §1 five-value union, once it exists ─────────────────────────────
 *
 * V2 and V4 are scoped to the CANONICAL union only, not to every vocabulary V1
 * and V3 scan. That is deliberate and it is the difference between the two
 * halves of this gate:
 *
 *   • V1/V3/V5 ask a question that is meaningful about ANY origin vocabulary —
 *     "was a member supplied where an input was absent?" — so they scan all 22.
 *   • V2/V4 encode rules that name SPECIFIC members: §2.2 says a default must be
 *     `inferred` and never `authored`; §2.5 says a retrofitted field defaults to
 *     UNKNOWN-with-reason. Neither sentence has a meaning over `RoomDetectionMethod`
 *     or `MurciaWidthProvenance` — those unions have no `authored` member and no
 *     UNKNOWN-with-reason record. Applying them there would not be stricter, it
 *     would be incoherent, and it would produce findings no author could act on.
 *
 * This is why the exitCondition said V2/V4 "need the five-value union to exist in
 * packages/schemas first". They are now evaluated because it does.
 */
const CANONICAL_UNION_FILE = 'packages/schemas/src/provenance/ValueOrigin.ts';
const CANONICAL_UNION_TYPE = 'ValueOriginSchema';
const CANONICAL_MEMBERS = ['authored', 'observed', 'computed', 'inferred', 'regenerated'] as const;
/** The record type that pairs an origin with its UNKNOWN reason (C75 §1.4). */
const CANONICAL_RECORD_TYPE = 'ValueProvenanceSchema';

interface Analysis {
  readonly findings: Finding[];
  readonly filesScanned: number;
  readonly vocabularies: Vocabulary[];
  readonly fields: string[];
  /** Whether V2/V4 found their subject. `false` ⇒ they are NOT EVALUATED, and say so. */
  readonly canonicalUnionPresent: boolean;
  /** Fields typed as the canonical union — V4's subject. */
  readonly canonicalFields: string[];
}

/**
 * Is the C75 §1 five-value union present, and does it carry the §1.4
 * UNKNOWN-with-reason record?
 *
 * ⚠ BOTH halves are required, and requiring both is the point. A union of five
 * strings on its own does not satisfy C75: §1.4 is explicit that unknown is a
 * VALUE with a reason, so a five-member enum with nowhere to put "we do not
 * know" would let V4 pass over a vocabulary that structurally cannot express the
 * thing V4 exists to check. If only half is found, V2/V4 report NOT EVALUATED
 * rather than reading the half they got as coverage.
 */
function findCanonicalUnion(root: string): { present: boolean; why: string } {
  let src: string;
  try { src = readFileSync(join(root, CANONICAL_UNION_FILE.split('/').join(sep)), 'utf8'); }
  catch { return { present: false, why: `${CANONICAL_UNION_FILE} does not exist` }; }
  const clean = stripCommentsToLines(src).join('\n');
  if (!clean.includes(CANONICAL_UNION_TYPE)) {
    return { present: false, why: `${CANONICAL_UNION_FILE} exists but declares no ${CANONICAL_UNION_TYPE}` };
  }
  const missing = CANONICAL_MEMBERS.filter((m) => !new RegExp(`'${m}'`).test(clean));
  if (missing.length > 0) {
    return { present: false, why: `${CANONICAL_UNION_TYPE} is missing member(s): ${missing.join(', ')}` };
  }
  if (!clean.includes(CANONICAL_RECORD_TYPE)) {
    return {
      present: false,
      why: `${CANONICAL_UNION_TYPE} exists but there is no ${CANONICAL_RECORD_TYPE} carrying an ` +
        'UNKNOWN-with-reason record — C75 §1.4 is unrepresentable, so V4 has no subject',
    };
  }
  return { present: true, why: '' };
}

function analyse(root: string, dirs: readonly string[]): Analysis {
  const vocabularies = discoverVocabularies(root, dirs);
  const fields = discoverFields(root, dirs, vocabularies);
  const findings: Finding[] = [];
  const canonical = findCanonicalUnion(root);
  const canonicalFields = new Set<string>();

  const members = new Set<string>();
  for (const v of vocabularies) {
    if (v.excluded) continue;
    for (const m of v.members) if (!UNKNOWN_MEMBERS.has(m.toLowerCase())) members.add(m);
  }
  if (members.size === 0 || fields.size === 0) {
    return {
      findings, filesScanned: 0, vocabularies, fields: [...fields],
      canonicalUnionPresent: canonical.present, canonicalFields: [],
    };
  }

  // ─── V2 / V4 — scoped to the canonical union (see CANONICAL_UNION_FILE) ────
  //
  // V2 (C75 §2.2) — a value supplied because the model needs one is INFERRED,
  //     never AUTHORED and never COMPUTED. So: a fallback (`??`/`||`/destructure
  //     default) that supplies `'authored'` or `'computed'` on a canonical-union
  //     field is a finding. `'inferred'` in the same position is CORRECT and
  //     must not fire — this arm is the one place in the gate where a default IS
  //     the right answer, and reporting it would train authors to remove the
  //     very thing §2.2 asks for.
  //
  // V4 (C75 §2.5) — a provenance field added to an existing schema is optional
  //     with an UNKNOWN-with-reason default. So: a canonical-union field
  //     declared with `.default('<member>')` is a finding — that is §2.5's
  //     "never a member of the five", which is §2.1 wearing a migration.
  const CANON_ALT = CANONICAL_MEMBERS.join('|');
  // §2.2 forbids exactly these two as a supplied default. `observed` is left out
  // deliberately: a deserialiser reading a source of record may legitimately
  // record `observed` for what it just read — V1 already catches the case where
  // that is a FALLBACK for an absent input.
  const V2_FORBIDDEN = /^(authored|computed)$/;
  const V2 = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*[:=][^\\n]*(?:\\?\\?|\\|\\|)\\s*['"](${CANON_ALT})['"]`);
  const V2_DESTRUCTURE = new RegExp(`[{,]\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*['"](${CANON_ALT})['"]`);
  const V4 = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*:[^\\n]*\\.default\\(\\s*['"](${CANON_ALT})['"]\\s*\\)`);
  // A field whose declared type IS the canonical union — V4's precise subject.
  const CANON_FIELD = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\s*\\??\\s*:\\s*(?:readonly\\s+)?(?:ValueOrigin|ValueProvenance)\\b`, 'g');

  const memberAlt = [...members].map((m) => m.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
  const fieldAlt = [...fields].map((f) => f.replace(/[$]/g, '\\$')).join('|');

  // V1 — a union member supplied where an input was ABSENT.
  //
  // BOTH ends are anchored: the provenance FIELD and the union MEMBER, on one
  // line. Anchoring on the member alone was tried first and read 74 findings,
  // most of them `createdBy || 'user'` — `user` is a member of `FamilyOrigin`,
  // `createdBy` is not a provenance field, and an actor id is not an origin. A
  // gate that reports a real defect alongside sixty near-misses gets the whole
  // list dismissed, which is a worse outcome than not reporting.
  const V1_NULLISH = new RegExp(`\\b(${fieldAlt})\\s*[:=][^\\n]*(?:\\?\\?|\\|\\|)\\s*['"](${memberAlt})['"]`);
  // The destructuring-default spelling of the same defect.
  const V1_DESTRUCTURE = new RegExp(`[{,]\\s*(${fieldAlt})\\s*=\\s*['"](${memberAlt})['"]`);
  // V5 — the union defeated at the boundary it was written for.
  //
  // NARROWER FIELD SET than V1, and deliberately so. V1 is corroborated by a
  // MEMBER LITERAL from the vocabulary on the same line; V5 has no such
  // corroboration, so a field named merely `origin` is not enough — in this
  // codebase `origin` is far more often a world/camera origin
  // (`origin = (view as any)?.position`, ViewController.ts:2122, a Vector3) than
  // a provenance record. RECORDED BLIND SPOT: V5 cannot see a cast at a
  // provenance field whose name does not say "provenance".
  const v5Fields = [...fields].filter((f) => /prov/i.test(f) || /detectionmethod/i.test(f));
  const V5 = new RegExp(`\\b(${v5Fields.map((f) => f.replace(/[$]/g, '\\$')).join('|')})\\b[^\\n]*\\bas\\s+(?:any\\b|unknown\\s+as\\b)`);
  // V3 — a provenance stamp on a repair path.
  const STAMP = new RegExp(`\\b(${fieldAlt})\\s*:\\s*['"](${memberAlt})['"]`);

  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;

        const n = V1_NULLISH.exec(l) ?? V1_DESTRUCTURE.exec(l);
        if (n) {
          findings.push({
            arm: 'V1',
            key: `V1::${rel}:${i + 1}:${n[1]} defaults to '${n[2]}'`,
            detail: `${rel}:${i + 1} — '${n[2]}' is supplied as a FALLBACK for an absent \`${n[1]}\`: \`${l.trim()}\`. ` +
              'An absent origin is not this origin. Record UNKNOWN-with-reason; a default that presents as ' +
              'observed is indistinguishable from a real observation and will be exported as one.',
          });
        }

        // V2 / V4 — only meaningful once the canonical union exists.
        if (canonical.present) {
          for (const m of l.matchAll(CANON_FIELD)) canonicalFields.add(m[1]!);

          const v2 = V2.exec(l) ?? V2_DESTRUCTURE.exec(l);
          if (v2 && V2_FORBIDDEN.test(v2[2]!)) {
            findings.push({
              arm: 'V2',
              key: `V2::${rel}:${i + 1}:${v2[1]} defaults to '${v2[2]}'`,
              detail: `${rel}:${i + 1} — '${v2[2]}' is supplied as a DEFAULT for \`${v2[1]}\`: \`${l.trim()}\`. ` +
                'C75 §2.2: a value supplied because the model needs one is INFERRED — plausible, not ' +
                `entailed. '${v2[2]}' claims it was ` +
                (v2[2] === 'authored'
                  ? 'a human decision, which will be exported as one and will survive a regeneration pass that should have overwritten it.'
                  : 'deterministically derived from held inputs, which merges COMPUTED into INFERRED — the exact collapse C75 §1.2 forbids.'),
            });
          }

          const v4 = V4.exec(l);
          if (v4) {
            findings.push({
              arm: 'V4',
              key: `V4::${rel}:${i + 1}:${v4[1]} .default('${v4[2]}')`,
              detail: `${rel}:${i + 1} — a provenance field defaults to the union member '${v4[2]}': ` +
                `\`${l.trim()}\`. C75 §2.5: a new provenance field is optional with an ` +
                'UNKNOWN-with-reason default, NEVER a member of the five. Every record written before ' +
                `the field existed would parse as '${v4[2]}' — a migration that invents provenance for ` +
                'the whole back-catalogue at once. Use `unknownProvenance(reason)`.',
            });
          }
        }

        const v5 = V5.exec(l);
        if (v5) {
          findings.push({
            arm: 'V5',
            key: `V5::${rel}:${i + 1}:as any at \`${v5[1]}\``,
            detail: `${rel}:${i + 1} — a cast defeats the provenance union at exactly the boundary the union ` +
              `existed to police: \`${l.trim()}\``,
          });
        }

        const s = STAMP.exec(l);
        if (s) {
          // Look back over the enclosing region for a repair whose only record
          // is the console. 60 lines is the observed span of the known site
          // (RoomDetectionEngine repairs at :454 and stamps at :475).
          const from = Math.max(0, i - 60);
          const window = lines.slice(from, i);
          const repaired = window.some((w) => REPAIR_MARKER.test(w) && !/^\s*[*/]/.test(w));
          const consoled = window.some((w) => CONSOLE_ONLY.test(w));
          const recorded = window.some((w) => RECORDED_IN_MODEL.test(w)) || RECORDED_IN_MODEL.test(l);
          if (repaired && consoled && !recorded) {
            findings.push({
              arm: 'V3',
              key: `V3::${rel}:${i + 1}:${s[1]}: '${s[2]}' on a repair path`,
              detail: `${rel}:${i + 1} — \`${s[1]}: '${s[2]}'\` is stamped on a path that REPAIRED its input ` +
                `(see lines ${from + 1}–${i}) and recorded the repair only to the console. The console is not ` +
                'the model: write the substitution and its reason into the record, or REFUSE.',
            });
          }
        }
      }
    }
  }
  return {
    findings, filesScanned, vocabularies, fields: [...fields],
    canonicalUnionPresent: canonical.present, canonicalFields: [...canonicalFields],
  };
}

// ─── Executed controls (gates doc §2.2, C75 §6.2) ────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const VOCAB_SRC = [
  "export type ThingProvenance = 'authored' | 'observed' | 'computed' | 'unknown';",
  'export interface Thing { id: string; provenance: ThingProvenance; }',
].join('\n');

/**
 * The CANONICAL union, planted at its real path inside the synthetic tree, so
 * `findCanonicalUnion` resolves and V2/V4 are actually exercised.
 *
 * ⚠ Both synthetic trees get this file. Without it in the CLEAN tree, V2/V4
 * would be skipped there for the wrong reason and their absence of findings
 * would prove nothing — the same "an arm that passes because its subject does
 * not exist is not coverage" trap this gate's header warns about, reproduced
 * inside its own control.
 */
const CANONICAL_SRC = [
  "export const ValueOriginSchema = z.enum(['authored','observed','computed','inferred','regenerated']);",
  'export type ValueOrigin = z.infer<typeof ValueOriginSchema>;',
  'export const ValueProvenanceSchema = z.object({ origin: ValueOriginSchema.nullable() });',
  'export type ValueProvenance = z.infer<typeof ValueProvenanceSchema>;',
].join('\n');

const PLANTED = {
  [CANONICAL_UNION_FILE]: CANONICAL_SRC,
  // V2 — a defaulted value claiming a human decided it (§2.2).
  'packages/p/src/defaults.ts': [
    "import type { ValueProvenance } from '../../schemas/src/provenance/ValueOrigin.js';",
    'export function withDefaults(opts: { origin?: string }): { origin: string } {',
    "  return { origin: opts.origin ?? 'authored' };",
    '}',
  ].join('\n'),
  // V4 — a retrofitted provenance field defaulting to a member of the five (§2.5).
  'packages/p/src/schema.ts': [
    "import { z } from 'zod';",
    'export const RecordSchema = z.object({',
    "  provenance: ValueOriginSchema.default('computed'),",
    '});',
  ].join('\n'),
  'packages/p/src/types.ts': VOCAB_SRC,
  'packages/p/src/load.ts': [
    "import type { Thing, ThingProvenance } from './types.js';",
    'export function deserialise(raw: Record<string, unknown>): Thing {',
    '  return {',
    "    id: String(raw['id']),",
    "    provenance: (raw['provenance'] as any) || 'observed',",   // V1 + V5
    '  };',
    '}',
  ].join('\n'),
  'packages/p/src/repair.ts': [
    "import type { Thing } from './types.js';",
    'export function build(poly: number[]): Thing {',
    '  let p = poly;',
    '  if (p.length < 3) {',
    '    const repaired = salvageRing(p);',
    "    console.warn('[build] repaired degenerate ring');",
    '    p = repaired;',
    '  }',
    "  return { id: 'x', provenance: 'observed' };",              // V3
    '}',
    'function salvageRing(p: number[]) { return p; }',
  ].join('\n'),
};

const CLEAN = {
  [CANONICAL_UNION_FILE]: CANONICAL_SRC,
  // The CORRECT shapes, which must NOT fire:
  //  • a default that is 'inferred' — C75 §2.2 asks for exactly this, and an arm
  //    that flagged it would train authors out of the fix;
  //  • a retrofitted field defaulting to UNKNOWN-with-reason, not to a member.
  'packages/q/src/defaults.ts': [
    'export function withDefaults(opts: { origin?: string }): { origin: string } {',
    "  return { origin: opts.origin ?? 'inferred' };",
    '}',
  ].join('\n'),
  'packages/q/src/schema.ts': [
    "import { z } from 'zod';",
    'export const RecordSchema = z.object({',
    "  provenance: ValueProvenanceSchema.default(() => unknownProvenance('predates-provenance')),",
    '});',
  ].join('\n'),
  'packages/q/src/types.ts': VOCAB_SRC,
  'packages/q/src/load.ts': [
    "import type { Thing } from './types.js';",
    'export function deserialise(raw: Record<string, unknown>): Thing {',
    "  const p = raw['provenance'];",
    '  if (typeof p !== \'string\') {',
    // The only thing a deserialiser knows about a snapshot without provenance.
    "    return { id: String(raw['id']), provenance: 'unknown' };",
    '  }',
    "  return { id: String(raw['id']), provenance: p as never };",
    '}',
  ].join('\n'),
  'packages/q/src/repair.ts': [
    "import type { Thing } from './types.js';",
    'export function build(poly: number[]): Thing {',
    '  if (poly.length < 3) {',
    // Where the substitution cannot be recorded, REFUSE (C75 §2.3).
    "    throw new Error('[build] REFUSED: ring is degenerate and no repair can be recorded');",
    '  }',
    "  return { id: 'x', provenance: 'computed' };",
    '}',
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[]; armsFired: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let armsFired: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), ['packages']);
    const good = analyse(join(base, 'clean'), ['packages']);
    const fired = new Set(bad.findings.map((f) => f.arm));
    armsFired = [...fired].sort();
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...fired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree — records UNKNOWN, and refuses): ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    lines.push(
      `canonical union resolved inside the synthetic trees: planted=${bad.canonicalUnionPresent} clean=${good.canonicalUnionPresent} ` +
      '— both MUST be true, or V2/V4 read clean for the wrong reason',
    );
    if (!bad.canonicalUnionPresent || !good.canonicalUnionPresent) {
      ok = false;
      lines.push('    ✗ BLIND COMPARATOR — V2/V4 were skipped inside the control; their silence proves nothing.');
    }
    for (const arm of ['V1', 'V2', 'V3', 'V4', 'V5']) {
      if (!fired.has(arm as Finding['arm'])) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) { ok = false; lines.push('    ✗ BLIND COMPARATOR — the clean tree was called dirty.'); }
  } catch (e) {
    ok = false; lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (C75 §6.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS);

const lines: string[] = [];
lines.push(`files scanned: ${a.filesScanned} · vocabularies discovered: ${a.vocabularies.length} · provenance-typed fields: ${a.fields.length}`);
for (const v of a.vocabularies) {
  lines.push(v.excluded
    ? `  EXCLUDED  ${v.name} (${v.file}) — ${v.excluded}`
    : `  vocabulary ${v.name} (${v.file}): ${v.members.join(' | ')}`);
}
lines.push(`  fields: ${a.fields.join(', ')}`);

// ─── EVERY ARM'S STATE, PRINTED. Never silence. ──────────────────────────────
//
// C75 §6.2's rule, and the one the epsilon gate's E3 taught the hard way: an arm
// that passes because its subject does not exist is NOT coverage. So each arm
// prints EVALUATED or NOT EVALUATED with the reason, on every run — a reader
// must never have to infer an arm's status from the absence of findings.
const canon = findCanonicalUnion(ROOT);
const armState: ReadonlyArray<readonly [string, boolean, string]> = [
  ['V1', true, 'a union member supplied as a fallback for an absent input'],
  ['V2', canon.present, "§2.2 — a defaulted value claiming 'authored'/'computed' instead of 'inferred'"],
  ['V3', true, 'a provenance stamp on a repair path recorded only to the console'],
  ['V4', canon.present, '§2.5 — a provenance field defaulting to a member of the five'],
  ['V5', true, '`as any` at a provenance boundary'],
];
lines.push('  arms:');
for (const [arm, evaluated, what] of armState) {
  lines.push(evaluated
    ? `    ${arm}  EVALUATED      — ${what}`
    : `    ${arm}  NOT EVALUATED  — ${what}; subject missing: ${canon.why}`);
}
if (canon.present) {
  lines.push(
    `    V2/V4 subject: ${CANONICAL_UNION_TYPE} + ${CANONICAL_RECORD_TYPE} in ${CANONICAL_UNION_FILE} ` +
    `· canonical-union-typed fields found: ${a.canonicalFields.length}` +
    (a.canonicalFields.length > 0 ? ` (${a.canonicalFields.join(', ')})` : ''),
  );
  // ⚠ A live-tree honesty note that the floors cannot express. V2/V4 are
  // EVALUATED — the union exists and the arms ran over 4,500 files — but the
  // union is NEW, so almost nothing is typed with it yet. A clean V2/V4 reading
  // today means "nobody has misused the new union", NOT "provenance defaults are
  // correct repo-wide". The 22 legacy vocabularies remain V1/V3/V5's subject.
  if (a.canonicalFields.length < 2) {
    lines.push(
      '    ⚠ V2/V4 ADOPTION IS NEAR-ZERO — the canonical union exists but few fields use it yet, ' +
      'so a clean V2/V4 reading proves only that the NEW union is not misused. It is NOT evidence ' +
      'that defaults are honest across the 22 legacy vocabularies; that is V1/V3/V5\'s ledger.',
    );
  }
}
lines.push(
  '  STILL UNPROVEN (C75 §6.3, unchanged by this run): semantic truth — a path writing OBSERVED ' +
  'while actually computing passes every arm; runtime provenance decided by a branch; the EXPORT ' +
  'boundary (§5); and cross-session regeneration — §2.7\'s prior-value chain is not statically ' +
  'verifiable, so NOTHING here proves an authored value survives an actual regeneration run.',
);
const posControlHits = a.findings.filter((f) => f.key.includes(POSITIVE_CONTROL_FILE));
lines.push(`  real-tree positive control ${POSITIVE_CONTROL_FILE}: ${posControlHits.length === 0 ? 'clean ✓ (it refuses rather than substitutes)' : `✗ ${posControlHits.length} finding(s) — investigate before trusting this run`}`);
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
  { what: 'source files scanned', measured: a.filesScanned, min: 500 },
  { what: 'provenance vocabularies discovered', measured: a.vocabularies.length, min: 1 },
  { what: 'provenance-typed fields discovered', measured: a.fields.length, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
  // ⚠ NOT a floor on the canonical union's PRESENCE. V2/V4 report NOT EVALUATED
  // when it is missing, which is an honest verdict, not a misconfiguration —
  // making its absence exit 2 would have made this gate unrunnable on every
  // commit before the union landed.
  //
  // What IS floored is that the ARMS THEMSELVES were exercised. The five counted
  // here are the arms that fired inside the PLANTED tree on this run, so the
  // floor fails if an arm silently stops matching — including V2/V4 being skipped
  // because the canonical union moved. A constant would have floored nothing.
  {
    what: 'distinct arms proven to fire against a planted violation',
    measured: control.armsFired.length,
    min: 5,
  },
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
