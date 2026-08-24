#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-chat-capability-coverage.ts
 *
 * §FIX-CHAT-CAPABILITY-BLIND — the chat cannot reach commands nobody told it about.
 *
 * ─── The defect this gate would have caught ──────────────────────────────────
 * Commit c1902a5a shipped `wall.updateSystemTypeBatch` and commit 48750f9c
 * shipped the AI chat panel IN THE SAME RELEASE. The founder typed
 *
 *     "make all walls interior partition"
 *
 * and got "I'm not sure how to help with that yet." The command existed. The
 * sentence was unambiguous. The resolver simply had no idea the command was
 * there, because the chat's idea of the editor's abilities lived in a
 * hand-maintained list of thirteen intents and nothing compared that list to the
 * bus. Every new capability silently required someone to remember a fourteenth.
 *
 * With this gate in CI, c1902a5a fails: it adds one registered bus command and
 * no declaration, so UNDECLARED rises above the baseline and the author must
 * either wire the chat or write down, in `CHAT_UNAVAILABLE`, why not.
 *
 * ─── What it checks ──────────────────────────────────────────────────────────
 *
 *  1. COVERAGE (shrink-only ratchet). Every bus command registered in
 *     `plugins/*∕src/handlers/*.ts` or `apps/editor/src/engine/initBusHandlers.ts`
 *     must be DECLARED: implemented by a `ChatCapability`, or listed in
 *     `CHAT_UNAVAILABLE` with a stated reason. Undeclared commands are counted
 *     and may only fall.
 *
 *  2. NO PHANTOM CAPABILITIES (hard, zero tolerance). Every `busCommand` a
 *     capability claims must be a command that is really registered. A
 *     capability pointing at a verb with no handler is the c1902a5a failure
 *     inverted — the chat would dispatch into nothing and report success.
 *
 *  3. NO LYING TARGETS (hard, zero tolerance). This is the point of the gate.
 *     `packages/input-host/src/operations/ElementCapabilities.ts` already
 *     advertises Mirror / Offset / Scale on seven element families whose
 *     commands are wall-only and refuse at `canExecute`. A capability table that
 *     lies is worse than none, so `targets` is verified TWO independent ways:
 *
 *       3a. EXECUTABLE. `applySemanticIntent(cap.probe, ctxSelecting(kind))` is
 *           run for every kind in `PROBE_ELEMENT_KINDS`. The declared target set
 *           must equal the accepted set EXACTLY — a declared target the guard
 *           refuses fails, and an undeclared kind the guard accepts fails too.
 *           Silent over-reach is the same lie facing the other way.
 *
 *       3b. SOURCE-ANCHORED. `cap.commandProof` names the file that DECIDES
 *           which element kinds the implementing command can reach (a store
 *           switch, an id-keyed payload) and the literals that must appear in
 *           it. The file is read. An unprovable claim fails.
 *
 *     3a proves the chat honours what it declares; 3b proves the declaration
 *     matches the command. Neither alone is enough: 3a would happily certify a
 *     resolver that confidently dispatches into a command that refuses.
 *
 *  4. ACCEPTANCE COVERAGE (hard, zero tolerance). Every capability must declare
 *     `examples`, and every example must be exercised by the acceptance suite.
 *     A capability with no natural-language test is a claim nobody checked.
 *
 *  ── C68 §6.3 CLOSURE PASS, 2026-08-11 ──────────────────────────────────────
 *  C68 shipped with nine honestly-stated gaps. These checks close or narrow
 *  them; each says in its own header WHAT IT CANNOT SEE.
 *
 *  4b. EXAMPLE EXECUTION (C68 §6.3-G2, ratcheted). Check 4 only asserted that
 *      `examples` was non-empty and that the capability ID appeared SOMEWHERE
 *      in the acceptance file — a grep, not a proof. 4b now RUNS every declared
 *      example through the real ladder (compound → tier 0/1 → NL) in the
 *      context the acceptance family declares, and requires it to land on its
 *      OWN capability and not be refused.
 *  4c. ADVERSARIAL CORPUS (C68 §6.3-G2, hard + ratchet). The declared
 *      adversarial corpus — report-shaped paste-backs, negations, hypotheticals,
 *      the `with → width` stopword repro — is EXECUTED, and any utterance that
 *      produces a command or a local action fails. Per-capability pin coverage
 *      is ratcheted separately.
 *  3e. GLOBAL ROUTE LIVENESS (C68 §6.3-G7, ratchet). `targets: 'global'`
 *      capabilities return early from 3a/3b/3d, so their route was never
 *      classified. 3e classifies the HANDLER file that registers their
 *      `busCommand` by the same execution-authority rule as 3d.
 *  5c. SCOPE MODES HONOURED (C68 §6.3-G3, hard + ratchet). `scopeModes` was
 *      name-checked only. 5c drives each declared spatial mode through
 *      `applySemanticIntent` with an injected stub `resolveScope` and requires
 *      the resolver to actually receive a descriptor OF THAT KIND — and
 *      requires an ABSENT resolver to refuse, never to widen to 'all'.
 *  6.  ONE DISPATCH + HONEST REPORT (C68 §6.3-G4/G6, hard). A mass-mutation
 *      capability must emit exactly ONE bus command (the provable half of "one
 *      undo"), and its proof file must carry the partial-outcome vocabulary.
 *  7.  CATALOGUE SOURCE EXISTS (C68 §6.3-G8, hard). A catalogue-kind
 *      `valueSource` must name a resolver module + export that really exists.
 *  8.  RESOLVER CASE-ARM RATCHET (C68 §6.3-G5, shrink-only). "Zero new resolver
 *      LOC" made measurable: the number of hand-written `case` arms in
 *      `applySemanticIntent` may not rise.
 *  9.  PROPERTY SURFACE RATCHET (C68 §6.3-G1, shrink-only). The verb ratchet
 *      cannot see a new ATTRIBUTE routed through an existing generic verb. 9
 *      counts panel-editable (kind, field) pairs with no chat route.
 *
 * ─── Negative-tested 2026-08-10 ──────────────────────────────────────────────
 * A gate nobody has watched fail is a gate nobody should trust. Three injected
 * faults, all correctly rejected:
 *   • `PRYZM_CHAT_MAX_UNDECLARED=268` → "FAIL — 269 undeclared bus command(s),
 *     baseline 268." (the ratchet fires on a single new command)
 *   • adding `'slab'` to `set-thickness.targets` → "DECLARES target \"slab\" but
 *     applySemanticIntent REFUSES it" (proof 3a, the ElementCapabilities case)
 *   • an under-matching handler regex → fifteen phantom claims reported, which
 *     is how the regex bug documented below was actually found.
 * Re-negative-tested 2026-08-10 for the new checks, both correctly rejected:
 *   • a fabricated `nonexistent.verb` in CHAT_CLASSIFIED → "classified but not
 *     a registered bus command — stale entry" (classification consistency)
 *   • `mustMention: ['NOT_IN_FILE_XYZ']` on set-thickness → "never mentions
 *     \"NOT_IN_FILE_XYZ\"" (multi-proof reader), and the missing
 *     `handrail.delete` classification fired the baseline-0 ratchet live.
 *
 * ─── Negative-tested 2026-08-11 (the C68 §6.3 closure checks) ────────────────
 * Every check above was watched failing before it was trusted. Fault injected →
 * failure text observed → injection removed:
 *   • corpus `+ 'make all walls white'` → "tier 0/1 MUTATED on \"make all walls
 *     white\" (intent set-wall-color)."                                    [4c]
 *   • parser skips the `set-height` family → "set-height: no acceptance FAMILY
 *     in packages/ai-host/__tests__/capability-acceptance.test.ts."        [4b]
 *   • `PRYZM_CHAT_MAX_UNRESOLVED_EXAMPLES=4` → "5 declared example(s) that do
 *     not resolve to their own capability, baseline 4", listing all five [4b ratchet]
 *   • `PRYZM_CHAT_MAX_UNCLASSIFIED_GLOBAL=0` → "create-wall: commandProof file
 *     \"plugins/wall/src/handlers/CreateWall.ts\" is a PLUGIN handler with
 *     neither the legacy-bridge signature … nor a PLUGIN_LIVE_ALLOWLIST entry." [3e]
 *   • stub `resolveScope` returns a ScopeError → "declares scope mode \"level\"
 *     and the descriptor reached the resolver, but the result was refusal, not
 *     a dispatch."                                                         [5c]
 *   • a resolver ALWAYS injected → "with NO resolveScope injected, scope mode
 *     \"level\" produced \"commands\" instead of an honest refusal."       [5c]
 *   • `commands.length !== 2` → nine mass-edit capabilities reported, proving the
 *     one-dispatch arm runs on every one of them.                           [6a]
 *   • `HONEST_REPORT_NEEDLES = ['NOT_IN_ANY_FILE_XYZ']` → thirteen capabilities
 *     "…none of its proof files mention a partial outcome".                 [6b]
 *   • `exported: 'resolveColorRefXYZ'` → "colorRef.ts no longer exports
 *     \"resolveColorRefXYZ\" — the ONE resolveCatalogueRef ladder entry point
 *     for \"color\" moved or was renamed."                                  [7]
 *   • `PRYZM_CHAT_MAX_CASE_ARMS=26` and `PRYZM_CHAT_MAX_UNREACHABLE_PROPS=41`
 *     → both ratchets fired with their banners.                          [8, 9]
 *
 * Usage:  tsx tools/ga-gate/check-chat-capability-coverage.ts
 * Exit:   0 = at or below the baseline and all hard checks pass · 1 = otherwise
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import {
  allChatCapabilities,
  capabilityAppliesTo,
  commandProofsOf,
  CHAT_UNAVAILABLE,
  normalizeElementKind,
  PROBE_ELEMENT_KINDS,
  type ChatCapability,
} from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
import {
  CHAT_CLASSIFIED,
  classificationBreakdown,
} from '../../packages/ai-host/src/capabilities/ChatCommandClassification.js';
import { unconnectedTopicCommands } from '../../packages/ai-host/src/capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type SemanticIntent,
  type ZeroTokenResolution,
} from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../../packages/ai-host/src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../../packages/ai-host/src/intents/SemanticPlan.js';
import type {
  ScopeDescriptor,
  ScopeResult,
} from '../../packages/ai-host/src/intents/ScopeDescriptor.js';
import { readAcceptanceCorpus } from './lib/acceptanceCorpus.js';
// §FEAT-RAC-PROPERTY-QUERY (L-2211) — the panel denominator, shared with
// `check-property-rac-matrix` so the two gates cannot disagree about what
// "a property a user can see" means. This gate reads HALF A only; see
// `panelEditableProperties` below for why that is deliberate.
import { schemaTableProperties } from './lib/panelPropertySurface.js';

