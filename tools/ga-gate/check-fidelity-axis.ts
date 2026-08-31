#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-fidelity-axis.ts
 *
 * §FIDELITY-AXIS (C84 EI-2a · C74/CA-18 · C11 §5.2) — **THE EIGHTH FACT.**
 * Of the fields the L0 element schema AUTHORS, how many reach the builder?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS GATE EXISTS — SEVEN FACTS ARE ALL PRESENCE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 * The element-creation chain is graded on seven facts: authored · dispatchable ·
 * reachable · renders_3d · renders_plan · persists · exports. **Every one of
 * them is a PRESENCE test.** `renders_3d = YES` is true of a mesh that is the
 * wrong colour, the wrong size, missing its voids, and drawn from catalogue
 * defaults.
 *
 * Measured 2026-08-31 (audit/full-stack/2026-08-31/builders/_EIGHT-FACT-ROW.json):
 *
 *     26 drawable L0 element schemas
 *     24 of them DRAW                                     (the seven facts see this)
 *      6 of them DRAW WHAT THE USER AUTHORED              (nothing saw this)
 *     ── the gap: 18 families draw SOMETHING ELSE ────────────────────────────
 *
 * A slab with an authored void and an authored colour renders SOLID in the
 * DEFAULT colour, and counts `renders_3d = YES`. A floor's `materialColor` is
 * substituted with a hardcoded `'#D4C4A8'` (initTools.ts:2491). A
 * catalogue-authored furniture item is silently dropped at initTools.ts:2970.
 * Lighting loses 15 of its 18 authored fields.
 *
 * **Without a gate, that gap reopens the moment a field is added to a schema.**
 * The 2026-08-29 pass wrote the defect down in prose — *"what this number hides
 * is FIDELITY, not presence"* — and prose is not a detector. This file is the
 * detector.
 *
 * ─── THE DEFINITION, TAKEN FROM THE MEASUREMENT AND NOT WEAKENED ────────────
 *
 *   FIDELITY = YES only when EVERY field the L0 element schema authors either
 *   (a) REACHES THE BUILDER, or (b) is EXPLICITLY REFUSED OR ANNOUNCED at
 *   runtime. A field silently defaulted, silently renamed away, or read only by
 *   unreachable code is FIDELITY = NO.
 *
 * ⭐ **(b) IS A LEGITIMATE FIX AND THIS GATE IS BUILT TO ACCEPT IT.** A field
 * that CANNOT be carried — because no legacy target exists — must be REFUSED BY
 * NAME with both numbers (C74/CA-18), never silently dropped. That is what the
 * LEDGER is: a row naming the field, the mechanism, the reason and the
 * user-visible consequence. `curtainWall` already does the runtime half — two
 * per-element `console.warn`s naming field, reason and visible consequence —
 * and it is the honest form of this defect. A ledger row is the STATIC half of
 * the same honesty.
 *
 * ─── WHAT IS DERIVED FROM SOURCE, AND WHY THAT IS LOAD-BEARING ──────────────
 * Requirement 1 of this gate's brief: *derive the authored field set FROM
 * SOURCE, never a hand-written list.* A hand-maintained census is what let nine
 * families ship undispatchable, and it is the same shape as the count/range rot
 * recorded six times in CLAUDE.md. So:
 *
 *   · the AUTHORED set   — brace-matched out of `defineElement('<kind>', { … })`
 *                          in `packages/schemas/src/elements/*.ts`. Add a field
 *                          to a schema and this gate sees it on the next run.
 *   · the CARRIED set    — brace-matched top-level keys of every
 *                          `events.emit('<channel>', { … })` in
 *                          `packages/runtime-composer/src/CommandEventBridge.ts`,
 *                          each attributed to its enclosing `case '<verb>':`.
 *   · the FAMILY BINDING — a `case '<F>.create'` / `'<F>.batch.create'` block is
 *                          bound to the L0 kind whose name normalises to the
 *                          same token (lowercased, non-alphanumerics stripped),
 *                          so `curtain-wall` ↔ `curtainwall` and
 *                          `boundaryLine` ↔ `boundaryline` match without a
 *                          spelling table.
 *
 * Exactly TWO tables are hand-named, and both carry a reason per row, because
 * neither is derivable: `ALIASES` (a rename is a semantic claim — only a human
 * can assert that `boundary` and `polygon` are the same value) and the LEDGER
 * (a tolerated drop is a decision).
 *
 * ─── CARRIED IS AN INTERSECTION, NOT A UNION (this is the whole point) ──────
 * A family usually has TWO or THREE emit sites for one channel: `X.create` and
 * `X.batch.create`, sometimes a third. `beam.create` emits 14 keys including
 * `steelProfileName`, `fireRating` and `loadBearing`; `beam.batch.create` emits
 * 11 and drops all three. A UNION would score beam clean and a batch-created
 * steel beam would still draw as a rectangle. **CARRIED is therefore the
 * INTERSECTION over every primary emit site of the family** — a field is
 * carried only if EVERY path carries it.
 *
 * ─── THE SIX ARMS ──────────────────────────────────────────────────────────
 *  A1  SILENT DROP — an authored L0 field of family F is absent from the
 *      intersection of F's own `<F>.created` emits, and no ledger row names it.
 *      **The ratchet.** New drop with no ledger entry → exit 3.
 *  A2  UNCHANNELLED FAMILY — F has a `<F>.create` case that emits NO channel of
 *      its own family (a compound that fans out to other families' channels).
 *      Every authored field is then carried by nothing that names F. Ledgered
 *      per family, not per field, because the remedy is one decision.
 *  A3  FAN-OUT NARROWING — an emit of channel C raised inside a case belonging
 *      to a DIFFERENT family carries FEWER keys than C's own primary
 *      intersection. This is the lift/pool/balcony defect: the shaft walls lose
 *      `layers`/`systemTypeId`/`curve` that `wall.create` carries. Ledgered per
 *      (host, channel, field).
 *  A4  UNREASONED LEDGER ROW — **hard-0.** A row with a blank `reason`, a blank
 *      `consequence`, or a `kind` outside the closed vocabulary. A blank reason
 *      is how a ledger becomes a rubber stamp.
 *  A5  PAID DEBT MUST LEAVE — a ledger row whose field is now carried, whose
 *      family no longer authors it, or whose family no longer exists. Reported
 *      through `stale`, which forces exit 3: fold it into the finding count and
 *      one fix plus one un-struck row cancel out and read as "no change", which
 *      is precisely how a ratchet stops ratcheting.
 *  A6  UNBOUND FAMILY — an L0 kind with NO `<kind>.create` case in the bridge.
 *      TEN of thirty kinds are in this state (door, window, stair, water,
 *      verticalCirculation, and five containers). Skipping them silently is the
 *      "walked nothing reads as clean" hole in a new place, so each must be
 *      NAMED in the ledger — `not-a-drawable-element` for a container, or
 *      `other-create-verb` naming the verb that actually creates it. That row is
 *      also where this gate records the SPELLING DRIFT the 2026-08-31 pass
 *      measured: `lift.create` commits a `verticalCirculation`.
 *
 * ─── SUBJECT FLOORS (exit 2, NEVER absorbable — C70 §5.1) ───────────────────
 * Requirement 5: *"0 dropped" and "walked nothing" must not read the same.*
 * Both were the same value in seven gates before this engagement fixed them. So
 * a verdict here is illegal until:
 *   · L0 element kinds parsed          ≥ 25
 *   · CEB emit sites parsed            ≥ 40
 *   · families bound to a create case  ≥ 15
 *   · authored fields walked           ≥ 200
 *   · executed controls passed         = 1
 *   · distinct arms proven to fire     ≥ 6
 *
 * ─── EXECUTED CONTROLS, BOTH DIRECTIONS, AT THE LIVE BASELINE ──────────────
 * Requirement 6, and the reason it is written this way: **59 of 99 gates in this
 * repository are blind comparators** — they cannot prove they would fire. This
 * gate runs THREE controls on every invocation:
 *
 *   NEGATIVE (planted tree)  — a synthetic schemas dir + bridge + ledger in
 *       which all six arms are violated. Every arm must fire by name.
 *   PARSER (planted on disk)  — the two brace-matchers, run over a real .ts file
 *       and a real bridge fragment whose answer is known. ⭐ THIS ONE EARNED ITS
 *       KEEP ON ITS FIRST RUN: it caught the naive matcher closing an object
 *       early on a `}` inside a trailing line comment, truncating a four-field
 *       schema to two — a failure whose direction is "this family carries
 *       everything". The fix is `maskSource()`; the measurement's own throwaway
 *       extractor still has the flaw and got the right answer only by luck.
 *   POSITIVE (clean tree)    — the CORRECT shapes: a fully-carried family, a
 *       declared rename, and a reasoned ledger row for a genuine drop. Must
 *       read 0. An arm that flags the fix trains authors to remove it.
 *   NEGATIVE (LIVE BASELINE) — the live repo reading, perturbed by ONE synthetic
 *       authored field on a real family that no ledger row can name. The verdict
 *       on that perturbed reading MUST be exit 3.
 *
 * ⭐ **THE THIRD CONTROL IS WHY RAISING THE CEILING ANNOUNCES ITSELF.** The
 * ceiling is a tolerance of unledgered drops, settable at
 * `PRYZM_FIDELITY_AXIS_CEILING`. Raise it to 1 and the live-baseline plant is
 * ABSORBED — the perturbed verdict falls from 3 to 1, the control cannot fire,
 * `executed controls passed` drops to 0, the floor is unmet, and the gate exits
 * **2 MISCONFIGURED**, which is never absorbable as debt. The forbidden fix
 * cannot be applied quietly: it converts the gate into a self-declared blind
 * comparator. That is the property the brief asked for, and it is proven on
 * every run rather than asserted here.
 *
 * ─── WHAT THIS GATE CANNOT SEE — stated, so silence is never read as coverage ─
 *   ⛔ It measures the CommandEventBridge emit, which is DROP #1. Several
 *      families drop the same field a SECOND time in the `initTools.ts` mirror
 *      (slab loses `materialColor` at the emit AND at the mirror). A field that
 *      passes this gate has reached the event, not the mesh. The executed
 *      read-back that proves the mesh is `check-mirror-reachability.ts` and the
 *      `*ReachesTheMesh.test.ts` family; quote those, not this, for "it renders".
 *   ⛔ It cannot see the LEGACY (non-bus) leg. room, plumbing, annotation,
 *      dimension and grid have a second path this scan does not walk.
 *   ⛔ It cannot see SEMANTIC fidelity. An emit that carries `materialId` and
 *      then hands it to a builder that ignores it passes every arm.
 *   ⛔ It cannot see a RUNTIME refusal. `curtainWall`'s two per-element warnings
 *      are the honest (b) half of the definition and this gate reads them only
 *      as a ledger row, never as source.
 *
 * ─── NOT A RIVAL OF `check-mirror-completeness` ────────────────────────────
 * That gate asks whether a verb writing a plugin DTO store has a bridge `case`
 * AT ALL — channel PRESENCE. This one opens the case it finds and counts the
 * FIELDS inside. Presence and fidelity are the two facts the 2026-08-31
 * measurement had to separate to get from 24 to 6. Neither subsumes the other,
 * and this file adds no second census: it reuses the same
 * `packages/schemas/src/elements` and `CommandEventBridge.ts` subjects.
 *
 * Exit 0 clean · 2 MISCONFIGURED · 3 any unledgered finding or any stale row.
 * 2 and 3 are never absorbable as declared debt (C70 §5.1).
 *
 * Flags: `--write` seeds the ledger from the current reading with blank reasons.
 *        Use it ONCE. A1..A5 stay red until a human writes the reasons, by
 *        design — an auto-filled ledger is a rubber stamp with a timestamp.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { reportGate, verdictOf, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GA_GATE_REPO_ROOT ?? resolve(HERE, '..', '..');
const GATE = 'check-fidelity-axis';
const WRITE = process.argv.includes('--write');

const SCHEMA_DIR_REL = 'packages/schemas/src/elements';
const BRIDGE_REL = 'packages/runtime-composer/src/CommandEventBridge.ts';
const LEDGER_PATH = join(HERE, 'fidelity-axis-ledger.json');

/**
 * ⭐ THE CEILING. A tolerance of UNLEDGERED drops, default 0.
 *
 * It exists so that the live-baseline control can prove the forbidden fix
 * announces itself: raising this DISARMS the plant, the control fails, the
 * `executed controls passed` floor is unmet, and the gate exits 2. See the
 * header block. Nothing in CI sets it; it is a demonstration surface.
 */
const CEILING = Number.parseInt(process.env.PRYZM_FIDELITY_AXIS_CEILING ?? '0', 10) || 0;

/** Envelope keys every emit carries. Not authored fields; never counted as carriage. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  'commandId', 'commandType', 'elementCount', 'wallCount', 'ifcGuid', 'createdBy', 'label', 'mark',
]);

/**
 * The closed `kind` vocabulary. FIVE of the six are the mechanisms the
 * 2026-08-31 measurement found and named (_EIGHT-FACT-ROW.json
 * §FIDELITY_HAS_EXACTLY_FOUR_MECHANISMS); the sixth is the compound fan-out
 * that arm A2 reports. A row outside this vocabulary is arm A4.
 */
const KINDS: ReadonlyArray<{ readonly kind: string; readonly what: string }> = [
  { kind: 'narrow-emit', what: 'the bridge writes a NAMED SUBSET of fields for this channel and the field is not among them; the builder is capable of reading it' },
  { kind: 'dead-channel', what: 'the emit carries three envelope keys and NOTHING subscribes to the channel' },
  { kind: 'rival-vocabulary', what: 'the L0 schema and the shipped renderer describe the family in different languages, and only the unreachable half speaks L0' },
  { kind: 'no-destination', what: 'the legacy record has no field for it, so it is lost even on the path that works — the honest remedy is a NAMED runtime refusal (C74/CA-18), not a mirror row' },
  { kind: 'authorship-metadata', what: 'C75 provenance/confidence: authored at L0, read by NO fragment builder (measured: 0 reads across geometry-slab/wall/roof), and carried on the persistence leg, which is a different axis than this gate measures' },
  { kind: 'compound-fan-out', what: 'the family has no channel of its own: its create case emits OTHER families’ channels for its members' },
  { kind: 'separate-channel', what: 'the field IS carried, on a DIFFERENT named channel of the same family rather than on *.created — `wall.openings` rides `wall.opening.created`' },
  { kind: 'store-read', what: 'the event is DELIBERATELY narrow and the mirror reads the authoritative store instead of trusting the event — the boundaryLine pattern, which the 2026-08-31 measurement singles out as the third option that "costs nothing and loses nothing"' },
  { kind: 'not-a-drawable-element', what: 'the L0 kind is a container or a surface (project, sheet, view, schedule), not a drawable element — outside the measurement’s denominator of 26 by declaration' },
  { kind: 'other-create-verb', what: 'the family IS created, under a verb that does not spell its own name (door/window ride wall.createOpening; lift.create commits verticalCirculation) — a SPELLING DRIFT this gate names rather than hides' },
];
const KIND_SET = new Set(KINDS.map((k) => k.kind));

/**
 * The ONLY hand-named rename table, one row per claim, each carrying the site
 * that DECLARES the rename. A rename is a semantic assertion — that two
 * differently-spelled keys hold the same value — and no scan can make it. Kept
 * deliberately short: every row here is a field this gate stops reporting, so
 * an unreasoned row is a silent hole. `family` is the normalised L0 kind, or
 * `*` where the convention is repo-wide.
 */
const ALIASES: ReadonlyArray<{
  readonly family: string;
  readonly authored: string;
  readonly carriedAs: readonly string[];
  readonly declaredAt: string;
}> = [
  {
    family: '*', authored: 'boundary', carriedAs: ['polygon', 'boundary'],
    declaredAt: 'CommandEventBridge slab.create case comment — L0 Vec3[] `boundary` becomes the plan {x,y}[] `polygon`; the batch case reads `s.polygon ?? s.boundary`. Same convention in the floor case.',
  },
  {
    family: 'beam', authored: 'baseLine', carriedAs: ['startPoint', 'endPoint'],
    declaredAt: 'initTools.ts §FT2 comment :2472 — "BeamData uses startPoint/endPoint (3D Vec3) matching BeamPlanToolHandler dispatch".',
  },
  {
    family: '*', authored: 'origin', carriedAs: ['origin', 'position'],
    declaredAt: 'the column/lighting/plumbing/structural cases emit `origin` verbatim; the slab and furniture legacy records spell the same value `position`.',
  },
  {
    family: 'water', authored: 'materialColor', carriedAs: ['color'],
    declaredAt: 'the water.created emit carries `color`/`opacity` as the water body’s appearance, which is what WaterMeshBuilder reads; `waterColor` on Pool is the same value one level up.',
  },
];

// ─── The subject: L0 authored fields ─────────────────────────────────────────

interface Kind { readonly kind: string; readonly file: string; readonly fields: readonly string[] }

/**
 * Blank out comments and string interiors, PRESERVING LENGTH and newlines, so
 * every offset into the mask is the same offset into the original.
 *
 * ⭐ This exists because the gate's own parser control caught the naive version
 * failing: a `}` inside a trailing line comment —
 *
 *     boundary: z.array(Vec3).min(3),   // a comment ending in a '}'
 *
 * — closed the `defineElement({ … })` object early and the field list silently
 * truncated to TWO of four. The measurement's throwaway extractor had the same
 * flaw and got the right answer only because no live schema happens to contain
 * that shape. A truncated field list reads as "this family carries everything",
 * which is precisely the direction a fidelity gate must never fail in.
 */
function maskSource(src: string): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && n === '*') {
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
      blank(i, Math.min(j + 2, src.length)); i = j + 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        if (c !== '`' && src[j] === '\n') break;   // an unterminated quote: stop at the line end
        j++;
      }
      blank(i + 1, j); i = j + 1; continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * Split a brace-balanced object body into its TOP-LEVEL `key:` names.
 * `body` must already be MASKED (see maskSource) — identifiers survive masking,
 * so the key regex reads the mask directly.
 */
function topLevelKeys(mask: string, orig: string): string[] {
  // depth and comma boundaries come from the MASK; the key NAME is read from
  // the ORIGINAL, so a quoted key (`'curtain-wall': …`) keeps its text.
  const ranges: Array<[number, number]> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i]!;
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { ranges.push([start, i]); start = i + 1; }
  }
  ranges.push([start, mask.length]);
  const keys: string[] = [];
  for (const [a, b] of ranges) {
    const t = orig.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').trim();
    if (!t) continue;
    const m = /^([A-Za-z_$][\w$]*|'[^']+')\s*:/.exec(t);
    if (m) { keys.push(m[1]!.replace(/'/g, '')); continue; }
    if (/^[A-Za-z_$][\w$]*$/.test(t)) { keys.push(t); continue; }
    // a spread or a computed key: named so it is visible, never silently dropped
    if (/^\.\.\./.test(t)) keys.push('...spread');
  }
  return keys;
}

/** Brace-match forward from the `{` at or after `from`; return [bodyStart, bodyEnd). */
function matchBraces(src: string, from: number): [number, number] | null {
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [open + 1, i]; }
  }
  return null;
}

