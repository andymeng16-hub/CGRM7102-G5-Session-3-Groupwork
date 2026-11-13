/* Sharp Island Visitor Guide: field data (single-route edition)
   All field facts come from the group's 29 QField photographs (13 Nov 2026)
   and the on-site boards and official sources listed at the bottom.

   Coordinates are WGS-84 and are converted to GCJ-02 at draw time. Elevation
   comes from a resampled elevation grid (see data/terrain.js). */

window.FIELD_DATA = {
  survey: {
    date: "13 November 2026",
    dateShort: "13 Nov 2026",
    window: "11:10 to 13:38 HKT",
    weather: "Overcast with thick cloud at 11:10 (p01); brightening to sunny intervals with scattered cumulus from about 12:47 (p13 to p25).",
    weatherZh: "上午 11:10 密云，约 12:47 转晴间多云。",
    photos: 29,
    points: 8,
    method: "At each stop we assessed roughly 20 m of the existing path and used the same three categories throughout: mostly shaded, partly shaded or unshaded. Each record pairs a photograph, an observation time and an evidence source.",
    methodZh: "每个观察点评估约 20 米路径，统一使用「大部份遮阴、部份遮阴、无遮阴」三级分类，并记录照片、时间与证据来源。",
    place: "Kiu Tsui Country Park, Sai Kung, Hong Kong, China",
    mapping: "The base map is the Tencent Maps vector basemap on the GCJ-02 grid, held at zoom 16 so the pier, beaches and country park labels stay readable. The route, the eight points and the elevation cursor are drawn as overlays on top of it, and the same geometry is exported to GeoJSON for QGIS.",
    mappingZh: "底图采用腾讯地图矢量底图，GCJ-02 坐标，固定十六级以保留码头、泳滩与郊野公园标注的可读性；路线、八个观察点与海拔游标叠加其上，同一套几何数据另导出为 GeoJSON 供 QGIS 使用。"
  },

  route: {
    name: "Sharp Island Traverse",
    zh: "桥咀洲纵走",
    start: "Kiu Tsui Public Pier",
    startZh: "桥咀公众码头",
    finish: "Hap Mun Bay Beach",
    finishZh: "厦门湾泳滩",
    startShort: "KIU TSUI PIER",
    finishShort: "HAP MUN BAY",
    distance: "≈ 2.19 km (indicative)",
    distanceNote: "The drawn indicative line measures 2.19 km. Signposted segments at the junction give 1 km towards Kiu Tsui and 0.7 km towards Hap Mun Bay (p20). The full loop back to the pier still needs measuring from the QField track.",
    time: "2 h 28 min on site",
    timeNote: "11:10 to 13:38 HKT, including stops for photographs and notes. The signposted walking time for the two halves is ¾ hr and ¼ hr (p20).",
    shade: "3 of 8 stops shaded; coast, viewpoint and beach unshaded",
    shadeZh: "8 个观察点中 3 个有遮阴，海岸、观景台及泳滩均无遮阴。",
    tide: "The tombolo section is only passable when tidal height is below 1.25 m. On 13 Nov 2026 the on-site board gave an emergence window of 08:00 to 10:00 only (p04).",
    facilities: "Kai-to pier, two gazetted beaches, tide table, Geopark and AFCD boards, direction signs, viewing-point panorama, LCSD beach plan.",
    care: "Check the tide, stay on the repaired trail, wear shoes with grip, carry water and sun protection, and do not collect rocks or disturb marine life.",
    evidence: "p02 and p04 show a sandbar we could not cross at 11:23; p09 to p15 show a shaded woodland climb; p17 and p21 to p25 show an exposed ridge; p18 and p19 document erosion; p20 supplies the signposted distances and times.",
    /* Dense indicative track, WGS-84. Pier to beach to tombolo to rocky shore to
       art trail to woodland to ridge viewpoint to junction to Hap Mun Bay. */
    path: [
      [22.3677, 114.2872], [22.3681, 114.2876], [22.3684, 114.2879],
      [22.3676, 114.2874], [22.3668, 114.2868], [22.3660, 114.2861],
      [22.3656, 114.2866], [22.3653, 114.2871], [22.3650, 114.2878],
      [22.3649, 114.2885], [22.3648, 114.2895], [22.3649, 114.2902],
      [22.3652, 114.2910], [22.3655, 114.2916], [22.3658, 114.2920],
      [22.3652, 114.2926], [22.3645, 114.2931], [22.3636, 114.2934],
      [22.3628, 114.2936], [22.3620, 114.2935], [22.3612, 114.2938],
      [22.3604, 114.2943], [22.3596, 114.2948], [22.3588, 114.2952],
      [22.3580, 114.2955], [22.3574, 114.2957], [22.3569, 114.2959]
    ]
  },

  stages: [
    {
      id: "S1", code: "01", name: "Coast & Tombolo", zh: "海岸与连岛沙洲",
      range: "0.00 to 0.60 km", time: "11:10 to 11:32", shade: "unshaded",
      elev: "0 to 8 m", points: ["o1", "o2", "o3"],
      summary: "The exposed western shore: pier, beach, a partly submerged shingle bar and a cobble beach lined with conservation signs.",
      summaryZh: "西岸无遮阴路段：码头、泳滩、半淹的沙石堤与布满保育告示的卵石滩。",
      care: "Tide-critical. Check the HKO prediction and the on-site board; never cross outside the safe window.",
      photos: ["p01", "p02", "p04", "p07"]
    },
    {
      id: "S2", code: "02", name: "Woodland Ascent", zh: "林荫上山段",
      range: "0.60 to 1.05 km", time: "12:28 to 12:51", shade: "mostly",
      elev: "8 to 55 m", points: ["o4", "o5"],
      summary: "A closed canopy with dappled light and framed sea views, the coolest section of the survey, with ceramic pineapple-bun artworks beside the path.",
      summaryZh: "树冠闭合、光影斑驳的上坡段，是全天最阴凉的一段；路边有菠萝包石造型的陶瓷艺术作品。",
      care: "Uneven roots in low light; keep to the marked line.",
      photos: ["p09", "p13", "p16"]
    },
    {
      id: "S3", code: "03", name: "Ridge Viewpoint", zh: "山脊观景台",
      range: "1.05 to 1.30 km", time: "12:52 to 13:24", shade: "unshaded",
      elev: "55 to 64 m", points: ["o6"],
      summary: "The high point of the traverse: an open scrub ridge with a labelled panorama panel and a view down over Hap Mun Bay.",
      summaryZh: "全程最高处：开阔灌丛山脊，设有全景解说牌，可俯瞰厦门湾。",
      care: "Full sun and wind. Keep the stop short and drink water here.",
      photos: ["p17", "p21", "p25"]
    },
    {
      id: "S4", code: "04", name: "Descent to the Bay", zh: "下行至厦门湾",
      range: "1.30 to 2.19 km", time: "12:55 to 13:38", shade: "partly",
      elev: "64 to 0 m", points: ["o7", "o8"],
      summary: "Hand-built log steps over eroded sandy tread, a signposted junction, then the crescent of pale sand at Hap Mun Bay Beach.",
      summaryZh: "经手作木级穿越侵蚀坡面，过分岔路牌后下行至厦门湾的月牙形白沙滩。",
      care: "Descend slowly on loose steps; no lifeguard service in November.",
      photos: ["p18", "p20", "p28", "p29"]
    }
  ],

  points: [
    {
      id: "o1", code: "01", stage: "S1",
      name: "Kiu Tsui Pier & Beach", zh: "桥咀码头与桥咀泳滩",
      time: "11:10", weather: "Overcast, thick cloud", shade: "unshaded",
      lat: 22.3679, lng: 114.2876,
      description: "Our first record. A broad pale-sand beach beside a low stone jetty, with a thick cloud layer over the Sai Kung hills. No tree cover across the 20 m of open sand we assessed.",
      descriptionZh: "首笔记录：石砌码头旁的宽阔沙滩，上午云层厚重；评估的 20 米开阔沙面完全没有树荫。",
      attraction: "Sandy beach, stone jetty and a layered mountain skyline across the water.",
      concerns: ["No shade on the open sand. The cloud at 11:10 had cleared to strong sun by midday, so cloud cover is not reliable sun protection."],
      facilities: "Kai-to pier. LCSD lists a kiosk, changing rooms, showers, toilets, BBQ pits and a raft; lifeguard service is suspended from November to March.",
      tip: "Start here, confirm the last ferry time, and put on sun protection before the cloud breaks.",
      photos: ["p01"],
      sources: "Field photo p01 (11:10), LCSD Sai Kung beach facilities page",
      check: "The facility list comes from LCSD and was not checked item by item in the field."
    },
    {
      id: "o2", code: "02", stage: "S1",
      name: "The Tombolo", zh: "连岛沙洲",
      time: "11:23 to 11:25", weather: "Overcast, brightening", shade: "unshaded",
      lat: 22.3660, lng: 114.2861,
      description: "A low shingle ridge runs towards the wooded islet of Kiu Tau. At 11:23 only part of the bar stood above water; the rest was covered. The on-site tide board explains why.",
      descriptionZh: "低矮的沙石堤伸向桥头岛；11:23 时只有部分露出水面，其余已被潮水淹没。",
      attraction: "A natural sand-and-shingle bar that appears at low tide and links Sharp Island to Kiu Tau.",
      concerns: ["The bar floods at high tide, generally when tidal height is above 1.25 m, as stated on the board.", "On 13 Nov 2026 the printed emergence window was only 08:00 to 10:00, so our 11:23 visit fell outside it.", "Wet, uneven cobbles with no shade."],
      facilities: "Tombolo Emergence Time board (08:00 to 18:00) with a QR code for Hong Kong Observatory real-time tide data.",
      tip: "Treat this as a viewpoint unless both the HKO prediction and the on-site board say crossing is safe, and always leave time to return.",
      photos: ["p02", "p04"],
      sources: "Field photos p02, p04, HK UNESCO Global Geopark, Hong Kong Observatory real-time tide service",
      check: "Predicted tide height at the moment of the survey was not measured. Only the printed board was recorded."
    },
    {
      id: "o3", code: "03", stage: "S1",
      name: "Rocky Shore & Conservation Zone", zh: "岩石海岸与保育告示",
      time: "11:24 to 11:31", weather: "Cloud breaking", shade: "unshaded",
      lat: 22.3653, lng: 114.2871,
      description: "Rounded volcanic cobbles cover the shore. Three on-site notices set out the rules: do not deface or remove rocks, do not disturb wildlife, and respect marine life.",
      descriptionZh: "浑圆的火山岩卵石布满海岸；三块现场告示分别禁止破坏或带走岩石、骚扰野生动物及干扰海洋生物。",
      attraction: "Cobble beach, a weathered volcanic rock with pale veins (p06), and intertidal habitat.",
      concerns: ["Rock collecting, graffiti and disturbing wildlife are prohibited on the Geopark board (p03).", "Trampling coral and touching or feeding marine life are prohibited on the AFCD banner (p05).", "Sharp, slippery cobbles under full sun."],
      facilities: "Hong Kong Geopark conservation board, a Respect Marine Life banner, and a Sharp Island visitor map board.",
      tip: "Look closely, take photographs, leave everything in place, and wear shoes with grip on wet rock.",
      photos: ["p03", "p05", "p06", "p07"],
      sources: "Field photos p03, p05, p06, p07, UNESCO HK Global Geopark and AFCD on-site signage",
      check: "The exact rock type in p06 needs confirmation against Geopark geology material."
    },
    {
      id: "o4", code: "04", stage: "S2",
      name: "Pineapple-bun Art Trail", zh: "菠萝包艺术径",
      time: "12:28 to 12:52", weather: "Sunny intervals", shade: "partly",
      lat: 22.3648, lng: 114.2895,
      description: "Small ceramic pineapple bun characters sit on tree stumps beside a sandy path, with an interpretation plaque marked S12. Dappled light from the surrounding trees covers about half of the 20 m section.",
      descriptionZh: "树桩上的陶瓷「菠萝包」作品立于沙径旁，解说牌编号 S12；树影约覆盖评估路段的半数。",
      attraction: "Public art inspired by the island's pineapple-bun rocks; the plaque is titled \"A Grand Pineapple Bun Tour\".",
      concerns: ["Narrow sandy path beside the artworks, with exposed roots and a loose surface.", "Strong sun between the trees after midday."],
      facilities: "Interpretation plaque S12.",
      tip: "Use this as a shade break, keep to the path, and do not climb on the artworks.",
      photos: ["p08", "p16", "p26", "p27"],
      sources: "Field photos p08, p16, p26, p27, on-site art plaque S12",
      check: "The full name of the art programme and its organiser were only partly legible on the plaque."
    },
    {
      id: "o5", code: "05", stage: "S2",
      name: "Shaded Woodland Trail", zh: "林荫山径",
      time: "12:38 to 12:51", weather: "Sunny, scattered cumulus", shade: "mostly",
      lat: 22.3652, lng: 114.2910,
      description: "The cross-island path runs under a closed canopy with sea glimpses through gaps in the trees. Across the 20 m we assessed, tree shade covered most of the surface, the coolest section of the survey.",
      descriptionZh: "山径在闭合树冠下穿行，树隙间可见海面；评估的 20 米路段大部份有遮阴，是全天最凉爽的一段。",
      attraction: "Woodland corridor, framed sea views, and Sai Kung District Council direction signs (Kiu Tsui Beach 500 m; Kiu Tsui Country Park).",
      concerns: ["Uneven, rooty surface in low light.", "Vegetation worn back where visitors have cut corners."],
      facilities: "Direction signs at the woodland edge.",
      tip: "Save this section for the hottest part of the day and watch your footing.",
      photos: ["p09", "p10", "p11", "p12", "p13", "p14", "p15"],
      sources: "Field photos p09 to p15, Sai Kung District Council direction signs",
      check: null
    },
    {
      id: "o6", code: "06", stage: "S3",
      name: "Kiu Tsui Viewing Point", zh: "桥咀观景台",
      time: "12:52 to 13:24", weather: "Sunny", shade: "unshaded",
      lat: 22.3658, lng: 114.2920,
      description: "A green panorama panel labels the islands and bays across the water. The ridge around it is open scrub with no shade for at least 20 m in any direction.",
      descriptionZh: "绿色全景解说牌标注对岸岛屿与海湾；山脊为开阔灌丛，四周至少 20 米内无任何遮阴。",
      attraction: "A labelled panorama at Kiu Tsui Viewing Point, with views down over Hap Mun Bay (p25).",
      concerns: ["Full sun and wind exposure on the ridge.", "Short, steep access on a loose surface."],
      facilities: "Panorama interpretation panel.",
      tip: "Keep the stop short; wear a hat and drink water here.",
      photos: ["p17", "p21", "p22", "p23", "p24", "p25"],
      sources: "Field photos p17, p21 to p25, Kiu Tsui Viewing Point panorama panel",
      check: null
    },
    {
      id: "o7", code: "07", stage: "S4",
      name: "Junction & Repaired Steps", zh: "分岔路与手作步道",
      time: "12:55 to 12:59", weather: "Sunny", shade: "partly",
      lat: 22.3620, lng: 114.2935,
      description: "A wooden signpost gives Kiu Tsui 1 km in ¾ hr and Hap Mun Bay 0.7 km in ¼ hr. Nearby, an AFCD board explains serious trail erosion caused by off-path trampling and the hand-built log steps used to repair it.",
      descriptionZh: "木路牌标示桥咀 1 公里（约 ¾ 小时）、厦门湾 0.7 公里（约 ¼ 小时）；旁有渔护署解说牌说明游客抄捷径造成的严重水土流失与手作木级修复。",
      attraction: "Signposted junction and hand-built timber steps.",
      concerns: ["Visible soil loss and loose sandy tread beside the steps (p19).", "Erosion from visitors leaving the path, as described on the AFCD maintenance board (p18)."],
      facilities: "Junction signpost and Country Park Trail Maintenance Broadcast board.",
      tip: "Stay on the trail and take the steps slowly, especially downhill.",
      photos: ["p18", "p19", "p20"],
      sources: "Field photos p18 to p20, AFCD trail maintenance board, Sai Kung District Council signpost",
      check: null
    },
    {
      id: "o8", code: "08", stage: "S4",
      name: "Hap Mun Bay Beach", zh: "厦门湾泳滩",
      time: "13:30 to 13:38", weather: "Sunny, scattered cloud", shade: "unshaded",
      lat: 22.3569, lng: 114.2959,
      description: "The final record: a crescent of pale sand and clear shallow water, seen from the viewpoint at 13:24 and reached at 13:30. The LCSD beach layout plan and by-laws board stand at the entrance.",
      descriptionZh: "最后一笔记录：13:24 自观景台俯瞰、13:30 抵达的月牙形白沙滩；入口处有康文署泳滩平面图与规例告示。",
      attraction: "A sheltered bay, white sand, clear turquoise water and the painted Hap Mun Bay Beach sign.",
      concerns: ["Open sand with no shade.", "Coral and marine life in the shallow water.", "No lifeguard service in November, LCSD suspends winter service at this beach."],
      facilities: "Beach layout plan and by-laws board. LCSD lists a kiosk, 22 BBQ pits, changing rooms, showers, toilets and a raft.",
      tip: "Bring your own shade and water, and swim only when lifeguards are on duty.",
      photos: ["p25", "p28", "p29"],
      sources: "Field photos p25, p28, p29, LCSD Sai Kung beach facilities page",
      check: "Individual facilities were not checked one by one; the list is from LCSD."
    }
  ],

  advice: [
    { title: "Check the tide before the sandbar", zh: "先看潮汐，再走近沙洲", body: "The tombolo is submerged when tidal height is above about 1.25 m. Use the Hong Kong Observatory real-time tide service and the on-site board together, and leave enough time to come back. On 13 Nov 2026 the emergence window was only 08:00 to 10:00." },
    { title: "Bring sun protection whatever the sky looks like", zh: "阴天也要防晒", body: "Our 11:10 photo is overcast; by 12:47 the same walk was in full sun with scattered cumulus. Bring water, food and sun protection, as the Geopark advises for this route." },
    { title: "No lifeguard service in November", zh: "十一月没有救生员当值", body: "LCSD suspends lifeguard service at both Kiu Tsui Beach and Hap Mun Bay Beach from November to March. Swim only when and where lifeguards are on duty." },
    { title: "Stay on the repaired trail", zh: "沿维修步道行走", body: "The AFCD maintenance board records serious erosion from off-path trampling. Keep to the log steps and the marked path, especially on the descent to Hap Mun Bay." },
    { title: "Look, don't take", zh: "只观察，不带走", body: "Do not deface, damage or remove any rock, and do not disturb wildlife. Do not touch, feed or tread on marine life and coral. Take all litter home." },
    { title: "Confirm the last kai-to", zh: "确认街渡尾班船", body: "Sharp Island has no road access. Agree the return pier, the last sailing and the fare with the operator before you start, since the two beaches use different piers." }
  ],

  sources: [
    { kind: "Official", label: "HK UNESCO Global Geopark: Sharp Island", detail: "1.25 m tide threshold, return-time warning, and water, food and sun protection advice.", url: "https://geopark.gov.hk/tc/discover/attractions/sharp-island" },
    { kind: "Official", label: "AFCD: Kiu Tsui Country Park", detail: "Island setting, beach facilities, woodland, 136 m high point and the tombolo.", url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_kt/cou_vis_cou_kt.html" },
    { kind: "Official", label: "LCSD: Sai Kung gazetted beaches", detail: "Facilities at Hap Mun Bay and Kiu Tsui Beach; winter lifeguard suspension.", url: "https://www.lcsd.gov.hk/tc/beach/index/beach-location-nt/beach-address-sk.html" },
    { kind: "Official", label: "Hong Kong Observatory real-time tide information", detail: "Live and predicted tidal heights. Check before crossing the tombolo.", url: "https://tide1.hydro.gov.hk/" },
    { kind: "Official", label: "GovHK: Real-time Tide Information Service", detail: "How tide predictions are produced, and why observed levels may differ.", url: "https://www.gov.hk/en/residents/transport/vessel/realtime_tide.htm" },
    { kind: "Map", label: "Tencent Maps GL JS: vector basemap and overlay layers", detail: "GCJ-02 compliant basemap held at zoom 16; route, markers and cursor are drawn as vector overlays.", url: "https://lbs.qq.com/webApi/javascriptGL/glDoc/glDocLayer" },
    { kind: "Map", label: "Group terrain tiles and elevation grid", detail: "Local tile pyramid and the resampled elevation grid behind the profile and the tide model.", url: null },
    { kind: "Field evidence", label: "On-site boards photographed during the survey", detail: "p03 Geopark conservation, p04 tide table, p05 marine life, p09 direction signs, p17 panorama, p18 trail maintenance, p20 junction, p28 beach layout plan.", url: null },
    { kind: "Field evidence", label: "Group QField records", detail: "29 photographs and 8 observation points, 11:10 to 13:38 HKT, 13 November 2026.", url: null }
  ],

  checks: [
    "Rock type in p06: identify against the Geopark geology material before naming it on the site.",
    "Art programme name and organiser: the plaque S12 in p08 was only partly legible.",
    "Tide threshold: the photographed pier board and the current Geopark page state 1.25 m, while some older material quotes 1.4 m. The site follows the board.",
    "Beach facilities at Hap Mun Bay come from the LCSD list and were not checked one by one on the day."
  ],

  reading: [
    {
      kind: "GAZETTEER", year: "1819",
      title: "嘉慶《新安縣志》",
      source: "舒懋官修，王崇熙纂，二十四卷，十三門",
      note: "The county gazetteer that covered the whole of what is now Hong Kong, including the Sai Kung islands. It sets aside a separate chapter on coastal defence and records that islands in the inner sea carried residents. We could not find an entry naming Kiu Tsui in the sections available to us, so we cite it only as background for how the islands were administered, not for anything specific about this one.",
      noteZh: "涵盖今香港全境的县志，西贡一带海岛属其范围；书中特立〈海防略〉一门，记内洋岛屿多有居民。我们未能核到直接以「桥咀」为名的条目，故仅作海岛行政背景引用，不据此推断本岛细节。",
      flag: "目錄已核，正文待查"
    },
    {
      kind: "JOURNAL", year: "2012",
      title: "Volcanic structure of the High Island caldera",
      source: "Sewell, Tang and Campbell, Geochemistry, Geophysics, Geosystems, doi 10.1029/2011GC003865",
      note: "Reconstructs the tilted, nested caldera that produced the welded tuff of the Sai Kung coast. This is the regional frame for the volcanic rock we photographed at the shore stops.",
      noteZh: "重建西贡海岸 welded tuff（熔结凝灰岩）所对应的倾斜嵌套破火山口，是海岸各站所见火山岩的区域构造框架。",
      flag: "区域背景"
    },
    {
      kind: "JOURNAL", year: "2010",
      title: "Geodiversity and geoconservation in Hong Kong",
      source: "Ng, Li, Fang and Ng, Asian Geographer 27(1 to 2), 1 to 11, doi 10.1080/10225706.2010.9684149",
      note: "Sets out why Hong Kong treats rock exposures as a conservation object rather than scenery. It is the argument behind the Geopark board at p03 that prohibits removing or defacing rock.",
      noteZh: "说明香港为何把岩石露头当作保育对象而非单纯景观，也是 p03 地质公园告示牌禁止采石与刻画背后的依据。",
      flag: "保育框架"
    },
    {
      kind: "CHAPTER", year: "2010",
      title: "Hong Kong Geopark: uncovering the geology of a metropolis",
      source: "Ng, Fung and Newsome, in Global Geotourism Perspectives, doi 10.23912/978-1-906884-17-8-1120",
      note: "Describes how a Geopark was assembled inside a dense city, and what visitor management that requires. Useful for reading the signage we recorded rather than for the island itself.",
      noteZh: "记述在高密度城市内部组建地质公园的过程及其游客管理要求，主要用于解读我们拍到的解说牌，而非岛本身。",
      flag: "管理背景"
    },
    {
      kind: "JOURNAL", year: "2013",
      title: "Hong Kong Geopark as a paradigm of urban sustainable tourism",
      source: "Ng, Fung and Newsome, Asian Geographer, doi 10.1080/10225706.2013.808577",
      note: "Argues that urban Geoparks carry a heavier visitor load than remote ones. It fits what we saw: a small island with a signed trail, two gazetted beaches and a busload-scale arrival point.",
      noteZh: "认为城市型地质公园的游客压力高于偏远型。这与现场相符：小岛上有完整步道系统、两个宪报泳滩，以及可容纳大批游客的到达点。",
      flag: "游客压力"
    },
    {
      kind: "REPORT", year: "2024",
      title: "Kiu Tsui Country Park",
      source: "Agriculture, Fisheries and Conservation Department",
      note: "Gives the island setting, the beach facilities, the woodland and the 136 m high point, and describes the tombolo. Our elevation profile cannot resolve that summit, so the published figure is the one we quote.",
      noteZh: "提供岛屿环境、泳滩设施、林地与 136 米最高点的官方数值，并描述连岛沙洲。我们的高程剖面无法分辨该峰顶，因此引用官方数字。",
      flag: "官方数值",
      url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_kt/cou_vis_cou_kt.html"
    },
    {
      kind: "REPORT", year: "2026",
      title: "Sharp Island, Hong Kong UNESCO Global Geopark",
      source: "Geopark Division, Agriculture, Fisheries and Conservation Department",
      note: "States the 1.25 m tide threshold and the instruction to allow time for the return crossing. Both appear on the pier board we photographed, which is why the tide model uses 1.25 m as the crest height.",
      noteZh: "载明 1.25 米潮高临界值，并提醒预留返程时间。两项内容均见于我们拍摄的码头告示牌，潮汐模型即以此作为沙脊高程。",
      flag: "潮汐临界值",
      url: "https://geopark.gov.hk/tc/discover/attractions/sharp-island"
    },
    {
      kind: "REPORT", year: "2026",
      title: "Vegetation of Hong Kong",
      source: "Hong Kong Biodiversity Information Hub and Greening the City",
      note: "Describes the subtropical evergreen broadleaf forest, the shrublands of Myrtaceae and the grass slopes that hill fire keeps open. The four plates in the vegetation section follow these formations.",
      noteZh: "记述南亚热带常绿阔叶林、以桃金娘科为主的灌丛，以及由山火维持的草坡。植被板块的四幅插画即依此四类群落绘制。",
      flag: "植被分类"
    }
  ],

  contributions: [
    { name: "孟楷淇（組長）", fieldwork: "Route planning and stage division", analysis: "Tide window and crossing decision", website: "Structure, map and tide model" },
    { name: "金子涵", fieldwork: "Photograph log and point numbering", analysis: "Shade classification check", website: "Photo pipeline and lightbox" },
    { name: "王馨悦", fieldwork: "Record indexing and caption check", analysis: "Literature and gazetteer search", website: "Reading list and source notes" },
    { name: "伍佳慧", fieldwork: "Coastal stage notes, points 01 to 03", analysis: "Erosion and trail condition", website: "Stage cards" },
    { name: "楊薈瑾", fieldwork: "Woodland stage notes, points 04 and 05", analysis: "Vegetation formation mapping", website: "Vegetation plates" },
    { name: "武若瞳", fieldwork: "Ridge stage notes, points 06 and 07", analysis: "Sun exposure sequence", website: "Shade ribbon" },
    { name: "聶仕霖", fieldwork: "Beach stage notes, point 08", analysis: "Facilities against LCSD list", website: "Observation point drawer" },
    { name: "劉凱心", fieldwork: "Signage survey and board transcription", analysis: "Source verification", website: "Sources and checks" },
    { name: "胡佳啟", fieldwork: "Elevation readings along the route", analysis: "Profile and contour handling", website: "Elevation chart" },
    { name: "吳敘靜", fieldwork: "Weather and time log", analysis: "Survey window and timing", website: "Layout and responsive pass" }
  ]
};
