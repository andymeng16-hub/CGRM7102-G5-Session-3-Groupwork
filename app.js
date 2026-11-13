/* Sharp Island Visitor Guide — interactions
   - Tencent Maps GL JS in WorkBuddy key-proxy mode (GCJ-02), with a
     hand-drawn schematic diagram as an offline / published-site fallback.
   - All content comes from data/field-data.js.
*/
(function () {
  'use strict';

  var D = window.FIELD_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var photo = function (id) { return 'assets/photos/' + id + '.jpg'; };
  var thumb = function (id) { return 'assets/photos/thumbs/' + id + '.jpg'; };
  var shadeName = { mostly: 'Mostly shaded', partly: 'Partly shaded', unshaded: 'Unshaded' };
  var routeName = { A: 'Route A · Coast', B: 'Route B · Ridge', both: 'Both routes' };
  var routeColor = { A: '#0066cc', B: '#2d7d62', both: '#1d1d1f' };

  var state = {
    route: 'all',
    view: 'map',
    point: null,
    drawerPhotos: [],
    drawerIdx: 0,
    lbPhotos: [],
    lbIdx: 0
  };

  var map = null, markerLayer = null, lineLayer = null, sdkRequested = false, mapReady = false;
  /* WorkBuddy substitutes the map key proxy at runtime; on a plain static host
     the placeholders remain and the geographic base map cannot be used. */
  var proxyReady = !!(window._TMapSecurityConfig &&
    window._TMapSecurityConfig.serviceHost &&
    window._TMapSecurityConfig.serviceHost.indexOf('__WB_') === -1);

  function visiblePoints() {
    return D.points.filter(function (p) {
      return state.route === 'all' || p.route === 'both' || p.route === state.route;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Build content                                                       */
  /* ------------------------------------------------------------------ */

  function buildStops() {
    $('#stopsRail').innerHTML = D.points.map(function (p) {
      return '<button class="stop-card" data-point="' + p.id + '" data-route="' + p.route + '">' +
        '<img src="' + thumb(p.photos[0]) + '" alt="Field photograph at ' + p.name + '" loading="lazy">' +
        '<span class="sc-body"><span class="sc-num ' + (p.route === 'both' ? '' : p.route.toLowerCase()) + '">' + p.code + '</span>' +
        '<span class="sc-text"><strong>' + p.name + '</strong><span>' + p.time + ' · ' + shadeName[p.shade] + '</span></span></span>' +
        '</button>';
    }).join('');
  }

  function buildRoutes() {
    $('#routeCards').innerHTML = D.routes.map(function (r, i) {
      var facts = [
        ['Start → finish', r.start + ' → ' + r.finish, ''],
        ['Distance', r.distance, r.distanceNote],
        ['Recorded walking time', r.time, r.timeNote],
        ['Main stops', r.stops, ''],
        ['Shade', r.shade, ''],
        ['Tidal conditions', r.tide, ''],
        ['Facilities', r.facilities, ''],
        ['Extra care', r.care, ''],
        ['Best for', r.bestFor, '']
      ];
      var imgs = r.photos.slice(0, 3).map(function (id, k) {
        return '<button data-photos="' + r.photos.join(',') + '" data-idx="' + k + '" aria-label="Open photograph ' + id + '">' +
          '<img src="' + thumb(id) + '" alt="Field photograph ' + id + ' on route ' + r.id + '" loading="lazy"></button>';
      }).join('');
      return '<article class="route-block reveal" style="--route-color:var(--' + r.color + ');--route-soft:var(--' + r.color + '-soft)">' +
        '<div>' +
          '<div class="route-num">0' + (i + 1) + '</div>' +
          '<p class="route-tag"><span class="dot ' + (r.color === 'blue' ? 'dot-blue' : 'dot-green') + '"></span> Route ' + r.id + '</p>' +
          '<h3>' + r.name + '</h3><p class="route-zh">' + r.zh + '</p>' +
          '<p class="route-tagline">' + r.tagline + '</p>' +
          '<div class="route-photos">' + imgs + '</div>' +
        '</div>' +
        '<div>' +
          '<dl class="fact-table">' + facts.map(function (f) {
            return '<div class="fact"><dt>' + f[0] + '</dt><dd>' + f[1] + (f[2] ? '<span class="fine">' + f[2] + '</span>' : '') + '</dd></div>';
          }).join('') + '</dl>' +
          '<div class="route-evidence"><span>Why this route · 实地证据</span><p>' + r.evidence + '</p></div>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function buildRibbons() {
    $('#ribbons').innerHTML = D.routes.map(function (r) {
      var segs = r.stopIds.map(function (id) {
        var p = D.points.filter(function (x) { return x.id === id; })[0];
        return '<div class="seg-shade ' + p.shade + '" title="' + p.code + ' ' + p.name + ' — ' + shadeName[p.shade] + '"><span>' + p.code + '</span></div>';
      }).join('');
      return '<div class="ribbon-card">' +
        '<div class="ribbon-head"><strong>Route ' + r.id + ' · ' + r.name + '</strong><span>' + r.shade + '</span></div>' +
        '<div class="ribbon">' + segs + '</div>' +
        '<div class="ribbon-foot"><span>Start · ' + r.startShort + '</span><span>Finish · ' + r.finishShort + '</span></div>' +
      '</div>';
    }).join('');
  }

  function buildCompare() {
    var head = '<div class="cmp-head"><div>What changes</div><div class="h-a">A · Coast &amp; Geology</div><div class="h-b">B · Shaded Ridge</div></div>';
    var rows = D.comparison.map(function (c) {
      return '<div class="cmp-row">' +
        '<div class="cmp-label">' + c.label + '</div>' +
        '<div class="cmp-a" data-label="A · Coast">' + c.a + '</div>' +
        '<div class="cmp-b" data-label="B · Ridge">' + c.b + '</div>' +
      '</div>';
    }).join('');
    $('#compareTable').innerHTML = head + rows;
  }

  function buildNotes() {
    var notes = [
      { img: 'p19', color: 'amber', label: 'Trail condition · 山径侵蚀', title: 'Stay on the repaired path',
        text: 'The AFCD board at the junction records serious erosion caused by visitors leaving the trail and wearing away vegetation. Hand-built log steps now hold the slope, but loose sandy tread and exposed roots remain. Walk the marked line, do not cut corners.', evidence: 'Field evidence p18 · p19 · p20' },
      { img: 'p03', color: 'rust', label: 'Geoconservation · 岩石保育', title: 'Look, don\'t take',
        text: 'An on-site Geopark board prohibits defacing, damaging or removing any rock, and disturbing wild plants and animals. The weathered volcanic boulders here are brittle and scientifically valuable — photograph them and leave them where they are.', evidence: 'Field evidence p03 · p06 · p07' },
      { img: 'p05', color: 'green', label: 'Intertidal life · 海岸生态', title: 'Hands off the shore',
        text: 'The AFCD banner asks visitors not to feed or touch marine life, and not to tread on coral. The shallow water off both beaches is habitat, not a souvenir shelf. Wet cobbles are also slippery — wear shoes with grip.', evidence: 'Field evidence p05 · p07 · p28' },
      { img: 'p13', color: 'blue', label: 'Sun exposure · 日照', title: 'Cloud is not shade',
        text: 'At 11:10 the beach was under thick cloud; by 12:47 the ridge was in full sun. Our 20 m shade readings show Route A entirely unshaded and Route B shaded only in its woodland half. Carry water, food and sun protection whatever the morning sky looks like.', evidence: 'Field evidence p01 · p09–p15 · p21–p25' }
    ];
    $('#notesGrid').innerHTML = notes.map(function (n) {
      return '<article class="note-card reveal" style="--route-color:var(--' + n.color + ')">' +
        '<img src="' + photo(n.img) + '" alt="Field evidence: ' + n.title + '" loading="lazy" data-photo="' + n.img + '" data-caption="' + n.title + '">' +
        '<div class="note-body"><span class="mini-label">' + n.label + '</span><h4>' + n.title + '</h4>' +
        '<p>' + n.text + '</p><p class="note-evidence">' + n.evidence + '</p></div></article>';
    }).join('');
  }

  function buildAdvice() {
    $('#adviceList').innerHTML = D.advice.map(function (a, i) {
      return '<li><span class="adv-num">0' + (i + 1) + '</span><div><h4>' + a.title + '</h4><p>' + a.body + '</p></div></li>';
    }).join('');
  }

  function buildSurvey() {
    var s = D.survey;
    var facts = [
      ['Survey date', s.date + ' (Friday)'],
      ['Record window', s.window + ' · 2 h 28 min including stops'],
      ['Weather', s.weather],
      ['Field records', s.photos + ' photographs grouped into ' + s.points + ' observation points'],
      ['Shade categories', 'Mostly shaded · Partly shaded · Unshaded'],
      ['Location', s.place]
    ];
    $('#surveyFacts').innerHTML = facts.map(function (f) {
      return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>';
    }).join('');
    $('#surveyMethod').textContent = s.method;

    $('#sourceList').innerHTML = D.sources.map(function (src) {
      var title = src.url
        ? '<a href="' + src.url + '" target="_blank" rel="noopener">' + src.label + ' ↗</a>'
        : '<span class="source-title">' + src.label + '</span>';
      return '<li><span class="source-meta">' + src.kind + '</span>' + title + '<p>' + src.detail + '</p></li>';
    }).join('');

    $('#checkList').innerHTML = D.checks.map(function (c) { return '<li>' + c + '</li>'; }).join('');

    var head = '<div class="ctr-row head"><div>Member</div><div>Fieldwork</div><div>Analysis</div><div>Website</div></div>';
    $('#contributionTable').innerHTML = head + D.contributions.map(function (c) {
      return '<div class="ctr-row">' +
        '<div>' + c.name + '</div>' +
        '<div class="placeholder" data-label="Fieldwork">' + c.fieldwork + '</div>' +
        '<div class="placeholder" data-label="Analysis">' + c.analysis + '</div>' +
        '<div class="placeholder" data-label="Website">' + c.website + '</div>' +
      '</div>';
    }).join('');
    $('#heroDate').textContent = s.dateShort;
  }

  /* ------------------------------------------------------------------ */
  /* Schematic diagram (an illustration, not a geographic basemap)        */
  /* ------------------------------------------------------------------ */

  function poly(points) {
    return points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
  }

  function buildDiagram() {
    var sc = D.schematic;
    var lines = '<polyline class="dg-halo" points="' + poly(sc.routeB) + '"></polyline>' +
                '<polyline class="dg-halo" points="' + poly(sc.routeA) + '"></polyline>' +
                '<polyline class="dg-route dB" data-line="B" style="stroke:var(--green);stroke-width:5" points="' + poly(sc.routeB) + '"></polyline>' +
                '<polyline class="dg-route dA" data-line="A" style="stroke:var(--blue);stroke-width:5" points="' + poly(sc.routeA) + '"></polyline>';
    var pts = D.points.map(function (p) {
      return '<g class="sp" data-point="' + p.id + '" data-route="' + p.route + '">' +
        '<circle class="hit" cx="' + p.sx + '" cy="' + p.sy + '" r="30"></circle>' +
        '<circle class="mark" cx="' + p.sx + '" cy="' + p.sy + '" r="17" fill="' + (p.route === 'both' ? 'var(--ink)' : routeColor[p.route]) + '" stroke="#fff" stroke-width="3"></circle>' +
        '<text x="' + p.sx + '" y="' + (p.sy + 4.5) + '" text-anchor="middle">' + p.code + '</text>' +
        '<title>' + p.code + ' ' + p.name + '</title></g>';
    }).join('');
    $('#schematic').innerHTML =
      '<rect x="0" y="0" width="760" height="480" style="fill:var(--dg-sea)"></rect>' +
      '<path d="' + sc.island + '" style="fill:var(--dg-land);stroke:var(--dg-edge);stroke-width:2"></path>' +
      '<g>' + lines + '</g><g>' + pts + '</g>' +
      '<text x="700" y="82" text-anchor="middle" style="fill:var(--dg-note);font-size:13px;font-weight:700">N ↑</text>' +
      '<text x="36" y="452" class="sp-label" style="fill:var(--dg-note)">Tap a numbered point to open its field record</text>' +
      '<text x="724" y="452" text-anchor="end" class="sp-label" style="fill:var(--dg-note)">Schematic · not to scale</text>';
    applyDiagramFilter();
  }

  function applyDiagramFilter() {
    var vis = visiblePoints().map(function (p) { return p.id; });
    $$('.sp', $('#schematic')).forEach(function (g) {
      g.style.display = vis.indexOf(g.dataset.point) > -1 ? '' : 'none';
    });
    $$('.dg-route', $('#schematic')).forEach(function (l) {
      l.classList.toggle('dim', state.route !== 'all' && state.route !== l.dataset.line);
    });
    $$('.dg-halo', $('#schematic')).forEach(function (l, i) {
      var id = i === 0 ? 'B' : 'A';
      l.style.opacity = (state.route !== 'all' && state.route !== id) ? '.12' : '.85';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tencent Maps (GCJ-02)                                                */
  /* ------------------------------------------------------------------ */

  function outOfChina(lng, lat) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function tLat(x, y) {
    var r = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return r;
  }
  function tLng(x, y) {
    var r = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return r;
  }
  /* WGS-84 → GCJ-02. Tencent Maps uses GCJ-02 for Hong Kong, China. */
  function wgs2gcj(lng, lat) {
    if (outOfChina(lng, lat)) return { lat: lat, lng: lng };
    var a = 6378245.0, ee = .006693421622965943;
    var dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
    var rad = lat / 180 * Math.PI, magic = Math.sin(rad);
    magic = 1 - ee * magic * magic;
    var sqrt = Math.sqrt(magic);
    dLat = dLat * 180 / ((a * (1 - ee)) / (magic * sqrt) * Math.PI);
    dLng = dLng * 180 / (a / sqrt * Math.cos(rad) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }

  function markerSvg(num, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">' +
      '<circle cx="22" cy="22" r="16" fill="' + color + '" stroke="#ffffff" stroke-width="4"/>' +
      '<text x="22" y="27" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="#ffffff">' + num + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function showFallback(msg) {
    if (mapReady || state.view !== 'map') return;
    var box = $('#mapFallback');
    $('p', box).textContent = msg || 'Geographic base map unavailable in this environment.';
    box.hidden = false;
  }

  function rebuildLayers() {
    if (!map || !window.TMap) return;
    try { if (markerLayer) markerLayer.setMap(null); } catch (e) {}
    try { if (lineLayer) lineLayer.setMap(null); } catch (e) {}

    var vis = visiblePoints();
    var styles = {};
    vis.forEach(function (p) {
      styles[p.id] = new TMap.MarkerStyle({ width: 44, height: 44, anchor: { x: 22, y: 22 }, src: markerSvg(p.code, routeColor[p.route]) });
    });
    try {
      markerLayer = new TMap.MultiMarker({
        map: map, styles: styles,
        geometries: vis.map(function (p) {
          var g = wgs2gcj(p.lng, p.lat);
          return { id: p.id, styleId: p.id, position: new TMap.LatLng(g.lat, g.lng) };
        })
      });
      markerLayer.on('click', function (evt) {
        if (evt && evt.geometry && evt.geometry.id) openPoint(evt.geometry.id);
      });
    } catch (e) { /* markers optional; the stops rail below still works */ }

    var lineStyles = {
      A: new TMap.PolylineStyle({ color: '#0066cc', width: 6, borderWidth: 2, borderColor: '#ffffff' }),
      B: new TMap.PolylineStyle({ color: '#2d7d62', width: 6, borderWidth: 2, borderColor: '#ffffff' })
    };
    var lines = D.routes.filter(function (r) { return state.route === 'all' || state.route === r.id; })
      .map(function (r) {
        return {
          id: 'route' + r.id, styleId: r.id,
          paths: r.path.map(function (c) { var g = wgs2gcj(c[1], c[0]); return new TMap.LatLng(g.lat, g.lng); })
        };
      });
    try {
      lineLayer = new TMap.MultiPolyline({ map: map, styles: lineStyles, geometries: lines });
    } catch (e) {
      try {
        lineLayer = new TMap.MultiPolyline({
          map: map,
          styles: { A: new TMap.PolylineStyle({ color: '#0066cc', width: 6 }), B: new TMap.PolylineStyle({ color: '#2d7d62', width: 6 }) },
          geometries: lines
        });
      } catch (e2) {}
    }
  }

  function initTencent() {
    if (!window.TMap || mapReady) return;
    try {
      var c = wgs2gcj(114.2915, 22.3622);
      map = new TMap.Map(document.getElementById('tmap'), {
        zoom: 15,
        center: new TMap.LatLng(c.lat, c.lng)
      });
      mapReady = true;
      rebuildLayers();
      $('#mapFallback').hidden = true;
    } catch (e) {
      showFallback('The map could not be initialised here. The route diagram has the same clickable stops.');
    }
  }

  function loadMapSDK() {
    if (sdkRequested) return;
    sdkRequested = true;
    if (!proxyReady) {
      showFallback('The geographic map needs the WorkBuddy map proxy. The route diagram has the same clickable stops.');
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://map.qq.com/api/gljs?v=1.exp';
    s.async = true;
    s.onload = function () { setTimeout(initTencent, 80); };
    s.onerror = function () { showFallback('The map service could not be reached. The route diagram has the same clickable stops.'); };
    document.head.appendChild(s);
    /* If the key proxy is unavailable (e.g. after the teacher publishes the
       folder on a public host), no canvas is created — offer the diagram. */
    setTimeout(function () {
      if (!mapReady && !$('#tmap canvas')) {
        showFallback('Base map unavailable here. The route diagram has the same clickable stops.');
      }
    }, 7000);
  }

  /* ------------------------------------------------------------------ */
  /* Filters & views                                                      */
  /* ------------------------------------------------------------------ */

  function setView(v) {
    state.view = v;
    $('#tmap').hidden = v !== 'map';
    $('#diagram').hidden = v !== 'diagram';
    $$('.seg[data-view]').forEach(function (b) {
      var on = b.dataset.view === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#mapBadge .badge-note').textContent = v === 'map'
      ? 'Indicative positions · replace with QField GPS'
      : 'Schematic illustration · not to scale';
    if (v === 'diagram') $('#mapFallback').hidden = true;
    else if (!mapReady) loadMapSDK();
    if (v === 'diagram') applyDiagramFilter();
  }

  function setRoute(r) {
    state.route = r;
    $$('.seg[data-route]').forEach(function (b) {
      var on = b.dataset.route === r;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    var vis = visiblePoints().map(function (p) { return p.id; });
    $$('.stop-card').forEach(function (c) { c.hidden = vis.indexOf(c.dataset.point) === -1; });
    $('#stopsCount').textContent = vis.length + ' of ' + D.points.length + ' points';
    applyDiagramFilter();
    if (mapReady) rebuildLayers();
  }

  /* ------------------------------------------------------------------ */
  /* Detail drawer & lightbox                                             */
  /* ------------------------------------------------------------------ */

  function openPoint(id) {
    var p = D.points.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.point = p;
    state.drawerPhotos = p.photos;
    state.drawerIdx = 0;
    renderDrawer(p);
    $('#drawerKicker').textContent = 'Observation point ' + p.code + ' · ' + p.time;
    $('#scrim').hidden = false;
    $('#drawer').hidden = false;
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () {
      $('#scrim').classList.add('show');
      $('#drawer').classList.add('show');
    });
  }

  function renderDrawer(p) {
    var concerns = p.concerns.map(function (c) { return '<li>' + c + '</li>'; }).join('');
    var thumbs = p.photos.map(function (id, i) {
      return '<img src="' + thumb(id) + '" alt="Field photograph ' + id + '" data-idx="' + i + '" loading="lazy">';
    }).join('');
    $('#drawerContent').innerHTML =
      '<h3>' + p.name + '</h3><p class="d-zh">' + p.zh + '</p>' +
      '<div class="drawer-photo">' +
        '<img id="dPhoto" src="' + photo(p.photos[0]) + '" alt="Field photograph at ' + p.name + '" data-idx="0">' +
        '<span class="d-count" id="dCount">1 / ' + p.photos.length + '</span>' +
        (p.photos.length > 1 ? '<button class="d-nav prev" data-dir="-1" aria-label="Previous photo">‹</button><button class="d-nav next" data-dir="1" aria-label="Next photo">›</button>' : '') +
      '</div>' +
      '<div class="chips">' +
        '<span class="chip shade-' + p.shade + '">' + shadeName[p.shade] + '</span>' +
        '<span class="chip route-' + p.route.toLowerCase() + '">' + routeName[p.route] + '</span>' +
        '<span class="chip">' + p.time + ' HKT</span>' +
        '<span class="chip">' + p.weather + '</span>' +
      '</div>' +
      '<p class="d-desc">' + p.description + '</p>' +
      '<dl class="d-list">' +
        '<div><dt>What you can see</dt><dd>' + p.attraction + '</dd></div>' +
        '<div><dt>Visible environmental concerns</dt><dd><ul>' + concerns + '</ul></dd></div>' +
        '<div><dt>Facilities</dt><dd>' + p.facilities + '</dd></div>' +
        '<div><dt>Practical visitor suggestion</dt><dd>' + p.tip + '</dd></div>' +
      '</dl>' +
      '<div class="d-evidence"><p><strong>Evidence source ·</strong> ' + p.sources + '</p>' +
        '<div class="d-thumbs">' + thumbs + '</div></div>' +
      (p.check ? '<div class="d-check"><strong>Needs further checking ·</strong> ' + p.check + '</div>' : '');
  }

  function moveDrawerPhoto(dir) {
    var n = state.drawerPhotos.length;
    if (n < 2) return;
    state.drawerIdx = (state.drawerIdx + dir + n) % n;
    var img = $('#dPhoto');
    img.src = photo(state.drawerPhotos[state.drawerIdx]);
    img.dataset.idx = state.drawerIdx;
    $('#dCount').textContent = (state.drawerIdx + 1) + ' / ' + n;
  }

  function closeDrawer() {
    $('#scrim').classList.remove('show');
    $('#drawer').classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(function () {
      $('#scrim').hidden = true;
      $('#drawer').hidden = true;
      state.point = null;
    }, 480);
  }

  function openLightbox(ids, idx, caption) {
    state.lbPhotos = ids;
    state.lbIdx = idx || 0;
    $('#lightbox').hidden = false;
    document.body.classList.add('no-scroll');
    updateLightbox(caption || 'Group field photograph · 13 Nov 2026');
  }

  function updateLightbox(caption) {
    $('#lbImage').src = photo(state.lbPhotos[state.lbIdx]);
    $('#lbImage').alt = 'Field photograph ' + state.lbPhotos[state.lbIdx];
    $('#lbCaption').textContent = (caption || 'Group field photograph · 13 Nov 2026') + ' · ' + state.lbPhotos[state.lbIdx];
    $('#lbCount').textContent = (state.lbIdx + 1) + ' / ' + state.lbPhotos.length;
    var single = state.lbPhotos.length < 2;
    $('#lbPrev').hidden = single;
    $('#lbNext').hidden = single;
  }

  function moveLightbox(dir) {
    var n = state.lbPhotos.length;
    if (n < 2) return;
    state.lbIdx = (state.lbIdx + dir + n) % n;
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
    $$('.seg[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    $$('.seg[data-route]').forEach(function (b) {
      b.addEventListener('click', function () { setRoute(b.dataset.route); });
    });
    $('#showDiagram').addEventListener('click', function () { setView('diagram'); });

    $('#stopsRail').addEventListener('click', function (e) {
      var c = e.target.closest('.stop-card');
      if (c) openPoint(c.dataset.point);
    });
    $('#schematic').addEventListener('click', function (e) {
      var g = e.target.closest('.sp');
      if (g) openPoint(g.dataset.point);
    });
    $('#routeCards').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-photos]');
      if (b) openLightbox(b.dataset.photos.split(','), Number(b.dataset.idx), 'Route field photograph');
    });
    $('#notesGrid').addEventListener('click', function (e) {
      var img = e.target.closest('img[data-photo]');
      if (img) openLightbox([img.dataset.photo], 0, img.dataset.caption);
    });

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#drawerContent').addEventListener('click', function (e) {
      var nav = e.target.closest('.d-nav');
      if (nav) { moveDrawerPhoto(Number(nav.dataset.dir)); return; }
      var img = e.target.closest('img');
      if (img && state.drawerPhotos.length) {
        openLightbox(state.drawerPhotos, Number(img.dataset.idx || 0), state.point.name);
      }
    });

    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lbPrev').addEventListener('click', function () { moveLightbox(-1); });
    $('#lbNext').addEventListener('click', function () { moveLightbox(1); });
    $('#lightbox').addEventListener('click', function (e) {
      if (e.target === $('#lightbox')) closeLightbox();
    });
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

    var themeBtn = $('#themeToggle');
    try {
      var saved = localStorage.getItem('si-theme');
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) {}
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('si-theme', next); } catch (e) {}
    });

    /* scroll reveal */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
      $$('.reveal').forEach(function (el) { io.observe(el); });
    } else {
      $$('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    /* nav scroll spy */
    var links = $$('.nav-links a');
    var ids = links.map(function (a) { return a.getAttribute('href').slice(1); });
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var current = '';
        ids.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= 150) current = id;
        });
        links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
        ticking = false;
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */

  buildStops();
  buildRoutes();
  buildRibbons();
  buildCompare();
  buildNotes();
  buildAdvice();
  buildSurvey();
  buildDiagram();
  wire();

  /* View selection: in WorkBuddy preview the map key proxy is substituted at
     runtime. On a plain static host the placeholders remain, so start with the
     always-available route diagram instead of a blank base map.
     ?view=map / ?view=diagram and ?route=A / ?route=B can be used to override. */
  var params = new URLSearchParams(location.search);
  var requested = params.get('view');
  var initialView = requested === 'map' || requested === 'diagram'
    ? requested
    : (proxyReady ? 'map' : 'diagram');
  var requestedRoute = params.get('route');
  setRoute(requestedRoute === 'A' || requestedRoute === 'B' ? requestedRoute : 'all');
  setView(initialView);
})();
