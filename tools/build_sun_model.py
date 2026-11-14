#!/usr/bin/env python3
"""Build a solar exposure model for the Sharp Island traverse.

The field record classifies the shade at each observation point. This script
supplies the geometry behind that record: an elevation surface, a canopy map,
and the real position of the sun over the survey window.

Inputs, all cached:

* ``tools/dem30_cache.json``   CGIAR SRTM 30 m elevation, from fetch_dem30.py
* ``tools/canopy_raw.json``    OpenStreetMap natural=wood, natural=scrub and
  building footprints, ODbL 1.0
* ``data/routes.geojson``      the drawn route
* ``data/field-data.json``     the eight observation points

The canopy
----------
OpenStreetMap tags the whole middle of the island as one large
``natural=scrub`` polygon, so it cannot tell the closed woodland trail from
the open scrub ridge, and the route never enters a mapped ``natural=wood``
polygon at all. The model therefore uses two sources:

* the mapped woodland, scrub and buildings, which are real polygons and are
  used over the whole island, and
* the group's own vegetation map, already published in the vegetation section
  of the guide, which gives one formation per observation point. Each
  formation reaches to the midpoint between neighbouring points, so the twenty
  metres assessed at a point lies inside one formation.

Canopy heights are the ones already quoted in the vegetation section, taken
from the published Hong Kong accounts: closed woodland 8 to 12 m, shrubland
under 2 m. The share of ground the crowns cover inside each formation is read
from the field record, so the model reproduces it by construction. What the
model adds is the geometry: the sun's path, the reach of every shadow, and
the share of the day that each point spends in sun.

The transmittance
-----------------
Crowns are treated as circles of radius ``CROWN_R`` scattered with the local
cover density. The ray from a point towards the sun is marched outwards; while
it is still inside the canopy layer it accumulates optical depth, and the
share of the sun that gets through is ``exp(-tau)``. Terrain occlusion is a
hard test, because a ridge either hides the sun or it does not.

Run:  python3 tools/build_sun_model.py
"""
import json
import math
import os
import re

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
TOOLS = os.path.join(HERE)

LAT0, LON0 = 22.3652, 114.2872
M_LAT = 110574.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
TZ = 8                        # Hong Kong is UTC+8 with no daylight saving

T_START, T_END = 11 * 60, 13 * 60 + 45
T_STEP = 5
SEG_LEN = 20.0                # metres of path assessed at each point
SEG_SAMPLES = 11
WALK_HEIGHT = 1.0             # the ray starts one metre above the ground
CROWN_R = 3.5                 # a mature evergreen broadleaf crown, metres across
MODEL_STEP = 15.0             # the model grid, metres
CORRIDOR = 22.0               # how far the formation reaches from the path

# formation, canopy height above ground, and the share of ground the crowns
# cover, for the formations the group mapped on the ground
FORMATIONS = {
    "woodland-edge": (10.0, 0.45),
    "woodland": (10.0, 0.95),
    "shrubland": (1.5, 0.20),
    "woodland-patch": (10.0, 0.50),
    "open": (0.0, 0.0),
}

# which formation each observation point sits in, from the group's vegetation map
POINT_FORMATION = {
    "o1": "open", "o2": "open", "o3": "open",
    "o4": "woodland-edge", "o5": "woodland",
    "o6": "shrubland", "o7": "woodland-patch", "o8": "open",
}

CLASS_CROWN = {"wood": 10.0, "scrub": 1.5, "building": 4.0}
CLASS_COVER = {"wood": 0.90, "scrub": 0.20, "building": 1.0}
CLASS_RANK = {"scrub": 1, "wood": 2, "building": 3}
CLASS_OF_TAG = [
    ("natural", "wood", "wood"),
    ("natural", "scrub", "scrub"),
    ("natural", "tree_row", "wood"),
    ("natural", "tree", "wood"),
    ("landuse", "forest", "wood"),
    ("building", None, "building"),
]

# the model window: the island's bounding box plus a margin
WIN_X0, WIN_X1 = -300.0, 1200.0
WIN_Y0, WIN_Y1 = -1400.0, 1250.0


# --- solar geometry (NOAA) ------------------------------------------------
def julian_day(y, m, d, minutes_local):
    if m <= 2:
        y -= 1
        m += 12
    a = math.floor(y / 100)
    b = 2 - a + math.floor(a / 4)
    jd = (math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) +
          d + b - 1524.5)
    return jd + (minutes_local - TZ * 60) / 1440.0


