import { readFileSync, writeFileSync, existsSync } from 'fs';
const D = 'audit/full-stack/2026-08-31';
const log = readFileSync(D + '/raw/run-all.log', 'utf8').split(/\r?\n/);
// map gate display name -> script, from run-all.ts
const src = readFileSync('tools/ga-gate/run-all.ts', 'utf8');
const reg = [...src.matchAll(/\{\s*name:\s*'([^']+)',\s*script:\s*'([^']+)'/g)].map(m => ({ name: m[1], script: m[2] }));
const byName = new Map(reg.map(r => [r.name, r.script]));

const RUNNER = /^\[ga-gate\/run-all\]\s+(.*)$/;
const gates = []; let buf = [];
for (const line of log) {
  const m = RUNNER.exec(line);
  if (!m) { if (!/^npm warn/.test(line) && line.trim()) buf.push(line); continue; }
  const rest = m[1];
  const i = rest.indexOf(':');
  const status = i > 0 ? rest.slice(0, i).trim() : null;
  const gate = i > 0 ? rest.slice(i + 1).trim() : null;
  if (!gate || !byName.has(gate.replace(/\s*\(exit \d\).*$/, ''))) {
    // runner-level line (preamble / trailer)
    if (line.trim()) buf.push(line);
    continue;
  }
  const key = gate.replace(/\s*\(exit \d\).*$/, '');
  let rc = 0;
  const em = /\(exit (\d)\)/.exec(rest);
  if (em) rc = Number(em[1]);
  else if (/RATCHET EXCEEDED/.test(status)) rc = 3;
  else if (/MISCONFIG/i.test(status)) rc = 2;
  else if (/PASSED/.test(status)) rc = 0;
  else rc = 1;
  // scope + numbers heuristics
  const numbers = buf.filter(l => /\d/.test(l) && !/^\s*[·•✓✗]\s*\S+$/.test(l));
  const scopeLines = buf.filter(l => /files? (scanned|read)|dir:|dirs:|scope|subject|floor|workspace packages/i.test(l));
  const controlLines = buf.filter(l => /control/i.test(l));
  gates.push({
    script: byName.get(key), gate: key, rc, status,
    scanned_scope: scopeLines.slice(0, 6).join(' | ') || null,
    printed_numbers: numbers.slice(0, 14).join(' | ') || '(gate printed no numeric output)',
    executed_controls: controlLines.length > 0,
    control_lines: controlLines,
    output_lines: buf.length,
  });
  buf = [];
}
writeFileSync(D + '/raw/gates-parsed.json', JSON.stringify(gates, null, 1));
console.log('parsed', gates.length, 'gate verdicts; with executed controls:', gates.filter(g=>g.executed_controls).length);
console.log(gates.map(g=>`rc=${g.rc} ctl=${g.executed_controls?'Y':'n'} ${g.gate}`).join('\n'));
