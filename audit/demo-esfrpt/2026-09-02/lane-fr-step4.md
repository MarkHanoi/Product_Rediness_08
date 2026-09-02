# LANE FR-STEP4 — the France no-extraction product (brief §11 step 4), SHIPPED

> **Authority:** `docs/04-reference/jurisdictions/fr/FR-MODULE-BUILD-BRIEF.md` §11 step 4
> ("regime, derivability, zone, permitted uses, prescriptions, SUP, terrain, neighbours,
> governing document with approval date and a link to the law — shippable before any PDF is
> parsed") + `docs/04-reference/jurisdictions/fr/findings/FR-PHASE0-REPORT.md` (9f164870,
> measured facts binding). **Written 2026-09-02. No commit made (lane rule) — but see §7:
> an orchestrator commit swept three lane files mid-run and HEAD needs the rest.**
> Transcripts: `transcripts/fr-step4-live-acceptance.txt` (7 live records verbatim),
> `transcripts/fr-step4-falsification.txt` (control 9, sha-verified restore).

---

## 1. What shipped

`resolveFrNoExtractionAt(lat, lon)` → **ONE typed `FrNoExtractionRecord`** — nine slices
(regime · derivability · zone · permitted-uses · prescriptions · SUP · terrain · neighbours ·
governing-document), every slice either **resolved WITH the repo's F1–F8-shaped provenance**
(the existing 8-field `RuleSourceRef` legal address + `validityBasis` — reused from
`@pryzm/schemas` siteintel/provenance.ts, nothing re-minted) or **typed
`{status:'unresolved', refusal_reason, retryable}`** — never a default (brief §1.2). NO
extraction, NO solver, NO envelope number exists anywhere in the type (L-616 stays
structurally closed). Extends the FR-ZONEID chain's machinery (same client, same mapper
family); does not rival it.

New/extended under `packages/site-parcel-data/src/countryAdapters/fr/`:

| File | Role |
|---|---|
| `frExtractMirrorPort.ts` | **The mirror-doctrine seam** (§6): `FrExtractSourcePort`; `frApiCartoExtractSource` = today's provider; `weekly-extract-mirror` = the named future impl; `FR_EXTRACT_MIRROR_DECISION` = FOUNDER-PENDING as data |
| `frGpuClient.ts` (ext.) | +7 point modules (document, prescription-{surf,lin,pct}, assiette-sup-{s,l,p}); **the brief §4.1 direct-WFS fallback** (`data.geopf.fr/wfs/ows`, layer names verbatim, fires on transient ONLY); `frWfsDocUrbaByIdurba` (the ETAT/DATAPPRO join) |
| `frAltimetry.ts` | Géoplateforme altimetry REST (RGE ALTI) — shape probed live, −99999 sentinel classified absent BY NAME |
| `frBdTopoNeighbours.ts` | BD TOPO batiment heights, mirroring the bake tool's measured contract; honesty caveat travels ON the value |
| `frNoExtraction.ts` | The pure record types + assembler + refusal builders + deterministic pickers (rules STATED as exported constants) |
| `frNoExtractionChain.ts` | The impure chain through the port; load-bearing legs short-circuit, auxiliary legs degrade to typed slices |
| `frSources.ts` (ext.) | +FR-STEP4 probe on the GPU row; +`fr-ign-geoplateforme-altimetrie-rest` row (migration queued, barrel file item 2) |

Tests: `__tests__/frNoExtraction.test.ts` (22) over live-recorded fixtures
`__tests__/fixtures/fr-step4/recorded-live-2026-09-02.json` — every regime branch with a
live witness, plus the IDURBA-non-unique pin, the TYPEDOC case-split pin, the plan-masse
gate, control 9, byte-determinism.

**Proofs (final tree):** focused 22/22 RC=0 · full package suite **179 files / 3,855
passed / 3 skipped, RC=0** · `npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit`
RC=0 · live acceptance 7/7 · falsification 7/7 transient-by-name + sha-identical restore.

## 2. The five acceptance points (live, foreground, each run TWICE — byte-identical 7/7)

Full verbatim records: `transcripts/fr-step4-live-acceptance.txt`. Compact:

