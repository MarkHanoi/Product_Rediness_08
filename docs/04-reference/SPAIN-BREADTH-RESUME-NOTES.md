# Spain-breadth wave — RESUME NOTES (agents killed by weekly API limit, 2026-07-23)

**Seven agents (Barcelona, Valencia, Sevilla, Zaragoza, Córdoba, Denmark, Saudi) were terminated
mid-investigation by the account's WEEKLY API usage limit ("resets 9am Europe/London"), before any
wrote its findings docs.** Their live discoveries (from the transcripts) are captured here so the
post-reset relaunch resumes instantly instead of re-deriving. **None of this is committed code/docs —
it is a resume ledger.** Tier: each line is `VERIFIED-LIVE` (the agent reached the endpoint) unless
marked. Verify before relying.

## Valencia (INE 46250, es-vc) — ⭐ strongest partial: a shape-B DATA city
- **WMS `GetFeatureInfo` works at a point** on the Ajuntament de València planning WMS (the agent hit
  it live). **This is queryable calificación data — likely a shape-B win.**
- **The derived-planning-share measurement method is FOUND:** the polygons carry **`expediente`** and
  **`denominaci`** attributes. Sample: `expediente=19880578` → **PGOU 1988**, `denominaci='Plan general'`
  → **directly governed** (not derived). ⇒ tally all Valencia polygons by `denominaci`/`expediente`
  (propertyName to drop geometry) to get the directly-governed vs derived split (the Barcelona-63% /
  Madrid-35% axis). **RESUME: pull the full attribute table, tally by instrument.**

## Sevilla (INE 41091, es-an) — partial
- The Sevilla calificación viewer has a **"Calificación del suelo" theme**. **RESUME: extract the
  service URLs from the viewer's layer config (the JS bundle) — same technique that cracked Córdoba's
  COACo GeoServer.** Likely a Gerencia de Urbanismo de Sevilla or COA-Sevilla backend.

## Zaragoza (INE 50297, es-ar) — partial
- The **IDEZar** viewer references backends **`siuaAPI`, `siuaback`, `SIUa_WMS`**. **RESUME: extract
  the full URLs from the bundle and probe `SIUa_WMS` GetCapabilities for a calificación layer.**
  IDEZar is one of Spain's most advanced municipal SDIs — high chance of a shape-B win.

## Barcelona (es-ct) — minimal
- Re-confirmed L-590c: **63.95 M m² is `PLAN='PD*'` (62.8%)**. Was about to run the PD-land-by-clau ×
  parametrised-sector join. **RESUME: the existing-data supersession measurement (per the L-590i
  no-vectorisation brief) — how much of the derived 63% is already answered by the consolidated refós
  with text values.**

## Córdoba (es-an) — minimal
- Baseline 585 tests confirmed. Was probing whether any COACo layer's extent **exceeds the 2-district
  pilot bbox**. **RESUME: per-layer extent probe + the Ajuntament/Junta SITUA/SIU coverage hunt.**

## Denmark (dk) — minimal
- Was mid-build on the text-pull path + examining the `@pryzm/ordinance-extraction` gates
  (`localeGate`, `rangeSanityGate`) and the package dependency wiring. **RESUME: wire the doklink
  text-pull enumerator + the byggefelt→coverage L0 field (the one schema edit Denmark owns).**

## Saudi (sa) — 1 salvageable stub
- Wrote **`packages/site-parcel-data/src/providers/saudiBbox.ts`** (a national bbox provider — inert,
  uncommitted, in worktree `agent-a772161c45c88549a`). Was updating the pack WIRING TODO + docs.
  **RESUME: finish the ready-to-apply registry/dispatch wiring patch + the sign-off-ready
  VERIFICATION.md; the national footprint is one orchestrator patch + one human sign-off from
  shippable, country-wide.**

---

## Relaunch plan (after the 9am Europe/London reset)
1. Relaunch all seven from **current `main`** (they'll branch from the pushed HEAD — current, not
   stale). Feed each its resume line above so it skips the re-derivation.
2. Priority order by expected payoff: **Valencia + Zaragoza** (probable shape-B DATA wins) → **Sevilla**
   (viewer-backend crack) → **Denmark + Saudi** (completion wiring) → **Barcelona** (existing-data
   supersession) → **Córdoba** (coverage hunt).
3. Generate each jurisdiction's `SOURCE.md` (playbook §3.3b) as it lands.

**Cause, stated plainly:** not a code or agent failure — an account weekly-usage cap. Everything
already committed (585 tests green, v1073 live, 18 commits pushed) is unaffected.
