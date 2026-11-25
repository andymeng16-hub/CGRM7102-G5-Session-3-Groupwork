# Sharp Island, One Route, One Island

A field-based GIS-style visitor guide to a single continuous walking route across
Sharp Island (Kiu Tsui Chau), Kiu Tsui Country Park, Sai Kung, Hong Kong, China.
Everything in it comes from the group's own survey of 13 November 2026: eight
observation points, sixty-six photographs, one elevation profile, a working model
of the sandbar the tide takes away, and a section along the route with the
share of the sun that reached it at the hour each point was walked.

The site is a static website. No build step, no package manager, no framework.
The guide runs as an accordion, one part open at a time, and the title at the
head of the page is set as a letterpress.

中文简介：本仓库是中国香港西贡桥咀洲一条连续步行路线的地理信息式实地导览，
内容全部来自小组 2026 年 11 月 13 日的实地考察，共八个观察点、六十六张照片、
一幅海拔剖面图、一个会随潮位涨落而淹没的连岛沙洲模型，以及一个以当天真实
太阳位置投影的三维日照模型。网站为纯静态页面，无需安装任何依赖。

---

## Three language versions

The guide exists in three complete versions, switched from the navigation bar:

| | |
|---|---|
| **EN** | English |
| **简中** | 简体中文（香港书写习惯） |
| **繁中** | 繁體中文（香港正字） |

Each version is written as a whole, not as English with a Chinese line underneath.
The Traditional Chinese version is derived from the Simplified Chinese one at run
time from a single conversion table, so the two Chinese versions cannot drift
apart. The choice is remembered in the browser, and a version can be linked
directly with `?lang=zh-hant`, `?lang=zh-hans` or `?lang=en`.

## How to open it

**One file is not enough.** `index.html` reads the survey data from `data/`, the
photographs and map tiles from `assets/`, the layout from `styles.css` and the
behaviour from `app.js`. All of them live in the same folder, so keep the folder
together.

**Nothing needs to be installed.** Two ways to read the guide:

1. Download the repository (Code, then Download ZIP), unzip it, and double-click
   `index.html`. The page works straight from the file system.
2. Or serve the folder over HTTP, which is a little more faithful:

   ```bash
   cd CGRM7102-G5-Session-3-Groupwork
   python3 -m http.server 8000
   ```

   then open <http://localhost:8000>.

If `index.html` is ever opened on its own, the page says so plainly instead of
showing a broken document.

Two things are worth knowing about the offline case:

* The basemap is drawn from the official AMap (AutoNavi) tile service, so it
  needs a network connection. When the tiles cannot be reached the page says
  so, and the local terrain tiles built from the group's own elevation grid
  take over instead. The route, the eight markers, the ten-metre contours and
  the cursor are all still there, because they are drawn on top of the tiles
  from the survey data.
* Photographs are loaded lazily, so they appear as the page scrolls to them.

## What is in the folder

```
index.html              the page itself
styles.css              the whole design system, light and dark
app.js                  every map, chart, model and the language switch
data/
  field-data.js         the survey: points, stages, notes, sources, team
  field-data.json       the same survey as JSON, for QGIS
  terrain.js            the elevation grid the profile and the model are built on
  tombolo-model.js      the baked surface the tide panel reads
  sun-model.js          the baked solar model: elevation, canopy, sun track
  vegetation.js         four plant communities and their plates
  gallery.js            the photo section: four groups and thirty-seven captions
  zh-hant.js            the Simplified to Traditional conversion table
  survey-points.geojson the eight observation points, for QGIS
  routes.geojson        the route geometry, for QGIS
assets/
  photos/               sixty-six photographs, with thumbnails
  tiles/                the local basemap and overlay tile pyramid
tools/
  gen-hant.py           regenerates data/zh-hant.js and checks it against zhconv
  export-data.js        regenerates the JSON and GeoJSON exports
  build_terrain.py      regenerates the terrain tiles
  fetch_osm.py          pulls and caches the OpenStreetMap ways for the tombolo
  rings.py              stitches those ways into closed rings
  build_tombolo_model.py  regenerates data/tombolo-model.js
  amap_overlay.py       draws any of it over satellite imagery, to check it
  dem_cache.json        the elevation samples the tiles were built from
  coastline_raw.json    the cached coastline ways
  tombolo_raw.json      the cached bar, beach and reef outlines
  master_base.png       the combined basemap sheet the tiles were cut from
  fetch_dem30.py        pulls and caches 30 m SRTM for the solar model
  dem30_cache.json      the 30 m elevation grid the solar model reads
  canopy_raw.json       the cached OSM woodland, scrub and building polygons
  build_sun_model.py    regenerates data/sun-model.js from those two caches
```

## The guide, section by section

