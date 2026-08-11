#!/usr/bin/env tsx
/**
 * tools/rac-conformance/probe-route-shadowing.ts — THE V3 GAP, MADE VISIBLE.
 *
 * ─── The hole this probe fills ───────────────────────────────────────────────
 * `check-chat-capability-coverage.ts` check 3d classifies a capability's route
 * as LIVE by the PATH of its `commandProof` file:
 *
 *     packages/command-registry/**  →  "LIVE by construction"
 *
 * That is a PRESUMPTION about a file, not a measurement of the bus. It is blind
 * to the one thing that decides where a dispatch actually lands:
 *
 *     **TWO handlers can claim the same verb, and the FIRST one registered wins.**
 *
 * `apps/editor/src/engine/initBusHandlers.ts` registers its legacy bridges with
 *
 *     if (runtime.bus.registry?.has?.(spec.type)) continue;      // ← first wins
 *
 * (a deliberate §OI-053 guard, because `CommandBus.register` THROWS on a
 * duplicate — `packages/command-bus/src/CommandBus.ts:95`). So when a PLUGIN
 * handler set registers verb V before `initBusHandlers` runs, the editor bridge
 * for V is silently SKIPPED — and the bridge is the half that mutates the
 * authoritative geometry store. The capability keeps a commandProof pointing at
 * a `packages/command-registry/` command that is no longer on the live path,
 * and the gate keeps calling it LIVE.
 *
 * This is exactly the §FIX-CHAT-DEAD-ROUTES shape (13/13 dead), one layer up:
 * there, the proof pointed at a dead handler; here, the proof points at a live
 * COMMAND CLASS that a shadowing registration has cut off from the verb.
 *
 * ─── What this probe measures ────────────────────────────────────────────────
 * For every chat capability with a `busCommand`, it reports:
 *   • which files register that verb (plugin handler set vs editor bridge);
 *   • whether a PLUGIN registration exists with the presumed-DETACHED signature
 *     (`produceCommand` + non-empty `affectedStores` + no `commandManager`);
 *   • whether the verb is ALSO claimed by an `initBusHandlers` bridge — the
 *     SHADOWED case, where two registrations disagree about the store;
 *   • whether the capability's own commandProof file declares itself ORPHANED.
 *
 * ─── WHAT THIS PROBE CANNOT SEE — say it, do not imply it ────────────────────
 *  1. BOOT ORDER. It reads source, not a running bus. "First registration wins"
 *     is quoted from the guard; WHICH is first is settled by composeRuntime and
 *     is asserted per-verb in the scorecard from separate evidence, not here.
 *  2. Whether a plugin store is truly detached. A committer could bridge it.
 *     The probe reports the SIGNATURE and whether a committer file exists; it
 *     does not prove liveness either way. Presumed-detached has been right
 *     13/13 times, which is a strong prior and still not a proof.
 *  3. Verbs the chat cannot reach at all — those are the scorecard's V1 column.
 *
 * A row here is therefore a QUESTION RAISED, not a verdict. It says: "these two
 * registrations disagree about which store is authoritative; someone must say
 * which one boots first." That question had not been asked.
 *
 * Re-run:  npx tsx tools/rac-conformance/probe-route-shadowing.ts
 * Exit 0 always — a measurement, not a gate.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  allChatCapabilities,
  commandProofsOf,
} from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';

const HANDLER_GLOBS = [
  'plugins/*/src/handlers/*.ts',
  'apps/editor/src/engine/initBusHandlers.ts',
  'apps/editor/src/engine/engineLauncher.ts',
];

/** Same verb-extraction the D14 gate uses, so the two agree on what "registered" means. */
const HANDLER_TYPE_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

interface Registration {
  readonly file: string;
  readonly kind: 'plugin' | 'editor-bridge';
  /** The §FIX-CHAT-DEAD-ROUTES signature: writes a plugin DTO store. */
  readonly presumedDetached: boolean;
  /** The legacy-bridge signature the D14 gate accepts as live. */
  readonly legacyBridge: boolean;
  /**
   * §PROBE-ENROLMENT — is the handler FILE actually enrolled in its plugin's
   * `*_HANDLER_TYPES` set? A handler class can declare `type: 'x.y'` and never
   * be registered, which is exactly how L-815 retired
   * `plugins/wall/src/handlers/UpdateWallDimensions.ts`: the class still exists
   * and still names the verb, but the verb was DELETED from
   * `WALL_HANDLER_TYPES`, so `buildWallHandlerSet()` never builds it and the
   * editor bridge wins by default.
   *
   * The first draft of this probe did not read the sets and reported that
   * retired wall handler as a live shadow — a confidently-wrong row of exactly
   * the kind `check-layer-boundaries.ts` records at length. Reading the set is
   * what separates "two handlers claim this verb" from "one handler claims it
   * and a corpse is lying next to it".
   */
  readonly enrolled: boolean;
}