1. **Paris intra-muros — 11e (48.8585, 2.3785): PLU + prescriptions.** Regime PLU —
   PARIS 75056 (2 municipality features; lowest-INSEE rule stated) — doc `75056_PLU_20260616`.
   Zone **UG** → règlement `75056_reglement_20260616.pdf`. **5 surf prescriptions** (17/00,
   36/00, **39/02 "Hauteur plafond"**, 42/00, 99/01 — carried verbatim, none of the §5
   envelope codes). **5 SUP assiettes** (4× AC1 + AC2, acte PDFs riding the rows). Terrain
   **37.54 m**. Neighbours **49/49 with height, 4.5–25.6 m**. Governing doc: DATAPPRO
   **20260616**, ETAT **03** (doc_urba join), download-by-partition link, Légifrance
   R151-39..41. Refusal: none — the record is the product. 15,330 bytes, rerun identical.
2. **Lyon Presqu'île (45.7640, 4.8357): PLUi.** Regime PLUi — LYON 69123 — doc
   `200046977_PLUi_20260326`. Zone **UCe1b**. 13 prescriptions incl. **02/00 typed
   `constructibilite-interdite-ou-conditionnelle`** (flood-risk overlay — a §5 code typed
   live). 17 SUP assiettes. Terrain 167.76 m. Neighbours 26, 16.9–30.2 m. DATAPPRO
   20260326, ETAT 07. **The TYPEDOC case-split pinned live:** doc_urba serves `PLUI`,
   /document serves `PLUi`, the record speaks `PLUi` with verbatims kept.
3. **Known-RNU commune — Bergonne (45.5250, 3.2200).** Refusal `no-rule-pack`, verbatim
   basis line: *"Basis: the Géoportail de l'urbanisme municipality flag is_rnu=true for
   THIS commune — a per-commune statement, which is the only granularity this refusal
   relies on. … No national RNU count is quoted here deliberately: the GPU flag census and
   the published SuDocUH figures disagree and that discrepancy is unresolved
   (FR-PHASE0-REPORT §2) — re-derive from the current SuDocUH release before quoting any
   aggregate."* Test-asserted: neither aggregate (9,461 / 6,646 / 23.77% / 19.0%) appears
   anywhere on the card. Partial output still ships: terrain 497.34 m, governing doc =
   RNU + Légifrance L111-1 s.
4. **The LORAY point (INSEE 25349; interior 47.157245, 6.493262).** Regime **PLUi** — doc
   `242504181_PLUi_20251027` — zone **Aa** (typezone A) → règlement
   `242504181_reglement_20251027.pdf`. 1 SUP (AC1 Fontaine-lavoir). Terrain 725.86 m.
   DATAPPRO 20251027, ETAT 03. (The brief's §4.1 contract commune, upgraded from a name
   assertion to a full record.)
5. **POS point — FOUND LIVE: Artigue (31019; 42.82676, 0.640911).** Only **2** du_type=POS
   documents remain nationally (live WFS census: 31019 ARTIGUE, 54362 MERCY-LE-BAS); an
   interior point exercised the §3.2 fall-through for real. Regime **POS-caduc** — refusal
   names **art. L174-1 / 27 March 2017**, the served `31019_POS_20110919`, and the agreeing
   is_rnu=true flag. The dead POS zone **NC** (idurba NULL — old standard, live) is carried
   as historical identity only; its old-standard DESTDOMI is **refused** as current uses
   (§5 finding 4). Governing doc = RNU with the L174-1 article line.

Bonus witnesses (same run): **Pardines CC** (regime CC, zone via secteur-cc "N",
derivability `derived-plan-governs`/secteur-cc, refusal `derived-plan` legallyGrounded TRUE,
doc_urba join works for CC: DATAPPRO 20190221 ETAT 03) and **Paris Marais PSMV** (regime
PSMV, partition `PSMV_75056_A`, zone US, `derived-plan` refusal naming the
building-by-building expedient; DATAPPRO 20131218 ETAT 03).

## 3. Determinism (brief §1.1)

- `fetchedAtIso` is an INPUT to the chain (never a clock read inside the assembler); the
  acceptance driver ran every point twice with the same stamp — **byte-identical 7/7**
  (sizes 6,325–19,128 bytes).
- Three pick rules are exported constants and travel ON the record when they fire:
  `FR_MUNICIPALITY_SELECTION_RULE` (lowest INSEE — fired live at Paris/Lyon/Marais),
  `FR_DOCUMENT_SELECTION_RULE` (PSMV > PLU/PLUi/CC > POS, then newest-by-name),
  `FR_DOC_URBA_SELECTION_RULE` (**the IDURBA-non-unique pin** — newest DATAPPRO, tie by
  gid; input-order-reversal test proves the same pick).

## 4. Measured discrepancies vs the brief (reported, not worked around silently — §1.5)

