/* Vegetation plates for the Sharp Island field guide.
   Four hand-built SVG sketches, one per formation. Shapes are generated from a
   fixed seed so every reload draws the same plate. Colours come from CSS
   variables, so the plates follow the light and dark themes. */
(function () {
  'use strict';

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function mk(seed) {
    var r = rng(seed);
    return {
      r: r,
      f: function (a, b) { return a + (b - a) * r(); },
      i: function (a, b) { return Math.floor(a + (b - a + 1) * r()); }
    };
  }
  var num = function (v) { return Math.round(v * 10) / 10; };

  /* An ellipse with a scalloped lower edge, so canopies read as drawn rather
     than geometric. */
  function blob(cx, cy, rx, ry, fill, seed, op) {
    var g = mk(seed), s = [];
    s.push('<ellipse cx="' + num(cx) + '" cy="' + num(cy) + '" rx="' + num(rx) + '" ry="' + num(ry) + '" fill="' + fill + '" opacity="' + (op || 1) + '"/>');
    var n = Math.max(3, Math.round(rx / 9));
    for (var k = 0; k < n; k++) {
      var a = Math.PI * (.16 + .68 * (k + .5) / n);
      var px = cx - Math.cos(a) * rx * .96;
      var py = cy + Math.sin(a) * ry * .78;
      s.push('<circle cx="' + num(px) + '" cy="' + num(py) + '" r="' + num(g.f(5, 11)) + '" fill="' + fill + '" opacity="' + (op || 1) + '"/>');
    }
    return s.join('');
  }

  function plate(inner) {
    return '<svg viewBox="0 0 360 260" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="360" height="260" fill="var(--veg-paper)"/>' + inner + '</svg>';
  }

  /* ---------------- evergreen broadleaf woodland ---------------- */
  function woodland() {
    var g = mk(7), o = [];
    o.push('<path d="M0 214 C 60 206 104 222 168 214 C 232 206 296 220 360 210 L360 260 L0 260 Z" fill="var(--veg-ochre)" opacity=".45"/>');
    /* trunks first, so the canopy covers their tops */
    for (var i = 0; i < 6; i++) {
      var x = 26 + i * 62 + g.f(-9, 9), top = g.f(66, 96);
      o.push('<path d="M' + num(x) + ' 226 C ' + num(x + g.f(-14, 14)) + ' 186 ' +
        num(x + g.f(-18, 18)) + ' 136 ' + num(x + g.f(-8, 8)) + ' ' + num(top) +
        '" stroke="var(--veg-1)" stroke-width="' + num(g.f(5, 9)) + '" fill="none" stroke-linecap="round" opacity=".85"/>');
    }
    /* understorey ferns */
    for (var f = 0; f < 7; f++) {
      var fx = g.f(18, 342), fy = g.f(216, 240);
      for (var b = 0; b < 5; b++) {
        var dir = b % 2 ? 1 : -1;
        o.push('<path d="M' + num(fx) + ' ' + num(fy) + ' q ' + num(dir * g.f(8, 16)) + ' ' + num(-g.f(12, 22)) +
          ' ' + num(dir * g.f(18, 30)) + ' ' + num(-g.f(16, 26)) +
          '" stroke="var(--veg-2)" stroke-width="1.6" fill="none" opacity=".8"/>');
      }
    }
    /* canopy, three depth layers */
    var layers = [
      { y: 78, rx: [74, 96], ry: [34, 44], n: 7, fill: 'var(--veg-3)', op: .62 },
      { y: 94, rx: [64, 86], ry: [32, 42], n: 8, fill: 'var(--veg-2)', op: .82 },
      { y: 112, rx: [52, 72], ry: [26, 36], n: 7, fill: 'var(--veg-1)', op: .92 }
    ];
    layers.forEach(function (L, li) {
      for (var k = 0; k < L.n; k++) {
        var cx = -30 + k * (420 / L.n) + g.f(-18, 18);
        o.push(blob(cx, L.y + g.f(-8, 8), g.f(L.rx[0], L.rx[1]), g.f(L.ry[0], L.ry[1]), L.fill, 100 + li * 31 + k, L.op));
      }
    });
    /* two shafts of light */
    o.push('<path d="M118 0 L172 0 L206 260 L142 260 Z" fill="var(--veg-wash)" opacity=".16"/>');
    o.push('<path d="M236 0 L268 0 L288 260 L248 260 Z" fill="var(--veg-wash)" opacity=".12"/>');
    return plate(o.join(''));
  }

  /* ---------------- shrubland ---------------- */
  function shrubland() {
    var g = mk(23), o = [];
    o.push('<path d="M0 172 C 54 150 92 160 138 138 C 190 113 236 126 292 104 C 320 92 342 96 360 90 L360 260 L0 260 Z" fill="var(--veg-ochre)" opacity=".35"/>');
    /* exposed rock on the upper slope */
    for (var k = 0; k < 3; k++) {
      var rx0 = g.f(60, 300), ry0 = g.f(96, 150), s = g.f(12, 22);
      o.push('<path d="M' + num(rx0) + ' ' + num(ry0) + ' l ' + num(s) + ' ' + num(-s * .55) + ' l ' + num(s * 1.5) + ' ' + num(s * .3) +
        ' l ' + num(-s * .3) + ' ' + num(s * .9) + ' l ' + num(-s * 1.2) + ' ' + num(s * .1) + ' Z" fill="var(--veg-stone)" opacity=".35"/>');
    }
    /* twigs */
    for (var t = 0; t < 9; t++) {
      var tx = g.f(10, 350), ty = g.f(150, 236);
      o.push('<path d="M' + num(tx) + ' ' + num(ty) + ' q ' + num(g.f(-6, 6)) + ' -18 ' + num(g.f(-14, 14)) + ' -34" stroke="var(--veg-1)" stroke-width="1.1" fill="none" opacity=".55"/>');
    }
    /* shrub clumps, lower slope bigger */
    for (var i = 0; i < 18; i++) {
      var x = g.f(-10, 370);
      var y = 232 - (x / 360) * 62 + g.f(-14, 22);
      var scale = g.f(.7, 1.25);
      var fill = i % 3 === 0 ? 'var(--veg-2)' : 'var(--veg-1)';
      o.push('<ellipse cx="' + num(x) + '" cy="' + num(y + 6) + '" rx="' + num(20 * scale) + '" ry="' + num(5 * scale) + '" fill="var(--veg-1)" opacity=".18"/>');
      for (var j = 0; j < g.i(5, 8); j++) {
        o.push('<circle cx="' + num(x + g.f(-16, 16) * scale) + '" cy="' + num(y + g.f(-14, 8) * scale) +
          '" r="' + num(g.f(5, 11) * scale) + '" fill="' + fill + '" opacity="' + num(g.f(.72, .95)) + '"/>');
      }
    }
    /* ground dashes */
    for (var d = 0; d < 26; d++) {
      var dx = g.f(4, 356), dy = g.f(198, 252);
      o.push('<line x1="' + num(dx) + '" y1="' + num(dy) + '" x2="' + num(dx + g.f(4, 12)) + '" y2="' + num(dy + g.f(-2, 2)) + '" stroke="var(--veg-ochre)" stroke-width="1.2" opacity=".5"/>');
    }
    return plate(o.join(''));
  }

  /* ---------------- grassland ---------------- */
  function grassland() {
    var g = mk(41), o = [];
    /* haze over a far ridge */
    o.push('<rect x="0" y="0" width="360" height="118" fill="var(--veg-water)" opacity=".34"/>');
    o.push('<path d="M0 118 C 54 96 96 106 140 88 C 186 69 226 88 268 78 C 306 69 336 80 360 72 L360 130 L0 130 Z" fill="var(--veg-stone)" opacity=".26"/>');
    /* the field itself, dry and warm */
    o.push('<path d="M0 122 C 60 112 110 126 168 116 C 224 106 276 120 320 112 C 336 109 350 112 360 110 L360 260 L0 260 Z" fill="var(--veg-ochre)" opacity=".2"/>');
    o.push('<path d="M0 168 C 70 158 128 172 190 162 C 246 153 300 166 360 158 L360 260 L0 260 Z" fill="var(--veg-ochre)" opacity=".26"/>');
    /* bare soil showing through */
    for (var s2 = 0; s2 < 5; s2++) {
      var sx = g.f(24, 322), sy = g.f(190, 248), w = g.f(26, 56);
      o.push('<path d="M' + num(sx) + ' ' + num(sy) + ' q ' + num(w * .4) + ' ' + num(-w * .28) + ' ' + num(w) + ' ' + num(-w * .05) +
        ' q ' + num(w * .2) + ' ' + num(w * .3) + ' ' + num(-w * .1) + ' ' + num(w * .34) +
        ' q ' + num(-w * .7) + ' ' + num(w * .16) + ' ' + num(-w * .9) + ' ' + num(-w * .29) + ' Z" fill="var(--veg-ochre)" opacity=".55"/>');
    }
    /* a couple of survivors, low and wind-clipped */
    [[92, 214, 15], [268, 206, 13]].forEach(function (b) {
      for (var k = 0; k < 9; k++) {
        var a2 = k / 9 * Math.PI * 2;
        o.push('<path d="M' + num(b[0]) + ' ' + num(b[1]) + ' q ' + num(Math.cos(a2) * b[2] * .5) + ' ' + num(-b[2] * .8) +
          ' ' + num(Math.cos(a2) * b[2]) + ' ' + num(-b[2] * .55 + Math.sin(a2) * 3) +
          '" stroke="var(--veg-2)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>');
      }
    });
    /* tufts, in bands so the field has depth */
    for (var i = 0; i < 78; i++) {
      var x = g.f(-8, 368);
      var band = i % 3;
      var base = band === 0 ? 244 : (band === 1 ? 206 : 178);
      var y = base - (x / 360) * 26 + g.f(-7, 7);
      var h = band === 0 ? g.f(30, 62) : (band === 1 ? g.f(20, 40) : g.f(12, 24));
      var lean = g.f(-11, 11);
      var stroke = i % 4 === 0 ? 'var(--veg-3)' : (i % 3 === 0 ? 'var(--veg-4)' : 'var(--veg-2)');
      var op = band === 0 ? g.f(.72, .98) : (band === 1 ? g.f(.6, .85) : g.f(.42, .62));
      for (var b2 = 0; b2 < g.i(4, 6); b2++) {
        var dir = (b2 - 2) / 2;
        o.push('<path d="M' + num(x) + ' ' + num(y) + ' q ' + num(dir * 9 + lean * .3) + ' ' + num(-h * .6) +
          ' ' + num(dir * 20 + lean) + ' ' + num(-h) +
          '" stroke="' + stroke + '" stroke-width="' + num(band === 0 ? g.f(1.4, 2.2) : g.f(1, 1.6)) +
          '" fill="none" stroke-linecap="round" opacity="' + num(op) + '"/>');
      }
    }
    /* charred stems, which is why grass is here at all */
    for (var c = 0; c < 6; c++) {
      var cx = g.f(50, 330), cy = g.f(200, 246);
      o.push('<path d="M' + num(cx) + ' ' + num(cy) + ' q 2 ' + num(-g.f(12, 18)) + ' ' + num(g.f(-3, 3)) + ' ' + num(-g.f(20, 30)) +
        '" stroke="var(--veg-line)" stroke-width="1.7" fill="none" opacity=".34" stroke-linecap="round"/>');
    }
    return plate(o.join(''));
  }

  /* ---------------- coastal strand ---------------- */
  function strand() {
    var g = mk(67), o = [];
    /* sea band */
    o.push('<rect x="0" y="0" width="360" height="96" fill="var(--veg-water)" opacity=".85"/>');
    for (var w = 0; w < 6; w++) {
      var wy = 16 + w * 13 + g.f(-4, 4);
      o.push('<path d="M0 ' + num(wy) + ' q 30 ' + num(g.f(-5, 5)) + ' 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" stroke="var(--veg-3)" stroke-width="1.4" fill="none" opacity="' + num(.3 + w * .04) + '"/>');
    }
    /* wet sand then dry sand */
    o.push('<path d="M0 96 C 60 104 120 92 180 100 C 240 108 300 96 360 102 L360 260 L0 260 Z" fill="var(--veg-sand)" opacity=".55"/>');
    o.push('<path d="M0 132 C 70 140 130 126 196 136 C 260 146 310 132 360 138 L360 260 L0 260 Z" fill="var(--veg-sand)"/>');
    /* ripples */
    for (var rp = 0; rp < 9; rp++) {
      var ry = 150 + rp * 12 + g.f(-3, 3);
      o.push('<path d="M0 ' + num(ry) + ' q 26 ' + num(g.f(-4, 4)) + ' 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0" stroke="var(--veg-ochre)" stroke-width="1" fill="none" opacity=".32"/>');
    }
    /* rock */
    o.push('<path d="M236 232 l 16 -26 l 30 -6 l 22 18 l 6 22 Z" fill="var(--veg-stone)" opacity=".62"/>');
    for (var hh = 0; hh < 5; hh++) {
      o.push('<line x1="' + num(244 + hh * 12) + '" y1="226" x2="' + num(250 + hh * 12) + '" y2="' + num(206 + hh * 2) + '" stroke="var(--veg-line)" stroke-width=".9" opacity=".22"/>');
    }
    /* creeping runners with paired leaves */
    for (var c = 0; c < 4; c++) {
      var y0 = 178 + c * 22 + g.f(-6, 6);
      o.push('<path d="M-10 ' + num(y0) + ' C 60 ' + num(y0 - 16) + ' 150 ' + num(y0 + 12) + ' 250 ' + num(y0 - 8) +
        ' S 330 ' + num(y0 - 20) + ' 372 ' + num(y0 - 4) + '" stroke="var(--veg-1)" stroke-width="1.6" fill="none" opacity=".7"/>');
      for (var l = 0; l < 9; l++) {
        var lx = 8 + l * 40 + g.f(-6, 6);
        var ly = y0 - 8 + (l % 2 ? 6 : -6) + g.f(-4, 4);
        o.push('<ellipse cx="' + num(lx) + '" cy="' + num(ly) + '" rx="' + num(g.f(7, 11)) + '" ry="' + num(g.f(4, 6)) +
          '" fill="' + (l % 2 ? 'var(--veg-2)' : 'var(--veg-1)') + '" opacity="' + num(g.f(.55, .85)) + '" transform="rotate(' + num(g.f(-24, 24)) + ' ' + num(lx) + ' ' + num(ly) + ')"/>');
      }
    }
    /* wind */
    for (var wn = 0; wn < 3; wn++) {
      var wx = g.f(10, 120), wy2 = g.f(20, 70);
      o.push('<path d="M' + num(wx) + ' ' + num(wy2) + ' q 40 -6 78 2" stroke="var(--veg-line)" stroke-width="1.1" fill="none" opacity=".18"/>');
    }
    return plate(o.join(''));
  }

  var art = { woodland: woodland(), shrubland: shrubland(), grassland: grassland(), strand: strand() };

  window.VEGETATION = [
    {
      id: 'v1', art: art.woodland, code: '01',
      name: 'EVERGREEN BROADLEAF WOODLAND', zh: '常绿阔叶林',
      form: 'Closed canopy, 8 to 12 m',
      formZh: '闭合树冠，高 8 至 12 米',
      blurb: 'A closed canopy with a dark, humid understorey and a litter layer that holds moisture through the dry season. On Sharp Island it survives best in the sheltered valley between the pier and the ridge, which is why the second stage of the walk is the cool one.',
      blurbZh: '闭合树冠，林下阴暗潮湿，枯枝落叶层在旱季保住水分。这一群落在码头与山脊之间的避风谷地保存最好，也是全程最阴凉的一段。',
      species: ['榕树', '黄桐', '山蒲桃', '五月茶', '九节', '土沉香', '樟树'],
      speciesEn: ['Ficus', 'Mallotus japonicus', 'Syzygium', 'Antidesma', 'Psychotria', 'Cinnamomum', 'Cinnamomum camphora'],
      where: 'STAGE 02, 0.60 to 1.05 km', whereZh: '第二段，0.60 至 1.05 公里'
    },
    {
      id: 'v2', art: art.shrubland, code: '02',
      name: 'SHRUBLAND', zh: '灌丛',
      form: 'Wind-pruned, usually under 2 m',
      formZh: '经风修剪，通常不到 2 米',
      blurb: 'Low, dense and shaped by wind. It holds the thin soil on the upper slopes and only establishes where fire has stayed away for several years. Bare rock shows through where the cover breaks.',
      blurbZh: '低矮、密集、被风修剪。它固定上坡的薄土，只在数年无火之处才能定植；覆盖一旦断裂，裸岩便露出来。',
      species: ['岗松', '桃金娘', '大头茶'],
      speciesEn: ['Baeckea', 'Rhodomyrtus tomentosa', 'Gordonia axillaris'],
      where: 'STAGE 03, 1.05 to 1.30 km', whereZh: '第三段，1.05 至 1.30 公里'
    },
    {
      id: 'v3', art: art.grassland, code: '03',
      name: 'GRASSLAND', zh: '草坡',
      form: 'Fire-maintained, sunlit, free-draining',
      formZh: '靠山火维持，日照充足，排水良好',
      blurb: 'Grass holds the ridge because fire keeps returning. Hong Kong accounts put roughly a decade without fire before grass gives way to shrub, so the open view from the viewpoint is a recent condition, not a permanent one.',
      blurbZh: '草坡能守住山脊，是因为山火反复回来。香港的记载认为，草地要让位给灌丛约需十年无火，因此观景台的开阔视野是近期状态，并非常态。',
      species: ['刺芒野古草', '青香茅', '芒萁', '纤毛鸭咀草'],
      speciesEn: ['Aristida setacea', 'Cymbopogon', 'Dicranopteris', 'Ischaemum'],
      where: 'STAGE 04, 1.30 to 2.19 km', whereZh: '第四段，1.30 至 2.19 公里'
    },
    {
      id: 'v4', art: art.strand, code: '04',
      name: 'COASTAL STRAND', zh: '海岸带',
      form: 'Salt spray, wind and moving sand',
      formZh: '盐雾、强风与流动的沙',
      blurb: 'Salt spray, wind and sand that moves underfoot. Plants here creep rather than stand, root where the stem touches ground, and keep their leaves low enough to stay out of the wind. This is the formation you walk past before the climb.',
      blurbZh: '盐雾、强风与脚下流动的沙。这里的植物多匍匐而不直立，茎节触地即生根，叶片贴地以避开风。上山之前经过的正是这一群落。',
      species: ['匍匐藤本', '低矮海岸灌木', '盐生草本'],
      speciesEn: ['Creeping vine', 'Low coastal shrub', 'Salt-tolerant herb'],
      where: 'STAGE 01, 0.00 to 0.60 km', whereZh: '第一段，0.00 至 0.60 公里'
    }
  ];
})();
