#!/usr/bin/env tsx
/**
 * §RUNTIME-ARG-OMITTED (L-1893) — the optional-runtime silent-death tripwire.
 *
 * THE DEFECT SHAPE
 * ────────────────────────────────────────────────────────────────────────────
 * A UI class declares an OPTIONAL trailing runtime parameter:
 *
 *     constructor(runtime: PryzmRuntime | null = null) { this.runtime = runtime; }
 *
 * and then dispatches or subscribes through an OPTIONAL CHAIN:
 *
 *     this.runtime?.bus?.executeCommand('vg.assignIntent', …)
 *     this.runtime?.events?.on('vi:instance-updated', …)
 *
 * If a construction site omits the argument, `this.runtime` is `undefined`, the
 * chain short-circuits, and the feature SILENTLY DOES NOTHING. No throw, no log,
 * no type error — the parameter is optional, so the compiler is satisfied.
 *
 * WHY THIS GATE EXISTS
 * ────────────────────────────────────────────────────────────────────────────
 * This shape shipped FOUR times in a single day (2026-08-21):
 *   · L-1633  SheetEditor drag          — sheet moves dispatched nothing
 *   · L-1860  ViewPropertiesPanel       — assigning a view intent did nothing
 *   · L-1890  OverridePanel             — the ENTIRE V/G panel mutated nothing
 *   · L-1892  ViewTemplateManagerPanel  — template create/update did nothing
 *
 * Each was ONE missing positional argument at a site where the handle was
 * already in lexical scope. Every one was found by a human reading code, after a
 * founder reported the feature "doing nothing". That is the most expensive way
 * to find a purely syntactic defect, which is what this gate exists to end.
 *
 * WHAT IT CHECKS
 * ────────────────────────────────────────────────────────────────────────────
 * ARM A (ratchet, shrink-only): a class whose constructor declares a trailing
 *   `runtime: … | null = null` AND whose body optional-chains that runtime for a
 *   BEHAVIOURAL purpose (`?.bus`, `?.events`, `?.commandBus`, `?.tools`,
 *   `?.plugins`), constructed somewhere with ZERO arguments.
 *
 * ARM B (advisory census, gates nothing): classes with the same constructor
 *   shape whose call sites all pass something. Latent, not broken.
 *
 * DELIBERATE NON-FINDING — the `window.runtime` fallback.
 * A constructor written `this.runtime = runtime ?? window.runtime ?? null` is
 * NOT reported even when a call site omits the argument, because the omission
 * can no longer kill it. That is the sanctioned repair for a singleton reached
 * from several modules (OverridePanel, ViewTemplateManagerPanel), alongside the
 * `toolbar/*` loud-warn pattern and `DataCommandCenter.wireRuntime()`.
 *
 * WHAT IT CANNOT SEE — stated so nobody reads a green as "all runtimes arrive":
 *   · A site that passes a variable which is NULL at that moment. Syntactic
 *     only — it counts arguments, it does not evaluate them.
 *   · A class nothing constructs at all (the authored-but-unwired class). A
 *     panel with zero call sites is invisible here and is a DIFFERENT defect.
 *   · Non-constructor injection (setters, `wireRuntime()`, DI containers).
 *
 * Exit: 0 within baseline · 1 above baseline · 3 on internal error.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'runtime-arg-omitted';

/**
 * ARM A baseline — shrink-only. First reading 2026-08-21 (lane VIS1), taken
 * AFTER L-1890 / L-1892 were repaired: 21 bare construction sites remain.
 *
 * ⚠ 21 is a DEBT LEDGER, not a clean bill. Each entry is a surface that may be
 * silently doing nothing right now. Six were independently confirmed dead by
 * code audit the same day — PropertyPanel (PropertyPanelAdapter.ts:42, whose
 * sibling one line up carries an "R4 fix: inject runtime" note), WorkspaceModeBar
 * and SaveUndoRedoHUD (DockingLayout.ts:180-181), AuditStack, SheetEditorPanel
 * (initUI.ts:847), and the ToolsPanelController → CreateRailPanel cascade. They
 * are left in the baseline rather than fixed here because they belong to other
 * lanes' files; the ratchet is what stops the number growing meanwhile.
 *
 * NEVER raise this to make a build pass: a new entry is a feature that silently
 * does nothing in production. Fix the call site instead.
 */
const BASELINE = 21;

const SCAN_DIRS = ['apps', 'src', 'packages', 'plugins'];
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__tests__', '__mocks__']);

/** Optional-chained slots that make a missing runtime a SILENT behavioural loss. */
// Slots where a missing runtime loses BEHAVIOUR (a dispatch, a subscription, a
// registration). Deliberately excludes read-ish slots such as `visibility` and
// `stores`: VisibilityIntentPanel only `console.debug`s `runtime?.visibility`,
// and counting that as a silent feature loss would inflate ARM A with entries no
// user could ever notice.
const BEHAVIOURAL_SLOTS = ['bus', 'events', 'commandBus', 'tools', 'plugins', 'cde', 'viewRegistry', 'toasts', 'workspace'];

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const entry of entries) {
        if (SKIP_DIR.has(entry)) continue;
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) walk(full, out);
        else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')
                 && !entry.includes('.spec.') && !entry.includes('.test.')) out.push(full);
    }
    return out;
}