/**
 * ⚠ SHRINK-ONLY.
 *
 * ─── UNDECLARED = 0 since 2026-08-10 (was 269, frozen the same day) ──────────
 * Every registered bus command is now declared in exactly one of three places:
 * implemented by a `ChatCapability`, deferred with a user-readable reason in
 * `CHAT_UNAVAILABLE`, or classified (B needs-design / C internal / D duplicate /
 * E unsafe / F deferred-next-tranche) with a truthful engineering reason in
 * `ChatCommandClassification.ts`. The 269→0 drop was NOT flattery: each of the
 * 269 was walked and placed; the classification file is the roadmap and the
 * per-family reasons are checked for truth in review, not generated.
 *
 * A NEW command therefore fails this gate until its author chooses: wire it
 * (capability), refuse it out loud (CHAT_UNAVAILABLE), or classify it with a
 * reason a reviewer can falsify. That choice being forced is the entire point.
 *
 * Raising this above 0 requires a dated justification HERE naming the commands.
 */
const MAX_UNDECLARED = Number(process.env.PRYZM_CHAT_MAX_UNDECLARED ?? 0);

/** Files that register bus commands. A `type: 'x.y'` literal in one of these is
 *  a real verb the bus will accept. */
const HANDLER_GLOBS = [
  'plugins/*/src/handlers/*.ts',
  'apps/editor/src/engine/initBusHandlers.ts',
  'apps/editor/src/engine/engineLauncher.ts',
];

// Handlers declare their verb two ways and BOTH must be scanned:
//   object-literal handlers   →  `type: 'wall.updateSystemTypeBatch',`
//   class-based handlers      →  `readonly type = 'wall.create';`
//                                `readonly type: CommandType = 'wall.create';`
// The first draft of this gate matched only the object-literal form and saw 102
// of the ~300 registered verbs. It reported no coverage problem and fifteen
// "phantom" capabilities pointing at commands that plainly exist — a gate that
// is confidently wrong, which is the failure mode `check-layer-boundaries.ts`
// records at length. Left as a comment because the symptom (phantoms, not
// silence) is what gave it away.
const HANDLER_TYPE_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

/** The acceptance suite whose phrasings the gate cross-checks (check 4). */
const ACCEPTANCE_SPEC = 'packages/ai-host/__tests__/capability-acceptance.test.ts';

/**
 * §R5-FLOOR (2026-08-11). This gate's headline is an ABSENCE — "UNDECLARED: 0".
 * That zero is computed as (registered bus commands) MINUS (declared ones), so an
 * empty left-hand side produces a perfect score: `git ls-files` returning nothing,
 * a HANDLER_GLOBS typo, or a cwd outside the checkout would each print
 * "UNDECLARED: 0 · ✓ all targets proven" over a repository it never read.
 *
 * MEASURED 2026-08-11 by this gate on this tree: 293 handler files matching
 * HANDLER_GLOBS, 321 registered bus commands, 50 chat capabilities. (The floor was
 * first written at 400 from the verb-register gate's 1,227 — a DIFFERENT sweep over
 * a wider glob — and tripped immediately. Recorded because it is the rule this file
 * keeps restating: the first number a floor prints is a measurement of the floor,
 * not of the code. The value below is this gate's own reading, halved.)
 */
const MIN_HANDLER_FILES = 150;
const MIN_REGISTERED_SUBJECTS = 150;
const MIN_CAPABILITY_SUBJECTS = 20;


/**
 * §GIT-CRASH-IS-MISCONFIG (2026-08-11, C9). `git ls-files` throwing — not a repo,
 * a broken index, git absent from PATH — propagated as an unhandled exception,
 * which node reports as EXIT 1: the same code a real violation produces, and
 * therefore absorbable by gate-debt.json. L-811 exactly. A gate that could not
 * list its subject has measured nothing, so this is exit 2, never 1.
 */
function gitLsFiles(cmd: string, maxBuffer: number, label: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer });
  } catch (err) {
    const first = (err as Error).message.split('\n')[0];
    console.error(
      `\n[${label}] MISCONFIGURED (exit 2) — git ls-files failed, so the subject could not be listed.`
      + `\n  cwd: ${process.cwd()}`
      + `\n  ${first}`
      + `\n  A gate that cannot enumerate its files has not judged them. This is NOT a pass.`,
    );
    process.exit(2);
  }
}

function registeredCommands(): Map<string, string> {
  // §FIX-GATE-BLIND-TO-UNTRACKED (L-837, 2026-08-11) — see check-command-naming.
  // Bare `git ls-files` is TRACKED-ONLY, so a newly written handler was invisible
  // here until it was staged. For THIS gate that is acute: its headline claim is
  // "every registered bus command is declared to the chat, UNDECLARED: 0". An
  // unstaged handler registering a new command could not be counted, so the zero
  // meant "zero among files git already knew about" — a weaker claim than the one
  // printed. `--exclude-standard` keeps .gitignore honoured.
  const files = gitLsFiles(
    `git ls-files --cached --others --exclude-standard -- ${HANDLER_GLOBS.map((g) => `"${g}"`).join(' ')}`,
    32 * 1024 * 1024,
    'check-chat-capability-coverage',
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__'));

  // §R5-FLOOR — the handler sweep must have reached its subject.
  if (files.length < MIN_HANDLER_FILES) {
    console.error(
      `\n[check-chat-capability-coverage] MISCONFIGURED (exit 2) — the handler sweep listed ${files.length} file(s); floor is ${MIN_HANDLER_FILES}.`
      + `\n  cwd: ${process.cwd()}`
      + `\n  "UNDECLARED: 0" is (registered − declared). With no handler files there is nothing to be`
      + `\n  undeclared, and this gate prints a perfect score over an unread tree. This is NOT a pass.`,
    );
    process.exit(2);
  }

  const out = new Map<string, string>();
  // §FIX-LSFILES-ENOENT-CRASH (L-837, 2026-08-11) — `git ls-files` lists the
  // INDEX, so a file tracked but deleted/moved in the working tree is named and
  // cannot be opened. Reading one threw ENOENT and killed this gate outright at
  // exit 1 — indistinguishable from a real coverage failure. Skipping silently
  // would be the mirror mistake (a vanished handler and a clean one reading the
  // same), so they are counted and disclosed below.
  let unreadable = 0;
  for (const file of files) {
    let src: string;
    try { src = readFileSync(file, 'utf8'); }
    catch { unreadable++; continue; }
    HANDLER_TYPE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HANDLER_TYPE_RE.exec(src)) !== null) {
      const verb = m[1] ?? m[2];
      if (verb !== undefined && !out.has(verb)) out.set(verb, file);
    }
  }
  // §FIX-LSFILES-ENOENT-CRASH (L-837) — disclosed, never swallowed. This gate's
  // headline is "UNDECLARED: 0 of 319 registered bus commands"; a handler file it
  // could not open is a command it could not count, so the zero would be over a
  // smaller set than the sentence claims.
  if (unreadable > 0) {
    console.warn(
      `[check-chat-capability-coverage] ⚠ ${unreadable} handler file(s) are tracked by git but`
      + ` absent from the working tree and were NOT scanned — any command they register is`
      + ` NOT included in the counts below.`,
    );
  }
  // §R5-FLOOR — files can be listed and still yield no subjects if HANDLER_TYPE_RE
  // stops matching the codebase's handler shape. That silently empties the
  // denominator of every ratio this gate prints.
  if (out.size < MIN_REGISTERED_SUBJECTS) {
    console.error(
      `\n[check-chat-capability-coverage] MISCONFIGURED (exit 2) — ${out.size} registered bus command(s) discovered across`
      + ` ${files.length} handler file(s); floor is ${MIN_REGISTERED_SUBJECTS}.`
      + `\n  The handler-shape regex no longer matches this codebase, so the coverage denominator is empty.`
      + `\n  This is NOT a pass.`,
    );
    process.exit(2);
  }
  return out;
}

/** A minimal ResolverContext selecting exactly one element of `kind`. */
function ctxSelecting(kind: string): ResolverContext {
  return {
    selection: [{ elementId: `probe-${kind}`, elementType: kind }],
    levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => 'probe-level',
  };
}

/** Check 3a — the executable target probe. Returns human-readable failures. */
function probeTargets(cap: ChatCapability): string[] {
  if (cap.targets === 'global') return [];
  const failures: string[] = [];
  for (const kind of PROBE_ELEMENT_KINDS) {
    let accepted: boolean;
    try {
      accepted = applySemanticIntent(cap.probe, ctxSelecting(kind)).kind !== 'refusal';
    } catch (err) {
      failures.push(`${cap.id}: probing target "${kind}" threw — ${String(err)}`);
      continue;
    }
    const declared = capabilityAppliesTo(cap, kind);
    if (declared && !accepted) {
      failures.push(
        `${cap.id}: DECLARES target "${kind}" but applySemanticIntent REFUSES it. ` +
        `This is the ElementCapabilities defect — remove the target or fix the guard.`,
      );
    } else if (!declared && accepted) {
      failures.push(
        `${cap.id}: ACCEPTS "${kind}" but does not declare it. Silent over-reach: ` +
        `either declare the target (and prove it in commandProof) or guard it.`,
      );
    }
  }
  return failures;
}

/** Check 3b — the source-anchored command proof (one proof per routed command). */
function proveCommandTargets(cap: ChatCapability): string[] {
  if (cap.targets === 'global') return [];
  const proofs = commandProofsOf(cap);
  if (proofs.length === 0) {
    return [`${cap.id}: declares element targets but no commandProof — the claim is unverifiable.`];
  }
  const failures: string[] = [];
  // RAC U7.3 — a capability may cite READ-SIDE proofs (the geometry builder
  // that consumes the written field), but it may never consist ONLY of them:
  // "the builder reads this field" proves nothing if no live command ever
  // writes it. At least one proof must sit in an EXECUTION-authority root.
  if (!proofs.some((p) => isExecutionAuthorityRoot(p.file))) {
    failures.push(
      `${cap.id}: every commandProof is READ-SIDE (a geometry builder). At least one proof must ` +
      `name the live command that WRITES the field — a read proof alone cannot show the chat ` +
      `changes anything.`,
    );
  }
  for (const proof of proofs) {
    if (!existsSync(proof.file)) {
      failures.push(`${cap.id}: commandProof.file "${proof.file}" does not exist.`);
      continue;
    }
    const src = readFileSync(proof.file, 'utf8');
    const missing = proof.mustMention.filter((needle) => !src.includes(needle));
    if (missing.length > 0) {
      failures.push(
        `${cap.id}: commandProof names ${proof.file}, but it never mentions ` +
        `${missing.map((s) => `"${s}"`).join(', ')} — the target claim is not proven by the command.`,
      );
    }
    failures.push(...proveRouteLiveness(cap, proof.file, src));
  }
  return failures;
}

