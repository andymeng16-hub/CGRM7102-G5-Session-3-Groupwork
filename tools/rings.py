#!/usr/bin/env python3
"""Assemble OpenStreetMap coastline ways into closed rings.

Coastline data in OSM is split into many short ways that share end nodes. This
script joins them back into rings using a node-graph walk, so the model can use
real island outlines instead of a drawn approximation.
"""
import json
import math
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ORIGIN_LAT = 22.3652
ORIGIN_LON = 114.2872
M_PER_DEG_LAT = 110574.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(ORIGIN_LAT))


def to_local(lon, lat):
    """Project lon/lat to metres east and north of the model origin."""
    return ((lon - ORIGIN_LON) * M_PER_DEG_LON,
            (lat - ORIGIN_LAT) * M_PER_DEG_LAT)


def load(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def build_graph(elements):
    """Return ways by id and an adjacency map from node id to incident ways."""
    ways = {}
    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        ways[el["id"]] = el
    incident = defaultdict(list)
    for wid, el in ways.items():
        nodes = el["nodes"]
        incident[nodes[0]].append(wid)
        incident[nodes[-1]].append(wid)
    return ways, incident


def walk_ring(ways, incident, start_way):
    """Walk unused ways from start_way until the chain closes or runs out."""
    order = [start_way]
    used = {start_way}
    el = ways[start_way]
    cur_node = el["nodes"][-1]
    while True:
        nxt = None
        for wid in incident.get(cur_node, []):
            if wid in used:
                continue
            nxt = wid
            break
        if nxt is None:
            break
        el = ways[nxt]
        used.add(nxt)
        order.append(nxt)
        if el["nodes"][0] == cur_node:
            cur_node = el["nodes"][-1]
        else:
            cur_node = el["nodes"][0]
    return order, cur_node


def ring_points(ways, order):
    """Concatenate the geometry of an ordered list of ways."""
    pts = []
    for wid in order:
        el = ways[wid]
        seg = [to_local(p["lon"], p["lat"]) for p in el["geometry"]]
        if pts:
            if seg[0] == pts[-1]:
                seg = seg[1:]
            elif seg[-1] == pts[-1]:
                seg = seg[::-1][1:]
        pts.extend(seg)
    return pts


def shoelace(pts):
    total = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def build_rings(elements):
    """Return closed rings as lists of local-metre points."""
    ways, incident = build_graph(elements)
    seen = set()
    rings = []
    for wid in sorted(ways):
        if wid in seen:
            continue
        order, end_node = walk_ring(ways, incident, wid)
        seen.update(order)
        pts = ring_points(ways, order)
        if len(pts) < 4:
            continue
        closed = math.dist(pts[0], pts[-1]) < 0.05
        if closed:
            pts = pts[:-1]
        rings.append({"ways": order, "pts": pts, "closed": closed})
    return rings


def main():
    elements = load(os.path.join(HERE, "coastline_raw.json"))["elements"]
    rings = build_rings(elements)
    closed = [r for r in rings if r["closed"]]
    print("ways %d, rings %d, closed %d" % (len(elements), len(rings), len(closed)))
    for r in sorted(closed, key=lambda r: -shoelace(r["pts"])):
        p = r["pts"]
        print("  ways %-40s n=%4d area %10.1f  E %7.1f..%7.1f  N %7.1f..%7.1f" % (
            ",".join(str(w) for w in r["ways"][:6]), len(p), shoelace(p),
            min(x for x, _ in p), max(x for x, _ in p),
            min(y for _, y in p), max(y for _, y in p)))


if __name__ == "__main__":
    main()
