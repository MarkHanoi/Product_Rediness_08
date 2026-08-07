#!/usr/bin/env tsx
/**
 * GA Gate: check-declared-project-scopes — ADR-0298 §3 (`§PROBE-SET-DECLARED`).
 *
 * Contract: C13 §3.10 · ADR: ADR-0298 · sibling gate: check-project-isolation.ts
 *
 * `ProjectIsolationAudit` derives its runtime population from
 * `packages/core-app-model/src/persistence/declaredProjectScopes.ts`. This gate is
 * the other half: it checks the DECLARATION against the CODE, so a declaration can
 * neither drift from its owner nor be quietly narrowed.
 *
 * Five checks, all hard-fail:
 *
 *   D1  DECLARED ⇒ REGISTERED. Every declared scope's owning module exists and
 *       contains a `registerProjectScopeProbe(` call. An entry whose owner stopped
 *       registering is the L-694a shape (probe silently absent).
 *
 *   D2  REGISTERED ⇒ DECLARED. Every `registerProjectScopeProbe(` in production
 *       source belongs to a declared module. A new subsystem is born declared or
 *       born failing — never born invisible (ADR-0298 §3).
 *
 *   D3  COMPLETENESS — `resets`. Every identifier in a scope's `resets` list is
 *       present in the owning module. A teardown step deleted or renamed without
 *       updating the declaration fails here rather than in a founder's session.
 *
 *   D4  COMPLETENESS — `counts`, and the L-694b symmetry rule:
 *       `resets ⊆ counts ∪ uncounted`. Every field the owner RESETS must be either
 *       COUNTED by its probe or carry a written reason why not. L-694b was exactly
 *       `cameraSeatedAt` reset but never counted, so the probe answered `null`
 *       truthfully about its own model and falsely about the world. This is the
 *       ADR's open question, answered: presence alone is not enough, and
 *       completeness is checkable HERE — statically, against an independent
 *       declaration — where it is not checkable at runtime.
 *
 *   D5  PRESENCE DEBT. Every `instance-scope` entry must appear in
 *       `declared-project-scope-debt.json`. Instance-scope registration means the
 *       audit cannot distinguish "never constructed" from "registration skipped",
 *       so absence is unproven. The baseline is allowed to shrink, never grow: a
 *       NEW instance-scope declaration fails.
 *
 * Exit 0 → green. Exit 1 → HARD FAIL, merge blocked.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DECLARED_PROJECT_SCOPES,
    type DeclaredProjectScope,
} from '../../packages/core-app-model/src/persistence/declaredProjectScopes';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEBT_FILE = path.join(HERE, 'declared-project-scope-debt.json');

interface DebtBaseline {
    readonly note: string;
    /** scope → why it is still registered from an instance, and what closes it. */
    readonly instanceScopePresence: Record<string, string>;
    /**
     * Files that hold module-level project-scoped state and are NOT declared,
     * mapped to a TRIAGE note. Surfaced by the candidate sweep below. A bare list
     * of paths is the thing this ADR argues against — every entry says what the
     * risk is and what closes it. May only shrink.
     */
    readonly undeclaredStateCandidates: Readonly<Record<string, string>>;
    /**
     * D7 — scope names registered from more than one module, mapped to the decision
     * that closes them. The registry replaces by name silently, so each entry is a
     * store whose clear() is not reached. May only shrink.
     */
    readonly duplicateScopeNames?: Readonly<Record<string, string>>;
}

const failures: string[] = [];
const notes: string[] = [];