/**
 * Check 3d — ROUTE LIVENESS (hard, zero tolerance). ADR-0315 U0.
 *
 * The §FIX-CHAT-DEAD-ROUTES incident (8447911f): thirteen dead routes shipped
 * across two sessions because proofs pinned target-KEYING while the handlers
 * `produceCommand`ed against DETACHED plugin DTO stores — fresh PluginRegistry
 * instances nothing in production reads, with no committer bridging updates
 * back (§FIX-MATERIAL-DEAD-DISPATCH). Chat said "Done" and changed nothing.
 *
 * This check classifies every commandProof file by EXECUTION AUTHORITY:
 *
 *   (i)   packages/command-registry/**            → LIVE by construction — the
 *         legacy commands mutate the geometry stores the fragment builders,
 *         plan projector, exporters and persistence read.
 *   (ii)  apps/editor/**                          → LIVE — app-registered
 *         handlers/bridges wired against the real runtime.
 *   (iii) plugins/** with the BRIDGE signature    → LIVE — the handler
 *         delegates to window.commandManager and declares `affectedStores`
 *         empty (undo lives on the legacy stack). Both literals must appear.
 *   (iv)  plugins/** on PLUGIN_LIVE_ALLOWLIST     → conditionally accepted;
 *         every entry carries a dated justification and is expected to SHRINK.
 *
 * Anything else FAILS — a plugin produceCommand store is presumed detached
 * until proven otherwise, because that presumption has been right 13/13 times.
 *
 * Negative-tested: pointing set-riser-height's proof at
 * plugins/stair/src/handlers/SetRiserHeight.ts (the dead per-field verb's
 * handler) fails with the dead-store message; restoring the
 * UpdateStairParametersCommand proof passes.
 */
// EMPTY since 2026-08-10 (§FIX-DIMS-REACH-RECORD, L-815): the one pending
// entry (plugins/wall UpdateWallDimensions.ts) was RESOLVED by the U1 auditor
// as DEAD — the plugin wall store is a fresh PluginRegistry instance nothing
// renders or persists, and its undo routing was asymmetric with the ring
// buffer. The verb now lives on an initBusHandlers legacy bridge and its
// proof points at the legacy command. Every future entry needs the same
// dated-evidence bar this one failed.
const PLUGIN_LIVE_ALLOWLIST: ReadonlyMap<string, string> = new Map([]);

/**
 * The roots where a command can actually MUTATE production state. Read-side
 * proofs (geometry builders) are deliberately NOT here — see the U7.3 note in
 * `proveCommandTargets`, which requires every capability to have at least one
 * proof that passes this predicate.
 */
function isExecutionAuthorityRoot(file: string): boolean {
  const norm = file.replace(/\\/g, '/');
  return norm.startsWith('packages/command-registry/')
    || norm.startsWith('apps/editor/')
    || norm.startsWith('plugins/');
}

