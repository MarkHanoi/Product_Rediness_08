#!/usr/bin/env python3
"""
PHASE 4 — LiDAR Tile Registry (North Star §6.4.1).

The DISCOVERY layer of the nDSM height engine: one row per national-LiDAR tile, so a building's
footprint bbox resolves to the `.laz` tile(s) that cover it. Populated per-country from the national
LiDAR indexes (all live-probed 2026-07-25 — see README.md §Per-country LiDAR table).

⚠ STDLIB ONLY. This file has ZERO external dependencies (no pdal/laspy/rasterio) so it runs on the
bare Python that ships here (3.14). The heavy libs are needed only by `pipeline.py`'s point-cloud
stages; discovery + the registry are pure. Mirrors the Postgres table in §6.4.1:
    country · tile_id · bbox · epsg · density_ppm2 · year · classification(bool) · license · download_url
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from typing import Iterable, Optional


@dataclass(frozen=True)
class LidarTile:
    """One national-LiDAR tile. `bbox` is (minx, miny, maxx, maxy) in the tile's own `epsg` CRS."""
    country: str                       # ISO-3166 alpha-2, e.g. 'nl'
    tile_id: str                       # national tile name, e.g. '32_355_5644' / 'w0474n4427'
    bbox: tuple[float, float, float, float]
    epsg: int                          # metric CRS of bbox + points (NEVER geographic)
    density_ppm2: Optional[float]      # last-return points / m² (None = unknown, honest)
    year: Optional[int]
    classification: bool               # True = points carry an ASPRS class (ground=2, veg=3-5, ...)
    license: str                       # SPDX id or free-form; '' = unverified (must be resolved before use)
    download_url: str                  # direct .laz/.copc.laz (or a per-tile resolver)

    def covers(self, minx: float, miny: float, maxx: float, maxy: float) -> bool:
        """Does this tile's bbox intersect the query bbox (same CRS assumed by the caller)?"""
        bx0, by0, bx1, by1 = self.bbox
        return not (maxx < bx0 or minx > bx1 or maxy < by0 or miny > by1)


class LidarTileRegistry:
    """
    In-memory registry (the Postgres table's stand-in for the scaffold). A production build swaps the
    backing store for PostGIS with a GiST index on `bbox`; the query surface stays identical.
    """

    def __init__(self, tiles: Iterable[LidarTile] = ()) -> None:
        self._tiles: list[LidarTile] = list(tiles)

    def add(self, tile: LidarTile) -> None:
        self._tiles.append(tile)

    def __len__(self) -> int:
        return len(self._tiles)

    def tiles_for_bbox(self, bbox: tuple[float, float, float, float], epsg: int) -> list[LidarTile]:
        """All registered tiles whose CRS matches `epsg` and whose bbox intersects `bbox`."""
        minx, miny, maxx, maxy = bbox
        return [t for t in self._tiles if t.epsg == epsg and t.covers(minx, miny, maxx, maxy)]

    def by_country(self, country: str) -> list[LidarTile]:
        return [t for t in self._tiles if t.country == country]

    def to_json(self) -> str:
        return json.dumps([asdict(t) for t in self._tiles], indent=2)

    @classmethod
    def from_json(cls, text: str) -> "LidarTileRegistry":
        rows = json.loads(text)
        return cls(
            LidarTile(
                country=r["country"], tile_id=r["tile_id"], bbox=tuple(r["bbox"]), epsg=r["epsg"],
                density_ppm2=r.get("density_ppm2"), year=r.get("year"),
                classification=bool(r.get("classification", False)),
                license=r.get("license", ""), download_url=r.get("download_url", ""),
            )
            for r in rows
        )


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# COUNTRY DISCOVERY DESCRIPTORS — how to POPULATE the registry per country, keyed to the live-probed
# national indexes (README.md §Per-country LiDAR table). `reachable_keyless` is the load-bearing,
# LIVE-VERIFIED (2026-07-25) field: it gates which countries the engine can build without a credential.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class CountryLidarSource:
    country: str
    programme: str
    index_url: str
    epsg: int
    density_ppm2: Optional[float]     # ESTIMATED from the programme spec (not a per-tile measurement)
    classified: bool
    license: str
    reachable_keyless: bool           # VERIFIED live 2026-07-25
    notes: str = ""


