#!/usr/bin/env tsx
/**
 * @file tools/rac-conformance/certification/gates/check-provenance-export-boundary.ts
 *
 * C75 §5 · §6.3(c) · §7.7 — THE EXPORT BOUNDARY. The instrument register row
 * **PV-04** has been missing.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * PV-04 reads: *"No export mapping exists. How AUTHORED/OBSERVED/COMPUTED/
 * INFERRED/REGENERATED land in IFC or DXF is undefined. The contract names this
 * its largest open risk: provenance that stops at the export boundary protects
 * nothing downstream — it is how a generated guess ends up in an IFC export as a
 * surveyed fact."*
 *
 * Its status was **UNPROVEN** — not "absent", **unmeasured**. Two executed gates
 * gestured at it without measuring it: `check-provenance-not-invented` names
 * "the EXPORT boundary (§5)" inside its own STILL-UNPROVEN block, and
 * `check-provenance-coverage` measures the field's existence at L0 and says in
 * its own header that coverage "does NOT mean a producer writes a real origin".
 * Neither looks at an exporter. This one does.
 *
 * ─── What makes the question ANSWERABLE now, and not before ─────────────────
 * The gate measures an ASYMMETRY, not an absence, and the asymmetry only became
 * real when PV-02 landed: all 27 element kinds now carry `provenance` in their
 * own L0 schema. So the model holds the field, and the question "does anything
 * carry it across the export boundary" has a subject on both sides. That is why
 * `elementKindsWithProvenance` is a FLOOR here: if the elements ever stop
 * carrying provenance this gate has no subject and exits 2 MISCONFIGURED rather
 * than reporting a comfortable zero.
 *
 * ─── The three arms ─────────────────────────────────────────────────────────
 *  E1 · MAPPING — for each declared export surface, does ANY file reference the
 *       canonical C75 provenance vocabulary? A surface that emits the user's
 *       model to a foreign format while never once mentioning where a value came
 *       from is ONE finding, named by surface. This is the row's actual claim.
 *  E2 · ASYMMETRY EVIDENCE — the IMPORT side already stamps provenance-shaped
 *       fields on the way IN (`IfcSpaceToNativeRoomConverter.ts` writes
 *       `detectionMethod: 'ifc-import'`). Printed as evidence, never as a
 *       finding: it is what proves the vocabulary is not foreign to this
 *       boundary — it crosses inward and is dropped outward.
 *  E3 · §7.7 REFUSAL-OR-MAPPING — the contract does not permit blank. Either the
 *       mapping exists, or its absence is recorded BY NAME as an accepted
 *       limitation in a declared artefact. Neither ⇒ one finding. "Nobody wrote
 *       it down" is the defect C75 §7.7 legislates against, and it is a
 *       different defect from "the mapping is missing".
 *
 * ─── L-716 SATISFIABILITY — green is DEMONSTRATED, not asserted ─────────────
 * A gate with no reachable passing state is a defect, not a standard. Every run
 * executes `selfTest()` FIRST: the identical scanner is pointed at a planted
 * temporary tree containing one exporter that DOES map provenance and one that
 * does not. The scanner must return exactly one finding over that tree — proving
 * in the same process that it can say YES and that it can say NO. If the
 * self-test disagrees the gate exits 2 MISCONFIGURED and reports nothing about
 * the repository, because an instrument that cannot be shown to work has not
 * measured anything.
 *
 * ─── NOT MEASURED (printed every run) ───────────────────────────────────────
 *  · WHETHER A MAPPING WOULD BE CORRECT. This gate measures that the vocabulary
 *    crosses the boundary at all. Whether `INFERRED` lands in the right IFC
 *    Pset, with the right name, readable by the right downstream tool, is a
 *    conformance question no static scan can answer.
 *  · RUNTIME. No export is executed. A reference that exists and is never
 *    reached counts as present here — the CE-05 defect class, inherited.
 *  · THE OTHER DIRECTION. Import-side fidelity (does an IFC file's own
 *    provenance survive INTO the model) is not this gate's subject.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { reportGate, type GateResult, EXIT_MISCONFIGURED } from '../contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');

/**
 * The canonical C75 §1 vocabulary. Deliberately the RECORD names and the field
 * names — not the five origin words on their own, which appear as ordinary
 * English ("computed", "observed") all over a geometry codebase and would make
 * this gate report a mapping wherever someone wrote a comment.
 */
