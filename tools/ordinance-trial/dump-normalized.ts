// READ-ONLY probe — print the NORMALIZED text of chosen pages. Used to choose gold
// anchors from the SOURCE text (never from the extractor's output).
import { loadDocument, selectPages } from './lib/corpus.js';

async function main(): Promise<void> {
    const url = process.argv[2]!;
    const sha = process.argv[3]!;
    const pages = (process.argv[4] ?? '').split(',').map(Number);
    const doc = await loadDocument(url, sha);
    if ('ok' in doc && doc.ok === false) { console.log(doc.detail); process.exitCode = 1; return; }
    console.log(selectPages(doc as never, pages));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
