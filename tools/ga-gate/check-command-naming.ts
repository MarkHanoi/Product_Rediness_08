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
 * Exit:   0 = at or below baseline · 3 = a NEW prefix spelling appeared (ratchet exceeded)
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
    // ─── ADDED 2026-08-30 (lane W3d) — FOUR GENUINELY NEW DOMAINS, not drift ───
    //
    // Each was measured for a rival spelling before being admitted, because that
    // measurement is the ONLY thing separating this file's sanctioned move
    // ("Adding a genuinely new element type means adding it here") from the
    // L-796 defect it exists to catch. Rival-spelling counts, measured over
    // plugins/ + packages/ + apps/ as COMMAND-type prefixes:
    //
    //   balcony      46 sites · rival 'balcon*' spellings: 0
    //   lift         49 sites · rival spellings:            0
    //   bathroomPod  25 sites · `'bathroom-pod.` :           0 hits
    //   boundaryLine 67 sites · `'boundary-line.`:           0 hits
    //
    // ⛔ `curtainWall` was DENIED admission here and migrated instead: its domain
    // already had a canonical spelling (`curtain-wall`, 21 verbs) so it was a
    // SECOND SPELLING — the L-796 defect — not a new domain. See C87 §CW-Dec-2.
    //
    // ⚠ The last two are camelCase while the one existing multi-word member of
    // this set (`curtain-wall`) is kebab. That asymmetry is DELIBERATE and is not
    // this gate's to overturn: **the element contracts declare these spellings
    // NORMATIVELY** — C106 §6.1 (`boundaryLine.delete`), C106 §3.5-c
    // (`boundaryLine.move`), C106 §5 (`boundaryLine.create` / `.update`), and
    // C109 R-1 (*"A pod is created and destroyed only by `bathroomPod.create` /
    // `bathroomPod.delete`"*). Under the conflict-resolution order in CLAUDE.md
    // the contract suite outranks a convention inferred from one sample, and a
    // rename to kebab would put the CODE in breach of a normative clause — the
    // inverse of "when code disagrees with a contract, the code is wrong".
    // Re-spelling them is a C106/C109 amendment first and a code change second.
    'balcony', 'bathroomPod', 'boundaryLine', 'lift',
    // --- ADDED 2026-09-09 (lane SITE-SURFACE) - ONE genuinely new domain -------
    //
    // `siteworks` (C116, ADR-0384 D1) - roads, parking areas and pedestrian areas
    // as ONE element kind wearing three roles. Measured for rival spellings BEFORE
    // admission, because that measurement is the only thing separating this file's
    // sanctioned move from the L-796 defect it exists to catch. Counts as COMMAND
    // prefixes over plugins/ + packages/ + apps/, 2026-09-09:
    //
    //   `'road.`      : 0 hits
    //   `'pavement.`  : 0 hits
    //   `'surface.`   : 0 hits
    //   `'paving.`    : 0 hits
    //
    // So this is a NEW DOMAIN, not a second spelling of an existing one.
    //
    // camelCase, like `bathroomPod` / `boundaryLine`, and for the same reason the
    // note above gives: C116 1 declares `siteworks.*` NORMATIVELY as the verb
    // namespace, and under CLAUDE.md's conflict order a contract outranks a
    // convention inferred from one kebab sample. (It is single-word anyway.)
    //
    // The kind is `siteworks` and NOT `siteSurface`: that spelling was already held
    // by an unrelated live L7 UI class (apps/editor/src/ui/site/SiteSurface.ts), and
    // the orchestrator ruled the ELEMENT KIND yields because the UI exists. C116 0.1
    // carries the correction; `siteSurface` is a FORBIDDEN spelling for this family.
    'siteworks',
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
    // §FIX-GATE-BLIND-TO-UNTRACKED (L-837, 2026-08-11) — `--cached --others
    // --exclude-standard`, never bare `git ls-files`.
    //
    // Bare `ls-files` lists TRACKED files only, so a brand-new file — which is
    // exactly what a PR adding a command IS, right up until it is staged — was
    // invisible to this gate. The author sees green, stages, and the violation is
    // already in. Same class as L-811: a scanner reporting on a subject it never
    // looked at. Proven before fixing: an untracked handler under plugins/ came
    // back 0 from the bare form and 1 from this one.
    //
    // `--others --exclude-standard` adds untracked files while still honouring
    // .gitignore, so node_modules and build output stay out (verified: 0 hits).
    // That was the whole reason ls-files was chosen over a directory walk, and it
    // is preserved.
    // §GIT-CRASH-IS-MISCONFIG (2026-08-11, C9) — `git ls-files` throwing (not a
    // repo, broken index, git absent from PATH) propagated as an unhandled
    // exception, which node reports as EXIT 1: the same code a real violation
    // produces, and therefore absorbable by gate-debt.json. L-811 exactly. A gate
    // that could not list its subject has measured nothing ⇒ exit 2, never 1.
    let out: string;
    try {
        out = execSync(`git ls-files --cached --others --exclude-standard -- ${SCAN_GLOBS.map(g => `"${g}"`).join(' ')}`, {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
        });
    } catch (err) {
        console.error(
            `\n[check-command-naming] MISCONFIGURED (exit 2) — git ls-files failed, so the subject could not be listed.`
            + `\n  cwd: ${process.cwd()}`
            + `\n  ${(err as Error).message.split('\n')[0]}`
            + `\n  A gate that cannot enumerate its files has not judged them. This is NOT a pass.`,
        );
        process.exit(2);
    }
    return out.split('\n').map(s => s.trim()).filter(Boolean).filter(f => !f.includes('__tests__'));
}

