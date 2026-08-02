#!/usr/bin/env node
// Builds the Catastro parcel frame for every city on the sprint board and reports the EXACT
// parcel population + the urban/rustic split. One row per municipality; failures stay failures.
import { buildFrame } from './catastroParcelFrame.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const BOARD = [
    { city: 'barcelona', ine: '08019', name: 'BARCELONA' },
    { city: 'madrid', ine: '28079', name: 'MADRID' },
    { city: 'murcia', ine: '30030', name: 'MURCIA' },
    { city: 'cordoba', ine: '14021', name: 'CORDOBA' },
    { city: 'valencia', ine: '46250', name: 'VALENCIA' },
    { city: 'lugo', ine: '27028', name: 'LUGO' },
];

/**
 * Catastro refcat shape test. A RUSTIC parcel reference is `PPMMM` + `A` + sector/polygon digits
 * (the literal `A` in position 6 is the discriminator); an URBAN reference is the 7+7 alphanumeric
 * cartographic form (`0220504DF3802A…`). Recorded because "cadastral parcels" is not one population:
 * a municipality's rustic parcels are real parcels a user can click, but they are not urban land.
 */
export function isRustic(ref) { return /^\d{5}[A-Z]\d{3}/.test(ref); }

const rows = [];
for (const b of BOARD) {
    const t0 = Date.now();
    const f = await buildFrame(b.ine, b.name);
    if (!f.ok) {
        console.log(`✗ ${b.city.padEnd(10)} ${b.ine}  ${f.reason} — ${f.message}`);
        rows.push({ ...b, ok: false, reason: f.reason, message: f.message });
        continue;
    }
    let rustic = 0;
    for (const p of f.parcels) if (isRustic(p.ref)) rustic++;
    const urban = f.parcelCount - rustic;
    console.log(`▶ ${b.city.padEnd(10)} ${b.ine}  total ${String(f.parcelCount).padStart(7)}  urban ${String(urban).padStart(7)}  rustic ${String(rustic).padStart(7)}  (${(f.gmlBytes / 1e6).toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    rows.push({ ...b, ok: true, parcelTotal: f.parcelCount, parcelUrban: urban, parcelRustic: rustic, gmlBytes: f.gmlBytes });
}

if (!existsSync(join(HERE, 'frames'))) mkdirSync(join(HERE, 'frames'), { recursive: true });
writeFileSync(join(HERE, 'frames', 'populations.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    source: 'Catastro INSPIRE CadastralParcels per-municipality ATOM enclosure A.ES.SDGC.CP.<DGC>.zip',
    note: 'DGC municipality code ≠ INE code for provincial capitals (<prov>900). Resolved by name.',
    rows,
}, null, 1));
console.log(`\n→ frames/populations.json`);