| Section | What it does |
|---|---|
| **The sandbar has a schedule** 潮汐 | The tidal window, and the 1.25 m rule that decides whether the sandbar can be crossed |
| **Map and route** 地图与路线 | The interactive basemap in three layers, the single route, and eight numbered observation points |
| **The climb, in metres** 以米为单位的起伏 | The elevation profile along the route, with the four stages marked |
| **A bridge that comes and goes** 一座时有时无的桥 | A shaded-relief model of the tombolo, flooded to any tide height you choose |
| **One route, four different walks** 一条路线，四段体验 | The four stages, with photographs, timings, shade and one caution each |
| **How much sun are you walking in?** 全程日照评估 | How much of the walk is in shade, drawn as a ribbon, and then a section along the whole route with the ground on top and the share of the sun that reached the path below |
| **Where extra care is needed** 需要格外留意之处 | Four conditions recorded in the field: erosion, geoconservation, intertidal life, sun |
| **Four ways to be a plant here** 四种生存方式 | Four vegetation communities, painted as plates, with the species found in each |
| **The places, in pictures** 照片里的地方 | Thirty-seven photographs of the day, grouped as the shore, the pier, Hap Mun Bay and the view from the ridge |
| **What others have written** 前人怎么写 | Eight sources: a gazetteer, three journal articles, a book chapter and three reports |
| **Before you step onto the boat** 登船之前 | What to bring, and what the tide will do to the plan |
| **How we know** 资料依据 | The survey record, the data sources and the team's division of work |

The opening screen carries a numbered index of all twelve sections, so every part
of the guide is one click away without scrolling. Two of them, the map and the
tide model, are also raised to large primary buttons; the other ten sit in a
five-column chip row under them, and fold to two columns on a phone. Every chip
is the width of its column, so the row reads as one set of boxes rather than
ten of different sizes.

## Folding and the guide panel

The guide runs to about twenty-two thousand pixels, which is a long scroll for
a phone. Two things shorten it.

Every section has a bar at its head carrying its number and title. The guide is
an accordion: opening a section folds the other eleven away, so the page is
always the table of the twelve parts with one of them open under it. Clicking
the bar of the open section closes it as well, and the whole guide folds down
to nothing. The rule holds wherever a section is opened from, whether that is
its own bar, the small square beside its name in the guide panel, a chip under
the title, a link in the navigation bar, or a link in the text, and a link that
names a section opens it before it goes there.

The guide panel in the navigation bar lists all twelve with a button beside each
one, marks the section currently being read, and offers to expand or fold
everything at once. Which sections are open is remembered in `localStorage`
under `si-open`, so the page comes back the way it was left. The first time the
page is opened it starts with the tide table and the other eleven folded away.

The bar across the top names the same twelve parts, in the order they come in
the guide, under shortened names: tides, map, height, sand bar, route, sun,
notes, plants, photos, reading, before boarding, sources. It is given the full
set on a wide screen and gives them up in stages as the window narrows, down
to nine at 1040 pixels and six at 900. On a phone the bar carries the mark,
the guide and the language, and the twelve are reached from the guide panel,
which keeps all of them at any width.

## The drawer

A part of the guide does not simply appear. When it is opened its body runs
from nothing to the height of what is inside it, over about half a second,
and what is inside it comes out from under the lip of the drawer while it
runs. The front of the drawer lays a soft shade over the contents as it
moves, so the part reads as being pulled out of its housing rather than
switched on. Closing it runs the same way in reverse.

The same idea is carried by the two panels that slide in: the observation
point drawer and the guide panel both come in with a slight stretch, as if
they were being drawn out of the edge of the page.

The run is measured in the browser rather than guessed, so a part opens to
whatever height its own contents need, including a part whose height changes
when the language changes under it. A reader who has asked the system to
reduce motion gets the same result without the movement.

## The title

The heading at the top of the page is the one piece of type that is printed
rather than rendered. The Chinese is set in Songti and the Latin in an
old-style serif, the pair a carver cutting a block would have used, and the
second line is indented the way a compositor would indent it. A hairline of
light under the stroke and a soft shade over it press the letters down into
the paper, so the title reads as an impression rather than as a screen font.
The rest of the page stays in the modern sans, which is what makes the
difference between the two read.

## The survey

Eight observation points, one continuous route of about 2.19 km, visited between
11:10 and 13:38 on 13 November 2026. Shade was classified at each point over
roughly 20 m of path using the same three categories throughout, and every record
pairs a photograph with an observation time and an evidence source.

The photographs come from the same day. Twenty-nine of them are attached to the
route, the stages and the field notes; the other thirty-seven sit in their own
section, grouped by where they were made and given one caption each. Opening a
photograph shows it full size, with the caption underneath and the rest of its
group one keypress away.