function proveRouteLiveness(cap: ChatCapability, file: string, src: string): string[] {
  const norm = file.replace(/\\/g, '/');
  if (norm.startsWith('packages/command-registry/')) return [];
  if (norm.startsWith('apps/editor/')) return [];
  // (v) RAC U7.3 — packages/geometry-*/ → READ-SIDE proof. These packages are
  // pure builders: they contain no dispatch, no store writes and no command,
  // so they can never be an execution authority and are never accepted as the
  // only proof (proveCommandTargets enforces that). What they DO prove is the
  // half the §FIX-CHAT-DEAD-ROUTES model never covered: that the field being
  // written is actually READ by the geometry. A live command writing a field
  // nothing reads is the beam-height lie (`set-height` claimed beam while
  // BeamData has no height) — dead in the other direction, and equally
  // "Done"-over-nothing from the user's chair.
  if (/^packages\/geometry-[^/]+\//.test(norm)) return [];
  if (norm.startsWith('plugins/')) {
    const isBridge =
      src.includes('commandManager') &&
      (src.includes('affectedStores: [] as const') || src.includes('affectedStores = [] as const'));
    if (isBridge) return [];
    if (PLUGIN_LIVE_ALLOWLIST.has(norm)) return [];
    return [
      `${cap.id}: commandProof file "${norm}" is a PLUGIN handler with neither the legacy-bridge ` +
      `signature (commandManager + empty affectedStores) nor a PLUGIN_LIVE_ALLOWLIST entry. ` +
      `Plugin produceCommand stores are presumed DETACHED (§FIX-CHAT-DEAD-ROUTES, 13/13 dead so far) — ` +
      `route through the live legacy path, or allowlist it WITH dated liveness evidence.`,
    ];
  }
  return [
    `${cap.id}: commandProof file "${norm}" is outside every known execution-authority root ` +
    `(packages/command-registry, apps/editor, plugins) — liveness cannot be classified.`,
  ];
}

/**
 * Check 5 — PARAMETER SOURCE RESOLVABILITY (hard, zero tolerance).
 * Every declared parameter must name a KNOWN value source, and the probe must
 * actually carry a value of that source's shape — otherwise the probe proves
 * target behaviour with a parameter the capability could never resolve at
 * runtime, which is a claim nobody checked.
 */
const KNOWN_VALUE_SOURCES = new Set([
  'measurement', 'angle', 'wall-system-types', 'window-system-types', 'finish', 'project-levels', 'user-text', 'coordinates',
  // RAC U4.3 — door system types, resolved by `resolveDoorSystemTypeRef`
  // (command-registry) injected as ctx.resolveDoorSystemType by the bridge.
  'door-system-types',
  // RAC U7.2 — the two CATALOGUE FAMILIES whose catalogues already ship:
  // slabSystemTypeStore (4 built-ins) and ceilingSystemTypeStore (10),
  // resolved editor-side on the same resolveCatalogueRef ladder and injected
  // through the generic `ctx.catalogues` channel.
  'slab-system-types', 'ceiling-system-types',
  // ADR-0314 §Value sources — colour name / '#hex', resolved by the ONE table
  // in packages/ai-host/src/intents/colorRef.ts.
  'color',
  // ADR-0315 U2.5 — the spatial vocabulary. Declared now so U3 capabilities
  // are pure metadata; the probe-shape arms below activate with their first
  // consumer.
  'project-rooms', 'orientation', 'level-range',
  // ⭐ §FEAT-CHAT-LIGHTING-TYPES (L-10220) — and the TWO STALE ONES beside it.
  //
  // `stair-types` / `handrail-types` shipped with L-1441 on 2026-08-20 and were
  // never added here, so this gate has been reporting two of its own families as
  // *"unknown valueSource — nothing can resolve it"* ever since: a HARD arm
  // failing on capabilities that are correct, which is the gate lying about the
  // subject rather than the subject being wrong. Both resolve through
  // `publishedCatalogues.ts` and both are proved by CATALOGUE_SOURCES below.
  'stair-types', 'handrail-types', 'lighting-types',
]);

// ADR-0315 U2.5 — the scope modes a capability may declare in `scopeModes`.
// A spatial mode is a PROMISE the U3 ScopeResolver must honour; an unknown
// mode, or a list omitting the capability's own default scope, fails hard.
const KNOWN_SCOPE_MODES = new Set([
  'selection', 'all', 'global', 'level', 'room', 'orientation',
]);

function proveScopeModes(cap: ChatCapability): string[] {
  const modes = (cap as unknown as { scopeModes?: readonly string[] }).scopeModes;
  if (modes === undefined) return [];
  const failures: string[] = [];
  for (const m of modes) {
    if (!KNOWN_SCOPE_MODES.has(m)) {
      failures.push(`${cap.id}: unknown scope mode "${m}" — the resolver has no such scope.`);
    }
  }
  if (!modes.includes(cap.scope)) {
    failures.push(`${cap.id}: scopeModes must include the default scope "${cap.scope}".`);
  }
  return failures;
}

function proveParameterSources(cap: ChatCapability): string[] {
  const failures: string[] = [];
  const probe = cap.probe as unknown as Record<string, unknown>;
  for (const p of cap.parameters) {
    if (!KNOWN_VALUE_SOURCES.has(p.valueSource)) {
      failures.push(`${cap.id}.${p.name}: unknown valueSource "${p.valueSource}" — nothing can resolve it.`);
      continue;
    }
    if (!p.required) continue;
    const ok =
      p.valueSource === 'measurement' ? Object.values(probe).some((v) => typeof v === 'number')
      : p.valueSource === 'angle' ? (typeof probe['degrees'] === 'number' || typeof probe['angleDeg'] === 'number')
      : p.valueSource === 'wall-system-types' ? typeof probe['typeRef'] === 'string'
      : p.valueSource === 'window-system-types' ? typeof probe['typeRef'] === 'string'
      : p.valueSource === 'door-system-types' ? typeof probe['typeRef'] === 'string'
      : p.valueSource === 'slab-system-types' ? typeof probe['typeRef'] === 'string'
      : p.valueSource === 'ceiling-system-types' ? typeof probe['typeRef'] === 'string'
      : p.valueSource === 'finish' ? typeof probe['finishRef'] === 'string'
      // ADR-0315 U5a: duplicate-level carries its level refs as sourceQuery /
      // targetQueries — both resolved by the same findLevel authority.
      : p.valueSource === 'project-levels'
        ? typeof probe['levelQuery'] === 'string' ||
          typeof probe['sourceQuery'] === 'string' ||
          Array.isArray(probe['targetQueries'])
      : p.valueSource === 'coordinates' ? probe['start'] !== undefined && probe['end'] !== undefined
      : p.valueSource === 'color' ? typeof probe['colorRef'] === 'string'
      // ADR-0315 U2.5 — spatial value shapes (first consumers land with U3).
      : p.valueSource === 'project-rooms' ? typeof probe['roomRef'] === 'string'
      : p.valueSource === 'orientation' ? typeof probe['orientation'] === 'string'
      : p.valueSource === 'level-range' ? Array.isArray(probe['levelRange'])
      : /* user-text */ Object.values(probe).some((v) => typeof v === 'string' && v !== cap.id);
    if (!ok) {
      failures.push(
        `${cap.id}.${p.name}: required parameter (source "${p.valueSource}") is absent from the probe — ` +
        `the target proof runs with a parameter the capability cannot resolve.`,
      );
    }
  }
  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// C68 §6.3 CLOSURE PASS (2026-08-11) — the checks that turn review-only
// obligations into machine-enforced ones. Every ratchet below carries a dated
// justification naming what it counts, exactly like MAX_UNDECLARED.
// ─────────────────────────────────────────────────────────────────────────────

/** A resolver context the gate can drive the real ladder with. Deliberately
 *  carries NO catalogue injection: `resolveWallSystemType` and friends are
 *  editor-side, and every spec's value stage forwards the raw reference when
 *  they are absent — so the gate exercises the GRAMMAR and the SCOPE stages
 *  without owning a copy of the catalogues. Levels mirror the acceptance
 *  suite's three (0 / 3 / 6 m), because `add-level`'s occupied-elevation
 *  refusal is defined against exactly that ladder. */
let gateSeq = 0;
function gateCtx(
  selectionKind: string | null,
  resolveScope?: (d: ScopeDescriptor) => ScopeResult,
): ResolverContext {
  return {
    selection: selectionKind === null
      ? []
      : [{ elementId: `gate-${selectionKind}-1`, elementType: selectionKind }],
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    // §RAC-APARTMENT-IN-ROOM (L-1640, 2026-08-21) — the ROOMS snapshot
    // (ResolverContext.rooms) the bridge injects in production. The gate ctx
    // previously omitted this service entirely, so any example addressing a
    // room by its Room Schedule NUMBER ("on room 00-001") could only ever be
    // REFUSED here — measuring the harness, not the capability (the same
    // finding that added GATE_STUB_SCOPE). Two numbered rooms on the active
    // level, mirroring the level fixture above.
    rooms: [
      { id: 'gate-room-1', name: 'Room 00-001', roomNumber: '00-001', levelId: 'L0', areaM2: 24 },
      { id: 'gate-room-2', name: 'Room 00-002', roomNumber: '00-002', levelId: 'L0', areaM2: 18 },
    ],
    mintId: () => `gate-mint-${++gateSeq}`,
    // §FEAT-RAC-PROPERTY-QUERY (L-2210) — the property READER the bridge injects
    // in production. Without it every read-only property example could only ever
    // be answered "I cannot read element properties in this chat context", which
    // measures the HARNESS and not the capability — the same finding that added
    // GATE_STUB_SCOPE and the rooms fixture above. A fixed value is enough: the
    // question this gate asks is whether the sentence REACHES the capability,
    // and the value's correctness is propertyQuery.test.ts's subject.
    readProperty: () => ({ ok: true as const, value: 2.5 }),
    ...(resolveScope === undefined ? {} : { resolveScope }),
  } as ResolverContext;
}

/**
 * RAC U9.2 — the stub scope resolution the gate hands to families that declare
 * one. Three ids and a named level: enough for the arm to produce a real count
 * and a real label, and deliberately NOT enough to be mistaken for a model —
 * the question 4b asks is "does this example reach its own capability without
 * being refused", not "is the count right".
 */
const GATE_STUB_SCOPE = (): ScopeResult => ({
  ids: ['gate-scope-1', 'gate-scope-2', 'gate-scope-3'],
  kindCounts: {},
  skipped: [],
  diagnostics: ['Level 0'],
});

/** The FULL ladder the chat bridge uses, in the bridge's order. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, ctx);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

/**
 * ⭐ §FEAT-RAC-PROPERTY-QUERY (L-2210) — `'answer'` IS EXCLUDED, and the
 * narrowing restores what this predicate always MEANT.
 *
 * The adversarial corpus proves that a command-SHAPED sentence never MUTATES.
 * `kind: 'local'` was a sound proxy while every local action changed something —
 * undo, redo, setActiveLevel, applyVisibilityIntent and activateTool all do.
 * `'answer'` does not: `ZeroTokenResolver.ts` declares it the READ-ONLY class
 * (§GATE-QUERYENGINE-READ-ONLY) and the bridge's entire handling of it is
 * `case 'answer': break;` (`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts`) — no
 * dispatch, no store write, no view change. `visibility-query` has ridden that
 * action since 2026-08-11; it simply never appeared in this corpus.
 *
 * ⛔ THIS IS NOT A RELAXATION. A question that dispatches anything still fails,
 * which is the property every corpus row was written to defend — including
 * "highlight walls taller than 3m", the measured P0 where a READ-ONLY question
 * silently RESIZED GEOMETRY. That row resolves to a MISS, not to an answer, and
 * would still fail if it ever reached `set-height`. The mirror of this predicate
 * lives in the suite itself (`capability-acceptance.test.ts`), narrowed in the
 * same commit for the same reason, so the gate and the suite cannot disagree
 * about what "mutates" means.
 */
function mutates(r: ZeroTokenResolution): boolean {
  return r.kind === 'commands' || (r.kind === 'local' && r.action !== 'answer');
}

const CORPUS = readAcceptanceCorpus(ACCEPTANCE_SPEC);
const FAMILY_BY_ID = new Map(CORPUS.families.map((f) => [f.id, f]));

/**
 * ⚠ SHRINK-ONLY — check 4b, EXAMPLES THAT DO NOT RESOLVE IN THEIR FAMILY'S CTX.
 *
 * Baseline 1, frozen 2026-08-11. It was 5, then 11, then this, all on the same
 * day, and the middle number is the interesting one: RAC U9.2's six
 * scoped-delete examples ("delete all furniture in the kitchen", "clear the
 * furniture on this floor", "remove every window on level 2", "delete all
 * windows in the kitchen", "delete all doors on level 2", "delete all columns
 * on level 2") ALL failed this check while being perfectly correct in the app.
 *
 * That was the harness, not the resolver. Every scoped delete refuses without a
 * real scope resolver — that is the `requireResolvedIds` safety property doing
 * its job, since a Confirm card with no count may not be shown — and the gate
 * injected none. Raising the baseline to 11 would have recorded six healthy
 * capabilities as debt forever, so the reader was taught instead: an acceptance
 * family may now declare `scoped: true`, and the gate hands it a stub
 * `resolveScope` (GATE_STUB_SCOPE). The same fix retired set-wall-rake's
 * "tilt all walls on the ground floor by 60 degrees", and widening three wall
 * families from `ctx: {}` to `ctx: scopedSel('wall')` retired their three
 * selection-form examples — which is precisely what the old note said the fix
 * would be.
 *
 * The ONE that remains is a genuine family-context mismatch, not a resolver
 * defect:
 *
 *   • delete-selected  "remove this wall" — the family's ctx is sel('door'), so
 *     the resolver correctly answers "You asked to delete a wall, but the
 *     selected element is a door." A family cannot declare two selections at
 *     once; splitting it is the fix, and it costs a second family entry.
 *
 * Lowering this to 0 means splitting that family. It may never rise without
 * naming the new example here AND stating why the context cannot be widened.
 */
const MAX_UNRESOLVED_EXAMPLES = Number(process.env.PRYZM_CHAT_MAX_UNRESOLVED_EXAMPLES ?? 1);

/**
 * ⚠ SHRINK-ONLY — check 4c, CAPABILITIES WITH NO ADVERSARIAL PIN.
 *
 * Baseline 9, frozen 2026-08-11. A capability is PINNED when the declared
 * adversarial corpus contains at least one utterance carrying one of its verbs,
 * aliases or refusal label — a command-SHAPED sentence aimed at it that must
 * not mutate. **36 of 45 are pinned** (re-measured 2026-08-11 by running this
 * gate; the comment said "32 of 41" — the denominator moved 41 → 45 in two days,
 * which is exactly why the gate PRINTS the ratio on every run: read the run
 * output, not this sentence). The unpinned count is unchanged at 9. The nine
 * named below were correct at the 41-capability reading and have NOT been
 * re-verified name-by-name — the gate does not yet emit the names, so treat the
 * list as indicative and the count as authoritative:
 *
 *   redo · zoom-fit · zoom-selected · set-wall-rake · add-wall-layer ·
 *   duplicate-level · rename-room · finish-apartment-chain · execute-plan
 *
 * and two of them matter most: `duplicate-level` and `execute-plan` are the
 * capabilities the §FIX-CHAT-REPORT-PASTEBACK sentences come CLOSEST to
 * reaching, since a pasted report line is exactly a level/plan-shaped noun
 * phrase. Whoever writes them must add the utterance to the acceptance suite's
 * adversarial `it.each` — the gate then executes it automatically.
 *
 * ⚠ WHAT THE PIN HEURISTIC CANNOT SEE: it matches VERBS and ALIASES, so an
 * adversarial sentence that attacks a capability without using any of its
 * declared words counts as no pin, and one that happens to share a common verb
 * ("change", "set") counts as a pin for every capability declaring that verb.
 * It measures whether anyone has aimed a hostile sentence at the capability's
 * own vocabulary — not the strength of the attack.
 *
 * This is the honest half of C68 §5.f: the corpus itself is executed HARD (any
 * mutation fails, zero tolerance); what is ratcheted is the COVERAGE of that
 * corpus across capabilities, because writing a new pin requires editing the
 * acceptance suite, which this pass does not own.
 */
const MAX_UNPINNED_CAPABILITIES = Number(process.env.PRYZM_CHAT_MAX_UNPINNED ?? 9);

/**
 * ⚠ SHRINK-ONLY — check 5c, SPATIAL MODES HONOURED BUT NOT DECLARED.
 *
 * Baseline 24, frozen 2026-08-11 (was 20 the same day; RAC U9.2 added the four
 * scoped-delete families, each honouring `orientation` without declaring it —
 * the identical mechanism as the twenty below, for the identical reason: the
 * arm handles the superset, and no delete grammar produces "all south-facing
 * windows". Declaring the mode instead would have been the ElementCapabilities
 * lie, advertising a sentence nobody can type).
 *
 * `applyExecutionSpec` handles the scope
 * SUPERSET with one implementation (that is the whole point of U4), so every
 * spec-driven capability's ARM accepts a level / room / orientation descriptor
 * whether or not its `scopeModes` claims one. The 20 counted are six
 * capabilities × three modes — set-wall-type, add-wall-layer, set-window-type,
 * set-door-type, set-slab-type, set-ceiling-type — plus
 * create-windows-parametric on room + orientation (it already declares 'level').
 *
 * ⚠ WHAT THIS NUMBER IS NOT. It is ARM reach, not LANGUAGE reach: the gate
 * injects the descriptor directly, bypassing the grammar, and no grammar
 * produces "in the kitchen" for `set-slab-type` today. So this is NOT the
 * ElementCapabilities lie — nothing user-visible over-claims. It is the
 * distance between what the generic arm can do and what the registry says it
 * can, and it shrinks either by declaring the mode (once the grammar produces
 * it) or by narrowing the arm. It may not rise silently.
 */
// ⚠ TIGHTENED 26 -> 2 on 2026-08-19 (lane RAC1, L-1142). Nine capabilities
// declared the spatial modes their arms already honoured — the founder's
// "BY LEVEL, BY ROOM" worked and the registry denied it, so the "what I CAN
// do" answer under-reported the system (EI-9 in the reporting direction, the
// mirror of L-998). ⭐ The remaining 2 are `create-windows-parametric`'s room
// and orientation, and they are DELIBERATELY undeclared: this lane declared
// them, the SYMMETRIC arm below refused within the minute ("declares scope
// mode 'room' but the resolver received a 'level' descriptor"), and they were
// rolled back rather than forced. The window-creation grammar resolves a LEVEL
// descriptor for every spatial phrase; declaring more would be the
// ElementCapabilities lie in a new costume (C68 §7.d). They shrink to 0 when
// the GRAMMAR honours them — not before.
// C67 §4 rule 9: a baseline is not permission; it is a debt with a name.
const MAX_UNDECLARED_SPATIAL_REACH = Number(process.env.PRYZM_CHAT_MAX_SPATIAL_REACH ?? 2);

/**
 * ⚠ SHRINK-ONLY — check 3e, GLOBAL CAPABILITIES WHOSE ROUTE IS UNCLASSIFIED.
 *
 * Baseline 1, frozen 2026-08-11, and it is `create-wall` → `wall.create` →
 * `plugins/wall/src/handlers/CreateWall.ts`: a plugin handler that
 * `produceCommand`s against the plugin `wall` store with
 * `affectedStores = ['wall'] as const` and NO `commandManager` delegation — the
 * exact signature §FIX-CHAT-DEAD-ROUTES found dead 13/13 times. It is NOT
 * asserted dead here: `composeRuntime` registers this handler as the
 * authoritative one and the P1 wall path is the flagship plugin route, so the
 * presumption that condemned the DTO stores may not hold. What is true is that
 * NOBODY HAS PROVEN IT EITHER WAY, and until someone does, the honest state is
 * "unclassified", not "live". Lower this to 0 by supplying `create-wall` with a
 * `commandProof` naming the committer that carries plugin wall patches into the
 * geometry store — or by re-routing the verb, as L-815 did for
 * `wall.updateDimensions`.
 */
const MAX_UNCLASSIFIED_GLOBAL_ROUTES = Number(process.env.PRYZM_CHAT_MAX_UNCLASSIFIED_GLOBAL ?? 1);

/**
 * ⚠ SHRINK-ONLY — check 8, HAND-WRITTEN RESOLVER CASE ARMS (C68 §6.3-G5).
 *
 * Baseline 27, frozen 2026-08-11 — the `case '<intent>':` arms in
 * `applySemanticIntent`'s switch. C68 §5.i's target is "zero new resolver case
 * code": a batch-shaped capability is a `CapabilityExecutionSpec` row and a
 * property is a `PropertyVocabulary` row, both served by ONE generic arm.
 *
 * A git-diff check ("a new capability id in the same commit as a new case arm")
 * was considered and rejected: it needs a reliable merge base, it is silent on
 * a two-commit PR, and it says nothing at all when run on a clean tree. A count
 * that may not rise is weaker per-commit but true on every run, and it fails
 * the same PR the diff check would have.
 *
 * WHAT IT CANNOT SEE: LOC inside an existing arm. An author who grows
 * `case 'set-height'` by 200 lines passes. It measures the number of shapes the
 * resolver hand-writes, which is the thing §5.i is actually about.
 */
const MAX_RESOLVER_CASE_ARMS = Number(process.env.PRYZM_CHAT_MAX_CASE_ARMS ?? 27);

/**
 * ⚠ SHRINK-ONLY — check 9, PANEL-EDITABLE PROPERTIES THE CHAT CANNOT REACH.
 *
 * Baseline 42, frozen 2026-08-11 (C68 §6.3-G1). The coverage ratchet counts bus
 * VERBS, so a new ATTRIBUTE routed through `element.updateParameters` trips
 * nothing — C68 §4 case 3, stated there as undetected. This is the strongest
 * enumeration that is honestly derivable:
 *
 *   • the PROPERTY SURFACE is the `SCHEMAS` table in
 *     `apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts` — every
 *     non-READONLY row, which is exactly the set of fields the panel writes
 *     through `element.updateParameters` (PropertyPanel.ts line ~953).
 *   • the CHAT SURFACE is DERIVED BY EXECUTION, not declared: every capability
 *     probe is run against every kind it declares, and the parameter names in
 *     the resulting bus payloads are collected. Nothing is transcribed.
 *
 * ⚠ WHAT IT CANNOT SEE, stated so nobody reads this as full coverage:
 *   1. fields rendered by DEDICATED sections rather than the schema table —
 *      `WindowSection` / `DoorSection` own width/height/sillHeight/type/colour
 *      and the table says so in its own comments, so window and door look far
 *      emptier here than they are;
 *   2. a new field on a `*Data` SCHEMA that no panel row exposes — invisible to
 *      the panel and therefore to this check;
 *   3. fields written by a dedicated verb rather than the generic one;
 *   4. whether a reachable field is LIVE — that is checks 3b/3d's job.
 * It answers ONE question honestly: which properties can a user edit by hand
 * but not by sentence. That number may only fall.
 */
const MAX_UNREACHABLE_PROPERTIES = Number(process.env.PRYZM_CHAT_MAX_UNREACHABLE_PROPS ?? 42);

/** Every path in this gate is repo-relative; it is invoked from the repo root. */
const REPO_ROOT = '.';
const RESOLVER_FILE = 'packages/ai-host/src/intents/ZeroTokenResolver.ts';

/**
 * Check 7 — CATALOGUE SOURCE RESOLVABILITY (hard, zero tolerance).
 * C68 §5.h/§6.3-G8: a capability whose parameter draws on a catalogue must name
 * a catalogue whose RESOLVER really exists. `KNOWN_VALUE_SOURCES` proves the
 * source is spelled correctly; this proves something answers to it. A dangling
 * reference is the c1902a5a defect facing the other way — the chat would parse
 * a type name and have nothing to resolve it against.
 */
const CATALOGUE_SOURCES: ReadonlyMap<string, { file: string; exported: string }> = new Map([
  ['wall-system-types', {
    file: 'packages/command-registry/src/walls/UpdateWallsSystemTypeBatchCommand.ts',
    exported: 'resolveWallSystemTypeRef',
  }],
  ['window-system-types', {
    file: 'packages/command-registry/src/windows/UpdateWindowsSystemTypeBatchCommand.ts',
    exported: 'resolveWindowSystemTypeRef',
  }],
  ['door-system-types', {
    file: 'packages/command-registry/src/doors/UpdateDoorsSystemTypeBatchCommand.ts',
    exported: 'resolveDoorSystemTypeRef',
  }],
  ['slab-system-types', {
    file: 'packages/command-registry/src/slabs/UpdateSlabsSystemTypeBatchCommand.ts',
    exported: 'resolveSlabSystemTypeRef',
  }],
  ['ceiling-system-types', {
    file: 'packages/command-registry/src/ceilings/UpdateCeilingsSystemTypeBatchCommand.ts',
    exported: 'resolveCeilingSystemTypeRef',
  }],
  ['color', {
    file: 'packages/ai-host/src/intents/colorRef.ts',
    exported: 'resolveColorRef',
  }],
  ['finish', {
    file: 'packages/ai-host/src/intents/finishRef.ts',
    exported: 'resolveFinishRef',
  }],
  // §FEAT-CHAT-STAIR-TYPES (L-1441) / §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the
  // three families whose catalogue is a PUBLISHED L2 table read by the pure
  // resolver rather than injected by the editor bridge. Same obligation: the
  // reader must exist, or the chat parses a type name with nothing behind it.
  ['stair-types', {
    file: 'packages/ai-host/src/intents/publishedCatalogues.ts',
    exported: 'publishedStairTypeCatalogue',
  }],
  ['handrail-types', {
    file: 'packages/ai-host/src/intents/publishedCatalogues.ts',
    exported: 'publishedRailingTypeCatalogue',
  }],
  ['lighting-types', {
    file: 'packages/ai-host/src/intents/publishedCatalogues.ts',
    exported: 'publishedLightingTypeCatalogue',
  }],
]);

function proveCatalogueSources(cap: ChatCapability): string[] {
  const failures: string[] = [];
  for (const p of cap.parameters) {
    const src = CATALOGUE_SOURCES.get(p.valueSource);
    if (src === undefined) continue; // not a catalogue-backed source
    if (!existsSync(src.file)) {
      failures.push(
        `${cap.id}.${p.name}: valueSource "${p.valueSource}" names ${src.file}, which does not exist — ` +
        `the catalogue reference is DANGLING and nothing could resolve a type name at runtime.`,
      );
      continue;
    }
    const text = readFileSync(src.file, 'utf8');
    if (!new RegExp(String.raw`export\s+(?:async\s+)?(?:function|const|class)\s+${src.exported}\b`).test(text)) {
      failures.push(
        `${cap.id}.${p.name}: ${src.file} no longer exports "${src.exported}" — ` +
        `the ONE resolveCatalogueRef ladder entry point for "${p.valueSource}" moved or was renamed.`,
      );
    }
  }
  return failures;
}

/**
 * Check 6 — ONE DISPATCH + HONEST REPORT (hard, zero tolerance).
 * C68 §6.3-G4/G6. A full "one undo" proof needs a runtime; this is the half
 * that is statically and executably provable:
 *
 *   (a) ONE DISPATCH. A capability whose scope is (or can be) 'all' is a mass
 *       edit. Run its probe at scope 'all' and require EXACTLY ONE bus command.
 *       ADR-0314: `runBatch` is undo-NEUTRAL, so N commands are N history
 *       entries — a fan-out that calls itself one undo is anti-pattern §7.f.
 *   (b) HONEST REPORT. The command that carries the mass edit must speak the
 *       partial-outcome vocabulary ("skipped" / "N of M"), so §5.g's
 *       "Changed N of M — K skipped" is read off a real report payload rather
 *       than narrated by the chat.
 *
 * WHAT IT CANNOT SEE: whether the one command actually pushes ONE history entry
 * at runtime, and whether the report payload is populated truthfully. Both are
 * runtime facts; C68 §6.3 keeps saying so.
 */
const HONEST_REPORT_NEEDLES = ['skipped', 'skippedCount', ' of '];

function proveOneDispatchAndHonestReport(cap: ChatCapability): string[] {
  const modes = (cap as unknown as { scopeModes?: readonly string[] }).scopeModes ?? [];
  const massEdit = cap.scope === 'all' || modes.includes('all');
  if (!massEdit) return [];
  const failures: string[] = [];

  let result;
  try {
    result = applySemanticIntent(
      { ...(cap.probe as unknown as Record<string, unknown>), scope: 'all' } as unknown as SemanticIntent,
      gateCtx(null),
    );
  } catch (err) {
    return [`${cap.id}: probing the 'all' scope threw — ${String(err)}`];
  }
  if (result.kind === 'commands' && result.commands.length !== 1) {
    failures.push(
      `${cap.id}: a mass edit dispatched ${result.commands.length} bus commands, not one. ` +
      `ADR-0314 — runBatch is undo-NEUTRAL, so N commands are N undo steps. Name a true batch verb ` +
      `or stop describing this as a single undo (C68 §7.f).`,
    );
  }

  const proofs = commandProofsOf(cap);
  const files = proofs.length > 0
    ? proofs.map((p) => p.file)
    : cap.busCommand !== null && registered.has(cap.busCommand)
      ? [registered.get(cap.busCommand)!]
      : [];
  if (files.length === 0) {
    failures.push(`${cap.id}: a mass edit with no proof file — the partial-outcome claim is unverifiable.`);
    return failures;
  }
  const speaks = files.some((f) => {
    if (!existsSync(f)) return false;
    const text = readFileSync(f, 'utf8');
    return HONEST_REPORT_NEEDLES.some((n) => text.includes(n));
  });
  if (!speaks) {
    failures.push(
      `${cap.id}: none of its proof files (${files.join(', ')}) mention a partial outcome ` +
      `(${HONEST_REPORT_NEEDLES.map((n) => `"${n.trim()}"`).join(' / ')}). C68 §5.g — success is reported as ` +
      `"Changed N of M — K skipped: <reason>", read off the command's own report, never re-narrated.`,
    );
  }
  return failures;
}

/**
 * Check 5c — SCOPE MODES HONOURED (C68 §6.3-G3).
 * Returns [hard failures, undeclared-but-honoured (kind, mode) pairs].
 */
const SPATIAL_PROBE_SCOPES: ReadonlyMap<string, unknown> = new Map([
  ['level', { kind: 'level', levelQuery: '2' }],
  ['room', { kind: 'room', roomRef: 'kitchen' }],
  ['orientation', { kind: 'orientation', orientation: 'S' }],
]);

function proveScopeModesHonoured(cap: ChatCapability): {
  failures: string[];
  undeclaredReach: string[];
} {
  const modes = (cap as unknown as { scopeModes?: readonly string[] }).scopeModes ?? [];
  const failures: string[] = [];
  const undeclaredReach: string[] = [];

  for (const [mode, scope] of SPATIAL_PROBE_SCOPES) {
    const si = {
      ...(cap.probe as unknown as Record<string, unknown>),
      scope,
    } as unknown as SemanticIntent;

    let seen: ScopeDescriptor | null = null;
    let withResolver;
    try {
      withResolver = applySemanticIntent(si, gateCtx(null, (d) => {
        seen = d;
        return { ids: ['gate-a', 'gate-b'], kindCounts: {}, skipped: [], diagnostics: ['Level 2'] };
      }));
    } catch (err) {
      if (modes.includes(mode)) {
        failures.push(`${cap.id}: declares scope mode "${mode}" but driving it threw — ${String(err)}`);
      }
      continue; // a throw is not "honoured"
    }

    const honoured = withResolver.kind === 'commands' && seen !== null;

    if (modes.includes(mode)) {
      if (seen === null) {
        failures.push(
          `${cap.id}: DECLARES scope mode "${mode}" but the intent never reached ctx.resolveScope ` +
          `(got ${withResolver.kind}). A declared spatial mode the resolver never sees is the ` +
          `ElementCapabilities lie one layer over (C68 §7.d).`,
        );
      } else if ((seen as ScopeDescriptor).kind !== mode
        && !((seen as ScopeDescriptor).kind === 'filter')) {
        failures.push(
          `${cap.id}: declares scope mode "${mode}" but the resolver received a ` +
          `"${(seen as ScopeDescriptor).kind}" descriptor.`,
        );
      } else if (withResolver.kind !== 'commands') {
        failures.push(
          `${cap.id}: declares scope mode "${mode}" and the descriptor reached the resolver, ` +
          `but the result was ${withResolver.kind}, not a dispatch.`,
        );
      }
      // The ABSENT-resolver half: honest refusal, NEVER a silent widen to 'all'.
      let withoutResolver;
      try {
        withoutResolver = applySemanticIntent(si, gateCtx(null));
      } catch (err) {
        failures.push(`${cap.id}: scope mode "${mode}" threw with no resolver injected — ${String(err)}`);
        continue;
      }
      if (withoutResolver.kind !== 'refusal') {
        failures.push(
          `${cap.id}: with NO resolveScope injected, scope mode "${mode}" produced ` +
          `"${withoutResolver.kind}" instead of an honest refusal. A spatial ask that silently ` +
          `becomes "all" is the granularity anti-pattern (C68 §7.e).`,
        );
      }
    } else if (honoured) {
      undeclaredReach.push(`${cap.id} honours "${mode}" without declaring it`);
    }
  }
  return { failures, undeclaredReach };
}

/**
 * Check 9 — the PROPERTY SURFACE (C68 §6.3-G1). See MAX_UNREACHABLE_PROPERTIES
 * for what this enumeration can and cannot see.
 */
function panelEditableProperties(): Map<string, Set<string>> {
  // §FEAT-RAC-PROPERTY-QUERY (L-2211) — the parser MOVED to
  // `lib/panelPropertySurface.ts`, unchanged, because a SECOND gate now needs
  // the same denominator: `check-property-rac-matrix` asks whether a property a
  // user can see is ASKABLE, this one asks whether it is SETTABLE, and two gates
  // computing "what the panel offers" from two copies of one regex is the
  // two-sources-of-truth defect that the one which drifts hides silently.
  //
  // ⛔ THIS CALL IS DELIBERATELY HALF A ONLY — the SCHEMAS table — so this
  // check's reading does not move. The shared module ALSO reads the dedicated
  // WindowSection / DoorSection / RoofPropertySheet panels (limit (1) of
  // MAX_UNREACHABLE_PROPERTIES above, which is real and large: the window's
  // whole dimension set lives there). Folding them in here would be a genuine
  // widening of THIS ratchet and belongs in its own commit with its own
  // re-baselining decision, not as a side effect of extracting a function.
  const out = new Map<string, Set<string>>();
  for (const [rawKind, fields] of schemaTableProperties(REPO_ROOT)) {
    out.set(normalizeElementKind(rawKind), fields);
  }
  return out;
}

/** Payload field names a capability can actually WRITE, derived by executing
 *  its probe against every kind it declares. Descends one level into the
 *  generic carriers (`parameters`, `updates`, `properties`). */
function chatReachableProperties(caps: readonly ChatCapability[]): Set<string> {
  const IDS_FIELD = /^(elementId|elementType|id|ids|source|mode|side|.*Ids|.*Id)$/;
  const reachable = new Set<string>();
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
        if (carriers.length > 0) {
          for (const carrier of carriers) {
            for (const key of Object.keys(carrier)) reachable.add(`${kind}.${key}`);
          }
        }
        for (const key of Object.keys(payload)) {
          if (IDS_FIELD.test(key)) continue;
          if (key === 'parameters' || key === 'updates' || key === 'properties') continue;
          reachable.add(`${kind}.${key}`);
        }
      }
    }
  }
  return reachable;
}

