# Córdoba (INE 14021) corpus manifest — CUS + Alineaciones y Rasantes

## Provenance

**Fetch date:** 2026-08-04 (this session).

**Corrected working URL paths (live-verified this session, then bulk-fetched):**

- CUS (Calificación, Usos y Sistemas) sheets:
  `https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/planos/cusw_jpg/CUS{NN}W.JPG`
  where `{NN}` is zero-padded 01–49, uppercase `.JPG`, uppercase `W` suffix (e.g. `CUS01W.JPG`).
- Alineaciones y Rasantes (AR) sheets:
  `https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/planos/PDF_ar/ar{NN}.pdf`
  where `{NN}` is zero-padded 01–49, lowercase. Three sheets (ar10, ar17, ar31) have two JPG preview
  images each (`ar10_1.jpg`/`ar10_2.jpg` etc.) on the site, but each still resolves to ONE combined
  PDF (`ar10.pdf`) — we fetched the combined PDF, so 49 PDFs total, not 52.
- Site navigation index pages (reference only, not fetched into corpus):
  `https://www.gmucordoba.es/planos/calificacion-usos-y-sistemas`
  `https://www.gmucordoba.es/planos/alineaciones-y-rasantes`

**Old path previously checked by this session's own audits, found dead, and wrongly concluded to be
the only path** (retained here for the record — do not re-attempt, this is what produced the false
"41 of 49 dead" and "no alignment layer" findings that this corpus fetch corrects):
The prior audits (`CAPABILITY-AUDIT-2026-08-04.md`, `CLOSURE-REGISTER.md`,
`findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`) did not record the exact dead URL variant
tested, only that "41 of 49 CUS links on the GMU site are dead" and "no alineaciones/rasantes layer
is published anywhere." The corrected paths above are the live ones as of this fetch; the discrepancy
was in URL PATH construction/casing, not in whether the assets exist.

**Fetch method:** WebFetch tool (per-URL), which returns raw binary content saved server-side; that
binary was then copied byte-for-byte into this corpus directory. `curl` direct fetch of these same
URLs returned HTTP 403 (site's WAF rejects non-browser-like requests); WebFetch succeeded on every
one of the 98 URLs attempted.

## Results

**98 of 98 files attempted were obtained and verified on disk.** Zero failures.

- CUS sheets: 49 of 49 obtained. All verified as valid JPEG (magic bytes `FF D8 FF`), sizes ranging
  136,617–515,743 bytes (~137KB–516KB). None are HTML error pages or 0-byte files.
- AR sheets: 49 of 49 obtained. All verified as valid PDF (header `%PDF`), sizes ranging
  103,859–1,303,179 bytes (~102KB–1.27MB). None are HTML error pages or 0-byte files.

Full per-file size listing:

### CUS (`corpus/cus/CUS01W.jpg` … `CUS49W.jpg`)

| File | Bytes | File | Bytes | File | Bytes |
|---|---|---|---|---|---|
| CUS01W.jpg | 261370 | CUS18W.jpg | 447384 | CUS35W.jpg | 461092 |
| CUS02W.jpg | 340935 | CUS19W.jpg | 499576 | CUS36W.jpg | 195875 |
| CUS03W.jpg | 159304 | CUS20W.jpg | 469237 | CUS37W.jpg | 192101 |
| CUS04W.jpg | 281177 | CUS21W.jpg | 419940 | CUS38W.jpg | 136716 |
| CUS05W.jpg | 451266 | CUS22W.jpg | 409520 | CUS39W.jpg | 346317 |
| CUS06W.jpg | 367359 | CUS23W.jpg | 168341 | CUS40W.jpg | 426901 |
| CUS07W.jpg | 268282 | CUS24W.jpg | 344905 | CUS41W.jpg | 461957 |
| CUS08W.jpg | 289901 | CUS25W.jpg | 481662 | CUS42W.jpg | 289426 |
| CUS09W.jpg | 272696 | CUS26W.jpg | 478290 | CUS43W.jpg | 151259 |
| CUS10W.jpg | 482384 | CUS27W.jpg | 467304 | CUS44W.jpg | 312952 |
| CUS11W.jpg | 463977 | CUS28W.jpg | 245165 | CUS45W.jpg | 365349 |
| CUS12W.jpg | 466615 | CUS29W.jpg | 345600 | CUS46W.jpg | 376024 |
| CUS13W.jpg | 346150 | CUS30W.jpg | 219818 | CUS47W.jpg | 136617 |
| CUS14W.jpg | 360102 | CUS31W.jpg | 484836 | CUS48W.jpg | 312498 |
| CUS15W.jpg | 370750 | CUS32W.jpg | 400485 | CUS49W.jpg | 143173 |
| CUS16W.jpg | 187275 | CUS33W.jpg | 465084 | | |
| CUS17W.jpg | 515743 | CUS34W.jpg | 423880 | | |

### Alineaciones y Rasantes (`corpus/alineaciones-rasantes/ar01.pdf` … `ar49.pdf`)

| File | Bytes | File | Bytes | File | Bytes |
|---|---|---|---|---|---|
| ar01.pdf | 637183 | ar18.pdf | 748591 | ar35.pdf | 738318 |
| ar02.pdf | 1025547 | ar19.pdf | 1061749 | ar36.pdf | 216585 |
| ar03.pdf | 273327 | ar20.pdf | 905362 | ar37.pdf | 360277 |
| ar04.pdf | 1008956 | ar21.pdf | 693815 | ar38.pdf | 103859 |
| ar05.pdf | 1303179 | ar22.pdf | 686022 | ar39.pdf | 494158 |
| ar06.pdf | 567337 | ar23.pdf | 250077 | ar40.pdf | 809212 |
| ar07.pdf | 805788 | ar24.pdf | 583511 | ar41.pdf | 1217456 |
| ar08.pdf | 554299 | ar25.pdf | 871087 | ar42.pdf | 487687 |
| ar09.pdf | 521316 | ar26.pdf | 1189164 | ar43.pdf | 108381 |
| ar10.pdf | 1295840 | ar27.pdf | 926573 | ar44.pdf | 538750 |
| ar11.pdf | 1124318 | ar28.pdf | 419564 | ar45.pdf | 540116 |
| ar12.pdf | 1220988 | ar29.pdf | 527458 | ar46.pdf | 806277 |
| ar13.pdf | 1081000 | ar30.pdf | 243240 | ar47.pdf | 135793 |
| ar14.pdf | 682497 | ar31.pdf | 722651 | ar48.pdf | 474984 |
| ar15.pdf | 697122 | ar32.pdf | 618694 | ar49.pdf | 124845 |
| ar16.pdf | 270059 | ar33.pdf | 884828 | | |
| ar17.pdf | 615516 | ar34.pdf | 990138 | | |

## Notes / caveats

- One AR PDF (`ar38.pdf`, an AutoCAD-derived drawing "ali38.dwg Model") carries metadata identifying
  it as a technical drawing created 2013-07-08 via Acrobat Distiller 8.0.0 — consistent with a real
  survey/CAD-sourced alignment sheet, not a placeholder.
- The founder independently held local copies of `ar01`–`ar11.pdf` and `ar26.pdf` obtained from this
  same source prior to this fetch; those pre-existing copies were not diffed byte-for-byte against
  this fetch, but their prior existence corroborates the URL pattern.
- **Scope of this manifest:** acquisition and provenance only. Georeferencing, vectorization, OCR/
  text extraction, and wiring into `packages/site-parcel-data` are explicitly NOT done here — see
  the task boundary noted in the corrected documents below.