const PROVENANCE_TOKENS = [
    'ValueProvenance',
    'RetrofittedProvenance',
    'ValueOrigin',
    'originDetail',
    'derivationStatus',
    'provenance',          // the field name PV-02 put on all 27 kinds
] as const;

/** Export surfaces — the paths that turn the user's model into a foreign file. */
interface Surface { readonly name: string; readonly dir: string; }
const SURFACES: readonly Surface[] = [
    { name: 'ifc-export', dir: 'plugins/ifc-export/src' },
    { name: 'dxf', dir: 'plugins/dxf/src' },
    { name: 'export-pdf', dir: 'plugins/export-pdf/src' },
    { name: 'file-format/export', dir: 'packages/file-format/src/export' },
];

/** Where a §7.7 written acceptance of the absence would have to live to count. */
const LIMITATION_DECLARATIONS: readonly string[] = [
    'docs/02-decisions/contracts/C75-PROVENANCE.md',
];

function walkTs(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    const stack = [dir];
    while (stack.length > 0) {
        const d = stack.pop()!;
        let entries: string[];
        try { entries = readdirSync(d); } catch { continue; }
        for (const e of entries) {
            if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
            const p = join(d, e);
            let st;
            try { st = statSync(p); } catch { continue; }
            if (st.isDirectory()) stack.push(p);
            else if (/\.(ts|tsx|js)$/.test(e)) out.push(p);
        }
    }
    return out;
}

interface SurfaceReading {
    name: string;
    files: number;
    hits: Array<{ file: string; token: string; line: number }>;
}

/** THE SCANNER — one implementation, used against the repo and against the
 *  planted self-test tree, so the control tests what the verdict uses. */
function scanSurface(root: string, s: Surface): SurfaceReading {
    const files = walkTs(resolve(root, s.dir));
    const hits: SurfaceReading['hits'] = [];
    for (const f of files) {
        let src: string;
        try { src = readFileSync(f, 'utf8'); } catch { continue; }
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            // Comments are not a mapping. A file that only TALKS about provenance
            // does not carry it across the boundary, and counting prose here is
            // exactly how "authored ≠ reachable" gets laundered into a pass.
            const code = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
            if (/^\s*\*/.test(raw)) continue;
            for (const t of PROVENANCE_TOKENS) {
                if (code.includes(t)) {
                    hits.push({ file: relative(root, f).split(sep).join('/'), token: t, line: i + 1 });
                    break;
                }
            }
        }
    }
    return { name: s.name, files: files.length, hits };
}

/** Count element kinds whose L0 schema carries provenance — the OTHER half of
 *  the asymmetry, and a floor: no provenance on elements ⇒ no subject here. */
function countKindsWithProvenance(): { kinds: number; withProvenance: number } {
    const dir = resolve(REPO, 'packages/schemas/src/elements');
    if (!existsSync(dir)) return { kinds: 0, withProvenance: 0 };
    let kinds = 0, withProvenance = 0;
    for (const e of readdirSync(dir)) {
        if (!e.endsWith('.ts') || e === 'index.ts') continue;
        kinds++;
        let src = '';
        try { src = readFileSync(join(dir, e), 'utf8'); } catch { /* counted as without */ }
        if (/Provenance|provenance:/.test(src)) withProvenance++;
    }
    return { kinds, withProvenance };
}