interface Found { readonly file: string; readonly line: number; readonly type: string }

function scan(): Found[] {
    // `readonly type = 'x'` / `type: 'x',` — how handlers declare their command
    // type. Deliberately narrow: a broad string scan would sweep up every
    // unrelated `type:` field in the codebase and drown the signal.
    const decl = /(?:readonly\s+)?type\s*[:=]\s*'([a-zA-Z][a-zA-Z0-9._-]*\.[a-zA-Z][a-zA-Z0-9._-]*)'/g;
    const found: Found[] = [];
    // §FIX-LSFILES-ENOENT-CRASH (L-837, 2026-08-11) — `git ls-files` lists the
    // INDEX, so it names files that are tracked but deleted (or moved) in the
    // working tree. Reading one threw ENOENT and killed the gate mid-scan with
    // exit 1 — the same exit code a real naming violation produces, and this gate
    // is ledger-eligible, so a crash could be absorbed as merit. That is L-811
    // exactly, arriving through a different door.
    //
    // Skipping silently would be the other half of the same mistake: files that
    // vanished and files that were clean would produce the same reading. So they
    // are COUNTED and REPORTED, and the scan continues over what it can actually
    // read. If the whole subject has vanished, the floor below catches it.
    let unreadable = 0;
    for (const file of listFiles()) {
        let raw: string;
        try { raw = readFileSync(file, 'utf8'); }
        catch { unreadable++; continue; }
        SCANNED_OK++;
        const lines = raw.split('\n');
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
    // §FIX-LSFILES-ENOENT-CRASH (L-837) — three distinct facts, three outcomes.
    // MIN_FILES is the same idiom as check-no-direct-store-writes.ts:136 and
    // lib/sourceScan.ts: a scanner that found nothing because it looked nowhere
    // must not be able to report a pass. Exit 2, never 0 and never 1 — this gate
    // is ledger-eligible, and exit 1 here would be absorbable as declared debt.
    if (SCANNED_OK < MIN_FILES) {
        console.error(
            `\n[check-command-naming] MISCONFIGURED (exit 2) — READ only ${SCANNED_OK} handler file(s)`
            + ` (${unreadable} listed by git but absent from the working tree); floor is ${MIN_FILES}.`
            + `\n  This is NOT a pass. Every command type this gate polices lives in a file it`
            + `\n  could not open, so "no non-canonical prefixes" would mean nothing.`,
        );
        process.exit(2);
    }
    if (unreadable > 0) {
        // Reported, never hidden: a vanished file and a clean file must not read
        // the same. Below the floor this is fatal; above it, it is disclosure.
        console.warn(
            `[check-command-naming] ⚠ ${unreadable} file(s) are tracked by git but absent from the`
            + ` working tree (deleted or moved, not yet staged) and were NOT scanned.`,
        );
    }
    return found;
}

/**
 * §FIX-LSFILES-ENOENT-CRASH (L-837) — subject floor. 40 is well under the ~250
 * handler files this repo carries, so it cannot mask ordinary churn; it exists to
 * catch a collapsed glob or a listing that returned nothing at all.
 */
const MIN_FILES = 40;
let SCANNED_OK = 0;

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
    // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — BASELINE_SPLITS is a shrink-only
    // NAMED baseline of tolerated second spellings. A NEW one is debt GROWTH, and a
    // wire identifier that reaches project_command_log is permanent once shipped, so
    // this must never be absorbable as "known naming debt". Exit 3, not 1.
    process.exit(3);
}

if (offending.length < BASELINE_SPLITS.size) {
    console.log(`\n[check-command-naming] ✓ below baseline — remove the migrated entry from BASELINE_SPLITS to lock the gain in.`);
} else {
    console.log('\n[check-command-naming] ✓ at baseline — no new prefix spellings.');
}
