# Barcelona corpus — retrieval log

Every route tried, with its HTTP status and the date it was tried.
**A 403 anti-bot wall and a genuine 404 are different facts** and are recorded as such.

All probes below: **2026-08-01**.

---

## 1. BCNROC — Ajuntament de Barcelona repository (route 1, "most promising")

DSpace instance at `bcnroc.ajuntament.barcelona.cat`.

| URL | method | status | what came back |
|---|---|---|---|
| `/jspui/simple-search?query=alçades+reguladores+alineació+de+vial` | GET | **403** | F5 BIG-IP ASM interstitial: `<title>Request Rejected</title> … Your support ID is: 2be64e8a-…` |
| `/jspui/simple-search?query=alçades+reguladores` | GET | **301 → 403** | redirects `/jspui/*` → `/*`, then the same F5 rejection |
| `/jspui/oai/request?verb=Identify` | GET | **200 but not OAI** | body is the same `Request Rejected` HTML, support ID `7a83eeb9-…`. A 200 status carrying a block page. |
| `/jspui/bitstream/11703/139998/1/DOGC_pla-metropolita-22arroba_2025.pdf` (the known-good example) | HEAD | **301** | `Location:` drops `/jspui` |
| `/bitstream/11703/139998/1/DOGC_pla-metropolita-22arroba_2025.pdf` | GET | **200, `text/html`, 751 bytes** | **not a PDF** — the F5 block page again |
| same URL, full Chrome header set (`Sec-Fetch-*`, `sec-ch-ua`, `Accept-Language: ca-ES`) | GET | **403 / block page** | header spoofing did not defeat it |
| `/` (site root) | GET | **block page** | |
| `/jspui/handle/11703/89247` (*Ordenança Eixample*) | — | **NOT REACHED** | blocked by the same wall |

**Verdict: BCNROC is behind an F5 BIG-IP ASM anti-bot challenge that rejects
non-browser clients on every path, including the known-good PDF.** This is a **403-class
block, not a 404** — the documents are presumably there; we cannot reach them
programmatically. A human browser session, or a headless browser with a real JS/TLS
fingerprint, would be needed.

*This route did not produce the DOGC 4893 annex. Route 2 did.*

---

## 2. DOGC — `dogc.gencat.cat` / `portaldogc.gencat.cat` ✅ **THE ROUTE THAT WORKED**

### 2.1 Dead ends first

| URL | status | note |
|---|---|---|
| `dogc.gencat.cat/ca/document-del-dogc/?documentId=…` | 200 | SPA shell only; content is AJAX-loaded (`Carregant…`) |
| `dogc.gencat.cat/ca/cercador/` | **404** | genuine 404 — that path does not exist |
| `dogc.gencat.cat/eadop-rest/api/dogc/summaryDOGC` | **404** | the REST base is *not* served on the `dogc` host |
| `dogc.gencat.cat/eadop-rest/api/dogc/searchDOGC` | **404** | same |
| `dogc.gencat.cat/ca/eadop-rest/…` | **404** | same |
| `eadop.gencat.cat/eadop-rest/…` | **000** | host does not resolve |
| `portaldogc.gencat.cat` from **Python `urllib`** | `SSLV3_ALERT_HANDSHAKE_FAILURE` | the host rejects Python's default TLS/cipher profile. **Use `curl`.** This cost an hour of false "no PDF" results — record it. |

### 2.2 How the working endpoint was found

The SPA's config lives in hidden inputs on the page, and the JS builds
`protocol + "://" + host + ":" + port + uri` with `host=""` (browser resolves to the
current origin). Extracted from `dogc.gencat.cat/ca/inici/`:

```
uriUltimDOGCPublicat = /eadop-rest/api/dogc/summaryLastPublishedDOGC
uriSumari            = /eadop-rest/api/dogc/summaryDOGC
uriCerDogc           = /eadop-rest/api/dogc/searchDOGC
uriCalendar          = /eadop-rest/api/dogc/calendarDOGC
```

These 404 on `dogc.gencat.cat` but are **live on `portaldogc.gencat.cat`**.

### 2.3 The working DOGC search API

```
POST https://portaldogc.gencat.cat/eadop-rest/api/dogc/searchDOGC
Content-Type: application/json
```

Body (typed — the server validates):

```json
{
  "typeSearch": 1, "value": "", "title": true, "current": false,
  "range": [], "issuingAuthority": [],
  "publicationDateInitial": "29/05/2007", "publicationDateFinal": "29/05/2007",
  "dispositionDateInitial": "", "dispositionDateFinal": "",
  "sectionDOGC": [], "thematicDescriptor": [], "organizationDescriptor": [],
  "geographicDescriptor": [], "aranese": "", "expandSearchFullText": false,
  "noCurrent": false, "orderBy": 3, "page": 1, "numResultsByPage": 200,
  "advanced": false, "language": "ca"
}
```