function readKinds(schemaDir: string, listFiles: (d: string) => string[]): Kind[] {
  const out: Kind[] = [];
  for (const f of listFiles(schemaDir)) {
    if (!f.endsWith('.ts') || f.endsWith('index.ts')) continue;
    let src: string;
    try { src = readFileSync(join(schemaDir, f), 'utf8'); } catch { continue; }
    const mask = maskSource(src);
    const re = /defineElement\(\s*'([^']+)'\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // brace-match on the MASK so a `}` in a comment or a string cannot close
      // the object early — the defect the parser control caught.
      const span = matchBraces(mask, m.index + m[0].length - 1);
      if (!span) continue;
      out.push({
        kind: m[1]!,
        file: `${SCHEMA_DIR_REL}/${f}`,
        fields: topLevelKeys(mask.slice(span[0], span[1]), src.slice(span[0], span[1])),
      });
    }
  }
  return out;
}

// ─── The subject: CommandEventBridge emits ───────────────────────────────────

interface Emit {
  readonly channel: string;
  readonly line: number;
  /**
   * EVERY label of the enclosing `case` GROUP. A stacked fall-through —
   * `case 'boundaryLine.create': case 'boundaryLine.update': …` — labels ONE
   * block with five verbs; keeping only the last would have hidden
   * `boundaryLine` from this gate entirely, because only the FIRST label ends
   * in `.create`.
   */
  readonly enclosingCases: readonly string[];
  readonly keys: readonly string[];
}

