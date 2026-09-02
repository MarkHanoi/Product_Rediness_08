// E8-TRIAL — THE **AFTER** RUN: the same gold set, against the LAYER-3 SPINE.
//
//   npx tsx tools/ordinance-trial/run-spine-trial.ts [--verbose] [--json out.json]
//
// ── WHY A SECOND RUNNER AND NOT AN EDIT TO THE FIRST ─────────────────────────
// `run-trial.ts` measured the spine that existed when the gold set was authored: a
// FLATTENED text stream through `extractRules`. Between that run and this one a
// sibling lane (E8-SPINE) landed `structure/` (Layer 3) and `spine/` (the tier-4
// claim producer). Editing the first runner would have destroyed the BEFORE. Both
// runners read the SAME `E8_GOLD_SET` through the SAME scorer, so the two readings
// are directly comparable — the only reason either number is worth printing.
//
// ⭐ THE INDEPENDENCE THAT MAKES THIS MEASUREMENT WORTH ANYTHING
// (§fake-more-capable-than-real). The gold set was authored 2026-09-01 23:47–23:54
// from pdf.js POSITIONED ITEMS read by column x. The Swiss table schema it is about
// to score (`adapters/swissZoneTable.ts`, 00:04) and the readers that use it
// (`spine/readers.ts`, 00:01) were written AFTER it. The gold values therefore
// cannot be a copy of this producer's output. The mtimes are printed by this
// runner rather than asserted, so a reader can check the claim rather than take it.
//
// ⛔ STILL UNCONFIRMED BY HUMAN. Every figure below is a SELF-ASSESSMENT.

import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquirePdf, cachedPdfPath } from '../ordinance-ingest/lib/httpCache.js';
import { extractPageGeometry } from '../ordinance-ingest/lib/pdfPageItems.js';
import {
    buildCanonicalDocument,
    type CanonicalDocumentBuild,
} from '../../packages/ordinance-extraction/src/structure/canonicalDocument.js';
import type { PageItems } from '../../packages/ordinance-extraction/src/structure/types.js';
import { documentToClaims } from '../../packages/ordinance-extraction/src/spine/documentToClaims.js';
import {
    createGrammarReader,
    createTableReader,
    type ClaimReader,
} from '../../packages/ordinance-extraction/src/spine/readers.js';
import type {
    DocumentClaimOutcome,
    ExtractedClaim,
    NothingFound,
    ZoneContext,
} from '../../packages/ordinance-extraction/src/spine/types.js';
import {
    LUZERN_BZR_ANHANG1,
    SWISS_GERMAN_QUALIFIERS,
} from '../../packages/ordinance-extraction/src/adapters/swissZoneTable.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { normalizePages } from '../../packages/ordinance-extraction/src/ingest/normalize.js';
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_QUALIFIERS } from './lib/germanQualifiers.js';
import { E8_GOLD_SET } from './goldset/e8-gold-set.js';
import type { GoldRow, Stratum } from './goldset/types.js';
import {
    oraclePredictions,
    scoreStratum,
    scrambleDigits,
    type Prediction,
} from './lib/score.js';

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = (() => {
    const i = process.argv.indexOf('--json');
    return i >= 0 ? process.argv[i + 1] : undefined;
})();

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

/** 95% half-width for a proportion, finite-population corrected at N = 10 000. */
function halfWidth(n: number, p = 0.5, N = 10_000): number {
    if (n <= 0) return NaN;
    const se = Math.sqrt((p * (1 - p)) / n);
    const fpc = N > n ? Math.sqrt((N - n) / (N - 1)) : 0;
    return 1.96 * se * fpc;
}

/* ═════════════════ stage 1-3 · acquire → read → STRUCTURE ═════════════════ */

interface Built {
    readonly primary: CanonicalDocumentBuild;
    readonly perturbed: CanonicalDocumentBuild;
    readonly scrambled: CanonicalDocumentBuild;
    /** The RAW Layer-2 page text the spine actually hands the grammar. */
    readonly rawTexts: readonly { pageNumber: number; text: string; chars: number }[];
}

/** Remap every digit inside the ITEM TEXT — control 2, at the geometry layer. */
function scramblePages(pages: readonly PageItems[]): PageItems[] {
    return pages.map((p) => ({
        pageNumber: p.pageNumber,
        items: p.items.map((i) => ({ ...i, text: scrambleDigits(i.text) })),
    }));
}

