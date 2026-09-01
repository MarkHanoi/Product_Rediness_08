# E1a ARCHITECTURAL CHALLENGE (founder brief, 2026-09-01) — gate before E1b

> Captured per the research-to-repo rule. E1a is implemented and its purity/type/
> falsification gates pass. Do NOT modify E1a code during this review. The objective:
> determine whether the E1a canonical Site Intelligence model is sufficiently
> expressive for the heterogeneous European planning systems the audit mapped,
> BEFORE ingestion, adapters, rule extraction, or the envelope engine build on it.
> The in-flight E1bc/E1d lanes were STOPPED for this gate (their partial tree
> state is preserved, uncommitted).

## §1 JSON-Logic
Review the decision that `Rule.body` is a generic JSON carrier intended for
JSON-Logic. Determine whether JSON-Logic should remain merely an execution/
carrier representation; whether canonical `Rule` semantics should be independent
of JSON-Logic; whether BCRL, RDF/SHACL, XPlanung, IMOW/STOP-TPOD create
requirements JSON-Logic cannot represent cleanly. No code changes unless a
concrete incompatibility is demonstrated. JSON-Logic must not become the
proprietary canonical ontology of Pryzm.

## §2 Spatial applicability
Test against real European examples where a rule applies to: an entire parcel ·
a zone · a sub-area of a parcel · a building field · a building line · a
frontage · a setback distance · a particular geometry · an overlay · a portion
of a parcel · a particular intended use · a particular date/version. Can the
current entities express "this rule applies to this exact spatial portion of
this parcel because of this planning object"? If not, propose the SMALLEST
addition. No premature entities.

## §3 Applicability as first-class
The fundamental question: WHY does Rule X apply to Parcel Y? Test whether the
current model represents it cleanly across: spatial, zoning, plan hierarchy,
overlays, intended use, temporal validity, exceptions, precedence,
supersession, municipal/regional/national hierarchy. If a first-class
Applicability concept is justified, define it conceptually — do not implement
until approved.

## §4 Source vs Evidence
Source = authoritative origin; Evidence = the exact artefact supporting a
claim. Test: GIS feature attribute, WFS response, API response, PDF page,
article, paragraph, table, map geometry, scanned document, extracted text,
human validation. The model must ultimately answer "show me exactly where this
rule came from." Determine whether Evidence needs: locator, page, text span,
geometry, feature ID, URL, document version, hash, extraction timestamp. Do
not overbuild prematurely.

## §5 Confidence vs derivation vs validation
Review the six-tier confidence vocabulary. Should authority, derivation, AI
interpretation, human validation, and uncertainty remain SEPARATE concepts?
Test: (1) authoritative machine-readable value deterministically transformed;
(2) authoritative PDF value AI-extracted; (3) AI interpretation subsequently
human-validated; (4) deterministic inference from authoritative geometry;
(5) authoritative but ambiguous rule; (6) genuinely unknown value. Do not
collapse these dimensions into one numeric score.

## §6 European representation test
For DK/Plandata, DE/XPlanung, CH/ÖREB, FR/GPU-PLU, ES/Catastro+planning,
NL/IMOW, LT/ASGR, EE/detailed plans: map source concept → SiteIntel entity →
field → provenance → applicability → rule representation → geometry
representation. Identify gaps.

## §7 Canonical model principle
The model must remain: SMALL (product-required concepts only) · SEMANTIC (no
country's schema copied) · SOURCE-AGNOSTIC (country schemas live in adapters) ·
PROVENANCE-AWARE · TEMPORALLY AWARE · SPATIALLY EXPLICIT · EXECUTION-CAPABLE.

## §8 Output
A. E1a approval assessment: APPROVE AS-IS / APPROVE WITH FUTURE EXTENSIONS /
REVISE BEFORE E1b / REDESIGN · B. Current strengths · C. Architectural gaps ·
D. European edge cases exposing them · E. Proposed conceptual extensions ·
F. What should NOT be added · G. Recommended E1b scope · H. Explicit FREEZE
list (stable contracts vs experimental).

IMPORTANT: no speculative implementation. Validate the canonical model first.
