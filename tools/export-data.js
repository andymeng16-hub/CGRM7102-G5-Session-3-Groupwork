/* Regenerate the reusable data exports from data/field-data.js + data/terrain.js.
   Run from the project root:  node tools/export-data.js
   Outputs (WGS-84, EPSG:4326):
     data/field-data.json        : full content snapshot for reuse
     data/survey-points.geojson  : 8 observation points
     data/routes.geojson         : 1 continuous route + 4 stage segments
   Positions are derived from on-site signage, field photographs and public
   gazetteers, then checked against the survey photographs.
*/
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'data', 'field-data.js'));
require(path.join(__dirname, '..', 'data', 'terrain.js'));
const D = global.window.FIELD_DATA;
const T = global.window.TERRAIN;
const ROOT = path.join(__dirname, '..');
const out = (rel, obj) => {
  fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
  console.log('wrote', rel);
};
const join = v => Array.isArray(v) ? v.join(' | ') : String(v == null ? '' : v);
const photos = v => (v || []).map(p => 'assets/photos/' + p + '.jpg').join(', ');

/* ---- shared geometry helpers ------------------------------------------ */
function haversine(a, b) {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180,
        dLng = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function elevation(lat, lng) {
  const n = T.n;
  let gx = (lng - T.w) / (T.e - T.w) * (n - 1);
  let gy = (T.north - lat) / (T.north - T.s) * (n - 1);
  gx = Math.max(0, Math.min(n - 1, gx));
  gy = Math.max(0, Math.min(n - 1, gy));
  const x0 = Math.floor(gx), y0 = Math.floor(gy),
        x1 = Math.min(x0 + 1, n - 1), y1 = Math.min(y0 + 1, n - 1),
        fx = gx - x0, fy = gy - y0;
  const a = T.z[y0][x0] * (1 - fx) + T.z[y0][x1] * fx;
  const b = T.z[y1][x0] * (1 - fx) + T.z[y1][x1] * fx;
  return Math.max(0, a * (1 - fy) + b * fy);
}

const NOTE = 'Positions are WGS-84 (EPSG:4326), derived from on-site signage, field photographs and public gazetteers. Elevations come from the 90 m SRTM sampling cached in data/terrain.js. Map tiles are a GCJ-02 XYZ pyramid in assets/tiles/.';

/* ---- 1. full content snapshot ----------------------------------------- */
const snapshot = Object.assign({}, D, {
  _meta: {
    generated_from: 'data/field-data.js via tools/export-data.js',
    crs: 'EPSG:4326 (WGS-84) for observation points and route path',
    map_tiles: 'GCJ-02 XYZ pyramid, z13 to z17, in assets/tiles/',
    note: NOTE
  }
});
out('data/field-data.json', snapshot);

/* ---- 2. observation points -------------------------------------------- */
const PATH = D.route.path;
const cum = [0];
for (let i = 1; i < PATH.length; i++) cum.push(cum[i - 1] + haversine(PATH[i - 1], PATH[i]));
const TOTAL = cum[cum.length - 1];

const pointFeatures = D.points.map(p => {
  let best = 0, bd = Infinity;
  PATH.forEach((v, idx) => {
    const d = haversine(v, [p.lat, p.lng]);
    if (d < bd) { bd = d; best = idx; }
  });
  return {
    type: 'Feature',
    id: p.id,
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: {
      code: p.code,
      name: p.name,
      name_zh: p.zh,
      stage: p.stage,
      time_hkt: p.time,
      weather: p.weather,
      shade_20m: p.shade,
      elev_m_dem: Math.round(elevation(p.lat, p.lng)),
      chainage_km: Number(cum[best].toFixed(3)),
      attraction: p.attraction,
      description: p.description,
      description_zh: p.descriptionZh,
      concerns: join(p.concerns),
      facilities: p.facilities,
      suggestion: p.tip,
      photos: photos(p.photos),
      evidence_source: p.sources,
      needs_checking: p.check || '',
      indicative: true
    }
  };
});
out('data/survey-points.geojson', {
  type: 'FeatureCollection',
  name: 'sharp_island_observation_points',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  note: NOTE,
  survey_date: D.survey.date,
  features: pointFeatures
});

/* ---- 3. one route + four stage segments -------------------------------- */
/* Split the line at the chainage printed on each stage card (e.g. "0.60 to 1.05 km").
   Interpolating the endpoints keeps the four segments continuous and avoids a
   degenerate two-vertex line for the single-point ridge stage. */
function pointAt(dist) {
  const d = Math.max(0, Math.min(TOTAL, dist));
  let seg = 0;
  while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
  const f = cum[seg + 1] > cum[seg] ? (d - cum[seg]) / (cum[seg + 1] - cum[seg]) : 0;
  return [PATH[seg][1] + (PATH[seg + 1][1] - PATH[seg][1]) * f,
          PATH[seg][0] + (PATH[seg + 1][0] - PATH[seg][0]) * f];
}
function segmentAt(d0, d1) {
  const pts = [pointAt(d0)];
  for (let i = 0; i < PATH.length; i++) {
    if (cum[i] > d0 + 1e-6 && cum[i] < d1 - 1e-6) pts.push([PATH[i][1], PATH[i][0]]);
  }
  pts.push(pointAt(d1));
  return pts;
}
const line = arr => arr.map(v => [v[1], v[0]]);   // [lat,lng] -> GeoJSON [lng,lat]

const features = [{
  type: 'Feature',
  id: 'route-full',
  geometry: { type: 'LineString', coordinates: line(PATH) },
  properties: {
    kind: 'route',
    route: 'A',
    name: D.route.name,
    name_zh: D.route.zh,
    start: D.route.start,
    start_zh: D.route.startZh,
    finish: D.route.finish,
    finish_zh: D.route.finishZh,
    distance: D.route.distance,
    length_km_indicative: Number(TOTAL.toFixed(3)),
    recorded_time: D.route.time,
    shade: D.route.shade,
    shade_zh: D.route.shadeZh,
    tidal: D.route.tide,
    facilities: D.route.facilities,
    stages: D.stages.map(s => s.id).join(', '),
    stops: D.points.map(p => p.id).join(', '),
    evidence: D.route.evidence,
    indicative: true
  }
}];

D.stages.forEach((s, si) => {
  const m = s.range.match(/([\d.]+)\s+to\s+([\d.]+)/);
  const d0 = m ? Number(m[1]) : si * TOTAL / D.stages.length;
  const d1 = si === D.stages.length - 1 ? TOTAL : (m ? Number(m[2]) : (si + 1) * TOTAL / D.stages.length);
  const seg = segmentAt(d0, d1);
  features.push({
    type: 'Feature',
    id: 'stage-' + s.id,
    geometry: { type: 'LineString', coordinates: seg },
    properties: {
      kind: 'stage',
      route: 'A',
      stage: s.id,
      code: s.code,
      name: s.name,
      name_zh: s.zh,
      chainage: s.range,
      chainage_km_from: Number(d0.toFixed(3)),
      chainage_km_to: Number(d1.toFixed(3)),
      time_hkt: s.time,
      shade_20m: s.shade,
      elevation_band: s.elev,
      stops: s.points.join(', '),
      summary: s.summary,
      summary_zh: s.summaryZh,
      extra_care: s.care,
      photos: photos(s.photos),
      indicative: true
    }
  });
});
out('data/routes.geojson', {
  type: 'FeatureCollection',
  name: 'sharp_island_single_route',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  note: NOTE + ' Contains ONE continuous route (kind=route) plus its 4 stage segments (kind=stage) for QGIS symbology.',
  survey_date: D.survey.date,
  features
});

console.log('route length (indicative):', TOTAL.toFixed(3), 'km,', pointFeatures.length, 'points,', D.stages.length, 'stages');