async function build(s: Stratum): Promise<Built | { error: string }> {
    const cacheDir = join('.cache', 'ordinance-ingest', 'pdf');
    const acq = await acquirePdf(s.documentUrl, { cacheDir });
    if (!acq.ok) return { error: `acquire failed: ${acq.reason} — ${acq.detail}` };
    if (acq.sha256 !== s.sha256) {
        return {
            error:
                `DOCUMENT HASH MISMATCH for ${s.documentUrl}\n` +
                `  gold set labelled against ${s.sha256}\n` +
                `  bytes on disk are        ${acq.sha256}\n` +
                `  REFUSING to score — every citation in the gold set may be stale.`,
        };
    }
    const bytes = new Uint8Array(await readFile(cachedPdfPath(cacheDir, s.documentUrl)));
    const geo = await extractPageGeometry(bytes, {
        fromPage: Math.min(...s.pages),
        toPage: Math.max(...s.pages),
    });

    // ⛔ EXACTLY the gold set's pages — the SAME input the BEFORE run was given.
    // Feeding the spine more of the document than the flattened run saw would make
    // the comparison meaningless, in the spine's favour.
    const wanted = new Set(s.pages);
    const pages = geo.pages.filter((p) => wanted.has(p.pageNumber));
    const texts = geo.texts.filter((t) => wanted.has(t.pageNumber));
    const id = `${s.id} :: ${s.documentUrl}`;

    return {
        primary: buildCanonicalDocument(id, pages, texts),
        // The dual-pass, honestly redefined for a GEOMETRIC read: the same document
        // under a TIGHTER column tolerance. A value that changes column under
        // perturbation is a value nobody should publish.
        perturbed: buildCanonicalDocument(id, pages, texts, { table: { columnTolerance: 1.5 } }),
        scrambled: buildCanonicalDocument(id, scramblePages(pages)),
        rawTexts: texts,
    };
}

/* ════════════════════════════ drive the spine ═════════════════════════════ */

function readersFor(s: Stratum): ClaimReader[] {
    if (s.id === 'CH-TABLE') {
        // Table FIRST: a grid whose columns geometry resolved beats a line-based
        // grammar reading the same page flattened. That ORDER is the fix.
        return [
            createTableReader(LUZERN_BZR_ANHANG1),
            createGrammarReader(GERMAN_GRAMMAR, SWISS_GERMAN_QUALIFIERS),
        ];
    }
    if (s.id === 'CH-PROSE') return [createGrammarReader(GERMAN_GRAMMAR, SWISS_GERMAN_QUALIFIERS)];
    return [createGrammarReader(GERMAN_GRAMMAR, GERMAN_QUALIFIERS)];
}

/** The zone keys to read the document FOR — taken from the GOLD SET's own locators. */
function zoneKeysFor(s: Stratum, rows: readonly GoldRow[]): string[] {
    if (s.id !== 'CH-TABLE') return ['(document)'];
    const keys = new Set<string>();
    for (const r of rows) {
        const m = /^p\d+\/row-(.+)$/.exec(r.locator);
        if (m !== null) keys.add(m[1]!);
    }
    return [...keys];
}

function zoneContext(s: Stratum, zoneKey: string): ZoneContext {
    return {
        country: s.country,
        zoneKey,
        zoneLabel: null,
        authority: s.country === 'CH' ? 'Stadt Luzern' : 'Land Berlin',
        dataset: s.country === 'CH' ? 'Bau- und Zonenreglement' : 'Bebauungsplan',
        planId: s.country === 'CH' ? 'luze_BZR' : '1-19',
    };
}

type ZonedClaim = ExtractedClaim & { readonly __zone: string };
type ZonedNothing = NothingFound & { readonly __zone: string };

interface SpineRun {
    readonly claims: readonly ZonedClaim[];
    readonly nothing: readonly ZonedNothing[];
    readonly withheld: readonly { page: number; detail: string }[];
    readonly outcomes: readonly DocumentClaimOutcome[];
}

