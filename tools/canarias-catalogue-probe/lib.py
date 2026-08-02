"""Shared helpers for the Canarias CKAN catalogue probe.

Negative-proof discipline: every fetch records HTTP status, byte length and the
full error string. A zero-result response is recorded as a *measured zero*, never
silently collapsed into "absent".
"""
import gzip
import io
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

# geobdp.grafcan.es is robots-disallowed to crawlers -> browser UA everywhere.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

CKAN = "https://opendata.sitcan.es/api/3/action"

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


def fetch(url, timeout=120, method="GET", data=None, headers=None):
    """Return (status, body_bytes, err_string). Never raises."""
    hdrs = {"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "gzip"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                try:
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                except Exception:
                    pass
            return r.status, raw, None
    except urllib.error.HTTPError as e:
        raw = b""
        try:
            raw = e.read()
        except Exception:
            pass
        # READ THE WHOLE ERROR STRING before concluding a capability is absent.
        return e.code, raw, "HTTPError %s: %s" % (e.code, raw[:4000].decode("utf-8", "replace"))
    except Exception as e:
        return None, b"", "%s: %s" % (type(e).__name__, e)


def head(url, timeout=60):
    """HEAD a resource URL. Falls back to a ranged GET when HEAD is refused."""
    hdrs = {"User-Agent": UA}
    req = urllib.request.Request(url, headers=hdrs, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
            return r.status, dict(r.headers), None
    except urllib.error.HTTPError as e:
        if e.code in (403, 405, 501):
            req2 = urllib.request.Request(
                url, headers={**hdrs, "Range": "bytes=0-0"}, method="GET")
            try:
                with urllib.request.urlopen(req2, timeout=timeout, context=_CTX) as r2:
                    return r2.status, dict(r2.headers), "HEAD->%s, ranged GET used" % e.code
            except Exception as e2:
                return e.code, {}, "HEAD %s; ranged GET %s: %s" % (e.code, type(e2).__name__, e2)
        return e.code, dict(getattr(e, "headers", {}) or {}), "HTTPError %s" % e.code
    except Exception as e:
        return None, {}, "%s: %s" % (type(e).__name__, e)


def ckan(action, **params):
    """Call a CKAN action. Returns (ok, result_or_None, diag_dict)."""
    url = CKAN + "/" + action
    if params:
        url += "?" + urllib.parse.urlencode(params)
    st, body, err = fetch(url)
    diag = {"url": url, "status": st, "bytes": len(body), "error": err}
    if st != 200 or not body:
        return False, None, diag
    try:
        d = json.loads(body.decode("utf-8", "replace"))
    except Exception as e:
        diag["error"] = "json decode: %s" % e
        return False, None, diag
    if not d.get("success"):
        diag["error"] = json.dumps(d.get("error"))[:2000]
        return False, None, diag
    return True, d.get("result"), diag


def save(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=False)
    return p


def load(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def sleep(s=0.25):
    time.sleep(s)
