# FORENSIC BLOCKER AUDIT — Huelva (INE 21041), 2026-08-03

> Part of a full 8-capital Andalucía audit. All facts sourced from `git show HEAD:<path>`
> (HEAD=`fb7b6f71`) — the working tree has ~6,640 unrelated uncommitted deletions, disk reads treated
> as unreliable this session.
> Regional conclusion and sibling audits: [`../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md).

1. **Implementation status**: **Research only — the one negative-evidence case in the region.**
2. **Planning source**: Unknown.
3. **Geometry source**: **Actively probed and found unreachable** — a 13-host sweep found 12 DNS
   failures; `sig.huelva.es` specifically DNS-fails (matching the pattern later formalized in
   Huesca's audit). Only `www.ayuntamientohuelva.es` resolved, and it isn't a GIS service.
4-10. **Parcel source / zone classification / ordinance structure / machine-readable parameters /
   alignment / overlays / CRS: Unknown**, all axes — the negative host sweep didn't reach the point
   of investigating content.
11. **Existing PRYZM implementation**: None.
12. **Dispatch status**: Does not reach dispatch — falls to `applyEstimatedZoning`, fabricated
    estimate.
13. **Root blocker**: **Research**, with one nuance: per `ADR-0296` (this session's own standard —
    "not published" is a claim about the search, not the world), a 12/13-host DNS failure is **not
    yet a validated absence conclusion**. It's a `STRONG`-at-best discovery-confidence token, not
    `VALIDATED` — a positive control (confirming other Huelva provincial/regional services *do*
    resolve) hasn't been documented, and per ADR-0296 that control is mandatory evidence before
    treating this as closed.
14. **Smallest unlock**: Re-run the host sweep from a different network (mirroring the exact fix
    Huesca's identical DNS-failure pattern needs) and add the missing positive control, before
    concluding Huelva genuinely publishes nothing.
15. **Reuse analysis**: Cannot be assessed — UNKNOWN.
