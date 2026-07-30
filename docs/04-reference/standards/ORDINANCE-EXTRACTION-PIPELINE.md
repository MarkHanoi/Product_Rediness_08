# Ordinance Extraction Pipeline — horizontal architecture + production pilot protocol

> **Stamp**: 2026-07-23 · **Status**: DESIGN SPEC (not built) · **Kind**: horizontal capability
> **Grounded in**: `C57` (parcel data), `C58` (zoning rules & buildable envelope) §1.1/§1.2/§1.4/§1.6/§2.2,
> `C23` (provenance & AI audit) §1.1, and the measured pilot `L-590g-OCR-PILOT-RESULTS.md`.
> **Decision context**: `es-ct/08019-barcelona/findings/L-590f-OCR-PIPELINE-DECISION.md` — **pilot
> first, then decide the build.** This document is the SPEC + the PROTOCOL, not the build.

This is the shared design for turning **scanned / text-trapped municipal ordinances** into
**citeable buildable-envelope parameters** — for Barcelona, Córdoba, and every city with the same
"general plan + old scanned derived plans (or old scanned ordinances)" shape. It is deliberately
**horizontal**: the *enumerator* differs per city; the *extraction + verification core* is shared.
Per `L-590f` the build is **not authorised yet** — Part C below is the protocol that earns the yes.

⚠ **This design must be read against the pilot.** `L-590g` measured that (1) "no text layer" ≠ "hard
to OCR"; (2) the dominant risk is confident-wrong misalignment, algorithms-reported-as-numbers, and
the parcel-binding gap — **not** character accuracy; (3) transfer holds but difficulty is asymmetric.
Every design choice below is a response to one of those measured facts.

---

## 1 — The boundary argument: what is per-city, what is shared

```
  PER-CITY ADAPTER (thin)                    SHARED CORE (horizontal, @pryzm/ordinance-extraction)
  ┌───────────────────────┐                  ┌─────────────────────────────────────────────────┐
  │ Enumerator            │  documentId +    │ 0. Supersession gate  → 1. Fetch+profile         │
  │  BCN: RPUC basica→     │  metadata +      │ 2. OCR / text-pull    → 3. Dual-pass extract      │
  │       detall→documents │  in-force flag   │ 4. Agreement + cheap cross-checks                 │
  │  Córdoba: COACo WFS +  │ ───────────────► │ 5. Human-verify routing                           │
  │       visor O_*.pdf     │                  │ 6. Emit curated rule-pack (C58 §2.2) @ new tier   │
  └───────────────────────┘                  └─────────────────────────────────────────────────┘
```

**Why this line and not another.** The two cities prove the split empirically (`L-590g`, `L-590e`,
es-an):

| stage | Barcelona | Córdoba | ⇒ per-city or shared? |
|---|---|---|---|
| enumerate expedients/zones | RPUC Angular REST (`basica`/`detall`) | COACo GeoServer WFS (`coaco:ordenanzas`) + `visor` PDF host | **per-city** — totally different APIs |
| in-force / supersession | `detall.vigencia`, `EXP_DEROG`, `RECURS_O_SENTENCIA` | SIU `Planeamiento_Vigente` + any *modificación* | **per-city** — different registers |
| fetch a document | HTTPS inline | HTTP→HTTPS 301 | **per-city** (trivial) |
| profile (text-layer? image regime?) | same code | same code | **shared** |
| OCR / text-pull | same | same (+ born-digital text pull) | **shared** |
| structured extraction (LLM) | same prompts/schema | same | **shared** — the ordinance vocabulary (altura, edificabilidad, ocupación, retranqueo/setback, parcela mínima) is pan-Spanish; Catalan↔Castilian is a term map, not a new pipeline |
| dual-pass + cross-checks + human routing | same | same | **shared** |
| emit rule-pack | same schema (C58 §2.2) | same | **shared** |

