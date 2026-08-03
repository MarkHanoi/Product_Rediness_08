"""Diagnostic: INE 22125 is absent from the province-22 ATOM feed.

That is a claim so implausible (the provincial capital missing from the
cadastre) that it must be a KEY error, not a coverage fact. Catastro's own
municipality numbering is NOT always the INE numbering. This lists what the
feed actually offers around Huesca so the right key can be read off it.
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
body = urllib.request.urlopen(
    urllib.request.Request(URL, headers=UA), timeout=120, context=CTX
).read()

hrefs = [h.decode("latin-1") for h in re.findall(rb'href="([^"]+\.zip)"', body)]
print(f"zip entries in feed: {len(hrefs)}")

print("\n-- entries whose NAME contains HUESCA --")
for h in hrefs:
    if "HUESCA" in h.upper():
        print("  ", h)

print("\n-- codes numerically near 22125 --")
codes = []
for h in hrefs:
    m = re.search(r"/(\d{5})-", h)
    if m:
        codes.append((m.group(1), h.rsplit("/", 2)[1]))
codes.sort()
for c, name in codes:
    if 22118 <= int(c) <= 22135:
        print(f"   {c}  {name}")

print(f"\ntotal coded entries: {len(codes)}")
print(f"min={codes[0][0]} max={codes[-1][0]}")
allc = {c for c, _ in codes}
print("22125 in feed?", "22125" in allc)

# The province feed may paginate or exclude capitals; check the national index.
NAT = "https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/ES.SDGC.CP.atom.xml"
try:
    nat = urllib.request.urlopen(
        urllib.request.Request(NAT, headers=UA), timeout=120, context=CTX
    ).read()
    print(f"\nnational index bytes: {len(nat)}")
    for m in re.finditer(rb'href="([^"]*22[^"]*\.xml)"', nat):
        print("  ", m.group(1).decode("latin-1"))
except Exception as exc:  # noqa: BLE001
    print(f"national index UNREACHABLE: {exc}")