// ── Run ──────────────────────────────────────────────────────────────────────

const caps = allChatCapabilities();
const registered = registeredCommands();

// 1. Coverage.
const covered = new Set<string>();
for (const c of caps) {
  if (c.busCommand !== null) covered.add(c.busCommand);
  for (const extra of c.alsoDispatches ?? []) covered.add(extra);
}
const undeclared = [...registered.keys()]
  .filter((t) => !covered.has(t) && !CHAT_UNAVAILABLE.has(t) && !CHAT_CLASSIFIED.has(t))
  .sort();

// 1b. Classification consistency (hard): the three declaration surfaces are
// DISJOINT, and nothing classified is stale (unregistered) — a stale entry
// would silently re-declare a command that no longer exists.
const classificationFailures: string[] = [];
for (const cmd of CHAT_CLASSIFIED.keys()) {
  if (!registered.has(cmd)) {
    classificationFailures.push(`"${cmd}" is classified but not a registered bus command — stale entry.`);
  }
  if (covered.has(cmd)) {
    classificationFailures.push(`"${cmd}" is BOTH a capability dispatch and classified — pick one.`);
  }
  if (CHAT_UNAVAILABLE.has(cmd)) {
    classificationFailures.push(`"${cmd}" is BOTH in CHAT_UNAVAILABLE and classified — pick one.`);
  }
}
for (const [cmd, c] of CHAT_CLASSIFIED) {
  if (c.reason.trim().length < 40) {
    classificationFailures.push(`"${cmd}": classification reason is too thin to be falsifiable.`);
  }
}

