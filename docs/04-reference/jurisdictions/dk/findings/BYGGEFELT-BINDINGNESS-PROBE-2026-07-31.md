# DK — Byggefelt bindingness is MACHINE-READABLE (verified probe, 2026-07-31)

> **Status: VERIFIED-LIVE.** Every number below came from a request this repo actually issued, on
> 2026-07-31. All queries are reproducible and reprinted verbatim in §5 — re-run them before building
> on them.
>
> **This closes the G3/G6 tier-1 gate that was classified `non-retryable`.** It was closed by probing
> published metadata, **not** by a legal opinion. That reversal is the transferable lesson (§6).

---

## §1 — The question that was blocking

The DK placement resolver (`packages/site-parcel-data/src/rulepacks/dkEnvelopePlacement.ts`, shipped
`6250193f`, on main) ranks placement evidence:

```
byggefelt → byggelinjer → cited lokalplan depth → block study → REFUSE
```

**Tier 1 was deliberately gated shut.** `vedtaget` means *adopted*, which is not the same as
*binding*, so tier 1 fired only on proven bindingness — and the honest `'unknown'` fell straight
through. It was classified **non-retryable**: no amount of re-fetching makes an advisory field
binding. The working assumption was that only a Danish planner (or a 100-lokalplan text-classification
study) could answer it.

**That assumption was wrong.** The register publishes the answer as a boolean.

## §2 — The finding

`DescribeFeatureType` on `theme_pdk_byggefelt_vedtaget` at `https://geoserver.plandata.dk/geoserver/wfs`
exposes two booleans nobody had read:

| Field | Danish | Meaning |
|---|---|---|
| **`bygkunifelt`** | *byggeri kun i felt* | building **only within** the field → **binding** |
| **`bygvejledende`** | byggefelt er *vejledende* | the field is **advisory/indicative** → illustrative |

Every sampled feature also carries **`doklink`** — a direct URL to the source lokalplan PDF
(e.g. `https://dokument.plandata.dk/20_2830916_1409662252522.pdf`). **The citation chain is free:**
geometry → legal-status flag → source document.

⚠ The reading of the Danish field names is a strong inference from the name **plus** the observed
mutual-exclusivity pattern in the data. It is **not** confirmed against Plandata's published data
specification / UML model. **That confirmation is still outstanding** — see §7.

## §3 — National distribution — n = 57,035 adopted byggefelter

| State | Filter | Count | Share |
|---|---|---:|---:|
| **BINDING** | `bygkunifelt=true AND bygvejledende=false` | **13,629** | **23.9 %** |
| **ADVISORY** | `bygvejledende=true` (excl. the 179 below) | 36,921 | 64.7 % |
| **NEITHER** | both `false` | 6,101 | 10.7 % |
| **CONTRADICTORY** | both `true` | 179 | 0.31 % |
| **NULL / unaccounted** | flags absent | 205 | 0.36 % |

### ⚠ A 60-row sample said the opposite — recorded as a caution

An initial unfiltered `count=60` GetFeature returned **53/60 binding (88 %)**. The true national
figure is **23.9 %** — nearly the inverse. WFS returns features in arbitrary storage order, which is
**not** a random sample. The small-sample reading was presented in-session before the counts were run
and was wrong.

**This is the §probe-can-be-wrong-three-ways failure in miniature:** the runtime was right, the
property was right, and the *sampling* was wrong. Any future per-municipality or per-theme statistic
must use `resultType=hits` with a filter, never a head sample.

## §4 — The state machine (implement exactly this)

| Metadata | `legalStatus` | Resolver action |
|---|---|---|
| `bygkunifelt=T ∧ bygvejledende=F` | `binding` | **Tier 1** — published explicit-area geometry |
| `bygvejledende=T` | `illustrative` | lower-ranked evidence |
| both `false` | `unknown` | needs lokalplan text |
| both `true` | `unknown` (**data conflict**) | **refuse to infer**; emit as QA output |
| either `null` | `unknown` (**metadata unavailable**) | **`null` ≠ `false`** |

**Do NOT text-classify the 64.7 % advisory set.** `bygvejledende=true` is an explicit *municipal
declaration* that the geometry is advisory. Overriding it with a text heuristic would second-guess the
publishing authority — the inverse of what this architecture exists to do. They drop to weaker
evidence honestly.

**The 10.7 % `(F,F)` bucket is the correctly-scoped target for a lokalplan text parser** — it is the
subset where the register declines to classify. That is a ~6,100-record problem, not a 57,000-record one.

## §5 — Reproducing this

