"""Diagnostic: the province ATOM feed answered 200 but matched no municipality.

"Answered but matched nothing" is the single most dangerous outcome shape in
this repo's jurisdiction work, because it reads identically to "the cadastre
does not cover Huesca" -- which would be absurd. So the feed gets opened and
looked at rather than believed.
"""

from __future__ import annotations

import re
import ssl
import urllib.request

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

URL = (
    "https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/22/"
    "ES.SDGC.CP.atom_22.xml"
)

req = urllib.request.Request(URL, headers=UA)
body = urllib.request.urlopen(req, timeout=120, context=CTX).read()
print(f"bytes: {len(body)}")
print("---- head ----")
print(body[:900].decode("utf-8", errors="replace"))

hrefs = re.findall(rb'href="([^"]+)"', body)
print(f"\nhrefs: {len(hrefs)}")
for h in hrefs[:10]:
    print("  ", h.decode())

print("\n---- entries mentioning HUESCA ----")
n = 0
for m in re.finditer(rb"HUESCA", body, re.I):
    seg = body[max(0, m.start() - 400) : m.start() + 200]
    print(seg.decode("utf-8", errors="replace").replace("\n", " ")[:600])
    print("  ...")
    n += 1
    if n >= 3:
        break
print(f"HUESCA mentions: {len(re.findall(rb'HUESCA', body, re.I))}")

print("\n---- all 5-digit codes appearing in hrefs ----")
codes = sorted({c.decode() for h in hrefs for c in re.findall(rb"\b(\d{5})\b", h)})
print(f"{len(codes)} codes; first 20: {codes[:20]}")
print("22125 present in hrefs?", "22125" in codes)