/**
 * The FAMILY a `case` label belongs to. `wall.batch.create` and `wall.create`
 * are both the `wall` family; `wall.opening.create` is the `wall.opening`
 * family; `boundaryLine.move` is `boundaryLine`.
 */
const caseFamilyOf = (c: string): string => c.replace(/\.batch\.create$/, '').replace(/\.[^.]+$/, '');
/** The FAMILY a channel belongs to: `slab.created` -> `slab`, `wall.opening.created` -> `wall.opening`. */
const channelFamilyOf = (ch: string): string => ch.replace(/\.[^.]+$/, '');

function readEmits(bridgeSrc: string): Emit[] {
  const lines = bridgeSrc.split('\n');
  const caseAt: string[][] = [];
  let group: string[] = [];
  let stacking = false;   // true while we have seen ONLY case labels since the group opened
  const out: Emit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const cm = /^\s*case\s+'([^']+)'\s*:/.exec(raw);
    if (cm) {
      if (!stacking) group = [];
      group.push(cm[1]!);
      stacking = true;
    } else {
      const t = raw.trim();
      if (t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) {
        if (/^default\s*:/.test(t)) { group = []; stacking = false; }
        else if (t !== '{' && t !== '}') stacking = false;
      }
    }
    caseAt[i] = group;
  }
  const mask = maskSource(bridgeSrc);
  const maskLines = mask.split('\n');
  const re = /events\.emit\(\s*'([^']+)'\s*,\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const flatFrom = lines.slice(i).join('\n');
    const maskFrom = maskLines.slice(i).join('\n');
    // brace-match on the MASK, for the same reason readKinds does.
    const span = matchBraces(maskFrom, m.index + m[0].length - 1);
    if (!span) continue;
    out.push({
      channel: m[1]!,
      line: i + 1,
      enclosingCases: caseAt[i] ?? [],
      keys: topLevelKeys(maskFrom.slice(span[0], span[1]), flatFrom.slice(span[0], span[1])),
    });
  }
  return out;
}