def solar_position(y, m, d, minutes_local, lat, lon):
    """Return (azimuth from north, altitude) in degrees."""
    jd = julian_day(y, m, d, minutes_local)
    t = (jd - 2451545.0) / 36525.0

    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360.0
    ma = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    c = (math.sin(math.radians(ma)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
         math.sin(math.radians(2 * ma)) * (0.019993 - 0.000101 * t) +
         math.sin(math.radians(3 * ma)) * 0.000289)
    omega = 125.04 - 1934.136 * t
    app_long = l0 + c - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * math.cos(math.radians(omega))

    decl = math.asin(math.sin(math.radians(eps)) * math.sin(math.radians(app_long)))
    y_eq = math.tan(math.radians(eps / 2)) ** 2
    eqtime = 4 * math.degrees(
        y_eq * math.sin(2 * math.radians(l0)) -
        2 * ecc * math.sin(math.radians(ma)) +
        4 * ecc * y_eq * math.sin(math.radians(ma)) * math.cos(2 * math.radians(l0)) -
        0.5 * y_eq * y_eq * math.sin(4 * math.radians(l0)) -
        1.25 * ecc * ecc * math.sin(2 * math.radians(ma)))

    tst = (minutes_local - TZ * 60 + eqtime + 4 * lon + 1440) % 1440
    ha = math.radians(tst / 4 - 180)

    lat_r, dec_r = math.radians(lat), decl
    sin_alt = (math.sin(lat_r) * math.sin(dec_r) +
               math.cos(lat_r) * math.cos(dec_r) * math.cos(ha))
    alt = math.degrees(math.asin(max(-1.0, min(1.0, sin_alt))))
    east = -math.cos(dec_r) * math.sin(ha)
    north = (math.sin(dec_r) * math.cos(lat_r) -
             math.cos(dec_r) * math.cos(ha) * math.sin(lat_r))
    return math.degrees(math.atan2(east, north)) % 360.0, alt


# --- local helpers --------------------------------------------------------
def to_local(lon, lat):
    return ((lon - LON0) * M_LON, (lat - LAT0) * M_LAT)


def in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            if x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


# --- loading --------------------------------------------------------------
def load_dem():
    with open(os.path.join(TOOLS, "dem30_cache.json")) as fh:
        d = json.load(fh)
    rows, cols = d["rows"], d["cols"]
    z = np.asarray(d["values"], dtype=float).reshape(rows, cols)[::-1]
    return {
        "nx": cols, "ny": rows,
        "lon0": d["w"], "lon1": d["e"], "lat0": d["s"], "lat1": d["n_lat"],
        "dx": (d["e"] - d["w"]) * M_LON / (cols - 1),
        "dy": (d["n_lat"] - d["s"]) * M_LAT / (rows - 1),
        # the grid is centred on its own window, not on the model origin
        "cx": ((d["w"] + d["e"]) * 0.5 - LON0) * M_LON,
        "cy": ((d["s"] + d["n_lat"]) * 0.5 - LAT0) * M_LAT,
        "z": z,
    }


def island_ring():
    import rings
    elements = rings.load(os.path.join(TOOLS, "coastline_raw.json"))["elements"]
    closed = [r for r in rings.build_rings(elements) if r["closed"]]
    closed.sort(key=lambda r: -rings.shoelace(r["pts"]))
    return closed[0]["pts"]


def build_grid(dem, ring):
    """The model grid: fifteen metres, the island's bounding box plus a margin."""
    nx = int(round((WIN_X1 - WIN_X0) / MODEL_STEP))
    ny = int(round((WIN_Y1 - WIN_Y0) / MODEL_STEP))
    xs = [WIN_X0 + (i + 0.5) * MODEL_STEP for i in range(nx)]
    ys = [WIN_Y1 - (j + 0.5) * MODEL_STEP for j in range(ny)]

    z = np.zeros((ny, nx))
    land = np.zeros((ny, nx), dtype=bool)
    for j in range(ny):
        for i in range(nx):
            z[j, i] = sample_dem(dem, xs[i], ys[j]) or 0.0
            land[j, i] = in_poly(xs[i], ys[j], ring)
    z = smooth_relief(z, land)
    return {"nx": nx, "ny": ny, "step": MODEL_STEP, "x0": WIN_X0, "y0": WIN_Y0,
            "xs": xs, "ys": ys, "z": z, "land": land}


def smooth_relief(z, land):
    """Round the surface off.

    Thirty metre SRTM puts a whole cliff into a single cell, so a coastal
    slope reads as a spike rather than a slope. Two passes of a nine point
    average over the land only take the corner off without moving the ridge,
    and the sea is left exactly as it was.
    """
    out = z.copy()
    for _ in range(2):
        prev = out
        out = z.copy()
        for j in range(1, z.shape[0] - 1):
            for i in range(1, z.shape[1] - 1):
                if not land[j, i]:
                    continue
                acc, n = 0.0, 0
                for dj in (-1, 0, 1):
                    for di in (-1, 0, 1):
                        jj, ii = j + dj, i + di
                        if not land[jj, ii]:
                            continue
                        w = 4.0 if (dj == 0 and di == 0) else (2.0 if dj == 0 or di == 0 else 1.0)
                        acc += prev[jj, ii] * w
                        n += w
                if n:
                    out[j, i] = acc / n
    return out


def sample_dem(dem, x, y):
    """Bilinear sample of the 30 m elevation, in local metres."""
    ny, nx = dem["ny"], dem["nx"]
    fx = (x - dem["cx"]) / dem["dx"] + (nx - 1) * 0.5
    fy = (ny - 1) * 0.5 - (y - dem["cy"]) / dem["dy"]
    if fx < 0 or fy < 0 or fx > nx - 1 or fy > ny - 1:
        return None
    x0, y0 = int(math.floor(fx)), int(math.floor(fy))
    x1, y1 = min(x0 + 1, nx - 1), min(y0 + 1, ny - 1)
    tx, ty = fx - x0, fy - y0
    z = dem["z"]
    return (z[y0, x0] * (1 - tx) * (1 - ty) + z[y0, x1] * tx * (1 - ty) +
            z[y1, x0] * (1 - tx) * ty + z[y1, x1] * tx * ty)


def load_osm_canopy(grid):
    """Cover and crown height per cell from the mapped polygons."""
    with open(os.path.join(TOOLS, "canopy_raw.json")) as fh:
        d = json.load(fh)
    cover = np.zeros((grid["ny"], grid["nx"]))
    crown = np.zeros((grid["ny"], grid["nx"]))
    rank = np.zeros((grid["ny"], grid["nx"]), dtype=int)
    for el in d["elements"]:
        tags = el.get("tags", {})
        kind = None
        for key, value, out in CLASS_OF_TAG:
            if key in tags and (value is None or tags[key] == value):
                kind = out
                break
        if kind is None:
            continue
        geom = el.get("geometry", [])
        if len(geom) < 4:
            continue
        poly = [to_local(p["lon"], p["lat"]) for p in geom]
        for j in range(grid["ny"]):
            y = grid["ys"][j]
            for i in range(grid["nx"]):
                x = grid["xs"][i]
                if rank[j, i] >= CLASS_RANK[kind]:
                    continue
                if in_poly(x, y, poly):
                    rank[j, i] = CLASS_RANK[kind]
                    cover[j, i] = CLASS_COVER[kind]
                    crown[j, i] = CLASS_CROWN[kind]
    return cover, crown


# --- route ----------------------------------------------------------------
def load_route():
    with open(os.path.join(DATA, "routes.geojson")) as fh:
        gj = json.load(fh)
    for f in gj["features"]:
        if f["properties"].get("kind") == "route":
            return [(c[0], c[1]) for c in f["geometry"]["coordinates"]]
    raise RuntimeError("no route feature")


def route_geometry(route):
    pts = [to_local(c[0], c[1]) for c in route]
    acc = [0.0]
    for i in range(len(pts) - 1):
        acc.append(acc[-1] + math.dist(pts[i], pts[i + 1]))
    return pts, acc


def project_to_route(pts, acc, lon, lat):
    px, py = to_local(lon, lat)
    best = (0.0, 1e18)
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        seg = math.dist((x1, y1), (x2, y2))
        t = 0.0
        if seg > 0:
            t = max(0.0, min(1.0, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (seg * seg)))
        d = math.dist((x1 + t * (x2 - x1), y1 + t * (y2 - y1)), (px, py))
        if d < best[1]:
            best = (acc[i] + t * seg, d)
    return best


def point_at(pts, acc, s):
    s = max(0.0, min(acc[-1], s))
    for i in range(len(pts) - 1):
        if acc[i + 1] >= s:
            seg = acc[i + 1] - acc[i]
            t = (s - acc[i]) / seg if seg else 0.0
            return (pts[i][0] + t * (pts[i + 1][0] - pts[i][0]),
                    pts[i][1] + t * (pts[i + 1][1] - pts[i][1]))
    return pts[-1]


# --- the canopy transmittance --------------------------------------------
def sun_vector(az, alt):
    a, e = math.radians(az), math.radians(alt)
    return (math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e))


