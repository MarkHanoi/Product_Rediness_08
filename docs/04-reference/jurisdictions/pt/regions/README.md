# Portugal — District folders (routing layer only)

> **This is NOT a legal routing layer.** Portugal's zoning law is national → municipal
> (RJIGT/DL 80/2015 → DR 15/2015 → PDM). There is no regional-law intermediate equivalent to
> Spain's Comunidades Autónomas or Germany's Länder — the district (distrito) is purely an
> administrative division, not a legal authority for planning.
>
> The district folders (`pt-11/`, `pt-13/`, `pt-03/`, etc.) exist **only** to organise the
> ~308 municipality sub-folders using the ISO 3166-2 prefix that mirrors the DICOFRE code structure
> (DICOFRE first 2 digits = district number). This prevents a flat `pt/` folder with 308
> sub-folders.
>
> Per JURISDICTION-PLAYBOOK §2: "Flat where the law is flat. A country whose zoning is national
> may hold its findings at the country level and add the region/municipality layers only when a
> local instrument actually governs." Portugal's district layer does not satisfy that test — it
> is added here as a DICOFRE organisational aid, NOT as a law-follows-the-region routing decision.

## Active district folders

| ISO 3166-2 | District name | Municipalities studied | Status |
|---|---|---|---|
| `pt-03` | Braga | `0303-braga` | STUB — research only |
| `pt-11` | Lisboa | `1106-lisboa` | STUB — research only |
| `pt-13` | Porto | `1315-porto` | STUB — research only |

Other districts are added when a municipality within them is actively worked. Do NOT pre-create
empty district folders.

## DICOFRE code format

```
DICOFRE (6-digit): DD MM FF
  DD = district number (01–18 mainland, 20 = Açores, 30 = Madeira)
  MM = municipality number within district (01–NN)
  FF = parish (freguesia) number within municipality (01–NN)

For municipality-level folders, use 4 digits (DD MM), zero-padded:
  0303 = Distrito de Braga (03), Município de Braga (03)
  1106 = Distrito de Lisboa (11), Município de Lisboa (06) — VERIFY
  1315 = Distrito de Porto (13), Município de Porto (15) — VERIFY
```

⚠ The DICOFRE codes above are approximate (derived from district numbering conventions) and have
**NOT been verified against the official DICOFRE register**. Before creating any municipality
folder, confirm the DICOFRE at the official INE register (`ine.pt`) or the SNIG municipality
layer. An incorrect DICOFRE in a folder name will break any DICOFRE-keyed pipeline join.
