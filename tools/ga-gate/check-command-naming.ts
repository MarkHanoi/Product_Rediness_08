#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-command-naming.ts
 *
 * §FIX-COMMAND-NAMESPACE (L-796) — a RATCHET on the command-type DOMAIN PREFIX.
 *
 * ─── What the defect actually is ─────────────────────────────────────────────
 * The audit reported "duplicate command namespace: curtain-wall.* vs
 * curtainwall.*". Two corrections came out of implementing the fix, and both
 * matter for what this gate checks:
 *
 *   1. There is no DUPLICATE COMMAND. `curtainwall.create` (single) and
 *      `curtain-wall.batch.create` (batch) are different operations. The defect
 *      is one element family answering to two PREFIXES.
 *
 *   2. The first draft of this gate enforced dot-separated kebab-case
 *      throughout and found **135** violations — because camelCase ACTION
 *      segments (`wall.setColor`, `view.setRange`, `door.setSwing`) are the
 *      established house style, used by 30 of 32 domains. Declaring them all
 *      wrong would have been imposing a convention the codebase does not have,
 *      and would have buried the two real problems in 133 false ones.
 *
 * So the rule is narrow and targets exactly the drift class: **one domain, one
 * prefix spelling.** Action segments are left alone.
 *
 * ─── What it found ───────────────────────────────────────────────────────────
 * Two split domains, not one:
 *   • `curtainwall` (18 types) vs `curtain-wall` (3)  ← the reported defect
 *   • `room`        (11 types) vs `rooms`        (1)  ← MISSED BY THE AUDIT
 *
 * ─── Why a ratchet and not a hard rule ──────────────────────────────────────
 * A command type is a WIRE IDENTIFIER: it appears in the CRDT payload, in the
 * persisted `project_command_log`, and therefore in replayed history. Renaming
 * one is a protocol migration, not a rename — which is what
 * `CommandHandler.aliases` exists for. This gate freezes today's split domains
 * and fails only on GROWTH, the same shape as `ci-check-no-commandmanager.mjs`.
 *
 * Usage:  tsx tools/ga-gate/check-command-naming.ts
 * Exit:   0 = at or below baseline · 1 = a NEW prefix spelling appeared
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * The canonical domain prefix for every command family, one entry per DOMAIN.
 * Adding a genuinely new element type means adding it here — a deliberate,
 * reviewed act, which is the point.
 */
const CANONICAL_PREFIXES = new Set([
    'annotation', 'beam', 'ceiling', 'column', 'cube', 'curtain-wall', 'dimension',
    'door', 'element', 'floor', 'furniture', 'grid', 'handrail', 'level', 'lighting',
    'plumbing', 'pool', 'roof', 'room', 'schedule', 'section', 'selection', 'sheet',
    'slab', 'stair', 'structural', 'template', 'view', 'wall', 'window',
]);

/**
 * Known non-canonical prefixes, frozen. Each is a DOMAIN that answers to two
 * spellings; each needs migrating to its canonical form behind an alias.
 *
 * ⚠ This set may only ever SHRINK. Adding to it to make CI green is the exact
 * failure the ratchet exists to prevent.
 */
const BASELINE_SPLITS = new Map<string, string>([
    // EMPTY — both split domains were migrated (L-796, 2026-08-09):
    //   • `curtainwall.*` → `curtain-wall.*` (18 types)
    //   • `rooms.redetect` → `room.redetect`  (1 type)
    // Each handler now declares the canonical name on `type` and the old spelling
    // in `aliases`, so already-logged commands and unmigrated callers still resolve.
    // The aliases are the remaining debt: once no caller and no persisted log uses
    // them, delete the `aliases` fields. Nothing may be ADDED to this map.
]);

/**
 * Element-TYPE catalogue ids (`curtainwall.panel.glazed.standard` in
 * `packages/types-builtin/`) are a DIFFERENT namespace — never dispatched
 * through the bus — and are deliberately out of scope.
 */
const SCAN_GLOBS = ['plugins/*/src/**/*.ts', 'packages/command-registry/src/**/*.ts'];

function listFiles(): string[] {
    // `git ls-files` rather than a directory walk: respects .gitignore, skips
    // node_modules/dist for free, and cannot wander into a sibling worktree.
    const out = execSync(`git ls-files -- ${SCAN_GLOBS.map(g => `"${g}"`).join(' ')}`, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    return out.split('\n').map(s => s.trim()).filter(Boolean).filter(f => !f.includes('__tests__'));
}

interface Found { readonly file: string; readonly line: number; readonly type: string }

function scan(): Found[] {
    // `readonly type = 'x'` / `type: 'x',` — how handlers declare their command
    // type. Deliberately narrow: a broad string scan would sweep up every
    // unrelated `type:` field in the codebase and drown the signal.
    const decl = /(?:readonly\s+)?type\s*[:=]\s*'([a-zA-Z][a-zA-Z0-9._-]*\.[a-zA-Z][a-zA-Z0-9._-]*)'/g;
    const found: Found[] = [];
    for (const file of listFiles()) {
        const lines = readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const text = lines[i]!;
            const t0 = text.trimStart();
            if (t0.startsWith('//') || t0.startsWith('*')) continue;
            decl.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = decl.exec(text)) !== null) {
                found.push({ file, line: i + 1, type: m[1]! });
            }
        }
    }
    return found;
}

const all = scan();
const byPrefix = new Map<string, Found[]>();
for (const f of all) {
    const prefix = f.type.split('.')[0]!;
    (byPrefix.get(prefix) ?? byPrefix.set(prefix, []).get(prefix)!).push(f);
}

const offending = [...byPrefix.keys()].filter(p => !CANONICAL_PREFIXES.has(p)).sort();
const unexpected = offending.filter(p => !BASELINE_SPLITS.has(p));

console.log('[check-command-naming] §FIX-COMMAND-NAMESPACE (L-796)');
console.log(`[check-command-naming] domains in use: ${byPrefix.size} · non-canonical prefixes: ${offending.length} (baseline ${BASELINE_SPLITS.size})`);

for (const p of offending) {
    const hits = byPrefix.get(p)!;
    const target = BASELINE_SPLITS.get(p);
    const tag = target ? `→ should be '${target}'` : '→ UNKNOWN DOMAIN';
    console.log(`  ${target ? '·' : '✗'} ${p}.*  (${hits.length} type${hits.length === 1 ? '' : 's'}) ${tag}`);
    if (!target) for (const h of hits.slice(0, 5)) console.log(`      ${h.file}:${h.line}  ${h.type}`);
}

if (unexpected.length > 0) {
    console.error(
        `\n[check-command-naming] FAIL — new non-canonical command prefix(es): ${unexpected.join(', ')}\n\n` +
        `Every command family uses ONE prefix spelling. If this is a genuinely new element\n` +
        `type, add its canonical prefix to CANONICAL_PREFIXES in this file.\n\n` +
        `If it is a second spelling of an existing domain, that is the L-796 defect — do NOT\n` +
        `add it. A command type is a wire identifier that appears in project_command_log and\n` +
        `in replayed history, so set the canonical name on \`type\` and list the old spelling\n` +
        `in \`aliases\` (CommandHandler.aliases). Dispatch, has() and registry.has() guards all\n` +
        `keep working through the alias while call sites migrate.`,
    );
    process.exit(1);
}

if (offending.length < BASELINE_SPLITS.size) {
    console.log(`\n[check-command-naming] ✓ below baseline — remove the migrated entry from BASELINE_SPLITS to lock the gain in.`);
} else {
    console.log('\n[check-command-naming] ✓ at baseline — no new prefix spellings.');
}
