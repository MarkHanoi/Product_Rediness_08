#!/usr/bin/env node
/**
 * Contract 48 — STORAGE-ISOLATION static guard.
 *
 * Sister of `check-project-isolation.mjs`. Where that script verifies every
 * serialized in-memory store is registered with `projectScopeRegistry`, this
 * script closes the OTHER class of leak: side-channel `localStorage` /
 * `sessionStorage` writes whose key is not project-scoped, so a record from
 * Project A is read back into Project B.
 *
 * Failure mode this prevents (real example, Apr 2026):
 *   `UnderlayPersistence` wrote PDF underlays to one global key
 *   `pryzm.floorPlanUnderlay.v1`. The existing project-isolation check
 *   passed because the Underlay tool IS registered as a scope — but the
 *   storage key wasn't keyed by projectId, so the PDF restored into every
 *   project the user opened.
 *
 * Rule: every `localStorage.setItem(KEY, ...)` and `sessionStorage.setItem(KEY, ...)`
 * call in src/ must satisfy ONE of:
 *
 *   A) The key expression is a template literal containing a project / user
 *      identifier (`${projectId}`, `${id}`, `${userId}`, etc.). Guarantees
 *      the value is namespaced per project.
 *
 *   B) The key (or its constant) appears in the OWNER-MANAGED ALLOWLIST
 *      below with a written justification — meaning the value is genuinely
 *      app-global (auth tokens, UI prefs, theme) and crossing projects is
 *      the desired behaviour.
 *
 * Run:    node scripts/check-storage-isolation.mjs
 * Hook:   npm run check:isolation  (chains both static guards)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

/* ────────────────────────────────────────────────────────────────────────── *
 * ALLOWLIST — keys that are intentionally app-global (NOT per-project).
 *
 * To add a new entry, justify in the comment WHY it is safe to share across
 * projects. If the justification is "we'll just clear it on project switch",
 * register a project scope instead and use a project-scoped key.
 *
 * Match rules:
 *   - `literal:`   exact match against a setItem first-arg string literal.
 *   - `constant:`  matches when the first-arg identifier resolves to a
 *                  module-level `const NAME = '<value>'` whose VALUE matches.
 *   - `prefix:`    matches when a string literal STARTS WITH this prefix
 *                  (use sparingly; only for keys that are inherently keyed
 *                  by something other than projectId, e.g. per-user).
 * ────────────────────────────────────────────────────────────────────────── */
