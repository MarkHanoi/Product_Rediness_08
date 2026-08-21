// ─── GATE · check-dependent-adapts-on-host-move ──────────────────────────────
//
// SUBJECT: **one principle, across every element family** — *when a HOST moves,
// its DEPENDENTS adapt.* The founder's ask, 2026-08-21:
//
//     "Elements should propagate when one moves — all contexts. Please audit all
//      elements against this principle."
//
// The audit is ADR-0343's matrix (`docs/02-decisions/adrs/`). This gate is the
// thing that keeps the matrix from rotting, because a matrix in prose decays and
// this repository's own history is the proof — C72 §5.1 asserted
// `RECONCILABLE_TYPES` had "zero consumers" for six days after it acquired one,
// and the BIM30 roadmap still says so at two line numbers.
//
// ─── THE THREE VERDICTS, and why SILENT is the only one that is a FINDING ────
// Every (dependent, host) cell holds exactly one of:
//   · **PROPAGATES** — a production subscriber adapts the dependent. Not a
//     finding. The gate asserts its EVIDENCE still resolves.
//   · **REFUSES** — the dependent does not adapt AND the product says so, by
//     name, with a reason. **An honest refusal is a valid answer** (C74) and is
//     not a finding. The gate asserts the refusal string still exists.
//   · **SILENT** — nothing happens and nothing is said. Two different facts —
//     "there is no dependent here" and "the dependent was never wired" — arrive
//     as the same value. THAT is the defect class (C78 §1.4), and every SILENT
//     cell is one finding on a NAMED, SHRINK-ONLY ledger.
//
// ─── WHY IT IS STATIC, and not executed ──────────────────────────────────────
// The deliberate same reason C72 §6.1.1 gives for `check-propagation-reaches`:
// *"a listener exists"* is a claim about the WHOLE ESTATE, and no headless world
// composes the whole estate. An executed probe answers "no subscriber in THIS
// world", a strictly weaker sentence than the one the matrix asserts. The
// executed sibling for the cells that CAN be driven is
// `check-propagation-trackers-reach.ts` (door/window/cascade-delete/room
// topology) and, for the floor finish, the vitest spec
// `apps/editor/src/engine/__tests__/finishFollowsWallWithNoRecordedRelationship.spec.ts`.
// This gate does not duplicate either; it holds the OTHER ~50 cells that nothing
// drives at all.
//
// ─── THE TWO DIRECTIONS, both required ───────────────────────────────────────
// A one-directional ledger is not a ratchet:
//   ARM A (hard-0) — every PROPAGATES cell's evidence marker must still resolve.
//     A tracker deleted, a `subscribe` call commented out, a composition-root
//     construction removed: the cell has REGRESSED TO SILENT and the gate says so
//     in the commit that does it. This is the arm that earns the gate its keep —
//     it is exactly the failure `finishHostTrackerWiring.spec.ts` §FACT-4 records
//     as invisible to the whole estate ("if the wiring block were deleted,
//     NOTHING in this estate would turn red").
//   ARM B (hard-0) — every REFUSES cell's refusal string must still exist. A
//     refusal that is deleted rather than fixed converts an honest answer into
//     silence, which is a REGRESSION wearing the appearance of a cleanup.
//   ARM C (ratchet, named) — every SILENT cell is a finding. AND, in the other
//     direction, a SILENT cell whose probe says the defect is GONE is STALE:
//     debt that has been paid must leave the ledger in the commit that pays it,
//     or the next regression hides inside it. `verdictOf` exits 3 on stale.
//
// ─── WHAT THIS GATE CANNOT SEE ───────────────────────────────────────────────
//  (a) Whether a PROPAGATES cell propagates CORRECTLY. Arm A is PRESENCE of the
//      wiring, never behaviour — the same limit C72 §6.1.2(b) states. A tracker
//      whose `subscribe` is intact and whose write-back has been commented out
//      passes arm A.
//  (b) Cells whose SILENT status has no mechanical probe. Those carry
//      `"probe": null` and a stated `probeNote`; they are findings, but the
//      STALE direction does not cover them and they can rot. They are named in
//      the ledger's `unprobed` list so the shortfall is countable rather than
//      implied.
//  (c) Propagation under collaboration merge, undo/redo, and save/reload.
//  (d) Whether a SILENT cell SHOULD propagate. The matrix records what the tree
//      does; whether a beam ought to follow its supporting wall is a design
//      question the ADR raises and this gate does not answer.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const LEDGER = resolve(HERE, './host-move-propagation-matrix.json');

