/* Sharp Island: GIS field guide interactions
   - Tencent Maps GL JS vector basemap at street zoom, with our route and points
     drawn as vector overlays. Local terrain tiles serve as an offline fallback.
   - One interactive route: scrubber, elevation profile, observation drawer.
   - A tide model of the tombolo: analytic surface, 0.5 m contours, live waterline.
*/
(function () {
  'use strict';

  var D = window.FIELD_DATA;
  var T = window.TERRAIN;
  var V = window.VEGETATION || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var photo = function (id) { return 'assets/photos/' + id + '.jpg'; };
  var thumb = function (id) { return 'assets/photos/thumbs/' + id + '.jpg'; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var shadeName = { mostly: 'MOSTLY SHADED', partly: 'PARTLY SHADED', unshaded: 'UNSHADED' };
  var shadeZh = { mostly: '大部份遮阴', partly: '部份遮阴', unshaded: '无遮阴' };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  var proxyReady = !!(window._TMapSecurityConfig &&
    window._TMapSecurityConfig.serviceHost &&
    window._TMapSecurityConfig.serviceHost.indexOf('__WB_') === -1);

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
    point: null, drawerIdx: 0, lbPhotos: [], lbIdx: 0
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
  /* Scale bar, shared by the canvas map and the Tencent basemap          */
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
  /* Canvas tiled map: offline fallback when the basemap cannot load      */
  /* ------------------------------------------------------------------ */
  var canvas = $('#tileMap'), ctx = canvas.getContext('2d');
  var tileCache = {}, tileW = 0, tileH = 0, mapFallback = false;
  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    tileW = canvas.clientWidth || 800; tileH = canvas.clientHeight || 520;
    canvas.width = Math.round(tileW*dpr); canvas.height = Math.round(tileH*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function getTile(kind, z, x, y) {
    var key = kind+'/'+z+'/'+x+'/'+y;
    if (tileCache[key]) return tileCache[key];
    if (!tileInRange(x, y, z)) return null;
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { im.ready = true; if (mapFallback) drawTileMap(); };
    im.onerror = function () { im.failed = true; };
    im.src = 'assets/tiles/'+kind+'/'+z+'/'+x+'/'+y+'.png';
    tileCache[key] = im;
    return im;
  }

  function drawTileMap() {
    if (!tileW || !tileH) sizeCanvas();
    var w = tileW, h = tileH, z = state.zoom, tz = clamp(Math.round(z), 13, 17);
    var scale = Math.pow(2, z - tz);
    var cc = merc(state.center.lat, state.center.lng, z);
    var px0 = cc.x - w/2, py0 = cc.y - h/2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--tile-sea') || '#7993a0';
    ctx.fillRect(0, 0, w, h);

    var ts = 256*scale;
    var bx0 = Math.floor(px0/ts), bx1 = Math.floor((px0+w)/ts);
    var by0 = Math.floor(py0/ts), by1 = Math.floor((py0+h)/ts);
    for (var x = bx0; x <= bx1; x++) {
      for (var y = by0; y <= by1; y++) {
        var sx = x*ts - px0, sy = y*ts - py0;
        var base = getTile('base', tz, x, y);
        if (base && base.ready) ctx.drawImage(base, sx, sy, ts+1, ts+1);
        var ov = getTile('overlay', tz, x, y);
        if (ov && ov.ready) {
          ctx.save(); ctx.globalAlpha = .78;
          ctx.drawImage(ov, sx, sy, ts+1, ts+1); ctx.restore();
        }
      }
    }

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

  /* pointer interaction on the fallback canvas */
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
      state.zoom = clamp(pinch.zoom + Math.log2(d/pinch.d), 13, 17.4);
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
    var z1 = clamp(z0 - e.deltaY*0.0022, 13, 17.4);
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
  /* Tencent Maps basemap                                                 */
  /* ------------------------------------------------------------------ */
  var tmap = null, tMarkers = null, tLine = null, tCursor = null;
  var sdkRequested = false, tmapReady = false;
  var Z_BASE = 16;

  function markerSvg(num, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="15" fill="'+color+'" stroke="#fff" stroke-width="3.5"/>' +
      '<text x="20" y="25" font-family="Arial" font-size="13" font-weight="700" text-anchor="middle" fill="#fff">'+num+'</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function initTencent() {
    if (!window.TMap || tmapReady) return;
    try {
      tmap = new TMap.Map(document.getElementById('tmap'), {
        zoom: Z_BASE,
        center: new TMap.LatLng(state.center.lat, state.center.lng),
        pitch: 0, rotation: 0,
        minZoom: 12, maxZoom: 18,
        baseMap: { type: 'vector', features: ['base', 'label'] }
      });
      tmapReady = true;
      var styles = {};
      D.points.forEach(function (p) {
        styles[p.id] = new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: markerSvg(p.code, '#1d1d1f') });
      });
      tMarkers = new TMap.MultiMarker({ map: tmap, styles: styles,
        geometries: D.points.map(function (p) { var g = gcj(p.lat, p.lng); return { id: p.id, styleId: p.id, position: new TMap.LatLng(g.lat, g.lng) }; }) });
      tMarkers.on('click', function (evt) { if (evt && evt.geometry) openPoint(evt.geometry.id); });
      tLine = new TMap.MultiPolyline({ map: tmap,
        styles: { line: new TMap.PolylineStyle({ color: '#0066cc', width: 7, borderWidth: 2, borderColor: '#ffffff' }) },
        geometries: [{ id: 'route', styleId: 'line',
          paths: PATH.map(function (p) { var g = gcj(p[0], p[1]); return new TMap.LatLng(g.lat, g.lng); }) }] });
      tCursor = new TMap.MultiMarker({ map: tmap,
        styles: { cur: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: markerSvg('', '#0066cc') }) },
        geometries: [] });
      updateTencentCursor();
      useOfficial();
      try { tmap.on('zoom_changed', function () { updateScale(tmap.getZoom()); }); } catch (e) {}
    } catch (err) {
      tmapReady = false;
      useFallback('The basemap could not be started here. Local survey tiles are shown instead.', '底图在此环境未能启动，已改用本地地形瓦片。');
    }
  }

  function updateTencentCursor() {
    if (!tCursor) return;
    var s = sampleAt(state.progress), g = gcj(s.lat, s.lng);
    try { tCursor.setGeometries([{ id: 'cursor', styleId: 'cur', position: new TMap.LatLng(g.lat, g.lng) }]); } catch (e) {}
  }

  function useOfficial() {
    mapFallback = false;
    canvas.hidden = true;
    $('#tmap').hidden = false;
    var nb = $('#mapNote'); if (nb) nb.hidden = true;
    try { updateScale(tmap.getZoom()); } catch (e) {}
  }

  function useFallback(en, zh) {
    mapFallback = true;
    $('#tmap').hidden = true;
    canvas.hidden = false;
    sizeCanvas(); drawTileMap();
    var nb = $('#mapNote');
    if (en) { nb.innerHTML = en + '<span class="bi-zh">' + zh + '</span>'; nb.hidden = false; }
  }

  function loadTencentSDK() {
    if (sdkRequested) return;
    sdkRequested = true;
    var s = document.createElement('script');
    s.src = 'https://map.qq.com/api/gljs?v=1.exp';
    s.async = true;
    s.onload = function () { setTimeout(initTencent, 80); };
    s.onerror = function () { useFallback('The map service is unreachable. Local survey tiles are shown.', '地图服务无法连接，已显示本地地形瓦片。'); };
    document.head.appendChild(s);
    setTimeout(function () {
      if (!tmapReady && !mapFallback) {
        useFallback('The basemap did not load in time. Local survey tiles are shown.', '底图未能及时载入，已显示本地地形瓦片。');
      }
    }, 7000);
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
      g.push('<text class="pf-axis" x="'+(PF.left-9)+'" y="'+(py(e)+3)+'" text-anchor="end">'+e+' m</text>');
    }
    for (var km = 0; km <= TOTAL+.001; km += .5) {
      var x = px(km);
      g.push('<line class="pf-grid" x1="'+x+'" y1="'+PF.top+'" x2="'+x+'" y2="'+(PF.h-PF.bottom)+'"/>');
      g.push('<text class="pf-axis" x="'+x+'" y="'+(PF.h-PF.bottom+18)+'" text-anchor="middle">'+km.toFixed(1)+' km</text>');
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
        '" text-anchor="middle">'+s.id+' '+s.name.toUpperCase()+'</text>');
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

    $('#elevStats').innerHTML =
      '<div><dt>HIGH POINT<span class="bi-zh">最高点</span></dt><dd>'+Math.round(MAXE)+'<small>m</small></dd></div>' +
      '<div><dt>TOTAL ASCENT<span class="bi-zh">累计爬升</span></dt><dd>'+Math.round(ASCENT)+'<small>m</small></dd></div>' +
      '<div><dt>ROUTE LENGTH<span class="bi-zh">路线长度</span></dt><dd>'+TOTAL.toFixed(2)+'<small>km</small></dd></div>' +
      '<div><dt>SADDLE CREST<span class="bi-zh">沙洲鞍部</span></dt><dd>1.25<small>m</small></dd></div>';
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
  var TB = {
    along: 240,        /* metres from the island shore to the Kiu Tau shore */
    halfW: 24,         /* half width of the bar crest */
    crestEnd: 1.70,    /* crest where the bar meets each shore */
    crestMid: 1.25,    /* saddle, set to the threshold on the pier board */
    nx: 264, ny: 280,
    x0: -210, x1: 210, y0: -180, y1: 352
  };
  var TB_BASE = -2.6;  /* depth of the open channel */

  function sstep(a, b, v) {
    var t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* Centre line of the bar. Shared so the section can put its crest label in
     the right place rather than assuming the bar runs along x = 0. */
  function barDrift(y) {
    return 11 * Math.sin(y / 74 + .55) *
           Math.sin(Math.PI * clamp(y / TB.along, 0, 1));
  }

  /* Analytic surface, in metres above chart datum. Every term stays continuous
     in both directions, so the shoreline is simply where the surface crosses
     zero. An earlier version switched the headlands off with a conditional at
     the shore, which put a ten-metre cliff across the grid. */
  function tbSurface(x, y) {
    var t = clamp(y / TB.along, 0, 1);

    /* Main island. A promontory rather than a wall of land: the ramp leaves the
       shore almost flat, climbs inland, then runs back down to the sea behind
       the frame. Nothing here is switched off by a conditional, so the whole
       surface stays continuous and the coastline is where it crosses zero. */
    var taperIsle = sstep(-180, -102, y);
    var rampIsle = (1 - Math.exp(-Math.pow(Math.max(0, -y) / 58, 1.18))) * taperIsle;
    var shapeIsle = Math.exp(-Math.pow(Math.abs(x) / 96, 2.6));
    var isle = 24 * rampIsle * shapeIsle - (1 - shapeIsle) * 3.1;
    /* a shoulder and a knoll, so the island is not one smooth dome */
    isle += 7.5 * Math.exp(-(Math.pow((x + 34) / 46, 2) + Math.pow((y + 132) / 46, 2))) * taperIsle;
    isle += 4.6 * Math.exp(-(Math.pow((x - 42) / 38, 2) + Math.pow((y + 76) / 32, 2))) * taperIsle;

    /* Kiu Tau, a low islet at the far end of the crossing. */
    var rampKiu = 1 - Math.exp(-Math.pow(Math.max(0, y - TB.along) / 48, 1.15));
    var shapeKiu = Math.exp(-Math.pow(Math.abs(x - 3) / 56, 2.6)) * (1 - sstep(296, 348, y));
    var kiu = 17 * rampKiu * shapeKiu - (1 - shapeKiu) * 3.1;

    /* The bar. The crest is high where it meets each shore and dips to the
       threshold at mid channel. Its centre drifts and its width breathes, so
       the outline is not two parallel edges running the length of the strait. */
    var crest = TB.crestMid + (TB.crestEnd - TB.crestMid) *
                Math.pow(Math.abs(2 * t - 1), 1.8);
    var drift = barDrift(y);
    var halfW = TB.halfW * (1 + .17 * Math.sin(y / 47 - .9));
    var win = sstep(-30, -8, y) * (1 - sstep(TB.along - 14, TB.along + 4, y));
    var bar = TB_BASE + (crest - TB_BASE) *
              Math.exp(-Math.pow((x - drift) / halfW, 2)) * win;

    var h = Math.max(isle, kiu, bar);
    /* A little undulation. It is scaled by height on land so the hill tops stay
       smooth, and it keeps running under water so the channel has some depth
       variation instead of one flat blue. */
    h += .30 * Math.sin(x / 31 + y / 47) * Math.cos(y / 37) * clamp(h / 3.5, 0, 1);
    h += .55 * Math.sin(x / 64 + y / 88) * (1 - clamp(h / 3, 0, 1));
    return h;
  }

  var tbC = $('#tideModel'), tbCtx = tbC.getContext('2d');
  var tbW = 0, tbH = 0;
  var tbNodes = [], tbContours = [], tbThreshold = [];
  /* The relief is baked once per layout; only the water is redrawn per tide.
     Painting thirty thousand cells every animation frame is what forces a
     coarse grid, and a coarse grid is what makes the coastline look stepped. */
  var tbStatic = document.createElement('canvas');
  var tbSctx = tbStatic.getContext('2d');
  /* A shallow axonometric, just enough tilt that the surface does not read as
     a flat plan, without the grid edges ever becoming visible: the model is
     scaled to overflow the canvas in both directions and is cropped by it. */
  var TB_VIEW = { tilt: .90, skew: .075 };

  function tbLayout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    tbW = tbC.clientWidth || 900; tbH = tbC.clientHeight || 480;
    tbC.width = Math.round(tbW*dpr); tbC.height = Math.round(tbH*dpr);
    tbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tbStatic.width = tbC.width; tbStatic.height = tbC.height;
    tbSctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodes();
    buildContours();
    renderRelief();
    drawTombolo();
  }

  /* Along-bar metres run left to right across the panel; across-bar metres run
     down the panel, compressed a little to suggest ground plane. */
  var TB_K = 1;
  function tbProj(x, y) {
    var dy = y - 118;
    var dx = x - (TB.x0 + TB.x1) / 2;
    return { x: tbW * .5 + dy * TB_K,
             y: tbH * .5 - dx * TB_K * TB_VIEW.tilt + dy * TB_K * TB_VIEW.skew,
             d: y };
  }
  function tbScale() {
    /* 390 m across the panel: the bar plus a slice of each shore. The second
       term keeps the grid wider than the panel on narrow screens. */
    TB_K = Math.max(tbW / 445, tbH / ((TB.x1 - TB.x0) * TB_VIEW.tilt));
  }
  /* Screen back to metres. Needed to decide which contour stretches belong to
     the bar rather than to a headland. */
  function tbUnproj(sx, sy) {
    var dy = (sx - tbW * .5) / TB_K;
    var dx = (tbH * .5 + dy * TB_K * TB_VIEW.skew - sy) / (TB_K * TB_VIEW.tilt);
    return { x: dx + (TB.x0 + TB.x1) / 2, y: dy + 118 };
  }

  function buildNodes() {
    tbScale();
    tbNodes = new Array((TB.nx+1)*(TB.ny+1));
    for (var j = 0; j <= TB.ny; j++) {
      for (var i = 0; i <= TB.nx; i++) {
        var x = TB.x0 + (TB.x1-TB.x0)*i/TB.nx;
        var y = TB.y0 + (TB.y1-TB.y0)*j/TB.ny;
        var z = tbSurface(x, y);
        var p = tbProj(x, y);
        tbNodes[j*(TB.nx+1)+i] = { x: p.x, y: p.y, d: p.d, z: z };
      }
    }
  }

  /* Marching squares over the grid. Geometry is fixed, so results are cached;
     the waterline reuses the same routine at the live tide height. */
  function marching(level, out) {
    var W = TB.nx+1;
    for (var j = 0; j < TB.ny; j++) {
      for (var i = 0; i < TB.nx; i++) {
        var a = tbNodes[j*W+i], b = tbNodes[j*W+i+1];
        var c2 = tbNodes[(j+1)*W+i+1], d2 = tbNodes[(j+1)*W+i];
        var idx = (a.z > level ? 1 : 0) | (b.z > level ? 2 : 0) |
                  (c2.z > level ? 4 : 0) | (d2.z > level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var ip = function (p, q2) {
          var t = (level - p.z) / (q2.z - p.z);
          return [p.x + (q2.x-p.x)*t, p.y + (q2.y-p.y)*t];
        };
        var top = ip(a, b), right = ip(b, c2), bottom = ip(d2, c2), left = ip(a, d2);
        switch (idx) {
          case 1: case 14: out.push([left, top]); break;
          case 2: case 13: out.push([top, right]); break;
          case 3: case 12: out.push([left, right]); break;
          case 4: case 11: out.push([right, bottom]); break;
          case 6: case 9: out.push([top, bottom]); break;
          case 7: case 8: out.push([left, bottom]); break;
          case 5: out.push([left, top], [right, bottom]); break;
          case 10: out.push([top, right], [left, bottom]); break;
        }
      }
    }
    return out;
  }

  function buildContours() {
    tbContours = [];
    /* only the levels that occur on the bar, and only the stretches of those
       lines that are near the bar: carried round the headlands they read as a
       bright halo instead of as a map */
    function near(x, y) {
      return Math.abs(x - barDrift(y)) < 64 && y > -26 && y < 266;
    }
    function keep(segs) {
      var out = [];
      for (var i = 0; i < segs.length; i++) {
        var sg = segs[i];
        var mx = (sg[0][0] + sg[1][0]) / 2, my = (sg[0][1] + sg[1][1]) / 2;
        var w = tbUnproj(mx, my);
        if (near(w.x, w.y)) out.push(sg);
      }
      return out;
    }
    for (var lv = 1; lv <= 3; lv++) {
      var segs = keep(marching(lv * .5, []));
      if (segs.length) tbContours.push(segs);
    }
    tbThreshold = keep(marching(1.25, []));
  }

  function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
  function rgb(c2) { return 'rgb(' + Math.round(clamp(c2[0],0,255)) + ',' + Math.round(clamp(c2[1],0,255)) + ',' + Math.round(clamp(c2[2],0,255)) + ')'; }

  function landTone(z) {
    if (z < 1) return [209, 196, 162];
    if (z < 1.9) return mix([216, 204, 171], [190, 197, 160], (z-1)/.9);
    if (z < 4.5) return mix([182, 195, 152], [150, 176, 132], (z-1.9)/2.6);
    if (z < 13) return mix([144, 172, 126], [112, 148, 108], (z-4.5)/8.5);
    if (z < 22) return mix([110, 148, 110], [124, 158, 120], (z-13)/9);
    return mix([124, 158, 120], [140, 168, 132], clamp((z-22)/9, 0, 1));
  }
  function waterTone(d) {
    if (d < .3) return mix([136, 186, 204], [112, 170, 192], d/.3);
    if (d < 1.2) return mix([112, 170, 192], [74, 136, 162], (d-.3)/.9);
    return mix([74, 136, 162], [56, 108, 132], clamp((d-1.2)/1.4, 0, 1));
  }

  /* The relief, baked once per layout. It is rasterised pixel by pixel rather
     than cell by cell: colouring a 2.5 m grid gives visible steps along the
     shoreline, and stepping the whole grid up to a size where they vanish is
     far slower than one pass over the pixels. */
  var tbRaster = document.createElement('canvas');
  function renderRelief() {
    var W = Math.max(1, Math.round(tbW)), H = Math.max(1, Math.round(tbH));
    tbRaster.width = W; tbRaster.height = H;
    var rctx = tbRaster.getContext('2d');
    var img = rctx.createImageData(W, H);
    var pix = img.data;
    var zs = new Float32Array(W * H);
    var wx = new Float32Array(W * H), wy = new Float32Array(W * H);

    var px, py, w;
    for (py = 0; py < H; py++) {
      for (px = 0; px < W; px++) {
        w = tbUnproj(px + .5, py + .5);
        var i1 = py*W + px;
        wx[i1] = w.x; wy[i1] = w.y;
        zs[i1] = tbSurface(w.x, w.y);
      }
    }

    /* metres per pixel, used to turn the height differences into a slope */
    var mppx = 1 / TB_K, mppy = 1 / (TB_K * TB_VIEW.tilt);
    for (py = 0; py < H; py++) {
      for (px = 0; px < W; px++) {
        var i2 = py*W + px, z = zs[i2];
        var col;
        if (z < 0) {
          col = waterTone(-z);
        } else {
          /* Lambert hillshade, light from the north-west. The slope is
             exaggerated for shading only: at true scale a 24 m hill over
             100 m shades almost flat. */
          var zl = zs[i2 - (px ? 1 : 0)], zr = zs[i2 + (px < W-1 ? 1 : 0)];
          var zu = zs[i2 - (py ? W : 0)], zd = zs[i2 + (py < H-1 ? W : 0)];
          var gx = (zr - zl) / (2 * mppy);      /* screen x runs along the bar */
          var gy = (zd - zu) / (2 * mppx);
          var nx2 = -gy * 15, ny2 = gx * 15, nz = 1;
          var nl = Math.sqrt(nx2*nx2 + ny2*ny2 + 1);
          var lam = (nx2*-.62 + ny2*-.52 + nz*.58) / nl;
          var sh = clamp(.62 + lam*1.12, .60, 1.26);
          var tint = Math.sin(wx[i2]/37 + wy[i2]/53) * .55 +
                     Math.sin(wx[i2]/16.3 - wy[i2]/28.7) * .45;
          col = landTone(z);
          var sc = sh * (1 + tint * .045);
          col = [col[0]*sc, col[1]*sc, col[2]*sc];
        }
        var o = i2 * 4;
        pix[o] = clamp(col[0], 0, 255);
        pix[o+1] = clamp(col[1], 0, 255);
        pix[o+2] = clamp(col[2], 0, 255);
        pix[o+3] = 255;
      }
    }
    rctx.putImageData(img, 0, 0);

    tbSctx.clearRect(0, 0, tbW, tbH);
    tbSctx.drawImage(tbRaster, 0, 0, tbW, tbH);

    /* Half-metre contours, kept to the bar. Carried round the headlands they
       read as a bright halo rather than as a map. */
    tbSctx.lineWidth = .9; tbSctx.lineCap = 'butt'; tbSctx.lineJoin = 'round';
    tbSctx.strokeStyle = 'rgba(74,58,30,.30)';
    tbContours.forEach(function (segs) {
      tbSctx.beginPath();
      segs.forEach(function (sg) { tbSctx.moveTo(sg[0][0], sg[0][1]); tbSctx.lineTo(sg[1][0], sg[1][1]); });
      tbSctx.stroke();
    });
    /* the 1.25 m crest is the line the crossing depends on */
    tbSctx.strokeStyle = 'rgba(44,32,12,.66)'; tbSctx.lineWidth = 1.4;
    tbSctx.beginPath();
    tbThreshold.forEach(function (sg) { tbSctx.moveTo(sg[0][0], sg[0][1]); tbSctx.lineTo(sg[1][0], sg[1][1]); });
    tbSctx.stroke();
  }

  /* Marching squares returns loose segments. Stitch them into closed loops so
     the water can be filled as one shape, with an edge that stays crisp at any
     size instead of stepping from cell to cell. */
  function buildLoops(segs) {
    var pts = {}, adj = {};
    function key(p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }
    segs.forEach(function (sg) {
      var ka = key(sg[0]), kb = key(sg[1]);
      pts[ka] = sg[0]; pts[kb] = sg[1];
      (adj[ka] = adj[ka] || []).push(kb);
      (adj[kb] = adj[kb] || []).push(ka);
    });
    var used = {}, loops = [];
    for (var start in adj) {
      if (used[start]) continue;
      var cur = start, loop = [], guard = 0;
      while (cur && !used[cur] && guard++ < 40000) {
        used[cur] = 1;
        loop.push(pts[cur]);
        var nb = adj[cur], next = null;
        for (var i = 0; i < nb.length; i++) { if (!used[nb[i]]) { next = nb[i]; break; } }
        cur = next;
      }
      if (loop.length > 2) loops.push(loop);
    }
    return loops;
  }

  function drawTombolo() {
    if (!tbW || !tbH) { tbLayout(); return; }
    var tide = state.tide;
    tbCtx.clearRect(0, 0, tbW, tbH);
    tbCtx.drawImage(tbStatic, 0, 0, tbW, tbH);

    /* Water for this hour. The dry land is the region above the tide, and it is
       always a closed contour inside the grid, so the water is painted as the
       canvas minus that region. Filling the water contours instead would mean
       closing open chains across the frame, and a chord drawn that way runs
       straight over the bar. */
    var land = buildLoops(marching(tide, []));
    tbCtx.beginPath();
    tbCtx.rect(0, 0, tbW, tbH);
    land.forEach(function (lp) {
      tbCtx.moveTo(lp[0][0], lp[0][1]);
      for (var i = 1; i < lp.length; i++) tbCtx.lineTo(lp[i][0], lp[i][1]);
      tbCtx.closePath();
    });
    tbCtx.fillStyle = 'rgba(104,166,194,.40)';
    tbCtx.fill('evenodd');

    /* coastline: the tideline for this hour */
    tbCtx.beginPath();
    land.forEach(function (lp) {
      tbCtx.moveTo(lp[0][0], lp[0][1]);
      for (var i = 1; i < lp.length; i++) tbCtx.lineTo(lp[i][0], lp[i][1]);
      tbCtx.closePath();
    });
    tbCtx.strokeStyle = 'rgba(12,42,56,.44)';
    tbCtx.lineWidth = 1.2; tbCtx.lineJoin = 'round';
    tbCtx.stroke();

    /* place names */
    var labels = [
      { x: -52, y: -46, t: 'SHARP ISLAND', z: '桥咀洲' },
      { x: 2, y: 274, t: 'KIU TAU', z: '桥头' },
      { x: 2, y: 126, t: 'TOMBOLO', z: '连岛沙洲' }
    ];
    labels.forEach(function (L) {
      var p = tbProj(L.x, L.y);
      tbCtx.textAlign = 'center';
      tbCtx.lineJoin = 'round';
      tbCtx.font = '600 11px -apple-system, "PingFang SC", sans-serif';
      tbCtx.lineWidth = 4; tbCtx.strokeStyle = 'rgba(255,255,255,.90)';
      tbCtx.strokeText(L.t, p.x, p.y);
      tbCtx.fillStyle = '#1d1d1f'; tbCtx.fillText(L.t, p.x, p.y);
      tbCtx.font = '400 10px -apple-system, "PingFang SC", sans-serif';
      tbCtx.lineWidth = 3.5;
      tbCtx.strokeText(L.z, p.x, p.y + 13);
      tbCtx.fillStyle = '#3a3a3c'; tbCtx.fillText(L.z, p.x, p.y + 13);
    });
  }

  /* ---- cross section across the bar, at mid channel ---- */
  var SX = { w: 640, h: 220, l: 52, r: 20, t: 30, b: 46, min: -2.6, max: 2.2 };
  var SX_Y = TB.along / 2;
  /* The section window is narrower than the model grid, so the bar keeps a
     readable share of the width instead of sitting in a wide empty sea. */
  var SX_X0 = -110, SX_X1 = 110;
  function sxX(x) { return SX.l + ((x - SX_X0) / (SX_X1 - SX_X0)) * (SX.w - SX.l - SX.r); }
  function sxY(z) { return SX.t + (SX.max - z) / (SX.max - SX.min) * (SX.h - SX.t - SX.b); }
  function crossProfile(x) { return tbSurface(x, SX_Y); }

  function buildSection() {
    var g = [], step = 1.5, pts = [];
    for (var x = SX_X0; x <= SX_X1 + .01; x += step) pts.push([x, crossProfile(x)]);
    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + sxX(p[0]).toFixed(1) + ' ' + sxY(p[1]).toFixed(1);
    }).join(' ');
    var land = line + ' L ' + sxX(SX_X1).toFixed(1) + ' ' + (SX.h-SX.b) +
               ' L ' + sxX(SX_X0).toFixed(1) + ' ' + (SX.h-SX.b) + ' Z';

    g.push('<path class="sx-land" d="'+land+'"/>');
    [-2, -1, 0, 1, 2].forEach(function (v) {
      g.push('<line class="sx-grid" x1="'+SX.l+'" y1="'+sxY(v)+'" x2="'+(SX.w-SX.r)+'" y2="'+sxY(v)+'"/>');
      g.push('<text class="sx-axis" x="'+(SX.l-7)+'" y="'+(sxY(v)+3)+'" text-anchor="end">'+v+'</text>');
    });
    g.push('<text class="sx-axis" x="'+(SX.l-7)+'" y="'+(sxY(SX.max)+2)+'" text-anchor="end">m</text>');
    g.push('<line class="sx-zero" x1="'+SX.l+'" y1="'+sxY(0)+'" x2="'+(SX.w-SX.r)+'" y2="'+sxY(0)+'"/>');
    g.push('<line class="sx-thresh" x1="'+SX.l+'" y1="'+sxY(1.25)+'" x2="'+(SX.w-SX.r)+'" y2="'+sxY(1.25)+'"/>');
    g.push('<path id="sxWater" class="sx-water" d=""/>');
    g.push('<path class="sx-line" d="'+line+'"/>');
    g.push('<line id="sxLevel" class="sx-level" x1="'+SX.l+'" y1="'+sxY(0.95)+'" x2="'+(SX.w-SX.r)+'" y2="'+sxY(0.95)+'"/>');
    g.push('<text id="sxLevelLabel" class="sx-level-label" x="'+(SX.w-SX.r)+'" y="'+(sxY(0.95)-7)+'" text-anchor="end">0.95 M</text>');
    g.push('<text class="sx-thresh-label" x="'+SX.l+'" y="'+(sxY(1.25)-7)+'">1.25 M THRESHOLD</text>');
    g.push('<text class="sx-crest" x="'+sxX(barDrift(SX_Y)).toFixed(1)+'" y="'+(sxY(1.25)-26)+'" text-anchor="middle">BAR CREST</text>');
    g.push('<text class="sx-end" x="'+SX.l+'" y="'+(SX.h-16)+'">SEA</text>');
    g.push('<text class="sx-end" x="'+(SX.w-SX.r)+'" y="'+(SX.h-16)+'" text-anchor="end">SEA</text>');
    g.push('<text class="sx-axis" x="'+((SX.l+SX.w-SX.r)/2)+'" y="'+(SX.h-16)+'" text-anchor="middle">'+(SX_X1-SX_X0)+' M ACROSS THE CHANNEL</text>');
    $('#tideSection').innerHTML = g.join('');
  }

  function updateSection() {
    var tide = state.tide, step = 1.5;
    var runs = [], open = null;
    for (var x = SX_X0; x <= SX_X1 + .01; x += step) {
      if (crossProfile(x) < tide) { if (!open) open = [x, x]; else open[1] = x; }
      else if (open) { runs.push(open); open = null; }
    }
    if (open) runs.push(open);
    var out = [];
    runs.forEach(function (r) {
      var d = 'M ' + sxX(r[0]).toFixed(1) + ' ' + sxY(tide).toFixed(1);
      for (var x2 = r[0]; x2 <= r[1] + .01; x2 += step) {
        d += ' L ' + sxX(x2).toFixed(1) + ' ' + sxY(crossProfile(x2)).toFixed(1);
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
      se.innerHTML = st.en + '<span class="bi-zh">' + st.zh + '</span>';
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
    b.innerHTML = state.tidePlaying ? 'PAUSE<span>暂停</span>' : 'RUN THE TIDE<span>推演潮汐</span>';
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
  /* Progress control                                                      */
  /* ------------------------------------------------------------------ */
  function setProgress(p) {
    state.progress = clamp(p, 0, 1);
    var s = sampleAt(state.progress), st = stageAt(state.progress), np = nearestPoint(state.progress);
    $('#routeScrub').value = Math.round(state.progress*1000);
    $('#routeScrub').style.setProperty('--p', (state.progress*100).toFixed(1)+'%');
    $('#readDist').textContent = (state.progress*TOTAL).toFixed(2);
    $('#readElev').textContent = Math.round(s.elev);
    $('#readShade').textContent = shadeName[st.shade].split(' ')[0];
    $('#nearestPoint').innerHTML = 'NEAREST '+np.name.toUpperCase()+'<span class="bi-zh">'+np.zh+'</span>';
    $$('.stage-chip').forEach(function (b) { b.classList.toggle('active', b.dataset.stage === st.id); });
    $$('.seg-shade').forEach(function (b) { b.classList.toggle('on', b.dataset.point === np.id); });
    updateProfile();
    if (tmapReady && !mapFallback) updateTencentCursor(); else drawTileMap();
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
    $('#stopsRail').innerHTML = D.points.map(function (p) {
      return '<button class="stop-card" data-point="'+p.id+'">' +
        '<img src="'+thumb(p.photos[0])+'" alt="Field photograph at '+p.name+'" loading="lazy">' +
        '<span class="sc-body"><span class="sc-num">'+p.code+'</span>' +
        '<span class="sc-text"><strong>'+p.name+'</strong><span>'+p.zh+', '+p.time+', '+Math.round(p.elev)+' m</span></span></span></button>';
    }).join('');
    $('#stopsCount').innerHTML = D.points.length + ' points<span class="bi-zh">8 个观察点</span>';
  }
  function buildStages() {
    $('#stageCards').innerHTML = '<div class="stage-grid">' + D.stages.map(function (s) {
      var imgs = s.photos.slice(0,3).map(function (id, k) {
        return '<button data-photos="'+s.photos.join(',')+'" data-idx="'+k+'" aria-label="Open photograph '+id+'">' +
          '<img src="'+thumb(id)+'" alt="Field photograph '+id+' at '+s.name+'" loading="lazy"></button>';
      }).join('');
      return '<article class="stage-card reveal">' +
        '<div class="stage-photos">'+imgs+'</div>' +
        '<div class="stage-body"><span class="stage-num">STAGE '+s.code+', '+s.range.toUpperCase()+'</span>' +
        '<h4>'+s.name+'</h4><p class="stage-zh">'+s.zh+'</p>' +
        '<dl class="stage-facts">' +
          '<div><dt>TIME<span class="bi-zh">时间</span></dt><dd>'+s.time+'</dd></div>' +
          '<div><dt>ELEVATION<span class="bi-zh">海拔</span></dt><dd>'+s.elev+'</dd></div>' +
          '<div><dt>SHADE<span class="bi-zh">遮阴</span></dt><dd>'+shadeName[s.shade]+'<span class="bi-zh">'+shadeZh[s.shade]+'</span></dd></div>' +
          '<div><dt>POINTS<span class="bi-zh">观察点</span></dt><dd>'+s.points.length+' stops<span class="bi-zh">'+s.points.length+' 个观察点</span></dd></div>' +
        '</dl>' +
        '<p class="stage-summary">'+s.summary+'</p><p class="stage-summary-zh">'+s.summaryZh+'</p>' +
        '<div class="stage-care"><span class="care-label">EXTRA CARE<span class="bi-zh">注意事项</span></span> '+s.care+'</div>' +
        '</div></article>';
    }).join('') + '</div>';
    $('#stageChips').innerHTML = D.stages.map(function (s) {
      return '<button class="stage-chip" data-stage="'+s.id+'"><b>'+s.code+' '+s.name+'</b><span class="bi-zh">'+s.zh+'</span></button>';
    }).join('');
  }
  function buildRibbon() {
    $('#ribbons').innerHTML = '<div class="ribbon-card">' +
      '<div class="ribbon-head"><strong>ONE CONTINUOUS ROUTE<span class="bi-zh">一条连续路线</span></strong><span>'+D.route.shade+'<span class="bi-zh">'+D.route.shadeZh+'</span></span></div>' +
      '<div class="ribbon">' + D.points.map(function (p) {
        return '<div class="seg-shade '+p.shade+'" data-point="'+p.id+'" data-progress="'+p.progress+'" title="'+p.code+' '+p.name+', '+shadeName[p.shade]+'"><span>'+p.code+'</span></div>';
      }).join('') + '</div>' +
      '<div class="ribbon-foot"><span>START '+D.route.startShort+'<span class="bi-zh">'+D.route.startZh+'</span></span><span>FINISH '+D.route.finishShort+'<span class="bi-zh">'+D.route.finishZh+'</span></span></div></div>';
    $$('.seg-shade').forEach(function (el) {
      el.addEventListener('click', function () { setProgress(Number(el.dataset.progress)); openPoint(el.dataset.point); });
    });
  }
  function buildNotes() {
    var notes = [
      { img: 'p19', color: 'amber', label: 'TRAIL CONDITION', labelZh: '山径侵蚀', title: 'STAY ON THE REPAIRED PATH',
        text: 'The AFCD board at the junction records serious erosion caused by visitors leaving the trail and wearing away vegetation. Hand-built log steps now hold the slope, but loose sandy tread and exposed roots remain.' },
      { img: 'p03', color: 'rust', label: 'GEOCONSERVATION', labelZh: '岩石保育', title: 'LOOK, DON\'T TAKE',
        text: 'An on-site Geopark board prohibits defacing, damaging or removing any rock, and disturbing wild plants and animals. The weathered volcanic boulders here are brittle, and the board asks visitors to leave them in place.' },
      { img: 'p05', color: 'green', label: 'INTERTIDAL LIFE', labelZh: '海岸生态', title: 'HANDS OFF THE SHORE',
        text: 'The AFCD banner asks visitors not to feed or touch marine life, and not to tread on coral. The shallow water off both beaches is habitat for coral and other marine life.' },
      { img: 'p13', color: 'blue', label: 'SUN EXPOSURE', labelZh: '日照', title: 'CLOUD IS NOT SHADE',
        text: 'At 11:10 the beach was under thick cloud; by 12:47 the ridge was in full sun. Our 20 m shade readings show the coast, viewpoint and beach entirely unshaded.' }
    ];
    $('#notesGrid').innerHTML = notes.map(function (n) {
      return '<article class="note-card reveal" style="--note-color:var(--'+n.color+')">' +
        '<img src="'+photo(n.img)+'" alt="Field evidence: '+n.title+'" loading="lazy" data-photo="'+n.img+'" data-caption="'+n.title+'">' +
        '<div class="note-body"><span class="mini-label">'+n.label+'<span class="bi-zh">'+n.labelZh+'</span></span><h4>'+n.title+'</h4>' +
        '<p>'+n.text+'</p></div></article>';
    }).join('');
  }
  function buildVegetation() {
    $('#vegGrid').innerHTML = V.map(function (v) {
      return '<article class="veg-card reveal">' +
        '<div class="veg-art">' + v.art + '</div>' +
        '<div class="veg-body">' +
          '<div class="veg-top"><span class="veg-code">'+v.code+'</span><span class="veg-form">'+v.form+'</span></div>' +
          '<h4>'+v.name+'</h4><p class="veg-zh">'+v.zh+'</p>' +
          '<p class="veg-blurb">'+v.blurb+'</p>' +
          '<p class="veg-blurb-zh">'+v.blurbZh+'</p>' +
          '<ul class="veg-species">' + v.species.map(function (s) { return '<li>'+s+'</li>'; }).join('') + '</ul>' +
          '<p class="veg-where">'+v.where+'<span class="bi-zh">'+v.whereZh+'</span></p>' +
        '</div></article>';
    }).join('');
  }
  function buildReading() {
    $('#readList').innerHTML = D.reading.map(function (r) {
      var title = r.url ? '<a href="'+r.url+'" target="_blank" rel="noopener">'+r.title+'</a>' : r.title;
      return '<article class="read-row reveal">' +
        '<div class="read-meta"><span class="read-kind">'+r.kind+'</span><span class="read-year">'+r.year+'</span></div>' +
        '<div class="read-body"><h4>'+title+'</h4>' +
          '<p class="read-source">'+r.source+'</p>' +
          '<p class="read-note">'+r.note+'</p>' +
          '<p class="read-note-zh">'+r.noteZh+'</p>' +
          (r.flag ? '<span class="read-flag">'+r.flag+'</span>' : '') +
        '</div></article>';
    }).join('');
  }
  function buildAdvice() {
    $('#adviceList').innerHTML = D.advice.map(function (a, i) {
      return '<li><span class="adv-num">0'+(i+1)+'</span><div><h4>'+a.title+'</h4>' +
        '<p class="adv-zh">'+a.zh+'</p><p>'+a.body+'</p></div></li>';
    }).join('');
  }
  function buildSurvey() {
    var s = D.survey;
    var facts = [
      ['SURVEY DATE', '日期', s.date, '2026 年 11 月 13 日'],
      ['RECORD WINDOW', '时段', s.window, '11:10 至 13:38（香港时间），共 2 小时 28 分钟'],
      ['WEATHER', '天气', s.weather, s.weatherZh],
      ['FIELD RECORDS', '记录', s.photos+' photographs, '+s.points+' observation points', s.photos+' 张照片，'+s.points+' 个观察点'],
      ['ROUTE', '路线', 'One continuous line from '+D.route.start+' to '+D.route.finish, '一条连续路线，由'+D.route.startZh+'至'+D.route.finishZh],
      ['SHADE CLASSES', '遮阴分级', 'Mostly shaded, partly shaded, unshaded', '大部份遮阴，部份遮阴，无遮阴'],
      ['BASE MAP', '底图', 'Tencent Maps vector basemap, GCJ-02', '腾讯地图矢量底图，GCJ-02'],
      ['LOCATION', '地点', s.place, '中国香港西贡桥咀郊野公园']
    ];
    $('#surveyFacts').innerHTML = facts.map(function (f) {
      return '<div><dt>'+f[0]+'<span class="bi-zh">'+f[1]+'</span></dt><dd>'+f[2]+'<span class="bi-zh">'+f[3]+'</span></dd></div>';
    }).join('');
    $('#surveyMethod').textContent = s.method;
    $('#surveyMethodZh').textContent = s.methodZh;
    $('#mapNoteText').textContent = s.mapping;
    $('#mapNoteTextZh').textContent = s.mappingZh;
    $('#sourceList').innerHTML = D.sources.map(function (src) {
      var title = src.url ? '<a href="'+src.url+'" target="_blank" rel="noopener">'+src.label+'</a>' : '<span class="source-title">'+src.label+'</span>';
      return '<li><span class="source-meta">'+src.kind+'</span>'+title+'<p>'+src.detail+'</p></li>';
    }).join('');
    $('#checkList').innerHTML = D.checks.map(function (c) { return '<li>'+c+'</li>'; }).join('');
    var head = '<div class="ctr-row head"><div>MEMBER<span class="bi-zh">组员</span></div><div>FIELDWORK<span class="bi-zh">实地记录</span></div><div>ANALYSIS<span class="bi-zh">分析</span></div><div>WEBSITE<span class="bi-zh">网页</span></div></div>';
    $('#contributionTable').innerHTML = head + D.contributions.map(function (c) {
      return '<div class="ctr-row"><div class="ctr-name">'+c.name+'</div>' +
        '<div data-label="Fieldwork">'+c.fieldwork+'</div>' +
        '<div data-label="Analysis">'+c.analysis+'</div>' +
        '<div data-label="Website">'+c.website+'</div></div>';
    }).join('');
    $('#heroDate').textContent = s.dateShort.toUpperCase();
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
    $('#drawerContent').innerHTML =
      '<h3>'+p.name+'</h3><p class="d-zh">'+p.zh+'</p>' +
      '<div class="drawer-photo"><img id="dPhoto" src="'+photo(p.photos[0])+'" alt="Field photograph at '+p.name+'" data-idx="0">' +
        '<span class="d-count" id="dCount">1 of '+p.photos.length+'</span>' +
        (p.photos.length > 1 ? '<button class="d-nav prev" data-dir="-1" aria-label="Previous photo">‹</button><button class="d-nav next" data-dir="1" aria-label="Next photo">›</button>' : '') +
      '</div>' +
      '<div class="chips"><span class="chip stage">STAGE '+(stage?stage.code:'')+'</span>' +
        '<span class="chip shade-'+p.shade+'">'+shadeName[p.shade]+'<span class="bi-zh">'+shadeZh[p.shade]+'</span></span>' +
        '<span class="chip">'+p.time+' HKT</span><span class="chip">'+Math.round(p.elev)+' M ASL<span class="bi-zh">海拔</span></span>' +
        '<span class="chip">'+p.dist.toFixed(2)+' KM</span><span class="chip">'+p.weather+'</span></div>' +
      '<p class="d-desc">'+p.description+'</p><p class="d-desc-zh">'+p.descriptionZh+'</p>' +
      '<dl class="d-list">' +
        '<div><dt>WHAT YOU CAN SEE<span class="bi-zh">景观</span></dt><dd>'+p.attraction+'</dd></div>' +
        '<div><dt>VISIBLE ENVIRONMENTAL CONCERNS<span class="bi-zh">环境关注</span></dt><dd><ul>'+p.concerns.map(function (c) { return '<li>'+c+'</li>'; }).join('')+'</ul></dd></div>' +
        '<div><dt>FACILITIES<span class="bi-zh">设施</span></dt><dd>'+p.facilities+'</dd></div>' +
        '<div><dt>PRACTICAL SUGGESTION<span class="bi-zh">实用建议</span></dt><dd>'+p.tip+'</dd></div></dl>' +
      '<div class="d-evidence"><p><span class="d-label">EVIDENCE SOURCE<span class="bi-zh">证据来源</span></span> '+p.sources+'</p><div class="d-thumbs">'+thumbs+'</div></div>' +
      (p.check ? '<div class="d-check"><span class="d-label">NEEDS FURTHER CHECKING<span class="bi-zh">待核查</span></span> '+p.check+'</div>' : '');
    $('#drawerKicker').innerHTML = 'OBSERVATION POINT '+p.code+'<span class="bi-zh">观察点 '+p.time+'</span>';
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
    $('#dCount').textContent = (state.drawerIdx+1)+' of '+n;
  }
  function closeDrawer() {
    $('#scrim').classList.remove('show'); $('#drawer').classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { $('#scrim').hidden = true; $('#drawer').hidden = true; state.point = null; }, 460);
  }
  function openLightbox(ids, idx, caption) {
    state.lbPhotos = ids; state.lbIdx = idx || 0;
    $('#lightbox').hidden = false; document.body.classList.add('no-scroll');
    updateLightbox(caption || 'GROUP FIELD PHOTOGRAPH, 13 NOV 2026');
  }
  function updateLightbox(caption) {
    $('#lbImage').src = photo(state.lbPhotos[state.lbIdx]);
    $('#lbImage').alt = 'Field photograph '+state.lbPhotos[state.lbIdx];
    $('#lbCaption').textContent = (caption || 'GROUP FIELD PHOTOGRAPH')+', '+state.lbPhotos[state.lbIdx];
    $('#lbCount').textContent = (state.lbIdx+1)+' of '+state.lbPhotos.length;
    $('#lbPrev').hidden = $('#lbNext').hidden = state.lbPhotos.length < 2;
  }
  function moveLightbox(dir) {
    if (state.lbPhotos.length < 2) return;
    state.lbIdx = (state.lbIdx+dir+state.lbPhotos.length)%state.lbPhotos.length;
    updateLightbox($('#lbCaption').textContent.split(', p')[0]);
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    if (!state.point) document.body.classList.remove('no-scroll');
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                               */
  /* ------------------------------------------------------------------ */
  function wire() {
    var nb = $('#mapNote');
    if (nb) nb.addEventListener('click', function () { nb.hidden = true; });

    $('#zoomIn').addEventListener('click', function () {
      if (tmapReady && !mapFallback) { tmap.setZoom(clamp(tmap.getZoom()+1, 12, 18)); return; }
      state.zoom = clamp(state.zoom+1, 13, 17.4); drawTileMap();
    });
    $('#zoomOut').addEventListener('click', function () {
      if (tmapReady && !mapFallback) { tmap.setZoom(clamp(tmap.getZoom()-1, 12, 18)); return; }
      state.zoom = clamp(state.zoom-1, 13, 17.4); drawTileMap();
    });
    $('#zoomReset').addEventListener('click', function () {
      var c0 = gcj(22.3625, 114.2915);
      if (tmapReady && !mapFallback) { try { tmap.setCenter(new TMap.LatLng(c0.lat, c0.lng)); tmap.setZoom(Z_BASE); } catch (e) {} return; }
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
      if (b) openLightbox(b.dataset.photos.split(','), Number(b.dataset.idx), 'STAGE FIELD PHOTOGRAPH');
    });
    $('#notesGrid').addEventListener('click', function (e) {
      var im = e.target.closest('img[data-photo]');
      if (im) openLightbox([im.dataset.photo], 0, im.dataset.caption);
    });

    $('#tideSlider').addEventListener('input', function (e) {
      if (state.tidePlaying) toggleTide();
      setTide(Number(e.target.value)/100, true);
    });
    $('#tidePlay').addEventListener('click', toggleTide);

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#drawerContent').addEventListener('click', function (e) {
      var nav = e.target.closest('.d-nav');
      if (nav) { moveDrawerPhoto(Number(nav.dataset.dir)); return; }
      var im = e.target.closest('img');
      if (im && state.point) openLightbox(state.point.photos, Number(im.dataset.idx || 0), state.point.name);
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

    try {
      var saved = localStorage.getItem('si-theme');
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) {}
    $('#themeToggle').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('si-theme', next); } catch (e) {}
      if (mapFallback) drawTileMap();
      drawTombolo();
    });

    /* Rebuilding the relief costs a pass over every pixel, so the resize
       handler waits until the size has actually settled and skips the work
       when the box did not change. */
    var relayoutTimer = 0, lastW = 0, lastH = 0;
    var relayout = function () {
      var w = tbC.clientWidth, h = tbC.clientHeight;
      if (mapFallback) { sizeCanvas(); drawTileMap(); }
      if (w === lastW && h === lastH && tbNodes.length) return;
      clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(function () {
        lastW = tbC.clientWidth; lastH = tbC.clientHeight;
        tbLayout();
      }, 140);
    };
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(relayout);
      ro.observe(canvas); ro.observe(tbC);
    }
    window.addEventListener('resize', relayout, { passive: true });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
      $$('.reveal').forEach(function (el) { io.observe(el); });
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
  buildStops();
  buildStages();
  buildRibbon();
  buildNotes();
  buildVegetation();
  buildReading();
  buildAdvice();
  buildSurvey();
  buildProfile();
  sizeCanvas();
  drawTileMap();      /* a warm fallback is on screen while the SDK loads */
  tbLayout();
  buildSection();
  wire();
  setProgress(0);
  setTide(0.95, true);
  if (proxyReady) loadTencentSDK();
  else useFallback('The basemap needs the WorkBuddy map proxy. Local survey tiles are shown.', '官方底图需要 WorkBuddy 地图代理，当前显示本地地形瓦片。');
})();
