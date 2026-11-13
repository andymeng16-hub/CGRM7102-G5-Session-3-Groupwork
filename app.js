/* Sharp Island — GIS field guide interactions
   - Local terrain tiles (GCJ-02 XYZ pyramid) drawn on a canvas slippy map
   - Tencent Maps GL JS base map with TMap.ImageTileLayer overlay (proxy mode)
   - One interactive route: scrubber, elevation profile, 3D terrain model
   - Observation point drawer and photograph lightbox
*/
(function () {
  'use strict';

  var D = window.FIELD_DATA;
  var T = window.TERRAIN;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var photo = function (id) { return 'assets/photos/' + id + '.jpg'; };
  var thumb = function (id) { return 'assets/photos/thumbs/' + id + '.jpg'; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var shadeName = { mostly: 'MOSTLY SHADED', partly: 'PARTLY SHADED', unshaded: 'UNSHADED' };
  var shadeZh = { mostly: '大部份遮阴', partly: '部份遮阴', unshaded: '无遮阴' };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  var TRANSPARENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

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
  /* WGS-84 → GCJ-02 (Tencent Maps uses GCJ-02 for Hong Kong, China). */
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
  /* Bilinear elevation sample from the WGS-84 terrain grid. */
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
    var m = s.range.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
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
    base: proxyReady ? 'official' : 'survey',
    overlay: true, overlayOpacity: .72,
    zoom: 15.1, center: null,
    autoRotate: false, wireframe: false, exaggeration: 1.4,
    azimuth: -0.22, tilt: 1.00, modelZoom: 1,
    point: null, drawerIdx: 0, lbPhotos: [], lbIdx: 0
  };
  var c = gcj(22.3625, 114.2915);
  state.center = { lat: c.lat, lng: c.lng };

  /* GCJ tile ranges, so we never request a tile we did not generate */
  var TILE_RANGES = {};
  (function () {
    var b = { w: T.w + T.gcj.dlng, e: T.e + T.gcj.dlng, s: T.s + T.gcj.dlng*0 + T.gcj.dlat, n: T.north + T.gcj.dlat };
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
  /* Canvas tiled map                                                     */
  /* ------------------------------------------------------------------ */
  var canvas = $('#tileMap'), ctx = canvas.getContext('2d');
  var tileCache = {}, tileW = 0, tileH = 0;
  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    tileW = canvas.clientWidth; tileH = canvas.clientHeight;
    canvas.width = Math.round(tileW*dpr); canvas.height = Math.round(tileH*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function getTile(kind, z, x, y) {
    var key = kind+'/'+z+'/'+x+'/'+y;
    if (tileCache[key]) return tileCache[key];
    if (!tileInRange(x, y, z)) return null;
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { im.ready = true; if (state.base === 'survey') drawTileMap(); };
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
        if (state.overlay) {
          var ov = getTile('overlay', tz, x, y);
          if (ov && ov.ready) {
            ctx.save(); ctx.globalAlpha = state.overlayOpacity;
            ctx.drawImage(ov, sx, sy, ts+1, ts+1); ctx.restore();
          }
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
    /* the raster tiles stay light in both themes, so markers use a fixed dark ink */
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

    /* scale bar */
    var mpp = 156543.03392 * Math.cos(state.center.lat*Math.PI/180) / Math.pow(2, z);
    var metres = 70*mpp;
    var nice = metres > 900 ? Math.round(metres/500)*500 : metres > 300 ? Math.round(metres/100)*100 : Math.round(metres/50)*50;
    nice = Math.max(50, nice);
    $('.map-scale span').style.width = Math.round(nice/mpp) + 'px';
    $('#scaleLabel').textContent = nice >= 1000 ? (nice/1000).toFixed(1)+' km' : nice+' m';
  }

  /* pointer interaction on the canvas */
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
      state.center = { lat: clamp(ll.lat, T.s-0.01+T.gcj.dlat, T.north+0.01+T.gcj.dlat),
                       lng: clamp(ll.lng, T.w-0.01+T.gcj.dlng, T.e+0.01+T.gcj.dlng) };
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
    /* nearest point on the drawn route -> set progress */
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
  /* Tencent Maps base map + ImageTileLayer overlay                       */
  /* ------------------------------------------------------------------ */
  var tmap = null, tOverlay = null, tMarkers = null, tLine = null, tCursor = null;
  var sdkRequested = false, tmapReady = false;
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
        zoom: 15, center: new TMap.LatLng(state.center.lat, state.center.lng),
        pitch: 40, rotation: 0,
        baseMap: { type: 'vector', features: ['base', 'label'] }
      });
      tmapReady = true;
      tOverlay = new TMap.ImageTileLayer({
        getTileUrl: function (x, y, z) {
          return tileInRange(x, y, z) ? 'assets/tiles/overlay/'+z+'/'+x+'/'+y+'.png' : TRANSPARENT;
        },
        tileSize: 256, minZoom: 13, maxZoom: 17, maxDataZoom: 17,
        visible: state.overlay, zIndex: 5000, opacity: state.overlayOpacity,
        isMainThreadLoaded: true, map: tmap
      });
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
        styles: { cur: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: markerSvg('•', '#0066cc') }) },
        geometries: [] });
      updateTencentCursor();
    } catch (err) {
      tmapReady = false;
      switchBase('survey', '腾讯底图未能初始化，已显示本地地形瓦片。The official basemap could not be loaded; local survey tiles are shown.');
    }
  }
  function updateTencentCursor() {
    if (!tCursor) return;
    var s = sampleAt(state.progress), g = gcj(s.lat, s.lng);
    try { tCursor.setGeometries([{ id: 'cursor', styleId: 'cur', position: new TMap.LatLng(g.lat, g.lng) }]); } catch (e) {}
  }
  function loadTencentSDK() {
    if (sdkRequested) return;
    sdkRequested = true;
    var s = document.createElement('script');
    s.src = 'https://map.qq.com/api/gljs?v=1.exp';
    s.async = true;
    s.onload = function () { setTimeout(initTencent, 80); };
    s.onerror = function () { switchBase('survey', '地图服务无法连接，已显示本地地形瓦片。The map service is unavailable; local survey tiles are shown.'); };
    document.head.appendChild(s);
    setTimeout(function () {
      if (!tmapReady && state.base === 'official') {
        switchBase('survey', '官方底图在此环境不可用，已切换为本地地形瓦片。The official basemap is unavailable here; local survey tiles are shown.');
      }
    }, 7000);
  }
  function switchBase(which, note) {
    state.base = which;
    $$('.seg[data-base]').forEach(function (b) {
      var on = b.dataset.base === which;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    });
    $('#tileMap').hidden = which !== 'survey';
    $('#tmap').hidden = which !== 'official';
    var nb = $('#mapNote');
    if (note) { nb.textContent = note + '  ×'; nb.hidden = false; } else nb.hidden = true;
    if (which === 'official') {
      if (!proxyReady) { switchBase('survey', '官方底图需要 WorkBuddy 地图代理；当前显示本地地形瓦片。The official basemap needs the WorkBuddy map proxy; local survey tiles are shown.'); return; }
      loadTencentSDK();
    } else {
      sizeCanvas(); drawTileMap();
    }
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
    var step = Math.max(0, Math.floor(MAXE/20)*20);
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
    /* stage bands are labelled in a dedicated strip below the axis */
    D.stages.forEach(function (s, i) {
      var x0 = px(s.from), x1 = px(s.to);
      if (i) g.push('<line x1="'+x0+'" y1="'+PF.top+'" x2="'+x0+'" y2="'+(PF.h-PF.bottom+34)+
        '" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>');
      g.push('<line x1="'+x0+'" y1="'+(PF.h-PF.bottom+30)+'" x2="'+x1+'" y2="'+(PF.h-PF.bottom+30)+
        '" stroke="var(--line-soft)" stroke-width="2"/>');
      g.push('<text class="pf-stage" x="'+((x0+x1)/2)+'" y="'+(PF.h-PF.bottom+51)+
        '" text-anchor="middle">'+s.id+' · '+s.name.toUpperCase()+'</text>');
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
      '<div><dt>HIGH POINT / 最高点</dt><dd>'+Math.round(MAXE)+'<small>m</small></dd></div>' +
      '<div><dt>TOTAL ASCENT / 累计爬升</dt><dd>'+Math.round(ASCENT)+'<small>m</small></dd></div>' +
      '<div><dt>ROUTE LENGTH / 路线长度</dt><dd>'+TOTAL.toFixed(2)+'<small>km</small></dd></div>' +
      '<div><dt>DEM / 高程模型</dt><dd>SRTM<small>90 m</small></dd></div>';
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
  /* 3D terrain model                                                      */
  /* ------------------------------------------------------------------ */
  var c3 = $('#terrain3d'), ctx3 = c3.getContext('2d'), w3 = 0, h3 = 0;
  function size3D() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w3 = c3.clientWidth; h3 = c3.clientHeight;
    c3.width = Math.round(w3*dpr); c3.height = Math.round(h3*dpr);
    ctx3.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function world(lat, lng) {
    /* north = +1, south = -1, matching the terrain grid's row order */
    return { x: (lng-T.w)/(T.e-T.w)*2-1, y: 1-(T.north-lat)/(T.north-T.s)*2 };
  }
  function proj3(X, Y, Z) {
    var A = state.azimuth, P = state.tilt;
    var X1 = X*Math.cos(A) - Y*Math.sin(A);
    var Y1 = X*Math.sin(A) + Y*Math.cos(A);
    var scale = Math.min(w3, h3)*.40*state.modelZoom;
    /* orthographic view: depth is perpendicular to the screen plane, so tall
       cells correctly occlude the ground behind them */
    return { x: w3/2 + X1*scale,
             y: h3/2 - Y1*Math.sin(P)*scale + (h3*.06) - Z*Math.cos(P)*scale,
             depth: Y1*Math.cos(P) - Z*Math.sin(P) };
  }
  function heightZ(e) { return (e/T.max)*state.exaggeration*.30; }
  function ramp(e) {
    if (e < 5) return [224, 220, 192];
    if (e < 20) return [205, 218, 178];
    if (e < 40) return [166, 198, 148];
    if (e < 60) return [132, 172, 120];
    return [172, 158, 120];
  }
  /* Blur the land mask three times: SRTM is still several metres high at the
     hand-drawn shoreline, so a hard land/sea switch would create cliff-like
     teeth. The blurred weight tapers elevation to 0 and blends the colours. */
  var COAST = (function () {
    var n = T.n, w = [];
    for (var j = 0; j < n; j++) { w[j] = []; for (var i = 0; i < n; i++) w[j][i] = T.land[j][i] ? 1 : 0; }
    for (var pass = 0; pass < 3; pass++) {
      var t = [];
      for (var jj = 0; jj < n; jj++) {
        t[jj] = [];
        for (var ii = 0; ii < n; ii++) {
          var s = 0, c = 0;
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
            var a = jj+dj, b = ii+di;
            if (a >= 0 && a < n && b >= 0 && b < n) { s += w[a][b]; c++; }
          }
          t[jj][ii] = s/c;
        }
      }
      w = t;
    }
    return w;
  })();
  function draw3D() {
    if (!w3 || !h3) size3D();
    ctx3.clearRect(0, 0, w3, h3);
    var step = 1, cells = [];
    for (var j = 0; j < T.n-1; j += step) {
      for (var i = 0; i < T.n-1; i += step) {
        var j2 = Math.min(j+step, T.n-1), i2 = Math.min(i+step, T.n-1);
        /* four corners, in the same row/column order as the terrain grid */
        var z00 = T.z[j][i], z01 = T.z[j][i2], z11 = T.z[j2][i2], z10 = T.z[j2][i];
        var w00 = COAST[j][i], w01 = COAST[j][i2], w11 = COAST[j2][i2], w10 = COAST[j2][i];
        var e = (z00+z01+z11+z10)/4, lw = (w00+w01+w11+w10)/4;
        var X0 = i/(T.n-1)*2-1, X1 = i2/(T.n-1)*2-1;
        var Y0 = 1-j/(T.n-1)*2, Y1 = 1-j2/(T.n-1)*2;
        var a = proj3(X0, Y0, heightZ(z00)*w00),
            b = proj3(X1, Y0, heightZ(z01)*w01),
            d = proj3(X1, Y1, heightZ(z11)*w11),
            f = proj3(X0, Y1, heightZ(z10)*w10);
        /* Lambert hillshade from the DEM gradient — stable while orbiting.
           Light comes from the north-west; south-facing slopes read darker. */
        var gx = (z01-z00)/Math.max(1, i2-i), gy = (z10-z00)/Math.max(1, j2-j);
        var k = .055*state.exaggeration;
        var nx = -gx*k, ny = gy*k, nz = 1;
        var nl = Math.sqrt(nx*nx+ny*ny+nz*nz);
        var lambert = (nx*(-.5) + ny*(-.5) + nz*.71)/nl;
        var shade = clamp(.52 + lambert*.82, .42, 1.22);
        cells.push({ pts: [a,b,d,f], e: e, lw: lw, shade: shade,
                     depth: (a.depth+b.depth+d.depth+f.depth)/4 });
      }
    }
    /* painter's algorithm: far (north) first, near (south) last */
    cells.sort(function (p, q) { return q.depth - p.depth; });
    cells.forEach(function (cell) {
      ctx3.beginPath();
      cell.pts.forEach(function (p, i) { i ? ctx3.lineTo(p.x, p.y) : ctx3.moveTo(p.x, p.y); });
      ctx3.closePath();
      var landCol = ramp(cell.e), seaCol = [96, 145, 168], lw = cell.lw;
      var lit = 1 + (cell.shade - 1)*lw;
      var col = [0,1,2].map(function (k) { return (seaCol[k]*(1-lw) + landCol[k]*lw)*lit; });
      var fill = 'rgb('+Math.round(clamp(col[0],0,255))+','+
                        Math.round(clamp(col[1],0,255))+','+
                        Math.round(clamp(col[2],0,255))+')';
      ctx3.fillStyle = fill;
      /* a hairline stroke in the same colour hides antialiasing seams between quads */
      ctx3.strokeStyle = fill; ctx3.lineWidth = 1;
      ctx3.fill(); ctx3.stroke();
      if (state.wireframe) { ctx3.strokeStyle = 'rgba(255,255,255,.30)'; ctx3.lineWidth = .5; ctx3.stroke(); }
    });

    /* draped route */
    function routeScreen(list) { return list.map(function (s) { var w = world(s.lat, s.lng); return proj3(w.x, w.y, heightZ(s.elev)+.012); }); }
    var rp = routeScreen(SAMPLES);
    function stroke3(list, color, width) {
      ctx3.beginPath(); list.forEach(function (p, i) { i ? ctx3.lineTo(p.x, p.y) : ctx3.moveTo(p.x, p.y); });
      ctx3.strokeStyle = color; ctx3.lineWidth = width; ctx3.lineCap = 'round'; ctx3.lineJoin = 'round'; ctx3.stroke();
    }
    stroke3(rp, 'rgba(255,255,255,.85)', 7);
    stroke3(rp, 'rgba(0,102,204,.85)', 3.5);
    var upto = Math.max(1, Math.round(state.progress*NS));
    stroke3(rp.slice(0, upto+1), '#ffffff', 4.5);

    /* observation points */
    /* observation points — fixed dark ink for legibility on the light terrain */
    var ink = '#1d1d1f';
    D.points.forEach(function (p) {
      var w = world(p.lat, p.lng), q = proj3(w.x, w.y, heightZ(p.elev)+.02);
      p._3x = q.x; p._3y = q.y;
      ctx3.beginPath(); ctx3.arc(q.x, q.y, 8, 0, Math.PI*2);
      ctx3.fillStyle = ink; ctx3.fill(); ctx3.lineWidth = 2; ctx3.strokeStyle = '#fff'; ctx3.stroke();
      ctx3.fillStyle = '#fff'; ctx3.font = '700 9px -apple-system, sans-serif';
      ctx3.textAlign = 'center'; ctx3.textBaseline = 'middle'; ctx3.fillText(p.code, q.x, q.y+.5);
    });
    /* current pin */
    var cur = sampleAt(state.progress), cw = world(cur.lat, cur.lng);
    var base = proj3(cw.x, cw.y, heightZ(cur.elev)+.01);
    var top = proj3(cw.x, cw.y, heightZ(cur.elev)+.24);
    ctx3.beginPath(); ctx3.moveTo(base.x, base.y); ctx3.lineTo(top.x, top.y);
    ctx3.strokeStyle = '#fff'; ctx3.lineWidth = 2.5; ctx3.stroke();
    ctx3.beginPath(); ctx3.arc(top.x, top.y, 6, 0, Math.PI*2);
    ctx3.fillStyle = '#fff'; ctx3.fill(); ctx3.lineWidth = 2.5; ctx3.strokeStyle = '#0066cc'; ctx3.stroke();
  }
  var drag3 = null;
  c3.addEventListener('pointerdown', function (e) {
    c3.setPointerCapture(e.pointerId);
    drag3 = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  c3.addEventListener('pointermove', function (e) {
    if (!drag3) return;
    var dx = e.clientX-drag3.x, dy = e.clientY-drag3.y;
    drag3.x = e.clientX; drag3.y = e.clientY; drag3.moved += Math.abs(dx)+Math.abs(dy);
    state.azimuth += dx*.008;
    state.tilt = clamp(state.tilt + dy*.005, .22, 1.35);
    draw3D();
  });
  c3.addEventListener('pointerup', function (e) {
    if (drag3 && drag3.moved < 6) {
      var r = c3.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top, hit = null, bd = 16;
      D.points.forEach(function (p) {
        if (p._3x == null) return;
        var d = Math.hypot(p._3x-mx, p._3y-my);
        if (d < bd) { bd = d; hit = p; }
      });
      if (hit) openPoint(hit.id);
    }
    drag3 = null;
  });
  c3.addEventListener('pointercancel', function () { drag3 = null; });
  c3.addEventListener('wheel', function (e) {
    e.preventDefault();
    state.modelZoom = clamp(state.modelZoom - e.deltaY*.001, .6, 2.2);
    draw3D();
  }, { passive: false });

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
    $('#nearestPoint').textContent = 'NEAREST · '+np.name.toUpperCase()+' / '+np.zh;
    $$('.stage-chip').forEach(function (b) { b.classList.toggle('active', b.dataset.stage === st.id); });
    $$('.seg-shade').forEach(function (b) { b.classList.toggle('on', b.dataset.point === np.id); });
    updateProfile();
    if (state.base === 'survey') drawTileMap(); else updateTencentCursor();
    draw3D();
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
        '<span class="sc-text"><strong>'+p.name+'</strong><span>'+p.zh+' · '+p.time+' · '+Math.round(p.elev)+' m</span></span></span></button>';
    }).join('');
    $('#stopsCount').textContent = D.points.length + ' points · 8 个观察点';
  }
  function buildStages() {
    $('#stageCards').innerHTML = '<div class="stage-grid">' + D.stages.map(function (s) {
      var imgs = s.photos.slice(0,3).map(function (id, k) {
        return '<button data-photos="'+s.photos.join(',')+'" data-idx="'+k+'" aria-label="Open photograph '+id+'">' +
          '<img src="'+thumb(id)+'" alt="Field photograph '+id+' at '+s.name+'" loading="lazy"></button>';
      }).join('');
      return '<article class="stage-card reveal">' +
        '<div class="stage-photos">'+imgs+'</div>' +
        '<div class="stage-body"><span class="stage-num">STAGE '+s.code+' / '+s.range+'</span>' +
        '<h4>'+s.name+'</h4><p class="stage-zh">'+s.zh+'</p>' +
        '<dl class="stage-facts">' +
          '<div><dt>TIME / 时间</dt><dd>'+s.time+'</dd></div>' +
          '<div><dt>ELEVATION / 海拔</dt><dd>'+s.elev+'</dd></div>' +
          '<div><dt>SHADE / 遮阴</dt><dd>'+shadeName[s.shade]+' / '+shadeZh[s.shade]+'</dd></div>' +
          '<div><dt>POINTS / 观察点</dt><dd>'+s.points.length+' stops</dd></div>' +
        '</dl>' +
        '<p class="stage-summary">'+s.summary+'</p><p class="stage-summary-zh">'+s.summaryZh+'</p>' +
        '<div class="stage-care"><b>EXTRA CARE · 注意事项：</b> '+s.care+'</div>' +
        '</div></article>';
    }).join('') + '</div>';
    $('#stageChips').innerHTML = D.stages.map(function (s) {
      return '<button class="stage-chip" data-stage="'+s.id+'"><b>'+s.code+' '+s.name+'</b>'+s.zh+'</button>';
    }).join('');
  }
  function buildRibbon() {
    $('#ribbons').innerHTML = '<div class="ribbon-card">' +
      '<div class="ribbon-head"><strong>ONE CONTINUOUS ROUTE / 一条连续路线</strong><span>'+D.route.shade+'</span></div>' +
      '<div class="ribbon">' + D.points.map(function (p) {
        return '<div class="seg-shade '+p.shade+'" data-point="'+p.id+'" data-progress="'+p.progress+'" title="'+p.code+' '+p.name+' — '+shadeName[p.shade]+'"><span>'+p.code+'</span></div>';
      }).join('') + '</div>' +
      '<div class="ribbon-foot"><span>START · '+D.route.startShort+'</span><span>FINISH · '+D.route.finishShort+'</span></div></div>';
    $$('.seg-shade').forEach(function (el) {
      el.style.outline = '';
      el.addEventListener('click', function () { setProgress(Number(el.dataset.progress)); openPoint(el.dataset.point); });
    });
  }
  function buildNotes() {
    var notes = [
      { img: 'p19', color: 'amber', label: 'TRAIL CONDITION / 山径侵蚀', title: 'STAY ON THE REPAIRED PATH',
        text: 'The AFCD board at the junction records serious erosion caused by visitors leaving the trail and wearing away vegetation. Hand-built log steps now hold the slope, but loose sandy tread and exposed roots remain.', evidence: 'FIELD EVIDENCE p18 · p19 · p20' },
      { img: 'p03', color: 'rust', label: 'GEOCONSERVATION / 岩石保育', title: 'LOOK, DON\'T TAKE',
        text: 'An on-site Geopark board prohibits defacing, damaging or removing any rock, and disturbing wild plants and animals. The weathered volcanic boulders here are brittle and scientifically valuable.', evidence: 'FIELD EVIDENCE p03 · p06 · p07' },
      { img: 'p05', color: 'green', label: 'INTERTIDAL LIFE / 海岸生态', title: 'HANDS OFF THE SHORE',
        text: 'The AFCD banner asks visitors not to feed or touch marine life, and not to tread on coral. The shallow water off both beaches is habitat, not a souvenir shelf.', evidence: 'FIELD EVIDENCE p05 · p07 · p28' },
      { img: 'p13', color: 'blue', label: 'SUN EXPOSURE / 日照', title: 'CLOUD IS NOT SHADE',
        text: 'At 11:10 the beach was under thick cloud; by 12:47 the ridge was in full sun. Our 20 m shade readings show the coast, viewpoint and beach entirely unshaded.', evidence: 'FIELD EVIDENCE p01 · p09–p15 · p21–p25' }
    ];
    $('#notesGrid').innerHTML = notes.map(function (n) {
      return '<article class="note-card reveal" style="--note-color:var(--'+n.color+')">' +
        '<img src="'+photo(n.img)+'" alt="Field evidence: '+n.title+'" loading="lazy" data-photo="'+n.img+'" data-caption="'+n.title+'">' +
        '<div class="note-body"><span class="mini-label">'+n.label+'</span><h4>'+n.title+'</h4>' +
        '<p>'+n.text+'</p><p class="note-evidence">'+n.evidence+'</p></div></article>';
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
      ['SURVEY DATE / 日期', s.date+' · 2026 年 11 月 13 日'],
      ['RECORD WINDOW / 时段', s.window+' · 2 h 28 min'],
      ['WEATHER / 天气', s.weather],
      ['FIELD RECORDS / 记录', s.photos+' photographs · '+s.points+' points · '+s.photos+' 张照片／'+s.points+' 个观察点'],
      ['ROUTE / 路线', 'ONE continuous line: '+D.route.start+' → '+D.route.finish],
      ['SHADE CLASSES / 遮阴分级', 'MOSTLY · PARTLY · UNSHADED / 大部份・部份・无遮阴'],
      ['BASE MAP / 底图', 'TENCENT MAPS (GCJ-02) + LOCAL TERRAIN TILES'],
      ['LOCATION / 地点', s.place]
    ];
    $('#surveyFacts').innerHTML = facts.map(function (f) { return '<div><dt>'+f[0]+'</dt><dd>'+f[1]+'</dd></div>'; }).join('');
    $('#surveyMethod').textContent = s.method;
    $('#surveyMethodZh').textContent = s.methodZh;
    $('#demNote').textContent = s.dem;
    $('#demNoteZh').textContent = s.demZh;
    $('#sourceList').innerHTML = D.sources.map(function (src) {
      var title = src.url ? '<a href="'+src.url+'" target="_blank" rel="noopener">'+src.label+' ↗</a>' : '<span class="source-title">'+src.label+'</span>';
      return '<li><span class="source-meta">'+src.kind+'</span>'+title+'<p>'+src.detail+'</p></li>';
    }).join('');
    $('#checkList').innerHTML = D.checks.map(function (c) { return '<li>'+c+'</li>'; }).join('');
    var head = '<div class="ctr-row head"><div>MEMBER</div><div>FIELDWORK</div><div>ANALYSIS</div><div>WEBSITE</div></div>';
    $('#contributionTable').innerHTML = head + D.contributions.map(function (c) {
      return '<div class="ctr-row"><div>'+c.name+'</div>' +
        '<div class="placeholder" data-label="Fieldwork">'+c.fieldwork+'</div>' +
        '<div class="placeholder" data-label="Analysis">'+c.analysis+'</div>' +
        '<div class="placeholder" data-label="Website">'+c.website+'</div></div>';
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
        '<span class="d-count" id="dCount">1 / '+p.photos.length+'</span>' +
        (p.photos.length > 1 ? '<button class="d-nav prev" data-dir="-1" aria-label="Previous photo">‹</button><button class="d-nav next" data-dir="1" aria-label="Next photo">›</button>' : '') +
      '</div>' +
      '<div class="chips"><span class="chip stage">STAGE '+(stage?stage.code:'—')+'</span>' +
        '<span class="chip shade-'+p.shade+'">'+shadeName[p.shade]+' / '+shadeZh[p.shade]+'</span>' +
        '<span class="chip">'+p.time+' HKT</span><span class="chip">'+Math.round(p.elev)+' M ASL · 示意海拔</span>' +
        '<span class="chip">'+p.dist.toFixed(2)+' KM</span><span class="chip">'+p.weather+'</span></div>' +
      '<p class="d-desc">'+p.description+'</p><p class="d-desc-zh">'+p.descriptionZh+'</p>' +
      '<dl class="d-list">' +
        '<div><dt>WHAT YOU CAN SEE / 景观</dt><dd>'+p.attraction+'</dd></div>' +
        '<div><dt>VISIBLE ENVIRONMENTAL CONCERNS / 环境关注</dt><dd><ul>'+p.concerns.map(function (c) { return '<li>'+c+'</li>'; }).join('')+'</ul></dd></div>' +
        '<div><dt>FACILITIES / 设施</dt><dd>'+p.facilities+'</dd></div>' +
        '<div><dt>PRACTICAL SUGGESTION / 实用建议</dt><dd>'+p.tip+'</dd></div></dl>' +
      '<div class="d-evidence"><p><strong>EVIDENCE SOURCE ·</strong> '+p.sources+'</p><div class="d-thumbs">'+thumbs+'</div></div>' +
      (p.check ? '<div class="d-check"><strong>NEEDS FURTHER CHECKING ·</strong> '+p.check+'</div>' : '');
    $('#drawerKicker').textContent = 'OBSERVATION POINT '+p.code+' / 观察点 · '+p.time;
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
    $('#dCount').textContent = (state.drawerIdx+1)+' / '+n;
  }
  function closeDrawer() {
    $('#scrim').classList.remove('show'); $('#drawer').classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { $('#scrim').hidden = true; $('#drawer').hidden = true; state.point = null; }, 460);
  }
  function openLightbox(ids, idx, caption) {
    state.lbPhotos = ids; state.lbIdx = idx || 0;
    $('#lightbox').hidden = false; document.body.classList.add('no-scroll');
    updateLightbox(caption || 'GROUP FIELD PHOTOGRAPH · 13 NOV 2026');
  }
  function updateLightbox(caption) {
    $('#lbImage').src = photo(state.lbPhotos[state.lbIdx]);
    $('#lbImage').alt = 'Field photograph '+state.lbPhotos[state.lbIdx];
    $('#lbCaption').textContent = (caption || 'GROUP FIELD PHOTOGRAPH')+' · '+state.lbPhotos[state.lbIdx];
    $('#lbCount').textContent = (state.lbIdx+1)+' / '+state.lbPhotos.length;
    $('#lbPrev').hidden = $('#lbNext').hidden = state.lbPhotos.length < 2;
  }
  function moveLightbox(dir) {
    if (state.lbPhotos.length < 2) return;
    state.lbIdx = (state.lbIdx+dir+state.lbPhotos.length)%state.lbPhotos.length;
    updateLightbox($('#lbCaption').textContent.split(' · p')[0]);
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
    nb.addEventListener('click', function () { nb.hidden = true; });
    $$('.seg[data-base]').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.base !== state.base) switchBase(b.dataset.base); });
    });
    $('#overlayToggle').addEventListener('change', function (e) {
      state.overlay = e.target.checked;
      if (tOverlay && state.overlay !== undefined) { try { tOverlay.setVisible(state.overlay); } catch (err) {} }
      if (state.base === 'survey') drawTileMap();
    });
    $('#overlayOpacity').addEventListener('input', function (e) {
      state.overlayOpacity = Number(e.target.value)/100;
      $('#opacityOut').textContent = e.target.value+'%';
      if (tOverlay) { try { tOverlay.setOpacity(state.overlayOpacity); } catch (err) {} }
      if (state.base === 'survey') drawTileMap();
    });
    $('#zoomIn').addEventListener('click', function () { state.zoom = clamp(state.zoom+1, 13, 17.4); drawTileMap(); });
    $('#zoomOut').addEventListener('click', function () { state.zoom = clamp(state.zoom-1, 13, 17.4); drawTileMap(); });
    $('#zoomReset').addEventListener('click', function () {
      state.zoom = 15.1; var c0 = gcj(22.3625, 114.2915); state.center = { lat: c0.lat, lng: c0.lng }; drawTileMap();
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

    $('#autoRotate').addEventListener('change', function (e) { state.autoRotate = e.target.checked; });
    $('#wireframe').addEventListener('change', function (e) { state.wireframe = e.target.checked; draw3D(); });
    $('#exaggeration').addEventListener('input', function (e) {
      state.exaggeration = Number(e.target.value)/10;
      $('#exagOut').textContent = state.exaggeration.toFixed(1)+'×';
      draw3D();
    });
    $('#reset3d').addEventListener('click', function () {
      state.azimuth = -.22; state.tilt = 1.00; state.modelZoom = 1;
      state.exaggeration = 1.4;
      $('#exaggeration').value = 14; $('#exagOut').textContent = '1.4×';
      draw3D();
    });

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
      drawTileMap(); draw3D();
    });

    var relayout = function () { sizeCanvas(); drawTileMap(); size3D(); draw3D(); };
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(relayout);
      ro.observe(canvas); ro.observe(c3);
    }
    /* also listen to the viewport directly: some mobile browsers change the
       CSS box without firing a ResizeObserver callback in the same frame */
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

  /* animation loop: auto-rotate and keep the 3D view fresh on resize */
  function loop() {
    if (state.autoRotate) { state.azimuth += .0035; draw3D(); }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  buildStops();
  buildStages();
  buildRibbon();
  buildNotes();
  buildAdvice();
  buildSurvey();
  buildProfile();
  wire();
  sizeCanvas();
  size3D();
  switchBase(state.base);   /* no notice on load; one appears only if the official basemap fails */
  setProgress(0);
  draw3D();
  requestAnimationFrame(loop);
})();
