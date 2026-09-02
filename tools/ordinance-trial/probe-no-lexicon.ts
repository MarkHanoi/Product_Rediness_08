// E8-TRIAL probe — WHAT SHIPS TODAY, on the German stratum, with NO German lexicon.
//
// ⛔ THE HONESTY PROBLEM THIS PROBE EXISTS TO FIX. `run-spine-trial.ts` drives the
// DE stratum with `tools/ordinance-trial/lib/germanQualifiers.ts` — a lexicon THIS
// LANE wrote. It caught 2 of the 3 wrong claims, and reporting that as "the gate
// works" would credit the product with an artefact of the trial
// (§fake-more-capable-than-real, in the direction that flatters).
//
// MEASURED 2026-09-02: `grep -rn ": QualifierLexicon" packages/ordinance-extraction/src`
// → ONE definition, `SWISS_GERMAN_QUALIFIERS` (`de-CH`). There is no German one. So
// what a caller in Germany gets today is an EMPTY lexicon, and this probe measures
// exactly that: same document, same pages, same readers, same gates — lexicon
// removed.
//
// The number that matters is AUTO-ACCEPTED WRONG CLAIMS: a claim the pipeline is
// willing to pass on without routing to a human.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from '../ordinance-ingest/lib/httpCache.js';
import { extractPageGeometry } from '../ordinance-ingest/lib/pdfPageItems.js';
import { buildCanonicalDocument } from '../../packages/ordinance-extraction/src/structure/canonicalDocument.js';
import { documentToClaims } from '../../packages/ordinance-extraction/src/spine/documentToClaims.js';
import { createGrammarReader } from '../../packages/ordinance-extraction/src/spine/readers.js';
import type { QualifierLexicon } from '../../packages/ordinance-extraction/src/gates/qualifierSurvival.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { GERMAN_QUALIFIERS } from './lib/germanQualifiers.js';
import { E8_GOLD_SET } from './goldset/e8-gold-set.js';

/** What a German caller gets today: no vocabulary at all. */
const EMPTY_LEXICON: QualifierLexicon = Object.freeze({ language: 'de', patterns: Object.freeze([]) });

async function run(lexicon: QualifierLexicon, label: string): Promise<void> {
    const s = E8_GOLD_SET.strata.find((x) => x.id === 'DE-PROSE')!;
    const cacheDir = join('.cache', 'ordinance-ingest', 'pdf');
    const acq = await acquirePdf(s.documentUrl, { cacheDir });
    if (!acq.ok || acq.sha256 !== s.sha256) {
        console.log(`${label}: REFUSED (hash/acquire)`);
        return;
    }
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, s.documentUrl)));
    const geo = await extractPageGeometry(bytes, { fromPage: Math.min(...s.pages), toPage: Math.max(...s.pages) });
    const wanted = new Set(s.pages);
    const build = buildCanonicalDocument(
        `${s.id} :: ${s.documentUrl}`,
        geo.pages.filter((p) => wanted.has(p.pageNumber)),
        geo.texts.filter((t) => wanted.has(t.pageNumber)),
    );

    // ⛔ THE PERTURBED PASS IS SUPPLIED. A first version of this probe omitted it and
    // measured 0 auto-accepts in BOTH arms — but the cause was the dual-pass gate
    // flagging "no-second-pass", not the lexicon. That is a confound, and it made
    // the product look safer than the main run showed it to be. The variable under
    // test is the LEXICON, so everything else must be held exactly as the main run
    // has it.
    const perturbed = buildCanonicalDocument(
        `${s.id} :: ${s.documentUrl}`,
        geo.pages.filter((p) => wanted.has(p.pageNumber)),
        geo.texts.filter((t) => wanted.has(t.pageNumber)),
        { table: { columnTolerance: 1.5 } },
    );

    const out = await documentToClaims({
        primary: build,
        perturbed,
        zone: {
            country: 'DE',
            zoneKey: '(document)',
            zoneLabel: null,
            authority: 'Land Berlin',
            dataset: 'Bebauungsplan',
            planId: '1-19',
        },
        readers: [createGrammarReader(GERMAN_GRAMMAR, lexicon)],
        lexicon,
        locale: 'de',
        validity: { basis: 'ingestion', from: '2026-09-01', to: null },
    });

    console.log(`\n═══ ${label} (${lexicon.patterns.length} qualifier pattern(s)) ═══`);
    if (!out.ok || out.kind !== 'ran') {
        console.log(`  outcome ${out.kind}`);
        return;
    }
    // Every one of these three values is a NAMED TRAP in the gold set — the gold
    // labels are NOT-A-PARCEL-RULE, so an auto-accept here is a wrong claim the
    // pipeline was willing to pass on.
    const goldTraps = new Set(
        E8_GOLD_SET.rows
            .filter((r) => r.stratum === 'DE-PROSE' && r.label === 'NOT-A-PARCEL-RULE' && r.value !== null)
            .map((r) => `${r.field}|${r.value}`),
    );
    let autoAcceptedWrong = 0;
    for (const c of out.claims) {
        const isTrap = goldTraps.has(`${c.field}|${c.value}`);
        if (c.autoAccepted && isTrap) autoAcceptedWrong++;
        console.log(
            `  ${c.field}=${c.value}  autoAccepted=${c.autoAccepted}` +
                `  goldSaysNotAParcelRule=${isTrap}` +
                (c.flags.length === 0 ? '  flags: (none)' : `\n      flags: ${c.flags.join(' | ')}`),
        );
    }
    console.log(`  ⛔ AUTO-ACCEPTED **WRONG** CLAIMS: ${autoAcceptedWrong} of ${out.claims.length}`);
}

async function main(): Promise<void> {
    await run(EMPTY_LEXICON, 'WHAT SHIPS TODAY — no German lexicon exists in the package');
    await run(GERMAN_QUALIFIERS, "WITH THIS LANE'S TRIAL LEXICON — not a product artefact");
}

void main();
