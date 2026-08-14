#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-provenance-coverage.ts
 *
 * C75 §3 · the per-element-kind provenance coverage RATCHET.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * C75 §0 Finding 2, measured 2026-08-12: **no element kind in `packages/schemas`
 * carried any provenance field at all.** The only element-level provenance in the
 * system (`RoomDetectionMethod`) lived in `packages/room-topology` — outside L0,
 * invisible to the exporters, the renderer and the AI host (C75 §4.d) — and its
 * sibling vocabularies for floors and ceilings in
 * `packages/core-app-model/src/stores`. Meanwhile the site / context / climate /
 * zoning / AI-artefact domains were rich and disciplined (C75 §0 Finding 3). The
 * discipline stopped exactly where the user's own authored model began.
 *
 * ⭐ **Re-measured 2026-08-13 (PV-04): all 27 kinds then known carried the field
 * at L0. Re-measured 2026-08-14 (PV-08): 28 kinds, all covered** — `floor` was
 * added as the 28th, which is what emptied the ledger (see LEDGER below).
 * The sentence above is written in the past tense on purpose — it is the defect
 * this gate was built to measure, not a live reading. The live reading is the
 * gate's own output on every run, and the ledger below carries the history.
 * ⚠ Do not re-freeze a count into this paragraph; the run header prints it.
 * ⚠ Coverage here means the field EXISTS and defaults honestly; it does NOT mean
 * a producer writes a real origin (C75 §6.3.b — a RECORDED BLIND SPOT).
 *
 * ─── The three rules this gate encodes, by section ───────────────────────────
 *  §3.1  Coverage is measured PER ELEMENT KIND, never as a repo-wide
 *        percentage — a percentage lets a large kind's regression hide behind a
 *        small kind's improvement (C69 §7.c). There is deliberately NO summary
 *        percentage anywhere in this file's output.
 *  §3.2  The baseline is a NAMED, SHRINK-ONLY list checked in BOTH directions:
 *        a kind that gains provenance must leave the ledger in the same commit
 *        (else exit 3, STALE), and a kind that loses it must go back on in the
 *        open (else exit 3, RATCHET EXCEEDED). Both directions are the
 *        contract.ts stale/unexpected mechanics — not re-implemented here.
 *  §3.3  The per-kind enumeration is THE GATE'S OUTPUT, not a hand-written
 *        table: kinds are discovered by parsing `defineElement('<kind>', …)`
 *        out of `packages/schemas/src/elements/`, so a new element kind is on
 *        the ledger the day it lands, without an edit here.
 *
 * ─── Classification per kind (each entry carries its class in its name) ──────
 *  covered                 — the kind's schema file references the canonical
 *                            C75 §1 record (`ValueProvenanceSchema` /
 *                            `RetrofittedProvenanceSchema` — the union at
 *                            `packages/schemas/src/provenance/ValueOrigin.ts`,
 *                            which this gate USES and never restates) or
 *                            declares a provenance-named field. Leaves the
 *                            ledger. **All 28 kinds, since PV-08 (2026-08-14).**
 *  outside-schemas-only    — a `<Kind>DetectionMethod` vocabulary exists for
 *                            the kind, but OUTSIDE `packages/schemas` (§4.d).
 *                            Was room and ceiling, then floor; all three are now
 *                            covered at L0. ⚠ The outside vocabularies still
 *                            EXIST (they are printed in the run header
 *                            regardless) — a kind covered at L0 simply stops
 *                            being a C1 finding; retiring the out-of-layer copy
 *                            is C75 §7.1's separate subject, and C4 below is what
 *                            keeps the surviving copies translatable meanwhile.
 *  no-provenance-in-schema — nothing anywhere. **None today.**
 *  no-schema-for-provenance-bearing-kind
 *                          — the INVERSE hole: a `<Kind>DetectionMethod`
 *                            vocabulary exists but there is NO
 *                            `defineElement('<kind>')` at L0 at all. This is
 *                            reported as its own class rather than silently
 *                            dropped, because a kind the L0 layer cannot name
 *                            can never be retrofitted there.
 *                            ⭐ **FLOOR was this class from 2026-08-12 until
 *                            2026-08-14**, when `defineElement('floor')` landed
 *                            (`packages/schemas/src/elements/Floor.ts`) and the
 *                            class emptied. Named in the past tense on purpose:
 *                            the class is live and fires the day another family
 *                            grows a vocabulary without a schema.
 *  vocabulary-member-not-mapped-at-L0
 *                          — C4. The kind has a schema AND a vocabulary, and a
 *                            MEMBER of that vocabulary is not named in the L0
 *                            translation map, so L0 can store the value and
 *                            cannot say which of the five it means. **None
 *                            today: 18 distinct members, all mapped.**
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  C1  per-kind schema coverage — the ledger above. EVALUATED.
 *  C2  outside-schemas discovery — `<Kind>DetectionMethod` vocabularies found
 *      anywhere outside `packages/schemas` and associated to their kind by
 *      normalised name. EVALUATED. Discovery rule stated openly: the
 *      `DetectionMethod` suffix IS the element-family provenance idiom at HEAD
 *      (room/floor/ceiling all use it); a vocabulary spelt differently is a
 *      RECORDED BLIND SPOT of this arm, not silently covered.
 *  C3  retrofit-safety of a COVERED kind — §2.5: a covered kind's provenance
 *      field must be `RetrofittedProvenanceSchema` (or `.default(` a C75
 *      unknown constructor), so pre-provenance snapshots parse unchanged. A
 *      covered kind whose field is bare/required breaks every existing snapshot
 *      (C75 §4.e) and is a FINDING, not coverage. Fires in the planted control,
 *      and since PV-04 (2026-08-13) it is EVALUATED over the live tree too — 27
 *      covered kinds, all retrofit-safe. Before that it was printed as NOT
 *      EVALUATED, never silent (an arm that passes because its subject does not
 *      exist is not coverage).
 *
 *  C4  PV-08 · vocabulary members are TRANSLATABLE at L0 — every string literal a
 *      discovered `<Kind>DetectionMethod` declares must be NAMED in
 *      `packages/schemas/src/provenance/DetectionMethodOrigin.ts`, the L0 map from
 *      legacy member → one of the five. EVALUATED. C1 asks whether L0 can name
 *      the KIND; C4 asks whether L0 can say what the kind's stored origin MEANS —
 *      a field L0 can hold and cannot interpret is C75 §4.d one notch finer, and
 *      it is exactly the state the room family was in until PV-08 (its only
 *      translation lived at **L7**, `apps/editor/.../ElementProvenanceIndex.ts`,
 *      typed `Record<string, …>` so a new member compiled and silently meant
 *      nothing; the floor and ceiling families had no translation at all).
 *
 *      ⚠ **RECORDED BLIND SPOT, stated rather than implied.** C4 checks that the
 *      member literal APPEARS in the map file. It does not — cannot, from a
 *      source scan — prove it is a KEY of the map rather than a mention. What
 *      proves key-ness is the map's own mapped-type annotation
 *      (`{ readonly [K in Members]: ValueProvenance }`), which makes a missing row
 *      and a row for a non-member both compile errors. C4 is the GATE rung of C75
 *      §2.8's ladder standing under a type check that L0 cannot point upward: the
 *      member lists are declared at L0 because a layer may not import from L2/L3,
 *      so only a gate can compare them with the live upstream declarations.
 *
 *      ⚠ C3 is why the 27 adoption sites spell `provenance:
 *      RetrofittedProvenanceSchema` out at each kind instead of spreading a
 *      shared constant. Measured 2026-08-13: a `...elementProvenanceField` spread
 *      is invisible to BOTH the coverage evidence and this arm — all 27 kinds
 *      carried the field while the gate still read 27 uncovered and C3 never
 *      armed. An abstraction the gate cannot see is C75 §4.d in a new place.
 *
 * ─── "Populated on every construction path" (C75 §6 table) ───────────────────
 * C3 is the STATIC half of that sentence: `RetrofittedProvenanceSchema` makes
 * every `parse()` path populate the field with UNKNOWN-with-reason. The DYNAMIC
 * half — a store or committer writing element objects that never pass through
 * the schema — is a RECORDED BLIND SPOT (C75 §6.3.b: runtime provenance is
 * invisible to a source scan). Stated here so a green C3 is never read as
 * proof about non-schema construction paths.
 *
 * ─── Honesty floors (exit 2, NEVER absorbable — C75 §6.1, C70 §5.2) ──────────
 *   • element kinds discovered            ≥ 20   (27 at first run)
 *   • element schema files read           ≥ 25
 *   • repo files scanned for outside vocabularies ≥ 500
 *   • canonical C75 §1 union present      = 1    (this gate has no subject
 *                                                 without the vocabulary it
 *                                                 measures adoption of)
 *   • executed controls passed            = 1
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (C75 §6.2) ─────────────────────
 * `selfTest()` drives the same analyser over two synthetic trees:
 *   • PLANTED — an uncovered kind, a kind covered UNSAFELY (bare required
 *     `ValueProvenanceSchema` → C3 must fire), a kind whose only vocabulary is
 *     outside schemas, and a `DetectionMethod` vocabulary with no schema kind.
 *     All four classes must be measured, or the gate exits 2 as a BLIND
 *     COMPARATOR.
 *   • CLEAN — one kind covered via `RetrofittedProvenanceSchema`. Must read 0
 *     findings, proving the BOTH-DIRECTIONS mechanics: a kind that gains
 *     provenance stops being measured, so a ledger entry for it goes STALE and
 *     forces exit 3 until it is struck in the same commit (§3.2).
 *
 * ─── What this gate CANNOT see (C75 §6.3) ────────────────────────────────────
 *   • non-schema construction paths (above);
 *   • SEMANTIC truth — a provenance field stamped with the wrong member passes
 *     this gate entirely; that is `check-derived-not-authored`'s subject;
 *   • whether a kind SHOULD have provenance — C75 §5: a kind may be argued out
 *     of scope in writing, on this ledger, never by omission.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED · 3 exceeded or
 * stale. 2 and 3 are never absorbable as declared debt (C70 §5.1).
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-provenance-coverage';

