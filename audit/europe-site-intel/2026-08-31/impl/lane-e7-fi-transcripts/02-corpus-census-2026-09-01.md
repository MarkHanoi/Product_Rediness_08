# E7-FI · TRANSCRIPT 02 — THE FULL-CORPUS CENSUS, 2026-09-01

The corpus: **all 5,635** features of `pub_valid_ld_plan_ix_gs` (paged with `startIndex`
0 / 2000 / 4000) plus **all 647** of `pub_valid_lm_plan_ix_gs` = **6,282 valid-plan features**.
Every number in `lane-e7-fi.md` and every measurement quoted in a source comment comes from here.

---

## §1 — THE 33 SERVED FIELDS, AND WHAT IS IN THEM

### `pub_valid_ld_plan_ix_gs` — n = 5,635, field count 33

```
  administrative_area_identifiers            null=    0 empty=    0  distinct=36 top3: ["297"]×1053 | ["491"]×775 | ["915"]×450
  approval_date                              null= 1123 empty=    0  distinct=2671 top3: 1900-01-01Z×302 | 2015-09-28Z×9 | 1980-12-08Z×9
  case_identifiers                           null=    0 empty= 5635  []×5635
  date_of_validity                           null=    0 empty=    0  distinct=498 top3: 1900-01-01Z×5045 | 1989-10-03Z×5 | 1973-04-28Z×4
  description_eng/sme/smn/sms/swe            null= 5635 (all five)
  description_fin                            null= 1025 empty=    0  distinct=2323 top3: Geometrian lähde: kunta.×1570 | Aluerajaus ja asiakirjat kunnalta×704
  digital_origin                             null=    0 empty=    0  code/04×5630 | code/01×3 | code/0401×1 | code/02×1
  documents                                  null=  797 empty=    0  distinct=4838
  id                                         null=    0  distinct=5635
  name_eng/sme/smn/sms/swe                   null= 5635 (all five)
  name_fin                                   null=    0 empty=    0  distinct=5455
  original_administrative_area_identifiers   null=    0 empty=    0  distinct=37
  period_of_validity_begin                   null=    0 empty=    0  distinct=1755 top3: 1900-01-01Z×3410 | 1991-02-22Z×5 | 1989-06-30Z×5
  period_of_validity_end                     null= 5635 empty=    0
  permanent_binding_plot_division_identifier null= 1017 empty= 4618  [null]×4611 | []×7
  permanent_plan_identifier                  null=    0  distinct=5635
  plan_key                                   null=    0  distinct=5635
  plan_life_cycle_status                     null=    0  kaavaelinkaari/code/13 × 5635  (100%)
  plan_life_cycle_status_code_value          null=    0  13×5635
  plan_type                                  null=    0  code/31×4161 | code/33×831 | code/39×643
  plan_type_code_value                       null=    0  31×4161 | 33×831 | 39×643
  plan_type_name_fin                         null=    0  Asemakaava×4161 | Ranta-asemakaava×831 | Asemakaava (ohjeellinen tonttijako)×643
  producer_plan_identifier                   null=  591 empty=    3  distinct=3636
  record_numbers                             null=    0 empty= 5635  []×5635
  time_of_initiation                         null=    0 empty=    0  distinct=209 top3: 1900-01-01Z×5391 | 2000-11-01Z×3 | 2020-12-15Z×3
```

### `pub_valid_lm_plan_ix_gs` — n = 647, field count 33

Same schema minus `permanent_binding_plot_division_identifier`, plus:

```
  legal_effect_of_local_master_plan  null=0  ["http://uri.suomi.fi/codelist/rytj/oikeusvaik_YK/code/1"] × 647  (100%)
  digital_origin                     null=0  code/04×638 | code/0401×9      (ZERO code/01)
  plan_type                          null=0  code/23×520 (Osayleiskaava) | code/21×127 (Yleiskaava)
  approval_date                      null=20
  period_of_validity_end             null=647
```

⚠ **TEST DATA IN PRODUCTION (1 feature).** In the LM collection `case_identifiers` carries
`["string"]` ×1, `record_numbers` `["string"]` ×1, and `description_eng` / `description_swe` /
`description_sme` / `description_smn` / `description_sms` each carry the literal `"string"` ×1 —
the OpenAPI example placeholder. One feature was submitted with swagger default values.

---

## §2 — ⭐ THE SECOND-DENMARK GATE, ANSWERED (`mmlParcelProvider.ts:631-645`)

The repo's own `RYHTI_IX_PROBE_URL`, executed VERBATIM:

```
$ curl -H "Accept: application/geo+json" \
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections/pub_valid_ld_plan_ix_gs/items?limit=1"
HTTP=200 BYTES=5374
properties served: 33
--- THE SECOND-DENMARK GATE (RYHTI_ATTRIBUTE_FIELDS) ---
  far      'tehokkuusluku'   PRESENT? NO
  storeys  'kerrosluku'      PRESENT? NO
  useCode  'kayttotarkoitus' PRESENT? NO
```