/** Verbs each plugin's `*_HANDLER_TYPES` array really enrols, by plugin dir. */
function enrolledVerbs(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const idx = execSync('git ls-files --cached --others --exclude-standard -- "plugins/*/src/handlers/index.ts"',
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  for (const file of idx) {
    let src: string;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const plugin = file.replace(/\\/g, '/').split('/')[1]!;
    const set = out.get(plugin) ?? new Set<string>();
    // Every `*_HANDLER_TYPES = [ … ] as const` block — COMMENTS STRIPPED FIRST.
    //
    // ⚠ This strip is load-bearing, and its absence produced a false row. The
    // wall set does not merely omit `wall.updateDimensions`; it carries a
    // six-line §FIX-DIMS-REACH-RECORD comment EXPLAINING the removal, and that
    // comment quotes the verb. Reading the block verbatim therefore counted the
    // retired verb as enrolled — the probe would have reported the very handler
    // L-815 killed as a live shadow, citing the note that says it is dead as
    // evidence that it is alive. A gate that reads its own tombstone as a
    // heartbeat is worse than no gate (§FIX-CHAT-CAPABILITY-BLIND's own lesson).
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of code.matchAll(/_HANDLER_TYPES[^=]*=\s*\[([\s\S]*?)\]\s*as const/g)) {
      for (const q of m[1]!.matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'/g)) set.add(q[1]!);
    }
    out.set(plugin, set);
  }
  return out;
}

const ENROLLED = enrolledVerbs();

function scan(): Map<string, Registration[]> {
  const files = execSync(
    `git ls-files --cached --others --exclude-standard -- ${HANDLER_GLOBS.map((g) => `"${g}"`).join(' ')}`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => !f.includes('__tests__'));

  const out = new Map<string, Registration[]>();
  const add = (verb: string, r: Registration) => {
    const list = out.get(verb) ?? [];
    if (!list.some((x) => x.file === r.file)) list.push(r);
    out.set(verb, list);
  };

  for (const file of files) {
    let src: string;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const norm = file.replace(/\\/g, '/');

    if (norm.startsWith('plugins/')) {
      HANDLER_TYPE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HANDLER_TYPE_RE.exec(src)) !== null) {
        const verb = m[1] ?? m[2];
        if (verb === undefined) continue;
        const legacyBridge = src.includes('commandManager')
          && (src.includes('affectedStores: [] as const') || src.includes('affectedStores = [] as const'));
        const plugin = norm.split('/')[1]!;
        add(verb, {
          file: norm, kind: 'plugin', legacyBridge,
          presumedDetached: !legacyBridge && src.includes('produceCommand'),
          enrolled: ENROLLED.get(plugin)?.has(verb) ?? false,
        });
      }
    } else {
      // The editor bridges are declared as `{ type: 'x.y', stores: …, fn: … }`
      // object literals inside `__bridges`, which the class/`readonly type` regex
      // above also matches — but a plain `type: 'x.y',` in an array literal needs
      // its own sweep, or every bridge would be invisible here.
      for (const m of src.matchAll(/\btype:\s*'([a-z][\w-]*(?:\.[\w-]+)+)'/g)) {
        add(m[1]!, { file: norm, kind: 'editor-bridge', presumedDetached: false, legacyBridge: true, enrolled: true });
      }
    }
  }
  return out;
}

const registry = scan();
const caps = allChatCapabilities();

interface Finding {
  readonly capability: string;
  readonly verb: string;
  readonly regs: Registration[];
  readonly proofs: string[];
  readonly orphanedProofs: string[];
}

const shadowed: Finding[] = [];
const detachedOnly: Finding[] = [];
const clean: string[] = [];