/** Where element kinds are DECLARED. §3.3: the enumeration derives from here. */
const ELEMENTS_DIR = 'packages/schemas/src/elements';
/** Where the rest of the repo is searched for outside-schemas vocabularies. */
const OUTSIDE_DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/**
 * The canonical C75 §1 vocabulary this gate measures ADOPTION of. Used, never
 * restated (the members live in the file itself; commit 57f2b539). Presence is
 * a FLOOR: adoption of a vocabulary that does not exist is not a subject.
 */
const CANONICAL_UNION_FILE = 'packages/schemas/src/provenance/ValueOrigin.ts';
const CANONICAL_UNION_TYPE = 'ValueOriginSchema';
/**
 * PV-08 — the L0 file that translates every legacy `<Kind>DetectionMethod` member
 * into one of the five. C4's subject. Its absence is MISCONFIGURED (a floor), not
 * a pass: an arm whose subject does not exist measures nothing.
 */
const L0_ORIGIN_MAP_FILE = 'packages/schemas/src/provenance/DetectionMethodOrigin.ts';
/** The §2.5 retrofit-safe schema — C3's "covered SAFELY" evidence. */
const RETROFIT_SCHEMA = 'RetrofittedProvenanceSchema';
/** The §1.4 constructors whose use in a `.default(` is equally retrofit-safe. */
const UNKNOWN_CONSTRUCTORS = /\b(unknownProvenance|provenancePredatingTheField)\s*\(/;

/**
 * A schema file COVERS its kind when it references the canonical record type,
 * or declares a field with a provenance-claiming name. The names are the three
 * C75 §0 Finding 2 measured as 0 hits, plus the plain field name itself —
 * so the day any of them lands at L0, the kind leaves this ledger.
 */
const COVERAGE_EVIDENCE =
  /\b(ValueProvenanceSchema|RetrofittedProvenanceSchema|ValueOriginSchema)\b|\b(provenance|originDetail|derivationStatus|detectionMethod)\s*\??\s*:/;

/**
 * C2's discovery rule: `<Prefix>DetectionMethod` type/const declarations are
 * the element-family provenance idiom at HEAD (room/floor/ceiling all use it,
 * and C75 §3.3 names exactly that family). A future family that spells its
 * vocabulary differently is this arm's RECORDED BLIND SPOT.
 *
 * ⚠ `<Qualifier><Kind>DetectionMethod` is EXCLUDED — see {@link isDerivedVocab}.
 */
const OUTSIDE_VOCAB_DECL = /\b(?:export\s+)?(?:type|const)\s+([A-Za-z]\w*?)DetectionMethod(?:Schema)?\s*=/g;

/**
 * ⭐ **Measured 2026-08-12, and the gate found it in its own first live run.**
 *
 * `DeterminedRoomDetectionMethod` — a C75 §2.8 `Exclude<>` NARROWING of
 * `RoomDetectionMethod`, added at `RoomTypes.ts` alongside the PV-01 fix so a
 * producer cannot reach the honest-unknown member — matched the rule above,
 * failed to associate to any `defineElement('determinedroom')`, and was
 * reported as a WHOLE ELEMENT FAMILY the schema layer had never heard of.
 *
 * That is a false positive of a specific and predictable kind: the
 * `SystemWritableOrigin` / `KnownLandBasis` idiom this contract *recommends*
 * (C75 §2.8 — make the wrong value unrepresentable) necessarily mints a second
 * type name ending in the same suffix. A gate that punishes the prescribed fix
 * trains authors to remove it, which is the C74 §0 failure mode.
 *
 * So a declaration whose prefix STRICTLY ENDS WITH an already-discovered
 * vocabulary's prefix is a derived narrowing/widening of that vocabulary, not a
 * new family, and is not a C2 subject. `Determined` + `Room` → the `Room`
 * vocabulary. The base vocabulary is still measured on its own.
 *
 * ⚠ RECORDED BLIND SPOT, stated rather than hidden: a genuinely NEW family whose
 * name happens to end in an existing one — a hypothetical `SubRoom` alongside
 * `Room` — is absorbed by this rule and NOT reported. That is a deliberate
 * trade: the alternative (report both) makes the prescribed narrowing idiom
 * un-writable, and a missed family surfaces the moment it gains a
 * `defineElement`, whereas a false orphan blocks the fix it is measuring.
 */
function isDerivedVocab(prefix: string, allPrefixes: readonly string[]): boolean {
  const p = norm(prefix);
  return allPrefixes.some((other) => {
    const o = norm(other);
    return o.length > 0 && o !== p && p.endsWith(o);
  });
}

// ─── Discovery (§3.3 — the enumeration is the gate's OUTPUT) ─────────────────

interface ElementKind { readonly kind: string; readonly file: string }
interface OutsideVocab {
  readonly prefix: string;
  readonly file: string;
  readonly line: number;
  /** The string literals the declaration lists — C4's subject. May be empty. */
  readonly members: readonly string[];
}

/**
 * How far a single vocabulary declaration may span. `RoomDetectionMethod` is 7
 * lines; `z.enum([…])` copies are 7. A cap exists so a malformed declaration
 * cannot make the reader swallow the rest of the file and mint phantom members.
 */
const DECL_SPAN_MAX_LINES = 40;

/**
 * The string literals one vocabulary declaration lists. Reads forward from the
 * declaration to the first `;` — which terminates both spellings in use here,
 * the multi-line `type X = 'a' | 'b';` union and the `z.enum([…]);` copy.
 *
 * Comments are already stripped by the caller, so a member named only in prose
 * cannot be counted as declared.
 */
function readDeclaredMembers(lines: readonly string[], start: number, from: number): string[] {
  let text = (lines[start] ?? '').slice(from);
  for (let i = start; ;) {
    const semi = text.indexOf(';');
    if (semi >= 0) { text = text.slice(0, semi); break; }
    i++;
    if (i >= lines.length || i - start >= DECL_SPAN_MAX_LINES) break;
    text += '\n' + lines[i]!;
  }
  const out: string[] = [];
  for (const q of text.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)) out.push((q[1] ?? q[2])!);
  return [...new Set(out)];
}