// ─── L-716 SELF-TEST — the scanner must be able to say YES and to say NO ─────
function selfTest(): { ok: boolean; detail: string } {
    const root = mkdtempSync(join(tmpdir(), 'pv04-selftest-'));
    try {
        // Surface that DOES map provenance → must produce hits.
        mkdirSync(join(root, 'mapped'), { recursive: true });
        writeFileSync(join(root, 'mapped', 'writer.ts'),
            'export function pset(e: { provenance?: unknown }) { return e.provenance; }\n');
        // Surface that only TALKS about it in a comment → must produce NO hits.
        mkdirSync(join(root, 'blank'), { recursive: true });
        writeFileSync(join(root, 'blank', 'exporter.ts'),
            '// TODO: one day carry provenance / ValueOrigin across this boundary\n' +
            '/* derivationStatus is not written here */\n' +
            'export function emit(): string { return "IFC"; }\n');

        const mapped = scanSurface(root, { name: 'mapped', dir: 'mapped' });
        const blank = scanSurface(root, { name: 'blank', dir: 'blank' });

        const ok = mapped.hits.length > 0 && blank.hits.length === 0 &&
            mapped.files === 1 && blank.files === 1;
        return {
            ok,
            detail: `planted tree: mapped surface hits=${mapped.hits.length} (must be >0), ` +
                `comment-only surface hits=${blank.hits.length} (must be 0), files=${mapped.files}/${blank.files}`,
        };
    } finally {
        try { rmSync(root, { recursive: true, force: true }); } catch { /* temp dir */ }
    }
}

// ─── RUN ────────────────────────────────────────────────────────────────────
const lines: string[] = [];
const findingNames: string[] = [];

const st = selfTest();
lines.push(`SELF-TEST (L-716 satisfiability) — ${st.ok ? 'PASS' : 'FAIL'}: ${st.detail}`);
if (!st.ok) {
    console.log('\n── check-provenance-export-boundary ' + '─'.repeat(26));
    console.log('   ' + lines[0]);
    console.log(`   → [${EXIT_MISCONFIGURED}] MISCONFIGURED — the scanner failed its own planted-tree control; ` +
        'no verdict about the repository is issued, because an instrument that cannot be shown to work ' +
        'has not measured anything.');
    process.exit(EXIT_MISCONFIGURED);
}

const kindCount = countKindsWithProvenance();
lines.push(`element side — ${kindCount.withProvenance} of ${kindCount.kinds} L0 element kinds carry provenance ` +
    `(PV-02; measured, not quoted)`);

let totalFiles = 0;
const readings: SurfaceReading[] = [];
for (const s of SURFACES) {
    const r = scanSurface(REPO, s);
    readings.push(r);
    totalFiles += r.files;
}

// ── E1 · MAPPING ────────────────────────────────────────────────────────────
lines.push('── E1 · MAPPING — does the C75 vocabulary cross the export boundary? ──');
for (const r of readings) {
    if (r.files === 0) {
        lines.push(`  · ${r.name}: NO SUBJECT — 0 source files found at the declared path. ` +
            'Not counted as clean; the surface is reported as unlocatable.');
        findingNames.push(`E1/${r.name}: export surface not locatable — 0 files at the declared path`);
        continue;
    }
    if (r.hits.length === 0) {
        lines.push(`  · ${r.name}: ${r.files} files, ZERO references to the C75 provenance vocabulary ` +
            `(${PROVENANCE_TOKENS.join(', ')}). The model's provenance stops here.`);
        findingNames.push(`E1/${r.name}: 0 provenance references across ${r.files} export source files`);
    } else {
        const sample = r.hits.slice(0, 3).map((h) => `${h.file}:${h.line} (${h.token})`).join(' · ');
        lines.push(`  · ${r.name}: ${r.files} files, ${r.hits.length} reference(s) — ${sample}`);
    }
}

// ── E2 · ASYMMETRY EVIDENCE (never a finding) ───────────────────────────────
const importSite = 'packages/file-format/src/import/ifc/conversion/IfcSpaceToNativeRoomConverter.ts';
const importPath = resolve(REPO, importSite);
let importEvidence = 'not found';
if (existsSync(importPath)) {
    const src = readFileSync(importPath, 'utf8');
    const m = src.split('\n').findIndex((l: string) => l.includes('detectionMethod'));
    importEvidence = m >= 0 ? `${importSite}:${m + 1} writes a provenance-shaped field ON THE WAY IN` : 'no stamp found';
}
lines.push('── E2 · ASYMMETRY EVIDENCE (printed, never counted as a finding) ──');
lines.push(`  · inbound: ${importEvidence}`);
lines.push('  · outbound: see E1. The vocabulary crosses INTO the model and is dropped on the way OUT — ' +
    'which is C75 §5\'s exact risk statement, now with both halves measured rather than one asserted.');

