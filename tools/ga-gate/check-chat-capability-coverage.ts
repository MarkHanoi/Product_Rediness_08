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
 * ─── Negative-tested 2026-08-10 ──────────────────────────────────────────────
 * A gate nobody has watched fail is a gate nobody should trust. Three injected
 * faults, all correctly rejected:
 *   • `PRYZM_CHAT_MAX_UNDECLARED=268` → "FAIL — 269 undeclared bus command(s),
 *     baseline 268." (the ratchet fires on a single new command)
 *   • adding `'slab'` to `set-thickness.targets` → "DECLARES target \"slab\" but
 *     applySemanticIntent REFUSES it" (proof 3a, the ElementCapabilities case)
 *   • an under-matching handler regex → fifteen phantom claims reported, which
 *     is how the regex bug documented below was actually found.
 *
 * Usage:  tsx tools/ga-gate/check-chat-capability-coverage.ts
 * Exit:   0 = at or below the baseline and all hard checks pass · 1 = otherwise
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import {
  allChatCapabilities,
  capabilityAppliesTo,
  CHAT_UNAVAILABLE,
  normalizeElementKind,
  PROBE_ELEMENT_KINDS,
  type ChatCapability,
} from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
import { unconnectedTopicCommands } from '../../packages/ai-host/src/capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  type ResolverContext,
} from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';

/**
 * ⚠ SHRINK-ONLY.
 *
 * ─── UNDECLARED = 269, frozen 2026-08-10 ─────────────────────────────────────
 * Registered bus commands with no chat declaration. It is NOT zero and pretending
 * otherwise would have meant writing 269 deferral sentences in one sitting, most
 * of them guesses — the `AUTHORING_UNAVAILABLE` precedent is explicit that a
 * stated reason must be true, not decorative. What matters is that the number can
 * only fall, and that the NEXT command to be added cannot be added silently.
 *
 * Lowering it is the work: move a command into `CHAT_CAPABILITIES` (best) or into
 * `CHAT_UNAVAILABLE` with an honest reason (acceptable), and drop this number by
 * the same amount in the same commit.
 *
 * Raising it requires a dated justification HERE, in this comment, naming the
 * commands and why the chat cannot speak for them yet. An undocumented bump is a
 * ratchet failure and reviewers should treat it as one.
 */
const MAX_UNDECLARED = Number(process.env.PRYZM_CHAT_MAX_UNDECLARED ?? 269);

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

function registeredCommands(): Map<string, string> {
  const files = execSync(`git ls-files -- ${HANDLER_GLOBS.map((g) => `"${g}"`).join(' ')}`, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__'));

  const out = new Map<string, string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    HANDLER_TYPE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HANDLER_TYPE_RE.exec(src)) !== null) {
      const verb = m[1] ?? m[2];
      if (verb !== undefined && !out.has(verb)) out.set(verb, file);
    }
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

/** Check 3b — the source-anchored command proof. */
function proveCommandTargets(cap: ChatCapability): string[] {
  if (cap.targets === 'global') return [];
  const proof = cap.commandProof;
  if (proof === undefined) {
    return [`${cap.id}: declares element targets but no commandProof — the claim is unverifiable.`];
  }
  if (!existsSync(proof.file)) {
    return [`${cap.id}: commandProof.file "${proof.file}" does not exist.`];
  }
  const src = readFileSync(proof.file, 'utf8');
  const missing = proof.mustMention.filter((needle) => !src.includes(needle));
  return missing.length === 0
    ? []
    : [
        `${cap.id}: commandProof names ${proof.file}, but it never mentions ` +
        `${missing.map((s) => `"${s}"`).join(', ')} — the target claim is not proven by the command.`,
      ];
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
  .filter((t) => !covered.has(t) && !CHAT_UNAVAILABLE.has(t))
  .sort();

// 2. Phantom capabilities.
const phantoms: string[] = [];
for (const c of caps) {
  const claims = [c.busCommand, ...(c.alsoDispatches ?? [])].filter((x): x is string => x !== null);
  for (const claim of claims) {
    if (!registered.has(claim)) {
      phantoms.push(`${c.id} → "${claim}" is not a registered bus command.`);
    }
  }
  if (c.busCommand === null && c.localAction === undefined) {
    phantoms.push(`${c.id}: busCommand is null but no localAction is declared — it does nothing.`);
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

// ── Report ───────────────────────────────────────────────────────────────────

console.log('[check-chat-capability-coverage] §FIX-CHAT-CAPABILITY-BLIND (ADR-0313)');
console.log(`[check-chat-capability-coverage] registered bus commands: ${registered.size}`);
console.log(`[check-chat-capability-coverage] chat capabilities: ${caps.length} · covering ${covered.size} command(s)`);
console.log(`[check-chat-capability-coverage] explicitly deferred (CHAT_UNAVAILABLE): ${CHAT_UNAVAILABLE.size}`);
console.log(`[check-chat-capability-coverage] UNDECLARED: ${undeclared.length} (baseline ${MAX_UNDECLARED})`);

let failed = false;

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

if (acceptanceFailures.length > 0) {
  console.error(`\n[check-chat-capability-coverage] FAIL — ${acceptanceFailures.length} capability(ies) with no acceptance proof:`);
  for (const a of acceptanceFailures) console.error(`      ${a}`);
  failed = true;
}

if (failed) process.exit(1);

console.log(
  `\n[check-chat-capability-coverage] ✓ ${caps.length} capabilities, all targets proven both ways; ` +
  `undeclared ${undeclared.length}/${MAX_UNDECLARED}.`,
);