Corpus-wide literal grep over ALL 6,282 features (both indexes, full geometry included):

```
  tehokkuusluku   -> 0 occurrence(s)
  kerrosluku      -> 0 occurrence(s)
  kayttotarkoitus -> 0 occurrence(s)
  rakennusoikeus  -> 0 occurrence(s)
  kerrosala       -> 0 occurrence(s)
  korkeus         -> 0 occurrence(s)
  e_luku          -> 0 occurrence(s)
```

⛔ **OUTCOME B — index-only, the Hamburg B-Plan pattern**, in that file's own vocabulary.

---

## §3 — ⭐ THE DIGITAL-ORIGIN CENSUS: THE STATE DECLARING ITS OWN FILL STATE

`RY_DigitaalinenAlkupera`, fetched verbatim from koodistot.suomi.fi:

```
   01 = Tietomallin mukaan laadittu            (data-model native)
   02 = Kokonaan digitoitu                     (fully digitised)
   03 = Osittain digitoitu                     (partially digitised)
   04 = Rajaus digitoitu                       (THE BOUNDARY is digitised)
   0401 = Rajaus useamman kunnan alueella      (boundary across several municipalities)
```

| code | detail plans | master plans | total | share |
|---|---:|---:|---:|---:|
| **04** Rajaus digitoitu | 5,630 | 638 | **6,268** | 99.78% |
| **0401** | 1 | 9 | **10** | 0.16% |
| **01** Tietomallin mukaan laadittu | **3** | **0** | **3** | **0.048%** |
| 02 Kokonaan digitoitu | 1 | 0 | 1 | 0.016% |

**6,278 of 6,282 (99.94%)** say, in the register's own vocabulary, that only the OUTLINE was
digitised. Exactly **three** features nationally claim to be data-model native — and even those
sit in the INDEX, which carries no provisions.

---

## §4 — ⭐ THE `1900-01-01` SENTINEL

```
approval_date              nonNull= 5139  sentinel=  303  any<1930=  308
                           distinct<1950: ["1068-06-28Z","1900-01-01Z","1900-06-12Z","1906-01-01Z","1912-11-28Z","1917-12-06Z","1933-08-08Z",...]
date_of_validity           nonNull= 6282  sentinel= 5654  any<1930= 5655
                           distinct<1950: ["1897-03-05Z","1900-01-01Z","1947-07-10Z"]
period_of_validity_begin   nonNull= 6282  sentinel= 3673  any<1930= 3674
time_of_initiation         nonNull= 6282  sentinel= 5986  any<1930= 5986
                           distinct<1950: ["1900-01-01Z"]   <-- the ONLY pre-1950 value at all
period_of_validity_end     nonNull=    0
```

**THE DISPOSITIVE CONTROL:**

```
features with date_of_validity sentinel BUT a real approval_date: 4240
```

The same row knows a genuine approval date and still claims validity from 1 January 1900. A
spike, not a distribution — it is a placeholder.

### The second arm: register CORRUPTION, not a placeholder

```
PRE-1800: AK-004907  approval_date = 1068-06-28Z | admin ["108"] (Hämeenkyrö)
          name: "Kortteli 29 osa, Kirkonseutu"
total pre-1800 date values across all 5 date fields and 6,282 features: 1
```

Against the approval-date decade distribution (sentinel excluded):

```
[["1060s",1],["1900s",2],["1910s",2],["1930s",3],["1940s",17],["1950s",51],["1960s",148],
 ["1970s",554],["1980s",1087],["1990s",996],["2000s",924],["2010s",766],["2020s",285]]
```

So a floor at `1800-01-01` rejects **exactly one corrupt value and zero genuine ones**, and the
four genuine pre-1930 approvals all survive. `1068` is almost certainly a transposed `1968`
(148 approvals that decade). It passes the ISO regex cleanly — a sentinel-only guard would let
it through as a legal date.

---

## §5 — COVERAGE AGAINST AN INDEPENDENT NATIONAL CENSUS

Independent source: **Tilastokeskus `kunta_1_20260101` "Kunnat 2026"** (status VALID) from
`koodistot.suomi.fi/codelist-api/api/v1/coderegistries/jhs/codeschemes/kunta_1_20260101/codes/`.

```
NATIONAL MUNICIPALITY CENSUS: 308
LD covered municipalities: 36   LM covered: 36   UNION: 39
COVERAGE vs national census: 39 / 308 = 12.66%
codes NOT in the 2026 national census: []          <-- every served code is a real kunta
features with >1 admin area: 0
features where original != current admin area: 71  <-- municipality mergers
```

### The covered set (LD count desc)

