// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7916) — THE SINGULARITY CLAIM, CHECKED.
// C84 EI-1 ("one authority per family, and it is NAMED") · C106 §1.
//
// ⭐ WHY A SCAN AND NOT A PARAGRAPH.
//
// `plugins/boundary-line/src/store.ts` claims this family has exactly ONE store, and
// that the DTO/geometry duality every other family carries (C84 §1 rows 2 and 3 — the
// pair `MoveWall.ts` refuses `wall.move` over) does not exist here. That is a claim
// about the whole repository, and a claim about the whole repository that nothing
// measures is precisely the kind of prose this project keeps finding to be stale
// (every correction box in CLAUDE.md is one).
//
// So the claim is a TEST. If someone adds a second `BoundaryLineStore`, or hangs one
// on `window`, this goes red in the commit that does it — while the duality is still
// one file rather than a year of drift.
//
// ⚠ CROSS-CHECKED WITH A SECOND SCANNER. A single grep is not proof: ripgrep missed
// files twice this week that `grep -rn` found, and a NUL byte once hid ten exports.
// This walks the tree with Node's own `readdir`, which shares no ignore logic, no
// encoding heuristic and no binary detection with either tool — so agreement between
// them is evidence and disagreement is a finding.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

/**
 * The source roots, named rather than "the whole repo".
 *
 * ⚠ MEASURED, NOT PREFERRED: a full-tree walk from the repository root took **> 10
 * minutes** on this machine (a OneDrive-backed working copy — every `statSync` is a
 * synced-file probe), which would have made this guard something a lane skips. These
 * five directories are where every `.ts` in this repository that could declare a store
 * lives; `docs/`, `node_modules/` and the build outputs cannot. The trade is stated
 * because a scan narrower than its claim is the defect this file exists to catch, and
 * narrowing it silently would be worse than the duality it guards against.
 */
const SOURCE_ROOTS = ['packages', 'plugins', 'apps', 'src', 'server'];

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

/**
 * This file itself, excluded from its own scan.
 *
 * ⚠ NOT A CONVENIENCE — a MEASURED necessity, and the first run proved it: the guard
 * spells the strings it hunts for as literal source text, so it matched itself and
 * reported TWO store declarations and ONE `window` assignment, both of them its own
 * patterns. A guard that fails on its own text either gets deleted or gets its patterns
 * obfuscated, and both are worse than one named exclusion. The exclusion is exactly one
 * file, by exact path, so it cannot silently widen.
 */
const SELF = join(__dirname, 'boundaryLineHasOneStore.test.ts');

/** Windows path separator, built from its code point so no escape can be mangled. */
const SEP = String.fromCharCode(92);

function* sources(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue;
        const full = join(dir, entry);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) yield* sources(full);
        else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && full !== SELF) yield full;
    }
}

/**
 * Every source file under the named roots, except this one — SCANNED ONCE.
 *
 * ⚠ MEMOISED, and measured: on this OneDrive-backed working copy the walk costs
 * ~20 s, so running it per case blew Vitest's 5 s default and the guard reported a
 * TIMEOUT rather than a verdict. A guard that times out is indistinguishable from a
 * guard that fails, and both get skipped. One walk, two reads.
 */
let _cache: string[] | null = null;
function allSources(): readonly string[] {
    if (_cache) return _cache;
    const out: string[] = [];
    for (const r of SOURCE_ROOTS) {
        const full = join(ROOT, r);
        try {
            if (!statSync(full).isDirectory()) continue;
        } catch {
            continue;
        }
        for (const f of sources(full)) out.push(f);
    }
    _cache = out;
    return out;
}

/**
 * The patterns, built with `new RegExp` from ordinary strings.
 *
 * ⚠ DELIBERATE, AND IT COST TWO RED RUNS TO LEARN: a regex LITERAL containing `\b`
 * and `\n` written through a shell heredoc was mangled twice — the backslash escapes
 * were consumed before the file was written, leaving a literal backspace character in
 * the source and an unterminated regex. Constructing from a string means the only
 * escaping that happens is JavaScript's, at runtime, where it is visible.
 */
const CLASS_DECL = new RegExp('\\bclass\\s+\\w*BoundaryLineStore\\b');

/**
 * ⚠ THE WINDOW PATTERN REQUIRES AN **ASSIGNMENT**, and that was measured too. The
 * first draft matched the bare name and flagged `store.ts` — whose header explains, in
 * prose, that this door is deliberately shut. A guard that cannot tell a WRITE from a
 * sentence about a write makes the sentence unwritable, which is how invariants lose
 * their explanations. The trailing `[^=]` excludes `==` / `===` so a comparison is not
 * read as a write, and the 0-40 character window catches
 * `(window as any).boundaryLineStore =` as well as the plain and bracket forms.
 */
const WINDOW_WRITE = new RegExp('\\bwindow\\b[^\\r\\n]{0,40}\\bboundaryLineStore\\s*=[^=]');

// The walk is slow (see `allSources`), so the budget is stated here rather than
// left to Vitest's 5 s default, which the first run tripped.
const SCAN_TIMEOUT_MS = 120_000;

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — exactly one store, and nothing on `window`', () => {
    it('ONE-1: exactly ONE `class …BoundaryLineStore` declaration exists', () => {
        const declarers: string[] = [];
        for (const f of allSources()) {
            if (CLASS_DECL.test(readFileSync(f, 'utf8'))) declarers.push(f.slice(ROOT.length + 1));
        }
        // The message carries the FILES, not just the count, because "2 declarations"
        // sends the next reader hunting and "these two files" does not.
        expect(declarers, `boundary-line store declarers: ${declarers.join(', ')}`).toHaveLength(1);
        expect(declarers[0]!.split(SEP).join('/')).toBe('plugins/boundary-line/src/store.ts');
    }, SCAN_TIMEOUT_MS);

    it('ONE-2: ⛔ nothing assigns `window.boundaryLineStore` — the legacy-global route stays shut', () => {
        // Every family that acquired a geometry twin acquired it as a window global
        // first (`window.wallStore`, `window.slabStore`, `window.columnStore` — the
        // ~40 legacy readers `authoritativeStores.ts` records under TASK-08). Keeping
        // that door shut on day one is cheaper than the migration those families now
        // owe. The store is reached as `runtime.stores.boundaryLine`, one way only.
        const offenders: string[] = [];
        for (const f of allSources()) {
            if (WINDOW_WRITE.test(readFileSync(f, 'utf8'))) offenders.push(f.slice(ROOT.length + 1));
        }
        expect(offenders, `window.boundaryLineStore assignments: ${offenders.join(', ')}`).toEqual([]);
    }, SCAN_TIMEOUT_MS);
});