/**
 * EVERY `case '<verb>':` label in the bridge — not only those containing an
 * emit. A create case that emits NOTHING must be visible to arm A2; deriving
 * the label set from the emits alone would have made it invisible, which is the
 * "walked nothing reads as clean" shape the floors exist to refuse.
 */
function readCases(bridgeSrc: string): string[] {
  const out: string[] = [];
  for (const l of bridgeSrc.split('\n')) {
    const m = /^\s*case\s+'([^']+)'\s*:/.exec(l);
    if (m) out.push(m[1]!);
  }
  return out;
}

// ─── The ledger ──────────────────────────────────────────────────────────────

interface LedgerRow {
  readonly family: string;
  readonly field: string;
  readonly kind: string;
  readonly channel?: string;
  readonly host?: string;
  readonly reason: string;
  readonly consequence: string;
}
interface Ledger {
  readonly note?: string;
  readonly drops: LedgerRow[];
  readonly unchannelled: LedgerRow[];
  readonly fanOut: LedgerRow[];
  /** L0 kinds with NO `<kind>.create` case in the bridge — named, never silently skipped */
  readonly unbound: LedgerRow[];
}

function readLedger(p: string): Ledger {
  if (!existsSync(p)) return { drops: [], unchannelled: [], fanOut: [], unbound: [] };
  const j = JSON.parse(readFileSync(p, 'utf8')) as Partial<Ledger>;
  return { note: j.note, drops: j.drops ?? [], unchannelled: j.unchannelled ?? [], fanOut: j.fanOut ?? [], unbound: j.unbound ?? [] };
}

// ─── The analysis ────────────────────────────────────────────────────────────

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Finding { readonly arm: 'A1' | 'A2' | 'A3' | 'A4' | 'A6'; readonly key: string; readonly detail: string }
interface FamilyRow {
  readonly family: string;
  readonly channel: string | null;
  readonly emitSites: number;
  readonly authored: readonly string[];
  readonly carried: readonly string[];
  readonly dropped: readonly string[];
  readonly ledgered: readonly string[];
}
interface Analysis {
  readonly findings: Finding[];
  readonly stale: string[];
  readonly rows: FamilyRow[];
  readonly kindCount: number;
  readonly emitCount: number;
  readonly boundCount: number;
  readonly authoredWalked: number;
}

interface Subject {
  readonly kinds: readonly Kind[];
  readonly emits: readonly Emit[];
  /** every `case` label in the bridge, including ones that emit nothing */
  readonly caseLabels: readonly string[];
  readonly ledger: Ledger;
  /** an extra authored field injected on a named family — the live-baseline plant */
  readonly plant?: { readonly family: string; readonly field: string };
}