function read(rel: string): string | null {
    const abs = path.join(ROOT, rel);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** Strip block + line comments so a doc-comment MENTION never satisfies a check. */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * D6 helper (L-712) — is `callText` REACHED AS AN IMPORT SIDE EFFECT of this module?
 *
 * Two accepted shapes, both genuinely unconditional on import:
 *   1. the call itself at column 0 (`registerProjectScopeProbe({...})`), or
 *   2. a column-0 invocation of a module-local function whose body contains it
 *      (`registerSiteProjectScopeOwners();`) — the shape a module uses when it needs
 *      to be able to re-register after a test harness empties the registry.
 *
 * Anything nested deeper (a constructor, a mount function, a callback) is NOT reached
 * on import and must not claim `module-scope`. This is a source-text check by design:
 * the alternative is trusting a comment, and the whole point of ADR-0298 is that the
 * declaration is verified against an independent artefact rather than believed.
 */
function reachedOnImport(body: string, callText: string): boolean {
    const esc = callText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${esc}`, 'm').test(body)) return true;

    // Column-0 bare invocations: `foo();`
    for (const m of body.matchAll(/^([A-Za-z_$][\w$]*)\(\);/gm)) {
        const fnName = m[1];
        const declRe = new RegExp(`^(?:export\\s+)?function\\s+${fnName}\\s*\\(`, 'm');
        const decl = declRe.exec(body);
        if (!decl) continue;
        // Body runs to the next column-0 `}` — sufficient for the top-level function
        // declarations this check targets.
        const from = decl.index;
        const endRel = body.slice(from).search(/^\}/m);
        const fnBody = endRel === -1 ? body.slice(from) : body.slice(from, from + endRel);
        if (fnBody.includes(callText)) return true;
    }
    return false;
}

const debt: DebtBaseline = JSON.parse(readFileSync(DEBT_FILE, 'utf8')) as DebtBaseline;

// ── D1 / D3 / D4 / D5 — per declared scope ──────────────────────────────────
const declaredModules = new Set<string>();
for (const d of DECLARED_PROJECT_SCOPES as readonly DeclaredProjectScope[]) {
    declaredModules.add(d.module);
    const raw = read(d.module);
    if (raw === null) {
        failures.push(`D1 ${d.scope}: declared owning module does not exist — ${d.module}`);
        continue;
    }
    const body = code(raw);

    // D1 — the owner must actually register a probe.
    if (!body.includes('registerProjectScopeProbe(')) {
        failures.push(
            `D1 ${d.scope}: ${d.module} is declared as the probe owner but contains no ` +
            `registerProjectScopeProbe( call. A declared owner that registers nothing is ` +
            `the L-694a defect: absent from the report rather than reported as unknown.`,
        );
    }
    if (!body.includes(`'${d.scope}'`) && !body.includes(`"${d.scope}"`)) {
        failures.push(
            `D1 ${d.scope}: the scope name literal does not appear in ${d.module}. ` +
            `Declaration and owner must agree on the key.`,
        );
    }

    // D3 — every reset identifier must still exist in the owner.
    for (const id of d.resets) {
        if (!body.includes(id)) {
            failures.push(
                `D3 ${d.scope}: declared reset "${id}" not found in ${d.module}. ` +
                `Either the teardown step was removed/renamed (a silent narrowing of ` +
                `isolation) or the declaration is stale. Fix the code, or edit the ` +
                `declaration deliberately.`,
            );
        }
    }

    // D4 — counts must exist, and resets ⊆ counts ∪ uncounted (the L-694b rule).
    if (d.counts.length === 0) {
        failures.push(`D4 ${d.scope}: counts is empty — a probe that reads nothing cannot earn a null answer.`);
    }
    for (const id of d.counts) {
        if (!body.includes(id)) {
            failures.push(
                `D4 ${d.scope}: declared count "${id}" not found in ${d.module}. ` +
                `The probe no longer reads a field the declaration says it must.`,
            );
        }
    }
    const countSet = new Set(d.counts);
    for (const id of d.resets) {
        if (countSet.has(id)) continue;
        if (Object.prototype.hasOwnProperty.call(d.uncounted, id)) {
            if (!d.uncounted[id] || d.uncounted[id].length < 20) {
                failures.push(`D4 ${d.scope}: uncounted["${id}"] needs a real reason, not a placeholder.`);
            }
            continue;
        }
        failures.push(
            `D4 ${d.scope}: "${id}" is RESET but never COUNTED and carries no reason in ` +
            `\`uncounted\`. This is L-694b exactly — the probe will answer "I hold nothing" ` +
            `while the field it just cleared was the only thing the user could see. Add it ` +
            `to \`counts\` (preferred) or justify it in \`uncounted\`.`,
        );
    }
    for (const id of Object.keys(d.uncounted)) {
        if (!d.resets.includes(id)) {
            failures.push(`D4 ${d.scope}: uncounted["${id}"] is not in \`resets\` — dead justification.`);
        }
    }

    // D6 — MODULE-SCOPE MEANS MODULE SCOPE (L-712). `presence: 'module-scope'` is what
    // licenses the runtime audit to treat this owner's absence as PROVEN clean ("the
    // module was never imported"). That licence is only sound if the registration is a
    // genuine import side effect, so it is checked, not trusted: the call must sit at
    // column 0, not nested inside a constructor or a mount function.
    //
    // This check REPLACES the runtime presence check for these owners — it is the whole
    // reason DECLARED_SCOPES_REQUIRING_PRESENCE can be empty without weakening anything.
    if (d.presence === 'module-scope') {
        if (!reachedOnImport(body, 'registerProjectScopeProbe(')) {
            failures.push(
                `D6 ${d.scope}: declared 'module-scope' but ${d.module} does not call ` +
                `registerProjectScopeProbe( on import. A registration nested inside a ` +
                `constructor or a mount function can be skipped by an early return, which ` +
                `makes its absence UNPROVABLE — and the runtime audit has been told to trust ` +
                `that absence. Either register at module scope, or declare 'instance-scope' ` +
                `and baseline it as debt.`,
            );
        }
        if (!reachedOnImport(body, 'projectScopeRegistry.register(')) {
            failures.push(
                `D6 ${d.scope}: declared 'module-scope' but ${d.module} does not call ` +
                `projectScopeRegistry.register( on import. The teardown owner and the audit ` +
                `probe must carry the SAME presence guarantee — an owner that is sometimes ` +
                `registered is a teardown that sometimes runs.`,
            );
        }
    }

    // D5 — instance-scope presence must be baselined debt.
    if (d.presence === 'instance-scope' && !(d.scope in debt.instanceScopePresence)) {
        failures.push(
            `D5 ${d.scope}: declared \`instance-scope\` but absent from ` +
            `tools/ga-gate/declared-project-scope-debt.json. Instance-scope registration ` +
            `means the audit cannot tell "never constructed" from "registration skipped", ` +
            `so its absence at runtime is UNPROVEN. Either register at module scope, or ` +
            `record the debt with what closes it.`,
        );
    }
}
for (const scope of Object.keys(debt.instanceScopePresence)) {
    const d = DECLARED_PROJECT_SCOPES.find(x => x.scope === scope);
    if (!d) {
        failures.push(`D5: debt baseline lists "${scope}" which is not declared — stale baseline entry.`);
    } else if (d.presence !== 'instance-scope') {
        failures.push(
            `D5: "${scope}" is now \`${d.presence}\` — remove it from the debt baseline. ` +
            `The baseline may only shrink, and this is a shrink.`,
        );
    }
}