for (const cap of caps) {
  const verb = cap.busCommand;
  if (verb === null || verb === undefined) continue;
  const regs = registry.get(verb) ?? [];
  const proofs = commandProofsOf(cap).map((p) => p.file);
  const orphanedProofs = proofs.filter((f) => {
    if (!existsSync(f)) return false;
    const head = readFileSync(f, 'utf8').slice(0, 1600);
    return /ORPHANED|no longer called|no longer invoked/i.test(head);
  });

  // ENROLLED is the whole point: an un-enrolled handler class cannot shadow anything.
  const pluginDetached = regs.filter((r) => r.kind === 'plugin' && r.presumedDetached && r.enrolled);
  const bridges = regs.filter((r) => r.kind === 'editor-bridge');
  const f: Finding = { capability: cap.id, verb, regs, proofs, orphanedProofs };

  if (pluginDetached.length > 0 && bridges.length > 0) shadowed.push(f);
  else if (pluginDetached.length > 0) detachedOnly.push(f);
  else clean.push(`${cap.id} → ${verb}`);
}

const fmt = (f: Finding) => {
  const lines = [`\n**${f.capability}** → \`${f.verb}\``];
  for (const r of f.regs) {
    const tag = r.kind === 'plugin' && !r.enrolled
      ? `RETIRED — declares \`${f.verb}\` but the verb is NOT in this plugin's *_HANDLER_TYPES, so it is never registered (the L-815 shape)`
      : r.presumedDetached ? '⚠ PLUGIN, presumed-DETACHED and ENROLLED (produceCommand → plugin DTO store)'
      : r.legacyBridge ? 'legacy bridge → authoritative store'
      : 'plugin, signature unclassified';
    lines.push(`  - \`${r.file}\` — ${tag}`);
  }
  for (const p of f.proofs) lines.push(`  - commandProof: \`${p}\`${f.orphanedProofs.includes(p) ? ' — **its own header says ORPHANED / no longer called**' : ''}`);
  return lines.join('\n');
};

console.log('# Route shadowing — where TWO handlers claim one verb\n');
console.log('The bus refuses duplicate registration (`CommandBus.ts:95` throws), so');
console.log('`initBusHandlers.ts:2201` skips a bridge whose verb is already taken:');
console.log('**the FIRST registration wins.** Where a plugin handler and an editor bridge');
console.log('both claim a verb, they disagree about which store is authoritative, and only');
console.log('boot order decides. Each row below is a question that must be answered per verb.\n');

console.log(`\n## A. SHADOWED — a plugin DTO handler AND an editor bridge claim the same verb (${shadowed.length})\n`);
console.log('These are the V3 risk. If the plugin handler registers first, the chat writes a');
console.log('store nothing renders, persists or exports — and the capability\'s commandProof');
console.log('still points at the command-registry class the gate calls "LIVE by construction".');
if (shadowed.length === 0) console.log('\n_none_');
for (const f of shadowed) console.log(fmt(f));

console.log(`\n\n## B. PLUGIN-ONLY — the only registration is a presumed-detached plugin handler (${detachedOnly.length})\n`);
console.log('No rival bridge, so no ambiguity about which wins — but liveness rests entirely');
console.log('on the plugin store being bridged back. Presumed detached until proven otherwise');
console.log('(§FIX-CHAT-DEAD-ROUTES: right 13/13 so far).');
if (detachedOnly.length === 0) console.log('\n_none_');
for (const f of detachedOnly) console.log(fmt(f));

console.log(`\n\n## C. No plugin DTO handler on the verb (${clean.length})\n`);
for (const c of clean) console.log(`- ${c}`);

console.log('\n\n## Capabilities whose commandProof declares itself ORPHANED\n');
const orph = [...shadowed, ...detachedOnly, ...caps.flatMap<Finding>((cap) => {
  const verb = cap.busCommand;
  if (verb === null || verb === undefined) return [];
  const proofs = commandProofsOf(cap).map((p) => p.file);
  const orphanedProofs = proofs.filter((f) => existsSync(f) && /ORPHANED|no longer called/i.test(readFileSync(f, 'utf8').slice(0, 1600)));
  return orphanedProofs.length > 0 ? [{ capability: cap.id, verb, regs: registry.get(verb) ?? [], proofs, orphanedProofs }] : [];
})].filter((f) => f.orphanedProofs.length > 0);
const seen = new Set<string>();
for (const f of orph) {
  const k = `${f.capability}|${f.verb}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`- **${f.capability}** → \`${f.verb}\`: ${f.orphanedProofs.map((p) => `\`${p}\``).join(', ')}`);
}
if (seen.size === 0) console.log('_none_');
console.log(`\n> A commandProof that says "ORPHANED — no longer called" is a proof of nothing.`);
console.log('> The D14 gate accepts it because of WHERE it lives, not because anything calls it.');