type Expect = 'present' | 'absent';

interface Probe {
    /** Repo-relative file OR directory. A directory is walked for .ts/.tsx, tests excluded. */
    path: string;
    /** Literal substring. Not a regex — a regex in a ledger is a second language to maintain. */
    pattern: string;
    expect: Expect;
}

interface Cell {
    dependent: string;
    host: string;
    verdict: 'PROPAGATES' | 'REFUSES' | 'SILENT';
    /** One line, in the gate's own words, printed with the cell. */
    note: string;
    /** PROPAGATES / REFUSES: markers that MUST resolve. SILENT: may be null. */
    probe: Probe[] | null;
    probeNote?: string;
}

interface Ledger {
    cells: Cell[];
    declaredSilent: string[];
    unprobed: string[];
}

const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const IS_TEST = /(__tests__|\.test\.|\.spec\.)/;

let filesRead = 0;
const fileCache = new Map<string, string>();

function readFileCached(abs: string): string {
    const hit = fileCache.get(abs);
    if (hit !== undefined) return hit;
    const text = readFileSync(abs, 'utf8');
    fileCache.set(abs, text);
    filesRead++;
    return text;
}

function walkTs(dir: string, out: string[]): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
        if (SKIP_DIR.has(name)) continue;
        const abs = join(dir, name);
        let st;
        try { st = statSync(abs); } catch { continue; }
        if (st.isDirectory()) { walkTs(abs, out); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        if (IS_TEST.test(abs)) continue;   // production sources only (C72 §1.1)
        out.push(abs);
    }
}

/** Does `probe.pattern` occur in production source under `probe.path`? */
function patternPresent(probe: Probe): { present: boolean; missingPath: boolean } {
    const abs = resolve(REPO, probe.path);
    if (!existsSync(abs)) return { present: false, missingPath: true };
    if (statSync(abs).isDirectory()) {
        const files: string[] = [];
        walkTs(abs, files);
        for (const f of files) {
            if (readFileCached(f).includes(probe.pattern)) return { present: true, missingPath: false };
        }
        return { present: false, missingPath: false };
    }
    return { present: readFileCached(abs).includes(probe.pattern), missingPath: false };
}

function cellKey(c: Cell): string { return `${c.dependent} × ${c.host}`; }

