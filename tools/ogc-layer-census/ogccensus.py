# §OGC-LAYER-CENSUS — enumerate what a spatial-data infrastructure ACTUALLY publishes.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────
# WHY THIS EXISTS: A TYPENAME SWEEP IS A GUESS, AND ITS FAILURE PROVES NOTHING
# ─────────────────────────────────────────────────────────────────────────────────────────────
# Zaragoza was recorded blocked because "a 28-typename sweep returned HTTP 400 on all 28". An
# HTTP 400 from a WFS means UNKNOWN TYPENAME. Twenty-eight of them mean twenty-eight names were
# wrong — which is a fact about the guesser, not about the city. It is the §CONTEXT-DATA-HONESTY
# failure in its purest form: "I could not find it" was recorded as "it is not there".
#
# The correction is structural, not a longer word-list. A server that answers GetCapabilities
# will TELL YOU EVERY LAYER IT HAS. There is no reason to guess, ever. And once the list is in
# hand the search must not stop at the layer NAME: a layer called `op_12` may carry the Abstract
# "Contiene las alineaciones oficiales...", and the attribute that matters may only appear in
# DescribeFeatureType. So this tool searches, per layer:
#
#     Name · Title · Abstract · Keywords · MetadataURL · every ATTRIBUTE NAME from
#     DescribeFeatureType · and (optionally) a sample of live attribute VALUES.
#
# ⛔ IT NEVER INVENTS AN ENDPOINT. Every URL it touches is either (a) passed in by the caller
#    from published documentation, or (b) read out of a capabilities document the server itself
#    returned. A fabricated URL that 404s MANUFACTURES EVIDENCE OF ABSENCE, and that is a worse
#    outcome than learning nothing.
#
# City-agnostic on purpose — the same census runs against any GeoServer, MapServer, QGIS Server
# or ArcGIS REST site. See `probe_city.py` for the per-city entry points.

from __future__ import annotations

import gzip
import io
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable

UA = "PRYZM-ogc-census/1.0 (+https://pryzm.fly.dev; spatial-data discovery)"

# Permissive TLS: several Spanish municipal SDIs chain to a national CA that is not in the
# default store. Reachability, not authenticity, is what is being measured here.
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


@dataclass
class Fetch:
    url: str
    status: int | None
    body: bytes | None
    error: str | None
    content_type: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == 200 and self.body is not None

    def text(self) -> str:
        if self.body is None:
            return ""
        for enc in ("utf-8", "iso-8859-1", "cp1252"):
            try:
                return self.body.decode(enc)
            except UnicodeDecodeError:
                continue
        return self.body.decode("utf-8", "replace")


def fetch(url: str, timeout: int = 60, max_bytes: int = 40_000_000) -> Fetch:
    """One GET, with every failure mode recorded rather than raised.

    ⚠ A network error and an empty result are DIFFERENT VALUES here, deliberately
    (§CONTEXT-DATA-HONESTY). `status=None` with an `error` means we never heard back; `status=200`
    with an empty body means the server answered with nothing. Collapsing those two is how
    "no coverage" gets written down for a service that was merely unreachable that afternoon.
    """
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as resp:
            raw = resp.read(max_bytes)
            if resp.headers.get("Content-Encoding") == "gzip":
                try:
                    raw = gzip.decompress(raw)
                except OSError:
                    pass
            return Fetch(url, resp.status, raw, None, resp.headers.get("Content-Type"))
    except urllib.error.HTTPError as e:
        try:
            raw = e.read(200_000)
        except Exception:
            raw = None
        return Fetch(url, e.code, raw, f"HTTP {e.code}", e.headers.get("Content-Type") if e.headers else None)
    except Exception as e:  # URLError, timeout, TLS, DNS
        return Fetch(url, None, None, f"{type(e).__name__}: {e}")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


# ═════════════════════════════════════════════════════════════════════════════════════════════
# THE SEMANTIC TERM SET
# ═════════════════════════════════════════════════════════════════════════════════════════════
# Matched against name/title/abstract/keywords/metadata AND against attribute names. Accent- and
# case-insensitive. These are SPANISH PLANNING terms; a caller in another country passes its own.
ES_PLANNING_TERMS: tuple[str, ...] = (
    "alineacion", "alineaciones", "linea edificacion", "linea de edificacion", "linea oficial",
    "lim_fachada", "fachada", "frente", "retranqueo", "fondo", "limite edificable",
    "limite de edificacion", "rasante", "rasantes", "eje", "red viaria", "viario", "vial",
    "pgou", "planeamiento", "ordenacion", "norma", "normativa", "calificacion", "clasificacion",
    "ordenanza", "ord_porm", "vial_oficial", "via_publica", "edificabilidad", "aprovechamiento",
    "altura", "plantas", "subgrado", "subzona", "grado", "zona", "uso", "parcela", "manzana",
    "estructura", "ambito", "unidad de ejecucion", "suelo",
)