function discoverElementKinds(root: string, elementsDir: string): { kinds: ElementKind[]; filesRead: number } {
  const kinds: ElementKind[] = [];
  let filesRead = 0;
  for (const abs of walk(join(root, elementsDir.split('/').join(sep)))) {
    const rel = relPath(root, abs);
    if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.tsx?$/.test(rel)) continue;
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    filesRead++;
    const clean = stripCommentsToLines(src).join('\n');
    for (const m of clean.matchAll(/\bdefineElement\s*(?:<[^>]*>)?\s*\(\s*'([\w-]+)'/g)) {
      kinds.push({ kind: m[1]!, file: rel });
    }
  }
  return { kinds, filesRead };
}

function discoverOutsideVocabularies(root: string, dirs: readonly string[]): { vocabs: OutsideVocab[]; filesScanned: number } {
  const vocabs: OutsideVocab[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      // Vocabularies INSIDE the schema package are C1's subject, not C2's.
      if (rel.startsWith('packages/schemas/')) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      if (!src.includes('DetectionMethod')) continue;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        for (const m of lines[i]!.matchAll(new RegExp(OUTSIDE_VOCAB_DECL.source, 'g'))) {
          vocabs.push({
            prefix: m[1]!,
            file: rel,
            line: i + 1,
            members: readDeclaredMembers(lines, i, m.index ?? 0),
          });
        }
      }
    }
  }
  return { vocabs, filesScanned };
}