async function drive(
    s: Stratum,
    primary: CanonicalDocumentBuild,
    perturbed: CanonicalDocumentBuild | undefined,
    rows: readonly GoldRow[],
): Promise<SpineRun> {
    const claims: ZonedClaim[] = [];
    const nothing: ZonedNothing[] = [];
    const withheld: { page: number; detail: string }[] = [];
    const outcomes: DocumentClaimOutcome[] = [];
    const readers = readersFor(s);

    for (const zoneKey of zoneKeysFor(s, rows)) {
        const out = await documentToClaims({
            primary,
            ...(perturbed === undefined ? {} : { perturbed }),
            zone: zoneContext(s, zoneKey),
            readers,
            lexicon: s.country === 'CH' ? SWISS_GERMAN_QUALIFIERS : GERMAN_QUALIFIERS,
            locale: s.id === 'CH-TABLE' ? 'ch' : 'de',
            validity: { basis: 'ingestion', from: '2026-09-01', to: null },
        });
        outcomes.push(out);
        if (out.ok && out.kind === 'ran') {
            for (const c of out.claims) claims.push({ ...c, __zone: zoneKey });
            for (const n of out.nothingFound) nothing.push({ ...n, __zone: zoneKey });
            for (const w of out.withheldTables) {
                if (!withheld.some((x) => x.page === w.page && x.detail === w.detail)) withheld.push(w);
            }
        }
    }
    return { claims, nothing, withheld, outcomes };
}

/** Adapt tier-4 claims to the scorer's API-agnostic `Prediction` shape. */
function toPredictions(claims: readonly ExtractedClaim[]): Prediction[] {
    return claims.map((c) => ({
        field: c.field,
        value: c.value,
        sentence: c.evidence.span,
        matcherId: c.evidence.method,
    }));
}

/* ══════════ ARM S-B — the SLOT arm the spine makes possible at all ════════ */
//
// ⭐ THIS IS THE ARM THAT MATTERS AND THE ONE THE BEFORE RUN COULD NOT SCORE. A
// buildable envelope is computed for ONE parcel in ONE zone. The flattened run
// recorded all 55 CH-TABLE gold NUMBER rows as ⛔ UNANCHORABLE — a flattened
// stream has no zone to attribute a cell to — so slot recall was not a low
// number, it was UNDEFINED.

interface SlotResult {
    readonly matched: string[];
    readonly wrongValue: { row: string; gold: number; got: number; cell: string | null }[];
    readonly missed: string[];
    readonly denominator: number;
    readonly recall: number | null;
    /** A value emitted where the gold set says the cell is EMPTY — control 9. */
    readonly onUnknownCell: { zone: string; field: string; got: number; cell: string | null }[];
}

function scoreSlots(rows: readonly GoldRow[], claims: readonly ZonedClaim[]): SlotResult {
    const byKey = new Map<string, ZonedClaim>();
    for (const c of claims) byKey.set(`${c.__zone}|${c.field}`, c);

    const matched: string[] = [];
    const wrongValue: { row: string; gold: number; got: number; cell: string | null }[] = [];
    const missed: string[] = [];
    const onUnknownCell: { zone: string; field: string; got: number; cell: string | null }[] = [];

    for (const r of rows) {
        const m = /^p\d+\/row-(.+)$/.exec(r.locator);
        if (m === null) continue;
        const zone = m[1]!;
        const c = byKey.get(`${zone}|${r.field}`);
        if (r.label === 'NUMBER' && r.value !== null) {
            if (c === undefined) missed.push(r.id);
            else if (Math.abs(c.value - r.value) < 1e-9) matched.push(r.id);
            else wrongValue.push({ row: r.id, gold: r.value, got: c.value, cell: c.evidence.cell });
        } else if (r.label === 'UNKNOWN' && c !== undefined) {
            onUnknownCell.push({ zone, field: r.field, got: c.value, cell: c.evidence.cell });
        }
    }
    const denominator = matched.length + wrongValue.length + missed.length;
    return {
        matched,
        wrongValue,
        missed,
        denominator,
        recall: denominator === 0 ? null : matched.length / denominator,
        onUnknownCell,
    };
}

/* ═════════════════════ ARM S-T — the TIER LOCK, verified ══════════════════ */
//
// The single rule this wave exists to enforce. This arm does not trust the type
// system: it reads the RUNTIME value off every claim the spine produced.

interface TierAudit {
    readonly total: number;
    readonly tier4: number;
    readonly aiExtracted: number;
    readonly notChecked: number;
    readonly autoAccepted: number;
    readonly breaches: string[];
}

function auditTier(claims: readonly ExtractedClaim[]): TierAudit {
    const breaches: string[] = [];
    let tier4 = 0;
    let ai = 0;
    let notChecked = 0;
    let autoAccepted = 0;
    for (const c of claims) {
        const p = c.provenance as unknown as { confidence?: { tier?: unknown }; derivation?: unknown };
        if (p.confidence?.tier === 4) tier4++;
        else breaches.push(`${c.field}=${c.value} @${c.zoneKey}: tier is ${String(p.confidence?.tier)}, not 4`);
        if (p.derivation === 'AI_EXTRACTED') ai++;
        else breaches.push(`${c.field}=${c.value} @${c.zoneKey}: derivation is ${String(p.derivation)}`);
        if (c.validationState === 'not-checked') notChecked++;
        else breaches.push(`${c.field}=${c.value} @${c.zoneKey}: validationState is ${String(c.validationState)}`);
        if (c.autoAccepted) autoAccepted++;
    }
    return { total: claims.length, tier4, aiExtracted: ai, notChecked, autoAccepted, breaches };
}