_ACCENTS = str.maketrans("áéíóúüñÁÉÍÓÚÜÑàèìòùçÇ", "aeiouunAEIOUUNaeioucC")


def norm(s: str | None) -> str:
    if not s:
        return ""
    return s.translate(_ACCENTS).lower()


def match_terms(haystack: str, terms: Iterable[str]) -> list[str]:
    h = norm(haystack)
    return sorted({t for t in terms if norm(t) in h})


# ═════════════════════════════════════════════════════════════════════════════════════════════
# WFS
# ═════════════════════════════════════════════════════════════════════════════════════════════

@dataclass
class Layer:
    service: str
    endpoint: str
    name: str
    title: str = ""
    abstract: str = ""
    keywords: list[str] = field(default_factory=list)
    metadata_urls: list[str] = field(default_factory=list)
    crs: list[str] = field(default_factory=list)
    bbox: list[float] | None = None
    attributes: list[dict[str, str]] = field(default_factory=list)
    attr_error: str | None = None

    def searchable(self) -> str:
        return " | ".join(
            [self.name, self.title, self.abstract, " ".join(self.keywords), " ".join(self.metadata_urls)]
            + [a.get("name", "") for a in self.attributes]
        )


def wfs_capabilities(endpoint: str, version: str = "2.0.0") -> tuple[list[Layer], Fetch]:
    """EVERY typename the server declares. No guessing — this IS the list."""
    url = _with_params(endpoint, {"service": "WFS", "version": version, "request": "GetCapabilities"})
    f = fetch(url)
    if not f.ok:
        return [], f
    try:
        root = ET.fromstring(f.body)
    except ET.ParseError as e:
        f.error = f"XML parse: {e}"
        return [], f

    layers: list[Layer] = []
    for ft in root.iter():
        if _local(ft.tag) != "FeatureType":
            continue
        lay = Layer(service="WFS", endpoint=endpoint, name="")
        for child in ft:
            t, txt = _local(child.tag), (child.text or "").strip()
            if t == "Name":
                lay.name = txt
            elif t == "Title":
                lay.title = txt
            elif t == "Abstract":
                lay.abstract = txt
            elif t == "Keywords":
                # WFS 1.x: one blob. WFS 2.0: nested <Keyword>.
                kws = [(k.text or "").strip() for k in child.iter() if _local(k.tag) == "Keyword"]
                lay.keywords.extend([k for k in kws if k] or ([txt] if txt else []))
            elif t in ("DefaultSRS", "DefaultCRS", "OtherSRS", "OtherCRS", "SRS"):
                if txt:
                    lay.crs.append(txt)
            elif t == "MetadataURL":
                href = child.attrib.get("{http://www.w3.org/1999/xlink}href") or child.attrib.get("href")
                if href:
                    lay.metadata_urls.append(href)
                elif txt:
                    lay.metadata_urls.append(txt)
            elif t in ("WGS84BoundingBox", "LatLongBoundingBox"):
                lay.bbox = _parse_bbox(child)
        if lay.name:
            layers.append(lay)
    return layers, f


def _parse_bbox(el: ET.Element) -> list[float] | None:
    lc = uc = None
    for c in el:
        if _local(c.tag) == "LowerCorner":
            lc = (c.text or "").split()
        elif _local(c.tag) == "UpperCorner":
            uc = (c.text or "").split()
    if lc and uc:
        try:
            return [float(lc[0]), float(lc[1]), float(uc[0]), float(uc[1])]
        except ValueError:
            return None
    a = el.attrib
    if {"minx", "miny", "maxx", "maxy"} <= set(a):
        try:
            return [float(a["minx"]), float(a["miny"]), float(a["maxx"]), float(a["maxy"])]
        except ValueError:
            return None
    return None


def describe_feature_type(endpoint: str, typename: str, version: str = "2.0.0") -> tuple[list[dict[str, str]], Fetch]:
    """The ATTRIBUTE list. This is where a `subgrado` column would surface even if no layer
    NAME ever mentions one — and it is the step the 28-name sweep could never have reached."""
    url = _with_params(endpoint, {
        "service": "WFS", "version": version, "request": "DescribeFeatureType",
        ("typeNames" if version.startswith("2") else "typeName"): typename,
    })
    f = fetch(url)
    if not f.ok:
        return [], f
    try:
        root = ET.fromstring(f.body)
    except ET.ParseError as e:
        f.error = f"XML parse: {e}"
        return [], f
    attrs: list[dict[str, str]] = []
    for el in root.iter():
        if _local(el.tag) != "element":
            continue
        nm = el.attrib.get("name")
        if not nm:
            continue
        ty = el.attrib.get("type", "")
        if ty.endswith("Type") and not nm[:1].islower():
            continue  # the complexType wrapper, not a field
        attrs.append({"name": nm, "type": ty})
    return attrs, f


def _with_params(endpoint: str, params: dict[str, str]) -> str:
    parts = urllib.parse.urlsplit(endpoint)
    q = dict(urllib.parse.parse_qsl(parts.query))
    q.update(params)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(q), ""))


