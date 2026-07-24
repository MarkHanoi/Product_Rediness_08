# Finland (`fi`) — Regions note

> **No legal region layer is needed for mainland Finland.** Per JURISDICTION-PLAYBOOK §2: "depth follows the
> law, not the template." Finland's planning law (Alueidenkäyttölaki + Rakentamislaki, both effective
> 1.1.2025) is a single national statute applying uniformly across all ~309 kunta. There is no "which
> regional law applies here" question at all.

## Why this folder exists

This `regions/` folder is present because the standard folder structure includes it. It is intentionally
empty of legal-layer content.

## When a region layer WOULD be added

A region sub-folder (`fi-es/`, `fi-ps/`, `fi-18/`, etc.) should be added ONLY if:
- A specific region or municipality operates its own plan register or zoning supplement that differs from
  the national Alueidenkäyttölaki / Ryhti path, OR
- A municipality pack (`<code>-<slug>/`) needs to live under an ISO 3166-2 region code for path consistency
  with the playbook.

## Åland — the single exception

**Åland (`fi-ax`)** is an autonomous Swedish-speaking province that maintains its own separate land registry
and building permitting administration by statute (Finnish Constitution + Åland Self-Government Act). Åland
must be treated as its own jurisdiction — not part of this `fi/` mainland coverage. When Åland is researched,
create `fi/fi-ax/` with its own README/RATE/NEXT chain independently of this file.

## Ryhti rollout geography — not a legal region split

The VOOKA project migrates Finnish plans into the kaavatietomalli by region/batch, meaning some regions are
"live" in Ryhti before others. This is a **timing variable, not a legal mechanism variable** — the instrument
in every region is identical. Region sub-folders are NOT created merely because a region has been migrated
into Ryhti; they are created only when a municipality pack is needed there.

## ISO 3166-2 codes for likely first cities / regions

| Region (maakunta) | ISO 3166-2 | Key municipalities | Ryhti status |
|---|---|---|---|
| Etelä-Savo (South Savo) | `fi-es` | Mikkeli (491), Savonlinna (740) | ✅ CONFIRMED LIVE in Ryhti |
| Pohjois-Savo (North Savo) | `fi-ps` | Kuopio (297), Iisalmi (140) | ✅ CONFIRMED LIVE in Ryhti |
| Uusimaa | `fi-18` | Helsinki (091), Espoo (049), Vantaa (092), Kauniainen (235) | ❔ Unconfirmed — VOOKA date needed |
| Pirkanmaa | `fi-06` | Tampere (837) | ❔ Unconfirmed |
| Varsinais-Suomi | `fi-19` | Turku (853) | ❔ Unconfirmed |
| Pohjois-Pohjanmaa | `fi-17` | Oulu (564) | ❔ Unconfirmed |

When the first municipality pack is created, add the region folder at that time — not before.
Municipality packs live at: `fi/<iso-3166-2>/<kuntanumero>-<slug>/` e.g. `fi/fi-es/491-mikkeli/`.
