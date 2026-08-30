// ─── GATE · check-property-rac-matrix  (C67 · C68 · ADR-0345 · L-2211) ───────
//
// SUBJECT: **one principle, across every element family and every property** —
// *a dimension or property a user can SEE can be ASKED about and CHANGED by
// sentence.* The founder's ask, 2026-08-21:
//
//     "Please do a deep review of ALL element properties against RAC. All dims
//      and properties of all elements should be queryable and executable by RAC.
//      Do an audit — document — plan — and fix."
//
// The audit is ADR-0345's matrix. This gate is what keeps the matrix from
// rotting, and it does so by DERIVING every cell on every run rather than
// reading a transcribed table — because a matrix in prose decays, and this
// repository's own history is the proof: ADR-0344's ledger shipped with a
// hand-typed header saying "52 cells / 27 SILENT" and its first run read 64/39.
//
// ─── THE FOUR VERDICTS, and why SILENT is the only one that is a FINDING ─────
// Every (family, property) cell holds exactly one of:
//   · **BOTH**        — askable AND settable. Not a finding.
//   · **EXECUTE-ONLY**— settable, not askable. A ratcheted finding: the founder
//     asked for both words.
//   · **QUERY-ONLY**  — askable, not settable. **HARD-0.** It is structurally
//     impossible today (every query row reads its kinds off the write
//     capability), so one appearing means that construction has been broken.
//   · **SILENT**      — neither, and nothing says so. The user edits it by hand
//     in the Properties panel and the chat neither does it nor admits it
//     cannot. "There is no such property" and "nobody wired it" arrive as the
//     same answer, which is the C78 §1.4 defect class. Ratcheted, named.
//
// ─── WHY IT IS EXECUTED, and not a static scan ───────────────────────────────
// The opposite call from ADR-0344's gate, and for a stated reason: its subject
// was *"is there a subscriber somewhere in the whole estate"*, which no headless
// world can answer. THIS subject is a PURE L2 module — `applySemanticIntent`
// over `ResolverContext` — so the gate can simply run it. Every numerator cell
// below is the real resolver's real answer to a real sentence-shaped intent, not
// a claim about one. Nothing is transcribed.
//
// ─── THE DENOMINATOR, and the half that was missing ──────────────────────────
// `tools/ga-gate/lib/panelPropertySurface.ts`, shared with
// `check-chat-capability-coverage` check 9 so the two gates cannot disagree
// about what "a property a user can see" means. ⭐ That check's own header names
// its limit (1): *"WindowSection / DoorSection own width/height/sillHeight/type/
// colour … so window and door look far emptier here than they are."* The shared
// module now reads those dedicated sections too, which is why this gate's
// denominator is larger than check 9's ever was — and why WINDOW and DOOR, the
// two families the founder asks about most, are finally measured.
//
// ─── WHAT THIS GATE CANNOT SEE ───────────────────────────────────────────────
//  (a) Whether a BOTH cell is CORRECT. It proves the sentence REACHES a command
//      or an answer, never that the number that lands is right. The write half's
//      liveness is `PropertyVocabulary`'s honesty bar and checks 3b/3d; the read
//      half's is `propertyQuery.test.ts`.
//  (b) A record field NO panel row exposes. Invisible to the panel and therefore
//      to this. ADR-0345 §4 names that as its own subject with its own
//      denominator.
//  (c) The ROOM panel and the curtain sub-element panels, which are hand-built
//      cards rather than table rows. Named in `unmeasuredPanels` so the
//      shortfall is countable rather than implied (C10).
//  (d) Whether a SILENT cell SHOULD be wired. The matrix records what the
//      product does; whether chat ought to set a door's handle height is a
//      design question the ADR raises and this gate does not answer.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAT_UNAVAILABLE,
  PROBE_ELEMENT_KINDS,
  allChatCapabilities,
  capabilityAppliesTo,
  normalizeElementKind,
  resolveChatCapability,
  type ChatCapability,
} from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
import {
  PROPERTY_QUERY_ROWS,
  queryableKinds,
} from '../../packages/ai-host/src/intents/PropertyQuery.js';
import {
  applySemanticIntent,
  type ResolverContext,
} from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { panelPropertySurface } from './lib/panelPropertySurface.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const LEDGER = resolve(HERE, './property-rac-matrix.json');