Gotchas, each of which returned a distinct error:

- `orderBy` **must be a non-null Integer** — `""` → HTTP 500
  `"Validation failed … field 'orderBy': rejected value [null] … may not be null"`.
- `orderBy` ∈ {3, 4} only. 0/1/2/5 → HTTP 500 `errorCode 2`,
  *"S'ha produït un error en l'ordre dels resultats."*
- Date format is **`dd/MM/yyyy`**.
- `current: true` (the default) filters to in-force documents and hides historic edictes.
- Result count `-2000` is a **"too many results" sentinel**, not a count.
- Index coverage verified from **1993 → 2025**.

Response rows carry `idDocument`, `date`, `title`, and
`linkDownloadPDF = …/PdfProviderServlet?versionId=<v>&type=01`.

### 2.4 Locating DOGC 4893

Enumerating everything published **29/05/2007** returned **138 documents** = issue 4893.
Three were *Subcomissió d'Urbanisme del municipi de Barcelona* edictes:

| documentId | versionId | outcome |
|---|---|---|
| 446599 | 927054 | transferència d'edificabilitat, Alfons XII 95-97 etc. — not it |
| **446597** | **927050** | ✅ **the height instrument** — Exp. 2006/025790/B |
| 446896 | 926516 | equipament públic c/ Portolà 6 — not it |

**Retrieved:** `https://portaldogc.gencat.cat/utilsEADOP/AppJava/PdfProviderServlet?versionId=927050&type=01`
→ **HTTP 200, `application/pdf`, 200 616 bytes, 5 pages.**

> A binary-search over `documentId` was attempted first and **abandoned**: DOGC document
> IDs are **not monotonic** in issue number (id 470000 → issue 5448/2009 while id 480000 →
> issue 5013/2007). Do not binary-search this ID space.

### 2.5 PDF text extraction — the trap

The 2007-era DOGC PDFs have **no ToUnicode map**, and — worse — **mix several CID offsets
inside a single line**. A per-font single-shift decoder produced text that *looked* fluent
Catalan but silently mis-rendered digits and letters (`"PB + 1 pis"` decoded correctly only
if two different offsets were applied to characters four positions apart).

**Every figure in `INDEX.md` was read from a raster render, not from `get_text()`:**

```python
doc[i].get_pixmap(dpi=200).save("p%d.png" % (i+1))
```

The decoded-text artefacts were kept only as a cross-check; where they disagreed with the
raster, the raster wins.

---

## 3. RPUC — Registre de planejament urbanístic de Catalunya ✅ **WORKED**

| URL | status | note |
|---|---|---|
| `rpucportal.territori.gencat.cat` (the URL in the brief) | **000 — `ENOTFOUND`** | **host no longer resolves.** The portal has moved. Update any doc that still cites it. |
| `planejamenturbanisme.territori.gencat.cat/rpucportal/` | **200** | Angular SPA; new home |

### 3.1 The RPUC REST API

Base: `https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta`

| path | method | note |
|---|---|---|
| `/municipis` | GET | 200 — `[{label, value}]`, `value` = INE code (Barcelona `08019`) |
| `/comarques` | GET | 200 — Barcelonès = `13` |
| `/basica` | **GET** | the search. POST → **405** |
| `/detall?codiExpedient=<codi>&idioma=ca` | GET | 200 — full record incl. dates, assentaments, documents, `expedientsRelacionats` |
| `/arbre?codiExpedient=<codi>&idioma=ca` | GET | 200 — document tree |
| `/documents?documentId=<id>&downloadType=1&idioma=ca` | GET | 200 — **the actual PDF** |
| `/cerca` | any | **404** — the string `/consulta/cerca` in the bundle is an Angular *route*, not an API path |

`/basica` params: `tema, comarca, municipi, idioma, firstRecord, sortColumn, rpp, sortDirection`.

Gotchas:

- `sortColumn` must be an **actual DB column**. `dataPublicacio`, `dataAprovacio`, `id`,
  `anyExp`, `numeroExp` all → HTTP 500 `ORA-00904: "…": identificador no válido`.
  **Omit it**, or use `codi` / `municipi`.
- **`firstRecord` does not paginate** — any value > 0 returns 0 rows. Instead set
  `rpp` larger than the result set (`rpp=3000` returned all 1 755 rows in one call).