// ── E3 · §7.7 REFUSAL-OR-MAPPING ────────────────────────────────────────────
lines.push('── E3 · §7.7 — the mapping, or its absence recorded BY NAME. Blank is not permitted. ──');
const mappedSurfaces = readings.filter((r) => r.files > 0 && r.hits.length > 0).length;
let declaredLimitation: string | null = null;
for (const d of LIMITATION_DECLARATIONS) {
    const p = resolve(REPO, d);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    // A §7.7 acceptance must be a DECLARATION, not the rule restating itself.
    //
    // ⚠ This predicate was WRONG on its first cut and the wrong version is
    // recorded here rather than quietly replaced: it matched
    //   "7. The export mapping in §5 exists, or its absence is recorded as an
    //    accepted limitation"
    // — which is C75's own EXIT CONDITION. The gate read the rule as though it
    // were compliance with the rule, and reported §7.7 satisfied over a contract
    // that says nothing of the kind. That is the exact laundering PV-04 and CE-05
    // exist to prevent, committed by the instrument built to measure it.
    //
    // So: conditional phrasings ("exists, or its absence is recorded…") are
    // EXCLUDED by name, and what counts is a declarative acceptance heading that
    // also names the export boundary on the same line.
    const accepted = src.split('\n').filter((l: string) => {
        if (/exists,?\s*or its absence/i.test(l)) return false;      // the rule, not its use
        if (!/\bexport\b/i.test(l)) return false;
        return /ACCEPTED LIMITATION\s*[:—-]/.test(l) ||
               /\bis\s+(hereby\s+)?recorded as an accepted limitation\b/i.test(l);
    });
    if (accepted.length > 0) {
        declaredLimitation = `${d} — "${accepted[0].trim().slice(0, 120)}"`;
        break;
    }
}
if (mappedSurfaces === 0 && !declaredLimitation) {
    lines.push('  · NEITHER: no surface maps the vocabulary, and no artefact records the absence by name ' +
        `(looked in: ${LIMITATION_DECLARATIONS.join(', ')}).`);
    findingNames.push('E3: no export mapping AND no §7.7 written acceptance of its absence — the blank C75 forbids');
} else if (declaredLimitation) {
    lines.push(`  · the absence IS recorded by name in ${declaredLimitation} — §7.7 satisfied in the "or" branch.`);
} else {
    lines.push(`  · ${mappedSurfaces} surface(s) map the vocabulary — §7.7 satisfied in the "mapping" branch.`);
}

lines.push('── NOT MEASURED (printed every run — never silently omitted) ──');
lines.push('  ⚠ WHETHER A MAPPING WOULD BE CORRECT — this gate measures that the vocabulary crosses the ' +
    'boundary, not that it lands in the right IFC Pset under the right name for the right downstream reader.');
lines.push('  ⚠ RUNTIME — no export is executed. A reference that exists and is never reached counts as ' +
    'PRESENT here. That is CE-05\'s defect class and this gate inherits it.');
lines.push('  ⚠ IMPORT FIDELITY — whether a foreign file\'s own provenance survives INTO the model is not ' +
    'this gate\'s subject.');

const result: GateResult = {
    gate: 'check-provenance-export-boundary',
    floors: [
        { what: 'export source files scanned', measured: totalFiles, min: 20 },
        { what: 'L0 element kinds carrying provenance', measured: kindCount.withProvenance, min: 20 },
    ],
    lines,
    findings: findingNames.length,
    // FIRST MEASURED LEVEL, 2026-08-13 — 4 export surfaces with zero provenance
    // references (E1) + the §7.7 blank (E3). SHRINK-ONLY from here: an exporter
    // that gains the mapping must leave this number in the same commit, or the
    // gate exits 3 STALE (C70 §5.4). It may never be raised to absorb a
    // regression (§5.3).
    // 5 → 3, 2026-08-13 (PV-04): ifc-export gained the mapping — every exported
    // element carries a PRYZM_ValueProvenance pset transcribing the L0 record,
    // an absent record exports as UNKNOWN-with-reason, never one of the five
    // (plugins/ifc-export/src/provenance.ts). E1/ifc-export cleared; E3
    // satisfied in the "mapping" branch. Remaining: dxf, export-pdf,
    // file-format/export.
    declared: 3,
    findingNames,
};
process.exit(reportGate(result));
