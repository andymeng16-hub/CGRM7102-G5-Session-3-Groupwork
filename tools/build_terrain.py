#!/usr/bin/env python3
"""Build the Sharp Island DEM, terrain grid and local map tiles.

Data source for elevation: SRTM 90 m via OpenTopoData (sampled once, cached in
tools/dem_cache.json). The island outline is a group-drawn approximation from
public gazetteers and the field survey; tiles are ILLUSTRATIVE, not an official
basemap. Tile indices follow the GCJ-02 grid used by Tencent Maps, so the same
pyramid can be overlaid with TMap.ImageTileLayer and drawn in our own viewer.

Run:  python3 tools/build_terrain.py
"""
import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
DATA = os.path.join(ROOT, "data")
TILES = os.path.join(ROOT, "assets", "tiles")
CACHE = os.path.join(TOOLS, "dem_cache.json")

# WGS-84 bounds used for terrain sampling
S_LAT, N_LAT = 22.3490, 22.3730
W_LON, E_LON = 114.2800, 114.3040

# Group-drawn approximate coastline (WGS-84), NW pier to SE Hap Mun Bay
ISLAND = [
    (22.3698, 114.2875), (22.3694, 114.2908), (22.3680, 114.2938),
    (22.3655, 114.2963), (22.3625, 114.2980), (22.3592, 114.2986),
    (22.3564, 114.2972), (22.3548, 114.2946), (22.3556, 114.2916),
    (22.3578, 114.2892), (22.3606, 114.2876), (22.3636, 114.2866),
    (22.3666, 114.2861), (22.3686, 114.2864),
]
# Kiu Tau islet, joined to Sharp Island by the tombolo at low tide
KIU_TAU = [
    (22.3663, 114.2847), (22.3669, 114.2853), (22.3667, 114.2860),
    (22.3659, 114.2862), (22.3655, 114.2855), (22.3657, 114.2848),
]

ZMAX, ZMIN, TILE = 17, 13, 256


def gcj_offset(lng, lat):
    """WGS-84 to GCJ-02 (Tencent / national standard)."""
    def tl(x, y):
        r = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*math.sqrt(abs(x))
        r += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi)) * 2/3
        r += (20*math.sin(y*math.pi) + 40*math.sin(y/3*math.pi)) * 2/3
        r += (160*math.sin(y/12*math.pi) + 320*math.sin(y*math.pi/30)) * 2/3
        return r
    def tg(x, y):
        r = 300 + x + 2*y + .1*x*x + .1*x*y + .1*math.sqrt(abs(x))
        r += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi)) * 2/3
        r += (20*math.sin(x*math.pi) + 40*math.sin(x/3*math.pi)) * 2/3
        r += (150*math.sin(x/12*math.pi) + 300*math.sin(x/30*math.pi)) * 2/3
        return r
    a, ee = 6378245.0, .006693421622965943
    dlat, dlng = tl(lng-105, lat-35), tg(lng-105, lat-35)
    rad = lat/180*math.pi
    magic = 1 - ee*math.sin(rad)**2
    sq = math.sqrt(magic)
    dlat = dlat*180/((a*(1-ee))/(magic*sq)*math.pi)
    dlng = dlng*180/(a/sq*math.cos(rad)*math.pi)
    return dlng, dlat

DLNG, DLAT = gcj_offset((W_LON+E_LON)/2, (S_LAT+N_LAT)/2)


def lon2x(lon, z):
    return (lon + 180.0) / 360.0 * (TILE << z)


def lat2y(lat, z):
    s = math.sin(math.radians(lat))
    return (0.5 - math.log((1+s)/(1-s))/(4*math.pi)) * (TILE << z)


def x2lon(x, z):
    return x / (TILE << z) * 360.0 - 180.0


def y2lat(y, z):
    n = math.pi - 2*math.pi*y/(TILE << z)
    return math.degrees(math.atan(math.sinh(n)))


