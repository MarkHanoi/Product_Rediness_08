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
 * WHAT IT CHECKS — the four arms
 * ────────────────────────────────────────────────────────────────────────────
 * ARM A (ratchet, shrink-only, exit 1): a class whose constructor declares a
 *   trailing `runtime: … | null = null` AND whose body optional-chains that
 *   runtime for a BEHAVIOURAL purpose (`?.bus`, `?.events`, `?.commandBus`,
 *   `?.tools`, `?.plugins`), constructed somewhere with ZERO arguments.
 *
 * ARM B (advisory census, gates nothing): the same shape, but the constructor
 *   falls back to `window.runtime`. Latent, not broken.
 *
 * ARM F1 / F2 (subject floors, exit 2): the walk reached its subjects at all.
 *
 * DELIBERATE NON-FINDING — the `window.runtime` fallback.
 * A constructor written `this.runtime = runtime ?? window.runtime ?? null` is
 * NOT reported by ARM A even when a call site omits the argument, because the
 * omission can no longer kill it. That is the sanctioned repair for a singleton
 * reached from several modules (OverridePanel, ViewTemplateManagerPanel),
 * alongside the `toolbar/*` loud-warn pattern and
 * `DataCommandCenter.wireRuntime()`.
 *
 * WHAT IT CANNOT SEE — stated so nobody reads a green as "all runtimes arrive":
 *   · A site that passes a variable which is NULL at that moment. Syntactic
 *     only — it counts arguments, it does not evaluate them.
 *   · A class nothing constructs at all (the authored-but-unwired class). A
 *     panel with zero call sites is invisible here and is a DIFFERENT defect.
 *   · Non-constructor injection (setters, `wireRuntime()`, DI containers).
 *
 * ─── §BLIND-COMPARATOR — CORRECTED 2026-08-31 (audit W3a) ────────────────────
 * Wave 1 gave this gate its two subject floors (MIN_SCANNED_FILES /
 * MIN_RUNTIME_CLASSES) because `walk()` swallows a readdir failure with
 * `catch { return out; }`, so a moved SCAN_DIR yielded "OK: 0 <= baseline 21".
 * That fix was necessary and insufficient, and the audit's own adversarial
 * review said why:
 *
 *     "A subject floor proves the walk FOUND FILES, never that the PREDICATE
 *      matches its subject."
 *
 * The floors could prove this gate read 5114 files. NOTHING proved it would
 * still fire on the L-1890 shape it was built to catch. The predicate here is
 * four hand-written regexes over a language with a real grammar, and one of them
 * HAS already rotted silently: `[^,)]*` in the constructor detector excluded the
 * `)` inside `import('@pryzm/runtime-composer/types')`, making the gate blind to
 * nearly every class it polices — it reported 1 finding instead of 6, and looked
 * exactly as green as a clean tree.
 *
 * ⚠ ARM B is the sharper case: it reads **0 on the real tree** (measured
 * 2026-08-31). A census arm that has never once produced an entry in production
 * is indistinguishable from a census arm that CANNOT produce one. The executed
 * control is the only evidence ARM B works, and it is now that evidence.
 *
 * ⭐ THE FLOORS ARE NOT SUFFICIENT, AND THAT WAS MEASURED, NOT ARGUED (W3a).
 * Two sabotages were run against BOTH the floored-but-uncontrolled version and
 * this one:
 *   · SEVERE rot — restore the historic `[^,)]*` in the constructor detector.
 *     Class census collapses 214 -> 71, crossing MIN_RUNTIME_CLASSES, so the
 *     FLOOR catches it: uncontrolled version RC=2. The floor did its job here.
 *     Recorded because the honest finding is that F2 is not useless.
 *   · MILD rot — rename one entry of BEHAVIOURAL_SLOTS, as any slot rename in
 *     `PryzmRuntime` would. The walk is untouched: 5114 files, 214 classes, BOTH
 *     FLOORS SATISFIED. ARM A drops to 0 and the uncontrolled version prints
 *     "OK: 0 <= baseline 21" at RC=0 — a GREEN over a totally blind predicate,
 *     concealing all 21 known-bad sites at once. With the controls: RC=2.
 * That pair is the whole thesis in one experiment. A floor detects a walk that
 * collapsed; only a planted violation detects a predicate that stopped matching
 * its subject — and the predicate here is four hand-written regexes over a
 * language with a real grammar, which is exactly the thing that rots quietly.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ─────────────────────
 * `selfTest()` materialises two synthetic workspaces and runs the SAME
 * `analyse()` the production run uses — not a private copy, so what fires in the
 * control is what ships — at the SAME production BASELINE:
 *   • PLANTED (negative control) — a panel carrying the exact L-1890 shape,
 *     including the inline-import annotation that once blinded the detector,
 *     constructed bare 22 times, one more than the shipped baseline (ARM A must
 *     fire); a second panel with the sanctioned `?? window.runtime` fallback,
 *     constructed bare (ARM B must fire, and that entry must NOT appear in
 *     ARM A); and one bare construction sitting under a three-line block
 *     comment, whose reported line number must be the REAL one — the
 *     line-preservation lesson, since an earlier stripComments deleted block
 *     comments outright and named PropertyPanelAdapter.ts:42 as :28.
 *   • CLEAN (positive control) — the same estate with every ARM A site passing
 *     the handle, carrying the four shapes that MUST NOT fire: a construction
 *     quoted in a `//` fix note, a construction quoted inside a block comment, a
 *     class whose optional chain touches only a READ-ish slot (`?.visibility` —
 *     the VisibilityIntentPanel non-finding), and a class whose runtime
 *     parameter is REQUIRED rather than optional. Must read ARM A 0.
 *   • The clean tree is re-analysed at the PRODUCTION floors 2500/100, where F1
 *     and F2 must both fire. Wave 1's floors were themselves never watched
 *     failing.
 * If any planted arm stays silent, or the clean tree reads dirty, the gate exits
 * 2 as a BLIND COMPARATOR — an arm never watched failing has never been shown to
 * work.
 *
 * ─── §RAISE-ANNOUNCES-ITSELF ────────────────────────────────────────────────
 * A consequence worth stating, because it is the point rather than a side
 * effect: the controls run at the LIVE baseline while PLANTED_BARE is a fixed
 * 22. Raising the ceiling through `PRYZM_RUNTIME_ARG_BASELINE` therefore leaves
 * 22 planted violations sitting UNDER the raised ceiling, ARM A goes silent on a
 * deliberately planted violation, and the gate exits 2 as a blind comparator
 * instead of going green. The forbidden fix
 * (§RATCHET-EXCEEDED-IS-NEVER-DEBT) now ANNOUNCES ITSELF.
 *   Measured 2026-08-31: `PRYZM_RUNTIME_ARG_BASELINE=99` → RC=2,
 *   "ARM A did not fire on a deliberately planted violation."
 * LOWERING the baseline — the only legitimate direction, as the 21 sites get
 * their arguments back — needs no fixture change: 22 still exceeds anything
 * below 22. If an ADR ever legitimately raises it, PLANTED_BARE moves in the
 * SAME COMMIT; the same rule as a CANONICAL path moving.
 *
 * Exit: 0 within baseline · 1 above baseline · 2 MISCONFIGURED (floor breached
 * or blind comparator) · 3 on internal error.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';

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
 *
 * ⚠ The env override exists ONLY so that raising it is VISIBLE — see
 * §RAISE-ANNOUNCES-ITSELF above. It is a tripwire on the forbidden fix, not a
 * supported knob.
 */
