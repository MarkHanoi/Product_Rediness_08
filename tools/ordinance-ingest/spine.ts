// CLI — run the DOCUMENT → CLAIM spine end-to-end over ONE real fetched document.
//
//   npx tsx tools/ordinance-ingest/spine.ts --url <pdf> --zone <key> --schema ch-lu
//        [--pages 26-36] [--grammar de] [--drop <literal>] [--hallucinate]
//        [--jitter <points>]
//
// `--drop` and `--hallucinate` are the FALSIFICATION controls and they are part of
// the tool on purpose (§CORPUS-NEVER-JITTERED: a probe that cannot be perturbed
// cannot be trusted):
//   --drop "21"      deletes every positioned item whose text is exactly that from
//                    the real page geometry, then re-runs. A spine that still
//                    emits the value is hallucinating.
//   --hallucinate    swaps in a span retriever that returns a fluent, plausible
//                    German sentence that is NOT in the document. A spine that
//                    parses it has no containment guard.
//   --jitter 6       displaces every BODY item's x by a deterministic +/- offset,
//                    leaving the HEADER and the glyphs untouched. The number is
//                    STILL PHYSICALLY ON THE PAGE and still reads "21"; only the
//                    column model stops explaining it. The brief's third case: a
//                    spine that answers must answer `table-not-reconstructed`, and
//                    a spine that instead reports a value is guessing which column
//                    a cell belongs to. Deterministic (no RNG) so the transcript
//                    reproduces byte-for-byte.

import { readFile } from 'node:fs/promises';
import { acquirePdf, cachedPdfPath } from './lib/httpCache.js';
import { extractPageGeometry } from './lib/pdfPageItems.js';
import { buildCanonicalDocument } from '../../packages/ordinance-extraction/src/structure/canonicalDocument.js';
import { documentToClaims } from '../../packages/ordinance-extraction/src/spine/documentToClaims.js';
import {
    createGrammarReader,
    createRetrievalReader,
    createTableReader,
    type ClaimReader,
    type RetrievedSpan,
} from '../../packages/ordinance-extraction/src/spine/readers.js';
import {
    LUZERN_BZR_ANHANG1,
    SWISS_GERMAN_QUALIFIERS,
} from '../../packages/ordinance-extraction/src/adapters/swissZoneTable.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import type { PageItems } from '../../packages/ordinance-extraction/src/structure/types.js';
import type { ZoneContext } from '../../packages/ordinance-extraction/src/spine/types.js';

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

/**
 * Displace BODY items horizontally so the column model no longer explains the page,
 * WITHOUT removing a single glyph — the "number present, table unparseable" control.
 * The header band (the topmost `headerY` region) is left alone so the table is still
 * FOUND; it is only the cell-to-column assignment that becomes unsafe. The offset
 * alternates by item index, so it is deterministic and reproducible.
 */
function jitterBody(pages: readonly PageItems[], points: number, stride: number): PageItems[] {
    return pages.map((p) => {
        const ys = p.items.map((i) => i.y);
        const headerY = ys.length > 0 ? Math.max(...ys) : 0;
        return {
            pageNumber: p.pageNumber,
            items: p.items.map((i, n) =>
                // Leave the running head / header band untouched, and displace only
                // every `stride`-th body item. A DENSE alternating jitter destroys
                // anchor formation outright (measured: at +/-2 pt the grid is no
                // longer detected at all, and the honest answer degrades to
                // `zone-not-in-document`). A SPARSE displacement is the case the
                // brief actually names: the grid still forms, the header is still
                // recovered, and only SOME cells stop explaining themselves -- so
                // the table is FOUND and NOT TRUSTED.
                i.y > headerY - 40 || n % stride !== 0
                    ? i
                    : { ...i, x: i.x + points },
            ),
        };
    });
}

/** Delete every item whose trimmed text equals `literal` — the FALSIFICATION control. */
function dropLiteral(pages: readonly PageItems[], literal: string): PageItems[] {
    return pages.map((p) => ({
        pageNumber: p.pageNumber,
        items: p.items.filter((i) => i.text.trim() !== literal),
    }));
}

