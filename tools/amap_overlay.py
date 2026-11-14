#!/usr/bin/env python3
"""Build an HTML page that overlays the model geometry on AMap satellite tiles.

The site's own map already projects the route into GCJ-02, so the same
conversion is applied here: WGS-84 vector geometry is shifted to GCJ-02 and
then drawn over the official AMap raster tiles.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rings import build_rings, load, shoelace, to_local  # noqa: E402

OUT = "/tmp/amap_overlay.html"


def wgs2gcj(lng, lat):
    """WGS-84 to GCJ-02, the datum AMap and Tencent Maps use in this region."""
    a = 6378245.0
    ee = 0.006693421622965943

    def t_lat(x, y):
        r = -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*math.sqrt(abs(x))
        r += (20.0*math.sin(6.0*x*math.pi) + 20.0*math.sin(2.0*x*math.pi)) * 2.0/3.0
        r += (20.0*math.sin(y*math.pi) + 40.0*math.sin(y/3.0*math.pi)) * 2.0/3.0
        r += (160.0*math.sin(y/12.0*math.pi) + 320*math.sin(y*math.pi/30.0)) * 2.0/3.0
        return r

    def t_lng(x, y):
        r = 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*math.sqrt(abs(x))
        r += (20.0*math.sin(6.0*x*math.pi) + 20.0*math.sin(2.0*x*math.pi)) * 2.0/3.0
        r += (20.0*math.sin(x*math.pi) + 40.0*math.sin(x/3.0*math.pi)) * 2.0/3.0
        r += (150.0*math.sin(x/12.0*math.pi) + 320*math.sin(x/30.0*math.pi)) * 2.0/3.0
        return r

    d_lat = t_lat(lng-105.0, lat-35.0)
    d_lng = t_lng(lng-105.0, lat-35.0)
    rad = lat/180.0*math.pi
    magic = math.sin(rad)
    magic = 1 - ee*magic*magic
    sq = math.sqrt(magic)
    d_lat = d_lat*180.0/((a*(1-ee))/(magic*sq)*math.pi)
    d_lng = d_lng*180.0/(a/sq*math.cos(rad)*math.pi)
    return lng + d_lng, lat + d_lat


def merc(lat, lng, z):
    s = 256 * math.pow(2, z)
    sn = math.sin(lat*math.pi/180.0)
    return ((lng+180.0)/360.0*s,
            (.5 - math.log((1+sn)/(1-sn))/(4*math.pi))*s)


def main():
    elements = load(os.path.join(HERE, "coastline_raw.json"))["elements"]
    rings = build_rings(elements)
    tom = load(os.path.join(HERE, "tombolo_raw.json"))["elements"]
    bar_el = [e for e in tom if e["id"] == 282312620][0]
    bar_ll = [(p["lon"], p["lat"]) for p in bar_el["geometry"]]
    rocks_ll = [[(p["lon"], p["lat"]) for p in e["geometry"]]
                for e in tom if e["tags"].get("natural") == "bare_rock"]
    ring_ll = [[(p[0] + 114.2872, p[1] + 22.3652) for p in r["pts"]]
               for r in rings]

    z = 17
    lat0, lat1 = 22.3620, 22.3672
    lng0, lng1 = 114.2840, 114.2905
    g = [wgs2gcj(lng0, lat1), wgs2gcj(lng1, lat0)]
    p0 = merc(g[0][1], g[0][0], z)
    p1 = merc(g[1][1], g[1][0], z)
    W = int(p1[0]-p0[0])
    H = int(p1[1]-p0[1])
    print("canvas %d x %d" % (W, H))

    def T(pt):
        gg = wgs2gcj(pt[0], pt[1])
        q = merc(gg[1], gg[0], z)
        return (q[0]-p0[0], q[1]-p0[1])

    parts = []
    tx0 = int(p0[0]//256)
    tx1 = int((p1[0]-1)//256)
    ty0 = int(p0[1]//256)
    ty1 = int((p1[1]-1)//256)
    for ty in range(ty0, ty1+1):
        for tx in range(tx0, tx1+1):
            sub = 1 + ((tx+ty) % 4)
            url = ("https://webst0%d.is.autonavi.com/appmaptile?style=6&x=%d&y=%d&z=%d"
                   % (sub, tx, ty, z))
            parts.append('<image x="%d" y="%d" width="256" height="256" href="%s" '
                         'crossorigin="anonymous"/>'
                         % (tx*256-p0[0], ty*256-p0[1], url))

    for r in ring_ll:
        d = "M " + " L ".join("%.1f %.1f" % T(p) for p in r) + " Z"
        parts.append('<path d="%s" fill="none" stroke="#00ff88" stroke-width="1.8" '
                     'opacity="0.9"/>' % d)
    d = "M " + " L ".join("%.1f %.1f" % T(p) for p in bar_ll) + " Z"
    parts.append('<path d="%s" fill="#ffd400" fill-opacity="0.35" stroke="#ffe45c" '
                 'stroke-width="3"/>' % d)
    for p in bar_ll:
        x, y = T(p)
        parts.append('<circle cx="%.1f" cy="%.1f" r="4" fill="#fff"/>' % (x, y))
    for r in rocks_ll:
        d = "M " + " L ".join("%.1f %.1f" % T(p) for p in r) + " Z"
        parts.append('<path d="%s" fill="#ff5a2d" fill-opacity="0.5" stroke="#ff8a5c" '
                     'stroke-width="2"/>' % d)

    html = """<!doctype html><html><head><meta charset="utf-8"><title>amap overlay</title>
<style>body{margin:0;background:#111}svg{display:block}</style></head><body>
<svg width="%d" height="%d" viewBox="0 0 %d %d">%s</svg></body></html>""" % (
        W, H, W, H, "\n".join(parts))
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
