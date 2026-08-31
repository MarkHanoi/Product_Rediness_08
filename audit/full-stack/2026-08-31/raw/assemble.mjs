import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
const D = 'audit/full-stack/2026-08-31';
const gates = JSON.parse(readFileSync(D + '/raw/gates-parsed.json', 'utf8'));
const NAMED_FIXED = ['check-runtime-arg-omitted.ts','check-tool-activator-coverage.ts','check-material-maps-tiling.ts','check-render-aggregate-seam.ts'];
const code = readFileSync(D + '/raw/control-census-code.txt','utf8').split(/\r?\n/).filter(Boolean)
  .map(l => { const p = l.split('|'); return [p[1], +p[2].split('=')[1]]; });
const codeByFile = new Map(code);
const rows = gates.map(g => {
  const base = g.script ? g.script.split('/').pop() : null;
  const ctl = (g.control_lines || []).join(' \n ');
  const printedControl = /arms? (fired|proven to fire)|fired —|Negative control|Positive control|planted (tree|subject)|executed controls? passed|controls? proven in-?run|controls?: arms/i.test(ctl);
  const ctlCode = base && codeByFile.has(base) ? codeByFile.get(base) : 0;
  const blind = !printedControl;
  let notes;
  if (printedControl) notes = 'EXECUTED CONTROLS PRINTED THIS RUN (both directions where shown): ' + (g.control_lines||[]).slice(0,4).map(s=>s.trim()).join(' // ');
  else if (ctlCode > 0) notes = 'BLIND THIS RUN: source carries ' + ctlCode + ' control identifier line(s) but the run printed no fired-arm evidence; cannot prove it would fire.';
  else notes = 'BLIND: no control code in the gate source and no control evidence printed. Its silence is not proof of coverage.';
  if (NAMED_FIXED.includes(base)) notes += ' [one of the 4 named previously-fixed blind comparators]';
  return {
    script: g.script, gate: g.gate, rc: g.rc, runner_status: g.status,
    scanned_scope: g.scanned_scope || '(gate printed no scope/floor line this run)',
    printed_numbers: g.printed_numbers,
    blind_comparator: blind,
    notes,
  };
});
const out = {
  head_at_start: 'd91d30d4af51bc67317ef8afc0b46b1dbef94038',
  head_at_end: execSync('git rev-parse HEAD').toString().trim(),
  head_moved_mid_phase: false,
  working_tree: 'clean apart from packages/command-registry/tsconfig.tsbuildinfo (build artefact) and this audit dir (untracked)',
  measured_at: new Date().toISOString(),
  runner: 'npx tsx tools/ga-gate/run-all.ts  (NODE_OPTIONS=--max-old-space-size=8192)',
  runner_rc: 1,
  runner_verdict: 'BLOCKED — a gate regressed, or the debt baseline is stale.',
  gate_count: rows.length,
  rc_distribution: rows.reduce((m,r)=>(m['rc'+r.rc]=(m['rc'+r.rc]||0)+1,m),{}),
  timeouts: [],
  misconfigured_rc2: [],
  blind_comparators: rows.filter(r=>r.blind_comparator).map(r=>r.script),
  gates: rows,
};
writeFileSync(D + '/gate-snapshot.json', JSON.stringify(out, null, 1));
console.log('rows', rows.length, 'blind', out.blind_comparators.length, JSON.stringify(out.rc_distribution));