```bash
U="https://geoserver.plandata.dk/geoserver/wfs"

# schema
curl -sS "$U?service=WFS&version=2.0.0&request=DescribeFeatureType&typeName=theme_pdk_byggefelt_vedtaget"

# counts (resultType=hits — do NOT head-sample)
q(){ curl -sS "$U?service=WFS&version=2.0.0&request=GetFeature&typeName=theme_pdk_byggefelt_vedtaget&resultType=hits${1:+&CQL_FILTER=$1}" \
     | grep -oE 'numberMatched="[0-9]+"'; }
q ''                                                    # 57035
q 'bygkunifelt%3Dtrue%20AND%20bygvejledende%3Dfalse'    # 13629
q 'bygvejledende%3Dtrue'                                # 37100  (incl. the 179 both-true)
q 'bygkunifelt%3Dfalse%20AND%20bygvejledende%3Dfalse'   #  6101
q 'bygkunifelt%3Dtrue%20AND%20bygvejledende%3Dtrue'     #   179
```

No auth. No API key. Public WFS.

## §6 — The transferable lesson: metadata-first acquisition

This question was one probe away from an answer and was about to be escalated to a Danish planner plus
a 100-lokalplan corpus study. **Standing sequence for every new jurisdiction, in this order:**

1. Inspect the **GIS schema** — WFS `DescribeFeatureType`, ArcGIS `?f=json`, OGC API.
2. Inspect **INSPIRE / ISO 19139** metadata — `LegalSpace`, `PlanningZone`, `SupplementaryRegulation`,
   `OfficialDocument`, `planStatus`, `validFrom`, `legalDocument`, `derivedFrom`.
3. Hunt explicitly for **legal-status attributes** (binding vs indicative).
4. **Only then** plan a document parser.

Denmark is the first jurisdiction where **`legalStatusSource = "metadata"`**. Expected siblings:
Madrid `"statute"` (the PGOUM determines legal force), Germany `"plan_text"` (the B-Plan wording
determines whether a Baugrenze/Baulinie binds). The resolver consumes `legalStatus` and never learns
*why* — which is what lets producers be added per country without new resolver logic.

Nordic analogues to probe the same way: **SE `Byggrätt` · FI `Rakennusala` · NO `Byggegrense`**.
(Note SE/FI carry the same identity-bootstrap gate as DK's MitID — see
[[identity-bootstrap-gate-offline-legislation-pattern]].)

## §7 — Open, and what would close it

| # | Open item | Cost |
|---|---|---|
| O1 | **Confirm the field semantics against Plandata's published data specification / UML model.** §2's reading is inference from names + data pattern, not documentation. | one doc read |
| O2 | **Parcel-side coverage.** 13,629 is a **feature** count. A parcel may intersect zero or several, and byggefelter cluster in recently-planned areas. The operational KPI is *"X % of cadastral parcels intersect ≥1 binding byggefelt"* — a different query with a different denominator. **Do not let 23.9 % be quoted as parcel coverage.** | one spatial join; blocked on parcel geometry (Matriklen is MitID-gated — an OSM proxy must be labelled a proxy) |
| O3 | The **179 contradictory** records — publish as a QA list; do not silently resolve. | trivial |
| O4 | Same probe for **`theme_pdk_byggelinje_*`** — does it carry an equivalent flag? Tier 2 has the same question. | one `DescribeFeatureType` |
| O5 | Whether `bygkunifelt` is populated **consistently across kommuner** or concentrated in a few — a national 23.9 % could hide "5 kommuner do this properly". | per-`komnr` counts |

## §8 — Evidence chain (G11 pattern)

| # | Claim | How obtained | Date | State |
|---|---|---|---|---|
| B1 | `bygkunifelt` / `bygvejledende` exist on `theme_pdk_byggefelt_vedtaget` | live `DescribeFeatureType` | 2026-07-31 | **VERIFIED-LIVE** |
| B2 | National counts (§3) | `resultType=hits` + `CQL_FILTER`, 6 queries | 2026-07-31 | **VERIFIED-LIVE** |
| B3 | `doklink` present on every sampled feature | `GetFeature count=60`, 60/60 | 2026-07-31 | **VERIFIED-LIVE** (sample, not exhaustive) |
| B4 | Danish semantics of the two field names | inference from name + observed exclusivity | 2026-07-31 | **ASSERTED-UNVERIFIED** → O1 |
| B5 | Parcel-side coverage | — nothing computed — | — | **UNKNOWN** → O2 |

*Related: `DENMARK-GAP-ROADMAP.md` G3/G6 · ADR-0279 · [[envelope-replication-standard]] ·
[[context-data-honesty-family]] · [[probe-can-be-wrong-three-ways]].*
