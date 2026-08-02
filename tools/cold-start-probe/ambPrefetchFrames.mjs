#!/usr/bin/env node
// Resumable prefetch of the Catastro INSPIRE CP parcel frame for every AMB municipality.
// Split out from the measurement run so a transport failure is a retry, never a missing figure.
// Writes nothing to out/ — everything lands in the gitignored .cache/.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fetchMunicipalityGml } from './catastroParcelFrame.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const u = JSON.parse(readFileSync(join(HERE, 'out', 'amb-enumeration.json'), 'utf8'));
const log = [];
for (const m of u.municipalities) {
    const t0 = Date.now();
    const g = await fetchMunicipalityGml(m.ine, m.name);
    const row = { ine: m.ine, name: m.name, ok: g.ok, cached: g.cached ?? false, bytes: g.bytes ?? 0, reason: g.reason ?? null, message: g.message ?? null, ms: Date.now() - t0 };
    log.push(row);
    console.log(`${g.ok ? '▶' : '✗'} ${m.ine} ${m.name.padEnd(30)} ${g.ok ? ((g.bytes / 1e6).toFixed(1) + ' MB' + (g.cached ? ' (cached)' : '')) : g.reason + ' — ' + g.message}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (!existsSync(join(HERE, 'out'))) mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', 'amb-frame-prefetch.json'), JSON.stringify({ ranAt: new Date().toISOString(), log }, null, 1));
console.log(`\n${log.filter((r) => r.ok).length}/${log.length} frames available`);