const BASELINE = Number(process.env.PRYZM_RUNTIME_ARG_BASELINE ?? 21);

/**
 * Subject floors (RATCHET R5, lane W1b 2026-08-30).
 *
 * This gate had NO floor of any kind. `walk()` swallows a readdir failure with
 * `catch { return out; }`, so a moved SCAN_DIR, a wrong REPO_ROOT or a permission
 * error yields zero files, zero classes, zero findings -- and prints
 * "OK: 0 <= baseline 21". Failure and emptiness shared a value inside a gate whose
 * whole subject is silent behavioural loss.
 *
 * Measured 2026-08-30: 5114 files scanned, 214 classes with an optional trailing
 * runtime param. The floors sit far below both: they fire when the walk COLLAPSES,
 * not when the tree is refactored.
 */
const MIN_SCANNED_FILES = 2500;
const MIN_RUNTIME_CLASSES = 100;

/** The MISCONFIGURED exit. Never absorbable as debt, never aliased to 0 or 1. */
function die2(msg: string): never {
    console.error(`[${LABEL}] MISCONFIGURED (exit 2) — ${msg}`);
    console.error(`[${LABEL}] This is NOT a pass: the walk did not reach its subjects.`);
    process.exit(2);
}

const SCAN_DIRS = ['apps', 'src', 'packages', 'plugins'];
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__tests__', '__mocks__']);