function analyse(s: Subject): Analysis {
  const findings: Finding[] = [];
  const stale: string[] = [];
  const rows: FamilyRow[] = [];

  const aliasFor = (family: string, field: string): readonly string[] => {
    const hit = ALIASES.filter((a) => (a.family === '*' || norm(a.family) === norm(family)) && a.authored === field);
    return hit.flatMap((a) => a.carriedAs);
  };

  // every ledger row, marked as it is USED, so the unused ones become A5/stale
  const usedDrop = new Set<string>();
  const usedUnchannelled = new Set<string>();
  const usedFanOut = new Set<string>();
  const usedUnbound = new Set<string>();
  const dropKey = (f: string, fld: string): string => `${norm(f)}::${fld}`;

  // ARM A4 — hard-0 — every row must carry a reason, a consequence and a known kind.
  const allRows: Array<{ section: string; row: LedgerRow }> = [
    ...s.ledger.drops.map((row) => ({ section: 'drops', row })),
    ...s.ledger.unchannelled.map((row) => ({ section: 'unchannelled', row })),
    ...s.ledger.fanOut.map((row) => ({ section: 'fanOut', row })),
    ...s.ledger.unbound.map((row) => ({ section: 'unbound', row })),
  ];
  for (const { section, row } of allRows) {
    const problems: string[] = [];
    if (!row.reason || row.reason.trim().length < 20) problems.push('reason is blank or under 20 characters');
    if (!row.consequence || row.consequence.trim().length < 10) problems.push('consequence is blank or under 10 characters');
    if (!KIND_SET.has(row.kind)) problems.push(`kind '${row.kind}' is outside the closed vocabulary [${[...KIND_SET].join(', ')}]`);
    if (problems.length > 0) {
      findings.push({
        arm: 'A4',
        key: `A4::${section}::${row.family}.${row.field}:unreasoned ledger row`,
        detail: `ledger ${section} row ${row.family}.${row.field} — ${problems.join(' · ')}. A blank reason is how a ledger becomes a rubber stamp: the row must say WHY the field cannot be carried and WHAT the user sees instead, so a reader can tell a decision from an oversight.`,
      });
    }
  }

  const createCases = s.caseLabels.filter((c) => /\.(batch\.)?create$/.test(c));
  /** an emit is PRIMARY when one of its enclosing case labels names its own family */
  const isPrimary = (e: Emit): boolean =>
    e.enclosingCases.some((c) => norm(caseFamilyOf(c)) === norm(channelFamilyOf(e.channel)));

  // channel -> intersection of its OWN-family primary emits (used by arm A3)
  const primaryIntersection = new Map<string, Set<string>>();
  for (const e of s.emits) {
    if (!isPrimary(e)) continue;
    const prev = primaryIntersection.get(e.channel);
    const here = new Set(e.keys.filter((k) => !k.startsWith('...')));
    if (!prev) primaryIntersection.set(e.channel, here);
    else for (const k of [...prev]) if (!here.has(k)) prev.delete(k);
  }

  let authoredWalked = 0;
  let boundCount = 0;

  for (const k of s.kinds) {
    const bound = createCases.filter((c) => norm(caseFamilyOf(c)) === norm(k.kind));
    if (bound.length === 0) {
      // ── ARM A6 — the family has no `<kind>.create` case in the bridge at all.
      //    Silently skipping it is the "walked nothing reads as clean" hole: TEN
      //    of thirty kinds land here, including door, window, stair and water.
      const row = s.ledger.unbound.find((r) => norm(r.family) === norm(k.kind));
      if (row) usedUnbound.add(norm(k.kind));
      else {
        findings.push({
          arm: 'A6',
          key: `A6::${k.kind}:no create case in the bridge`,
          detail: `${k.kind} is an L0 element kind (${k.file}, ${k.fields.length} authored fields) and the bridge has NO 'case ${k.kind}.create'. This gate therefore measured NOTHING for it, and an unmeasured family must never read the same as a clean one. Name it in the ledger's 'unbound' section: 'not-a-drawable-element' if it is a container or surface, 'other-create-verb' if it is created under a differently-spelled verb (and say WHICH), or fix the binding.`,
        });
      }
      continue;
    }
    boundCount++;

    const own = s.emits.filter(
      (e) => e.enclosingCases.some((c) => bound.includes(c)) && norm(channelFamilyOf(e.channel)) === norm(k.kind),
    );

    const authored = [...k.fields.filter((f) => !f.startsWith('...'))];
    if (s.plant && norm(s.plant.family) === norm(k.kind)) authored.push(s.plant.field);
    authoredWalked += authored.length;

    if (own.length === 0) {
      // ── ARM A2 — the family has no channel of its own.
      const row = s.ledger.unchannelled.find((r) => norm(r.family) === norm(k.kind));
      if (row) usedUnchannelled.add(norm(k.kind));
      else {
        findings.push({
          arm: 'A2',
          key: `A2::${k.kind}:no channel of its own`,
          detail: `${k.kind} — the bridge has [${bound.join(', ')}] but raises NO '${k.kind}.created'. All ${authored.length} authored L0 fields (${authored.join(', ')}) are carried, if at all, by OTHER families' channels for its members. Either raise a channel of its own or name the fan-out in the ledger with the fields each member leg carries.`,
        });
      }
      rows.push({ family: k.kind, channel: null, emitSites: 0, authored, carried: [], dropped: authored, ledgered: row ? authored : [] });
      continue;
    }

    // CARRIED is the INTERSECTION over every primary emit site — see the header.
    let carried: Set<string> | null = null;
    for (const e of own) {
      const here = new Set(e.keys.filter((x) => !x.startsWith('...')));
      if (carried === null) carried = here;
      else for (const key of [...carried]) if (!here.has(key)) carried.delete(key);
    }
    const carriedSet = carried ?? new Set<string>();

    const dropped: string[] = [];
    const ledgered: string[] = [];
    for (const f of authored) {
      if (carriedSet.has(f)) continue;
      if (aliasFor(k.kind, f).some((a) => carriedSet.has(a))) continue;
      dropped.push(f);
      const wildcard = s.ledger.drops.find((r) => r.family === '*' && r.field === f);
      const exact = s.ledger.drops.find((r) => norm(r.family) === norm(k.kind) && r.field === f);
      const row = exact ?? wildcard;
      if (row) {
        ledgered.push(f);
        usedDrop.add(dropKey(row.family, row.field));
      } else {
        // ── ARM A1 — the ratchet.
        findings.push({
          arm: 'A1',
          key: `A1::${k.kind}.${f}:silently dropped at ${own[0]!.channel}`,
          detail: `${k.kind}.${f} is AUTHORED by ${k.file} and is absent from the intersection of ${own.length} '${own[0]!.channel}' emit site(s) (lines ${own.map((e) => e.line).join(', ')}). No ledger row names it. A field silently defaulted, silently renamed away, or read only by unreachable code is FIDELITY = NO. Carry it, declare the rename in ALIASES, or REFUSE IT BY NAME at runtime with both numbers (C74/CA-18) and record the refusal here.`,
        });
      }
    }
    // `carried` is reported as the AUTHORED fields that arrive, so
    // authored = carried + dropped and the three numbers can be read as one
    // sentence. Envelope keys and emit-only keys are deliberately not counted:
    // this axis is about what the USER authored, not about payload size.
    const carriedAuthored = authored.filter((f) => !dropped.includes(f));
    rows.push({ family: k.kind, channel: own[0]!.channel, emitSites: own.length, authored, carried: carriedAuthored, dropped, ledgered });
  }

  // ── ARM A3 — fan-out narrowing.
  for (const e of s.emits) {
    if (e.enclosingCases.length === 0 || isPrimary(e)) continue;
    const caseFam = caseFamilyOf(e.enclosingCases[0]!);
    const prim = primaryIntersection.get(e.channel);
    if (!prim || prim.size === 0) continue;
    const here = new Set(e.keys.filter((x) => !x.startsWith('...')));
    for (const f of [...prim]) {
      if (here.has(f) || ENVELOPE_KEYS.has(f)) continue;
      const row = s.ledger.fanOut.find((r) => norm(r.host ?? r.family) === norm(caseFam) && r.channel === e.channel && r.field === f);
      if (row) { usedFanOut.add(`${norm(row.host ?? row.family)}::${row.channel}::${row.field}`); continue; }
      findings.push({
        arm: 'A3',
        key: `A3::${caseFam}->${e.channel}.${f}:fan-out narrower than the primary`,
        detail: `case '${e.enclosingCases.join("' / '")}' raises '${e.channel}' at line ${e.line} WITHOUT '${f}', which every primary '${e.channel}' emit carries. The member drawn by this leg is narrower than the same member created directly — the lift/pool/balcony defect. Carry it on the fan-out, or name the narrowing here.`,
      });
    }
  }

  // ── ARM A5 — paid debt must leave. Reported through `stale` (forces exit 3).
  for (const r of s.ledger.drops) {
    if (usedDrop.has(dropKey(r.family, r.field))) continue;
    stale.push(`drops: ${r.family}.${r.field} is no longer dropped (carried, no longer authored, or the family no longer has a create case) — strike it in the commit that paid it`);
  }
  for (const r of s.ledger.unchannelled) {
    if (usedUnchannelled.has(norm(r.family))) continue;
    stale.push(`unchannelled: ${r.family} now raises a channel of its own, or no longer has a create case — strike it`);
  }
  for (const r of s.ledger.fanOut) {
    if (usedFanOut.has(`${norm(r.host ?? r.family)}::${r.channel}::${r.field}`)) continue;
    stale.push(`fanOut: ${r.host ?? r.family} -> ${r.channel}.${r.field} is no longer narrowed — strike it`);
  }
  for (const r of s.ledger.unbound) {
    if (usedUnbound.has(norm(r.family))) continue;
    stale.push(`unbound: ${r.family} now HAS a '${r.family}.create' case in the bridge, or is no longer an L0 kind — strike it and let the family be measured`);
  }

  return { findings, stale, rows, kindCount: s.kinds.length, emitCount: s.emits.length, boundCount, authoredWalked };
}

