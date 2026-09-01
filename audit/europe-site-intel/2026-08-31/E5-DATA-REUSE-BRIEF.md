# E5 DATA-REUSE / BUILD-LESS INVESTIGATION (founder brief, 2026-09-01)

> Captured per the research-to-repo rule. E4 is complete/verified; the canonical model is
> FROZEN — no architecture reopening. E5's primary objective is NOT building European data:
> it is determining, with evidence, how much Pryzm can REUSE from existing authoritative/
> open machine-readable sources and therefore does NOT need to build. Goal: minimum Pryzm
> engineering for maximum European coverage and reliability.

## §1 Two separate problems — never conflate
A. AS-IS CONTEXT (what physically exists): parcels · footprints · heights · floor count ·
floor geometry · roof geometry · terrain · roads · water · land use · context.
B. DEVELOPMENT POTENTIAL (what can legally be built): zoning · applicable plan · permitted
use · FAR/edificability · coverage · max height · setbacks · building lines · density ·
restrictions · overlays · heritage/environmental · exceptions · temporal validity.
A-provision never implies B-provision.

## §2 Spain Catastro FIRST
(Running as the dedicated ES-CATASTRO-3D investigation — its A–H memo feeds report §B.)
A directly available · B requires transformation · C merely visual · D at-scale retrievable ·
E licence/access · F accuracy/limitations · G the Spain AS-IS source priority, explicitly
comparing Catastro vs Spanish LoD2/regional vs Overture vs EUBUCCO. No viewer scraping.

## §3 The same pattern across Europe
For each Source-Registry country: does an equivalent national/regional service exist?
Search SPECIFICALLY for: cadastral building geometry · floor-level building geometry ·
LoD2 · 3D cadastral buildings · building height · floor distribution · building use ·
cadastral 3D · national 3D building models · machine-readable building models.
Authoritative sources prioritised; plus high-quality aggregation/harmonisation projects.

## §4 Development-potential data — the four categories
1 raw planning data · 2 machine-readable planning rules · 3 parcel-specific planning
result · 4 PRECOMPUTED BUILDABLE ENVELOPE. Category 4 is the most valuable discovery —
if a country provides it, Pryzm should NOT recreate it. Search: zoning APIs · planning
WFS/WMS · zoning GML · planning-rule APIs · national planning registers · municipal APIs ·
machine-readable building regulations · cadastral/planning linked datasets · automated
development-potential services.

## §5 OSS/GitHub search (recent focus)
Europe-wide building datasets · 3D building projects · cadastral harmonisation · planning
harmonisation · machine-readable zoning · building-regulation knowledge graphs · geospatial
conflation · LoD2 generation · planning APIs · open urban-planning engines. Per candidate:
project · repo · coverage · data · format · licence · activity · API/download · maturity ·
commercial usability · direct consumability. Verify actual data/API/repo, never the
website's coverage claim.

## §6 The DO-NOT-BUILD inventory (the most important output)
Per major component: 🟢 consume directly · 🟢 light normalization · 🟡 requires conflation ·
🟠 document/AI extraction only · 🔴 not available, Pryzm builds/derives. Evidence, never
assumption.

## §7 The irreducible Pryzm layer
The smallest set Pryzm must build itself. Separate: CONSUME / NORMALIZE / CONFLATE /
DERIVE / OWN AS IP — the goal is owning the last two, not rebuilding upstream.

## §8 The 20-parcel benchmark gains a "Pryzm work" column
Per parcel per stage: source · availability · licence · direct/derived/AI/human/missing ·
Pryzm engineering required · confidence. Must answer: for an address today, what % comes
from existing data vs Pryzm computation?

## §9 Do not expand the core
No schema redesign · no rival canonical entities · no second provenance system · no second
source database · no country logic in core · no manual generic-data building · no
implementing datasets because they are interesting. New sources are INPUTS to the existing
architecture.

## §10 Output — the E5 Data Reuse Report (A–J)
A Europe-wide data already available · B Spain Catastro deep dive · C other national
3D/building sources · D European open projects/repos · E machine-readable planning
sources · F existing buildable-envelope/development-potential systems · G DO-NOT-BUILD
inventory · H irreducible Pryzm work · I updated 20-parcel matrix · J recommended E5
implementation order — closing with: what Pryzm should STOP building because it exists,
and what Pryzm MUST build because it does not exist reliably elsewhere.