```
  297 Kuopio        LD=1053 LM=64      182 Jämsä       LD= 317 LM= 0
  491 Mikkeli       LD= 775 LM=92      020 Akaa        LD= 304 LM= 7
  915 Varkaus       LD= 450 LM=17      778 Suonenjoki  LD= 264 LM=20
  593 Pieksämäki    LD= 347 LM=17      507 Mäntyharju  LD= 194 LM=33
  140 Iisalmi       LD= 190 LM=17      749 Siilinjärvi LD= 165 LM=10
  213 Kangasniemi   LD= 157 LM=16      420 Leppävirta  LD= 138 LM=22
  108 Hämeenkyrö    LD= 132 LM= 6      562 Orivesi     LD= 117 LM= 0
  500 Muurame       LD= 109 LM= 4      768 Sulkava     LD=  94 LM= 8
  402 Lapinlahti    LD=  85 LM=23      097 Hirvensalmi LD=  82 LM=57
  595 Pielavesi     LD=  81 LM=12      623 Puumala     LD=  78 LM=12
  263 Kiuruvesi     LD=  77 LM=13      178 Juva        LD=  59 LM=32
  686 Rautalampi    LD=  57 LM=23      171 Joroinen    LD=  52 LM=10
  681 Rantasalmi    LD=  50 LM=11      857 Tuusniemi   LD=  48 LM=12
  047 Enontekiö     LD=  38 LM= 1      844 Tervo       LD=  28 LM=18
  925 Vieremä       LD=  23 LM=10      204 Kaavi       LD=  20 LM= 8
  046 Enonkoski     LD=  19 LM= 4      921 Vesanto     LD=   9 LM= 7
  762 Sonkajärvi    LD=   9 LM=10      687 Rautavaara  LD=   8 LM= 5
  239 Keitele       LD=   4 LM= 3      601 Pihtipudas  LD=   2 LM= 0

LM-ONLY (master plan but NO detail plan):  049 Espoo LM=15 · 091 Helsinki LM=14 · 905 Vaasa LM=14
LD-ONLY (detail plan but no master plan):  182 Jämsä · 562 Orivesi · 601 Pihtipudas
```

The covered set is exactly what the CKAN notes predict: **Pohjois-Savo + Etelä-Savo** (the two
VOOKA regions), plus seven municipalities that delivered themselves.

---

## §6 — ⭐ OVERLAP: THE ANSWER IS PLURAL AND THE REGISTER DOES NOT ORDER IT

29 deterministic sample points (every 200th feature of the LD corpus, ring-mean as the point),
each re-queried live with a 2e-5° bbox:

```
points probed: 29
OVERLAPPING VALID DETAIL PLANS AT A POINT — histogram:
   1 plan(s): 2 point(s)
   2 plan(s): 12 point(s)
   3 plan(s): 6 point(s)
   4 plan(s): 6 point(s)
   5 plan(s): 1 point(s)
   6 plan(s): 2 point(s)
mean plans per point: 2.93
points with >1 plan: 27 of 29        (93.1%)
```

Every one of those plans carries lifecycle `13 = Voimassa`, the register serves no rung, and
`approval_date` is null or the sentinel on **1,446 of 6,282** features so date ordering is not
reliably available either.

---

## §7 — THE DOCUMENT PATH: THE ONLY ROUTE TO PROVISIONS

```
features with documents: 5375 of 6282 | total docs: 7294 | features with >1 doc: 1401
type_of_attachment (RY_AsiakirjanLaji_YKAK):
   code/05 Kaavakartta ja kaavamääräykset  × 5144
   code/04 Kaavamääräykset                 × 1394
   code/06 Kaavaselostus                   ×  308
   code/03 Kaavakartta                     ×  297
   code/14 Osallistumis- ja arviointisuun.  ×  139
   code/99 Muu asiakirja                   ×   11
   code/16 Pöytäkirja                      ×    1
file_content_type: application/pdf × 7294   (100%)
```

**6,538 of 7,294 attachments (89.6%) are code 04 or 05 — i.e. they CARRY the kaavamääräykset.**
The provisions exist, as PDF, addressable by a stable keyless URI. They do not exist as
attributes.

---

## §8 — CODELISTS, FETCHED VERBATIM 2026-09-01

`https://koodistot.suomi.fi/codelist-api/api/v1/coderegistries/rytj/codeschemes/<scheme>/codes/`

```
RY_Kaavalaji             16 codes  (39 = SUPERSEDED, and live on 643 features)
kaavaelinkaari           17 codes
RY_DigitaalinenAlkupera   5 codes  (0401 is a 4-digit SUB-code — the list is hierarchical)
oikeusvaik_YK             6 codes  (14 = DRAFT)
RY_AsiakirjanLaji_YKAK   24 codes
```

All five are transcribed into `fiRuleMapper.ts` as FROZEN tables that THROW on a stranger.