// 2. Phantom capabilities.
const phantoms: string[] = [];
for (const c of caps) {
  const claims = [c.busCommand, ...(c.alsoDispatches ?? [])].filter((x): x is string => x !== null);
  for (const claim of claims) {
    if (!registered.has(claim)) {
      phantoms.push(`${c.id} → "${claim}" is not a registered bus command.`);
    }
  }
  // §PLAN (RAC U6) — a COMPOSITE capability legitimately dispatches no command
  // of its own: it composes other declared capabilities and dispatches THEIR
  // commands (`execute-plan`, compound sentences). Everything else with a null
  // busCommand and no localAction is the c1902a5a defect and still fails.
  if (c.busCommand === null && c.localAction === undefined && c.composite !== true) {
    phantoms.push(`${c.id}: busCommand is null but no localAction is declared — it does nothing.`);
  }
  // A composite must not ALSO claim commands — its coverage is its steps'.
  if (c.composite === true && (c.busCommand !== null || (c.alsoDispatches ?? []).length > 0)) {
    phantoms.push(
      `${c.id}: declares composite:true but also claims bus commands — a composite's coverage ` +
      `belongs to the capabilities it composes, or it is not a composite.`,
    );
  }
}
// The unconnected-topic table must point at real, explicitly-deferred commands
// too, or a generated refusal names a gap that does not exist.
for (const cmd of unconnectedTopicCommands()) {
  if (!registered.has(cmd)) {
    phantoms.push(`CapabilityRefusal topic → "${cmd}" is not a registered bus command.`);
  } else if (!CHAT_UNAVAILABLE.has(cmd)) {
    phantoms.push(
      `CapabilityRefusal topic → "${cmd}" is refused by the language table but not listed in ` +
      `CHAT_UNAVAILABLE — the two halves of the same decision disagree.`,
    );
  }
}

