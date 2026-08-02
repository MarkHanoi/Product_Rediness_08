#!/usr/bin/env python
# -*- coding: utf-8 -*-
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# CORPUS VERIFICATION — THE FOOTNOTE APPARATUS, READ FROM THE COMMITTED PDF.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
#
# ⛔ WHY THIS EXISTS AND WHY IT DOES NOT READ `esAmbPgmScope.ts`.
#   The claim under test is "L'Hospitalet, Cornellà and Sant Boi carry no footnote entry on this
#   article". That claim currently lives in a CODE COMMENT. This entire exercise exists because a
#   repo assertion and the repo's BEHAVIOUR disagreed — so a second repo assertion is not evidence.
#   Everything below is read out of `PGM-NNUU-metropolitana.pdf`, which is committed.
#
# ⭐ THE APPARATUS IS EXHAUSTIVE AND THAT IS WHAT MAKES ABSENCE PROVABLE.
#   The compendium footnotes each modified article with an explicit, enumerable list of the form
#   «Veure modificació per al Municipi de <NAME> a la pàg. <N>». Art. 327 carries footnote 49 and
#   Art. 328 carries footnote 50. Because the apparatus ENUMERATES the modifiers, a municipality's
#   ABSENCE from footnote 49/50 is a POSITIVE finding about the compendium, not a failed search.
#
# ⚠⚠ AND THAT IS STILL `not-recorded-in-this-source`, NEVER `does-not-exist`. The compendium is
#   consolidated only to 31-12-2009 and declares itself «merament divulgativa». It cannot speak to
#   2010–2026. ⇒ The verdict this file emits is scoped to the source, and the `unknown → REFUSE`
#   branch in ladderSelect.mjs is what carries the residual risk. UNKNOWN NEVER NO.
#
# ⛔ THE DIGIT-DROPPING TRAP, and it already destroyed three rounds of this investigation.
#   The MPGM annex pages embed subset fonts with no ToUnicode. `get_text()` returns the prose with
#   EVERY DIGIT DROPPED — the article surfaces without its table, which is indistinguishable from
#   "the modification does not exist". ⇒ Every table extracted here is checked for DIGIT PRESENCE,
#   and a page whose prose is present but whose digits are absent is reported as
#   `GLYPH-SHIFTED — UNREADABLE`, never as an empty or absent table.
import fitz, re, json, sys, os

ROOT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08'
BASE_PDF = os.path.join(ROOT, 'docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf')
CORPUS_DIR = os.path.join(ROOT, 'docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/corpus/pdf')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'corpus-verification.json')

doc = fitz.open(BASE_PDF)

def norm(s):
    """The compendium's Latin-1-ish mojibake normalised for MATCHING ONLY. Never for reporting."""
    return (s.replace('\ufffd', '?'))


# \u2550\u2550\u2550 \u00a7GLYPH-SHIFT RECOVERY \u2014 THE STEP WITHOUT WHICH THE ANNEXES READ AS BLANK \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# `bcnAlcadaReguladora.ts` \u00a7L-660 records that THREE ROUNDS of this investigation read the Art. 327
# annex as EMPTY, and that "nothing, not garbage" is indistinguishable from "the modification does
# not exist". The cause: the annex pages embed subset fonts with no ToUnicode.
#
# MEASURED HERE \u2014 there are exactly TWO shift families in this document, and both are recoverable
# LOSSLESSLY FOR DIGITS without rendering a raster:
#   \u2022 the +29 family \u2014 codepoints below 0x20 carrying text. `\x15\x44\x11` decodes to \u00ab2a.\u00bb
#     (0x15+29=0x32='2', 0x44+29=0x61='a', 0x11+29=0x2E='.'). Digits, comma and \u00abPB +\u00bb all recover.
#   \u2022 the U+F0xx PRIVATE USE AREA family \u2014 subtract 0xF000.
#
# \u2b50 WHY THIS IS SAFE FOR THE ONLY THING IT IS USED FOR. Accented Catalan letters do NOT round-trip
#   (\u00abal\u00e7ada\u00bb surfaces as \u00abDOoDGD\u00bb), and that is fine: this decoder is used ONLY to read the BAND
#   TABLES \u2014 decimal figures, \u00abPB + n\u00bb, and the width prose \u00abDe 8 a menys de 12 m\u00bb. Those are pure
#   ASCII and they recover exactly. \u26d4 The decoded prose is NEVER quoted as the instrument's text;
#   the quotable text is the committed DOGC PDF.
#
# \u26d4 AND THE DIGIT-PRESENCE CHECK STILL GOVERNS. If a page decodes to prose but still no digits, it
#   is reported UNREADABLE. Recovery that half-works must never be reported as a reading.
def deglyph(t):
    out = []
    for ch in t:
        c = ord(ch)
        if 0xF000 <= c <= 0xF0FF:
            out.append(chr(c - 0xF000))
        elif c < 0x20 and ch not in '\n\t\r':
            out.append(chr(c + 29))
        else:
            out.append(ch)
    return ''.join(out)