// ─── Executed controls ───────────────────────────────────────────────────────

/**
 * PARSER CONTROL — the arms above are driven from an in-memory subject, which
 * proves the COMPARATOR and says nothing about the two brace-matchers that
 * build it. That is a real blind spot: a regex that stopped matching would
 * report "every family carries everything" and the floors would only catch it
 * if it broke completely. So both parsers are run over a PLANTED tree on disk
 * whose answer is known, and the extracted sets are compared exactly.
 */
function parserControl(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-parser`);
  const lines: string[] = [];
  let ok = true;
  try {
    rmSync(base, { recursive: true, force: true });
    const dir = join(base, 'elements');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Widget.ts'), [
      "import { defineElement } from '../base/BaseNode.js';",
      "export const Widget = defineElement('widget', {",
      '  /** a doc comment with a { brace } and a defineElement mention inside it */',
      '  provenance: RetrofittedProvenanceSchema,',
      "  boundary: z.array(Vec3).min(3),   // trailing comment with a comma, and a '}'",
      '  nested: z.object({ a: z.number(), b: z.number() }).optional(),',
      '  thickness: z.number().positive(),',
      '});',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'index.ts'), 'export * from "./Widget.js";\n', 'utf8');

    const bridge = [
      '        case \'widget.create\': {',
      "          events.emit('widget.created', {",
      '            commandId, commandType,',
      '            id: rec.id,',
      "            polygon: rec.boundary.map((p) => ({ x: p.x, y: p.z })),   // a ')' inside a string: ')'",
      '            thickness: rec.thickness,',
      '          });',
      '          break;',
      '        }',
      "        case 'boundaryLine.create':",
      "        case 'boundaryLine.move': {",
      "          events.emit('boundaryLine.created', {",
      '            commandId, commandType, boundaryLineId,',
      '          });',
      '          break;',
      '        }',
    ].join('\n');

    const kinds = readKinds(dir, (d) => readdirSync(d));
    const emits = readEmits(bridge);
    const cases = readCases(bridge);

    const want = ['provenance', 'boundary', 'nested', 'thickness'];
    const gotFields = kinds[0]?.fields ?? [];
    const fieldsOk = kinds.length === 1 && kinds[0]!.kind === 'widget' && want.every((f) => gotFields.includes(f)) && gotFields.length === want.length;
    lines.push(`Parser control (schemas): 1 kind expected, ${kinds.length} found; fields [${gotFields.join(', ')}] ${fieldsOk ? '✓' : '✗'}`);
    if (!fieldsOk) ok = false;

    const wantKeys = ['commandId', 'commandType', 'id', 'polygon', 'thickness'];
    const gotKeys = emits[0]?.keys ?? [];
    const emitOk = emits.length === 2 && wantKeys.every((k) => gotKeys.includes(k)) && gotKeys.length === wantKeys.length;
    lines.push(`Parser control (bridge emits): 2 expected, ${emits.length} found; first keys [${gotKeys.join(', ')}] ${emitOk ? '✓' : '✗'}`);
    if (!emitOk) ok = false;

    // the STACKED fall-through: both labels must reach the second emit, or
    // boundaryLine disappears from this gate entirely.
    const stackOk = (emits[1]?.enclosingCases.length ?? 0) === 2 && emits[1]!.enclosingCases[0] === 'boundaryLine.create';
    lines.push(`Parser control (stacked fall-through): emit 2 enclosing cases [${(emits[1]?.enclosingCases ?? []).join(', ')}] ${stackOk ? '✓' : '✗'}`);
    if (!stackOk) ok = false;

    const casesOk = cases.length === 3;
    lines.push(`Parser control (case labels): 3 expected, ${cases.length} found ${casesOk ? '✓' : '✗'}`);
    if (!casesOk) ok = false;
  } catch (e) {
    ok = false;
    lines.push(`      ✗ parser control threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

/** A synthetic subject: two schema kinds and a bridge, built in memory. */
function syntheticSubject(opts: { dirty: boolean }): Subject {
  const kinds: Kind[] = opts.dirty
    ? [
        { kind: 'widget', file: 'x/Widget.ts', fields: ['boundary', 'thickness', 'holes', 'materialColor'] },
        { kind: 'compound-thing', file: 'x/CompoundThing.ts', fields: ['boundary', 'height'] },
        // no create case anywhere -> A6 must fire
        { kind: 'orphan-kind', file: 'x/OrphanKind.ts', fields: ['boundary'] },
      ]
    : [
        { kind: 'widget', file: 'x/Widget.ts', fields: ['boundary', 'thickness', 'holes', 'materialColor'] },
        // unbound, but NAMED in the clean ledger -> nothing may fire
        { kind: 'sheet-like', file: 'x/SheetLike.ts', fields: ['title'] },
      ];

  const emits: Emit[] = opts.dirty
    ? [
        // widget.create carries everything; widget.batch.create drops holes and
        // materialColor -> the INTERSECTION drops them -> A1 must fire twice.
        { channel: 'widget.created', line: 10, enclosingCases: ['widget.create'], keys: ['commandId', 'polygon', 'thickness', 'holes', 'materialColor'] },
        { channel: 'widget.created', line: 30, enclosingCases: ['widget.batch.create'], keys: ['commandId', 'polygon', 'thickness'] },
        // compound-thing.create raises only widget.created -> A2 must fire, and
        // that leg omits `thickness` which the primaries carry -> A3 must fire.
        { channel: 'widget.created', line: 50, enclosingCases: ['compound-thing.create'], keys: ['commandId', 'polygon'] },
      ]
    : [
        { channel: 'widget.created', line: 10, enclosingCases: ['widget.create'], keys: ['commandId', 'polygon', 'thickness', 'holes'] },
        { channel: 'widget.created', line: 30, enclosingCases: ['widget.batch.create'], keys: ['commandId', 'polygon', 'thickness', 'holes'] },
      ];

  const ledger: Ledger = opts.dirty
    ? {
        // one row with a blank reason -> A4; one row nothing measures -> A5.
        drops: [
          { family: 'widget', field: 'thickness', kind: 'narrow-emit', reason: '', consequence: '' },
          { family: 'widget', field: 'ghostField', kind: 'no-destination', reason: 'a row for a field that is not dropped any more, left behind on purpose', consequence: 'the next regression hides inside it' },
        ],
        unchannelled: [],
        fanOut: [],
        unbound: [],
      }
    : {
        // the CORRECT shapes: a declared rename (boundary -> polygon) needs no
        // row at all, and the one genuine drop is named with a real reason.
        drops: [
          {
            family: 'widget', field: 'materialColor', kind: 'no-destination',
            reason: 'the legacy WidgetData record has no colour field, so the value has nowhere to land even on the path that works',
            consequence: 'a widget authored with a colour draws in the default grey, and the builder says so per element at runtime',
          },
        ],
        unchannelled: [],
        fanOut: [],
        unbound: [
          {
            family: 'sheet-like', field: '*', kind: 'not-a-drawable-element',
            reason: 'a sheet is a drawing surface, not a drawable element: it has no builder and no *.created channel by declaration',
            consequence: 'nothing renders for it and nothing should — its contents render through the viewports it hosts',
          },
        ],
      };

  const caseLabels = opts.dirty
    ? ['widget.create', 'widget.batch.create', 'compound-thing.create']
    : ['widget.create', 'widget.batch.create'];

  return { kinds, emits, caseLabels, ledger };
}

interface ControlResult { readonly ok: boolean; readonly lines: string[]; readonly armsFired: string[] }

function runControls(live: Analysis, liveSubject: Subject): ControlResult {
  const lines: string[] = [];
  let ok = true;
  const fired = new Set<string>();

  // ── 1. NEGATIVE (planted synthetic tree) — arms A1..A4 must all fire.
  const bad = analyse(syntheticSubject({ dirty: true }));
  for (const f of bad.findings) fired.add(f.arm);
  if (bad.stale.length > 0) fired.add('A5');
  lines.push(`Negative control (planted): ${bad.findings.length + bad.stale.length} findings, arms fired [${[...fired].sort().join(', ')}]`);
  for (const f of bad.findings) lines.push(`      ✓ ${f.arm} fired — ${f.key}`);
  for (const st of bad.stale) lines.push(`      ✓ A5 fired — ${st}`);
  for (const arm of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) {
    if (!fired.has(arm)) { ok = false; lines.push(`      ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
  }

  // ── 1b. PARSER CONTROL — the two brace-matchers, over a planted tree on disk.
  const parser = parserControl();
  for (const l of parser.lines) lines.push(l);
  if (!parser.ok) { ok = false; lines.push('      ✗ BLIND COMPARATOR — a source parser did not extract what was planted; every count above is unreliable.'); }

  // ── 2. POSITIVE (clean synthetic tree) — the CORRECT shapes must read 0.
  const good = analyse(syntheticSubject({ dirty: false }));
  const goodTotal = good.findings.length + good.stale.length;
  lines.push(`Positive control (clean): ${goodTotal} findings`);
  for (const f of good.findings) { ok = false; lines.push(`      ✗ FALSE POSITIVE — ${f.key}`); }
  for (const st of good.stale) { ok = false; lines.push(`      ✗ FALSE POSITIVE (stale) — ${st}`); }

  // ── 3. NEGATIVE at the LIVE BASELINE — the ceiling-disarm proof.
  //    One synthetic authored field on a real family, which no ledger row can
  //    name. The verdict on the perturbed reading MUST be exit 3.
  const plantFamily = live.rows.find((r) => r.channel !== null)?.family ?? 'wall';
  const plantField = '__fidelityAxisPlantedField';
  const perturbed = analyse({ ...liveSubject, plant: { family: plantFamily, field: plantField } });
  const perturbedVerdict = verdictOf({
    gate: `${GATE}/live-baseline-control`,
    floors: [],
    lines: [],
    findings: perturbed.findings.length,
    declared: CEILING,
    stale: perturbed.stale,
  });
  const armFiredLive = perturbed.findings.some((f) => f.key.includes(plantField));
  if (perturbedVerdict.code === 3 && armFiredLive) {
    fired.add('A1@live');
    lines.push(`Negative control (LIVE BASELINE, ceiling=${CEILING}): planted '${plantFamily}.${plantField}' — verdict ${perturbedVerdict.code} RATCHET EXCEEDED, A1 fired by name ✓`);
  } else {
    ok = false;
    lines.push(
      `      ✗ BLIND COMPARATOR — the live-baseline plant '${plantFamily}.${plantField}' produced verdict ${perturbedVerdict.code}, not 3` +
      (CEILING > 0
        ? `. THE CEILING IS RAISED (PRYZM_FIDELITY_AXIS_CEILING=${CEILING}). Raising it ABSORBS a new silent drop, which is exactly what this gate exists to refuse — so the control cannot fire and the gate must exit 2 MISCONFIGURED rather than report a green it has not earned.`
        : '. The analyser did not report a planted, unledgered authored field.'),
    );
  }
  return { ok, lines, armsFired: [...fired].sort() };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const schemaDir = join(ROOT, ...SCHEMA_DIR_REL.split('/'));
const kinds = readKinds(schemaDir, (d) => { try { return readdirSync(d); } catch { return []; } });
let bridgeSrc = '';
try { bridgeSrc = readFileSync(join(ROOT, ...BRIDGE_REL.split('/')), 'utf8'); } catch { bridgeSrc = ''; }
const emits = readEmits(bridgeSrc);
const caseLabels = readCases(bridgeSrc);
const ledger = readLedger(LEDGER_PATH);

const liveSubject: Subject = { kinds, emits, caseLabels, ledger };
const live = analyse(liveSubject);

if (WRITE) {
  const seeded: Ledger = {
    note: 'SEEDED by --write. Every reason and consequence below is BLANK and arm A4 is red until a human writes them. An auto-filled ledger is a rubber stamp with a timestamp.',
    drops: live.rows.flatMap((r) => r.channel === null ? [] : r.dropped.filter((f) => !r.ledgered.includes(f)).map((f) => ({ family: r.family, field: f, kind: 'narrow-emit', channel: r.channel!, reason: '', consequence: '' }))),
    unchannelled: live.rows.filter((r) => r.channel === null).map((r) => ({ family: r.family, field: '*', kind: 'compound-fan-out', reason: '', consequence: '' })),
    fanOut: live.findings.filter((f) => f.arm === 'A3').map((f) => {
      const m = /^A3::(.+?)->(.+?)\.([^.:]+):/.exec(f.key);
      return { family: m?.[1] ?? '?', host: m?.[1] ?? '?', channel: m?.[2] ?? '?', field: m?.[3] ?? '?', kind: 'narrow-emit', reason: '', consequence: '' };
    }),
    unbound: live.findings.filter((f) => f.arm === 'A6').map((f) => ({
      family: /^A6::(.+?):/.exec(f.key)?.[1] ?? '?', field: '*', kind: 'not-a-drawable-element', reason: '', consequence: '',
    })),
  };
  writeFileSync(LEDGER_PATH, JSON.stringify(seeded, null, 2) + '\n', 'utf8');
  console.log(`[${GATE}] --write seeded ${LEDGER_PATH}: ${seeded.drops.length} drops, ${seeded.unchannelled.length} unchannelled, ${seeded.fanOut.length} fan-out rows. Reasons are BLANK on purpose.`);
}

const control = runControls(live, liveSubject);

console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN — 59 of 99 gates here cannot prove they would fire):`);
for (const l of control.lines) console.log('   ' + l);

const lines: string[] = [];
lines.push(`ceiling PRYZM_FIDELITY_AXIS_CEILING = ${CEILING} (tolerance of UNLEDGERED drops; raising it disarms the live-baseline control and forces exit 2)`);
lines.push(`subject: ${kinds.length} L0 element kinds · ${emits.length} CEB emit sites · ${live.boundCount} families bound to a create case · ${live.authoredWalked} authored fields walked`);
lines.push(`ledger: ${ledger.drops.length} drop rows · ${ledger.unchannelled.length} unchannelled rows · ${ledger.fanOut.length} fan-out rows · ${ledger.unbound.length} unbound rows, all shrink-only`);
lines.push('');
lines.push('PER-FAMILY — authored / carried / dropped, and the dropped field NAMES:');
const sorted = [...live.rows].sort((a, b) => a.family.localeCompare(b.family));
for (const r of sorted) {
  const unl = r.dropped.filter((f) => !r.ledgered.includes(f));
  const flag = r.channel === null ? ' ⛔ NO CHANNEL OF ITS OWN' : unl.length > 0 ? ' ⛔ UNLEDGERED' : '';
  lines.push(
    `  ${r.family.padEnd(20)} authored ${String(r.authored.length).padStart(2)} · carried ${String(r.carried.length).padStart(2)} · dropped ${String(r.dropped.length).padStart(2)}` +
    `  [${r.channel ?? 'none'}${r.emitSites > 0 ? ' ×' + r.emitSites : ''}]${flag}`,
  );
  if (r.dropped.length > 0) lines.push(`      dropped: ${r.dropped.map((f) => (r.ledgered.includes(f) ? f : f + ' ⛔')).join(', ')}`);
}
lines.push('');
const metadataOnly = new Set(ledger.drops.filter((r) => r.kind === 'authorship-metadata').map((r) => r.field));
const carriesAllGeometry = sorted.filter((r) => r.channel !== null && r.dropped.every((f) => metadataOnly.has(f)));
lines.push(
  `THE HEADLINE, in three numbers that are NOT interchangeable: ` +
  `${sorted.filter((r) => r.dropped.length === 0).length} of ${sorted.length} families carry EVERY authored field · ` +
  `${carriesAllGeometry.length} of ${sorted.length} carry every GEOMETRY-BEARING authored field, dropping only C75 authorship metadata (${carriesAllGeometry.map((r) => r.family).join(', ') || 'none'}) · ` +
  `${sorted.filter((r) => r.dropped.every((f) => r.ledgered.includes(f))).length} of ${sorted.length} are HONEST — every drop is either carried or NAMED here with a reason and a consequence.`,
);
lines.push(
  '  ⚠ The middle number is NOT the measurement’s "6 of 26 draw what the user authored". That figure was scored over a different denominator (26 drawable families, door/window/stair/water/lift included) and against the MESH, through the initTools mirror this gate cannot see. Quote them together and you will overstate both.',
);
lines.push('');
lines.push('CANNOT SEE (stated so silence is never read as coverage): the initTools mirror, which drops several of these a SECOND time · the legacy non-bus leg for room/plumbing/annotation/dimension/grid · semantic fidelity (a carried field the builder ignores) · runtime refusals, which reach this gate only as a ledger row.');
lines.push('');
for (const f of live.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const floors: Floor[] = [
  { what: 'L0 element kinds parsed from packages/schemas/src/elements', measured: kinds.length, min: 25 },
  { what: 'CommandEventBridge emit sites parsed', measured: emits.length, min: 40 },
  { what: 'families bound to a create case', measured: live.boundCount, min: 15 },
  { what: 'authored fields walked', measured: live.authoredWalked, min: 200 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
  { what: 'distinct arms proven to fire against a planted violation', measured: control.armsFired.length, min: 6 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings: live.findings.length,
  declared: CEILING,
  findingNames: live.findings.map((f) => f.key),
  stale: live.stale,
};

process.exit(reportGate(result));
