# §ZGZ-GROUPS — walk the WMS capabilities TREE, not the flattened list.
#
# `Plano_Calificacion` ("Plano de calificación y regulación del suelo") carries NO workspace
# prefix, which on GeoServer means it is a LAYER GROUP. A flat scan sees the group's title and
# stops; the DATA is in its children, and the children are what a client actually draws. This is
# the same class of mistake as the typename sweep — reading a container as if it were a leaf.
#
# Prints the full ancestry of every leaf so a layer named `ORD_12` is readable as
# "Plano de calificación > Zonas > ORD_12".

from __future__ import annotations

import io
import json
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import _local, _with_params, fetch, norm, write_json  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
WMS_GLOBAL = "https://idezar-sig.zaragoza.es/servicios/geoserver/wms"

INTEREST = ("alineac", "rasante", "calificac", "clasificac", "ordenacion", "ordenanza",
            "edificab", "aprovech", "estructura", "pgou", "zona", "grado", "fondo",
            "altura", "planta", "vial", "viaria", "parcel", "suelo", "uso", "norma", "hoja")


def main() -> None:
    f = fetch(_with_params(WMS_GLOBAL, {"service": "WMS", "version": "1.3.0",
                                        "request": "GetCapabilities"}))
    print(f"GetCapabilities {f.url} -> {f.status}")
    if not f.ok:
        print("UNREACHABLE — recorded as unreachable, NOT as absent.")
        return
    root = ET.fromstring(f.body)

    tree: list[dict] = []

    def walk(el: ET.Element, path: list[str]) -> None:
        name = title = abstract = ""
        for c in el:
            t = _local(c.tag)
            if t == "Name":
                name = (c.text or "").strip()
            elif t == "Title":
                title = (c.text or "").strip()
            elif t == "Abstract":
                abstract = (c.text or "").strip()
        kids = [c for c in el if _local(c.tag) == "Layer"]
        here = path + [title or name]
        if name:
            tree.append({
                "name": name, "title": title, "abstract": abstract,
                "path": " > ".join(p for p in path if p),
                "is_group": bool(kids), "child_count": len(kids),
            })
        for k in kids:
            walk(k, here)

    for cap in root:
        if _local(cap.tag) == "Capability":
            for lay in cap:
                if _local(lay.tag) == "Layer":
                    walk(lay, [])

    write_json(os.path.join(OUT, "zaragoza_wms_tree.json"), tree)
    groups = [n for n in tree if n["is_group"]]
    print(f"\nnodes: {len(tree)}   groups: {len(groups)}   leaves: {len(tree)-len(groups)}")

    print("\n══ EVERY GROUP (the containers the flat scan mis-read as leaves) ══")
    for g in groups:
        print(f"  [{g['child_count']:>4} children] {g['name']:<44} | {g['title'][:56]}")

    print("\n══ LEAVES UNDER ANY URBANISM-ISH GROUP, plus every node matching a planning term ══")
    seen = set()
    for n in tree:
        hay = norm(f"{n['name']} {n['title']} {n['abstract']} {n['path']}")
        if any(t in hay for t in INTEREST) and n["name"] not in seen:
            seen.add(n["name"])
            kind = "GROUP" if n["is_group"] else "leaf "
            print(f"  {kind} {n['name']:<46} | {n['title'][:44]:<44} | {n['path'][:60]}")


if __name__ == "__main__":
    main()