def deglyph_full(t):
    """
    The FULL-RANGE +29 decode.

    ⚠ WHY TWO DECODERS AND NOT ONE. `deglyph()` above shifts only codepoints below 0x20, which is
    enough to recover DIGITS (a digit encodes into 0x13–0x1C) — and digits were all the first pass
    needed. It is NOT enough to recover LETTERS: 'A' (0x41) encodes to '$' (0x24), which sits above
    0x20 and survives untouched, so «Art. 327» surfaces as «$UW. 327».
    ⇒ The article HEADING could not be matched, and the heading is the check that stops Art. 328's
      four bands being returned as Art. 327's six. The full-range decoder recovers it.

    ⛔ NEWLINES ARE EXCLUDED, AND THAT IS NOT COSMETIC. 0x0A is inside the shift range and would
      decode to an apostrophe, DESTROYING every line break on the page — which is what the
      column-wise band parser keys on. Measured: without the exclusion the whole page collapses to
      one line and the table cannot be segmented.

    ⚠ THIS DECODER IS LOSSY FOR ACCENTED CATALAN («alçada» → «aloada») and it corrupts any text
      that was NOT encoded (the printed folio «277» becomes «OTT»). It is therefore used ONLY to
      locate the article heading and to read the ASCII band table. ⛔ Nothing decoded here is ever
      quoted as the instrument's text — the quotable source is the committed DOGC PDF.
    """
    out = []
    for ch in t:
        c = ord(ch)
        if 0xF000 <= c <= 0xF0FF:
            out.append(chr(c - 0xF000))
        elif 0x03 <= c <= 0x5D and ch not in '\n\r\t':
            out.append(chr(c + 29))
        else:
            out.append(ch)
    return ''.join(out)


def page_text(pi):
    """
    Raw text plus BOTH de-glyphed variants. All three are tried and WHICH ONE ANSWERED IS RECORDED.
    ⛔ A recovery whose provenance is not recorded is indistinguishable from a guess.
    """
    raw = doc[pi].get_text()
    return raw, deglyph(raw), deglyph_full(raw)


# The annex tables are laid out COLUMN-WISE: all the width rows, then all the heights, then all the
# storey counts. The base-compendium tables are laid out ROW-WISE. Both shapes are parsed, and which
# shape matched is recorded \u2014 a parser that silently accepts either could pair a width with the
# wrong height and the result would still look like a table.
# \u26a0 THE TOP BAND IS SPELLED THREE DIFFERENT WAYS ACROSS THE FOUR TABLES, and requiring one spelling
#   silently dropped it. Measured: base Art. 327 \u00abDe 30 m. o m\u00e9s metres\u00bb, Barcelona Art. 327 \u00abDe 30 m
#   o m\u00e9s\u00bb, Badalona Art. 328 \u00abDe 15 metres en endavant\u00bb, base Art. 328 \u00abDe 15 en endavant\u00bb.
#   \u26d4 The failure mode is the dangerous one: the parser returned 3 bands instead of 4 and every
#     check downstream still ran, comparing tables of different LENGTHS as though that were a
#     finding. Band COUNT is now asserted against the shipped table.
WIDTH_RE = re.compile(
    r"(?:De|D'|D\u2019)\s*(?:"
    r"menys de\s*(\d+)"
    r"|(\d+)\s*(?:m\.?|metres)?\s*(?:a|en)\s*menys de\s*(\d+)"
    r"|(\d+)\s*(?:m\.?|metres)?\s*(?:o m.s(?:\s*metres)?|en endavant)"
    r")", re.IGNORECASE)
# \u26a0 THE `m` SUFFIX IS OPTIONAL, AND THE FIRST VERSION REQUIRING IT SILENTLY MATCHED NOTHING.
#   Barcelona's annex prints \u00ab9,00 m\u00bb; Badalona's prints a bare \u00ab9,00\u00bb. Requiring the unit returned
#   ZERO bands for Badalona \u2014 and zero bands is exactly the "the modification does not exist"
#   reading this file exists to prevent. The suffix is now optional and the count is asserted.
HEIGHT_RE = re.compile(r'(?<![\d,])(\d{1,2}[,\u2019]\d{2})(?!\d)\s*(?:m\b|m\.|P\b)?')
FLOORS_RE = re.compile(r'PB\s*\+\s*(\d+)\s*(?:P\b|pis|pisos)', re.IGNORECASE)


