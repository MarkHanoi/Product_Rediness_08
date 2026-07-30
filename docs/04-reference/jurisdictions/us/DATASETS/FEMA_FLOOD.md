# FEMA National Flood Hazard Layer (NFHL) — US Flood Overlay

**Owner:** FEMA · **Role:** flood-zone (SFHA) development-restriction overlay · **Licence:**
Public Domain (federal) · **Confidence:** CONVERGENT-SECONDARY (not probed — pending-probe)

> National **overlay / risk** dataset. NFHL is the one national layer that materially constrains
> the buildable envelope — Special Flood Hazard Areas (SFHA) carry real development restrictions.
> It never carries parcels or base zoning. See [`../USA.md §3`](../USA.md) and the overlay-risk
> table in [`../README.md §3`](../README.md).

## What it is
- **NFHL** = FEMA's National Flood Hazard Layer: the effective FIRM (Flood Insurance Rate Map)
  flood zones — SFHA (100-year, zones A/AE/V/VE), 0.2%-annual (shaded X), base flood elevations
  (BFE), and floodways.
- **HIGH overlay risk:** building in an SFHA triggers elevation / floodproofing requirements and
  can cap or alter what the base zone otherwise allows.

## Where PRYZM uses it
- Overlay flag on the envelope: "parcel intersects SFHA → development restricted; base-zone
  envelope is incomplete without floodplain rules."
- Coastal / riverine cities (NYC, Boston, SF waterfront) — highest incidence.

## Access (pending live probe)
- FEMA NFHL free **ArcGIS MapServer / feature service** (national) — confirmed to exist; exact
  endpoint URL + query syntax + licence terms **pending probe** (open question in `README.md §7`).

## Not the payload
An overlay flag, not the base parcel/zoning answer. It **subtracts from / conditions** the
envelope; it never supplies FAR or a base height.

## Pending-probe checklist
- [ ] NFHL MapServer endpoint URL + query syntax confirmed live
- [ ] SFHA intersect test wired as an envelope overlay flag
- [ ] BFE / floodway attributes available for elevation constraints