/** Optional-chained slots that make a missing runtime a SILENT behavioural loss. */
// Slots where a missing runtime loses BEHAVIOUR (a dispatch, a subscription, a
// registration). Deliberately excludes read-ish slots such as `visibility` and
// `stores`: VisibilityIntentPanel only `console.debug`s `runtime?.visibility`,
// and counting that as a silent feature loss would inflate ARM A with entries no
// user could ever notice. The CLEAN control carries a `?.visibility` class, so
// this exclusion is EXECUTED, not asserted.
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
    // names the wrong line is a gate people stop trusting. The PLANTED control
    // asserts the exact line number of a construction sitting under a three-line
    // block comment, so this is EXECUTED, not asserted.
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

/** The arms this gate can decide. F1/F2 exit 2, A exits 1, B gates nothing. */
type Arm = 'F1' | 'F2' | 'A' | 'B';

interface Finding {
    readonly arm: Arm;
    readonly key: string;
    readonly detail: string;
}

interface Analysis {
    readonly filesScanned: number;
    readonly classCount: number;
    readonly armA: readonly string[];
    readonly armB: readonly string[];
    readonly findings: readonly Finding[];
}

/**
 * The whole measurement, over an arbitrary root. Parameterised by root/dirs and
 * by the FLOORS only, so the executed controls can drive the identical code path
 * over a synthetic tree; `baseline` is threaded so the controls run at the LIVE
 * ceiling, which is what makes a raise announce itself.
 *
 * It RETURNS floor breaches rather than exiting on them, so a control can watch
 * F1/F2 fire at their production values. The production caller is the one that
 * turns them into exit 2 — the exit-code contract is unchanged.
 *
 * ARM B is returned as a finding SOLELY so the control can watch the arm fire.
 * The production exit path never reads it; it remains an advisory census.
 */