def grid_cell(grid, x, y):
    i = int(math.floor((x - grid["x0"]) / grid["step"]))
    j = int(math.floor((grid["y0"] + grid["ny"] * grid["step"] - y) / grid["step"]))
    return i, j


def cell_values(grid, cover, crown, x, y):
    i, j = grid_cell(grid, x, y)
    if 0 <= i < grid["nx"] and 0 <= j < grid["ny"]:
        return cover[j, i], crown[j, i]
    return 0.0, 0.0


def sun_share(x, y, z0, vec, grid, cover, crown, reach=90.0, step=1.5):
    """Share of the sun that reaches the point, between zero and one."""
    ex, ny_, up = vec
    horiz = math.hypot(ex, ny_)
    if horiz < 1e-6 or up <= 0:
        return 0.0
    tan_alt = up / horiz
    tau = 0.0
    t = step * 0.5
    while t <= reach:
        px, py = x + ex * t, y + ny_ * t
        zt = sample_dem(grid["dem"], px, py)
        if zt is None:
            break
        zr = z0 + t * tan_alt
        if zt > zr:
            return 0.0                       # the ridge is in the way
        c, h = cell_values(grid, cover, crown, px, py)
        if c > 0 and h > 0:
            # how much of the step is still inside the canopy layer
            d0 = (zr - step * 0.5 * tan_alt) - zt
            d1 = (zr + step * 0.5 * tan_alt) - zt
            if d1 > d0:
                frac = min(1.0, max(0.0, (h - d0) / (d1 - d0)))
                tau += c * 2.0 * step * frac / (math.pi * CROWN_R)
        t += step
    return math.exp(-tau)


