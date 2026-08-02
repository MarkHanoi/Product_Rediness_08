#!/usr/bin/env python3
"""Minimal dependency-free dBASE III/IV reader for SIPU .dbf attribute tables."""
import struct


def read_dbf(path_or_bytes, encoding="cp1252"):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        b = bytes(path_or_bytes)
    else:
        with open(path_or_bytes, "rb") as f:
            b = f.read()
    if len(b) < 32:
        return [], []
    nrec, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields = []
    off = 32
    while off < hlen - 1 and b[off] != 0x0D:
        raw = b[off:off + 32]
        if len(raw) < 32:
            break
        name = raw[0:11].split(b"\x00")[0].decode("latin-1").strip()
        ftype = chr(raw[11])
        flen = raw[16]
        fdec = raw[17]
        fields.append((name, ftype, flen, fdec))
        off += 32
    rows = []
    pos = hlen
    for _ in range(nrec):
        rec = b[pos:pos + rlen]
        pos += rlen
        if len(rec) < rlen:
            break
        if rec[0:1] == b"*":      # deleted
            continue
        p = 1
        r = {}
        for (name, ftype, flen, fdec) in fields:
            raw = rec[p:p + flen]
            p += flen
            s = raw.decode(encoding, "replace").strip()
            if ftype in ("N", "F"):
                if s in ("", "-", ".", "*"):
                    r[name] = None
                else:
                    try:
                        r[name] = float(s) if (fdec or "." in s) else int(s)
                    except ValueError:
                        r[name] = s
            elif ftype == "L":
                r[name] = {"T": True, "Y": True, "F": False,
                           "N": False}.get(s.upper())
            else:
                r[name] = s if s != "" else None
        rows.append(r)
    return fields, rows