// ── D2 — every probe registration in production source must be declared ─────
const SCAN_ROOTS = ['apps', 'packages', 'plugins', 'src'];
const probeSites: string[] = [];
function walk(dir: string, visit: (abs: string) => void): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        const abs = path.join(dir, name);
        let st;
        try { st = statSync(abs); } catch { continue; }
        if (st.isDirectory()) { walk(abs, visit); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        if (/\.(test|spec)\.tsx?$/.test(name)) continue;   // tests fabricate probes on purpose
        if (abs.includes(`${path.sep}__tests__${path.sep}`)) continue;
        visit(abs);
    }
}
for (const r of SCAN_ROOTS) {
    walk(path.join(ROOT, r), (abs) => {
        const rel = path.relative(ROOT, abs).split(path.sep).join('/');
        // The audit module DEFINES registerProjectScopeProbe; it is not a call site.
        if (rel.endsWith('persistence/ProjectIsolationAudit.ts')) return;
        const body = code(readFileSync(abs, 'utf8'));
        if (body.includes('registerProjectScopeProbe(')) probeSites.push(rel);
    });
}
for (const site of probeSites) {
    if (!declaredModules.has(site)) {
        failures.push(
            `D2 ${site}: registers a project-scope probe but is NOT in ` +
            `DECLARED_PROJECT_SCOPES. An undeclared probe puts the audit's population ` +
            `back under the control of whatever happened to register — the exact ` +
            `mechanism ADR-0298 exists to remove. Declare it.`,
        );
    }
}
for (const m of declaredModules) {
    if (!probeSites.includes(m)) {
        // Already reported by D1 with a better message unless the file is missing.
        if (read(m) !== null) notes.push(`(D2) declared module ${m} not seen by the sweep`);
    }
}