⇒ **The enumerator is an interface (`OrdinanceEnumerator`) implemented per city; everything from
"profile" onward is one package.** Building it as a per-city hack would re-implement the
verification core (the expensive, safety-critical part) N times — the exact anti-pattern the
platform-spine memory warns against. The city-specific part is the cheap part.

### 1.1 — A new package, not a script

**Propose `packages/ordinance-extraction/` (`@pryzm/ordinance-extraction`), L2, offline/build-time.**

- **Not on the runtime envelope path.** `C58 §1.1` forbids an AI/LLM call on the deterministic
  envelope solve. This package runs **offline**, produces a **reviewed static rule-pack artefact**
  (`C58 §1.6`), and the runtime `ZoningRulesEngine` reads that artefact deterministically. The AI
  boundary of `C58 §1.1` is honoured exactly: "an LLM MAY (elsewhere) help curate a rule pack from a
  PDF ordinance offline; the pack it produces is a reviewed static artefact." **This package IS that
  "elsewhere," made a first-class, audited subsystem instead of an ad-hoc script.**
- **Why a package not a `tools/` script:** it writes `AIArtefact` records (`C23 §1.1` — every model
  call must), it carries the dual-pass/verification invariants as testable code, and it is consumed by
  two cities today and more later. A script cannot carry contract invariants a CI gate binds to.
- **Purity:** the *core* is pure TS orchestration; the model calls go through `packages/ai-host`
  (`C09`) so the P1/P8/C23 plumbing is reused, not re-invented. It is L2 (depends on ai-host L2,
  schemas L0), never imported by the L4 renderer or the runtime engine.

---

## 2 — The stages, each answering a measured pilot risk

**Stage 0 — Supersession gate (runs BEFORE extraction, never after).** `L-590c` §10.4 / `L-590f` §3.
Extracting from a superseded instrument yields a **doubly-wrong** citation (wrong value AND dead
instrument). Barcelona: the `detall` call already returns `vigencia`; the AMB `expedients_refos`
register adds `EXP_DEROG` / `RECURS_O_SENTENCIA` / `TANCAMENT_OUT`. Córdoba: SIU `Planeamiento_Vigente`
+ a check for any later *modificación*. **A document that fails the gate is never fetched for
extraction.** This is stage 0, structurally upstream, so it cannot be forgotten.

**Stage 1 — Fetch + profile (two axes, per `L-590g` §2).** Record, per document: `has_text_layer`
(chars/page) AND `image_regime` ∈ {`born-digital-text`, `clean-raster`, `clean-laser-scan`,
`faded-typewriter`, `degraded-photo`, `handwritten`}. **These are orthogonal** — the pilot's central
correction. `born-digital-text` skips OCR entirely (Córdoba `O_INDUSTRIAL`). The image-regime label
sets the per-tier precision expectation and the human-sample rate downstream.

**Stage 2 — OCR / text-pull.** Born-digital → text pull (+ encoding normalise: Latin-1/CP1252→UTF-8,
the `O_INDUSTRIAL` `�` fix). Everything else → OCR (Google DocumentAI or equivalent) AND keep the page
image for the vision pass.

**Stage 3 — Dual-pass extraction (`L-590f` §3).** Two independent strategies:
- **Pass A — OCR-then-extract:** DocumentAI text (with layout) → LLM structured extraction against the
  C58 field schema.
- **Pass B — direct-vision-extract:** the page IMAGE → vision LLM → same schema.
These fail *differently* (Pass A loses table structure; Pass B mis-orders two-column layouts), so
agreement between them is a real signal. Both output the same typed record with **per-field
provenance** (documentId, page, bounding-box crop, ordinanceRef).

**Stage 4 — Agreement + cheap cross-checks (all free, all measured in the pilot):**
- **Dual-pass agreement per field:** auto-accept candidate ONLY where A==B. Disagreement → human.
- **Arithmetic cross-checks** where the document is internally redundant — `L-590g` §3.2 measured this
  catching **2 of 2** injected errors on the Can Figuerola table (`sup.planta × plantas =
  sup.edificada`). Free, and catches the plausible-wrong digit.
