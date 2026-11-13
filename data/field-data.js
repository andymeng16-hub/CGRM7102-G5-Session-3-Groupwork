/* Sharp Island Visitor Guide — field data
   All facts below come from the group's 29 QField photographs (13 Nov 2026)
   and the on-site boards / official sources listed at the bottom.
   Coordinates are INDICATIVE WGS-84 positions, not exported QField GPS.
   Replace `lat/lng`, `path` and distances with the QField GeoPackage before publication. */

window.FIELD_DATA = {
  survey: {
    date: "13 November 2026",
    dateShort: "13 Nov 2026",
    window: "11:10–13:38 HKT",
    weather: "Overcast with thick cloud at 11:10 (p01); brightening to sunny intervals with scattered cumulus from about 12:47 (p13–p25).",
    photos: 29,
    points: 8,
    method: "At each stop we assessed roughly 20 m of the existing path and used one of three categories throughout — mostly shaded, partly shaded or unshaded. Each record pairs a photograph, an observation time and an evidence source.",
    place: "Kiu Tsui Country Park, Sai Kung, Hong Kong, China"
  },

  routes: [
    {
      id: "A",
      name: "Coast & Geology",
      zh: "海岸地质线",
      color: "blue",
      tagline: "Short, fully exposed, and governed by the tide.",
      start: "Kiu Tsui Public Pier 桥咀公众码头",
      finish: "Same pier, back along the shore",
      startShort: "Pier", finishShort: "Pier (return)",
      distance: "≈ 1.0 km return",
      distanceNote: "Provisional. The 500 m to Kiu Tsui Beach is signposted (p09); the shore section has not yet been measured from the QField track.",
      time: "22 min recorded on site",
      timeNote: "11:10–11:32 HKT, including stops for photographs and notes. Not a pure walking time.",
      shade: "3 of 3 stops unshaded",
      tide: "Critical. Crossing only when tidal height is below 1.25 m. On the survey date the board gave an emergence window of 08:00–10:00 only (p04).",
      stops: "01 Pier & beach · 02 Tombolo · 03 Rocky shore",
      stopIds: ["o1", "o2", "o3"],
      facilities: "Kai-to pier, LCSD beach facilities, Tombolo Emergence Time board, Geopark and AFCD interpretation boards.",
      care: "Do not cross the bar outside the safe window. Non-slip shoes for wet cobbles, sun protection, and do not collect rocks or disturb wildlife.",
      bestFor: "Geology, a short walk, and visitors who can plan around the tide.",
      evidence: "p02 shows a partly submerged shingle bar at 11:23; p04 shows the 08:00–10:00 emergence window for 13 Nov 2026. Together they explain why this route is tide-dependent and why our group stayed on the main island.",
      photos: ["p01", "p02", "p04", "p07"],
      /* indicative WGS-84, NW coast */
      path: [[22.3677, 114.2872], [22.3684, 114.2879], [22.3670, 114.2868], [22.3660, 114.2861], [22.3653, 114.2871], [22.3663, 114.2881], [22.3677, 114.2872]]
    },
    {
      id: "B",
      name: "Shaded Ridge & Hap Mun Bay",
      zh: "林荫观景线",
      color: "green",
      tagline: "Longer, mostly shaded at first, and safe at any tide.",
      start: "Kiu Tsui Beach 桥咀泳滩",
      finish: "Hap Mun Bay Beach 厦门湾泳滩",
      startShort: "Kiu Tsui Beach", finishShort: "Hap Mun Bay",
      distance: "1.7 km one way",
      distanceNote: "Signposted at the junction: 1 km towards Kiu Tsui and 0.7 km towards Hap Mun Bay (p20).",
      time: "≈ 1 hr signposted walking",
      timeNote: "¾ hr + ¼ hr on the junction signpost (p20). Our recorded on-site window was 70 min, 12:28–13:38 HKT, including stops, photographs and notes.",
      shade: "2 of 5 stops mostly or partly shaded; viewpoint and beach unshaded",
      tide: "No tidal crossing required — the route stays on the main island.",
      stops: "04 Art trail · 05 Woodland path · 06 Viewing point · 07 Junction · 08 Hap Mun Bay",
      stopIds: ["o4", "o5", "o6", "o7", "o8"],
      facilities: "Direction signs, Kiu Tsui Viewing Point panorama panel, art plaque S12, AFCD trail maintenance board, LCSD beach layout plan and by-laws board.",
      care: "Stay on the repaired trail, take the log steps slowly, carry a hat and water for the exposed ridge, and check lifeguard service before swimming.",
      bestFor: "Hot sunny days, families, and visitors who cannot plan around the tide.",
      evidence: "p09–p15 show a closed canopy and dappled shade at 12:38–12:51, while p17 and p21–p25 show an open, unshaded ridge from 12:52. p18 and p19 document erosion and hand-built steps, and p20 supplies the signposted distances and walking times.",
      photos: ["p09", "p13", "p17", "p20", "p25", "p29"],
      /* indicative WGS-84, NW → SE across the island */
      path: [[22.3684, 114.2879], [22.3668, 114.2888], [22.3648, 114.2896], [22.3628, 114.2895], [22.3615, 114.2908], [22.3600, 114.2918], [22.3592, 114.2932], [22.3580, 114.2945], [22.3569, 114.2959]]
    }
  ],

  points: [
    {
      id: "o1", code: "01", route: "both",
      name: "Kiu Tsui Pier & Beach", zh: "桥咀码头・桥咀泳滩",
      time: "11:10", weather: "Overcast, thick cloud", shade: "unshaded",
      lat: 22.3678, lng: 114.2876, sx: 158, sy: 112,
      description: "Our first record. A broad pale-sand beach beside a low stone jetty, with a thick cloud layer over the Sai Kung hills. No tree cover across the 20 m of open sand we assessed.",
      attraction: "Sandy beach, stone jetty and a layered mountain skyline across the water.",
      concerns: ["No shade on the open sand. The cloud at 11:10 had cleared to strong sun by midday, so cloud cover is not reliable sun protection."],
      facilities: "Kai-to pier. LCSD lists a kiosk, changing rooms, showers, toilets, BBQ pits and a raft at Kiu Tsui Beach; lifeguard service is suspended from November to March.",
      tip: "Start here, confirm the last ferry time, and put on sun protection before the cloud breaks.",
      photos: ["p01"],
      sources: "Field photo p01 (11:10) · LCSD Sai Kung beach facilities page",
      check: "The facility list comes from LCSD and was not checked item by item in the field."
    },
    {
      id: "o2", code: "02", route: "A",
      name: "The Tombolo", zh: "连岛沙洲",
      time: "11:23–11:25", weather: "Overcast, brightening", shade: "unshaded",
      lat: 22.3660, lng: 114.2861, sx: 122, sy: 176,
      description: "A low shingle ridge runs towards the wooded islet of Kiu Tau. At 11:23 only part of the bar stood above water; the rest was covered. The on-site tide board explains why.",
      attraction: "A natural sand-and-shingle bar that appears at low tide and links Sharp Island to Kiu Tau.",
      concerns: ["The bar floods at high tide — generally when tidal height is above 1.25 m, as stated on the board.", "On 13 Nov 2026 the printed emergence window was only 08:00–10:00, so our 11:23 visit fell outside it.", "Wet, uneven cobbles with no shade."],
      facilities: "Tombolo Emergence Time board (08:00–18:00) with a QR code for Hong Kong Observatory real-time tide data.",
      tip: "Treat this as a viewpoint unless both the HKO prediction and the on-site board say crossing is safe, and always leave time to return.",
      photos: ["p02", "p04"],
      sources: "Field photos p02, p04 · HK UNESCO Global Geopark, Sharp Island · Hong Kong Observatory real-time tide service",
      check: "Predicted tide height at the moment of the survey was not measured — only the printed board was recorded."
    },
    {
      id: "o3", code: "03", route: "A",
      name: "Rocky Shore & Conservation Zone", zh: "岩石海岸・保育告示",
      time: "11:24–11:31", weather: "Cloud breaking", shade: "unshaded",
      lat: 22.3653, lng: 114.2871, sx: 182, sy: 210,
      description: "Rounded volcanic cobbles cover the shore. Three on-site notices set out the rules: do not deface or remove rocks, do not disturb wildlife, and respect marine life.",
      attraction: "Cobble beach, a weathered volcanic rock with pale veins (p06), and intertidal habitat.",
      concerns: ["Rock collecting, graffiti and disturbing wildlife — prohibited on the Geopark board (p03).", "Trampling coral and touching or feeding marine life — prohibited on the AFCD banner (p05).", "Sharp, slippery cobbles under full sun."],
      facilities: "Hong Kong Geopark conservation board, “Respect Marine Life” banner, and a Sharp Island visitor map board.",
      tip: "Look closely, take photographs, leave everything in place, and wear shoes with grip on wet rock.",
      photos: ["p03", "p05", "p06", "p07"],
      sources: "Field photos p03, p05, p06, p07 · UNESCO HK Global Geopark / AFCD on-site signage",
      check: "The exact rock type in p06 needs confirmation against Geopark geology material."
    },
    {
      id: "o4", code: "04", route: "B",
      name: "Pineapple-bun Art Trail", zh: "菠萝包艺术径",
      time: "12:28–12:52", weather: "Sunny intervals", shade: "partly",
      lat: 22.3628, lng: 114.2895, sx: 254, sy: 240,
      description: "Small ceramic “pineapple bun” characters sit on tree stumps beside a sandy path, with an interpretation plaque marked S12. Dappled light from the surrounding trees covers about half of the 20 m section.",
      attraction: "Public art inspired by the island's pineapple-bun rocks; the plaque is titled “A Grand Pineapple Bun Tour”.",
      concerns: ["Narrow sandy path beside the artworks, with exposed roots and a loose surface.", "Strong sun between the trees after midday."],
      facilities: "Interpretation plaque S12.",
      tip: "Use this as a shade break, keep to the path, and do not climb on the artworks.",
      photos: ["p08", "p16", "p26", "p27"],
      sources: "Field photos p08, p16, p26, p27 · on-site art plaque S12",
      check: "The full name of the art programme and its organiser were only partly legible on the plaque."
    },
    {
      id: "o5", code: "05", route: "B",
      name: "Shaded Woodland Trail", zh: "林荫山径",
      time: "12:38–12:51", weather: "Sunny, scattered cumulus", shade: "mostly",
      lat: 22.3615, lng: 114.2908, sx: 314, sy: 268,
      description: "The cross-island path runs under a closed canopy with sea glimpses through gaps in the trees. Across the 20 m we assessed, tree shade covered most of the surface — the coolest section of the survey.",
      attraction: "Woodland corridor, framed sea views, and Sai Kung District Council direction signs (Kiu Tsui Beach 500 m; Kiu Tsui Country Park).",
      concerns: ["Uneven, rooty surface in low light.", "Vegetation worn back where visitors have cut corners."],
      facilities: "Direction signs at the woodland edge.",
      tip: "Save this section for the hottest part of the day and watch your footing.",
      photos: ["p09", "p10", "p11", "p12", "p13", "p14", "p15"],
      sources: "Field photos p09–p15 · Sai Kung District Council direction signs",
      check: null
    },
    {
      id: "o6", code: "06", route: "B",
      name: "Kiu Tsui Viewing Point", zh: "桥咀观景台",
      time: "12:52–13:24", weather: "Sunny", shade: "unshaded",
      lat: 22.3600, lng: 114.2918, sx: 384, sy: 288,
      description: "A green panorama panel labels the islands and bays across the water. The ridge around it is open scrub with no shade for at least 20 m in any direction.",
      attraction: "A labelled panorama at Kiu Tsui Viewing Point, with views down over Hap Mun Bay (p25).",
      concerns: ["Full sun and wind exposure on the ridge.", "Short, steep access on a loose surface."],
      facilities: "Panorama interpretation panel.",
      tip: "Keep the stop short; wear a hat and drink water here.",
      photos: ["p17", "p21", "p22", "p23", "p24", "p25"],
      sources: "Field photos p17, p21–p25 · Kiu Tsui Viewing Point panorama panel",
      check: null
    },
    {
      id: "o7", code: "07", route: "B",
      name: "Junction & Repaired Steps", zh: "分岔路・手作步道",
      time: "12:55–12:59", weather: "Sunny", shade: "partly",
      lat: 22.3592, lng: 114.2932, sx: 458, sy: 332,
      description: "A wooden signpost gives Kiu Tsui 1 km / ¾ hr and Hap Mun Bay 0.7 km / ¼ hr. Nearby, an AFCD board explains serious trail erosion caused by off-path trampling and the hand-built log steps used to repair it.",
      attraction: "Signposted junction and hand-built timber steps.",
      concerns: ["Visible soil loss and loose sandy tread beside the steps (p19).", "Erosion from visitors leaving the path, as described on the AFCD maintenance board (p18)."],
      facilities: "Junction signpost and “Country Park Trail Maintenance Broadcast” board.",
      tip: "Stay on the trail and take the steps slowly, especially downhill.",
      photos: ["p18", "p19", "p20"],
      sources: "Field photos p18–p20 · AFCD trail maintenance board · Sai Kung District Council signpost",
      check: null
    },
    {
      id: "o8", code: "08", route: "B",
      name: "Hap Mun Bay Beach", zh: "厦门湾泳滩",
      time: "13:30–13:38", weather: "Sunny, scattered cloud", shade: "unshaded",
      lat: 22.3569, lng: 114.2959, sx: 542, sy: 374,
      description: "The final record: a crescent of pale sand and clear shallow water, seen from the viewpoint at 13:24 and reached at 13:30. The LCSD beach layout plan and by-laws board stand at the entrance.",
      attraction: "A sheltered bay, white sand, clear turquoise water and the painted Hap Mun Bay Beach sign.",
      concerns: ["Open sand with no shade.", "Coral and marine life in the shallow water.", "No lifeguard service in November — LCSD suspends winter service at this beach."],
      facilities: "Beach layout plan and by-laws board. LCSD lists a kiosk, 22 BBQ pits, changing rooms, showers, toilets and a raft.",
      tip: "Bring your own shade and water, and swim only when lifeguards are on duty.",
      photos: ["p25", "p28", "p29"],
      sources: "Field photos p25, p28, p29 · LCSD Sai Kung beach facilities page",
      check: "Individual facilities were not checked one by one; the list is from LCSD."
    }
  ],

  comparison: [
    { label: "Best for", a: "Geology, a short walk, planning around the tide", b: "Hot days, families, no tide constraint" },
    { label: "Start → finish", a: "Kiu Tsui Pier → shore → same pier", b: "Kiu Tsui Beach → ridge → Hap Mun Bay Beach" },
    { label: "Distance", a: "≈ 1.0 km return (provisional)", b: "1.7 km one way (signposted)" },
    { label: "Recorded time", a: "22 min on site · 11:10–11:32", b: "70 min on site · 12:28–13:38 · ≈ 1 hr signposted" },
    { label: "Shade", a: "All 3 stops unshaded", b: "2 of 5 stops shaded; ridge and beach unshaded" },
    { label: "Tidal condition", a: "Critical — below 1.25 m; 08:00–10:00 on 13 Nov", b: "Not required — no sandbar crossing" },
    { label: "Main stops", a: "Pier & beach · Tombolo · Rocky shore", b: "Art trail · Woodland · Viewpoint · Junction · Beach" },
    { label: "Facilities", a: "Pier, beach, tide table, conservation boards", b: "Signposts, panorama panel, art plaque, beach plan" },
    { label: "Extra care", a: "Tide, wet cobbles, sun, do not collect rocks", b: "Eroded steps, exposed ridge, winter swimming" }
  ],

  advice: [
    { title: "Check the tide before the sandbar", body: "The tombolo is submerged when tidal height is above about 1.25 m. Use the Hong Kong Observatory real-time tide service and the on-site board together, and leave enough time to come back. On 13 Nov 2026 the emergence window was only 08:00–10:00." },
    { title: "Plan for sun, not for cloud", body: "Our 11:10 photo is overcast; by 12:47 the same walk was in full sun with scattered cumulus. Bring water, food and sun protection — the Geopark's own tip for this route." },
    { title: "No lifeguard service in November", body: "LCSD suspends lifeguard service at both Kiu Tsui Beach and Hap Mun Bay Beach from November to March. Swim only when and where lifeguards are on duty." },
    { title: "Stay on the repaired trail", body: "The AFCD maintenance board records serious erosion from off-path trampling. Keep to the log steps and the marked path, especially on the descent to Hap Mun Bay." },
    { title: "Look, don't take", body: "Do not deface, damage or remove any rock, and do not disturb wildlife. Do not touch, feed or tread on marine life and coral. Take all litter home." },
    { title: "Confirm the last kai-to", body: "Sharp Island has no road access. Agree the return pier, the last sailing and the fare with the operator before you start — the two beaches use different piers." }
  ],

  sources: [
    { kind: "Official", label: "HK UNESCO Global Geopark — Sharp Island", detail: "1.25 m tide threshold, return-time warning, and water / food / sun-protection advice.", url: "https://geopark.gov.hk/tc/discover/attractions/sharp-island" },
    { kind: "Official", label: "AFCD — Kiu Tsui Country Park", detail: "Island setting, beach facilities, woodland and the tombolo.", url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_kt/cou_vis_cou_kt.html" },
    { kind: "Official", label: "LCSD — Sai Kung gazetted beaches", detail: "Facilities at Hap Mun Bay and Kiu Tsui Beach; winter lifeguard suspension.", url: "https://www.lcsd.gov.hk/tc/beach/index/beach-location-nt/beach-address-sk.html" },
    { kind: "Official", label: "Hong Kong Observatory real-time tide information", detail: "Live and predicted tidal heights — check before crossing the tombolo.", url: "https://tide1.hydro.gov.hk/" },
    { kind: "Official", label: "GovHK — Real-time Tide Information Service", detail: "How tide predictions are produced, and why observed levels may differ.", url: "https://www.gov.hk/en/residents/transport/vessel/realtime_tide.htm" },
    { kind: "Field evidence", label: "On-site boards photographed during the survey", detail: "p03 Geopark conservation · p04 tide table · p05 marine life · p09 direction signs · p17 panorama · p18 trail maintenance · p20 junction · p28 beach layout plan.", url: null },
    { kind: "Field evidence", label: "Group QField records", detail: "29 photographs and 8 grouped observation points, 11:10–13:38 HKT, 13 November 2026.", url: null }
  ],

  checks: [
    "Exact GPS positions and the walking track — the QField GeoPackage has not been exported into this site yet. Map positions are indicative WGS-84 and need replacing before publication.",
    "Route A distance — estimated from the 500 m signpost in p09 plus the shore section; confirm against the QField track.",
    "Rock type in p06 — identify against Geopark geology material before naming it on the site.",
    "Art programme name and organiser — the plaque S12 in p08 was only partly legible.",
    "Tide threshold — the photographed board and the current Geopark page state 1.25 m, while some older material quotes 1.4 m. Use the latest HKO prediction and the on-site board.",
    "Observed tide height at 11:23 — not measured; only the printed emergence timetable was recorded.",
    "Winter lifeguard arrangements on the survey date — verify against the current LCSD notice before giving swimming advice."
  ],

  contributions: [
    { name: "Member A — name to be added", fieldwork: "—", analysis: "—", website: "—" },
    { name: "Member B — name to be added", fieldwork: "—", analysis: "—", website: "—" },
    { name: "Member C — name to be added", fieldwork: "—", analysis: "—", website: "—" },
    { name: "Member D — name to be added", fieldwork: "—", analysis: "—", website: "—" }
  ]
};

/* Indicative schematic coordinates for the route diagram (not a geographic map). */
window.FIELD_DATA.schematic = {
  island: "M 112 92 C 168 58, 268 62, 336 96 C 404 130, 490 138, 558 190 C 626 242, 646 322, 584 382 C 522 440, 408 442, 330 406 C 252 370, 158 330, 122 258 C 88 190, 76 122, 112 92 Z",
  routeA: [[158, 112], [190, 140], [122, 176], [182, 210], [158, 112]],
  routeB: [[158, 112], [190, 140], [254, 240], [314, 268], [384, 288], [458, 332], [542, 374]]
};
