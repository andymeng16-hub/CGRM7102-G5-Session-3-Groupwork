#!/usr/bin/env python3
"""Fetch a 30 m elevation grid for Sharp Island and cache it locally.

The 90 m grid in ``dem_cache.json`` was sampled over a window that stopped
short of the island's northern and eastern tips, so it cannot carry a relief
model of the whole landform. This fetches CGIAR SRTM 30 m for the full
coastline bounding box and caches the samples so the sun model can be rebuilt
offline.

Run:  python3 tools/fetch_dem30.py
"""
import json
import os
import time
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "dem30_cache.json")

# Covers the OSM coastline bounding box (22.3529 to 22.3806 N, 114.2844 to
# 114.3064 E) with a margin on every side.
S_LAT, N_LAT = 22.3505, 22.3835
W_LON, E_LON = 114.2815, 114.3095
ROWS, COLS = 125, 103          # about 30 m per cell

API = "https://api.opentopodata.org/v1/srtm30m?locations="


def fetch():
    lats = np.linspace(S_LAT, N_LAT, ROWS)
    lons = np.linspace(W_LON, E_LON, COLS)
    pts = [(float(la), float(lo)) for la in lats for lo in lons]
    vals = []
    for k in range(0, len(pts), 100):
        chunk = pts[k:k + 100]
        url = API + "|".join(f"{la:.6f},{lo:.6f}" for la, lo in chunk)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    d = json.load(r)
                vals.extend([(v["elevation"] if v["elevation"] is not None else 0.0)
                             for v in d["results"]])
                break
            except Exception as exc:
                print("  retry %d: %r" % (attempt, exc)[:90], flush=True)
                time.sleep(3)
        else:
            raise RuntimeError("DEM request failed at row %d" % (k // 100))
        if (k // 100) % 10 == 0:
            print("  %d / %d chunks" % (k // 100 + 1, (len(pts) + 99) // 100), flush=True)
        time.sleep(1.05)      # the free endpoint asks for one call a second
    out = {"rows": ROWS, "cols": COLS, "s": S_LAT, "n_lat": N_LAT,
           "w": W_LON, "e": E_LON, "values": vals,
           "source": "CGIAR SRTM 30 m via OpenTopoData"}
    with open(CACHE, "w") as fh:
        json.dump(out, fh)
    return out


def load():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 500:
        with open(CACHE) as fh:
            d = json.load(fh)
        if d.get("values"):
            print("cached  dem30_cache.json  %d samples" % len(d["values"]))
            return d
    print("fetching SRTM 30 m ...")
    return fetch()


if __name__ == "__main__":
    d = load()
    v = np.asarray(d["values"], dtype=float).reshape(d["rows"], d["cols"])
    print("grid %d x %d, elevation %.1f to %.1f m"
          % (d["rows"], d["cols"], v.min(), v.max()))