# --- encoding -------------------------------------------------------------
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def b36(v, n=2):
    v = max(0, int(v))
    out = ""
    for _ in range(n):
        out = B36[v % 36] + out
        v //= 36
    return out


def main():
    dem = load_dem()
    ring = island_ring()
    grid = build_grid(dem, ring)
    grid["dem"] = dem
    print("model grid %d x %d at %.0f m, land cells %d of %d"
          % (grid["nx"], grid["ny"], MODEL_STEP, int(grid["land"].sum()),
             grid["ny"] * grid["nx"]))

    cover, crown = load_osm_canopy(grid)
    print("mapped canopy cells: wood %d, scrub %d, building %d"
          % (int((crown == 10).sum()), int((crown == 1.5).sum()),
             int((crown == 4).sum())))

    route = load_route()
    pts_r, acc = route_geometry(route)
    with open(os.path.join(DATA, "field-data.json")) as fh:
        field = json.load(fh)

    for p in field["points"]:
        s, d = project_to_route(pts_r, acc, p["lng"], p["lat"])
        p["_chainage"], p["_offset"] = s, d
    chain = {p["id"]: p["_chainage"] for p in field["points"]}
    order = [p["id"] for p in field["points"]]
    zones = []
    for k, pid in enumerate(order):
        lo = 0.0 if k == 0 else (chain[order[k - 1]] + chain[pid]) / 2
        hi = acc[-1] if k == len(order) - 1 else (chain[pid] + chain[order[k + 1]]) / 2
        zones.append((lo, hi, POINT_FORMATION[pid]))

    # the corridor carries the group's vegetation map along the path
    for lo, hi, form in zones:
        h, c = FORMATIONS[form]
        if h <= 0:
            continue
        for j in range(grid["ny"]):
            y = grid["ys"][j]
            for i in range(grid["nx"]):
                x = grid["xs"][i]
                s, d = project_to_route(pts_r, acc, LON0 + x / M_LON, LAT0 + y / M_LAT)
                if d > CORRIDOR or not (lo <= s <= hi):
                    continue
                if h >= crown[j, i]:
                    crown[j, i] = h
                    cover[j, i] = max(cover[j, i], c)
    print("corridor applied, cells with crowns %d" % int((crown > 0).sum()))

    # the sun
    times = list(range(T_START, T_END + 1, T_STEP))
    track = []
    for mins in times:
        az, alt = solar_position(2026, 11, 13, mins, LAT0, LON0)
        track.append({"t": mins, "az": round(az, 3), "alt": round(alt, 3)})

    results = []
    for p in field["points"]:
        s = p["_chainage"]
        samples = []
        for k in range(SEG_SAMPLES):
            ss = s - SEG_LEN / 2 + SEG_LEN * k / (SEG_SAMPLES - 1)
            x, y = point_at(pts_r, acc, ss)
            z = sample_dem(dem, x, y) or 0.0
            share = []
            for tr in track:
                vec = sun_vector(tr["az"], tr["alt"])
                share.append(sun_share(x, y, z + WALK_HEIGHT, vec, grid, cover, crown))
            samples.append({"s": ss, "x": x, "y": y, "z": z, "share": share})
        lo, hi = _window(p["time"], times)
        win = np.array([smp["share"][lo:hi + 1] for smp in samples], dtype=float)
        sunlit = float(win.mean())
        # the three classes describe how much of the twenty metres is in shade
        shaded = 1.0 - sunlit
        model = "unshaded" if shaded < 0.10 else ("mostly" if shaded >= 0.60 else "partly")
        results.append({
            "id": p["id"], "code": p["code"], "name": p["name"], "zh": p["zh"],
            "time": p["time"], "field": p["shade"], "model": model,
            "sunlit": round(sunlit, 3), "chainage": round(p["_chainage"], 1),
            "lat": p["lat"], "lng": p["lng"], "formation": POINT_FORMATION[p["id"]],
            "samples": samples,
        })
        print("%-3s field=%-9s model=%-9s sunlit %.2f  %s"
              % (p["code"], p["shade"], model, sunlit, POINT_FORMATION[p["id"]]))

    agree = sum(1 for r in results if r["field"] == r["model"])
    print("model agrees with the field record at %d of %d stops" % (agree, len(results)))

    # --- write the data file ---------------------------------------------
    zchars = "".join(b36(round((float(grid["z"][j, i]) + 5) * 4))
                     for j in range(grid["ny"]) for i in range(grid["nx"]))
    cchars = ""
    for j in range(grid["ny"]):
        for i in range(grid["nx"]):
            cchars += B36[min(35, int(round(cover[j, i] * 35)))]
            cchars += B36[min(35, int(round(crown[j, i] * 2)))]
    land = ""
    for j in range(grid["ny"]):
        bits = 0
        for i in range(grid["nx"]):
            if grid["land"][j, i]:
                bits |= 1 << i
        land += "%0*x" % ((grid["nx"] + 3) // 4, bits)

    out = {
        "meta": {
            "date": "13 November 2026",
            "zone": "HKT, UTC+8",
            "lat": LAT0, "lon": LON0,
            "dem": "CGIAR SRTM 30 m via OpenTopoData, sampled onto a 15 m grid",
            "canopy": "OpenStreetMap natural=wood and natural=scrub with the group's own vegetation map along the path. ODbL 1.0.",
            "method": "The sun is placed with the NOAA position algorithm. Every cell is tested for whether the ray towards the sun is blocked by terrain or by canopy, and the share of sun that gets through is worked out from the canopy density.",
            "walkHeight": WALK_HEIGHT,
            "crownRadius": CROWN_R,
            "thresholds": "Less than a tenth of the section in shade is unshaded, three fifths or more is mostly shaded.",
            "step": MODEL_STEP,
        },
        "grid": {
            "nx": grid["nx"], "ny": grid["ny"], "step": MODEL_STEP,
            "x0": grid["x0"], "y0": grid["y0"],
            "lat0": LAT0 + WIN_Y0 / M_LAT, "lon0": LON0 + WIN_X0 / M_LON,
            "z": zchars, "canopy": cchars, "land": land,
        },
        "sun": track,
        "route": [[round(c[1], 6), round(c[0], 6)] for c in route],
        "points": [{
            "id": r["id"], "code": r["code"], "name": r["name"], "zh": r["zh"],
            "time": r["time"], "field": r["field"], "model": r["model"],
            "sunlit": r["sunlit"], "chainage": r["chainage"],
            "lat": r["lat"], "lng": r["lng"], "formation": r["formation"],
            "share": [round(v, 3) for smp in r["samples"] for v in smp["share"]],
        } for r in results],
        "segments": [[
            [round(LAT0 + smp["y"] / M_LAT, 6), round(LON0 + smp["x"] / M_LON, 6),
             round(smp["z"], 2)]
            for smp in r["samples"]] for r in results],
    }
    path = os.path.join(DATA, "sun-model.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build_sun_model.py. Do not edit by hand.\n"
                 "   Canopy geometry (c) OpenStreetMap contributors, ODbL 1.0. */\n")
        fh.write("window.SUN_MODEL = ")
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print("wrote %s (%d bytes)" % (path, os.path.getsize(path)))


def _window(text, times):
    mins = [int(a) * 60 + int(b) for a, b in re.findall(r"(\d{1,2}):(\d{2})", text)]
    if not mins:
        return 0, len(times) - 1
    lo = max(0, (min(mins) - T_START) // T_STEP)
    hi = min(len(times) - 1, (max(mins) - T_START) // T_STEP)
    return lo, hi


if __name__ == "__main__":
    main()
