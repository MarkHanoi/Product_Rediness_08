import { readFileSync, writeFileSync } from 'fs';
const log = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const RUNNER = /^\[ga-gate\/run-all\]\s+(.*)$/;
const out = []; let buf = [];
const VERDICT = /^(✅ PASSED|❌|⚠|🔶|✔|✗|KNOWN-DEBT|NEWLY-MEASURED|.*?):\s*(.+)$/;
for (const line of log) {
  const m = RUNNER.exec(line);
  if (!m) { buf.push(line); continue; }
  const rest = m[1];
  // verdict lines name a gate after a colon
  const i = rest.indexOf(':');
  if (i > 0) {
    const status = rest.slice(0, i).trim();
    const gate = rest.slice(i + 1).trim();
    out.push({ status, gate, output: buf.filter(l => l.trim() && !/^npm warn/.test(l)) });
    buf = [];
  } else {
    buf.push(line);
  }
}
writeFileSync(process.argv[3], JSON.stringify({ tail: buf.filter(l=>l.trim()), gates: out }, null, 1));
console.log('gates parsed:', out.length);
for (const g of out) console.log(g.status.slice(0,60), '||', g.gate);