/* ════════ ARM S-E — EVIDENCE, verified INDEPENDENTLY of the package ═══════ */
//
// The package has its own containment gate. Trusting it here would be checking a
// gate with itself (§probe-can-be-wrong-three-ways). This arm re-derives the check
// from the DOCUMENT: is the claim's verbatim span actually present in the source
// the reader was handed?

interface EvidenceAudit {
    readonly total: number;
    readonly withSpan: number;
    readonly spanFoundInSource: number;
    readonly withPage: number;
    readonly withCell: number;
    readonly failures: string[];
}

const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

function auditEvidence(claims: readonly ExtractedClaim[], b: CanonicalDocumentBuild): EvidenceAudit {
    const failures: string[] = [];
    const pageText = new Map<number, string>();
    for (const p of b.document.pages) pageText.set(p.pageNumber, normalise(p.text));
    // A table cell's span is RENDERED from the grid (`header=value | …`), not lifted
    // from the page string, so it is checked against the reconstructed rows — the
    // same evidence a reviewer would re-derive from the same PDF.
    const gridText = normalise(
        b.document.tables
            .flatMap((t) => [(t.header ?? []).join(' '), ...t.rows.map((r) => r.join(' '))])
            .join(' \n '),
    );

    let withSpan = 0;
    let found = 0;
    let withPage = 0;
    let withCell = 0;
    for (const c of claims) {
        const span = c.evidence.span ?? '';
        if (span.trim() !== '') withSpan++;
        else failures.push(`${c.field}=${c.value} @${c.zoneKey}: EMPTY span`);
        if (c.evidence.page > 0) withPage++;
        else failures.push(`${c.field}=${c.value} @${c.zoneKey}: no page`);
        if (c.evidence.cell !== null) withCell++;

        const fromGrid = c.evidence.method === 'table-reconstruction';
        const hay = fromGrid ? gridText : (pageText.get(c.evidence.page) ?? '');
        const tokens = normalise(span)
            .split(/[|=\s]+/)
            .filter((t) => t.length > 0);
        if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) found++;
        else {
            failures.push(
                `${c.field}=${c.value} @${c.zoneKey}: span NOT contained in the ` +
                    `${fromGrid ? 'reconstructed grid' : `page ${c.evidence.page} text`}`,
            );
        }
    }
    return { total: claims.length, withSpan, spanFoundInSource: found, withPage, withCell, failures };
}

/* ══════ ARM S-U — is every gold UNKNOWN cell answered by a TYPED reason? ══ */
//
// Control 9 says UNKNOWN must stay distinct from zero, unlimited and
// no-restriction. ARM S-B already proves no VALUE was invented on an empty cell.
// That is only half of it: a cell can also be answered by SILENCE — no claim and
// no `NothingFound` — which reads to a consumer exactly like "we never asked".
// This arm pairs EVERY gold UNKNOWN row against the run's typed reasons, one by
// one. A count that merely matches is not the same fact and is not accepted here.

interface UnknownAudit {
    readonly goldUnknownRows: number;
    readonly answeredWithTypedReason: number;
    readonly answeredWithAValue: number;
    readonly unanswered: string[];
    readonly reasonsUsed: readonly [string, number][];
}

function auditUnknowns(
    rows: readonly GoldRow[],
    nothing: readonly ZonedNothing[],
    claims: readonly ZonedClaim[],
): UnknownAudit {
    const typed = new Map<string, string>();
    for (const n of nothing) typed.set(`${n.__zone}|${n.field}`, n.reason);
    const valued = new Set<string>();
    for (const c of claims) valued.add(`${c.__zone}|${c.field}`);

    let answered = 0;
    let withValue = 0;
    const unanswered: string[] = [];
    const used = new Map<string, number>();
    const gold = rows.filter((r) => r.label === 'UNKNOWN');
    for (const r of gold) {
        const m = /^p\d+\/row-(.+)$/.exec(r.locator);
        const zone = m === null ? '(document)' : m[1]!;
        const k = `${zone}|${r.field}`;
        if (valued.has(k)) {
            withValue++;
            continue;
        }
        const reason = typed.get(k);
        if (reason === undefined) unanswered.push(r.id);
        else {
            answered++;
            used.set(reason, (used.get(reason) ?? 0) + 1);
        }
    }
    return {
        goldUnknownRows: gold.length,
        answeredWithTypedReason: answered,
        answeredWithAValue: withValue,
        unanswered,
        reasonsUsed: [...used].sort((a, b) => b[1] - a[1]),
    };
}

