#!/usr/bin/env python3
"""§SIG-M1-REVIEW — build the targeted human-review artefact for `esMadridPgoum97.ts`.

WHY THIS IS NOT A UNIFORM SAMPLE
--------------------------------
Aggregate QC on this pack already passes: §MADRID-QUOTE-CONCORDANCE re-read all 1,321 verbatim
strings against the filed Compendio and found 0 fabricated and 0 mis-paged. A uniform sample would
therefore only re-confirm a thing already measured, and would tell the signer nothing.

The founder named FOUR residual risks as *structural rather than statistical* — precisely the class
aggregate QC cannot see. So this tool deliberately OVER-SAMPLES them:

  R1 segmentation   legal meaning spanning multiple paragraphs, where the number is transcribed
                    correctly but its governing clause sits in a paragraph the record did not carry.
  R2 unmodelled     text present in the ordinance with no field in the structured model to hold it
                    («salvo», «excepto», «siempre que», «no obstante», «podrá», «excepcional»).
  R3 normalization  punctuation/formatting altered in a way that can change reading — a synthesised
                    table row, a Spanish decimal comma, an elision marker.
  R4 divergence     the cited article carries an amendment footnote in the filed edition, so a later
                    Compendio can move it. NOT sampleable — handled by a supersession TRIGGER.

Usage: python build_sig_m1_review.py [outdir]
"""
import hashlib
import json
import pathlib
import re
import sys
import unicodedata

import fitz

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/04-reference/jurisdictions/es/es-md/28079-madrid'
PDF = BASE / 'corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf'

# The 23 zone codes the pack actually SHIPS (esMadridPgoum97.ts MADRID_PGOUM97_ZONE_CODES).
SHIPPED = ['4', '5.1', '5.2', '5.3', '7.1.a', '7.1.b', '7.2.e', '8.1.a', '8.1.c', '8.2.a',
           '8.2.b', '8.2.c', '8.3.a', '8.3.c', '8.4', '8.5', '8.6',
           '9.1', '9.2', '9.3', '9.4.a', '9.4.b', '9.5']

COND = re.compile(r'\b(salvo|excepto|no obstante|siempre que|en su caso|podr[áa]n?|excepcional|'
                  r'cuando proceda|a estos efectos)\b', re.I)
AMEND = re.compile(r'modificad[oa] por (?:la MPG|el PE|:)', re.I)


def norm(s):
    s = unicodedata.normalize('NFC', s).replace('­', '')
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'),
                 ('–', '-'), ('—', '-')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def load_records():
    recs = []
    for f in sorted((BASE / 'extracted').glob('nz*.json')):
        if 'refusal' in f.name or 'probe' in f.name or 'sweep' in f.name:
            continue
        data = json.loads(f.read_text(encoding='utf-8'))
        for r in data.get('records', []):
            src = r.get('source') or {}
            recs.append({
                'file': f.name, 'zone': r.get('zoneCode'), 'param': r.get('parameter'),
                'value': r.get('value'), 'unit': r.get('unit'),
                'articulo': src.get('articulo'), 'apartado': src.get('apartado'),
                'pdfPage': src.get('pdfPage'), 'printedPage': src.get('printedPage'),
                'verbatim': src.get('verbatim') or '',
                'extractedFrom': r.get('extractedFrom'),
                'measurement': r.get('measurement'),
                'denominatorScope': r.get('denominatorScope'),
            })
    return recs


def main():
    outdir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else (BASE / 'extracted')
    doc = fitz.open(PDF)
    pages = [norm(p.get_text()) for p in doc]
    sha = hashlib.sha256(PDF.read_bytes()).hexdigest().upper()

    recs = load_records()
    for r in recs:
        v = norm(r['verbatim'])
        pg = r['pdfPage']
        page_txt = pages[pg - 1] if isinstance(pg, int) and 1 <= pg <= len(pages) else ''
        risks = []
        if len(v) > 240 or v.count('. ') >= 3:
            risks.append('R1')
        if COND.search(v):
            risks.append('R2')
        if ' | ' in v or re.search(r'\d,\d', v) or '…' in v or '[...]' in v:
            risks.append('R3')
        if AMEND.search(page_txt):
            risks.append('R4')
        r['risks'] = risks
        r['onPage'] = bool(v) and v in page_txt

    shipped = [r for r in recs if r['zone'] in SHIPPED]
    # Over-sample: EVERY record carrying R1/R2/R3 (the sampleable classes), plus one clean
    # record per zone for contrast. R4 is a trigger, not a sample.
    sample = [r for r in shipped if {'R1', 'R2', 'R3'} & set(r['risks'])]
    for z in SHIPPED:
        clean = [r for r in shipped if r['zone'] == z and not ({'R1', 'R2', 'R3'} & set(r['risks']))]
        sample.extend(clean[:1])
    sample.sort(key=lambda r: (SHIPPED.index(r['zone']) if r['zone'] in SHIPPED else 99,
                               str(r['articulo']), str(r['param'])))

    # ── R4 supersession TRIGGER: the amendment footnotes as they stand in the filed edition ──
    cited_articles = sorted({r['articulo'] for r in shipped if r['articulo']})
    trigger = {'corpusSha256': sha, 'corpusPages': len(pages),
               'corpusTitleMeta': doc.metadata.get('title'), 'articles': {}}
    for art in cited_articles:
        pgs = sorted({r['pdfPage'] for r in shipped
                      if r['articulo'] == art and isinstance(r['pdfPage'], int)})
        notes = []
        for pg in pgs:
            for m in re.finditer(r'(?:MPG|PE)\s*\d+/\d+\s*\(aprobaci[óo]n definitiva\s*'
                                 r'[\d.]+\s*BOCM\s*[\d.]+\)', pages[pg - 1]):
                notes.append(m.group(0))
        trigger['articles'][art] = {'pages': pgs, 'amendments': sorted(set(notes))}

    summary = {
        'packRecordsTotal': len(recs),
        'shippedZoneRecords': len(shipped),
        'shippedZones': len(SHIPPED),
        'sampled': len(sample),
        'coverageOfShippedPct': round(100.0 * len(sample) / len(shipped), 1) if shipped else 0,
        'byRisk': {k: sum(1 for r in shipped if k in r['risks']) for k in ('R1', 'R2', 'R3', 'R4')},
        'notOnCitedPage': sum(1 for r in shipped if not r['onPage']),
        'articlesWithAmendments': sum(1 for a in trigger['articles'].values() if a['amendments']),
        'articlesCited': len(cited_articles),
    }
    (outdir / 'sig-m1-review-sample.json').write_text(
        json.dumps({'summary': summary, 'sample': sample, 'supersessionTrigger': trigger},
                   indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
