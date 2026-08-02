#!/usr/bin/env node
// Warm the parcel-frame cache for all 36 AMB municipalities, so the measurement run is not
// interleaved with hundreds of megabytes of Catastro traffic. Idempotent; safe to re-run.
// ⛔ Enumerates FROM THE SERVICE, never from a document — including this repo's own artefacts.
import { buildFrame } from './catastroParcelFrame.mjs';
import { readDistinct } from './ambService.mjs';

const d = await readDistinct('16', 'CODI_INE,NOMMUNI,PGM', '1=1', 'prefetch:enumerate');
if (!d.ok) { console.error('ENUMERATION FAILED: ' + d.reason); process.exit(1); }
const by = new Map();
for (const r of d.rows) {
    const ine = String(r.CODI_INE ?? '').trim();
    if (!ine) continue;
    const e = by.get(ine) ?? { ine, names: new Set(), pgm: new Set() };
    if (String(r.NOMMUNI ?? '').trim()) e.names.add(String(r.NOMMUNI).trim());
    e.pgm.add(String(r.PGM ?? '').trim());
    by.set(ine, e);
}
const munis = [...by.values()].sort((a, b) => a.ine.localeCompare(b.ine));
console.log(`enumerated ${munis.length} municipalities from the service`);
let ok = 0, fail = 0;
for (const m of munis) {
    const name = [...m.names][0] ?? null;
    const t0 = Date.now();
    try {
        const f = await buildFrame(m.ine, name);
        if (f.ok) { ok++; console.log(`✓ ${m.ine} ${String(name).padEnd(30)} ${String(f.parcelCount).padStart(7)} parcels  ${((Date.now() - t0) / 1000).toFixed(1)}s cached=${f.cached}`); }
        else { fail++; console.log(`✗ ${m.ine} ${name} — ${f.reason}: ${String(f.message ?? '').slice(0, 120)}`); }
    } catch (e) { fail++; console.log(`✗ ${m.ine} ${name} — EXCEPTION ${String(e.message).slice(0, 160)}`); }
}
console.log(`PREFETCH DONE · ok ${ok} · failed ${fail}`);