/** Strip line + block comments so a defect QUOTED in a fix note is not a finding. */
function stripComments(src: string): string {
    // Both replacements PRESERVE LINE COUNT — the block-comment arm blanks each
    // character but keeps every newline. An earlier version deleted block comments
    // outright, which shifted every reported line number after a file's first
    // block comment (PropertyPanelAdapter.ts:42 was reported as :28). A gate that
    // names the wrong line is a gate people stop trusting.
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

interface ClassInfo {
    name: string;
    file: string;
    optionalChained: boolean;
    hasWindowFallback: boolean;
}

function main(): number {
    const files = SCAN_DIRS.flatMap(d => walk(join(REPO_ROOT, d)));

    // ── Pass 1: classes with an optional trailing runtime param ──────────────
    const classes = new Map<string, ClassInfo>();
    for (const file of files) {
        let raw: string;
        try { raw = readFileSync(file, 'utf8'); } catch { continue; }
        if (!raw.includes('runtime')) continue;
        const src = stripComments(raw);

        // Locate every class declaration and the text span it owns (up to the next
        // class declaration, or EOF). Regex, not a parser — but the span is what
        // makes attribution correct in a multi-class file, which naive
        // "nearest preceding `class`" string-splitting gets wrong.
        const decls: Array<{ name: string; start: number }> = [];
        const classRe = /(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/g;
        let c: RegExpExecArray | null;
        while ((c = classRe.exec(src)) !== null) decls.push({ name: c[1], start: c.index });
        if (decls.length === 0) continue;

        for (let i = 0; i < decls.length; i++) {
            const { name, start } = decls[i];
            const end = i + 1 < decls.length ? decls[i + 1].start : src.length;
            const body = src.slice(start, end);

            // `constructor(… runtime: <something> | null = null …)` — the optional
            // trailing parameter that lets a call site omit the handle for free.
            const ctorMatch = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(body);
            if (!ctorMatch) continue;
            // `[^,]*?` NOT `[^,)]*`: the annotation is almost always an inline
            // `import('@pryzm/runtime-composer/types').PryzmRuntime`, which CONTAINS
            // a `)`. Excluding `)` made this gate blind to nearly every class it
            // exists to police — it reported 1 finding instead of 6.
            if (!/\bruntime\s*:[^,]*?\|\s*null\s*=\s*null/.test(ctorMatch[1])) continue;

            const optionalChained = BEHAVIOURAL_SLOTS.some(slot =>
                new RegExp(`this\\.runtime\\?\\.\\s*${slot}\\b`).test(body)
                || new RegExp(`\\bruntime\\?\\.\\s*${slot}\\b`).test(body));
            const hasWindowFallback = /runtime\s*\?\?\s*window\.runtime/.test(body);

            classes.set(name, { name, file: relative(REPO_ROOT, file).split(sep).join('/'),
                                optionalChained, hasWindowFallback });
        }
    }

    // ── Pass 2: bare `new X()` construction sites ────────────────────────────
    const armA: string[] = [];
    const armB: string[] = [];
    for (const file of files) {
        let raw: string;
        try { raw = readFileSync(file, 'utf8'); } catch { continue; }
        if (!raw.includes('new ')) continue;
        const rel = relative(REPO_ROOT, file).split(sep).join('/');
        const lines = stripComments(raw).split('\n');

        for (const [name, info] of classes) {
            if (!info.optionalChained) continue;
            const bare = new RegExp(`new\\s+(?:[A-Za-z0-9_]+\\.)?${name}\\s*\\(\\s*\\)`);
            lines.forEach((line, i) => {
                if (!bare.test(line)) return;
                const entry = `${name} — bare construction at ${rel}:${i + 1} (declared ${info.file})`;
                if (info.hasWindowFallback) armB.push(`${entry}  [window.runtime fallback present]`);
                else armA.push(entry);
            });
        }
    }

    armA.sort(); armB.sort();

    console.log(`[${LABEL}] scanned ${files.length} files · ${classes.size} classes with an optional trailing runtime param`);
    console.log(`[${LABEL}] ARM A — bare construction of a class that optional-chains runtime for behaviour: ${armA.length} / ${BASELINE}`);
    for (const f of armA) console.log(`  ✗ ${f}`);
    console.log(`[${LABEL}] ARM B — same shape but the constructor falls back to window.runtime (advisory): ${armB.length}`);
    for (const f of armB) console.log(`  · ${f}`);

    if (armA.length > BASELINE) {
        console.error(
            `\n[${LABEL}] FAIL — ${armA.length} exceeds baseline ${BASELINE} (+${armA.length - BASELINE}).\n` +
            `A new entry means a UI surface dispatches into \`undefined\` and does NOTHING, silently.\n` +
            `Pass the runtime at the construction site. Do NOT raise the baseline.`,
        );
        return 1;
    }
    console.log(`\n[${LABEL}] OK: ${armA.length} <= baseline ${BASELINE}.`);
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error(`[${LABEL}] internal error:`, err);
    process.exit(3);
}