// 3. Targets.
const targetFailures = caps.flatMap((c) => [...probeTargets(c), ...proveCommandTargets(c)]);

// 5. Parameter sources.
const parameterFailures = caps.flatMap((c) => [...proveParameterSources(c), ...proveScopeModes(c)]);

// 3c. Normalization sanity: a declared target must survive normalizeElementKind,
// or `capabilityAppliesTo` silently answers false forever.
for (const c of caps) {
  if (c.targets === 'global') continue;
  for (const t of c.targets) {
    if (normalizeElementKind(t) !== t) {
      targetFailures.push(`${c.id}: target "${t}" is not in normalized form ("${normalizeElementKind(t)}").`);
    }
    if (!PROBE_ELEMENT_KINDS.includes(t)) {
      targetFailures.push(`${c.id}: target "${t}" is outside PROBE_ELEMENT_KINDS, so it is never probed.`);
    }
  }
}

// 4. Acceptance coverage.
const acceptanceFailures: string[] = [];
if (!existsSync(ACCEPTANCE_SPEC)) {
  acceptanceFailures.push(`the acceptance suite ${ACCEPTANCE_SPEC} does not exist.`);
} else {
  const spec = readFileSync(ACCEPTANCE_SPEC, 'utf8');
  for (const c of caps) {
    if (c.examples.length === 0) {
      acceptanceFailures.push(`${c.id}: declares no examples — nothing proves the phrasing resolves.`);
      continue;
    }
    if (!spec.includes(`'${c.id}'`) && !spec.includes(`"${c.id}"`)) {
      acceptanceFailures.push(`${c.id}: not referenced by ${ACCEPTANCE_SPEC}.`);
    }
  }
}

// 3e. GLOBAL ROUTE LIVENESS (C68 §6.3-G7). Checks 3a/3b/3d return early for
// `targets: 'global'`, so a global capability's route was never classified by
// execution authority. Prefer its declared commandProof; fall back to the
// HANDLER file that registers the verb, which the coverage scan already knows.
const unclassifiedGlobalRoutes: string[] = [];
const globalRouteFailures: string[] = [];
for (const c of caps) {
  if (c.targets !== 'global') continue;
  if (c.busCommand === null) continue; // local actions + composites: no route to classify
  const proofs = commandProofsOf(c);
  const files = proofs.length > 0
    ? proofs.map((p) => p.file)
    : registered.has(c.busCommand) ? [registered.get(c.busCommand)!] : [];
  if (files.length === 0) {
    globalRouteFailures.push(
      `${c.id}: global capability claims "${c.busCommand}" but neither a commandProof nor a ` +
      `registering handler file can be found — its route cannot be classified at all.`,
    );
    continue;
  }
  for (const file of files) {
    if (!existsSync(file)) {
      globalRouteFailures.push(`${c.id}: route file "${file}" does not exist.`);
      continue;
    }
    const problems = proveRouteLiveness(c, file, readFileSync(file, 'utf8'));
    for (const p of problems) unclassifiedGlobalRoutes.push(p);
  }
}

// 4b/4c. ACCEPTANCE EXECUTION + THE ADVERSARIAL CORPUS (C68 §6.3-G2).
const missingFamilies: string[] = [];
const unresolvedExamples: string[] = [];
let examplesRun = 0;
for (const c of caps) {
  const family = FAMILY_BY_ID.get(c.id);
  if (family === undefined) {
    missingFamilies.push(
      `${c.id}: no acceptance FAMILY in ${ACCEPTANCE_SPEC} — the id is not enough; the gate needs the ` +
      `family's declared context to execute the capability's own examples.`,
    );
    continue;
  }
  for (const example of c.examples) {
    examplesRun += 1;
    let r: ZeroTokenResolution;
    try {
      // RAC U9.2 — a family that declares `scoped: true` gets the stub scope
      // resolver its ctx injects in the suite. Without this the gate could
      // only ever report "spatial scoping isn't wired into this chat context"
      // for every spatially-scoped example, which measures the HARNESS, not
      // the capability — and for the scoped-delete families, whose safety
      // property (`requireResolvedIds`) makes a resolver mandatory even for
      // "delete all furniture", it would have been every example they have.
      r = resolveFull(
        example,
        gateCtx(family.selectionKind, family.declaresScopeResolver ? GATE_STUB_SCOPE : undefined),
      );
    } catch (err) {
      unresolvedExamples.push(`${c.id}: example "${example}" threw — ${String(err)}`);
      continue;
    }
    const landed = intentOf(r);
    if (landed !== c.id) {
      unresolvedExamples.push(
        `${c.id}: example "${example}" resolved to ${landed ?? r.kind}, not to itself.`,
      );
    } else if (r.kind === 'refusal') {
      unresolvedExamples.push(
        `${c.id}: example "${example}" is REFUSED in the context its acceptance family declares ` +
        `(${family.selectionKind === null ? 'no selection' : `selection = ${family.selectionKind}`}) — ` +
        `"${r.reason.slice(0, 110)}"`,
      );
    }
  }
}

const adversarialMutations: string[] = [];
if (CORPUS.adversarial.length === 0) {
  adversarialMutations.push(
    `the adversarial corpus in ${ACCEPTANCE_SPEC} could not be read — the gate is checking NOTHING ` +
    `where it claims to check the paste-back and stopword guards.`,
  );
}
for (const utterance of CORPUS.adversarial) {
  // Driven with a wall selected, exactly as the suite does: the sentences are
  // command-SHAPED, so an empty selection would mask a mutation as a refusal.
  const ctx = gateCtx('wall');
  const tier01 = resolveUtterance(utterance, ctx);
  if (mutates(tier01)) {
    adversarialMutations.push(`tier 0/1 MUTATED on "${utterance}" (intent ${intentOf(tier01)}).`);
    continue;
  }
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved' && mutates(nl.resolution)) {
    adversarialMutations.push(`the NL layer MUTATED on "${utterance}" (intent ${intentOf(nl.resolution)}).`);
  }
}

// Per-capability adversarial PIN coverage — the ratcheted half.
const adversarialLower = CORPUS.adversarial.map((s) => s.toLowerCase());
const unpinned: string[] = [];
for (const c of caps) {
  const needles = [...c.verbs, ...c.aliases, ...(c.refusalLabel === undefined ? [] : [c.refusalLabel])]
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 4);
  const pinned = needles.some((n) => adversarialLower.some((u) => u.includes(n)));
  if (!pinned) unpinned.push(c.id);
}

// 5c. SCOPE MODES HONOURED (C68 §6.3-G3).
const scopeHonourFailures: string[] = [];
const undeclaredSpatialReach: string[] = [];
let scopeProbes = 0;
for (const c of caps) {
  const modes = (c as unknown as { scopeModes?: readonly string[] }).scopeModes ?? [];
  scopeProbes += modes.filter((m) => SPATIAL_PROBE_SCOPES.has(m)).length;
  const { failures, undeclaredReach } = proveScopeModesHonoured(c);
  scopeHonourFailures.push(...failures);
  undeclaredSpatialReach.push(...undeclaredReach);
}

// 6. ONE DISPATCH + HONEST REPORT (C68 §6.3-G4/G6).
const massEditFailures = caps.flatMap((c) => proveOneDispatchAndHonestReport(c));

// 7. CATALOGUE SOURCE RESOLVABILITY (C68 §6.3-G8).
const catalogueFailures = caps.flatMap((c) => proveCatalogueSources(c));

// 8. RESOLVER CASE-ARM RATCHET (C68 §6.3-G5).
const resolverCaseArms = existsSync(RESOLVER_FILE)
  ? (readFileSync(RESOLVER_FILE, 'utf8').match(/\n {4}case '[a-z0-9-]+':/g) ?? []).length
  : -1;

// 9. PROPERTY SURFACE RATCHET (C68 §6.3-G1).
const panelProperties = panelEditableProperties();
const chatProperties = chatReachableProperties(caps);
const unreachableProperties: string[] = [];
for (const [kind, fields] of panelProperties) {
  for (const field of fields) {
    if (!chatProperties.has(`${kind}.${field}`)) unreachableProperties.push(`${kind}.${field}`);
  }
}
unreachableProperties.sort();

// ── Report ───────────────────────────────────────────────────────────────────

