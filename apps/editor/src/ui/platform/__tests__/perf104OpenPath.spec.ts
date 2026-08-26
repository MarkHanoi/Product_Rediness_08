/**
 * @vitest-environment happy-dom
 */
// §PERF104 (L-11540) — THE PER-PHASE TABLE for "it is extremely slow with not even 200
// elements". Successor to `perf100Probe.spec.ts`, which measured the hub-mount legs at
// 178 ms and could not attribute the founder's hole. Three things are new here:
//
//   1. ⭐ THE OPEN-PATH READ IS MEASURED. PERF100 measured only the legs that touch OTHER
//      projects. The leg that touches THE project being opened — `getLatestVersion`, i.e.
//      mirror-read → envelope-parse → inflate → record-parse → JOURNAL-ATTACH — was never
//      timed, and it is the one that scales with the founder's 5 361 journal records.
//   2. ⭐ THE FIXTURE IS BUILT WITH THE REAL CODEC. `encodeCompressed` (DEFLATE level 1,
//      the shipped one) and `hashJournalChunk` (the shipped digest) build the container,
//      so the inflate and the per-chunk verify are real work, not a modelled cost. A
//      fixture built from a hand-written envelope cannot falsify the read path that
//      parses it (§FAKE-MORE-CAPABLE-THAN-REAL).
//   3. ⭐ THE AUDIT'S LARGEST SINGLE TASK IS MEASURED, not just its total. A 170 ms total
//      spread over 77 yielding chunks and a 170 ms total in ONE synchronous `for` are the
//      same number and a completely different user experience: only the second one makes
//      a click on a project card wait. That distinction is this lane's subject.
//
// ⭐⭐ THE FOUNDER'S OWN MARKS ARRIVED WHILE THIS FILE WAS BEING WRITTEN (build 99eea844,
// 2026-08-26, his demo project, 161 elements) AND THEY RE-RANK THIS LANE. ⛔ Read them
// before quoting anything below as a cause:
//
//     runtime:composed              +0 ms
//     hub:mount-start               +85 ms
//     hub:warm-start                +123 ms   (t+208)
//     hub:warm-thumbs-done          +532 ms   (t+742)   ← the thumbnail-cache warm
//     hub:grid-painted              +63 ms    (t+805)
//     hub:warm-versions-done        +93 ms    (t+898)   ← ⭐ L-11442 ANSWERED: the corpus
//                                                         IDB warm is 93 ms, not seconds
//     hub:sync-start → sync-done    ~509 ms   (t+1407)  (fetch 374 · thumbs 1 · residency 0)
//     hub:open-clicked              +2771 ms            ← HUMAN DWELL, correctly split out
//     open:router-launch            +0 ms
//     open:persistence-openProject  +10 ms
//     boot:ensure-requested         +115 ms
//     boot:heavy-wiring-done        +0 ms
//     boot:engine-start             +759 ms   (t+5064)
//     boot:scene-done               +1164 ms  (t+6227)
//
// ⛔ **THE HUB IS VERY NEARLY EXONERATED ON THAT RUN.** Total MACHINE time from
// `runtime:composed` to `boot:scene-done` is ≈ 3.5 s, and the residency audit — the leg
// this file measures at 109 ms on a 77-project fixture — cost **0 ms**, because that
// account had almost no local-only rows that day. The 44.2 s of 2026-08-25 is NOT
// reproduced. So the honest statement of this lane's size is: **the serialized hub work
// ahead of the first possible click is ~1.4 s, of which ~1.1 s is deferrable. That is the
// win, and it is ~1.1 s, not 40 s.** Anyone quoting this file for a larger number is
// quoting a fixture, not the founder's machine.
//
// The founder still reports "many minutes to open", and his log continues PAST
// `boot:scene-done` (wall-join resolves, §FINISH-FOLLOW-LATE-ATTRIBUTION per wall,
// REDETECT_ROOMS, projections). That window belongs to lane PERF105 and is deliberately
// not touched here — §PERF104 only extends the MARK vocabulary into it so the next
// console bounds it.
//
// ⚠ WHAT THIS HARNESS STILL CANNOT MEASURE, stated so no reader takes the total as "the
// hub is free" — the same two legs PERF100 named, for the same reasons:
//   • happy-dom has no IndexedDB, so `VersionCacheStore.warm()`'s cursor over the real
//     corpus short-circuits. UNMEASURED, not measured cheap. (L-11442 stays OPEN.)
//   • no network, so neither the `GET /api/v1/projects` page (which carries base64
//     thumbnails INLINE, L-10405) nor `tier.streamLoad` is here.
// Everything below is MAIN-THREAD CPU at founder scale. That is exactly the axis that
// makes a click feel dead, and it is the axis this lane changes.
import { describe, it, beforeAll } from 'vitest';
import { encodeCompressed, decodeCompressed } from '../../../workers/compressCodec';
import { hashJournalChunk, JOURNAL_SIDECAR_VERSION } from '@pryzm/persistence-client';