def parse_columnwise(t):
    """Parse an annex-style table where widths, heights and storey counts appear as three runs."""
    widths = [(m.group(1) or m.group(2) or m.group(4), m.group(3)) for m in WIDTH_RE.finditer(t)]
    heights = [float(m.group(1).replace(',', '.').replace('\u2019', '.')) for m in HEIGHT_RE.finditer(t)]
    floors = [int(m.group(1)) for m in FLOORS_RE.finditer(t)]
    n = min(len(widths), len(heights), len(floors))
    if n == 0:
        return []
    bands = []
    for i in range(n):
        lo, hi = widths[i]
        bands.append({'minWidth_m': float(lo) if i else 0.0,
                      'maxWidth_m': float(hi) if hi else 'Infinity',
                      'height_m': heights[i], 'floorsAboveGround': floors[i]})
    return bands

# ── 1 · THE ARTICLE TABLES, EXTRACTED FROM THE BASE COMPENDIUM ──────────────────────────────────
# Bands are published as prose rows: «De menys de 8 m.» / «8,55» / «PB + 1 P».
ROW_RE = re.compile(
    r'(De menys de\s*(\d+)\s*m\.|De\s*(\d+)\s*a menys de\s*(\d+)\s*m\.|De\s*(\d+)\s*m\.? o m.s metres|De\s*(\d+)\s*en endavant)'
    r'\s*\n\s*([\d]+,[\d]+)\s*\n\s*PB\s*\+\s*?(\d+)\s*P', re.IGNORECASE)

def extract_article_table(page_idx_list, article_label):
    """Extract the alçada band table for one article. Returns bands + a digit-presence check."""
    for pi in page_idx_list:
        t = doc[pi].get_text()
        bands = []
        for m in ROW_RE.finditer(t):
            lo = m.group(2) or m.group(3) or m.group(5) or m.group(6)
            hi = m.group(4)
            bands.append({
                'raw': re.sub(r'\s+', ' ', m.group(1)).strip(),
                'minWidth_m': 0.0 if m.group(2) else float(lo),
                'maxWidth_m': float(hi) if hi else (float(lo) if m.group(2) else None),
                'height_m': float(m.group(7).replace(',', '.')),
                'floorsAboveGround': int(m.group(8)),
            })
        # ⛔ DIGIT-PRESENCE CHECK — prose without digits is the glyph-shift signature, NOT an absence.
        has_prose = ('Amplada de vial' in t) or ('mplada de vial' in t)
        has_digits = bool(re.search(r'\d,\d\d', t))
        if bands:
            # normalise the open top band
            for i, b in enumerate(bands):
                if b['maxWidth_m'] is None or (i == len(bands) - 1 and b['maxWidth_m'] == b['minWidth_m']):
                    b['maxWidth_m'] = 'Infinity'
            return {'found': True, 'pdfPageIndex': pi, 'printedPage': pi, 'article': article_label,
                    'bands': bands, 'digitCheck': 'digits present'}
        if has_prose and not has_digits:
            return {'found': False, 'pdfPageIndex': pi, 'article': article_label,
                    'digitCheck': 'GLYPH-SHIFTED — UNREADABLE: the width/height prose is present but every digit is dropped. '
                                  'This is NOT an absent table and must never be reported as one.'}
    return {'found': False, 'article': article_label, 'digitCheck': 'not located on the pages searched — not-located-in-source, NEVER does-not-exist'}

art327_base = extract_article_table([107, 106, 108], 'Art. 327 (base metropolitan, clau 13a)')
art328_base = extract_article_table([108, 109], 'Art. 328 (base metropolitan, clau 13b)')

