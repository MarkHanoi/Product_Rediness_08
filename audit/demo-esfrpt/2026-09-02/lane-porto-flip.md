# LANE PORTO-FLIP — §PORTO-SIGN-OFF blocker 4 closed and the gate the founder signed OPENED: the frente-urbana extractor, the moda wired as `context-aggregate`, the flip, the card

**Date:** 2026-09-02 · **Authority:** `docs/04-reference/jurisdictions/pt/sources/SOURCES.md`
§PORTO-SIGN-OFF (assertions 1+2 founder-signed; 3 closed by lane PT-ARTICLE-PINS `eb63eeaf`;
4 closed by ADR-0379 `ae6d9bed`) + `ptPortoPdmDraft.ts` (the gate + 17 pins + the two traps) +
the S1 finisher's handoff (`lane-s1-schema-seats.md` §5) + ADR-0379. **No commit by this lane**
(mandate) — but see §6: a sibling's commit swept this lane's mid-flight state.

**One sentence:** Porto's `PT_PORTO_PDM_CERTIFIED` is **OPEN on the founder's signature** (the
l449 row dereferences §PORTO-SIGN-OFF), the moda da cércea is a real evaluated
`context-aggregate` rule over a frente-urbana member set a new extractor constructs with
per-member provenance + frontage extent — and on every path where the fabric cannot be honestly
measured, the card carries the ADR-0379 refusal NAMING the failed precondition, never the 21 m
cap alone.

---

## 1 · What shipped (the brief's order)

