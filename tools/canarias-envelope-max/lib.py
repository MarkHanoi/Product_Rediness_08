#!/usr/bin/env python3
"""Shared primitives for the Canarias ENVELOPE MAXIMUM run.

Everything here is measurement plumbing, not policy. The policy lives in
03_maximum.py.

Inherited (read-only) from tools/canarias-sipu-probe/: the tolerant
access_parser monkey-patches and the byte-swapped-UCS-2 repair. Both are PROBE
DEFECT FIXES, not data transformations - dropping them under-counts the valid
rate, which is exactly the failure mode the brief warns about.
"""
import os
import re
import struct

from access_parser import AccessParser
from access_parser import access_parser as _ap

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# --------------------------------------------------------------------------
# access_parser tolerance (inherited from canarias-sipu-probe/mdb.py)
# --------------------------------------------------------------------------
_ORIG_MEMO = _ap.AccessTable._parse_memo


def _safe_parse_memo(self, rec_data):
    try:
        if not rec_data or len(rec_data) < 12:
            return None
        return _ORIG_MEMO(self, rec_data)
    except Exception:  # noqa: BLE001
        return None


_ap.AccessTable._parse_memo = _safe_parse_memo
_ORIG_ROW = _ap.AccessTable._parse_row


def _safe_parse_row(self, record):
    try:
        return _ORIG_ROW(self, record)
    except Exception:  # noqa: BLE001
        return None


_ap.AccessTable._parse_row = _safe_parse_row


def repair(s):
    """Undo access_parser's byte-swapped UCS-2 misread on compressed-text cells."""
    if not isinstance(s, str) or not s:
        return s
    if not any(0x2000 <= ord(c) <= 0xFFFD for c in s):
        return s
    try:
        b = s.encode("utf-16-le", "ignore")
    except Exception:  # noqa: BLE001
        return s
    b = b.replace(b"\x00\x80", b"").replace(b"\xff\xfe", b"")
    out = b.decode("cp1252", "ignore")
    out = out.replace("\x00", "").replace("﻿", "").strip()
    if out and sum(c.isprintable() for c in out) >= len(out) * 0.8:
        return out
    return s


def open_mdb(path):
    return AccessParser(path)


def read_table(db, name):
    t = db.parse_table(name)
    cols = list(t.keys())
    if not cols:
        return [], []
    n = max(len(t[c]) for c in cols)
    rows = []
    for i in range(n):
        rows.append({c: repair(t[c][i]) if i < len(t[c]) else None
                     for c in cols})
    return cols, rows


def read_edif(path):
    """-> (cols, rows) for the EDIF table of an EDIF.mdb, or (None, None)."""
    db = open_mdb(path)
    tn = [t for t in db.catalog if t.upper() == "EDIF"]
    if not tn:
        return None, None
    return read_table(db, tn[0])


# --------------------------------------------------------------------------
# VALID != non-null.  Ranges + zero-legitimacy inherited from the measured
# baseline so the columns-only number is REPRODUCED, not re-derived.
# --------------------------------------------------------------------------
PARAMS = {
    "SupMin":    (1, 100000, False),
    "LongMin":   (1, 500, False),
    "FonMin":    (1, 500, False),
    "CircInsc":  (1, 500, False),
    "SepMinFr":  (0, 200, True),
    "SepMinPs":  (0, 200, True),
    "SepMinLt":  (0, 200, True),
    "SepMnEdf":  (0, 200, True),
    "DispOblm":  (0, 200, True),
    "FonMaxEd":  (1, 500, False),
    "FonMaxEdm": (1, 500, False),
    "PMaxOcup":  (0, 100, True),
    "EdifMax":   (0.01, 20, False),
    "AltMaxPl":  (1, 60, False),
    "AltMaxMV":  (1, 300, False),
    "AltMaxMP":  (1, 300, False),
}
SENTINELS = {"I", "COM", "NP", "T", "GRF", "AV", "AV+GRF", "S", "N", "SI",
             "NO", "-", "--", "*", "ND", "NC", "X", ""}
# access_parser variable-length defect -> UNKNOWN, never zero.
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f-￿]")


def num(v):
    """-> (float|None, class). class in
    null|UNREADABLE|sentinel|numeric|numeric-with-unit|text"""
    if v is None:
        return None, "null"
    s = str(v).strip()
    if CTRL.search(s):
        return None, "UNREADABLE"
    if s.upper() in SENTINELS:
        return None, "sentinel"
    t = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", s.replace(" ", "")).replace(",", ".")
    if re.fullmatch(r"[-+]?\d*\.?\d+", t):
        try:
            return float(t), "numeric"
        except ValueError:
            return None, "text"
    m = re.fullmatch(r"([-+]?\d*[.,]?\d+)\s*(m2?c?|m²c?|%|pl(?:antas?)?|ml)\.?",
                     t, re.I)
    if m:
        return float(m.group(1).replace(",", ".")), "numeric-with-unit"
    return None, "text"


def valid(key, v):
    """-> (float|None, class). class=='VALID' only when it is a real value."""
    n, cls = num(v)
    if n is None:
        return None, cls
    lo, hi, zero_ok = PARAMS[key]
    if n == 0 and not zero_ok:
        return None, "zero-invalid"
    if not (lo <= n <= hi):
        return None, "out-of-range"
    if key == "AltMaxPl" and abs(n - round(n)) > 1e-9:
        return None, "non-integer-floors"
    return n, "VALID"


ACC = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")


def deacc(s):
    return (s or "").translate(ACC)


__all__ = ["DATA", "HERE", "UA", "open_mdb", "read_table", "read_edif",
           "PARAMS", "SENTINELS", "CTRL", "num", "valid", "repair", "deacc",
           "struct"]