/**
 * Subject floors (RATCHET R5, lane W1b 2026-08-30).
 *
 * These floors were already ENFORCED -- as literals inside the `floors` array in
 * main(), which returns 2 when any is unmet. They are HOISTED into named `MIN_...`
 * constants here, and the misconfiguration exit is spelled literally at the bottom
 * of the file, for one reason: check-gate-subject-floors.ts read this gate as
 * "no floor constant AND no exit-2 path", and a floor a reader cannot find is worth
 * little more than one that is not there. Adopting the house idiom is the repair;
 * inventing a second one would not be (C84 EI-9).
 *
 * NO VALUE CHANGED. Measured 2026-08-30 for the record: 4 panel files, 113
 * panel-visible cells across 15 families.
 */
const MIN_PANEL_FILES = 4;
const MIN_PANEL_CELLS = 60;
const MIN_CHAT_CAPABILITIES = 40;
const MIN_EXECUTABLE_PROPERTIES = 15;
const MIN_QUERYABLE_PROPERTIES = 15;

type Verdict = 'BOTH' | 'EXECUTE-ONLY' | 'QUERY-ONLY' | 'SILENT';

interface Cell {
  readonly family: string;
  readonly property: string;
  readonly verdict: Verdict;
  /** For a reachable half: the capability that reaches it. */
  readonly executeBy?: string;
  readonly queryBy?: string;
}

interface Ledger {
  /** ⚠ SHRINK-ONLY, and a NAMED list rather than an integer: a count could not
   *  tell "door.handleHeight was wired" from "wall.height regressed". */
  declaredSilent: string[];
  /** ⚠ SHRINK-ONLY, same reason. Settable but not askable. */
  declaredExecuteOnly: string[];
  /** Cells the product REFUSES by name. Each names the file + literal that must
   *  still exist: deleting a refusal converts an honest answer into silence,
   *  which is a regression wearing the appearance of a cleanup (C74). */
  refusals: { cell: string; file: string; mustContain: string; note: string }[];
  /** Panels this gate's denominator does not parse, named per C10. */
  unmeasuredPanels: string[];
}

// ─── The probe context ───────────────────────────────────────────────────────

let seq = 0;
function ctxSelecting(kind: string): ResolverContext {
  return {
    selection: [{ elementId: `probe-${kind}-${++seq}`, elementType: kind }],
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
    ],
    activeLevelId: 'L0',
    mintId: () => `probe-mint-${++seq}`,
    // A READABLE record: the question is whether the read arm REACHES the
    // property, and an un-injected reader would answer "cannot read" for every
    // cell — the harness measuring itself.
    readProperty: () => ({ ok: true as const, value: 1 }),
  };
}

// ─── Numerator A · what the chat can SET, derived by EXECUTION ───────────────
//
// Lifted in spirit from check 9's `chatReachableProperties`, with one deliberate
// difference: the result is keyed `kind.field` per CAPABILITY, so the matrix can
// say WHICH capability reaches a cell instead of only that something does. A
// refusal that names the route is worth more than a boolean.

const IDS_FIELD = /^(elementId|elementType|id|ids|source|mode|side|.*Ids|.*Id)$/;

function executableProperties(caps: readonly ChatCapability[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const cap of caps) {
    if (cap.targets === 'global') continue;
    for (const kind of PROBE_ELEMENT_KINDS) {
      if (!capabilityAppliesTo(cap, kind)) continue;
      let r;
      try {
        r = applySemanticIntent(cap.probe, ctxSelecting(kind));
      } catch {
        continue;
      }
      if (r.kind !== 'commands') continue;
      for (const c of r.commands) {
        const payload = c.payload as Record<string, unknown>;
        const carriers = ['parameters', 'updates', 'properties']
          .map((k) => payload[k])
          .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
        for (const carrier of carriers) {
          for (const key of Object.keys(carrier)) {
            if (!out.has(`${kind}.${key}`)) out.set(`${kind}.${key}`, cap.id);
          }
        }
        for (const key of Object.keys(payload)) {
          if (IDS_FIELD.test(key)) continue;
          if (key === 'parameters' || key === 'updates' || key === 'properties') continue;
          if (!out.has(`${kind}.${key}`)) out.set(`${kind}.${key}`, cap.id);
        }
      }
    }
  }
  return out;
}