// ── D7 — ONE NAME, ONE OWNER (C13 §3.10) ────────────────────────────────────
//
// `ProjectScopeRegistry` is a Map keyed by `scopeName`, and `register()` REPLACES an
// existing entry silently (the branch is there for HMR). So two modules that register
// the same name are not two owners — they are one owner and one store whose `clear()`
// is never invoked by `ClearProjectCommand.clearAll()`, chosen by module-evaluation
// order. Nothing warns.
//
// Four such pairs exist today (`doorStore`, `doorSystemTypeStore`, `windowStore`,
// `windowSystemTypeStore`, each registered from BOTH `core-app-model` and
// `geometry-door`/`geometry-window`). They are currently harmless ONLY BY ACCIDENT:
// the geometry copies happen to evaluate last and are the live ones. Reordering a
// barrel export, or a bundler decision, flips the winner — and then `clearAll()`
// clears an empty stale fork while real doors and windows survive a project switch.
// That is the confidentiality bug the registry was written to prevent.
//
// This gate cannot decide whether to delete the forks or namespace the scopes — that
// is a package-API decision. What it CAN do is make the set closed: the four known
// pairs are baselined, and a fifth fails CI.
const scopeNameSites = new Map<string, Set<string>>();
const SCOPE_NAME_RE = /scopeName:\s*['"]([a-zA-Z][\w.]*)['"]/g;
for (const r of SCAN_ROOTS) {
    walk(path.join(ROOT, r), (abs) => {
        const rel = path.relative(ROOT, abs).split(path.sep).join('/');
        const body = code(readFileSync(abs, 'utf8'));
        SCOPE_NAME_RE.lastIndex = 0;
        for (const m of body.matchAll(SCOPE_NAME_RE)) {
            const set = scopeNameSites.get(m[1]) ?? new Set<string>();
            set.add(rel);
            scopeNameSites.set(m[1], set);
        }
    });
}
const duplicateNames: Record<string, string[]> = {};
for (const [name, files] of scopeNameSites) {
    if (files.size > 1) duplicateNames[name] = [...files].sort();
}
const baselinedDupes = new Set(Object.keys(debt.duplicateScopeNames ?? {}));
for (const [name, files] of Object.entries(duplicateNames)) {
    if (baselinedDupes.has(name)) continue;
    failures.push(
        `D7 duplicate scopeName "${name}" registered from ${files.length} modules:\n` +
        files.map(f => `      • ${f}`).join('\n') +
        `\n   The registry is keyed by name and replaces silently, so ONE of these stores ` +
        `is never cleared on a project switch — decided by module-evaluation order, not by ` +
        `design. Give each owner a distinct name, or delete the duplicate store.`,
    );
}
for (const name of baselinedDupes) {
    if (!(name in duplicateNames)) {
        notes.push(`D7 baseline entry "${name}" is no longer duplicated — remove it from the debt file.`);
    }
}

// ── Candidate sweep — undeclared module-level project-scoped state ──────────
//
// ADR-0298 §3 wants new subsystems holding project-scoped state to be born
// declared or born failing. A full static escape analysis is not available, so
// this is a HEURISTIC with a checked-in baseline: it fails only on files that are
// NEW to the list. The baseline is the pre-existing debt, in full, on purpose —
// it is currently invisible, and an invisible list cannot be paid down.
// Module-level (column-0) mutable state: an initialised `let`/`const` holding a
// null / collection / literal seed, or an uninitialised `let`. Generic arguments
// are tolerated — `new Map<string, Set<string>>()` is the commonest shape in this
// codebase and an earlier, stricter form of this regex missed every one of them.
const STATE_RE = new RegExp(
    String.raw`^(?:export\s+)?(?:let\s+(_?[a-zA-Z]\w*)\s*(?::[^=\n]+)?;`
    + String.raw`|(?:let|const)\s+(_?[a-zA-Z]\w*)\s*(?::[^=\n]+)?=\s*`
    + String.raw`(?:null|new (?:Map|Set|WeakMap|WeakSet)\b|\{\s*\}|\[\s*\]|false|true|0\b))`,
    'gm',
);
const PROJECT_WORDS =
    /(site|geocode|parcel|envelope|terrain|context|massing|viewport|camera|project|brief|furnish|overlay|climate|level|selection|layout|origin|placed|frame|active|last|current|pending|cache)/i;
const CANDIDATE_ROOTS = ['apps/editor/src/ui', 'apps/editor/src/engine'];
const candidates: string[] = [];
for (const r of CANDIDATE_ROOTS) {
    walk(path.join(ROOT, r), (abs) => {
        const rel = path.relative(ROOT, abs).split(path.sep).join('/');
        if (declaredModules.has(rel)) return;
        const body = code(readFileSync(abs, 'utf8'));
        if (body.includes('projectScopeRegistry.register') || body.includes('registerProjectScopeProbe(')) return;
        STATE_RE.lastIndex = 0;
        let hits = 0;
        for (const m of body.matchAll(STATE_RE)) {
            const ident = m[1] ?? m[2] ?? '';
            if (PROJECT_WORDS.test(ident)) hits++;
        }
        if (hits > 0) candidates.push(rel);
    });
}
const baselineSet = new Set(Object.keys(debt.undeclaredStateCandidates));
const newCandidates = candidates.filter(c => !baselineSet.has(c)).sort();
const fixedCandidates = [...baselineSet].filter(c => !candidates.includes(c)).sort();
if (newCandidates.length > 0) {
    failures.push(
        `CANDIDATE SWEEP: ${newCandidates.length} NEW file(s) hold module-level ` +
        `project-scoped state with no declared owner:\n` +
        newCandidates.map(c => `      • ${c}`).join('\n') +
        `\n   Declare an owner (scope + probe + an entry in declaredProjectScopes.ts), or — ` +
        `if the state is genuinely not project-scoped — add the file to ` +
        `undeclaredStateCandidates in declared-project-scope-debt.json with a reason in the diff.`,
    );
}
if (fixedCandidates.length > 0) {
    notes.push(
        `${fixedCandidates.length} baseline candidate(s) no longer match and can be removed ` +
        `from declared-project-scope-debt.json: ${fixedCandidates.slice(0, 10).join(', ')}` +
        (fixedCandidates.length > 10 ? ' …' : ''),
    );
}

// ── Report ──────────────────────────────────────────────────────────────────
const bar = '─'.repeat(78);
console.log(bar);
console.log('ADR-0298 §PROBE-SET-DECLARED — declared project-scope gate');
console.log(bar);
console.log(`Declared scopes                      : ${DECLARED_PROJECT_SCOPES.length}`);
console.log(`Probe registration sites in source   : ${probeSites.length}`);
console.log(`instance-scope presence debt         : ${Object.keys(debt.instanceScopePresence).length}`);
console.log(`Distinct scopeName literals in source : ${scopeNameSites.size}`);
console.log(`Duplicate scopeNames found / baselined: ${Object.keys(duplicateNames).length} / ${baselinedDupes.size}`);
console.log(`Undeclared state candidates (baseline): ${baselineSet.size}`);
console.log(`Undeclared state candidates (now)    : ${candidates.length}`);
for (const n of notes) console.log(`   ℹ ${n}`);

if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} failure(s):\n`);
    for (const f of failures) console.error(`   • ${f}\n`);
    console.error(
        'ADR-0298: the audit checks reality against a DECLARATION, not against whatever\n' +
        'happened to register. Fix the code or edit the declaration deliberately — do not\n' +
        'narrow the check until it passes.\n',
    );
    process.exit(1);
}
console.log('\n✓ Declaration and code agree.\n');
process.exit(0);