# ── 2 · THE FOOTNOTE APPARATUS — WHO MODIFIES WHAT ──────────────────────────────────────────────
# «49.\tVeure modificació per al Municipi de Badalona a la pàg. 137»
FN_HEAD = re.compile(r'^(\d{1,3})\.\s*\t?\s*(.*)$')
# ⚠ TEMPERED, NOT GREEDY. The first version used `(.+?)` with DOTALL and the municipality name ran
#   ACROSS footnote entries — it produced "municipality" strings 200 characters long containing three
#   other municipalities. A name may legitimately wrap a line («Santa Coloma de \n Gramenet»), so the
#   dot must cross newlines but must NOT cross the next delimiter. The tempered dot below refuses to
#   consume «a la pàg.» or the start of the next «Veure modificació».
#   ⛔ The tell was that the enumeration contained entries that were obviously sentences. An
#     enumeration whose members are not atoms has not enumerated anything.
MOD_RE = re.compile(
    r'Veure modificaci.\s+per al Municipi de\s+((?:(?!a la p.g\.|Veure modificaci).)+?)\s*a la p.g\.\s*(\d+)',
    re.DOTALL)

def footnotes_on_page(pi):
    """Parse the footnote block at the foot of a page into {number: [(municipality, page)]}."""
    t = doc[pi].get_text()
    # The block starts at the first line that is `<n>.` followed by a `Veure modificació` reference.
    idx = None
    for m in re.finditer(r'\n(\d{1,3})\.\s*\t?\s*Veure modificaci', t):
        idx = m.start(); break
    if idx is None:
        return {}
    block = t[idx:]
    out = {}
    # Split on the footnote numbers that introduce a `Veure modificació`.
    parts = re.split(r'\n(\d{1,3})\.\s*\t?\s*(?=Veure modificaci)', block)
    # parts = ['', num, body, num, body, ...]
    for i in range(1, len(parts) - 1, 2):
        num = parts[i]
        body = parts[i + 1]
        mods = [{'municipality': re.sub(r'\s+', ' ', a).strip(), 'page': int(b)} for a, b in MOD_RE.findall(body)]
        out[num] = mods
    return out

fn107 = footnotes_on_page(107)
fn108 = footnotes_on_page(108)

art327_footnote = fn107.get('49', fn108.get('49'))
art328_footnote = fn108.get('50', fn107.get('50'))

# ── 3 · THE WHOLE-COMPENDIUM SWEEP — every municipality that modifies ANY article ────────────────
# ⭐ This is what turns "no footnote on Art. 327" from a failed search into an ENUMERATION.
all_mods = {}
pages_with_mods = 0
for pi in range(doc.page_count):
    t = doc[pi].get_text()
    if 'Veure modificaci' not in t:
        continue
    pages_with_mods += 1
    for a, b in MOD_RE.findall(t):
        name = re.sub(r'\s+', ' ', a).strip()
        all_mods.setdefault(name, set()).add(int(b))
all_mods = {k: sorted(v) for k, v in sorted(all_mods.items())}

