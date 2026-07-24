# Makkah Region (`sa-02`) — what is true now

**Level:** region (ISO 3166-2 **SA-02**, *منطقة مكة المكرمة* Makkah Region) · **Last updated:** 2026-07-24 ·
**Maintainer:** UNASSIGNED · **Status:** container level — no regional zoning instrument.

## 1 — What governs here
Saudi residential zoning is **national** (the 2024 MOMRAH decision — see [`../README.md`](../README.md)), with
the VERTICAL extent deferred to the **municipal** approved plan and to **development-authority** regs. There
is **no region-level (SA-02) zoning instrument** in between. Per `JURISDICTION-PLAYBOOK.md` §1 a region layer
is not forced where the law is not regional; `sa-02/` exists here only as the ISO 3166-2 path segment carrying
the demo municipality, **Jeddah** ([`jed-jeddah/`](jed-jeddah/README.md), UN/LOCODE JED). Makkah Region also
contains Makkah city and Taif; only Jeddah is scaffolded in this pass.

## 2 — Pack status
No region-level pack. The pack is at the municipality level (`sa-jed-jeddah`, scaffold). See `jed-jeddah/`.

## 3 — Local override surface (why Jeddah is not just "the national footprint")
- **Amana:** Amanat Jeddah (Jeddah Municipality) — holds the approved plan; permits via the Etmam system
  (`etmam.momrah.gov.sa`).
- **Development authority:** Jeddah Development Authority (regulatory arrangements approved Sept 2023) +
  Jeddah Central Development Company — §1 cl. 3 vertical overrides.
- **Heritage overlay:** **Al-Balad (Historic Jeddah)** — UNESCO World Heritage Site (inscribed 2014), managed
  by the Jeddah Historic District Program (Ministry of Culture) with a dedicated GIS (651 buildings assessed
  2021–22). A distinct conservation regime the national residential decision does not contain.

## 4 — Files here
- `NEXT.md` — pointer to the national overview and the Jeddah record.
- `jed-jeddah/` — the Jeddah demo municipality (scaffold).