The reading list is deliberately mixed. It starts with the Jiaqing era *Xin'an
County Gazetteer* of 1819, the county record that covered what is now Hong Kong
and gave the inner sea islands a chapter of their own, and it ends with the Hong
Kong UNESCO Global Geopark, AFCD, LCSD and the Hong Kong Observatory. The list
holds a gazetteer, three journal articles, a book chapter and three official
reports. What has been checked is marked as checked, and what has not been read
through yet is marked as such too.

## The team

孟楷淇（组长）、金子涵、王馨悦、伍佳慧、杨荟瑾、武若瞳、聂仕霖、刘凯心、胡佳启、吴叙静.
The division of work is on the page itself, under Sources.

## Technical notes

* The basemap is the official AMap (AutoNavi) raster tile service, drawn tile
  by tile on a canvas. No API key is embedded in this repository and no local
  proxy is needed, so the map works from a plain file or a plain web server.
  The coordinates are GCJ-02.
* Three basemaps are on offer from the switch in the corner of the map: the
  street map, the satellite imagery, and the satellite imagery carrying the
  street and place names. The street map keeps the group's own ten-metre
  contours, which are computed from the elevation grid with marching squares
  and drawn as vector lines, so they sit on the ground exactly.
* The place names on the tiles are Chinese whatever language the page is in.
  AMap's English rendering of the street map fills its empty tiles with a
  slightly different blue from the sea it draws, which leaves pale rectangles
  across the water; the Chinese rendering has no such seam.
* The elevation figures in the profile are read from a 90 m resolution SRTM
  sample that has been smoothed for display, and the profile is drawn from that
  same grid. The AFCD source notes the island's high point as 136 m. The SRTM
  grid is far too coarse to hold the tombolo, so the tide panel does not use it
  for the bar. The solar model uses a separate, finer 30 m grid.
* The tide panel is built from the map rather than from a drawn shape. The
  shoreline and the outline of the bar are OpenStreetMap coastline and beach
  ways, stitched into closed rings by `tools/rings.py`; the bar section was
  measured by slicing that outline at one-metre stations, which is how the model
  knows the crossing narrows to three metres at the Kiu Tau end and widens to
  thirty three where it fans into the beach. Only height is reconstructed: the
  crest is set to close just above the 1.25 m posted limit, and the sea floor
  falls away from the mapped shoreline. `python3 tools/build_tombolo_model.py`
  rebuilds `data/tombolo-model.js` from the cached OSM ways.
* The sun exposure panel carries a second model. The sun is placed with the NOAA solar
  position algorithm for 13 November 2026 at the island's own latitude and
  longitude, which puts it in the southern sky all morning, 43 to 50 degrees
  above the horizon, swinging from south south east to south south west. The
  ground is CGIAR SRTM 30 m elevation resampled onto a seven and a half metre
  grid and smoothed twice, because thirty metre data puts a whole cliff into
  one cell and reads as a spike rather than a slope. The canopy is the mapped
  OpenStreetMap woodland and scrub, plus the group's own vegetation map along
  the corridor, since OSM tags the whole middle of the island as one scrub
  polygon and the route never enters a mapped woodland polygon at all. A ray
  towards the sun is then marched outwards from every cell: while it is still
  inside the canopy layer it picks up optical depth, and a ridge in the way
  ends the march at once, so the share of sun that gets through is
  `exp(-tau)`. A point is unshaded when less than a tenth of its section is in
  shade, and mostly shaded when three fifths or more is. The model agrees with
  the field record at all eight observation points. The browser walks the route
  at seven metre intervals and tests every station at the minute the group
  reached it, which is what the sun exposure panel draws: the ground on top,
  the share of the sun that reached the path below, and the four stages as a
  band between them. A ridge ends the march at once, so the share drops to
  nothing in one step; canopy along the ray takes it down gradually, which is
  why the band breaks into fine stripes where the path runs under trees. The
  two rules at 0.9 and 0.4 are the thresholds the field classes were read
  against.
* The canopy geometry in `data/sun-model.js` is © OpenStreetMap contributors,
  released under ODbL 1.0, and the page credits it under the section.
* The OSM geometry in `data/tombolo-model.js` is © OpenStreetMap contributors,
  released under ODbL 1.0, and the page credits it under the section.
* The terrain tiles are a static pyramid drawn by `tools/build_terrain.py` and
  committed to the repository, so the map still works with no network.
* Every translatable string exists once, in English and Simplified Chinese, and
  the Traditional Chinese twin is generated from the Simplified one. When Chinese
  copy is edited anywhere, run `python3 tools/gen-hant.py` to refresh the table.
* The place names, the gazetteer text and the photographs remain the property of
  their authors and publishers. The published articles are cited by DOI in the
  reading list. Every DOI in that list was checked against Crossref, and each
  entry gives the volume, issue and pages the publisher records.
* Each section can be folded down to its heading, and the guide panel in the
  navigation bar lists all twelve, marks the one being read, and folds the
  page down to a single part. Which sections are open is kept in
  `localStorage` under `si-open`.