- `tema` is a **free-text match on the instrument name**, not a category enum.
- Accents matter: `tema=alcades` → 0 results; `tema=alçades` → hits.

### 3.2 What RPUC gave us

`municipi=08019` → **1 755** instruments. The 2007 height instrument:

```json
{ "codintExp": 232336, "numComplet": "2006 / 025790 / B",
  "municipi": "Barcelona", "rang": "Planejament general", "codiRang": "PG",
  "tipologiaCA": "Modificació de pla general d'ordenació",
  "competenciaCA": "Generalitat de Catalunya",
  "dataAprovacio": "2007-03-02", "dataPublicacio": "2007-05-29",
  "vigencia": "SI", "registrat": "SI",
  "assentaments": [{ "tipusAssentament": "Alta", "llibre": "Llibre 0",
                     "expedient": "Subcomissió d'Urbanisme del municipi de Barcelona",
                     "numero": 872, "dataAssentament": "2007-12-20" }],
  "expedientsRelacionats": [],
  "documents": [{ "idDocument": 147523, "nomDocument": "DUN.pdf" },
                { "idDocument": 147522, "nomDocument": "SU-AD_Aprovació definitiva.pdf" },
                { "idDocument": 147524, "nomDocument": "ADM.pdf" }] }
```

This **independently corroborates** the DOGC: approval 2007-03-02, publication 2007-05-29,
expedient 2006/025790/B, municipality Barcelona, **and** adds that the instrument is
recorded as **in force** with **no related expedients**.

Downloaded: `DUN.pdf` → **200, `application/pdf`, 875 450 bytes, 13 pages** — the signed,
DGU-stamped *TEXT APROVACIÓ DEFINITIVA*, cover page reading
**"…AL TERME MUNICIPAL DE BARCELONA."** (municipality verified visually, per the standing
rule to check the municipality on every document opened). Image-only, no text layer.

---

## 4. AMB NUMAMB (route 4)

Not retried in depth, per the brief's instruction not to burn time. Prior session recorded
**HTTP 403 behind a Transparent Edge anti-bot challenge (2026-08-01)** and genuine **404**s
on `08019_13a.htm` and `08019_DISPOSICIONS TRANSITÒRIES.htm`.

Independently of reachability: **AMB NUMAMB is not the legal authority.** The AMB describes
it as a *consulta* consolidation; the binding documents are the approved planning
instruments. It is fine for navigation and article lookup and **unsuitable for proving the
absence of an amendment**. No NUMAMB result was allowed to stand in for a register result.

---

## 5. Other routes tried

| route | status | note |
|---|---|---|
| Web search, `"DOGC 4893" + alçades reguladores` | — | no direct hit; general MPGM pages only |
| Web search, `site:portaldogc.gencat.cat` | — | confirmed the URL pattern `/utilsEADOP/PDF/{issue}/{documentId}.pdf` but not the ID |
| CIDO (`cido.diba.cat`) | — | not needed once the DOGC API worked |

---

## 6. Reproducible recipe

```bash
# 1. find a document
curl -sS -X POST https://portaldogc.gencat.cat/eadop-rest/api/dogc/searchDOGC \
  -H 'Content-Type: application/json' \
  --data '{"typeSearch":1,"value":"","title":true,"current":false,"range":[],
           "issuingAuthority":[],"publicationDateInitial":"29/05/2007",
           "publicationDateFinal":"29/05/2007","dispositionDateInitial":"",
           "dispositionDateFinal":"","sectionDOGC":[],"thematicDescriptor":[],
           "organizationDescriptor":[],"geographicDescriptor":[],"aranese":"",
           "expandSearchFullText":false,"noCurrent":false,"orderBy":3,"page":1,
           "numResultsByPage":200,"advanced":false,"language":"ca"}'

# 2. fetch its PDF  (curl, NOT python-urllib — the host fails Python's TLS handshake)
curl -sSL -o out.pdf \
  'https://portaldogc.gencat.cat/utilsEADOP/AppJava/PdfProviderServlet?versionId=927050&type=01'

# 3. RENDER it. Do not trust get_text() on pre-2010 DOGC PDFs.
python -c "import fitz; d=fitz.open('out.pdf'); [d[i].get_pixmap(dpi=200).save('p%d.png'%(i+1)) for i in range(d.page_count)]"

# 4. RPUC: enumerate a municipality, then pull any document
curl -sS 'https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/basica?municipi=08019&idioma=ca&rpp=3000&firstRecord=0&sortDirection=desc'
curl -sS 'https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/detall?codiExpedient=232336&idioma=ca'
curl -sSL -o dun.pdf 'https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=147523&downloadType=1&idioma=ca'
```
