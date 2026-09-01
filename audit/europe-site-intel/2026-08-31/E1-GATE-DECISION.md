# E1 ARCHITECTURE GATE — THE A–F DECISION (per E1B-GATE-BRIEF, 2026-09-01)

> Synthesis of `E1A-CHALLENGE-VERDICT.md` (A–H, three reviewers, every citation spot-checked)
> and `impl/e1a-gate-supplement.md` (§3/6/7/8/9/10). Assessment: **REVISE BEFORE E1b** —
> REDESIGN ruled out (every probed construct in all eight systems maps); APPROVE ruled out by
> four demonstrated first-five-country wrong-number/dangling-reference paths, three already
> committed in this tree. Executed under the founder's standing delegation ("take the
> decisions on me as per whatever is the most architecturally sound") + the gate brief's
> closing directive ("once this gate is complete, proceed directly").

## A · SAFE TO CONTINUE
Everything on the verdict's FREEZE list (§H): the six-tier confidence enum, the UNKNOWN≠0≠
no-limit machinery, the eight-field legal address, the temporal spine, the carrier doctrine
(JSON-Logic is never the ontology — confirmed), the 17-entity roster, the imported national
vocabularies, NativeCrsGeometry. The stopped E1b draft (`ruleformat.ts`) SURVIVES as the
schema seat (marked experimental until golden parity); the stopped E1d Estonia draft SURVIVES
— the §9 boundary audit gave it a clean bill on all six forbidden items and called it the
exemplar. Spatial rules: 6/6 of the brief's examples EXPRESSIBLE today. Temporal: both
queries pass the does-not-prevent bar. Partial data: the doctrine is ENCODED (null parseable
only at tier 6, tested both directions).

## B · ARCHITECTURAL RISKS (resolve before E1b hardens — all demonstrated, none hypothetical)
1. **DK denominator without a typed seat** — the model's own fixture rides `bebygpctaf=4` in a
   declared never-load-bearing note; the live Aarhus `af=1` row makes a typed-fields-only
   consumer compute WRONG GFA while every field parses clean.
2. **`geometryRef` dangles** — no referent among the 17 entities, and the first live producer
   (EE draft) already minted unresolvable strings; NL `locatieRefs` hits the same seam next.
3. **Legal vs ingestion dates machine-indistinguishable** — point-in-time queries return
   confident false negatives exactly where states served no validity axis.
4. **Use-scope machine-invisible** — per-use conditionality encoded as an id suffix + free text.
Plus two supplement structural notes: envelope-solid `maxHeightM:null` overloads
"no published limit" with "unknown" (tier-6 ⇒ no null-capped solids guard, evaluator-side);
`DevelopmentPotential` lacks a time anchor (additive fields).

## C · MINIMUM CHANGES — the R-batch, ONE schema change-set, then frozen
R1 typed Applicability VALUE OBJECT on Rule (basis[] typed refs incl. parcel · inline geometry
· useScope[] verbatim national tokens · nullable rank {scheme,level} · condition) + the
companion contract sentence: every cited reference MUST resolve to a minted entity.
R2 optional typed value-basis qualifier {scheme,code} on provenance (DK denominator, EE datum,
LT unit caveat) — mapping in adapters only, never at L0.
R3 `validityBasis: 'legal'|'ingestion'` beside valid_from/valid_to.
R4 extend EvidenceRefKind with zone|prescription|restriction|plan|parcel.
R5 nullable open-string normative-force field (authoritative-but-ambiguous honestly encoded).
Non-schema: document the tier enum as a PROJECTION of the real axes + refine-reject incoherent
pairs. NOTHING ELSE (verdict §F's do-not-add list binds: no new independent Applicability
entity, no seventh tier, no numeric score, no harmonised use taxonomy at L0, no DSL).

## D · FREEZE
Verdict §H verbatim — frozen concepts change henceforth only by superseding ADR; the R-batch
joins the freeze the day it lands. The E1b fact vocabulary joins the freeze at golden parity.

## E · DEFER (deliberately not built yet)
Everything in verdict §E LATER (each with its named trigger — e.g. body dialect tag waits for
the first geometric construction; DE höhenangabe structure waits for the XSD probe; the
Locatie entity escalation waits for the NL STTR probe) + §F NEVER items + OME2 registry rows
until its licence text is fetched (founder item). Historical versioning stays does-not-prevent
— no history store now.

## F · REVISED E1b/E1c (= WAVE E4, executing now)
Verdict §G verbatim: Step 0 the R-batch FIRST (no canonical record emitted before it); then
E1bc (typed evaluator at L2, fact vocabulary frozen with it, precedence engine-side on R1
rank, tier-6 envelope guard, Barcelona es-08019 golden parity — TS pack live until 100%) and
E1d rework (5 named items: mint cited Prescriptions, validityBasis:'ingestion', useScope,
point-on-surface instead of ringCentroid, fetchChain signature reconciled) in parallel; the
Source Registry NOW-thin (4 nullable columns + per-country data modules, no fetching, no UI);
the week-1 probe register (NL DSO key + one STTR tree — founder item; LT MAX_INTENS
methodology). Country order EE → NL → LT → PL, DK corrections parallel. Acceptance = the
20-parcel expected-grade baseline with its four test-wide rules.