const ALLOWLIST = [
    // ── Auth / session (per-user, app-global) ─────────────────────────────
    { kind: 'literal', value: 'bim-platform-token',  why: 'Auth bearer token, lives across all projects for the user.' },
    { kind: 'literal', value: 'bim-platform-user',   why: 'User profile cache, survives login session across all projects.' },
    { kind: 'literal', value: 'bim-auth-token',      why: 'Legacy auth token alias — same scope as bim-platform-token.' },
    { kind: 'constant', value: 'bim-platform-user',  why: 'AUTH_STORAGE_KEY constant in AuthModal/EntitlementStore — see literal entry.' },
    { kind: 'constant', value: 'bim-platform-token', why: 'AUTH_TOKEN_KEY constant in AuthModal — see literal entry.' },

    // ── Legacy / aliased UI-layout keys (cross-project preference) ────────
    { kind: 'constant', value: 'bim-layout-pinned',          why: 'Layout dock pinned-state — UI preference, app-global.' },
    { kind: 'constant', value: 'bim-lnr-active',             why: 'LeftNavRail active tab — UI preference, app-global.' },
    { kind: 'constant', value: 'bim-lnr-width-v2',           why: 'LeftNavRail width — UI preference, app-global.' },
    { kind: 'constant', value: 'rp-panel-width',             why: 'View browser rail-panel width — UI preference, app-global.' },
    { kind: 'constant', value: 'rp-panel-height',            why: 'View browser rail-panel height — UI preference, app-global.' },
    { kind: 'constant', value: 'rp-panel-pinned',            why: 'View browser rail-panel pinned state — UI preference, app-global.' },
    { kind: 'constant', value: 'pryzm-workspace-mode',       why: 'WorkspaceController mode toggle — UI preference, app-global.' },
    { kind: 'constant', value: 'pryzm-portfolio-consent',    why: 'Portfolio analytics consent — per-user, app-global.' },
    { kind: 'constant', value: 'pryzm_query_presets',        why: 'Spatial query saved presets — per-user, reusable across projects.' },
    { kind: 'constant', value: 'bim-projects-index',         why: 'Index of projects on this device — list of project ids, not per-project data.' },
    { kind: 'constant', value: 'pryzm-sync-queue',           why: 'Server sync queue — each item carries its own projectId in payload.' },
    { kind: 'constant', value: 'bim-platform-onboarded',     why: 'WelcomeModal seen flag — once-per-user, all projects.' },
    { kind: 'constant', value: 'pryzm-tpr-width-v4',         why: 'ToolsPanel rail width — UI preference, app-global.' },
    { kind: 'constant', value: 'pryzm-tpr-pinned',           why: 'ToolsPanel rail pinned state — UI preference, app-global.' },

    // ── Onboarding / global UI prefs ──────────────────────────────────────
    { kind: 'literal',  value: 'pryzm-onboarded',                 why: 'Welcome modal seen flag — once-per-user, all projects.' },
    { kind: 'constant', value: 'pryzm-onboarded',                 why: 'ONBOARDED_KEY constant — see literal.' },
    { kind: 'literal',  value: 'pryzm-world-model-prompts',       why: 'User preference: show world-model prompts. App-global.' },
    { kind: 'literal',  value: 'pryzm-ui-prefs',                  why: 'Centralised UI preferences module — see UiPreferences.ts.' },
    { kind: 'constant', value: 'pryzm-ui-prefs',                  why: 'STORAGE_KEY constant in UiPreferences.' },
    { kind: 'literal',  value: 'pryzm-owner-settings',            why: 'Owner-only feature flags — app-global.' },
    { kind: 'constant', value: 'pryzm-owner-settings',            why: 'STORAGE_KEY constant in OwnerFeatureFlags.' },

    // ── UI panel position / dimensions (cross-project layout) ─────────────
    { kind: 'literal',  value: 'bim-pp-pos',                      why: 'Property panel position. App-global UI layout.' },
    { kind: 'literal',  value: 'pryzm-pp-size',                   why: 'Property panel size. App-global UI layout.' },
    { kind: 'constant', value: 'pryzm.dock.v1',                   why: 'Layout dock state — app-global UI layout.' },
    { kind: 'prefix',   value: 'pryzm.toolsRail.',                why: 'Tools rail width / pinned state — UI layout.' },
    { kind: 'prefix',   value: 'pryzm.viewBrowser.',              why: 'View browser rail width / height / pinned — UI layout.' },
    { kind: 'prefix',   value: 'pryzm.leftNav.',                  why: 'Left nav rail width / active tab — UI layout.' },
    { kind: 'literal',  value: 'pryzm.workspace.mode',            why: 'Workspace mode toggle — app-global.' },
    { kind: 'constant', value: 'pryzm.workspace.mode',            why: 'LS_KEY constant in WorkspaceController.' },
    { kind: 'constant', value: 'pryzm-ai-panel-width',            why: 'AI panel width preference — app-global UI layout, persists across projects.' },

    // ── Theme / view defaults ─────────────────────────────────────────────
    { kind: 'constant', value: 'pryzm-bim-scene-bg-color',        why: 'Scene background colour — user theme preference.' },
    { kind: 'constant', value: 'pryzm_scene_bg_color',            why: 'Scene background colour (legacy underscore variant) — user theme preference.' },
    { kind: 'literal',  value: 'pryzm_scene_bg_color',            why: 'Scene background colour (legacy underscore variant) — user theme preference.' },
    { kind: 'literal',  value: 'pryzm.splitView.gridVisible',     why: 'Split-view grid toggle — UI preference.' },
    { kind: 'literal',  value: 'pryzm.planView.gridVisible',      why: 'Plan-view grid toggle — UI preference.' },
    { kind: 'literal',  value: 'pryzm.ifcProjection.includeIFC',  why: 'Global default for IFC inclusion in projections — preference.' },
    { kind: 'constant', value: 'pryzm.ifcProjection.includeIFC',  why: 'LS_KEY constant in IFCProjectionStore.' },

    // ── Renderer / quality preferences ────────────────────────────────────
    { kind: 'constant', value: 'pryzm.renderer.quality',          why: 'Renderer quality preset — user preference.' },
    { kind: 'constant', value: 'pryzm.renderer.hdri',             why: 'HDRI environment preset — user preference.' },

    // ── Spatial query saved presets (user-level, all projects) ────────────
    { kind: 'constant', value: 'pryzm.spatialQuery.presets',      why: 'User-defined query presets — reusable across projects.' },
    { kind: 'constant', value: 'pryzm.portfolioQuery.consent',    why: 'Portfolio query consent flag — user-level.' },

    // ── Hierarchy onboarding banner dismissal (sessionStorage) ────────────
    { kind: 'literal',  value: 'pryzm-hierarchy-setup-dismissed', why: 'Per-tab dismissal of hierarchy banner — sessionStorage.' },

    // ── Project repository indices (already keyed by projectId in payload) ─
    { kind: 'constant', value: 'pryzm.projectRepository.index',   why: 'Index of known projects — keyed by id internally.' },
    { kind: 'prefix',   value: 'pryzm.projectRepository.versions.', why: 'Project-versions store — key already includes projectId after prefix.' },
    { kind: 'prefix',   value: 'bim-project-',                    why: 'Legacy project versions key (`bim-project-<id>-versions`) — already per-project.' },

    // ── Server sync queue (each item tagged with projectId in payload) ────
    { kind: 'constant', value: 'pryzm.serverSync.queue',          why: 'Outgoing sync queue. Each item carries projectId; processor routes correctly.' },

    // ── Entitlement / monetisation (per-user) ─────────────────────────────
    { kind: 'prefix',   value: 'pryzm.entitlements.',             why: 'Per-user entitlement cache.' },
    { kind: 'prefix',   value: 'pryzm.aiusage.',                  why: 'Per-user AI usage tracker (key already includes userId).' },

    // ── Render gallery (per-user, in-memory + sessionStorage) ─────────────
    { kind: 'prefix',   value: 'bim-rendergallery-',              why: 'Per-user render gallery cache.' },
    { kind: 'prefix',   value: 'pryzm.renderGallery.',            why: 'Per-user render gallery cache (v2 prefix).' },

    // ── Per-tab collaboration baseline (sessionStorage, key includes projectId) ─
    { kind: 'prefix',   value: 'pryzm:lastSync:',                 why: 'Catch-up baseline timestamp. Key already includes projectId.' },
];

