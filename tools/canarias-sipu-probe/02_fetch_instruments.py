#!/usr/bin/env python3
"""C1 - fetch selected SIPU instrument ZIPs and unpack, seeded + re-runnable.

Selection is by FILENAME SUFFIX against .data/catalogue.json so the exact
sample is reproducible. Usage:  python 02_fetch_instruments.py [key ...]
"""
import json
import os
import sys
import urllib.request
import zipfile

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")

# THE SAMPLE - deliberately spread across island, vintage and instrument type.
SAMPLE = {
    # key                filename fragment                                 why
    "telde_pgo":   "030319-pgo-ad-itpu-150323-210504-sipu.zip",       # GC 2003 adaptacion plena, large
    "agulo_pgo":   "051018-pgo-adp-itpu-160517-180313-sipu.zip",      # La Gomera 2005 partial, small
    "arona_pgo":   "940609_pgo_ad_itpu-160906-221104-sipu_v02.zip",   # Tenerife 1994 PGO, different island+vintage
    "arico_mp":    "990215_mpnnss_n1_zona_de_guama_ad_itpu-130418-230317-sipu.zip",  # 1999 MP NNSS, small instrument
}


def main():
    keys = sys.argv[1:] or list(SAMPLE)
    cat = json.load(open(os.path.join(DATA, "catalogue.json"), encoding="utf-8"))
    by_file = {}
    for r in cat:
        by_file.setdefault(r["url"].rsplit("/", 1)[-1], []).append(r)

    for k in keys:
        frag = SAMPLE[k]
        hits = by_file.get(frag)
        if not hits:
            print(f"{k}: NOT IN CATALOGUE ({frag})")
            continue
        r = hits[0]
        dest = os.path.join(DATA, k + ".zip")
        if not os.path.exists(dest):
            req = urllib.request.Request(r["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as resp:
                body = resp.read()
                code = resp.status
            with open(dest, "wb") as f:
                f.write(body)
            print(f"{k}: http={code} bytes={len(body)}")
        else:
            print(f"{k}: cached bytes={os.path.getsize(dest)}")
        out = os.path.join(DATA, k)
        os.makedirs(out, exist_ok=True)
        try:
            with zipfile.ZipFile(dest) as z:
                names = z.namelist()
                z.extractall(out)
            print(f"   entries={len(names)} sample={names[:6]}")
        except zipfile.BadZipFile as e:
            print(f"   NOT A ZIP: {e}  first bytes={open(dest,'rb').read(64)!r}")


if __name__ == "__main__":
    main()
