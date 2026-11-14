#!/usr/bin/env python3
"""Fetch OpenStreetMap geometry for the Sharp Island area and cache it locally.

Everything the model needs comes from three natural keys:

* ``natural=coastline`` for the real shorelines,
* ``natural=beach`` for the tombolo and the gazetted bathing beach,
* ``natural=bare_rock`` for the reef group at the far end.

The responses are cached under ``tools/`` so the model can be rebuilt offline.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

# Slightly larger than the model window, so that shorelines are not cut in the
# middle and every ring closes.
BBOX = (22.3480, 114.2740, 22.3830, 114.3010)

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

COAST_Q = """
[out:json][timeout:180];
way["natural"="coastline"](%(s)s,%(w)s,%(n)s,%(e)s);
out geom;
"""

DETAIL_Q = """
[out:json][timeout:180];
(
  way["natural"="beach"](%(s)s,%(w)s,%(n)s,%(e)s);
  way["natural"="bare_rock"](%(s)s,%(w)s,%(n)s,%(e)s);
  way["natural"="rock"](%(s)s,%(w)s,%(n)s,%(e)s);
  way["place"](%(s)s,%(w)s,%(n)s,%(e)s);
);
out geom;
"""


def bbox_str():
    s, w, n, e = BBOX
    return {"s": s, "w": w, "n": n, "e": e}


def run(query, cache_name, tries=3):
    path = os.path.join(HERE, cache_name)
    if os.path.exists(path) and os.path.getsize(path) > 500:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("elements"):
            print("cached  %-24s %d elements" % (cache_name, len(data["elements"])))
            return data

    args = bbox_str()
    for attempt in range(tries):
        for mirror in MIRRORS:
            try:
                body = urllib.parse.urlencode({"data": query % args}).encode()
                req = urllib.request.Request(
                    mirror, data=body,
                    headers={"User-Agent": "sharp-island-coursework/1.0"})
                with urllib.request.urlopen(req, timeout=150) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                if data.get("elements"):
                    with open(path, "w", encoding="utf-8") as fh:
                        json.dump(data, fh)
                    print("fetched %-24s %d elements from %s"
                          % (cache_name, len(data["elements"]), mirror.split("/")[2]))
                    return data
            except Exception as exc:
                print("  fail %s: %s" % (mirror.split("/")[2], repr(exc)[:90]))
        time.sleep(4)
    return {"elements": []}


def main():
    run(COAST_Q, "coastline_raw.json")
    run(DETAIL_Q, "tombolo_raw.json")


if __name__ == "__main__":
    main()
