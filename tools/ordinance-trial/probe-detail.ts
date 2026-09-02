// READ-ONLY probe — print every rule, unknown and reject for one stratum.
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { E8_GOLD_SET } from './goldset/e8-gold-set.js';
import { loadDocument, selectPages } from './lib/corpus.js';

async function main(): Promise<void> {
    const id = process.argv[2]!;
    const s = E8_GOLD_SET.strata.find((x) => x.id === id)!;
    const doc = await loadDocument(s.documentUrl, s.sha256);
    if ('ok' in doc && doc.ok === false) { console.log(doc.detail); return; }
    const text = selectPages(doc as never, s.pages);
    const out = extractRules(text, GERMAN_GRAMMAR, { document: s.id, page: null });
    if (!out.ok) { console.log('REFUSED', out.reason, out.detail); return; }
    console.log(`RULES (${out.rules.length})`);
    for (const r of out.rules) {
        console.log(`  ${r.field} = ${r.value} ${r.unit}${r.measurement ? ` [${r.measurement}]` : ''}${r.landBasis ? ` basis=${r.landBasis}` : ''} matcher=${r.matcherId} sec=${r.citation.section ?? '-'}`);
        console.log(`      raw="${r.rawText}"  sent="${r.citation.sentence.slice(0, 120)}"`);
    }
    console.log(`\nUNKNOWNS (${out.unknowns.length})`);
    for (const u of out.unknowns) console.log(`  ${u.field}: ${u.reason}${u.rule ? ` (${u.rule})` : ''} — ${u.detail}`);
    console.log(`\nREJECTED (${out.rejected.length})`);
    for (const r of out.rejected) console.log(`  ${r.field}=${r.rawText} by ${r.rejectId} :: "${r.sentence.slice(0, 150)}"`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
