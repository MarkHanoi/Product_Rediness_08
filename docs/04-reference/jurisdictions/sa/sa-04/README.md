# Eastern Province (`sa-04`) — what is true now

**Level:** region (ISO 3166-2 **SA-04**, *المنطقة الشرقية* Eastern Province) · **Last updated:** 2026-07-24 ·
**Maintainer:** UNASSIGNED · **Status:** container level — no regional zoning instrument.

## 1 — What governs here
Saudi residential zoning is **national** (the 2024 MOMRAH decision — see [`../README.md`](../README.md)), with
the VERTICAL extent deferred to the **municipal** approved plan and to **development-authority** regs. There
is **no region-level (SA-04) zoning instrument** in between. Per `JURISDICTION-PLAYBOOK.md` §1 a region layer
is not forced where the law is not regional; `sa-04/` exists here only as the ISO 3166-2 path segment carrying
the demo municipality, **Dammam** ([`dmm-dammam/`](dmm-dammam/README.md), UN/LOCODE DMM). Eastern Province
also contains Al-Khobar and Dhahran (the Dammam metropolitan triad); only Dammam is scaffolded in this pass.

## 2 — Pack status
No region-level pack. The pack is at the municipality level (`sa-dmm-dammam`, scaffold). See `dmm-dammam/`.

## 3 — Local override surface (why Dammam is not just "the national footprint")
- **Amana:** Amanat Eastern Province (Eastern Province Municipality) — holds the approved plan; sets the
  exact floors/height/commercial-street setbacks per planning zone (§4.1).
- **Development authority:** ordinary municipal fabric plus any Eastern-Province development-authority zones
  (§1 cl. 3 overrides where present). No UNESCO-scale heritage overlay identified for Dammam — structurally
  the **cleanest** of the three cities studied (national footprint + a single municipal vertical layer).

## 4 — Files here
- `NEXT.md` — pointer to the national overview and the Dammam record.
- `dmm-dammam/` — the Dammam demo municipality (scaffold).