- **Range/sanity bounds** (`L-590f` §3): FAR ∈ [0.2, 3.0]; height ∈ [3, 120] m; ocupación ∈ [0,1].
  Catches gross errors (the `2.000`→`2.0` locale bug), not plausible-but-wrong ones.
- **Locale-format normaliser:** comma-decimal vs period-thousands, enforced from the jurisdiction
  (`L-590g` §4.4).
- **Algorithm detector:** phrases like *"resultante de aplicar los parámetros"* / *"segons plànol"*
  → emit `value: null, rule: "derived"|"on-drawing"`, **never a number** (`L-590g` §4.2, §5). This is
  the compounding schema risk of `L-590f` §2.4, defused at the extractor.

**Stage 5 — Human-verify routing.** Anything not auto-accepted, plus a mandatory sample of what was
(§Protocol). Human sees the **crop + the article + both passes' reads** and confirms/corrects in
seconds (the C23 provenance retention is what makes it seconds, not minutes).

**Stage 6 — Emit rule-pack.** A `JurisdictionZoningContract` (`C58 §2.2`) whose numeric fields carry
`fieldProvenance: 'pipeline-extracted'` and `defaultConfidence: 'pipeline-extracted-unverified'`
(§3), each with its retained provenance. The runtime engine consumes it deterministically.

---

## 3 — 🔴 The confidence-tier addition (the LEGAL control — `L-590f` §6)

A **permanent new tier below every primary tier**, that **never silently graduates**. It exists so it
is **impossible** for a machine-extracted, unverified value to render as a certified/primary number.
This is the single most important schema change and it is a *legal* control, not a nicety: after we
OCR a document ourselves, a wrong number is **unambiguously our pipeline's error**, not the
publisher's (`L-590f` §6).

### 3.1 — DIFF SKETCH (do NOT apply here — WIRING TODO; proposes exact edits)

⚠ **These are sketches for the orchestrator/owning-PR to apply. This doc does not edit shipped schema
files** (`packages/site-parcel-data` tests must stay green; other work depends on these files).

**(a) `packages/schemas/src/site/zoning/ProvenanceFlags.ts` — extend three enums.**

```diff
 // FieldProvenanceSchema — add a MACHINE-extracted value, distinct from human 'ordinance-pdf'
 export const FieldProvenanceSchema = z.enum([
     'published-structured',
-    'ordinance-pdf',
+    'ordinance-pdf',          // HUMAN transcribed a legal PDF (curated pack, C58 §1.6)
+    'pipeline-extracted',     // MACHINE OCR+LLM extracted, NOT human-verified. Strictly below
+                              // 'ordinance-pdf': a human who read and typed a value outranks a
+                              // pipeline no human has checked. Never conflate the two.
     'estimated',
 ]);

 // EnvelopeConfidenceSchema — add the permanent bottom tier
 export const EnvelopeConfidenceSchema = z.enum([
     'authoritative',
     'structured',
     'block-constructed',
     'estimated-ruleset',
+    // pipeline-extracted-unverified — MACHINE-extracted from a scanned/text ordinance and NOT yet
+    // human-verified. A PERMANENT tier BELOW 'estimated-ruleset'. It NEVER auto-graduates: promotion
+    // to any higher tier requires a recorded human-verification event (C23 AIArtefact with
+    // humanApproval). Legal control per L-590f §6 — a wrong number here is OUR pipeline's error, so
+    // it must be visibly, permanently marked as unverified until a human signs it off.
+    'pipeline-extracted-unverified',
     'not-determined',
 ]);

 // RulePackDefaultConfidenceSchema — a pipeline-seeded pack defaults to the new tier, never higher
 export const RulePackDefaultConfidenceSchema = z.enum([
     'structured',
     'estimated-ruleset',
+    'pipeline-extracted-unverified',
 ]);
```

