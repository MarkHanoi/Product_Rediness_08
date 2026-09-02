# LANE PT-ARTICLE-PINS — Porto certification gate, assertion 3 (article pins) — CLOSED

**Date:** 2026-09-02 · **Scope:** §PORTO-SIGN-OFF assertion 3 in
`docs/04-reference/jurisdictions/pt/sources/SOURCES.md` + `PT_PORTO_PDM_DRAFT` in
`packages/site-parcel-data/src/countryAdapters/pt/ptPortoPdmDraft.ts`.
**Gate:** `PT_PORTO_PDM_CERTIFIED` remains **FALSE** — blocker 4 (`fabricDerivedHeight`) is open;
the orchestrator flips when both close. `packages/schemas/**` untouched. No commit by this lane.

## 1 — Source identity (re-fetch, since the cached PDF was absent)

The `.cache/ordinance-ingest/pdf/` store did not hold the Porto Regulamento (only Luzern, Berlin,
Aix-Marseille documents). Re-fetched by the URL §A.0.3 pins:

- `https://pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf` → HTTP 200,
  **1,641,985 B — byte-identical to the §A.0.3 record**, 100 pp, born-digital text
  (97/100 text pages, producer Microsoft Word 2013).
- **sha256 `a9383f794a059d87e1bd5629a3d9ea26240f713fab72c0c970cd7bb6baa3e0d1`** — no earlier
  sha256 pin existed; this is now recorded in §A.0.3.
- Extractor char counts differ by engine over the same bytes: `tools/ordinance-ingest`
  (pdf.js) = 306,385; the 2026-07-31 pass recorded 319,459. Identity rests on bytes + pages,
  not the extractor-dependent char count.
- Page convention: **PDF page** cited everywhere; printed fólio = PDF − 2.

## 2 — The chapter, as the ordinance actually structures it

Secção II — Espaços Centrais (TÍTULO III, CAPÍTULO III) is **five Subsecções, each with its own
Edificabilidade article**. There is no chapter-wide parameter set:

| Subsecção | Categoria | Edificabilidade art. |
|---|---|---|
| I | Área Histórica | Art. 20.º (conservation-first; no numeric chain) |
| II | Área de Frente Urbana Contínua **tipo I** | Art. 24.º |
| III | Área de Frente Urbana Contínua **tipo II** | Art. 27.º |
| IV | Área de Edifícios de Tipo **Moradia** | Art. 30.º |
| V | Área de Blocos Isolados de Implantação Livre | Art. 32.º |

Every rule string pinned below is **unique in the whole 100-page document** (swept:
`21 metros`, `profundidade de 25/30 metros`, `superior a 30º`, `2000 m`, `metade da sua altura`,
`pisos acima do solo é três`, `largura do arruamento` — one hit each at the pinned location).

## 3 — THE PIN TABLE (row → Art. N.º → verbatim fragment → PDF page)

| §A.0.3 row / draft key | Pinned article | Verbatim (fragment) | PDF p. |
|---|---|---|---|
| Cércea ≤ largura do arruamento (`cerceaStreetWidth`) | **Art. 27.º n.º 1 g)** — FUC tipo II | «A cércea confinante com a via pública não pode exceder a largura do arruamento confrontante, medida entre os limites do espaço público dominante ou estabelecido…» | 18 |
| 21 m cap + moda override (`cerceaCap21`) | **Art. 27.º n.º 2 b)** — FUC tipo II | «Quando o perfil transversal do espaço público ou via pública confinantes com uma frente urbana seja superior a 21 metros, a cércea máxima admitida é de 21 metros, exceto quando a moda da cércea for superior, respeitando-se essa moda…» | 18 |
| Profundidade 25 m / 30 m (`profundidade`) | **Art. 24.º n.º 1 d)** (25 m, FUC I) + **Art. 27.º n.º 1 d)** (30 m, FUC II) | «No piso situado à cota do logradouro, admite-se o prolongamento construtivo do edifício, não podendo ultrapassar a profundidade de 25 metros medidos a partir do alinhamento da frente urbana…» (27.º identical, 30 m) | 17 / 18 |
| Afastamento ≥ H/2 min 3 m (`afastamento`) | **Art. 30.º n.º 1 d)** — Moradia | «Os pisos superiores do edifício devem garantir um afastamento aos limites do prédio, igual ou superior à metade da sua altura, com o mínimo de 3 metros, exceto nas situações de colmatação de empena…» | 19 |
| Max 3 storeys (`maxStoreysStatedSubcategory`) | **Art. 30.º n.º 1 c)** — Moradia | «O número máximo de pisos acima do solo é três, com exceção de situações de colmatação de conjuntos consolidados, em que o número de pisos é definido em função da moda da cércea» | 19 |
| Roof pitch 30° (`roofPitchMax`) | **Art. 24.º n.º 1 f)** — FUC tipo I | «…o arranque da laje de cobertura deve coincidir com a inserção entre planos de fachada e a laje de teto do último piso e a sua inclinação não deve ser superior a 30º» | 17 |
| > 2000 m² exemption (`frontageImplantationExemption`) | **Art. 30.º n.º 2** — Moradia | «Excetuam-se da alínea a) do número anterior as parcelas com área superior a 2000 m2, admite-se qualquer implantação…» [sic «ferente» later in the sentence] | 19–20 |

