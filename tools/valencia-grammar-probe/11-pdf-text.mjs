// STEP 11 — M3: extract the text of the official DATA MODEL PDF.
//
// ⚠ The fetch-and-summarise path returned "no field named altura is VISIBLE" — but it had failed
// to decode the PDF binary at all. That is a TOOL FAILURE, not a measurement, and reading it as
// absence would be exactly the false negative this brief exists to prevent. The text is
// therefore extracted locally, from the bytes, and the verdict is drawn from the extraction.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { DIR } from './lib.mjs';

const buf = fs.readFileSync(path.join(DIR, '_m3_datamodel.pdf'));

// Pull every stream, inflate what is FlateDecode'd.
const chunks = [];
let i = 0;
while (true) {
    const s = buf.indexOf('stream', i);
    if (s < 0) break;
    let st = s + 6;
    if (buf[st] === 0x0d) st++;
    if (buf[st] === 0x0a) st++;
    const e = buf.indexOf('endstream', st);
    if (e < 0) break;
    const raw = buf.subarray(st, e);
    try { chunks.push(zlib.inflateSync(raw)); } catch { /* not flate / not text */ }
    i = e + 9;
}
console.error(`inflated ${chunks.length} streams`);

// Decode PDF text-showing operators: (literal) Tj  and  [(a) -3 (b)] TJ
const OCT = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
function unescapePdf(s) {
    return s.replace(/\\(\d{1,3}|.)/g, (m, g) => {
        if (OCT[g] !== undefined) return OCT[g];
        if (/^\d+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
        return g;
    });
}

let text = '';
for (const c of chunks) {
    const s = c.toString('latin1');
    if (!/(TJ|Tj)/.test(s)) continue;
    for (const m of s.matchAll(/\[((?:[^[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|\bTd\b|\bTD\b|\bT\*\b|\bET\b/g)) {
        if (m[1] !== undefined) {
            for (const p of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) text += unescapePdf(p[1]);
        } else if (m[2] !== undefined) {
            text += unescapePdf(m[2]);
        } else {
            text += '\n';
        }
    }
    text += '\n';
}

// Latin-1 -> UTF-8 fixup for Spanish accents encoded as single bytes
text = Buffer.from(text, 'latin1').toString('utf8');
text = text.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(path.join(DIR, '_m3_datamodel.txt'), text);
console.error(`extracted ${text.length} chars -> _m3_datamodel.txt\n`);
console.error(text.slice(0, 6000));
