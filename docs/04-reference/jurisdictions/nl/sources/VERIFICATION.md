# Netherlands (`nl`) — national human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Status: OPEN for the DSO route.**

The physical-data feeds (Kadaster BRK parcel, 3DBAG height, AHN terrain, OSM context) are wired and/or
live-verified in code. The DSO "Regels op de kaart" route below this line remains unprobed — **but see
SIG-NL1**, which signs a DIFFERENT, keyless route (PDOK "Ruimtelijke plannen" WMS) discovered 2026-07-26
(§NL-NATIONWIDE) that supersedes the need to wait on DSO for `maximum bouwhoogte`/`bebouwingspercentage`/
`aantal bouwlagen`. The rows below describe the DSO route specifically and are NOT stale relative to it;
they are simply a route SIG-NL1 does not use.

| Check | Against | Verdict |
|---|---|---|
| Kadaster BRK returns a perceel | `pdok-nl` WFS (wired) | ✅ wired + live |
| 3DBAG returns measured LoD2.2 heights | `api.3dbag.nl` | ✅ live-verified (source); per-city bake unlanded |
| AHN GetCoverage returns a DTM GeoTIFF | `service.pdok.nl/rws/ahn/wcs` | ✅ live-verified 2026-07-25 |
| DSO "Regels op de kaart" returns structured rule values | live DSO API (key-gated, HTTP 401 probed 2026-07-25) | ⬜ pending — NOT the route SIG-NL1 signs |
| Omgevingswet transition status per gemeente | DSO | ⬜ pending |
| PDOK "Ruimtelijke plannen" WMS `GetFeatureInfo` returns `maatvoering` | `service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0` (keyless) | ✅ live-verified 2026-07-26 — Rotterdam 40 m / Utrecht 26 m / Groningen 24 m maximum bouwhoogte |

**Sign-off (DSO route):** still OPEN — no DSO-sourced omgevingsplan numeric value may be promoted to
pack-shippable status until a verifier signs here.

---

## SIG-NL1 · ✍ SIGNED 2026-08-26 — `NL_BESTEMMINGSPLAN_CERTIFIED`, PARTIAL (storey-derived height EXCLUDED)

> The founder's report *"I need the envelope of this parcel specifically"* on a live Amsterdam demo
> (ref ASD03 E 10155) traced to this gate sitting shut with `signature: null` since 2026-08-02
> (§UNSIGNED-GATE-DEFAULTS-SHUT) — the resolver and its keyless PDOK route were already proven live,
> but nobody had recorded the call. This is that record.

| | |
|---|---|
| **Verifier** | **the founder (repo owner)** |
| **Date** | **2026-08-26** |
| **Axis** | ENVELOPE / LEGISLATION (bouwvlak geometry + maatvoering numbers) |
| **Artefact** | `packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts` → `NL_BESTEMMINGSPLAN_CERTIFIED` |
| **Value** | **`true`** — flipped 2026-08-26 **on this signature**, PARTIAL |
| **Doctrine** | **B — "Evidence-bounded publication"**, [ADR-0283](../../../../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) — the same argument already accepted for Denmark's ungated entry and for Madrid SIG-M2 |

### The signature, verbatim

> **"Authorize with the sparse-fallback path excluded."** — answered against a direct choice between
> (a) authorize with the sparse-fallback path excluded, (b) hold the gate shut entirely, (c) authorize
> everything including the sparse fallback. The founder chose (a).

### What is signed, precisely

`maximum bouwhoogte (m)` / `maximum bebouwingspercentage (%)` / `maximum aantal bouwlagen`, read
DIRECTLY off the keyless PDOK "Ruimtelijke plannen" WMS `maatvoering` response — an authoritative
`published-structured` number with a stated SVBP2012 unit, live-verified at three points (Rotterdam
40 m, Utrecht 26 m, Groningen 24 m). PRYZM transcribes no ordinance text for this route; it reads a
number the Dutch planning authority itself publishes machine-readable, nationwide, keyless. This
covers BOTH resolver outcomes discriminated by `ringSource`: a resolved `bouwvlak` (precise footprint,
`structured` confidence) and a resolved `bestemmingsvlak` zone extent WITH a real published metre
height (`estimated-ruleset` confidence, footprint is an upper bound — but the height itself is real).

### What is explicitly EXCLUDED — read this before touching `NL_STOREY_DERIVED_HEIGHT_CERTIFIED`

**Not signed:** a height DERIVED by PRYZM from a published storey count (`aantal bouwlagen × an
assumed ~3.0 m/floor`) when the zone publishes NO metre height. That derivation is PRYZM's own
engineering approximation, not the authority's published determination — the founder's authorization
was explicit that this path stays excluded. It is gated on the SEPARATE, still-shut
`NL_STOREY_DERIVED_HEIGHT_CERTIFIED` flag (`resolveNlBestemmingsplan.ts`), so the two decisions cannot
be conflated by a future reader. A parcel that would need this derivation still gets its real,
published FOOTPRINT geometry — only the derived HEIGHT number is withheld, honestly, naming the
storey count that was published and the derivation that was not authorised.

### Reopening `NL_STOREY_DERIVED_HEIGHT_CERTIFIED`

Requires its own signature, separate from this one: either an accepted floor-to-floor constant with a
cited planning-practice basis, or reading a per-plan storey height where the plan itself states one
(rather than assuming a constant nationwide).

**Sign-off (SIG-NL1 scope only):** SIGNED, PARTIAL. The DSO route above this line is UNAFFECTED and
remains OPEN pending its own verifier.
