/* Sharp Island: GIS field guide interactions
   - AMap raster tiles drawn on a canvas, with our route and points drawn as
     vector overlays on top. The group's own terrain tiles serve as an offline
     fallback.
   - One interactive route: scrubber, elevation profile, observation drawer.
   - A tide model of the tombolo: analytic surface, 0.5 m contours, live waterline.
*/
(function () {
  'use strict';

  var D = window.FIELD_DATA;
  var T = window.TERRAIN;
  var V = window.VEGETATION || [];
  var G = window.GALLERY || null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var photo = function (id) { return 'assets/photos/' + id + '.jpg'; };
  var thumb = function (id) { return 'assets/photos/thumbs/' + id + '.jpg'; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var shadeName = { mostly: 'MOSTLY SHADED', partly: 'PARTLY SHADED', unshaded: 'UNSHADED' };
  var shadeZh = { mostly: '大部份遮阴', partly: '部份遮阴', unshaded: '无遮阴' };
  var shadeShort = { mostly: 'MOSTLY', partly: 'PARTLY', unshaded: 'UNSHADED' };
  var shadeShortZh = { mostly: '大部份遮阴', partly: '部份遮阴', unshaded: '无遮阴' };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  /* ------------------------------------------------------------------ */
  /* Language                                                             */
  /* ------------------------------------------------------------------ */
  /* English and Simplified Chinese sit side by side in the markup. The
     Traditional version is derived from the Simplified source at run time
     through the table in data/zh-hant.js, so the two Chinese versions can
     never drift apart. One attribute on the root element decides which half
     of every pair the reader sees. */
  var ZH = window.ZH_HANT || { toHant: function (s) { return s; } };
  var LANGS = ['en', 'zh-hans', 'zh-hant'];

  /* Each button names the version it moves to. A Chinese button is written in
     the orthography of the version on screen, and every button carries a
     tooltip in the language on screen. */
  var LANG_BTN_LABEL = {
    'zh-hans': '简中',
    'zh-hant': '繁中',
    'en': 'EN'
  };
  var LANG_BTN_TIP = {
    'zh-hans': '切换到简体中文',
    'zh-hant': '切换到繁体中文',
    'en': '切换到英文'
  };
  var LANG_BTN_TIP_EN = {
    'zh-hans': 'Switch to Simplified Chinese',
    'zh-hant': 'Switch to Traditional Chinese',
    'en': 'Switch to English'
  };

  /* Both halves of one label, as markup. */
  function bi(en, hans) {
    return '<span class="t-en">' + en + '</span><span class="t-hans">' + hans + '</span>';
  }
  /* One string in the reader's language, for canvas and SVG text. */
  function tr(en, hans) {
    if (state.lang === 'en') return en;
    return state.lang === 'zh-hant' ? ZH.toHant(hans) : hans;
  }
  function hantTree(node) {
    if (node.nodeType === 3) { node.nodeValue = ZH.toHant(node.nodeValue); return; }
    if (node.nodeType !== 1) return;
    for (var i = 0; i < node.childNodes.length; i++) hantTree(node.childNodes[i]);
  }
  /* Every Simplified block gets a Traditional twin cloned beside it. */
  function expandHant(root) {
    if (!root) return;
    var src = $$('.t-hans', root);
    for (var i = 0; i < src.length; i++) {
      var el = src[i];
      if (el.getAttribute('data-hant') === '1') continue;
      var clone = el.cloneNode(true);
      clone.classList.remove('t-hans');
      clone.classList.add('t-hant');
      clone.setAttribute('data-hant', '1');
      hantTree(clone);
      el.setAttribute('data-hant', '1');
      el.parentNode.insertBefore(clone, el.nextSibling);
    }
  }
  /* Write markup, then give it its Traditional twin. */
  function setHTML(sel, html) {
    var el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    el.innerHTML = html;
    expandHant(el);
  }
  /* Ranges and heights are written in English units in the data file. */
  function metricZh(str) {
    return str.replace(/ to /g, ' 至 ').replace(/km/g, '公里').replace(/ m$/, ' 米');
  }
  /* A time window reads 11:10 to 11:32 in the data and 11:10 至 11:32 in
     Chinese. */
  function timeZh(str) {
    return str.replace(/ to /g, ' 至 ');
  }

  /* ------------------------------------------------------------------ */
  /* Coordinate helpers                                                   */
  /* ------------------------------------------------------------------ */
  function outOfChina(lng, lat) { return lng < 72.004 || lng > 137.8347 || lat < .8293 || lat > 55.8271; }
  function tLat(x, y) {
    var r = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI))*2/3;
    r += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI))*2/3;
    r += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30))*2/3;
    return r;
  }
  function tLng(x, y) {
    var r = 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI))*2/3;
    r += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI))*2/3;
    r += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI))*2/3;
    return r;
  }
  /* WGS-84 to GCJ-02 (Tencent Maps uses GCJ-02 for Hong Kong, China). */
  function wgs2gcj(lng, lat) {
    if (outOfChina(lng, lat)) return { lat: lat, lng: lng };
    var a = 6378245.0, ee = .006693421622965943;
    var dLat = tLat(lng-105, lat-35), dLng = tLng(lng-105, lat-35);
    var rad = lat/180*Math.PI, magic = Math.sin(rad);
    magic = 1 - ee*magic*magic;
    var sq = Math.sqrt(magic);
    dLat = dLat*180/((a*(1-ee))/(magic*sq)*Math.PI);
    dLng = dLng*180/(a/sq*Math.cos(rad)*Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }
  function merc(lat, lng, z) {
    var s = 256 * Math.pow(2, z);
    var sn = Math.sin(lat*Math.PI/180);
    return { x: (lng+180)/360*s, y: (.5 - Math.log((1+sn)/(1-sn))/(4*Math.PI))*s };
  }
  function invMerc(x, y, z) {
    var s = 256 * Math.pow(2, z);
    return { lng: x/s*360 - 180, lat: Math.atan(Math.sinh(Math.PI - 2*Math.PI*y/s))*180/Math.PI };
  }
  function gcj(lat, lng) { return wgs2gcj(lng, lat); }
  function project(lat, lng, z) { var g = gcj(lat, lng); return merc(g.lat, g.lng, z); }

  function haversine(a, b) {
    var R = 6371, dLat = (b[0]-a[0])*Math.PI/180, dLng = (b[1]-a[1])*Math.PI/180;
    var s = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2*R*Math.asin(Math.sqrt(s));
  }
  /* Bilinear elevation sample from the terrain grid. */
  function elevation(lat, lng) {
    var gx = (lng - T.w) / (T.e - T.w) * (T.n - 1);
    var gy = (T.north - lat) / (T.north - T.s) * (T.n - 1);
    gx = clamp(gx, 0, T.n-1); gy = clamp(gy, 0, T.n-1);
    var x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(x0+1, T.n-1), y1 = Math.min(y0+1, T.n-1);
    var fx = gx-x0, fy = gy-y0;
    var a = T.z[y0][x0]*(1-fx) + T.z[y0][x1]*fx;
    var b = T.z[y1][x0]*(1-fx) + T.z[y1][x1]*fx;
    return Math.max(0, a*(1-fy) + b*fy);
  }

  /* ------------------------------------------------------------------ */
  /* Route geometry and elevation profile                                 */
  /* ------------------------------------------------------------------ */
  var ROUTE = D.route, PATH = ROUTE.path;
  var cum = [0];
  for (var i = 1; i < PATH.length; i++) cum.push(cum[i-1] + haversine(PATH[i-1], PATH[i]));
  var TOTAL = cum[cum.length-1];
  var SAMPLES = [];
  var NS = 180;
  for (var k = 0; k <= NS; k++) {
    var target = TOTAL * k / NS;
    var seg = 0;
    while (seg < cum.length-2 && cum[seg+1] < target) seg++;
    var f = (cum[seg+1] - cum[seg]) > 0 ? (target - cum[seg])/(cum[seg+1]-cum[seg]) : 0;
    var la = PATH[seg][0] + (PATH[seg+1][0]-PATH[seg][0])*f;
    var ln = PATH[seg][1] + (PATH[seg+1][1]-PATH[seg][1])*f;
    SAMPLES.push({ lat: la, lng: ln, dist: target, elev: elevation(la, ln) });
  }
  for (var pass = 0; pass < 3; pass++) {
    for (var j = 1; j < SAMPLES.length-1; j++) {
      SAMPLES[j].elev = (SAMPLES[j-1].elev + 2*SAMPLES[j].elev + SAMPLES[j+1].elev)/4;
    }
  }
  var MAXE = Math.max.apply(null, SAMPLES.map(function (s) { return s.elev; }));
  var ASCENT = 0;
  for (var q = 1; q < SAMPLES.length; q++) ASCENT += Math.max(0, SAMPLES[q].elev - SAMPLES[q-1].elev);

  D.points.forEach(function (p) {
    var best = 0, bd = Infinity;
    cum.forEach(function (c, idx) {
      var d = haversine(PATH[idx], [p.lat, p.lng]);
      if (d < bd) { bd = d; best = idx; }
    });
    p.dist = cum[best];
    p.progress = clamp(p.dist / TOTAL, 0, 1);
    p.elev = elevation(p.lat, p.lng);
  });
  /* Stage boundaries come from the chainage printed on each stage card, so the
     profile, the stage chips, the shade readout and the GeoJSON exports agree. */
  D.stages.forEach(function (s, i) {
    var m = s.range.match(/([\d.]+)\s+to\s+([\d.]+)/);
    var from = m ? Number(m[1]) : i * TOTAL / D.stages.length;
    var to = i === D.stages.length - 1 ? TOTAL : (m ? Number(m[2]) : (i + 1) * TOTAL / D.stages.length);
    s.from = from; s.to = to;
    s.startProgress = clamp(from / TOTAL, 0, 1);
    s.endProgress = clamp(to / TOTAL, 0, 1);
  });

  function sampleAt(progress) {
    var idx = clamp(Math.round(progress * NS), 0, NS);
    return SAMPLES[idx];
  }
  function stageAt(progress) {
    return D.stages.filter(function (s) { return progress >= s.startProgress && progress <= s.endProgress; })[0] || D.stages[0];
  }
  function nearestPoint(progress) {
    var d = progress * TOTAL, best = D.points[0], bd = Infinity;
    D.points.forEach(function (p) { var x = Math.abs(p.dist - d); if (x < bd) { bd = x; best = p; } });
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  var state = {
    progress: 0, playing: false,
    zoom: 15.4, center: null,
    tide: 0.95, tidePlaying: false, tideT: 0,
    point: null, drawerIdx: 0, lbPhotos: [], lbIdx: 0,
    lang: 'en', lbCaption: '', lbCaptionZh: '', lbCaptions: null, lbCaptionsZh: null,
    basemap: 'road'
  };
  var c = gcj(22.3625, 114.2915);
  state.center = { lat: c.lat, lng: c.lng };

  /* GCJ tile ranges, so we never request a tile we did not generate */
  var TILE_RANGES = {};
  (function () {
    var b = { w: T.w + T.gcj.dlng, e: T.e + T.gcj.dlng, s: T.s + T.gcj.dlat, n: T.north + T.gcj.dlat };
    for (var z = 13; z <= 17; z++) {
      var a = merc(b.n, b.w, z), d = merc(b.s, b.e, z);
      TILE_RANGES[z] = { x0: Math.floor(a.x/256), x1: Math.floor(d.x/256), y0: Math.floor(a.y/256), y1: Math.floor(d.y/256) };
    }
  })();
  function tileInRange(x, y, z) {
    var r = TILE_RANGES[z];
    return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }

  /* ------------------------------------------------------------------ */
  /* Scale bar                                                            */
  /* ------------------------------------------------------------------ */
  function updateScale(z) {
    var mpp = 156543.03392 * Math.cos(state.center.lat*Math.PI/180) / Math.pow(2, z);
    var metres = 70*mpp;
    var nice = metres > 900 ? Math.round(metres/500)*500 : metres > 300 ? Math.round(metres/100)*100 : Math.round(metres/50)*50;
    nice = Math.max(25, nice);
    var bar = $('.map-scale span'), lab = $('#scaleLabel');
    if (bar) bar.style.width = Math.round(nice/mpp) + 'px';
    if (lab) lab.textContent = nice >= 1000 ? (nice/1000).toFixed(1)+' km' : nice+' m';
  }

  /* ------------------------------------------------------------------ */
  /* Base map                                                             */
  /* ------------------------------------------------------------------ */
  /* The basemap is drawn tile by tile on a canvas, from the official AMap
     raster service. Three layers share one grid, and all of them are on the
     GCJ-02 system the route is projected into:
       road     the street map, with place names
       sat      satellite imagery
       labels   street and place names, transparent, laid over the imagery
     The label language follows the language of the page. The group's own
     terrain tiles stay in the repository as an offline fallback, so the
     island still draws when there is no network. */
  var BASEMAPS = [
    { id: 'road', en: 'MAP', zh: '地图' },
    { id: 'sat', en: 'SATELLITE', zh: '卫星' },
    { id: 'satlbl', en: 'SATELLITE + NAMES', zh: '卫星加地名' }
  ];
  var Z_MIN = 13, Z_MAX = 17.4;

  /* ------------------------------------------------------------------ */
  /* Scale bar                                                            */
  /* ------------------------------------------------------------------ */
  function updateScale(z) {
    var mpp = 156543.03392 * Math.cos(state.center.lat*Math.PI/180) / Math.pow(2, z);
    var metres = 70*mpp;
    var nice = metres > 900 ? Math.round(metres/500)*500 : metres > 300 ? Math.round(metres/100)*100 : Math.round(metres/50)*50;
    nice = Math.max(25, nice);
    var bar = $('.map-scale span'), lab = $('#scaleLabel');
    if (bar) bar.style.width = Math.round(nice/mpp) + 'px';
    if (lab) lab.textContent = nice >= 1000 ? (nice/1000).toFixed(1)+' km' : nice+' m';
  }

  /* ------------------------------------------------------------------ */
  /* Tiles                                                                */
  /* ------------------------------------------------------------------ */
  var canvas = $('#tileMap'), ctx = canvas.getContext('2d');
  var tileCache = {}, tileW = 0, tileH = 0, redrawQueued = false;
  var remoteHits = 0, remoteChecked = false;

  /* One tile URL. The four sub-domains are rotated by the tile index so
     that no single host carries the whole view.

     The labels are drawn in Chinese whatever language the page is in. The
     English rendering of the street map fills its empty tiles with a
     slightly different blue from the sea it draws, which leaves pale
     rectangles across the water; the Chinese rendering is consistent, and
     it carries the place names as they are written here: 桥咀洲, 罟佬洲,
     厦门湾. The name overlay over the satellite view is transparent, so
     it has no such seam. */
  var TILE_LANG = 'zh_cn';
  function tileUrl(layer, z, x, y) {
    var sub = 1 + ((x + y) % 4);
    if (layer === 'sat') return 'https://webst0'+sub+'.is.autonavi.com/appmaptile?style=6&x='+x+'&y='+y+'&z='+z;
    if (layer === 'labels') return 'https://webst0'+sub+'.is.autonavi.com/appmaptile?style=8&lang='+TILE_LANG+'&x='+x+'&y='+y+'&z='+z;
    return 'https://webrd0'+sub+'.is.autonavi.com/appmaptile?style=8&lang='+TILE_LANG+'&size=1&scale=1&x='+x+'&y='+y+'&z='+z;
  }
  function remoteTile(url) {
    if (tileCache[url]) return tileCache[url];
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { im.ready = true; remoteHits++; queueRedraw(); };
    im.onerror = function () { im.failed = true; queueRedraw(); };
    im.src = url;
    tileCache[url] = im;
    return im;
  }
  /* The survey tiles, cut from the group's own elevation grid, are used
     when the online service cannot be reached. */
  function localTile(kind, z, x, y) {
    var key = 'local/'+kind+'/'+z+'/'+x+'/'+y;
    if (tileCache[key]) return tileCache[key];
    if (!tileInRange(x, y, z)) return null;
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { im.ready = true; queueRedraw(); };
    im.onerror = function () { im.failed = true; };
    im.src = 'assets/tiles/'+kind+'/'+z+'/'+x+'/'+y+'.png';
    tileCache[key] = im;
    return im;
  }
  function queueRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(function () { redrawQueued = false; drawTileMap(); });
  }
  /* If nothing has come back from the tile service after a few seconds,
     the page says so plainly instead of showing an empty sea. */
  function checkMapService() {
    if (remoteChecked) return;
    remoteChecked = true;
    if (!remoteHits) setMapStatus('The online basemap is unreachable, so the local survey tiles are shown.',
      '在线底图无法连接，当前显示本地地形瓦片。');
  }
  function setMapStatus(en, zh) {
    var nb = $('#mapNote');
    if (!nb || !en) return;
    setHTML(nb, bi(en, zh));
    nb.hidden = false;
  }

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    tileW = canvas.clientWidth || 800; tileH = canvas.clientHeight || 520;
    canvas.width = Math.round(tileW*dpr); canvas.height = Math.round(tileH*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Contours                                                            */
  /* ------------------------------------------------------------------ */
  /* Ten-metre contour lines, taken from the same elevation grid the profile
     and the tide model are built on. Marching squares over the grid gives
     the line, and because the grid is pushed through the same GCJ-02
     transform as the route, the lines sit exactly on the ground rather than
     on a raster that would not quite line up. */
  var contourCache = null;
  function contourSegments() {
    if (contourCache) return contourCache;
    var n = T.n, z = T.z, segs = [];
    var dLat = (T.north - T.s)/n, dLng = (T.e - T.w)/n;
    function lerp(a, b, t) { return a + (b-a)*t; }
    function corner(r, c) { return [T.north - r*dLat, T.w + c*dLng]; }
    for (var r = 0; r < n-1; r++) {
      for (var c = 0; c < n-1; c++) {
        var v = [z[r][c], z[r][c+1], z[r+1][c+1], z[r+1][c]];
        var p = [corner(r, c), corner(r, c+1), corner(r+1, c+1), corner(r+1, c)];
        for (var level = 10; level <= 60; level += 10) {
          var pts = [];
          for (var e = 0; e < 4; e++) {
            var i0 = e, i1 = (e+1) % 4, v0 = v[i0], v1 = v[i1];
            if (v1 === v0 || (v0 > level) === (v1 > level)) continue;
            var t = (level - v0)/(v1 - v0);
            pts.push([lerp(p[i0][0], p[i1][0], t), lerp(p[i0][1], p[i1][1], t)]);
          }
          if (pts.length === 2) segs.push({ lv: level, a: pts[0], b: pts[1] });
          else if (pts.length === 4) {
            segs.push({ lv: level, a: pts[0], b: pts[1] });
            segs.push({ lv: level, a: pts[2], b: pts[3] });
          }
        }
      }
    }
    /* The transform is done once, here, so that panning the map only costs
       one projection per line rather than the whole offset again. */
    contourCache = segs.map(function (s) {
      var a = gcj(s.a[0], s.a[1]), b = gcj(s.b[0], s.b[1]);
      return { lv: s.lv, a: a, b: b };
    });
    return contourCache;
  }
  function drawContours(z, px0, py0, w, h) {
    var segs = contourSegments();
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var a = merc(s.a.lat, s.a.lng, z), b = merc(s.b.lat, s.b.lng, z);
      var x1 = a.x-px0, y1 = a.y-py0, x2 = b.x-px0, y2 = b.y-py0;
      if ((x1 < -40 && x2 < -40) || (y1 < -40 && y2 < -40) ||
          (x1 > w+40 && x2 > w+40) || (y1 > h+40 && y2 > h+40)) continue;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      if (s.lv % 50 === 0) { ctx.strokeStyle = 'rgba(112,68,28,.75)'; ctx.lineWidth = 1.5; }
      else { ctx.strokeStyle = 'rgba(112,68,28,.45)'; ctx.lineWidth = 1; }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTileMap() {
    if (!tileW || !tileH) sizeCanvas();
    var w = tileW, h = tileH, z = state.zoom, tz = clamp(Math.ceil(z), Z_MIN, 17);
    var scale = Math.pow(2, z - tz);
    var cc = merc(state.center.lat, state.center.lng, z);
    var px0 = cc.x - w/2, py0 = cc.y - h/2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--tile-sea') || '#7993a0';
    ctx.fillRect(0, 0, w, h);

    var ts = 256*scale;
    var bx0 = Math.floor(px0/ts), bx1 = Math.floor((px0+w)/ts);
    var by0 = Math.floor(py0/ts), by1 = Math.floor((py0+h)/ts);
    var baseLayer = state.basemap === 'road' ? 'road' : 'sat';
    for (var x = bx0; x <= bx1; x++) {
      for (var y = by0; y <= by1; y++) {
        var sx = x*ts - px0, sy = y*ts - py0;
        var base = remoteTile(tileUrl(baseLayer, tz, x, y));
        if (base && base.ready) ctx.drawImage(base, sx, sy, ts+1, ts+1);
        else {
          /* offline: the group's own survey tiles take over, contours and all */
          var loc = localTile('base', tz, x, y);
          if (loc && loc.ready) ctx.drawImage(loc, sx, sy, ts+1, ts+1);
          var ov = localTile('overlay', tz, x, y);
          if (ov && ov.ready) {
            ctx.save(); ctx.globalAlpha = .8;
            ctx.drawImage(ov, sx, sy, ts+1, ts+1); ctx.restore();
          }
        }
        if (state.basemap === 'satlbl') {
          /* street and place names, transparent, over the imagery */
          var lb = remoteTile(tileUrl('labels', tz, x, y));
          if (lb && lb.ready) ctx.drawImage(lb, sx, sy, ts+1, ts+1);
        }
      }
    }

    /* the group's own ten-metre contours, over the street map. Offline the
       raster contours in the local tiles already carry them. */
    if (state.basemap === 'road' && remoteHits) drawContours(z, px0, py0, w, h);

    /* route */
    var pts = PATH.map(function (p) {
      var m = project(p[0], p[1], z);
      return { x: m.x - px0, y: m.y - py0 };
    });
    function strokePath(list, color, width) {
      ctx.beginPath();
      list.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    strokePath(pts, 'rgba(255,255,255,.92)', 10);
    strokePath(pts, 'rgba(0,102,204,.42)', 5.5);
    var upto = Math.max(1, Math.round(state.progress*(pts.length-1)));
    strokePath(pts.slice(0, upto+1), '#0066cc', 5.5);

    /* observation points */
    var ink = '#1d1d1f';
    D.points.forEach(function (p) {
      var m = project(p.lat, p.lng, z), sx = m.x - px0, sy = m.y - py0;
      if (sx < -30 || sy < -30 || sx > w+30 || sy > h+30) return;
      p._sx = sx; p._sy = sy;
      ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI*2);
      ctx.fillStyle = ink; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 11px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.code, sx, sy+.5);
    });

    /* current position pin */
    var cur = sampleAt(state.progress);
    var cm = project(cur.lat, cur.lng, z), cx = cm.x - px0, cy = cm.y - py0;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy-26);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#0066cc'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fillStyle = '#0066cc'; ctx.fill();

    updateScale(z);
  }

  /* The three basemaps, and the button that chooses between them. */
  function setBasemap(id) {
    if (!BASEMAPS.some(function (b) { return b.id === id; })) return;
    state.basemap = id;
    var stage = $('.map-stage');
    if (stage) stage.setAttribute('data-basemap', id);
    $$('#mapModes .mode-btn').forEach(function (b) {
      var on = b.dataset.mode === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem('si-basemap', id); } catch (e) {}
    drawTileMap();
  }
  function buildMapModes() {
    setHTML('#mapModes', BASEMAPS.map(function (b) {
      return '<button type="button" class="mode-btn" data-mode="' + b.id + '" aria-pressed="false">' +
        bi(b.en, b.zh) + '</button>';
    }).join(''));
    var stage = $('.map-stage');
    if (stage) stage.setAttribute('data-basemap', state.basemap);
    setBasemap(state.basemap);
  }

  /* pointer interaction on the map canvas */
  var pointers = new Map(), drag = null, pinch = null;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 };
    if (pointers.size === 2) {
      var a = Array.from(pointers.values());
      pinch = { d: Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y), zoom: state.zoom };
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      var a = Array.from(pointers.values());
      var d = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
      state.zoom = clamp(pinch.zoom + Math.log2(d/pinch.d), Z_MIN, Z_MAX);
      drawTileMap(); return;
    }
    if (drag) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      drag.moved += Math.abs(dx)+Math.abs(dy);
      var cc = merc(state.center.lat, state.center.lng, state.zoom);
      var ll = invMerc(cc.x - dx, cc.y - dy, state.zoom);
      state.center = { lat: ll.lat, lng: ll.lng };
      drawTileMap();
    }
  });
  function endPointer(e) {
    if (drag && drag.moved < 6) handleMapClick(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top;
    var z0 = state.zoom, cc = merc(state.center.lat, state.center.lng, z0);
    var wx = cc.x - tileW/2 + mx, wy = cc.y - tileH/2 + my;
    var z1 = clamp(z0 - e.deltaY*0.0022, Z_MIN, Z_MAX);
    var f = Math.pow(2, z1-z0);
    var nc = invMerc(wx*f - mx + tileW/2, wy*f - my + tileH/2, z1);
    state.zoom = z1; state.center = { lat: nc.lat, lng: nc.lng };
    drawTileMap();
  }, { passive: false });

  function handleMapClick(e) {
    var r = canvas.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top;
    var hit = null, bd = 20;
    D.points.forEach(function (p) {
      if (p._sx == null) return;
      var d = Math.hypot(p._sx-mx, p._sy-my);
      if (d < bd) { bd = d; hit = p; }
    });
    if (hit) { openPoint(hit.id); return; }
    var z = state.zoom, cc = merc(state.center.lat, state.center.lng, z);
    var px0 = cc.x-tileW/2, py0 = cc.y-tileH/2;
    var best = 0, bdist = 16;
    SAMPLES.forEach(function (s, idx) {
      var m = project(s.lat, s.lng, z);
      var d = Math.hypot(m.x-px0-mx, m.y-py0-my);
      if (d < bdist) { bdist = d; best = idx; }
    });
    if (bdist < 16) setProgress(best/NS);
  }

  /* ------------------------------------------------------------------ */
  /* Elevation profile                                                     */
  /* ------------------------------------------------------------------ */
  var PF = { left: 46, right: 18, top: 24, bottom: 66, w: 1000, h: 340 };
  function px(dist) { return PF.left + (dist/TOTAL)*(PF.w-PF.left-PF.right); }
  function py(e) { return PF.h-PF.bottom - (e/Math.max(20, MAXE*1.15))*(PF.h-PF.top-PF.bottom); }
  function buildProfile() {
    var g = [];
    g.push('<defs><linearGradient id="pfGradient" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#0066cc" stop-opacity=".28"/><stop offset="100%" stop-color="#0066cc" stop-opacity="0"/></linearGradient></defs>');
    for (var e = 0; e <= Math.max(60, Math.ceil(MAXE/20)*20); e += 20) {
      g.push('<line class="pf-grid" x1="'+PF.left+'" y1="'+py(e)+'" x2="'+(PF.w-PF.right)+'" y2="'+py(e)+'"/>');
      g.push('<text class="pf-axis" x="'+(PF.left-9)+'" y="'+(py(e)+3)+'" text-anchor="end">'+tr(e+' m', e+' 米')+'</text>');
    }
    for (var km = 0; km <= TOTAL+.001; km += .5) {
      var x = px(km);
      g.push('<line class="pf-grid" x1="'+x+'" y1="'+PF.top+'" x2="'+x+'" y2="'+(PF.h-PF.bottom)+'"/>');
      g.push('<text class="pf-axis" x="'+x+'" y="'+(PF.h-PF.bottom+18)+'" text-anchor="middle">'+tr(km.toFixed(1)+' km', km.toFixed(1)+' 公里')+'</text>');
    }
    var area = 'M '+px(0)+' '+(PF.h-PF.bottom);
    var line = '';
    SAMPLES.forEach(function (s, i) {
      var X = px(s.dist).toFixed(1), Y = py(s.elev).toFixed(1);
      area += ' L '+X+' '+Y; line += (i ? ' L ' : 'M ') + X + ' ' + Y;
    });
    area += ' L '+px(TOTAL)+' '+(PF.h-PF.bottom)+' Z';
    g.push('<path class="pf-area" d="'+area+'"/>');
    g.push('<path class="pf-line" d="'+line+'"/>');
    D.stages.forEach(function (s, i) {
      var x0 = px(s.from), x1 = px(s.to);
      if (i) g.push('<line x1="'+x0+'" y1="'+PF.top+'" x2="'+x0+'" y2="'+(PF.h-PF.bottom+34)+
        '" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>');
      g.push('<line x1="'+x0+'" y1="'+(PF.h-PF.bottom+30)+'" x2="'+x1+'" y2="'+(PF.h-PF.bottom+30)+
        '" stroke="var(--line-soft)" stroke-width="2"/>');
      g.push('<text class="pf-stage" x="'+((x0+x1)/2)+'" y="'+(PF.h-PF.bottom+51)+
        '" text-anchor="middle">'+tr(s.id+' '+s.name.toUpperCase(), s.id+' '+s.zh)+'</text>');
    });
    D.points.forEach(function (p) {
      var x = px(p.dist), y = py(p.elev);
      g.push('<circle class="pf-mark" cx="'+x+'" cy="'+y+'" r="6"/>');
      g.push('<text class="pf-mark-label" x="'+x+'" y="'+(y-12)+'">'+p.code+'</text>');
    });
    g.push('<line id="pfCursor" class="pf-cursor" x1="'+PF.left+'" y1="'+PF.top+'" x2="'+PF.left+'" y2="'+(PF.h-PF.bottom)+'"/>');
    g.push('<circle id="pfDot" class="pf-cursor-dot" cx="'+PF.left+'" cy="'+py(0)+'" r="5"/>');
    $('#profileChart').innerHTML = g.join('');
    updateProfile();

    setHTML('#elevStats',
      '<div><dt>'+bi('HIGH POINT', '最高点')+'</dt><dd>'+Math.round(MAXE)+'<small>'+tr('m', '米')+'</small></dd></div>' +
      '<div><dt>'+bi('TOTAL ASCENT', '累计爬升')+'</dt><dd>'+Math.round(ASCENT)+'<small>'+tr('m', '米')+'</small></dd></div>' +
      '<div><dt>'+bi('ROUTE LENGTH', '路线长度')+'</dt><dd>'+TOTAL.toFixed(2)+'<small>'+tr('km', '公里')+'</small></dd></div>' +
      '<div><dt>'+bi('SADDLE CREST', '沙洲鞍部')+'</dt><dd>1.25<small>'+tr('m', '米')+'</small></dd></div>');
  }
  function updateProfile() {
    var s = sampleAt(state.progress), x = px(s.dist), y = py(s.elev);
    var cur = $('#pfCursor'), dot = $('#pfDot');
    if (cur) { cur.setAttribute('x1', x); cur.setAttribute('x2', x); }
    if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', y); }
  }
  var profileDragging = false;
  $('#profileChart').addEventListener('pointerdown', function (e) { profileDragging = true; $('#profileChart').setPointerCapture(e.pointerId); setFromProfile(e); });
  $('#profileChart').addEventListener('pointermove', function (e) { if (profileDragging) setFromProfile(e); });
  $('#profileChart').addEventListener('pointerup', function () { profileDragging = false; });
  $('#profileChart').addEventListener('pointercancel', function () { profileDragging = false; });
  function setFromProfile(e) {
    var svg = $('#profileChart'), r = svg.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * PF.w;
    setProgress(clamp((x-PF.left)/(PF.w-PF.left-PF.right), 0, 1));
  }

  /* ------------------------------------------------------------------ */
  /* Tombolo tide model                                                    */
  /* ------------------------------------------------------------------ */
  /* Nothing in this panel is drawn by hand. The shorelines and the outline
     of the bar are OpenStreetMap coastline ways stitched into closed rings;
     the bar section was measured by slicing that outline at one-metre
     stations, which is how the model knows the crossing narrows to three
     metres at the south end and widens to thirty where it meets the beach.
     Terrain inland of the shore blends the SRTM 90 m grid. Height is the one
     reconstructed quantity: the crest is tied to the thresholds printed on
     the pier board, and the sea floor falls away from the mapped shoreline.
     tools/build_tombolo_model.py bakes the surface into a small grid so the
     page stays a plain file that opens without a server. */
  var TM = window.TOMBOLA_MODEL || null;
  var B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  var TBG = (function () {
    var g = TM && TM.grid;
    if (!g) return { nx: 1, ny: 1, step: 2, s0: 0, o0: 0, z: new Float32Array([-3.2]) };
    var n = g.nx * g.ny, z = new Float32Array(n), src = g.data;
    for (var i = 0; i < n; i++) {
      var k = i * 3;
      z[i] = (B36.indexOf(src.charAt(k)) * 1296 +
              B36.indexOf(src.charAt(k + 1)) * 36 +
              B36.indexOf(src.charAt(k + 2))) / 40 - 4.5;
    }
    return { nx: g.nx, ny: g.ny, step: g.step, s0: g.s0, o0: g.o0, z: z };
  })();
  /* The panel is drawn in the grid's own frame: s runs along the bar, o runs
     across it, positive towards the north-west shore. Screen x is s and
     screen y is minus o, so north sits a little to the upper right and the
     bar lies flat across the panel. */
  var TB_VIEW = {
    s0: TBG.s0, o0: TBG.o0,
    s1: TBG.s0 + (TBG.nx - 1) * TBG.step,
    o1: TBG.o0 + (TBG.ny - 1) * TBG.step
  };

  function tbSample(s, o) {
    var fx = (s - TBG.s0) / TBG.step, fy = (o - TBG.o0) / TBG.step;
    fx = fx < 0 ? 0 : (fx > TBG.nx - 1.001 ? TBG.nx - 1.001 : fx);
    fy = fy < 0 ? 0 : (fy > TBG.ny - 1.001 ? TBG.ny - 1.001 : fy);
    var i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    var z = TBG.z, r0 = j * TBG.nx + i, r1 = r0 + TBG.nx;
    return (z[r0] * (1 - tx) + z[r0 + 1] * tx) * (1 - ty) +
           (z[r1] * (1 - tx) + z[r1 + 1] * tx) * ty;
  }

  var tbC = $('#tideModel'), tbCtx = tbC.getContext('2d');
  var tbW = 0, tbH = 0, tbDpr = 1;
  var TBK = 1, TBOX = 0, TBOY = 0;

  function tbFit() {
    var w = TB_VIEW.s1 - TB_VIEW.s0, h = TB_VIEW.o1 - TB_VIEW.o0;
    TBK = Math.min(tbW / w, tbH / h);
    TBOX = (tbW - w * TBK) / 2;
    TBOY = (tbH - h * TBK) / 2;
  }
  function tbProj(s, o) {
    return { x: TBOX + (s - TB_VIEW.s0) * TBK, y: TBOY + (TB_VIEW.o1 - o) * TBK };
  }
  function tbUnproj(x, y) {
    return { s: TB_VIEW.s0 + (x - TBOX) / TBK, o: TB_VIEW.o1 - (y - TBOY) / TBK };
  }

  /* ---- marching squares over the baked grid --------------------------- */

  /* Returns loose segments in the grid frame. Filling is done per pixel, so
     the segments are only ever stroked: an open chain along the edge of the
     frame is fine and never needs closing with a chord. */
  function tbMarch(level, out) {
    var nx = TBG.nx, ny = TBG.ny, st = TBG.step, z = TBG.z;
    var s0 = TBG.s0, o0 = TBG.o0;
    out = out || [];
    for (var j = 0; j < ny - 1; j++) {
      var oa = o0 + j * st, ob = oa + st, r0 = j * nx, r1 = r0 + nx;
      for (var i = 0; i < nx - 1; i++) {
        var za = z[r0 + i], zb = z[r0 + i + 1], zc = z[r1 + i + 1], zd = z[r1 + i];
        var idx = (za > level ? 1 : 0) | (zb > level ? 2 : 0) |
                  (zc > level ? 4 : 0) | (zd > level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var sa = s0 + i * st, sb = sa + st;
        var T = [sa + st * (level - za) / (zb - za), oa];
        var R = [sb, oa + st * (level - zb) / (zc - zb)];
        var B = [sa + st * (level - zd) / (zc - zd), ob];
        var L = [sa, oa + st * (level - za) / (zd - za)];
        switch (idx) {
          case 1: case 14: out.push([L, T]); break;
          case 2: case 13: out.push([T, R]); break;
          case 3: case 12: out.push([L, R]); break;
          case 4: case 11: out.push([R, B]); break;
          case 6: case 9: out.push([T, B]); break;
          case 7: case 8: out.push([L, B]); break;
          case 5: out.push([L, T], [R, B]); break;
          case 10: out.push([T, R], [L, B]); break;
        }
      }
    }
    return out;
  }

  function tbStroke(ctx, segs, close) {
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var a = tbProj(segs[i][0][0], segs[i][0][1]);
      var b = tbProj(segs[i][1][0], segs[i][1][1]);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function tbPoly(ctx, pts, close) {
    if (!pts || !pts.length) return;
    var p = tbProj(pts[0][0], pts[0][1]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    for (var i = 1; i < pts.length; i++) {
      p = tbProj(pts[i][0], pts[i][1]); ctx.lineTo(p.x, p.y);
    }
    if (close !== false) ctx.closePath();
  }

  /* ---- static relief --------------------------------------------------- */

  var tbBase = document.createElement('canvas');
  var tbBac = tbBase.getContext('2d');
  var tbWash = document.createElement('canvas');
  var tbWac = tbWash.getContext('2d');
  var tbWashImg = null;
  var tbZ = null;            /* height at every screen pixel, CSS resolution */
  var tbContours = [];
  var tbThreshold = [];

  function mixc(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  /* Dry ground, from wet sand through gravel and scrub to the low hills. */
  function landTone(h) {
    if (h < 1.05) return mixc([180, 171, 146], [190, 180, 152], (h - .95) / .1);
    if (h < 1.5) return mixc([190, 180, 152], [200, 192, 163], (h - 1.05) / .45);
    if (h < 2.4) return mixc([200, 192, 163], [192, 190, 160], (h - 1.5) / .9);
    if (h < 4.5) return mixc([192, 190, 160], [172, 184, 148], (h - 2.4) / 2.1);
    if (h < 8) return mixc([172, 184, 148], [148, 172, 134], (h - 4.5) / 3.5);
    if (h < 14) return mixc([148, 172, 134], [128, 156, 122], (h - 8) / 6);
    return mixc([128, 156, 122], [142, 164, 130], clamp((h - 14) / 8, 0, 1));
  }
  /* Sea floor, so the shallows read as a shelf rather than one flat blue. */
  function bedTone(d) {
    if (d < .5) return mixc([158, 186, 190], [132, 172, 182], d / .5);
    if (d < 1.3) return mixc([132, 172, 182], [100, 148, 170], (d - .5) / .8);
    return mixc([100, 148, 170], [66, 112, 142], clamp((d - 1.3) / 2, 0, 1));
  }

  function renderRelief() {
    var W = Math.max(1, Math.round(tbW)), H = Math.max(1, Math.round(tbH));
    var dpr = tbDpr;
    tbBase.width = Math.round(W * dpr); tbBase.height = Math.round(H * dpr);
    tbBac.setTransform(dpr, 0, 0, dpr, 0, 0);

    tbZ = new Float32Array(W * H);
    var px, py;
    for (py = 0; py < H; py++) {
      for (px = 0; px < W; px++) {
        var w = tbUnproj(px + .5, py + .5);
        tbZ[py * W + px] = tbSample(w.s, w.o);
      }
    }

    /* Three passes of a 1 2 1 kernel. The stored grid carries 25 mm steps,
       which on a slope of a few centimetres per metre leave terraces about
       four pixels wide, and the hillshade turns those into stripes. This
       blur touches only the colour buffer: the waterline is still traced
       from the untouched grid. */
    for (var pass = 0; pass < 3; pass++) {
      var tmp = new Float32Array(W * H);
      for (var yy = 0; yy < H; yy++) {
        var rr = yy * W;
        tmp[rr] = (tbZ[rr] * 3 + tbZ[rr + 1]) * .25;
        for (var xx = 1; xx < W - 1; xx++) {
          tmp[rr + xx] = (tbZ[rr + xx - 1] + tbZ[rr + xx] * 2 + tbZ[rr + xx + 1]) * .25;
        }
        tmp[rr + W - 1] = (tbZ[rr + W - 1] * 3 + tbZ[rr + W - 2]) * .25;
      }
      for (var xc = 0; xc < W; xc++) {
        var c0 = (tmp[xc] * 3 + tmp[W + xc]) * .25;
        tbZ[xc] = c0;
        for (var yc = 1; yc < H - 1; yc++) {
          tbZ[yc * W + xc] = (tmp[(yc - 1) * W + xc] + tmp[yc * W + xc] * 2 +
                              tmp[(yc + 1) * W + xc]) * .25;
        }
        tbZ[(H - 1) * W + xc] = (tmp[(H - 1) * W + xc] * 3 + tmp[(H - 2) * W + xc]) * .25;
      }
    }

    var img = tbBac.createImageData(tbBase.width, tbBase.height);
    var pix = img.data, iw = tbBase.width, ih = tbBase.height;
    var mpp = 1 / TBK;                 /* metres per screen pixel */

    for (var y = 0; y < ih; y++) {
      var sy = Math.min(H - 1, (y / dpr) | 0);
      for (var x = 0; x < iw; x++) {
        var sx = Math.min(W - 1, (x / dpr) | 0);
        var i2 = sy * W + sx;
        var h = tbZ[i2];
        var col;
        if (h < .95) {
          /* Below the mapped waterline the surface is the sea bed. */
          col = bedTone(.95 - h);
          var dl = tbZ[sy * W + Math.max(0, sx - 1)];
          var dr = tbZ[sy * W + Math.min(W - 1, sx + 1)];
          var sl = (dr - dl) * .5;
          col = [col[0] * (1 + sl * .08), col[1] * (1 + sl * .08), col[2] * (1 + sl * .08)];
        } else {
          var q1 = 2 / mpp;
          var zl = tbZ[sy * W + Math.max(0, sx - 2)];
          var zr = tbZ[sy * W + Math.min(W - 1, sx + 2)];
          var zu = tbZ[Math.max(0, sy - 2) * W + sx];
          var zd = tbZ[Math.min(H - 1, sy + 2) * W + sx];
          /* Lambert shading, light from the north-west corner of the
             frame. The slope is exaggerated: at true scale a twelve metre
             hill across two hundred metres shades almost flat. */
          var gx = (zr - zl) / q1, gy = (zd - zu) / q1;
          var nxv = -gy * 4.5, nyv = gx * 4.5, nl = Math.sqrt(nxv * nxv + nyv * nyv + 1);
          var lam = (nxv * -.60 + nyv * -.56 + .57) / nl;
          var sh = clamp(.68 + lam * .86, .68, 1.14);
          col = landTone(h);
          col = [col[0] * sh, col[1] * sh, col[2] * sh];
          /* a trace of grain, so the flat beach is not a plastic sheet */
          var w2 = tbUnproj(sx + .5, sy + .5);
          var grain = Math.sin(w2.s / 5.7 + w2.o / 8.3) * .6 +
                      Math.sin(w2.s / 13.1 - w2.o / 11.3) * .4;
          var gc = 1 + grain * (h < 2 ? .045 : .022);
          col = [col[0] * gc, col[1] * gc, col[2] * gc];
        }
        var o4 = (y * iw + x) * 4;
        pix[o4] = clamp(col[0], 0, 255);
        pix[o4 + 1] = clamp(col[1], 0, 255);
        pix[o4 + 2] = clamp(col[2], 0, 255);
        pix[o4 + 3] = 255;
      }
    }
    tbBac.putImageData(img, 0, 0);

    /* The mapped beaches and the bar are filled with a light wash of their
       own, so the one surface the tide takes away is not the same colour as
       the beach it joins. */
    if (TM) {
      (TM.beaches || []).forEach(function (b) {
        tbPoly(tbBac, b.pts);
        tbBac.fillStyle = b.surface === 'sand' ? 'rgba(216,204,164,.30)' : 'rgba(184,174,148,.30)';
        tbBac.fill();
      });
      if (TM.bar) {
        tbPoly(tbBac, TM.bar.poly);
        tbBac.fillStyle = 'rgba(150,120,64,.15)';
        tbBac.fill();
      }
    }
  }

  function buildContours() {
    tbContours = [];
    [1.5, 2, 2.5, 3].forEach(function (lv) {
      var segs = tbMarch(lv, []);
      if (segs.length) tbContours.push({ level: lv, segs: segs });
    });
    tbThreshold = tbMarch(1.25, []);
  }

  function tbLayout() {
    /* A folded part has no box to measure, and the relief is expensive to
       rebuild, so the last good size is kept until the part is opened. */
    var w = tbC.clientWidth, h = tbC.clientHeight;
    if (!w || !h) return;
    tbDpr = Math.min(window.devicePixelRatio || 1, 2);
    tbW = w; tbH = h;
    tbC.width = Math.round(tbW * tbDpr); tbC.height = Math.round(tbH * tbDpr);
    tbCtx.setTransform(tbDpr, 0, 0, tbDpr, 0, 0);
    tbWash.width = Math.round(tbW); tbWash.height = Math.round(tbH);
    tbWashImg = tbWac.createImageData(Math.round(tbW), Math.round(tbH));
    tbFit();
    buildContours();
    renderRelief();
    drawTombolo();
  }

  /* ---- water ----------------------------------------------------------- */

  /* The water is painted per pixel from the same buffer the relief uses, so
     it can never disagree with the shoreline it is drawn against. */
  function paintWater(tide) {
    var W = Math.round(tbW), H = Math.round(tbH);
    var data = tbWashImg.data, z = tbZ;
    for (var i = 0, p = 0; i < W * H; i++, p += 4) {
      var depth = tide - z[i];
      if (depth <= 0) { data[p + 3] = 0; continue; }
      var t = clamp(depth / 1.9, 0, 1);
      var a = 0.30 + 0.28 * Math.sqrt(t);
      data[p] = 108 + (44 - 108) * t;
      data[p + 1] = 168 + (92 - 168) * t;
      data[p + 2] = 198 + (126 - 198) * t;
      data[p + 3] = Math.round(a * 255);
    }
    tbWac.putImageData(tbWashImg, 0, 0);
  }

  function drawTombolo() {
    if (!tbW || !tbH) { tbLayout(); return; }
    var tide = state.tide;
    tbCtx.clearRect(0, 0, tbW, tbH);
    tbCtx.drawImage(tbBase, 0, 0, tbW, tbH);

    paintWater(tide);
    tbCtx.drawImage(tbWash, 0, 0, tbW, tbH);

    /* contours, over both the dry ground and the flooded ground */
    tbCtx.lineJoin = 'round'; tbCtx.lineCap = 'butt';
    tbCtx.strokeStyle = 'rgba(86,70,42,.24)'; tbCtx.lineWidth = .7;
    for (var i = 0; i < tbContours.length; i++) {
      var c = tbContours[i];
      tbCtx.lineWidth = c.level >= 4 ? 1 : .8;
      tbStroke(tbCtx, c.segs);
    }

    /* the tideline for this hour */
    var live = tbMarch(tide, []);
    tbCtx.strokeStyle = 'rgba(16,52,68,.72)'; tbCtx.lineWidth = 1.5;
    tbStroke(tbCtx, live);

    /* the posted limit, drawn apart from the rest */
    tbCtx.save();
    tbCtx.strokeStyle = 'rgba(176,74,48,.85)'; tbCtx.lineWidth = 1.2;
    tbCtx.setLineDash([5, 4]);
    tbStroke(tbCtx, tbThreshold);
    tbCtx.restore();

    /* the mapped outline of the bar, so its extent is legible even when the
       whole ridge is under water */
    if (TM && TM.bar) {
      tbCtx.strokeStyle = 'rgba(120,92,40,.52)'; tbCtx.lineWidth = 1;
      tbCtx.setLineDash([3, 3]);
      tbPoly(tbCtx, TM.bar.poly); tbCtx.stroke();
      tbCtx.setLineDash([]);
    }

    tbLabels();
    tbCompass();
    tbScaleBar();
  }

  function tbLabels() {
    var labels = [
      { s: 286, o: 70, en: 'SHARP ISLAND', zh: '桥咀洲', big: true },
      { s: -86, o: 24, en: 'KIU TAU CHAU', zh: '桥头岛', big: true },
      { s: 130, o: 32, en: 'TOMBOLO', zh: '连岛沙洲', big: false }
    ];
    /* Type has to follow the panel, not the page: at phone width the canvas
       is under two hundred pixels tall and an eleven pixel label outweighs
       the bar it is naming. */
    var room = tbH >= 330;
    var fs = room ? 11 : 8.5;
    var sub2 = tbH >= 250;
    tbCtx.textAlign = 'center'; tbCtx.lineJoin = 'round';
    labels.forEach(function (L) {
      var p = tbProj(L.s, L.o);
      tbCtx.font = '600 ' + (L.big ? fs : fs - 1) + 'px -apple-system, "PingFang SC", sans-serif';
      var main = tr(L.en, L.zh), sub = tr(L.zh, L.en);
      tbCtx.lineWidth = room ? 4 : 3; tbCtx.strokeStyle = 'rgba(255,255,255,.86)';
      tbCtx.strokeText(main, p.x, p.y);
      tbCtx.fillStyle = '#1d1d1f'; tbCtx.fillText(main, p.x, p.y);
      if (!sub2) return;
      tbCtx.font = '400 ' + (fs - 1) + 'px -apple-system, "PingFang SC", sans-serif';
      tbCtx.lineWidth = room ? 3.4 : 2.6;
      tbCtx.strokeText(sub, p.x, p.y + (room ? 12 : 10));
      tbCtx.fillStyle = '#48484a'; tbCtx.fillText(sub, p.x, p.y + (room ? 12 : 10));
    });
  }

  /* The panel is turned so the bar lies flat, which leaves north pointing up
     and to the right by the bar's own bearing. */
  function tbCompass() {
    if (tbW < 520) return;
    var bearing = TM && TM.axis ? TM.axis.bearing : 26;
    var a = bearing * Math.PI / 180;
    var cx = tbW - 34, cy = tbH - 40, r = 12;
    tbCtx.save();
    tbCtx.translate(cx, cy);
    tbCtx.rotate(-a);
    tbCtx.beginPath();
    tbCtx.moveTo(0, -r); tbCtx.lineTo(4.6, r * .55); tbCtx.lineTo(0, r * .2); tbCtx.lineTo(-4.6, r * .55);
    tbCtx.closePath();
    tbCtx.fillStyle = 'rgba(29,29,31,.66)'; tbCtx.fill();
    tbCtx.restore();
    tbCtx.font = '700 9px -apple-system, sans-serif';
    tbCtx.textAlign = 'center'; tbCtx.fillStyle = 'rgba(29,29,31,.58)';
    tbCtx.fillText('N', cx + Math.sin(a) * 19, cy - Math.cos(a) * 19 + 3);
  }

  /* A plain metre bar, so the panel reports its own scale. */
  function tbScaleBar() {
    var len = tbW < 520 ? 25 : 50, px = len * TBK, x = 16, y = tbH - 16;
    tbCtx.save();
    tbCtx.strokeStyle = 'rgba(29,29,31,.55)'; tbCtx.lineWidth = 1.4;
    tbCtx.beginPath();
    tbCtx.moveTo(x, y - 4); tbCtx.lineTo(x, y); tbCtx.lineTo(x + px, y); tbCtx.lineTo(x + px, y - 4);
    tbCtx.moveTo(x + px / 2, y); tbCtx.lineTo(x + px / 2, y - 2.4);
    tbCtx.stroke();
    tbCtx.font = '600 9px -apple-system, sans-serif';
    tbCtx.textAlign = 'left'; tbCtx.fillStyle = 'rgba(29,29,31,.52)';
    tbCtx.fillText(len + ' M', x + px + 7, y + 1);
    tbCtx.restore();
  }

  /* ---- cross section across the bar, at the lowest crest --------------- */
  var SX = { w: 640, h: 220, l: 52, r: 20, t: 30, b: 46, min: -2.2, max: 2.1 };
  /* The saddle is the station the water crosses first, so the section is cut
     there: it is the profile a walker actually has to get over. */
  var SX_S = TM && TM.bar && TM.bar.saddle ? TM.bar.saddle.s : 136;
  var SX_O0 = -46, SX_O1 = 46;
  function sxX(o) { return SX.l + ((o - SX_O0) / (SX_O1 - SX_O0)) * (SX.w - SX.l - SX.r); }
  function sxY(z) { return SX.t + (SX.max - z) / (SX.max - SX.min) * (SX.h - SX.t - SX.b); }
  function crossProfile(o) { return tbSample(SX_S, o); }

  function buildSection() {
    var g = [], step = .5, pts = [];
    for (var o = SX_O0; o <= SX_O1 + .01; o += step) pts.push([o, crossProfile(o)]);
    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + sxX(p[0]).toFixed(1) + ' ' + sxY(p[1]).toFixed(1);
    }).join(' ');
    var land = line + ' L ' + sxX(SX_O1).toFixed(1) + ' ' + (SX.h - SX.b) +
               ' L ' + sxX(SX_O0).toFixed(1) + ' ' + (SX.h - SX.b) + ' Z';

    /* where the crest actually sits on this profile */
    var best = pts[0];
    pts.forEach(function (p) { if (p[1] > best[1]) best = p; });

    g.push('<path class="sx-land" d="' + land + '"/>');
    [-2, -1, 0, 1, 2].forEach(function (v) {
      g.push('<line class="sx-grid" x1="' + SX.l + '" y1="' + sxY(v) + '" x2="' + (SX.w - SX.r) + '" y2="' + sxY(v) + '"/>');
      g.push('<text class="sx-axis" x="' + (SX.l - 7) + '" y="' + (sxY(v) + 3) + '" text-anchor="end">' + v + '</text>');
    });
    g.push('<line class="sx-zero" x1="' + SX.l + '" y1="' + sxY(0) + '" x2="' + (SX.w - SX.r) + '" y2="' + sxY(0) + '"/>');
    g.push('<line class="sx-thresh" x1="' + SX.l + '" y1="' + sxY(1.25) + '" x2="' + (SX.w - SX.r) + '" y2="' + sxY(1.25) + '"/>');
    g.push('<path id="sxWater" class="sx-water" d=""/>');
    g.push('<path class="sx-line" d="' + line + '"/>');
    g.push('<line id="sxLevel" class="sx-level" x1="' + SX.l + '" y1="' + sxY(state.tide) + '" x2="' + (SX.w - SX.r) + '" y2="' + sxY(state.tide) + '"/>');
    g.push('<text id="sxLevelLabel" class="sx-level-label" x="' + (SX.w - SX.r) + '" y="' + (sxY(state.tide) - 7) + '" text-anchor="end">' + state.tide.toFixed(2) + ' M</text>');
    g.push('<text class="sx-thresh-label" x="' + SX.l + '" y="' + (sxY(1.25) - 7) + '">' + tr('1.25 M POSTED LIMIT', '1.25 米告示上限') + '</text>');
    g.push('<text class="sx-crest" x="' + sxX(best[0]).toFixed(1) + '" y="' + (sxY(best[1]) - 10) + '" text-anchor="middle">' + tr('CREST ' + best[1].toFixed(2) + ' M', '沙脊 ' + best[1].toFixed(2) + ' 米') + '</text>');
    g.push('<text class="sx-end" x="' + SX.l + '" y="' + (SX.h - 16) + '">' + tr('SEA', '海面') + '</text>');
    g.push('<text class="sx-end" x="' + (SX.w - SX.r) + '" y="' + (SX.h - 16) + '" text-anchor="end">' + tr('SEA', '海面') + '</text>');
    g.push('<text class="sx-axis" x="' + ((SX.l + SX.w - SX.r) / 2) + '" y="' + (SX.h - 4) + '" text-anchor="middle">' + tr((SX_O1 - SX_O0) + ' M ACROSS THE CHANNEL', (SX_O1 - SX_O0) + ' 米水道宽') + '</text>');
    $('#tideSection').innerHTML = g.join('');
  }

  function updateSection() {
    var tide = state.tide, step = .5;
    var runs = [], open = null;
    for (var o = SX_O0; o <= SX_O1 + .01; o += step) {
      if (crossProfile(o) < tide) { if (!open) open = [o, o]; else open[1] = o; }
      else if (open) { runs.push(open); open = null; }
    }
    if (open) runs.push(open);
    var out = [];
    runs.forEach(function (r) {
      var d = 'M ' + sxX(r[0]).toFixed(1) + ' ' + sxY(tide).toFixed(1);
      for (var o2 = r[0]; o2 <= r[1] + .01; o2 += step) {
        d += ' L ' + sxX(o2).toFixed(1) + ' ' + sxY(crossProfile(o2)).toFixed(1);
      }
      d += ' L ' + sxX(r[1]).toFixed(1) + ' ' + sxY(tide).toFixed(1) + ' Z';
      out.push(d);
    });
    var w = $('#sxWater'); if (w) w.setAttribute('d', out.join(' '));
    var lv = $('#sxLevel');
    if (lv) { lv.setAttribute('y1', sxY(tide)); lv.setAttribute('y2', sxY(tide)); }
    var lb = $('#sxLevelLabel');
    if (lb) { lb.setAttribute('y', sxY(tide) - 7); lb.textContent = tide.toFixed(2) + ' M'; }
  }
  var TIDE_STATES = [
    { max: 1.15, en: 'WALKABLE', zh: '沙洲可通行' },
    { max: 1.35, en: 'MARGINAL, DO NOT CROSS', zh: '临界，不宜通过' },
    { max: 99, en: 'SUBMERGED', zh: '没入水中' }
  ];
  function setTide(v, silent) {
    state.tide = clamp(v, 0, 2.6);
    var st = TIDE_STATES.filter(function (s) { return state.tide <= s.max; })[0] || TIDE_STATES[2];
    var lv = $('#tmLevel'); if (lv) lv.textContent = state.tide.toFixed(2);
    var se = $('#tmState');
    if (se) {
      setHTML(se, bi(st.en, st.zh));
      se.className = 'tm-state ' + (state.tide > 1.35 ? 'is-sub' : (state.tide > 1.15 ? 'is-marg' : 'is-walk'));
    }
    if (!silent) { var sl = $('#tideSlider'); if (sl) sl.value = Math.round(state.tide * 100); }
    drawTombolo();
    updateSection();
  }
  var tideTimer = null, tideLast = 0;
  function toggleTide() {
    state.tidePlaying = !state.tidePlaying;
    var b = $('#tidePlay');
    setHTML(b, state.tidePlaying ? bi('PAUSE', '暂停') : bi('RUN THE TIDE', '推演潮汐'));
    if (state.tidePlaying) {
      state.tideT = Math.asin(clamp((state.tide - 1.4) / 1.05, -1, 1));
      tideLast = 0;
      tideTimer = requestAnimationFrame(tideStep);
    } else cancelAnimationFrame(tideTimer);
  }
  function tideStep(ts) {
    if (!state.tidePlaying) return;
    if (!tideLast) tideLast = ts;
    var dt = Math.min(60, ts - tideLast);
    tideLast = ts;
    state.tideT += dt / 620;
    setTide(1.4 + 1.05 * Math.sin(state.tideT));
    tideTimer = requestAnimationFrame(tideStep);
  }

  /* ------------------------------------------------------------------ */
  /* Solar model                                                          */
  /* ------------------------------------------------------------------ */
  /* A three dimensional model of the island. The surface is the elevation
     grid, the canopy is the mapped woodland, and the sun is placed with the
     same position algorithm the model was built with, so the shadows drawn
     on the canvas are the ones the field record was made under. */
  var SM = window.SUN_MODEL || null;
  var SUN = { ready: false, cells: [], t: 767, playing: false };
  var SB36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  var SM_LAT0 = 22.3652, SM_LON0 = 114.2872;
  var SM_MLAT = 110574.0;
  var SM_MLON = 111320.0 * Math.cos(SM_LAT0 * Math.PI / 180);
  var SM_YAW = -0.36, SM_PITCH = 0.62, SM_EXAG = 3.8;
  var smCtx = null, smCanvas = null, smW = 0, smH = 0, smScale = 1, smOx = 0, smOy = 0;
  var smOff = null, smOffCtx = null, smBlur = 0.55;
  var smCache = { t: -999, vals: null };
  var smLevels = [10, 20, 30, 40, 50, 60, 70, 80];
  /* the relief is lit by a fixed cartographic light from the north west, the
     way a printed map is lit, so the ground reads at every hour. The sun of
     the day is drawn as the shadow it casts, which is the point of the panel. */
  var HS_AZ = 315 * Math.PI / 180, HS_ALT = 42 * Math.PI / 180;
  var HSX = Math.cos(HS_ALT) * Math.sin(HS_AZ);
  var HSY = Math.cos(HS_ALT) * Math.cos(HS_AZ);
  var HSZ = Math.sin(HS_ALT);

  function smLocal(lat, lon) {
    return [(lon - SM_LON0) * SM_MLON, (lat - SM_LAT0) * SM_MLAT];
  }
  function smDecode() {
    if (!SM) return null;
    var g = SM.grid, nx = g.nx, ny = g.ny, n = nx * ny;
    var z = new Float32Array(n), cover = new Float32Array(n), crown = new Float32Array(n);
    var land = new Uint8Array(n);
    var table = g.canopyTable || [];
    var zi = 0, ci = 0;
    for (var i = 0; i < n; i++) {
      z[i] = (SB36.indexOf(g.z.charAt(zi)) * 36 + SB36.indexOf(g.z.charAt(zi + 1))) / 4 - 5;
      zi += 2;
      /* the canopy is stored as a class number, and the table beside it says
         what cover and crown height the class stands for */
      var cls = SB36.indexOf(g.canopy.charAt(ci));
      var row = table[cls] || [0, 0];
      cover[i] = row[0]; crown[i] = row[1];
      ci += 1;
    }
    var stride = Math.ceil(nx / 4);
    for (var j = 0; j < ny; j++) {
      var row = g.land.substr(j * stride, stride);
      for (var i2 = 0; i2 < nx; i2++) {
        /* the row is written as one wide hex number, so the first cell sits
           in its last digit */
        var dig = parseInt(row.charAt(stride - 1 - Math.floor(i2 / 4)), 16);
        if (isNaN(dig)) dig = 0;
        land[j * nx + i2] = (dig >> (i2 % 4)) & 1;
      }
    }
    SUN.nx = nx; SUN.ny = ny; SUN.step = g.step; SUN.x0 = g.x0; SUN.y0 = g.y0;
    SUN.z = z; SUN.cover = cover; SUN.crown = crown; SUN.land = land;
    /* the drawn sheet: the island, the mapped canopy, and a one cell apron of
       shore, so the coast does not end in a vertical wall */
    var draw = new Uint8Array(n);
    for (var j3 = 0; j3 < ny; j3++) {
      for (var i3 = 0; i3 < nx; i3++) {
        var k3 = j3 * nx + i3;
        if (land[k3] || cover[k3] > 0) { draw[k3] = 1; continue; }
        for (var dj = -1; dj <= 1 && !draw[k3]; dj++) {
          for (var di = -1; di <= 1; di++) {
            var jj = j3 + dj, ii = i3 + di;
            if (jj < 0 || ii < 0 || jj >= ny || ii >= nx) continue;
            if (land[jj * nx + ii]) { draw[k3] = 1; break; }
          }
        }
      }
    }
    SUN.draw = draw;
    return SUN;
  }
  function smCellIndex(x, y) {
    var i = Math.floor((x - SUN.x0) / SUN.step);
    var j = Math.floor((SUN.y0 + SUN.ny * SUN.step - y) / SUN.step);
    return { i: i, j: j };
  }
  function smHeight(x, y) {
    var nx = SUN.nx, ny = SUN.ny;
    var fx = (x - SUN.x0) / SUN.step - 0.5;
    var fy = (SUN.y0 + ny * SUN.step - y) / SUN.step - 0.5;
    if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return 0;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1);
    var tx = fx - x0, ty = fy - y0, z = SUN.z;
    return z[y0 * nx + x0] * (1 - tx) * (1 - ty) + z[y0 * nx + x1] * tx * (1 - ty) +
           z[y1 * nx + x0] * (1 - tx) * ty + z[y1 * nx + x1] * tx * ty;
  }
  function smCanopyAt(x, y) {
    var c = smCellIndex(x, y);
    if (c.i < 0 || c.j < 0 || c.i >= SUN.nx || c.j >= SUN.ny) return null;
    var k = c.j * SUN.nx + c.i;
    return { cover: SUN.cover[k], crown: SUN.crown[k] };
  }
  /* The share of the sun that reaches a point. The ray towards the sun is
     marched outwards; while it is still inside the canopy layer it picks up
     optical depth, and a ridge in the way ends the march at once. */
  function smSunShare(x, y, z0, az, alt) {
    var a = az * Math.PI / 180, e = alt * Math.PI / 180;
    var ex = Math.cos(e) * Math.sin(a), nyv = Math.cos(e) * Math.cos(a), up = Math.sin(e);
    var horiz = Math.hypot(ex, nyv);
    if (horiz < 1e-6 || up <= 0) return 0;
    var tanAlt = up / horiz, tau = 0, step = 1.5, t = step * 0.5;
    var R = SM.meta.crownRadius;
    while (t <= 90) {
      var px = x + ex * t, py = y + nyv * t;
      var zt = smHeight(px, py);
      var zr = z0 + t * tanAlt;
      if (zt > zr) return 0;
      var cv = smCanopyAt(px, py);
      if (cv && cv.cover > 0 && cv.crown > 0) {
        var d0 = (zr - step * 0.5 * tanAlt) - zt;
        var d1 = (zr + step * 0.5 * tanAlt) - zt;
        if (d1 > d0) {
          var frac = clamp((cv.crown - d0) / (d1 - d0), 0, 1);
          tau += cv.cover * 2 * step * frac / (Math.PI * R);
        }
      }
      t += step;
    }
    return Math.exp(-tau);
  }
  function smSunAt(t) {
    var tr = SM.sun, i = 0;
    while (i < tr.length - 2 && tr[i + 1].t < t) i++;
    var a = tr[i], b = tr[i + 1];
    var f = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
    return { az: a.az + (b.az - a.az) * f, alt: a.alt + (b.alt - a.alt) * f };
  }
  function smHash(i, j) {
    /* a plain integer hash, so the dapple under the trees is noise and not a
       weave, which is what the sine of a linear combination gives */
    var n = ((i | 0) * 73856093) ^ ((j | 0) * 19349663);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function smTone(h) {
    if (h < 2) return [236, 226, 198];
    if (h < 12) return [221, 222, 176];
    if (h < 30) return [199, 214, 165];
    if (h < 50) return [172, 196, 154];
    if (h < 68) return [146, 176, 142];
    if (h < 82) return [164, 163, 137];
    return [178, 172, 151];
  }
  function smProject(x, y, z) {
    var cy = Math.cos(SM_YAW), sy = Math.sin(SM_YAW);
    var u = x * cy + y * sy;
    var v = -x * sy + y * cy;
    return [smOx + u * smScale, smOy + (-v * Math.sin(SM_PITCH) - z * SM_EXAG * Math.cos(SM_PITCH)) * smScale];
  }
  function smDepth(x, y) {
    var cy = Math.cos(SM_YAW), sy = Math.sin(SM_YAW);
    return -x * sy + y * cy;
  }

  function smLayout() {
    if (!SM || !SUN.z) return;
    smCanvas = $('#sunCanvas');
    if (!smCanvas) return;
    var host = smCanvas.parentNode;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = host.clientWidth;
    /* A folded section has no width to measure, and a canvas with nothing in
       it cannot be drawn into, so the last good size is kept until the part
       is opened again. */
    if (!w) return;
    smW = w;
    var pad = smW < 640 ? 18 : 40;
    smH = Math.round(smW * (smW < 640 ? 0.85 : 0.44));
    smCanvas.width = Math.round(smW * dpr);
    smCanvas.height = Math.round(smH * dpr);
    smCanvas.style.height = smH + 'px';
    smCtx = smCanvas.getContext('2d');
    smCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* the ground is drawn on its own layer, so it can be softened before it
       is laid back over the sea */
    if (!smOff) smOff = document.createElement('canvas');
    smOff.width = smW;
    smOff.height = smH;
    smOffCtx = smOff.getContext('2d');

    /* fit the island into the frame. The fit works in unscaled units, so the
       transform is reset first: the layout runs again whenever the box moves. */
    smScale = 1; smOx = 0; smOy = 0;
    var xs = [], ys = [];
    for (var j = 0; j < SUN.ny; j++) {
      for (var i = 0; i < SUN.nx; i++) {
        var k = j * SUN.nx + i;
        if (!SUN.draw[k]) continue;
        var x = SUN.x0 + (i + 0.5) * SUN.step;
        var y = SUN.y0 + SUN.ny * SUN.step - (j + 0.5) * SUN.step;
        var p = smProject(x, y, SUN.z[k]);
        xs.push(p[0]); ys.push(p[1]);
      }
    }
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    smScale = Math.min((smW - pad) / Math.max(1, maxX - minX), (smH - pad) / Math.max(1, maxY - minY));
    smOx = pad / 2 - minX * smScale + ((smW - pad) - (maxX - minX) * smScale) / 2;
    smOy = pad / 2 - minY * smScale + ((smH - pad) - (maxY - minY) * smScale) / 2;

    /* the cells to draw, far to near */
    var list = [];
    for (var j2 = 0; j2 < SUN.ny; j2++) {
      for (var i2 = 0; i2 < SUN.nx; i2++) {
        var k2 = j2 * SUN.nx + i2;
        if (!SUN.draw[k2]) continue;
        var x2 = SUN.x0 + (i2 + 0.5) * SUN.step;
        var y2 = SUN.y0 + SUN.ny * SUN.step - (j2 + 0.5) * SUN.step;
        var h = SUN.step * 0.5;
        /* every corner carries its own height, so the cells join into one
           continuous surface instead of a heap of flat plates */
        var z00 = smHeight(x2 - h, y2 + h), z10 = smHeight(x2 + h, y2 + h);
        var z11 = smHeight(x2 + h, y2 - h), z01 = smHeight(x2 - h, y2 - h);
        var c0 = smProject(x2 - h, y2 + h, z00);
        var c1 = smProject(x2 + h, y2 + h, z10);
        var c2 = smProject(x2 + h, y2 - h, z11);
        var c3 = smProject(x2 - h, y2 - h, z01);
        var cp = [c0, c1, c2, c3];
        /* the corners are pushed a fraction of a pixel outwards on the
           canvas, so that two cells sharing an edge overlap instead of
           leaving a hairline of sea between them */
        var ccx = (c0[0] + c1[0] + c2[0] + c3[0]) * 0.25;
        var ccy = (c0[1] + c1[1] + c2[1] + c3[1]) * 0.25;
        for (var cq = 0; cq < 4; cq++) {
          var cdx = cp[cq][0] - ccx, cdy = cp[cq][1] - ccy;
          var cl = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
          cp[cq] = [cp[cq][0] + cdx / cl * 0.3, cp[cq][1] + cdy / cl * 0.3];
        }
        /* the normal, from the neighbouring heights */
        var hx = smHeight(x2 + SUN.step, y2) - smHeight(x2 - SUN.step, y2);
        var hy = smHeight(x2, y2 + SUN.step) - smHeight(x2, y2 - SUN.step);
        var nl = Math.hypot(hx / (2 * SUN.step), hy / (2 * SUN.step), 1);
        /* the lines of equal height, cut across the cell by marching squares.
           The line crosses the cell between two of its edges, and those two
           points have to be joined, or the contour comes out in pieces. */
        var seg = [], zc = [z00, z10, z11, z01];
        for (var li = 0; li < smLevels.length; li++) {
          var L = smLevels[li];
          var cross = [];
          for (var e = 0; e < 4; e++) {
            var ea = e, eb = (e + 1) % 4, za = zc[ea], zb = zc[eb];
            if ((za - L) * (zb - L) < 0) {
              var tf = (L - za) / (zb - za);
              var pa = cp[ea], pb = cp[eb];
              cross.push([pa[0] + (pb[0] - pa[0]) * tf, pa[1] + (pb[1] - pa[1]) * tf]);
            }
          }
          if (cross.length === 2) {
            seg.push([cross[0][0], cross[0][1], cross[1][0], cross[1][1], L]);
          } else if (cross.length === 4) {
            /* the saddle, where two lines cross the same cell */
            var up = SUN.z[k2] > L;
            var a0 = up ? 0 : 0, a1 = up ? 1 : 3, b0 = up ? 2 : 1, b1 = up ? 3 : 2;
            seg.push([cross[a0][0], cross[a0][1], cross[a1][0], cross[a1][1], L]);
            seg.push([cross[b0][0], cross[b0][1], cross[b1][0], cross[b1][1], L]);
          }
        }
        list.push({
          i: i2, j: j2, x: x2, y: y2, z: SUN.z[k2],
          p: cp, d: smDepth(x2, y2),
          nx: -hx / (2 * SUN.step) / nl, ny: -hy / (2 * SUN.step) / nl, nz: 1 / nl,
          cover: SUN.cover[k2], tone: smTone(SUN.z[k2]), seg: seg
        });
      }
    }
    list.sort(function (a, b) { return b.d - a.d; });
    SUN.cells = list;
    /* where the island actually sits on the canvas, so the compass can step
       out of the way of it */
    var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (var bi = 0; bi < list.length; bi++) {
      for (var bj = 0; bj < 4; bj++) {
        var bp = list[bi].p[bj];
        if (bp[0] < bx0) bx0 = bp[0];
        if (bp[0] > bx1) bx1 = bp[0];
        if (bp[1] < by0) by0 = bp[1];
        if (bp[1] > by1) by1 = bp[1];
      }
    }
    SUN.bbox = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    /* the contour lines are kept apart from the cells, because a cell drawn
       later would otherwise wipe out the line its neighbour carried */
    var contours = [];
    for (var ci = 0; ci < list.length; ci++) {
      var cl = list[ci];
      for (var cs = 0; cs < cl.seg.length; cs++) {
        var sg = cl.seg[cs];
        contours.push({ a: [sg[0], sg[1]], b: [sg[2], sg[3]], L: sg[4], d: cl.d });
      }
    }
    contours.sort(function (a, b) { return b.d - a.d; });
    SUN.contours = contours;
    SUN.ready = true;
    smCache.t = -999;
    smRender();
  }

  /* The share of the sun reaching one observation point at one hour, read
     from the same table the model was built from: eleven samples along the
     twenty metres, at thirty four times of the day. */
  function smPointShare(idx, t) {
    var p = SM.points[idx], tr = SM.sun, n = tr.length;
    if (!p.share || !p.share.length) return 1;
    var i = 0;
    while (i < n - 2 && tr[i + 1].t < t) i++;
    var a = tr[i], b = tr[i + 1];
    var f = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
    var samples = (SM.segments && SM.segments[idx]) ? SM.segments[idx].length : 1;
    var sum = 0;
    for (var k = 0; k < samples; k++) {
      var v0 = p.share[k * n + i], v1 = p.share[k * n + i + 1];
      if (v0 === undefined || v1 === undefined) return 1;
      sum += v0 + (v1 - v0) * f;
    }
    return sum / samples;
  }

  /* One sweep of the sun over the island, kept for the minute it was
     computed in, so the slider and the play button stay quick. */
  function smShareField(az, alt) {
    var key = Math.round(SUN.t);
    if (smCache.t === key && smCache.vals) return smCache.vals;
    var vals = new Float32Array(SUN.cells.length);
    for (var i = 0; i < SUN.cells.length; i++) {
      var c = SUN.cells[i];
      vals[i] = smSunShare(c.x, c.y, c.z + SM.meta.walkHeight, az, alt);
    }
    smCache.t = key; smCache.vals = vals;
    return vals;
  }

  function smRender() {
    if (!SUN.ready || !smCtx || !smW || !smH) return;
    var s = smSunAt(SUN.t);
    var ctx = smCtx;
    ctx.clearRect(0, 0, smW, smH);
    var sea = ctx.createLinearGradient(0, 0, smW * 0.55, smH);
    sea.addColorStop(0, '#d5e4ea');
    sea.addColorStop(1, '#a3c0cd');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, smW, smH);

    /* The ground is drawn on its own layer and then laid back over the sea
       with a touch of blur. The cells are seven and a half metres across, and
       the blur takes the last of the stair off the shoreline and the canopy
       edge, so the island reads as a surface rather than as a mosaic. */
    var octx = smOffCtx;
    octx.clearRect(0, 0, smW, smH);
    var cells = SUN.cells;
    var share = smShareField(s.az, s.alt);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var shade = 1 - share[i];
      if (shade > 0.001 && shade < 0.999) {
        /* partial cover breaks into separate crowns */
        var n = smHash(c.i, c.j) - 0.5;
        shade = clamp(shade + n * 1.25 * Math.min(shade, 1 - shade) * 2, 0, 1);
      }
      /* the ground is lit by the fixed hillshade light */
      var lam = Math.max(0, c.nx * HSX + c.ny * HSY + c.nz * HSZ);
      var light = (0.44 + 0.80 * lam) * (0.82 + 0.18 * c.nz);
      var t = c.tone, cov = c.cover;
      var r = t[0] * light, g = t[1] * light, b = t[2] * light;
      if (cov > 0.01) {
        /* the canopy is its own colour, an olive green of its own */
        var m2 = Math.min(1, cov) * 0.80;
        r = r * (1 - m2) + 84 * m2;
        g = g * (1 - m2) + 104 * m2;
        b = b * (1 - m2) + 62 * m2;
      }
      /* and then the sun of the hour falls on it. The shade is washed in as a
         cold blue, the way a solar survey draws it, so it separates from the
         olive of the canopy and from the sand of the shore. */
      if (shade > 0.004) {
        var m = shade * 0.82;
        r = r * (1 - m) + 56 * m;
        g = g * (1 - m) + 76 * m;
        b = b * (1 - m) + 116 * m;
      } else {
        r *= 1.05; g *= 1.02; b *= 0.985;
      }
      octx.beginPath();
      octx.moveTo(c.p[0][0], c.p[0][1]);
      octx.lineTo(c.p[1][0], c.p[1][1]);
      octx.lineTo(c.p[2][0], c.p[2][1]);
      octx.lineTo(c.p[3][0], c.p[3][1]);
      octx.closePath();
      octx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
      octx.fill();
    }

    ctx.save();
    if (smBlur > 0) ctx.filter = 'blur(' + smBlur + 'px)';
    ctx.drawImage(smOff, 0, 0, smW, smH);
    ctx.restore();

    /* the contour lines are laid on after the ground, so that the softening
       of the surface does not take them with it */
    var lines = SUN.contours || [];
    for (var pass = 0; pass < 2; pass++) {
      var major = (pass === 0);
      ctx.beginPath();
      var any = false;
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li];
        if ((ln.L % 20 === 0) !== major) continue;
        ctx.moveTo(ln.a[0], ln.a[1]);
        ctx.lineTo(ln.b[0], ln.b[1]);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = major ? 'rgba(44,50,38,.62)' : 'rgba(44,50,38,.36)';
      ctx.lineWidth = major ? 1.1 : 0.8;
      ctx.stroke();
    }

    /* the route, draped over the ground */
    var pts = smDensify(SM.route, 12);
    if (pts.length > 1) {
      ctx.beginPath();
      for (var r2 = 0; r2 < pts.length; r2++) {
        var lp = smLocal(pts[r2][0], pts[r2][1]);
        var hz = smHeight(lp[0], lp[1]) + 4;
        var pp = smProject(lp[0], lp[1], hz);
        if (r2 === 0) ctx.moveTo(pp[0], pp[1]); else ctx.lineTo(pp[0], pp[1]);
      }
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = 'rgba(255,255,255,.88)';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = '#232c26';
      ctx.stroke();
    }

    /* the observation points, on a short pin so they sit clear of the ground.
       The ring around each one is the share of the sun reaching that point at
       the hour on the dial, so the dial can be read off the map. */
    SM.points.forEach(function (p, pi) {
      var lp = smLocal(p.lat, p.lng);
      var gz = smHeight(lp[0], lp[1]);
      var gp = smProject(lp[0], lp[1], gz);
      var pp = [gp[0], gp[1] - 13];
      var col = p.field === 'mostly' ? '#3f7a4e' : (p.field === 'partly' ? '#c08a2e' : '#b0512f');
      var lit = smPointShare(pi, SUN.t);
      ctx.beginPath();
      ctx.moveTo(gp[0], gp[1]);
      ctx.lineTo(pp[0], pp[1] + 8);
      ctx.strokeStyle = 'rgba(47,58,51,.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 13.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(38,52,82,.6)';
      ctx.lineWidth = 3.2;
      ctx.stroke();
      if (lit > 0.004) {
        ctx.beginPath();
        ctx.arc(pp[0], pp[1], 13.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lit);
        ctx.strokeStyle = '#e0a92b';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 9.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 9.5px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.code, pp[0], pp[1] + 0.5);
    });

    smCompass(ctx, s);

    var clock = $('#smClock'), alt = $('#smAlt'), az = $('#smAz');
    var total = Math.round(SUN.t);
    var hh = Math.floor(total / 60), mm = total % 60;
    if (clock) clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    if (alt) alt.textContent = s.alt.toFixed(1) + '°';
    if (az) az.textContent = Math.round(s.az) + '°';
  }

  function smDensify(route, step) {
    var out = [];
    for (var i = 0; i < route.length - 1; i++) {
      var a = route[i], b = route[i + 1];
      var la = smLocal(a[0], a[1]), lb = smLocal(b[0], b[1]);
      var d = Math.hypot(lb[0] - la[0], lb[1] - la[1]);
      var n = Math.max(1, Math.round(d / step));
      for (var k = 0; k < n; k++) {
        var t = k / n;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out.push(route[route.length - 1]);
    return out;
  }

  /* North and the sun, in the same oblique frame as the model. The compass
     sits in whichever corner the island has left empty. */
  function smCompass(ctx, s) {
    var r = 21, cx = smW - 40, cy = smH - 40;
    var box = SUN.bbox;
    if (box) {
      var spots = [[34, 34], [smW - 34, 34], [smW - 34, smH - 34], [34, smH - 34]];
      var best = 0, bestD = -1;
      for (var si = 0; si < spots.length; si++) {
        var sx = spots[si][0], sy = spots[si][1];
        var dx = Math.max(box.x0 - sx, 0, sx - box.x1);
        var dy = Math.max(box.y0 - sy, 0, sy - box.y1);
        var d = dx * dx + dy * dy;
        if (d > bestD) { bestD = d; best = si; }
      }
      /* the bottom left corner belongs to the relief label */
      if (best === 3) best = 0;
      cx = spots[best][0]; cy = spots[best][1];
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(47,58,51,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    function dir(dx, dy) {
      var cyw = Math.cos(SM_YAW), syw = Math.sin(SM_YAW);
      var u = dx * cyw + dy * syw;
      var v = -dx * syw + dy * cyw;
      return [u, -v * Math.sin(SM_PITCH)];
    }
    var nn = dir(0, 1);
    var nl = Math.hypot(nn[0], nn[1]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + nn[0] / nl * (r - 5), cy + nn[1] / nl * (r - 5));
    ctx.strokeStyle = '#2f3a33';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#2f3a33';
    ctx.font = '700 9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + nn[0] / nl * (r + 5), cy + nn[1] / nl * (r + 5));
    /* the sun, at its azimuth */
    var ar = s.az * Math.PI / 180;
    var sd = dir(Math.sin(ar), Math.cos(ar));
    var sl = Math.hypot(sd[0], sd[1]);
    ctx.beginPath();
    ctx.arc(cx + sd[0] / sl * (r - 7), cy + sd[1] / sl * (r - 7), 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#e0a92b';
    ctx.fill();
    ctx.restore();
    /* the relief is stretched so that the island can be read at this size */
    ctx.fillStyle = 'rgba(47,58,51,.5)';
    ctx.font = '600 9px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(tr('RELIEF EXAGGERATED ' + SM_EXAG + '×', '地形垂直放大 ' + SM_EXAG + ' 倍'), 12, smH - 12);
  }

  function smBuildTable() {
    if (!SM) return;
    setHTML('#sunTable', SM.points.map(function (p) {
      var pct = Math.round(p.sunlit * 100);
      return '<article class="sm-card">' +
        '<div class="sm-card-top"><span class="sm-card-code">' + p.code + '</span>' +
        '<span class="sm-card-time">' + p.time + '</span></div>' +
        '<h4>' + bi(p.name, p.zh) + '</h4>' +
        '<div class="sm-bar-track"><span class="sm-bar-fill" style="width:' + pct + '%"></span></div>' +
        '<div class="sm-card-nums"><span>' + bi('SUNLIT', '日照') + ' ' + pct + '%</span></div>' +
        '<div class="sm-card-classes">' +
        '<span class="sm-pair"><span class="sm-cap">' + bi('FIELD', '现场') + '</span>' +
        '<span class="sm-chip ' + p.field + '">' + bi(shadeName[p.field], shadeZh[p.field]) + '</span></span>' +
        '<span class="sm-pair"><span class="sm-cap">' + bi('MODEL', '模型') + '</span>' +
        '<span class="sm-chip ghost">' + bi(shadeName[p.model], shadeZh[p.model]) + '</span></span>' +
        '</div></article>';
    }).join(''));
  }
  function smSetTime(t) {
    SUN.t = clamp(t, 660, 825);
    var sl = $('#sunSlider');
    if (sl && Number(sl.value) !== Math.round(SUN.t)) sl.value = Math.round(SUN.t);
    smRender();
  }
  var smTimer = null, smLast = 0;
  function smToggle() {
    SUN.playing = !SUN.playing;
    var b = $('#sunPlay');
    setHTML(b, SUN.playing ? bi('PAUSE', '暂停') : bi('RUN THE DAY', '推演一天'));
    if (SUN.playing) {
      smLast = 0;
      smTimer = requestAnimationFrame(smStep);
    } else cancelAnimationFrame(smTimer);
  }
  function smStep(ts) {
    if (!SUN.playing) return;
    if (!smLast) smLast = ts;
    var dt = Math.min(60, ts - smLast);
    smLast = ts;
    var t = SUN.t + dt / 90;
    if (t > 825) t = 660;
    smSetTime(t);
    smTimer = requestAnimationFrame(smStep);
  }

  /* ------------------------------------------------------------------ */
  /* The section through the route                                        */
  /* ------------------------------------------------------------------ */
  /* The solar model answers what the sun did to the island. This answers
     what a walker asks: going along the route, how much of the sun reaches
     me, and where. Every station on the line is tested at the minute the
     group reached it, so the profile is this walk rather than one hour
     pulled out of it. */
  var TX = { ready: false, pts: [], maxChain: 0, maxElev: 0, mean: 0, stages: [] };

  /* "11:10", or "12:28 to 12:52" for a station held for a while. */
  function txMinutes(t) {
    var s = String(t).split(' to ')[0].split(':');
    return Number(s[0]) * 60 + Number(s[1] || 0);
  }
  function txClock(m) {
    var h = Math.floor(m / 60), mm = Math.round(m % 60);
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  /* The group did not walk at a steady pace: they stopped at eight stations
     and the record gives the clock at each. Between two stations the clock
     is taken to run evenly, which is the only reading the record supports. */
  function txMinuteAt(chain) {
    var ps = SM.points, n = ps.length, i;
    if (chain <= ps[0].chainage) return txMinutes(ps[0].time);
    if (chain >= ps[n - 1].chainage) return txMinutes(ps[n - 1].time);
    for (i = 0; i < n - 1; i++) {
      var a = ps[i].chainage, b = ps[i + 1].chainage;
      if (chain >= a && chain <= b) {
        var f = b === a ? 0 : (chain - a) / (b - a);
        return txMinutes(ps[i].time) + (txMinutes(ps[i + 1].time) - txMinutes(ps[i].time)) * f;
      }
    }
    return txMinutes(ps[n - 1].time);
  }
  function txStageBounds() {
    var out = [], list = D.stages || [], i;
    for (i = 0; i < list.length; i++) {
      var m = String(list[i].range || '').match(/([\d.]+)\s*to\s*([\d.]+)/);
      if (!m) continue;
      out.push({ id: list[i].id, name: list[i].name, zh: list[i].zh,
                 a: Number(m[1]) * 1000, b: Number(m[2]) * 1000 });
    }
    return out;
  }
  function txBuild() {
    if (!SM || !SUN.z) return;
    var route = SM.route, pts = [], chain = 0, i, k;
    for (i = 0; i < route.length - 1; i++) {
      var a = smLocal(route[i][0], route[i][1]);
      var b = smLocal(route[i + 1][0], route[i + 1][1]);
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var n = Math.max(1, Math.round(d / 7));
      for (k = 0; k < n; k++) {
        var t = k / n;
        var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        pts.push({ c: chain + d * t, x: x, y: y, z: smHeight(x, y) });
      }
      chain += d;
    }
    var end = smLocal(route[route.length - 1][0], route[route.length - 1][1]);
    pts.push({ c: chain, x: end[0], y: end[1], z: smHeight(end[0], end[1]) });

    var sum = 0, mxC = 0, mxE = 0, walk = SM.meta.walkHeight;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], s = smSunAt(txMinuteAt(p.c));
      p.m = txMinuteAt(p.c);
      p.share = clamp(smSunShare(p.x, p.y, p.z + walk, s.az, s.alt), 0, 1);
      sum += p.share;
      if (p.c > mxC) mxC = p.c;
      if (p.z > mxE) mxE = p.z;
    }
    TX.pts = pts;
    TX.maxChain = mxC;
    TX.maxElev = mxE;
    TX.mean = pts.length ? sum / pts.length : 0;
    TX.stages = txStageBounds();
    TX.ready = true;
  }
  function txClassOf(v) { return v >= 0.9 ? 'unshaded' : (v >= 0.4 ? 'partly' : 'mostly'); }
  function txEsc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function txRender() {
    var host = $('#txFigure');
    if (!host || !TX.ready) return;
    var cw = host.clientWidth || 1080;
    var narrow = cw < 680;
    var W = narrow ? 700 : 1080;
    var L = narrow ? 40 : 64;
    var R = W - (narrow ? 12 : 34);
    var T1 = narrow ? 20 : 28, B1 = narrow ? 186 : 246;
    var TB = narrow ? 196 : 258, BB = narrow ? 222 : 288;
    var T2 = narrow ? 250 : 322, B2 = narrow ? 396 : 512;
    var AX = narrow ? 416 : 540, AXT = narrow ? 442 : 572;
    var fs = narrow ? 12 : 11;
    var maxC = TX.maxChain || 1;
    var maxE = Math.max(40, Math.ceil(TX.maxElev / 20) * 20);
    var i, p, s = [];

    function X(c) { return L + (c / maxC) * (R - L); }
    function YE(h) { return B1 - (h / maxE) * (B1 - T1); }
    function YS(v) { return B2 - v * (B2 - T2); }

    /* the ground, as one filled line */
    var ground = 'M' + L + ',' + B1;
    for (i = 0; i < TX.pts.length; i++) {
      ground += 'L' + X(TX.pts[i].c).toFixed(1) + ',' + YE(TX.pts[i].z).toFixed(1);
    }
    ground += 'L' + X(TX.pts[TX.pts.length - 1].c).toFixed(1) + ',' + B1 + 'Z';

    /* the share of the sun, as one line */
    var shareLine = '';
    for (i = 0; i < TX.pts.length; i++) {
      shareLine += (i ? 'L' : 'M') + X(TX.pts[i].c).toFixed(1) + ',' + YS(TX.pts[i].share).toFixed(1);
    }

    s.push('<svg class="tx-svg" viewBox="0 0 ' + W + ' ' + (AXT + 22) + '" role="img" aria-labelledby="txTitle">');
    s.push('<title id="txTitle">' + txEsc(tr('Elevation and the share of the sun along the route', '路线沿程高程与日照份额')) + '</title>');

    /* grid: one line every twenty metres of ground, every fifth of the sun */
    s.push('<g class="tx-grid">');
    for (i = 0; i <= maxE; i += 20) {
      s.push('<line x1="' + L + '" y1="' + YE(i).toFixed(1) + '" x2="' + R + '" y2="' + YE(i).toFixed(1) + '"/>');
    }
    for (i = 0; i <= 5; i++) {
      var vy = YS(i / 5);
      s.push('<line x1="' + L + '" y1="' + vy.toFixed(1) + '" x2="' + R + '" y2="' + vy.toFixed(1) + '"/>');
    }
    s.push('</g>');

    /* the ground, filled down to the axis, and its own ridge line above */
    s.push('<path class="tx-ground" d="' + ground + '"/>');

    var ridge = 'M' + X(TX.pts[0].c).toFixed(1) + ',' + YE(TX.pts[0].z).toFixed(1);
    for (i = 1; i < TX.pts.length; i++) {
      ridge += 'L' + X(TX.pts[i].c).toFixed(1) + ',' + YE(TX.pts[i].z).toFixed(1);
    }
    s.push('<path class="tx-ridge" d="' + ridge + '"/>');

    /* the eight stations, as a dashed rule through both panels */
    s.push('<g class="tx-stations">');
    for (i = 0; i < SM.points.length; i++) {
      var sp = SM.points[i], sx = X(sp.chainage).toFixed(1);
      s.push('<line x1="' + sx + '" y1="' + T1 + '" x2="' + sx + '" y2="' + B2 + '"/>');
      s.push('<text class="tx-station-num" x="' + sx + '" y="' + (T1 - (narrow ? 6 : 8)) + '" text-anchor="middle">' + sp.code + '</text>');
    }
    s.push('</g>');

    /* the four stages, as a band between the panels */
    s.push('<g class="tx-stages">');
    for (i = 0; i < TX.stages.length; i++) {
      var st = TX.stages[i];
      var xa = X(Math.max(0, st.a)), xb = X(Math.min(maxC, st.b));
      s.push('<rect x="' + xa.toFixed(1) + '" y="' + TB + '" width="' + Math.max(1, xb - xa).toFixed(1) +
             '" height="' + (BB - TB) + '"/>');
      var mid = (xa + xb) / 2;
      var label = narrow ? st.id : (st.id + '  ' + tr(st.name, st.zh));
      s.push('<text class="tx-stage-name" x="' + mid.toFixed(1) + '" y="' + ((TB + BB) / 2 + fs * 0.36).toFixed(1) +
             '" text-anchor="middle">' + txEsc(label) + '</text>');
    }
    s.push('</g>');

    /* the share of the sun, banded into the three field classes */
    s.push('<g class="tx-bands">');
    var runStart = 0, runCls = txClassOf(TX.pts[0].share);
    for (i = 1; i <= TX.pts.length; i++) {
      var cls = i < TX.pts.length ? txClassOf(TX.pts[i].share) : null;
      if (cls !== runCls || i === TX.pts.length) {
        var bx1 = X(TX.pts[runStart].c), bx2 = X(TX.pts[Math.min(i, TX.pts.length - 1)].c);
        s.push('<rect class="' + runCls + '" x="' + bx1.toFixed(1) + '" y="' + T2 +
               '" width="' + Math.max(0.8, bx2 - bx1).toFixed(1) + '" height="' + (B2 - T2) + '"/>');
        runStart = i; runCls = cls;
      }
    }
    s.push('</g>');
    s.push('<path class="tx-share-line" d="' + shareLine + '"/>');

    /* the two thresholds the field classes were read against. The labels go
       on the rule itself rather than on the axis, where they would sit on
       top of the 1.0 tick. */
    s.push('<g class="tx-thresholds">');
    [0.9, 0.4].forEach(function (v) {
      var ty = YS(v).toFixed(1);
      s.push('<line x1="' + L + '" y1="' + ty + '" x2="' + R + '" y2="' + ty + '"/>');
      s.push('<text class="tx-threshold-tag" x="' + (R - 5) + '" y="' + (Number(ty) - 4).toFixed(1) + '" text-anchor="end">' + v.toFixed(1) + '</text>');
    });
    s.push('</g>');

    /* ticks: metres on the left, kilometres along the bottom */
    s.push('<g class="tx-ticks">');
    for (i = 0; i <= maxE; i += 20) {
      s.push('<text x="' + (L - 6) + '" y="' + (YE(i) + fs * 0.36).toFixed(1) + '" text-anchor="end">' + i + '</text>');
    }
    /* the share axis, read every fifth, so the left edge runs 0.0 to 1.0
       without a gap; the two thresholds are named on the rules themselves */
    for (i = 0; i <= 5; i++) {
      s.push('<text x="' + (L - 6) + '" y="' + (YS(i / 5) + fs * 0.36).toFixed(1) + '" text-anchor="end">' + (i / 5).toFixed(1) + '</text>');
    }
    var stepC = narrow ? 500 : 250;
    for (i = 0; i <= maxC; i += stepC) {
      s.push('<text x="' + X(i).toFixed(1) + '" y="' + (AX + fs) + '" text-anchor="middle">' + i + '</text>');
    }
    s.push('</g>');

    /* where the ground came from, inside the frame at the top right, the way
       a printed section carries its source */
    s.push('<text class="tx-source" x="' + R + '" y="' + (T1 + fs + 2) + '" text-anchor="end">' +
           txEsc(tr('GROUND: SRTM 30 M RESAMPLED TO 7.5 M, INDICATIVE', '高程：SRTM 30 米重采样至 7.5 米，示意')) + '</text>');

    /* axis titles. Latin turns on its side; Chinese stacks upright, because a
       turned Chinese character is a character lying down, which is not how it
       is read. */
    function axisTitle(x, mid, text) {
      if (state.lang === 'en') {
        return '<text x="' + x + '" y="' + mid + '" text-anchor="middle" transform="rotate(-90 ' + x + ' ' + mid + ')">' + txEsc(text) + '</text>';
      }
      return '<text x="' + x + '" y="' + mid + '" text-anchor="middle" dominant-baseline="central" ' +
             'style="writing-mode:vertical-rl">' + txEsc(text) + '</text>';
    }
    var gy = (T1 + B1) / 2, sy2 = (T2 + B2) / 2;
    s.push('<g class="tx-axis-titles">');
    s.push(axisTitle(L - 30, gy, tr('GROUND, M', '高程, 米')));
    s.push(axisTitle(L - 30, sy2, tr('SHARE OF THE SUN', '日照份额')));
    s.push('<text class="tx-axis-x" x="' + ((L + R) / 2) + '" y="' + AXT + '" text-anchor="middle">' +
           txEsc(tr('DISTANCE ALONG THE ROUTE, M', '沿路线距离, 米')) + '</text>');
    s.push('</g>');

    /* the readout that follows the pointer */
    s.push('<g class="tx-cursor" style="display:none">' +
           '<line class="tx-cursor-line" y1="' + T1 + '" y2="' + B2 + '"/>' +
           '<circle class="tx-cursor-dot" r="4"/>' +
           '</g>');
    s.push('<rect class="tx-hit" x="' + L + '" y="' + T1 + '" width="' + (R - L) + '" height="' + (B2 - T1) + '"/>');
    s.push('<g class="tx-tip" style="display:none">' +
           '<rect class="tx-tip-bg" rx="7" ry="7"/>' +
           '<text class="tx-tip-a"></text><text class="tx-tip-b"></text><text class="tx-tip-c"></text>' +
           '</g>');
    s.push('</svg>');

    host.innerHTML = s.join('');

    /* the pointer reads the nearest station on the line */
    var svg = host.querySelector('svg');
    var hit = host.querySelector('.tx-hit');
    var cur = host.querySelector('.tx-cursor');
    var curLine = host.querySelector('.tx-cursor-line');
    var curDot = host.querySelector('.tx-cursor-dot');
    var tip = host.querySelector('.tx-tip');
    var tipBg = host.querySelector('.tx-tip-bg');
    var tipA = host.querySelector('.tx-tip-a');
    var tipB = host.querySelector('.tx-tip-b');
    var tipC = host.querySelector('.tx-tip-c');
    if (!svg || !hit) return;

    function nearest(vx) {
      var c = (vx - L) / (R - L) * maxC;
      var lo = 0, hi = TX.pts.length - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (TX.pts[mid].c < c) lo = mid + 1; else hi = mid;
      }
      if (lo > 0 && Math.abs(TX.pts[lo - 1].c - c) < Math.abs(TX.pts[lo].c - c)) lo--;
      return TX.pts[lo];
    }
    function move(ev) {
      var box = svg.getBoundingClientRect();
      var vx = (ev.clientX - box.left) / box.width * W;
      if (vx < L || vx > R) { hide(); return; }
      var p2 = nearest(vx);
      var px = X(p2.c).toFixed(1);
      cur.style.display = '';
      curLine.setAttribute('x1', px); curLine.setAttribute('x2', px);
      curDot.setAttribute('cx', px); curDot.setAttribute('cy', YS(p2.share).toFixed(1));
      tip.style.display = '';
      var co = txClassOf(p2.share);
      tipA.textContent = (p2.c / 1000).toFixed(2) + ' km';
      tipB.textContent = Math.round(p2.z) + ' m\u2003\u2003' + txClock(p2.m);
      tipC.textContent = Math.round(p2.share * 100) + '%\u2003' + tr(shadeName[co], shadeZh[co]);
      var tw = Math.max(tipA.getComputedTextLength(), tipB.getComputedTextLength(), tipC.getComputedTextLength()) + 22;
      var tx0 = Math.min(Math.max(X(p2.c) + 12, L), R - tw);
      var ty0 = T2 + 4;
      tipBg.setAttribute('x', tx0.toFixed(1));
      tipBg.setAttribute('y', ty0);
      tipBg.setAttribute('width', tw.toFixed(1));
      tipBg.setAttribute('height', (fs * 5).toFixed(1));
      [tipA, tipB, tipC].forEach(function (el, k) {
        el.setAttribute('x', (tx0 + 10).toFixed(1));
        el.setAttribute('y', (ty0 + fs * 1.5 + k * fs * 1.35).toFixed(1));
      });
    }
    function hide() {
      cur.style.display = 'none';
      tip.style.display = 'none';
    }
    svg.addEventListener('mousemove', move);
    svg.addEventListener('mouseleave', hide);
    svg.addEventListener('touchmove', function (ev) {
      if (ev.touches && ev.touches[0]) move(ev.touches[0]);
    }, { passive: true });
    svg.addEventListener('touchend', hide);

    /* the three figures above the chart */
    var a = $('#txLength'), b = $('#txHigh'), c = $('#txMean');
    if (a) a.textContent = (TX.maxChain / 1000).toFixed(2) + ' km';
    if (b) b.textContent = Math.round(TX.maxElev) + ' m';
    if (c) c.textContent = Math.round(TX.mean * 100) + '%';
  }

  /* ------------------------------------------------------------------ */
  /* Progress control                                                      */
  /* ------------------------------------------------------------------ */
  function setProgress(p) {
    state.progress = clamp(p, 0, 1);
    var s = sampleAt(state.progress), st = stageAt(state.progress), np = nearestPoint(state.progress);
    $('#routeScrub').value = Math.round(state.progress*1000);
    $('#routeScrub').style.setProperty('--p', (state.progress*100).toFixed(1)+'%');
    $('#readDist').textContent = (state.progress*TOTAL).toFixed(2);
    $('#readElev').textContent = Math.round(s.elev);
    $('#readShade').textContent = tr(shadeShort[st.shade], shadeShortZh[st.shade]);
    setHTML('#nearestPoint', bi('NEAREST '+np.name.toUpperCase(), '最近观察点 '+np.zh));
    $$('.stage-chip').forEach(function (b) { b.classList.toggle('active', b.dataset.stage === st.id); });
    $$('.seg-shade').forEach(function (b) { b.classList.toggle('on', b.dataset.point === np.id); });
    updateProfile();
    drawTileMap();
  }
  var playTimer = null, lastTs = 0;
  function togglePlay() {
    state.playing = !state.playing;
    $('#playBtn').textContent = state.playing ? '❚❚' : '▶';
    if (state.playing) {
      lastTs = 0;
      playTimer = requestAnimationFrame(stepPlay);
    } else cancelAnimationFrame(playTimer);
  }
  function stepPlay(ts) {
    if (!state.playing) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(80, ts-lastTs); lastTs = ts;
    var next = state.progress + dt/17000;
    if (next >= 1) { setProgress(1); togglePlay(); return; }
    setProgress(next);
    playTimer = requestAnimationFrame(stepPlay);
  }

  /* ------------------------------------------------------------------ */
  /* Content builders                                                      */
  /* ------------------------------------------------------------------ */
  function buildStops() {
    setHTML('#stopsRail', D.points.map(function (p) {
      return '<button class="stop-card" data-point="'+p.id+'">' +
        '<img src="'+thumb(p.photos[0])+'" alt="'+tr('Field photograph at ', '观察点实地照片 ') + p.name + '" loading="lazy">' +
        '<span class="sc-body"><span class="sc-num">'+p.code+'</span>' +
        '<span class="sc-text"><strong>'+bi(p.name, p.zh)+'</strong>' +
        '<span>'+bi(p.time + ', ' + Math.round(p.elev) + ' m', timeZh(p.time) + '，' + Math.round(p.elev) + ' 米')+'</span></span></span></button>';
    }).join(''));
    setHTML('#stopsCount', bi(D.points.length + ' points', D.points.length + ' 个观察点'));
  }
  function buildStages() {
    setHTML('#stageCards', '<div class="stage-grid">' + D.stages.map(function (s) {
      var imgs = s.photos.slice(0,3).map(function (id, k) {
        return '<button data-photos="'+s.photos.join(',')+'" data-idx="'+k+'" aria-label="'+tr('Open photograph ', '查看照片 ') + id + '">' +
          '<img src="'+thumb(id)+'" alt="'+tr('Field photograph ', '实地照片 ') + id + '" loading="lazy"></button>';
      }).join('');
      var stageNum = tr('STAGE ' + s.code + ', ' + s.range.toUpperCase(),
                        '第 ' + s.code + ' 段，' + metricZh(s.range));
      return '<article class="stage-card reveal">' +
        '<div class="stage-photos">'+imgs+'</div>' +
        '<div class="stage-body"><span class="stage-num">'+stageNum+'</span>' +
        '<h4>'+bi(s.name, s.zh)+'</h4>' +
        '<dl class="stage-facts">' +
          '<div><dt>'+bi('TIME', '时间')+'</dt><dd>'+bi(s.time, timeZh(s.time))+'</dd></div>' +
          '<div><dt>'+bi('ELEVATION', '海拔')+'</dt><dd>'+bi(s.elev, metricZh(s.elev))+'</dd></div>' +
          '<div><dt>'+bi('SHADE', '遮阴')+'</dt><dd>'+bi(shadeName[s.shade], shadeZh[s.shade])+'</dd></div>' +
          '<div><dt>'+bi('POINTS', '观察点')+'</dt><dd>'+bi(s.points.length + ' stops', s.points.length + ' 个观察点')+'</dd></div>' +
        '</dl>' +
        '<p class="stage-summary">'+bi(s.summary, s.summaryZh)+'</p>' +
        '<div class="stage-care"><span class="care-label">'+bi('EXTRA CARE', '注意事项')+'</span> '+bi(s.care, s.careZh)+'</div>' +
        '</div></article>';
    }).join('') + '</div>');
    setHTML('#stageChips', D.stages.map(function (s) {
      return '<button class="stage-chip" data-stage="'+s.id+'"><b>'+bi(s.code + ' ' + s.name, s.code + ' ' + s.zh)+'</b></button>';
    }).join(''));
  }
  function buildRibbon() {
    setHTML('#ribbons', '<div class="ribbon-card">' +
      '<div class="ribbon-head"><strong>'+bi('ONE CONTINUOUS ROUTE', '一条连续路线')+'</strong><span>'+bi(D.route.shade, D.route.shadeZh)+'</span></div>' +
      '<div class="ribbon">' + D.points.map(function (p) {
        return '<div class="seg-shade '+p.shade+'" data-point="'+p.id+'" data-progress="'+p.progress+'" title="'+tr(p.code+' '+p.name+', '+shadeName[p.shade], p.code+' '+p.zh+'，'+shadeZh[p.shade])+'"><span>'+p.code+'</span></div>';
      }).join('') + '</div>' +
      '<div class="ribbon-foot"><span>'+bi('START ' + D.route.startShort, '起点 ' + D.route.startShortZh)+'</span>' +
      '<span>'+bi('FINISH ' + D.route.finishShort, '终点 ' + D.route.finishShortZh)+'</span></div></div>');
    $$('.seg-shade').forEach(function (el) {
      el.addEventListener('click', function () { setProgress(Number(el.dataset.progress)); openPoint(el.dataset.point); });
    });
  }
  function buildNotes() {
    var notes = [
      { img: 'p19', color: 'amber', label: 'TRAIL CONDITION', labelZh: '山径侵蚀',
        title: 'STAY ON THE REPAIRED PATH', titleZh: '请沿维修步道行走',
        text: 'The AFCD board at the junction records serious erosion caused by visitors leaving the trail and wearing away vegetation. Hand-built log steps now hold the slope, but loose sandy tread and exposed roots remain.',
        textZh: '分岔路旁的渔农自然护理署告示牌记录了严重的侵蚀，成因是游客离开步道并踩踏植被。人工铺设的圆木台阶目前稳住了坡面，但松散的沙质路面与外露树根仍然存在。' },
      { img: 'p03', color: 'rust', label: 'GEOCONSERVATION', labelZh: '岩石保育',
        title: 'LOOK, DON\'T TAKE', titleZh: '只看不取',
        text: 'An on-site Geopark board prohibits defacing, damaging or removing any rock, and disturbing wild plants and animals. The weathered volcanic boulders here are brittle, and the board asks visitors to leave them in place.',
        textZh: '现场的「世界地质公园」告示牌禁止涂污、破坏或取走任何岩石，也禁止干扰野生植物与动物。此处风化的火山巨岩质地脆裂，告示牌请游客原地观赏。' },
      { img: 'p05', color: 'green', label: 'INTERTIDAL LIFE', labelZh: '海岸生态',
        title: 'HANDS OFF THE SHORE', titleZh: '请勿触碰海岸',
        text: 'The AFCD banner asks visitors not to feed or touch marine life, and not to tread on coral. The shallow water off both beaches is habitat for coral and other marine life.',
        textZh: '渔农自然护理署的横幅提醒游客不要喂食或触摸海洋生物，也不要踩踏珊瑚。两处泳滩外的浅水正是珊瑚与其他海洋生物的栖息地。' },
      { img: 'p13', color: 'blue', label: 'SUN EXPOSURE', labelZh: '日照',
        title: 'CLOUD IS NOT SHADE', titleZh: '多云不等于遮阴',
        text: 'At 11:10 the beach was under thick cloud; by 12:47 the ridge was in full sun. Our 20 m shade readings show the coast, viewpoint and beach entirely unshaded.',
        textZh: '11:10 时海滩上空云层厚重，12:47 时山脊已沐浴在烈日之下。我们的 20 米遮阴记录显示，海岸、观景台与泳滩全程无遮阴。' }
    ];
    setHTML('#notesGrid', notes.map(function (n) {
      return '<article class="note-card reveal" style="--note-color:var(--'+n.color+')">' +
        '<img src="'+photo(n.img)+'" alt="'+tr('Field evidence: ', '实地证据：') + n.title + '" loading="lazy" data-photo="'+n.img+'" data-caption="'+n.title+'" data-caption-zh="'+n.titleZh+'">' +
        '<div class="note-body"><span class="mini-label">'+bi(n.label, n.labelZh)+'</span><h4>'+bi(n.title, n.titleZh)+'</h4>' +
        '<p>'+bi(n.text, n.textZh)+'</p></div></article>';
    }).join(''));
  }
  function buildVegetation() {
    setHTML('#vegGrid', V.map(function (v) {
      /* Species names are a plain list rather than a pair of blocks, so the
         Traditional version is converted here instead of by the markup. */
      var species;
      if (state.lang === 'en') species = v.speciesEn || v.species;
      else if (state.lang === 'zh-hant') species = v.species.map(function (x) { return ZH.toHant(x); });
      else species = v.species;
      return '<article class="veg-card reveal">' +
        '<div class="veg-art">' + v.art + '</div>' +
        '<div class="veg-body">' +
          '<div class="veg-top"><span class="veg-code">'+v.code+'</span><span class="veg-form">'+bi(v.form, v.formZh)+'</span></div>' +
          '<h4>'+bi(v.name, v.zh)+'</h4>' +
          '<p class="veg-blurb">'+bi(v.blurb, v.blurbZh)+'</p>' +
          '<ul class="veg-species">' + species.map(function (s) { return '<li>'+s+'</li>'; }).join('') + '</ul>' +
          '<p class="veg-where">'+bi(v.where, v.whereZh)+'</p>' +
        '</div></article>';
    }).join(''));
  }
  /* The photographs are grouped by the place they were made. Each tile keeps
     its own caption so the section reads as a record on its own, and the
     lightbox can step through one group a frame at a time. */
  var galleryIndex = {};
  function buildGallery() {
    if (!G) return;
    galleryIndex = {};
    setHTML('#photoGroups', G.groups.map(function (g) {
      var items = G.photos.filter(function (p) { return p.g === g.id; });
      var ids = items.map(function (p) { return p.file; });
      galleryIndex[g.id] = {
        ids: ids,
        en: g.en, zh: g.zh,
        capsEn: items.map(function (p) { return p.en; }),
        capsZh: items.map(function (p) { return p.zh; })
      };
      var tiles = items.map(function (p, i) {
        var cap = state.lang === 'en' ? p.en : (state.lang === 'zh-hant' ? ZH.toHant(p.zh) : p.zh);
        var label = tr('Open photograph ', '打开照片 ') + (i + 1) + tr(' of ', ' / 共 ') + items.length;
        return '<figure class="gal-item reveal">' +
          '<button type="button" class="gal-open" data-group="' + g.id + '" data-idx="' + i + '" aria-label="' + label + '" title="' + cap + '">' +
            '<img src="' + thumb(p.file) + '" alt="' + cap + '" loading="lazy">' +
          '</button>' +
          '<figcaption>' + bi(p.en, p.zh) + '</figcaption>' +
        '</figure>';
      }).join('');
      return '<section class="gal-group reveal" data-group="' + g.id + '">' +
        '<div class="gal-head">' +
          '<div class="gal-title"><h3>' + bi(g.en, g.zh) + '</h3>' +
            '<p class="gal-count">' + bi(items.length + ' PHOTOGRAPHS', items.length + ' 张照片') + '</p></div>' +
          '<p class="gal-desc">' + bi(g.enDesc, g.zhDesc) + '</p>' +
        '</div>' +
        '<div class="gal-grid" style="--gal-cols:' + g.cols + '">' + tiles + '</div>' +
      '</section>';
    }).join(''));
  }
  function buildReading() {
    setHTML('#readList', D.reading.map(function (r) {
      var en = r.url ? '<a href="'+r.url+'" target="_blank" rel="noopener">'+r.title+'</a>' : r.title;
      var zh = r.url ? '<a href="'+r.url+'" target="_blank" rel="noopener">'+r.titleZh+'</a>' : r.titleZh;
      return '<article class="read-row reveal">' +
        '<div class="read-meta"><span class="read-kind">'+bi(r.kind, r.kindZh)+'</span><span class="read-year">'+r.year+'</span></div>' +
        '<div class="read-body"><h4>'+bi(en, zh)+'</h4>' +
          '<p class="read-source">'+bi(r.source, r.sourceZh)+'</p>' +
          '<p class="read-note">'+bi(r.note, r.noteZh)+'</p>' +
          (r.flag ? '<span class="read-flag">'+bi(r.flag, r.flagZh)+'</span>' : '') +
        '</div></article>';
    }).join(''));
  }
  function buildAdvice() {
    setHTML('#adviceList', D.advice.map(function (a, i) {
      return '<li><span class="adv-num">0'+(i+1)+'</span><div><h4>'+bi(a.title, a.zh)+'</h4>' +
        '<p>'+bi(a.body, a.bodyZh)+'</p></div></li>';
    }).join(''));
  }
  function buildSurvey() {
    var s = D.survey;
    var facts = [
      ['SURVEY DATE', '日期', s.date, s.dateZh],
      ['RECORD WINDOW', '时段', s.window, s.windowZh + '，共 2 小时 28 分钟'],
      ['WEATHER', '天气', s.weather, s.weatherZh],
      ['FIELD RECORDS', '记录', s.photos+' photographs, '+s.points+' observation points', s.photos+' 张照片，'+s.points+' 个观察点'],
      ['ROUTE', '路线', 'One continuous line from '+D.route.start+' to '+D.route.finish, '一条连续路线，由'+D.route.startZh+'至'+D.route.finishZh],
      ['SHADE CLASSES', '遮阴分级', 'Mostly shaded, partly shaded, unshaded', '大部份遮阴，部份遮阴，无遮阴'],
      ['BASE MAP', '底图', 'AMap street and satellite tiles, GCJ-02', '高德地图街道与卫星瓦片，GCJ-02'],
      ['LOCATION', '地点', s.place, s.placeZh]
    ];
    setHTML('#surveyFacts', facts.map(function (f) {
      return '<div><dt>'+bi(f[0], f[1])+'</dt><dd>'+bi(f[2], f[3])+'</dd></div>';
    }).join(''));
    setHTML('#surveyMethod', bi(s.method, s.methodZh));
    setHTML('#mapNoteText', bi(s.mapping, s.mappingZh));
    setHTML('#sourceList', D.sources.map(function (src) {
      var en = src.url ? '<a href="'+src.url+'" target="_blank" rel="noopener">'+src.label+'</a>' : '<span class="source-title">'+src.label+'</span>';
      var zh = src.url ? '<a href="'+src.url+'" target="_blank" rel="noopener">'+src.labelZh+'</a>' : '<span class="source-title">'+src.labelZh+'</span>';
      return '<li><span class="source-meta">'+bi(src.kind, src.kindZh)+'</span>'+bi(en, zh)+'<p>'+bi(src.detail, src.detailZh)+'</p></li>';
    }).join(''));
    setHTML('#checkList', D.checks.map(function (c, i) {
      return '<li>'+bi(c, D.checksZh[i] || c)+'</li>';
    }).join(''));
    var head = '<div class="ctr-row head"><div>'+bi('MEMBER', '组员')+'</div><div>'+bi('FIELDWORK', '实地记录')+'</div>' +
      '<div>'+bi('ANALYSIS', '分析')+'</div><div>'+bi('WEBSITE', '网页')+'</div></div>';
    setHTML('#contributionTable', head + D.contributions.map(function (c) {
      /* A member's name stays in Chinese script in every version, so both
         slots hold the same string; the Traditional twin is derived from the
         Simplified one like every other Chinese block. */
      return '<div class="ctr-row"><div class="ctr-name">'+bi(c.name, c.name)+
        (c.role ? '<span class="ctr-role">'+bi(c.roleEn, c.role)+'</span>' : '')+'</div>' +
        '<div data-label="Fieldwork">'+bi(c.fieldwork, c.fieldworkZh)+'</div>' +
        '<div data-label="Analysis">'+bi(c.analysis, c.analysisZh)+'</div>' +
        '<div data-label="Website">'+bi(c.website, c.websiteZh)+'</div></div>';
    }).join(''));
    $$('.js-date-en').forEach(function (el) { el.textContent = s.dateShort.toUpperCase(); });
    $$('.js-date-zh').forEach(function (el) {
      /* the same slot exists in the Simplified source and in its Traditional twin */
      el.textContent = el.closest('.t-hant') ? ZH.toHant(s.dateShortZh) : s.dateShortZh;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Drawer & lightbox                                                     */
  /* ------------------------------------------------------------------ */
  function openPoint(id) {
    var p = D.points.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.point = p; state.drawerIdx = 0;
    var stage = D.stages.filter(function (s) { return s.id === p.stage; })[0];
    var thumbs = p.photos.map(function (pid, i) { return '<img src="'+thumb(pid)+'" alt="Field photograph '+pid+'" data-idx="'+i+'" loading="lazy">'; }).join('');
    setHTML('#drawerContent',
      '<h3>'+bi(p.name, p.zh)+'</h3>' +
      '<div class="drawer-photo"><img id="dPhoto" src="'+photo(p.photos[0])+'" alt="'+tr('Field photograph at ', '观察点实地照片 ') + p.name + '" data-idx="0">' +
        '<span class="d-count" id="dCount">'+tr('1 of '+p.photos.length, '第 1 张，共 '+p.photos.length+' 张')+'</span>' +
        (p.photos.length > 1 ? '<button class="d-nav prev" data-dir="-1" aria-label="'+tr('Previous photo', '上一张照片')+'">‹</button><button class="d-nav next" data-dir="1" aria-label="'+tr('Next photo', '下一张照片')+'">›</button>' : '') +
      '</div>' +
      '<div class="chips"><span class="chip stage">'+bi('STAGE ' + (stage?stage.code:''), '第 ' + (stage?stage.code:'') + ' 段')+'</span>' +
        '<span class="chip shade-'+p.shade+'">'+bi(shadeName[p.shade], shadeZh[p.shade])+'</span>' +
        '<span class="chip">'+bi(p.time+' HKT', timeZh(p.time)+' 香港时间')+'</span>' +
        '<span class="chip">'+bi(Math.round(p.elev)+' M ASL', '海拔 '+Math.round(p.elev)+' 米')+'</span>' +
        '<span class="chip">'+bi(p.dist.toFixed(2)+' KM', p.dist.toFixed(2)+' 公里')+'</span>' +
        '<span class="chip">'+bi(p.weather, p.weatherZh)+'</span></div>' +
      '<p class="d-desc">'+bi(p.description, p.descriptionZh)+'</p>' +
      '<dl class="d-list">' +
        '<div><dt>'+bi('WHAT YOU CAN SEE', '景观')+'</dt><dd>'+bi(p.attraction, p.attractionZh)+'</dd></div>' +
        '<div><dt>'+bi('VISIBLE ENVIRONMENTAL CONCERNS', '环境关注')+'</dt><dd><ul>'+p.concerns.map(function (c, i) { return '<li>'+bi(c, p.concernsZh[i] || c)+'</li>'; }).join('')+'</ul></dd></div>' +
        '<div><dt>'+bi('FACILITIES', '设施')+'</dt><dd>'+bi(p.facilities, p.facilitiesZh)+'</dd></div>' +
        '<div><dt>'+bi('PRACTICAL SUGGESTION', '实用建议')+'</dt><dd>'+bi(p.tip, p.tipZh)+'</dd></div></dl>' +
      '<div class="d-evidence"><p><span class="d-label">'+bi('EVIDENCE SOURCE', '证据来源')+'</span> '+bi(p.sources, p.sourcesZh)+'</p><div class="d-thumbs">'+thumbs+'</div></div>' +
      (p.check ? '<div class="d-check"><span class="d-label">'+bi('NEEDS FURTHER CHECKING', '待核查')+'</span> '+bi(p.check, p.checkZh || p.check)+'</div>' : ''));
    setHTML('#drawerKicker', bi('OBSERVATION POINT ' + p.code, '观察点 ' + p.code + '　' + timeZh(p.time)));
    $('#scrim').hidden = false; $('#drawer').hidden = false;
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { $('#scrim').classList.add('show'); $('#drawer').classList.add('show'); });
  }
  function moveDrawerPhoto(dir) {
    var p = state.point, n = p.photos.length;
    if (n < 2) return;
    state.drawerIdx = (state.drawerIdx + dir + n) % n;
    var img = $('#dPhoto');
    img.src = photo(p.photos[state.drawerIdx]); img.dataset.idx = state.drawerIdx;
    $('#dCount').textContent = tr((state.drawerIdx+1)+' of '+n, '第 '+(state.drawerIdx+1)+' 张，共 '+n+' 张');
  }
  function closeDrawer() {
    $('#scrim').classList.remove('show'); $('#drawer').classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { $('#scrim').hidden = true; $('#drawer').hidden = true; state.point = null; }, 460);
  }
  /* A group of photographs. The last two arguments carry one caption per
     frame; without them the viewer falls back to the group name and the
     file reference. */
  function openLightbox(ids, idx, caption, captionZh, captions, captionsZh) {
    state.lbPhotos = ids; state.lbIdx = idx || 0;
    state.lbCaption = caption || 'GROUP FIELD PHOTOGRAPH';
    state.lbCaptionZh = captionZh || '本组实地照片';
    state.lbCaptions = captions || null;
    state.lbCaptionsZh = captionsZh || null;
    $('#lightbox').hidden = false; document.body.classList.add('no-scroll');
    updateLightbox();
  }
  function updateLightbox() {
    var id = state.lbPhotos[state.lbIdx];
    $('#lbImage').src = photo(id);
    $('#lbImage').alt = tr('Field photograph ', '实地照片 ') + id;
    /* A group with captions shows the caption of the frame on screen; the
       group name stays above it as the heading. */
    var note = state.lbCaptions && state.lbCaptions[state.lbIdx] ? state.lbCaptions[state.lbIdx] : '';
    var noteZh = state.lbCaptionsZh && state.lbCaptionsZh[state.lbIdx] ? state.lbCaptionsZh[state.lbIdx] : '';
    $('#lbNote').textContent = note ? tr(note, noteZh) : '';
    $('#lbCaption').textContent = note ? tr(state.lbCaption, state.lbCaptionZh)
      : tr(state.lbCaption, state.lbCaptionZh) + ', ' + id;
    $('#lbCount').textContent = tr((state.lbIdx+1)+' of '+state.lbPhotos.length,
      '第 '+(state.lbIdx+1)+' 张，共 '+state.lbPhotos.length+' 张');
    $('#lbPrev').hidden = $('#lbNext').hidden = state.lbPhotos.length < 2;
  }
  function moveLightbox(dir) {
    if (state.lbPhotos.length < 2) return;
    state.lbIdx = (state.lbIdx+dir+state.lbPhotos.length)%state.lbPhotos.length;
    updateLightbox();
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    if (!state.point) document.body.classList.remove('no-scroll');
  }

  /* ------------------------------------------------------------------ */
  /* Language switching                                                   */
  /* ------------------------------------------------------------------ */
  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) lang = 'en';
    state.lang = lang;
    document.documentElement.dataset.lang = lang;
    document.documentElement.lang = lang === 'en' ? 'en' : (lang === 'zh-hant' ? 'zh-Hant-HK' : 'zh-Hans');
    try { localStorage.setItem('si-lang', lang); } catch (e) {}
    applyLangButtons(lang);
    relocalize();
  }

  /* The three buttons carry the state of the switch and name the version
     each one moves to. */
  function applyLangButtons(lang) {
    $$('.lang-btn').forEach(function (b) {
      var on = b.dataset.lang === lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      /* The button names the version it moves to, so it reads in that
         version's own orthography: 简中 becomes 簡中 on the Traditional page. */
      var label = LANG_BTN_LABEL[b.dataset.lang];
      b.textContent = lang === 'zh-hant' ? ZH.toHant(label) : label;
      b.setAttribute('lang', b.dataset.lang === 'zh-hant' ? 'zh-Hant-HK' : (b.dataset.lang === 'zh-hans' ? 'zh-Hans' : 'en'));
      var tip = lang === 'en' ? LANG_BTN_TIP_EN[b.dataset.lang] : LANG_BTN_TIP[b.dataset.lang];
      b.setAttribute('title', lang === 'zh-hant' ? ZH.toHant(tip) : tip);
    });
  }

  /* Labels that a screen reader reads, and the two picture captions that the
     markup holds in one attribute, follow the chosen language too. Split out
     from relocalize() so a page opened straight at one language (a shared
     link with ?lang=) is localised before anything is drawn. */
  /* ------------------------------------------------------------------ */
  /* Folding sections and the guide panel                                */
  /* ------------------------------------------------------------------ */
  /* The guide runs to a long scroll. Each section can be folded down to
     its heading, so a reader who wants one part of the guide does not have
     to pass through the other eleven. Only one part is open at a time:
     opening a section folds the rest of the guide away. Which parts are
     open is kept in local storage, so the choice survives a reload. */
  var SECTIONS = [
    { id: 'tide',       num: '01', en: 'The sandbar has a schedule', zh: '连岛沙洲时间表' },
    { id: 'map',        num: '02', en: 'Map and route',               zh: '地图与路线' },
    { id: 'elevation',  num: '03', en: 'The climb, in metres',         zh: '以米为单位的起伏' },
    { id: 'tombolo',    num: '04', en: 'A bridge that comes and goes', zh: '一座时有时无的桥' },
    { id: 'stages',     num: '05', en: 'Four walks',                   zh: '四段路线' },
    { id: 'shade',      num: '06', en: 'Sun exposure',                 zh: '全程日照' },
    { id: 'notes',      num: '07', en: 'Field cautions',               zh: '实地提醒' },
    { id: 'vegetation', num: '08', en: 'Plant communities',            zh: '植被分区' },
    { id: 'photos',     num: '09', en: 'Photographs',                  zh: '照片' },
    { id: 'reading',    num: '10', en: 'Reading and records',          zh: '文献与方志' },
    { id: 'advice',     num: '11', en: 'Before the boat',              zh: '登船之前' },
    { id: 'survey',     num: '12', en: 'How we know',                  zh: '资料依据' }
  ];
  var FOLD_KEY = 'si-open';

  /* The guide runs as an accordion. One part of the guide is open at a
     time: opening a part folds the other eleven away, so a reader who
     wants one thing does not have to pass through the other eleven. The
     parts that are open are kept in local storage, so the choice survives
     a reload. An empty list means the whole guide is folded away; no list
     at all means the reader has not chosen anything yet. */
  function readOpen() {
    var raw = null;
    try { raw = localStorage.getItem(FOLD_KEY); } catch (e) {}
    if (raw === null) return null;
    if (raw === 'none') return [];
    return raw.split(',').filter(function (x) { return isSection(x); });
  }
  function writeOpen(list) {
    try { localStorage.setItem(FOLD_KEY, list.length ? list.join(',') : 'none'); } catch (e) {}
  }
  /* Is this part of the guide standing open right now? */
  function isOpen(id) {
    var list = readOpen();
    return !!list && list.indexOf(id) >= 0;
  }

  /* Each section gets a bar it can be folded behind. The bar sits at the
     top of the section, so a folded guide reads as a list of parts and the
     open one can be closed again from its own heading. */
  function buildFoldHeads() {
    SECTIONS.forEach(function (s) {
      var sec = document.getElementById(s.id);
      if (!sec || sec.getAttribute('data-fold-ready') === '1') return;
      sec.setAttribute('data-fold-ready', '1');

      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'fold-bar';
      bar.setAttribute('data-fold', s.id);
      bar.setAttribute('aria-expanded', 'true');
      bar.setAttribute('aria-controls', s.id + '-body');
      bar.innerHTML =
        '<span class="fold-num" aria-hidden="true">' + s.num + '</span>' +
        '<span class="fold-titles">' + bi(s.en, s.zh) + '</span>' +
        '<span class="fold-mark" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</span>';

      /* Everything already in the section becomes the body that folds away.
         The heading that was there stays visible inside the body, so a
         folded section still shows its own title line. The contents ride
         in an inner wrapper, so they can be held just under the lip of
         the drawer while it is being pulled out. */
      var body = document.createElement('div');
      body.className = 'fold-body';
      body.id = s.id + '-body';
      var inner = document.createElement('div');
      inner.className = 'fold-inner';
      while (sec.firstChild) inner.appendChild(sec.firstChild);
      body.appendChild(inner);
      sec.appendChild(bar);
      sec.appendChild(body);

      /* The run is finished when the browser says the height has settled,
         and also when the clock says it must have, so the drawer can never
         be left half open. */
      body.addEventListener('transitionend', function (e) {
        if (e.target !== body || e.propertyName !== 'height') return;
        foldSettle(body, sec);
      });

      expandHant(bar);
    });
  }

  /* The drawer. A section is not simply there or not there: the height of
     its body runs from nothing to the height of what is inside it, and what
     is inside it comes out from under the lip of the drawer while it runs. */
  var FOLD_MS = 520;
  function foldRun(body, to) {
    if (body._foldTimer) { clearTimeout(body._foldTimer); body._foldTimer = 0; }
    body.style.overflow = 'hidden';
    if (body.parentNode) body.parentNode.classList.add('is-running');
    if (to === 'open') {
      body.hidden = false;
      body.style.height = '0px';
      void body.offsetHeight;
      body.style.height = body.scrollHeight + 'px';
    } else {
      body.style.height = body.getBoundingClientRect().height + 'px';
      void body.offsetHeight;
      body.style.height = '0px';
    }
    body._foldTimer = setTimeout(function () {
      foldSettle(body, body.parentNode);
    }, FOLD_MS + 160);
  }
  /* The drawer has come to rest: the body takes its own height again, and
     a folded one is taken out of the page altogether. */
  function foldSettle(body, sec) {
    if (body._foldTimer) { clearTimeout(body._foldTimer); body._foldTimer = 0; }
    body.style.height = '';
    body.style.overflow = '';
    if (sec) sec.classList.remove('is-running');
    if (sec && sec.classList.contains('is-folded')) body.hidden = true;
  }

  /* Is this one of the twelve parts of the guide? */
  function isSection(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return true;
    return false;
  }
  /* Write the folded state of one section into the page. When the reader
     asks for it, the body of the section is drawn open like a drawer. */
  function applyFoldDom(id, folded, animate) {
    var sec = document.getElementById(id);
    if (!sec) return;
    var body = document.getElementById(id + '-body');
    var bar = sec.querySelector('.fold-bar');
    if (!body || !bar) return;
    bar.setAttribute('aria-expanded', folded ? 'false' : 'true');
    sec.classList.toggle('is-folded', folded);

    if (folded) {
      /* A body that is already out of the page has nothing to run. */
      if (!animate || body.hidden) {
        if (body._foldTimer) { clearTimeout(body._foldTimer); body._foldTimer = 0; }
        sec.classList.remove('is-running');
        body.hidden = true;
        body.style.height = '';
        body.style.overflow = '';
        return;
      }
      foldRun(body, 'close');
      return;
    }
    if (!animate) {
      sec.classList.remove('is-running');
      body.hidden = false;
      body.style.height = '';
      body.style.overflow = '';
      return;
    }
    foldRun(body, 'open');
  }

  /* Open one part of the guide and fold the other eleven away. This is the
     rule the whole page runs on: a part is either the one being read, or a
     line in the table of contents. */
  function openOnly(id) {
    SECTIONS.forEach(function (s) { applyFoldDom(s.id, s.id !== id, true); });
    writeOpen([id]);
    syncGuideState();
    relayoutSection(id);
    /* The pictures inside the part that has just been drawn open have only
       now been given a height, so they are asked for once the drawer has
       come to rest. */
    setTimeout(imgWake, FOLD_MS + 120);
  }
  /* Fold a part away. If it was the last one standing open, the guide closes
     as a whole, which is the same state the panel's FOLD ALL button gives. */
  function closeOne(id) {
    var list = readOpen() || [];
    list = list.filter(function (x) { return x !== id; });
    SECTIONS.forEach(function (s) { applyFoldDom(s.id, list.indexOf(s.id) < 0, s.id === id); });
    writeOpen(list);
    syncGuideState();
  }
  /* The bar of a part opens it; the bar of the open part closes it. */
  function toggleFold(id) {
    if (isOpen(id)) closeOne(id);
    else openOnly(id);
  }
  /* Any link that names a part of the guide opens that part first and then
     goes to it, so a reader who follows a link never lands on a heading
     that is folded shut. */
  var foldScrollTimer = 0;
  function openAndScroll(id) {
    var wasOpen = isOpen(id);
    if (!wasOpen) openOnly(id);
    /* The parts above are on their way out, so the page is still moving
       under the reader. Where the part will finally sit is only known once
       the guide has come to rest, so the page goes there then. */
    if (foldScrollTimer) { clearTimeout(foldScrollTimer); foldScrollTimer = 0; }
    if (wasOpen) { scrollToSection(id); return; }
    foldScrollTimer = setTimeout(function () {
      foldScrollTimer = 0;
      scrollToSection(id);
    }, FOLD_MS + 60);
  }

  function scrollToSection(id) {
    var sec = document.getElementById(id);
    if (!sec) return;
    var navH = 56;
    try {
      navH = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-h')) || navH;
    } catch (e) {}
    var y = sec.getBoundingClientRect().top + window.pageYOffset - navH - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  function applyFoldState() {
    var list = readOpen();
    if (list === null) {
      /* First visit: the guide opens with its first part and the rest folded
         away, so the page is short and every part is one click away. */
      list = ['tide'];
      writeOpen(list);
    }
    /* The page is drawn in the state the reader left it in, with nothing
       to watch: the drawer only runs when the reader pulls it. */
    SECTIONS.forEach(function (s) { applyFoldDom(s.id, list.indexOf(s.id) < 0, false); });
    syncGuideState();
  }

  /* The panel can put the whole guide away, or lay every part out at once
     for a reader who wants to read straight through. */
  function allFolded(folded) {
    var list = folded ? [] : SECTIONS.map(function (s) { return s.id; });
    SECTIONS.forEach(function (s) { applyFoldDom(s.id, folded, true); });
    writeOpen(list);
    syncGuideState();
    if (!folded) relayoutAll();
  }

  /* A section that was folded had its canvas measured at nothing, so the
     part that has just been opened is measured again before it is drawn. */
  function relayoutSection(id) {
    if (id === 'map') { sizeCanvas(); drawTileMap(); }
    else if (id === 'tombolo') { tbLayout(); }
    else if (id === 'shade' && SUN.ready) { smLayout(); if (TX.ready) txRender(); }
    if (typeof queueRedraw === 'function') queueRedraw();
  }
  /* When the whole guide is laid out at once, every drawing is measured. */
  function relayoutAll() {
    relayoutSection('map');
    relayoutSection('tombolo');
    relayoutSection('shade');
  }

  /* ------------------------------------------------------------------ */
  /* The guide panel lists every section, marks the one being read, and
     offers to fold the page down to one section at a time. */
  var guideOpen = false;

  function buildGuideList() {
    var list = $('#guideList');
    if (!list) return;
    list.innerHTML = SECTIONS.map(function (s) {
      return '<a class="guide-item" href="#' + s.id + '" data-guide="' + s.id + '">' +
        '<span class="guide-num" aria-hidden="true">' + s.num + '</span>' +
        '<span class="guide-text">' + bi(s.en, s.zh) + '</span>' +
        '<span class="guide-fold" data-fold-toggle="' + s.id + '" role="button" tabindex="0" aria-label="Open or close this section"></span>' +
      '</a>';
    }).join('');
    expandHant(list);
  }

  function syncGuideState() {
    var list = readOpen() || [];
    SECTIONS.forEach(function (s) {
      var mark = document.querySelector('[data-fold-toggle="' + s.id + '"]');
      if (!mark) return;
      var on = list.indexOf(s.id) < 0;
      mark.classList.toggle('is-folded', on);
      mark.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function openGuide() {
    var panel = $('#guidePanel');
    var back = $('#guideBackdrop');
    if (!panel) return;
    panel.hidden = false;
    if (back) back.hidden = false;
    guideOpen = true;
    document.body.classList.add('guide-open');
    var toggle = $('#guideToggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () {
      panel.classList.add('is-open');
      if (back) back.classList.add('is-open');
    });
    syncGuideState();
    highlightGuide();
  }

  function closeGuide() {
    var panel = $('#guidePanel');
    var back = $('#guideBackdrop');
    if (!panel) return;
    panel.classList.remove('is-open');
    if (back) back.classList.remove('is-open');
    guideOpen = false;
    document.body.classList.remove('guide-open');
    var toggle = $('#guideToggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      if (guideOpen) return;
      panel.hidden = true;
      if (back) back.hidden = true;
    }, 320);
  }

  /* The section the reader is in is marked in the guide. */
  function highlightGuide() {
    var current = '';
    SECTIONS.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= 160) current = s.id;
    });
    $$('#guideList .guide-item').forEach(function (a) {
      a.classList.toggle('is-current', a.getAttribute('data-guide') === current);
    });
  }

  function wireGuide() {
    var toggle = $('#guideToggle');
    if (toggle) toggle.addEventListener('click', function () {
      if (guideOpen) closeGuide(); else openGuide();
    });
    var close = $('#guideClose');
    if (close) close.addEventListener('click', closeGuide);
    var back = $('#guideBackdrop');
    if (back) back.addEventListener('click', closeGuide);

    var expand = $('#guideExpandAll');
    if (expand) expand.addEventListener('click', function () { allFolded(false); });
    var collapse = $('#guideCollapseAll');
    if (collapse) collapse.addEventListener('click', function () { allFolded(true); });

    /* One handler for every way into a part of the guide: the bar at the top
       of each part, the small square in the panel, the panel list itself,
       the index of sections under the title, the two buttons in the hero
       and the links in the bar at the top of the page. Opening a part folds
       the other eleven away, and a link that names a part goes to it. */
    document.addEventListener('click', function (e) {
      var foldBtn = e.target.closest('[data-fold-toggle]');
      if (foldBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleFold(foldBtn.getAttribute('data-fold-toggle'));
        return;
      }
      var bar = e.target.closest('.fold-bar');
      if (bar) {
        e.preventDefault();
        toggleFold(bar.getAttribute('data-fold'));
        return;
      }
      var link = e.target.closest('a[href^="#"]');
      if (link) {
        var target = (link.getAttribute('href') || '').slice(1);
        if (isSection(target)) {
          e.preventDefault();
          openAndScroll(target);
          if (guideOpen) closeGuide();
        }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && guideOpen) closeGuide();
      if (e.key === 'Enter' || e.key === ' ') {
        var mark = e.target.closest && e.target.closest('[data-fold-toggle]');
        if (mark) {
          e.preventDefault();
          e.stopPropagation();
          toggleFold(mark.getAttribute('data-fold-toggle'));
        }
      }
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!guideOpen || ticking) return;
      ticking = true;
      requestAnimationFrame(function () { highlightGuide(); ticking = false; });
    }, { passive: true });
  }

  function relocalizeMeta() {
    document.title = tr('SHARP ISLAND: ONE ROUTE, ONE ISLAND', '桥咀洲：一条路线，一座岛');
    $('.nav').setAttribute('aria-label', tr('Main navigation', '主导航'));
    $('.hero-index').setAttribute('aria-label', tr('Sections of the guide', '全篇目录'));
    $('#langSwitch').setAttribute('aria-label', tr('Language', '语言版本'));
    $('#themeToggle').setAttribute('aria-label', tr('Switch appearance', '切换外观'));
    $('#themeToggle').setAttribute('title', tr('Switch appearance', '切换外观'));
    $('#guideToggle').setAttribute('aria-label', tr('Open the guide', '打开导览'));
    $('#guideToggle').setAttribute('title', tr('Open the guide', '打开导览'));
    $('#guidePanel').setAttribute('aria-label', tr('Guide to the sections', '全篇导览'));
    $('#guideClose').setAttribute('aria-label', tr('Close the guide', '关闭导览'));
    $('#guideExpandAll').setAttribute('title', tr('Open every section', '展开全部板块'));
    $('#guideCollapseAll').setAttribute('title', tr('Fold every section', '折叠全部板块'));
    $('#zoomIn').setAttribute('aria-label', tr('Zoom in', '放大'));
    $('#zoomOut').setAttribute('aria-label', tr('Zoom out', '缩小'));
    $('#zoomReset').setAttribute('aria-label', tr('Reset view', '重置视图'));
    $('#playBtn').setAttribute('aria-label', tr('Play route animation', '播放路线动画'));
    $('#routeScrub').setAttribute('aria-label', tr('Route progress', '路线进度'));
    $('#tideSlider').setAttribute('aria-label', tr('Tide height in centimetres', '潮高，以厘米计'));
    var sunSlider = $('#sunSlider');
    if (sunSlider) sunSlider.setAttribute('aria-label', tr('Time of day on 13 November 2026', '2026 年 11 月 13 日的当日时间'));
    var sunCanvas = $('#sunCanvas');
    if (sunCanvas) sunCanvas.setAttribute('aria-label', tr('Three dimensional model of Sharp Island showing the shadows cast by the sun on 13 November 2026', '桥咀洲三维日照模型，显示 2026 年 11 月 13 日太阳投下的影子'));
    $('#drawerClose').setAttribute('aria-label', tr('Close detail', '关闭详情'));
    $('#lbClose').setAttribute('aria-label', tr('Close photograph', '关闭照片'));
    $('#lbPrev').setAttribute('aria-label', tr('Previous photograph', '上一张照片'));
    $('#lbNext').setAttribute('aria-label', tr('Next photograph', '下一张照片'));
    $('#drawer').setAttribute('aria-label', tr('Observation point detail', '观察点详情'));
    $('#lightbox').setAttribute('aria-label', tr('Photograph viewer', '照片浏览器'));
    $('#tileMap').setAttribute('aria-label', tr('Interactive tiled map of the Sharp Island route, with a street map, a satellite view and a satellite view with place names', '桥咀洲路线互动地图，可切换街道底图、卫星影像与卫星加地名'));
    $('#tideModel').setAttribute('aria-label', tr('Shaded relief map of the Sharp Island tombolo, flooded to the selected tide height', '连岛沙洲晕渲图，按选定潮高淹没'));
    $('#profileChart').setAttribute('aria-label', tr('Elevation profile of the Sharp Island route', '桥咀洲路线海拔剖面'));
    $('#tideSection').setAttribute('aria-label', tr('Cross section along the tombolo showing the saddle and the water level', '连岛沙洲横剖面，显示鞍部与水位'));
    $('#stopsRail').setAttribute('aria-label', tr('Observation points', '观察点'));
    $$('img[data-alt-zh]').forEach(function (img) {
      if (!img.getAttribute('data-alt-en')) img.setAttribute('data-alt-en', img.getAttribute('alt') || '');
      img.alt = tr(img.getAttribute('data-alt-en'), img.getAttribute('data-alt-zh'));
    });
  }

  function relocalize() {
    relocalizeMeta();
    buildStops();
    buildStages();
    buildRibbon();
    buildNotes();
    buildVegetation();
    buildGallery();
    buildReading();
    buildAdvice();
    buildSurvey();
    buildProfile();
    buildSection();
    smBuildTable();
    if (SUN.ready) smRender();
    if (TX.ready) txRender();
    drawTileMap();
    drawTombolo();
    setProgress(state.progress);
    setTide(state.tide, true);
    if (!$('#lightbox').hidden) updateLightbox();
    observeReveals(true);
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                               */
  /* ------------------------------------------------------------------ */
  /* Blocks fade in as they come into view. Changing the language rebuilds
     those blocks, and the new ones have never been seen by the observer, so
     they are handed back to it after every rebuild. */
  var revealIO = null;
  function observeReveals(keepLit) {
    if (!revealIO) return;
    var h = window.innerHeight;
    $$('.reveal').forEach(function (el) {
      if (el.classList.contains('in')) return;
      /* After a rebuild the blocks above the fold have already been seen, so
         they stay lit; the rest wait for the observer to bring them in. */
      if (keepLit && el.getBoundingClientRect().top < h) { el.classList.add('in'); return; }
      revealIO.observe(el);
    });
  }
  function wire() {
    var nb = $('#mapNote');
    if (nb) nb.addEventListener('click', function () { nb.hidden = true; });
    $('#mapModes').addEventListener('click', function (e) {
      var b = e.target.closest('.mode-btn');
      if (b) setBasemap(b.dataset.mode);
    });

    $('#zoomIn').addEventListener('click', function () {
      state.zoom = clamp(state.zoom+1, Z_MIN, Z_MAX); drawTileMap();
    });
    $('#zoomOut').addEventListener('click', function () {
      state.zoom = clamp(state.zoom-1, Z_MIN, Z_MAX); drawTileMap();
    });
    $('#zoomReset').addEventListener('click', function () {
      var c0 = gcj(22.3625, 114.2915);
      state.zoom = 15.4; state.center = { lat: c0.lat, lng: c0.lng }; drawTileMap();
    });

    $('#routeScrub').addEventListener('input', function (e) { setProgress(Number(e.target.value)/1000); });
    $('#playBtn').addEventListener('click', togglePlay);
    $('#stageChips').addEventListener('click', function (e) {
      var b = e.target.closest('.stage-chip');
      if (b) { var s = D.stages.filter(function (x) { return x.id === b.dataset.stage; })[0]; setProgress(s.startProgress + .001); }
    });
    $('#stopsRail').addEventListener('click', function (e) {
      var b = e.target.closest('.stop-card'); if (b) openPoint(b.dataset.point);
    });
    $('#stageCards').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-photos]');
      if (b) openLightbox(b.dataset.photos.split(','), Number(b.dataset.idx), 'STAGE FIELD PHOTOGRAPH', '分段实地照片');
    });
    $('#notesGrid').addEventListener('click', function (e) {
      var im = e.target.closest('img[data-photo]');
      if (im) openLightbox([im.dataset.photo], 0, im.dataset.caption, im.dataset.captionZh || im.dataset.caption);
    });
    $('#photoGroups').addEventListener('click', function (e) {
      var b = e.target.closest('.gal-open');
      if (!b) return;
      var grp = galleryIndex[b.dataset.group];
      if (!grp) return;
      openLightbox(grp.ids, Number(b.dataset.idx), grp.en, grp.zh, grp.capsEn, grp.capsZh);
    });

    $('#tideSlider').addEventListener('input', function (e) {
      if (state.tidePlaying) toggleTide();
      setTide(Number(e.target.value)/100, true);
    });
    $('#tidePlay').addEventListener('click', toggleTide);

    var sunSlider = $('#sunSlider');
    if (sunSlider && $('#sunPlay')) {
      sunSlider.addEventListener('input', function (e) {
        if (SUN.playing) smToggle();
        smSetTime(Number(e.target.value));
      });
      $('#sunPlay').addEventListener('click', smToggle);
    }

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#drawerContent').addEventListener('click', function (e) {
      var nav = e.target.closest('.d-nav');
      if (nav) { moveDrawerPhoto(Number(nav.dataset.dir)); return; }
      var im = e.target.closest('img');
      if (im && state.point) openLightbox(state.point.photos, Number(im.dataset.idx || 0), state.point.name, state.point.zh);
    });
    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lbPrev').addEventListener('click', function () { moveLightbox(-1); });
    $('#lbNext').addEventListener('click', function () { moveLightbox(1); });
    $('#lightbox').addEventListener('click', function (e) { if (e.target === $('#lightbox')) closeLightbox(); });
    document.addEventListener('keydown', function (e) {
      if (!$('#lightbox').hidden) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') moveLightbox(-1);
        else if (e.key === 'ArrowRight') moveLightbox(1);
        return;
      }
      if (!$('#drawer').hidden) {
        if (e.key === 'Escape') closeDrawer();
        else if (e.key === 'ArrowLeft') moveDrawerPhoto(-1);
        else if (e.key === 'ArrowRight') moveDrawerPhoto(1);
      }
    });

    $('#langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('.lang-btn');
      if (b) setLang(b.dataset.lang);
    });

    try {
      var saved = localStorage.getItem('si-theme');
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) {}
    $('#themeToggle').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('si-theme', next); } catch (e) {}
      drawTileMap();
      drawTombolo();
    });

    /* Rebuilding the relief costs a pass over every pixel, so the resize
       handler waits until the size has actually settled and skips the work
       when the box did not change. */
    var relayoutTimer = 0, lastW = 0, lastH = 0;
    var relayout = function () {
      var w = tbC.clientWidth, h = tbC.clientHeight;
      sizeCanvas(); drawTileMap();
      if (w === lastW && h === lastH && tbContours.length) return;
      clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(function () {
        lastW = tbC.clientWidth; lastH = tbC.clientHeight;
        tbLayout();
        if (SUN.ready) smLayout();
        if (TX.ready) txRender();
      }, 140);
    };
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(relayout);
      ro.observe(canvas); ro.observe(tbC);
    }
    window.addEventListener('resize', relayout, { passive: true });
    if ('IntersectionObserver' in window) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); } });
      }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
      observeReveals();
    } else $$('.reveal').forEach(function (el) { el.classList.add('in'); });

    var links = $$('.nav-links a');
    var ids = links.map(function (a) { return a.getAttribute('href').slice(1); });
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var current = '';
        ids.forEach(function (id) { var el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 150) current = id; });
        links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#'+current); });
        ticking = false;
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Photographs                                                          */
  /* ------------------------------------------------------------------ */
  /* Every photograph is a file in assets/photos, asked for only when the
     picture comes near the screen. A browser that never gets round to
     asking leaves the box it reserved standing empty, and from where the
     reader sits that is indistinguishable from a photograph the page does
     not have. So anything on screen and still empty is asked for again,
     directly, with the hint that deferred it dropped.

     A file that cannot be read at all is marked, and named once in the
     console. That separates the two things a reader would otherwise have
     to guess between: a page still filling in, and files that never
     arrived, which is what happens when the folder is copied across
     without the contents of assets/photos, or when Windows holds back
     files that came out of a downloaded archive. */
  function imgWake() {
    var imgs = document.images, woken = 0;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i], src = im.getAttribute('src');
      if (!src || im.naturalWidth || im.dataset.woken) continue;
      var r = im.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < -240 || r.top > (window.innerHeight || 0) + 480) continue;
      im.dataset.woken = '1';
      im.loading = 'eager';
      im.src = src;
      woken++;
    }
    return woken;
  }
  /* A photograph that fails is hatched where it stands, and named once in
     the console. The browser fires this whether the picture was asked for
     by the page or by imgWake above, so nothing has to be polled. */
  function imgFault(im) {
    if (!im || im.tagName !== 'IMG' || im.classList.contains('img-fault')) return;
    /* An image with no source asked for nothing, so nothing failed. */
    var src = im.getAttribute('src');
    if (!src) return;
    im.classList.add('img-fault');
    if (window.console && console.warn) console.warn('PHOTOGRAPH NOT READ: ' + src);
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG') imgFault(t);
  }, true);
  /* A photograph that failed before this line ran has already settled:
     the request is over, and nothing came back. */
  (function () {
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.complete && im.currentSrc && !im.naturalWidth) imgFault(im);
    }
  })();

  /* ------------------------------------------------------------------ */
  /* The visitor's last choice of language is remembered; English is the
     default. The Traditional twin of every Chinese block is generated once
     here, before anything is drawn. */
  try {
    var savedLang = localStorage.getItem('si-lang');
    if (savedLang && LANGS.indexOf(savedLang) >= 0) state.lang = savedLang;
  } catch (e) {}
  /* A link may name the language outright, so one version can be sent on. */
  var urlLang = (location.search.match(/[?&]lang=(zh-hans|zh-hant|en)(&|$)/) || [])[1];
  if (urlLang) state.lang = urlLang;
  document.documentElement.dataset.lang = state.lang;
  document.documentElement.lang = state.lang === 'en' ? 'en' : (state.lang === 'zh-hant' ? 'zh-Hant-HK' : 'zh-Hans');
  applyLangButtons(state.lang);
  expandHant(document.body);
  relocalizeMeta();

  try {
    var savedBase = localStorage.getItem('si-basemap');
    if (savedBase && BASEMAPS.some(function (b) { return b.id === savedBase; })) state.basemap = savedBase;
  } catch (e) {}

  buildStops();
  buildStages();
  buildRibbon();
  buildNotes();
  buildVegetation();
  buildGallery();
  buildReading();
  buildAdvice();
  buildSurvey();
  buildProfile();
  sizeCanvas();
  buildMapModes();
  drawTileMap();
  tbLayout();
  buildSection();
  if (smDecode()) { smBuildTable(); txBuild(); txRender(); smLayout(); }
  /* The fold bars are built before the blocks are drawn, so the fold
     wrapper holds the finished content rather than an empty shell. */
  buildFoldHeads();
  buildGuideList();
  applyFoldState();
  wire();
  wireGuide();
  /* Photographs fill in as the reader moves down the page. The first pass
     runs as soon as the guide is whole, and one more a second later picks
     up anything the browser put off. */
  imgWake();
  window.addEventListener('load', function () {
    imgWake();
    setTimeout(imgWake, 1400);
  });
  var wakeTick = false;
  window.addEventListener('scroll', function () {
    if (wakeTick) return;
    wakeTick = true;
    requestAnimationFrame(function () { wakeTick = false; imgWake(); });
  }, { passive: true });
  setProgress(0);
  setTide(0.95, true);
  /* The tiles come from the network. If they do not, the local survey tiles
     take over and the page says so. */
  setTimeout(checkMapService, 5000);

  /* The page is whole. index.html watches for this flag and puts up a notice
     if it never arrives, which is what happens when the file is opened on
     its own without the data and assets beside it. */
  window.__siBooted = true;
})();
