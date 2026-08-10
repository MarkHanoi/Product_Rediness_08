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
 * Re-negative-tested 2026-08-10 for the new checks, both correctly rejected:
 *   • a fabricated `nonexistent.verb` in CHAT_CLASSIFIED → "classified but not
 *     a registered bus command — stale entry" (classification consistency)
 *   • `mustMention: ['NOT_IN_FILE_XYZ']` on set-thickness → "never mentions
 *     \"NOT_IN_FILE_XYZ\"" (multi-proof reader), and the missing
 *     `handrail.delete` classification fired the baseline-0 ratchet live.
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
  type ResolverContext,
} from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';

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

/** Check 3b — the source-anchored command proof (one proof per routed command). */
function proveCommandTargets(cap: ChatCapability): string[] {
  if (cap.targets === 'global') return [];
  const proofs = commandProofsOf(cap);
  if (proofs.length === 0) {
    return [`${cap.id}: declares element targets but no commandProof — the claim is unverifiable.`];
  }
  const failures: string[] = [];
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

function proveRouteLiveness(cap: ChatCapability, file: string, src: string): string[] {
  const norm = file.replace(/\\/g, '/');
  if (norm.startsWith('packages/command-registry/')) return [];
  if (norm.startsWith('apps/editor/')) return [];
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
  'measurement', 'angle', 'wall-system-types', 'window-system-types', 'project-levels', 'user-text', 'coordinates',
  // ADR-0314 §Value sources — colour name / '#hex', resolved by the ONE table
  // in packages/ai-host/src/intents/colorRef.ts.
  'color',
  // ADR-0315 U2.5 — the spatial vocabulary. Declared now so U3 capabilities
  // are pure metadata; the probe-shape arms below activate with their first
  // consumer.
  'project-rooms', 'orientation', 'level-range',
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

// ── Report ───────────────────────────────────────────────────────────────────

console.log('[check-chat-capability-coverage] §FIX-CHAT-CAPABILITY-BLIND (ADR-0313)');
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
console.log(
  `[check-chat-capability-coverage] maturity: M2/M3 direct+selection ${caps.length} · ` +
  `M4 scope ${m4} · M5 true-batch ${m5} · M6 plans 0 · M7 generative 0`,
);
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

if (failed) process.exit(1);

console.log(
  `\n[check-chat-capability-coverage] ✓ ${caps.length} capabilities, all targets proven both ways; ` +
  `undeclared ${undeclared.length}/${MAX_UNDECLARED}.`,
);
