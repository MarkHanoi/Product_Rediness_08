#!/usr/bin/env node
/**
 * Contract 45 — CI guard for project-isolation correctness.
 *
 * Fails the build if a store is serialized into ProjectSnapshot but never
 * registered with ProjectScopeRegistry — which would re-open the cross-project
 * data-leak that Contract 45 closed.
 *
 * Run:  node scripts/check-project-isolation.mjs
 * Hook: npm run check:isolation
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// A.U.20 — script moved from scripts/ to scripts/check/. Root now sits
// two levels up from this file (..  was correct under the flat layout;
// .. / ..  is correct under the new taxonomy).
const ROOT      = path.resolve(__dirname, '..', '..');
const SRC       = path.join(ROOT, 'src');
const APPS_EDITOR_SRC = path.join(ROOT, 'apps/editor/src');

// Sprint AT moved src/engine/ → apps/editor/src/engine/
const SERIALIZER = path.join(APPS_EDITOR_SRC, 'engine/persistence/ProjectSerializer.ts');

/* ────────────────────────────────────────────────────────────────────────── *
 * Stores that are intentionally NOT registered with ProjectScopeRegistry
 * because they are cleared via a different mechanism:
 *   - PER-ENGINE stores (Class imports) live in ctx.stores and are wiped
 *     by ClearProjectCommand directly via the project context, never by
 *     a module-singleton registry hook.
 * ────────────────────────────────────────────────────────────────────────── */
const ALLOWLIST = new Set([
    // Module singletons whose data is keyed by a per-element ID and is
    // implicitly wiped when the owning element store is cleared by
    // ClearProjectCommand via ctx.stores. No standalone clear() needed.
    // (Add justification next to each entry.)
]);

/* ────────────────────────────────────────────────────────────────────────── */

if (!fs.existsSync(SERIALIZER)) {
    console.error(`[check:isolation] FATAL — ProjectSerializer.ts not found at ${SERIALIZER}`);
    process.exit(2);
}

const serializerSrc = fs.readFileSync(SERIALIZER, 'utf8');

// 1. Extract module-singleton imports from ProjectSerializer.
//    Only `import { lowercaseName } from '...'` — class imports start uppercase
//    and are per-engine, not module singletons.
const importLineRe = /^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"][^'"]+['"]\s*;/gm;
const singletonImports = new Set();
for (const m of serializerSrc.matchAll(importLineRe)) {
    const names = m[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+/, ''));
    for (const name of names) {
        if (!name) continue;
        // Module singleton convention: lowercase first letter, ends with "Store"
        // or is a known manager singleton (semanticIndex, semanticGraphManager,
        // temporalGraphManager, lifecycleStateManager, visibilityRuleEngine).
        const isLower = /^[a-z]/.test(name);
        const isStoreLike = /Store$/.test(name)
            || /Manager$/.test(name)
            || name === 'semanticIndex'
            || name === 'visibilityRuleEngine';
        if (isLower && isStoreLike) singletonImports.add(name);
    }
}

// 2. Verify each singleton import is referenced (i.e. actually serialized) in
//    the file body — otherwise an unused import would create a false positive.
const referencedSingletons = new Set();
for (const name of singletonImports) {
    const re = new RegExp(`\\b${name}\\b`, 'g');
    const matches = serializerSrc.match(re) ?? [];
    // >1 because the import line itself counts as one occurrence.
    if (matches.length > 1) referencedSingletons.add(name);
}

// 3. Walk src/, packages/ AND plugins/ and collect every scopeName registered
//    with the registry.
//    - Wave 10 migrated some store implementations to packages/core-app-model/.
//    - The annotations plugin (plugins/annotations/) owns annotationStore,
//      annotationVisibilityStore, and constraintStore — their
//      projectScopeRegistry.register() calls live in plugins/, so the guard
//      must discover them there too.
const registeredScopes = new Set();
const scopeRe = /scopeName:\s*['"]([a-zA-Z][a-zA-Z0-9_]*)['"]/g;

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full);
        } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
            const text = fs.readFileSync(full, 'utf8');
            for (const m of text.matchAll(scopeRe)) registeredScopes.add(m[1]);
        }
    }
}
walk(SRC);
// Sprint AT moved engine + UI into apps/editor/src/ — scan it for scope registrations.
if (fs.existsSync(APPS_EDITOR_SRC)) walk(APPS_EDITOR_SRC);
// Also scan workspace packages so migrated stores are found (Wave 10+).
const PACKAGES = path.join(ROOT, 'packages');
if (fs.existsSync(PACKAGES)) walk(PACKAGES);
// Also scan workspace plugins — plugin-owned singletons register their scopes
// inside the plugin source tree (e.g. plugins/annotations/).
const PLUGINS = path.join(ROOT, 'plugins');
if (fs.existsSync(PLUGINS)) walk(PLUGINS);

// 4. Diff: every referenced singleton must have a matching registered scope
//    (matched by identifier name).
const missing = [];
for (const name of referencedSingletons) {
    if (ALLOWLIST.has(name)) continue;
    if (!registeredScopes.has(name)) missing.push(name);
}

// 5. Report.
const banner = '─'.repeat(78);
console.log(banner);
console.log('Contract 45 — Project-Isolation Registry Guard');
console.log(banner);
console.log(`Singletons serialized in ProjectSerializer.ts : ${referencedSingletons.size}`);
console.log(`Scopes registered with ProjectScopeRegistry  : ${registeredScopes.size}`);
console.log(`Allowlisted (intentionally unregistered)     : ${ALLOWLIST.size}`);

if (missing.length === 0) {
    console.log(`\n✓ All serialized singletons are registered. Project isolation is intact.\n`);
    process.exit(0);
}

console.error(`\n✗ ${missing.length} serialized store(s) MISSING from ProjectScopeRegistry:\n`);
for (const name of missing.sort()) console.error(`    • ${name}`);
console.error(`
This means switching projects will leak the above store's data across projects.

To fix, append the following to the store file (after the singleton export):

    import { projectScopeRegistry } from '<relative-path>/core/persistence/ProjectScopeRegistry';
    projectScopeRegistry.register({
        scopeName: '<storeName>',
        clear: () => <storeName>.clear(),     // or .clearCustomTypes(), etc.
        reseed: () => <storeName>.seedDefaults?.(), // optional
    });

If a store is intentionally not registered (e.g. cleared via ctx.stores by
ClearProjectCommand), add it to the ALLOWLIST in this script with a comment
explaining why.
`);
process.exit(1);