1. **API Carto `/document` serves NO `datappro` and NO `etat`.** The brief's step-4 slice 1
   names both from /document; live they exist only in `doc_urba`. Resolution: the
   **direct-WFS `wfs_du:doc_urba` join by idurba** (which the §4.1 fallback transport
   already mandates) — verified live for PLU/PLUi/CC/PSMV (ETAT 03/07, DATAPPRO filled).
2. **`/acte-sup?geom=` IGNORES the geometry** (returned 5,000 of 89,002 national rows) —
   actes are non-spatial. The acte citation comes from the assiette row's own `fichier`
   (measured riding every assiette) — never a per-point /acte-sup call.
3. **WFS CQL axis order is LAT LON** (`INTERSECTS(the_geom,POINT(48.8585 2.3785))` → UG;
   lon-lat → 0 features) — the OPPOSITE of the BBOX-parameter order (lon,lat). Both are
   measured; both are documented at the constants.
4. **`document/info/?partition=` 404s** (both spellings probed) while
   `download-by-partition/DU_75056` answers 302 → the document zip — the §4.2 "404 means
   fetch by another route" rule observed in the wild; the record emits the working link.
5. **Altimetry no-data sentinel is z=-99999.0** (sea control) — classified `absent` naming
   the sentinel, never an elevation.

## 5. Findings for other lanes

1. **Artigue is the national POS-caducity live witness** (one of exactly 2 remaining POS
   docs) — is_rnu=true AND a production POS document AND an old-standard zone row
   simultaneously; any FR regime logic must consult /document, not just zone-urba
   (FR-ZONEID's ladder alone would have answered "zone NC, règlement not extracted" here).
2. **`municipality` serves arrondissement + commune (2 features) inside Paris/Lyon/
   Marseille** — any consumer picking `features[0]` blind is nondeterministic; the stated
   lowest-INSEE rule is now the one spelling.
3. **prescription typepsc `39/02` ("Hauteur plafond") exists at the Paris point** — a
   height-ceiling overlay OUTSIDE the brief's §5 envelope-code table; carried verbatim
   today, worth a table seat when the drawn-setback ingest (step 5) lands.
4. **A caduc POS's zone row still serves old-standard DESTDOMI** — reading uses off a dead
   instrument would resurrect it; the assembler now gates the uses slice on regime
   (RNU/POS-caduc → per-case refusal regardless of what the historical row carries).
5. **`doc_urba` joins work for PSMV/CC too** (ETAT/DATAPPRO live for both) — provenance for
   every regime with a document, not just PLU-family.

## 6. FOUNDER-PENDING — the weekly-extract mirror (restated)

The brief §4.1 REQUIRES: *"Mirror the weekly extract as your runtime source; use the API
for freshness checks and cache misses only."* That is a server-infrastructure decision —
the national extract is **≈28.6 GB across 31 layers** and **no PostGIS/spatial DB is
provisioned** in this deployment. The lane therefore shipped the seam as a PORT
(`FrExtractSourcePort`): today's provider is `frApiCartoExtractSource` (API Carto + the
mandated direct-WFS fallback — resilience proven: a 502'd API Carto answer was served
through the fallback in test); the mirror is the NAMED future implementation of the same
interface, and `FR_EXTRACT_MIRROR_DECISION` records the status in code so the API cannot
silently become the architecture. **Decision owed by the founder:** provision a spatial
store for the weekly extract (then the mirror is a new port implementation, not a
refactor), or accept the live-API posture with its stated availability caveat.

## 7. ⛔ Orchestrator note — HEAD needs the rest of this lane's tree (see barrel file item 0)

Commit `ae6d9bed` (20:32:49, mid-lane) swept in `frAltimetry.ts`, `frBdTopoNeighbours.ts`
and `frExtractMirrorPort.ts` (byte-identical to the lane finals) WITHOUT the extended
`frGpuClient.ts` they import from — **HEAD alone fails tsc on `frExtractMirrorPort.ts`**
(`frGpuFeaturesAtPointWithFallback` / `FrGpuPointModule` are 0 hits in HEAD's client,
verified via `git show`). The uncommitted working tree heals it; committing the remaining
lane files (listed in `barrel-additions-fr-step4.txt`) is the fix. Also noted: ONE sibling
pin updated with intent preserved — `frZoneIdentity.test.ts`'s `sources().length === 1`
became "exactly one `fr-gpu-apicarto-du` row" (it guarded GPU non-multiplicity; the new
altimetry row is a distinct source, not a GPU split). Concurrent-lane state at close:
`countryAdapters/pt/` carries the PT lane's working-tree edits; this lane's suite + tsc ran
green against that tree.