COUNTRY_SOURCES: tuple[CountryLidarSource, ...] = (
    CountryLidarSource(
        "nl", "AHN (Actueel Hoogtebestand Nederland, AHN4/5)",
        "https://service.pdok.nl/rws/ahn/atom/", 28992, density_ppm2=10.0, classified=True,
        license="CC-BY-4.0", reachable_keyless=True,
        notes="PDOK ATOM feed LIVE (200 xml). ~10-14 ppm². Best-in-class open LiDAR.",
    ),
    CountryLidarSource(
        "dk", "DHM (Danmarks Højdemodel) / GeoDanmark punktsky",
        "https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WMS", 25832, density_ppm2=4.0, classified=True,
        license="Free (registration)", reachable_keyless=False,
        notes="Datafordeler 403 keyless (LIVE-PROBED) — service user required, same gate as GeoDanmark.",
    ),
    CountryLidarSource(
        "ch", "swissSURFACE3D (LiDAR point cloud)",
        "https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swisssurface3d", 2056,
        density_ppm2=15.0, classified=True, license="swisstopo open (BGDI)", reachable_keyless=True,
        notes="STAC API LIVE (200 json, v0.9 + v1). ~15-20 ppm², classified .las/.laz.",
    ),
    CountryLidarSource(
        "no", "NDH (Nasjonal Detaljert Høydemodell) / hoydedata.no",
        "https://hoydedata.no/arcgis/rest/services", 25832, density_ppm2=2.0, classified=True,
        license="CC-BY-4.0 (Kartverket)", reachable_keyless=True,
        notes="ArcGIS REST LIVE (200 json). ~2-5 ppm². FKB survey height is licensed; the FREE path is NDH nDSM.",
    ),
    CountryLidarSource(
        "fr", "IGN LiDAR HD",
        "https://data.geopf.fr/wfs/ows", 2154, density_ppm2=10.0, classified=True,
        license="Etalab 2.0 (open)", reachable_keyless=True,
        notes="geopf public WFS LIVE (200) for the LiDAR HD tile index; /private/ is 401. ~10 ppm², classified.",
    ),
    CountryLidarSource(
        "es", "PNOA-LiDAR (2nd/3rd coverage) — CNIG",
        "https://centrodedescargas.cnig.es/CentroDescargas/", 25830, density_ppm2=1.0, classified=True,
        license="CC-BY 4.0 (CNIG)", reachable_keyless=True,
        notes="CNIG download portal LIVE (200). 1st cov ~0.5 ppm², 2nd/3rd ~1-4 ppm². Coarse but national — LoD1-grade.",
    ),
    CountryLidarSource(
        "us", "USGS 3DEP (Lidar Point Cloud, LPC)",
        "https://tnmaccess.nationalmap.gov/api/v1/products", 6350, density_ppm2=2.0, classified=True,
        license="US Public Domain", reachable_keyless=True,
        notes="TNM API LIVE + queryable (bbox → 162 LPC products returned live). Also usgs-lidar-public S3 (COPC/EPT). "
              ">60% national coverage, 2-8+ ppm².",
    ),
)


def print_country_table() -> None:
    hdr = f"{'cc':<3} {'ppm²':>5} {'class':<5} {'keyless':<7} programme"
    print(hdr)
    print("-" * len(hdr))
    for s in COUNTRY_SOURCES:
        ppm = "?" if s.density_ppm2 is None else f"{s.density_ppm2:g}"
        print(f"{s.country:<3} {ppm:>5} {str(s.classified):<5} {str(s.reachable_keyless):<7} {s.programme}")


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252; keep glyphs intact.
    except Exception:
        pass
    print("PHASE 4 — LiDAR Tile Registry · country discovery descriptors (reachability VERIFIED 2026-07-25)\n")
    print_country_table()
    # A tiny round-trip sanity check (stdlib-only, runs anywhere).
    reg = LidarTileRegistry([
        LidarTile("us", "w0474n4427", (474000, 4427000, 475000, 4428000), 6350, 2.0, 2020, True,
                  "US Public Domain", "https://usgs-lidar-public.s3.amazonaws.com/..."),
    ])
    assert reg.tiles_for_bbox((474500, 4427500, 474600, 4427600), 6350)
    assert not reg.tiles_for_bbox((0, 0, 1, 1), 6350)
    assert LidarTileRegistry.from_json(reg.to_json()).by_country("us")
    print("\n[selftest] registry round-trip + bbox query OK")