console.log('[check-chat-capability-coverage] §FIX-CHAT-CAPABILITY-BLIND (ADR-0313)');
// §R5-FLOOR — the OTHER subject. Every per-capability proof (targets, liveness,
// scope modes, examples, adversarial utterances) iterates `caps`. An empty
// registry proves all of them vacuously and prints "✓ all targets proven".
if (caps.length < MIN_CAPABILITY_SUBJECTS) {
  console.error(
    `\n[check-chat-capability-coverage] MISCONFIGURED (exit 2) — ${caps.length} chat capability(ies) loaded; floor is ${MIN_CAPABILITY_SUBJECTS}.`
    + `\n  Every proof in this gate is a loop over that list; empty means every claim passes vacuously.`
    + `\n  This is NOT a pass.`,
  );
  process.exit(2);
}
console.log(`[check-chat-capability-coverage] registered bus commands: ${registered.size}`);
console.log(`[check-chat-capability-coverage] chat capabilities: ${caps.length} · covering ${covered.size} command(s)`);
console.log(`[check-chat-capability-coverage] explicitly deferred (CHAT_UNAVAILABLE): ${CHAT_UNAVAILABLE.size}`);
const breakdown = classificationBreakdown();
console.log(
  `[check-chat-capability-coverage] classified (${CHAT_CLASSIFIED.size}): ` +
  `B needs-design ${breakdown.B} · C internal ${breakdown.C} · D duplicate ${breakdown.D} · ` +
  `E unsafe ${breakdown.E} · F deferred ${breakdown.F}`,
);
// ADR-0315 U0 — the M-maturity report (RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE §3):
// makes the universal-layer roadmap measurable in CI. M2/M3 = live capabilities
// (multi-selection landed with ADR-0314); M4 = capabilities with a beyond-selection
// scope; M5 = capabilities dispatching a true batch verb (one history entry);
// M6 plans and M7 generative adapters count 0 until their executors land.
const m4 = caps.filter((c) => c.scope === 'all').length;
const m5 = caps.filter((c) =>
  [c.busCommand, ...(c.alsoDispatches ?? [])].some((v) => v !== null && /Batch$/.test(v ?? '')),
).length;
// §PLAN (RAC U6) — M6 counts COMPOSITE capabilities: ones that execute an
// ordered sequence of other capabilities from one sentence.
const m6 = caps.filter((c) => c.composite === true).length;
// M7 counts capabilities that drive a GENERATIVE engine (RAC U5b/U5c).
const m7 = caps.filter((c) => (c.busCommand ?? '').startsWith('generation.')).length;
console.log(
  `[check-chat-capability-coverage] maturity: M2/M3 direct+selection ${caps.length} · ` +
  `M4 scope ${m4} · M5 true-batch ${m5} · M6 plans ${m6} · M7 generative ${m7}`,
);
console.log(`[check-chat-capability-coverage] UNDECLARED: ${undeclared.length} (baseline ${MAX_UNDECLARED})`);
console.log(
  `[check-chat-capability-coverage] C68 §6.3 ratchets: unresolved examples ` +
  `${unresolvedExamples.length}/${MAX_UNRESOLVED_EXAMPLES} · unpinned capabilities ` +
  `${unpinned.length}/${MAX_UNPINNED_CAPABILITIES} · undeclared spatial reach ` +
  `${undeclaredSpatialReach.length}/${MAX_UNDECLARED_SPATIAL_REACH} · unclassified global routes ` +
  `${unclassifiedGlobalRoutes.length}/${MAX_UNCLASSIFIED_GLOBAL_ROUTES} · resolver case arms ` +
  `${resolverCaseArms}/${MAX_RESOLVER_CASE_ARMS} · unreachable properties ` +
  `${unreachableProperties.length}/${MAX_UNREACHABLE_PROPERTIES}`,
);

let failed = false;
let ratchetExceeded = false;

if (undeclared.length > MAX_UNDECLARED) {
  const added = undeclared.slice(0, 40);
  console.error(
    `\n[check-chat-capability-coverage] FAIL — ${undeclared.length} undeclared bus command(s), baseline ${MAX_UNDECLARED}.\n` +
    `A new user-facing command must either be reachable from chat (add a ChatCapability in\n` +
    `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts) or be listed in CHAT_UNAVAILABLE\n` +
    `with a reason a user could read. Shipping neither is how "make all walls interior partition"\n` +
    `reached a command that already existed and was told "I'm not sure how to help with that yet".\n` +
    `Undeclared commands (first ${added.length}):`,
  );
  for (const t of added) console.error(`      ${t}   [${registered.get(t)}]`);
  failed = true;
}

if (phantoms.length > 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${phantoms.length} phantom capability claim(s):`);
  for (const p of phantoms) console.error(`      ${p}`);
  failed = true;
}

if (targetFailures.length > 0) {
  console.error(
    `\n[check-chat-capability-coverage] FAIL — ${targetFailures.length} unproven or contradicted target claim(s).\n` +
    `A capability table that LIES is worse than no table: ElementCapabilities.ts advertises Mirror /\n` +
    `Offset / Scale on seven families whose commands refuse at canExecute. Do not repeat it here.`,
  );
  for (const t of targetFailures) console.error(`      ${t}`);
  failed = true;
}

if (classificationFailures.length > 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${classificationFailures.length} classification inconsistency(ies):`);
  for (const f of classificationFailures) console.error(`      ${f}`);
  failed = true;
}

if (parameterFailures.length > 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${parameterFailures.length} unresolvable parameter source(s):`);
  for (const f of parameterFailures) console.error(`      ${f}`);
  failed = true;
}

if (acceptanceFailures.length > 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${acceptanceFailures.length} capability(ies) with no acceptance proof:`);
  for (const a of acceptanceFailures) console.error(`      ${a}`);
  failed = true;
}

// ── C68 §6.3 closure checks ──────────────────────────────────────────────────

function hard(label: string, problems: readonly string[], banner: string): void {
  if (problems.length === 0) return;
  console.error(`\n[check-chat-capability-coverage] FAIL — ${problems.length} ${label}.\n${banner}`);
  for (const p of problems) console.error(`      ${p}`);
  failed = true;
}

function ratchet(label: string, problems: readonly string[], max: number, banner: string): void {
  if (problems.length <= max) return;
  console.error(
    `\n[check-chat-capability-coverage] FAIL — ${problems.length} ${label}, baseline ${max}.\n${banner}`,
  );
  for (const p of problems.slice(0, 40)) console.error(`      ${p}`);
  // §EXIT-CODE-CONTRACT (2026-08-11, C9) — every threshold routed through here is
  // SHRINK-ONLY, so exceeding one means the debt GREW. gate-debt.json must never
  // absorb that (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7): exit 3, not 1. `hard()`
  // failures stay exit 1 — those are invariant breaches a ledger entry could
  // legitimately declare.
  ratchetExceeded = true;
}

hard('global capability route(s) that cannot be classified at all', globalRouteFailures,
  'C68 §5.a — a route with neither a commandProof nor a registering handler is unprovable.');

ratchet('unclassified global route(s)', unclassifiedGlobalRoutes, MAX_UNCLASSIFIED_GLOBAL_ROUTES,
  'C68 §6.3-G7 — targets:\'global\' no longer skips liveness. Supply a commandProof naming the\n' +
  'live execution authority, or re-route the verb as L-815 did for wall.updateDimensions.');

hard('capability(ies) with no acceptance FAMILY', missingFamilies,
  'C68 §5.f — the gate executes each capability\'s own examples in the context its family declares,\n' +
  'so a family is now required, not merely a mention of the id.');

ratchet('declared example(s) that do not resolve to their own capability', unresolvedExamples,
  MAX_UNRESOLVED_EXAMPLES,
  'C68 §6.3-G2 — examples are what the refusal copy OFFERS the user. An example that does not work\n' +
  'is a lie shipped in the UI. See MAX_UNRESOLVED_EXAMPLES for the known context gaps.');

hard('adversarial corpus utterance(s) that MUTATED', adversarialMutations,
  '§FIX-CHAT-REPORT-PASTEBACK / §FIX-CHAT-STOPWORD-CORRECTION — the founder pasted the assistant\'s\n' +
  'own report back into the chat and the ladder CREATED A LEVEL from it, twice. These sentences must\n' +
  'produce no command and no local action, on every rung of the ladder.');

ratchet('capability(ies) with no adversarial pin', unpinned, MAX_UNPINNED_CAPABILITIES,
  'C68 §5.f — every capability reachable by "a bare number + a noun" inherits the founder-doctrine\n' +
  'guards and needs at least one command-SHAPED sentence pinned as a non-mutation.');

hard('scope mode(s) declared but not honoured', scopeHonourFailures,
  'C68 §7.d — "declaring a spatial mode before the resolver honours it would be the ElementCapabilities\n' +
  'lie in a new costume". A missing resolver must refuse honestly, never widen silently to \'all\'.');

ratchet('spatial mode(s) the ARM honours without declaring', undeclaredSpatialReach,
  MAX_UNDECLARED_SPATIAL_REACH,
  'C68 §6.3-G3, the symmetric half. This is ARM reach, not LANGUAGE reach — see\n' +
  'MAX_UNDECLARED_SPATIAL_REACH for exactly what the number does and does not mean.');

hard('mass-edit capability(ies) failing the one-dispatch / honest-report bar', massEditFailures,
  'C68 §7.f — runBatch is undo-NEUTRAL (ADR-0314): N commands are N undo entries. And C68 §5.g —\n' +
  '"Changed N of M — K skipped: <reason>", read off the command\'s own report, never re-narrated.');

hard('dangling catalogue source(s)', catalogueFailures,
  'C68 §5.h/§6.3-G8 — a catalogue-backed parameter must name a resolver that exists, or the chat\n' +
  'parses a type name with nothing to resolve it against.');

if (resolverCaseArms < 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${RESOLVER_FILE} not found; the case-arm ratchet is blind.`);
  failed = true;
} else if (resolverCaseArms > MAX_RESOLVER_CASE_ARMS) {
  console.error(
    `\n[check-chat-capability-coverage] FAIL — ${resolverCaseArms} hand-written resolver case arms, ` +
    `baseline ${MAX_RESOLVER_CASE_ARMS}.\n` +
    `C68 §5.i — a batch-shaped capability is a CapabilityExecutionSpec ROW and a property is a\n` +
    `PropertyVocabulary ROW, both served by ONE generic arm. "Target: zero new resolver case code."`,
  );
  failed = true;
}

ratchet('panel-editable propert(ies) the chat cannot reach', unreachableProperties,
  MAX_UNREACHABLE_PROPERTIES,
  'C68 §6.3-G1 / §4 case 3 — a new ATTRIBUTE routed through element.updateParameters adds no bus verb,\n' +
  'so the coverage ratchet never sees it. This one does. See MAX_UNREACHABLE_PROPERTIES for the four\n' +
  'things this enumeration CANNOT see.');

if (ratchetExceeded) process.exit(3);
if (failed) process.exit(1);

console.log(
  `\n[check-chat-capability-coverage] ✓ ${caps.length} capabilities, all targets proven both ways; ` +
  `undeclared ${undeclared.length}/${MAX_UNDECLARED}.`,
);
console.log(
  `[check-chat-capability-coverage] ✓ C68 §6.3 closure: ${examplesRun} example(s) executed ` +
  `(${unresolvedExamples.length}/${MAX_UNRESOLVED_EXAMPLES} unresolved) · ` +
  `${CORPUS.adversarial.length} adversarial utterance(s), none mutating · ` +
  `${scopeProbes} spatial scope probe(s) honoured · ${caps.length - unpinned.length}/${caps.length} pinned.`,
);