const V3 = '\x00fflate3\x01';

// ── The founder's own dimensions (his 2026-08-26 console) ────────────────────────────
const N_PROJECTS   = 77;    // "residency check over 77 local ids"
const N_SERVER_ROWS = 50;   // the page cap
const N_VERSIONS   = 10;    // "[VersionRepository] 10 version(s)"
const N_JOURNAL    = 5361;  // "5361 journal record(s) … in 3 chunk(s)"
const JOURNAL_CHUNK = 2000; // ProjectRepository.JOURNAL_CHUNK_RECORDS
const N_ELEMENTS   = 200;   // "not even 200 elements"

const ids: string[] = [];
let openedId = '';
let secondOpenedId = '';

// ⚠ SEEDED PRNG, not `i % k`. A fixture whose numbers are a short repeating pattern
// DEFLATEs to almost nothing — the first run of this file produced a 0.17 MB container
// where the founder's console reports ~1.2 MB, i.e. it measured a corpus 7× smaller than
// his while claiming to be built to his dimensions. Real coordinate data is full-precision
// and near-incompressible; the fixture has to be too, or every millisecond below is
// optimistic. (§CORPUS-NEVER-JITTERED, inverted: here the DEFAULT was the scrambled-flat
// case and it had to be made realistic.)
let _seed = 0x5eed104;
function rnd(): number {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

/** One temporal-graph mutation, shaped like the real thing (op + target + payload). */
function makeMutation(i: number): unknown {
    return {
        id: `m-${i}-${rnd().toString(36).slice(2, 10)}`,
        at: 1787690000000 + i * 1000 + Math.floor(rnd() * 997),
        op: i % 3 === 0 ? 'create' : i % 3 === 1 ? 'update' : 'delete',
        target: `el-${i % N_ELEMENTS}`,
        kind: 'wall',
        patch: {
            height: 2.4 + rnd() * 0.9, thickness: 0.1 + rnd() * 0.25,
            materialId: `mat-${i % 12}`,
            start: { x: rnd() * 60, y: rnd() * 12, z: rnd() * 60 },
            end: { x: rnd() * 60, y: rnd() * 12, z: rnd() * 60 },
        },
    };
}

/** One element, shaped like a wall record in a real snapshot. */
function makeElement(i: number): unknown {
    return {
        id: `el-${i}`, type: 'wall', levelId: `L${i % 3}`,
        start: { x: rnd() * 60, y: rnd() * 12, z: rnd() * 60 },
        end: { x: rnd() * 60, y: rnd() * 12, z: rnd() * 60 },
        height: 2.4 + rnd() * 0.9, thickness: 0.1 + rnd() * 0.25, materialId: `mat-${i % 12}`,
        transform: Array.from({ length: 16 }, () => rnd() * 4 - 2),
        params: {
            fireRating: 'EI60', loadBearing: i % 4 === 0, finishInner: 'plaster', finishOuter: 'render',
            uValue: rnd() * 2, area: rnd() * 40, volume: rnd() * 9, guid: rnd().toString(36).slice(2, 12),
        },
    };
}

/**
 * Build a v3 container the way `_persistSlots` does: N version slots, each a DEFLATEd
 * record with its journal DETACHED (`snapshot.temporalGraph.mutations` replaced by a
 * cursor `r`), plus ONE shared journal laid out in `JOURNAL_CHUNK`-record chunks with a
 * real digest per chunk.
 */
function makeContainer(journalRecords: number): string {
    const v = Array.from({ length: N_VERSIONS }, (_, i) => {
        // ⚠ A FRESH element set per version. Sharing one array across all 10 slots let
        // DEFLATE collapse nine of them to a back-reference — the stored container would
        // then be a tenth of a real one, and the read path would look ten times cheaper
        // than it is. Ten saves of a project are ten DIFFERENT snapshots.
        const elements = Array.from({ length: N_ELEMENTS }, (_, e) => makeElement(e));
        const record = {
            id: `v-${i}`,
            timestamp: 1787690000000 + i * 60_000,
            label: `Autosave ${i}`,
            syncStatus: 'synced',
            snapshot: {
                elements,
                levels: [{ id: 'L0', elevation: 0 }, { id: 'L1', elevation: 3 }, { id: 'L2', elevation: 6 }],
                // §JOURNAL-SIDECAR — DETACHED exactly as `detachJournalMutations` leaves
                // it: `mutations` gone, `mutationsRef` in its place. ⛔ Writing
                // `mutations: []` instead would make `attachJournalMutations` report
                // `wasDetached:false` and skip the re-attach entirely — the harness would
                // then measure a read that never puts the journal back and would
                // under-report the open path. (It did, on the first run of this file.)
                temporalGraph: { mutationsRef: { v: JOURNAL_SIDECAR_VERSION, n: journalRecords }, edges: [] },
            },
        };
        return { i: record.id, b: encodeCompressed(JSON.stringify(record)), r: journalRecords };
    });
    const records = Array.from({ length: journalRecords }, (_, i) => makeMutation(i));
    const c: Array<{ b: string; n: number; h: string }> = [];
    for (let start = 0; start < records.length; start += JOURNAL_CHUNK) {
        const slice = records.slice(start, Math.min(start + JOURNAL_CHUNK, records.length));
        const text = JSON.stringify(slice);
        c.push({ b: encodeCompressed(text), n: slice.length, h: hashJournalChunk(text) });
    }
    return V3 + JSON.stringify({ v, j: { k: JOURNAL_CHUNK, n: records.length, c } });
}

let containerBytes = 0;

beforeAll(() => {
    const t0 = performance.now();
    // The project the founder OPENS carries the full journal; the other 76 carry a
    // realistic smaller one (they are only ever ENVELOPE-parsed by the residency audit,
    // never inflated — that asymmetry is the L-1300 property and the fixture must keep it).
    // ⚠ TWO heavy projects, deliberately. The FIRST `getLatestVersion` of a process also
    // pays V8's first-call compile of the whole inflate → parse → attach chain, and
    // charging that to the journal would be a fabricated attribution. Reading #0 and then
    // #1 separates "the first call in this process" from "the steady-state cost".
    const heavy = makeContainer(N_JOURNAL);
    const light = makeContainer(600);
    containerBytes = heavy.length;
    const index: unknown[] = [];
    for (let i = 0; i < N_PROJECTS; i++) {
        const id = `proj-17876000000${String(i).padStart(2, '0')}-abc${i}`;
        ids.push(id);
        localStorage.setItem(`bim-project-${id}-versions`, i <= 1 ? heavy : light);
        index.push({ id, name: `Project ${i}`, updatedAt: Date.now(), versionCount: N_VERSIONS });
    }
    openedId = ids[0]!;
    secondOpenedId = ids[1]!;
    localStorage.setItem('bim-projects-index', JSON.stringify(index));
    console.log(
        `[PERF104] fixture built in ${(performance.now() - t0).toFixed(0)} ms — ${N_PROJECTS} projects; ` +
        `the opened one is ${(heavy.length / 1024 / 1024).toFixed(2)} MB / ${N_VERSIONS} versions / ` +
        `${N_JOURNAL} journal records in ${Math.ceil(N_JOURNAL / JOURNAL_CHUNK)} chunks; ` +
        `the other ${N_PROJECTS - 1} are ${(light.length / 1024 / 1024).toFixed(2)} MB each.`,
    );
});

describe('§PERF104 — per-phase main-thread cost of opening ONE project', () => {
    it('measures every leg the open path currently waits behind', async () => {
        const repo = await import('../ProjectRepository');
        const { planThumbnailReconcile } = await import('../thumbnailReconcile');
        const { decideLocalOnlyProjectFate } = await import('../localOnlyProjectFate');

        const rows: Array<{ leg: string; ms: number; onOpenPath: string; note: string }> = [];
        const time = async (leg: string, onOpenPath: string, note: string, fn: () => unknown): Promise<number> => {
            const t = performance.now();
            await fn();
            const ms = Math.round(performance.now() - t);
            rows.push({ leg, ms, onOpenPath, note });
            return ms;
        };

        // ── A. HUB MAINTENANCE — none of it is about the project being opened ──────
        await time('warmVersionCache (corpus)', 'YES (today)', 'IDB ABSENT here → UNMEASURED, not cheap',
            () => repo.warmVersionCache());
        await time('warmThumbnailCache', 'YES (today)', 'index scan + inline-thumbnail migration',
            () => repo.warmThumbnailCache());
        await time('listProjects', 'YES (today)', 'JSON.parse of bim-projects-index',
            () => repo.projectRepository.listProjects());
        const summaries = ids.slice(0, N_SERVER_ROWS).map(id => ({ id, thumbnailUrl: null }));
        await time('planThumbnailReconcile', 'YES (today)', `${N_SERVER_ROWS} server rows (the page cap)`,
            () => planThumbnailReconcile(summaries, repo.probeCachedThumbnail));

        // ── B. THE RESIDENCY AUDIT — ONE synchronous `for` over 77 unrelated projects ─
        // Timed as a whole AND per project, because the total is not the number that
        // makes a click feel dead: the LONGEST UNINTERRUPTED TASK is.
        const perProject: number[] = [];
        const auditTotal = await time('residency audit ×77', 'YES (today)',
            'probeVersions + decideLocalOnlyProjectFate, ONE uninterrupted task',
            () => {
                for (const id of ids) {
                    const t = performance.now();
                    decideLocalOnlyProjectFate({
                        projectId: id,
                        indexVersionCount: N_VERSIONS,
                        probe: repo.versionRepository.probeVersions(id),
                    });
                    perProject.push(performance.now() - t);
                }
            });
        const upserts = repo.projectRepository.listProjects().slice(0, N_SERVER_ROWS);
        await time('saveProjectsBatch(50)', 'YES (today)', 'the single L-148 index write',
            () => repo.projectRepository.saveProjectsBatch(upserts));

        // ── C. THE OPEN-PATH READ — the ONLY leg that is about the opened project ───
        // ⭐ PERF100 never measured this one. Two readings: COLD (the journal mirror is
        // empty, so all 3 chunks inflate + verify) and WARM (the mirror hits).
        await time('getLatestVersion — 1st EVER', 'YES (correctly)',
            `includes V8 first-call compile of the whole chain (${N_JOURNAL} journal records)`,
            () => repo.versionRepository.getLatestVersion(openedId));
        await time('getLatestVersion — COLD', 'YES (correctly)',
            'steady state, journal mirror EMPTY: 3 chunks inflate + digest-verify',
            () => repo.versionRepository.getLatestVersion(secondOpenedId));
        await time('getLatestVersion — WARM', 'YES (correctly)',
            'same project again, journal mirror HIT: no inflate, no verify',
            () => repo.versionRepository.getLatestVersion(secondOpenedId));

        const sorted = [...perProject].sort((a, b) => b - a);
        const total = rows.reduce((a, b) => a + b.ms, 0);
        const offPathToday = rows.filter(r => r.onOpenPath === 'YES (today)').reduce((a, b) => a + b.ms, 0);

        console.log('\n[PERF104] ══ per-phase MAIN-THREAD cost, founder-scale fixture ══');
        console.log(`  ${'LEG'.padEnd(30)}${'ms'.padStart(8)}   ${'BLOCKS THE OPEN?'.padEnd(14)} NOTE`);
        for (const r of rows) {
            console.log(`  ${r.leg.padEnd(30)}${String(r.ms).padStart(8)}   ${r.onOpenPath.padEnd(14)} ${r.note}`);
        }
        console.log(`  ${'TOTAL'.padEnd(30)}${String(total).padStart(8)}`);
        console.log(
            `\n[PERF104] ⭐ OF THAT, ${offPathToday} ms is work about OTHER projects that the open path ` +
            `waits behind today. The opened project's own read is the last two rows.`,
        );
        console.log(
            `[PERF104] residency audit shape: total ${Math.round(auditTotal)} ms across ${perProject.length} projects · ` +
            `worst single project ${sorted[0]!.toFixed(1)} ms · median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} ms · ` +
            `LONGEST UNINTERRUPTED TASK today = ${Math.round(auditTotal)} ms (the whole loop is one task).`,
        );
        console.log(
            `[PERF104] the opened container is ${(containerBytes / 1024 / 1024).toFixed(2)} MB and every one of the ` +
            `${N_PROJECTS} residency probes JSON.parses a whole container envelope — the cost of opening ONE project ` +
            'is a function of how many OTHER projects exist. That is the defect, in one sentence.',
        );
    }, 600_000);

    // ── THE JOURNAL / SAVE-REWRITE QUESTION ─────────────────────────────────────
    //
    // Asked directly: *"does version persistence re-write all N versions each save?"*
    // The answer is **two different answers for two different costs, and collapsing
    // them is how the §JOURNAL-SIDECAR claim can look both true and false**:
    //
    //   • RE-COMPRESSION is incremental and the L-5801 / L-9983 claims HOLD. An
    //     autosave DEFLATEs exactly one version blob and exactly one journal tail
    //     chunk; the other nine versions and every SEALED chunk are carried forward
    //     as bytes (`_PendingSlot.blob`, `_planJournal`'s `reuse`).
    //   • RE-SERIALIZATION AND RE-WRITE ARE WHOLE-CONTAINER, EVERY SINGLE SAVE.
    //     `_envelopeContainer` JSON.parses the entire stored container on the way in
    //     (ProjectRepository.ts:1617) and `_assembleContainer` JSON.stringifies the
    //     entire container on the way out (ProjectRepository.ts:2352), which then goes
    //     to `putVersions` as one IndexedDB write of the whole thing. So in the I/O
    //     sense the founder is RIGHT: all N versions ARE re-persisted on every tick.
    //
    // ⛔ AND THE JOURNAL IS NEVER PRUNED. `_prepareJournalSlot` writes `incoming =
    // det.mutations`, i.e. the LIVE snapshot's complete `temporalGraph.mutations`.
    // Versions are trimmed at MAX_VERSIONS_STORED = 20; the design journal has no
    // retention policy anywhere in the storage layer. The sidecar can only leave the
    // container when NO stored version references it — and every save writes a cursor,
    // so that never happens. 2 056 → 5 361 records in one day is not an anomaly, it is
    // the designed behaviour, and every open pays for all of it.
    it('measures the per-save cost and projects the journal growth', async () => {
        const raw = localStorage.getItem(`bim-project-${openedId}-versions`)!;
        const body = raw.slice(V3.length);
        const time = (fn: () => unknown): number => {
            const t = performance.now();
            fn();
            return Math.round(performance.now() - t);
        };

        // The two whole-container legs every autosave pays, incremental compression
        // notwithstanding.
        let parsed!: { v: Array<{ i: string; b: string; r?: number }>; j: { k: number; n: number; c: Array<{ b: string; n: number; h: string }> } };
        const msParse = time(() => { parsed = JSON.parse(body); });
        const msStringify = time(() => JSON.stringify(parsed));

        // The compression legs — what IS incremental, measured against what it replaced.
        const oneVersionJson = JSON.stringify({ id: 'v-new', snapshot: { elements: Array.from({ length: N_ELEMENTS }, (_, i) => makeElement(i)) } });
        const msOneVersion = time(() => encodeCompressed(oneVersionJson));
        const msAllVersions = time(() => { for (const e of parsed.v) encodeCompressed(JSON.stringify(e)); });

        // The journal legs. `tail` is what an append re-compresses; `all` is what a
        // DIVERGENT lineage (restore-an-old-version-then-save) costs instead.
        const chunks = parsed.j.c;
        const tailText = JSON.stringify(Array.from({ length: N_JOURNAL % JOURNAL_CHUNK }, (_, i) => makeMutation(i)));
        const msJournalTail = time(() => { encodeCompressed(tailText); hashJournalChunk(tailText); });
        const msJournalAll = time(() => {
            for (const ch of chunks) { const t = decodeCompressed(ch.b); encodeCompressed(t); hashJournalChunk(t); }
        });
        const msJournalRead = time(() => {
            for (const ch of chunks) { const t = decodeCompressed(ch.b); hashJournalChunk(t); }
        });

        const journalBytes = chunks.reduce((a, c) => a + c.b.length, 0);
        const perRecordReadUs = (msJournalRead * 1000) / N_JOURNAL;

        console.log('\n[PERF104] ══ THE JOURNAL / SAVE-REWRITE VERDICT ══');
        console.log(`  container ${(raw.length / 1024 / 1024).toFixed(2)} MB · ${parsed.v.length} versions · ` +
            `${parsed.j.n} journal records in ${chunks.length} chunks (${(journalBytes / 1024).toFixed(0)} KB compressed)`);
        console.log('  ── paid on EVERY autosave, whole-container, NOT incremental ──');
        console.log(`    JSON.parse  (_envelopeContainer, :1617)   ${String(msParse).padStart(5)} ms`);
        console.log(`    JSON.stringify (_assembleContainer, :2352)${String(msStringify).padStart(5)} ms`);
        console.log(`    + one IndexedDB put of the whole ${(raw.length / 1024 / 1024).toFixed(2)} MB payload`);
        console.log('  ── genuinely incremental (the §JOURNAL-SIDECAR claim, upheld) ──');
        console.log(`    DEFLATE one changed version              ${String(msOneVersion).padStart(5)} ms`);
        console.log(`    …vs re-DEFLATE all ${String(parsed.v.length).padStart(2)} versions          ${String(msAllVersions).padStart(5)} ms  ← what is AVOIDED`);
        console.log(`    DEFLATE the journal TAIL chunk           ${String(msJournalTail).padStart(5)} ms`);
        console.log(`    …vs re-DEFLATE all ${String(chunks.length).padStart(2)} chunks             ${String(msJournalAll).padStart(5)} ms  ← what a DIVERGENT lineage costs`);
        console.log('  ── paid on EVERY open, and it grows without bound ──');
        console.log(`    inflate + digest-verify the whole journal${String(msJournalRead).padStart(5)} ms  (${perRecordReadUs.toFixed(3)} ms/1000 records)`);
        for (const mult of [2, 4, 10]) {
            console.log(`      projected at ${String(N_JOURNAL * mult).padStart(6)} records (×${mult}): ` +
                `~${Math.round(msJournalRead * mult)} ms per open, ~${Math.round(journalBytes * mult / 1024)} KB stored`);
        }
        console.log(
            '  ⛔ NO RETENTION POLICY. Versions trim at MAX_VERSIONS_STORED=20; the design journal ' +
            'never trims. `_prepareJournalSlot` stores the LIVE `temporalGraph.mutations` in full, and the ' +
            'sidecar may only leave the container when NO stored version references it — but every save ' +
            'writes a cursor, so that condition is unreachable. The projection above is therefore the ' +
            'trajectory, not a worst case.',
        );
    }, 600_000);
});