/* ═══ ARM S-X — IS THE NORMALIZER IN THE SPINE'S PATH? (a measured defect) ══ */
//
// ⭐ THIS ARM EXISTS BECAUSE THE TRIAL FOUND A REGRESSION AND REFUSED TO REPORT IT
// AS A SCORE. The spine emitted FEWER correct claims on prose than the flattened
// path it replaces. Rather than print "the spine is worse", this arm isolates the
// cause and re-measures it every run, so the finding cannot silently rot.
//
// `pdfPageItems.ts` builds page text with `joinPdfTextItems` — RAW Layer-2 output —
// and `buildCanonicalDocument` carries it verbatim. `ingest/normalize.ts` is called
// NOWHERE in `structure/` or `spine/`. The grammar therefore reads a string it was
// not authored against. This arm runs the SAME grammar over BOTH strings, over the
// SAME pages, and reports the difference as a count of RULE HITS LOST.

interface NormalizeAudit {
    readonly rawRuleHits: number;
    readonly normalizedRuleHits: number;
    readonly lost: string[];
}

function auditNormalizer(
    rawTexts: readonly { pageNumber: number; text: string; chars: number }[],
): NormalizeAudit {
    const hits = (pages: readonly { pageNumber: number; text: string; chars: number }[]): string[] => {
        const out: string[] = [];
        for (const p of pages) {
            const r = extractRules(p.text, GERMAN_GRAMMAR, { document: 'arm-s-x', page: p.pageNumber });
            if (!r.ok) continue;
            for (const rule of r.rules) out.push(`p${p.pageNumber} ${rule.field}=${rule.value}`);
        }
        return out;
    };
    const raw = hits(rawTexts);
    const norm = hits(normalizePages(rawTexts).pages);
    // Multiset difference: a hit the NORMALIZED text yields and the RAW text does not.
    const pool = [...raw];
    const lost: string[] = [];
    for (const h of norm) {
        const i = pool.indexOf(h);
        if (i >= 0) pool.splice(i, 1);
        else lost.push(h);
    }
    return { rawRuleHits: raw.length, normalizedRuleHits: norm.length, lost };
}

/* ═══════════════════════════════ the report ═══════════════════════════════ */

async function mtime(p: string): Promise<string> {
    try {
        return (await stat(p)).mtime.toISOString().replace('T', ' ').slice(0, 16);
    } catch {
        return '(absent)          ';
    }
}

