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

/* ────────────────────────────────────────────────────────────────────────── *
 * C13 §3.9 — DEAD-LISTENER GUARD (L-224).
 *
 * The project-lifecycle events `pryzm-project-{switch,loaded,context-set}` are
 * emitted ONLY on the typed `runtime.events` bus (the `F.events` migration
 * re-pointed the emitter). Binding them with `window.addEventListener` is a
 * SILENT no-op — the listener never fires. This is exactly the regression that
 * left ProjectLifecycleController's teardown + ProjectIsolationAudit dead and
 * caused the founder-reported project "reminiscencia" (L-224).
 *
 * FAIL the build on any `window.addEventListener('pryzm-project-{switch,loaded,
 * context-set}', …)` occurrence. Subscribe via `runtime.events.on(...)` (or the
 * `onRuntimeEvent` deferred bridge) instead.
 * ────────────────────────────────────────────────────────────────────────── */
const DEAD_LISTENER_RE =
    /window\s*\.\s*addEventListener\s*\(\s*['"]pryzm-project-(switch|loaded|context-set)['"]/g;

// Two files are KNOWN-PENDING migration and sequenced under a separate ticket
// (out of L-224's fence): ConstraintEngine (per-project constraint recompute)
// and AmbientIntelligence (per-project AI recompute). They are per-project
// recompute niceties, NOT isolation-critical teardown. Remove each entry when
// its listener is migrated to `runtime.events.on`.
const LISTENER_ALLOWLIST = new Set([
    'ConstraintEngine.ts',   // packages/constraint-solver — L-224 follow-up
    'AmbientIntelligence.ts', // packages/ai-host — L-224 follow-up
]);

const listenerOffenders = [];
function walkListeners(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walkListeners(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue; // tests may fabricate DOM events
            if (LISTENER_ALLOWLIST.has(entry.name)) continue;
            const text = fs.readFileSync(full, 'utf8');
            DEAD_LISTENER_RE.lastIndex = 0;
            if (!DEAD_LISTENER_RE.test(text)) continue;
            // Record each offending line for a precise report. Skip comment
            // lines (JSDoc `*`, `//`, `/*`) so docs that MENTION the forbidden
            // pattern (e.g. a fix note) do not trip the guard.
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
                if (/window\s*\.\s*addEventListener\s*\(\s*['"]pryzm-project-(switch|loaded|context-set)['"]/.test(lines[i])) {
                    listenerOffenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
                }
            }
        }
    }
}
if (fs.existsSync(SRC)) walkListeners(SRC);
if (fs.existsSync(APPS_EDITOR_SRC)) walkListeners(APPS_EDITOR_SRC);
if (fs.existsSync(PACKAGES)) walkListeners(PACKAGES);
if (fs.existsSync(PLUGINS)) walkListeners(PLUGINS);

// 5. Report.
const banner = '─'.repeat(78);
console.log(banner);
console.log('C13 — Project-Isolation Guard (registry + dead-listener)');
console.log(banner);
console.log(`Singletons serialized in ProjectSerializer.ts : ${referencedSingletons.size}`);
console.log(`Scopes registered with ProjectScopeRegistry  : ${registeredScopes.size}`);
console.log(`Allowlisted (intentionally unregistered)     : ${ALLOWLIST.size}`);
console.log(`Dead project-lifecycle DOM listeners found    : ${listenerOffenders.length}`);
console.log(`Listener migrations pending (allowlisted)    : ${LISTENER_ALLOWLIST.size}`);

let failed = false;

// 5a. Registry check.
if (missing.length > 0) {
    failed = true;
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
} else {
    console.log(`\n✓ All serialized singletons are registered.`);
}

// 5b. Dead-listener check (C13 §3.9 / L-224).
if (listenerOffenders.length > 0) {
    failed = true;
    console.error(`\n✗ ${listenerOffenders.length} DEAD project-lifecycle DOM listener(s) found:\n`);
    for (const site of listenerOffenders) console.error(`    • ${site}`);
    console.error(`
'pryzm-project-{switch,loaded,context-set}' are emitted ONLY on the typed
'runtime.events' bus. 'window.addEventListener(...)' for these events is a
SILENT no-op — the listener never fires (L-224 root cause).

To fix, subscribe on the typed bus instead:

    window.runtime?.events?.on('pryzm-project-switch', (payload) => { ... });
    // or, for pre-runtime singletons: onRuntimeEvent('pryzm-project-loaded', ...)

If a listener is a known-pending migration sequenced under another ticket, add
its filename to LISTENER_ALLOWLIST in this script with a justification comment.
`);
} else {
    console.log(`✓ No dead project-lifecycle DOM listeners.`);
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 5c. §C13-SCENE-ID-KEY — the scene tripwire must read the key the SCENE uses.
 *
 * C13 §3.10/§3.11 lineage: L-676 (no owner) → L-694 (wrong PROPERTY) →
 * L-711 (incomplete expected set) → L-713 (unmodelled channel) → this, which is
 * "wrong property" again, on the SCENE surface.
 *
 * `ProjectIsolationAudit.detectLeaks` gated its `scene.foreignElement` check on
 * `userData.elementId`. Exactly one production builder stamps that key
 * (StairMeshBuilder); walls, slabs, doors, windows, room-bounding lines, grids
 * and level datums all stamp `userData.id`. The check was therefore dead for
 * fourteen of fifteen families while the audit logged `✓ loaded clean` — and the
 * planted-leak "positive control" did not catch it, because it planted the
 * detector's own shape rather than the builders'.
 *
 * A unit test can be deleted; this gate makes the narrowing itself fail CI.
 * ────────────────────────────────────────────────────────────────────────── */
const AUDIT_FILE = path.join(
    ROOT, 'packages/core-app-model/src/persistence/ProjectIsolationAudit.ts',
);
if (!fs.existsSync(AUDIT_FILE)) {
    failed = true;
    console.error(`\n✗ §C13-SCENE-ID-KEY — ProjectIsolationAudit.ts not found at ${AUDIT_FILE}`);
} else {
    const auditSrc = fs.readFileSync(AUDIT_FILE, 'utf8');
    const readsBothIds   = /ud\.elementId\s*\?\?\s*ud\.id/.test(auditSrc);
    const readsBothTypes = /ud\.elementType\s*\?\?\s*ud\.type/.test(auditSrc);
    if (!readsBothIds || !readsBothTypes) {
        failed = true;
        console.error(`
✗ §C13-SCENE-ID-KEY — ProjectIsolationAudit no longer reads both scene keys.

    userData id   read via 'ud.elementId ?? ud.id':      ${readsBothIds ? 'ok' : 'MISSING'}
    userData type read via 'ud.elementType ?? ud.type':  ${readsBothTypes ? 'ok' : 'MISSING'}

Production builders stamp scene roots with 'id'/'type' (WallFragmentBuilder,
SlabFragmentBuilder, RoomBoundingLineBuilder, BimGridRenderer, LevelVisualizer);
only StairMeshBuilder stamps 'elementId'. Narrowing the read to one key blinds
the scene.foreignElement tripwire to almost every element family, and the audit
then reports '✓ loaded clean' over a scene full of the previous project.
`);
    } else {
        console.log(`✓ §C13-SCENE-ID-KEY — the scene tripwire reads both userData keys.`);
    }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * 5d. §C13-TEARDOWN-TRIGGER-DECLARED (L-8100) — A TEARDOWN MAY ONLY BE
 *     TRIGGERED BY A DECLARED EVENT.
 *
 * WHY THIS ARM EXISTS. 5b above is the L-224 guard, and it did NOT catch L-8100,
 * because the two failures are mirror images and it only models one of them:
 *
 *   5b  — a listener bound to `window` for an event emitted ONLY on the typed bus.
 *   5d  — a listener bound to an event emitted by NOBODY, on any bus.
 *
 * 5b is also keyed on THREE HARD-CODED NAMES (`pryzm-project-{switch,loaded,
 * context-set}`), so it could not have seen a fourth name however dead it was.
 * `initScene.ts:708` bound `instancedElementRenderer.clear()` — the documented
 * teardown of the GPU-instancing renderer — to `'clear-project'`, an event with
 * ZERO dispatchers in the repository and no entry in the event catalog. It ran
 * NEVER, so 36 of project A's stair-railings plus their aggregate InstancedMesh
 * reached project B's scene, and the C13 audit reported them to the founder while
 * this gate printed `✓ No dead project-lifecycle DOM listeners`.
 *
 * THE RULE, and why it is decidable rather than heuristic. Proving "nothing
 * dispatches X" repo-wide is NOT decidable by grep — dispatch happens through
 * computed names and loops, and a sweep that assumes otherwise reports false
 * positives, which is how a gate gets muted. So this arm asks a question with an
 * AUTHORITY behind it instead: `packages/event-bus/src/catalog.ts` is the declared
 * event vocabulary (204 events). A teardown wired to an event that is not even
 * DECLARED is unwired-by-construction — nothing typed can emit it.
 *
 * SCOPE: the three composition roots that own project lifecycle wiring, and only
 * listeners whose handler body actually calls a teardown verb. A `mouseenter`
 * listener is nobody's business here.
 *
 * SHRINK-ONLY, against a NAMED baseline — never a bare count, because a count that
 * stays at 2 while the two entries are swapped for two different ones is a gate
 * that passed while the thing it guards changed completely.
 * ────────────────────────────────────────────────────────────────────────── */
const CATALOG_FILE = path.join(ROOT, 'packages/event-bus/src/catalog.ts');
const TEARDOWN_ROOTS = [
    'apps/editor/src/engine/initScene.ts',
    'apps/editor/src/engine/initTools.ts',
    'apps/editor/src/engine/initBuilders.ts',
];
/**
 * Known, REASONED exceptions. Each is `file:event`, and each carries why it is not
 * the L-8100 defect. Entries leave this list by being fixed; nothing may be added
 * without a reason, and adding one is a deliberate edit in a diff.
 */
const TEARDOWN_TRIGGER_BASELINE = new Map([
    ['apps/editor/src/engine/initScene.ts:project-loaded',
     'PRE-EXISTING, NOT YET ADJUDICATED (L-8105). Bulk level-clip-plane registration. '
     + 'It is absent from the catalog AND an independent sweep found no dispatcher, so it '
     + 'may be a second dead listener — but "may be" is not a finding, and the sweep cannot '
     + 'see computed dispatch. Logged as L-8105 rather than silently fixed or silently '
     + 'excused: a guess dressed as a verdict is the defect this file keeps recording.'],
    ['apps/editor/src/engine/initScene.ts:vd:reprojection-required',
     'NOT DEAD, merely undeclared. The orphan sweep finds real dispatchers for it; it is a '
     + 'view-dependency reprojection signal that predates the catalog. Undeclared is a '
     + 'vocabulary debt, not an unwired teardown. Closes when it is added to catalog.ts.'],
]);
if (!fs.existsSync(CATALOG_FILE)) {
    failed = true;
    console.error(`\n✗ §C13-TEARDOWN-TRIGGER-DECLARED — event catalog not found at ${CATALOG_FILE}`);
} else {
    const catalogSrc = fs.readFileSync(CATALOG_FILE, 'utf8');
    const declaredEvents = new Set(
        [...catalogSrc.matchAll(/^\s*'([a-z][a-z0-9:-]+)'\s*:/gm)].map(m => m[1]),
    );
    // §R5-FLOOR — an ABSENCE claim is only evidence if the sweep read something.
    if (declaredEvents.size < 50) {
        failed = true;
        console.error(
            `\n✗ §C13-TEARDOWN-TRIGGER-DECLARED MISCONFIGURED — parsed only ${declaredEvents.size} ` +
            `event(s) from catalog.ts. A near-empty vocabulary would make every trigger look ` +
            `undeclared, or (worse) the reverse. Fix the parse, do not trust the verdict.`,
        );
    } else {
        const TEARDOWN_VERB = /\.(clear|clearAll|clearCache|dispose|reset|invalidateAll|removeAll)\s*\(/;
        const offenders = [];
        let scannedRoots = 0;
        for (const rel of TEARDOWN_ROOTS) {
            const abs = path.join(ROOT, rel);
            if (!fs.existsSync(abs)) {
                failed = true;
                console.error(`\n✗ §C13-TEARDOWN-TRIGGER-DECLARED — teardown root missing: ${rel}`);
                continue;
            }
            scannedRoots += 1;
            const src = fs.readFileSync(abs, 'utf8');
            for (const m of src.matchAll(/window\s*\.\s*addEventListener\s*\(\s*'([a-z][a-z0-9:-]+)'/g)) {
                const ev = m[1];
                // Only listeners that actually TEAR SOMETHING DOWN are this arm's subject.
                if (!TEARDOWN_VERB.test(src.slice(m.index, m.index + 2500))) continue;
                if (declaredEvents.has(ev)) continue;
                const key = `${rel}:${ev}`;
                if (TEARDOWN_TRIGGER_BASELINE.has(key)) continue;
                offenders.push({ key, line: src.slice(0, m.index).split('\n').length });
            }
        }
        console.log(
            `✓ §C13-TEARDOWN-TRIGGER-DECLARED — ${scannedRoots}/${TEARDOWN_ROOTS.length} root(s) ` +
            `scanned against ${declaredEvents.size} declared events; ` +
            `${TEARDOWN_TRIGGER_BASELINE.size} named exception(s), ${offenders.length} new.`,
        );
        if (offenders.length > 0) {
            failed = true;
            console.error(`\n✗ ${offenders.length} project teardown(s) triggered by an UNDECLARED event:\n`);
            for (const o of offenders) console.error(`    • ${o.key}  (line ${o.line})`);
            console.error(`
An event absent from packages/event-bus/src/catalog.ts cannot be emitted by any
typed producer. A teardown wired to one is unwired BY CONSTRUCTION — it will run
NEVER, and the state it was meant to clear will follow the architect into the
next project. This is L-8100 exactly: 'clear-project' had zero dispatchers, so
the GPU-instancing renderer was never cleared and project A's geometry was still
being drawn inside project B.

To fix, bind the teardown to an event that is actually emitted — 'bim-project-cleared'
is the one ClearProjectCommand emits on every project-entry path — or, better, give
the surface a NAMED OWNER via projectScopeRegistry.register({ scopeName, clear }),
which ClearProjectCommand drives directly and which no event rename can unwire.
`);
        }
    }
}

if (failed) process.exit(1);
console.log(`\n✓ Project isolation is intact.\n`);
process.exit(0);