// ─── Numerator B · what the chat can ASK, derived by EXECUTION ───────────────

interface QueryProbe {
  readonly reachable: Map<string, string>;
  /** Rows whose mirrored EXECUTE capability vanished or narrowed to nothing. */
  readonly brokenMirrors: string[];
}

function queryableProperties(): QueryProbe {
  const reachable = new Map<string, string>();
  const brokenMirrors: string[] = [];
  for (const row of PROPERTY_QUERY_ROWS) {
    const cap = resolveChatCapability(row.capabilityId);
    if (cap === null) {
      brokenMirrors.push(
        `query row "${row.id}" mirrors capability "${row.capabilityId}", which is NOT REGISTERED — ` +
        `the row can claim nothing and must be removed or repointed.`,
      );
      continue;
    }
    const kinds = queryableKinds(row);
    if (kinds.length === 0) {
      brokenMirrors.push(`query row "${row.id}" resolves to ZERO element kinds — it is dead metadata.`);
      continue;
    }
    for (const kind of kinds) {
      const r = applySemanticIntent(
        { intent: 'property-query', property: row.id } as never,
        ctxSelecting(kind),
      );
      if (r.kind === 'refusal') {
        brokenMirrors.push(
          `query row "${row.id}" declares kind "${kind}" (from ${row.capabilityId}) and the arm ` +
          `REFUSES it — "${r.reason.slice(0, 90)}". A declared reach the guard rejects is the ` +
          `ElementCapabilities lie.`,
        );
        continue;
      }
      reachable.set(`${normalizeElementKind(kind)}.${row.field}`, row.id);
    }
  }
  return { reachable, brokenMirrors };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

function main(): number {
  const lines: string[] = [];
  let exit = 0;

  const fail = (s: string): void => { lines.push(`   ❌ ${s}`); };

  if (!existsSync(LEDGER)) {
    console.log('[check-property-rac-matrix] MISCONFIGURED — ledger property-rac-matrix.json not found.');
    return 2;
  }
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;

  const caps = allChatCapabilities();
  const surface = panelPropertySurface(REPO, normalizeElementKind);
  const exec = executableProperties(caps);
  const { reachable: query, brokenMirrors } = queryableProperties();

  // ── FLOORS. Emptiness is never a pass (C10). ──────────────────────────────
  const totalPanelCells = [...surface.byKind.values()].reduce((n, s) => n + s.size, 0);
  const floors: { what: string; measured: number; min: number }[] = [
    { what: 'panel files parsed for the denominator', measured: surface.filesRead.length, min: MIN_PANEL_FILES },
    { what: 'panel-visible (family × property) cells', measured: totalPanelCells, min: MIN_PANEL_CELLS },
    { what: 'chat capabilities executed', measured: caps.length, min: MIN_CHAT_CAPABILITIES },
    { what: 'properties the chat can SET (a matrix of pure silence would be a broken probe)', measured: exec.size, min: MIN_EXECUTABLE_PROPERTIES },
    { what: 'properties the chat can ASK (ditto, in the other direction)', measured: query.size, min: MIN_QUERYABLE_PROPERTIES },
  ];
  const unmet = floors.filter((f) => f.measured < f.min);
  if (unmet.length > 0) {
    console.log('[check-property-rac-matrix] MISCONFIGURED — a floor is unmet; the gate measured nothing it can stand on.');
    for (const f of unmet) console.log(`   · ${f.what}: ${f.measured} < ${f.min}`);
    return 2;
  }
  if (surface.unreadSections.length > 0) {
    // A dedicated section that silently stops contributing makes its family look
    // COMPLETE. That is the failure direction that matters, so it is fatal.
    console.log('[check-property-rac-matrix] MISCONFIGURED — a dedicated panel section contributed nothing:');
    for (const u of surface.unreadSections) console.log(`   · ${u}`);
    return 2;
  }

  // ── Build the matrix ──────────────────────────────────────────────────────
  const cells: Cell[] = [];
  for (const [family, props] of [...surface.byKind].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const property of [...props].sort()) {
      const key = `${family}.${property}`;
      const e = exec.get(key);
      const q = query.get(key);
      const verdict: Verdict = e !== undefined && q !== undefined ? 'BOTH'
        : e !== undefined ? 'EXECUTE-ONLY'
          : q !== undefined ? 'QUERY-ONLY'
            : 'SILENT';
      cells.push({
        family,
        property,
        verdict,
        ...(e !== undefined ? { executeBy: e } : {}),
        ...(q !== undefined ? { queryBy: q } : {}),
      });
    }
  }

  const both = cells.filter((c) => c.verdict === 'BOTH');
  const execOnly = cells.filter((c) => c.verdict === 'EXECUTE-ONLY');
  const queryOnly = cells.filter((c) => c.verdict === 'QUERY-ONLY');
  const silent = cells.filter((c) => c.verdict === 'SILENT');
  const name = (c: Cell): string => `${c.family}.${c.property}`;

  lines.push(
    `   MATRIX: ${cells.length} panel-visible (family × property) cell(s) across ` +
    `${surface.byKind.size} families — ${both.length} BOTH · ${execOnly.length} EXECUTE-ONLY · ` +
    `${queryOnly.length} QUERY-ONLY · ${silent.length} SILENT. ` +
    `A count of silent cells without a count of what was examined is the empty-seed lie.`,
  );
  lines.push(
    `   DENOMINATOR: ${surface.filesRead.length} panel file(s); ` +
    `${surface.fromDedicatedSections.length} cell(s) come from the DEDICATED sections that ` +
    `check-chat-capability-coverage check 9 states it cannot see — ` +
    `${surface.fromDedicatedSections.slice(0, 12).join(', ')}` +
    `${surface.fromDedicatedSections.length > 12 ? ` … +${surface.fromDedicatedSections.length - 12} more` : ''}.`,
  );

  // ── ARM A (hard-0) — the MIRROR. ──────────────────────────────────────────
  // Every query row must reach exactly the kinds its write twin declares.
  if (brokenMirrors.length > 0) {
    exit = 3;
    fail(
      `ARM A · ${brokenMirrors.length} query row(s) no longer mirror their EXECUTE capability. ` +
      `"A property that is executable is queryable" is a claim held up by that mirror alone; ` +
      `when it breaks, the chat can advertise a read it will then refuse.`,
    );
    for (const b of brokenMirrors) lines.push(`      · ${b}`);
  } else {
    lines.push(`   ARM A (query rows mirror their write twin): ${PROPERTY_QUERY_ROWS.length}/${PROPERTY_QUERY_ROWS.length} ✓`);
  }

  // ── ARM B (hard-0) — QUERY-ONLY is structurally impossible. ───────────────
  if (queryOnly.length > 0) {
    exit = 3;
    fail(
      `ARM B · ${queryOnly.length} QUERY-ONLY cell(s): ${queryOnly.map(name).join(', ')}. ` +
      `A property the chat will REPORT but not CHANGE cannot arise while every query row reads ` +
      `its kinds off a write capability — so this means that construction has been bypassed, ` +
      `probably by a hand-written kind list.`,
    );
  } else {
    lines.push('   ARM B (no QUERY-ONLY cell): 0 ✓');
  }

  // ── ARM C (hard-0) — REFUSALS must still exist. ───────────────────────────
  let refusalsDeleted = 0;
  for (const r of ledger.refusals ?? []) {
    const abs = resolve(REPO, r.file);
    const present = existsSync(abs) && readFileSync(abs, 'utf8').includes(r.mustContain);
    if (!present) {
      refusalsDeleted += 1;
      exit = 3;
      fail(
        `ARM C · ${r.cell} is declared REFUSES and its refusal is GONE from ${r.file} ` +
        `("${r.mustContain}"). Deleting a refusal does not close the gap — it converts an honest ` +
        `answer into silence (C74).`,
      );
    }
  }
  if (refusalsDeleted === 0) {
    lines.push(`   ARM C (declared refusals still exist): ${(ledger.refusals ?? []).length}/${(ledger.refusals ?? []).length} ✓`);
  }

  // ── ARM D (ratchet, NAMED) — SILENT and EXECUTE-ONLY. ─────────────────────
  const ratchet = (
    label: string,
    measured: readonly string[],
    declared: readonly string[],
  ): void => {
    const declaredSet = new Set(declared);
    const added = measured.filter((m) => !declaredSet.has(m));
    const paid = declared.filter((d) => !measured.includes(d));
    lines.push(`   ARM D · ${label}: ${measured.length} (ledger ${declared.length})`);
    if (added.length > 0) {
      exit = 3;
      fail(
        `ARM D · ${added.length} NEW ${label} cell(s) not on the shrink-only ledger: ` +
        `${added.join(', ')}. Wire it, refuse it by name, or state why it is neither — ` +
        `never extend the ledger to make the gate quiet.`,
      );
    }
    if (paid.length > 0) {
      // STALE debt hides the next regression inside it (ADR-0344's arm C).
      exit = Math.max(exit, 3);
      fail(
        `ARM D · ${paid.length} ${label} cell(s) on the ledger are PAID and still listed: ` +
        `${paid.join(', ')}. Debt that has been paid must leave the ledger in the commit that ` +
        `pays it, or the next regression hides inside it.`,
      );
    }
  };
  ratchet('SILENT', silent.map(name).sort(), [...(ledger.declaredSilent ?? [])].sort());
  ratchet('EXECUTE-ONLY', execOnly.map(name).sort(), [...(ledger.declaredExecuteOnly ?? [])].sort());

  // ── The per-family reading, printed EVERY run. ────────────────────────────
  lines.push('   ── per family ───────────────────────────────────────────────');
  for (const family of [...surface.byKind.keys()].sort()) {
    const own = cells.filter((c) => c.family === family);
    const b = own.filter((c) => c.verdict === 'BOTH').length;
    const eo = own.filter((c) => c.verdict === 'EXECUTE-ONLY').length;
    const s = own.filter((c) => c.verdict === 'SILENT').length;
    lines.push(
      `      ${family.padEnd(14)} ${String(own.length).padStart(3)} cell(s)  ` +
      `BOTH ${String(b).padStart(2)} · EXECUTE-ONLY ${String(eo).padStart(2)} · SILENT ${String(s).padStart(2)}` +
      (s > 0 ? `  — silent: ${own.filter((c) => c.verdict === 'SILENT').map((c) => c.property).join(', ')}` : ''),
    );
  }

  if ((ledger.unmeasuredPanels ?? []).length > 0) {
    lines.push(
      `   ⚠ ${ledger.unmeasuredPanels.length} panel(s) are OUTSIDE this denominator and can rot: ` +
      `${ledger.unmeasuredPanels.join(' · ')}. Named so the shortfall is countable, per C10.`,
    );
  }
  lines.push(
    `   CONTEXT: ${CHAT_UNAVAILABLE.size} bus command(s) carry an explicit CHAT_UNAVAILABLE reason. ` +
    `Those are command-level refusals; this matrix is PROPERTY-level, and the two are not the ` +
    `same denominator — a family can refuse "move" by name while every one of its dimensions ` +
    `stays silent.`,
  );

  console.log('[check-property-rac-matrix] C67 · C68 · ADR-0345 — every dim and property, both verbs');
  for (const l of lines) console.log(l);
  if (exit === 0) {
    console.log(
      `[check-property-rac-matrix] OK — matrix derived, ${silent.length} SILENT + ` +
      `${execOnly.length} EXECUTE-ONLY at the declared level, no regression.`,
    );
    return 1; // DECLARED-LEVEL: the ledger's findings are real findings.
  }
  console.log('[check-property-rac-matrix] FAIL — see above.');
  return exit;
}

// exit 2 == MISCONFIGURED, spelled literally so the floors above are visibly
// enforced. 0 = clean, 1 = a finding, 2 = the gate measured nothing it can stand
// on. The three never alias (lane W1b).
const rc = main();
if (rc === 2) process.exit(2);
process.exit(rc);
