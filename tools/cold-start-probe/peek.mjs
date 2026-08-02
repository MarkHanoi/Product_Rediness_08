import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('./refusal-audit.raw.json', import.meta.url), 'utf8'));
for (const s of d.cordoba.samples) {
    if (!s.attrs.joinedActuacion || !/plan|peri|detalle/i.test(String(s.attrs.joinedActuacion?.instrumento ?? ''))) {
        console.log(s.id, JSON.stringify(s.attrs));
    }
}
console.log('--- bcn rejection reasons');
const rr = {}; for (const x of d.barcelona.skipped) { const k = x.reason.split(':').slice(0, 2).join(':'); rr[k] = (rr[k] || 0) + 1; }
console.log(JSON.stringify(rr, null, 0));
console.log('--- madrid rejection reasons');
const mr = {}; for (const x of d.madrid.skipped) { const k = x.reason.split(':').slice(0, 2).join(':'); mr[k] = (mr[k] || 0) + 1; }
console.log(JSON.stringify(mr, null, 0));