**(b) A per-value provenance record** (new L0 schema, e.g.
`packages/schemas/src/site/zoning/ExtractionProvenance.ts`) so C23 retention is typed, not free-text:

```ts
export const ExtractionProvenanceSchema = z.object({
  documentId:   z.string().min(1),          // RPUC idDocument / COACo file id
  page:         z.number().int().min(0),
  cropRef:      z.string().min(1),           // object-storage key of the source-image CROP (C23)
  ordinanceRef: z.string().min(1),           // the governing article, e.g. "PGOU-2001 Art. 13.6.3"
  extractionModel: z.string().min(1),        // model id + version
  promptHash:   z.string().min(1),
  dualPassAgreed: z.boolean(),               // stage-4 gate result
  crossChecks:  z.array(z.string()),         // e.g. ["arithmetic:ok","range:ok"]
  supersededCheck: z.enum(['vigent','derogated','under-appeal','unknown']),
  humanVerifiedBy: z.string().nullable().default(null),   // null until a human signs → gates graduation
  verifiedAt:   z.string().nullable().default(null),
});
```

**(c) Ordering + no-silent-graduation invariants** (owning PR; C58 §1.2 resolution + a CI gate):
- The `C58 §1.2` resolution ladder places `pipeline-extracted-unverified` **below**
  `estimated-ruleset`. A pack field with this provenance can never out-rank a curated estimate.
- Extend the `C58 §1.4` fidelity-label CI gate (`check-zoning-confidence-label`) so a
  `pipeline-extracted-unverified` envelope MUST render with a **distinct, louder** affordance than
  `estimated-ruleset`: the words *"machine-extracted from [documentId, article], NOT verified against
  the original"* (`L-590f` §6 citation language), the crop thumbnail, and NO certificate styling.
- **No-silent-graduation gate:** a value may move from `pipeline-extracted-unverified` to any higher
  tier **only** when `ExtractionProvenance.humanVerifiedBy != null` with a matching C23 AIArtefact
  `humanApproval`. A CI/property test asserts no code path raises the tier without it.

### 3.2 — Why a value can NEVER render as certified

Three independent locks, any one sufficient:
1. **Distinct enum value** below all primary tiers — a consumer switching on confidence cannot map it
   to `authoritative`/`structured` by accident (exhaustive union).
2. **CI label gate** — an unlabelled or certificate-styled `pipeline-extracted-unverified` fails
   merge, exactly as `estimated-ruleset` does today (`C58 §1.4`).
3. **No-silent-graduation invariant** — the only door to a higher tier is a recorded human sign-off.

---

## 4 — Provenance retention (C23) — verify in seconds, not minutes

Every extracted value stores its `ExtractionProvenance` (§3.1b): the **source-image crop**
(object storage), `documentId`, `page`, and the **article** (`L-590f` §3, `C23`). The extraction is a
model call, so per `C23 §1.1` it **MUST write an `AIArtefact`** (model, prompt, context-hash,
timestamp, cost, reproducibility, human-approval) before returning — the pipeline lands *inside* the
existing audit path, it does not invent a parallel one. The crop is what turns human verification from
"open the 82-page PDF and find the cell" into "glance at a thumbnail + the article" — the difference
between a 25-40h review burden (`L-590f` §4) being feasible or not.

---

## 5 — How the output reaches the envelope (and stays honest end-to-end)

```
pipeline pack (fieldProvenance='pipeline-extracted',
   defaultConfidence='pipeline-extracted-unverified', +ExtractionProvenance per field)
        │  (static, reviewed artefact — C58 §1.6; NO model call at runtime — C58 §1.1)
        ▼
ZoningRulesEngine.resolve(parcel, pack)   → BuildableEnvelope
        │   confidence = 'pipeline-extracted-unverified'
        │   derivation[].fieldProvenance = 'pipeline-extracted'
        │   derivation[].ordinanceRef = e.g. "PGOU-2001 Art. 13.6.3"
        ▼
Compliance panel / Forma massing  → louder-than-estimated "unverified, machine-extracted" affordance
                                     + crop + "verify against original" link (C58 §1.4 gate)
```