Refinements to already-pinned rows (citation precision only): índice 1 → **Art. 32.º n.º 3 a)**;
existing-extension 1/0,6 → **Art. 32.º n.º 2** (both PDF p. 20). Art. 36.º/38.º/25.º sentences
re-read and confirmed as recorded (1,8 / 1,4 / 0,3+10 m²); **Art. 28.º n.º 1** carries the
identical 0,3 / 10 m² logradouro rule for FUC tipo II (noted in the Art. 25.º row).

## 4 — FALSIFICATION (the pin re-found by an independent tool path)

Claim: Art. 27.º n.º 2 b), PDF page 18 — «…seja superior a 21 metros, a cércea máxima admitida é
de 21 metros, exceto quando a moda da cércea for superior…».

Re-extraction: **poppler `pdftotext -f 18 -l 18`** (a different engine entirely from the repo's
pdf.js path) over the same cached bytes reproduces the sentence on page 18 verbatim. Pages 17
and 19 were re-extracted the same way and re-found every other pinned sentence (25 m, 30º,
três pisos, metade da sua altura, 2000 m2, 30 m on p. 18). A pin that cannot be re-found is not
a pin; these were all re-found.

## 5 — DISPUTED values: **NONE**. Scope findings for the founder: **FOUR** (values all match)

No numeric value in §A.0.3 or the draft disagrees with the chapter text — nothing is marked
DISPUTED. But the chapter reading surfaced four **scope** findings that touch the SIGNED
assertion 1 wording ("the Espaços Centrais parameter chain") and are recorded on the rows:

1. **The street-width cércea rule and the 21 m cap are FUC TIPO II ONLY (Art. 27.º).** In FUC
   tipo I the governing height rule is the **moda da cércea** (Art. 24.º n.º 1 e)), with
   above-moda cérceas only for colmatação de empenas (n.º 1 g)). A pack applying
   cércea ≤ street-width to tipo I parcels would misapply the ordinance.
2. **The 25/30 m profundidade caps govern the piso à cota do logradouro extension**, not the
   whole building: the dominant body's tardoz plane follows the frente urbana's dominant tardoz
   alignment (alínea b) of Arts. 24.º/27.º). Naive "25/30 m depth at all storeys" would
   overstate upper storeys where the tardoz alignment is shallower.
3. **Art. 32.º's índice de edificação 1 is Subsecção V (Blocos Isolados de Implantação Livre)
   ONLY** — the "(Espaços Centrais family)" phrasing in the §A.0.3 Field and the draft's value
   text overstates: Histórica, FUC I/II and Moradia carry **no índice de edificação** and are
   morphology-governed. Value text left unchanged per lane rules; flagged on the row.
4. **Art. 30.º n.º 3 adds an unrecorded carve-out**: the 3-storey max "pode ser superior no
   âmbito da concretização de uma UOPG". (Arts. 32.º n.º 3 b), 36.º n.º 1, 38.º n.º 1 have the
   same UOPG-variation shape for their índices.)

Also honoured: DTCC **1312** (not the repo folder's 1315 — §A.0.5 defect) — untouched;
`edificab_m` (perequação médio index) — untouched, still not a draft value.

## 6 — Verification + files touched

- `npx vitest run __tests__/ptZoneIdentity.test.ts` (packages/site-parcel-data) → **25/25 PASS**
  (the pre-pin assertion `unpinned.length > 0` was flipped to the post-pin invariant:
  0 unpinned · 7 rows carrying the lane marker · every pin matching `Art. \d+\.º`).
- `npx tsc --noEmit -p tsconfig.json` (packages/site-parcel-data) → **RC=0**.
- Zero `NOT pinned` / bare-chapter Article cells remain in §A.0.3 or the draft (grepped).

Touched:
- `docs/04-reference/jurisdictions/pt/sources/SOURCES.md` — §A.0.3: 7 rows pinned (+2 rows
  n.º-refined, +1 note on Art. 28.º), re-fetch provenance box with sha256.
- `packages/site-parcel-data/src/countryAdapters/pt/ptPortoPdmDraft.ts` — 7 `article` fields
  pinned (citation fields only; no value changed), `ARTICLE_NOT_PINNED` const retired, header
  assertion-3 bullet annotated CLOSED with the scope findings.
- `packages/site-parcel-data/__tests__/ptZoneIdentity.test.ts` — pin-state assertion flipped.