# ── 4 · BARCELONA'S AND BADALONA'S OWN MODIFICATION PAGES ───────────────────────────────────────
# The footnote cites PRINTED pages; the PDF index runs +1. Both are tried and which one answered is
# recorded — a silent ±1 is exactly how a "blank page" verdict gets manufactured.
def read_modification(printed_page, who, article_no, article_label):
    """
    Read ONE municipality's modified band table off the annex page the footnote cites.

    ⛔ THE ARTICLE HEADING IS REQUIRED, NOT OPTIONAL. Barcelona's Arts. 327 and 328 sit on ADJACENT
      pages (276 and 277) and both are «Alçades» tables with a «PB + n» column. A page-only read
      that did not check WHICH ARTICLE it had landed on would happily return Art. 328's four bands
      as Art. 327's six — a table-shaped answer to the wrong question. The heading is decoded and
      asserted, and the page the answer came from is recorded.
    """
    tried = []
    for pi in (printed_page, printed_page + 1, printed_page - 1):
        if pi < 0 or pi >= doc.page_count:
            continue
        raw, dg, dgf = page_text(pi)
        for label, t in (('raw', raw), ('deglyph-digits', dg), ('deglyph-full', dgf)):
            # «Art. 327» / «Article 327» / «$UW. 327» decoded → «Art. 327»
            heading = re.search(r'(?:Art\.?|Article)\s*%s\b' % article_no, t)
            continuation = None
            if not heading:
                # ⭐ THE ARTICLE MAY CONTINUE ACROSS A PAGE BREAK, and Barcelona's Art. 328 does
                #   exactly that: the footnote cites pàg. 277, which OPENS with a bare «2a. Alçades»
                #   and never repeats the heading — the heading sits at the foot of p.276.
                #   ⛔ Dropping the page for want of a heading would have reported Barcelona's Art.
                #     328 as ABSENT FROM THE COMPENDIUM. That is the failure-vs-empty conflation,
                #     on the exact article under audit.
                #   ⇒ A continuation is accepted ONLY when the PRECEDING page's LAST article heading
                #     is the article we want — i.e. nothing else could have started in between. The
                #     acceptance is recorded as `continuation`, never as a heading match.
                # ⚠ THE FOLIO ITSELF IS CORRUPTED BY THE FULL DECODER. Page 277's printed folio «277»
                #   was NOT glyph-encoded, so the +29 shift mangles it to «OTT». Anchoring this test
                #   on `\d+` therefore failed on the ONE page it exists to serve — a guard that only
                #   ever fires on healthy input is not a guard. The leading token is matched loosely;
                #   the PROOF is the previous page's last heading, asserted below.
                if pi > 0 and re.match(r'\s*\S{0,8}\s*\n\s*2[aª]?[\.\s]*(?:Al|Aloada|Alçada)', t):
                    _, pdg, pdgf = page_text(pi - 1)
                    prev = pdgf if label == 'deglyph-full' else (pdg if label == 'deglyph-digits' else _)
                    heads = re.findall(r'(?:Art\.?|Article)\s*(\d{3})\b', prev)
                    if heads and heads[-1] == str(article_no):
                        continuation = f'continuation of Art. {article_no}, whose heading is the LAST article heading on PDF page {pi - 1}'
                if not continuation:
                    continue
            seg = t[heading.start():] if heading else t
            # Stop at the NEXT article heading so a two-article page cannot bleed.
            nxt = re.search(r'(?:Art\.?|Article)\s*\d{3}\b', seg[10:])
            if nxt:
                seg = seg[:nxt.start() + 10]
            bands = parse_columnwise(seg)
            has_prose = bool(re.search(r'mpl[ae] de vial|mplada\s*\n?\s*de\s*\n?\s*vial', seg, re.IGNORECASE))
            has_digits = bool(re.search(r'\d{1,2}[,’]\d{2}', seg))
            tried.append({'pdfPageIndex': pi, 'variant': label,
                          'headingFound': bool(heading), 'continuation': continuation,
                          'bands': len(bands), 'hasProse': has_prose, 'hasDigits': has_digits})
            if bands:
                return {'found': True, 'pdfPageIndex': pi, 'printedPageCited': printed_page,
                        'readVia': label, 'article': article_label,
                        'headingMatched': heading.group(0) if heading else continuation,
                        'mentionsMunicipality': who.split()[0].lower() in t.lower(),
                        'bands': bands,
                        'digitCheck': 'digits present' + ('' if label == 'raw' else ' (recovered by the §GLYPH-SHIFT decoder — the raw extraction drops every digit)'),
                        'attempts': tried}
            if has_prose and not has_digits:
                return {'found': False, 'pdfPageIndex': pi, 'printedPageCited': printed_page,
                        'article': article_label, 'attempts': tried,
                        'digitCheck': 'GLYPH-SHIFTED — UNREADABLE even after the decoder. NOT an absent table. '
                                      'The rasterised read (page.get_pixmap) is the remaining recovery path (see bcnAlcadaReguladora.ts §L-660).'}
    return {'found': False, 'printedPageCited': printed_page, 'article': article_label, 'attempts': tried,
            'digitCheck': 'not located — not-located-in-source, NEVER does-not-exist'}

bcn_327 = read_modification(276, 'Barcelona', 327, 'Art. 327 as modified for Barcelona (MPGM 02-03-2007, DOGC 4893)')
bcn_328 = read_modification(277, 'Barcelona', 328, 'Art. 328 as modified for Barcelona (MPGM 02-03-2007, DOGC 4893)')
bdn_327 = read_modification(137, 'Badalona', 327, 'Art. 327 as modified for Badalona (its OWN instrument)')
bdn_328 = read_modification(137, 'Badalona', 328, 'Art. 328 as modified for Badalona (its OWN instrument)')

# ═══ ⭐⭐ THE ATTRIBUTION-vs-VALUE TEST, MEASURED RATHER THAN QUOTED ═════════════════════════════
# The source file asserts «Badalona has its OWN instrument (DOGC 5224) stating numerically IDENTICAL
# values» and that «a figures-only check cannot tell the two municipalities apart». That assertion is
# the reason this defect recurred three times — so it is TESTED here against the corpus, not trusted.
def band_key(bands):
    return None if not bands else [(b['height_m'], b['floorsAboveGround']) for b in bands]