/** 'CurtainWall' ↔ 'curtainwall', 'ProjectOrigin' ↔ 'projectOrigin' … */
const norm = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

// ─── Classification ──────────────────────────────────────────────────────────

interface Finding { readonly arm: 'C1' | 'C2' | 'C3' | 'C4'; readonly key: string; readonly detail: string }

interface Analysis {
  readonly findings: Finding[];
  readonly kinds: ElementKind[];
  readonly elementFilesRead: number;
  readonly outsideVocabs: OutsideVocab[];
  readonly outsideFilesScanned: number;
  readonly coveredKinds: string[];
  /** true once at least one covered kind exists — C3's live subject. */
  readonly c3Evaluated: boolean;
  /** Distinct member literals read out of the outside declarations — C4's subject. */
  readonly declaredMembers: number;
  /** Does the L0 translation map exist at all? A floor, not a finding. */
  readonly l0MapPresent: boolean;
}

function analyse(root: string, elementsDir: string, outsideDirs: readonly string[]): Analysis {
  const { kinds, filesRead: elementFilesRead } = discoverElementKinds(root, elementsDir);
  const { vocabs: outsideVocabs, filesScanned: outsideFilesScanned } = discoverOutsideVocabularies(root, outsideDirs);
  const findings: Finding[] = [];
  const coveredKinds: string[] = [];

  const outsideByKind = new Map<string, OutsideVocab>();
  const orphanVocabs: OutsideVocab[] = [];
  const allPrefixes = outsideVocabs.map((v) => v.prefix);
  for (const v of outsideVocabs) {
    const match = kinds.find((k) => norm(k.kind) === norm(v.prefix));
    if (match) {
      if (!outsideByKind.has(match.kind)) outsideByKind.set(match.kind, v);
      continue;
    }
    // A narrowing of an already-discovered vocabulary is not a new family —
    // see isDerivedVocab. Reported in the run header, never as a C2 finding.
    if (isDerivedVocab(v.prefix, allPrefixes)) continue;
    orphanVocabs.push(v);
  }

  // C1 — per-kind coverage, one named entry per uncovered kind (§3.1: no
  // percentage exists anywhere in this gate on purpose).
  const fileCache = new Map<string, string>();
  for (const k of kinds) {
    let clean = fileCache.get(k.file);
    if (clean === undefined) {
      try {
        clean = stripCommentsToLines(readFileSync(join(root, k.file.split('/').join(sep)), 'utf8')).join('\n');
      } catch { clean = ''; }
      fileCache.set(k.file, clean);
    }
    const covered = COVERAGE_EVIDENCE.test(clean);
    if (covered) {
      coveredKinds.push(k.kind);
      // C3 — §2.5: covered is only coverage if pre-provenance snapshots still
      // parse. Retrofit-safe = RetrofittedProvenanceSchema, or a .default(
      // pointed at a C75 unknown constructor. A bare required field is §4.e.
      const retrofitSafe =
        clean.includes(RETROFIT_SCHEMA) ||
        (/\.default\s*\(/.test(clean) && UNKNOWN_CONSTRUCTORS.test(clean));
      if (!retrofitSafe) {
        findings.push({
          arm: 'C3',
          key: `covered-but-not-retrofit-safe::${k.kind}`,
          detail:
            `${k.file} — kind '${k.kind}' declares a provenance field, but not via ${RETROFIT_SCHEMA} ` +
            'or a `.default(unknownProvenance(...))`. C75 §2.5: every new provenance field is optional ' +
            'with an UNKNOWN-with-reason default so existing snapshots parse unchanged — a required ' +
            'field breaks the entire back-catalogue (C75 §4.e) and is not coverage.',
        });
      }
      continue;
    }
    const outside = outsideByKind.get(k.kind);
    if (outside) {
      findings.push({
        arm: 'C1',
        key: `outside-schemas-only::${k.kind}`,
        detail:
          `kind '${k.kind}' (${k.file}) has NO provenance in packages/schemas; its only provenance ` +
          `vocabulary is ${outside.prefix}DetectionMethod at ${outside.file}:${outside.line} — outside L0, ` +
          'invisible to exporters, the renderer and the AI host (C75 §4.d). The fix lands in the schema ' +
          'package (C75 §2.4), as RetrofittedProvenanceSchema (§2.5).',
      });
    } else {
      findings.push({
        arm: 'C1',
        key: `no-provenance-in-schema::${k.kind}`,
        detail:
          `kind '${k.kind}' (${k.file}) carries no provenance field of any sort, anywhere — ` +
          'nothing in its L0 schema, no outside vocabulary. Every value of this kind is ' +
          'indistinguishable from an authored one (C75 §0.1).',
      });
    }
  }

  // C2 — the inverse hole: a provenance-bearing family the schema layer cannot
  // even NAME. One entry per orphan prefix (deduplicated).
  const seenOrphans = new Set<string>();
  for (const v of orphanVocabs) {
    const key = norm(v.prefix);
    if (seenOrphans.has(key)) continue;
    seenOrphans.add(key);
    findings.push({
      arm: 'C2',
      key: `no-schema-for-provenance-bearing-kind::${v.prefix.toLowerCase()}`,
      detail:
        `${v.prefix}DetectionMethod (${v.file}:${v.line}) is an element-family provenance vocabulary, ` +
        `but there is NO defineElement('${v.prefix.toLowerCase()}') in ${ELEMENTS_DIR} at all. A kind ` +
        'the L0 layer cannot name can never carry provenance there — this is the inverse of ' +
        'outside-schemas-only and closes only by the kind gaining a schema (or being argued out of ' +
        'scope IN WRITING on this ledger, per C75 §5).',
    });
  }

  // C4 — PV-08: is every member of every discovered vocabulary NAMED in the L0
  // translation map? A kind whose schema the L0 layer can name is still opaque
  // there if L0 cannot say what its stored `detectionMethod` MEANS.
  let l0Map = '';
  let l0MapPresent = false;
  try {
    l0Map = stripCommentsToLines(
      readFileSync(join(root, L0_ORIGIN_MAP_FILE.split('/').join(sep)), 'utf8'),
    ).join('\n');
    l0MapPresent = true;
  } catch { /* absent — reported through the floor below, never as a silent pass */ }

  const seenMembers = new Set<string>();
  const reportedUnmapped = new Set<string>();
  for (const v of outsideVocabs) {
    for (const member of v.members) {
      seenMembers.add(`${norm(v.prefix)}::${member}`);
      if (!l0MapPresent) continue;
      if (l0Map.includes(`'${member}'`) || l0Map.includes(`"${member}"`)) continue;
      const key = `vocabulary-member-not-mapped-at-L0::${v.prefix.toLowerCase()}::${member}`;
      if (reportedUnmapped.has(key)) continue;
      reportedUnmapped.add(key);
      findings.push({
        arm: 'C4',
        key,
        detail:
          `${v.prefix}DetectionMethod (${v.file}:${v.line}) declares the member '${member}', and ` +
          `${L0_ORIGIN_MAP_FILE} does not name it. The L0 layer can therefore store this value and ` +
          'cannot say which of the five it means (C75 §1.2, PV-08) — an exporter, the renderer and ' +
          'the AI host all read L0 and would see an origin they cannot translate. Add the row; the ' +
          "map's mapped-type key makes a row for a non-member an error in the same edit.",
      });
    }
  }

  return {
    findings, kinds, elementFilesRead, outsideVocabs, outsideFilesScanned,
    coveredKinds, c3Evaluated: coveredKinds.length > 0,
    declaredMembers: seenMembers.size, l0MapPresent,
  };
}

/** The canonical union must exist for adoption to be a subject at all. */
function canonicalUnionPresent(root: string): boolean {
  try {
    return readFileSync(join(root, CANONICAL_UNION_FILE.split('/').join(sep)), 'utf8')
      .includes(CANONICAL_UNION_TYPE);
  } catch { return false; }
}

// ─── The named ledger (§3.2 — shrink-only, checked in BOTH directions) ───────
/**
 * FIRST READING, 2026-08-12 — 28 entries: 27 discovered element kinds, ZERO of
 * them covered, plus the floor family which has provenance but no schema. That
 * ledger landing that large and that red WAS the deliverable: C75 §3.3's
 * measured starting point as gate output rather than contract prose.
 *
 * ⭐ SECOND READING, 2026-08-13 — **28 → 1**. PV-04 retrofitted all 27 element
 * kinds with `provenance: RetrofittedProvenanceSchema` in their own L0 schema
 * (C75 §2.4 / §2.5), so all 27 left the measured set and their rows are struck
 * here in the same commit — the §3.2 both-directions mechanic doing exactly what
 * it exists to do (it forced exit 3 STALE until they were). C3 is EVALUATED over
 * the live tree for the first time and reads clean: every one of the 27 is
 * retrofit-safe, so no existing snapshot breaks (C75 §4.e).
 *
 * ⚠ **What the 27 does and does not mean.** It means the field EXISTS and
 * defaults honestly to `predates-provenance` on every schema construction path.
 * It does NOT mean any producer writes a real origin yet — every kind reads
 * UNKNOWN today, which is honest and empty. Instrumenting the producers is C75
 * §6.3.b's RECORDED BLIND SPOT and no arm here can see it; a green C1 must never
 * be read as "provenance is populated".
 *
 * The site / context / climate / zoning / AI-artefact domains are NOT listed —
 * they are rich (C75 §0 Finding 3) and they are not element kinds; this ledger
 * enumerates only what `defineElement` declares plus the C2 orphans, so it can
 * never be diluted by the domains that were already disciplined.
 *
 * ⭐ THIRD READING, 2026-08-14 (PV-08) — **1 → 0. The ledger is EMPTY.**
 * `floor` was the last entry and the only C2 orphan. It is struck here because
 * the kind gained `packages/schemas/src/elements/Floor.ts` —
 * `defineElement('floor')` with `provenance: RetrofittedProvenanceSchema` — in the
 * same commit, which is the §3.2 both-directions mechanic doing its job again (it
 * forced exit 3 STALE until this line was removed).
 *
 * ─── WHY `floor` WAS NOT ARGUED OUT OF SCOPE (C75 §5, decided IN WRITING) ────
 * C75 §5 permits arguing a kind out of scope on this ledger, never by omission.
 * `floor` was considered for it and the answer is NO — the evidence is that it
 * was already a first-class element everywhere except L0:
 *   • `FloorData extends CoreElement` with `type: 'floor'`, its own `FloorStore`,
 *     tool and commands (`core-app-model/src/stores/FloorTypes.ts`);
 *   • `'floor'` was ALREADY in L0's `ElementType` union and `FloorId = Id<'floor'>`
 *     already existed — the id system admitted floors; only the schema was absent,
 *     which is what made the hole easy to miss for so long;
 *   • it is NOT a duplicate of `slab`: a finish is `IfcCovering{FLOORING}` and
 *     *"structural slabs remain as IfcSlab"* — two IFC classes, two elements;
 *   • its twin `ceiling` — same 5-member vocabulary, mirrored geometry — has
 *     carried `defineElement('ceiling')` all along. The asymmetry was the anomaly;
 *   • `FloorDetectionMethod`'s own members settle it: `ai-generated` (INFERRED)
 *     and `ifc-import` (OBSERVED) are exactly the cases C75 §0.1 says a user must
 *     be able to tell apart from their own work.
 * The full argument, with the C65/C03 boundary it does NOT cross, is at the head
 * of `packages/schemas/src/elements/Floor.ts`.
 *
 * ⚠ **An empty ledger is not "provenance is done".** It means every element kind
 * L0 declares carries the FIELD, retrofit-safely, and every legacy vocabulary
 * member is translatable at L0. It says nothing about whether a producer writes a
 * real origin — every kind still reads `predates-provenance` — which is C75
 * §6.3.b's RECORDED BLIND SPOT and no arm here can see it.
 *
 * A kind that gains a provenance field in its L0 schema stops being measured
 * here and its entry MUST be struck in the same commit, or contract.ts forces
 * exit 3 (STALE). A kind that loses one goes red as RATCHET EXCEEDED. Both
 * directions, mechanically.
 */
const LEDGER: readonly string[] = [];

// ─── Executed controls (C75 §6.2) ────────────────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  // no-provenance-in-schema — nothing anywhere.
  'packages/schemas/src/elements/Widget.ts':
    "export const Widget = defineElement('widget', { span: z.number() });",
  // C3 — covered UNSAFELY: a bare required canonical field breaks old snapshots.
  'packages/schemas/src/elements/Gizmo.ts': [
    "import { ValueProvenanceSchema } from '../provenance/ValueOrigin.js';",
    "export const Gizmo = defineElement('gizmo', {",
    '  provenance: ValueProvenanceSchema,',
    '});',
  ].join('\n'),
  // outside-schemas-only — the room/ceiling shape.
  'packages/schemas/src/elements/Doohickey.ts':
    "export const Doohickey = defineElement('doohickey', { span: z.number() });",
  'packages/other/src/DoohickeyTypes.ts':
    "export type DoohickeyDetectionMethod = 'traced' | 'drawn';",
  // C2 orphan — the shape `floor` had until 2026-08-14: a vocabulary with no
  // schema kind at all. ⚠ Its members are deliberately ABSENT from the planted L0
  // map below, so this file arms C2 and C4 at once.
  'packages/other/src/FloorishTypes.ts':
    "export type FloorishDetectionMethod = 'manual-polygon' | 'from-room';",
  // C4 — the L0 translation map, planted INCOMPLETE: it names 'traced' but not
  // 'drawn', and neither Floorish member. An unmapped member must fire.
  'packages/schemas/src/provenance/DetectionMethodOrigin.ts': [
    "export const MAP = { 'traced': systemProvenance('computed', 'x') };",
  ].join('\n'),
  // ⚠ The C75 §2.8 NARROWING idiom, planted so the isDerivedVocab exclusion is
  // itself controlled. It must NOT be reported as an orphan family (it is the
  // prescribed fix, not a hole) — while `FloorishDetectionMethod` above, a
  // genuinely unassociated vocabulary, MUST still fire. Both assertions run:
  // an exclusion that also swallowed the real orphan would be a blind arm.
  'packages/other/src/DeterminedDoohickeyTypes.ts':
    "export type DeterminedDoohickeyDetectionMethod = 'traced';",
};