def get_feature_json(endpoint: str, typename: str, count: int = 5, version: str = "2.0.0",
                     extra: dict[str, str] | None = None) -> tuple[Any, Fetch]:
    params = {
        "service": "WFS", "version": version, "request": "GetFeature",
        ("typeNames" if version.startswith("2") else "typeName"): typename,
        ("count" if version.startswith("2") else "maxFeatures"): str(count),
        "outputFormat": "application/json",
    }
    if extra:
        params.update(extra)
    f = fetch(_with_params(endpoint, params))
    if not f.ok:
        return None, f
    try:
        return json.loads(f.text()), f
    except json.JSONDecodeError as e:
        f.error = f"JSON parse: {e}"
        return None, f


# ═════════════════════════════════════════════════════════════════════════════════════════════
# WMS — enumerated too, because a WMS-only layer is still EVIDENCE THAT THE DATA EXISTS.
# ═════════════════════════════════════════════════════════════════════════════════════════════

def wms_capabilities(endpoint: str, version: str = "1.3.0") -> tuple[list[Layer], Fetch]:
    url = _with_params(endpoint, {"service": "WMS", "version": version, "request": "GetCapabilities"})
    f = fetch(url)
    if not f.ok:
        return [], f
    try:
        root = ET.fromstring(f.body)
    except ET.ParseError as e:
        f.error = f"XML parse: {e}"
        return [], f
    layers: list[Layer] = []
    for el in root.iter():
        if _local(el.tag) != "Layer":
            continue
        lay = Layer(service="WMS", endpoint=endpoint, name="")
        for child in el:
            t, txt = _local(child.tag), (child.text or "").strip()
            if t == "Name":
                lay.name = txt
            elif t == "Title":
                lay.title = txt
            elif t == "Abstract":
                lay.abstract = txt
            elif t == "KeywordList":
                lay.keywords = [(k.text or "").strip() for k in child if (k.text or "").strip()]
            elif t in ("CRS", "SRS"):
                if txt:
                    lay.crs.append(txt)
            elif t == "MetadataURL":
                for gc in child:
                    href = gc.attrib.get("{http://www.w3.org/1999/xlink}href")
                    if href:
                        lay.metadata_urls.append(href)
        if lay.name:
            layers.append(lay)
    return layers, f


# ═════════════════════════════════════════════════════════════════════════════════════════════
# ArcGIS REST — GeoServer is frequently NOT the production backend.
# ═════════════════════════════════════════════════════════════════════════════════════════════

def arcgis_catalogue(root_url: str, max_depth: int = 2) -> tuple[list[dict[str, Any]], list[Fetch]]:
    """Walk `/arcgis/rest/services` folder→service→layer. Only ever follows links the server
    itself returned."""
    found: list[dict[str, Any]] = []
    fetches: list[Fetch] = []
    seen: set[str] = set()

    def walk(url: str, depth: int) -> None:
        if depth > max_depth or url in seen:
            return
        seen.add(url)
        f = fetch(_with_params(url, {"f": "json"}), timeout=45)
        fetches.append(f)
        if not f.ok:
            return
        try:
            doc = json.loads(f.text())
        except json.JSONDecodeError:
            return
        for folder in doc.get("folders", []) or []:
            walk(f"{url.rstrip('/')}/{folder}", depth + 1)
        for svc in doc.get("services", []) or []:
            nm, ty = svc.get("name"), svc.get("type")
            if not nm or ty not in ("MapServer", "FeatureServer"):
                continue
            base = urllib.parse.urlsplit(url)
            svc_url = f"{base.scheme}://{base.netloc}{_arc_services_root(base.path)}/{nm}/{ty}"
            sf = fetch(_with_params(svc_url, {"f": "json"}), timeout=45)
            fetches.append(sf)
            if not sf.ok:
                continue
            try:
                sdoc = json.loads(sf.text())
            except json.JSONDecodeError:
                continue
            for lyr in (sdoc.get("layers", []) or []) + (sdoc.get("tables", []) or []):
                found.append({
                    "service": svc_url,
                    "id": lyr.get("id"),
                    "name": lyr.get("name", ""),
                    "type": lyr.get("type", ""),
                })
    walk(root_url, 0)
    return found, fetches


def _arc_services_root(path: str) -> str:
    i = path.find("/services")
    return path[: i + len("/services")] if i >= 0 else path.rstrip("/")


# ═════════════════════════════════════════════════════════════════════════════════════════════
# REPORTING
# ═════════════════════════════════════════════════════════════════════════════════════════════

def score_layers(layers: list[Layer], terms: Iterable[str] = ES_PLANNING_TERMS) -> list[dict[str, Any]]:
    out = []
    for lay in layers:
        hits = match_terms(lay.searchable(), terms)
        d = asdict(lay)
        d["term_hits"] = hits
        d["term_hit_count"] = len(hits)
        out.append(d)
    out.sort(key=lambda d: -d["term_hit_count"])
    return out


def write_json(path: str, payload: Any) -> None:
    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