function run(): GateResult {
    const lines: string[] = [];
    const findingNames: string[] = [];
    const stale: string[] = [];

    if (!existsSync(LEDGER)) {
        return {
            gate: 'check-dependent-adapts-on-host-move',
            floors: [{ what: 'ledger host-move-propagation-matrix.json present', measured: 0, min: 1 }],
            lines: ['ledger not found — the matrix IS the subject; without it there is nothing to check'],
            findings: 0, declared: 0,
        };
    }
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
    const cells = ledger.cells ?? [];

    const propagates = cells.filter((c) => c.verdict === 'PROPAGATES');
    const refuses = cells.filter((c) => c.verdict === 'REFUSES');
    const silent = cells.filter((c) => c.verdict === 'SILENT');

    // ── ARM A — PROPAGATES evidence must still resolve ───────────────────────
    let armARegressed = 0;
    for (const c of propagates) {
        const missing: string[] = [];
        for (const p of c.probe ?? []) {
            const r = patternPresent(p);
            if (p.expect === 'present' && !r.present) {
                missing.push(r.missingPath ? `${p.path} DOES NOT EXIST` : `"${p.pattern}" gone from ${p.path}`);
            }
            if (p.expect === 'absent' && r.present) missing.push(`"${p.pattern}" reappeared in ${p.path}`);
        }
        if (missing.length > 0) {
            armARegressed++;
            findingNames.push(`REGRESSED-TO-SILENT: ${cellKey(c)}`);
            lines.push(
                `   ❌ ARM A · ${cellKey(c)} declared PROPAGATES, and its wiring evidence NO LONGER RESOLVES: ` +
                `${missing.join(' · ')}. A dependent that stops being reached is the defect this matrix exists to name — ` +
                `either restore the wiring, or move the cell to SILENT and take the ratchet.`
            );
        }
    }

    // ── ARM B — REFUSES strings must still exist ─────────────────────────────
    let armBDeleted = 0;
    for (const c of refuses) {
        const missing: string[] = [];
        for (const p of c.probe ?? []) {
            const r = patternPresent(p);
            if (p.expect === 'present' && !r.present) {
                missing.push(r.missingPath ? `${p.path} DOES NOT EXIST` : `"${p.pattern}" gone from ${p.path}`);
            }
        }
        if (missing.length > 0) {
            armBDeleted++;
            findingNames.push(`REFUSAL-DELETED: ${cellKey(c)}`);
            lines.push(
                `   ❌ ARM B · ${cellKey(c)} declared REFUSES, and the refusal is GONE: ${missing.join(' · ')}. ` +
                `Deleting a refusal does not fix the gap — it converts an honest answer into silence, which is a ` +
                `regression wearing the appearance of a cleanup (C74).`
            );
        }
    }

    // ── ARM C — every SILENT cell is a finding; a PAID one is STALE ──────────
    const silentNames: string[] = [];
    for (const c of silent) {
        const key = cellKey(c);
        if (c.probe && c.probe.length > 0) {
            let stillSilent = true;
            const evidence: string[] = [];
            for (const p of c.probe) {
                const r = patternPresent(p);
                const holds = p.expect === 'present' ? r.present : !r.present;
                if (!holds) { stillSilent = false; evidence.push(`${p.path} :: "${p.pattern}" expected ${p.expect}`); }
            }
            if (!stillSilent) {
                stale.push(`${key} (${evidence.join(' · ')})`);
                continue;
            }
        }
        silentNames.push(key);
        findingNames.push(`SILENT: ${key}`);
        lines.push(`   · SILENT · ${key} — ${c.note}`);
    }

    lines.unshift(
        `   MATRIX: ${cells.length} cell(s) declared — ${propagates.length} PROPAGATES · ` +
        `${refuses.length} REFUSES · ${silent.length} SILENT. ` +
        `A count of silent cells without a count of what was examined is the empty-seed lie.`
    );
    lines.push(
        `   ARM A (PROPAGATES evidence resolves): ${propagates.length - armARegressed}/${propagates.length} · ` +
        `ARM B (REFUSES string survives): ${refuses.length - armBDeleted}/${refuses.length} · ` +
        `ARM C (SILENT, ratcheted): ${silentNames.length}`
    );
    if ((ledger.unprobed ?? []).length > 0) {
        lines.push(
            `   ⚠ ${ledger.unprobed.length} SILENT cell(s) carry NO mechanical probe and are NOT stale-checked ` +
            `(they can rot): ${ledger.unprobed.join(' · ')}. Named so the shortfall is countable, per C10.`
        );
    }

    const floors: Floor[] = [
        { what: 'matrix cells declared', measured: cells.length, min: 40 },
        { what: 'production files read while resolving evidence', measured: filesRead, min: 20 },
        { what: 'PROPAGATES cells (a matrix of only silence would be a broken scanner)', measured: propagates.length, min: 8 },
        { what: 'REFUSES cells (the product must be able to say no, or arm B is vacuous)', measured: refuses.length, min: 3 },
    ];

    return {
        gate: 'check-dependent-adapts-on-host-move',
        floors,
        lines,
        findings: silentNames.length + armARegressed + armBDeleted,
        declared: (ledger.declaredSilent ?? []).length,
        findingNames,
        stale,
    };
}

process.exit(reportGate(run()));