async function main(): Promise<void> {
    const url = arg('url');
    if (!url) throw new Error('--url is required');
    const zoneKey = arg('zone');
    if (!zoneKey) throw new Error('--zone is required');
    const cacheDir = arg('cache', '.cache/ordinance-ingest/pdf') as string;
    const range = arg('pages');
    const [fromPage, toPage] = range
        ? range.split('-').map((n) => Number(n))
        : [undefined, undefined];

    console.log('── Layer 1: acquisition ──');
    const acq = await acquirePdf(url, { cacheDir });
    if (!acq.ok) {
        console.log(`  FAILED reason=${acq.reason} status=${acq.status ?? '-'} ${acq.detail}`);
        process.exitCode = 1;
        return;
    }
    console.log(`  OK ${acq.byteLength.toLocaleString()} bytes sha256=${acq.sha256.slice(0, 16)}… cached=${acq.fromCache}`);

    console.log('── Layer 2+3: page geometry ──');
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, url)));
    const geo = await extractPageGeometry(bytes, {
        ...(fromPage !== undefined ? { fromPage } : {}),
        ...(toPage !== undefined ? { toPage } : {}),
    });
    console.log(`  pages=${geo.pages.length}/${geo.pageCount} producer=${geo.producer ?? '-'}`);

    const drop = arg('drop');
    let pages = drop === undefined ? geo.pages : dropLiteral(geo.pages, drop);
    if (drop !== undefined) {
        const before = geo.pages.reduce((s, p) => s + p.items.length, 0);
        const after = pages.reduce((s, p) => s + p.items.length, 0);
        console.log(`  ⚠ FALSIFICATION CONTROL: dropped every item reading "${drop}" — ${before} → ${after} items`);
    }
    const jitter = arg('jitter');
    if (jitter !== undefined) {
        const before = pages.reduce((s, p) => s + p.items.length, 0);
        pages = jitterBody(pages, Number(jitter), Number(arg('jitter-stride', '7')));
        const after = pages.reduce((s, p) => s + p.items.length, 0);
        console.log(
            `  ⚠ FALSIFICATION CONTROL: displaced body items by ±${jitter} pt — ${before} → ${after} items ` +
                `(NOT ONE GLYPH REMOVED; every number is still on the page)`,
        );
    }

    console.log('── Layer 4: canonical document ──');
    const documentId = url.split('/').pop() ?? url;
    const primary = buildCanonicalDocument(documentId, pages, geo.texts);
    // The PERTURBED second reconstruction — a tighter snapping tolerance. A value
    // stable under it agrees; a value that sits between columns does not.
    const perturbed = buildCanonicalDocument(documentId, pages, geo.texts, {
        table: { columnTolerance: 1.5 },
    });
    const conf = primary.document.tables.filter((t) => t.confident).length;
    console.log(
        `  digitisation=${primary.document.digitisation.digitisation} sections=${primary.document.sections.length} ` +
            `tables=${primary.document.tables.length} (confident ${conf}, withheld ${primary.document.tables.length - conf})`,
    );

    const schema = arg('schema', 'ch-lu') as string;
    const zone: ZoneContext = {
        country: arg('country', schema === 'ch-lu' ? 'CH' : 'DE') as string,
        zoneKey,
        zoneLabel: null,
        authority: arg('authority', schema === 'ch-lu' ? 'Stadt Luzern' : '(unstated)') as string,
        dataset: arg(
            'dataset',
            schema === 'ch-lu'
                ? 'Bau- und Zonenreglement, Anhang 1 (Zonen- und Dichtebestimmungen)'
                : '(unstated)',
        ) as string,
        planId: arg('plan', null as unknown as string) ?? null,
    };

    const readers: ClaimReader[] = [];
    if (schema === 'ch-lu') readers.push(createTableReader(LUZERN_BZR_ANHANG1));
    if (arg('grammar') === 'de') {
        readers.push(createGrammarReader(GERMAN_GRAMMAR, SWISS_GERMAN_QUALIFIERS));
    }
    if (flag('hallucinate')) {
        // A retriever that returns a FLUENT, PLAUSIBLE, GRAMMATICALLY VALID German
        // sentence which is NOT in the document. It even parses under the German
        // grammar — so the ONLY thing standing between it and a published number is
        // the containment gate.
        readers.length = 0;
        readers.push(
            createRetrievalReader({
                retriever: {
                    id: 'falsification:hallucinating-retriever',
                    retrieve: (): Promise<readonly RetrievedSpan[]> =>
                        Promise.resolve([
                            {
                                text: 'Die höchstzulässige Grundflächenzahl (GRZ) beträgt in dieser Zone 0,8 und die Geschossflächenzahl (GFZ) beträgt 2,4.',
                                page: primary.document.pages[0]?.pageNumber ?? 1,
                                section: null,
                            },
                        ]),
                },
                grammar: GERMAN_GRAMMAR,
                filter: { keywords: {} },
                lexicon: SWISS_GERMAN_QUALIFIERS,
            }),
        );
        console.log('  ⚠ FALSIFICATION CONTROL: hallucinating span retriever installed');
    }

    console.log('── Spine ──');
    const outcome = await documentToClaims({
        primary,
        perturbed,
        zone,
        readers,
        lexicon: SWISS_GERMAN_QUALIFIERS,
        // Source number convention. Swiss: dot decimal. German: comma decimal.
        // (see gates/localeGate.ts NumberLocale)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        // Swiss decimal convention — see gates/localeGate.ts NumberLocale 'ch'.
        locale: schema === 'ch-lu' ? LUZERN_BZR_ANHANG1.locale : 'de',
        validity: { basis: 'ingestion', from: new Date().toISOString().slice(0, 10), to: null },
    });

    console.log(`  outcome.kind = ${outcome.kind}`);
    if (outcome.kind === 'failed') {
        console.log(`  FAILED reason=${outcome.reason}`);
        console.log(`  ${outcome.detail}`);
        return;
    }
    if (outcome.kind === 'refused') {
        console.log(`  REFUSED by=${outcome.refusedBy}`);
        console.log(`  ${outcome.detail}`);
        return;
    }

    console.log(`  claims=${outcome.claims.length}  nothingFound=${outcome.nothingFound.length}  withheldTables=${outcome.withheldTables.length}`);
    for (const c of outcome.claims) {
        console.log(`\n  ── CLAIM ${c.parameter} = ${c.value}${c.unit ? ' ' + c.unit : ''} (zone ${c.zoneKey})`);
        console.log(`     tier=${c.provenance.confidence.tier} derivation=${c.provenance.derivation} valueLocation=${c.provenance.valueLocation} validationState=${c.validationState}`);
        console.log(`     method=${c.evidence.method} reader=${c.evidence.reader} page=${c.evidence.page} cell=${c.evidence.cell ?? '-'}`);
        console.log(`     span: ${c.evidence.span}`);
        console.log(`     note: ${c.provenance.confidence.note ?? '-'}`);
        console.log(`     source: ${JSON.stringify(c.provenance.source)}`);
        console.log(`     autoAccepted=${c.autoAccepted} gates=[${c.gates.map((g) => g.token).join(', ')}]`);
        for (const f of c.flags) console.log(`     FLAG: ${f}`);
    }
    for (const n of outcome.nothingFound) {
        console.log(`\n  ── NOTHING FOUND ${n.parameter}: reason=${n.reason}`);
        console.log(`     ${n.detail}`);
    }
    for (const w of outcome.withheldTables.slice(0, 4)) {
        console.log(`\n  ── WITHHELD TABLE p${w.page}: ${w.detail}`);
    }
}

main().catch((err: unknown) => {
    console.error('spine failed:', err);
    process.exitCode = 1;
});