function analyse(
    root: string,
    dirs: readonly string[],
    minFiles: number,
    minClasses: number,
    baseline: number,
): Analysis {
    const files = dirs.flatMap(d => walk(join(root, d)));
    const findings: Finding[] = [];

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
            // exists to police — it reported 1 finding instead of 6. The PLANTED
            // control writes that exact inline-import annotation, so the lesson is
            // EXECUTED, not asserted.
            if (!/\bruntime\s*:[^,]*?\|\s*null\s*=\s*null/.test(ctorMatch[1])) continue;

            const optionalChained = BEHAVIOURAL_SLOTS.some(slot =>
                new RegExp(`this\\.runtime\\?\\.\\s*${slot}\\b`).test(body)
                || new RegExp(`\\bruntime\\?\\.\\s*${slot}\\b`).test(body));
            const hasWindowFallback = /runtime\s*\?\?\s*window\.runtime/.test(body);

            classes.set(name, { name, file: relative(root, file).split(sep).join('/'),
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
        const rel = relative(root, file).split(sep).join('/');
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

    // ── Findings ─────────────────────────────────────────────────────────────
    if (files.length < minFiles) {
        findings.push({
            arm: 'F1',
            key: `F1::files=${files.length}<${minFiles}`,
            detail: `walked ${files.length} .ts file(s) across ${dirs.join(', ')} under ${root} — floor is ${minFiles}.`,
        });
    }
    if (classes.size < minClasses) {
        findings.push({
            arm: 'F2',
            key: `F2::classes=${classes.size}<${minClasses}`,
            detail: `found ${classes.size} class(es) with an optional trailing runtime param — floor is ${minClasses}. `
                + 'Pass 2 has nothing to look for, so its "0 bare constructions" would be an empty-seed lie, not a clean bill.',
        });
    }
    if (armA.length > baseline) {
        findings.push({
            arm: 'A',
            key: `A::bare=${armA.length}>${baseline}`,
            detail: `${armA.length} bare construction(s) exceed baseline ${baseline} (+${armA.length - baseline}).`,
        });
    }
    if (armB.length > 0) {
        findings.push({
            arm: 'B',
            key: `B::fallback=${armB.length}`,
            detail: `${armB.length} bare construction(s) of a class whose constructor falls back to window.runtime.`,
        });
    }

    return { filesScanned: files.length, classCount: classes.size, armA, armB, findings };
}

// ─── Executed controls — an arm never watched failing is UNPROVEN ────────────

function writeTree(base: string, files: Record<string, string>): void {
    rmSync(base, { recursive: true, force: true });
    for (const [p, body] of Object.entries(files)) {
        const abs = join(base, p.split('/').join(sep));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, body, 'utf8');
    }
}

/**
 * The exact L-1890 shape: optional trailing runtime, INLINE-IMPORT annotation
 * (the `)`-containing type that once blinded the detector), behavioural optional
 * chain. ARM A's subject.
 */
const PANEL_L1890 = [
    'export class OverridePanelFixture {',
    "    private runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;",
    "    constructor(host: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {",
    '        void host; this.runtime = runtime;',
    '    }',
    "    apply(): void { this.runtime?.bus?.executeCommand('vg.assignIntent', {}); }",
    '}',
    '',
].join('\n');

/**
 * The SANCTIONED repair: `?? window.runtime`. ARM B's subject — and a shape
 * ARM A must never claim.
 */
const PANEL_FALLBACK = [
    'export class FallbackPanelFixture {',
    "    private runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;",
    "    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {",
    '        this.runtime = runtime ?? window.runtime ?? null;',
    '    }',
    "    apply(): void { this.runtime?.events?.on('vi:instance-updated', () => {}); }",
    '}',
    '',
].join('\n');

/** READ-ish slot only (the VisibilityIntentPanel non-finding). Must never fire. */
const PANEL_READISH = [
    'export class ReadishPanelFixture {',
    "    private runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;",
    "    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {",
    '        this.runtime = runtime;',
    '    }',
    '    debugOnly(): void { console.debug(this.runtime?.visibility); }',
    '}',
    '',
].join('\n');

/** REQUIRED runtime parameter — not this gate's subject at all. Must never fire. */
const PANEL_REQUIRED = [
    'export class RequiredPanelFixture {',
    "    private runtime: import('@pryzm/runtime-composer/types').PryzmRuntime;",
    "    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime) {",
    '        this.runtime = runtime;',
    '    }',
    "    apply(): void { this.runtime?.bus?.executeCommand('x', {}); }",
    '}',
    '',
].join('\n');

/** The four shapes that MUST NOT fire, carried by BOTH trees. */
const NON_FINDINGS = [
    '// void new OverridePanelFixture();   <- quoted in a fix note; stripComments must kill it',
    '/* a block comment that also quotes',
    '   void new OverridePanelFixture();',
    '   as part of an explanation */',
    'void new ReadishPanelFixture();       // read-ish slot only -> not a behavioural loss',
    'void new RequiredPanelFixture(globalThis.rt);  // required param -> never optional',
    '',
].join('\n');

/**
 * ⚠ A FIXED LITERAL, deliberately — 22, one more than the baseline this gate
 * shipped with. It is NOT regenerated from BASELINE, and that is the whole
 * tripwire: see §RAISE-ANNOUNCES-ITSELF in the header. A planted count derived
 * from the ceiling would keep firing at any ceiling, which would prove the arm
 * works while proving nothing about the raise.
 */
const PLANTED_BARE = 22;

/** Where the line-number control's real construction sits. */
const LINE_CONTROL_SITE = 'apps/editor/src/wiring/lineNumbers.ts:4';

function plantedTree(): Record<string, string> {
    // PLANTED_BARE - 1 sites here, + the single line-number-control site = 22.
    const wiring = Array.from({ length: PLANTED_BARE - 1 },
        (_, i) => `void new OverridePanelFixture();  // site ${i + 1}`).join('\n') + '\n';
    return {
        'src/panels/OverridePanelFixture.ts': PANEL_L1890,
        'src/panels/FallbackPanelFixture.ts': PANEL_FALLBACK,
        'src/panels/ReadishPanelFixture.ts': PANEL_READISH,
        'src/panels/RequiredPanelFixture.ts': PANEL_REQUIRED,
        'src/wiring/initUI.ts': wiring,
        // The LINE-NUMBER control. The bare construction is on line 4; a
        // stripComments that DELETES block comments instead of blanking them
        // reports line 1. Asserted below by exact string.
        'apps/editor/src/wiring/lineNumbers.ts': [
            '/* three-line block comment',
            '   standing above the real site,',
            '   mentioning nothing at all */',
            'void new OverridePanelFixture();',
            '',
        ].join('\n'),
        // ARM B's subject: bare construction of the window.runtime-fallback class.
        'apps/editor/src/wiring/fallbackWiring.ts': 'void new FallbackPanelFixture();\n',
        'apps/editor/src/wiring/nonFindings.ts': NON_FINDINGS,
    };
}

/**
 * CLEAN — the same estate with every ARM A site passing the handle. It still
 * carries the ARM B shape (advisory, gates nothing) and all four non-finding
 * shapes, so the positive control proves the EXCLUSIONS, not merely an empty
 * tree. An empty positive control passes for a gate that reads nothing.
 */
const CLEAN: Record<string, string> = {
    'src/panels/OverridePanelFixture.ts': PANEL_L1890,
    'src/panels/FallbackPanelFixture.ts': PANEL_FALLBACK,
    'src/panels/ReadishPanelFixture.ts': PANEL_READISH,
    'src/panels/RequiredPanelFixture.ts': PANEL_REQUIRED,
    'src/wiring/initUI.ts': 'void new OverridePanelFixture(host, runtime);\n',
    'apps/editor/src/wiring/fallbackWiring.ts': 'void new FallbackPanelFixture();\n',
    'apps/editor/src/wiring/nonFindings.ts': NON_FINDINGS,
};

/**
 * Pass 1 admits only classes with an OPTIONAL trailing runtime param, so
 * RequiredPanelFixture is filtered before the map: three of the four fixtures
 * survive. Pinned so that a detector which silently stops matching its own
 * subject is caught here rather than read as a clean tree.
 */
const CLEAN_EXPECTED_CLASSES = 3;

interface Control {
    readonly ok: boolean;
    readonly lines: readonly string[];
    readonly armsFired: readonly string[];
}

function selfTest(): Control {
    const base = join(tmpdir(), `pryzm-${LABEL}-selftest`);
    const lines: string[] = [];
    const dirs = ['src', 'apps'];
    let armsFired: string[] = [];
    let ok = true;
    try {
        writeTree(join(base, 'planted'), plantedTree());
        writeTree(join(base, 'clean'), CLEAN);

        // Floors relaxed to 1/1 for the A/B controls: the floors exist to catch a
        // walk that reached NOTHING, and these trees are deliberately tiny. The
        // BASELINE stays the production one — a control run at a relaxed ceiling
        // proves nothing about the gate that ships. The floors then get their own
        // control, at their PRODUCTION values, on the line after.
        const bad = analyse(join(base, 'planted'), dirs, 1, 1, BASELINE);
        const good = analyse(join(base, 'clean'), dirs, 1, 1, BASELINE);
        const floored = analyse(join(base, 'clean'), dirs, MIN_SCANNED_FILES, MIN_RUNTIME_CLASSES, BASELINE);

        // The planted SUBJECT is two trees, deliberately: A/B need a tree with
        // findings in them, F1/F2 need a tree measured at the production floors.
        // ⛔ The count below sums BOTH, because it stands beside a list naming
        // both. It previously printed `bad.findings.length` — "2 finding(s),
        // arms fired [A, B, F1, F2]" — a count from one subject next to a list
        // from two. That is §FALSE-GREEN-TERMINAL-LINE in miniature: a summary
        // number that does not measure what the line beside it claims. Every
        // number on this line is now counted from the findings actually printed
        // underneath it.
        const flooredArms = floored.findings.filter(f => f.arm === 'F1' || f.arm === 'F2');
        const fired = new Set<string>([
            ...bad.findings.map(f => f.arm),
            ...flooredArms.map(f => f.arm),
        ]);
        armsFired = [...fired].sort();
        lines.push(`Negative control (planted tree): ${bad.findings.length + flooredArms.length} finding(s), arms fired [${armsFired.join(', ')}]`);
        for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
        for (const f of flooredArms) lines.push(`    ✓ ${f.arm} fired at the PRODUCTION floor — ${f.key}`);
        for (const arm of ['F1', 'F2', 'A', 'B'] as const) {
            if (!fired.has(arm)) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — ARM ${arm} did not fire on a deliberately planted violation.`);
                if (arm === 'A') {
                    lines.push(`      ARM A read ${bad.armA.length} bare construction(s) against baseline ${BASELINE}; `
                        + `${PLANTED_BARE} were planted. If the baseline was RAISED, this IS the raise announcing `
                        + 'itself (§RAISE-ANNOUNCES-ITSELF): put it back, or move PLANTED_BARE in the same commit '
                        + 'as the ADR that raised it.');
                }
            }
        }

        // ARM A must NAME the site, with the RIGHT line number. A summary that
        // loses the line is how the earlier stripComments bug survived.
        if (!bad.armA.some(e => e.includes(LINE_CONTROL_SITE))) {
            ok = false;
            lines.push(`    ✗ BLIND COMPARATOR — ARM A did not name the planted site at ${LINE_CONTROL_SITE} `
                + '(block-comment line preservation broken, or the site was missed entirely).');
        } else {
            lines.push(`    ✓ ARM A named the planted site at ${LINE_CONTROL_SITE} — block-comment line preservation intact`);
        }

        // The window.runtime fallback must land in B and NEVER in A.
        if (bad.armA.some(e => e.startsWith('FallbackPanelFixture'))) {
            ok = false;
            lines.push('    ✗ FALSE POSITIVE — the sanctioned window.runtime fallback was reported by ARM A.');
        }
        if (!bad.armB.some(e => e.startsWith('FallbackPanelFixture'))) {
            ok = false;
            lines.push('    ✗ BLIND COMPARATOR — ARM B did not name the planted window.runtime-fallback construction. '
                + 'ARM B reads 0 on the real tree, so this control is its ONLY evidence.');
        } else {
            lines.push('    ✓ ARM B named the planted window.runtime-fallback construction, and ARM A did not claim it');
        }

        lines.push('Positive control (clean tree — handle passed, carrying the // fix-note, block-comment, '
            + `read-ish-slot and required-param shapes): ${good.armA.length} finding(s) — must be 0`);
        lines.push(`    clean tree read: ${good.filesScanned} file(s) · ${good.classCount} runtime class(es) · `
            + `ARM A ${good.armA.length} · ARM B ${good.armB.length} (advisory, expected 1)`);
        for (const e of good.armA) lines.push(`    ✗ FALSE POSITIVE — ARM A: ${e}`);
        if (good.armA.length !== 0) ok = false;
        if (good.classCount !== CLEAN_EXPECTED_CLASSES) {
            ok = false;
            lines.push(`    ✗ MISCOUNT — the clean tree declares ${CLEAN_EXPECTED_CLASSES} optional-runtime classes; `
                + `pass 1 saw ${good.classCount}. The constructor detector is not matching its own subject, `
                + 'which is exactly the rot that made it report 1 finding instead of 6.');
        }
    } catch (e) {
        ok = false;
        lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
    } finally {
        rmSync(base, { recursive: true, force: true });
    }
    return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

function main(): number {
    const control = selfTest();
    console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
    for (const l of control.lines) console.log('   ' + l);
    if (!control.ok) {
        console.error(
            `\n[${LABEL}] MISCONFIGURED (exit 2) — BLIND COMPARATOR. The executed controls did not `
            + "establish that this gate's arms fire.\n"
            + '  Whatever it would print about the real tree is unproven. A subject floor proves the walk\n'
            + '  FOUND FILES, never that the predicate matches its subject — which is why these controls exist.',
        );
        process.exit(2);
    }
    console.log('');

    const a = analyse(REPO_ROOT, SCAN_DIRS, MIN_SCANNED_FILES, MIN_RUNTIME_CLASSES, BASELINE);

    // §EXIT-CODE-CONTRACT — UNCHANGED for real subjects. F1/F2 are the exit-2
    // floors (previously inline die2 calls, in this same order), ARM A above
    // baseline is exit 1, ARM B never gates.
    const f1 = a.findings.find(f => f.arm === 'F1');
    if (f1) die2(f1.detail);
    const f2 = a.findings.find(f => f.arm === 'F2');
    if (f2) die2(f2.detail);

    console.log(`[${LABEL}] scanned ${a.filesScanned} files (floor ${MIN_SCANNED_FILES}) · ${a.classCount} classes with an optional trailing runtime param (floor ${MIN_RUNTIME_CLASSES})`);
    console.log(`[${LABEL}] ARM A — bare construction of a class that optional-chains runtime for behaviour: ${a.armA.length} / ${BASELINE}`);
    for (const f of a.armA) console.log(`  ✗ ${f}`);
    console.log(`[${LABEL}] ARM B — same shape but the constructor falls back to window.runtime (advisory): ${a.armB.length}`);
    for (const f of a.armB) console.log(`  · ${f}`);

    if (a.findings.some(f => f.arm === 'A')) {
        console.error(
            `\n[${LABEL}] FAIL — ${a.armA.length} exceeds baseline ${BASELINE} (+${a.armA.length - BASELINE}).\n` +
            `A new entry means a UI surface dispatches into \`undefined\` and does NOTHING, silently.\n` +
            `Pass the runtime at the construction site. Do NOT raise the baseline.`,
        );
        return 1;
    }
    console.log(`\n[${LABEL}] OK: ${a.armA.length} <= baseline ${BASELINE}. `
        + `Controls: arms proven to fire [${control.armsFired.join(', ')}].`);
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error(`[${LABEL}] internal error:`, err);
    process.exit(3);
}