| # | Brief item | Where | State |
|---|---|---|---|
| 1 | **Frontage extractor** | `src/countryAdapters/pt/ptFrenteUrbana.ts` (new, pure) | ✅ Art. 3.º l) as geometry: injected way (clipped between intersections BY THE CALLER — part of establishing the frontage) + injected buildings → members `{value_m, extent_m, sourceId}`; extent = projected chainage span (the article's «extensão»); same-side test (two sides = two frentes urbanas); 30 m band derived from the profundidade order (Art. 24/27 n.º 1 d)). Refusals: degenerate way / subject-on-centreline / **unmeasured fronting member** → `unavailable` naming ids + provenance (excluding one could flip the mode — ADR-0379's own reasoning); established-but-unbuilt → `available`+0 = the evaluator's `empty`. Poisoned (non-finite) heights pass through VERBATIM so the evaluator's `invalid-member` guard owns them — the division of labour is stated in the header. Source doctrine per audit §T2 (as-is heights ONLY as this rule's named input); C12 §8 honoured (module fetches nothing; the dep is the runtime's context machinery). OSM measured 2026-09-02: FUC frontages carry `height` on 3/115 buildings (all street furniture) — so **no PT channel serves a cércea-comparable height today**, `building:levels` stays out (the NL_STOREY_DERIVED class), and the honest live card says exactly that. |
| 2 | **The moda wired** | `ptPortoPdmDraft.ts`: `PT_PORTO_MODA_CERCEA_RULE` (schema-parsed at load: `mode` × `urban-frontage` × `cornice-height` × `mean-ground-at-facade`), `ptPortoFucTipo` (keys on the SERVED verbatim legend — CRUS carries the PDMP's own «Área de frente urbana contínua tipo I/II», measured live; tipo II matched before tipo I, the prefix trap), `evaluatePtPortoCercea` + `ptPortoCerceaStatement` | ✅ The pin-lane scope refinements BIND: **tipo I moda-governed** (Art. 24.º n.º 1 e)); **tipo II street-width-with-moda-override** — cércea ≤ largura (n.º 1 g); perfil > 21 m ⇒ cap = max(21, moda) (n.º 2 b)); largura unmeasured (always today — no source) ⇒ governing cap UNRESOLVED by name, resolved moda stated only as the n.º 2 b) comparator; largura known ≤ 21 ⇒ n.º 1 g governs ALONE (moda not needed). Values appear in `detail` WITH the full article chain; `knownFacts` carries regime + state, never a number (the EnvelopeRefusal knownFacts contract). Chain wiring: `PtChainDeps.resolveFrenteUrbanaAt` (injectable, like the object layer) in `pt/index.ts`. |
| 3 | **The flip** | `PT_PORTO_PDM_CERTIFIED: boolean = true` citing §PORTO-SIGN-OFF + ADR-0379 (L-449: the RECORD is the authority, never the commit); l449 row now carries `signature: {doc: pt SOURCES.md, anchor: '§PORTO-SIGN-OFF'}` (dereferenced by the test — striking the record turns the gate red); §PORTO-SIGN-OFF items 3+4 → **CLOSED** with commits `eb63eeaf` / `ae6d9bed` + the flip paragraph; l449 test flips Porto to signed-open citing the Paris precedent; `ptZoneIdentity` Porto arm asserts the CERTIFIED line + no-cércea-on-Espaço-Verde + still-no-bare-numbers. The shut branch is KEPT (revocation path). |
| 4 | **The user layer** | Demo point + both FUC points driven live (§3) | ✅ Before/after verbatim below. |

**Also:** a **Porto arm in the never-overstate gate** (§PT-PORTO-MODA, brief's "if cheap, add it
with teeth" — it was): drives the REAL `resolvePtZoneIdentityAt` over the recorded FUC-I zone
(corpus fixture `pt-porto-fuc1-aliados.json`, properties verbatim from the live body) with no
frontage source, and asserts the ADR-0379 `context-set-unavailable` refusal is present and NO
substituted numeric cércea is (three detector patterns: resolved-format line · bare «cércea
máxima N m» · numeric knownFact). Its teeth tamper the card into the pre-ADR-0379 bare-21 shape
and demand the detector flags it, else exit 2.

## 2 · The Porto card — BEFORE / AFTER, verbatim (live drives)

**Demo point (41.1579, −8.6291) — Espaço Verde (código 7), the founder's pinned point.**
Full transcripts: `transcripts/porto-flip-card-BEFORE.txt` / `porto-flip-card-AFTER.txt`.

BEFORE (the two lines that changed):
```
fact   : Pack draft: ptPortoPdmDraft.ts — UNCERTIFIED (PT_PORTO_PDM_CERTIFIED=false), no value shown or evaluated
detail : … ⭐ PORTO COVERAGE UPDATE: … a per-article cited pack DRAFT exists in PRYZM (17 values/definitions …) —
         UNCERTIFIED and refusing until a human signs its three assertions, and structurally unable to draw heights
         until the moda-da-cércea (fabric-derived) rule kind exists in the schema. What is missing is the signature,
         not the sourcing.
```

AFTER:
```
fact   : Pack: ptPortoPdmDraft.ts — CERTIFIED (PT_PORTO_PDM_CERTIFIED=true; signed §PORTO-SIGN-OFF + ADR-0379)
detail : … ⭐ PORTO COVERAGE UPDATE: the PDMP pack is CERTIFIED — §PORTO-SIGN-OFF (docs/04-reference/jurisdictions/
         pt/sources/SOURCES.md; founder-signed 2026-09-02; article pins closed by lane PT-ARTICLE-PINS) + ADR-0379
         (the context-aggregate rule kind for the moda da cércea). 17 values/definitions transcribed at
         VERIFIED-PRIMARY, each bound to its Art. N.º. The pack draws no envelope: numeric parameters publish only
         WITH their governing article, and the cércea regime in the Espaços Centrais FUC categorias is
         fabric-derived (moda da cércea) — evaluated where a frente-urbana member set is measurable, refused by
         name where it is not.
```
Everything else on the card is UNCHANGED — `public-open-space`, legallyGrounded=true, CORRECT
NULL: an Espaço Verde is not a FUC categoria, the moda regime governs nothing there, and **no
cércea line (resolved or refused) appears** — the correct null stays correct, and the
no-bare-number assertions still hold on this card.

**FUC tipo I (41.1493, −8.6109 — «…Espaços centrais –  Área de frente urbana contínua tipo I», live):**
- **No frontage source** (`porto-flip-fuc2-AFTER.txt` shape): `⚠ CÉRCEA (FUC tipo I — moda-governed):
  NOT RESOLVED — context-set-unavailable: … PtChainDeps.resolveFrenteUrbanaAt absent … Governing
  rule: Art. 24.º n.º 1 e) …` + fact `Cércea (FUC tipo I): REFUSED — context-set-unavailable`.
- **Real OSM frontage, west-side point 41.1490,−8.6117** (`porto-flip-fuc1-AFTER-osm-westside.txt`):
  the frente urbana RESOLVES (`Rua de Ramalho Ortigão`, 3 fronting buildings, per-member ids) and
  the set honestly refuses: *«3 of 3 fronting building(s) on Rua de Ramalho Ortigão carry NO
  cércea-comparable measured height (osm:way/226664941, … ; e.g. osm building:levels=6 is a storey
  count, not a measured cércea)»* — the ADR-0379 refusal NAMING the failed precondition. (At the
  plaza-centre point the clipped plaza-edge fragment has zero same-side fronting members →
  `context-set-empty`, the OTHER honest refusal — `porto-flip-fuc1-AFTER-osm.txt`; and the
  Overpass-406/429 runs earlier in that file's history came through as `unavailable` naming
  `upstream-failed: HTTP 406/429` — failure ≠ empty, live.)
- **Measured member set** (synthetic fixture, labelled — `porto-flip-fuc1-AFTER-synthetic.txt`):
  `⭐ CÉRCEA (FUC tipo I — moda-governed): 18 m — the extent-weighted mode over 3 member(s) along
  the frente urbana of …, 184 m between intersections (winning extent 39 m of 49 m total; moda da
  cércea (Art. 3.º o) … Art. 3.º l) … Art. 3.º g / ADR-0377)). Governing rule: Art. 24.º n.º 1 e)
  — «A cércea resultante não ultrapasse a moda da cércea …». Granularity: … frontage-granularity
  (C58 §1.11).` — the full citation chain the brief asked for, value never without article.

**FUC tipo II (41.1620, −8.6220, live, no source)** (`porto-flip-fuc2-AFTER.txt`): the tipo II
refusal names both halves of its regime (n.º 1 g + n.º 2 b) and the fact reads
`Cércea (FUC tipo II): REFUSED — context-set-unavailable`.

## 3 · Proofs (final tree, foreground unless noted)

- **Focused tests:** `ptPortoModaCercea` **15/15** · `ptZoneIdentity` + `ptPdmEnvelope` + `l449CertificationGates` all green (70/70 across the four files at the pre-refinement run; 15/15 re-run after the width-interplay refinement).
- **Full site-parcel-data suite:** **`Test Files 180 passed (180) · Tests 3870 passed | 3 skipped` RC=0** (`/tmp/pf-suite-full.txt`; up from 178 — +`frNoExtraction` (sibling) +`ptPortoModaCercea` (this lane)).
- **Never-overstate:** RC=0 **BEFORE** (189 zone-solves) and **AFTER** (**190** — the Porto arm counted): `OK: 0 overstatement(s) … (Paris · Denmark · Madrid NZ-1 · Porto FUC-I) …`.
- **Scoped tsc** (`site-parcel-data`): RC=0, re-run after the last refinement.
- **Root tsc @6GB:** see §5 — the ONLY errors are a live sibling's uncommitted WIP file; zero errors in any file this lane touched.
- **l449:** the Porto row's anchor is DEREFERENCED by `§DEREFERENCE-THE-CITATION` against the updated SOURCES.md — green.

**Falsifications (sever → SEEN FAILING → byte-identical restore; `transcripts/porto-flip-falsification.txt`):**

- **(a) poisoned member** — extractor severed to silently DROP non-finite heights → **2 tests RED**, and the RED card shows the exact trap: `⭐ CÉRCEA … 18 m` resolved from the survivors, a wrong number wearing an Art. 24.º citation. Restore sha-identical (`9487f6bf…`).
- **(b) silent substitution** — `ptPortoCerceaStatement`'s refusal branch severed to emit `cércea máxima admitida: 21 m (Art. 27.º n.º 2 b))` → the FUC-I no-dep **test RED** AND the **never-overstate gate RC=1 with 2 findings by name** (`[height] pt-1312-porto / fuc-i/no-frontage-source — a bare "cércea máxima N m" statement …` + the numeric knownFact). Restore sha-identical (`3783de7f…`).
- **(c) gate-arm teeth** — the arm's detector severed → the arm's own tamper self-test declares blindness: **RC=2 UNPROVEN** (`PT Porto arm teeth: the tampered bare-21 m substitution was not flagged`), never a silent pass. Restore sha-identical (`8e719667…`).

## 4 · Files touched

**New:** `packages/site-parcel-data/src/countryAdapters/pt/ptFrenteUrbana.ts` ·
`packages/site-parcel-data/__tests__/ptPortoModaCercea.test.ts` ·
`packages/site-parcel-data/__tests__/fixtures/pt-frente-urbana/recorded-live-2026-09-02.json` ·
`tools/ga-gate/corpus/never-overstate/pt-porto-fuc1-aliados.json` (fixture; recorded full bodies
+ shas in `transcripts/porto-flip-fuc*-crus-recorded.json`) · the `porto-flip-*` transcripts.

**Edited:** `ptPortoPdmDraft.ts` (flip + moda rule + tipo detection + cércea statement + card;
header closure block, shut branch kept) · `pt/index.ts` (dep + chain wiring + exports; stale
gate-shut comments corrected) · `l449CertificationGates.ts` (Porto row → signature seat) ·
`__tests__/ptZoneIdentity.test.ts` + `__tests__/l449CertificationGates.test.ts` (signed-open,
Paris precedent cited) · `tools/ga-gate/check-envelope-never-overstates.ts` (arm 2f + summary
line) · `docs/04-reference/jurisdictions/pt/sources/SOURCES.md` (§PORTO-SIGN-OFF items 3+4
CLOSED with commits; the flip paragraph; heading struck-through, record style).

**Untouched, per the hard rules:** `packages/schemas/**` (the kind EXISTS — nothing added) ·
`countryAdapters/fr/frGpuClient.ts` (live sibling's) · L-12874: no new transient/absent
vocabulary minted (the dep's outcomes are consumed, not minted; extractor refusals are
ADR-0379's own closed codes).

## 5 · Pre-existing / environmental findings, not this lane's

1. **Root tsc is RED on the LIVE shared tree for a sibling's in-flight file** —
   `apps/editor/src/ui/component-editor-workspace/ComponentDefinitionWorkspace.ts` (UNTRACKED,
   a UCE lane's WIP, actively changing during this lane: 1 error TS18048 at the first run, 2 at
   the second) — import-reachable via the sibling's own modified `ComponentBrowserPanel.ts`, so
   it cannot be excluded from the root program. **Zero root-tsc errors in any file this lane
   touched** (both runs list only that file). Not touched — the multi-agent doctrine; the UCE
   lane owns the fix before any deploy (root tsc gates Fly).
2. **The tree moved under this lane throughout** — `vitest.config.ts` and
   `ComponentBrowserPanel.ts` went modified mid-run; see §6.

## 6 · ⚠ SHARED-TREE COLLISION — a sibling's commit swept this lane's mid-flight state

Commit **`8b8a330f`** (`feat(fr/§STEP4)…`, 20:53:32, the FR lane) includes **this lane's
mid-flight files**: the flipped `ptPortoPdmDraft.ts`, `ptFrenteUrbana.ts`, the `pt/index.ts`
wiring, the l449 row + both test edits, the SOURCES.md §PORTO-SIGN-OFF closure, the three
BEFORE transcripts — and the then-unshrunk 860 KB corpus fixture. The swept state was
self-consistent and green (the full suite + gate runs above prove the COMBINED tree), but it
predates: the corpus-fixture shrink (now `M`, 1.8 KB, `_provenance` per the DK pattern), the
gate arm 2f, the new test file + fixtures, the width-interplay refinement in
`ptPortoPdmDraft.ts` (now `M`), and all AFTER transcripts — those are the uncommitted delta
this lane hands over. **No history rewrite attempted; no commit made** (mandate). Consequence
for the record: the FLIP itself is already on `main` under the FR lane's message — the L-449
discipline holds regardless (the gate's docstring and the l449 row cite §PORTO-SIGN-OFF, never
the commit), but the orchestrator should know the flip commit is `8b8a330f`, not a PORTO-FLIP
commit.

## 7 · What the production wire still needs (honest residue)

1. **A real cércea-comparable height channel for PT** — the extractor + card are ready; OSM
   cannot serve it (measured: levels-only). Candidates: DGT LiDAR MDS−MDT per-building derivation
   (its own signature class), or a municipal survey layer. Until then every live FUC card
   refuses `context-set-unavailable` naming the unmeasured members — which is the correct
   answer, not a gap (C63 §1.6).
2. **The runtime dep** — `resolveFrenteUrbanaAt` is wired for injection but NO production
   caller supplies it yet (the demo driver played the runtime's context fetch). The app's
   existing single context fetch (C12 §8) is the seat.
3. **Largura do arruamento** — no source; must be CONSTRUCTED (the standing street-width
   finding). The tipo II interplay is implemented and tested for the day a width arrives.
4. **`geometry/streetWidth.ts` reuse** — the future width seat should come from
   `measureStreetWidths` (scene-frame) rather than a new measurer.
