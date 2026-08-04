# Andalusian Capitals — Municipality-by-Municipality Forensic Audit (regional conclusion)

> **Status:** SNAPSHOT, taken 2026-08-03 at `HEAD=fb7b6f71`. All facts sourced from
> `git show HEAD:<path>` or direct `git grep HEAD` — the working tree carries ~6,640 unrelated
> uncommitted deletions, so disk reads were treated as unreliable this session.
>
> Full 16-dimension per-municipality audits live in each city's own `findings/` folder:
> [Córdoba](./14021-cordoba/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Málaga](./29067-malaga/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Sevilla](./41091-sevilla/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Granada](./18087-granada/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Jaén](./23050-jaen/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Almería](./04013-almeria/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Cádiz](./11012-cadiz/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
> [Huelva](./21041-huelva/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md)
>
> Related: [`ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md`](./ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md)
> (repo-wide, all jurisdictions) · the Andalucía generalization RFC (commissioned same day, findings
> folded in below) · [`ENVELOPE-CAPABILITY-MATRIX.md`](../../ENVELOPE-CAPABILITY-MATRIX.md).

**Confirmed directly for this audit**: only **Córdoba** has a registry entry and a dispatch branch.
Sevilla's only code reference is one incidental comment in a shared street-width file. Málaga,
Granada, Jaén, Almería, Cádiz, Huelva have **zero** code hits anywhere in `rulepacks/`, `providers/`,
or `server/`.

## Status summary

| Capital | Implementation | Dispatch | Root blocker | Smallest unlock |
|---|---|---|---|---|
| Córdoba | Verified, refusal-only | Reaches gate, no compute path | Engineering | Compute branch, 1-2 hrs |
| Málaga | Research only | Falls to fabricated estimate | External authority (Oracle lock) | Contact Ayto. Málaga |
| Sevilla | Research only, strongest position | Falls to fabricated estimate | Research (CRS, schema) | Re-probe endpoint, ~afternoon |
| Granada | Scaffold only | Falls to fabricated estimate | Research | First discovery pass, weeks |
| Jaén | Scaffold only | Falls to fabricated estimate | Research | First discovery pass, weeks |
| Almería | Scaffold only | Falls to fabricated estimate | Research | First discovery pass, weeks |
| Cádiz | Scaffold only | Falls to fabricated estimate | Research | First discovery pass, weeks |
| Huelva | Negative-evidence only | Falls to fabricated estimate | Research (unaudited per ADR-0296) | Re-sweep from different network |

## Regional conclusion

**No Andalucía-specific abstraction exists, and the evidence argues against building one.**

The two municipalities with real, comparable data — Córdoba and Málaga — **fail at opposite ends of
the same pipeline**: Córdoba has working routing/dispatch machinery but a subzone-key convention
(filename-encoded) that is publisher-specific and non-transferable; Málaga has a richer parameter
corpus (90% height coverage, the region's only alignment layer) but zero routing, blocked at the
data-access layer. Their GIS stacks are also structurally different — Córdoba's geometry comes from a
third-party professional college (COACo), Málaga's from the municipality's own GeoServer, Sevilla's
from ArcGIS REST entirely. Confirmed directly this session: Córdoba's `resolveCordobaSubzone.ts`
key-extraction logic (`subzoneCodeFromLink`, a regex over a `O_*.pdf` filename convention) has no
analogue in Málaga's or Sevilla's schema, and does not port.

**The reusable abstraction is publication-container-based, not region-based** — and this is not a
novel conclusion reached from this audit alone; it's already ratified in the repository as
**ADR-0294** (*"Spain is organised parcel → municipality → instrument → detailed zoning → rule, NOT
by autonomous community. The CCAA is the unit of legal corpus and signature; it is not the unit of
geometry publication"*) and **ADR-0295** (*"A region is not a thing that succeeds or fails. It is
five capabilities that succeed or fail independently... NO REGION-SPECIFIC BRANCHING INSIDE THE
ENGINE. A region supplies providers; it is not a code path."*). The three real container types
identified across these 8 cities are: **GeoServer WFS** (Córdoba, Málaga — same protocol, different
data models), **ArcGIS REST** (Sevilla — no existing PRYZM adapter for this shape at all), and
**unknown/unreachable** (Granada, Jaén, Almería, Cádiz, Huelva — 5 of 8 capitals with no evidence in
either direction).

The one region-wide dataset that does exist — the mandated Andalucía Normas Directoras schema
(*Orden de 18 de febrero de 2026*, BOJA 37) — was checked in a separate investigation this session
and fails on two independent, measured grounds: its GeoPackage schema carries FAR/density fields but
**zero height, setback, or depth fields** (*"a dataset can be 100% conformant to the standard and
still be incapable of producing an envelope — the standard normalises the RATIO layer, not the FORM
layer"*), and the actual data corpus published against it is **zero rows** — the mandate is
forward-only, binding on instruments not yet approved.

## Practical order of leverage

1. **Córdoba's 1-2 hour compute-branch fix** ships immediately on already-spent verification — the
   single highest-ROI action in the entire region.
2. **Sevilla's CRS/schema re-probe** is a cheap unblock toward the region's first ArcGIS-container
   proof, worth building deliberately as a reusable container type rather than a one-off.
3. **Málaga's Oracle unlock** is a founder-owned external request, not engineering, but worth
   pursuing given it's the richest parameter corpus *and* the region's only alignment layer once
   unblocked.
4. **Granada/Jaén/Almería/Cádiz** genuinely need first-contact discovery passes before anything else
   is possible.
5. **Huelva's "no data" conclusion should be re-tested per ADR-0296** before being treated as
   closed — it hasn't yet met that standard's own evidentiary bar (a positive control confirming
   other Huelva services resolve has not been run).
