# SPAIN CATASTRO 3D AS-IS INVESTIGATION (founder brief, 2026-09-01)

> Captured per the research-to-repo rule. Finding: the Dirección General del Catastro
> provides substantially richer building information than previously assumed — INSPIRE
> Building GML/WFS · FXCC · FXCC by significant floors · KML by floors · cadastral building
> geometry · cadastral floor/use information · a public 3D Catastro viewer. Investigate as a
> potential AUTHORITATIVE SPANISH AS-IS BUILDING SOURCE for Pryzm.

## Determine
1. Exactly what geometry is machine-readable WITHOUT authentication.
2. Exactly what each channel yields: INSPIRE Building WFS · Building GML · FXCC · FXCC by
   floors · KML · KML by floors.
3. Whether FXCC/KML-by-floor is programmatically retrievable AT SCALE: CAPTCHA · rate
   limits · access restrictions · terms/licensing · public API/service existence · bulk
   access existence.
4. What the 3D model actually represents: footprint · floor count · floor geometry · floor
   heights · roof geometry · basement · internal cadastral units · uses · constructed area.
5. Geometric accuracy and known limitations.
6. Whether detailed floor geometry reconstructs into a Pryzm canonical 3D building WITHOUT
   scraping the viewer.
7. Compare against Overture · EUBUCCO · available Spanish LoD2.
8. Whether Spain's source priority should become:
   Catastro → national/regional LoD2 → Overture → EUBUCCO/fallback.
9. Whether Catastro exposes ANY machine-readable planning designation / permitted
   buildability / max height / setbacks / alignment / envelope / zoning / constraints.
10. If not, the closest official Spanish machine-readable planning sources to combine with
    Catastro parcels for Pryzm-computed envelopes.

## Constraints
NO Site-Intel architecture redesign. NO implementation. The 3D viewer is NOT assumed to be
an API. Classify every finding: A authoritative machine-readable · B downloadable but
access-constrained · C visual-only viewer · D derived geometry Pryzm could calculate.

## Output — a concise technical decision memo
A. What Catastro actually gives Pryzm · B. What can be automated · C. What cannot/should
not be automated · D. Recommended Spain AS-IS source hierarchy · E. Whether this changes
E5 · F. What Catastro does NOT provide for buildable envelope · G. Best official planning
sources to combine with it · H. Minimum implementation required.
Do not build until this investigation is complete.
