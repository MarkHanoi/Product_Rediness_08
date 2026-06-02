#!/usr/bin/env node
/**
 * Wave 10 — src/core/ migration codemod
 *
 * Moves ALL src/core/ content → src/engine/subsystems/core/ (S93-S96 proven pattern).
 * Rewrites:
 *   A) Internal imports within moved files (depth changes 2→4 from src/)
 *   B) External importers in src/engine/ and src/ui/ pointing at src/core/
 *
 * Usage:
 *   node scripts/wave10-migrate-core.mjs          # live run
 *   node scripts/wave10-migrate-core.mjs --dry    # dry run (no writes/deletes)
 *
 * @see docs/archive/pryzm3-internal/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §2
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const ROOT = process.cwd();

const SRC_CORE       = resolve(ROOT, 'src/core');
const SRC_ENGINE_SUB = resolve(ROOT, 'src/engine/subsystems');
const DEST_CORE      = resolve(ROOT, 'src/engine/subsystems/core');

// ── helpers ──────────────────────────────────────────────────────────────────

function log(...args)    { console.log('[W10]', ...args); }
function logv(...args)   { if (VERBOSE) console.log('[W10:v]', ...args); }
function warn(...args)   { console.warn('[W10:WARN]', ...args); }

/** Return all .ts files under a directory. */
function collectTs(dir) {
    try {
        const out = execSync(
            `find "${dir}" -name "*.ts" -not -path "*/node_modules/*"`,
            { encoding: 'utf8', cwd: ROOT }
        );
        return out.split('\n').map(s => s.trim()).filter(Boolean).map(p => resolve(ROOT, p));
    } catch { return []; }
}

/** Return all .ts files under src/ (excl. src/core and node_modules). */
function collectAllSrcTs() {
    const out = execSync(
        `find src -name "*.ts" -not -path "*/node_modules/*" -not -path "src/core/*"`,
        { encoding: 'utf8', cwd: ROOT }
    );
    return out.split('\n').map(s => s.trim()).filter(Boolean).map(p => resolve(ROOT, p));
}

/**
 * Rewrite all import/export/dynamic-import paths in a file.
 *
 * For each relative import in the file:
 *   1. Resolve the import to an absolute path (from the file's ORIGINAL location).
 *   2. If the resolved target is inside src/core/ → compute its new location under DEST_CORE.
 *   3. Compute the new relative path from the file's NEW location to the target's new location.
 *   4. Replace the import string.
 *
 * For external files (not being moved), newFilePath === filePath.
 * For moved files, newFilePath is their destination under DEST_CORE.
 */