⚠ **The parcel-binding guard (`L-590g` §5).** Even a perfectly extracted Barcelona Pla Parcial value
is keyed to a **block label**, not a parcel. The pipeline MUST NOT emit such a value as a parcel-level
number: it either (a) resolves the label→parcel binding from a *vectorised* plànol (a separate,
harder capability — out of scope for the first build) and marks granularity `block`/`unknown` per
`C58 §1.11`, or (b) refuses to parcel-bind and ships it as **context only**. A `12,5 m` that is right
for the zone but attached to the wrong parcel is the L-526 failure with a legal-liability multiplier.

---

## 6 — PRODUCTION PILOT PROTOCOL (the thing that earns the go/no-go)

The mini-pilot (`L-590g`) proved feasibility on 5 documents. This protocol produces a **real precision
number per quality tier**, the input to the build decision.

### 6.1 — Corpus + stratification (the hard cases are the point)

Sample **~300-500 individual field-extractions** (not documents — fields; a table page yields dozens),
because precision on a citeable *field* is what the product ships. Stratify by the **image-regime axis
`L-590g` measured** (not by era, which is a proxy) AND by city:

| stratum | source examples | why it's in |
|---|---|---|
| born-digital text | Córdoba `O_INDUSTRIAL` | establishes the near-100% floor (control) |
| clean raster | Córdoba `O_OA1`/`O_PAS2` | the "scan that isn't hard" — expected high, TEST the layout-trap rate |
| clean laser scan | Barcelona `89134` (1993) | prose-parameter extraction on clean image |
| **faded typewriter + table** | Barcelona `73609` (1968) | the confident-wrong table case — the one that matters most |
| **degraded photo** | oldest Barcelona `72016`-class | worst char accuracy |
| **handwritten marginalia** | **must be hunted** — `L-590g` §6 did not hit one | the amendment case the auto-gates cannot catch |

Named starting documentIds are in `L-590e` §4.3 (1956-1978 set) + the Córdoba `O_*.pdf` list
(es-an `SOURCES.md` B1). **Deliberately over-sample the bottom three strata** — the top three are
nearly solved.

### 6.2 — The setup

- **Dual pass:** commercial pipeline (Google **DocumentAI** OCR + layout) → LLM extraction (Pass A);
  **vision LLM** direct-from-image (Pass B). Same C58 field schema for both.
- **Auto-gates:** dual-pass agreement + arithmetic cross-check + range bounds + locale normaliser +
  algorithm detector (§2 stage 4).
- **Supersession gate FIRST** (§2 stage 0) — a superseded doc never enters the sample.
- **Human verification:** a **Catalan/Spanish-planning-literate** reviewer verifies **EVERY** field in
  the sample against the source crop (this is the first-few-hundred "verify everything" phase of
  `L-590f` §3), scoring each **field-correct AND correctly-attributed** — attribution errors
  (right value, wrong subzone) count as WRONG (`L-590g` §7.3). Budget ~25-40h (`L-590f` §4).

### 6.3 — The numbers that decide