/* ────────────────────────────────────────────────────────────────────────── *
 * SCAN
 * ────────────────────────────────────────────────────────────────────────── */

const setItemRe = /\b(?:localStorage|sessionStorage)\.setItem\s*\(\s*([^,]+?)\s*,/g;
/** Module-level UPPERCASE constants resolving to a quoted string. */
const constDeclRe = /(?:^|\n)\s*const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(['"`])([^'"`]+)\2/g;
/** ANY-case `const`/`let` declaration whose RHS we can capture verbatim
 *  (one of: a string literal, a template literal, or any expression up to
 *  the line terminator). Used to resolve local helpers like
 *  `const storageKey = `pryzm:lastSync:${currentProjectId}`;`. */
const anyDeclRe = /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;\n]+)/g;

/**
 * Strip block (`/* … *​/`) and line (`// …`) comments from source before
 * scanning. Crude but sufficient — we only need to suppress matches whose
 * `localStorage.setItem(…)` text lives inside a comment (e.g. JSDoc that
 * documents the storage key). String literals are preserved character-for-
 * character (replaced only inside comment runs).
 */
function stripComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        const c2 = src[i + 1];

        // Block comment
        if (c === '/' && c2 === '*') {
            const end = src.indexOf('*/', i + 2);
            const span = end < 0 ? n : end + 2;
            // Preserve newlines so line numbers stay aligned.
            for (let j = i; j < span; j++) out += (src[j] === '\n' ? '\n' : ' ');
            i = span;
            continue;
        }
        // Line comment
        if (c === '/' && c2 === '/') {
            const end = src.indexOf('\n', i + 2);
            const span = end < 0 ? n : end;
            for (let j = i; j < span; j++) out += ' ';
            i = span;
            continue;
        }
        // String literal — copy verbatim through closing quote (skip escapes).
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            out += c;
            i += 1;
            while (i < n) {
                const ch = src[i];
                out += ch;
                if (ch === '\\') {
                    if (i + 1 < n) { out += src[i + 1]; i += 2; continue; }
                }
                i += 1;
                if (ch === quote) break;
            }
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

/** Resolve `CONST_NAME` → string value by scanning the file body. Returns null on miss. */
function resolveConst(src, name) {
    constDeclRe.lastIndex = 0;
    for (const m of src.matchAll(constDeclRe)) {
        if (m[1] === name) return m[3];
    }
    return null;
}

/** Resolve any `const|let|var <name> = <expr>` and return the raw RHS expression. */
function resolveAnyDecl(src, name) {
    anyDeclRe.lastIndex = 0;
    for (const m of src.matchAll(anyDeclRe)) {
        if (m[1] === name) return m[2].trim();
    }
    return null;
}

/**
 * Find an `@project-isolation: …` annotation comment on the line above the
 * setItem call. Lets us hand-mark function-call results where the analyzer
 * can't statically follow the value (e.g. `localStorage.setItem(currentKey(), …)`).
 */
function hasProjectIsolationAnnotation(rawSrc, lineNo) {
    const lines = rawSrc.split('\n');
    // Inspect the 4 lines immediately preceding the setItem call.
    const start = Math.max(0, lineNo - 5);
    for (let i = start; i < lineNo; i++) {
        if (/@project-isolation\s*:/.test(lines[i])) return true;
    }
    return false;
}

/** Returns true when key text contains a `${…projectId…}` / `${…id…}` interpolation. */
function looksProjectScoped(keyText) {
    if (!keyText.startsWith('`')) return false;
    // Any ${...} that mentions an id/projectId/userId-style identifier.
    const interpRe = /\$\{[^}]*\b(projectId|project_id|projId|currentProjectId|activeProjectId|userId|user_id|ownerId|tenantId|id)\b[^}]*\}/i;
    return interpRe.test(keyText);
}