function rewriteImports(filePath, newFilePath, content) {
    // Matches: from '...', from "...", import('...'), import("...")
    // Also: export ... from '...', export ... from "..."
    // Captures: (quote)(path)(quote)
    const importRe = /(?:from\s+|import\s*\()\s*(['"])(\.\.?\/[^'"]+)\1/g;

    let changed = 0;
    const result = content.replace(importRe, (match, quote, importPath) => {
        // Resolve from ORIGINAL file location
        const oldFileDir   = dirname(filePath);
        const resolvedAbs  = resolve(oldFileDir, importPath);

        // Determine new target abs path
        let newTargetAbs;
        if (resolvedAbs.startsWith(SRC_CORE + '/') || resolvedAbs === SRC_CORE) {
            // Target is inside src/core/ → remap to DEST_CORE
            const relToCore = relative(SRC_CORE, resolvedAbs);
            newTargetAbs = resolve(DEST_CORE, relToCore);
        } else {
            // Target is NOT in src/core/ → target doesn't move, but if the FILE
            // is moving, the relative path from the new location must be recalculated.
            newTargetAbs = resolvedAbs;
        }

        // Calculate new relative path from NEW file location to new target
        const newFileDir  = dirname(newFilePath);
        let newRel        = relative(newFileDir, newTargetAbs);

        // Normalise: TypeScript doesn't use .ts extension in imports
        // Remove .ts suffix if present in the relative path (it shouldn't be, but be safe)
        if (newRel.endsWith('.ts')) newRel = newRel.slice(0, -3);

        // Ensure starts with ./ or ../
        if (!newRel.startsWith('.')) newRel = './' + newRel;

        if (newRel === importPath) return match; // No change

        changed++;
        logv(`  ${importPath} → ${newRel}`);
        // Reconstruct the match preserving keyword (from/import()
        return match.replace(quote + importPath + quote, quote + newRel + quote);
    });

    if (changed > 0) logv(`  [${changed} imports updated] in ${relative(ROOT, filePath)}`);
    return { content: result, changed };
}

// ── Phase 1: Copy src/core/ → src/engine/subsystems/core/ ────────────────────

log('Phase 1: Copying src/core/ → src/engine/subsystems/core/');
if (!DRY) {
    mkdirSync(DEST_CORE, { recursive: true });
    cpSync(SRC_CORE, DEST_CORE, { recursive: true });
    log(`  Copied ${SRC_CORE} → ${DEST_CORE}`);
} else {
    log('  [DRY] Would copy src/core/ → src/engine/subsystems/core/');
}

// ── Phase 2: Rewrite imports in MOVED files (now at DEST_CORE) ───────────────

log('Phase 2: Rewriting imports in moved files (src/engine/subsystems/core/**/*.ts)');
const movedFiles = collectTs(DEST_CORE);
let movedUpdated = 0;
let movedImports = 0;

for (const destPath of movedFiles) {
    // The original location of this file (in src/core/)
    const relToDestCore = relative(DEST_CORE, destPath);
    const origPath      = resolve(SRC_CORE, relToDestCore);

    let content;
    try { content = readFileSync(destPath, 'utf8'); }
    catch { warn(`Cannot read ${destPath}`); continue; }

    const { content: newContent, changed } = rewriteImports(origPath, destPath, content);
    if (changed > 0) {
        if (!DRY) writeFileSync(destPath, newContent, 'utf8');
        movedUpdated++;
        movedImports += changed;
    }
}
log(`  Updated ${movedUpdated} moved files (${movedImports} import rewrites)`);

// ── Phase 3: Rewrite external importers pointing at src/core/ ────────────────

log('Phase 3: Rewriting external importers in src/ (excluding src/core and src/engine/subsystems/core)');
const externalFiles = collectAllSrcTs().filter(f => !f.startsWith(DEST_CORE + '/') && f !== DEST_CORE);
let extUpdated = 0;
let extImports = 0;

for (const filePath of externalFiles) {
    let content;
    try { content = readFileSync(filePath, 'utf8'); }
    catch { warn(`Cannot read ${filePath}`); continue; }

    // Quick check: does this file have any imports that look like they point into src/core/?
    // (Optimisation — skip files with no relative imports containing 'core')
    if (!content.includes('core/') && !content.includes("/core'") && !content.includes('/core"')) {
        continue;
    }

    const { content: newContent, changed } = rewriteImports(filePath, filePath, content);
    if (changed > 0) {
        if (!DRY) writeFileSync(filePath, newContent, 'utf8');
        extUpdated++;
        extImports += changed;
        if (VERBOSE) log(`  External: ${relative(ROOT, filePath)} (${changed} imports)`);
    }
}
log(`  Updated ${extUpdated} external files (${extImports} import rewrites)`);

// ── Phase 4: Delete src/core/ ────────────────────────────────────────────────

log('Phase 4: Removing src/core/');
if (!DRY) {
    rmSync(SRC_CORE, { recursive: true, force: true });
    log('  src/core/ deleted ✓');
} else {
    log('  [DRY] Would delete src/core/');
}

// ── Summary ───────────────────────────────────────────────────────────────────

log('');
log('═══════════════════════════════════════════════════════════════');
log('Wave 10 Core Migration Summary');
log('═══════════════════════════════════════════════════════════════');
log(`  Mode          : ${DRY ? 'DRY RUN (no writes)' : 'LIVE'}`);
log(`  Files moved   : ${movedFiles.length}`);
log(`  Moved files updated : ${movedUpdated} (${movedImports} imports)`);
log(`  External files updated: ${extUpdated} (${extImports} imports)`);
log(`  src/core/ deleted: ${DRY ? '(skipped in dry run)' : existsSync(SRC_CORE) ? '❌ STILL EXISTS' : '✓'}`);
log('═══════════════════════════════════════════════════════════════');
log('');
log('Next: pnpm tsc --noEmit  →  0 errors');