async function main(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(' E8-TRIAL — THE **AFTER** RUN: the same gold set against the LAYER-3 SPINE');
    console.log(` gold set ${E8_GOLD_SET.version} · authored ${E8_GOLD_SET.authoredOn}`);
    console.log(' ⛔ humanConfirmed = false — this is a SELF-ASSESSMENT, not a validated figure');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log('INDEPENDENCE OF THE GOLD SET FROM ITS SUBJECT (mtimes, printed not asserted)');
    for (const p of [
        'tools/ordinance-trial/goldset/ch-table.ts',
        'tools/ordinance-trial/goldset/ch-prose.ts',
        'tools/ordinance-trial/goldset/de-prose.ts',
        'packages/ordinance-extraction/src/structure/tables.ts',
        'packages/ordinance-extraction/src/spine/readers.ts',
        'packages/ordinance-extraction/src/adapters/swissZoneTable.ts',
    ]) {
        console.log(`  ${await mtime(p)}  ${p}`);
    }
    console.log('  ⭐ the three GOLD files predate every PRODUCER file below them.\n');

    const results: Record<string, unknown> = {};
    let anyError = false;

    for (const s of E8_GOLD_SET.strata) {
        const rows = E8_GOLD_SET.rows.filter((r) => r.stratum === s.id);
        console.log(`\n───────────────────────────────────────────────────────────────────────────`);
        console.log(`STRATUM ${s.id} — ${s.label}`);
        console.log(`  pages ${s.pages.join(', ')} · ${s.valueShape} · ${s.country} · ${s.sample}`);

        const b = await build(s);
        if ('error' in b) {
            console.log(`\n  ⛔ COULD NOT RUN: ${b.error}`);
            anyError = true;
            continue;
        }

        const confident = b.primary.tables.filter((t) => t.table.confident);
        const withheldGrids = b.primary.tables.filter((t) => !t.table.confident);
        console.log(`\n  STAGE 3 — STRUCTURE (this layer did not exist for the BEFORE run)`);
        console.log(`    lines                 ${b.primary.lines.length}`);
        console.log(`    sections              ${b.primary.document.sections.length}`);
        console.log(`    candidate grids       ${b.primary.tables.length}`);
        console.log(`    CONFIDENT             ${confident.length}`);
        for (const t of confident) {
            console.log(`      p${t.table.page} · ${t.table.rows.length} rows · header [${(t.table.header ?? []).join(' | ')}]`);
        }
        console.log(
            `    ⛔ WITHHELD            ${withheldGrids.length}` +
                (withheldGrids.length > 0 ? '  (rows emptied — nothing to read, BY CONSTRUCTION)' : ''),
        );
        for (const t of withheldGrids) {
            console.log(`      p${t.table.page} · ${t.diagnostics.reasons.join(', ') || 'unstated'}`);
        }

        const run = await drive(s, b.primary, b.perturbed, rows);
        const scrambledRun = await drive(s, b.scrambled, undefined, rows);
        const preds = toPredictions(run.claims);

        const score = scoreStratum(s.id, E8_GOLD_SET.rows, preds);
        const scrambled = scoreStratum(s.id, E8_GOLD_SET.rows, toPredictions(scrambledRun.claims));
        const oracle = scoreStratum(s.id, E8_GOLD_SET.rows, oraclePredictions(E8_GOLD_SET.rows, s.id));

        console.log(`\n  CONTROL 1 — ORACLE (predictions built FROM the gold set; must be 100%/100%)`);
        console.log(
            `    precision ${pct(oracle.armA.precision)} · recall ${pct(oracle.armA.recall)}  ` +
                `${oracle.armA.precision === 1 && oracle.armA.recall === 1 ? '✓ scorer plumbing verified' : '⛔ SCORER IS BROKEN — do not read below'}`,
        );

        console.log(`\n  ARM A — CLAIM SET, distinct (field, value) within the stratum`);
        console.log(`    emitted           ${score.armA.emittedCount}`);
        console.log(`    true positives    ${score.armA.truePositives.length}`);
        console.log(
            `    false positives   ${score.armA.falsePositives.length}` +
                ` (named traps ${score.armA.falsePositives.filter((f) => f.klass === 'named-trap').length},` +
                ` unlisted ${score.armA.falsePositives.filter((f) => f.klass === 'unlisted').length})`,
        );
        console.log(`    false negatives   ${score.armA.falseNegatives.length}`);
        console.log(`    PRECISION         ${pct(score.armA.precision)}   (denominator: ${score.armA.emittedCount} emitted claims)`);
        console.log(`    RECALL            ${pct(score.armA.recall)}   (denominator: ${score.armA.goldClaimCount} gold claims)`);
        console.log(
            `    OVERSTATEMENT     ${pct(score.armA.overstatementRate)}   (${score.armA.overstatementCount} of ${score.armA.emittedCount} emitted exceed the gold ceiling)`,
        );

        const slots = scoreSlots(rows, run.claims);
        if (s.id === 'CH-TABLE') {
            console.log(`\n  ⭐ ARM S-B — SLOT, (zone, field, value) — THE PRODUCT UNIT`);
            console.log(`     ⚠ The BEFORE run scored this arm ⛔ UNANCHORABLE for all 55 gold NUMBER rows:`);
            console.log(`       a flattened stream has no zone to attribute a cell to. It is scoreable AT`);
            console.log(`       ALL only because Layer 3 now resolves the column by geometry.`);
            console.log(`    zone-attributable gold rows  ${slots.denominator}`);
            console.log(`    matched (zone+field+value)   ${slots.matched.length}`);
            console.log(`    WRONG VALUE at the right slot ${slots.wrongValue.length}`);
            console.log(`    missed                       ${slots.missed.length}`);
            console.log(`    SLOT RECALL                  ${pct(slots.recall)}   (denominator: ${slots.denominator})`);
            console.log(`    ⛔ value on an UNKNOWN cell   ${slots.onUnknownCell.length}  (gold says the cell is EMPTY — control 9)`);
            for (const w of slots.wrongValue.slice(0, 12)) {
                console.log(`      ⛔ ${w.row}: gold ${w.gold}, spine ${w.got}  [cell ${w.cell ?? '—'}]`);
            }
            for (const u of slots.onUnknownCell.slice(0, 12)) {
                console.log(`      ⛔ zone ${u.zone} ${u.field}: gold UNKNOWN, spine ${u.got}  [cell ${u.cell ?? '—'}]`);
            }
        }

        const tier = auditTier(run.claims);
        console.log(`\n  ⭐ ARM S-T — THE TIER LOCK, read off every claim at RUNTIME`);
        console.log(`    claims produced             ${tier.total}`);
        console.log(`    tier 4                      ${tier.tier4} / ${tier.total}`);
        console.log(`    derivation AI_EXTRACTED     ${tier.aiExtracted} / ${tier.total}`);
        console.log(`    validationState not-checked ${tier.notChecked} / ${tier.total}`);
        console.log(`    autoAccepted                ${tier.autoAccepted} / ${tier.total}  (⚠ NEVER a licence to publish)`);
        console.log(`    ${tier.breaches.length === 0 ? '✓ no claim graduated' : `⛔ ${tier.breaches.length} BREACH(ES)`}`);
        for (const x of tier.breaches.slice(0, 10)) console.log(`      ⛔ ${x}`);

        const ev = auditEvidence(run.claims, b.primary);
        console.log(`\n  ARM S-E — EVIDENCE, re-derived from the document (NOT from the package's own gate)`);
        console.log(`    carries a verbatim span   ${ev.withSpan} / ${ev.total}`);
        console.log(`    span CONTAINED in source  ${ev.spanFoundInSource} / ${ev.total}`);
        console.log(`    carries a page            ${ev.withPage} / ${ev.total}`);
        console.log(`    names its COLUMN (cell)   ${ev.withCell} / ${ev.total}`);
        for (const f of ev.failures.slice(0, 8)) console.log(`      ⛔ ${f}`);

        const reasons = new Map<string, number>();
        for (const n of run.nothing) reasons.set(n.reason, (reasons.get(n.reason) ?? 0) + 1);
        console.log(`\n  ARM S-N — HONEST EMPTIES (control 9: a TYPED reason, never a silence)`);
        if (reasons.size === 0) console.log(`    (none recorded)`);
        for (const [r, n] of [...reasons].sort((a, c) => c[1] - a[1])) console.log(`    ${r.padEnd(26)} ${n}`);
        console.log(`    withheld grids reported to the caller: ${run.withheld.length}`);
        const kinds = new Map<string, number>();
        for (const o of run.outcomes) kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
        console.log(`    spine outcomes: ${[...kinds].map(([k, v]) => `${k}=${v}`).join(' · ')}   (ran ≠ refused ≠ failed)`);

        const unk = auditUnknowns(rows, run.nothing, run.claims);
        console.log(`\n  ARM S-U — every gold UNKNOWN cell, PAIRED against a typed reason (not counted)`);
        console.log(`    gold UNKNOWN rows            ${unk.goldUnknownRows}`);
        console.log(`    answered by a TYPED reason   ${unk.answeredWithTypedReason}`);
        console.log(`    ⛔ answered by a VALUE        ${unk.answeredWithAValue}  (a number where the source is silent)`);
        console.log(`    ⛔ UNANSWERED (pure silence)  ${unk.unanswered.length}  ("we never asked" and "it is not there" print alike)`);
        for (const [rn, n] of unk.reasonsUsed) console.log(`        ${rn.padEnd(24)} ${n}`);
        for (const u of unk.unanswered.slice(0, 6)) console.log(`        ⛔ ${u}`);

        const nrm = auditNormalizer(b.rawTexts);
        console.log(`\n  ⭐ ARM S-X — IS ingest/normalize.ts IN THE SPINE'S PATH?`);
        console.log(`    grammar hits on RAW text (what the spine feeds it)         ${nrm.rawRuleHits}`);
        console.log(`    grammar hits on NORMALIZED text (what the BEFORE run fed)  ${nrm.normalizedRuleHits}`);
        console.log(
            `    ${nrm.lost.length === 0 ? '✓ no rule hit is lost to the raw/normalized difference' : `⛔ ${nrm.lost.length} RULE HIT(S) LOST because the spine bypasses the normalizer`}`,
        );
        for (const l of nrm.lost) console.log(`        lost: ${l}`);

        console.log(`\n  CONTROL 2 — SCRAMBLE (every digit in every ITEM remapped; must score worse)`);
        console.log(`    precision ${pct(scrambled.armA.precision)} · recall ${pct(scrambled.armA.recall)} · emitted ${scrambled.armA.emittedCount}`);
        // ⚠ THE CONTROL CAN ONLY DISCRIMINATE WHERE THE REAL RUN SCORED SOMETHING.
        // With zero true positives on the real input there is no height to fall
        // from, and printing "NO DROP" would read as an indictment of the harness
        // when it is in fact a statement about the extractor. Say INCONCLUSIVE.
        if (score.armA.truePositives.length === 0) {
            console.log(
                `    ⚠ INCONCLUSIVE for this stratum — the real run scored ${score.armA.truePositives.length} true` +
                    ` positives, so a scrambled run cannot score lower. (The control DOES discriminate on` +
                    ` CH-TABLE, which is what establishes the harness.)`,
            );
        } else {
            const dropped = score.armA.truePositives.length > scrambled.armA.truePositives.length;
            console.log(
                `    ${dropped ? '✓ the harness can fail — it is measuring the document, not the shape of the text' : '⛔ NO DROP — these numbers mean nothing.'}`,
            );
        }

        const n = score.armA.goldClaimCount;
        console.log(`\n  POWER`);
        console.log(`    ARM A: n = ${n} distinct gold claims → 95% half-width ±${(halfWidth(n) * 100).toFixed(1)}%`);
        if (s.id === 'CH-TABLE') {
            console.log(`    ARM S-B: n = ${slots.denominator} slot rows → 95% half-width ±${(halfWidth(slots.denominator) * 100).toFixed(1)}%`);
        }
        if (n < 50) console.log(`    ⛔ ARM A IS BELOW THE 50-PER-STRATUM FLOOR. Report the DIRECTION, never the percentage.`);

        if (VERBOSE) {
            console.log(`\n  EVERY EMITTED CLAIM, with the gate verdicts it carries`);
            for (const c of run.claims.slice(0, 24)) {
                console.log(
                    `    ${c.field}=${c.value}${c.unit === null ? '' : ` ${c.unit}`} @zone ${c.__zone}` +
                        ` · ${c.evidence.method} · autoAccepted=${c.autoAccepted}` +
                        (c.flags.length === 0 ? '' : ` · flags: ${c.flags.join('; ')}`),
                );
                for (const g of c.gates.filter((x) => x.verdict !== 'pass')) {
                    console.log(`        gate ${g.gate}: ${g.verdict} — ${g.detail}`);
                }
            }
            if (run.claims.length > 24) console.log(`    … ${run.claims.length - 24} more`);

            console.log(`\n  FALSE POSITIVES (every one)`);
            for (const f of score.armA.falsePositives) {
                console.log(
                    `    ${f.overstates ? '⛔ OVERSTATES' : '   wrong     '} ${f.field} = ${f.value}  [${f.klass}${f.namedBy !== null ? ` ${f.namedBy}` : ''}]`,
                );
                for (const q of f.sentences.slice(0, 1)) console.log(`        cited: "${q.slice(0, 170)}${q.length > 170 ? '…' : ''}"`);
            }
            console.log(`\n  FALSE NEGATIVES (every one)`);
            for (const f of score.armA.falseNegatives) console.log(`    ${f.field} = ${f.value}   gold rows: ${f.rows.join(', ')}`);
        }

        results[s.id] = {
            stratum: s,
            score,
            scrambled,
            oracle,
            slots,
            tier,
            evidence: ev,
            reasons: [...reasons],
            withheld: run.withheld,
        };
    }

    console.log(`\n\n───────────────────────────────────────────────────────────────────────────`);
    console.log(`STILL PENDING — measured as ABSENT, never scored as zero`);
    console.log(`  Stage 4 AI   — no DualPassExtractor implementation exists in the repo, so the`);
    console.log(`                 'ai-span-retrieval' method produced NOTHING in this run. Every`);
    console.log(`                 claim above came from a DETERMINISTIC reader (table geometry or`);
    console.log(`                 grammar). The AI half of "AI interprets, deterministic computes"`);
    console.log(`                 has its TIER STAMPING proven and its ACCURACY unmeasured.`);
    console.log(`───────────────────────────────────────────────────────────────────────────`);

    if (JSON_OUT !== undefined) {
        await writeFile(JSON_OUT, JSON.stringify({ goldSet: E8_GOLD_SET.version, results }, null, 2), 'utf8');
        console.log(`\nwrote ${JSON_OUT}`);
    }
    if (anyError) process.exitCode = 1;
}

void main();