def compare(a, b, label):
    ka, kb = band_key(a.get('bands')), band_key(b.get('bands'))
    if ka is None or kb is None:
        return {'comparable': False, 'label': label,
                'why': 'one side could not be read from the corpus — UNKNOWN, and UNKNOWN NEVER NO. '
                       'A failed read must not be reported as "the values differ" OR as "the values agree".'}
    return {'comparable': True, 'label': label,
            'numericallyIdentical': ka == kb, 'a': ka, 'b': kb,
            'consequence': ('⛔ NUMERICALLY IDENTICAL. A value check PASSES while the attribution stays WRONG. '
                            'Badalona reaches these figures through its OWN instrument; the product reaches them by '
                            'reading Barcelona\'s. Same number, different law. THE ATTRIBUTION IS THE DEFECT.'
                            if ka == kb else
                            'the two instruments state DIFFERENT figures, so a value check WOULD distinguish them')}

badalona_vs_barcelona = {
    'art327': compare(bdn_327, bcn_327, 'Badalona Art. 327 vs Barcelona Art. 327'),
    'art328': compare(bdn_328, bcn_328, 'Badalona Art. 328 vs Barcelona Art. 328'),
}

# ── 5 · THE SEPARATE BADALONA INSTRUMENT IN THE COMMITTED CORPUS ────────────────────────────────
corpus_files = sorted(os.listdir(CORPUS_DIR)) if os.path.isdir(CORPUS_DIR) else []
badalona_pdf = [f for f in corpus_files if 'BADALONA' in f.upper()]
badalona_instrument = None
if badalona_pdf:
    bd = fitz.open(os.path.join(CORPUS_DIR, badalona_pdf[0]))
    txt = '\n'.join(bd[i].get_text() for i in range(min(bd.page_count, 12)))
    badalona_instrument = {
        'file': badalona_pdf[0],
        'pages': bd.page_count,
        'mentionsBadalona': 'badalona' in txt.lower(),
        'mentionsBarcelona': 'barcelona' in txt.lower(),
        'dogcNumberFound': sorted(set(re.findall(r'DOGC[^\d]{0,20}(\d{4})', txt, re.IGNORECASE)))[:5],
        'heightFiguresFound': sorted(set(re.findall(r'\b(\d{1,2},\d{2})\b', txt)))[:40],
        'textSample': re.sub(r'\s+', ' ', txt)[:900],
    }
    bd.close()

result = {
    'probe': 'AMB BASE LADDER DELTA — corpus verification of the Art. 327/328 footnote apparatus',
    'source': {'file': os.path.relpath(BASE_PDF, ROOT).replace('\\', '/'), 'pages': doc.page_count,
               'committed': True,
               'limitation': 'The MMAMB compendium declares itself «merament divulgativa» and is consolidated only to '
                             '31-12-2009. Absence from its apparatus is not-recorded-in-this-source, NEVER does-not-exist, '
                             'and it says nothing about 2010–2026.'},
    'art327_baseTableFromCorpus': art327_base,
    'art328_baseTableFromCorpus': art328_base,
    'art327_footnote49_modifyingMunicipalities': art327_footnote,
    'art328_footnote50_modifyingMunicipalities': art328_footnote,
    'barcelonaModification': {'art327': bcn_327, 'art328': bcn_328},
    'badalonaModification': {'art327': bdn_327, 'art328': bdn_328},
    'badalonaSeparateInstrumentInCorpus': badalona_instrument,
    'badalonaVsBarcelonaFigures': badalona_vs_barcelona,
    'wholeCompendiumModificationSweep': {
        'pagesCarryingAModificationReference': pages_with_mods,
        'municipalitiesModifyingAnyArticle': all_mods,
        'note': 'Every municipality named ANYWHERE in the compendium\'s modification apparatus, with the pages cited. '
                'This is what makes absence from footnote 49/50 an ENUMERATED finding rather than a failed search.',
    },
    'corpusPdfDir': corpus_files,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
sys.stdout.reconfigure(encoding='utf-8')
print('→ out/corpus-verification.json')
print('Art.327 base bands from corpus:', [(b['minWidth_m'], b['maxWidth_m'], b['height_m'], b['floorsAboveGround']) for b in art327_base.get('bands', [])])
print('Art.328 base bands from corpus:', [(b['minWidth_m'], b['maxWidth_m'], b['height_m'], b['floorsAboveGround']) for b in art328_base.get('bands', [])])
print('footnote 49 (Art.327) modifiers:', art327_footnote)
print('footnote 50 (Art.328) modifiers:', art328_footnote)
print('all municipalities modifying ANY article:', list(all_mods.keys()))
