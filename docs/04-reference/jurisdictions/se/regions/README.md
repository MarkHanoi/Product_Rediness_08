# Sweden (`se`) — Regions note

> **No legal region layer is needed for Sweden.** Per JURISDICTION-PLAYBOOK §2: "depth follows the
> law, not the template." Sweden's planning law (PBL, 2010:900) is a single national statute
> applying uniformly across all 290 kommuner. There is no "which regional law applies here" question.

## Why this folder exists

This `regions/` folder is present because the standard folder structure includes it. It is
intentionally empty of legal-layer content.

## When a region layer WOULD be added

A region sub-folder (`se-ab/`, `se-o/`, `se-m/`, etc.) should be added ONLY if:
- A specific county (län) or region operates its own plan register or zoning supplement that differs
  from the national PBL/NGP path, OR
- A municipality pack (`<code>-<slug>/`) needs to live under an ISO 3166-2 region code for path
  consistency with the playbook.

## ISO 3166-2 codes for likely first cities

| County (Län) | ISO 3166-2 | Key municipalities |
|---|---|---|
| Stockholms län | `se-ab` | Stockholm (0180) |
| Västra Götalands län | `se-o` | Gothenburg (1480) |
| Skåne län | `se-m` | Malmö (1280) |
| Uppsala län | `se-c` | Uppsala (0380) |
| Östergötlands län | `se-e` | Linköping (0580), Vadstena (0583) |

When the first municipality pack is created, add the region folder at that time — not before.
Municipality packs live at: `se/<iso-3166-2>/<scb-kommunkod>-<slug>/` e.g.
`se/se-o/1480-gothenburg/`.