Report, **per stratum**:
- **Precision** = correct-and-attributed / auto-accepted. (The number the product's honesty rests on.)
- **🔴 Confident-wrong rate** = auto-accepted-but-wrong / auto-accepted. **This is the legal-risk
  number** — a value that passed every auto-gate and is still wrong ships silently. It must be driven
  to near-zero on citeable fields, or auto-accept is off and everything is human-in-the-loop.
- **Recall** = auto-accepted / total-extractable — the throughput/cost lever (low recall = more human
  labour, not more wrong answers).
- **Human-review minutes/field** — validates the 25-40h estimate scales.

### 6.4 — Go / no-go criteria

- **GO to build** if: confident-wrong rate on citeable fields is **≤ ~0.5%** on the clean strata
  **AND** the auto-gates route essentially all faded/degraded/handwritten fields to a human (i.e. the
  pipeline *knows what it doesn't know*), **AND** review minutes/field make the per-city labour bounded.
- **CONDITIONAL GO (clean-only)** if clean strata pass but faded/degraded do not: ship
  `pipeline-extracted-unverified` for modern-consolidated cities (Córdoba-shape) and clean-raster
  subsets only; leave the old-typewriter wall to human-only curation. This is likely the realistic
  outcome and it is still a large win.
- **NO-GO on auto-accept** if the confident-wrong rate is material and the gates don't catch it —
  then the capability is a human-assist tool (crop + pre-fill), not an auto-extractor. Still useful,
  very different cost.

### 6.5 — 🔴 The depth-vs-breadth action item (`L-590f` §5, refined by `L-590g`)

Before committing the build, **count the rollout cities by CORPUS SHAPE** — the pilot found **three**,
not two:

| shape | OCR burden | example | breadth value |
|---|---|---|---|
| **A. old scanned derived-plan wall** | high (typewriter) | Barcelona clau 18/22a | depth play — expensive, one city |
| **B. modern consolidated plan, clean/near-clean ordinances** | **low** (some born-digital text!) | Córdoba PGOU-2001 | **high-leverage** — cheap, transfers |
| **C. general plan governs directly** | **none** | (measure per city) | free breadth, no pipeline |

The false choice `L-590f` §5 warned about is now sharper: **shape B is the cheap, horizontal prize**
(the pipeline pays off fastest where documents are clean and keyed to GIS calificación codes), while
shape A (Barcelona) is the expensive depth play whose value is also capped by the **parcel-binding
gap** (`L-590g` §5). **Count how many rollout cities are B vs A vs C before pricing the build** — if
most are B, the pipeline is the highest-leverage build available; if the wall is mostly A, the
calculus is much closer and the parcel-binding cost must be added.

---

## WIRING TODO (for the orchestrator / owning PR — NOT done here)

1. Apply the §3.1 diffs to `packages/schemas/src/site/zoning/ProvenanceFlags.ts` and add
   `ExtractionProvenance.ts`; regenerate any barrel exports. Add the `C58 §1.2` ordering + the
   no-silent-graduation CI gate; extend `check-zoning-confidence-label` for the louder affordance.
2. Scaffold `packages/ordinance-extraction/` (`@pryzm/ordinance-extraction`, L2) with the
   `OrdinanceEnumerator` interface + BCN/Córdoba adapters; route model calls through `ai-host`
   (P1/P8/C23).
3. Cross-link this doc from `es-ct/08019-barcelona/NEXT.md` §8 and `es-an/14021-cordoba/NEXT.md`
   — **left as a note to avoid multi-agent NEXT-file collisions** (per the shared-tree-collision
   memory; the orchestrator owns cross-jurisdiction doc edits).
4. Append a heterogeneity note to `es-an/14021-cordoba/sources/SOURCES.md` B1 (the corpus is NOT
   uniformly scanned — `O_INDUSTRIAL` is born-digital text; `L-590g` §4.1).
5. Amend `C58 §1.6` / §2.2 to name `pipeline-extracted` provenance + the new default confidence, and
   `C23` to name the extraction pipeline as a governed AI code path.

---

**Related:** `es-ct/08019-barcelona/findings/L-590g-OCR-PILOT-RESULTS.md` (the measured pilot) ·
`…/L-590f-OCR-PIPELINE-DECISION.md` (the decision) · `…/L-590c` §10.4 (supersession) ·
`es-an/14021-cordoba/` (the transfer test case) · `C57` · `C58` §1.1/§1.2/§1.4/§1.6/§2.2 · `C23` §1.1.
