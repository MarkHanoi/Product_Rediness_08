// run-project-open-series.mjs — run `measure-project-open.mjs` N times and report MEDIANS.
//
// ⛔ WHY THIS EXISTS, AND IT IS THE WHOLE POINT: on 2026-09-10 lane PERF-OPEN measured the
// same commit twice and got `globe:camera-host-ready` = 7 425 ms and 4 739 ms. Nothing
// changed between them but the clock. A single run of this pipeline is not a baseline and
// cannot support a "N× faster" claim in either direction — a 1.57× swing is available for
// free, which is larger than most of the fixes anyone proposes.
//
// So: N runs, report the MEDIAN and the full spread. A change is only credited when the
// medians separate by more than the observed spread.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const N = Number(process.env.SERIES_N ?? 5);
const LABEL = process.env.SERIES_LABEL ?? 'series';
const DIR = process.env.SERIES_DIR ?? '.';

const median = (a) => {
    const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const FIELDS = [
    'END_globe_camera_host_ready_ms',
    'END_dom_interactive_ms',
    'location_step_open_ms',
    'open_project_loaded_ms',
    'boot_engine_start_ms',
    'boot_ui_done_ms',
];
const PHASES = [
    'onboarding:shown', 'open:router-launch', 'boot:engine-start', 'boot:scene-done',
    'boot:builders-done', 'boot:tools-done', 'boot:bus-handlers-done',
    'boot:data-platform-done', 'globe:eager-init-start', 'boot:ui-done',
    'globe:eager-init-done', 'open:shell-context-set', 'open:project-loaded',
    'location-step:open', 'globe:camera-host-ready',
];

const runs = [];
for (let i = 1; i <= N; i++) {
    const out = `${DIR}/${LABEL}-${i}.json`;
    process.stdout.write(`run ${i}/${N} … `);
    const r = spawnSync(process.execPath, ['--env-file-if-exists=.env', 'tools/perf/measure-project-open.mjs'], {
        env: { ...process.env, MEASURE_LABEL: `${LABEL}-${i}`, MEASURE_OUT: out },
        encoding: 'utf8', timeout: 400_000,
    });
    if (!existsSync(out)) { console.log(`FAILED\n${(r.stderr || r.stdout || '').slice(-600)}`); continue; }
    const j = JSON.parse(readFileSync(out, 'utf8'));
    runs.push(j);
    console.log(`camera-host-ready ${j.END_globe_camera_host_ready_ms} ms · dom ${j.END_dom_interactive_ms} ms`);
}

if (!runs.length) { console.error('no successful runs'); process.exit(1); }

console.log(`\n===== ${LABEL} — ${runs.length} run(s) =====`);
console.log('metric                              median      all');
for (const f of FIELDS) {
    const vals = runs.map((r) => r[f]);
    console.log(`${f.padEnd(34)} ${String(median(vals)).padStart(7)}      [${vals.join(', ')}]`);
}

console.log('\nper-phase t+ (gesture-relative), median across runs:');
console.log('phase                            median    all');
let prev = 0;
for (const p of PHASES) {
    const vals = runs.map((r) => (r.marks.find((m) => m.phase === p && m.harnessTMs !== null) || {}).harnessTMs);
    const med = median(vals);
    if (med === null) { console.log(`${p.padEnd(30)}  (absent)`); continue; }
    const d = med - prev; prev = med;
    console.log(`${p.padEnd(30)} ${String(med).padStart(7)}  (Δ${String(d).padStart(6)})   [${vals.join(', ')}]`);
}