def fetch_dem():
    if os.path.exists(CACHE):
        with open(CACHE) as f:
            return json.load(f)
    n = 25
    lats = np.linspace(S_LAT, N_LAT, n)
    lons = np.linspace(W_LON, E_LON, n)
    pts = [(float(la), float(lo)) for la in lats for lo in lons]
    vals = []
    for k in range(0, len(pts), 100):
        chunk = pts[k:k+100]
        url = "https://api.opentopodata.org/v1/srtm90m?locations=" + \
              "|".join(f"{la:.6f},{lo:.6f}" for la, lo in chunk)
        print("  DEM request", k//100+1, "...", flush=True)
        with urllib.request.urlopen(url, timeout=40) as r:
            d = json.load(r)
        vals.extend([(v["elevation"] if v["elevation"] is not None else 0.0)
                     for v in d["results"]])
    out = {"n": n, "s": S_LAT, "n_lat": N_LAT, "w": W_LON, "e": E_LON,
           "values": vals, "source": "SRTM 90 m via OpenTopoData"}
    with open(CACHE, "w") as f:
        json.dump(out, f)
    return out


def build_grid(master_w, master_h, west_px, north_py):
    """DEM sampled at every z=17 master pixel (Web Mercator, WGS-84 space)."""
    dem = fetch_dem()
    n = dem["n"]
    arr = np.asarray(dem["values"], dtype=float).reshape(n, n)[::-1]  # north first
    arr = gaussian_filter(arr, .7)
    arr = np.clip(arr, 0, 140)

    xx = (west_px + np.arange(master_w)) / (TILE << ZMAX) * 360 - 180
    yy = north_py + np.arange(master_h)
    lat = np.degrees(np.arctan(np.sinh(np.pi - 2*np.pi*yy/(TILE << ZMAX))))
    gx = (xx - W_LON) / (E_LON - W_LON) * (n-1)
    gy = (N_LAT - lat) / (N_LAT - S_LAT) * (n-1)
    GX, GY = np.meshgrid(gx, gy)
    grid = map_coordinates(arr, [GY, GX], order=1, mode="nearest")
    grid = gaussian_filter(grid, 2.0)
    return grid


def poly_mask(shape, poly, west_px, north_py):
    im = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    pts = [(lon2x(lo, ZMAX)-west_px, lat2y(la, ZMAX)-north_py) for la, lo in poly]
    d.polygon(pts, fill=255)
    return np.asarray(im) > 0


def hypsometric(e):
    """Cartographic elevation ramp (RGB)."""
    stops = [
        (0,   (232, 226, 199)),   # beach / sand
        (8,   (223, 229, 198)),
        (25,  (196, 216, 174)),
        (45,  (163, 197, 146)),
        (65,  (137, 174, 122)),
        (90,  (178, 166, 126)),
        (140, (150, 133, 102)),
    ]
    out = np.zeros(e.shape + (3,), dtype=float)
    for (a, ca), (b, cb) in zip(stops[:-1], stops[1:]):
        m = (e >= a) & (e < b)
        t = ((e - a) / (b - a))[m]
        for c in range(3):
            out[:, :, c][m] = ca[c] + (cb[c]-ca[c]) * t
    out[e >= stops[-1][0]] = stops[-1][1]
    return out


def render_master():
    # GCJ-02 tile range (Tencent grid) covering the island
    g_w, g_e = W_LON + DLNG, E_LON + DLNG
    g_s, g_n = S_LAT + DLAT, N_LAT + DLAT
    x0, x1 = int(math.floor(lon2x(g_w, ZMAX)/TILE)), int(math.floor(lon2x(g_e, ZMAX)/TILE))
    y0, y1 = int(math.floor(lat2y(g_n, ZMAX)/TILE)), int(math.floor(lat2y(g_s, ZMAX)/TILE))
    west_px, north_py = x0*TILE, y0*TILE
    mw, mh = (x1-x0+1)*TILE, (y1-y0+1)*TILE
    print(f"  master {mw}x{mh}, tiles x{x0}-{x1} y{y0}-{y1}, GCJ offset {DLNG:.6f}/{DLAT:.6f}")

    # Each GCJ tile corresponds to a WGS-84 area shifted by (-DLNG,-DLAT).
    # Sample the DEM in WGS-84 coordinates at the shifted master origin.
    shifted_lon = x2lon(west_px, ZMAX) - DLNG
    shifted_y = north_py
    # shift in Y derived from latitude offset at the centre
    shifted_north_py = north_py - (lat2y((S_LAT+N_LAT)/2 + DLAT, ZMAX)
                                   - lat2y((S_LAT+N_LAT)/2, ZMAX))
    shifted_west_px = lon2x(shifted_lon, ZMAX)
    dem = build_grid(mw, mh, shifted_west_px, shifted_north_py)

    land = poly_mask(dem.shape, ISLAND, shifted_west_px, shifted_north_py)
    kt = poly_mask(dem.shape, KIU_TAU, shifted_west_px, shifted_north_py)
    land = land | kt
    dem = np.where(land, dem, 0.0)

    # Sea depth bands by dilating the land mask
    lm = Image.fromarray((land*255).astype("uint8"))
    bands = []
    for r in (9, 21, 39, 65):
        bands.append(np.asarray(lm.filter(ImageFilter.MaxFilter(r))) > 0)
    sea = np.zeros(dem.shape + (3,), dtype=float)
    sea[:] = (166, 202, 220)
    for b, col in zip(bands, [(178, 212, 228), (192, 219, 233), (207, 228, 239), (220, 236, 244)]):
        sea[b] = col
    # shoreline ring
    edge = land ^ (np.asarray(lm.filter(ImageFilter.MaxFilter(5))) > 0)

    # Hillshade from gradients, light from NW
    dy, dx = np.gradient(dem)
    nx, ny, nz = -dx*0.9, dy*0.9, np.ones_like(dem)*8.0
    ln = np.sqrt(nx*nx+ny*ny+nz*nz)
    shade = (nx*(-0.55) + ny*(-0.55) + nz*0.65) / (ln*0.89)
    shade = np.clip(shade, .35, 1.25)

    base = sea.copy()
    landcol = hypsometric(dem)
    base[land] = landcol[land]
    base = base * shade[:, :, None]
    base = np.clip(base, 0, 255).astype("uint8")
    # coastline stroke
    base[edge] = (105, 128, 112)

    # ---- contours (also used for the overlay tiles) ----
    interval = 10
    level = np.floor(dem/interval)
    cx = level[:, 1:] != level[:, :-1]
    cy = level[1:, :] != level[:-1, :]
    contour = np.zeros(dem.shape, bool)
    contour[:, :-1] |= cx
    contour[:-1, :] |= cy
    contour &= land
    base[contour] = (112, 126, 104)

    base_im = Image.fromarray(base, "RGB")
    d = ImageDraw.Draw(base_im)
    uni = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    font = ImageFont.truetype(uni, 19)
    small = ImageFont.truetype(uni, 14)

    # graticule every 0.005 degrees, drawn in WGS-84 then shifted to GCJ pixels
    for lo in np.arange(114.280, 114.305, .005):
        px = lon2x(lo + DLNG, ZMAX) - west_px
        if 0 <= px < mw:
            d.line([(px, 0), (px, mh)], fill=(255, 255, 255), width=1)
            d.text((px+5, 10), f"{lo:.3f}E", fill=(87, 110, 120), font=small)
    for la in np.arange(22.350, 22.375, .005):
        py = lat2y(la + DLAT, ZMAX) - north_py
        if 0 <= py < mh:
            d.line([(0, py), (mw, py)], fill=(255, 255, 255), width=1)
            d.text((8, py+4), f"{la:.3f}N", fill=(87, 110, 120), font=small)

    labels = [
        (22.3686, 114.2886, "KIU TSUI PIER", "桥咀码头"),
        (22.3657, 114.2855, "KIU TAU", "桥头"),
        (22.3672, 114.2922, "VIEWING POINT", "观景台"),
        (22.3569, 114.2962, "HAP MUN BAY", "厦门湾"),
        (22.3618, 114.2949, "KIU TSUI COUNTRY PARK", "桥咀郊野公园"),
    ]
    zh_font = ImageFont.truetype(uni, 16)
    for la, lo, en, zh in labels:
        px, py = lon2x(lo+DLNG, ZMAX)-west_px, lat2y(la+DLAT, ZMAX)-north_py
        for offset, text, fnt in ((0, en, font), (23, zh, zh_font)):
            d.text((px+3, py+2+offset), text, fill=(255, 255, 255), font=fnt,
                   stroke_width=3, stroke_fill=(255, 255, 255))
            d.text((px+3, py+2+offset), text, fill=(48, 66, 62), font=fnt)

    # ---- transparent overlay: contour lines + relief shading ----
    ov = np.zeros((mh, mw, 4), dtype="uint8")
    ov[contour] = (150, 92, 52, 235)
    sh = np.clip((1.0 - shade)*175, 0, 95).astype("uint8")
    ov[land, 3] = np.maximum(ov[land, 3], sh[land])
    ov[land, 0:3] = np.where(ov[land, 3:4] > 0, (66, 74, 62), ov[land, 0:3])
    # contour emphasis on land only, keep alpha
    ov[contour] = (168, 96, 48, 245)
    overlay_im = Image.fromarray(ov, "RGBA")
    od = ImageDraw.Draw(overlay_im)
    for la, lo, txt in [(22.3668, 114.2912, "80 m"), (22.3632, 114.2930, "40 m")]:
        px, py = lon2x(lo+DLNG, ZMAX)-west_px, lat2y(la+DLAT, ZMAX)-north_py
        od.text((px, py), txt, fill=(150, 84, 42, 230), font=small)

    # ---- compact terrain grid for the JS 3D model (WGS-84 bounds) ----
    n = 72
    gx = np.linspace(0, mw-1, n)
    gy = np.linspace(0, mh-1, n)
    zz = dem[np.ix_(np.clip(np.round(gy).astype(int), 0, mh-1),
                    np.clip(np.round(gx).astype(int), 0, mw-1))]
    lnd = land[np.ix_(np.clip(np.round(gy).astype(int), 0, mh-1),
                      np.clip(np.round(gx).astype(int), 0, mw-1))]
    terrain = {
        "n": n, "s": S_LAT, "north": N_LAT, "w": W_LON, "e": E_LON,
        "max": float(dem.max()),
        "z": [[round(float(v), 1) for v in row] for row in zz],
        "land": [[1 if v else 0 for v in row] for row in lnd],
        "source": "SRTM 90 m DEM via OpenTopoData, resampled and masked by a group-drawn coastline. Indicative only.",
        "gcj": {"dlng": round(DLNG, 7), "dlat": round(DLAT, 7)}
    }
    with open(os.path.join(DATA, "terrain.js"), "w") as f:
        f.write("/* Indicative terrain grid: see tools/build_terrain.py */\n")
        f.write("window.TERRAIN = " + json.dumps(terrain, separators=(",", ":")) + ";\n")

    return base_im, overlay_im, (x0, y0, x1, y1), (west_px, north_py), (shifted_west_px, shifted_north_py)


def slice_tiles(base_im, overlay_im, bounds):
    x0, y0, x1, y1 = bounds
    for z in range(ZMIN, ZMAX+1):
        f = 2 ** (ZMAX - z)
        small_base = base_im.resize((base_im.width//f, base_im.height//f), Image.LANCZOS)
        small_ov = overlay_im.resize((overlay_im.width//f, overlay_im.height//f), Image.LANCZOS)
        # GCJ tile indices at this zoom
        gx0, gx1 = x0 // f, x1 // f
        gy0, gy1 = y0 // f, y1 // f
        for x in range(gx0, gx1+1):
            for y in range(gy0, gy1+1):
                # position of this tile in the z=17 master, converted to the small image
                left = (x*f*TILE - x0*TILE) // f
                top = (y*f*TILE - y0*TILE) // f
                box = (left, top, left+TILE, top+TILE)
                for kind, src in (("base", small_base), ("overlay", small_ov)):
                    # Padding for tiles that extend past the master. Use the
                    # same far-sea colour as the rendered base (166,202,220
                    # after hillshade) so the seam is invisible on the map.
                    SEA_PAD = (121, 147, 160)
                    tile = Image.new("RGBA" if kind == "overlay" else "RGB",
                                     (TILE, TILE),
                                     SEA_PAD + (0,) if kind == "overlay" else SEA_PAD)
                    # crop with padding
                    crop = src.crop((max(0, left), max(0, top),
                                     min(src.width, left+TILE), min(src.height, top+TILE)))
                    ox, oy = max(0, -left), max(0, -top)
                    tile.paste(crop, (ox, oy))
                    folder = os.path.join(TILES, kind, str(z), str(x))
                    os.makedirs(folder, exist_ok=True)
                    tile.save(os.path.join(folder, f"{y}.png"), optimize=True)
        print(f"  z{z}: {len(range(gx0,gx1+1))*len(range(gy0,gy1+1))} tiles per layer")


if __name__ == "__main__":
    print("Building Sharp Island DEM + tiles ...")
    b, o, bounds, _, _ = render_master()
    slice_tiles(b, o, bounds)
    b.save(os.path.join(TOOLS, "master_base.png"))
    print("Done. Master preview saved to tools/master_base.png")
