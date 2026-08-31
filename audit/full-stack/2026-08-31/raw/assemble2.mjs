import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
const D = 'audit/full-stack/2026-08-31';
const gates = JSON.parse(readFileSync(D + '/raw/gates-parsed.json', 'utf8'));
const manual = JSON.parse(readFileSync(D + '/raw/manual-notes.json', 'utf8'));
const NAMED_FIXED = ['check-runtime-arg-omitted.ts','check-tool-activator-coverage.ts','check-material-maps-tiling.ts','check-render-aggregate-seam.ts'];
const code = new Map(readFileSync(D + '/raw/control-census-code.txt','utf8').split(/\r?\n/).filter(Boolean)
  .map(l => { const p = l.split('|'); return [p[1], +p[2].split('=')[1]]; }));
const CTL = /arms? (fired|proven to fire)|fired —|Negative control|Positive control|planted (tree|subject)|executed controls? passed|controls? proven in-?run|controls?: arms/i;
const rows = gates.map(g => {
  const base = g.script ? g.script.split('/').pop() : null;
  const ctl = (g.control_lines || []).join(' \n ');
  const printedControl = CTL.test(ctl);
  const ctlCode = code.get(base) || 0;
  let notes;
  if (printedControl) notes = 'NOT BLIND — executed controls printed THIS RUN: ' + (g.control_lines||[]).filter(l=>CTL.test(l)).slice(0,3).map(s=>s.trim()).join(' // ');
  else if (ctlCode > 0) notes = 'BLIND THIS RUN — source carries ' + ctlCode + ' control identifier line(s) but the run printed no fired-arm evidence, so I cannot make its control fire and cannot prove it would catch its subject.';
  else notes = 'BLIND — no control identifier in the gate source and no control evidence printed. Its silence is not proof of coverage.';
  if (NAMED_FIXED.includes(base)) notes += ' [one of the 4 gates named in the brief as previously-fixed blind comparators]';
  if (manual[base]) notes += ' || ' + manual[base];
  return { script: g.script, gate: g.gate, rc: g.rc, runner_status: g.runner_status || g.status,
    scanned_scope: g.scanned_scope || '(gate printed no scope/floor line this run)',
    printed_numbers: g.printed_numbers, blind_comparator: !printedControl, notes };
});
const out = {
  phase: 'P0 — GATE SNAPSHOT',
  head_at_start: 'd91d30d4af51bc67317ef8afc0b46b1dbef94038',
  head_at_end: execSync('git rev-parse HEAD').toString().trim(),
  head_moved_mid_phase: false,
  working_tree_at_measurement: 'clean except packages/command-registry/tsconfig.tsbuildinfo (build artefact, modified by the run itself) and audit/full-stack/2026-08-31/ (untracked, mine). git status --porcelain -> 2 lines.',
  measured_at: new Date().toISOString(),
  runner: 'NODE_OPTIONS=--max-old-space-size=8192 npx tsx tools/ga-gate/run-all.ts',
  runner_rc: 1,
  runner_verdict_line: 'BLOCKED — a gate regressed, or the debt baseline is stale. Fix the above before merging.',
  runner_own_summary: '61 passing · 38 failing · 1 declared debt (gate-debt.json) · 9 newly measured (gate-newly-measured.json) · 23 ratchet exceeded (exit 3) · 0 misconfigured (exit 2) · 5 REGRESSION (on no ledger)',
  gate_count: rows.length,
  rc_distribution: rows.reduce((m,r)=>(m['rc'+r.rc]=(m['rc'+r.rc]||0)+1,m),{}),
  timeouts: [],
  misconfigured_rc2: [],
  regressions_on_no_ledger: ['check-tool-activator-coverage.ts','check-sync-disposition.ts','check-verb-register.ts','../rac-conformance/certification/gates/check-dependent-adapts-on-host-move.ts','check-shear-survives-transport.ts'],
  stale_newly_measured_ledger_entries_now_passing: ['check-constraint-honesty.ts','check-graph-write-coverage.ts','check-contract-index-equivalence.ts'],
  blind_comparators: rows.filter(r=>r.blind_comparator).map(r=>r.script),
  gates: rows,
};
writeFileSync(D + '/gate-snapshot.json', JSON.stringify(out, null, 1));
console.log('rows', rows.length, 'blind', out.blind_comparators.length, JSON.stringify(out.rc_distribution));
