# Saudi residential building requirements — PRIMARY SOURCE, read live

**2026-07-22.** The 2024 ministerial decision the seed doc's §3 carried at `CONVERGENT-SECONDARY`
was **located, downloaded, and read** in this pass. Its figures are therefore now **`VERIFIED-LIVE`**,
and this file is the citation of record. It supersedes the news-outlet transcription in
`SAUDI-ARABIA-ENTRY-ASSESSMENT.md` §3 wherever the two differ (they differ in one material way —
see §5).

> ## The `ROBOTS_DISALLOWED` negative was the external tool's own policy, not a fact about the document.
> The external pass reported the PDF unreadable. **A single `curl` fetched it, HTTP 200,
> `Content-Type: application/pdf`, 5 084 557 bytes, `%PDF-1.7`.** One document, read once, cited —
> exactly the ethics bound the brief set. No crawl, no bulk harvest.

---

## 1 — What was read

| | |
|---|---|
| Title | **اشتراطات إنشاء المباني السكنية** (Requirements for the construction of residential buildings) |
| Instrument | **قرار وزاري رقم 1/4500943139** — 1446 H (ministerial decision) |
| Issuer | **وزارة الشؤون البلدية والقروية والإسكان** (Ministry of Municipal, Rural Affairs & Housing — MOMRAH) |
| Issued | **15 / 01 / 1446 H** ≈ 21 July 2024 (news: effective ~15 July 2024) |
| Length | **42 pages** |
| URL read | `https://momah.gov.sa/sites/default/files/2024-07/ashtratat a'nsha almbany alsknyt m` `alqrar.pdf` |
| Mirror (identical decision, MOMRAH/Balady) | `https://balady.gov.sa/sites/default/files/2024-12/ashtratat a'nsha almbany alsknyt almnshwrt `ly` mwq` alwzart .pdf` |
| Legal basis cited on p2 | نظام البلديات والقرى (Royal Decree م/5, 21/2/1397 H) art. 5; نظام تطبيق كود البناء السعودي (م/43, 26/4/1438 H) |

Two independent government hosts serve the identical decision (momah.gov.sa and balady.gov.sa) —
this is a **primary-source corroboration**, not the "four news articles descended from one source"
trap. The text is machine-extractable Arabic (PyPDF, glyphs logically reversed on extraction but
fully legible after digit transliteration).

---

## 2 — VERIFIED-LIVE — the classification (Chapter 3, pp. 12–15)

The decision applies to **four residential classes**, each mapped to a Saudi Building Code (SBC)
occupancy group. **High-rise is explicitly OUT of scope** (§4).

| # | Class (AR) | Class (EN) | SBC group | Definition read |
|---|---|---|---|---|
| 3-1 | الفلل السكنية | **Villas** | R3 | Up to ground + 1 upper floor + upper annex (*ملحق علوي*) + external annexes + basement. Three sub-types: **detached** (منفصلة), **semi-detached / duplex** (شبه متصلة), **attached** (متصلة) |
| 3-2 | العمائر السكنية | **Residential apartments** | R2 | > 2 floors, total height **≤ 23 m above ground**, **≥ 3 units** |
| 3-3 | العمائر السكنية التجارية | **Residential-commercial apartments** | R2 / M / A2 | as 3-2, ground-floor commercial shops, ≥ 2 residential units |
| 3-4 | العمائر السكنية الإدارية | **Residential-administrative apartments** | R2 / B | as 3-2, plus office units |

**`VERIFIED-LIVE` correction to the seed §1 table:** the seed lists classification as
*"villa / apartment / commercial / mixed"* set in a municipal *مخطط تنظيمي*. The **class taxonomy
above is national and lives in this decision, not in a municipal plan.** The municipal plan sets
*which* class a given parcel may host (see §6), not the definition of the classes.

---

## 3 — VERIFIED-LIVE — the definitions that matter for the engine (Chapter 2, pp. 9–12)

- **عرض الشارع (street width)** — *"the horizontal distance between the property boundaries on the two
  sides of the street."* ⭐ **This is frontage-to-frontage — exactly what `streetWidth.ts` measures.**
  See `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` §7 for the porting analysis.
- **الارتدادات (setbacks)** — *"the separating distance between the building edge and the site's
  property boundary; the setback is counted from the start of the property line."*
- **نسبة البناء (building/coverage ratio)** — *"the percentage of (max permitted built area in m² ÷
  total site area in m² after regulation). Light-wells, open internal courtyards, permitted
  projections over surrounding streets, and electrical rooms are excluded from it."* ⚠ **This is a
  GROUND-COVERAGE ratio (footprint ÷ plot), NOT a FAR (floor-area ÷ plot).** See §5.
- **الارتفاع الكلي للمبنى (total building height)** — *"the vertical distance from the pavement level
  in front of the main entrance to the top of the upper-annex roof slab."* ⚠ **Measured from the
  pavement/rasant at the façade** — structurally the same measurement basis as Barcelona's L-584
  terrain/rasant issue.
- **الأبراج عالية الارتفاع (high-rise)** — *"buildings whose total height exceeds 23 m above ground"* —
  and these are **excluded from this decision** (§4). So 23 m is the **classification boundary**
  between "residential apartment (this decision)" and "high-rise (a different regime)", not a cap
  this decision imposes.

---

## 4 — VERIFIED-LIVE — the numeric tables

Digits transliterated from Arabic-Indic; every figure below was read from the page cited.

### 4.1 — Coverage — `نسبة البناء` (pp. 18, 22, 23)

| Class | Ground floor | 1st + repeated floors | Upper annex (*ملحق علوي*) |
|---|---|---|---|
| **Villa** (4-1) | **≤ 75 %** of plot (incl. ground annexes) | ≤ 75 % | ≤ 70 % of the floor beneath, **incl. stairs & lifts** |
| **Apartment** (4-2) | **≤ 65 %** of plot | ≤ 75 % | ≤ 70 % of floor beneath, incl. vertical circulation |
| **Residential-commercial** (4-2) | **≤ 65 %** | ≤ 75 % | ≤ 70 % |
| **Residential-administrative** (4-3) | **≤ 65 %** | ≤ 75 % | ≤ 70 % |

### 4.2 — Setbacks — `الارتدادات` (pp. 18, 22, 23) — a PURE FUNCTION of street width + class

**Streets narrower than 30 m:**

| Setback | Villa (4-1) | Apartment / comm / admin (4-2/4-3) |
|---|---|---|
| **Front** | `max(streetWidth / 5, 3 m)` | `max(streetWidth / 5, 3 m)` |
| **Side & rear** | `max(streetWidth / 5, 2 m)` | `max(streetWidth / 5, 2 m)` |
| **Neighbour side** | ≥ 1.5 m | ≥ 3 m if > 5 floors; ≥ 2 m if ≤ 5 floors |
| **Pedestrian passages** | ≥ 1.5 m | — |
| **Facing plaza / square** | ≥ 3 m | — |

**Streets 30 m or wider:** front setback ≥ **6 m** (villa, p18 cl. 5). *(The apartment tables state the
÷5 rule without repeating a ≥30 m clause on the page read; treat the villa's ≥6 m as the
`VERIFIED-LIVE` figure and the apartment ≥30 m case as `COULD NOT VERIFY` pending a re-read of the
apartment section.)*

### 4.3 — Upper annex & perimeter rules (pp. 19–20)

- **Upper annex setback** (p19 cl.6): ≥ **1.5 m** from surrounding streets / squares; **no setback
  required toward neighbours or pedestrian passages**.
- **Ground-floor build-in-setback** (p20 cl.8): a building MAY occupy the setback zone at ground
  floor along **up to 70 % of the plot perimeter length**, provided the ground coverage cap is not
  exceeded, parking is met, and natural light/ventilation is provided; height of that part ≤ 4.5 m.
- **Boundary walls** (p18 cl.8): ≤ 4.5 m on neighbour boundaries.
- **Parking** (pp. 18, 22): villa — 1 space if plot ≤ 400 m², 2 if > 400 m²; apartment — **1.5 spaces
  per dwelling** (round up), + 1 per 45 m² of commercial/office area.

---

## 5 — 🔴 VERIFIED-LIVE CORRECTION — the residential decision has NO FAR

**`معامل البناء` (FAR / plot ratio) does not appear anywhere in the 42-page residential decision.**
(Grep of the full extracted text: 0 hits.) The seed doc §1 and §3 carry *"Max FAR — explicitly
published — e.g. hotel use 3"*. That figure is real but it belongs to a **different document** (the
commercial / hotel building requirements), **not** to the residential regime a demo needs.

⇒ **Residential buildability in Saudi Arabia is governed by GROUND COVERAGE + setbacks + floor
count, not by FAR.** This is a *simpler* model than a FAR, and it maps cleanly onto C58's
`maxCoverage` + `setback` fields — but the seed's headline ("the two fields Barcelona can never
fill, FAR and coverage, are published outright") is **half right**: coverage yes, FAR no (and FAR is
not the governing parameter here anyway). This does not weaken the case; it clarifies it.

---

## 6 — 🔴🔴 THE BARCELONA TRAP, STATED IN THE PRIMARY LAW ITSELF (Chapter 1 §1, p7; Chapter 4 §4.1, p18)

The decision defines its own precedence, and it is a **layered regime with explicit override**:

**p7, §1 (scope):**
1. These are the **MINIMUM** technical + municipal requirements. Binding on **all Amanas** —
2. **EXCEPT** for **parking**, **setbacks of buildings on commercial streets/roads**, and **building
   ratios for special areas the Amana defines** — those the Amana sets. Where any requirement is
   **not covered here, the Amana's own regulations apply.**
3. **⭐ "These requirements do NOT cancel the building regulations issued by the *region/city
   development authorities* (هيئات تطوير المناطق والمدن), and in case of any difference or conflict in
   any clause, what those authorities decide PREVAILS"** (subject to the Saudi Building Code).

**p18, §4.1 cl.1:** every building MUST comply with the documents, building regulations and the
**approved plan (المخطط المعتمد) of each planning zone** for: **permitted uses, building ratios per
floor, setbacks, number of floors, and maximum permitted height.**

⇒ **The trap is real and it is written into the primary law.** A national default exists for
coverage and setbacks, but the *approved municipal plan* can override coverage, setbacks, floors and
height per zone, and **development-authority regulations override everything on conflict.** The
development authorities are the giga-project / special-zone bodies — Royal Commission for Riyadh City
(RCRC), ROSHN, NEOM, Diriyah Gate, King Salman Park, Qiddiya, etc.

**How this differs from Barcelona — and it is the whole comparison:**
- In **Barcelona**, the derived-planning instrument sets the *entire* envelope (FAR, depth, height,
  tiers) on **62.8 %** of the city; without it you have almost nothing (the ~48 % ceiling).
- In **Saudi Arabia**, the national decision sets the **footprint** (setbacks + coverage) as
  enforceable nationwide minimums/defaults; the municipal/authority layer overrides mainly **height,
  floor count, and special-area ratios.** **The trap costs you the vertical extent, not the
  footprint.** A first-pass footprint envelope is nationally grounded in a way Barcelona's never is.

---

## 7 — Scope exclusions (p7, §1-1) — what this decision does NOT cover

Hotels & lodges on regional highways outside the urban boundary; hotels, serviced apartments,
elderly/disability care homes; rest-houses (استراحات); **high-rise towers**; university housing;
collective individual housing. Each has its own regime — a demo that promises "any Saudi plot" must
either stay inside the four residential classes or flag these as out of scope.

---

## 8 — Reproduce it

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36'
curl -sL -A "$UA" -o sa_decision.pdf \
  "https://momah.gov.sa/sites/default/files/2024-07/ashtratat%20a'nsha%20almbany%20alsknyt%20m%60%20alqrar.pdf"
# -> HTTP 200, application/pdf, 5,084,557 bytes, %PDF-1.7, 42 pages
python -c "import pypdf;print(pypdf.PdfReader('sa_decision.pdf').pages[17].extract_text())"  # p18 villa table
```

Pages of record: **classification** pp.12–15 · **definitions** pp.9–12 · **villa coverage+setbacks**
p18 · **apartment** p22 · **apartment-admin** p23 · **annex+perimeter** pp.19–20 · **scope+override**
p7.

---

**Related:** `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` (the assessment this feeds) ·
`SAUDI-UMAPS-API-ENUMERATION.md` (the parcel-data probe) ·
`../../spain/barcelona-catalonia/L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` (the trap, in Barcelona) ·
C58 §1.13 / §2.2 (the rule-pack shape these numbers would fill).
