# E1 ARCHITECTURE GATE BEFORE E1b/E1c (founder brief #2, 2026-09-01)

> Captured per the research-to-repo rule. Extends E1A-CHALLENGE-BRIEF.md (whose review is
> in flight: §1 JSON-Logic, §2 applicability shapes, §4 source/evidence, §5 confidence are
> covered there). THIS brief adds §3 spatial-rule examples, §6 temporal validity, §7 the
> European Data Registry question, §8 partial-data-is-normal, §9 the country-adapter
> boundary, §10 the 20-parcel architecture test definition — and the DECISION format A–F.
> Closing directive: once this gate completes, proceed directly with the approved E1b/E1c.

## §1 RULE ≠ JSON LOGIC (covered by challenge §1)
JSON Logic must be one executable/carrier representation, never the canonical semantic
representation. The canonical model must represent rules from XPlanung, Plandata,
IMOW/STOP-TPOD, Swiss systems, Spanish GIS, GPU/PLU, natural-language regulations,
geometry-based restrictions, conditionals, exceptions, temporal rules — without making
JSON Logic the ontology. No unnecessary abstractions.

## §2 APPLICABILITY (covered by challenge §2/§3, extended)
"Why does Rule X apply to Parcel Y?" across: entire parcel · zoning area · sub-area ·
building field · frontage · building line · setback area · overlay · heritage area ·
intended use · date/version · plan hierarchy · exception. Smallest possible conceptual
extension if the model cannot; do NOT auto-implement.

## §3 SPATIAL RULES (new)
Representable?: "Max height = 18m" · "Max height = 18m within this building field" ·
"Min setback = 5m from this boundary" · "Max height depends on distance from the street" ·
"Coverage differs between two spatial portions of the same parcel" · "An environmental
restriction removes only part of the otherwise buildable envelope." The envelope engine
receives deterministic spatial constraints; the source rule may be GIS, structured, or
document.

## §4 SOURCE / EVIDENCE (covered by challenge §4, plus)
Do NOT build a new evidence system if the existing attribution system already provides
the capability.

## §5 CONFIDENCE (covered by challenge §5)
Authority / derivation / AI / human validation / uncertainty stay distinct; no single
numeric score as a provenance substitute.

## §6 TEMPORAL VALIDITY (new)
"What applied on 2025-01-01?" vs "what applies today?" — plans, rules, evidence, source
versions, applicability all eventually evaluable in time. Do not overbuild history; do
ensure the architecture does not PREVENT it.

## §7 EUROPEAN DATA REGISTRY (new)
Does Pryzm need a small machine-readable Source Registry (country, authority, dataset,
theme, API/download, format, licence, coverage, update frequency, machine-readable
status, commercial-use status, adapter status)? Registry = WHAT EXISTS; adapters = HOW TO
CONSUME. Recommend: immediate implementation or later lane.

## §8 PARTIAL DATA MUST BE NORMAL (new)
Parcel ✓ · Buildings ✓ · Planning ✓ · Height ✗ · FAR ✓ · GFA DERIVED — the site must not
fail because one parameter is unavailable. Unknown stays explicitly unknown. NEVER infer
0 / unlimited / no-restriction from missing data.

## §9 COUNTRY-ADAPTER BOUNDARY (new)
Adapters contain ONLY: source discovery, fetching, schema mapping, country semantics,
document extraction. NOT: generic envelope geometry, generic FAR calculation, generic
applicability, generic confidence, generic provenance, generic development-potential.
Flag any business logic appearing in an adapter (including the stopped E1d draft).

## §10 20-PARCEL ARCHITECTURE TEST (new — DEFINE, do not implement)
Across DK, EE, DE, CH, ES, FR, NL, PT, LT, PL: define what each parcel must prove —
parcel → contextual data → planning source → applicable plan → applicable rule →
evidence → deterministic constraint → envelope → development potential — each step
recorded DIRECT / DERIVED / AI / HUMAN / MISSING.

## DECISION REQUIRED — return exactly
A. SAFE TO CONTINUE (what proceeds immediately) · B. ARCHITECTURAL RISKS (resolve before
E1b/E1c hardens) · C. MINIMUM CHANGES (only genuinely required) · D. FREEZE (stable
contracts) · E. DEFER (deliberately not built yet) · F. REVISED E1b/E1c (smallest plan
modification).

Objective: build the minimum European Site-Intel core that can consume heterogeneous
authoritative sources and turn them into traceable, deterministic development
constraints. No speculative architecture. Then proceed directly with approved E1b/E1c.
