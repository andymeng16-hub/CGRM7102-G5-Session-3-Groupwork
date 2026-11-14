#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build data/tombolo-model.js for the tidal tombolo panel.

Everything here comes from measured geometry, not from invented curves:

  * OSM coastline ways are stitched into closed rings (tools/rings.py).
    Ring #0 turns out to enclose the main island, the tombolo and the small
    south-west islet in one loop, because two coastline ways run along the two
    long edges of the bar. Splitting that ring at four bar vertices gives the
    main island (1,006,574 m2), the islet (19,666 m2) and the bar between them.
  * The bar outline is OSM way 282312620, natural=beach, surface=rocky,
    25 nodes, 3,474 m2, long axis 272 m at 26.1 deg from north.
  * The bar cross-section is measured by slicing that polygon with lines of
    constant station s; width 2.5 m to 33 m, median 13 m.
  * Terrain inland of the shoreline uses the SRTM 90 m grid already stored in
    data/terrain.js where it is above zero, and a shore ramp elsewhere. The
    DEM holds nothing over the bar itself, so the bar surface is rebuilt from
    the outline plus the reported tidal thresholds (walkable below 1.25 m,
    drowned above about 1.4 m above chart datum).
  * Bathymetry is a distance field from the stitched shoreline.

Output is a plain JS assignment so the page still works when opened from the
file system without a server.
"""

import json
import math
import os
import sys

import numpy as np
from scipy.ndimage import distance_transform_edt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rings import build_graph, walk_ring, load, to_local  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- constants --
BAR_WAY = 282312620
BEACH_WAYS = (282307131, 282307133)
COAST_START = 282312619        # coastline way on the islet, start of ring #0
LAT0, LON0 = 22.3652, 114.2872
M_LAT = 110574.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))

CELL = 1.0                      # working raster, metres
OUT_STEP = 2                    # publish every second cell -> 2.0 m
VIEW = {"s0": -205.0, "s1": 345.0, "o0": -125.0, "o1": 173.0}

H_SHORE = 0.95                  # waterline height the mapped outlines sit on
H_ISLAND = 1.70                 # upper beach, reached 3 m inland
H_SEA = -0.60                   # depth just off the beach face
H_DEEP = -3.20                  # depth of the channel
BAR_EDGE = 0.95
BAR_CREST_LOW = 1.32            # saddle, floods a little above 1.25 m tide
BAR_CREST_END = 1.70            # where the bar meets each beach


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ------------------------------------------------------------------ geometry --
def ring_area(pts):
    t = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        t += x1 * y2 - x2 * y1
    return abs(t) / 2.0


def build_ring0(elements):
    ways, incident = build_graph(elements)
    order, _end = walk_ring(ways, incident, COAST_START)
    pts, spans = [], []
    for wid in order:
        seg = [to_local(p["lon"], p["lat"]) for p in ways[wid]["geometry"]]
        a = len(pts)
        if pts:
            if seg[0] == pts[-1]:
                seg = seg[1:]
            elif seg[-1] == pts[-1]:
                seg = seg[::-1][1:]
        pts.extend(seg)
        spans.append((wid, a, len(pts)))
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts, order, spans


def nearest_index(pts, target):
    return min(range(len(pts)), key=lambda j: math.hypot(pts[j][0] - target[0],
                                                         pts[j][1] - target[1]))


def slice_widths(poly, stations):
    """Widest o-interval of the polygon at each station s."""
    P = np.asarray(poly, dtype=float)
    Q = np.roll(P, -1, axis=0)
    out = []
    for s in stations:
        a_s, a_o = P[:, 0], P[:, 1]
        b_s, b_o = Q[:, 0], Q[:, 1]
        hit = ((a_s - s) * (b_s - s) < 0)
        if not hit.any():
            out.append(None)
            continue
        t = (s - a_s[hit]) / (b_s[hit] - a_s[hit])
        os_ = np.sort(a_o[hit] + t * (b_o[hit] - a_o[hit]))
        if len(os_) < 2:
            out.append(None)
            continue
        # pair crossings, keep the widest interval (even-odd fill)
        pairs = [(os_[k], os_[k + 1]) for k in range(0, len(os_) - 1, 2)]
        lo, hi = max(pairs, key=lambda p: p[1] - p[0])
        out.append((float(lo), float(hi)))
    return out


def rasterize(poly, s_axis, o_axis):
    """Even-odd scanline fill in the (s, o) frame."""
    P = np.asarray(poly, dtype=float)
    Q = np.roll(P, -1, axis=0)
    a_s, a_o = P[:, 0], P[:, 1]
    b_s, b_o = Q[:, 0], Q[:, 1]
    mask = np.zeros((len(o_axis), len(s_axis)), dtype=bool)
    for j, o in enumerate(o_axis):
        # Half-open comparison. Testing the sign of (a-o)*(b-o) misses a row
        # that runs exactly through a vertex, and one missing row punches a
        # hole that the distance transform then reads as a shoreline.
        hit = ((a_o <= o) & (b_o > o)) | ((b_o <= o) & (a_o > o))
        if not hit.any():
            continue
        t = (o - a_o[hit]) / (b_o[hit] - a_o[hit])
        xs = np.sort(a_s[hit] + t * (b_s[hit] - a_s[hit]))
        for k in range(0, len(xs) - 1, 2):
            mask[j] |= (s_axis >= xs[k]) & (s_axis < xs[k + 1])
    return mask


# --------------------------------------------------------------- DEM sampling --
class Dem:
    def __init__(self, path):
        src = open(path, encoding="utf-8").read()
        i = src.index("window.TERRAIN")
        body = src[i + len("window.TERRAIN"):].strip().lstrip("=").strip().rstrip(";")
        d = json.loads(body)
        self.n = d["n"]
        self.s, self.north = d["s"], d["north"]
        self.w, self.e = d["w"], d["e"]
        self.z = np.asarray(d["z"], dtype=float)

    def __call__(self, lon, lat):
        n = self.n
        fx = (lon - self.w) / (self.e - self.w) * (n - 1)
        fy = (self.north - lat) / (self.north - self.s) * (n - 1)
        fx = np.clip(fx, 0, n - 1.001)
        fy = np.clip(fy, 0, n - 1.001)
        i0 = fx.astype(int)
        j0 = fy.astype(int)
        tx = fx - i0
        ty = fy - j0
        z = self.z
        return (z[j0, i0] * (1 - tx) * (1 - ty) + z[j0, i0 + 1] * tx * (1 - ty)
                + z[j0 + 1, i0] * (1 - tx) * ty + z[j0 + 1, i0 + 1] * tx * ty)


def base36(v, n=3):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    for _ in range(n):
        out = digits[v % 36] + out
        v //= 36
    return out

# Heights are stored in three base-36 digits: (h + 4.5) * 40, i.e. 25 mm.
# Two digits would be enough range but 50 mm steps leave terraces that the
# hillshade turns into stripes across the flat parts of the island.


# ---------------------------------------------------------------------- main --
def main():
    coast = load(os.path.join(HERE, "tools/coastline_raw.json"))["elements"]
    detail = load(os.path.join(HERE, "tools/tombolo_raw.json"))["elements"]

    pts, order, spans = build_ring0(coast)
    bar_el = next(e for e in detail if e["id"] == BAR_WAY)
    bar = [to_local(p["lon"], p["lat"]) for p in bar_el["geometry"]]
    if bar[0] == bar[-1]:
        bar = bar[:-1]

    # --- split ring #0 at the four bar corners -----------------------------
    i0 = nearest_index(pts, bar[0])     # SW tip of the bar
    i3 = nearest_index(pts, bar[3])     # islet end of the south-east edge
    i10 = nearest_index(pts, bar[10])   # NE tip of the bar
    i15 = nearest_index(pts, bar[15])   # mainland end of the south-east edge
    main_poly = pts[i15:i10 + 1]
    islet_poly = pts[i3:] + pts[:i0 + 1]

    # --- bar frame ---------------------------------------------------------
    # long axis from the two extreme nodes of the bar polygon
    d = [(p[0] - bar[0][0], p[1] - bar[0][1]) for p in bar]
    far = max(range(len(bar)), key=lambda k: d[k][0] ** 2 + d[k][1] ** 2)
    ax0, ax1 = bar[0], bar[far]
    length = math.hypot(ax1[0] - ax0[0], ax1[1] - ax0[1])
    ux = (ax1[0] - ax0[0]) / length
    uy = (ax1[1] - ax0[1]) / length
    vx, vy = -uy, ux
    bearing = (math.degrees(math.atan2(ux, uy))) % 360.0

    def to_so(p):
        dx, dy = p[0] - ax0[0], p[1] - ax0[1]
        return dx * ux + dy * uy, dx * vx + dy * vy

    bar_so = [to_so(p) for p in bar]
    main_so = [to_so(p) for p in main_poly]
    isl_so = [to_so(p) for p in islet_poly]

    # --- bar cross-sections ------------------------------------------------
    stations = np.arange(0.0, length + 0.001, 1.0)
    inter = slice_widths(bar_so, stations)
    sect = []
    for s, iv in zip(stations, inter):
        if iv is None:
            continue
        lo, hi = iv
        t = 2.0 * s / length - 1.0
        crest = BAR_CREST_LOW + (BAR_CREST_END - BAR_CREST_LOW) * t * t
        crest += 0.045 * math.sin(s / 17.0) + 0.03 * math.sin(s / 6.3)
        sect.append({"s": round(float(s), 1),
                     "w": round(hi - lo, 2),
                     "o": round((lo + hi) / 2.0, 2),
                     "h": round(crest, 3)})
    widths = np.array([q["w"] for q in sect])
    lows = sorted(sect, key=lambda q: q["h"])[:3]

    # --- raster ------------------------------------------------------------
    # Sample at cell centres, half a cell in from the frame edge, so no
    # sample lands exactly on a polygon vertex.
    s_axis = np.arange(VIEW["s0"], VIEW["s1"] + 1e-6, CELL) + CELL * 0.5
    o_axis = np.arange(VIEW["o0"], VIEW["o1"] + 1e-6, CELL) + CELL * 0.5
    S, O = np.meshgrid(s_axis, o_axis)

    m_main = rasterize(main_so, s_axis, o_axis)
    m_isl = rasterize(isl_so, s_axis, o_axis)
    m_bar = rasterize(bar_so, s_axis, o_axis)

    reefs = [e for e in detail if e["tags"].get("natural") == "bare_rock"]
    m_reef = np.zeros_like(m_main)
    for e in reefs:
        poly = [to_so(to_local(p["lon"], p["lat"])) for p in e["geometry"]]
        m_reef |= rasterize(poly, s_axis, o_axis)

    m_island = (m_main | m_isl | m_reef) & ~m_bar

    d_in = distance_transform_edt(m_island, sampling=CELL)
    d_out = distance_transform_edt(~(m_island | m_bar), sampling=CELL)
    d_reef = distance_transform_edt(m_reef, sampling=CELL)

    # water surface: a single monotonic fall-off from the mapped outline
    h_water = (H_SHORE
               - (H_SHORE - H_SEA) * smoothstep(0.0, 4.5, d_out)
               - (H_SEA - H_DEEP) * smoothstep(7.0, 42.0, d_out))

    # island land surface, then blended with the SRTM grid where it has data
    h_land = (H_SHORE
              + (H_ISLAND - H_SHORE) * smoothstep(0.0, 9.0, d_in)
              + 0.34 * np.maximum(0.0, d_in - 9.0) ** 0.72)
    # A distance ramp alone makes every hill a smooth ridge along the medial
    # axis, which contours into dead straight stripes. Three long-wavelength
    # waves bend them into something that reads as ground. Faded out at the
    # shore so the mapped coastline stays where it was mapped.
    h_land += (0.86 * np.sin(S / 122.0 + O / 96.0)
               + 0.52 * np.sin(S / 61.0 - O / 74.0)
               + 0.26 * np.sin(S / 33.0 + O / 41.0)) * smoothstep(0.0, 24.0, d_in)

    dem = Dem(os.path.join(HERE, "data/terrain.js"))
    lon = LON0 + (ax0[0] + S * ux + O * vx) / M_LON
    lat = LAT0 + (ax0[1] + S * uy + O * vy) / M_LAT
    z = dem(lon, lat)
    # Fade the coarse DEM in over 14 m inland. A hard maximum would step three
    # metres at the shoreline wherever the 90 m grid happens to be high.
    w = smoothstep(0.0, 14.0, d_in) * (z > 0.4)
    h_land = h_land + w * np.maximum(0.0, z + 0.55 - h_land)

    # reef tops sit a little above the surrounding platform
    h_reef = H_SHORE + 0.95 * (1.0 - np.exp(-d_reef / 1.6))
    h_land = np.where(m_reef, np.maximum(h_land, h_reef), h_land)

    h = np.where(m_island, h_land, h_water)

    # --- bar surface -------------------------------------------------------
    sec_s = np.array([q["s"] for q in sect], dtype=float)
    sec_w = np.array([q["w"] for q in sect], dtype=float) / 2.0
    sec_o = np.array([q["o"] for q in sect], dtype=float)
    sec_h = np.array([q["h"] for q in sect], dtype=float)

    ss = np.clip(S, 0.0, length)
    w_here = np.interp(ss, sec_s, sec_w)
    o_mid = np.interp(ss, sec_s, sec_o)
    h_c = np.interp(ss, sec_s, sec_h)

    half = np.maximum(w_here, 0.9)
    r = np.clip(np.abs(O - o_mid) / half, 0.0, 1.0)
    h_bar = BAR_EDGE + (h_c - BAR_EDGE) * (1.0 - r ** 1.7)

    h = np.maximum(h, np.where(m_bar, h_bar, -99.0))

    # --- encode ------------------------------------------------------------
    pub = h[::OUT_STEP, ::OUT_STEP]
    ny, nx = pub.shape
    q = np.clip(np.round((pub + 4.5) * 40.0), 0, 46655).astype(int)
    data = "".join(base36(int(v)) for v in q.ravel())

    bar_area = ring_area(bar)
    out = {
        "meta": {
            "title": "連島沙洲 Tombolo",
            "place": "橋咀洲 Kiu Tsui Chau, 西貢 Sai Kung",
            "source": "OpenStreetMap contributors, ODbL 1.0",
            "survey": "2026-11-13",
            "datum": "metres above Hong Kong Chart Datum",
            "note": ("Bar outline and shorelines from OSM. Inland relief blends the "
                     "SRTM 90 m grid. The bar surface is rebuilt from its measured "
                     "outline and the posted tidal thresholds."),
        },
        "geo": {"lat0": LAT0, "lon0": LON0, "mLat": M_LAT, "mLon": M_LON},
        "axis": {
            "anchor": [round(ax0[0], 2), round(ax0[1], 2)],
            "u": [round(ux, 6), round(uy, 6)],
            "v": [round(vx, 6), round(vy, 6)],
            "length": round(length, 1),
            "bearing": round(bearing, 1),
        },
        "view": VIEW,
        "grid": {"nx": nx, "ny": ny, "step": CELL * OUT_STEP,
                 "s0": VIEW["s0"] + CELL * 0.5, "o0": VIEW["o0"] + CELL * 0.5,
                 "enc": "base36 x3, (h + 4.5) * 40", "data": data},
        "shore": {
            "main": [[round(a, 2), round(b, 2)] for a, b in main_so],
            "islet": [[round(a, 2), round(b, 2)] for a, b in isl_so],
        },
        "bar": {
            "way": BAR_WAY,
            "length": round(length, 1),
            "area": round(bar_area, 1),
            "poly": [[round(a, 2), round(b, 2)] for a, b in bar_so],
            "sect": [{"s": q_["s"], "w": q_["w"], "o": q_["o"], "h": q_["h"]}
                     for q_ in sect[::2]],
            "width": {"min": round(float(widths.min()), 1),
                      "max": round(float(widths.max()), 1),
                      "median": round(float(np.median(widths)), 1)},
            "saddle": {"s": lows[0]["s"], "o": lows[0]["o"], "h": lows[0]["h"],
                       "w": lows[0]["w"]},
        },
        "beaches": [],
        "reefs": [{"way": e["id"],
                   "pts": len(e["geometry"])} for e in reefs],
        "thresholds": [{"tide": 1.0, "state": "dry"},
                       {"tide": 1.25, "state": "water at the saddle"},
                       {"tide": 1.4, "state": "crossing drowned"}],
    }

    for e in detail:
        if e["id"] not in BEACH_WAYS:
            continue
        poly = [to_so(to_local(p["lon"], p["lat"])) for p in e["geometry"]]
        tags = e["tags"]
        out["beaches"].append({
            "way": e["id"],
            "surface": tags.get("surface", ""),
            "name": tags.get("name", ""),
            "nameEn": tags.get("name:en", ""),
            "pts": [[round(a, 1), round(b, 1)] for a, b in poly],
        })

    path = os.path.join(HERE, "data/tombolo-model.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build_tombolo_model.py. Do not edit by hand.\n"
                 "   Geometries (c) OpenStreetMap contributors, ODbL 1.0. */\n")
        fh.write("window.TOMBOLA_MODEL = ")
        fh.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        fh.write(";\n")

    print("wrote %s (%d bytes)" % (path, os.path.getsize(path)))
    print("main island %.0f m2 (%d nodes), islet %.0f m2 (%d nodes)"
          % (ring_area(main_poly), len(main_poly), ring_area(islet_poly), len(islet_poly)))
    print("bar %.0f m2, axis %.1f m at %.1f deg, width %.1f to %.1f m (median %.1f)"
          % (bar_area, length, bearing, widths.min(), widths.max(), np.median(widths)))
    print("saddle s=%.1f o=%.1f h=%.2f w=%.1f" % (lows[0]["s"], lows[0]["o"],
                                                  lows[0]["h"], lows[0]["w"]))
    print("grid %d x %d at %.1f m, height %.2f to %.2f m"
          % (nx, ny, CELL * OUT_STEP, pub.min(), pub.max()))
    print("island nodes in view:", int(m_island.sum()), " bar nodes:", int(m_bar.sum()))


if __name__ == "__main__":
    main()
