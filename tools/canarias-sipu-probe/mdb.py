#!/usr/bin/env python3
"""Tolerant wrapper around access_parser for SIPU *.mdb files.

access_parser crashes on broken memo-overflow pointers ("Could not find overflow
record data page overflow pointer"), which several SIPU archives contain in the
long OBS*/TXT* memo fields. Those fields are NOT the numeric parameters we are
measuring, so we degrade them to None rather than losing the whole table.
"""
import struct

from access_parser import AccessParser
from access_parser import access_parser as _ap


def _safe_parse_memo(self, rec_data):
    try:
        if not rec_data or len(rec_data) < 12:
            return None
        return _ORIG_MEMO(self, rec_data)
    except Exception:  # noqa: BLE001
        return None


_ORIG_MEMO = _ap.AccessTable._parse_memo
_ap.AccessTable._parse_memo = _safe_parse_memo

# Some SIPU mdbs also have a bad relative-record map on a single page; skip the
# page instead of aborting the table.
_ORIG_ROW = _ap.AccessTable._parse_row


def _safe_parse_row(self, record):
    try:
        return _ORIG_ROW(self, record)
    except Exception:  # noqa: BLE001
        return None


_ap.AccessTable._parse_row = _safe_parse_row


def repair(s):
    """Undo access_parser's byte-swapped UCS-2 misread on compressed-text cells.

    PROBE DEFECT, caught by dumping the raw non-numeric vocabulary: cells came
    back as e.g. '\\x08\u8000\ufeff\u3237\u6d20\u63b2'.  Re-encoding UTF-16-LE and
    decoding cp1252 yields '72 m2c'.  Those cells CONTAIN NUMBERS, so leaving
    them mangled would have under-counted the valid rate.
    """
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
    out = out.replace("\x00", "").replace("\ufeff", "").strip()
    # keep the repair only if it is more plausible than the original
    if out and sum(c.isprintable() for c in out) >= len(out) * 0.8:
        return out
    return s


def open_mdb(path):
    return AccessParser(path)


def table_columns(db, name):
    """Column names + declared types WITHOUT parsing any row data."""
    t = db.get_table(name)
    return [(c.col_name_str, c.type) for c in
            sorted(t.columns.values(), key=lambda c: c.column_index)]


def read_table(db, name):
    """-> (columns, list-of-dict rows)"""
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


__all__ = ["open_mdb", "read_table", "table_columns", "struct"]