function classifyKey(src, keyText) {
    keyText = keyText.trim();

    // Template literal with project/user identifier interpolation → safe.
    if (looksProjectScoped(keyText)) return { ok: true, reason: 'template-with-id' };

    // Plain string literal → look it up in the allowlist.
    const literalMatch = /^['"`]([^'"`]+)['"`]$/.exec(keyText);
    if (literalMatch) {
        const value = literalMatch[1];
        for (const entry of ALLOWLIST) {
            if (entry.kind === 'literal' && entry.value === value) return { ok: true, reason: 'allowlist-literal' };
            if (entry.kind === 'prefix'  && value.startsWith(entry.value)) return { ok: true, reason: 'allowlist-prefix' };
        }
        return { ok: false, reason: 'literal-not-on-allowlist', evidence: value };
    }

    // Identifier (e.g. STORAGE_KEY or local `key`) → resolve.
    const idMatch = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(keyText);
    if (idMatch) {
        const name = idMatch[1];

        // 1) UPPERCASE module-level string constant
        const constValue = resolveConst(src, name);
        if (constValue != null) {
            for (const entry of ALLOWLIST) {
                if (entry.kind === 'constant' && entry.value === constValue) return { ok: true, reason: 'allowlist-constant' };
                if (entry.kind === 'literal'  && entry.value === constValue) return { ok: true, reason: 'allowlist-literal-via-const' };
                if (entry.kind === 'prefix'   && constValue.startsWith(entry.value)) return { ok: true, reason: 'allowlist-prefix-via-const' };
            }
            return { ok: false, reason: 'constant-not-on-allowlist', evidence: `${name}="${constValue}"` };
        }

        // 2) Any-case const/let — could be a template literal we can re-classify.
        const rhs = resolveAnyDecl(src, name);
        if (rhs != null) {
            // Re-run our key classifier on the RHS expression.
            const inner = classifyKey(src, rhs);
            if (inner.ok) return { ok: true, reason: `via-decl(${inner.reason})` };
            // Fall through with the more informative inner reason.
            return { ok: false, reason: `via-decl(${inner.reason})`, evidence: `${name} = ${rhs.slice(0, 80)}` };
        }

        // Identifier we can't statically resolve (function-call result, etc.).
        return { ok: false, reason: 'unresolved-identifier', evidence: name };
    }

    // Concatenation (`'foo-' + projectId`) — accept if the expression text
    // mentions a project/user identifier. Conservative but avoids a parser.
    if (/\b(projectId|project_id|currentProjectId|activeProjectId|userId|tenantId)\b/.test(keyText)) {
        return { ok: true, reason: 'concat-with-id' };
    }
    if (/\bid\b/.test(keyText) && /\+/.test(keyText)) {
        return { ok: true, reason: 'concat-with-id-loose' };
    }

    return { ok: false, reason: 'unrecognised-key-expression', evidence: keyText.slice(0, 80) };
}

const violations = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full);
        } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
            const rawText = fs.readFileSync(full, 'utf8');
            const text = stripComments(rawText);
            setItemRe.lastIndex = 0;
            for (const m of text.matchAll(setItemRe)) {
                // Compute line number from match index (in stripped text;
                // newlines are preserved so it matches original line numbers).
                const lineNo = text.slice(0, m.index).split('\n').length;
                const keyText = m[1];
                const verdict = classifyKey(text, keyText);
                if (!verdict.ok) {
                    // Final escape hatch: explicit `@project-isolation:` comment
                    // on a line just above the call. Used at sites where the
                    // key comes from a function-call result the analyzer can't
                    // statically follow — the comment forces the author to
                    // document WHY the key is project-safe.
                    if (hasProjectIsolationAnnotation(rawText, lineNo)) continue;
                    violations.push({
                        file: path.relative(ROOT, full),
                        line: lineNo,
                        keyExpression: keyText.slice(0, 100),
                        reason: verdict.reason,
                        evidence: verdict.evidence ?? '',
                    });
                }
            }
        }
    }
}

walk(SRC);

/* ────────────────────────────────────────────────────────────────────────── *
 * REPORT
 * ────────────────────────────────────────────────────────────────────────── */

const banner = '─'.repeat(78);
console.log(banner);
console.log('Contract 48 — Storage-Isolation Static Guard');
console.log(banner);

if (violations.length === 0) {
    console.log('\n✓ Every localStorage / sessionStorage key is either project-scoped or allowlisted.\n');
    process.exit(0);
}

console.error(`\n✗ ${violations.length} storage write(s) found whose key is neither project-scoped nor allowlisted:\n`);
for (const v of violations) {
    console.error(`    • ${v.file}:${v.line}`);
    console.error(`      key:    ${v.keyExpression}`);
    console.error(`      why:    ${v.reason}${v.evidence ? `  (${v.evidence})` : ''}`);
    console.error('');
}
console.error(`To fix:
  1. If the value really is per-project — include the project id in the key
     (template literal:  \`pryzm.<feature>.v1.\${projectId}.<sub>\`).
  2. If the value is intentionally cross-project (auth token, UI preference,
     theme) — add an entry to the ALLOWLIST in this script with a written
     justification.
`);
process.exit(1);
