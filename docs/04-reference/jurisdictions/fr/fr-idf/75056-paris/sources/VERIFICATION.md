# Paris (75056) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No live endpoint has been probed and no numeric rule value has been read from the primary source (PLU bioclimatique règlement PDF).

## Minimum checks before any pack value is shippable

| Check | Against | Verdict |
|---|---|---|
| GPU returns zone code `UG` for a Paris parcel | Live `apicarto.ign.fr/api/gpu?lon=2.3470&lat=48.8530` response | ⬜ pending |
| BD TOPO `HAUTEUR` non-null for a sample Paris building | Live WFS response — see `../../NEXT.md §8` | ⬜ pending |
| PLU bioclimatique article UG.10 read verbatim | Downloaded consolidated PDF, noting document date and modification history | ⬜ pending |
| Plan des hauteurs machine-readability confirmed | `opendata.paris.fr` or `api-sig.paris.fr` WFS capabilities search | ⬜ pending |
| ABF SUP sub-type code confirmed in GPU response | Live probe for a parcel near a classified monument | ⬜ pending |

## Caveats that must be visible in the product

- **Block-level reference surface (surface de nivellement de l'îlot):** Paris height is NOT measured from street level or sea level. The datum is a computed geometric construction from the surrounding block. The UI must clearly state the reference datum.
- **ABF perimeter:** a substantial fraction of Paris private land is within a classified monument's 500 m ABF radius. Until ABF overlay detection ships, every Paris result must carry a visible "may be subject to ABF constraints" flag.
- **PSMV:** parcels in secteurs sauvegardés (Le Marais, 1er arr, 5e–7e historically) are governed by a PSMV, not the PLU bioclimatique; the pack's result is incorrect for these parcels until PSMV detection is built.

**Sign-off:** OPEN — no values from `SOURCES.md §B` may be promoted to pack-shippable status until a verifier signs here.