const CLEAN = {
  // The correct end state: covered via the §2.5 retrofit-safe schema. Must
  // produce ZERO findings — which is what proves a kind that gains provenance
  // leaves the measured set, so its ledger entry goes stale (§3.2).
  'packages/schemas/src/elements/Gadget.ts': [
    "import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';",
    "export const Gadget = defineElement('gadget', {",
    '  provenance: RetrofittedProvenanceSchema,',
    '});',
  ].join('\n'),
  // …and C4's correct end state beside it: a kind that HAS an outside vocabulary,
  // whose every member is named in the L0 translation map. Present so C4 is
  // controlled in both directions — an arm proven only by firing could be firing
  // on everything.
  'packages/other/src/GadgetTypes.ts':
    "export type GadgetDetectionMethod = 'traced' | 'drawn';",
  'packages/schemas/src/provenance/DetectionMethodOrigin.ts': [
    'export const MAP = {',
    "  'traced': systemProvenance('computed', 'x'),",
    "  'drawn': authoredProvenance('y'),",
    '};',
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), 'packages/schemas/src/elements', ['packages']);
    const good = analyse(join(base, 'clean'), 'packages/schemas/src/elements', ['packages']);

    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s)`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} — ${f.key}`);
    const expect = [
      'no-provenance-in-schema::widget',
      'covered-but-not-retrofit-safe::gizmo',
      'outside-schemas-only::doohickey',
      'no-schema-for-provenance-bearing-kind::floorish',
      // C4 — a declared member the L0 translation map does not name. Both a
      // vocabulary that HAS a schema kind (doohickey) and one that does not
      // (floorish), so the arm is not accidentally scoped to orphans.
      'vocabulary-member-not-mapped-at-L0::doohickey::drawn',
      'vocabulary-member-not-mapped-at-L0::floorish::manual-polygon',
    ];
    for (const key of expect) {
      if (!bad.findings.some((f) => f.key === key)) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — planted class '${key}' was not measured.`);
      }
    }
    // The isDerivedVocab exclusion, controlled in BOTH directions on the same
    // tree: the narrowing must be silent AND the real orphan must still fire
    // (asserted just above). An exclusion proven only by its silence could be
    // swallowing the arm entirely.
    if (bad.findings.some((f) => f.key.includes('determineddoohickey'))) {
      ok = false;
      lines.push(
        "    ✗ FALSE POSITIVE — 'DeterminedDoohickeyDetectionMethod', a C75 §2.8 narrowing of an " +
        'existing vocabulary, was reported as a whole missing element family. A gate that punishes ' +
        'the prescribed unrepresentable-over-checked idiom trains authors to delete it (C74 §0).',
      );
    } else {
      lines.push(
        '    ✓ isDerivedVocab: the planted narrowing is excluded, while the planted TRUE orphan ' +
        "('FloorishDetectionMethod') still fires — the exclusion is scoped, not blanket",
      );
    }
    // C4 in the other direction, on the SAME tree: 'traced' IS named in the
    // planted L0 map and must NOT be reported. An arm that flagged a mapped
    // member would flag every member and prove nothing by firing.
    if (bad.findings.some((f) => f.key.endsWith('::traced'))) {
      ok = false;
      lines.push(
        "    ✗ FALSE POSITIVE — C4 reported 'traced', which the planted L0 map DOES name. The arm " +
        'is firing on presence rather than on absence.',
      );
    } else {
      lines.push(
        "    ✓ C4 is scoped to ABSENCE: the planted mapped member ('traced') is silent while the " +
        "planted unmapped ones ('drawn', 'manual-polygon', 'from-room') all fire",
      );
    }
    if (bad.declaredMembers < 4) {
      ok = false;
      lines.push(
        `    ✗ BLIND COMPARATOR — only ${bad.declaredMembers} member literal(s) were read out of the ` +
        'planted vocabularies; C4 cannot be measuring absence if it is not reading the members.',
      );
    }
    lines.push(`positive control (clean tree — covered via ${RETROFIT_SCHEMA}): ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) { ok = false; lines.push(`    ✗ FALSE POSITIVE — ${f.key}`); }
    if (!good.coveredKinds.includes('gadget')) {
      ok = false;
      lines.push("    ✗ BLIND COMPARATOR — the clean tree's covered kind was not recognised as covered.");
    } else {
      lines.push(
        '    ✓ both-directions mechanics: a covered kind produces NO entry, so a ledger line for it ' +
        'would go STALE and force exit 3 until struck in the same commit (§3.2)',
      );
    }
  } catch (e) {
    ok = false; lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (C75 §6.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, ELEMENTS_DIR, OUTSIDE_DIRS);
const canonPresent = canonicalUnionPresent(ROOT);

const lines: string[] = [];
lines.push(
  `element kinds discovered: ${a.kinds.length} (from defineElement() in ${ELEMENTS_DIR} — §3.3, the ` +
  `enumeration is this gate's output) · element schema files read: ${a.elementFilesRead} · ` +
  `outside-schemas files scanned: ${a.outsideFilesScanned}`,
);
lines.push(`  kinds: ${a.kinds.map((k) => k.kind).join(', ')}`);
lines.push(
  `  covered kinds: ${a.coveredKinds.length === 0 ? 'NONE — C75 §0 Finding 2 still true at this run' : a.coveredKinds.join(', ')}`,
);
lines.push(
  `  outside-schemas vocabularies found: ${a.outsideVocabs.length === 0 ? 'none' : ''}`,
);
for (const v of a.outsideVocabs) {
  lines.push(
    `    ${v.prefix}DetectionMethod — ${v.file}:${v.line} — members: ` +
    `${v.members.length === 0 ? '(none declared inline)' : v.members.join(', ')}`,
  );
}
lines.push(
  `  distinct vocabulary members read: ${a.declaredMembers} · L0 translation map ` +
  `(${L0_ORIGIN_MAP_FILE}): ${a.l0MapPresent ? 'present' : 'ABSENT'}`,
);
lines.push('  arms:');
lines.push('    C1  EVALUATED      — per-kind schema coverage (the ledger; §3.1 forbids any percentage here)');
lines.push('    C2  EVALUATED      — outside-schemas vocabularies, associated to kinds by normalised name');
lines.push(a.c3Evaluated
  ? '    C3  EVALUATED      — §2.5 retrofit-safety of covered kinds'
  : '    C3  NOT EVALUATED over the live tree — zero covered kinds exist, so retrofit-safety has no ' +
    'live subject yet; the arm is proven against the planted control above and arms the day the first ' +
    'kind is covered');
lines.push(a.l0MapPresent
  ? '    C4  EVALUATED      — PV-08: every declared vocabulary member is NAMED in the L0 translation map'
  : '    C4  NOT EVALUATED over the live tree — the L0 translation map is absent, which the floor below ' +
    'reports as MISCONFIGURED rather than as a pass');
lines.push(
  '  NOT MEASURED HERE, stated so silence is never read as coverage: the site/context/climate/zoning/' +
  'AI-artefact domains (rich, C75 §0 Finding 3 — not element kinds, so they can never dilute this ' +
  'ledger); non-schema construction paths (C75 §6.3.b); whether any kind is argued out of scope ' +
  '(C75 §5 — in writing, on this ledger, never by omission).',
);
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
  { what: 'element kinds discovered', measured: a.kinds.length, min: 20 },
  { what: 'element schema files read', measured: a.elementFilesRead, min: 25 },
  { what: 'outside-schemas files scanned', measured: a.outsideFilesScanned, min: 500 },
  { what: `canonical C75 §1 union present (${CANONICAL_UNION_FILE})`, measured: canonPresent ? 1 : 0, min: 1 },
  // PV-08 — C4's two subject floors. The map's absence, or a reader that stops
  // extracting members, would both make the arm silently green.
  { what: `L0 translation map present (${L0_ORIGIN_MAP_FILE})`, measured: a.l0MapPresent ? 1 : 0, min: 1 },
  { what: 'distinct vocabulary members read', measured: a.declaredMembers, min: 10 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings: a.findings.length,
  declared: LEDGER.length,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
