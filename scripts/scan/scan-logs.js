#!/usr/bin/env node
/**
 * scan-logs.js — Pre-publish PII / secret-leak guard for server code.
 *
 * Scans server-side JS for the patterns that trip Replit's HoundDog dataflow
 * scan during deployment, so you find them locally instead of at publish time.
 *
 * Run:  npm run scan
 * Exit: 0 = clean, 1 = findings (pipe-friendly)
 *
 * Patterns checked (mirrors the scanner rules that have hit us):
 *
 *  R1  console.* line that interpolates a tainted-looking variable
 *      (email, mail, normalEmail, ownerEmail, password, token, jwt,
 *       apiKey, *_API_KEY, *_SECRET, *_TOKEN, sessionSecret, etc.)
 *
 *  R2  console.* line that mentions a tainted IDENTIFIER outside an
 *      interpolation (e.g. ternary booleans on a *_API_KEY variable —
 *      `apiKey ? 'set' : 'unset'` still trips taint analysis).
 *
 *  R3  Template substring matching `auth=<word>` (the scanner reads this
 *      as a token assignment). Use `authMode=...` instead.
 *
 * See replit.md → "SERVER LOGGING POLICY" for the why and the helpers
 * (server/logSafe.js: maskEmail / maskToken / isConfigured).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['server'];
const TARGET_FILES = ['server.js'];
const SKIP_FILES = new Set(['server/logSafe.js']); // helper itself contains the words by design

// ── Tainted identifier vocabulary ────────────────────────────────────────────
// Substrings that, when interpolated into a console.* call, trip the scanner.
const TAINT_INTERP = [
    'email', 'mail',
    'password', 'passwordHash',
    'token', 'jwt', 'sessionSecret',
    'apiKey', 'API_KEY',
    'SECRET', '_KEY', 'authToken', 'accessToken', 'refreshToken',
];

// Identifiers that, when REFERENCED OUTSIDE a string literal inside console.*,
// taint the call (e.g. boolean checks: `apiKey ? 'set' : 'unset'`).
// String-literal mentions (e.g. `'SESSION_SECRET not set'`) are filtered out
// by `stripStringLiterals()` before this runs.
const TAINT_REFERENCE = [
    /\b[A-Z][A-Z0-9_]*_API_KEY\b/,
    /\b[A-Z][A-Z0-9_]*_SECRET\b/,
    /\b[A-Z][A-Z0-9_]*_TOKEN\b/,
];

// R3: auth=<word> substring inside template strings.
const AUTH_ASSIGN = /\bauth=[a-z][a-z0-9]*/;

/**
 * Replace the contents of every '…' / "…" / `…` string literal with spaces,
 * preserving line length so column offsets stay valid. Template-literal
 * `${...}` interpolations are KEPT (their inner code is real JS).
 */
function stripStringLiterals(code) {
    let out = '';
    let i = 0;
    const n = code.length;
    while (i < n) {
        const ch = code[i];
        if (ch === '\\') {
            // Pass through escaped chars verbatim (we're outside a string here).
            out += ch + (code[i + 1] || '');
            i += 2;
            continue;
        }
        if (ch === "'" || ch === '"') {
            const quote = ch;
            out += ' ';
            i++;
            while (i < n) {
                if (code[i] === '\\') { out += '  '; i += 2; continue; }
                if (code[i] === quote) { out += ' '; i++; break; }
                out += ' ';
                i++;
            }
            continue;
        }
        if (ch === '`') {
            out += ' ';
            i++;
            while (i < n) {
                if (code[i] === '\\') { out += '  '; i += 2; continue; }
                if (code[i] === '`') { out += ' '; i++; break; }
                if (code[i] === '$' && code[i + 1] === '{') {
                    // Keep the interpolation so R2 can still see real refs.
                    out += '${';
                    i += 2;
                    let depth = 1;
                    while (i < n && depth > 0) {
                        if (code[i] === '{') depth++;
                        else if (code[i] === '}') depth--;
                        out += code[i];
                        if (depth === 0) { i++; break; }
                        i++;
                    }
                    continue;
                }
                out += ' ';
                i++;
            }
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

// ── Walker ───────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (name === 'node_modules' || name === '.git') continue;
            walk(full, out);
        } else if (st.isFile() && /\.(js|mjs|cjs|ts)$/.test(name)) {
            out.push(full);
        }
    }
    return out;
}

const files = [];
for (const d of TARGET_DIRS) {
    try { files.push(...walk(join(ROOT, d))); } catch { /* dir missing */ }
}
for (const f of TARGET_FILES) {
    try { statSync(join(ROOT, f)); files.push(join(ROOT, f)); } catch { /* missing */ }
}

// ── Scan ─────────────────────────────────────────────────────────────────────
const findings = [];

for (const file of files) {
    const rel = relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;

    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Strip line comments so we don't flag documentation.
        const code = line.replace(/\/\/.*$/, '');
        if (!/\bconsole\.(log|warn|error|info|debug|trace)\s*\(/.test(code)) continue;

        // De-dupe per (rule, line) so overlapping patterns don't double-count.
        const seenOnLine = new Set();
        const push = (rule, match) => {
            const key = `${rule}|${match}`;
            if (seenOnLine.has(key)) return;
            seenOnLine.add(key);
            findings.push({ rule, file: rel, line: i + 1, snippet: line.trim(), match });
        };

        // R1: tainted identifier inside a ${...} interpolation
        const interpMatches = code.match(/\$\{[^}]+\}/g) || [];
        for (const m of interpMatches) {
            for (const word of TAINT_INTERP) {
                const re = new RegExp(`\\b${word}\\b`, 'i');
                if (re.test(m)) {
                    push('R1', `${m} contains "${word}"`);
                    break;
                }
            }
        }

        // R2: bare identifier reference (NOT inside a string literal). Strip
        // string literals first so things like `'SESSION_SECRET not set'`
        // don't false-positive — HoundDog only flags real variable refs.
        const stripped = stripStringLiterals(code);
        for (const re of TAINT_REFERENCE) {
            const m = stripped.match(re);
            if (m) push('R2', m[0]);
        }

        // R3: auth=<word> substring (template substring or string literal —
        // either way the scanner reads it as a token assignment).
        const authM = code.match(AUTH_ASSIGN);
        if (authM) push('R3', authM[0]);
    }
}

// ── Report ───────────────────────────────────────────────────────────────────
if (findings.length === 0) {
    console.log(`[scan-logs] ✓ Clean — scanned ${files.length} file(s), 0 findings.`);
    process.exit(0);
}

console.error(`[scan-logs] ✗ ${findings.length} potential PII/secret leak(s) found in ${files.length} file(s):\n`);
const ruleDesc = {
    R1: 'PII identifier inside ${…} interpolation',
    R2: 'Tainted secret variable referenced inside console.*',
    R3: 'auth=<word> substring (use authMode=…)',
};
for (const f of findings) {
    console.error(`  [${f.rule}] ${f.file}:${f.line}  — ${ruleDesc[f.rule]}`);
    console.error(`         match: ${f.match}`);
    console.error(`         line:  ${f.snippet}\n`);
}
console.error('See replit.md → "SERVER LOGGING POLICY" and use helpers in server/logSafe.js.');
process.exit(1);
